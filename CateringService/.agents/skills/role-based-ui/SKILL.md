---
name: role-based-ui
description: Use when building or changing frontend screens, routes, navigation, forms, or auth flows for customers, caterers, or admins in the catering app.
---

# Role-Based UI

## Goal
Each role sees only its own screens, the app works well on a phone, and the UI never
relies on hiding things as its only protection (RLS is the real security).

## Structure
- One React + Vite codebase with three route areas:
  - `/` and `/caterers/...` public and customer pages
  - `/caterer/...` caterer dashboard (menus, requests, earnings)
  - `/admin/...` admin panel (verification, bookings, settings)
- Route guards live in `src/lib/auth/` (`RequireAuth`, `RequireRole`). They read the role
  from the `profiles` table, not from user-editable metadata.
- Feature folders: `src/features/<feature>/{components,hooks,api.ts}`.
- Use shadcn/ui components from `src/components/ui/`. Do not hand-roll buttons, dialogs,
  inputs, tables, or toasts if a shadcn component exists.

## Screens by role (MVP)
- Public/Customer: home with city + cuisine search, caterer list, caterer profile with
  packages and reviews, booking request form, my bookings, booking detail with pay button
  (when accepted), review form (when completed).
- Caterer: registration and document upload, pending/approved/rejected banner, packages and
  add-ons CRUD, incoming requests with accept/reject, bookings list, mark completed, earnings.
- Admin: pending caterers queue with documents viewer, approve/reject with reason, all
  bookings, commission setting.

## Conventions
- Mobile-first. Design for 360px width, then scale up. Tap targets at least 44px.
- Every data screen handles loading (skeleton), empty (helpful message and next action), and
  error (message and retry) states.
- Forms: react-hook-form + zod. Show field-level errors. Disable submit while pending.
- Display money with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
  from paise values. Dates in `en-IN` and Asia/Kolkata.
- Status badges use one shared component with consistent colors per booking and caterer
  status.
- Keep copy simple; customers may not be technical. Support English first; keep strings in
  one place to allow Telugu later.
- Set up PWA basics (manifest, icons, service worker) in Milestone 7, not earlier.

## Checklist before finishing
- [ ] Visiting another role's URL redirects away (test all three roles)
- [ ] Logged-out users cannot see private pages
- [ ] Loading, empty, error states present
- [ ] Works at 360px width without horizontal scroll
- [ ] No service role key or secrets referenced in frontend code
- [ ] Lint, typecheck pass
