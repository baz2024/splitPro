import { type CalendarDate } from '~/server/dataio/dates';
import {
  type ScanCadence,
  type ScanDecision,
  type ScanItem,
  type ScanReport,
  type ScanTotals,
} from '~/server/statementScan/types';

export const STATEMENT_SCAN_NAMESPACES = ['statementscan', 'common', 'currencies'];

export type ScanItemStatus = 'PENDING' | 'ADDED' | 'DISMISSED';

/** A detected subscription as the router returns it: the scan item plus its stored row. */
export type ScanListItem = ScanItem & { id: string; status: ScanItemStatus };

/** What the review screen needs, whether it came from a fresh scan or `latest`. */
export interface ScanSession {
  scanId: string;
  totals: ScanTotals[];
  items: ScanListItem[];
  /** Only a fresh scan knows the file's date range and row count. */
  report: Pick<ScanReport, 'from' | 'to' | 'scannedRows'> | null;
}

/** The user's pick and any corrections for one item on the confirm list. */
export interface ScanDraft {
  decision: ScanDecision | null;
  name?: string;
  amountMinor?: bigint;
  cadence?: ScanCadence;
}

export type ScanItemError = 'amount_required' | 'not_found' | 'failed';

export interface ConfirmDecision {
  id: string;
  decision: ScanDecision;
  amountMinor?: bigint;
  cadence?: ScanCadence;
  name?: string;
  nextRenewal?: CalendarDate;
}

export interface SavedReminder {
  id: string;
  name: string;
  daysBefore: number;
  date: CalendarDate | null;
}

export interface ScanOutcome {
  saved: number;
  dismissed: number;
  reminders: SavedReminder[];
}
