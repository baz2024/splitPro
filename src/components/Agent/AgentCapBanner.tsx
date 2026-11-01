import { Alert } from '@heroui/react';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { type AgentSpend, agentsNeedingAttention } from '~/server/agent/caps';

/** Warning banner: "<label> is over its $X cap" / "will hit its cap at current pace". */
export const AgentCapBanner: React.FC<{ agents: AgentSpend[] }> = ({ agents }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['agentcaps']);
  const flagged = agentsNeedingAttention(agents);
  const [first, ...rest] = flagged;

  if (!first) {
    return null;
  }

  const message = (agent: AgentSpend) => {
    const cap = getCurrencyHelpersCached(agent.currency ?? 'USD').toUIString(agent.cap ?? 0n);
    const values = { label: agent.label, cap, percent: agent.percent };
    if ('over' === agent.state) {
      return t('banner.over', values);
    }
    if ('reached' === agent.state) {
      return t('banner.reached', values);
    }
    return agent.projectedToHitCap ? t('banner.near_pace', values) : t('banner.near', values);
  };

  return (
    <Alert status="warning" className="rounded-2xl">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>
          {0 === rest.length ? (
            message(first)
          ) : (
            <ul className="flex flex-col gap-1">
              {flagged.map((agent) => (
                <li key={agent.apiKeyId}>{message(agent)}</li>
              ))}
            </ul>
          )}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};
