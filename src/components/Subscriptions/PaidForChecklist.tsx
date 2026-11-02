import { ChevronRight, ListChecks } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { ServiceBadge } from '~/components/Safi/ServiceBadge';
import { AppDrawer } from '~/components/ui/drawer';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { PLAN_PRICE_CURRENCY, SERVICE_CATALOG, type ServiceInfo } from '~/lib/serviceCatalog';

import { SUBSCRIPTIONS_NAMESPACES } from './types';

/**
 * Services with known plans, for the "Which of these do you pay for?" sheet. Entries sharing
 * one plan list (Anthropic and Claude Code both sell Claude plans) appear once.
 */
export const CHECKLIST_SERVICES: readonly ServiceInfo[] = SERVICE_CATALOG.filter(
  (service: ServiceInfo, index, all: readonly ServiceInfo[]) =>
    0 < (service.plans?.length ?? 0) &&
    index === all.findIndex((other) => other.plans === service.plans),
);

/**
 * Onboarding sheet from the empty Subscriptions state: popular dev and AI services, each with
 * its cheapest list price, opening Add cost on that service (where plan chips fill the price).
 */
export const PaidForChecklist: React.FC<{ groupId: number | null }> = ({ groupId }) => {
  const { t, getCurrencyHelpersCached } = useTranslationWithUtils(SUBSCRIPTIONS_NAMESPACES);
  const { toUIString } = getCurrencyHelpersCached(PLAN_PRICE_CURRENCY);

  const addHref = (serviceId: string) =>
    `/add?type=subscription&service=${encodeURIComponent(serviceId)}${
      null === groupId ? '' : `&groupId=${groupId}`
    }`;

  return (
    <AppDrawer
      title={t('checklist.title')}
      className="max-h-[85vh]"
      trigger={
        <button
          type="button"
          className="text-accent focus-visible:ring-focus mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg font-semibold focus-visible:ring-2 focus-visible:outline-none"
        >
          <ListChecks className="size-4" aria-hidden />
          {t('checklist.open')}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted text-sm">{t('checklist.hint')}</p>
        <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[20px] border">
          {CHECKLIST_SERVICES.map((service) => {
            const cheapest = (service.plans ?? []).reduce<bigint | null>(
              (min, plan) => (null === min || plan.monthlyUsd < min ? plan.monthlyUsd : min),
              null,
            );
            return (
              <li key={service.id}>
                <Link
                  href={addHref(service.id)}
                  aria-label={t('checklist.add', { name: service.name })}
                  className="focus-visible:ring-focus hover:bg-surface-secondary flex min-h-14 items-center gap-3 px-4 py-2 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                >
                  <ServiceBadge service={service.id} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{service.name}</span>
                    <span className="text-muted truncate text-xs">
                      {(service.plans ?? []).map((plan) => plan.name).join(' · ')}
                    </span>
                  </span>
                  {null !== cheapest && (
                    <span dir="ltr" className="text-muted shrink-0 text-xs tabular-nums">
                      {toUIString(cheapest)}+
                    </span>
                  )}
                  <ChevronRight className="text-muted size-4 shrink-0 rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </AppDrawer>
  );
};
