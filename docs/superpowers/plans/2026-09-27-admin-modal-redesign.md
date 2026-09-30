# Admin Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the three paginated administrator pages as a modern, minimal table workbench with modal creation and editing.

**Architecture:** Preserve the existing cursor queries, administrator checks, and audit content. Add a role to class-teacher membership with a partial unique index for the primary role; current memberships become teaching assignments. The shared `AdminTableRow` renders one summary row and an action slot without a disclosure row. The existing native `CreateDialog` is reused for create and edit form flows; an administrator-only horizontal navigation layout gives tables more usable width.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Vitest, Playwright, PostgreSQL 17.

**Spec:** `design.md`; latest user requirement in this conversation. Scope is the three administrator pages, not the teacher workspace.

## Global Constraints

- Keep server-side limits (20 teachers/classes, 25 audit records), URL cursor/filter semantics, administrator checks, correction capability, and current action confirmations.
- At most one primary management teacher per class; any number of teaching teachers. Both membership roles keep existing class access. Replacing the primary demotes the old primary to teaching. Creating a class does not require an immediate assignment.
- Use existing dependencies; shadcn/ui was offered as an option, not a requirement. Native dialog already supports focus and form feedback.
- Desktop is primary. Keep narrow widths free of horizontal overflow and retain visible keyboard focus.
- Preserve unrelated dirty worktree changes and keep the port 3216 preview server running. Avoid adding fabricated counts or marketing copy.

---

### Task 0: Class teacher roles (6 Luna, isolated backend write scope)

**Files:** Modify `src/db/schema.ts`, `src/features/classes/service.ts`, `src/features/classes/actions.ts`, `src/features/classes/service.int.test.ts`; add the next Drizzle SQL migration and snapshot/journal entries. Do not edit UI, component, shell, or E2E files.

**Interfaces:** `ClassPageItem.members` gains `role: 'primary' | 'teaching'`. `assignTeacher(classId, teacherId)` remains a teaching assignment. Add `setPrimaryTeacher(classId, teacherId)` and `setPrimaryTeacherAction(data)`; add `searchPrimaryTeacherCandidates(classId, search)` and corresponding server action for the picker. Keep `removeTeacher` and class-access membership checks compatible.

- [ ] Test that existing assignments remain teaching after migration, teacher search returns bounded enabled candidates, and paginated class rows expose each member role.
- [ ] Test primary promotion, replacement demoting the previous primary, one-primary database uniqueness under concurrent writes, disabled teacher rejection, and non-admin denial.
- [ ] Add a non-null teaching default and role check plus a partial unique index on `class_id` for `role = 'primary'`; generate migration without dropping existing memberships.
- [ ] Implement transactional primary assignment under the existing class row lock, audit the change as `class.teacher.primary.set`, and preserve current membership-based class access. Run target integration tests, typecheck, and migration verification.

### Task 1: Shared row and dialog behavior (6 Luna)

**Files:** Modify `src/components/admin-table-row.tsx`, `src/components/admin-table-row.test.tsx`, `src/components/create-dialog.tsx`, `src/components/create-dialog.test.tsx`, `src/components/teacher-picker.tsx`, and `src/components/teacher-picker.test.tsx`.

**Interface:** `AdminTableRow({ cells, actions, label })` renders exactly one `<tr>`, with four data cells and one action cell. `CreateDialog({ title, trigger, successMessage, children })` supports edit titles and preserves focus return on close.

- [ ] Change the row test to assert direct actions and one table row; run it and confirm it fails against disclosure behavior.
- [ ] Replace disclosure state and details row with the action slot; keep small-screen full-width summary cells. Run row tests.
- [ ] Test and refine dialog close/focus and success feedback for an edit form. Run dialog tests.
- [ ] Add a picker mode for `primary` versus `teaching`. Primary search uses `searchPrimaryTeacherCandidatesAction`; teaching search keeps `searchAssignableTeachersAction`. Preserve bounded, debounced search and explicit option selection.

### Task 2: Class table and modal management (6 Luna, isolated write scope)

**Files:** Modify only `src/app/(app)/admin/classes/page.tsx` and `src/app/(app)/admin/classes/page.test.tsx`.

**Interface:** Consume Task 1's `AdminTableRow({ cells, actions, label })`, current `CreateDialog`, and Task 0's role-aware `ClassPageItem`, `setPrimaryTeacherAction`, and primary-candidate search. Keep `ActionForm`, page queries and `AdminPager` unchanged.

- [ ] Test the class table's direct edit trigger, dialog title, current name, emblem input, primary/teaching teacher controls, confirmation actions, and create dialog. Verify filter submissions omit cursor.
- [ ] Put class name, emblem update, one primary teacher selector, multiple teaching teacher assignments/removal and archive controls in one focused edit dialog, with semantic grouped headings. The student roster link remains a direct table action. Keep archived class state read-only.
- [ ] Run targeted Vitest, typecheck and target ESLint. Report changed paths and exact results; do not edit shared components or E2E files.

### Task 3: Teacher table (6 Luna)

**Files:** Modify only `src/app/(app)/admin/teachers/page.tsx` and its test.

- [ ] Test direct teacher edit dialog access and preserved search/pager. Run target test to confirm the new dialog assertion fails first.
- [ ] Move profile update, password reset and disable actions into the edit dialog; keep confirmation and success behavior. Make the table identity and status easy to scan.

### Task 4: Workbench shell and audit visuals (6 Luna)

**Files:** Modify `src/components/app-shell.tsx`, `src/app/globals.css`, `src/app/(app)/admin/audit/page.tsx`, `src/app/(app)/admin/audit/page.test.tsx`, and `eslint.config.mjs` if needed to ignore `.next-e2e` generated output. Do not edit teacher/class pages or shared row/dialog/picker components.

- [ ] Give administrators horizontal navigation and a wider content column while preserving teacher workspace layout. Retain `aria-current`, focus and compact control sizing.
- [ ] Refine both audit views to share the workbench's quiet hierarchy, dense table, visible tab state and bounded correction work area. Preserve queries and correction links.
- [ ] Verify target page tests, typecheck, lint, and responsive browser evidence where possible.

### Task 5: End-to-end integration (6 Luna after Tasks 0-4)

**Files:** Modify `tests/e2e/admin-and-import.spec.ts`, `tests/e2e/mode-two-and-redemption.spec.ts` only if interaction assertions need updating. Do not edit implementation files.

- [ ] Update E2E to use edit dialogs for class management, verify primary/teaching roles and dialog focus/close. Keep teacher creation and correction location tests.
- [ ] Inspect desktop and 320/375/414/768 px rendered pages; check overflow, controls, focus, empty states and audit view switching.
- [ ] Run relevant E2E on the isolated database; report exact results and cleanup. The coordinator runs full unit, DB integration, typecheck, lint, build, visual review, and checks port 3216.
