// Pure sanitization helpers shared between client localStorage hydration and
// the server's LocalState → DB migration endpoint (Phase 0.2 + 0.3).
//
// Each sanitizer takes untrusted JSON shape and returns either a typed value
// or null/safe-default. No I/O, no globals — easy to test and easy to reuse on
// the server.

import type {
  AvatarProfile,
  Bill,
  Budget,
  CalendarState,
  MoneyState,
  MoneyTransaction,
  PlannerLineItem
} from '../lib/family-hub/storage.ts';
import type { NormalizedCalendar, NormalizedEvent, Provider } from './calendar.ts';

const CALENDAR_PROVIDERS: Provider[] = ['google', 'microsoft', 'ics', 'caldav'];

export const isCalendarProvider = (value: unknown): value is Provider =>
  typeof value === 'string' && CALENDAR_PROVIDERS.includes(value as Provider);

export const isIsoDateTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

export const toCents = (value: unknown): number =>
  typeof value === 'number' ? Math.round(value * 100) : 0;

export const sanitizeNormalizedCalendar = (calendar: any): NormalizedCalendar | null => {
  if (
    !calendar ||
    typeof calendar.id !== 'string' ||
    typeof calendar.name !== 'string' ||
    !isCalendarProvider(calendar.provider)
  ) {
    return null;
  }

  return {
    id: calendar.id,
    name: calendar.name,
    provider: calendar.provider,
    primary: Boolean(calendar.primary),
    color: typeof calendar.color === 'string' ? calendar.color : undefined,
    readOnly: Boolean(calendar.readOnly),
    accountLabel: typeof calendar.accountLabel === 'string' ? calendar.accountLabel : undefined
  };
};

export const sanitizeNormalizedEvent = (event: any): NormalizedEvent | null => {
  if (
    !event ||
    typeof event.id !== 'string' ||
    typeof event.calendarId !== 'string' ||
    typeof event.title !== 'string' ||
    !isCalendarProvider(event.provider) ||
    !isIsoDateTime(event.start?.iso) ||
    !isIsoDateTime(event.end?.iso)
  ) {
    return null;
  }

  return {
    id: event.id,
    provider: event.provider,
    calendarId: event.calendarId,
    title: event.title,
    description: typeof event.description === 'string' ? event.description : undefined,
    location: typeof event.location === 'string' ? event.location : undefined,
    start: { iso: event.start.iso, allDay: Boolean(event.start?.allDay) },
    end: { iso: event.end.iso, allDay: Boolean(event.end?.allDay) },
    organizer: typeof event.organizer === 'string' ? event.organizer : undefined,
    url: typeof event.url === 'string' ? event.url : undefined,
    updatedAtIso: isIsoDateTime(event.updatedAtIso) ? event.updatedAtIso : undefined,
    source: event.source === 'internal' ? 'internal' : 'external'
  };
};

export const sanitizeCalendarState = (rawCalendar: any): CalendarState => {
  const events = (rawCalendar?.events ?? [])
    .filter(
      (event: any) =>
        typeof event?.id === 'string' &&
        typeof event?.title === 'string' &&
        typeof event?.date === 'string'
    )
    .map((event: any) => ({
      ...event,
      kind: event.kind === 'appointment' ? 'appointment' : 'event'
    }));

  const externalEvents = (rawCalendar?.externalEvents ?? [])
    .map((event: any) => sanitizeNormalizedEvent(event))
    .filter((event: NormalizedEvent | null): event is NormalizedEvent => Boolean(event));

  const calendars = (rawCalendar?.calendars ?? [])
    .map((calendar: any) => sanitizeNormalizedCalendar(calendar))
    .filter((calendar: NormalizedCalendar | null): calendar is NormalizedCalendar => Boolean(calendar));

  const lastSyncedAtIsoByProvider = Object.fromEntries(
    Object.entries(rawCalendar?.lastSyncedAtIsoByProvider ?? {}).filter(
      ([provider, value]) => isCalendarProvider(provider) && isIsoDateTime(value)
    )
  ) as CalendarState['lastSyncedAtIsoByProvider'];

  return { events, externalEvents, calendars, lastSyncedAtIsoByProvider };
};

export const sanitizeAvatar = (
  avatar: Partial<AvatarProfile> | undefined,
  fallback: AvatarProfile
): AvatarProfile => ({
  mood:
    avatar?.mood && ['happy', 'sleepy', 'excited', 'proud', 'silly'].includes(avatar.mood)
      ? avatar.mood
      : fallback.mood,
  points: typeof avatar?.points === 'number' ? avatar.points : fallback.points,
  familyContribution:
    typeof avatar?.familyContribution === 'number' ? avatar.familyContribution : fallback.familyContribution,
  look: {
    body:
      avatar?.look?.body && ['fox', 'cat', 'bear', 'bunny'].includes(avatar.look.body)
        ? avatar.look.body
        : fallback.look.body,
    outfit:
      avatar?.look?.outfit && ['cozy', 'sporty', 'party', 'explorer'].includes(avatar.look.outfit)
        ? avatar.look.outfit
        : fallback.look.outfit,
    accessory:
      avatar?.look?.accessory && ['none', 'star', 'flower', 'sunglasses'].includes(avatar.look.accessory)
        ? avatar.look.accessory
        : fallback.look.accessory,
    collar:
      avatar?.look?.collar && ['blue', 'mint', 'pink', 'gold'].includes(avatar.look.collar)
        ? avatar.look.collar
        : fallback.look.collar
  },
  inventory: Array.isArray(avatar?.inventory)
    ? avatar.inventory.filter((item): item is string => typeof item === 'string')
    : fallback.inventory
});

export const sanitizeMoneyState = (
  rawMoney: Partial<MoneyState> & { payments?: any[]; actualTransactions?: any[] }
): MoneyState => {
  const bills: Bill[] = Array.isArray(rawMoney.bills)
    ? rawMoney.bills
    : (rawMoney.payments ?? []).map((payment: any) => ({
        id: typeof payment.id === 'string' ? payment.id : `bill-${Date.now()}-${Math.random()}`,
        title: typeof payment.title === 'string' ? payment.title : 'Bill',
        amountCents:
          typeof payment.amountCents === 'number' ? payment.amountCents : toCents(payment.amount),
        dueDateIso:
          typeof payment.dueDateIso === 'string'
            ? payment.dueDateIso
            : typeof payment.dueDate === 'string'
              ? payment.dueDate
              : new Date().toISOString().slice(0, 10),
        category: typeof payment.category === 'string' ? payment.category : 'Other',
        paid: Boolean(payment.paid),
        paidDateIso:
          typeof payment.paidDateIso === 'string'
            ? payment.paidDateIso
            : typeof payment.paidDate === 'string'
              ? payment.paidDate
              : undefined,
        proofFileName: typeof payment.proofFileName === 'string' ? payment.proofFileName : undefined,
        notes: typeof payment.notes === 'string' ? payment.notes : undefined,
        autoCreateTransaction: payment.autoCreateTransaction !== false,
        linkedTransactionId:
          typeof payment.linkedTransactionId === 'string' ? payment.linkedTransactionId : undefined
      }));

  const transactions: MoneyTransaction[] = Array.isArray(rawMoney.transactions)
    ? rawMoney.transactions
    : (rawMoney.actualTransactions ?? []).map((tx: any) => ({
        id: typeof tx.id === 'string' ? tx.id : `tx-${Date.now()}-${Math.random()}`,
        title: typeof tx.title === 'string' ? tx.title : 'Transaction',
        amountCents: typeof tx.amountCents === 'number' ? tx.amountCents : toCents(tx.amount),
        dateIso:
          typeof tx.dateIso === 'string'
            ? tx.dateIso
            : typeof tx.date === 'string'
              ? tx.date
              : new Date().toISOString().slice(0, 10),
        kind: (tx.kind === 'inflow' ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
        category: typeof tx.category === 'string' ? tx.category : 'Other',
        notes: typeof tx.notes === 'string' ? tx.notes : undefined,
        source: (tx.source === 'bill' || tx.source === 'statement' ? tx.source : 'manual') as
          | 'manual'
          | 'bill'
          | 'statement',
        sourceBillId:
          typeof tx.sourceBillId === 'string'
            ? tx.sourceBillId
            : typeof tx.sourcePaymentId === 'string'
              ? tx.sourcePaymentId
              : undefined,
        statementImportId:
          typeof tx.statementImportId === 'string' ? tx.statementImportId : undefined,
        statementFileName: typeof tx.statementFileName === 'string' ? tx.statementFileName : undefined
      }));

  const budgets = Array.isArray(rawMoney.budgets)
    ? rawMoney.budgets.filter(
        (budget: any): budget is Budget =>
          Boolean(budget?.id && budget?.monthIsoYYYYMM && budget?.category)
      )
    : [];

  const savingsGoals = Array.isArray((rawMoney as any).savingsGoals)
    ? (rawMoney as any).savingsGoals
        .filter((goal: any) => goal?.id && goal?.title)
        .map((goal: any) => ({
          id: goal.id,
          title: goal.title,
          targetCents: typeof goal.targetCents === 'number' ? goal.targetCents : 0,
          savedCents: typeof goal.savedCents === 'number' ? goal.savedCents : 0
        }))
    : [];

  const plannerItems = Array.isArray((rawMoney as any).plannerItems)
    ? (rawMoney as any).plannerItems
        .filter(
          (item: any) =>
            item?.id && item?.description && (item?.kind === 'income' || item?.kind === 'expense')
        )
        .map(
          (item: any): PlannerLineItem => ({
            id: item.id,
            category:
              typeof item.category === 'string'
                ? item.category
                : item.kind === 'income'
                  ? 'Income'
                  : 'Expenses',
            description: item.description,
            kind: item.kind,
            isFixed: item.isFixed !== false,
            monthlyOverrides:
              typeof item.monthlyOverrides === 'object' && item.monthlyOverrides
                ? (Object.fromEntries(
                    Object.entries(item.monthlyOverrides).filter(
                      ([key, value]) => /^\d{4}-\d{2}$/.test(key) && typeof value === 'number'
                    )
                  ) as Record<string, number>)
                : {},
            defaultAmountCents:
              typeof item.defaultAmountCents === 'number' ? item.defaultAmountCents : 0,
            isActive: item.isActive !== false
          })
        )
    : [];

  const plannerOpeningBalance =
    typeof (rawMoney as any).plannerOpeningBalance === 'number'
      ? (rawMoney as any).plannerOpeningBalance
      : 0;

  return {
    bills: bills.map((bill: any) => ({
      ...bill,
      recurrence: bill.recurrence === 'monthly' ? 'monthly' : 'none',
      recurrenceDay:
        typeof bill.recurrenceDay === 'number'
          ? bill.recurrenceDay
          : Number(bill.dueDateIso.slice(8, 10)),
      generatedFromBillId:
        typeof bill.generatedFromBillId === 'string' ? bill.generatedFromBillId : undefined
    })),
    transactions,
    budgets,
    savingsGoals,
    plannerItems,
    plannerOpeningBalance,
    settings: {
      currency: 'ZAR',
      monthlyStartDay:
        typeof rawMoney.settings?.monthlyStartDay === 'number'
          ? rawMoney.settings.monthlyStartDay
          : undefined
    }
  };
};
