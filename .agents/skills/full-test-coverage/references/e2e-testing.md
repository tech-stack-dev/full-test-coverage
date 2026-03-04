# E2E Testing Reference

> Agent instructions for generating Playwright UI tests. Full user workflow testing through the browser. Fewest tests, highest confidence in user experience.

## Table of Contents
1. [Orientation](#orientation)
2. [Generation Workflow (Steps 1–9)](#generation-workflow)
3. [Playwright Configuration](#playwright-configuration)
4. [Auth Setup Helpers — verbatim templates](#auth-setup-helpers)
5. [Cleanup Helpers](#cleanup-helpers)
6. [Page Object Model — verbatim template](#page-object-model)
7. [Test Data Factories](#test-data-factories)
8. [Auth Tracking Array + Cleanup Pattern](#auth-tracking-array)
9. [Test File Rules](#test-file-rules)
10. [Waiting Strategy — 5 patterns](#waiting-strategy)
11. [Third-Party Service Helpers](#third-party-service-helpers)
12. [Per-Feature Checklist and Test Counts](#per-feature-checklist)
13. [Critical Mistakes](#critical-mistakes)
14. [Self-Validation Checklist](#self-validation-checklist)

---

## Orientation

E2E tests verify user-visible flows through the browser. The fewest tests in the pyramid — they cover complete journeys, not field validation or API contracts.

**In scope:**
- User-visible flows (sign up, create, edit, delete)
- Navigation and routing (redirects after actions, auth guards)
- Form submissions and validation feedback
- Visual state changes (empty state → populated, dialog open → close)
- Auth redirects (unauthenticated → sign-in page)
- Data isolation (user A's data not visible to user B)

**Out of scope** (covered elsewhere):
- API response formats and status codes (API tests)
- Unit logic, Zod validation, service branches (unit + integration tests)
- CSS/visual regression, performance, load, cross-browser

**Tech stack:** Playwright (browser automation + APIRequestContext) · TypeScript · Page Object Model

**Directory structure:**
```
e2e/
├── fixtures/
│   ├── setup/
│   │   ├── auth.setup.ts              # createUserViaApi(), injectAuthCookie()
│   │   └── <domain>.setup.ts         # create<Domain>ViaApi()
│   ├── cleanup/
│   │   ├── user.cleanup.ts            # cleanupUser()
│   │   └── <domain>.cleanup.ts       # cleanup<Domain>()
│   ├── factories/
│   │   ├── user.factory.ts            # TestUser + createTestUser()
│   │   └── <domain>.factory.ts       # Test<Domain> + createTest<Domain>()
│   └── services/<service>/            # Third-party service helpers
│       ├── <service>.service.ts       # Interface + resolver
│       ├── <service>.mock.ts          # Mock implementation (default)
│       └── <service>.real.ts          # Real implementation (opt-in)
├── pages/
│   ├── auth/signup.page.ts
│   ├── auth/signin.page.ts
│   └── app/<domain>.page.ts
└── tests/
    ├── auth/signup.spec.ts
    └── app/<domain>.<feature>.spec.ts
```

**Naming conventions:**
| Item | Pattern | Example |
|------|---------|---------|
| Test file | `<domain>.<feature>.spec.ts` | `notes.crud.spec.ts` |
| Page object | `<domain>.page.ts` | `notes.page.ts` |
| Factory function | `createTest<Domain>()` | `createTestNote()` |
| Setup function | `create<Domain>ViaApi()` | `createNoteViaApi()` |
| Cleanup function | `cleanup<Domain>()` | `cleanupNotes()` |
| Describe string | `"<Domain> — <Feature>"` | `"Notes — CRUD Operations"` |

---

## Generation Workflow

Follow this exact sequence. Do not skip or reorder steps.

**Step 1 — Read PRD and source code**
Read: PRD/feature spec (user flows, acceptance criteria), page components (data-testid attributes), existing page objects, existing fixtures, route handlers (API endpoints for setup/cleanup), auth setup pattern.

**Step 2 — Identify user flows to test**
Map PRD features to testable flows. One spec file per feature area.

**Step 3 — Create or update Page Object Models**
`e2e/pages/app/<domain>.page.ts` — one POM per page/feature. See [Page Object Model](#page-object-model).

**Step 4 — Create or update test data factory**
`e2e/fixtures/factories/<domain>.factory.ts` — unique data generation per domain.

**Step 5 — Create API-based setup helper**
`e2e/fixtures/setup/<domain>.setup.ts` — create test data via API, not UI.

**Step 6 — Create third-party service helpers** (only when feature interacts with external services)
`e2e/fixtures/services/<service>/` — interface + mock + real + resolver.

**Step 7 — Create cleanup helper**
`e2e/fixtures/cleanup/<domain>.cleanup.ts` — list-then-delete with try/catch per entity.

**Step 8 — Write test specs**
`e2e/tests/app/<domain>.<feature>.spec.ts` — see [Test File Rules](#test-file-rules).

**Step 9 — Self-validate**
Run [Self-Validation Checklist](#self-validation-checklist). Then run `npx playwright test --project=chromium`. Fix all failures.

---

## Playwright Configuration

```typescript
// playwright.config.ts (relevant excerpt)
export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  retries: isCI ? 2 : 0,  // 2 in CI, 0 locally — never per-test retries
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "yarn dev",
    url: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    reuseExistingServer: !isCI,
  },
});
```

Run E2E tests: `npx playwright test --project=chromium`

**Never add** `test.describe.configure({ retries: N })` or per-test retry logic — a test that needs retries is flaky.

---

## Auth Setup Helpers

`e2e/fixtures/setup/auth.setup.ts` — create verbatim if it doesn't exist:

```typescript
import type { APIRequestContext, Page } from "@playwright/test";

let userCounter = 0;

/**
 * Creates a user via API and returns the session cookie.
 * Use for all tests that need an authenticated user but are NOT testing the auth flow.
 */
export async function createUserViaApi(
  request: APIRequestContext,
  overrides: { email?: string; password?: string; name?: string } = {}
): Promise<{ cookie: string; email: string; password: string }> {
  userCounter++;
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);

  const email = overrides.email || `e2e-${userCounter}-${timestamp}-${random}@test.com`;
  const password = overrides.password || "TestPassword123!";
  const name = overrides.name || `E2E User ${userCounter}`;

  const response = await request.post("/api/auth/sign-up/email", {
    data: { email, password, name },
  });

  if (!response.ok()) {
    throw new Error(`API user creation failed: ${response.status()} - ${await response.text()}`);
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

`e2e/fixtures/setup/<domain>.setup.ts`:
```typescript
import type { APIRequestContext } from "@playwright/test";

export async function create<Domain>ViaApi(
  request: APIRequestContext,
  cookie: string,
  data: { title: string; content?: string }
): Promise<{ id: string; title: string; content: string }> {
  const response = await request.post("/api/<domain>", { data, headers: { cookie } });
  if (!response.ok()) {
    throw new Error(`API <domain> creation failed: ${response.status()} - ${await response.text()}`);
  }
  return response.json();
}
```

---

## Cleanup Helpers

`e2e/fixtures/cleanup/user.cleanup.ts`:
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

`e2e/fixtures/cleanup/<domain>.cleanup.ts`:
```typescript
import type { APIRequestContext } from "@playwright/test";

export async function cleanup<Domain>(request: APIRequestContext, cookie: string): Promise<void> {
  try {
    const listResponse = await request.get("/api/<domain>", { headers: { cookie } });
    if (!listResponse.ok()) return;
    const entities = await listResponse.json();
    if (!Array.isArray(entities) || entities.length === 0) return;
    for (const entity of entities) {
      try {
        await request.delete(`/api/<domain>/${entity.id}`, { headers: { cookie } });
      } catch (error) {
        console.warn(`Cleanup: failed to delete <domain> ${entity.id}:`, error);
      }
    }
  } catch (error) {
    console.warn("Cleanup: failed to list <domain> for deletion:", error);
  }
}
```

**Cleanup rules:** outer try/catch on every function; inner try/catch per entity; log via `console.warn`; domain cleanup before user cleanup; idempotent (handles already-deleted entities).

---

## Page Object Model

`e2e/pages/app/<domain>.page.ts` — create verbatim structure:

```typescript
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
    await this.page.waitForLoadState("networkidle");
  }

  async createItem(title: string, content: string = "") {
    await this.createButton.click();
    await this.page.getByTestId("<domain>-dialog").waitFor({ state: "visible" });
    await this.page.getByTestId("<domain>-dialog-title-input").fill(title);
    if (content) {
      await this.page.getByTestId("<domain>-dialog-content-input").fill(content);
    }
    await this.page.getByTestId("<domain>-dialog-save-button").click();
    await this.page.getByTestId("<domain>-dialog").waitFor({ state: "hidden" });
  }
}
```

**POM rules:**
1. All locators via `data-testid` exclusively — use `page.getByTestId()`. No CSS selectors, no text selectors
2. Constructor assigns all locators as `readonly` properties
3. Methods encapsulate multi-step interactions (dialog open → fill → save → wait for close)
4. Every POM must have a `goto()` method
5. **Never assert inside POM** — assertions belong in test specs only
6. Explicit waits for state changes inside POM methods (see [Waiting Strategy](#waiting-strategy))

---

## Test Data Factories

```typescript
// e2e/fixtures/factories/<domain>.factory.ts
export type Test<Domain> = { title: string; content: string };

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

Use `counter + timestamp + random` — prevents collisions across parallel workers.

---

## Auth Tracking Array

Every test file declares and uses the auth tracking array:

```typescript
const cookiesToCleanup: string[] = [];

test.afterEach(async ({ request }) => {
  for (const cookie of cookiesToCleanup) {
    await cleanup<Domain>(request, cookie);  // domain first
    await cleanupUser(request, cookie);      // user last
  }
  cookiesToCleanup.length = 0;
});
```

Inside each test:
```typescript
const { cookie } = await createUserViaApi(page.request);
cookiesToCleanup.push(cookie);  // IMMEDIATELY register
await injectAuthCookie(page, cookie);
```

**Rules:** declared at `test.describe` scope; every `createUserViaApi()` must immediately register; multi-user tests register ALL cookies; reset array after cleanup.

---

## Test File Rules

Every E2E test file must follow this skeleton:

```typescript
import { test, expect } from "@playwright/test";
import { <Domain>Page } from "../../pages/app/<domain>.page";
import { createTest<Domain> } from "../../fixtures/factories/<domain>.factory";
import { createUserViaApi, injectAuthCookie } from "../../fixtures/setup/auth.setup";
import { create<Domain>ViaApi } from "../../fixtures/setup/<domain>.setup";
import { cleanup<Domain> } from "../../fixtures/cleanup/<domain>.cleanup";
import { cleanupUser } from "../../fixtures/cleanup/user.cleanup";

test.describe("<Domain> — <Feature>", () => {
  const cookiesToCleanup: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const cookie of cookiesToCleanup) {
      await cleanup<Domain>(request, cookie);
      await cleanupUser(request, cookie);
    }
    cookiesToCleanup.length = 0;
  });

  test("should display empty state when no items exist", async ({ page }) => {
    // Arrange — API user creation, inject auth into browser
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);

    // Act
    const domainPage = new <Domain>Page(page);
    await domainPage.goto();

    // Assert
    await expect(domainPage.emptyState).toBeVisible();
  });

  test("should create a new item", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    await injectAuthCookie(page, cookie);
    const testData = createTest<Domain>();

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();
    await domainPage.createItem(testData.title, testData.content);

    await expect(page.getByTestId(`<domain>-card-${testData.title}`)).toBeVisible();
  });

  test("should display item created via API", async ({ page }) => {
    const { cookie } = await createUserViaApi(page.request);
    cookiesToCleanup.push(cookie);
    const testData = createTest<Domain>();
    await create<Domain>ViaApi(page.request, cookie, testData);  // API setup
    await injectAuthCookie(page, cookie);

    const domainPage = new <Domain>Page(page);
    await domainPage.goto();

    await expect(page.getByTestId(`<domain>-card-${testData.title}`)).toBeVisible();
  });
});
```

**Arrange-Act-Assert:**
| Phase | Implementation |
|-------|---------------|
| **Arrange** | `createUserViaApi` + `create<Domain>ViaApi` (if preconditions needed) + `injectAuthCookie` + `goto()` |
| **Act** | UI interactions — click, fill, submit |
| **Assert** | `expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveURL()` |

**Structure rules:** each `test()` creates its own user via API; no `test.beforeAll`; no shared mutable state; cleanup in `test.afterEach` only; precondition data via API (not UI) except when testing the creation flow itself.

---

## Waiting Strategy

**Never use static waits.** `page.waitForTimeout()`, `setTimeout`, `sleep` = forbidden.

**5 explicit waiting patterns:**

**1. Wait for element state** (inside POM methods):
```typescript
await this.createButton.click();
await this.page.getByTestId("<domain>-dialog").waitFor({ state: "visible" });
await this.page.getByTestId("<domain>-dialog-save-button").click();
await this.page.getByTestId("<domain>-dialog").waitFor({ state: "hidden" });
// Element removed from DOM:
await this.page.getByTestId(`<domain>-card-${title}`).waitFor({ state: "detached" });
```

**2. Wait for navigation** (inside POM methods):
```typescript
await submitButton.click();
await this.page.waitForURL("/app/<domain>");
```

**3. Wait for network idle** (inside POM `goto()` methods):
```typescript
await this.page.goto("/app/<domain>");
await this.page.waitForLoadState("networkidle");
```

**4. Wait for specific API response** (in test specs):
```typescript
const responsePromise = page.waitForResponse(
  (resp) => resp.url().includes("/api/<domain>") && resp.request().method() === "POST"
);
await domainPage.createItem(testData.title, testData.content);
await responsePromise;
```

**5. Assertions as waits** (primary waiting mechanism in test specs — auto-retries):
```typescript
await expect(page.getByTestId("<domain>-card-title")).toBeVisible();
await expect(page.getByTestId("<domain>-card-title")).toHaveText("Expected Title");
await expect(page.getByTestId("<domain>-card")).toHaveCount(3);
await expect(page).toHaveURL("/expected-path");
```

| Pattern | Use in | When |
|---------|--------|------|
| `locator.waitFor()` | POM methods | Between multi-step interactions (dialog states, element appear/disappear) |
| `page.waitForURL()` | POM methods | After actions that trigger navigation |
| `page.waitForLoadState()` | POM `goto()` | After navigation when page fetches data on load |
| `page.waitForResponse()` | Test specs | When next assertion depends on specific API call completing |
| `expect(locator).toBeX()` | Test specs | All assertions — Playwright auto-retries |

---

## Third-Party Service Helpers

When E2E tests interact with external services (email, payments, etc.), use the resolver pattern. Mocks are default — no config needed for local/CI.

```typescript
// e2e/fixtures/services/<service>/<service>.service.ts
export interface <Service>Helper {
  getLastCall(): Promise<{ to: string; subject: string; body: string } | null>;
  getAllCalls(): Promise<{ to: string; subject: string; body: string }[]>;
  reset(): void;
}

export function get<Service>Helper(): <Service>Helper {
  if (process.env.USE_REAL_SERVICES === "true") {
    return get<Service>RealHelper();
  }
  return get<Service>MockHelper();
}
```

```typescript
// <service>.mock.ts — in-memory, no network calls
type Call = { to: string; subject: string; body: string };
const calls: Call[] = [];

export function get<Service>MockHelper(): <Service>Helper {
  return {
    async getLastCall() { return calls.length > 0 ? calls[calls.length - 1] : null; },
    async getAllCalls() { return [...calls]; },
    reset() { calls.length = 0; },
  };
}
```

**Rules:** tests always import resolver (`get<Service>Helper()`); mocks never make network calls; reset in `test.afterEach` before cleanup; real implementations use sandbox credentials only.

---

## Per-Feature Checklist

For each feature, generate tests covering:
- [ ] Happy path — complete user flow works end-to-end
- [ ] Empty state — correct display when no data exists
- [ ] Error state — validation feedback shown on invalid input (if applicable)
- [ ] Navigation — correct routing after actions
- [ ] Data isolation — user A's data not visible to user B (if applicable)
- [ ] Unauthenticated access — redirect to sign-in page

**Expected test counts:**

| Feature type | Typical count | Breakdown |
|---|---|---|
| CRUD page | 5–7 | empty state, create, read/display, update, delete, navigation |
| Auth flow | 3–5 | sign up, sign in, sign out, session protection, invalid credentials |
| Display page | 2–3 | data displayed correctly, empty state, navigation |

---

## Critical Mistakes

| Mistake | Rule |
|---------|------|
| Using UI for test setup | Use `createUserViaApi()` and `create<Domain>ViaApi()` for setup. Only UI-based setup for auth flow tests |
| Missing `test.afterEach` cleanup | Every file must have `test.afterEach` iterating auth tracking array — domain cleanup + user cleanup |
| Shared state between tests | No `test.beforeAll`, no shared variables except cleanup array |
| CSS/text selectors instead of `data-testid` | All locators must use `page.getByTestId()` |
| Static waits | `page.waitForTimeout()`, `setTimeout`, `sleep` are forbidden — find the condition to wait for |
| Long tests with many assertions | One main assertion focus + few supporting assertions. Split long flows |
| Missing auth tracking registration | Every `createUserViaApi()` must immediately `cookiesToCleanup.push(cookie)` |
| Asserting inside Page Object Models | POMs contain locators and interactions only |
| Creating data via UI for non-auth tests | Create prerequisites via API |
| Using `fetch` for in-test API calls | Use `page.request` (Playwright's `APIRequestContext`) |
| Per-test or per-describe retries | Never use `test.describe.configure({ retries: N })` |
| Importing mock/real service directly | Always use resolver (`get<Service>Helper()`) |

---

## Self-Validation Checklist

- [ ] Every test creates its own user via `createUserViaApi()` (except auth-flow tests)
- [ ] Every `createUserViaApi()` immediately registers cookie to cleanup array
- [ ] `test.afterEach` cleans up domain entities first, then users, then resets array
- [ ] All locators use `page.getByTestId()` — no CSS selectors, no text selectors
- [ ] No static waits — every wait targets a concrete condition
- [ ] Each test has one main assertion focus with few supporting assertions
- [ ] Page objects contain zero assertions — only locators and interaction methods
- [ ] Test count per feature is within expected range (Per-Feature Checklist)
- [ ] No `test.beforeAll` or shared mutable state across tests
- [ ] API-based setup for test preconditions (non-auth tests)
- [ ] Auth cookie injected into browser after API-based user creation
- [ ] Setup, cleanup, and factory files are per-domain (not monolithic)
- [ ] Third-party service interactions use resolver pattern

**Test execution:**
- [ ] Run: `npx playwright test --project=chromium`
- [ ] All tests pass (0 failures)
- [ ] Fix failures — adjust test logic, not production code
