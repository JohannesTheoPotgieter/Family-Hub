// Family-Hub database schema — Phase 0.1 + 0.11.
//
// These TypeScript row types are the canonical description of every table.
// They are intentionally Drizzle-shaped so swapping in `drizzle-orm` later is
// a 1:1 transform: each `<Name>Row` type becomes the inferred type of a
// `pgTable('<name>', { ... })` declaration. Until then this file plus
// `migrations/0001_init.sql` is the schema's source of truth.
//
// Conventions:
// - All ids are UUID v4 strings.
// - All money is integer cents in the row's currency.
// - `*_at` columns are ISO-8601 strings on the wire; `timestamptz` in Postgres.
// - Every tenant table carries `family_id` and is governed by RLS.

export type Uuid = string;
export type IsoTimestamp = string;
export type IsoDate = string;
export type CurrencyCode = 'ZAR' | 'USD' | 'EUR' | 'GBP';

// --- Identity & tenancy --------------------------------------------------

export type Locale = 'ZA' | 'GLOBAL';

export type FamiliesRow = {
  id: Uuid;
  name: string;
  ownerUserId: Uuid;
  locale: Locale;
  province: string | null;
  loadsheddingAreaCode: string | null;
  taxYearStartMonth: number; // 3 for ZA, 1 for most others
  plan: 'free' | 'family' | 'family_pro';
  trialEndsAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
};

export type FamilyRoleKey = 'parent_admin' | 'adult_editor' | 'child_limited';

export type FamilyMembersRow = {
  id: Uuid;
  familyId: Uuid;
  userId: Uuid; // links to Clerk user; nullable until invite accepted
  displayName: string;
  roleKey: FamilyRoleKey;
  status: 'active' | 'pending' | 'removed';
  avatarKey: string | null;
  pinHash: string | null; // in-family quick-switch second factor
  createdAt: IsoTimestamp;
};

export type InvitesRow = {
  id: Uuid;
  familyId: Uuid;
  email: string;
  roleKey: FamilyRoleKey;
  tokenHash: string;
  invitedByMemberId: Uuid;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: IsoTimestamp;
  createdAt: IsoTimestamp;
  acceptedAt: IsoTimestamp | null;
};

export type SubscriptionsRow = {
  id: Uuid;
  familyId: Uuid;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: 'free' | 'family' | 'family_pro';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: IsoTimestamp | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: IsoTimestamp;
};

export type AuditLogRow = {
  id: Uuid;
  familyId: Uuid;
  actorMemberId: Uuid | null;
  action: string; // e.g. 'proposal.applied', 'bill.paid', 'member.invited'
  entityKind: string;
  entityId: Uuid | null;
  diff: unknown; // JSONB
  createdAt: IsoTimestamp;
};

// --- Calendar ------------------------------------------------------------

export type CalendarProvider = 'google' | 'microsoft' | 'caldav' | 'ics';

export type CalendarConnectionsRow = {
  id: Uuid;
  familyId: Uuid;
  memberId: Uuid;
  provider: CalendarProvider;
  accountLabel: string | null;
  tokensEncrypted: Uint8Array | null; // AES-GCM ciphertext, see server/security.mjs
  lastSyncedAt: IsoTimestamp | null;
  syncWatchChannelId: string | null;
  createdAt: IsoTimestamp;
};

export type InternalEventsRow = {
  id: Uuid;
  familyId: Uuid;
  calendarConnectionId: Uuid | null; // null = native Family-Hub event
  externalId: string | null; // provider-side id when synced out
  title: string;
  description: string | null;
  location: string | null;
  startsAt: IsoTimestamp;
  endsAt: IsoTimestamp;
  allDay: boolean;
  rruleText: string | null;
  recurrenceParentId: Uuid | null;
  etag: string | null;
  lastModifiedRemote: IsoTimestamp | null;
  threadId: Uuid | null; // see threads table; lazy-created on first open
  createdByMemberId: Uuid | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type EventAttendeesRow = {
  eventId: Uuid;
  memberId: Uuid;
  rsvp: 'pending' | 'yes' | 'no' | 'maybe';
  isOrganizer: boolean;
};

// --- Tasks ---------------------------------------------------------------

export type TaskListsRow = {
  id: Uuid;
  familyId: Uuid;
  name: string;
  ordinal: number;
  createdAt: IsoTimestamp;
};

export type TasksRow = {
  id: Uuid;
  familyId: Uuid;
  listId: Uuid | null;
  parentTaskId: Uuid | null;
  title: string;
  notes: string | null;
  ownerMemberId: Uuid;
  shared: boolean;
  dueDate: IsoDate | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'custom';
  rruleText: string | null;
  priority: 'low' | 'normal' | 'high';
  rewardPoints: number;
  completed: boolean;
  completionCount: number;
  lastCompletedAt: IsoTimestamp | null;
  archived: boolean;
  threadId: Uuid | null;
  createdAt: IsoTimestamp;
};

export type TaskCompletionsRow = {
  id: Uuid;
  taskId: Uuid;
  memberId: Uuid;
  completedAt: IsoTimestamp;
};

// --- Money ---------------------------------------------------------------

export type BillsRow = {
  id: Uuid;
  familyId: Uuid;
  title: string;
  amountCents: number;
  currency: CurrencyCode;
  dueDate: IsoDate;
  category: string;
  paid: boolean;
  paidDate: IsoDate | null;
  proofFileKey: string | null;
  notes: string | null;
  recurrence: 'none' | 'monthly';
  recurrenceDay: number | null;
  generatedFromBillId: Uuid | null;
  autoCreateTransaction: boolean;
  linkedTransactionId: Uuid | null;
  threadId: Uuid | null;
  createdAt: IsoTimestamp;
};

export type TransactionsRow = {
  id: Uuid;
  familyId: Uuid;
  title: string;
  amountCents: number;
  currency: CurrencyCode;
  txDate: IsoDate;
  kind: 'inflow' | 'outflow';
  category: string;
  notes: string | null;
  source: 'manual' | 'bill' | 'statement' | 'bank_link';
  sourceBillId: Uuid | null;
  statementImportId: Uuid | null;
  statementFileName: string | null;
  bankAccountId: Uuid | null;
  threadId: Uuid | null;
  createdAt: IsoTimestamp;
};

export type BudgetsRow = {
  id: Uuid;
  familyId: Uuid;
  monthIso: string; // YYYY-MM
  category: string;
  limitCents: number;
  currency: CurrencyCode;
  threadId: Uuid | null;
};

export type SavingsGoalsRow = {
  id: Uuid;
  familyId: Uuid;
  title: string;
  targetCents: number;
  savedCents: number;
  currency: CurrencyCode;
  targetDate: IsoDate | null;
  threadId: Uuid | null;
  createdAt: IsoTimestamp;
};

export type PlannerItemsRow = {
  id: Uuid;
  familyId: Uuid;
  category: string;
  description: string;
  kind: 'income' | 'expense';
  isFixed: boolean;
  monthlyOverrides: Record<string, number>; // YYYY-MM → cents
  defaultAmountCents: number;
  currency: CurrencyCode;
  isActive: boolean;
};

export type DebtsRow = {
  id: Uuid;
  familyId: Uuid;
  title: string;
  principalCents: number;
  aprBps: number; // basis points (e.g. 14.5% APR = 1450)
  minPaymentCents: number;
  currency: CurrencyCode;
  strategy: 'avalanche' | 'snowball';
  paidOff: boolean;
  threadId: Uuid | null;
  createdAt: IsoTimestamp;
};

export type BankAccountsRow = {
  id: Uuid;
  familyId: Uuid;
  provider: 'stitch' | 'plaid' | 'truelayer' | 'manual';
  externalAccountId: string | null;
  accountLabel: string;
  currency: CurrencyCode;
  lastBalanceCents: number | null;
  lastSyncedAt: IsoTimestamp | null;
  tokensEncrypted: Uint8Array | null;
};

// --- Connective Chat (Phase 0.11 — schema lands now, UI in Phase 3) ------

export type ThreadKind = 'family' | 'direct' | 'object';
export type EntityKind =
  | 'event'
  | 'task'
  | 'bill'
  | 'transaction'
  | 'budget'
  | 'savings_goal'
  | 'debt';

export type ThreadsRow = {
  id: Uuid;
  familyId: Uuid;
  kind: ThreadKind;
  // For 'object' threads: the entity this thread is attached to.
  entityKind: EntityKind | null;
  entityId: Uuid | null;
  // For 'direct' threads: sorted member ids encoded into a unique tuple.
  directMemberA: Uuid | null;
  directMemberB: Uuid | null;
  // E2E only on family + direct. Object threads stay server-readable so the
  // AI parse + activity-card writers can read context.
  e2eEncrypted: boolean;
  createdAt: IsoTimestamp;
};

export type MessageKind = 'text' | 'activity' | 'proposal';

export type MessagesRow = {
  id: Uuid;
  familyId: Uuid;
  threadId: Uuid;
  authorMemberId: Uuid | null; // null for system-generated activity cards
  kind: MessageKind;
  // Exactly one of bodyText / bodyCiphertext is set, depending on
  // threads.e2eEncrypted. See connective-chat privacy posture in the plan.
  bodyText: string | null;
  bodyCiphertext: Uint8Array | null;
  proposalId: Uuid | null;
  attachments: unknown; // JSONB array of { kind, key, mime, ... }
  createdAt: IsoTimestamp;
};

export type ProposalKind =
  // calendar
  | 'event_move'
  | 'event_reschedule'
  | 'event_attendee_change'
  | 'event_cancel'
  // tasks
  | 'task_assignee_swap'
  | 'task_reschedule_due'
  | 'task_split'
  | 'task_trade_for_reward'
  // money
  | 'budget_category_shift'
  | 'bill_extra_payment'
  | 'debt_acceleration'
  | 'goal_contribution'
  | 'goal_create'
  | 'income_one_off'
  | 'expense_one_off';

export type ProposalStatus = 'open' | 'applied' | 'declined' | 'expired' | 'countered';

export type ProposalsRow = {
  id: Uuid;
  familyId: Uuid;
  threadId: Uuid;
  proposedByMemberId: Uuid;
  proposalKind: ProposalKind;
  entityKind: EntityKind;
  entityId: Uuid;
  // Typed diff payload validated by `src/domain/proposals.ts`.
  change: unknown; // JSONB
  // Snapshot of the entity at proposal time, used to detect conflicts on apply.
  entitySnapshot: unknown; // JSONB
  requiredApprovers: Uuid[];
  approvals: Record<Uuid, 'agree' | 'decline' | 'pending'>;
  status: ProposalStatus;
  appliedAt: IsoTimestamp | null;
  expiresAt: IsoTimestamp;
  counteredByProposalId: Uuid | null;
  createdAt: IsoTimestamp;
};

// --- Schema metadata ----------------------------------------------------

export const SCHEMA_VERSION = 2 as const;

// Tables that carry `family_id` directly and live under RLS. Used by tenancy
// assertions (src/test/migrations.test.mjs) so the list stays in sync with
// 0002_rls.sql.
//
// `event_attendees` and `task_completions` are also tenant-scoped but reach
// the family via their parent (internal_events / tasks) — they have their
// own join-through policies in 0002_rls.sql, listed in JOIN_SCOPED_TABLES.
export const TENANT_TABLES = [
  'family_members',
  'invites',
  'subscriptions',
  'audit_log',
  'calendar_connections',
  'internal_events',
  'task_lists',
  'tasks',
  'bills',
  'bank_accounts',
  'transactions',
  'budgets',
  'savings_goals',
  'planner_items',
  'debts',
  'threads',
  'proposals',
  'messages'
] as const;

export const JOIN_SCOPED_TABLES = ['event_attendees', 'task_completions'] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];
export type JoinScopedTable = (typeof JOIN_SCOPED_TABLES)[number];
