# Student Lottery Application Design

This system applies to authentication, administrator views, teacher workspaces, class management, student import, prizes, lotteries, and redemption views. It does not change their data, routes, or permissions. The approved full-app specification is `docs/superpowers/specs/2026-09-29-ui-redesign-design.md`.

## Direction

- Genre: modern-minimal operations workbench. The list is the first-screen priority.
- Structure: desktop workspace sidebar, compact header, page heading, filter or view controls, then a dense semantic table. Narrow screens use a compact top navigation. Row actions open a focused modal; creation and editing both use modal forms.
- Voice: precise administrative labels. No fabricated totals, decorative statistics, hero imagery, or instructional copy.

## Tokens

The Tailwind v4 `@theme` block in `src/app/globals.css` owns the actual token values. Use the workspace token names below instead of scattering raw colors through pages:

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--color-workspace` | `#f6f7f9` |
| Surface | `--color-workspace-surface` | `#ffffff` |
| Primary text | `--color-workspace-ink` | `#20252b` |
| Muted text | `--color-workspace-muted` | `#5e6875` |
| Border | `--color-workspace-line` | `#dde2e8` |
| Primary action | `--color-workspace-accent` | `#0f766e` |
| Action tint | `--color-workspace-accent-soft` | `#e6f3ef` |
| Caution accent | `--color-workspace-warm` | `#f4c46a` |

Use the existing system Chinese sans stack; numerical data is tabular. Spacing follows 4/8 px increments, controls are at least 40 px high, and repeated surfaces have at most a 6 px radius. Motion is limited to focus and hover transitions, with reduced-motion support.

## Shared Behavior

- Tables are scannable at desktop width and become vertically labeled rows at 1024 px and below. Desktop is the primary layout; no page-level horizontal scrolling at 320, 375, 414, or 768 px.
- Creation and editing dialogs use Radix focus management, start at the first field, preserve inline errors, and return focus to the trigger when closed.
- Status combines words with color. Dangerous operations remain behind an explicit confirmation.
- Search, pagination, audit view switching, and correction links retain their URL semantics.
- A class may have zero or one primary management teacher and multiple teaching teachers. Existing assignments migrate as teaching teachers; switching the primary teacher keeps the previous primary assigned as a teaching teacher. Both roles retain the current class access until an explicit permission change is requested.

## Component Ownership

- `src/components/ui/` contains local shadcn/ui-style primitives using installed Radix packages, Tailwind tokens, and Lucide. This is a local-source design system, not a new runtime UI dependency.
- Keep native form submission semantics for input/select/textarea controls; never lose form names, required validation, or hidden request identifiers during styling changes.
- Business wrappers such as ActionForm and CreateDialog retain their existing responsibilities and communicate success explicitly.
- Page composition must preserve access guards, action contracts, filters and cursor URLs. Loading, error and empty states belong alongside the relevant content.
- Keep the live draw controller distinct from ordinary lists: phase, candidates, primary action and confirmed result have separate readable regions, without new lottery logic.

## Browser Verification

`tests/e2e/ui-redesign.spec.ts` captures every page group at 1440, 320, 375, 414, 768 and 1024px using invocation-owned fixtures. It checks page overflow, uncaught errors, accessible control names, images, dialog geometry, Escape and focus restoration. Evidence is written to `test-results/ui-redesign/`. Run through the existing isolated E2E entrypoint, never directly against a development or production database.
