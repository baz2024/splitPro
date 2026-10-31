import type { LucideIcon } from 'lucide-react';
import React from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

// Headline + one line of guidance + primary action, the pattern used by Splitwise, Wise and Vipps.
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  children,
}) => (
  <div className="mt-[18vh] flex flex-col items-center gap-4 px-6 text-center">
    <div className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-full">
      <Icon className="size-8" aria-hidden />
    </div>
    <h2 className="text-xl font-semibold">{title}</h2>
    <p className="text-muted-foreground max-w-xs text-sm">{description}</p>
    {children ? <div className="mt-2 flex flex-col items-center gap-3">{children}</div> : null}
  </div>
);
