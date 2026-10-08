import type { BillHeader } from '../../models/bill';
import type { IsoDate } from '../../models/common';

/**
 * Bill lifecycle rules (business day = the device's local calendar date):
 *
 * - New bills are always dated today. Bills cannot be created for past dates.
 *   Any number of bills may be created for the same store on the same day.
 * - A bill dated today can be edited any number of times.
 * - A bill from an earlier day can never be edited; to correct it, mark it
 *   invalid (with a reason) and create a new bill today.
 * - Any valid bill — today's or older — can be marked invalid. Invalid bills
 *   stay on record, keep their number, and are excluded from sales/reports.
 *
 * (Storage keeps the status value `cancelled` for invalid bills.)
 */
export function isBillEditable(bill: Pick<BillHeader, 'status' | 'billDate'>, today: IsoDate): boolean {
  return bill.status === 'finalized' && bill.billDate === today;
}

export function canMarkInvalid(bill: Pick<BillHeader, 'status'>): boolean {
  return bill.status === 'finalized';
}

export const BILL_RULE_MESSAGES = {
  createToday: 'New bills are always dated today. Bills cannot be created for earlier dates.',
  editTodayOnly: 'Only today’s bills can be edited. To correct a bill from an earlier day, mark it as invalid and create a new bill today.',
  dateLocked: 'The date of a saved bill cannot be changed.',
} as const;
