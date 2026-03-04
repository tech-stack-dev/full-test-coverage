# API Testing Reference

> Agent instructions for generating HTTP-level contract tests. Happy path + critical negatives per endpoint. Minimal but focused scenario coverage.

## Table of Contents
1. [Orientation](#orientation)
2. [Generation Workflow (Steps 1–8)](#generation-workflow)
3. [Playwright Configuration](#playwright-configuration)
4. [Authentication Helper — verbatim template](#authentication-helper)
5. [API Utilities — verbatim template](#api-utilities)
6. [Response Helpers — verbatim template](#response-helpers)
7. [Test Data Factories](#test-data-factories)
8. [Cleanup Utilities](#cleanup-utilities)
9. [Test File Rules](#test-file-rules)
10. [Per-Endpoint Checklist and Test Counts](#per-endpoint-checklist)
11. [Critical Mistakes](#critical-mistakes)
12. [Self-Validation Checklist](#self-validation-checklist)

---

## Orientation

API tests verify HTTP contracts — status codes, response structure, authorization, business logic via the HTTP layer.

**In scope:**
- Correct status codes for valid/invalid requests
- Business logic executed via the endpoint
- Authorization enforcement (401, 403)
- Response body structure and key fields
- Error messages for known failure modes
- Write verification: POST→GET, PATCH→GET, DELETE→GET(404)
- Third-party integration points (real sandbox)

**Out of scope** (delegate to unit/integration):
- Exhaustive field validation — one 400 is enough per endpoint
- Internal Prisma query correctness
- Performance and load testing

**Tech stack:** Playwright (test runner + HTTP client via APIRequestContext) · TypeScript with test-owned payload interfaces

**Directory structure:**
```
src/modules/<domain>/test/api/
└── <method>-<endpoint>.spec.ts   # One file per endpoint

tests-api/
├── helpers/
│   ├── response.helper.ts        # Response assertion helpers
│   └── auth.helper.ts            # authenticateUser()
├── utils/api-utils/<domain>/
│   └── <domain>.api-utils.ts    # One function per endpoint
├── factories/<domain>/
│   └── <domain>.factory.ts      # Payload interfaces + data generators
├── cleanups/
│   └── <domain>.cleanup.ts      # Post-test data removal
└── types.ts                      # ApiResponse type
```

**Naming conventions:**
| Item | Pattern | Example |
|------|---------|---------|
| Test file | `<method>-<endpoint>.spec.ts` | `post-notes.spec.ts` |
| Parameterized test file | `<method>-<resource>-<param>.spec.ts` | `get-notes-id.spec.ts` |
| Action/custom endpoint | `<method>-<resource>-<param>-<action>.spec.ts` | `post-notes-id-publish.spec.ts` |
| Describe string (flat) | `"<METHOD> /api/<resource>"` | `"GET /api/notes"` |
| Describe string (parameterized) | `"<METHOD> /api/<resource>/[<param>]"` | `"GET /api/notes/[id]"` |
| API utility function | `execute<Method><Resource>Request` | `executeGetNotesRequest` |
| Factory function | `generate<DtoName>` | `generateCreateNoteDto` |
| Payload interface | `<Action><Resource>Payload` | `CreateNotePayload` |
| Response helper | `expect<StatusCode><Description>` | `expect404NotFound` |

---

## Generation Workflow

Follow this exact sequence. Do not skip or reorder steps.

**Step 1 — Read backend source code**
Read: route handlers (HTTP methods, auth guards), DTOs/Zod schemas (to understand contract — then define independent test-owned interfaces), service logic (business rules, error conditions), error definitions, DB schema.

While reading route handlers, explicitly identify every 400 source:
- Zod `.parse()` / `.safeParse()` failure → `VALIDATION_ERROR` → use `expect400ValidationError`
- `Errors.badRequest()` manual guard → `BAD_REQUEST` → use `expect400BadRequest`

After reading all route handlers, write an explicit endpoint inventory:
```
METHOD /path/to/endpoint
METHOD /path/to/endpoint
...
```
One line per endpoint. This inventory drives Step 7 — every entry must get a spec file.

**Step 2 — Verify response helpers**
For every error code the module can return, confirm a corresponding helper exists in `tests-api/helpers/response.helper.ts`. Create missing helpers before proceeding.

**Step 3 — Create enums** (only if needed)
Create `tests-api/enums/<concept>.enum.ts` only when: value is defined by the backend AND used in assertions or factory defaults AND a change should break compilation.

**Step 4 — Create factory**
`tests-api/factories/<domain>/<domain>.factory.ts` — test-owned interfaces, never import backend DTOs.

**Step 5 — Create API utilities**
`tests-api/utils/api-utils/<domain>/<domain>.api-utils.ts` — one function per endpoint.

**Step 6 — Create cleanup**
`tests-api/cleanups/<domain>.cleanup.ts` — cover all entity types created by this domain's tests.

**Step 7 — Write test specs**
Work through the endpoint inventory from Step 1. Write one spec file per endpoint. Do not skip any entry.

For each file: **Step 7a** (plan scenarios as comments) then **Step 7b** (implement). Do not write any code until 7a is done.

**Step 8 — Self-validate**
Run [Self-Validation Checklist](#self-validation-checklist). Then run `npx playwright test --project=api`. Fix all failures.

---

## Playwright Configuration

```typescript
// playwright.config.ts (add API project)
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
  ],
});
```

Run API tests: `npx playwright test --project=api`

---

## Authentication Helper

`tests-api/helpers/auth.helper.ts` — create verbatim if it doesn't exist:

```typescript
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

`tests-api/types.ts`:
```typescript
export interface ApiResponse {
  status: number;
  data: any;
}
```

---

## API Utilities

`tests-api/utils/api-utils/<domain>/<domain>.api-utils.ts` — one function per endpoint:

```typescript
import type { APIRequestContext } from "@playwright/test";
import type { ApiResponse } from "@/tests-api/types";

async function toApiResponse(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<ApiResponse> {
  const status = response.status();
  let data: any;
  if (status === 204) {
    data = "";
  } else {
    const text = await response.text();
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status, data };
}

export async function executeGetNotesRequest(
  request: APIRequestContext,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.get("/api/notes", { headers: { cookie } });
  return toApiResponse(response);
}

export async function executePostNoteRequest(
  request: APIRequestContext,
  body: Record<string, unknown>,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.post("/api/notes", { data: body, headers: { cookie } });
  return toApiResponse(response);
}

export async function executeGetNoteByIdRequest(
  request: APIRequestContext,
  noteId: string,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.get(`/api/notes/${noteId}`, { headers: { cookie } });
  return toApiResponse(response);
}

export async function executePatchNoteRequest(
  request: APIRequestContext,
  noteId: string,
  body: Record<string, unknown>,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.patch(`/api/notes/${noteId}`, { data: body, headers: { cookie } });
  return toApiResponse(response);
}

export async function executeDeleteNoteRequest(
  request: APIRequestContext,
  noteId: string,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.delete(`/api/notes/${noteId}`, { headers: { cookie } });
  return toApiResponse(response);
}
```

**Rules:** one function per endpoint; always return `ApiResponse` via `toApiResponse()`; `request` always first param; pass `""` for unauthenticated; use relative paths; accept `Record<string, unknown>` for bodies (not backend DTO types); define `toApiResponse()` once per file.

---

## Response Helpers

`tests-api/helpers/response.helper.ts` — create verbatim if it doesn't exist:

```typescript
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

export function expect400BadRequest(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(400);
  expect(response.data.code).toBe("BAD_REQUEST");
  if (expectedMessage) {
    expect(response.data.error).toContain(expectedMessage);
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

**Error code mapping:**

| Backend error | HTTP status | Response code | Helper |
|---------------|-------------|---------------|--------|
| `Errors.notFound()` | 404 | `NOT_FOUND` | `expect404NotFound` |
| `Errors.forbidden()` | 403 | `FORBIDDEN` | `expect403Forbidden` |
| `Errors.unauthorized()` | 401 | `UNAUTHORIZED` | `expect401Unauthorized` |
| `Errors.conflict()` | 409 | `CONFLICT` | `expect409Conflict` |
| `Errors.limitReached()` | 429 | `LIMIT_REACHED` | `expect429LimitReached` |
| Zod validation | 400 | `VALIDATION_ERROR` | `expect400ValidationError` |
| `Errors.badRequest()` | 400 | `BAD_REQUEST` | create `expect400BadRequest` |

> `BAD_REQUEST` and `VALIDATION_ERROR` are distinct. Verify which code the endpoint returns before writing the 400 test.

---

## Test Data Factories

`tests-api/factories/<domain>/<domain>.factory.ts`:

```typescript
// Test-owned interfaces — defined by reading backend DTOs in Step 1,
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
```

**Field length safety:** before writing a factory, check all `.max()` constraints. Generated values must never exceed field limits under worst-case conditions (high counter, max random).

| Max length | Pattern |
|------------|---------|
| ≥ 50 | `prefix + uniqueSuffix()` (~30 chars total) |
| < 50 | `shortUniqueSuffix()` = counter + random only |
| < 10 | `counter + random` with no prefix |

**CRITICAL:** Never import from `@/src/modules/` — define test-owned payload interfaces in factory files.

---

## Cleanup Utilities

`tests-api/cleanups/<domain>.cleanup.ts`:

```typescript
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

`tests-api/cleanups/user.cleanup.ts`:
```typescript
import type { APIRequestContext } from "@playwright/test";

export async function cleanupUser(request: APIRequestContext, cookie: string): Promise<void> {
  try {
    await request.delete("/api/auth/user", { headers: { cookie } });
  } catch (error) {
    console.warn("Cleanup: failed to delete user:", error);
  }
}
```

---

## Test File Rules

Every test file must follow this skeleton:

```typescript
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
      await cleanupNotes(request, cookie);
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  test("should return 200 and list notes", async ({ request }) => {
    // Arrange
    const cookie = await authenticateUser(request);
    cookiesToCleanup.push(cookie);  // IMMEDIATELY register
    const noteDto = generateCreateNoteDto();
    await executePostNoteRequest(request, noteDto, cookie);

    // Act
    const response = await executeGetNotesRequest(request, cookie);

    // Assert
    expect200Ok(response);
    expect(response.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: noteDto.title })])
    );
  });

  test("should return 401 without authentication", async ({ request }) => {
    const response = await executeGetNotesRequest(request, "");
    expect401Unauthorized(response);
  });
});
```

**Write verification patterns:**
```typescript
// POST → GET
const createResponse = await executePostNoteRequest(request, dto, cookie);
expect201Created(createResponse);
const getResponse = await executeGetNoteByIdRequest(request, createResponse.data.id, cookie);
expect200Ok(getResponse);
expect(getResponse.data.title).toBe(dto.title);

// DELETE → GET(404)
await executeDeleteNoteRequest(request, id, cookie);
const getResponse = await executeGetNoteByIdRequest(request, id, cookie);
expect404NotFound(getResponse, "Note");
```

**Cross-org test — register both cookies:**
```typescript
test("should return 403 for note in different organization", async ({ request }) => {
  const cookieA = await authenticateUser(request);
  cookiesToCleanup.push(cookieA);
  const cookieB = await authenticateUser(request);
  cookiesToCleanup.push(cookieB);
  const createResponse = await executePostNoteRequest(request, generateCreateNoteDto(), cookieA);
  const response = await executeGetNoteByIdRequest(request, createResponse.data.id, cookieB);
  expect403Forbidden(response, "No access to this note");
});
```

**No static waits:** never `setTimeout`/`sleep`. Use polling: 400ms interval, 15s timeout, descriptive error on timeout.

---

## Per-Endpoint Checklist

For each endpoint, generate tests covering:
- [ ] Correct response for valid request (status + body structure + key fields)
- [ ] 401 when unauthenticated
- [ ] 403 when accessing another organization's resource
- [ ] 404 for non-existent resource ID (parameterized endpoints only)
- [ ] **Exactly one 400** — read the route to identify the error source: Zod validation → `expect400ValidationError`; `Errors.badRequest()` → `expect400BadRequest`. Do NOT add tests for max length, empty strings, or other field constraints
- [ ] Write verification: POST→GET, PATCH→GET, DELETE→GET(404)
- [ ] Third-party integration point (if applicable)

**Expected test counts:**

| Endpoint type | Typical count | Breakdown |
|---------------|---------------|-----------|
| GET (list) | 3–4 | 1 happy path, 1 empty state, 1 auth (401) |
| GET (by ID) | 4–5 | 1 happy path, 1 auth (401), 1 cross-org (403), 1 not found (404) |
| POST | 4–5 | 1 happy path, 1 persistence verify (POST→GET), 1 auth (401), 1 validation (400) |
| PATCH/PUT | 6–7 | 1 happy path, 1 persistence verify, 1–2 partial update, 1 auth (401), 1 cross-org (403), 1 not found (404), 1 validation (400) |
| DELETE | 4–5 | 1 happy path, 1 deletion verify (DELETE→GET 404), 1 auth (401), 1 cross-org (403), 1 not found (404) |
| Action/custom endpoint | 2+ | 1 happy path, 1 auth (401) — add 403/404/400 per the checklist above if the route returns them |

If count exceeds range, write an inline justification comment per extra scenario. No justification = remove the scenario.

---

## Critical Mistakes

| Mistake | Rule |
|---------|------|
| Multiple 400 tests per endpoint | One 400 per endpoint. All other field constraints belong in unit tests |
| Using `expect400ValidationError` for `Errors.badRequest()` | Read the route in Step 1. Zod failure → `VALIDATION_ERROR`; manual `Errors.badRequest()` guard → `BAD_REQUEST`. They are distinct — wrong helper = wrong assertion |
| Non-unique test data | Always use `counter + timestamp + random` in factories |
| Generated value exceeds field max | Read Zod schema `.max()` before writing factory |
| Inline cleanup | Cleanup MUST run in `test.afterEach` only — never inside `test()` |
| Missing registration to auth tracking array | Every `authenticateUser()` must be immediately followed by `cookiesToCleanup.push(cookie)` |
| `setTimeout` / `sleep` | Use polling: 400ms interval, 15s timeout |
| `toEqual([])` without isolation guarantee | Only safe for freshly created user context. Never against shared collections |
| Hardcoding full URLs | Use relative paths — Playwright's `baseURL` handles environments |
| Snapshot testing | Forbidden at the API layer |
| `expect.anything()` | Always assert explicit values or `expect.any(String)` |
| Importing backend DTOs | Never import from `@/src/modules/` — define test-owned payload interfaces |
| Returning raw Playwright response | API utils must always return `ApiResponse` via `toApiResponse()` |

---

## Self-Validation Checklist

- [ ] Every endpoint from the Step 1 inventory has a corresponding spec file — none skipped
- [ ] Every `authenticateUser()` immediately followed by `cookiesToCleanup.push(cookie)`
- [ ] `test.afterEach` destructures `{ request }` and iterates auth tracking array — domain cleanup + user cleanup per cookie
- [ ] Every `test()` destructures `{ request }` and passes it to all api-utils and auth calls
- [ ] Every write operation (POST/PATCH/DELETE) followed by GET to verify
- [ ] Each endpoint has exactly one 400 test targeting the correct error code
- [ ] No `test.beforeAll`, no shared test data, no shared auth sessions
- [ ] All payload interfaces defined in factory files — no imports from `@/src/modules/`
- [ ] All generated values use `counter + timestamp + random` and respect Zod `.max()` constraints
- [ ] All response assertions use response helpers + explicit field checks — no `expect.anything()`
- [ ] Test count per endpoint within expected range; extras have inline justification comments

**Test execution:**
- [ ] Run: `npx playwright test --project=api`
- [ ] All tests pass (0 failures)
- [ ] Fix failures — adjust test logic, not production code
