# server/db — Phase 0 schema foundation

This folder establishes the database shape for Family-Hub's multi-tenant SaaS
foundation (plan Phase 0.1 + 0.11). Two things live here:

1. **`schema.ts`** — TypeScript row types + a runtime descriptor map. These are
   the source of truth for column names, types, and nullability. They are
   Drizzle-shaped so the migration to `drizzle-orm` is a 1:1 swap when the
   Postgres instance is provisioned.
2. **`migrations/0001_init.sql`** — concrete SQL `CREATE TABLE` statements,
   reviewable in the PR diff. These are what an operator runs against Neon
   when bringing the database online.

Why no `drizzle-orm` dep yet: provisioning Postgres + introducing an ORM at
the same time as schema design conflates two concerns. Land the schema first,
get review on the shape, then wire Drizzle in a follow-up where the diff is
purely "swap row types for drizzle table builders."

## Multi-tenancy invariant

Every tenant table carries `family_id uuid not null references families(id)`.
Row Level Security policies (out-of-scope for this PR; tracked under Phase 0.5)
will enforce `family_id = current_setting('app.current_family_id')::uuid`.
The application sets that GUC at the start of every request inside the
authorization middleware.

## Connective Chat tables

`threads`, `messages`, `proposals` ship in the foundation migration even
though the chat UI is Phase 3. The data model has to be right from day one
so Phases 1/2/4 can attach proposal hooks to events / tasks / money entities
as those phases land.
