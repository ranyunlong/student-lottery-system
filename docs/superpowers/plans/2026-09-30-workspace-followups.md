# Workspace Follow-ups Implementation Plan

> **For agentic workers:** Work within the assigned, disjoint file scope. Test each behavior before implementing it.

**Goal:** Add student-specific pending prizes, improve inventory and redemption interactions, and make lottery and class records easier to find.

**Architecture:** Reuse the existing class-scoped pages and Radix Dialog components. Link student rows to the winnings page with `studentId`; the winnings page filters only its authorized class records. Persist optional session titles through the existing session lifecycle and migration path.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle, Radix UI, Vitest, Playwright.

**Spec:** User requests in this conversation, September 30, 2026.

## Tasks

- [x] Student rows: add a contextual pending-prizes link to `/classes/{classId}/winnings?studentId={id}`; test the target and row label in `src/components/student-import.test.tsx`.
- [x] Winnings: accept the exact student filter, add name/number search for pending records, and replace redemption `window.confirm` with Radix Dialog; test filtering, empty and confirmation states.
- [x] Prizes: move stock adjustment into a form Dialog, preserving existing validation, action feedback and inventory history; test open, submit and close behavior.
- [x] Lottery sessions: add optional title through create/edit, storage and display; provide a list-row route to view a session's winning records, including completed sessions; test persistence and navigation.
- [x] Teacher workspace and shell: search classes by name and clear back to all; show name over role in the header with no email; test responsive layout.
- [ ] Integration: relevant tests, database tests, typecheck and lint passed; browser desktop/mobile inspection remains blocked by the unavailable browser connection. Preserve unrelated working-tree changes.
