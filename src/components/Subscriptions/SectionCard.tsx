import React from 'react';

interface SectionCardProps {
  title: string;
  /** Shown instead of the list when there are no rows. */
  empty: React.ReactNode;
  isEmpty: boolean;
  children: React.ReactNode;
}

/** Uppercase section label + rounded surface card with divided rows, as in the approved design. */
export const SectionCard: React.FC<SectionCardProps> = ({ title, empty, isEmpty, children }) => (
  <section className="flex flex-col gap-2">
    <h2 className="text-muted px-1 text-xs font-semibold tracking-widest uppercase">{title}</h2>
    {isEmpty ? (
      <div className="border-border bg-surface text-muted rounded-[20px] border px-4 py-5 text-sm">
        {empty}
      </div>
    ) : (
      <ul className="border-border bg-surface divide-border flex flex-col divide-y overflow-hidden rounded-[20px] border">
        {children}
      </ul>
    )}
  </section>
);
