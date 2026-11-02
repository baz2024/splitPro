import { Card } from '@heroui/react';
import { Bot } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { SimpleConfirmationDialog } from '~/components/SimpleConfirmationDialog';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type AgentSpend } from '~/server/agent/caps';
import { api } from '~/utils/api';

import { AgentCard } from './AgentCard';

/**
 * One control card per active agent key (spend vs cap, Pause / Edit cap / Rename, settings,
 * revoke) and a short list of revoked keys. New agents are added from the page's sticky
 * "Add agent & get token" button (AgentCreateSheet).
 */
export const ApiKeysSection: React.FC<{ agents?: AgentSpend[] }> = ({ agents = [] }) => {
  const { t, toUIDate } = useTranslationWithUtils(['common', 'agentcaps']);
  const [now] = useState(() => new Date());
  const spendByKey = new Map(agents.map((agent) => [agent.apiKeyId, agent] as const));
  const utils = api.useUtils();
  const keysQuery = api.agent.listApiKeys.useQuery();
  const revokeMutation = api.agent.revokeApiKey.useMutation();

  const [revokeId, setRevokeId] = useState<string | null>(null);

  const keys = keysQuery.data ?? [];
  const keyToRevoke = keys.find((key) => key.id === revokeId);
  const activeKeys = keys.filter((key) => !key.revokedAt);
  const revokedKeys = keys.filter((key) => key.revokedAt);

  const onRevoke = async () => {
    if (!revokeId) {
      return;
    }
    try {
      await revokeMutation.mutateAsync({ id: revokeId });
      toast.success(t('agents.keys.revoke_success'));
      Promise.all([utils.agent.listApiKeys.invalidate(), utils.agent.usage.invalidate()]).catch(
        console.error,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agents.keys.revoke_error'));
    } finally {
      setRevokeId(null);
    }
  };

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <Bot className="text-accent size-4" aria-hidden />
          {t('audit_g.section_title', { ns: 'agentcaps' })}
        </Card.Title>
        <Card.Description>{t('audit_g.section_description', { ns: 'agentcaps' })}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {keysQuery.isPending ? (
          <p className="text-muted text-sm">{t('agents.loading')}</p>
        ) : 0 === activeKeys.length ? (
          <p className="text-muted text-sm">{t('audit_g.empty', { ns: 'agentcaps' })}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activeKeys.map((key) => (
              <AgentCard
                key={key.id}
                apiKey={key}
                spend={spendByKey.get(key.id)}
                now={now}
                onRevoke={setRevokeId}
              />
            ))}
          </ul>
        )}

        {0 < revokedKeys.length && (
          <details className="group">
            <summary className="text-muted focus-visible:ring-focus min-h-11 cursor-pointer rounded-lg px-1 py-3 text-xs font-semibold tracking-wider uppercase focus-visible:ring-2 focus-visible:outline-none">
              {t('revoked.title', { ns: 'agentcaps' })} · {revokedKeys.length}
            </summary>
            <ul className="divide-border border-border divide-y rounded-xl border">
              {revokedKeys.map((key) => (
                <li key={key.id} className="flex flex-col gap-0.5 px-3 py-3">
                  <span className="truncate text-sm font-medium">
                    {key.agentLabel?.trim() || key.name}
                  </span>
                  <span className="text-muted text-xs">
                    <code dir="ltr" className="font-mono">
                      {key.prefix}…{key.lastFour ?? ''}
                    </code>
                    {' · '}
                    {t('agents.keys.revoked')}{' '}
                    {key.revokedAt ? toUIDate(key.revokedAt, { year: true }) : ''}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card.Content>

      <SimpleConfirmationDialog
        open={null !== revokeId}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeId(null);
          }
        }}
        title={t('agents.keys.revoke_title')}
        description={t('agents.keys.revoke_description', { name: keyToRevoke?.name ?? '' })}
        hasPermission
        onConfirm={onRevoke}
        loading={revokeMutation.isPending}
        variant="destructive"
      />
    </Card>
  );
};
