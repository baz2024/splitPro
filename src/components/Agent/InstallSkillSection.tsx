import { Card } from '@heroui/react';
import { Terminal } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { CopyField } from './CopyField';

const SKILL_BASE_URL = 'https://safi.kafoai.com/skills/safi-subscription-monitor';
const SKILL_DIR = '~/.claude/skills/safi-subscription-monitor';

export const SKILL_INSTALL_COMMAND = [
  `mkdir -p ${SKILL_DIR}/scripts`,
  `curl -fsSL ${SKILL_BASE_URL}/SKILL.md -o ${SKILL_DIR}/SKILL.md`,
  `curl -fsSL ${SKILL_BASE_URL}/scripts/scan.mjs -o ${SKILL_DIR}/scripts/scan.mjs`,
].join(' && ');

export const SKILL_ENV_LINE = 'export SAFI_API_KEY=<your key>';

const STEPS = ['create_key', 'install', 'set_key', 'run'] as const;

export const InstallSkillSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <Terminal className="text-accent size-4" aria-hidden />
          {t('agents.skill.title')}
        </Card.Title>
        <Card.Description>{t('agents.skill.description')}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <ol className="text-muted flex list-decimal flex-col gap-1 ps-5 text-sm">
          {STEPS.map((step) => (
            <li key={step}>
              {'create_key' === step
                ? t('audit_g.skill_create_key')
                : t(`agents.skill.steps.${step}`)}
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('agents.skill.command_label')}</p>
          <CopyField
            value={SKILL_INSTALL_COMMAND}
            label={t('agents.skill.command_label')}
            multiline
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('agents.skill.env_label')}</p>
          <CopyField value={SKILL_ENV_LINE} label={t('agents.skill.env_label')} />
          <p className="text-muted text-xs">{t('agents.skill.env_hint')}</p>
        </div>
      </Card.Content>
    </Card>
  );
};
