import { type RouterOutputs } from '~/utils/api';

export type SubscriptionsOverview = RouterOutputs['subscriptions']['list'];
export type SubscriptionListItem = SubscriptionsOverview['items'][number];
export type UsageListItem = SubscriptionsOverview['usage'][number];

export const SUBSCRIPTIONS_NAMESPACES = ['subscriptions', 'common'];

export const expenseHref = (id: string, groupId: number | null) =>
  null === groupId ? `/expenses/${id}` : `/groups/${groupId}/expenses/${id}`;
