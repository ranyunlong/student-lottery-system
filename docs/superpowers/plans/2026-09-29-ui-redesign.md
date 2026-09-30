# Student Lottery UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every user-facing page around a shadcn/ui-style local component system while preserving the existing student lottery application's behavior and URL contracts.

**Architecture:** Keep Next.js App Router, Tailwind CSS v4, Radix primitives, and Lucide. Build a small local UI layer under `src/components/ui`, then migrate the shared shell and route groups to consume it. Domain actions and service code remain unchanged; visual changes are isolated to primitives, shells, page composition, and interaction states.

**Tech Stack:** Next.js 16.3.6, React 19.3, Tailwind CSS 4.3, Radix Dialog/Tabs/Tooltip, Lucide React, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-redesign-design.md`

## Delivery Status

- [x] Task 1: shared primitives and neutral/teal design tokens.
- [x] Task 2: responsive shell, navigation, and authentication.
- [x] Task 3: all administrator pages, dialogs, forms, pager, and teacher picker.
- [x] Task 4: all teacher/class pages and student import, including final mobile fixes.
- [x] Task 5: live lottery workflow, cancellation feedback, and focus restoration.
- [x] Task 6: independent review, 155 unit tests, 9 business E2E tests, 2 responsive E2E tests, typecheck, lint, production build, and local preview.

The detailed steps below retain the original execution plan; current completion evidence is in `docs/superpowers/qa/2026-09-29-ui-redesign-qa.md` and the ignored task reports. Planned commits were deliberately not performed: the checkout contains pre-existing user changes and Git index writes were unavailable. No merge or push was attempted.

## Global Constraints

- Use local shadcn/ui-style source components over the existing Radix primitives; do not add a large runtime UI library.
- Preserve routes, URL search parameters, permissions, service functions, Server Action signatures, audit labels, and data behavior.
- Keep `@import "tailwindcss"` in `src/app/globals.css`.
- Keep controls at least 40px high, radii at 6px/8px or below, and visible `:focus-visible` states.
- No page-level horizontal scrolling at 320, 375, 414, or 768px.
- Status text must accompany color; dangerous operations require explicit confirmation.
- Every task adds or updates focused tests before production changes and runs the covering test first.
- Existing uncommitted changes are user work; do not revert unrelated files or reset the workspace.

## Review Focus

- Existing action forms must retain request-id renewal, confirmation, pending feedback, and URL redirects.
- Dialogs must preserve focus management and reset/feedback behavior after successful creation or editing.
- Tables must remain accessible and readable when converted to labeled mobile rows.
- URL filters, tabs, cursors, and direction parameters must survive visual migration unchanged.
- Lottery start/stop/cancel controls must keep their current authorization and destructive-action semantics.

### Task 1: UI Primitives and Tokens

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/field.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/status-message.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/ui/utils.ts`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Modify: `src/components/ui/button.test.tsx`
- Create or modify: focused tests for dialog/table/field behavior in `src/components/ui/`

**Interfaces:**
- Preserve existing imports and compatible props for current callers.
- Add only the variants and props defined in the spec; use `cn` for class composition.
- Dialog wraps the installed Radix Dialog package; Table renders semantic HTML.

- [ ] Write or update failing component tests for variants, disabled/loading state, invalid field state, semantic dialog parts, and table structure.
- [ ] Run the focused UI tests and confirm they fail for the missing behavior.
- [ ] Implement the token refresh and primitives with accessible states.
- [ ] Run focused tests, then `npm test`.
- [ ] Commit only the task's implementation and tests with `feat(ui): standardize shadcn primitives`.

### Task 2: App Shell, Navigation, and Authentication

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/class-workspace-nav.tsx`
- Modify: `src/app/(app)/layout.tsx` only if shell integration requires it
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/change-password/page.tsx`
- Modify: related existing auth/shell tests only

**Interfaces:**
- Consume Task 1 primitives without changing auth client behavior or redirect destinations.
- Preserve role-dependent navigation and active route semantics.

- [ ] Add or update tests for active navigation, role labels, login errors, disabled submit, and password-change feedback.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Implement the responsive shell, auth forms, and shared navigation states.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`.
- [ ] Commit with `feat(ui): redesign workspace shell and auth screens`.

### Task 3: Administrator Pages

**Files:**
- Modify: `src/app/(app)/admin/teachers/page.tsx`
- Modify: `src/app/(app)/admin/classes/page.tsx`
- Modify: `src/app/(app)/admin/audit/page.tsx`
- Modify: their existing page tests
- Modify: `src/components/create-dialog.tsx`
- Modify: `src/components/action-form.tsx`
- Modify: `src/components/admin-pager.tsx`
- Modify: `src/components/admin-table-row.tsx`
- Modify: `src/components/teacher-picker.tsx`
- Modify: related component tests

**Interfaces:**
- Keep admin service calls, action forms, cursor pagination, search filters, and audit tabs unchanged.
- Use the Task 1 Dialog/Table/Button/Field primitives.

- [ ] Add or update tests for toolbar structure, responsive row labels, dialog submission states, pagination links, and audit tab URL preservation.
- [ ] Run focused tests and confirm failures before implementation.
- [ ] Implement the three admin pages and business wrappers using the shared primitives.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`.
- [ ] Commit with `feat(ui): redesign administrator workbench`.

### Task 4: Teacher and Class Workspace Pages

**Files:**
- Modify: `src/app/(app)/teacher/page.tsx`
- Modify: `src/app/(app)/classes/page.tsx`
- Modify: `src/app/(app)/classes/[classId]/page.tsx`
- Modify: `src/app/(app)/classes/[classId]/students/page.tsx`
- Modify: `src/app/(app)/classes/[classId]/prizes/page.tsx`
- Modify: `src/app/(app)/classes/[classId]/lotteries/page.tsx`
- Modify: `src/app/(app)/classes/[classId]/lotteries/new/page.tsx`
- Modify: `src/app/(app)/classes/[classId]/winnings/page.tsx`
- Modify: existing page and component tests covering these routes

**Interfaces:**
- Preserve `requireTeacherPage`, `requireClassAccess`, all service queries, forms, URL links, and class workspace section keys.
- Use the shared shell, navigation, data surface, field, table, badge, and feedback components.

- [ ] Add or update tests for class navigation, empty lists, action feedback, responsive table rows, and filter/link retention.
- [ ] Run focused tests and confirm failures before implementation.
- [ ] Implement the teacher home and class workspace layouts without changing domain behavior.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`.
- [ ] Commit with `feat(ui): redesign teacher class workspace`.

### Task 5: Lottery Session and Cross-Page Interaction Polish

**Files:**
- Modify: `src/app/(app)/classes/[classId]/lotteries/[sessionId]/page.tsx`
- Modify: `src/features/lotteries/draw-stage.tsx`
- Modify: related lottery/session tests

**Interfaces:**
- Preserve round actions, session configuration, candidate/result data, and destructive confirmations.
- Consume the shared status, button, table, dialog, and skeleton patterns from Tasks 1-4.

- [ ] Add or update tests for phase-specific actions, pending states, result visibility, and error feedback.
- [ ] Run focused tests and confirm failures before implementation.
- [ ] Implement the session page hierarchy and draw-stage feedback states.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`.
- [ ] Commit with `feat(ui): polish lottery session workflow`.

### Task 6: Browser QA and Whole-Branch Verification

**Files:**
- Modify only files required to fix verified visual or test regressions.
- Create: `docs/superpowers/qa/2026-09-29-ui-redesign-qa.md`

- [ ] Start the app with the normal development command and capture representative desktop and mobile screenshots.
- [ ] Run visual lint for overflow, low contrast, tiny text, missing labels, request failures, and console errors.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Run the existing E2E suite when its environment is available.
- [ ] Record viewport coverage, commands, results, and any accepted limitations in the QA report.
- [ ] Commit only verified fixes and QA evidence with `test(ui): verify redesigned application surfaces`.

