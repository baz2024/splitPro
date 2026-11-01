import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(
  __dirname,
  '../../public/skills/safi-subscription-monitor/scripts/scan.mjs',
);
const FIXTURE = path.resolve(__dirname, 'fixtures/subscription-scanner/sample-repo');
const FAKE_SECRET = 'sk-FAKE-VALUE-THAT-MUST-NEVER-BE-READ-0123456789';
const FAKE_KEY = `safi_${'x'.repeat(40)}`;

interface Finding {
  fingerprint: string;
  service: string;
  category: string;
  evidence: string[];
  isNew: boolean;
}

interface ScanOutput {
  newCount: number;
  baselineUpdated: boolean;
  findings: Finding[];
  reported?: { fingerprint: string; ok: boolean; status?: string }[];
}

const tmpDirs: string[] = [];

// .env files are git-ignored, so the secret-bearing files are written into a temp copy.
const makeRepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safi-scan-'));
  tmpDirs.push(dir);
  fs.cpSync(FIXTURE, dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.env'),
    `OPENAI_API_KEY=${FAKE_SECRET}\nTWILIO_AUTH_TOKEN=abc\n`,
  );
  fs.writeFileSync(path.join(dir, '.env.local'), `ANTHROPIC_API_KEY=${FAKE_SECRET}\n`);
  return dir;
};

const cleanEnv = () => {
  const env = { ...process.env };
  delete env.SAFI_API_KEY;
  delete env.SAFI_API_URL;
  delete env.SAFI_AGENT_NAME;
  return env;
};

const runScan = (args: string[], env: NodeJS.ProcessEnv = cleanEnv()) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });

const runScanAsync = (args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { encoding: 'utf8', env },
      (error, stdout, stderr) => {
        resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr });
      },
    );
  });

const parse = (stdout: string) => JSON.parse(stdout) as ScanOutput;
const fingerprints = (output: ScanOutput) => output.findings.map((f) => f.fingerprint).sort();

afterAll(() => {
  tmpDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe('safi subscription scanner', () => {
  describe('detection', () => {
    it('should find services from package.json, .env.example and vercel.json', () => {
      const repo = makeRepo();
      const result = runScan([repo, '--json']);
      expect(result.status).toBe(0);

      const output = parse(result.stdout);
      expect(fingerprints(output)).toEqual(['openai', 'resend', 'stripe', 'supabase', 'vercel']);
      expect(output.newCount).toBe(5);

      const byId = new Map(output.findings.map((f) => [f.fingerprint, f]));
      expect(byId.get('openai')).toMatchObject({
        service: 'OpenAI API',
        category: 'aiApis',
        evidence: ['package.json: openai@^4.52.0'],
        isNew: true,
      });
      expect(byId.get('supabase')?.category).toBe('databases');
      expect(byId.get('supabase')?.evidence).toContain(
        'package.json: @supabase/supabase-js@^2.45.0',
      );
      expect(byId.get('stripe')?.category).toBe('saas');
      expect(byId.get('resend')).toMatchObject({
        category: 'messagingApis',
        evidence: ['.env.example: RESEND_API_KEY'],
      });
      expect(byId.get('vercel')).toMatchObject({
        category: 'cloudHosting',
        evidence: ['vercel.json: present'],
      });
    });

    it('should never read .env or .env.local', () => {
      const repo = makeRepo();
      const json = runScan([repo, '--json']);
      const table = runScan([repo]);

      [json.stdout, json.stderr, table.stdout, table.stderr].forEach((text) => {
        expect(text).not.toContain(FAKE_SECRET);
      });
      // Twilio and Anthropic only appear in the secret files, so they must not be detected.
      expect(fingerprints(parse(json.stdout))).not.toEqual(expect.arrayContaining(['twilio']));
      expect(fingerprints(parse(json.stdout))).not.toContain('anthropic');
    });

    it('should print a readable table by default', () => {
      const result = runScan([makeRepo()]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('STATUS');
      expect(result.stdout).toMatch(/NEW\s+OpenAI API/);
      expect(result.stdout).toContain('5 service(s) found, 5 new');
    });
  });

  describe('baseline', () => {
    it('should only report services missing from the baseline', () => {
      const repo = makeRepo();
      const baselineFile = path.join(repo, 'known.json');
      fs.writeFileSync(
        baselineFile,
        JSON.stringify({
          version: 1,
          subscriptions: [{ fingerprint: 'openai' }, { fingerprint: 'vercel' }],
        }),
      );

      const output = parse(runScan([repo, '--json', '--baseline', baselineFile]).stdout);
      expect(output.newCount).toBe(3);
      expect(
        output.findings
          .filter((f) => f.isNew)
          .map((f) => f.fingerprint)
          .sort(),
      ).toEqual(['resend', 'stripe', 'supabase']);
    });

    it('should write the default baseline with --update-baseline and then report nothing new', () => {
      const repo = makeRepo();
      const first = parse(runScan([repo, '--json', '--update-baseline']).stdout);
      expect(first.baselineUpdated).toBe(true);

      const baselinePath = path.join(repo, '.safi/known-subscriptions.json');
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
        subscriptions: { fingerprint: string }[];
      };
      expect(baseline.subscriptions.map((s) => s.fingerprint)).toEqual([
        'openai',
        'resend',
        'stripe',
        'supabase',
        'vercel',
      ]);

      const second = parse(runScan([repo, '--json']).stdout);
      expect(second.newCount).toBe(0);
      expect(second.findings.every((f) => !f.isNew)).toBe(true);
    });
  });

  describe('reporting', () => {
    it('should exit non-zero with a helpful message when SAFI_API_KEY is missing', () => {
      const result = runScan([makeRepo(), '--report']);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('SAFI_API_KEY is not set');
      expect(result.stderr).toContain('Coding agents');
    });

    it('should POST new findings, add them to the baseline and never print the key', async () => {
      const repo = makeRepo();
      const requests: { auth?: string; body: Record<string, unknown> }[] = [];
      const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        req.on('end', () => {
          const body = JSON.parse(raw) as Record<string, unknown>;
          requests.push({ auth: req.headers.authorization, body });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: `id-${String(body.fingerprint)}`,
              status: 'pending',
              duplicate: false,
            }),
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;

      try {
        const env = {
          ...cleanEnv(),
          SAFI_API_KEY: FAKE_KEY,
          SAFI_API_URL: `http://127.0.0.1:${port}`,
          SAFI_AGENT_NAME: 'jest-agent',
        };
        const result = await runScanAsync([repo, '--report', '--json'], env);
        expect(result.code).toBe(0);
        expect(result.stdout).not.toContain(FAKE_KEY);
        expect(result.stderr).not.toContain(FAKE_KEY);

        expect(requests).toHaveLength(5);
        requests.forEach((request) => {
          expect(request.auth).toBe(`Bearer ${FAKE_KEY}`);
          expect(request.body.agent).toBe('jest-agent');
          expect(request.body.detectedIn).toBe(path.basename(repo));
        });
        const openai = requests.find((r) => 'openai' === r.body.fingerprint);
        expect(openai?.body).toMatchObject({
          service: 'OpenAI API',
          category: 'aiApis',
          evidence: ['package.json: openai@^4.52.0'],
          pricingUrl: 'https://openai.com/api/pricing',
        });

        const output = parse(result.stdout);
        expect(output.reported?.every((r) => r.ok && 'pending' === r.status)).toBe(true);
        expect(fs.existsSync(path.join(repo, '.safi/known-subscriptions.json'))).toBe(true);

        // A second run has nothing new, so nothing is sent.
        const again = await runScanAsync([repo, '--report', '--json'], env);
        expect(again.code).toBe(0);
        expect(requests).toHaveLength(5);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
