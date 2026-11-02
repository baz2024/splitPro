import { Button } from '@heroui/react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '~/lib/utils';

const COPIED_RESET_MS = 2000;

/** Read-only, left-to-right code value with a copy button. Used for tokens and shell commands. */
export const CopyField: React.FC<{
  value: string;
  label: string;
  multiline?: boolean;
  className?: string;
}> = ({ value, label, multiline = false, className }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = copied ? setTimeout(() => setCopied(false), COPIED_RESET_MS) : undefined;
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        toast.success(t('agents.copy.copied'), { duration: 1500 });
      })
      .catch((error: unknown) => {
        console.error('Copy failed:', error);
        toast.error(t('agents.copy.failed'));
      });
  };

  return (
    <div
      className={cn(
        'bg-surface border-border flex items-start gap-2 rounded-xl border p-2 ps-3',
        className,
      )}
    >
      <code
        dir="ltr"
        aria-label={label}
        className={cn(
          'text-foreground min-w-0 flex-1 py-1.5 text-start font-mono text-xs leading-relaxed',
          multiline ? 'break-all whitespace-pre-wrap' : 'truncate',
        )}
      >
        {value}
      </code>
      <Button
        size="sm"
        variant="tertiary"
        isIconOnly
        aria-label={copied ? t('agents.copy.copied') : `${t('agents.copy.action')}: ${label}`}
        onPress={onCopy}
      >
        {copied ? (
          <Check className="text-success size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </Button>
    </div>
  );
};
