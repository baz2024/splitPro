import { Alert, Button, Card, Chip, Input } from '@heroui/react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { SimpleConfirmationDialog } from '~/components/SimpleConfirmationDialog';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { api } from '~/utils/api';

import { CopyField } from './CopyField';

const MAX_KEY_NAME_LENGTH = 100;

/** DOM ids the Agents page uses to scroll to and focus the create-key form. */
export const API_KEYS_SECTION_ID = 'agent-api-keys';
export const API_KEY_NAME_INPUT_ID = 'agent-api-key-name';

interface CreatedKey {
  id: string;
  name: string;
  token: string;
}

export const ApiKeysSection: React.FC = () => {
  const { t, toUIDate } = useTranslationWithUtils();
  const utils = api.useUtils();
  const keysQuery = api.agent.listApiKeys.useQuery();
  const createMutation = api.agent.createApiKey.useMutation();
  const revokeMutation = api.agent.revokeApiKey.useMutation();

  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const trimmedName = name.trim();
  const keys = keysQuery.data ?? [];
  const keyToRevoke = keys.find((key) => key.id === revokeId);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if ('' === trimmedName) {
      return;
    }
    try {
      const result = await createMutation.mutateAsync({ name: trimmedName });
      setCreatedKey({ id: result.id, name: result.name, token: result.token });
      setName('');
      utils.agent.listApiKeys.invalidate().catch(console.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agents.keys.create_error'));
    }
  };

  const onRevoke = async () => {
    if (!revokeId) {
      return;
    }
    try {
      await revokeMutation.mutateAsync({ id: revokeId });
      if (createdKey?.id === revokeId) {
        setCreatedKey(null);
      }
      toast.success(t('agents.keys.revoke_success'));
      utils.agent.listApiKeys.invalidate().catch(console.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agents.keys.revoke_error'));
    } finally {
      setRevokeId(null);
    }
  };

  return (
    <Card variant="secondary" id={API_KEYS_SECTION_ID} className="scroll-mt-4">
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <KeyRound className="text-accent size-4" aria-hidden />
          {t('agents.keys.title')}
        </Card.Title>
        <Card.Description>{t('agents.keys.description')}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <form onSubmit={onCreate} className="flex items-center gap-2">
          <Input
            id={API_KEY_NAME_INPUT_ID}
            aria-label={t('agents.keys.name_label')}
            placeholder={t('agents.keys.name_placeholder')}
            value={name}
            maxLength={MAX_KEY_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 min-w-0 flex-1"
            variant="secondary"
          />
          <Button
            type="submit"
            isDisabled={'' === trimmedName || createMutation.isPending}
            isPending={createMutation.isPending}
          >
            <Plus className="size-4" aria-hidden />
            {t('agents.keys.create')}
          </Button>
        </form>

        {createdKey && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content className="flex min-w-0 flex-col gap-2">
              <Alert.Title>{t('agents.keys.created_title', { name: createdKey.name })}</Alert.Title>
              <Alert.Description>{t('agents.keys.created_warning')}</Alert.Description>
              <CopyField value={createdKey.token} label={t('agents.keys.token_label')} multiline />
              <Button
                size="sm"
                variant="tertiary"
                className="self-end"
                onPress={() => setCreatedKey(null)}
              >
                {t('agents.keys.created_done')}
              </Button>
            </Alert.Content>
          </Alert>
        )}

        {keysQuery.isPending ? (
          <p className="text-muted text-sm">{t('agents.loading')}</p>
        ) : 0 === keys.length ? (
          <p className="text-muted text-sm">{t('agents.keys.empty')}</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-xl border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center gap-3 px-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{key.name}</span>
                    {key.revokedAt && (
                      <Chip size="sm" color="danger" variant="soft">
                        {t('agents.keys.revoked')}
                      </Chip>
                    )}
                  </div>
                  <code dir="ltr" className="text-muted self-start font-mono text-xs">
                    {key.prefix}…
                  </code>
                  <span className="text-muted text-xs">
                    {t('agents.keys.created_on', {
                      date: toUIDate(key.createdAt, { year: true }),
                    })}
                    {' · '}
                    {key.lastUsedAt
                      ? t('agents.keys.last_used', {
                          date: toUIDate(key.lastUsedAt, { useToday: true, year: true }),
                        })
                      : t('agents.keys.never_used')}
                  </span>
                </div>
                {!key.revokedAt && (
                  <Button
                    size="sm"
                    variant="danger-soft"
                    isIconOnly
                    aria-label={`${t('agents.keys.revoke')}: ${key.name}`}
                    onPress={() => setRevokeId(key.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
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
