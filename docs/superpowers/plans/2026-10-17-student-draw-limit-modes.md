# Student Draw Limit Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the native execution workflow to implement this plan task-by-task.

**Goal:** Add a switch in the “指定学生 · 随机奖品” setup flow so teachers can either assign one draw limit to every selected student or assign a separate draw limit to each student, with the chosen limits enforced throughout the session lifecycle.

**Architecture:** Keep the existing uniform limit behavior as the backward-compatible default. Add a `draw_limit` value to each `session_students` row; uniform sessions continue to store `lottery_sessions.student_draw_limit`, while individual sessions set that column to `NULL` and use each row’s `draw_limit`. The form sends either `perStudentLimit` or one `studentLimit:<studentId>` value per selected student, and the server normalizes both forms into the same validated session configuration.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Vitest, Testing Library.

**Spec:** User request in the current conversation; no separate design document was supplied.

## Global Constraints

- Preserve the existing “指定奖品 · 随机学生” mode and all current uniform-limit callers.
- The server remains authoritative for every student limit; client-side inputs only improve configuration and validation feedback.
- Existing sessions must continue to work after migration, including sessions created before individual limits existed.
- Do not change prize inventory reservation or the server-confirmed winning result flow.
- Keep all limits positive safe integers within the existing PostgreSQL integer range.

## Review Focus

- Switching from uniform to individual mode after students are selected preserves a usable default for every selected student.
- Adding or removing students does not submit stale or missing per-student limits.
- Editing an existing draft restores the saved mode and each student’s saved limit.
- A forged or incomplete form cannot create a session with missing, duplicate, non-positive, or foreign student limits.
- A student with a smaller limit becomes unavailable exactly at that limit while another student with a larger limit can continue.

---

### Task 1: Persist a limit for each session student

**Files:**
- Modify: `src/db/schema.ts:89-99` — add `drawLimit` to `sessionStudents` and enforce positive values.
- Create: `drizzle/0008_add_session_student_draw_limit.sql` — add and backfill the column for existing rows.
- Modify: `drizzle/meta/_journal.json` — register migration 0008 using the repository’s Drizzle journal format.
- Test: `src/db/schema.int.test.ts` — keep foreign-key behavior and add a positive-limit constraint check if the existing integration setup supports it.

**Interfaces:**
- Produces `sessionStudents.drawLimit: number` for all session modes. Mode `student-prize` uses it as the student’s draw cap; mode `prize-student` stores `1` because that mode already limits each student to one win.
- Existing rows are backfilled from `lottery_sessions.student_draw_limit`, with `1` as the safe fallback for fixed-prize rows.

- [ ] **Step 1: Write the failing schema test**

Add an integration assertion that inserting a `session_students` row with `drawLimit: 0` is rejected, while the existing foreign-key test remains valid.

- [ ] **Step 2: Run the focused integration test and verify it fails**

Run `node node_modules/vitest/vitest.mjs run src/db/schema.int.test.ts`.
Expected: the new constraint assertion fails because `drawLimit` does not exist yet.

- [ ] **Step 3: Add the migration and Drizzle schema field**

Add `drawLimit: integer('draw_limit').notNull().default(1)` and a check requiring `draw_limit > 0`. The SQL migration must:

```sql
ALTER TABLE "session_students" ADD COLUMN "draw_limit" integer;
UPDATE "session_students" AS ss
SET "draw_limit" = COALESCE(ls."student_draw_limit", 1)
FROM "lottery_sessions" AS ls
WHERE ls."id" = ss."session_id";
ALTER TABLE "session_students" ALTER COLUMN "draw_limit" SET DEFAULT 1;
ALTER TABLE "session_students" ALTER COLUMN "draw_limit" SET NOT NULL;
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_draw_limit_positive" CHECK ("draw_limit" > 0);
```

Register the migration in `_journal.json` with the next index and current migration timestamp format.

- [ ] **Step 4: Run migration and the focused schema test**

Run `node node_modules/drizzle-kit/bin.cjs migrate`, then `node node_modules/vitest/vitest.mjs run src/db/schema.int.test.ts`.
Expected: migration succeeds and the schema test passes.

### Task 2: Normalize, validate, read, and enforce individual limits

**Files:**
- Modify: `src/features/lotteries/types.ts:1-5` — add `StudentLimit`, optional `limitMode`, and optional `studentLimits` while retaining `perStudentLimit` for existing callers.
- Modify: `src/features/lotteries/actions.ts:15-31` — parse `studentLimitMode` and `studentLimit:<id>` form fields.
- Modify: `src/features/lotteries/sessions.ts:43-74, 126-183, 220-234` — validate exact student-limit coverage, persist row limits, restore draft configuration, and calculate remaining draws from row limits.
- Modify: `src/features/lotteries/rounds.ts:48-55, 96-108, 147-151` — compare usage against the selected student’s own limit in start/stop/next-round checks.
- Modify: `src/app/(app)/classes/[classId]/lotteries/[sessionId]/page.tsx:45-48` — calculate each candidate’s remaining draws from `session.studentLimits`.
- Modify: `tests/e2e/fixtures.ts:88` — seed `drawLimit` explicitly so current mode-one fixtures retain their configured limit.
- Test: `src/features/lotteries/session-setup-form.test.tsx` — add form submission and client validation cases for individual limits.
- Test: `src/features/lotteries/sessions.int.test.ts` — add persistence, draft round-trip, and remaining-count cases.
- Test: `src/features/lotteries/rounds.int.test.ts` — add enforcement proving different students stop at different limits.

**Interfaces:**
- `ModeOneConfig` accepts:

```ts
{
  mode: 'student-prize';
  studentIds: number[];
  prizes: { prizeId: string; quantity: number }[];
  perStudentLimit: number;
  limitMode?: 'uniform' | 'individual';
  studentLimits?: { studentId: number; limit: number }[];
}
```

- Uniform configs normalize to one `{ studentId, limit }` entry per selected student and keep `lottery_sessions.student_draw_limit` populated.
- Individual configs require exactly one unique positive limit entry for every selected student and set `lottery_sessions.student_draw_limit` to `NULL`.
- `readConfig` restores `limitMode: 'uniform'` when the session column is populated and `limitMode: 'individual'` when it is `NULL`; `perStudentLimit` remains the first or maximum row limit for compatibility with existing list views.

- [ ] **Step 1: Add failing domain tests**

Add tests that create an individual mode-one session with limits `{a: 1, b: 3}`, assert `getSession()` returns those limits and `drawsRemaining` equals `4`, and run two successful rounds for `b` while a second round for `a` is rejected.

- [ ] **Step 2: Run the focused domain tests and verify they fail**

Run `node node_modules/vitest/vitest.mjs run src/features/lotteries/sessions.int.test.ts src/features/lotteries/rounds.int.test.ts`.
Expected: TypeScript or assertion failures because the config and persistence path do not support per-student limits.

- [ ] **Step 3: Implement normalization and persistence**

In `sessions.ts`, add a helper that returns the per-student limit list. Validate that individual mode has the same student IDs as `studentIds`, with no duplicates or omissions. In `persist`, delete/reinsert `sessionStudents` with `drawLimit`; preserve the existing session-level limit only for uniform mode. In `readConfig` and `readSession`, select `drawLimit` and calculate remaining draws as the sum of `max(0, drawLimit - usedCount)`.

- [ ] **Step 4: Enforce the selected student’s own limit**

Select `drawLimit` in `studentCandidate`, compare `candidate.usedCount` against `candidate.drawLimit` in `startRound` and `stopRound`, and compare `sessionStudents.drawLimit` in `hasLegalNextRound`.

- [ ] **Step 5: Run focused domain tests and the existing mode-one tests**

Run `node node_modules/vitest/vitest.mjs run src/features/lotteries/sessions.int.test.ts src/features/lotteries/rounds.int.test.ts tests/e2e/mode-one.spec.ts` when the local E2E prerequisites are available.
Expected: all focused integration tests pass, and current uniform-limit behavior remains unchanged.

### Task 3: Add the setup UI switch and per-student controls

**Files:**
- Modify: `src/features/lotteries/lottery-transfer-box.tsx:43-65` — extend `StudentTransferBox` with uniform/individual limit state, switch buttons, a shared `NumberInput`, and per-selected-student `NumberInput` fields.
- Modify: `src/app/(app)/classes/[classId]/lotteries/new/page.tsx:43-56` — pass draft limit mode and saved student limits to `StudentTransferBox`; remove the separate mode-one global limit field because the transfer box owns the controls.
- Modify: `src/features/lotteries/session-setup-form.tsx:21-52` — validate uniform or individual limit inputs before saving.
- Test: `src/features/lotteries/lottery-transfer-box.test.tsx` — cover switching modes, uniform value propagation, per-student fields, and adding a student in individual mode.
- Test: `src/app/(app)/classes/[classId]/lotteries/new/page.test.tsx` — verify draft values are passed into the mode-one UI.

**Interfaces:**
- `StudentTransferBox` receives `initialLimitMode?: 'uniform' | 'individual'`, `initialPerStudentLimit?: number`, and `initialStudentLimits?: Record<number, number>`.
- The rendered form fields are:

```text
studentLimitMode = uniform | individual
perStudentLimit = positive integer                 # uniform mode only
studentLimit:<studentId> = positive integer        # individual mode only
```

- Switching to individual mode copies the current uniform value to every selected student. New students added in individual mode start at `1`.

- [ ] **Step 1: Write failing UI tests**

Add a test that starts with two selected students, clicks “分别设置”, finds `studentLimit:1` and `studentLimit:2`, changes student 1 to `2`, removes student 2, and asserts only student 1’s hidden student ID and limit fields remain. Add a second test that switches back to “统一设置” and asserts only `perStudentLimit` is submitted.

- [ ] **Step 2: Run the focused UI tests and verify they fail**

Run `node node_modules/vitest/vitest.mjs run src/features/lotteries/lottery-transfer-box.test.tsx src/features/lotteries/session-setup-form.test.tsx`.
Expected: the new controls and fields are missing.

- [ ] **Step 3: Implement the UI state and accessible controls**

Use a button group with accessible labels “统一设置” and “分别设置”. Keep the existing transfer/search behavior unchanged. Render `NumberInput` beside each selected student in individual mode and retain hidden `studentIds` fields for server parsing.

- [ ] **Step 4: Add client validation and draft initialization**

In `SessionSetupForm`, read `studentLimitMode`; validate the global field in uniform mode or every selected student field in individual mode. Pass saved draft data from the page using `selected.limitMode`, `selected.perStudentLimit`, and `selected.studentLimits`.

- [ ] **Step 5: Run focused UI tests and the page tests**

Run `node node_modules/vitest/vitest.mjs run src/features/lotteries/lottery-transfer-box.test.tsx src/features/lotteries/session-setup-form.test.tsx "src/app/(app)/classes/[classId]/lotteries/new/page.test.tsx"`.
Expected: all tests pass with both configuration modes covered.

### Task 4: Update list copy and finish verification

**Files:**
- Modify: `src/app/(app)/classes/[classId]/lotteries/page.tsx:35-42` — show “按学生设置抽取次数” for individual sessions and retain the existing “每人最多 N 次” copy for uniform sessions.
- Modify: `src/app/(app)/classes/[classId]/lotteries/page.test.tsx` — add the individual-mode label assertion.
- Modify: `src/app/(app)/classes/[classId]/lotteries/[sessionId]/page.test.tsx` — add a candidate-remaining assertion for different per-student limits if the existing mock can carry `studentLimits`.

**Interfaces:**
- No new server API; this task consumes the `ModeOneConfig` fields produced by Tasks 1–3.

- [ ] **Step 1: Add the failing list/view assertions**

Use a `student-prize` session with `limitMode: 'individual'` and limits `[{ studentId: 1, limit: 1 }, { studentId: 2, limit: 3 }]`; assert the list says “按学生设置抽取次数” and the live page gives student 2 two more available draws after one win while student 1 is exhausted.

- [ ] **Step 2: Run the focused page tests and verify they fail**

Run `node node_modules/vitest/vitest.mjs run "src/app/(app)/classes/[classId]/lotteries/page.test.tsx" "src/app/(app)/classes/[classId]/lotteries/[sessionId]/page.test.tsx"`.
Expected: the new label and per-student remaining assertion fail before implementation.

- [ ] **Step 3: Implement the display changes**

Branch on `item.limitMode === 'individual'` for the list copy and use a `Map` from `session.studentLimits` when constructing live candidate `remaining` values.

- [ ] **Step 4: Run the full verification set**

Run:

```text
node node_modules/vitest/vitest.mjs run
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build --webpack
```

Expected: all tests, lint, and production build pass. Confirm the local dev server still responds with `GET http://localhost:3000/api/health` status 200.

- [ ] **Step 5: Review the diff**

Run `git diff --check` and inspect the final diff for accidental changes outside the lottery setup, persistence, enforcement, migration, and tests listed above.
