# /new-milestone

Start the next milestone from SPEC.md. Argument: milestone number (e.g. `/new-milestone 3`).

1. Read `AGENTS.md`, `SPEC.md`, and `docs/schema.md`.
2. Find the milestone in the SPEC.md table and restate its goal and "done when" criteria.
3. Check that earlier milestones are finished (tests pass, nothing half-built). If not, stop
   and tell the user what is missing.
4. Write a short plan: files to create or change, tables and policies affected, skills to
   use from `.agents/skills/`, and anything that needs a decision from the user.
5. Wait for the user to confirm or adjust the plan.
6. Implement in small steps. After each step, run lint, typecheck, and relevant tests.
7. When done, run `/security-review`, then give a summary: what changed, how to try it,
   test results, and open questions. Do not start the next milestone.
