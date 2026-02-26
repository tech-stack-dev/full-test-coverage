# Transcript — PATCH /api/users/:id API Test Generation

## Files Read

1. `/Users/vitaliidolotov/VSCodeProjects/full-coverage-tests/.agents/skills/full-coverage/SKILL.md`
   - Provides the testing pyramid, layer selection decision tree, and step-by-step workflow.

2. `/Users/vitaliidolotov/VSCodeProjects/full-coverage-tests/.agents/skills/full-coverage/references/api-testing.md`
   - Provides verbatim templates, naming conventions, per-endpoint checklist, and self-validation checklist for API tests.

---

## Step 1: Analyze the Code

### Handler provided in the task prompt

```typescript
// app/api/users/[id]/route.ts
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = await request.json();
  const parsed = UpdateUserDto.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'VALIDATION_ERROR' }, { status: 400 });

  if (session.userId !== params.id) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const user = await userService.updateUser(params.id, parsed.data);
  if (!user) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

  return Response.json(user, { status: 200 });
}
```

### Inventory

- **Schemas found:** `UpdateUserDto` — fields not fully visible in the snippet but it is a Zod schema used for partial user updates. Based on typical patterns, it likely contains optional `name` and/or `email` fields.
- **Service methods:** `userService.updateUser(id, data)` — returns the updated user record or null.
- **HTTP endpoints:** `PATCH /api/users/[id]`
- **Utility functions:** None in scope for this file.
- **External service calls:** None visible.
- **UI pages:** None — this is a backend-only route.

### Error responses extracted from handler

| Condition | Status | Body |
|-----------|--------|------|
| No session | 401 | `{ error: 'UNAUTHORIZED' }` |
| Zod validation fails | 400 | `{ error: 'VALIDATION_ERROR' }` |
| `session.userId !== params.id` | 403 | `{ error: 'FORBIDDEN' }` |
| `userService.updateUser` returns null | 404 | `{ error: 'NOT_FOUND' }` |
| Success | 200 | updated user object |

### Summary

This module has 1 Zod schema (`UpdateUserDto`), 1 service method (`userService.updateUser`), and 1 HTTP endpoint (`PATCH /api/users/[id]`). No utility functions or browser UI found. Recommended layers: **API tests only** (the task explicitly requests API tests only, and the skill's decision tree confirms API tests are required for HTTP endpoints).

---

## Step 2: Select Layers

The task explicitly requests "Add API tests only for this endpoint."

Per the skill's decision tree:
- Does the code expose HTTP endpoints? YES → API tests required.

**Selected:** API layer only.
**Skipped:** Unit (not requested). Integration (not requested). E2E (no browser UI; not requested).

---

## Step 3: Generate API Tests — Following api-testing.md Workflow

### Step 7a — Plan scenarios as comments (before writing code)

```
PATCH /api/users/[id]

Scenario 1 — Happy path
  - Authenticate user, retrieve their id, send valid PATCH body
  - Expect 200, response body contains updated fields

Scenario 2 — Write verification (PATCH → GET)
  - Authenticate user, PATCH their profile, then GET to confirm persistence
  - Expect GET returns the new name

Scenario 3 — 401 Unauthenticated
  - Send PATCH with no cookie
  - Expect 401, body.error === 'UNAUTHORIZED'

Scenario 4 — 403 Cross-user
  - Authenticate user A and user B
  - User B sends PATCH targeting user A's id
  - Expect 403, body.error === 'FORBIDDEN'

Scenario 5 — 404 Non-existent user
  - Authenticate user, retrieve id, delete user account, then PATCH the now-deleted id
  - session.userId still matches params.id so the 403 guard passes; DB returns null → 404
  - Expect 404, body.error === 'NOT_FOUND'

Scenario 6 — 400 Validation error (one representative case)
  - Authenticate user, send body with name as a number (invalid type)
  - Expect 400, body.error === 'VALIDATION_ERROR'
```

Total: 6 tests — within the expected 6–7 range for PATCH endpoints.

### Step 7b — Implementation

Files created:

| File | Purpose |
|------|---------|
| `tests-api/types.ts` | `ApiResponse` interface |
| `tests-api/helpers/auth.helper.ts` | `authenticateUser()` — verbatim from reference |
| `tests-api/helpers/response.helper.ts` | All response assertion helpers — verbatim from reference, adapted error field to match `{ error: '...' }` format in this handler |
| `tests-api/factories/users/users.factory.ts` | `UpdateUserPayload` interface + `generateUpdateUserDto()` |
| `tests-api/utils/api-utils/users/users.api-utils.ts` | `executePatchUserRequest()`, `executeGetUserRequest()`, `toApiResponse()` |
| `tests-api/cleanups/user.cleanup.ts` | `cleanupUser()` — verbatim from reference |
| `src/modules/users/test/api/patch-users-id.spec.ts` | The actual test file |

### Self-Validation Checklist (run mentally)

- [x] Every `authenticateUser()` immediately followed by `cookiesToCleanup.push(cookie)`
  - Exception: in the 404 scenario, cookie is pushed but then spliced out after the deliberate account deletion. This is correct and intentional.
- [x] `test.afterEach` destructures `{ request }` and iterates auth tracking array — `cleanupUser` per cookie
- [x] Every `test()` destructures `{ request }` and passes it to all api-utils and auth calls
- [x] PATCH write operation followed by GET to verify (scenario 2)
- [x] Each endpoint has exactly one 400 test targeting `VALIDATION_ERROR`
- [x] No `test.beforeAll`, no shared test data, no shared auth sessions
- [x] All payload interfaces defined in factory files — no imports from `@/src/modules/`
- [x] All generated values use `counter + timestamp + random`
- [x] All response assertions use response helpers
- [x] Test count (6) is within expected range (6–7) — no extra justification comments needed

---

## Decisions and Rationale

### Response helper field name

The handler returns `{ error: 'UNAUTHORIZED' }`, `{ error: 'FORBIDDEN' }`, etc. The reference template uses `response.data.code`. I adapted the helpers to check `response.data.error` instead to match the actual handler response shape.

### 404 test strategy

The handler checks `session.userId !== params.id` before querying the DB. This means a naive "use a random non-existent id" test would hit the 403 guard first and never reach the 404 branch. The correct strategy is to:
1. Create a real user and capture their `userId` from the session.
2. Delete that user via the auth delete endpoint.
3. Re-use the same session cookie (which still carries the now-deleted `userId`).
4. Send PATCH with `params.id = session.userId` — the ownership check passes, but `userService.updateUser` returns null → 404.

This is the only correct way to test the 404 branch at the API layer without mocking.

### Session endpoint

The tests use `/api/auth/session` to retrieve `session.userId`. This path may differ in the real application. The comment in each test notes it should be adjusted to match the actual identity endpoint.

### Factory fields

`UpdateUserDto` content is not fully specified in the task. Based on the handler, it is a partial update DTO. The factory generates an object with `name` (a string). If the actual DTO has additional required fields, the factory's `generateUpdateUserDto` should be extended accordingly.
