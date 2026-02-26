# Integration Testing — Agent Instructions

> This document is the single source of truth for an AI agent generating integration tests.
> Follow every rule exactly. Do not add layers, patterns, or files not described here.

---

# PART 1 — ORIENTATION

## Purpose

Integration tests verify complete code paths through all layers: handler → service → database → external services. Unlike API tests (which verify HTTP contracts with minimal scenario coverage), integration tests cover **every service branch, every error throw, and every external service interaction**. Exhaustive Zod field validation (`.min()`, `.max()`, `.regex()`, `.enum()`) is delegated to unit tests — integration tests only verify that validation is wired to the handler (1–2 representative 400 tests per endpoint).

| Concern           | API tests                          | Integration tests                                                                                                    |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Coverage          | Happy path + critical negatives    | Every service branch, error throw, external call. Zod field validation → unit tests                                  |
| Data setup        | Via HTTP (authenticateUser)        | Auth context: HTTP or direct DB (depends on auth system — see Step 1). Test data: direct DB via Prisma               |
| External services | Real sandbox                       | Always mocked (Wiremock / vi.mock)                                                                                   |
| Cleanup           | Auth tracking array in `afterEach` | Targeted `DatabaseHelper.cleanup()` in `afterEach` — only records created by the test                                |
| Parallelism       | Sequential                         | **File-level parallel** (Vitest default). Tests within a file run sequentially; files run in parallel across workers |
| Execution speed   | Priority                           | Sacrificed for coverage completeness                                                                                 |

---

## Technology Stack

| Tool            | Role                                              |
| --------------- | ------------------------------------------------- |
| **Vitest**      | Test runner and assertion library                 |
| **Prisma**      | Direct database access for setup and assertions   |
| **Docker**      | Isolated test environment                         |
| **Axios**       | HTTP client for handler tests                     |
| **Chance.js**   | Realistic random test data generation             |
| **date-fns**    | Date arithmetic and fuzzy timestamp assertions    |
| **Wiremock**    | External service mocking and request verification |
| **async-mutex** | Race condition prevention for shared-state tests  |
| **TypeScript**  | Type-safe test code, DTO imports from source      |

---

## Directory Structure

```
src/modules/<domain>/
└── __tests__/
    └── integration/
        ├── <endpoint>.test.ts               # API handler tests
        ├── <endpoint>-<param>.test.ts       # Parameterized endpoint tests
        ├── <handler>.handler.test.ts        # Async handler tests (SQS/EventBridge)
        ├── <handler>.cron.test.ts           # Cron handler tests
        ├── <handler>.manual.test.ts         # Manual handler tests
        └── <domain>.service.test.ts         # Service layer tests

tests-integration/
├── constants/
│   └── test-error-messages.ts              # Centralized error message constants
├── fixtures/
│   └── <domain>.fixture.ts                 # Comprehensive test data (valid + invalid variants)
├── helpers/
│   ├── database.helper.ts                  # DB setup/teardown utilities
│   ├── auth.helper.ts                      # Auth context builders (direct DB, not HTTP)
│   ├── assertions.helper.ts                # Shared assertion utilities
│   ├── wiremock.helper.ts                  # Wiremock journal queries
│   └── lambda.helper.ts                   # Lambda invocation utilities
├── mocks/
│   ├── external-services/
│   │   └── <service>.mock.ts               # Third-party service mocks
│   └── internal-services/
│       └── <service>.mock.ts               # Internal microservice mocks
├── factories/
│   └── <domain>/
│       └── <domain>.factory.ts             # Chance.js-based data generators
├── utils/
│   ├── api-utils/
│   │   └── <domain>.api-utils.ts           # HTTP request wrappers per domain
│   ├── db-utils/
│   │   └── <domain>-db.utils.ts            # Domain-specific DB utilities
│   ├── wiremock-utils/
│   │   └── <service>.wiremock-utils.ts     # Service-specific Wiremock stubs
│   ├── sqs/
│   │   └── <message-type>.sqs-utils.ts     # SQS message helpers
│   ├── date.utils.ts                       # Date calculation helpers
│   └── wait-for-availability.utils.ts      # Polling helpers for async operations
├── setup.ts                                # Global env config (dotenv)
└── setup-after-env.ts                      # DB init, lifecycle hooks
```

---

## Naming Conventions

| Item                       | Pattern                                                   | Example                                                       |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Test file (API handler)    | `<endpoint>.test.ts`                                      | `get-notes.test.ts`                                           |
| Test file (parameterized)  | `<endpoint>-<param>.test.ts`                              | `get-notes-id.test.ts`                                        |
| Test file (async handler)  | `<handler>.handler.test.ts`                               | `process-payment.handler.test.ts`                             |
| Test file (cron handler)   | `<handler>.cron.test.ts`                                  | `daily-cleanup.cron.test.ts`                                  |
| Test file (manual handler) | `<handler>.manual.test.ts`                                | `create-days-out.manual.test.ts`                              |
| Test file (service)        | `<domain>.service.test.ts`                                | `notes.service.test.ts`                                       |
| Describe string (API)      | `"<METHOD> /<resource-path>"`                             | `"POST /notes"`                                               |
| Describe string (service)  | `"<ServiceName>.<methodName>()"`                          | `"NotesService.createNote()"`                                 |
| Test name                  | `"should return <STATUS> and <outcome> when <condition>"` | `"should return 400 and fail validation when title is empty"` |
| Fixture file               | `<domain>.fixture.ts`                                     | `notes.fixture.ts`                                            |
| Factory function           | `create<Entity>`                                          | `createNote`, `createUser`                                    |
| Wiremock stub function     | `update<Service><Operation>Stub`                          | `updateStripeCreateRefundStub`                                |

---

# PART 2 — GENERATION WORKFLOW

Follow this exact sequence for every module. Do not skip or reorder steps.

## Step 1 — Read backend source code

Read the following files before writing any code:

| What to read                  | Location                                        | What to extract                                                                                                                                                |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route handlers                | `app/api/<path>/route.ts`                       | All HTTP methods, middleware, auth guards, every error path                                                                                                    |
| Service layer                 | `src/modules/<domain>/<domain>.service.ts`      | Every method, every `if/else`, every `throw`, transaction boundaries                                                                                           |
| DTOs + Zod schemas            | `src/modules/<domain>/<domain>.dto.ts`          | Required/optional fields, field types — to know which fields to use in valid fixtures. Exhaustive Zod rule testing belongs in unit tests (see UNIT_TESTING.md) |
| Database schema               | `prisma/schema.prisma`                          | Entity relations, unique constraints, cascades, indexes                                                                                                        |
| Error definitions             | `src/lib/server/errors.ts`                      | All error types, codes, messages                                                                                                                               |
| External service clients      | `src/lib/<service>.ts`                          | Every integration point, request/response shapes, error handling                                                                                               |
| **Auth implementation**       | `src/lib/auth.ts` or equivalent                 | How sessions are created and validated — determines `AuthHelper` approach (see Step 3b)                                                                        |
| **Error response middleware** | `src/lib/server/error-handler.ts` or equivalent | Exact error response shape (`{ message }`, `{ error, code }`, etc.) — determines assertion format                                                              |

**Before proceeding to Step 2:** record two facts from your Step 1 reading:

1. **Auth approach** — can sessions be created directly in DB, or must signup go through HTTP? (determines `AuthHelper` implementation in Step 3b)
2. **Error response shape** — what field carries the error message and code? (determines assertion format throughout all tests)

**After reading the error handler, document:**

1. **Validation error shape** - Does it have a `details` array? What fields are in each detail object?
2. **Business error shape** - What field carries the error message (`error` or `message`)?
3. **Error codes** - What codes are used (VALIDATION_ERROR, NOT_FOUND, FORBIDDEN, etc.)?

For each handler and service method, complete Steps 2a → 2c before writing any code.

### Step 2a — Extract all code paths

List every execution path in the target code. Use inline comments to track coverage:

```typescript
// Example: POST /notes handler + NotesService.createNote()
// 1. ✓ Valid input, all fields → 201
// 2. ✓ Valid input, optional fields omitted → 201
// 3. ✗ Representative invalid input → 400 VALIDATION_ERROR (wiring check — exhaustive field validation is in unit tests)
// 4. ✗ Not authenticated → 401 UNAUTHORIZED
// 5. ✗ User has no organization → 403 FORBIDDEN
// 6. ✗ Organization note limit reached → 429 LIMIT_REACHED
// 7. ✓ status = "published" → notification sent
// 8. ✓ status = "draft" → notification NOT sent
// 9. ✗ Database constraint violation → transaction rollback, 409 CONFLICT
```

### Step 2b — Categorize scenarios

Organize paths into these groups:

**Positive:** happy path (required fields only), happy path (all fields), optional fields omitted, boundary values (max valid string, min valid number), state transitions, concurrent operations, transaction success

**Validation wiring (1–2 representative tests per endpoint):** pick one or two representative invalid inputs to confirm Zod validation is connected to the handler. Exhaustive field-by-field validation belongs in unit tests (see UNIT_TESTING.md)

**Authorization errors:** no session (401), wrong organization (403), insufficient role (403)

**Business logic errors:** resource not found (404), duplicate resource (409), limit exceeded (429), invalid state transition, dependency missing

**External service errors:** third-party returns 4xx, third-party returns 5xx, network timeout, malformed response

**Database scenarios:** transaction rollback on validation error, transaction rollback on constraint violation, cascade operations, unique constraint violations

### Step 2c — Verify coverage completeness

Before proceeding to Step 3, confirm:

- At least 1–2 representative validation error tests per endpoint (wiring check only — exhaustive Zod rules are covered in unit tests)
- Every `if/else` and `switch` branch has both a positive and negative test
- Every `throw` in the service has a test
- Every external service call has both a success and failure mock test
- Every database constraint has a violation test

Write the scenario list as comments inside the `describe` block before implementing any `it()`.

---

## Step 3 — Create test infrastructure

Create only what does not already exist. Check `tests-integration/` before creating new files.

### Step 3a — Database helper

`tests-integration/helpers/database.helper.ts`

```typescript
import { prisma } from "@/src/lib/server";

export const DatabaseHelper = {
  /**
   * Targeted cleanup — deletes only the records created by the current test.
   * Safe for parallel execution: never touches data owned by other test files.
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

> **Why no `clearAll()`?** Tests run in parallel at file level. A global `deleteMany({})` in one file would destroy data that another file's tests are actively using. Targeted cleanup by user/org IDs ensures each file only touches its own data.

### Step 3b — Authentication helper

`tests-integration/helpers/auth.helper.ts`

Before implementing `AuthHelper`, read the auth implementation (identified in Step 1) and answer: **can a valid session be created without going through the auth HTTP flow?**

| Session type                                   | How to determine                                                                                      | `AuthHelper` approach                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Cryptographically signed (JWT, signed cookies) | Token contains a signature that the server verifies — cannot be forged by inserting a raw value in DB | Create context via real HTTP signup endpoint |
| Simple token stored in DB                      | Server validates by looking up the token in the sessions table — any token that exists there is valid | Create context directly in DB via Prisma     |

**If HTTP signup is required:**

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

    // Sign up via HTTP to get a properly signed session
    const signupResponse = await axios.post(
      `${BASE_URL}/api/auth/sign-up/email`, // adjust path to match your auth endpoint
      { email, password, name: `Test User ${userCounter}` },
      { validateStatus: (s) => s < 500 }
    );

    if (signupResponse.status !== 200) {
      throw new Error(
        `Auth setup failed: ${signupResponse.status} - ${JSON.stringify(signupResponse.data)}`
      );
    }

    const setCookie = signupResponse.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie || "";

    // Fetch the user and session created by the signup from DB
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Fetch the organization — adjust based on whether signup auto-creates one
    // or whether you need to create it explicitly here
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

**If direct DB creation is sufficient:**

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
    // Adjust cookie format to match what your auth middleware expects
    return { user, organization, session, cookie: `session=${session.token}` };
  },

  async createUnauthenticatedContext() {
    return { cookie: "" };
  },
};
```

**Important:** the returned `cookie` format must exactly match what the auth middleware reads. Check the middleware before choosing the format string.

### Step 3c — Fixtures

`tests-integration/fixtures/<domain>.fixture.ts`

Fixtures provide named data variants — valid, minimal, invalid. Use [Chance.js](https://chancejs.com/) for realistic data. Do NOT use static strings.

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
      content: chance.string({ length: 10000 }),
    }),
    withStatus: (status: "draft" | "published") => ({
      title: chance.sentence({ words: 4 }),
      status,
    }),
  },
  // Only 1–2 representative invalid variants needed for integration wiring tests.
  // Exhaustive invalid variants (titleTooLong, wrongType, invalidStatus, etc.) belong in unit tests.
  invalid: {
    missingTitle: () => ({ content: chance.paragraph() }),
    emptyTitle: () => ({ title: "", content: chance.paragraph() }),
  },
};
```

### Step 3d — API utilities (for handler tests)

`tests-integration/utils/api-utils/<domain>.api-utils.ts`

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

**Rules:**

- Always use `validateStatus: () => true` — tests assert on all status codes, never let axios throw
- Accept `headers` as parameter — pass `{ cookie }` for authenticated, empty object for unauthenticated
- One function per endpoint, one file per domain

### Step 3e — Create mock stubs (for external services)

`tests-integration/utils/wiremock-utils/<service>.wiremock-utils.ts`

One file per external service. See [Wiremock Utilities](#wiremock-utilities) in Part 3.

---

## Step 4 — Write handler tests

`src/modules/<domain>/__tests__/integration/<endpoint>.test.ts`

For each file, complete Step 4a before Step 4b.

### Step 4a — Plan scenarios

Write the scenario list as `describe` group headers and `it()` descriptions as comments before any implementation. Count scenarios per group and confirm all paths from Step 2 are covered.

```typescript
/**
 * Integration tests for notes/post-notes
 * @group integration
 */
describe("POST /notes", () => {
  // Positive scenarios
  // - should return 201 and create note with all fields
  // - should return 201 and create note with required fields only
  // - should return 201 and send notification when status is published
  // - should return 201 and NOT send notification when status is draft
  // - should persist note to database
  // Validation wiring (1–2 representative tests — exhaustive Zod rules are in unit tests)
  // - should return 400 when title is missing (proves Zod is wired to handler)
  // Authorization errors
  // - should return 401 when not authenticated
  // - should return 403 when user has no organization
  // Business logic errors
  // - should return 429 when organization note limit is reached
  // Database scenarios
  // - should rollback transaction when constraint violation occurs
});
```

Only proceed to 4b when the scenario list covers every path from Step 2c.

### Step 4b — Implement tests

**Validation Error Assertion Pattern (for the 1–2 representative wiring tests):**

Before implementing validation wiring tests, verify the error handler structure. For Zod validation errors:

- `status`: 400
- `code`: "VALIDATION_ERROR"
- `error`: Generic message (e.g., "Validation failed")
- `details`: Array of objects with `path` and `message` fields

**Always assert on the `details` array for field-specific validation:**

```typescript
expect(response.data.details).toEqual(
  expect.arrayContaining([expect.objectContaining({ path: "fieldName" })])
);
```

---

```typescript
/**
 * Integration tests for notes/post-notes
 * @group integration
 */

import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/src/lib/server";
import { AuthHelper } from "@/tests-integration/helpers/auth.helper";
import { DatabaseHelper } from "@/tests-integration/helpers/database.helper";
import { NotesFixture } from "@/tests-integration/fixtures/notes.fixture";
import { executePostNoteRequest } from "@/tests-integration/utils/api-utils/notes.api-utils";

describe("POST /notes", () => {
  // Track created data for targeted cleanup
  const createdUsers: string[] = [];
  const createdOrgs: string[] = [];

  afterEach(async () => {
    await DatabaseHelper.cleanup({ userIds: createdUsers, organizationIds: createdOrgs });
    createdUsers.length = 0;
    createdOrgs.length = 0;
  });

  // Helper to create context and register for cleanup
  async function createContext() {
    const ctx = await AuthHelper.createAuthenticatedContext();
    createdUsers.push(ctx.user.id);
    createdOrgs.push(ctx.organization.id);
    return ctx;
  }

  // =========================================================
  // POSITIVE SCENARIOS
  // =========================================================

  describe("Positive scenarios", () => {
    it("should return 201 and create note with all fields", async () => {
      // Arrange
      const { cookie, user, organization } = await createContext();
      const dto = NotesFixture.valid.complete();

      // Act
      const response = await executePostNoteRequest(dto, { cookie });

      // Assert response
      expect(response.status).toBe(201);
      expect(response.data).toMatchObject({
        id: expect.any(String),
        title: dto.title,
        content: dto.content,
        userId: user.id,
        organizationId: organization.id,
      });

      // Assert database
      const note = await prisma.note.findUnique({ where: { id: response.data.id } });
      expect(note).toBeTruthy();
      expect(note!.title).toBe(dto.title);
    });

    it("should return 201 and create note with required fields only", async () => {
      const { cookie } = await createContext();
      const dto = NotesFixture.valid.minimal();

      const response = await executePostNoteRequest(dto, { cookie });

      expect(response.status).toBe(201);
      expect(response.data.content).toBeNull();
    });
  });

  // =========================================================
  // VALIDATION WIRING (representative — exhaustive Zod rules are in unit tests)
  // =========================================================

  describe("Validation wiring", () => {
    it("should return 400 and fail validation when title is missing", async () => {
      const { cookie } = await createContext();

      const response = await executePostNoteRequest(NotesFixture.invalid.missingTitle(), {
        cookie,
      });

      expect(response.status).toBe(400);
      expect(response.data.code).toBe("VALIDATION_ERROR");
      expect(response.data.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "title" })])
      );
    });
  });

  // =========================================================
  // AUTHORIZATION ERRORS
  // =========================================================

  describe("Authorization errors", () => {
    it("should return 401 and fail when not authenticated", async () => {
      const response = await executePostNoteRequest(NotesFixture.valid.complete(), {});

      expect(response.status).toBe(401);
      expect(response.data.code).toBe("UNAUTHORIZED");
    });

    it("should return 403 and fail when user has no organization", async () => {
      // Create a valid auth context, then strip the organization membership.
      // This gives us a properly authenticated user regardless of auth system.
      const { cookie, user } = await createContext();
      await prisma.member.deleteMany({ where: { userId: user.id } });

      const response = await executePostNoteRequest(NotesFixture.valid.complete(), { cookie });

      // Adjust expected status to match what your system returns for missing org:
      // 403 (FORBIDDEN) or 404 (NOT_FOUND) — read the service/handler to confirm.
      expect(response.status).toBe(403);
    });
  });

  // =========================================================
  // DATABASE SCENARIOS
  // =========================================================

  describe("Database scenarios", () => {
    it("should rollback transaction when constraint violation occurs", async () => {
      const { cookie, organization, user } = await createContext();

      await prisma.note.create({
        data: { title: "Duplicate Title", organizationId: organization.id, userId: user.id },
      });

      const initialCount = await prisma.note.count({ where: { organizationId: organization.id } });

      const response = await executePostNoteRequest({ title: "Duplicate Title" }, { cookie });

      expect(response.status).toBe(409);
      expect(await prisma.note.count({ where: { organizationId: organization.id } })).toBe(
        initialCount
      );
    });
  });
});
```

> **Key patterns:** (1) Tracking arrays `createdUsers`/`createdOrgs` registered in `afterEach` for targeted cleanup. (2) A file-local `createContext()` helper that wraps `AuthHelper.createAuthenticatedContext()` and auto-tracks for cleanup. (3) `prisma.note.count()` is scoped by `organizationId` — never use unscoped `count()` since parallel files may have data in other orgs.

---

## Step 5 — Write service layer tests

`src/modules/<domain>/__tests__/integration/<domain>.service.test.ts`

Service tests call the service method directly (no HTTP). Use `beforeEach` to set up a fresh user/org context and track for cleanup.

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

  describe("Positive scenarios", () => {
    it("should create note and return complete object", async () => {
      const dto = NotesFixture.valid.complete();
      const result = await NotesService.createNote(userId, organizationId, dto);

      expect(result).toMatchObject({ title: dto.title, userId, organizationId });
    });
  });

  describe("Error scenarios", () => {
    it("should throw limitReached when organization note limit is reached", async () => {
      for (let i = 0; i < 100; i++) {
        await prisma.note.create({ data: { title: `Note ${i}`, organizationId, userId } });
      }

      await expect(
        NotesService.createNote(userId, organizationId, NotesFixture.valid.complete())
      ).rejects.toThrow(Errors.limitReached);
    });
  });

  describe("Transaction scenarios", () => {
    it("should rollback and leave count unchanged when constraint is violated", async () => {
      await prisma.note.create({ data: { title: "Unique", organizationId, userId } });
      const initialCount = await prisma.note.count({ where: { organizationId } });

      await expect(
        NotesService.createNote(userId, organizationId, { title: "Unique" })
      ).rejects.toThrow();

      expect(await prisma.note.count({ where: { organizationId } })).toBe(initialCount);
    });
  });
});
```

---

## Step 6 — Write async / cron / manual handler tests (if applicable)

**Async handlers** (SQS/EventBridge): invoke via `callSqsLambda()`, verify side effects in DB and Wiremock.

**Cron handlers**: invoke directly, verify state changes in DB.

**Manual handlers**: invoke via `lambdaInvoke()`, verify DB and response.

See [Lambda Helper](#lambda-helper) and [Async Handler Patterns](#async-handler-patterns) in Part 3.

---

## Step 7 — Self-validate

Run the [Self-Validation Checklist](#self-validation-checklist) against every created file. Fix all failures before marking the task complete.

---

# PART 3 — REFERENCE

## Infrastructure Components

### Wiremock utilities

`tests-integration/utils/wiremock-utils/<service>.wiremock-utils.ts`

One file per external service. Configure stubs before the test, verify calls via journal after.

```typescript
// Configure stub
export async function updateStripeCreateRefundStub(status: number): Promise<void> {
  await axios.post(process.env.WIREMOCK_ADMIN_URL + "/mappings", {
    priority: 1,
    request: { method: "POST", urlPath: "/v1/refunds" },
    response: {
      status,
      jsonBody:
        status === 200
          ? { id: `re_${chance.string({ length: 24 })}`, status: "succeeded" }
          : { error: "Stripe error" },
    },
  });
}

// Verify call
export async function getRequestsFromWiremockJournal(): Promise<WiremockRequest[]> {
  const response = await axios.get(process.env.WIREMOCK_ADMIN_URL + "/requests");
  return response.data.requests;
}

export async function isSQSMessageSent(options: {
  queueUrl: string;
  messageBody?: Record<string, unknown>;
}): Promise<boolean> {
  const requests = await getRequestsFromWiremockJournal();
  const matches = requests.filter((r) => r.request.body.includes(options.queueUrl));
  if (!matches.length) return false;
  if (!options.messageBody) return true;
  return matches.some((r) => {
    const params = new URLSearchParams(r.request.body);
    const body = JSON.parse(params.get("MessageBody") || "{}");
    return isMatch(body, options.messageBody!);
  });
}
```

**Usage:**

```typescript
it("should send Stripe refund request", async () => {
  await updateStripeCreateRefundStub(200);

  const response = await executeRefundRequest(refundData, { cookie });
  expect(response.status).toBe(201);

  const requests = await getRequestsFromWiremockJournal();
  const stripeCall = requests.find((r) => r.request.url.includes("/v1/refunds"));
  expect(stripeCall).toBeDefined();
});
```

---

### Lambda helper

`tests-integration/helpers/lambda.helper.ts`

```typescript
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

export async function invokeLambda<T>(
  functionName: string,
  payload?: object
): Promise<{ statusCode: number; payload: T }> {
  const result = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: payload ? JSON.stringify(payload) : undefined,
    })
  );
  return {
    statusCode: result.StatusCode ?? 500,
    payload: JSON.parse(result.Payload?.transformToString() || "{}"),
  };
}

export async function callSqsLambda<T>(
  queueUrl: string,
  payload: object
): Promise<{ statusCode: number; payload: T }> {
  return invokeLambda<T>(process.env.SQS_LAMBDA_NAME!, {
    Records: [
      {
        eventSource: "aws:sqs",
        eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queueUrl}`,
        body: JSON.stringify(payload),
      },
    ],
  });
}
```

---

### Data factories

`tests-integration/factories/<domain>/<domain>.factory.ts`

Use Chance.js for all generated values. Never use static strings or `Date.now()` concatenation as the only source of uniqueness.

```typescript
import Chance from "chance";
const chance = new Chance();

export function generateCreateNoteDto(overrides: Partial<CreateNoteDto> = {}): CreateNoteDto {
  return {
    title: chance.sentence({ words: 5 }),
    content: chance.paragraph(),
    ...overrides,
  };
}
```

**Validation-aware generation** — when a field has format rules, generate and validate in a loop:

```typescript
export function generateValidPhone(): string {
  let phone: string;
  do {
    phone = `+1${chance.string({ length: 10, pool: "0123456789" })}`;
  } while (!phoneRule.pattern.test(phone));
  return phone;
}
```

---

### DB utilities

`tests-integration/utils/db-utils/<domain>-db.utils.ts`

Use for multi-step setup that would be verbose inline:

```typescript
export async function createUserWithOrganization(
  userOverrides = {},
  orgOverrides = {}
): Promise<{ user: User; organization: Organization }> {
  const user = await prisma.user.create({
    data: { email: `t-${Date.now()}@t.com`, name: "Test", emailVerified: true, ...userOverrides },
  });
  const organization = await prisma.organization.create({
    data: {
      name: `Org ${Date.now()}`,
      slug: `org-${Date.now()}`,
      members: { create: { userId: user.id, role: "owner" } },
      ...orgOverrides,
    },
  });
  return { user, organization };
}
```

---

### Async polling

`tests-integration/utils/wait-for-availability.utils.ts`

Never use `setTimeout` fixed delays. Use polling for eventually-consistent operations, or explicit timestamp overrides for ordering tests.

**For eventually-consistent operations** (async handlers, external service propagation) — use polling:

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

**For ordering / timestamp tests** (e.g., verifying `createdAt` or `updatedAt` sorting) — set explicit timestamps via Prisma instead of waiting for the clock to tick:

```typescript
// ✗ Wrong — real delay, slow, non-deterministic
const note1 = await prisma.note.create({ data: { ...note1Data, userId, organizationId } });
await new Promise((resolve) => setTimeout(resolve, 100));
const note2 = await prisma.note.create({ data: { ...note2Data, userId, organizationId } });

// ✓ Correct — explicit timestamps, fast, deterministic
const note1 = await prisma.note.create({
  data: { ...note1Data, userId, organizationId, createdAt: new Date("2024-01-01T00:00:00Z") },
});
const note2 = await prisma.note.create({
  data: { ...note2Data, userId, organizationId, createdAt: new Date("2024-01-02T00:00:00Z") },
});
```

Prisma's `@default(now())` only applies when the field is omitted — providing an explicit value overrides the default.

---

### Error message constants

`tests-integration/constants/test-error-messages.ts`

```typescript
export enum TestErrorMessages {
  UserNotFound = "User not found",
  OrganizationNotFound = "Organization not found",
  UnauthorizedAccess = "Unauthorized access",
  RateLimitExceeded = "Rate limit exceeded",
}
```

**Before writing any error assertions**, read the error response middleware (identified in Step 1) to determine the exact shape. Common shapes:

| Shape                                           | Assertion                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `{ message: "..." }`                            | `expect(response.data.message).toBe(TestErrorMessages.UserNotFound)` |
| `{ error: "..." }`                              | `expect(response.data.error).toBe(TestErrorMessages.UserNotFound)`   |
| `{ error: "...", code: "...", details: [...] }` | `expect(response.data.code).toBe("NOT_FOUND")`                       |

Use whichever field your system actually returns. Never assume — always verify against the real middleware first.

---

## Test File Rules

### Structure rules

1. **JSDoc header** — every test file starts with `@group integration` annotation
2. **Targeted cleanup in `afterEach`** — call `DatabaseHelper.cleanup()` with the tracked user/org IDs. Never use global `deleteMany({})` without a `where` clause — it destroys data from parallel test files. Handler tests need only `afterEach`; service tests use `beforeEach` for context setup + `afterEach` for cleanup
3. **Arrange-Act-Assert** — every test follows this pattern explicitly
4. **Grouped by category** — use nested `describe` blocks: Positive scenarios / Validation errors / Authorization errors / Business logic errors / Database scenarios
5. **Test name format** — `"should return <STATUS> and <outcome> when <condition>"`
6. **No shared mutable state in handler tests** — each `it()` calls the file-local `createContext()` helper (which wraps `AuthHelper.createAuthenticatedContext()` and auto-tracks for cleanup). Never share `user`, `organization`, or `cookie` across tests via outer-scope variables. **Exception for service tests:** service tests may create `userId` and `organizationId` in `beforeEach` via `DatabaseHelper` (no HTTP, no cookie), since service methods take these as plain parameters — see Step 5 example
7. **Direct DB assertions** — after every write operation, query Prisma to verify persistence. Never rely solely on the HTTP response
8. **Scoped queries** — always scope `prisma.*.count()` and `prisma.*.findMany()` by `organizationId` or `userId`. Never use unscoped queries — parallel test files may have data in other organizations

### Isolation rules (parallel-safe)

Tests run in **file-level parallelism** — multiple test files execute simultaneously across Vitest workers, but tests within a single file run sequentially.

1. **No global wipes** — never call `deleteMany({})` without a `where` clause. Each test cleans up only its own data via `DatabaseHelper.cleanup()` with tracked IDs. The database starts fresh per run; no `beforeEach` cleanup is needed in handler tests
2. **Each `it()` creates its own context in handler tests** — call the file-local `createContext()` helper inside the test, never in `beforeEach`. **Exception for service tests:** `userId` and `organizationId` may be created in `beforeEach` via `DatabaseHelper` since no HTTP context is needed
3. **Track all created data** — every user and organization created during a test must be tracked in file-scoped arrays (`createdUsers`, `createdOrgs`) and cleaned up in `afterEach`
4. **Mock all external services** — never call real third-party APIs. Configure Wiremock stubs before the test
5. **No test interdependencies** — tests must pass in any order and in parallel with other files
6. **Unique data always** — use Chance.js or `Date.now() + Math.random()` for all IDs and unique fields
7. **Scoped DB queries** — always filter by `organizationId` or `userId` when counting or listing records. Unscoped queries see data from parallel test files and produce flaky assertions
8. **Sequential tests** — if tests modify shared global state (feature flags, environment config), use `async-mutex` and tag with `@group sequential-integration`

### Assertion rules

1. **Always assert both status code AND body** — never assert only `response.status`
2. **Always verify DB after writes** — query Prisma after POST/PATCH/DELETE to confirm persistence
3. **Always verify DB after expected failures** — confirm nothing was persisted when it should not have been
4. **Error assertions must include the error code field** — assert the error code field (e.g. `response.data.code`) not just `response.status`. Use the exact field name from your error middleware
5. **No `expect.anything()`** — always assert explicit values or `expect.any(String)`
6. **Timestamp assertions use tolerance** — use `differenceInSeconds(actual, expected) <= 3` not exact equality

### Validation wiring tests

Integration tests only verify that Zod validation is connected to the handler — **1–2 representative invalid inputs per endpoint**. Exhaustive field-by-field validation (every `.min()`, `.max()`, `.regex()`, `.enum()`, required field, type mismatch) belongs in unit tests (see UNIT_TESTING.md).

```typescript
describe("Validation wiring", () => {
  it("should return 400 and fail validation when title is missing", async () => {
    const { cookie } = await AuthHelper.createAuthenticatedContext();
    const response = await executePostNoteRequest(NotesFixture.invalid.missingTitle(), { cookie });

    expect(response.status).toBe(400);
    expect(response.data.code).toBe("VALIDATION_ERROR");
    expect(response.data.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "title" })])
    );
  });
});
```

---

### Async handler patterns

Key rules for async handler tests:

1. **Lambda always returns 200** — handlers catch errors internally. Assert `statusCode === 200` even for error scenarios
2. **Verify side effects** — check DB state, SQS messages, Wiremock journal after invocation
3. **Test idempotency** — send the same message twice, verify no duplicate processing
4. **Test malformed input** — send invalid message body, verify graceful handling (no throw, error logged)

```typescript
it("should return 200 and update payment status when Stripe fails", async () => {
  await updateStripePaymentStub(500); // Configure failure before test
  const payment = await prisma.payment.create({
    data: { userId, amount: 1000, status: "pending" },
  });

  const result = await callSqsLambda("process-payment-queue", { paymentId: payment.id });

  expect(result.statusCode).toBe(200);
  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  expect(updated!.status).toBe("failed");
});
```

---

## Coverage Requirements

Integration tests require complete coverage of **service logic, error paths, and external interactions**:

| Category               | Requirement                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Zod validation wiring  | 1–2 representative invalid inputs per endpoint to prove Zod is connected. Exhaustive field rules → unit tests |
| Service branches       | Every `if/else`, `switch`, ternary → both branches tested                                                     |
| Error throws           | Every `throw` in services and handlers → test that triggers it                                                |
| External service calls | Every call → success mock test + each failure mode test                                                       |
| Database constraints   | Every `unique`, `foreign key`, cascade → violation test                                                       |

**Out of scope (delegated to unit tests):**

- Exhaustive Zod field validation (every `.min()`, `.max()`, `.regex()`, `.enum()`, required field, type mismatch) — see UNIT_TESTING.md

**Out of scope (not tested at any level):**

- Infrastructure testing (Terraform configs)
- Third-party service internal behavior
- SNS/EventBridge → SQS delivery flow (infrastructure-level concern)

**Skipping tests:** only allowed with JIRA ticket reference. Never skip to reach a coverage threshold.

```typescript
// ✓ Correct
// PROJ-1234: Temporarily skipped — Stripe webhook signature verification not yet implemented
it.skip("should verify webhook signature", async () => { ... });

// ✗ Forbidden — no ticket
it.skip("should process refund", async () => { ... });
```

---

# PART 4 — FINAL VALIDATION

## Critical Mistakes

| Mistake                                    | Rule                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exhaustive validation in integration tests | Integration tests need only 1–2 representative 400 tests per endpoint to verify wiring. Exhaustive Zod field validation belongs in unit tests                                         |
| Untested service branches                  | Every `if/else`, `switch`, ternary must have both positive and negative tests                                                                                                         |
| Missing error throw tests                  | Every `throw` in backend code must have a test that triggers it                                                                                                                       |
| No DB assertion after write                | Always query Prisma after POST/PATCH/DELETE to verify persistence                                                                                                                     |
| Real external API calls                    | Always mock via Wiremock. Never call real third-party APIs                                                                                                                            |
| Shared context in handler tests            | Call the file-local `createContext()` helper inside each `it()`, never in `beforeEach`. Service tests may share `userId`/`organizationId` via `beforeEach` using `DatabaseHelper`     |
| Global `deleteMany({})` without `where`    | Never wipe entire tables — it destroys data from parallel test files. Always scope deletes to tracked user/org IDs via `DatabaseHelper.cleanup()`                                     |
| Missing `afterEach` cleanup                | `afterEach` must call `DatabaseHelper.cleanup()` with tracked IDs. Skipping it leaks data and bloats the DB during the run                                                            |
| Unscoped `count()` / `findMany()`          | Always scope by `organizationId` or `userId`. Unscoped queries see data from parallel files and produce flaky results                                                                 |
| Static test data                           | Use Chance.js factories and fixtures. Never hardcode strings like `"test@email.com"`                                                                                                  |
| Fixed delays                               | Never use `setTimeout` / `sleep`. Use `waitForDataAvailability()` polling for async operations, or explicit timestamp overrides (e.g., `createdAt: new Date(...)`) for ordering tests |
| Skipping without JIRA                      | Every `.skip()` must reference a ticket                                                                                                                                               |
| Vague test names                           | Always follow: `"should return <STATUS> and <outcome> when <condition>"`                                                                                                              |
| `expect.anything()`                        | Always assert explicit values or `expect.any(String)`                                                                                                                                 |

---

## Self-Validation Checklist

After generating all test files for a module, re-read every created file and validate:

**Coverage completeness:**

- [ ] Each endpoint has 1–2 representative validation wiring tests (proves Zod is connected). No exhaustive field validation — that belongs in unit tests
- [ ] Every service `if/else` branch has both a positive and negative test
- [ ] Every `throw` in the service has a test that triggers it
- [ ] Every external service call has a success test and at least one failure mode test
- [ ] Every database constraint has a violation test

**Test quality:**

- [ ] All tests follow naming format: `"should return <STATUS> and <outcome> when <condition>"`
- [ ] Tests are grouped by category using nested `describe`
- [ ] `afterEach` calls `DatabaseHelper.cleanup()` with tracked user/org IDs — no global wipes
- [ ] Each handler test `it()` calls the file-local `createContext()` helper independently (service tests may use `beforeEach`)
- [ ] All `prisma.*.count()` and `prisma.*.findMany()` calls are scoped by `organizationId` or `userId` — no unscoped queries
- [ ] All external services are mocked — no real API calls
- [ ] Every write operation assertion includes a direct Prisma query
- [ ] No `expect.anything()`, no snapshot tests

**Scenario planning:**

- [ ] Step 2a code path list was written before any implementation
- [ ] Every path in the Step 2a list has a corresponding `it()` in the file

**Test execution:**

- [ ] Run all integration tests (`yarn test:integration` or equivalent command)
- [ ] Verify all tests pass (0 failures)
- [ ] Fix any failing tests before considering the work complete
- [ ] Re-run tests after fixes to confirm all pass

Fix all failures before marking the task complete.
