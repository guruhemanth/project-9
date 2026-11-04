# /security-review

Review the current changes for security problems before calling a milestone done.

1. List changed files and new migrations.
2. Database:
   - Every new table has RLS enabled and policies per role. No `using (true)` on private data.
   - `insert`/`update` policies have `with check`.
   - Users cannot change their own `role`; caterers cannot change their own `status`.
   - `security definer` functions set `search_path` and check `auth.uid()` and role.
   - Booking status cannot be updated directly by clients.
3. Secrets:
   - Search the repo and built frontend output for service role key, Razorpay secret, and
     webhook secret. None may appear. `.env` files are gitignored.
4. Payments:
   - Webhook verifies signature on the raw body, is idempotent, and is the only path to `paid`.
   - Amounts come from the database, not the client.
5. Storage:
   - `caterer-docs` bucket is private; caterers access only their own folder.
6. Inputs:
   - Forms and Edge Functions validate input with zod; no raw SQL string building.
7. Run the RLS and state-machine tests as every role.
8. Report findings as: Critical / Should fix / Nice to have, with file and line references.
   Fix Critical items before finishing.
