# Student Lottery UI Redesign Design

**Date:** 2026-09-29

**Goal:** Rework every user-facing page into one consistent shadcn/ui-style operations workbench while preserving existing routes, permissions, data contracts, and lottery behavior.

## Design Direction

- Use shadcn/ui's local-source component style on top of the existing Radix primitives, Tailwind CSS v4, and Lucide icons.
- Keep the product as a calm, desktop-first school operations workbench rather than a marketing page.
- Use a restrained workspace canvas, white data surfaces, deep ink text, teal primary actions, and explicit success/warning/danger semantics.
- Keep radii at 6px/8px or below, use fine borders and restrained shadows, and avoid gradients, decorative statistics, hero imagery, and nested cards.
- Use a 4/8px spacing rhythm, minimum 40px interactive controls, visible focus rings, and reduced-motion support.

## Scope

### Shared foundation

- Refresh `src/app/globals.css` tokens and base rules without removing the Tailwind import.
- Standardize `Button`, `Input`, `Select`, `Textarea`, `Field`, `Badge`, `StatusMessage`, `Tabs`, `Tooltip`, and `Pager`.
- Add local Radix-backed `Dialog` primitives and a semantic `Table` primitive.
- Add loading/skeleton patterns only where existing server/client flows need pending feedback.
- Keep domain wrappers such as `ActionForm`, `CreateDialog`, `AdminPager`, and `AdminTableRow`, but make them consume the shared primitives.

### Shared shell

- Rework `AppShell` into a desktop sidebar and compact header with responsive navigation.
- Keep administrator navigation, teacher navigation, role labels, sign-out behavior, and active-link semantics.
- Rework `ClassWorkspaceNav` to share the same visual language and remain usable on narrow screens.

### User-facing routes

- Authentication: `/login`, `/change-password`.
- Administrator: `/admin/teachers`, `/admin/classes`, `/admin/audit`.
- Teacher workspace: `/classes`, `/teacher`.
- Class workspace: class overview, students, prizes, lotteries, new lottery, active lottery session, and winnings.

## Behavior Invariants

- Do not change database schemas, service functions, permission checks, action signatures, URL parameter names, pagination semantics, or audit labels.
- Preserve native dialog focus trapping and restore focus to the trigger after close.
- Preserve inline validation and action result messages.
- Keep dangerous operations behind explicit confirmation.
- Keep tables semantically valid on desktop and transform rows into labeled blocks at 1024px and below.
- No page-level horizontal scrolling at 320, 375, 414, or 768px.
- Status text must accompany color so color is never the only signal.

## Component Contracts

### Button

`variant`: `primary | secondary | outline | ghost | danger`; `size`: `sm | md | lg | icon`; supports `loading`, `disabled`, `icon`, and `asChild`. Loading disables the control and exposes a text label plus an accessible busy state.

### Field

Accepts `label`, `description`, `error`, and `required`; associates the control and its helper/error text through stable ids and exposes invalid state through `aria-invalid`.

### Dialog

Expose `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, and `DialogFooter` over Radix Dialog. Content must have a close button with an accessible label, a constrained responsive width, and consistent header/footer spacing.

### Table

Expose semantic table parts. Page-level consumers decide the narrow-screen row layout; the primitive must not hide table content or create page overflow.

## Page Composition

Every data page follows this shape:

1. Page heading and concise context.
2. Filter/action toolbar when needed.
3. Primary data surface.
4. Empty, loading, success, and error states in the same visual language.

Authentication pages use a single focused form surface. Lottery session pages use a stronger status hierarchy for current phase, primary action, candidate/result regions, and destructive actions.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- Existing `npm run test:e2e` coverage remains valid.
- Capture desktop and 320/375/414/768px screenshots for representative auth, admin, teacher, class, and lottery pages.
- Run visual lint and inspect for overflow, text clipping, low contrast, missing labels, and console errors.

## Non-goals

- No new business features.
- No database, authorization, route, or API redesign.
- No migration to Ant Design, Mantine, Bootstrap, or another runtime-heavy UI kit.
- No deletion of existing user-facing flows.
