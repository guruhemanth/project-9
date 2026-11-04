# CaterConnect (working name) - Agent Rules

Two-sided catering marketplace for India (launch city: Tirupati). Caterers register and
get admin-verified before they can accept bookings. Customers browse and book.
Read `SPEC.md` for scope and `docs/schema.md` for the data model before writing code.

## Stack (do not change without asking)
- Frontend: React + Vite + TypeScript, Tailwind, shadcn/ui, React Router. Mobile-first PWA.
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions). No separate API server.
- Payments: Razorpay (INR; UPI + cards). Orders and webhooks handled in Edge Functions only.
- Package manager: pnpm. Node 20+.

## Roles
`customer`, `caterer`, `admin`. Stored in `profiles.role`. Never trust a role sent from
the client; derive it from the database.

## Non-negotiables
1. **RLS on every table**, in the same migration that creates it. No table ships without it.
2. **No secrets in the client.** Only the Supabase anon key and Razorpay key id may be in
   frontend code. Service role key, Razorpay secret, webhook secret live in Edge Function env.
3. **Payment truth comes from the Razorpay webhook**, verified by signature. Never mark a
   booking paid because the browser said so.
4. **Booking status changes follow the state machine** in SPEC.md. Enforce transitions in
   the database (trigger or RPC), not only in the UI.
5. **A caterer is invisible to customers until `caterers.status = 'approved'`.**
6. Money is stored as integer paise, never floats. Display in INR with `Intl.NumberFormat`.
7. Never delete data destructively in migrations on shared environments without asking.

## Working style
- Work on **one milestone at a time** (see SPEC.md). Stop and summarize when it is done,
  then wait for confirmation before starting the next.
- Before coding a milestone, state the plan in a few lines: files to touch, tables affected.
- Prefer small, reviewable changes. Do not refactor unrelated code.
- Ask before adding a new dependency, and say why it is needed.
- Use the skills in `.agents/skills/` for migrations, Razorpay, role-based UI, and the
  booking state machine. Use the workflows in `.agents/workflows/` for milestone start and
  security review.

## Code conventions
- TypeScript strict mode. No `any` unless commented with a reason.
- Folder layout: `src/features/<feature>/` (components, hooks, api), `src/components/ui/`
  for shadcn, `src/lib/` for shared helpers, `supabase/migrations/`, `supabase/functions/`.
- Data access through small typed functions in `src/features/*/api.ts`, not inline in components.
- Validate forms with zod. Validate Edge Function inputs with zod too.
- Handle loading, empty, and error states on every data-driven screen.

## Testing
- Every RLS policy gets a test that runs as each role (customer, caterer, admin, anon) and
  checks both allowed and denied access.
- Every allowed and disallowed booking transition gets a test.
- Run lint, typecheck, and tests before declaring a milestone done.

## India specifics
- Currency INR, timezone Asia/Kolkata, phone numbers in +91 format.
- Caterers need an FSSAI number; GST number is optional at signup but stored if given.
- Cancellation and refund rules are in SPEC.md. Do not invent new ones.

## Out of scope for now
Real-time availability calendar, in-app chat, recurring corporate orders, multi-location
caterers, native mobile apps. Do not build these unless asked.

## When unsure
Ask. A short question is cheaper than a wrong migration.
