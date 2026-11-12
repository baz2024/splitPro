import { type GetServerSideProps, type NextPage } from 'next';
import Link from 'next/link';

import { env } from '~/env';
import { customServerSideTranslations } from '~/utils/i18n/server';

const SERVICE_PROVIDERS = [
  {
    name: 'Vercel',
    purpose:
      'Hosts the Safi website and app servers, and stores files you upload, such as receipt photos.',
  },
  {
    name: 'Supabase',
    purpose:
      'Handles sign-in with Apple, Google and phone number. When you sign in with your phone, Supabase and its SMS provider send you a one-time code.',
  },
  {
    name: 'Apple and Google',
    purpose:
      'If you choose Sign in with Apple or Google, they confirm who you are and share your name, email address and (Google only) profile photo with us.',
  },
  {
    name: 'Anthropic (Claude)',
    purpose:
      'Reads a receipt photo to find the amount, date and merchant, only when you choose Scan.',
  },
  {
    name: 'Our email provider',
    purpose: 'Sends sign-in links, invitations and account emails.',
  },
  {
    name: 'Twilio',
    purpose:
      'Sends an SMS invitation when you invite someone by phone number. It receives their phone number and your name.',
  },
  {
    name: 'GoCardless and Plaid (optional)',
    purpose:
      'Connect to your bank, only if you choose to link an account, so you can import transactions.',
  },
  {
    name: 'Vercel billing (optional)',
    purpose:
      'If you connect a Vercel account to track usage costs, we use the access token you give us to read your billing data from Vercel.',
  },
  {
    name: 'Push notification services (Apple, Google, Mozilla)',
    purpose: 'Deliver notifications to your device or browser, only if you turn them on.',
  },
  {
    name: 'Currency rate services (Frankfurter, Open Exchange Rates, National Bank of Poland)',
    purpose:
      'Provide exchange rates. We only send currency codes and dates, never your personal information.',
  },
  {
    name: 'Discord',
    purpose:
      'Receives internal alerts for our team when an email fails to send. These contain technical error details, not your expenses.',
  },
] as const;

const ContactLink = ({ feedbackEmail }: { feedbackEmail: string }) => {
  if ('' === feedbackEmail) {
    return (
      <Link className="underline" href="/delete-account">
        safi.kafoai.com/delete-account
      </Link>
    );
  }

  return (
    // oxlint-disable-next-line next/no-html-link-for-pages
    <a className="break-all underline" href={`mailto:${feedbackEmail}`}>
      {feedbackEmail}
    </a>
  );
};

const Privacy: NextPage<{ feedbackEmail: string }> = ({ feedbackEmail }) => (
  <>
    <div>
      <main className="mx-auto max-w-4xl px-4 pb-32 lg:px-0">
        <nav className="sticky mx-auto flex max-w-5xl items-center justify-between px-4 py-4 lg:px-0 lg:py-5">
          <Link href="/">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-medium">Safi</p>
            </div>
          </Link>
        </nav>
        <h1 className="mt-20 text-2xl font-semibold">Privacy Policy</h1>
        <p className="text-muted text-sm">Last updated: 12 November 2026</p>

        <p className="text-muted mt-4 text-lg">
          Safi is run by Kafo AI (&quot;we&quot;, &quot;us&quot;). This policy explains what
          information Safi collects, why, who we share it with, and how you can delete it. It covers
          the website at safi.kafoai.com and the Safi apps for iPhone and Android, which open the
          same service.
        </p>

        <p className="mt-16 text-xl font-semibold">1. Information We Collect</p>
        <p className="text-foreground/80 mt-4 text-lg">Account information</p>
        <p className="text-muted mt-0.5 text-lg">
          Your name, email address, phone number (if you sign in with your phone) and profile photo
          (if you sign in with Google or add one). If you use Sign in with Apple and hide your
          email, we only receive Apple&apos;s private relay address.
        </p>
        <p className="text-foreground/80 mt-4 text-lg">What you add to Safi</p>
        <p className="text-muted mt-0.5 text-lg">
          Expenses, amounts, notes, categories, groups, projects, and the friends and group members
          you split with (their names, emails or phone numbers, as you enter them). Receipt photos
          and other files you attach.
        </p>
        <p className="text-foreground/80 mt-4 text-lg">Connections you choose to add</p>
        <p className="text-muted mt-0.5 text-lg">
          If you link a bank account, the transactions and account details the bank shares through
          GoCardless or Plaid. If you connect a Vercel account for usage costs, the access token you
          provide and the billing data it returns. Access tokens are encrypted (AES-256-GCM) before
          we store them. Safi API keys you create are stored only as a one-way hash.
        </p>
        <p className="text-foreground/80 mt-4 text-lg">Device information</p>
        <p className="text-muted mt-0.5 text-lg">
          If you turn on notifications, a push subscription for your device or browser. Sign-in
          session cookies that keep you logged in.
        </p>

        <p className="mt-16 text-xl font-semibold">2. How We Use Your Information</p>
        <div className="text-muted mt-1 text-lg">
          We use your information only to run Safi:
          <ul className="list-outside list-disc pl-5">
            <li>To sign you in and keep your account secure</li>
            <li>To record expenses and calculate who owes whom</li>
            <li>
              To show your name and photo to people you share expenses or groups with, or who know
              your email address or phone number
            </li>
            <li>To send invitations, reminders and notifications you asked for</li>
            <li>To answer your support requests</li>
          </ul>
        </div>

        <p className="mt-16 text-xl font-semibold">3. AI Receipt Reading</p>
        <p className="text-muted mt-1 text-lg">
          When you choose Scan on a receipt, Safi sends that photo to Anthropic&apos;s Claude AI
          model to read the total amount, date and merchant. We only send a photo when you choose
          Scan, and only that photo. Anthropic processes it under Anthropic&apos;s commercial terms,
          which don&apos;t allow training on this data. AI can make mistakes, so please check the
          amounts before you save an expense.
        </p>

        <p className="mt-16 text-xl font-semibold">4. Service Providers</p>
        <p className="text-muted mt-1 text-lg">
          We share information with these providers only so they can do the job listed:
        </p>
        <ul className="mt-2 flex flex-col gap-3 text-lg">
          {SERVICE_PROVIDERS.map((provider) => (
            <li key={provider.name}>
              <p className="text-foreground/80 font-medium">{provider.name}</p>
              <p className="text-muted">{provider.purpose}</p>
            </li>
          ))}
        </ul>

        <p className="mt-16 text-xl font-semibold">5. No Selling, Ads or Tracking</p>
        <p className="text-muted mt-1 text-lg">
          We don&apos;t sell or rent your personal information. Safi shows no ads and uses no
          third-party analytics, advertising or tracking tools, and we don&apos;t track you across
          other apps or websites.
        </p>

        <p className="mt-16 text-xl font-semibold">6. Data Security</p>
        <p className="text-muted mt-1 text-lg">
          All traffic is encrypted in transit, and connection tokens are encrypted at rest. No
          method of transmission or storage is completely secure, so we can&apos;t guarantee
          absolute security, but we take reasonable steps to protect your information.
        </p>

        <p className="mt-16 text-xl font-semibold">7. Data Retention</p>
        <p className="text-muted mt-1 text-lg">
          We keep your information while your account is open. When you delete your account, we
          delete it as described below, except where the law requires us to keep something.
        </p>

        <p className="mt-16 text-xl font-semibold">8. Deleting Your Account</p>
        <p className="text-muted mt-1 text-lg">You can delete your account at any time:</p>
        <ul className="text-muted mt-1 list-outside list-disc pl-5 text-lg">
          <li>In the app: Account → Delete account</li>
          <li>
            On the web:{' '}
            <Link className="underline" href="/delete-account">
              safi.kafoai.com/delete-account
            </Link>
          </li>
        </ul>
        <p className="text-muted mt-3 text-lg">
          We delete your name, email address, phone number, profile photo, sign-in sessions, bank
          and billing connections, API keys, notification subscriptions and detected subscriptions.
        </p>
        <p className="text-muted mt-3 text-lg">
          Expenses you shared with other people stay in their groups so their balances remain
          correct, but your name and contact details are removed and you appear as a deleted user.
        </p>

        <p className="mt-16 text-xl font-semibold">9. Your Rights</p>
        <p className="text-muted mt-1 text-lg">
          You can see and edit your information in the app, export your expenses, and delete your
          account. Depending on where you live, you may also have the right to ask for a copy of
          your data, to correct it, or to object to how we use it. To make a request, contact us at{' '}
          <ContactLink feedbackEmail={feedbackEmail} />.
        </p>

        <p className="mt-16 text-xl font-semibold">10. Children&apos;s Privacy</p>
        <p className="text-muted mt-1 text-lg">
          Safi is not intended for anyone under 13. We do not knowingly collect personal information
          from children under 13. If you are a parent or guardian and believe your child has given
          us personal information, please contact us at{' '}
          <ContactLink feedbackEmail={feedbackEmail} />.
        </p>

        <p className="mt-16 text-xl font-semibold">11. Changes to This Policy</p>
        <p className="text-muted mt-1 text-lg">
          We may update this policy from time to time. We will post the updated policy on this page
          and change the date at the top.
        </p>

        <p className="mt-16 text-xl font-semibold">12. Contact</p>
        <p className="text-muted mt-1 text-lg">
          Safi is operated by Kafo AI. For questions about this policy or your data, contact us at{' '}
          <ContactLink feedbackEmail={feedbackEmail} />.
        </p>
      </main>
    </div>
  </>
);

export default Privacy;

export const getServerSideProps: GetServerSideProps = async (context) => ({
  props: {
    feedbackEmail: env.FEEDBACK_EMAIL ?? '',
    // Loads the app title and other shared strings used by the page shell.
    ...(await customServerSideTranslations(context.locale, ['common'])),
  },
});
