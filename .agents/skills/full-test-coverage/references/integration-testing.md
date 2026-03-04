# Integration Testing Reference

> Agent instructions for generating integration tests. Every service branch, every error throw, every external service interaction — with real DB and mocked external services.

## Table of Contents
1. [Orientation](#orientation)
2. [Generation Workflow (Steps 1–7)](#generation-workflow)
3. [DatabaseHelper — verbatim template](#databasehelper)
4. [AuthHelper — two implementations](#authhelper)
5. [Fixtures](#fixtures)
6. [API Utilities](#api-utilities)
7. [Handler Test Template](#handler-test-template)
8. [Service Test Template](#service-test-template)
9. [Wiremock Utilities](#wiremock-utilities)
10. [Async Polling](#async-polling)
11. [Critical Mistakes](#critical-mistakes)
12. [Self-Validation Checklist](#self-validation-checklist)

---

## Orientation

Integration tests verify complete code paths: handler → service → database → external services.

| Concern | Integration tests | API tests | Unit tests |
|---------|------------------|-----------|-----------|
| Coverage | Every service branch, error throw, external call | Happy path + critical negatives | Exhaustive field validation |
| Zod validation | **1–2 wiring checks only** | 1 per endpoint | Every rule on every field |
| Data setup | Direct DB via Prisma | Via HTTP (authenticateUser) | Mocked |
| External services | **Always mocked** (Wiremock / vi.mock) | Real sandbox | N/A |
| Cleanup | `DatabaseHelper.cleanup()` in `afterEach` — targeted | Auth tracking array | N/A |
| Parallelism | File-level parallel | Sequential | Full parallel |

**Tech stack:** Vitest · Prisma (direct DB) · Axios (HTTP client) · Chance.js (data generation) · Wiremock (external service mocking) · Docker (test environment)

**Directory structure:**
```
src/modules/<domain>/__tests__/integration/
├── <endpoint>.test.ts           # API handler tests (one per endpoint)
├── <endpoint>-<param>.test.ts   # Parameterized endpoint tests
└── <domain>.service.test.ts     # Direct service method tests

tests-integration/
├── helpers/
│   ├── database.helper.ts       # DB setup/teardown
│   ├── auth.helper.ts           # Auth context builders
│   └── assertions.helper.ts     # Shared assertion utilities
├── fixtures/<domain>.fixture.ts # Valid + invalid data variants (Chance.js)
├── factories/<domain>/<domain>.factory.ts
├── utils/api-utils/<domain>.api-utils.ts
└── utils/wiremock-utils/<service>.wiremock-utils.ts
```

**Naming conventions:**
| Item | Pattern | Example |
|------|---------|---------|
| Handler test file | `<endpoint>.test.ts` | `get-notes.test.ts` |
| Service test file | `<domain>.service.test.ts` | `notes.service.test.ts` |
| Describe (handler) | `"<METHOD> /<resource-path>"` | `"POST /notes"` |
| Describe (service) | `"<ServiceName>.<methodName>()"` | `"NotesService.createNote()"` |
| Test name | `"should return <STATUS> and <outcome> when <condition>"` | `"should return 400 and fail validation when title is missing"` |
| Fixture file | `<domain>.fixture.ts` | `notes.fixture.ts` |
| Factory function | `create<Entity>` | `createNote`, `createUser` |

---

## Generation Workflow

Follow this exact sequence. Do not skip or reorder steps.

**Step 1 — Read backend source code**
Read: route handlers, service layer, DTOs/Zod schemas, DB schema (Prisma), error definitions, external service clients, **auth implementation** (determines AuthHelper approach), **error response middleware** (determines assertion format).

Record before Step 2:
1. **Auth approach**: can sessions be created directly in DB, or must signup go through HTTP?
2. **Error response shape**: what field carries the error message and code?

**Step 2 — Extract all code paths (2a → 2c)**

**Step 2a:** For each handler + service method, list every execution path as comments:
```typescript
// POST /notes handler + NotesService.createNote()
// 1. ✓ Valid input, all fields → 201
// 2. ✓ Valid input, optional fields omitted → 201
// 3. ✗ Representative invalid input → 400 VALIDATION_ERROR (wiring — exhaustive in unit tests)
// 4. ✗ Not authenticated → 401 UNAUTHORIZED
// 5. ✗ User has no organization → 403 FORBIDDEN
// 6. ✗ Organization limit reached → 429 LIMIT_REACHED
// 7. ✓ status = "published" → notification sent
// 8. ✓ status = "draft" → notification NOT sent
// 9. ✗ DB constraint violation → transaction rollback, 409 CONFLICT
```

**Step 2b — Categorize:** Positive · Validation wiring (1–2 only) · Authorization errors (401/403) · Business logic errors (404/409/429) · External service errors · Database scenarios.

**Step 2c — Verify:** Every if/else branch covered; every throw covered; every external call has success + failure test; every DB constraint has violation test.

**Step 3 — Create test infrastructure** (check `tests-integration/` first)
- 3a: DatabaseHelper (see template below)
- 3b: AuthHelper (see template below — pick HTTP or direct DB based on auth system)
- 3c: Fixtures with Chance.js
- 3d: API utilities with Axios
- 3e: Wiremock stubs for external services

**Step 4 — Write handler tests** — complete Step 4a (scenario list as comments) before Step 4b (implementation).

**Step 5 — Write service layer tests** — direct service method calls, fresh `userId`/`organizationId` via `DatabaseHelper` in `beforeEach`.

**Step 6 — Write async/cron/manual handler tests** (if applicable).

**Step 7 — Self-validate** — run the [Self-Validation Checklist](#self-validation-checklist).

---

## DatabaseHelper

`tests-integration/helpers/database.helper.ts` — create verbatim if it doesn't exist:

```typescript
import { prisma } from "@/src/lib/server";

export const DatabaseHelper = {
  /**
   * Targeted cleanup — only deletes records created by the current test.
   * Safe for parallel execution: never touches data owned by other test files.
   * Never use deleteMany({}) without a where clause.
   */
  async cleanup({
    userIds,
    organizationIds,
  }: {
    userIds: string[];
    organizationIds: string[];
  }): Promise<void> {
    // 1. Delete domain entities scoped to the test's organizations
    if (organizationIds.length) {
      await prisma.note.deleteMany({ where: { organizationId: { in: organizationIds } } });
    }
    // 2. Delete auth-related records scoped to the test's users
    if (userIds.length) {
      await prisma.member.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    // 3. Delete organizations last (after members are removed)
    if (organizationIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    }
  },

  async createUser(overrides = {}) {
    return prisma.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random()}@test.com`,
        name: "Test User",
        emailVerified: true,
        ...overrides,
      },
    });
  },

  async createOrganization(userId: string, overrides = {}) {
    return prisma.organization.create({
      data: {
        name: `Org ${Date.now()}`,
        slug: `org-${Date.now()}-${Math.random()}`,
        members: { create: { userId, role: "owner" } },
        ...overrides,
      },
    });
  },
};
```

---

## AuthHelper

`tests-integration/helpers/auth.helper.ts` — choose based on auth system (Step 1):

| Session type | Indicator | AuthHelper approach |
|-------------|-----------|-------------------|
| Cryptographically signed (JWT, signed cookies) | Server verifies signature — cannot forge by DB insert | Create via HTTP signup |
| Simple token stored in DB | Server looks up token in sessions table | Create directly in DB |

**HTTP signup approach:**
```typescript
import axios from "axios";
import { prisma } from "@/src/lib/server";

const BASE_URL = process.env.APP_URL || "http://localhost:3000";
let userCounter = 0;

export const AuthHelper = {
  async createAuthenticatedContext() {
    userCounter++;
    const email = `test-${userCounter}-${Date.now()}-${Math.random()}@test.com`;
    const password = "TestPassword123!";

    const signupResponse = await axios.post(
      `${BASE_URL}/api/auth/sign-up/email`,
      { email, password, name: `Test User ${userCounter}` },
      { validateStatus: (s) => s < 500 }
    );

    if (signupResponse.status !== 200) {
      throw new Error(`Auth setup failed: ${signupResponse.status} - ${JSON.stringify(signupResponse.data)}`);
    }

    const setCookie = signupResponse.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie || "";

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const organization = await prisma.organization.findFirst({
      where: { members: { some: { userId: user.id } } },
    });

    return { user, organization, session, cookie };
  },

  async createUnauthenticatedContext() {
    return { cookie: "" };
  },
};
```

**Direct DB approach** (when sessions are simple tokens):
```typescript
import { prisma } from "@/src/lib/server";
import { DatabaseHelper } from "./database.helper";

export const AuthHelper = {
  async createAuthenticatedContext() {
    const user = await DatabaseHelper.createUser();
    const organization = await DatabaseHelper.createOrganization(user.id);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000),
        token: `session-${Date.now()}-${Math.random()}`,
      },
    });
    // Adjust cookie format to match what your auth middleware reads
    return { user, organization, session, cookie: `session=${session.token}` };
  },

  async createUnauthenticatedContext() {
    return { cookie: "" };
  },
};
```

---

## Fixtures

`tests-integration/fixtures/<domain>.fixture.ts` — use Chance.js, never static strings:

```typescript
import Chance from "chance";
const chance = new Chance();

export const NotesFixture = {
  valid: {
    complete: () => ({
      title: chance.sentence({ words: 5 }),
      content: chance.paragraph(),
      status: "draft" as const,
    }),
    minimal: () => ({
      title: chance.sentence({ words: 3 }),
    }),
    maxLength: () => ({
      title: chance.string({ length: 255 }),
    }),
  },
  // Only 1–2 representative invalid variants for wiring tests.
  // Exhaustive variants (titleTooLong, wrongType, etc.) belong in unit tests.
  invalid: {
    missingTitle: () => ({ content: chance.paragraph() }),
    emptyTitle: () => ({ title: "", content: chance.paragraph() }),
  },
};
```

---

## API Utilities

`tests-integration/utils/api-utils/<domain>.api-utils.ts`:

```typescript
import axios, { AxiosResponse } from "axios";

export async function executePostNoteRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Promise<AxiosResponse> {
  return axios.post("/api/notes", body, {
    headers: { "Content-Type": "application/json", ...headers },
    validateStatus: () => true, // Never throw on 4xx/5xx
  });
}
```

Always use `validateStatus: () => true` — tests assert on all status codes.

---

## Handler Test Template

```typescript
/**
 * Integration tests for <domain>/<endpoint>
 * @group integration
 */
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/src/lib/server";
import { AuthHelper } from "@/tests-integration/helpers/auth.helper";
import { DatabaseHelper } from "@/tests-integration/helpers/database.helper";
import { NotesFixture } from "@/tests-integration/fixtures/notes.fixture";
import { executePostNoteRequest } from "@/tests-integration/utils/api-utils/notes.api-utils";

describe("POST /notes", () => {
  const createdUsers: string[] = [];
  const createdOrgs: string[] = [];

  afterEach(async () => {
    await DatabaseHelper.cleanup({ userIds: createdUsers, organizationIds: createdOrgs });
    createdUsers.length = 0;
    createdOrgs.length = 0;
  });

  // File-local helper: creates auth context and auto-tracks for cleanup
  async function createContext() {
    const ctx = await AuthHelper.createAuthenticatedContext();
    createdUsers.push(ctx.user.id);
    createdOrgs.push(ctx.organization.id);
    return ctx;
  }

  describe("Positive scenarios", () => {
    it("should return 201 and create note with all fields", async () => {
      const { cookie, user, organization } = await createContext();
      const dto = NotesFixture.valid.complete();

      const response = await executePostNoteRequest(dto, { cookie });

      expect(response.status).toBe(201);
      expect(response.data).toMatchObject({
        id: expect.any(String),
        title: dto.title,
        userId: user.id,
        organizationId: organization.id,
      });
      // Always verify DB after writes
      const note = await prisma.note.findUnique({ where: { id: response.data.id } });
      expect(note).toBeTruthy();
      expect(note!.title).toBe(dto.title);
    });
  });

  describe("Validation wiring", () => {
    // 1–2 representative tests only — exhaustive Zod rules are in unit tests
    it("should return 400 when title is missing", async () => {
      const { cookie } = await createContext();
      const response = await executePostNoteRequest(NotesFixture.invalid.missingTitle(), { cookie });

      expect(response.status).toBe(400);
      expect(response.data.code).toBe("VALIDATION_ERROR");
      expect(response.data.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "title" })])
      );
    });
  });

  describe("Authorization errors", () => {
    it("should return 401 when not authenticated", async () => {
      const response = await executePostNoteRequest(NotesFixture.valid.complete(), {});
      expect(response.status).toBe(401);
      expect(response.data.code).toBe("UNAUTHORIZED");
    });
  });
});
```

**Key patterns:** (1) `createdUsers`/`createdOrgs` tracked in `afterEach` for targeted cleanup. (2) File-local `createContext()` helper called inside each `it()`. (3) Always scope DB queries by `organizationId` — never use unscoped `count()`.

---

## Service Test Template

```typescript
describe("NotesService.createNote()", () => {
  let userId: string;
  let organizationId: string;
  const createdUsers: string[] = [];
  const createdOrgs: string[] = [];

  beforeEach(async () => {
    const user = await DatabaseHelper.createUser();
    const org = await DatabaseHelper.createOrganization(user.id);
    userId = user.id;
    organizationId = org.id;
    createdUsers.push(user.id);
    createdOrgs.push(org.id);
  });

  afterEach(async () => {
    await DatabaseHelper.cleanup({ userIds: createdUsers, organizationIds: createdOrgs });
    createdUsers.length = 0;
    createdOrgs.length = 0;
  });

  it("should create note and return complete object", async () => {
    const dto = NotesFixture.valid.complete();
    const result = await NotesService.createNote(userId, organizationId, dto);
    expect(result).toMatchObject({ title: dto.title, userId, organizationId });
  });

  it("should throw limitReached when organization limit is reached", async () => {
    // Seed DB to reach limit
    await expect(
      NotesService.createNote(userId, organizationId, NotesFixture.valid.complete())
    ).rejects.toThrow(Errors.limitReached);
  });
});
```

Note: service tests MAY use `beforeEach` for `userId`/`organizationId` (no HTTP context needed). Handler tests must call `createContext()` inside each `it()`.

---

## Wiremock Utilities

`tests-integration/utils/wiremock-utils/<service>.wiremock-utils.ts`:

```typescript
// Configure stub before test
export async function updateStripeCreateRefundStub(status: number): Promise<void> {
  await axios.post(process.env.WIREMOCK_ADMIN_URL + "/mappings", {
    priority: 1,
    request: { method: "POST", urlPath: "/v1/refunds" },
    response: {
      status,
      jsonBody: status === 200
        ? { id: `re_${chance.string({ length: 24 })}`, status: "succeeded" }
        : { error: "Stripe error" },
    },
  });
}

// Verify calls after test
export async function getRequestsFromWiremockJournal(): Promise<WiremockRequest[]> {
  const response = await axios.get(process.env.WIREMOCK_ADMIN_URL + "/requests");
  return response.data.requests;
}
```

---

## Async Polling

`tests-integration/utils/wait-for-availability.utils.ts`:

```typescript
export async function waitForDataAvailability<T>(
  checkFn: () => Promise<T | null>,
  options = { timeout: 30000, interval: 1000 }
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < options.timeout) {
    const result = await checkFn().catch(() => null);
    if (result != null) return result;
    await new Promise((r) => setTimeout(r, options.interval));
  }
  throw new Error(`Data not available within ${options.timeout}ms`);
}
```

For timestamp ordering tests — use explicit Prisma timestamps instead of `setTimeout`:
```typescript
// ✓ Explicit timestamps — fast and deterministic
await prisma.note.create({ data: { ...data, createdAt: new Date("2024-01-01T00:00:00Z") } });
```

---

## Critical Mistakes

| Mistake | Rule |
|---------|------|
| Exhaustive validation in integration tests | Only 1–2 representative 400 tests per endpoint. Exhaustive Zod rules belong in unit tests |
| Untested service branches | Every if/else, switch, ternary must have both positive and negative tests |
| No DB assertion after write | Always query Prisma after POST/PATCH/DELETE |
| Real external API calls | Always mock via Wiremock or vi.mock |
| Shared context in handler tests | Call `createContext()` inside each `it()`, never in `beforeEach` |
| Global `deleteMany({})` without `where` | Always scope deletes to tracked user/org IDs via `DatabaseHelper.cleanup()` |
| Missing `afterEach` cleanup | Always call `DatabaseHelper.cleanup()` with tracked IDs |
| Unscoped `count()` / `findMany()` | Always scope by `organizationId` or `userId` — parallel files have data in DB |
| Static test data | Use Chance.js — never hardcode strings like `"test@email.com"` |
| Fixed delays | Never `setTimeout`/`sleep` — use `waitForDataAvailability()` or explicit timestamps |
| `expect.anything()` | Always assert explicit values or `expect.any(String)` |
| Skipping without JIRA | Every `.skip()` must reference a ticket |

---

## Self-Validation Checklist

**Coverage completeness:**
- [ ] Each endpoint has 1–2 representative validation wiring tests — no exhaustive field validation
- [ ] Every service `if/else` branch has both positive and negative test
- [ ] Every `throw` in the service has a test that triggers it
- [ ] Every external service call has a success test and at least one failure mode test
- [ ] Every database constraint has a violation test

**Test quality:**
- [ ] Tests follow naming: `"should return <STATUS> and <outcome> when <condition>"`
- [ ] Tests grouped by category using nested `describe`
- [ ] `afterEach` calls `DatabaseHelper.cleanup()` with tracked user/org IDs — no global wipes
- [ ] Each handler `it()` calls `createContext()` independently (service tests may use `beforeEach`)
- [ ] All `prisma.*.count()` and `prisma.*.findMany()` scoped by `organizationId` or `userId`
- [ ] All external services mocked — no real API calls
- [ ] Every write operation includes a direct Prisma query assertion
- [ ] No `expect.anything()`, no snapshot tests

**Scenario planning:**
- [ ] Step 2a code path list written as comments before any implementation
- [ ] Every path in Step 2a list has a corresponding `it()` in the file

**Test execution:**
- [ ] Run: `yarn test:integration` (or equivalent)
- [ ] All tests pass (0 failures)
- [ ] Fix failures before marking complete
