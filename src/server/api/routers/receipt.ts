import Anthropic, { BadRequestError, RateLimitError } from '@anthropic-ai/sdk';
import { TRPCError } from '@trpc/server';
import sharp from 'sharp';
import { z } from 'zod';

import { env } from '~/env';
import {
  RECEIPT_CATEGORY_KEYS,
  RECEIPT_CONFIDENCE_FIELDS,
  RECEIPT_FIELDS,
  type ReceiptScanResult,
  parseReceiptScanText,
} from '~/lib/receiptScan';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

const RECEIPT_MODEL = 'claude-sonnet-5-5';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Long edge sent to the model; larger images cost more tokens without reading better. */
const MAX_IMAGE_EDGE_PX = 1568;

const ReceiptScanInput = z.object({
  imageBase64: z.string().max(8_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
});

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    merchant: nullable({ type: 'string' }),
    amount: nullable({ type: 'string' }),
    currency: nullable({ type: 'string' }),
    date: nullable({ type: 'string' }),
    category: nullable({ type: 'string', enum: RECEIPT_CATEGORY_KEYS }),
    tax: nullable({ type: 'string' }),
    confidence: {
      type: 'object',
      properties: Object.fromEntries(
        RECEIPT_CONFIDENCE_FIELDS.map((field) => [field, nullable({ type: 'number' })]),
      ),
      required: [...RECEIPT_CONFIDENCE_FIELDS],
      additionalProperties: false,
    },
    lowConfidenceFields: { type: 'array', items: { type: 'string', enum: RECEIPT_FIELDS } },
    note: nullable({ type: 'string' }),
  },
  required: [
    'merchant',
    'amount',
    'currency',
    'date',
    'category',
    'tax',
    'confidence',
    'lowConfidenceFields',
    'note',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read photos of purchase receipts for an expense-splitting app and return the details as JSON.

- merchant: the shop or venue name as printed, or null.
- amount: the final total actually paid (after tax, tip and discounts), as a plain decimal with a dot and two decimals, e.g. "20.00". No currency symbol, no thousands separators. null if you cannot find it.
- currency: ISO 4217 code (e.g. "USD", "EUR", "GBP"). Infer it from symbols, the country or the language on the receipt when it is not printed; mark it low confidence when inferred. null if there is no clue.
- date: the purchase date as YYYY-MM-DD, or null.
- category: the best-fitting key from the allowed list, or null if none fits.
- tax: the total tax (VAT, GST, sales tax) as a plain decimal like amount, or null if none is printed.
- confidence: for each of merchant, amount, currency, date, category and tax, how sure you are of the value you returned, from 0 (guess) to 1 (clearly printed and unambiguous). Use null only when the field is null because the receipt does not show it at all. Be honest: blurry, cut-off, handwritten or inferred values must score below 0.8.
- lowConfidenceFields: every field you guessed, inferred, or read from blurry, cut-off or ambiguous print.
- note: one short plain-English warning for the user when something needs checking (e.g. "Tax looked blurry"), under 80 characters, otherwise null.

If the image is not a receipt, return every field as null and say so in note. Never invent values.`;

const toImageBuffer = (imageBase64: string) => {
  const base64 = imageBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image is not valid base64' });
  }
  // Check the decoded size before allocating the buffer.
  if (Math.floor((base64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image is too large (max 6 MB)' });
  }
  return Buffer.from(base64, 'base64');
};

/**
 * Shrinks the image and re-encodes it as JPEG. The model does not accept HEIC, so HEIC must
 * convert; other formats fall back to the original bytes if sharp cannot read them.
 */
const prepareImage = async (
  buffer: Buffer,
  mimeType: z.infer<typeof ReceiptScanInput>['mimeType'],
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> => {
  try {
    const jpeg = await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE_PX,
        height: MAX_IMAGE_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: jpeg.toString('base64'), mediaType: 'image/jpeg' };
  } catch (error) {
    if ('image/heic' === mimeType) {
      console.error('Receipt HEIC conversion failed:', error);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'HEIC photos are not supported here. Please use JPEG or PNG.',
      });
    }
    return { data: buffer.toString('base64'), mediaType: mimeType };
  }
};

let anthropicClient: Anthropic | null = null;

const getClient = (apiKey: string) => {
  anthropicClient ??= new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  return anthropicClient;
};

const scanReceiptImage = async (
  apiKey: string,
  image: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' },
): Promise<ReceiptScanResult> => {
  const client = getClient(apiKey);

  const response = await client.beta.messages
    .create({
      model: RECEIPT_MODEL,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RECEIPT_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: image.mediaType, data: image.data },
            },
            { type: 'text', text: 'Read this receipt.' },
          ],
        },
      ],
    })
    .catch((error: unknown) => {
      if (error instanceof RateLimitError) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Receipt scanning is busy. Try again in a moment.',
        });
      }
      if (error instanceof BadRequestError) {
        console.error('Receipt scan rejected:', error.message);
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This image could not be read' });
      }
      console.error('Receipt scan failed:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Receipt scanning failed' });
    });

  if ('refusal' === response.stop_reason) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This image could not be read' });
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => 'text' === block.type)
    .map((block) => block.text)
    .join('');

  return parseReceiptScanText(text);
};

export const receiptRouter = createTRPCRouter({
  scan: protectedProcedure.input(ReceiptScanInput).mutation(async ({ input }) => {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Receipt scanning is not configured',
      });
    }

    const buffer = toImageBuffer(input.imageBase64);
    const image = await prepareImage(buffer, input.mimeType);
    return scanReceiptImage(apiKey, image);
  }),
});
