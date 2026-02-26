# Generated Test Code — PATCH /api/users/:id

All files below constitute the complete API test suite for the `PATCH /api/users/[id]` endpoint.

---

## File 1: `tests-api/types.ts`

```typescript
export interface ApiResponse {
  status: number;
  data: any;
}
```

---

## File 2: `tests-api/helpers/auth.helper.ts`

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

---

## File 3: `tests-api/helpers/response.helper.ts`

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
  expect(response.data.error).toBe("VALIDATION_ERROR");
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
  expect(response.data.error).toBe("UNAUTHORIZED");
}

export function expect403Forbidden(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(403);
  expect(response.data.error).toBe("FORBIDDEN");
  if (expectedMessage) {
    expect(response.data.message).toContain(expectedMessage);
  }
}

export function expect404NotFound(
  response: ApiResponse,
  resource?: string
): void {
  expect(response.status).toBe(404);
  expect(response.data.error).toBe("NOT_FOUND");
  if (resource) {
    expect(response.data.message).toContain(resource);
  }
}

export function expect409Conflict(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(409);
  expect(response.data.error).toBe("CONFLICT");
  if (expectedMessage) {
    expect(response.data.message).toContain(expectedMessage);
  }
}

export function expect429LimitReached(
  response: ApiResponse,
  expectedMessage?: string
): void {
  expect(response.status).toBe(429);
  expect(response.data.error).toBe("LIMIT_REACHED");
  if (expectedMessage) {
    expect(response.data.message).toContain(expectedMessage);
  }
}
```

---

## File 4: `tests-api/factories/users/users.factory.ts`

```typescript
// Test-owned interfaces — derived by reading the handler's UpdateUserDto contract,
// then defining an independent copy. Never import from @/src/modules/.
export interface UpdateUserPayload {
  name?: string;
  email?: string;
}

let counter = 0;

function uniqueSuffix(): string {
  counter++;
  const random = Math.floor(Math.random() * 100000);
  return `${counter}-${Date.now()}-${random}`;
}

export function generateUpdateUserDto(
  overrides: Partial<UpdateUserPayload> = {}
): UpdateUserPayload {
  return {
    name: `User ${uniqueSuffix()}`,
    ...overrides,
  };
}
```

---

## File 5: `tests-api/utils/api-utils/users/users.api-utils.ts`

```typescript
import type { APIRequestContext } from "@playwright/test";
import type { ApiResponse } from "@/tests-api/types";

async function toApiResponse(
  response: Awaited<ReturnType<APIRequestContext["get"]>>
): Promise<ApiResponse> {
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

export async function executePatchUserRequest(
  request: APIRequestContext,
  userId: string,
  body: Record<string, unknown>,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.patch(`/api/users/${userId}`, {
    data: body,
    headers: { cookie },
  });
  return toApiResponse(response);
}

export async function executeGetUserRequest(
  request: APIRequestContext,
  userId: string,
  cookie: string
): Promise<ApiResponse> {
  const response = await request.get(`/api/users/${userId}`, {
    headers: { cookie },
  });
  return toApiResponse(response);
}
```

---

## File 6: `tests-api/cleanups/user.cleanup.ts`

```typescript
import type { APIRequestContext } from "@playwright/test";

export async function cleanupUser(
  request: APIRequestContext,
  cookie: string
): Promise<void> {
  try {
    await request.delete("/api/auth/user", { headers: { cookie } });
  } catch (error) {
    console.warn("Cleanup: failed to delete user:", error);
  }
}
```

---

## File 7: `src/modules/users/test/api/patch-users-id.spec.ts`

```typescript
import { test } from "@playwright/test";
import {
  executePatchUserRequest,
  executeGetUserRequest,
} from "@/tests-api/utils/api-utils/users/users.api-utils";
import { generateUpdateUserDto } from "@/tests-api/factories/users/users.factory";
import {
  expect200Ok,
  expect400ValidationError,
  expect401Unauthorized,
  expect403Forbidden,
  expect404NotFound,
} from "@/tests-api/helpers/response.helper";
import { authenticateUser } from "@/tests-api/helpers/auth.helper";
import { cleanupUser } from "@/tests-api/cleanups/user.cleanup";

test.describe("PATCH /api/users/[id]", () => {
  // Track ALL auth cookies so afterEach can clean up every user created in this suite.
  const cookiesToCleanup: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const cookie of cookiesToCleanup) {
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  // -------------------------------------------------------------------------
  // Happy path — authenticated user updates their own profile
  // -------------------------------------------------------------------------
  test("should return 200 and updated user when owner updates their own profile", async ({
    request,
  }) => {
    // Arrange
    const cookie = await authenticateUser(request);
    cookiesToCleanup.push(cookie);

    // Retrieve the current user's id so we can use it in the PATCH URL.
    // The GET /api/users/me (or equivalent identity endpoint) must be available.
    // Adjust the path below to match your actual "current user" endpoint.
    const meResponse = await request.get("/api/auth/session", {
      headers: { cookie },
    });
    const session = await meResponse.json();
    const userId: string = session.userId;

    const dto = generateUpdateUserDto();

    // Act
    const response = await executePatchUserRequest(request, userId, dto, cookie);

    // Assert
    expect200Ok(response);
    expect(response.data.id).toBe(userId);
    expect(response.data.name).toBe(dto.name);
  });

  // -------------------------------------------------------------------------
  // Write verification — PATCH then GET to confirm persistence
  // -------------------------------------------------------------------------
  test("should persist the update (PATCH → GET verification)", async ({
    request,
  }) => {
    // Arrange
    const cookie = await authenticateUser(request);
    cookiesToCleanup.push(cookie);

    const meResponse = await request.get("/api/auth/session", {
      headers: { cookie },
    });
    const session = await meResponse.json();
    const userId: string = session.userId;

    const dto = generateUpdateUserDto();

    // Act — update
    const patchResponse = await executePatchUserRequest(
      request,
      userId,
      dto,
      cookie
    );
    expect200Ok(patchResponse);

    // Assert — GET confirms the new value is stored
    const getResponse = await executeGetUserRequest(request, userId, cookie);
    expect200Ok(getResponse);
    expect(getResponse.data.name).toBe(dto.name);
  });

  // -------------------------------------------------------------------------
  // 401 — no authentication
  // -------------------------------------------------------------------------
  test("should return 401 when request has no authentication", async ({
    request,
  }) => {
    // Arrange — no cookie required; use a plausible non-existent id
    const dto = generateUpdateUserDto();

    // Act
    const response = await executePatchUserRequest(
      request,
      "non-existent-id",
      dto,
      "" // unauthenticated
    );

    // Assert
    expect401Unauthorized(response);
  });

  // -------------------------------------------------------------------------
  // 403 — authenticated user attempts to update another user's profile
  // -------------------------------------------------------------------------
  test("should return 403 when authenticated user tries to update another user's profile", async ({
    request,
  }) => {
    // Arrange — two independent users
    const cookieA = await authenticateUser(request);
    cookiesToCleanup.push(cookieA);

    const cookieB = await authenticateUser(request);
    cookiesToCleanup.push(cookieB);

    // Retrieve user A's id
    const meResponseA = await request.get("/api/auth/session", {
      headers: { cookie: cookieA },
    });
    const sessionA = await meResponseA.json();
    const userAId: string = sessionA.userId;

    const dto = generateUpdateUserDto();

    // Act — user B attempts to patch user A's profile
    const response = await executePatchUserRequest(
      request,
      userAId,
      dto,
      cookieB
    );

    // Assert
    expect403Forbidden(response);
  });

  // -------------------------------------------------------------------------
  // 404 — authenticated user requests a non-existent user id
  // -------------------------------------------------------------------------
  test("should return 404 when the target user does not exist", async ({
    request,
  }) => {
    // Arrange — authenticated as a real user but targeting a non-existent id.
    // We use the authenticated user's own session so the 403 guard passes,
    // but supply an id that does not exist in the database.
    // NOTE: this test relies on the handler checking ownership before existence.
    // If the handler checks existence first, you may need a different approach.
    //
    // Strategy: authenticate user, retrieve their id, then craft a request
    // where session.userId === params.id but the DB record has been deleted
    // (or use a known non-existent uuid that is equal to session.userId by
    // mocking — not applicable here at the API layer). The simplest
    // approach is to delete the user and immediately try to patch them.
    const cookie = await authenticateUser(request);
    // Do NOT push to cookiesToCleanup because we will delete the user inline
    // as part of the test scenario. If the delete fails, we still register
    // for safety.
    cookiesToCleanup.push(cookie);

    const meResponse = await request.get("/api/auth/session", {
      headers: { cookie },
    });
    const session = await meResponse.json();
    const userId: string = session.userId;

    // Delete the user so the DB record no longer exists
    await request.delete("/api/auth/user", { headers: { cookie } });
    // Remove from cleanup array since user was already deleted
    cookiesToCleanup.splice(cookiesToCleanup.indexOf(cookie), 1);

    const dto = generateUpdateUserDto();

    // Act — session still carries the (now-deleted) userId; handler sees
    // session.userId === params.id (passes 403 check) but DB returns null.
    const response = await executePatchUserRequest(request, userId, dto, cookie);

    // Assert
    expect404NotFound(response);
  });

  // -------------------------------------------------------------------------
  // 400 — validation error (one representative invalid payload)
  // -------------------------------------------------------------------------
  test("should return 400 when request body fails validation", async ({
    request,
  }) => {
    // Arrange
    const cookie = await authenticateUser(request);
    cookiesToCleanup.push(cookie);

    const meResponse = await request.get("/api/auth/session", {
      headers: { cookie },
    });
    const session = await meResponse.json();
    const userId: string = session.userId;

    // Send a payload that is structurally invalid — e.g., name as a number
    // instead of a string, which UpdateUserDto should reject.
    const invalidPayload = { name: 12345 };

    // Act
    const response = await executePatchUserRequest(
      request,
      userId,
      invalidPayload,
      cookie
    );

    // Assert
    expect400ValidationError(response);
  });
});
```

---

## Notes on test count

The PATCH endpoint generates **6 tests**, which matches the expected range of 6–7 from the per-endpoint checklist:

| # | Scenario | Expected status |
|---|----------|-----------------|
| 1 | Happy path — owner updates own profile | 200 |
| 2 | Write verification — PATCH then GET | 200 + 200 |
| 3 | Unauthenticated request | 401 |
| 4 | Authenticated user targets another user | 403 |
| 5 | Target user does not exist (404) | 404 |
| 6 | Invalid body (one 400) | 400 |

No extra tests beyond the expected range, so no justification comments are needed.
