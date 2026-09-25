# 学生抽奖系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可在公网 Docker 部署、支持多老师多班级、学生导入、两种抽奖模式、库存与兑换管理的中文系统。

**Architecture:** Next.js App Router 单体应用处理页面与服务端操作；按班级权限隔离数据。PostgreSQL 保存业务数据，Drizzle 管理结构和事务；抽奖结果仅在老师停止轮次时由服务端随机生成并原子提交。

**Tech Stack:** Node 24、Next.js 16.3.6、React 19.3.0、TypeScript 5.9.3、Tailwind CSS 4.3.3、Better Auth 1.7.6、Drizzle ORM 0.45.3 / Kit 0.31.11、PostgreSQL、pg 8.23.0、ExcelJS 4.4.0、Zod 4.6.5、Vitest 5.0.2、Playwright 1.63.0、lucide-react 1.48.0、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-09-25-student-lottery-system-design.md`

## Global Constraints

- 界面、导入字段与错误提示使用中文；学生没有账号，也不开放公开注册。
- 老师仅访问获分配班级；每个服务端读写入口重新校验角色和班级权限。
- 学生 ID 由数据库自增，学号按文本保存且在同一班级唯一；导入格式为`学号、姓名、性别`。
- 模式一按本场奖品剩余数量与实时库存的较小值加权；模式二在同一场内每人最多中奖一次。
- 每轮由老师手动停止；结果、库存扣减和流水在事务中完成，重复停止不得重复中奖。
- 公网采用 HTTPS；数据库和班徽持久化，PostgreSQL 不对公网开放；首版单服务器。
- 依赖使用 `--save-exact` 和 `package-lock.json`；项目运行时要求 Node >=24.15.0 <25。Windows 上 npm 使用 `C:\Program Files\nodejs\npm.cmd`；Docker 命令可能需要沙箱授权。
- 每项功能先写失败测试并验证失败原因，再写最小实现、跑全量相关测试、检查改动并提交。生成的配置和迁移文件以构建及数据库集成测试验证。

## File Map

- `src/app`: 路由、页面、登录、管理与老师工作区；`src/components`: 通用壳层与表单控件。
- `src/db`: 数据库连接、表定义及迁移；`src/lib`: 认证、班级权限、服务端错误与随机数。
- `src/features/classes`: 班级、老师分配和班徽；`src/features/students`: 解析、预览、导入与名单。
- `src/features/prizes`: 奖品和库存流水；`src/features/lotteries`: 场次配置、纯抽样规则、轮次事务及抽奖界面。
- `src/features/redemptions`: 中奖历史、兑换和审计；`tests/e2e`: 浏览器验收；`scripts`: 管理员初始化；根目录部署文件。

---

### Task 1: 项目骨架与测试基线

**Files:** Create `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/page.test.tsx`, `.gitignore`.

**Interfaces:** Produces `npm run dev`, `npm run test`, `npm run lint`, `npm run build` and a Chinese app entry page. No database dependency.

- [ ] **Step 1: Configure tooling.** Create the listed config files; install exact Next/React/Tailwind/TypeScript/Vitest versions from the header plus `@testing-library/react@16.3.3`, `@testing-library/user-event@14.6.7`, `@testing-library/jest-dom@7.0.1`, `jsdom@30.1.1`, and `eslint-config-next@16.3.6`. Commit lockfile. Set scripts `dev: next dev`, `build: next build`, `lint: eslint .`, `test: vitest run`, `typecheck: tsc --noEmit`. Exclude `.next`, `node_modules`, `.env*` except `.env.example`, and local data from Git.
- [ ] **Step 2: Write failing UI test.** `src/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import Page from './page';
import { expect, test } from 'vitest';

test('显示班级工作入口', () => {
  render(<Page />);
  expect(screen.getByRole('heading', { name: '班级' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Confirm red.** Run `npm run test -- src/app/page.test.tsx`; expect missing `./page` or missing heading, not a test-environment error.
- [ ] **Step 4: Implement minimal page and baseline.** `src/app/page.tsx` exports `Page` rendering `<main><h1>班级</h1></main>`; set Chinese metadata and Tailwind import in layout/CSS; configure Vitest `jsdom` and jest-dom matcher.
- [ ] **Step 5: Verify and commit.** Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`; commit `chore: scaffold Next.js app and test baseline`.

### Task 2: 数据库结构与迁移

**Files:** Create `src/db/client.ts`, `src/db/schema.ts`, `src/db/auth-schema.ts`, `src/lib/auth.ts`, `drizzle.config.ts`, `vitest.integration.config.ts`, `compose.test.yml`, `src/db/schema.int.test.ts`, `drizzle/*`; modify `package.json`, `package-lock.json`.

**Interfaces:** Exports `db`, `classes`, `classTeachers`, `students`, `prizes`, `stockEvents`, `lotterySessions`, `sessionStudents`, `sessionPrizes`, `lotteryRounds`, `winningRecords`, `redemptionAudit`, `adminAudit`; all class-owned tables have `classId` or a class-scoped parent. Auth tables expose `user.id` as a string. `npm run db:generate`, `npm run db:migrate`, `npm run test:db`.

- [ ] **Step 1: Add database test infrastructure.** Pin `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`, `pg@8.23.0`, `@types/pg@8.23.1` and `better-auth@1.7.6`; configure a private test PostgreSQL service in `compose.test.yml`, `DATABASE_URL`, migrations and a Vitest integration config that only includes `*.int.test.ts`.
- [ ] **Step 2: Write failing constraint test.** `src/db/schema.int.test.ts`:

```ts
const classId = crypto.randomUUID();
await db.insert(classes).values({ id: classId, name: '测试班' });
await db.insert(students).values({ classId, studentNumber: '001', name: '甲' });
await expect(db.insert(students).values({
  classId, studentNumber: '001', name: '乙',
})).rejects.toThrow();
```

- [ ] **Step 3: Confirm red.** Start the test DB, run migrations and `npm run test:db -- src/db/schema.int.test.ts`; expect absent table/constraint, not connection failure.
- [ ] **Step 4: Implement schema and migrations.** Configure Better Auth with the admin plugin and `mustChangePassword` additional user field in `src/lib/auth.ts`; generate its `user`, `session`, `account`, `verification` tables in `auth-schema.ts`. Create all named business tables with FKs to that user ID, unique `(class_id, student_number)` and `(class_id, teacher_id)`, nonnegative stock check, partial unique index for one active round/session, unique stop token, and unique win/round. `student.id` is generated identity; numbers are text. Generate migration with Drizzle Kit.
- [ ] **Step 5: Verify and commit.** Recreate test DB, migrate from empty, run `npm run test:db`, `npm run typecheck`; commit `feat: define lottery database schema and migrations`.

### Task 3: 登录、管理员初始化和权限门卫

**Files:** Create `src/lib/access.ts`, `src/lib/access.int.test.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/change-password/page.tsx`, `scripts/create-admin.ts`; modify `src/lib/auth.ts`, `src/db/auth-schema.ts`, `package.json`, `package-lock.json`.

**Interfaces:** `requireSession(): Promise<{ userId: string; role: 'admin' | 'teacher' }>`; `requireAdmin(): Promise<string>`; `checkClassAccess(userId: string, classId: string): Promise<void>`; `requireClassAccess(classId: string): Promise<string>` returns authorized user ID or throws `ForbiddenError`. The initial-admin script is idempotent by email and refuses to overwrite an existing password.

- [ ] **Step 1: Write failing access tests.** Use real test users/classes in `src/lib/access.int.test.ts`:

```ts
await expect(checkClassAccess(teacherId, foreignClassId)).rejects.toThrow('无权访问班级');
await expect(checkClassAccess(teacherId, assignedClassId)).resolves.toBeUndefined();
await expect(checkClassAccess(adminId, foreignClassId)).resolves.toBeUndefined();
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/lib/access.int.test.ts`; expect missing `checkClassAccess` or failing permission assertions.
- [ ] **Step 3: Implement.** Complete the existing Better Auth Drizzle adapter/admin configuration, enable email/password, disable sign-up, and expose the Next auth handler. Map the library's standard `user` role to the application's `teacher` role; `admin` stays admin. Implement `checkClassAccess(userId: string, classId: string): Promise<void>` against memberships; server entry points call `requireClassAccess`. Bootstrap uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment and refuses empty credentials.
- [ ] **Step 4: Add security tests.** Verify public sign-up is denied, disabled teachers cannot log in, removed memberships lose access, and first login forces password change; run the failing tests before completing each behavior.
- [ ] **Step 5: Verify and commit.** Run unit/integration suites, typecheck, lint and build; commit `feat: add administrator login and class authorization`.

### Task 4: 管理员的老师与班级管理

**Files:** Create `src/features/classes/service.ts`, `src/features/classes/service.int.test.ts`, `src/features/classes/actions.ts`, `src/app/(app)/admin/teachers/page.tsx`, `src/app/(app)/admin/classes/page.tsx`, `src/components/app-shell.tsx`.

**Interfaces:** `createTeacher(input: { name: string; email: string; temporaryPassword: string }): Promise<string>`; `createClass(name: string): Promise<string>`; `assignTeacher(classId: string, teacherId: string): Promise<void>`; `removeTeacher(classId: string, teacherId: string): Promise<void>`; `listClassTeacherIds(classId: string): Promise<string[]>` sorted by ID; `archiveClass(classId: string): Promise<void>`. Actions call `requireAdmin`.

- [ ] **Step 1: Write failing integration test.**

```ts
const classId = await createClass('一班');
await assignTeacher(classId, teacherA);
await assignTeacher(classId, teacherB);
expect(await listClassTeacherIds(classId)).toEqual([teacherA, teacherB].sort());
await removeTeacher(classId, teacherA);
expect(await listClassTeacherIds(classId)).toEqual([teacherB]);
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/features/classes/service.int.test.ts`; expect missing service or failed assignment assertion.
- [ ] **Step 3: Implement.** Use Better Auth admin API for account creation/disable/reset, Drizzle for class and membership changes. Record actor, time and action in admin audit entries for account/class changes. Sort list output by ID; reject duplicate email, blank class name and archived class assignment. Add Chinese admin forms with success/error states and an app shell that routes admins and teachers to their own workspaces.
- [ ] **Step 4: Test permission boundaries.** Add failing tests for teacher attempts to call every admin action, then implement action guards. Check disabled users and removal without deleting class history.
- [ ] **Step 5: Verify and commit.** Run tests, typecheck, lint, build; commit `feat: manage teachers classes and assignments`.

### Task 5: 班徽上传与受权访问

**Files:** Create `src/features/classes/emblem.ts`, `src/features/classes/emblem.test.ts`, `src/app/api/classes/[classId]/emblem/route.ts`; modify `src/app/(app)/admin/classes/page.tsx`, `src/features/classes/actions.ts`.

**Interfaces:** `validateEmblem(bytes: Uint8Array): 'png' | 'jpeg' | 'webp'`; `saveEmblem(classId: string, bytes: Uint8Array): Promise<string>` returns generated storage name; `GET` requires class access; upload accepts at most 2 MiB.

- [ ] **Step 1: Write failing validation test.**

```ts
expect(validateEmblem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
expect(() => validateEmblem(new TextEncoder().encode('<script>'))).toThrow('不支持的班徽格式');
```

- [ ] **Step 2: Confirm red.** Run `npm run test -- src/features/classes/emblem.test.ts`; expect missing validator.
- [ ] **Step 3: Implement.** Pin `sharp@0.35.4`; check PNG/JPEG/WebP signatures and size on server, then decode with Sharp to reject truncated/spoofed files. Generate UUID filename under `EMBLEM_DIR`, never use an upload name as path. Upload verifies membership and stores class emblem path; GET verifies membership and sets the proper content type.
- [ ] **Step 4: Test negative paths.** Add failing tests for oversized content, path traversal filename, teacher without membership, and missing emblem; implement explicit 400/403/404 responses.
- [ ] **Step 5: Verify and commit.** Run tests, typecheck and build; commit `feat: upload and protect class emblems`.

### Task 6: Excel 与粘贴内容解析预览

**Files:** Create `src/features/students/parse.ts`, `src/features/students/parse.test.ts`, `src/features/students/excel.ts`, `src/features/students/excel.test.ts`; modify `package.json`, `package-lock.json`.

**Interfaces:** `type StudentRow = { studentNumber: string; name: string; gender: 'male' | 'female' | null }`; `type ImportPreview = { rows: StudentRow[]; errors: { line: number; message: string }[] }`; `parsePastedStudents(text: string): ImportPreview`; `parseExcelStudents(bytes: Uint8Array): Promise<ImportPreview>`.

- [ ] **Step 1: Write failing parser tests.**

```ts
expect(parsePastedStudents('001\t张三\t男\n002\t李四\t')).toEqual({
  rows: [
    { studentNumber: '001', name: '张三', gender: 'male' },
    { studentNumber: '002', name: '李四', gender: null },
  ], errors: [],
});
expect(parsePastedStudents('001\t甲\t男\n001\t乙\t女').errors[0].line).toBe(2);
```

- [ ] **Step 2: Confirm red.** Run `npm run test -- src/features/students/parse.test.ts`; expect missing parser or mismatched rows.
- [ ] **Step 3: Implement.** Use one shared row validator for paste and ExcelJS 4.4.0. XLSX requires exact header `学号/姓名/性别`, one worksheet and <=5,000 data rows; retain formatted text for leading-zero student numbers. Reject >5 MiB, duplicate numbers, invalid gender and missing required cells. Return all row errors; do not write to DB.
- [ ] **Step 4: Test Excel and limits.** Generate a small workbook in test memory; assert leading zeros, header mismatch, duplicate rows, and size/row limits. Run red first for each new behavior.
- [ ] **Step 5: Verify and commit.** Run unit tests, typecheck and lint; commit `feat: preview Excel and pasted student data`.

### Task 7: 学生导入提交与名单管理

**Files:** Create `src/features/students/service.ts`, `src/features/students/service.int.test.ts`, `src/features/students/actions.ts`, `src/app/(app)/classes/[classId]/students/page.tsx`, `src/components/student-import.tsx`.

**Interfaces:** `importStudents(classId: string, rows: StudentRow[]): Promise<{ inserted: number; updated: number }>`; `listStudents(classId: string): Promise<Student[]>`; `archiveStudent(classId: string, studentId: number): Promise<void>`; `restoreStudent(classId: string, studentId: number): Promise<void>`; actions call `requireClassAccess` and reparse the submitted file/text on confirmation.

- [ ] **Step 1: Write failing transaction test.**

```ts
await importStudents(classId, [{ studentNumber: '001', name: '旧名', gender: null }]);
expect(await importStudents(classId, [
  { studentNumber: '001', name: '新名', gender: 'female' },
  { studentNumber: '002', name: '新增', gender: 'male' },
])).toEqual({ inserted: 1, updated: 1 });
expect((await listStudents(classId)).map((s) => s.studentNumber)).toEqual(['001', '002']);
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/features/students/service.int.test.ts`; expect missing import behavior.
- [ ] **Step 3: Implement.** Upsert by `(class_id, student_number)` in one transaction; preserve existing database ID and archived state. Action revalidates original XLSX/text (not client-supplied preview rows), checks class permission, rejects all rows on any error and reports row numbers. Page has tabs for Excel/paste, preview, confirmation, counts, searchable roster and explicit archive/restore actions; omission never deletes a student.
- [ ] **Step 4: Test isolation and rollback.** Add red tests for same number in different classes, duplicate rows causing zero changes, import by unassigned teacher, and unchanged ID on update.
- [ ] **Step 5: Verify and commit.** Run unit/integration suites, typecheck, lint, build; commit `feat: import and manage class rosters`.

### Task 8: 奖品与可审计库存

**Files:** Create `src/features/prizes/service.ts`, `src/features/prizes/service.int.test.ts`, `src/features/prizes/actions.ts`, `src/app/(app)/classes/[classId]/prizes/page.tsx`.

**Interfaces:** `createPrize(classId: string, name: string, openingStock: number, actorId: string): Promise<string>`; `adjustStock(classId: string, prizeId: string, delta: number, reason: string, actorId: string): Promise<number>` returns new stock; `getPrizeStock(prizeId: string): Promise<number>`; `type StockEvent = { prizeId: string; delta: number; reason: string; actorId: string; createdAt: Date }`; `listStockEvents(prizeId: string): Promise<StockEvent[]>`.

- [ ] **Step 1: Write failing inventory tests.**

```ts
const prizeId = await createPrize(classId, '笔记本', 2, teacherId);
expect(await adjustStock(classId, prizeId, -1, '盘点', teacherId)).toBe(1);
await expect(adjustStock(classId, prizeId, -2, '盘点', teacherId)).rejects.toThrow('库存不足');
expect(await listStockEvents(prizeId)).toHaveLength(2);
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/features/prizes/service.int.test.ts`; expect missing service or negative-stock assertion failure.
- [ ] **Step 3: Implement.** Create initial stock ledger entry, update quantity with `stock + delta >= 0` in a transaction, record every change with reason/actor, enforce active-name uniqueness and class-scoped prize ID. Provide teacher form, stock history and archive action.
- [ ] **Step 4: Test concurrency and authorization.** Add red tests for two simultaneous decrements against one remaining unit, other-class prize ID, zero delta and blank reason; make exactly one decrement succeed.
- [ ] **Step 5: Verify and commit.** Run integration suite, typecheck, lint, build; commit `feat: manage class prizes with stock ledger`.

### Task 9: 场次配置与候选约束

**Files:** Create `src/features/lotteries/types.ts`, `src/features/lotteries/sessions.ts`, `src/features/lotteries/sessions.int.test.ts`, `src/features/lotteries/actions.ts`, `src/app/(app)/classes/[classId]/lotteries/page.tsx`, `src/app/(app)/classes/[classId]/lotteries/new/page.tsx`.

**Interfaces:** `type ModeOneConfig = { mode: 'student-prize'; studentIds: number[]; prizes: { prizeId: string; quantity: number }[]; perStudentLimit: number }`; `type ModeTwoConfig = { mode: 'prize-student'; studentIds: number[]; prizeId: string; roundCount: number }`; `type DrawResult = { winId: string; studentId: number; studentName: string; prizeId: string; prizeName: string }`; `createSession(classId: string, config: ModeOneConfig | ModeTwoConfig): Promise<string>`; `updateDraftSession(sessionId: string, config: ModeOneConfig | ModeTwoConfig): Promise<void>`; `activateSession(sessionId: string): Promise<void>`; `completeSession(sessionId: string): Promise<void>`.

- [ ] **Step 1: Write failing config tests.**

```ts
await expect(createSession(classId, {
  mode: 'prize-student', studentIds: [studentA, studentB],
  prizeId, roundCount: 3,
})).rejects.toThrow('抽取轮数超过候选人数');
await expect(createSession(classId, {
  mode: 'student-prize', studentIds: [foreignStudent],
  prizes: [{ prizeId, quantity: 1 }], perStudentLimit: 1,
})).rejects.toThrow('候选数据不属于班级');
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/features/lotteries/sessions.int.test.ts`; expect missing validators.
- [ ] **Step 3: Implement.** Persist draft configurations in candidate tables. Reject empty/duplicate candidates, nonpositive limits, other-class or archived rows, candidate prize quota greater than stock, and mode-two rounds greater than candidates or stock. Revalidate at activation; active config is immutable. Display a mode selector and per-mode setup forms.
- [ ] **Step 4: Test lifecycle.** Add red tests for edits after activation, second activation, completing an active session, and beginning a round on a completed session; implement state transitions.
- [ ] **Step 5: Verify and commit.** Run integration suite, typecheck, lint, build; commit `feat: configure and activate lottery sessions`.

### Task 10: 纯抽样规则

**Files:** Create `src/features/lotteries/selection.ts`, `src/features/lotteries/selection.test.ts`.

**Interfaces:** `type PrizeOption = { prizeId: string; quotaRemaining: number; stockRemaining: number }`; `pickWeightedPrize(options: PrizeOption[], draw: (maxExclusive: number) => number): string`; `pickUniformStudent(eligibleIds: number[], draw: (maxExclusive: number) => number): number`; production passes Node `crypto.randomInt` as `draw`.

- [ ] **Step 1: Write failing boundary tests.**

```ts
const options = [
  { prizeId: 'A', quotaRemaining: 3, stockRemaining: 9 },
  { prizeId: 'B', quotaRemaining: 5, stockRemaining: 1 },
];
expect(pickWeightedPrize(options, () => 0)).toBe('A');
expect(pickWeightedPrize(options, () => 2)).toBe('A');
expect(pickWeightedPrize(options, () => 3)).toBe('B');
expect(pickUniformStudent([11, 22], () => 1)).toBe(22);
```

- [ ] **Step 2: Confirm red.** Run `npm run test -- src/features/lotteries/selection.test.ts`; expect missing selection functions.
- [ ] **Step 3: Implement.** Filter options whose `Math.min(quotaRemaining, stockRemaining)` is nonpositive, sum safe integer weights, take one `draw(total)`, and walk cumulative weights. Uniform mode takes `draw(eligibleIds.length)`. Throw Chinese domain errors for empty pools or invalid draw values.
- [ ] **Step 4: Test edges.** Add red tests for zero stock, zero quota, only one choice, empty list, integer overflow and out-of-range draw callback; then implement guards. Never use `Math.random` for production outcomes.
- [ ] **Step 5: Verify and commit.** Run unit suite and typecheck; commit `feat: select prizes and students with secure draw rules`.

### Task 11: 手动停止与原子中奖事务

**Files:** Create `src/features/lotteries/rounds.ts`, `src/features/lotteries/rounds.int.test.ts`, `src/features/lotteries/rounds.actions.ts`, `src/lib/domain-errors.ts`; modify `src/db/schema.ts` only if a tested constraint requires it and include a migration.

**Interfaces:** `startRound(sessionId: string, actorId: string, selectedStudentId?: number): Promise<{ roundId: string; token: string }>`; `stopRound(token: string, actorId: string): Promise<DrawResult>`; `cancelRound(token: string, actorId: string): Promise<void>`. `DrawResult` is exported from `types.ts` and uses committed student/prize snapshots. Each action obtains the current user; the service verifies class access using `checkClassAccess`.

- [ ] **Step 1: Write failing mode-one transaction test.**

```ts
const { roundId, token } = await startRound(modeOneSessionId, teacherId, studentA);
const first = await stopRound(token, teacherId);
expect(await stopRound(token, teacherId)).toEqual(first);
expect(await getPrizeStock(first.prizeId)).toBe(initialStock - 1);
expect(await db.select().from(winningRecords).where(eq(winningRecords.roundId, roundId))).toHaveLength(1);
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/features/lotteries/rounds.int.test.ts`; expect missing stop transaction or duplicate deduction.
- [ ] **Step 3: Implement.** In a Drizzle transaction lock session, round and prize in stable order. For mode one verify selected student and per-student count, get current quota/stock and call `pickWeightedPrize`; for mode two exclude this session's prior winners and call `pickUniformStudent`. Save student/prize snapshots, win, stock decrement and ledger entry in that transaction. Repeated token reads existing win. One active round/session; cancel has no win/stock effect.
- [ ] **Step 4: Prove concurrent behavior.** Add red integration tests for two stops of the same token and simultaneous stops from separate sessions competing for one prize. Assert at most one win per token, one stock unit consumed and no negative stock; implement bounded retry for serialization conflicts. Test refresh/resume of a pending round and explicit cancellation.
- [ ] **Step 5: Verify and commit.** Run all database and unit tests, typecheck, lint, build; commit `feat: commit idempotent lottery rounds atomically`.

### Task 12: 中奖历史、兑换与审计

**Files:** Create `src/features/redemptions/service.ts`, `src/features/redemptions/service.int.test.ts`, `src/features/redemptions/actions.ts`, `src/app/(app)/classes/[classId]/winnings/page.tsx`, `src/app/(app)/admin/audit/page.tsx`.

**Interfaces:** `listWinnings(classId: string, status?: 'pending' | 'redeemed'): Promise<WinningRecord[]>`; `redeemWin(classId: string, winId: string, actorId: string): Promise<void>`; `correctRedemption(winId: string, reason: string, adminId: string): Promise<void>`.

- [ ] **Step 1: Write failing redemption test.**

```ts
const stockBefore = await getPrizeStock(prizeId);
await redeemWin(classId, winId, teacherId);
expect((await listWinnings(classId, 'redeemed')).map((w) => w.id)).toContain(winId);
expect(await getPrizeStock(prizeId)).toBe(stockBefore);
await expect(redeemWin(classId, winId, teacherId)).rejects.toThrow('已兑换');
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/features/redemptions/service.int.test.ts`; expect missing status transition or duplicate-redemption assertion.
- [ ] **Step 3: Implement.** Use conditional status update so only pending wins become redeemed. Store actor/time; preserve outcome and stock. Scope lists/actions by class ID. Provide pending/redeemed tabs with student number/name, prize, draw time, redemption time and operator. Admin correction requires a reason and writes audit before reverting status.
- [ ] **Step 4: Test negative paths.** Add red tests for other-class win ID, teacher correction attempt, blank correction reason and historical student/prize rename; ensure snapshots remain unchanged.
- [ ] **Step 5: Verify and commit.** Run integration suite, typecheck, lint, build; commit `feat: track winning history and teacher redemptions`.

### Task 13: 老师工作区与现场抽奖交互

**Files:** Create `src/app/(app)/classes/page.tsx`, `src/app/(app)/classes/[classId]/page.tsx`, `src/app/(app)/classes/[classId]/lotteries/[sessionId]/page.tsx`, `src/features/lotteries/draw-stage.tsx`, `src/features/lotteries/draw-stage.test.tsx`; modify `src/components/app-shell.tsx`, `src/app/globals.css`.

**Interfaces:** `DrawStage` receives `session: { mode: 'student-prize' | 'prize-student'; candidates: { id: number; name: string; remaining: number }[]; prizes: { id: string; name: string; stock: number; quotaRemaining: number }[]; drawsRemaining: number; pendingToken?: string }` and `actions: { start(studentId?: number): Promise<{ token: string }>; stop(token: string): Promise<DrawResult>; cancel(token: string): Promise<void> }`. The production adapter calls `startRound`, `stopRound`, `cancelRound`; only the server response supplies the result. Class selector lists only authorized active classes.

- [ ] **Step 1: Write failing component behavior test.**

```tsx
import userEvent from '@testing-library/user-event';

const user = userEvent.setup();
const inMemoryActions = {
  start: async (studentId?: number) => {
    if (studentId !== 1) throw new Error('未选择学生');
    return { token: 'round-1' };
  },
  stop: async () => ({ winId: 'w', studentId: 1, studentName: '张三', prizeId: 'p', prizeName: '笔记本' }),
  cancel: async () => {},
};
render(<DrawStage session={{
  mode: 'student-prize', candidates: [{ id: 1, name: '张三', remaining: 1 }],
  prizes: [{ id: 'p', name: '笔记本', stock: 1, quotaRemaining: 1 }],
  drawsRemaining: 1,
}} actions={inMemoryActions} />);
await user.selectOptions(screen.getByLabelText('本轮学生'), '1');
expect(screen.getByRole('button', { name: '开始抽奖' })).toBeEnabled();
await user.click(screen.getByRole('button', { name: '开始抽奖' }));
expect(screen.getByRole('button', { name: '停止' })).toBeEnabled();
await user.click(screen.getByRole('button', { name: '停止' }));
expect(screen.getByText('笔记本')).toBeVisible();
```

- [ ] **Step 2: Confirm red.** Run `npm run test -- src/features/lotteries/draw-stage.test.tsx`; expect missing controls/result rendering.
- [ ] **Step 3: Implement.** Build compact class-first navigation and both mode stages. Mode one requires choosing an eligible student before start; mode two displays candidate pool and fixed prize. Keep start/stop/cancel controls stable in size. Animation runs locally, stops only after the server response, blocks duplicate submission, shows current quota/stock and committed history. Resume pending round after reload.
- [ ] **Step 4: Test UI states.** Add red tests for unavailable candidates, stock exhaustion, network error with retry, and mobile text overflow; implement empty/error/loading states and keyboard-visible focus. Inspect desktop/mobile screenshots before committing.
- [ ] **Step 5: Verify and commit.** Run unit/integration suites, typecheck, lint, build and UI screenshots; commit `feat: build teacher draw workspace`.

### Task 14: 公网 Docker 部署与备份

**Files:** Create `Dockerfile`, `.dockerignore`, `compose.yml`, `Caddyfile`, `.env.example`, `src/app/api/health/route.ts`, `src/app/api/health/route.int.test.ts`, `scripts/backup.sh`, `README.md`; modify `next.config.ts`, `package.json`.

**Interfaces:** `GET /api/health` returns 200 only when DB responds; `docker compose up --build` runs app, PostgreSQL and HTTPS proxy. `EMBLEM_DIR` points to a persistent volume; only proxy ports 80/443 are public.

- [ ] **Step 1: Write failing health test.**

```ts
import { GET } from './route';
import { expect, test } from 'vitest';

test('数据库可用时报告健康', async () => {
const response = await GET();
expect(response.status).toBe(200);
expect(await response.json()).toEqual({ status: 'ok' });
});
```

- [ ] **Step 2: Confirm red.** Run `npm run test:db -- src/app/api/health/route.int.test.ts`; expect missing route.
- [ ] **Step 3: Implement.** Health route runs `SELECT 1`; multi-stage Dockerfile builds Next standalone output using Node 24. Compose has `app`, `db` (`postgres:17-alpine`) and `proxy` (`caddy:2-alpine`), private DB network, named `postgres-data` and `emblem-data` volumes, health checks, restart policy and migrations before accepting traffic. Caddy handles HTTPS using configured domain. `.env.example` lists required variable names without real passwords.
- [ ] **Step 4: Document operations.** `README.md` gives local start, migration, one-time admin creation, HTTPS/DNS prerequisites, health check, `pg_dump` plus emblem-volume backup, and an isolated restore rehearsal. Add tests/smoke checks for DB-down health returning 503 and `docker compose config` parsing successfully.
- [ ] **Step 5: Verify and commit.** Run tests, typecheck, lint, build, `docker compose config`, `docker compose up --build`, health probe and data persistence smoke test; commit `ops: add Docker deployment and backup guide`.

### Task 15: 端到端验收与发布检查

**Files:** Create `playwright.config.ts`, `tests/e2e/admin-and-import.spec.ts`, `tests/e2e/mode-one.spec.ts`, `tests/e2e/mode-two-and-redemption.spec.ts`, `tests/e2e/fixtures.ts`; modify `package.json`, `README.md` only for verified commands.

**Interfaces:** `npm run test:e2e` runs Chromium against a test app/database, creates temporary admin/teacher/class fixtures, and leaves production data untouched.

- [ ] **Step 1: Write failing browser flow.** `tests/e2e/mode-two-and-redemption.spec.ts` uses provisioned fixtures:

```ts
import { test, expect } from './fixtures';

test('同场不重复中奖且可兑换', async ({ page, teacherSession }) => {
  await page.goto(`/classes/${teacherSession.classId}/lotteries/${teacherSession.sessionId}`);
  await page.getByRole('button', { name: '开始抽奖' }).click();
  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByText('抽奖结果')).toBeVisible();
  await page.getByRole('link', { name: '中奖记录' }).click();
  await page.getByRole('button', { name: '标记已兑换' }).first().click();
  await expect(page.getByText('已兑换')).toBeVisible();
});
```

- [ ] **Step 2: Confirm red.** Run `npm run test:e2e -- tests/e2e/mode-two-and-redemption.spec.ts`; expect absent workflow/control, not missing browser binaries or server.
- [ ] **Step 3: Complete workflows.** Add real-browser flows for admin creating two teachers and assigning both to one class, unauthorized class access, Excel and paste preview/upsert, mode-one weighted prize with each student limit, mode-two multi-round no-repeat, idempotent stop, stock exhaustion, history and redemption. Seed controlled test data in `fixtures.ts` through app/database APIs rather than mocking random outcomes; assert invariants, not a particular random winner.
- [ ] **Step 4: Inspect UI and restore.** Capture desktop (1440x900) and mobile (390x844) screenshots for admin, import, both live stages and winnings. Fix overflow/focus issues with a failing browser assertion first. Recreate containers with persistent volumes, then verify data; rehearse backup restore to an isolated instance.
- [ ] **Step 5: Verify and commit.** Run `npm run test`, `npm run test:db`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`, `docker compose config` and `git diff --check`; commit `test: verify complete lottery workflows and deployment`.

## Execution and Review

Execute tasks in order. For every task, a worker reads this plan and the approved spec, verifies the red test, implements only that task's files, runs its stated checks, and submits a commit for a specification review followed by a code-quality review. The controller verifies the diff and test output before dispatching the next task. Do not silently substitute a different subagent model for the user's requested Luna/Sol; obtain approval if neither is available.
