# API Testing — Agent Instructions

> This document is the single source of truth for an AI agent generating API tests.
> Follow every rule exactly. Do not add layers, patterns, or files not described here.

---

# PART 1 — ORIENTATION

## Technology Stack

| Tool | Role |
|------|------|
| **Playwright** | Test runner and HTTP client (API request context) |
| **TypeScript** | Type-safe test code with test-owned payload interfaces |

---

## Playwright Configuration

API tests run as a separate Playwright project alongside E2E tests. The base URL is configured per environment via Playwright config; individual test specs must not read `process.env` directly and should instead rely on config or shared helpers.

```typescript
// playwright.config.ts (add API project to existing config)
export default defineConfig({
  projects: [
    {
      name: "api",
      testDir: "src/modules",
      testMatch: "**/test/api/**/*.spec.ts",
      use: {
        baseURL: process.env.API_URL || "http://localhost:3000",
      },
    },
    {
      name: "e2e",
      testDir: "e2e/tests",
      use: {
        baseURL: process.env.APP_URL || "http://localhost:3000",
      },
    },
  ],
});
```

Run API tests: `npx playwright test --project=api`

---

## Directory Structure

```
src/modules/<domain>/
└── test/
    └── api/
        └── <method>-<endpoint>.spec.ts   # Test specs (one per endpoint)

tests-api/
├── helpers/
│   ├── response.helper.ts               # Response assertion helpers
│   └── auth.helper.ts                   # Authentication utilities
├── utils/api-utils/<domain>/
│   └── <domain>.api-utils.ts            # Per-domain request builders
├── factories/<domain>/
│   └── <domain>.factory.ts              # Payload interfaces + test data generators
├── test-data/<domain>/
│   └── <domain>.data.ts                 # Static immutable constants
├── enums/
│   └── <concept>.enum.ts                # Type-safe domain constants
├── cleanups/
│   └── <domain>.cleanup.ts              # Post-test data removal
└── types.ts                             # Shared types (ApiResponse)
```

---

## Naming Conventions

| Item | Pattern | Example |
|------|---------|---------|
| Test file | `<method>-<endpoint>.spec.ts` | `post-notes.spec.ts` |
| Parameterized endpoint test file | `<method>-<resource>-<param>.spec.ts` | `get-notes-id.spec.ts`, `patch-notes-id.spec.ts` |
| Nested resource test file | `<method>-<parent>-<child>.spec.ts` | `post-project-members.spec.ts` |
| Describe string (flat) | `"<METHOD> /api/<resource>"` | `"GET /api/notes"` |
| Describe string (parameterized) | `"<METHOD> /api/<resource>/[<param>]"` | `"GET /api/notes/[id]"` |
| API utility file | `<domain>.api-utils.ts` | `notes.api-utils.ts` |
| API utility function | `execute<Method><Resource>Request` | `executeGetNotesRequest` |
| Factory file | `<domain>.factory.ts` | `notes.factory.ts` |
| Payload interface | `<Action><Resource>Payload` | `CreateNotePayload`, `UpdateNotePayload` |
| Factory function | `generate<DtoName>` | `generateCreateNoteDto` |
| Test data file | `<domain>.data.ts` | `notes.data.ts` |
| Enum file | `<concept>.enum.ts` | `note-status.enum.ts` |
| Cleanup file | `<domain>.cleanup.ts` | `notes.cleanup.ts` |
| Response helper | `expect<StatusCode><Description>` | `expect404NotFound` |

---

# PART 2 — GENERATION WORKFLOW

Follow this exact sequence for every module. Do not skip or reorder steps.

## Step 1 — Read backend source code

Read the following files before writing any code:

| What to read | Typical location | What to extract |
|--------------|------------------|-----------------|
| Route handlers | `app/api/<path>/route.ts` | HTTP methods, paths, middleware, auth guards |
| DTOs + Zod schemas | `src/modules/<domain>/<domain>.dto.ts` | Field names, types, `.max()` / `.min()` / `.regex()` constraints — read to understand the API contract, then define independent test-owned interfaces in factories |
| Service logic | `src/modules/<domain>/<domain>.service.ts` | Business rules, authorization checks, error conditions |
| Error definitions | `src/lib/server/errors.ts` | Error codes, messages, status codes |
| Database schema | `prisma/schema.prisma` | Field types, relations, defaults |

## Step 2 — Verify response helpers

For every error code the module can return: confirm a corresponding helper exists in `tests-api/helpers/response.helper.ts`. Create any missing helpers before proceeding. See [Response Helpers](#response-helpers).

## Step 3 — Create enums (if needed)

`tests-api/enums/<concept>.enum.ts`

Create only if the module introduces statuses, roles, or types used in assertions or factory defaults. See [Enums](#enums).

## Step 4 — Create factory

`tests-api/factories/<domain>/<domain>.factory.ts`

Use Zod schemas from Step 1. Respect all `.max()` constraints. See [Test Data Factories](#test-data-factories).

## Step 5 — Create API utilities

`tests-api/utils/api-utils/<domain>/<domain>.api-utils.ts`

One function per endpoint. Match HTTP methods exactly from route handlers read in Step 1. See [API Utilities](#api-utilities).

## Step 6 — Create cleanup

`tests-api/cleanups/<domain>.cleanup.ts`

Cover all entity types the test suite creates for this domain. See [Cleanup Utilities](#cleanup-utilities).

## Step 7 — Write test specs

`src/modules/<domain>/test/api/<method>-<endpoint>.spec.ts`

Process endpoints one file at a time, in this order:
1. `get-<resource>.spec.ts` (list)
2. `get-<resource>-id.spec.ts` (by ID)
3. `post-<resource>.spec.ts` (create)
4. `patch-<resource>-id.spec.ts` or `put-<resource>-id.spec.ts` (update)
5. `delete-<resource>-id.spec.ts` (delete)
6. Nested/special endpoints last

For each file, complete Step 7a before Step 7b. Do not write any code until 7a is done.

### Step 7a — Plan scenarios

Before writing any code for the current endpoint:

1. Open the [Per-Endpoint Checklist](#per-endpoint-checklist) and map every checklist item to a concrete `test()` description
2. Verify each planned scenario against [Test Scope](#test-scope) — remove anything that is out of scope
3. Count planned tests and compare against the [Expected test count](#per-endpoint-checklist) table:
   - If within range → proceed to 7b
   - If over the range → for each extra scenario write an inline justification comment explaining why it is required for this endpoint's specific logic (e.g., distinct auth role, non-trivial state transition). If you cannot write a clear justification — remove the scenario. Do not proceed to 7b with unjustified extras

Write the resulting scenario list as comments in the test file before any implementation:

```typescript
test.describe("POST /api/notes", () => {
  // Scenarios:
  // 1. should return 201 and create a note
  // 2. should persist the note (POST→GET)
  // 3. should return 401 without authentication
  // 4. should return 400 for invalid input (missing title)
});
```

Only proceed to 7b when the scenario list is final and within the expected count range.

### Step 7b — Implement tests

Implement each planned scenario using:
- [Test File Rules](#test-file-rules) — skeleton, structure, isolation, and verification rules
- [Examples](#examples) — reference implementations

**Files to create — always:**
- Factory, API utilities, test specs, cleanup

**Files to create — only when applicable:**
- Enums — only if the module introduces entity statuses/types used in assertions or factory defaults
- Static test data — only if the module uses fixed external values (e.g., sandbox card numbers)
- New response helpers — only if the module introduces error codes not already covered

## Step 8 — Self-validate

Run the [Self-Validation Checklist](#self-validation-checklist) against every created file. Then run all generated tests (`npx playwright test --project=api`), fix any failing tests, and re-run until the full suite is green. Do not mark the task complete until all tests pass.

---

# PART 3 — REFERENCE

## Infrastructure Components

### Shared Types

`tests-api/types.ts`

All API utilities return `ApiResponse` — a normalized wrapper that keeps the same `status` + `data` shape regardless of the underlying HTTP client.

```typescript
// tests-api/types.ts

export interface ApiResponse {
  status: number;
  data: any;
}
```

---

### Authentication Helper

Create a separate user per `test()` block via `authenticateUser()`. Never share authentication state across tests.

```typescript
// tests-api/helpers/auth.helper.ts

import type { APIRequestContext } from "@playwright/test";

let userCounter = 0;

export async function authenticateUser(
  request: APIRequestContext,
  overrides: { email?: string; password?: string; name?: string } = {}
): Promise<string> {
  userCounter++;
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);

  const email =
    overrides.email || `test-${userCounter}-${timestamp}-${random}@test.com`;
  const password = overrides.password || "TestPassword123!";
  const name = overrides.name || `Test User ${userCounter}`;

  const response = await request.post("/api/auth/sign-up/email", {
    data: { email, password, name },
  });

  if (!response.ok()) {
    throw new Error(
      `Authentication failed: ${response.status()} - ${await response.text()}`
    );
  }

  const setCookie = response.headers()["set-cookie"];
  return setCookie || "";
}
```

---

### API Utilities

Each domain gets one api-utils file. Each function wraps exactly one endpoint call and returns a normalized `ApiResponse`.

```typescript
// tests-api/utils/api-utils/notes/notes.api-utils.ts

import type { APIRequestContext } from "@playwright/test";
import type { ApiResponse } from "@/tests-api/types";

async function toApiResponse(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<ApiResponse> {
  const status = response.status();
  let data: any;
  if (status === 204) {
    data = "";
  } else {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status, data };
}

export async function executeGetNotesRequest(
  request: APIRequestContext,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.get("/api/notes", {
    headers: { cookie },
  });
  return toApiResponse(response);
}

export async function executePostNoteRequest(
  request: APIRequestContext,
  body: Record<string, unknown>,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.post("/api/notes", {
    data: body,
    headers: { cookie },
  });
  return toApiResponse(response);
}

export async function executeGetNoteByIdRequest(
  request: APIRequestContext,
  noteId: string,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.get(`/api/notes/${noteId}`, {
    headers: { cookie },
  });
  return toApiResponse(response);
}

export async function executePatchNoteRequest(
  request: APIRequestContext,
  noteId: string,
  body: Record<string, unknown>,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.patch(`/api/notes/${noteId}`, {
    data: body,
    headers: { cookie },
  });
  return toApiResponse(response);
}

export async function executeDeleteNoteRequest(
  request: APIRequestContext,
  noteId: string,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.delete(`/api/notes/${noteId}`, {
    headers: { cookie },
  });
  return toApiResponse(response);
}
```

**Rules:**
1. **One function per endpoint** — no multi-purpose request builders
2. **Every function returns `ApiResponse`** via the shared `toApiResponse()` helper — never return raw Playwright responses
3. **`request: APIRequestContext` is always the first parameter** — passed from the test's `{ request }` fixture
4. **Accept auth credentials as parameter** — pass an empty string `""` to test unauthenticated requests
5. **Use relative paths** — Playwright's `baseURL` from config handles environment switching. Never hardcode full URLs
6. **Read backend route handler** to determine correct HTTP method (PATCH vs PUT)
7. **Accept `Record<string, unknown>` for request bodies** — api-utils are transport-only wrappers. Type safety for payloads is enforced by test-owned interfaces in factories, not by importing backend DTOs
8. **Define `toApiResponse()` once per file** — it normalizes Playwright's response into `{ status, data }` for consistent assertion patterns

---

### Response Helpers

Use these assertion functions for all status/body checks. Add new helpers when the backend introduces new error codes.

```typescript
// tests-api/helpers/response.helper.ts

import { expect } from "@playwright/test";
import type { ApiResponse } from "@/tests-api/types";

export function expect200Ok(response: ApiResponse): void {
  expect(response.status).toBe(200);
  expect(response.data).toBeDefined();
}

export function expect201Created(response: ApiResponse): void {
  expect(response.status).toBe(201);
  expect(response.data).toBeDefined();
}

export function expect204NoContent(response: ApiResponse): void {
  expect(response.status).toBe(204);
}

export function expect400ValidationError(
  response: ApiResponse,
  expectedField?: string
): void {
  expect(response.status).toBe(400);
  expect(response.data.code).toBe("VALIDATION_ERROR");
  if (expectedField) {
    expect(response.data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expectedField }),
      ])
    );
  }
}

export function expect401Unauthorized(response: ApiResponse): void {
  expect(response.status).toBe(401);
  expect(response.data.code).toBe("UNAUTHORIZED");
}

export function expect403Forbidden(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(403);
  expect(response.data.code).toBe("FORBIDDEN");
  if (expectedMessage) {
    expect(response.data.error).toContain(expectedMessage);
  }
}

export function expect404NotFound(
  response: ApiResponse,
  resource?: string
): void {
  expect(response.status).toBe(404);
  expect(response.data.code).toBe("NOT_FOUND");
  if (resource) {
    expect(response.data.error).toContain(resource);
  }
}

export function expect409Conflict(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(409);
  expect(response.data.code).toBe("CONFLICT");
  if (expectedMessage) {
    expect(response.data.error).toContain(expectedMessage);
  }
}

export function expect429LimitReached(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(429);
  expect(response.data.code).toBe("LIMIT_REACHED");
  if (expectedMessage) {
    expect(response.data.error).toContain(expectedMessage);
  }
}
```

#### Mapping to framework error codes

| DomainError Factory | HTTP Status | Response Code | Helper |
|---------------------|-------------|---------------|--------|
| `Errors.notFound()` | 404 | `NOT_FOUND` | `expect404NotFound` |
| `Errors.forbidden()` | 403 | `FORBIDDEN` | `expect403Forbidden` |
| `Errors.unauthorized()` | 401 | `UNAUTHORIZED` | `expect401Unauthorized` |
| `Errors.badRequest()` | 400 | `BAD_REQUEST` | — create `expect400BadRequest` |
| `Errors.conflict()` | 409 | `CONFLICT` | `expect409Conflict` |
| `Errors.limitReached()` | 429 | `LIMIT_REACHED` | `expect429LimitReached` |
| Zod validation | 400 | `VALIDATION_ERROR` | `expect400ValidationError` |

> **Important**: `Errors.badRequest()` → `BAD_REQUEST` and Zod validation → `VALIDATION_ERROR` are distinct codes. The single 400 test per endpoint MUST target whichever code the endpoint actually returns — verify this in the backend before writing the test.

#### Adding new response helpers

When the backend introduces a status code not listed above:

1. Create helper: `expect<StatusCode><Description>(response, expectedMessage?)`
2. Assert `response.status` matches the code
3. Assert `response.data.code` matches the backend error code
4. If `expectedMessage` is provided, assert `response.data.error` contains it
5. Register the new helper in the mapping table above

---

### Test Data Factories

Generate all request bodies via factory functions. Every generated value MUST be globally unique — use `counter + timestamp + random` to prevent collisions in parallel runs.

**Factories define their own payload interfaces** — never import backend DTOs. API tests are an independent consumer of the API. If the backend changes a field name, removes a field, or changes a type, importing the backend DTO would silently adapt and hide the breaking change. Test-owned interfaces make the test fail — which is the point.

```typescript
// tests-api/factories/notes/notes.factory.ts

// Test-owned interfaces — defined by reading the backend DTOs in Step 1,
// then writing an independent copy. If the backend changes, tests break.
export interface CreateNotePayload {
  title: string;
  content?: string;
}

export interface UpdateNotePayload {
  title?: string;
  content?: string;
}

let counter = 0;

function uniqueSuffix(): string {
  counter++;
  const random = Math.floor(Math.random() * 100000);
  return `${counter}-${Date.now()}-${random}`;
}

export function generateCreateNoteDto(
  overrides: Partial<CreateNotePayload> = {}
): CreateNotePayload {
  return {
    title: `Note ${uniqueSuffix()}`,
    content: `Auto-generated content ${uniqueSuffix()}`,
    ...overrides,
  };
}

export function generateUpdateNoteDto(
  overrides: Partial<UpdateNotePayload> = {}
): UpdateNotePayload {
  return {
    title: `Updated ${uniqueSuffix()}`,
    ...overrides,
  };
}
```

#### Payload interface rules

1. **Define interfaces in the factory file** — one `<Action><Resource>Payload` per DTO (e.g., `CreateNotePayload`, `UpdateNotePayload`)
2. **Read the backend DTO in Step 1, then write an independent copy** — same field names and types, but no import from backend source
3. **Include all fields the test expects the API to accept** — if the backend silently removes a field, the test still sends it and catches the regression
4. **Never import from `@/src/modules/`** — factories must have zero backend imports

#### Field length safety

Before writing a factory, read the Zod schema for the DTO and check all `.max()` constraints. Generated values MUST NOT exceed field limits under any conditions (high counter, max random).

| Max length | Pattern |
|------------|---------|
| ≥ 50 | `prefix + uniqueSuffix()` — typically ~30 chars total |
| < 50 | Drop prefix, use `shortUniqueSuffix()` = `counter + random` only |
| < 10 | Use `counter + random` with no prefix: `` `${counter}${Math.floor(Math.random() * 1000)}` `` |

Verify the generated length stays below the limit under worst-case conditions (high counter, max random).

**Rules:**
1. **Function name**: `generate<DtoName>(overrides)`
2. **Always accept `Partial<Payload>` overrides** as last parameter
3. **Never import backend types** — define test-owned payload interfaces in the factory file
4. **Never hardcode IDs** or values that come from the database

#### Static test data

Use static constants **only** for immutable values fixed by external systems that never change between test runs (e.g., payment sandbox card numbers, fixed test credentials). Store them in `tests-api/test-data/<domain>/<domain>.data.ts`.

Use factories for anything that must be unique per test.

#### Enums

Create enums for backend domain values used in assertions or factory defaults. TypeScript compilation will fail when a backend value changes, making the mismatch immediately visible.

Create an enum **only when all three conditions are met**:
1. The value is defined by the backend (entity status, role, error code)
2. The value is used in test assertions or factory defaults (not just passed through)
3. A change in the backend value should break compilation

Do NOT create enums for: values used in a single test file (use a string literal), test-specific values, HTTP methods or content types.

```typescript
// tests-api/enums/note-status.enum.ts

export enum NoteStatus {
  Draft = "draft",
  Published = "published",
  Archived = "archived",
}
```

**Rules:** one enum per file, PascalCase keys with exact backend values, keep in sync with backend source.

---

### Cleanup Utilities

Every test MUST clean up all data it creates. Place all cleanup calls in `test.afterEach` — this guarantees execution even when the test throws.

Cleanup functions MUST NOT throw or abort mid-way:
- Wrap every individual deletion in its own `try/catch`
- Wrap the entire cleanup function in an outer `try/catch`
- Log every failure via `console.warn` with entity ID and error — never swallow failures silently

```typescript
// tests-api/cleanups/notes.cleanup.ts

import type { APIRequestContext } from "@playwright/test";
import { executeDeleteNoteRequest, executeGetNotesRequest } from
  "@/tests-api/utils/api-utils/notes/notes.api-utils";

export async function cleanupNotes(
  request: APIRequestContext,
  cookie: string
): Promise<void> {
  try {
    const response = await executeGetNotesRequest(request, cookie);
    if (response.status !== 200 || !response.data?.length) return;

    for (const note of response.data) {
      try {
        await executeDeleteNoteRequest(request, note.id, cookie);
      } catch (error) {
        console.warn(`Cleanup: failed to delete note ${note.id}:`, error);
      }
    }
  } catch (error) {
    console.warn("Cleanup: failed to list notes for deletion:", error);
  }
}
```

When a test tracks created entity IDs directly, use a by-ID variant:

```typescript
export async function cleanupNotesByIds(
  request: APIRequestContext,
  noteIds: string[],
  cookie: string
): Promise<void> {
  for (const noteId of noteIds) {
    try {
      await executeDeleteNoteRequest(request, noteId, cookie);
    } catch (error) {
      console.warn(`Cleanup: failed to delete note ${noteId}:`, error);
    }
  }
}
```

Every `authenticateUser()` call creates a user and an organization. In `test.afterEach`, run user cleanup for every cookie in the auth tracking array, after all domain cleanups.

```typescript
// tests-api/cleanups/user.cleanup.ts

import type { APIRequestContext } from "@playwright/test";

export async function cleanupUser(
  request: APIRequestContext,
  cookie: string
): Promise<void> {
  try {
    await request.delete("/api/auth/user", {
      headers: { cookie },
    });
  } catch (error) {
    console.warn("Cleanup: failed to delete user:", error);
  }
}
```

If the backend does not expose a user deletion endpoint, add a comment to `test.afterEach` noting that user accumulation is accepted for this module.

**Rules:**
1. **Use api-utils for all deletions** — never access the database directly
2. **File naming**: `<domain>.cleanup.ts`
3. **`request: APIRequestContext` is always the first parameter** — passed from the hook's `{ request }` fixture
4. **Every `authenticateUser()` must be paired with user cleanup** — iterate the auth tracking array in `test.afterEach`. No user may remain after a test run

---

## Test File Rules

### Skeleton and terminology

Every API test file must follow this exact skeleton:

```typescript
// src/modules/notes/test/api/get-notes.spec.ts

import { test, expect } from "@playwright/test";
import { executeGetNotesRequest, executePostNoteRequest } from
  "@/tests-api/utils/api-utils/notes/notes.api-utils";
import { generateCreateNoteDto } from "@/tests-api/factories/notes/notes.factory";
import { expect200Ok, expect401Unauthorized } from "@/tests-api/helpers/response.helper";
import { authenticateUser } from "@/tests-api/helpers/auth.helper";
import { cleanupNotes } from "@/tests-api/cleanups/notes.cleanup";
import { cleanupUser } from "@/tests-api/cleanups/user.cleanup";

test.describe("GET /api/notes", () => {
  // Track ALL auth contexts for cleanup
  const cookiesToCleanup: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const cookie of cookiesToCleanup) {
      // 1. Domain entities first (depend on user existing)
      await cleanupNotes(request, cookie);
      // 2. User last (owns the entities above)
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  // --- Positive tests ---

  test("should return 200 and list notes for the organization", async ({ request }) => {
    // Arrange
    const cookie = await authenticateUser(request);
    cookiesToCleanup.push(cookie);
    const noteDto = generateCreateNoteDto();
    await executePostNoteRequest(request, noteDto, cookie);

    // Act
    const response = await executeGetNotesRequest(request, cookie);

    // Assert
    expect200Ok(response);
    expect(response.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: noteDto.title }),
      ])
    );
  });

  test("should return empty array when organization has no notes", async ({ request }) => {
    // Fresh user context → brand-new org with no data.
    // toEqual([]) is safe here because authenticateUser() guarantees an empty org.
    // Do NOT use toEqual([]) against collections that may have residual data from other contexts.
    const cookie = await authenticateUser(request);
    cookiesToCleanup.push(cookie);

    const response = await executeGetNotesRequest(request, cookie);

    expect200Ok(response);
    expect(response.data).toEqual([]);
  });

  // --- Negative tests ---

  test("should return 401 without authentication", async ({ request }) => {
    const response = await executeGetNotesRequest(request, "");
    expect401Unauthorized(response);
  });
});
```

#### Terminology used in this document

| Term | Concrete implementation |
|------|------------------------|
| **auth tracking array** | `const cookiesToCleanup: string[] = []` — declared at `test.describe` scope |
| **register to auth tracking array** | `cookiesToCleanup.push(cookie)` — called immediately after every `authenticateUser()` |
| **user cleanup** | `cleanupUser(request, cookie)` from `@/tests-api/cleanups/user.cleanup` |

All rules below use these terms. The concrete names are defined once — in the skeleton above.

### Structure rules

1. **Imports**: api-utils, factories, response helpers, auth helper, domain cleanup, user cleanup — all from `@/tests-api/`
2. **`test.afterEach`**: Destructure `{ request }`, iterate the auth tracking array — call domain cleanup + user cleanup for each cookie, then reset the array
3. **Each `test()` block**: Destructure `{ request }`, creates its own authentication and test data — full isolation. Every `authenticateUser()` call must immediately register the returned cookie to the auth tracking array
4. **Arrange-Act-Assert**: Every test follows this pattern
5. **Positive tests first**, then negative tests
6. **No shared mutable state**: No `test.beforeAll`, no shared variables across tests except the auth tracking array
7. **Every assertion must verify both status and body**:
   - **Success (2xx)**: response helper for status + assert returned object or its key fields (`toMatchObject`, field equality)
   - **Error (4xx)**: response helper for status and error code + assert error message matches the expected failure reason (e.g., resource name in 404 `"Note"`, reason in 403 `"No access to this note"`, field name in 400 `"title"`)

### Isolation rules

1. **Each `test()` creates its own user** via `authenticateUser(request)` — no shared sessions
2. **Each `test()` creates its own test entities** — no data from `test.beforeAll`/`test.beforeEach`
3. **Cleanup runs in `test.afterEach` only — never inside `test()` body** — the `test()` block only registers cookies to the auth tracking array. Never call cleanup functions directly in a test body
4. **Test data must be globally unique** — use `counter + timestamp + random` pattern in factories
5. **Never assume entity counts or array positions** — use `find()` by unique property, not array indices
6. **Flexible assertions on counts** — use `toBeGreaterThan(0)` not `toBe(2)` when exact count depends on environment state
7. **Every created resource must be cleaned up** — when a test creates resources under multiple auth contexts, ALL cookies must be registered to the auth tracking array
8. **No static waits** — never use `setTimeout`, `sleep`, or fixed delays. For async conditions (entity state change, eventual consistency), use periodic polling: interval **400ms**, max timeout **15s**. If the condition is not met within 15s, throw a descriptive error: `"Polling timeout: note status did not change to 'published' within 15s"`
9. **Never assume an empty collection without isolation guarantee** — `toEqual([])` is safe ONLY when the collection belongs to a freshly created user context (`authenticateUser()` creates a brand-new org with no data). Do NOT use `toEqual([])` against collections that may contain data from other users or prior test runs. When isolation is not guaranteed:
   - Filter by unique marker and assert the filtered result is empty, or
   - Assert `expect(Array.isArray(response.data)).toBe(true)` without assuming length

### Verification rules

Every write operation must be followed by a GET to verify the result:

| Operation | Verification |
|-----------|-------------|
| **POST** (create) | GET the created entity by ID — assert it exists with correct data |
| **PATCH/PUT** (update) | GET the entity by ID — assert updated fields changed |
| **DELETE** | GET the entity by ID — assert 404 is returned |

```typescript
// POST → GET verification
test("should create a note", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const noteDto = generateCreateNoteDto();
  const createResponse = await executePostNoteRequest(request, noteDto, cookie);
  expect201Created(createResponse);

  const getResponse = await executeGetNoteByIdRequest(request, createResponse.data.id, cookie);
  expect200Ok(getResponse);
  expect(getResponse.data.title).toBe(noteDto.title);
});

// DELETE → GET(404) verification
test("should delete a note", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const createResponse = await executePostNoteRequest(request, generateCreateNoteDto(), cookie);

  const deleteResponse = await executeDeleteNoteRequest(request, createResponse.data.id, cookie);
  expect204NoContent(deleteResponse);

  const getResponse = await executeGetNoteByIdRequest(request, createResponse.data.id, cookie);
  expect404NotFound(getResponse, "Note");
});
```

### Test scope

**In scope — test at the API layer:**
- Correct status codes for valid/invalid requests
- Business logic executed via the endpoint
- Authorization enforcement (401, 403)
- Response body structure and key fields
- Error messages for known failure modes
- Basic happy-path filtering (e.g., `?status=draft` returns correct results)
- Third-party service integration points (real sandbox)

**Out of scope — delegate to unit/integration tests:**
- Exhaustive field validation (empty, missing, max length, wrong type) — one 400 is enough per endpoint
- Internal Prisma query correctness
- Performance and load testing

### Third-party service integration

Test real sandbox/test environments. Never mock at the API test level.

```typescript
// Outgoing request verification
test("should send welcome email on signup", async ({ request }) => {
  const response = await executePostSignupRequest(request, validUserDto);
  expect201Created(response);
  // Verify the third-party service received the payload via its sandbox API
});

// Incoming webhook verification
test("should process valid webhook payload", async ({ request }) => {
  const webhookPayload = generateWebhookPayload({ event: "payment.completed" });
  const response = await executePostWebhookRequest(request, webhookPayload);
  expect200Ok(response);
});
```

**Rules:**
1. **Do not test the third-party service itself** — assert only the integration point: correct payload sent, response/webhook parsed correctly
2. **Sandbox cleanup**: if the sandbox exposes a delete API, call it in `test.afterEach` via a dedicated cleanup function. If cleanup is not possible, all test entities MUST use uniquely identifiable markers and tests MUST NEVER rely on pre-existing sandbox state

### Per-Endpoint Checklist

For each endpoint, generate tests covering:

- [ ] Correct response for valid request (status code + body structure + key fields)
- [ ] 401 when unauthenticated
- [ ] 403 when accessing another organization's resource
- [ ] 404 for non-existent resource ID (endpoints with path parameters only)
- [ ] Exactly one 400 validation error — pick the simplest Zod case (e.g., missing required field). Do NOT add tests for max length, empty strings, format, or other field constraints
- [ ] Write verification: POST→GET, PATCH→GET, DELETE→GET(404)
- [ ] Third-party integration point (if applicable)

| Endpoint type | Typical count | Breakdown |
|---------------|---------------|-----------|
| **GET** (list) | 3–4 | 1 happy path, 1 empty state, 1 auth (401) |
| **GET** (by ID) | 4–5 | 1 happy path, 1 auth (401), 1 cross-org (403), 1 not found (404) |
| **POST** | 4–5 | 1 happy path, 1 persistence verify (POST→GET), 1 auth (401), 1 validation (400) |
| **PATCH/PUT** | 6–7 | 1 happy path, 1 persistence verify (PATCH→GET), 1–2 partial update, 1 auth (401), 1 cross-org (403), 1 not found (404), 1 validation (400) |
| **DELETE** | 4–5 | 1 happy path, 1 deletion verify (DELETE→GET 404), 1 auth (401), 1 cross-org (403), 1 not found (404) |

### Examples

```typescript
// --- POSITIVE ---

// List endpoint
test("should return 200 and list notes", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const noteDto = generateCreateNoteDto();
  await executePostNoteRequest(request, noteDto, cookie);

  const response = await executeGetNotesRequest(request, cookie);

  expect200Ok(response);
  expect(response.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: noteDto.title }),
    ])
  );
});

// Owner access
test("should allow owner to access their note", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const createResponse = await executePostNoteRequest(request, generateCreateNoteDto(), cookie);

  const response = await executeGetNoteByIdRequest(request, createResponse.data.id, cookie);

  expect200Ok(response);
  expect(response.data.id).toBe(createResponse.data.id);
});

// Response structure
test("should return 201 with complete note object", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const noteDto = generateCreateNoteDto();

  const response = await executePostNoteRequest(request, noteDto, cookie);

  expect201Created(response);
  expect(response.data).toMatchObject({
    id: expect.any(String),
    title: noteDto.title,
    content: noteDto.content,
    userId: expect.any(String),
    organizationId: expect.any(String),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
});

// --- NEGATIVE ---

// Missing authentication
test("should return 401 without authentication", async ({ request }) => {
  const response = await executeGetNotesRequest(request, "");
  expect401Unauthorized(response);
});

// Cross-organization access
// IMPORTANT: This test creates data under cookieA but asserts with cookieB.
// Register both cookies to the auth tracking array.
test("should return 403 for note in different organization", async ({ request }) => {
  const cookieA = await authenticateUser(request);
  cookiesToCleanup.push(cookieA);
  const cookieB = await authenticateUser(request);
  cookiesToCleanup.push(cookieB);
  const createResponse = await executePostNoteRequest(request, generateCreateNoteDto(), cookieA);

  const response = await executeGetNoteByIdRequest(request, createResponse.data.id, cookieB);
  expect403Forbidden(response, "No access to this note");
});

// Non-existent resource
test("should return 404 for non-existent note", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const response = await executeGetNoteByIdRequest(request, "non-existent-id", cookie);
  expect404NotFound(response, "Note");
});

// Exactly ONE validation error per endpoint — do NOT add more.
// Do NOT add separate tests for: missing field, empty string, max length, wrong type.
test("should return 400 for invalid input", async ({ request }) => {
  const cookie = await authenticateUser(request);
  cookiesToCleanup.push(cookie);
  const response = await executePostNoteRequest(request, { title: "" } as any, cookie);
  expect400ValidationError(response, "title");
});
```

---

# PART 4 — FINAL VALIDATION

## Critical Mistakes

| Mistake | Rule |
|---------|------|
| Assuming API response format | Read the backend route handler and error handling code before writing any assertion |
| Non-unique test data | Always use `counter + timestamp + random` in factories |
| Generated value exceeds field max length | Read the Zod schema `.max()` before writing the factory. Apply the length-based pattern from the Factories section |
| Multiple 400 tests per endpoint | One 400 case per endpoint. All other field constraints belong in unit tests |
| Inline cleanup | Cleanup MUST run in `test.afterEach` only. Never call cleanup functions inside `test()` |
| Missing registration to auth tracking array | Every `authenticateUser()` must be immediately followed by registering the returned cookie |
| Using `setTimeout` / `sleep` | Use periodic polling: interval 400ms, timeout 15s, descriptive error on timeout |
| `toEqual([])` without isolation guarantee | `toEqual([])` is safe only on collections belonging to a freshly created user context. Never use it against shared or potentially polluted collections |
| Hardcoding full URLs | Use relative paths — Playwright's `baseURL` handles environment switching |
| Snapshot testing | `.toMatchSnapshot()` and `.toMatchInlineSnapshot()` are forbidden at the API layer |
| `expect.anything()` in response assertions | Always assert explicit values or types: `expect.any(String)`, `toBe(...)`, `toContain(...)` |
| Missing `{ request }` destructuring | Every `test()` and `test.afterEach` must destructure `{ request }` from the Playwright fixture |
| Returning raw Playwright response | API utils must always return `ApiResponse` via `toApiResponse()` — never expose framework-specific response objects |
| Importing backend DTOs | Never import types from `@/src/modules/`. Define test-owned payload interfaces in factory files. Importing backend types couples the test to the implementation and hides breaking changes |

## Self-Validation Checklist

After generating all test files for a module, re-read every created file and validate:

- [ ] Every `authenticateUser()` is immediately followed by registering the cookie to the auth tracking array
- [ ] `test.afterEach` destructures `{ request }` and iterates the auth tracking array, calling both domain cleanup and user cleanup for every cookie
- [ ] Every `test()` destructures `{ request }` and passes it to all api-utils, auth helper, and cleanup calls
- [ ] Every write operation (POST/PATCH/DELETE) is followed by a GET to verify the result
- [ ] Each endpoint has exactly one 400 test targeting the correct error code (`VALIDATION_ERROR` vs `BAD_REQUEST`)
- [ ] No `test.beforeAll`, no shared test data, no shared auth sessions
- [ ] All payload interfaces are defined in factory files — no imports from `@/src/modules/`
- [ ] All generated values use `counter + timestamp + random` and respect Zod `.max()` constraints
- [ ] All response assertions use response helpers + explicit field checks — no `expect.anything()`, no snapshots
- [ ] Test count per endpoint is within the expected range — if exceeded, every extra scenario has an inline justification comment. Scenarios without justification are removed
- [ ] All files follow naming conventions from Part 1 (`.spec.ts` extension, correct describe strings)
- [ ] Generation Order steps 1–8 were completed in sequence

**Test execution:**

- [ ] Run all generated tests (`npx playwright test --project=api`)
- [ ] Verify all tests pass (0 failures)
- [ ] Fix any failing tests — adjust test logic, not production code
- [ ] Re-run tests after every fix to confirm all pass
- [ ] Do not mark the task complete until the full suite is green
