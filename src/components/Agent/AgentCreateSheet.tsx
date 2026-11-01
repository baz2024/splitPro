import { Alert, Button, Input } from '@heroui/react';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { AppDrawer } from '~/components/ui/drawer';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { api } from '~/utils/api';

import { CopyField } from './CopyField';

const MAX_KEY_NAME_LENGTH = 100;
const NAME_INPUT_ID = 'agent-create-name';

interface CreatedKey {
  id: string;
  name: string;
  token: string;
}

/**
 * The one way to add an agent: name it, create its key, then copy the token, which is shown
 * once only. Opened from the sticky "Add agent & get token" button on the Agents page.
 */
export const AgentCreateSheet: React.FC<{ trigger: React.ReactNode }> = ({ trigger }) => {
  const { t } = useTranslationWithUtils(['common', 'agentcaps']);
  const utils = api.useUtils();
  const createMutation = api.agent.createApiKey.useMutation();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const trimmedName = name.trim();

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setName('');
      setCreatedKey(null);
    }
    setOpen(next);
  };

  const onCreate = async () => {
    if ('' === trimmedName || createMutation.isPending) {
      return;
    }
    try {
      const result = await createMutation.mutateAsync({ name: trimmedName });
      setCreatedKey({ id: result.id, name: result.name, token: result.token });
      setName('');
      Promise.all([utils.agent.listApiKeys.invalidate(), utils.agent.usage.invalidate()]).catch(
        console.error,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agents.keys.create_error'));
    }
  };

  return (
    <AppDrawer
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t('audit_g.create_title', { ns: 'agentcaps' })}
      actionTitle={createdKey ? undefined : t('agents.keys.create')}
      actionOnClick={() => {
        onCreate().catch(console.error);
      }}
      actionDisabled={'' === trimmedName || createMutation.isPending}
      shouldCloseOnAction={false}
      // The token is shown once: don't lose it to a stray tap outside the sheet.
      dismissible={null === createdKey}
    >
      {createdKey ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content className="flex min-w-0 flex-col gap-2">
            <Alert.Title>{t('agents.keys.created_title', { name: createdKey.name })}</Alert.Title>
            <Alert.Description>{t('agents.keys.created_warning')}</Alert.Description>
            <CopyField value={createdKey.token} label={t('agents.keys.token_label')} multiline />
            <Button size="sm" className="self-end" onPress={() => onOpenChange(false)}>
              {t('agents.keys.created_done')}
            </Button>
          </Alert.Content>
        </Alert>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate().catch(console.error);
          }}
        >
          <label htmlFor={NAME_INPUT_ID} className="text-sm font-medium">
            {t('agents.keys.name_label')}
          </label>
          <Input
            id={NAME_INPUT_ID}
            autoFocus
            placeholder={t('agents.keys.name_placeholder')}
            value={name}
            maxLength={MAX_KEY_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11"
            variant="secondary"
            aria-describedby={`${NAME_INPUT_ID}-hint`}
          />
          <p id={`${NAME_INPUT_ID}-hint`} className="text-muted text-xs">
            {t('audit_g.create_hint', { ns: 'agentcaps' })}
          </p>
        </form>
      )}
    </AppDrawer>
  );
};
