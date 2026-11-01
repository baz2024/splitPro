import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { percentOf } from '~/server/project/budget';
import { type RouterOutputs } from '~/utils/api';

import { isolateLtr } from './format';

type ProjectListItem = RouterOutputs['project']['list'][number];

const STATUS_TEXT = {
  on_track: 'text-success',
  at_risk: 'text-warning',
  over: 'text-danger',
  no_budget: 'text-muted',
} as const;

export const ProjectCard: React.FC<{ project: ProjectListItem }> = ({ project }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(['projects', 'common']);
  const { toUIString } = getCurrencyHelpersCached(project.currency);
  const hasBudget = null !== project.budget && null !== project.left;
  const percentSpent = hasBudget ? percentOf(project.spent, project.budget!) : 0;
  const isOver = 'over' === project.status;

  const headline = (() => {
    if (!hasBudget) {
      return t('list.spent_no_budget', { spent: isolateLtr(toUIString(project.spent)) });
    }
    if (isOver) {
      return t('list.over_by', {
        amount: isolateLtr(toUIString(-project.left!)),
        budget: isolateLtr(toUIString(project.budget)),
      });
    }
    return t('list.left_of', {
      left: isolateLtr(toUIString(project.left)),
      budget: isolateLtr(toUIString(project.budget)),
    });
  })();

  return (
    <Link
      href={`/projects/${project.id}`}
      className="bg-surface border-border focus-visible:ring-focus flex flex-col gap-3 rounded-[20px] border p-4 focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-semibold">{project.name}</span>
          <span className="text-muted text-xs">
            {t('list.members', { count: project.memberCount })}
          </span>
        </div>
        <ChevronRight className="text-muted size-5 shrink-0 rtl:rotate-180" aria-hidden />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-sm font-medium', isOver && 'text-danger')}>{headline}</span>
        {hasBudget ? (
          <span className={cn('shrink-0 text-xs', STATUS_TEXT[project.status])}>
            {t(`status.${project.status}`)}
          </span>
        ) : (
          <span className="text-accent shrink-0 text-xs font-medium">{t('list.set_budget')}</span>
        )}
      </div>
      {hasBudget ? (
        <div
          className="bg-default h-1.5 rounded-full"
          role="progressbar"
          aria-label={headline}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percentSpent)}
        >
          <div
            className={cn('h-1.5 rounded-full', isOver ? 'bg-danger' : 'bg-accent')}
            style={{ width: `${percentSpent}%` }}
          />
        </div>
      ) : null}
      <span className="text-muted text-xs">{t('list.days_left', { count: project.daysLeft })}</span>
    </Link>
  );
};
