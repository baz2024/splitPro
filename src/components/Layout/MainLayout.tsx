import { clsx } from 'clsx';
import {
  AlignLeftIcon,
  CreditCardIcon,
  type LucideIcon,
  PieChartIcon,
  PlusIcon,
  UserIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { LoadingSpinner } from '../ui/spinner';

interface MainLayoutProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  loading?: boolean;
  /** Hides the mobile bottom tab bar (full-screen flows with their own pinned actions). */
  hideAppBar?: boolean;
}

interface NavEntry {
  key: 'balances' | 'projects' | 'add' | 'activity' | 'account';
  link: string;
  Icon: LucideIcon;
  /** Other routes that should light up this tab. */
  matches: readonly string[];
}

const NAV_ENTRIES = [
  { key: 'balances', link: '/balances', Icon: PieChartIcon, matches: ['/balances'] },
  {
    key: 'projects',
    link: '/projects',
    Icon: CreditCardIcon,
    // Projects are groups with a budget; their sub-pages keep the Projects tab active.
    matches: ['/projects', '/groups', '/subscriptions'],
  },
  { key: 'add', link: '/add', Icon: PlusIcon, matches: ['/add'] },
  { key: 'activity', link: '/activity', Icon: AlignLeftIcon, matches: ['/activity'] },
  { key: 'account', link: '/account', Icon: UserIcon, matches: ['/account'] },
] as const satisfies readonly NavEntry[];

const isActivePath = (entry: NavEntry, currentPath: string) =>
  entry.matches.some((path) => currentPath === path || currentPath.startsWith(`${path}/`));

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  actions,
  title,
  loading,
  hideAppBar = false,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const currentPath = router.pathname;

  const labels: Record<NavEntry['key'], string> = {
    balances: t('navigation.balances'),
    projects: t('navigation.projects'),
    add: t('navigation.add'),
    activity: t('navigation.activity'),
    account: t('navigation.account'),
  };

  return (
    <div className="bg-background h-full w-full">
      <div
        vaul-drawer-wrapper=""
        className="bg-background mx-auto flex h-full w-full flex-col lg:max-w-3xl lg:flex-row"
      >
        <nav
          aria-label={t('meta.application_name')}
          className="-ms-[190px] hidden w-[190px] px-4 py-4 lg:flex lg:flex-col lg:gap-1"
        >
          <Link
            href="/balances"
            className="focus-visible:ring-focus mb-6 flex min-h-11 items-center gap-2 rounded-xl px-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="text-foreground text-xl font-semibold">
              {t('meta.application_name')}
            </span>
          </Link>
          {NAV_ENTRIES.map((entry) => (
            <NavItemDesktop
              key={entry.key}
              entry={entry}
              title={labels[entry.key]}
              isActive={isActivePath(entry, currentPath)}
            />
          ))}
        </nav>
        <div className="lg:border-border w-full overflow-auto lg:border-x lg:px-6" id="mainlayout">
          {title ? (
            <div className="mb-2 flex items-center justify-between px-4 py-4">
              <div className="text-foreground text-3xl font-bold">{title}</div>
              {actions}
            </div>
          ) : null}
          <div className="px-4">
            {loading ? (
              <div className="mt-10 flex justify-center">
                <LoadingSpinner className="text-accent" />
              </div>
            ) : (
              children
            )}
          </div>
          {/* Keeps the last content clear of the tab bar and its raised Add button. */}
          {hideAppBar ? null : (
            <div className="h-[calc(7rem+env(safe-area-inset-bottom))] lg:h-0" aria-hidden />
          )}
        </div>
      </div>

      {hideAppBar ? null : (
        <nav
          aria-label={t('meta.application_name')}
          className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-lg lg:hidden"
        >
          {NAV_ENTRIES.map((entry) => (
            <NavItem
              key={entry.key}
              entry={entry}
              title={labels[entry.key]}
              isActive={isActivePath(entry, currentPath)}
            />
          ))}
        </nav>
      )}
    </div>
  );
};

interface NavItemProps {
  entry: NavEntry;
  title: string;
  isActive: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ entry, title, isActive }) => {
  const { Icon } = entry;

  if ('add' === entry.key) {
    return (
      <Link
        href={entry.link}
        aria-current={isActive ? 'page' : undefined}
        className="group flex min-h-11 min-w-14 flex-col items-center gap-1 rounded-2xl focus-visible:outline-none"
      >
        <span className="bg-accent text-accent-foreground group-focus-visible:ring-focus group-focus-visible:ring-offset-background -mt-5 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-active:scale-95">
          <Icon className="size-6" strokeWidth={2.5} aria-hidden />
        </span>
        <span className={clsx('text-[11px]', isActive ? 'text-accent font-medium' : 'text-muted')}>
          {title}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={entry.link}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'focus-visible:ring-focus flex min-h-11 min-w-14 flex-col items-center gap-1 rounded-xl px-1 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none',
        isActive ? 'text-accent' : 'text-muted hover:text-foreground',
      )}
    >
      <Icon className="size-[22px]" strokeWidth={2} aria-hidden />
      <span className={clsx('text-[11px]', isActive ? 'font-medium' : '')}>{title}</span>
    </Link>
  );
};

const NavItemDesktop: React.FC<NavItemProps> = ({ entry, title, isActive }) => {
  const { Icon } = entry;
  const isAdd = 'add' === entry.key;

  return (
    <Link
      href={entry.link}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'focus-visible:ring-focus flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none',
        isActive ? 'text-accent bg-accent/10 font-medium' : 'text-muted hover:text-foreground',
      )}
    >
      {isAdd ? (
        <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-full">
          <Icon className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
      ) : (
        <span className="flex size-8 items-center justify-center">
          <Icon className="size-[22px]" strokeWidth={2} aria-hidden />
        </span>
      )}
      <span>{title}</span>
    </Link>
  );
};

export default MainLayout;
