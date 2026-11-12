import { env } from '~/env';
import { db } from '~/server/db';
import { SUPABASE_PROVIDER } from '~/server/supabaseExchange';

/** Shown in shared projects in place of a deleted member's name. */
export const DELETED_USER_NAME = 'Deleted user';

/**
 * Removes the Supabase Auth user (Apple, Google or phone sign-in). Needs the service role key,
 * which only the server holds. Without it the Supabase row stays, but it no longer links to any
 * Safi data, because the Account link is deleted below.
 */
const deleteSupabaseAuthUser = async (supabaseUserId: string) => {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return;
  }

  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(supabaseUserId)}`,
    {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    },
  );

  if (!response.ok && 404 !== response.status) {
    console.error('Supabase user deletion failed', response.status);
  }
};

/**
 * Deletes a user's account (App Store 5.1.1(v), Google Play account deletion policy).
 *
 * Personal data, sign-in links, sessions, bank and billing connections, API keys and detected
 * subscriptions are deleted. Expenses in shared projects stay, with the user anonymised as
 * "Deleted user", so the other members' balances stay correct.
 */
export const deleteUserAccount = async (userId: number) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      accounts: { where: { provider: SUPABASE_PROVIDER }, select: { providerAccountId: true } },
    },
  });

  if (!user) {
    return;
  }

  await db.$transaction([
    db.session.deleteMany({ where: { userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.pushNotification.deleteMany({ where: { userId } }),
    db.apiKey.deleteMany({ where: { userId } }),
    db.billingConnection.deleteMany({ where: { userId } }),
    db.detectedSubscription.deleteMany({ where: { userId } }),
    db.cachedBankData.deleteMany({ where: { userId } }),
    db.friendDefaultSplit.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
    ...(user.email ? [db.verificationToken.deleteMany({ where: { identifier: user.email } })] : []),
    db.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: null,
        phone: null,
        image: null,
        emailVerified: null,
        bankingId: null,
        obapiProviderId: null,
        defaultCurrency: null,
        preferredLanguage: '',
        hiddenFriendIds: [],
      },
    }),
  ]);

  await Promise.allSettled(
    user.accounts.map((account) => deleteSupabaseAuthUser(account.providerAccountId)),
  );
};
