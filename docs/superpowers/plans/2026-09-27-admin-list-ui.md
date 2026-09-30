# Admin List UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the paginated teacher, class, and audit pages a coherent, usable administration workbench on desktop and narrow screens.

**Architecture:** Preserve the existing server-rendered cursor queries and server actions. Use semantic tables with stacked mobile rows, creation dialogs, and focused row-management panels. The audit page is an independent implementation slice so it can be delegated while teacher/class polish proceeds locally.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, Vitest, Playwright, PostgreSQL 17.

**Spec:** `design.md` and the pagination/design requirements in this conversation.

## Global Constraints

- Preserve administrator checks, action behavior, correction links, URL pagination, and query limits: 20 teachers/classes, 25 audit events.
- No totals, invented metrics, unrelated page redesign, or new frontend dependencies.
- Use current `workspace` tokens and restrained workbench presentation. Tables remain first-screen content; creation stays in dialogs.
- At 320, 375, 414, and 768 px, avoid page-level horizontal scrolling and two-line primary navigation/actions. Maintain keyboard focus, labels, empty states, and visible status text.
- Preserve the dirty worktree's existing changes; do not revert or commit unrelated work. Keep the preview server on port 3216 running.

---

### Task 1: Audit views (6 Luna, isolated write scope)

**Files:** Modify `src/app/(app)/admin/audit/page.tsx`; test `src/app/(app)/admin/audit/page.test.tsx`. Do not modify teacher/class pages, shared CSS, components, data services, or E2E files.

**Interfaces:** Keep `AuditPage({ searchParams })`, `listAdminAuditPage`, `listRedemptionAudit`, `findRedeemedWinForCorrection`, and `AdminPager` unchanged. The two URL views are `redemptions` and `management`.

- [ ] Add a failing page test for the intended scannable audit structure: current tab indication, table headers, human-readable status, correction locator and links, and empty states for each view. Use the existing mocks in `page.test.tsx` and `npm test -- 'src/app/(app)/admin/audit/page.test.tsx'`.
- [ ] Refine the page with clear tab selection, quiet table headers, readable event hierarchy, and a compact correction work area. Long IDs and reasons must wrap in mobile value cells; do not hide audit detail or change queries.
- [ ] Run the target test, `npm run typecheck`, and target ESLint. Inspect narrow-screen layout through existing E2E or browser evidence where practical; report exactly what was verified.

### Task 2: Teacher and class hierarchy (local write scope)

**Files:** Modify `src/app/(app)/admin/teachers/page.tsx`, `src/app/(app)/admin/classes/page.tsx`, their page tests, and narrowly scoped `src/app/globals.css` rules only if repeated styling needs them.

**Interfaces:** Keep current search parameters, 20-row page results, `CreateDialog`, `AdminTableRow`, `TeacherPicker`, and server actions unchanged.

- [ ] Add focused assertions for the table header/summary, creation dialog trigger, and expanded management content to page tests; run both target tests and observe failures for missing presentation semantics.
- [ ] Make primary identity and status easier to scan, reduce the tall class detail panel with grouped fields and action placement, and retain all operations. Avoid nested cards and decorative metrics.
- [ ] Run target unit tests and inspect desktop and 320/375/414/768 px screenshots for text fit, focus, controls, and horizontal overflow; iterate on any failed checks.

### Task 3: Flow and regression verification (local write scope)

**Files:** Modify `tests/e2e/admin-and-import.spec.ts` only if assertions need to track the revised accessible structure; preserve isolated E2E database lifecycle. The preview/E2E build-directory collision requires `next.config.ts` to use `.next-e2e` only when `E2E_RUN_DATABASE_NAME` is set, plus a `.gitignore` entry.

- [ ] Verify teacher/class create and manage flow, search/filter reset, audit view navigation, correction locator, and pagination using the existing E2E harness. Ensure the test database is removed by the runner on exit.
- [ ] Run `npm run typecheck`, `npm test`, `npm run test:db`, `npm run lint`, `npm run build`, and relevant E2E tests. Record each result and any environment-only limitation.
- [ ] Inspect desktop/mobile screenshots, review `git diff --check` and the final diff, and leave port 3216 available for preview.
