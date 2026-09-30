# Admin Brand Refresh Implementation Plan

> **For agentic workers:** Use focused test-first cycles; preserve action, URL and form contracts. Steps use checkbox tracking.

**Goal:** Refresh the admin shell, teachers, classes and audit views with restrained warm-orange branding without changing behavior.

**Architecture:** Tailwind v4 CSS tokens in globals.css are shared by teacher and admin; a full tailwind.config.ts extension is loaded through @config. Existing local Radix/shadcn-style primitives are styled in place, with Card/Separator added. Native forms and URL-backed tabs stay intact.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Radix, Vitest.

**Spec:** The user's September 30 admin UI brief and design.md; this supersedes the older teal visual direction only.

## Global Constraints

- Preserve copy, routes, guards, query parameters, actions, form names, validation, pagination and conditional rendering.
- Shared #FF6B35, #4ECDC4, #FFE66D and warm neutrals; admin density scoped to data-workspace-role=admin.
- Preserve native Select semantics, existing component APIs and unrelated dirty changes; no backend/schema edits.
- No confetti, bounce, glow or decorative dashboard content; respect reduced motion.

## Component Mapping and Priority

| Priority | Existing | Target | Owner |
| --- | --- | --- | --- |
| P0 | teal tokens/primitives | warm theme, brand Button, Card, Dialog, Badge, Tabs, Table, fields | A |
| P1 | shell, pager, dialog trigger | orange logo/active nav, outline pager, brand trigger | B |
| P1 | teacher/class lists/edit | refined filters, tables, scrollable editor, danger panel | C |
| P1 | audit views | search/table cards, restrained URL tabs | D |
| P2 | QA | tests, type/lint/build, desktop/mobile screenshots | coordinator |

## Review Focus

1. Clearing search resets status dropdown: test both filters.
2. Dialog focus, Escape, errors and form payloads remain: test both forms.
3. Audit tabs retain view/cursor URL semantics: assert hrefs and pager.
4. Narrow tables/dialogs have no page overflow at 375 px: inspect screenshots.
5. Reduced motion suppresses dialog/tab/route animation: inspect CSS/browser.

### Task 1: Shared theme and UI primitives

**Files:** Modify src/app/globals.css, src/components/ui/button,badge,dialog,tabs,table,input,select,textarea,field and focused tests; create tailwind.config.ts and src/components/ui/card,separator.

**Interfaces:** Preserve existing props/exports; add Button variants brand/destructive retaining primary/danger; add Badge info; export Card, CardHeader, CardTitle, CardContent, CardFooter, Separator. Field ARIA and native Select remain.

- [x] Add focused failing variant/Card/Separator/form-semantic tests; confirm red.
- [x] Implement root HSL variables, @theme workspace aliases, @config, full brand 50-900/accent/highlight, radius/soft shadow/font/fade-slide tokens.
- [x] Restyle primitive classes preserving refs/ARIA/behavior; guard reduced motion.
- [x] Run focused tests, typecheck and lint.

### Task 2: Shared shell and chrome

**Files:** Modify src/components/app-shell,admin-pager,create-dialog and respective tests.

**Interfaces:** Use Task 1 Button/Dialog; preserve all existing component props/callbacks.

- [x] Add failing presentation tests for active nav, sign-out and pager variants.
- [x] Add role data attribute and restyle logo, nav, dialog trigger and pager without behavior changes.
- [x] Run component tests and typecheck.

### Task 3: Teacher and class screens

**Files:** Modify admin/teachers/page,TeachersFilters; admin/classes/page,ClassesFilters,ClassEditForm and their tests.

**Interfaces:** Use Task 1 Card/Button/Badge/native Select and unchanged CreateDialog/AdminPager; no action/service edits.

- [x] Add failing assertions for Card/table structure, dialogs, filters and hidden action fields.
- [x] Restyle headings, filters, tables, editor and archive panel; preserve copy, fields, handlers and links; no nested Cards.
- [x] Run page tests and typecheck.

### Task 4: Audit views

**Files:** Modify admin/audit/page.tsx and page.test.tsx only.

**Interfaces:** Use Task 1 Card/Button; preserve URL tabs, winId lookup, correction and pager props.

- [x] Add failing assertions for both views, URL tabs, search tool and correction action.
- [x] Restyle search/correction tools, tables, tabs and links; preserve conditions and mobile labels.
- [x] Run audit tests and typecheck.

### Task 5: Integration

- [x] Review disjoint patches; run typecheck, lint, focused tests and build.
- [x] Capture 1366x768 and 375x812 screenshots for all admin views/dialogs; inspect overflow, contrast and motion without mutating preview data.
- [x] Report mapping, before/after per screen and acceptance checklist, linking to complete source files.

## Acceptance, September 30, 2026

- Focused UI/admin Vitest: 48/48 passed; TypeScript and full ESLint passed.
- Production webpack build passed with process-scoped disposable test database URL. Turbopack build remains blocked by its local pooled-process access denial, not by a code diagnostic.
- Isolated Chromium: administrator and teacher UI suites both passed; admin screenshots cover 320, 375, 414, 768, 1024 and 1440 px, plus the class edit dialog at 375 and 1366 px. Save/archive buttons are reachable by scrolling.
- The supplied HSL `25 100% 60%` is not the same color as `#FF6B35`; semantic `--primary` uses the matching hue of approximately 16 degrees so visual brand color is accurate.
