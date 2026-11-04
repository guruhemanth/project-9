---
name: supabase-migration
description: Use when creating or changing database tables, columns, enums, functions, triggers, indexes, storage buckets, or RLS policies for the catering app. Covers migration files and RLS testing.
---

# Supabase Migration

## Goal
Change the database safely, with RLS in place from the first commit of any table.

## Instructions
1. Read `docs/schema.md` first. If the change is not described there, update `docs/schema.md`
   in the same change so it stays the source of truth.
2. Create a new migration with `supabase migration new <short_snake_case_name>`. Never edit a
   migration that has already been applied; add a new one.
3. In the migration, for every new table, in this order:
   - `create table ...` with primary key, foreign keys (with explicit `on delete` behavior),
     `not null` and `check` constraints where the data must be valid.
   - `alter table ... enable row level security;`
   - One policy per role/operation needed, named like `caterers_select_public_approved`.
   - Indexes for foreign keys and common filters.
4. Money columns are `integer` paise. Timestamps are `timestamptz`. IDs are `uuid`.
5. Put role checks in a `security definer` helper (`public.current_role()`) with
   `set search_path = public` to avoid search-path hijacking.
6. Status changes on bookings go through RPC functions, not direct updates. Do not add
   policies that allow clients to update `bookings.status`.
7. Write or update RLS tests in `supabase/tests/` (pgTAP or SQL scripts) that run as each
   role: anon, customer, caterer (own and someone else's), admin. Test allowed AND denied.
8. Apply locally with `supabase db reset` and run the tests. Fix failures before finishing.

## Checklist before finishing
- [ ] RLS enabled on every new table
- [ ] Policies exist for each role that needs access; default is deny
- [ ] No policy uses `using (true)` on a table with private data
- [ ] Policies for `insert` and `update` have `with check`, not only `using`
- [ ] Users cannot change their own `role`, or a caterer's `status`
- [ ] Indexes added for foreign keys
- [ ] `docs/schema.md` updated
- [ ] Tests run as each role and pass

## Do not
- Do not disable RLS "temporarily".
- Do not use the service role key in the frontend or in client-side code paths.
- Do not drop columns or tables on shared environments without asking.
