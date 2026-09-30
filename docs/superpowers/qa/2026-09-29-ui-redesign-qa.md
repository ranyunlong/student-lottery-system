# UI Redesign QA

Date: 2026-09-29

## Scope

The approved redesign covers local Radix-backed, shadcn/ui-style primitives; shell and authentication; all three administrator pages; teacher/class lists; class overview, students/import, prizes, lottery list/setup/live session, and winnings. Development was split among gpt-6-luna agents, with independent source review and controller-run integration checks.

Existing uncommitted domain, database, dependency, and configuration changes were preserved. Task attribution uses the ignored before-task snapshots rather than assuming every Git working-tree change belongs to this redesign. No commits, merges, or pushes were performed.

## Verification Status

Complete. The final mobile form fixes, interaction targets, spacing adjustment, and strengthened browser audit have been verified. The scoped independent re-review marks both mobile findings addressed with no remaining finding in its scope.

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | 35 files, 155 tests passed |
| Types | `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| Lint | `node node_modules/eslint/bin/eslint.js .` | Passed, no warnings |
| Production build | `node node_modules/next/dist/bin/next build` with a temporary isolated database and process-only auth secret | Passed; three existing emblem filesystem-tracing warnings |
| Business browser regression | `node tests/e2e/run.mjs admin-and-import.spec.ts mode-one.spec.ts mode-two-and-redemption.spec.ts --timeout=60000 --global-timeout=300000` | 9 passed |
| Responsive UI | `node tests/e2e/run.mjs ui-redesign.spec.ts` | 2 passed, including ancestor-clipping and 40px hit-target assertions |
| Preview smoke | Chromium login/logout as both isolated demo roles | Passed; administrator and teacher workspaces load |

Node v24.19.0 and Chromium were used. E2E and build databases were provisioned in the dedicated local PostgreSQL 17 container with invocation markers and restricted runtime roles, then removed after each completed run. No production or user development database was used, and no database credentials were written to reports.

## Visual Coverage

Viewports: 1440, 1024, 768, 414, 375, and 320 pixels wide, 900 pixels high.

The responsive suite produces 96 screenshots: login, change password, teachers, administrator classes, both audit views, teacher home, class list, class overview, students, prizes, lottery list, new lottery, winnings, live session, and the create-teacher dialog at every width. Evidence is under `test-results/ui-redesign/`, with 90 per-page audit JSON files and an additional real-preview prize screenshot. Additional populated winnings, live draw, audit, correction, import, and admin-flow evidence was preserved under `test-results/ui-redesign-business/` so later Playwright runs cannot clear it.

Checks include document overflow, controls clipped by the viewport or overflow ancestors, minimum 40px field/button/selection-label/summary targets, named controls, image alt attributes/loading, uncaught browser errors, dialog bounds, Escape close, and trigger-focus restoration. All 90 audit records contain the enhanced checks and no reported issue. Screenshots were inspected in addition to automatic checks, including the corrected prize inputs and spacing at 320px. Intentional local scrolling in navigation strips is retained; it is not page-level horizontal scrolling.

The text/accent/status palette was checked mathematically: the seven primary foreground/background pairings range from 5.04:1 to 14.40:1. This is a token-level contrast check, not an exhaustive accessibility certification. No hard-coded font size below 12px was found in scoped production JSX/CSS.

## Issues Found During QA

- Fixed Field label/control ID mismatch and added a regression test.
- Fixed role-dependent active navigation so class routes do not activate every admin link.
- Fixed lottery cancellation errors inside the modal and focus return after cancellation/close.
- Migrated the initially incomplete admin and teacher/class page compositions; replaced columnar lists with semantic, mobile-labeled tables.
- Updated obsolete E2E winnings-link text and listitem selectors without removing database, inventory, audit, or cancellation assertions.
- Fixed the 320px stock-adjustment form cropped by its table container. Mobile forms now use the full row width, shrink correctly, and retain spacing between adjustment and archive actions; desktop controls remain compact. The stronger ancestor-clipping audit passes.
- Fixed candidate selection labels and the inventory-history summary below the approved 40px interaction target. The browser hit-target checks pass.
- Excluded generated `.next` and `.next-e2e` directories from Vitest discovery after a build exposed duplicate packaged test files. Source-test coverage and existing integration/E2E exclusions remain unchanged. The normal full unit command passes with build outputs present.

## Limits And Decisions

- The UI library migration is local-source shadcn/ui-style adoption over installed Radix/Tailwind/Lucide, not a new large runtime dependency.
- Audit views remain URL-driven Next links, preserving view/cursor/direction/winId behavior; client-only tabs would change that contract.
- Heavy browser screenshot coverage and business regression run separately to avoid the default combined time budget expiring during cold compilation. All 11 tests remain required.
- Browser verification is Chromium-only. Firefox, WebKit, physical touch devices, and assistive-technology sessions were not run.
- Existing emblem filesystem-tracing build warnings remain outside the UI scope.
- Business E2E logs include expected access-denial checks and deliberately aborted responses. Fast navigation/sign-out also produced server-side closed-stream or session-denied messages; the business assertions passed. This report does not claim a completely silent development server.
- Ignored source snapshots, review reports, and the task ledger are retained because no task commits exist. They preserve attribution and recovery without reverting user work.
- The local preview uses synthetic data in its own marked database because the workspace has no configured `.env`. It must be stopped through its preview helper to clean up that database.

## Local Preview

- Address: `http://127.0.0.1:3000` (loopback only).
- Demo administrator/teacher credentials and sample class/session IDs: `test-results/ui-preview-access.json`. This ignored file contains only synthetic preview accounts, not database credentials or the runtime auth secret.
- Helper: `.superpowers/sdd/2026-09-29-ui-redesign/preview.mjs`, started hidden with `node --import tsx`.
- The existing development server on port 3216 was preserved. The preview uses the existing `.next-e2e` configuration path to avoid sharing its compilation cache.
- Stop before running E2E again, since those runs also use `.next-e2e`. From the repository root in PowerShell: `New-Item -ItemType File -Path test-results/ui-preview.stop`. The helper stops only its owned process tree and removes its marked preview database and role.
- The live preview database intentionally remains available while the preview is running. All completed verification/build databases were cleaned separately.
