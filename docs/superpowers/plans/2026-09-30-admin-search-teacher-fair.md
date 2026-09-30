# Admin Search and Teacher Fair Implementation Plan

> **For agentic workers:** Implement each task with a failing test first, then the smallest production change. Keep existing routes and authorization.

**Goal:** Filter redemption audit by local date and student identifier/name, retain `winId` correction links, clarify admin search prompts, and restyle the teacher landing page.

**Architecture:** Extend the existing server-side audit query so filtering precedes cursor pagination. Keep the correction lookup independent of the new search fields. Teacher visual work is isolated from admin data work.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Drizzle ORM, Vitest.

**Spec:** User requests in this conversation on September 30, 2026.

## Global Constraints

- Preserve authorization, existing actions, correction flow, and list page size 25.
- Display audit dates in Asia/Shanghai and search that same local calendar day.
- Keep `winId` in links, pagination, and the search form when present; no visible ID lookup field.
- Preserve existing dirty worktree changes.

## Review Focus

- A date near midnight UTC matches the displayed Shanghai day.
- A student keyword matches either number or name without wildcard injection.
- Combined date and keyword filters survive next/previous pagination.
- An invalid date does not crash or silently broaden the result list.
- A `winId` correction target survives filtering even when not among displayed events.

---

### Task 1: Redemption Audit Filtering

**Files:** `src/features/redemptions/service.ts`, `src/features/redemptions/service.int.test.ts`, `src/app/(app)/admin/audit/page.tsx`, `src/app/(app)/admin/audit/page.test.tsx`.

**Interface:** Extend `listRedemptionAudit(cursor?, direction?, filters?: { date?: string; keyword?: string })` without changing its return shape.

- [ ] Add failing service tests for Shanghai calendar boundaries, student name/number matching, wildcard escaping, and cursor navigation with filters.
- [ ] Run focused tests and confirm the new cases fail for the missing filter.
- [ ] Parse and validate the local date, then apply date range and snapshot keyword predicates before cursor pagination.
- [ ] Add failing page test for both filter fields, retained `winId`, and pagination URLs.
- [ ] Render date and keyword inputs in the existing GET form; preserve `winId` as a hidden field and existing lookup card.
- [ ] Re-run focused tests and typecheck.

### Task 2: Admin Search Prompts

**Files:** `src/app/(app)/admin/teachers/TeachersFilters.tsx`, `src/app/(app)/admin/classes/ClassesFilters.tsx`, their page tests.

- [ ] Test that teacher search prompts for teacher name or email and class search prompts for class name.
- [ ] Verify tests fail on the old placeholders.
- [ ] Update only the prompt copy; preserve submitted query and status behavior.
- [ ] Re-run page tests.

### Task 3: Teacher Landing and Back Navigation

**Files:** `src/app/(app)/teacher/page.tsx`, `src/components/class-workspace-nav.tsx`, teacher-specific presentation styles/tests as needed.

- [ ] Test the class back link points to `/teacher` and all teacher class routes remain available.
- [ ] Refine teacher-facing color, shape, hierarchy, and playful detail without losing table readability.
- [ ] Run tests and visually inspect desktop/mobile where authentication permits.
