# Student Lottery System Design

Date: 2026-09-25
Status: Pending user review

## Goal and Scope

Build a Chinese-language, teacher-operated student lottery system for multiple teachers and classes. An administrator creates teacher accounts and assigns teachers to classes. Each class owns its roster, emblem, prizes, inventory, lottery sessions, winning history, and redemption history. Students never log in. The first release runs on a public server using Docker Compose as a single Next.js application with PostgreSQL.

## Roles and Access

- Administrator: create, disable, and reset teacher accounts; create and archive classes; assign and remove class teachers; access class administration and audit records.
- Teacher: sign in, change their password, and manage only assigned classes and their students, prizes, sessions, winning records, and redemptions.
- No public registration or student accounts. Removing an assignment revokes class access immediately. Every server-side read and write verifies the role and class membership.
- Create the initial administrator with a one-time deployment command, using credentials supplied through the environment rather than committed to source control.

## Data and Lifecycle

- `users`: authentication identity, administrator/teacher role, active state, password-change requirement.
- `classes`: name, emblem path, archived state. `class_teachers` joins teachers to classes with a unique `(class_id, teacher_id)` pair.
- `students`: database-generated increasing ID; class ID; student number stored as text to preserve leading zeroes; name; gender; archived state. `(class_id, student_number)` is unique. Historical winnings retain student name and number snapshots.
- `prizes`: class ID, name, current stock, archived state. An append-only stock ledger records delta, reason, operator, timestamp, and optional winning-record reference. Stock never becomes negative.
- `lottery_sessions`: class ID, mode, status (`draft`, `active`, `completed`), configuration, creator, and timestamps. Candidate rows capture selected students and, for mode one, prizes and per-session quantity caps. Configuration is editable in draft and fixed once active.
- `lottery_rounds`: unique start token, chosen student for mode one if applicable, status, and the starting/stopping teachers. At most one round per session is active.
- `winning_records`: immutable session/round outcome, student and prize snapshots, operator and timestamp, plus pending/redeemed state. Redemption records the teacher and timestamp. Corrections are audited, not silently rewritten.
- Archived students, prizes, and classes remain in historical records. Referenced records cannot be hard-deleted through the application.

## Student Import

- Accept `.xlsx` and pasted rows. Template columns are `学号`, `姓名`, `性别` in that order. Pasted text has one student per line with tab-separated columns, as copied from a spreadsheet. The generated database ID is never imported.
- Accept `男`, `女`, or empty gender (stored as unspecified). Require nonempty student number and name, trim surrounding whitespace, and treat student number as text.
- Preview rows and row-level errors before confirmation. Reject files larger than 5 MiB or more than 5,000 data rows. Duplicate student numbers within a batch or invalid rows block the whole import; no partial writes.
- Confirmation inserts new numbers and updates name/gender for existing numbers in that class in one transaction. Omitted students are not deleted or archived. Show inserted/updated counts.
- Parse Excel as data only. Validate actual file content and server-side limits, not just extension, MIME type, or browser checks.

## Prize and Inventory Management

- Teachers create and archive class prizes and adjust stock by an explicit signed quantity and reason. Adjustments cannot make stock negative. Active prize names are unique within a class.
- Prize stock is shared by sessions of its class. A mode-one candidate quantity is a per-session cap, not a reservation. At setup it cannot exceed current stock; at stop current stock is rechecked in case another session or adjustment changed it.
- Every successful win deducts one unit and records a stock-ledger entry in the same transaction. Redemption does not deduct stock again.

## Lottery Rules

Both modes are teacher-operated. Starting a round begins browser animation without preselecting an outcome. The teacher manually stops it; only then does the server determine and commit the result with a cryptographically secure random source. A repeated stop with the same round token returns the existing result without a second deduction or winning record. An unfinished round can be resumed after reload or canceled with no outcome and no stock change, for example if stock became unavailable while the animation was running.

### Mode One: Chosen Student, Random Prize

- The teacher chooses candidate students, candidate prizes with a positive quantity for each, and a positive per-student draw limit. For each round they select one candidate student who has not reached that limit.
- Stopping awards exactly one prize. Eligible prizes have positive remaining session quota and class stock. The random weight of a prize is the smaller of these remaining quantities; weights of 3 and 1 give probabilities of 3/4 and 1/4.
- A success consumes one of the chosen student's draws, one unit of the chosen prize's session quota, and one unit of class stock. Other students' limits are unaffected.
- If no prize is eligible or the chosen student reached their limit, no outcome or stock change is made. The teacher can complete the session; committed rounds remain visible.

### Mode Two: Fixed Prize, Random Student

- The teacher chooses candidate students, one fixed prize, and a positive round count not exceeding the number of candidates or current prize stock at activation.
- Each stop uniformly chooses among candidates who have not won in this session. A student may win in a new session, but not twice in the same session.
- Each success awards one unit of the fixed prize. No further rounds start after the configured count, candidate exhaustion, or stock exhaustion. Earlier outcomes remain valid.

### Concurrency and Corrections

- A database transaction locks the session, round, and prize rows in a consistent order, then rechecks permission, eligibility, quotas, and stock before choosing and saving the result. Conflicts are retried a bounded number of times or return a clear retryable error. Stock cannot go negative.
- Results are not rerolled, deleted, or overwritten. Teachers mark pending winnings redeemed; the teacher and time are saved. An administrator can correct mistaken redemption status with a reason and audit entry. Inventory corrections use the stock ledger, not edits to historical winnings.

## Application Structure and UX

- Next.js App Router, TypeScript, and Tailwind CSS. Separate class membership, import parsing, draw rules, inventory mutations, and redemption operations into focused server-side modules. Use PostgreSQL with Drizzle and an established authentication library with administrator-created accounts and public registration disabled.
- Administrator screens: teacher accounts, classes, teacher assignments, audit history. Teacher screens: class selector, roster/import, emblem, prizes/stock, session setup, live draw, winnings, and pending/redeemed lists. No marketing landing page.
- The live draw shows the current student or candidate pool, remaining draws, prize quotas, and stock. The committed server result is the only displayed winner/prize; animation is presentation only.
- Keep the Chinese-language interface responsive, keyboard usable, and accessible. Show actionable validation and concurrency errors; retain committed outcomes after reload or a network interruption.
- Accept PNG, JPEG, or WebP emblems up to 2 MiB. Store with generated names under an application-managed path on a persistent Docker volume and serve only through authorized class routes. Validate actual content.

## Deployment and Operations

- Docker Compose runs the Next.js app and PostgreSQL. A public HTTPS reverse proxy routes to the app; PostgreSQL is not exposed to the internet. Database and emblem files have separate persistent volumes.
- Provide an example environment file without secrets, database migration and initial-admin commands, health checks, backup/restore instructions for both volumes, and deployment documentation. Apply migrations before accepting traffic.
- Ship a lockfile and pin compatible releases of Next.js, Tailwind CSS, authentication, Drizzle, the Excel parser, and Node during planning. Never commit production secrets or sample passwords.
- The initial target is one server. Multi-instance storage, external object storage, and distributed jobs are outside the first release.

## Verification and Acceptance

- Unit tests: import validation, weighted prize choice, uniform student choice, per-student limits, and no-repeat mode-two eligibility.
- Database integration tests: class isolation, duplicate student numbers, atomic inventory, idempotent stop requests, concurrent stops on the same and different sessions, stock exhaustion, and redemption audit.
- Browser tests: admin creation of a teacher and class assignment, teacher sign-in, Excel/paste import preview, both draw modes, and teacher redemption. Inspect desktop and mobile layouts of key workflows.
- A release is accepted when an administrator can create teachers and classes, assign multiple teachers to one class, import students, configure prizes, manually stop each round in both modes, inspect winning history, mark prizes redeemed, and redeploy containers without data loss.

## Explicit Exclusions

Student login, public registration, shared inventory between classes, manually tuned prize probabilities, public winner pages, payments, and automatic redemption are not part of the first release.
