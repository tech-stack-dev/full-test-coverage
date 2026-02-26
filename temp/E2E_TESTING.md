# E2E Testing — Agent Instructions

> This document is the single source of truth for an AI agent generating Playwright UI tests.
> Follow every rule exactly. Do not add layers, patterns, or files not described here.

---

# PART 1 — ORIENTATION

## Technology Stack

| Tool | Role |
|------|------|
| **Playwright** | Test runner, browser automation, and built-in API request context |
| **TypeScript** | Type-safe test code |
| **Page Object Model** | Encapsulate UI locators and interactions per page/feature |

---

## Playwright Configuration

E2E tests run as the `chromium` project in `playwright.config.ts`. The `webServer` block auto-starts the dev server (`yarn dev`) before tests. The base URL is configured via environment variables; individual test specs must not read `process.env` directly.

```typescript
// playwright.config.ts (relevant excerpt)
export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  retries: isCI ? 2 : 0,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "yarn dev",
    url: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    reuseExistingServer: !isCI,
  },
});
```

Run E2E tests: `npx playwright test --project=chromium`

### Retry Strategy

Retries are configured globally in `playwright.config.ts` — **not in individual test files**:

- **CI**: 2 retries — a failed test is re-run up to 2 more times to handle transient browser/network issues
- **Local**: 0 retries — failures surface immediately so you can debug the root cause

**Rules:**
1. **Never add `test.describe.configure({ retries: N })` or per-test retry logic** — retries are a global CI safety net, not a per-test escape hatch
2. **A test that needs retries to pass is a flaky test** — fix the root cause (missing explicit wait, shared state, non-unique data) instead of masking it with retries
3. **Cleanup must be idempotent** — because retried tests run `test.afterEach` on the failed attempt and then start fresh, cleanup functions must handle partial state (entity already deleted, user already cleaned up) without throwing

---

## Directory Structure

```
e2e/
├── fixtures/                              # Reusable test utilities
│   ├── auth.ts                            # UI-based auth helpers (signUp, signIn, signOut)
│   ├── setup/                             # API-based test data creation (not UI)
│   │   ├── auth.setup.ts                  # createUserViaApi(), injectAuthCookie()
│   │   └── <domain>.setup.ts             # create<Domain>ViaApi()
│   ├── cleanup/                           # API-based test data removal
│   │   ├── user.cleanup.ts               # cleanupUser()
│   │   └── <domain>.cleanup.ts           # cleanup<Domain>()
│   ├── factories/                         # Test data generators
│   │   ├── user.factory.ts               # TestUser type + createTestUser()
│   │   └── <domain>.factory.ts           # Test<Domain> type + createTest<Domain>()
│   └── services/                          # Third-party service helpers
│       └── <service>/
│           ├── <service>.service.ts       # Interface + resolver
│           ├── <service>.mock.ts          # Mock implementation (default)
│           └── <service>.real.ts          # Real implementation (test env)
├── pages/                                 # Page Object Models
│   ├── auth/                              # Auth page objects
│   │   ├── signup.page.ts
│   │   └── signin.page.ts
│   ├── app/                               # Protected page objects
│   │   └── <domain>.page.ts
│   └── components/                        # Shared component objects
│       └── <component>.component.ts
└── tests/                                 # Test specs
    ├── auth/                              # Authentication flow tests
    │   ├── signup.spec.ts
    │   ├── signin.spec.ts
    │   └── session.spec.ts
    └── app/                               # Application feature tests
        └── <domain>.<feature>.spec.ts
```

---

## Naming Conventions

| Item | Pattern | Example |
|------|---------|---------|
| Test file | `<domain>.<feature>.spec.ts` | `notes.crud.spec.ts` |
| Page object | `<domain>.page.ts` | `notes.page.ts` |
| Component object | `<component>.component.ts` | `header.component.ts` |
| Factory file | `<domain>.factory.ts` | `notes.factory.ts` |
| Factory function | `createTest<Domain>()` | `createTestNote()` |
| Setup file | `<domain>.setup.ts` | `notes.setup.ts` |
| Setup function | `create<Domain>ViaApi()` | `createNoteViaApi()` |
| Cleanup file | `<domain>.cleanup.ts` | `notes.cleanup.ts` |
| Cleanup function | `cleanup<Domain>()` | `cleanupNotes()` |
| Service interface + resolver | `<service>.service.ts` | `email.service.ts` |
| Mock implementation | `<service>.mock.ts` | `email.mock.ts` |
| Real implementation | `<service>.real.ts` | `email.real.ts` |
| Describe string | `"<Domain> — <Feature>"` | `"Notes — CRUD Operations"` |

---

# PART 2 — GENERATION WORKFLOW

Follow this exact sequence for every feature. Do not skip or reorder steps.

## Step 1 — Read PRD and source code

Read the following before writing any code:

| What to read | Typical location | What to extract |
|--------------|------------------|-----------------|
| PRD / feature spec | `docs/PRD.md` or feature description | User flows, acceptance criteria, expected UI states |
| Page components | `app/(app)/<domain>/page.tsx` | `data-testid` attributes, component structure, UI states |
| Existing page objects | `e2e/pages/app/<domain>.page.ts` | Already-defined locators and interaction methods |
| Existing fixtures | `e2e/fixtures/` | Available helpers, factories, setup/cleanup functions |
| Route handlers | `app/api/<domain>/**/route.ts` | API endpoints available for setup/cleanup |
| Auth setup | `e2e/fixtures/setup/auth.setup.ts` | API signup and cookie injection pattern |

## Step 2 — Identify user flows to test

Map PRD features to testable user flows. One spec file per feature area (e.g., `<domain>.crud.spec.ts`, `<domain>.authorization.spec.ts`). See [Per-Feature Checklist](#per-feature-checklist) for coverage targets.

## Step 3 — Create or update Page Object Models

`e2e/pages/app/<domain>.page.ts`

One POM per page/feature. Encapsulate all locators and multi-step interactions. See [Page Object Model Rules](#page-object-model-rules).

## Step 4 — Create or update test data factory

`e2e/fixtures/factories/<domain>.factory.ts`

One factory file per domain. Export a `Test<Domain>` type and `createTest<Domain>()` function with unique data generation. See [Test Data Factory Rules](#test-data-factory-rules).

## Step 5 — Create API-based setup helper

`e2e/fixtures/setup/<domain>.setup.ts`

One setup file per domain. Functions that create test data via API calls (not UI). Reuse the auth setup pattern from `e2e/fixtures/setup/auth.setup.ts`. See [API Setup Helpers](#api-setup-helpers).

## Step 6 — Create or update third-party service helpers

`e2e/fixtures/services/<service>/<service>.service.ts`

Only when the feature under test interacts with external services (email, payments, etc.). Create an interface, mock implementation, and real implementation with a resolver function. See [Third-Party Service Helpers](#third-party-service-helpers).

## Step 7 — Create cleanup helper

`e2e/fixtures/cleanup/<domain>.cleanup.ts`

One cleanup file per domain. Functions that delete test data via API after tests. Pattern: list-then-delete with try/catch per entity. See [API Cleanup Helpers](#api-cleanup-helpers).

## Step 8 — Write test specs

`e2e/tests/app/<domain>.<feature>.spec.ts`

One file per feature area. Use `test.afterEach` for cleanup. Each test creates its own data via API setup, interacts via UI, asserts via UI. See [Test File Rules](#test-file-rules).

## Step 9 — Self-validate

Run the [Self-Validation Checklist](#self-validation-checklist) against every created file. Then run all generated tests (`npx playwright test --project=chromium`), fix any failing tests, and re-run until the full suite is green. Do not mark the task complete until all tests pass.

---

# PART 3 — REFERENCE

## Infrastructure Components

### API Setup Helpers

Each domain gets its own setup file. Auth setup is shared across all domains.

#### Auth Setup

`e2e/fixtures/setup/auth.setup.ts`

Handles user creation via API and browser cookie injection. Every domain's setup file imports from here.

```typescript
// e2e/fixtures/setup/auth.setup.ts

import type { APIRequestContext, Page } from "@playwright/test";

let userCounter = 0;

/**
 * Creates a user via API and returns the session cookie.
 * Use this for all tests that need an authenticated user but are NOT testing the auth flow itself.
 */
export async function createUserViaApi(
  request: APIRequestContext,
  overrides: { email?: string; password?: string; name?: string } = {}
): Promise<{ cookie: string; email: string; password: string }> {
  userCounter++;
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);

  const email =
    overrides.email || `e2e-${userCounter}-${timestamp}-${random}@test.com`;
  const password = overrides.password || "TestPassword123!";
  const name = overrides.name || `E2E User ${userCounter}`;

  const response = await request.post("/api/auth/sign-up/email", {
    data: { email, password, name },
  });

  if (!response.ok()) {
    throw new Error(
      `API user creation failed: ${response.status()} - ${await response.text()}`
    );
  }

  const setCookie = response.headers()["set-cookie"];
  if (!setCookie) {
    throw new Error("API user creation did not return a session cookie");
  }

  return { cookie: setCookie, email, password };
}

/**
 * Injects the API session cookie into the browser context so the browser
 * is authenticated without going through the sign-up UI.
 */
export async function injectAuthCookie(
  page: Page,
  setCookieHeader: string
): Promise<void> {
  const cookies = setCookieHeader.split(",").map((cookieStr) => {
    const parts = cookieStr.trim().split(";");
    const [nameValue] = parts;
    const [name, ...valueParts] = nameValue.split("=");
    return {
      name: name.trim(),
      value: valueParts.join("=").trim(),
      domain: "localhost",
      path: "/",
    };
  });

  await page.context().addCookies(cookies);
}
```

#### Domain Setup

`e2e/fixtures/setup/<domain>.setup.ts`

One file per domain. Each function creates a single entity via API and returns the created object.

```typescript
// e2e/fixtures/setup/<domain>.setup.ts

import type { APIRequestContext } from "@playwright/test";

/**
 * Creates a <domain> entity via API. Returns the created entity.
 */
export async function create<Domain>ViaApi(
  request: APIRequestContext,
  cookie: string,
  data: { title: string; content?: string }
): Promise<{ id: string; title: string; content: string }> {
  const response = await request.post("/api/<domain>", {
    data,
    headers: { cookie },
  });

  if (!response.ok()) {
    throw new Error(
      `API <domain> creation failed: ${response.status()} - ${await response.text()}`
    );
  }

  return response.json();
}
```

**Rules:**
1. **One file per domain** — `<domain>.setup.ts`
2. **One function per entity type** — `create<Domain>ViaApi()`
3. **Always return the created entity** — tests may need the `id` or other fields
4. **Throw on failure** — setup failures should abort the test immediately
5. **Use `page.request`** in test code to get the `APIRequestContext` — it shares the browser's base URL

---

### API Cleanup Helpers

Each domain gets its own cleanup file. User cleanup is shared.

#### User Cleanup

`e2e/fixtures/cleanup/user.cleanup.ts`

```typescript
// e2e/fixtures/cleanup/user.cleanup.ts

import type { APIRequestContext } from "@playwright/test";

/**
 * Deletes the user account.
 * Always call this AFTER domain entity cleanup (entities depend on user existing).
 */
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

#### Domain Cleanup

`e2e/fixtures/cleanup/<domain>.cleanup.ts`

One file per domain. Pattern: list all entities, then delete each individually.

```typescript
// e2e/fixtures/cleanup/<domain>.cleanup.ts

import type { APIRequestContext } from "@playwright/test";

/**
 * Deletes all <domain> entities for the authenticated user.
 * Pattern: list all entities, then delete each one individually.
 */
export async function cleanup<Domain>(
  request: APIRequestContext,
  cookie: string
): Promise<void> {
  try {
    const listResponse = await request.get("/api/<domain>", {
      headers: { cookie },
    });

    if (!listResponse.ok()) return;

    const entities = await listResponse.json();
    if (!Array.isArray(entities) || entities.length === 0) return;

    for (const entity of entities) {
      try {
        await request.delete(`/api/<domain>/${entity.id}`, {
          headers: { cookie },
        });
      } catch (error) {
        console.warn(`Cleanup: failed to delete <domain> ${entity.id}:`, error);
      }
    }
  } catch (error) {
    console.warn("Cleanup: failed to list <domain> for deletion:", error);
  }
}
```

**Cleanup rules:**
1. **One file per domain** — `<domain>.cleanup.ts`
2. **Outer try/catch on every cleanup function** — never throw from cleanup
3. **Inner try/catch per entity deletion** — one failure must not skip remaining entities
4. **Log every failure via `console.warn`** — never swallow failures silently
5. **Domain cleanup before user cleanup** — entities depend on user existing
6. **If no user deletion endpoint exists**, add a comment noting that user accumulation is accepted

---

### Page Object Model Rules

One class per page/feature. All locators use `data-testid` exclusively.

```typescript
// e2e/pages/app/<domain>.page.ts

import { Page, Locator } from "@playwright/test";

export class <Domain>Page {
  readonly page: Page;
  readonly createButton: Locator;
  readonly emptyState: Locator;
  readonly itemsList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByTestId("<domain>-create-button");
    this.emptyState = page.getByTestId("<domain>-empty-state");
    this.itemsList = page.getByTestId("<domain>-list");
  }

  async goto() {
    await this.page.goto("/app/<domain>");
  }

  async createItem(title: string, content: string = "") {
    await this.createButton.click();
    await this.page.getByTestId("<domain>-dialog").waitFor();
    await this.page.getByTestId("<domain>-dialog-title-input").fill(title);
    if (content) {
      await this.page.getByTestId("<domain>-dialog-content-input").fill(content);
    }
    await this.page.getByTestId("<domain>-dialog-save-button").click();
    await this.page.getByTestId("<domain>-dialog").waitFor({ state: "hidden" });
  }
}
```

**Rules:**
1. **All locators via `data-testid`** — use `page.getByTestId()`. No CSS selectors, no text selectors
2. **Constructor takes `Page`** — assigns all locators as `readonly` properties
3. **Methods encapsulate multi-step interactions** — e.g., `createItem(title, content)` handles dialog open, fill, save, wait for close
4. **`goto()` method for navigation** — every POM must have one
5. **Never assert inside POM** — assertions belong in test specs only
6. **Explicit waits for state changes** — use `locator.waitFor()` for element state transitions (dialog open/close, element attach/detach), `page.waitForURL()` for navigation, `page.waitForLoadState()` after `goto()`. Never use `page.waitForTimeout()` or any static delay. See [Waiting Strategy](#waiting-strategy)

---

### Test Data Factory Rules

Each domain gets its own factory file. Generate unique test data for every test.

```typescript
// e2e/fixtures/factories/user.factory.ts

export type TestUser = {
  email: string;
  password: string;
  name: string;
};

let userCounter = 0;

function uniqueSuffix(): string {
  const random = Math.floor(Math.random() * 100000);
  return `${Date.now()}-${random}`;
}

export function createTestUser(): TestUser {
  userCounter++;
  const suffix = uniqueSuffix();
  return {
    email: `test.user.${userCounter}.${suffix}@example.com`,
    password: "TestPassword123!",
    name: `Test User ${userCounter}`,
  };
}
```

```typescript
// e2e/fixtures/factories/<domain>.factory.ts

export type Test<Domain> = {
  title: string;
  content: string;
};

let counter = 0;

function uniqueSuffix(): string {
  const random = Math.floor(Math.random() * 100000);
  return `${Date.now()}-${random}`;
}

export function createTest<Domain>(): Test<Domain> {
  counter++;
  const suffix = uniqueSuffix();
  return {
    title: `Test <Domain> ${counter}-${suffix}`,
    content: `Auto-generated content ${counter}-${suffix}`,
  };
}
```

**Rules:**
1. **One file per domain** — `<domain>.factory.ts` plus a shared `user.factory.ts`
2. **Unique values via `counter + timestamp + random`** — prevents collisions across parallel workers
3. **Export types** — `TestUser`, `Test<Domain>` for type safety
4. **No hardcoded IDs** or values from the database

---

### Third-Party Service Helpers

When E2E tests interact with external services (email, payments, SMS, etc.), use the **resolver pattern** to switch between mock and real implementations. Mocks are the default — no configuration needed for local or CI runs. Real implementations activate only when `USE_REAL_SERVICES=true` is set, for test environments with actual services deployed.

#### Architecture

```
Interface (<Service>Helper)
├── Mock implementation   ← default (local / CI)
└── Real implementation   ← opt-in via USE_REAL_SERVICES=true
         ↑
    Resolver function (get<Service>Helper) reads env var, returns correct impl
```

#### Interface

`e2e/fixtures/services/<service>/<service>.service.ts`

Define a helper interface with methods for inspecting service interactions, plus a resolver function that returns the correct implementation.

```typescript
// e2e/fixtures/services/<service>/<service>.service.ts

import { get<Service>MockHelper } from "./<service>.mock";
import { get<Service>RealHelper } from "./<service>.real";

export interface <Service>Helper {
  /** Returns the last call made to the service (e.g., last email sent). */
  getLastCall(): Promise<{ to: string; subject: string; body: string } | null>;
  /** Returns all calls made to the service since last reset. */
  getAllCalls(): Promise<{ to: string; subject: string; body: string }[]>;
  /** Resets call history. Call this in test.afterEach. */
  reset(): void;
}

/**
 * Returns the correct service helper based on USE_REAL_SERVICES env var.
 * - absent or "false" → mock (default, no network calls)
 * - "true" → real (calls actual sandbox/test API)
 */
export function get<Service>Helper(): <Service>Helper {
  if (process.env.USE_REAL_SERVICES === "true") {
    return get<Service>RealHelper();
  }
  return get<Service>MockHelper();
}
```

#### Mock Implementation

`e2e/fixtures/services/<service>/<service>.mock.ts`

Stores calls in an in-memory array and returns predictable data. Never makes network calls.

```typescript
// e2e/fixtures/services/<service>/<service>.mock.ts

import type { <Service>Helper } from "./<service>.service";

type <Service>Call = { to: string; subject: string; body: string };

const calls: <Service>Call[] = [];

export function get<Service>MockHelper(): <Service>Helper {
  return {
    async getLastCall() {
      return calls.length > 0 ? calls[calls.length - 1] : null;
    },
    async getAllCalls() {
      return [...calls];
    },
    reset() {
      calls.length = 0;
    },
  };
}

/**
 * Records a service call. Used by mock API routes or interceptors
 * to simulate the external service during tests.
 */
export function record<Service>Call(call: <Service>Call): void {
  calls.push(call);
}
```

#### Real Implementation

`e2e/fixtures/services/<service>/<service>.real.ts`

Calls actual sandbox/test APIs. Use sandbox or test credentials only — never production.

```typescript
// e2e/fixtures/services/<service>/<service>.real.ts

import type { <Service>Helper } from "./<service>.service";

export function get<Service>RealHelper(): <Service>Helper {
  return {
    async getLastCall() {
      // Call the real service's test/sandbox API to retrieve the last call
      const response = await fetch(
        `${process.env.<SERVICE>_SANDBOX_URL}/api/last-call`,
        { headers: { Authorization: `Bearer ${process.env.<SERVICE>_SANDBOX_API_KEY}` } }
      );
      if (!response.ok) return null;
      return response.json();
    },
    async getAllCalls() {
      const response = await fetch(
        `${process.env.<SERVICE>_SANDBOX_URL}/api/calls`,
        { headers: { Authorization: `Bearer ${process.env.<SERVICE>_SANDBOX_API_KEY}` } }
      );
      if (!response.ok) return [];
      return response.json();
    },
    reset() {
      // Real implementations may not need reset — call history lives in the external service
    },
  };
}
```

#### Test Usage

Import the resolver, never mock/real directly. Use the helper in the Arrange phase and assert on call history.

```typescript
// e2e/tests/app/<domain>.<feature>.spec.ts

import { get<Service>Helper } from "../../fixtures/services/<service>/<service>.service";

test.describe("<Domain> — <Feature>", () => {
  const cookiesToCleanup: string[] = [];
  const <service>Helper = get<Service>Helper();

  test.afterEach(async ({ request }) => {
    <service>Helper.reset();
    for (const cookie of cookiesToCleanup) {
      await cleanup<Domain>(request, cookie);
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  test("should send <service> notification on item creation", async ({ page }) => {
    // Arrange
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);
    const testData = createTest<Domain>();

    // Act
    const domainPage = new <Domain>Page(page);
    await domainPage.goto();
    await domainPage.createItem(testData.title, testData.content);

    // Assert — verify the service was called
    const lastCall = await <service>Helper.getLastCall();
    expect(lastCall).not.toBeNull();
    expect(lastCall!.subject).toContain(testData.title);
  });
});
```

**Rules:**
1. **Tests always import the resolver** (`get<Service>Helper()`), never mock/real directly
2. **Mocks are default** — no env var needed for local/CI runs
3. **Mocks never make network calls** — all data is in-memory
4. **Mocks store call history** for test assertions (`getLastCall()`, `getAllCalls()`)
5. **Real implementations use sandbox/test credentials only** — never production
6. **Reset mock state in `test.afterEach`** — call `<service>Helper.reset()` before cleanup

---

### Auth Tracking Array + Cleanup Pattern

Every test file uses an auth tracking array to ensure all created users are cleaned up, regardless of test outcome.

```typescript
import { cleanup<Domain> } from "../../fixtures/cleanup/<domain>.cleanup";
import { cleanupUser } from "../../fixtures/cleanup/user.cleanup";

const cookiesToCleanup: string[] = [];

test.afterEach(async ({ request }) => {
  for (const cookie of cookiesToCleanup) {
    // 1. Domain entities first (depend on user existing)
    await cleanup<Domain>(request, cookie);
    // 2. User last (owns the entities above)
    await cleanupUser(request, cookie);
  }
  cookiesToCleanup.length = 0;
});
```

When a test involves multiple domains, call all domain cleanups before user cleanup:

```typescript
test.afterEach(async ({ request }) => {
  for (const cookie of cookiesToCleanup) {
    await cleanup<DomainA>(request, cookie);
    await cleanup<DomainB>(request, cookie);
    await cleanupUser(request, cookie);
  }
  cookiesToCleanup.length = 0;
});
```

**Rules:**
1. **Declared at `test.describe` scope** — `const cookiesToCleanup: string[] = []`
2. **Every `createUserViaApi()` must immediately register** — `cookiesToCleanup.push(result.cookie)`
3. **`test.afterEach` iterates array** — all domain cleanups first, then user cleanup, then reset array
4. **Multi-user tests register ALL cookies** — if a test creates user A and user B, both cookies must be registered

---

## Test File Rules

### Skeleton

Every E2E test file must follow this exact skeleton:

```typescript
// e2e/tests/app/<domain>.<feature>.spec.ts

import { test, expect } from "@playwright/test";
import { <Domain>Page } from "../../pages/app/<domain>.page";
import { createTest<Domain> } from "../../fixtures/factories/<domain>.factory";
import { createUserViaApi, injectAuthCookie } from "../../fixtures/setup/auth.setup";
import { create<Domain>ViaApi } from "../../fixtures/setup/<domain>.setup";
import { cleanup<Domain> } from "../../fixtures/cleanup/<domain>.cleanup";
import { cleanupUser } from "../../fixtures/cleanup/user.cleanup";

test.describe("<Domain> — <Feature>", () => {
  // Track ALL auth contexts for cleanup
  const cookiesToCleanup: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const cookie of cookiesToCleanup) {
      await cleanup<Domain>(request, cookie);
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  test("should display empty state when no items exist", async ({ page }) => {
    // Arrange — create user via API, inject auth into browser
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);

    // Act — navigate to page
    const domainPage = new <Domain>Page(page);
    await domainPage.goto();

    // Assert — verify empty state
    await expect(domainPage.emptyState).toBeVisible();
  });

  test("should create a new item", async ({ page }) => {
    // Arrange
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);
    const testData = createTest<Domain>();

    // Act
    const domainPage = new <Domain>Page(page);
    await domainPage.goto();
    await domainPage.createItem(testData.title, testData.content);

    // Assert
    await expect(page.getByTestId(`<domain>-card-${testData.title}`)).toBeVisible();
  });
});
```

### Structure rules

1. **Imports**: page objects from `pages/`, factories from `fixtures/factories/`, setup from `fixtures/setup/`, cleanup from `fixtures/cleanup/`
2. **`test.afterEach`**: Destructure `{ request }`, iterate the auth tracking array — call all domain cleanups + user cleanup for each cookie, then reset the array
3. **Each `test()` block**: Creates its own user and test data — full isolation. Every `createUserViaApi()` call must immediately register the returned cookie to the auth tracking array
4. **Arrange-Act-Assert**: Arrange = API setup + inject auth + navigate; Act = UI interaction; Assert = UI state verification
5. **One main assertion + few supporting assertions per test** — no long assertion chains
6. **No shared mutable state**: No `test.beforeAll`, no shared variables across tests except the cleanup array
7. **No static waits** — never use `page.waitForTimeout()`, `setTimeout`, or any fixed delay. Always wait for a concrete condition: element state, navigation, network response, or auto-retrying assertion. See [Waiting Strategy](#waiting-strategy)

### Isolation rules

1. **Each `test()` creates its own user via API** — `createUserViaApi(page.request)`. No shared sessions
2. **Each `test()` creates its own test data** — via API when preconditions are needed, via UI when testing the creation flow itself
3. **Cleanup runs in `test.afterEach` only** — never call cleanup functions inside `test()` body
4. **Test data must be globally unique** — use `counter + timestamp + random` pattern in factories
5. **No UI-based setup** for tests that aren't testing the setup flow itself — don't sign up via UI if testing CRUD; don't create entities via UI if testing display

### Arrange-Act-Assert pattern

| Phase | E2E implementation |
|-------|-------------------|
| **Arrange** | Create user via API (`createUserViaApi`), create test data via API (`create<Domain>ViaApi`) if needed, inject auth cookie, navigate to page |
| **Act** | Interact with UI — click, fill, submit |
| **Assert** | Verify UI state — element visibility, text content, element count, URL |

### Assertion patterns

```typescript
// Element presence
await expect(locator).toBeVisible();

// Text content
await expect(locator).toHaveText("exact text");
await expect(locator).toContainText("partial");

// Element count
await expect(locator).toHaveCount(3);

// Navigation verification
await expect(page).toHaveURL("/expected-path");

// Element absence (after delete/hide)
await expect(locator).not.toBeVisible();

// Input value
await expect(locator).toHaveValue("expected value");
```

**Rules:**
- Use `toBeVisible()` for presence, `not.toBeVisible()` for absence
- Use `toHaveText()` for exact match, `toContainText()` for partial
- Use `toHaveURL()` after navigation actions

---

### Waiting Strategy

**Never use static waits.** `page.waitForTimeout()`, `setTimeout`, `sleep`, or any fixed-duration delay is forbidden. Static waits are flaky — they either waste time (too long) or cause false failures (too short). Every wait must be tied to a concrete condition that signals the page is ready to proceed.

#### Principle: wait for a visible condition, not for time

Before every interaction or assertion, ask: *"What on the page tells me the previous action is complete?"* Wait for that condition explicitly.

#### Explicit waiting patterns

**1. Wait for element state** — use `locator.waitFor()` inside POM methods when an action causes a UI state change that must complete before the next step:

```typescript
// Dialog opens after button click
await this.createButton.click();
await this.page.getByTestId("<domain>-dialog").waitFor({ state: "visible" });

// Dialog closes after save
await this.page.getByTestId("<domain>-dialog-save-button").click();
await this.page.getByTestId("<domain>-dialog").waitFor({ state: "hidden" });

// Element removed from DOM after delete
await this.page.getByTestId("<domain>-delete-button").click();
await this.page.getByTestId(`<domain>-card-${title}`).waitFor({ state: "detached" });

// Loading spinner disappears
await this.page.getByTestId("<domain>-loading").waitFor({ state: "hidden" });
```

**2. Wait for navigation** — use `page.waitForURL()` when an action triggers a redirect:

```typescript
// After form submission redirects
await submitButton.click();
await this.page.waitForURL("/app/<domain>");

// After sign-out redirects to home
await signOutButton.click();
await this.page.waitForURL("/");
```

**3. Wait for network idle** — use `page.waitForLoadState()` after navigation when the page fetches data on load:

```typescript
// After goto, wait for API calls to complete
await this.page.goto("/app/<domain>");
await this.page.waitForLoadState("networkidle");
```

**4. Wait for specific API response** — use `page.waitForResponse()` when a UI action triggers an API call and the next step depends on its completion:

```typescript
// Wait for the create API call to complete before asserting
const responsePromise = page.waitForResponse((resp) =>
  resp.url().includes("/api/<domain>") && resp.request().method() === "POST"
);
await domainPage.createItem(testData.title, testData.content);
await responsePromise;
```

**5. Assertions as waits** — `expect(locator)` auto-retries until timeout. Use this in test specs as the primary waiting mechanism for assertions:

```typescript
// Auto-retries until the element becomes visible (or timeout)
await expect(page.getByTestId("<domain>-card-title")).toBeVisible();

// Auto-retries until text matches
await expect(page.getByTestId("<domain>-card-title")).toHaveText("Expected Title");

// Auto-retries until element count matches
await expect(page.getByTestId("<domain>-card")).toHaveCount(3);
```

#### Where each pattern belongs

| Pattern | Use in | When |
|---------|--------|------|
| `locator.waitFor()` | **POM methods** | Between multi-step interactions — dialog open/close, element appear/disappear, loading states |
| `page.waitForURL()` | **POM methods** | After actions that trigger navigation/redirect |
| `page.waitForLoadState()` | **POM `goto()` methods** | After navigation when page fetches data on load |
| `page.waitForResponse()` | **Test specs** | When the next assertion depends on a specific API call completing |
| `expect(locator).toBeX()` | **Test specs** | All assertions — Playwright auto-retries these until timeout |

#### Forbidden patterns

```typescript
// NEVER — static wait
await page.waitForTimeout(1000);
await page.waitForTimeout(5000);
await new Promise((resolve) => setTimeout(resolve, 2000));

// NEVER — polling with sleep
while (!ready) {
  await page.waitForTimeout(500);
  ready = await checkCondition();
}
```

**If you feel the need for a static wait, you are missing a condition.** Find the element, network event, or URL change that signals readiness and wait for that instead.

---

## Per-Feature Checklist

For each feature, generate tests covering:

- [ ] Happy path — complete user flow works end-to-end
- [ ] Empty state — correct display when no data exists
- [ ] Error state — validation feedback shown on invalid input
- [ ] Navigation — correct routing after actions (create → list, delete → empty state)
- [ ] Data isolation — user A's data not visible to user B (if applicable)
- [ ] Unauthenticated access — redirect to sign-in page

| Feature type | Typical count | Breakdown |
|---|---|---|
| CRUD page | 5–7 | empty state, create, read/display, update, delete, navigation |
| Auth flow | 3–5 | sign up, sign in, sign out, session protection, invalid credentials |
| Display page | 2–3 | data displayed correctly, empty state, navigation |

---

## Test Scope

**In scope — test at the E2E layer:**
- User-visible flows (sign up, create, edit, delete)
- Navigation and routing (redirects after actions, auth guards)
- Form submissions and validation feedback
- CRUD operations through UI
- Visual state changes (empty state → populated, dialog open → close)
- Auth redirects (unauthenticated → sign-in page)

**Out of scope — covered elsewhere:**
- API response formats and status codes (covered by API tests)
- Unit logic and business rules (covered by unit tests)
- CSS styling and visual regression
- Performance and load testing
- Cross-browser testing (single `chromium` project)

---

## Examples

### CRUD feature — complete spec file

```typescript
// e2e/tests/app/<domain>.crud.spec.ts

import { test, expect } from "@playwright/test";
import { <Domain>Page } from "../../pages/app/<domain>.page";
import { createTest<Domain> } from "../../fixtures/factories/<domain>.factory";
import { createUserViaApi, injectAuthCookie } from "../../fixtures/setup/auth.setup";
import { create<Domain>ViaApi } from "../../fixtures/setup/<domain>.setup";
import { cleanup<Domain> } from "../../fixtures/cleanup/<domain>.cleanup";
import { cleanupUser } from "../../fixtures/cleanup/user.cleanup";

test.describe("<Domain> — CRUD Operations", () => {
  const cookiesToCleanup: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const cookie of cookiesToCleanup) {
      await cleanup<Domain>(request, cookie);
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  // --- Empty state ---

  test("should display empty state when no items exist", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();

    await expect(domainPage.emptyState).toBeVisible();
  });

  // --- Create ---

  test("should create a new item via the form", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);
    const testData = createTest<Domain>();

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();
    await domainPage.createItem(testData.title, testData.content);

    // Main assertion: item appears in list
    await expect(page.getByTestId(`<domain>-card-${testData.title}`)).toBeVisible();
    // Supporting: empty state is gone
    await expect(domainPage.emptyState).not.toBeVisible();
  });

  // --- Read/Display ---

  test("should display item created via API", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    const testData = createTest<Domain>();
    await create<Domain>ViaApi(page.request, cookie, testData);
    await injectAuthCookie(page, cookie);

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();

    await expect(page.getByTestId(`<domain>-card-${testData.title}`)).toBeVisible();
  });

  // --- Update ---

  test("should edit an existing item", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    const original = createTest<Domain>();
    await create<Domain>ViaApi(page.request, cookie, original);
    await injectAuthCookie(page, cookie);
    const updated = createTest<Domain>();

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();
    await domainPage.editItem(original.title, updated.title, updated.content);

    // Main assertion: updated item visible
    await expect(page.getByTestId(`<domain>-card-${updated.title}`)).toBeVisible();
    // Supporting: old item gone
    await expect(page.getByTestId(`<domain>-card-${original.title}`)).not.toBeVisible();
  });

  // --- Delete ---

  test("should delete an item", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    const testData = createTest<Domain>();
    await create<Domain>ViaApi(page.request, cookie, testData);
    await injectAuthCookie(page, cookie);

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();
    await domainPage.deleteItem(testData.title);

    // Main assertion: item removed
    await expect(page.getByTestId(`<domain>-card-${testData.title}`)).not.toBeVisible();
    // Supporting: empty state returns
    await expect(domainPage.emptyState).toBeVisible();
  });

  // --- Navigation ---

  test("should redirect to sign-in when not authenticated", async ({ page }) => {
    await page.goto("/app/<domain>");

    await expect(page).toHaveURL(/signin/);
  });
});
```

### Data isolation test

```typescript
test("should not display another user's items", async ({ page }) => {
  // User A creates an item via API
  const userA = await createUserViaApi(page.request);
  cookiesToCleanup.push(userA.cookie);
  const testData = createTest<Domain>();
  await create<Domain>ViaApi(page.request, userA.cookie, testData);

  // User B should not see it
  const userB = await createUserViaApi(page.request);
  cookiesToCleanup.push(userB.cookie);
  await injectAuthCookie(page, userB.cookie);

  const domainPage = new <Domain>Page(page);
  await domainPage.goto();

  await expect(domainPage.emptyState).toBeVisible();
});
```

### Auth flow test (UI-based setup is correct here)

```typescript
// e2e/tests/auth/signup.spec.ts
// Auth tests ARE testing the UI flow, so UI-based setup is appropriate.

import { test, expect } from "@playwright/test";
import { SignUpPage } from "../../pages/auth/signup.page";
import { createTestUser } from "../../fixtures/factories/user.factory";
import { cleanupUser } from "../../fixtures/cleanup/user.cleanup";

test.describe("Auth — Sign Up", () => {
  const cookiesToCleanup: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const cookie of cookiesToCleanup) {
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  test("should sign up a new user and redirect to dashboard", async ({ page }) => {
    const user = createTestUser();
    const signUpPage = new SignUpPage(page);
    await signUpPage.goto();
    await signUpPage.fillForm(user.name, user.email, user.password);
    await signUpPage.submit();

    // Main assertion: redirected to app
    await expect(page).toHaveURL("/app");

    // Register cookie for cleanup (extract from browser context)
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "session_token");
    if (sessionCookie) {
      cookiesToCleanup.push(`${sessionCookie.name}=${sessionCookie.value}`);
    }
  });
});
```

---

# PART 4 — FINAL VALIDATION

## Critical Mistakes

| Mistake | Rule |
|---------|------|
| Using UI for test setup when API is available | Use `createUserViaApi()` and `create<Domain>ViaApi()` for setup. Only use UI-based setup when testing the UI flow itself (e.g., auth tests) |
| Missing cleanup in `test.afterEach` | Every test file must have `test.afterEach` that iterates the auth tracking array and cleans up domain entities + users |
| Shared state between tests | No `test.beforeAll`, no shared variables except the cleanup array. Each test creates its own user and data |
| Using CSS/text selectors instead of `data-testid` | All locators must use `page.getByTestId()`. No `.locator(".class")`, no `.getByText()` in page objects |
| Using static waits (`page.waitForTimeout()`, `setTimeout`, `sleep`) | Every wait must be tied to a concrete condition — element state (`locator.waitFor()`), navigation (`page.waitForURL()`), network (`page.waitForResponse()`), or auto-retrying assertion (`expect(locator).toBeVisible()`). If you feel the need for a static wait, find the condition you are actually waiting for. See [Waiting Strategy](#waiting-strategy) |
| Long tests with many assertions | Each test should have one main assertion focus + few supporting assertions. Split long flows into separate tests |
| Missing auth tracking array registration | Every `createUserViaApi()` must be immediately followed by `cookiesToCleanup.push(cookie)` |
| Asserting inside Page Object Models | POMs contain locators and interactions only. All assertions belong in test specs |
| Creating data via UI for non-auth tests | If testing CRUD display/edit/delete, create prerequisite data via API. Only test creation via UI in the "create" test itself |
| Missing `page.request` for API calls | Use `page.request` (Playwright's `APIRequestContext`) for in-test API calls — not `fetch` or external HTTP clients |
| Putting all setup/cleanup in single files | Use per-domain files: `setup/<domain>.setup.ts`, `cleanup/<domain>.cleanup.ts`, `factories/<domain>.factory.ts` |
| Adding per-test or per-describe retries | Never use `test.describe.configure({ retries: N })` or per-test retry logic. Retries are configured globally in `playwright.config.ts` (2 in CI, 0 locally). A test that needs retries to pass is flaky — fix the root cause |
| Using real services by default | Mocks must be default. Real only via `USE_REAL_SERVICES=true` |
| Importing mock/real directly | Always use resolver (`get<Service>Helper()`). Direct imports bypass switching |

## Self-Validation Checklist

After generating all test files for a feature, re-read every created file and validate:

- [ ] Every test creates its own user via `createUserViaApi()` (except auth-flow tests that test UI signup)
- [ ] Every `createUserViaApi()` registers the cookie to the cleanup array immediately
- [ ] `test.afterEach` cleans up all domain entities first, then users, then resets the array
- [ ] All locators use `page.getByTestId()` — no CSS selectors, no text selectors
- [ ] No static waits (`page.waitForTimeout()`, `setTimeout`, fixed delays) — every wait targets a concrete condition (element state, URL, network response, auto-retrying assertion)
- [ ] Each test has one main assertion focus with few supporting assertions
- [ ] Page objects contain zero assertions — only locators and interaction methods
- [ ] Test count per feature is within expected range (see Per-Feature Checklist)
- [ ] No `test.beforeAll` or shared mutable state across tests
- [ ] API-based setup is used for test preconditions (non-auth tests)
- [ ] Auth cookie is injected into browser context after API-based user creation
- [ ] Setup, cleanup, and factory files are per-domain (not monolithic)
- [ ] Imports use correct per-domain paths (`fixtures/setup/<domain>.setup`, `fixtures/cleanup/<domain>.cleanup`, `fixtures/factories/<domain>.factory`)
- [ ] Third-party service interactions use resolver pattern (not direct mock/real imports)
- [ ] Mock service state is reset in `test.afterEach`

**Test execution:**

- [ ] Run all generated tests: `npx playwright test --project=chromium`
- [ ] Verify all tests pass (0 failures)
- [ ] Fix any failing tests — adjust test logic, not production code
- [ ] Re-run tests after every fix to confirm all pass
- [ ] Do not mark the task complete until the full suite is green
