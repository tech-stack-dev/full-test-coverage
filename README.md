# full-test-coverage

A Claude Code skill that generates complete, pyramid-shaped test suites for any backend module, API endpoint, or full-stack feature. Point it at your code and it reads the source, selects only the layers you need, and writes every test file — schema tests, service tests, API specs, E2E flows — following strict Vitest and Playwright patterns.

## Install

```bash
npx skills add tech-stack-dev/full-test-coverage-skill
```

## What it does

The skill follows the **testing pyramid**: more unit tests, fewer E2E tests, with no overlap between layers. Each concern is tested at exactly one layer — Zod validation lives in unit tests only, HTTP contracts in API tests only, DB persistence in integration tests only.

```
        ╔═══════════════════════╗
        ║    E2E Tests          ║  Playwright · user journeys through the browser
        ╠═══════════════════════╣
        ║    API Tests          ║  Playwright HTTP · status codes, response bodies
        ╠═══════════════════════╣
        ║    Integration Tests  ║  Vitest + Prisma · real DB, every service branch
        ╠═══════════════════════╣
        ║    Unit Tests         ║  Vitest · isolated logic, all deps mocked
        ╚═══════════════════════╝
```

### Layer selection

The skill reads your code and selects only the layers that apply:

| If your code has... | Layers generated |
|---------------------|-----------------|
| Zod schemas or utility functions | Unit |
| Service methods with branches (if/else, throw) | Unit + Integration |
| HTTP endpoints | + API |
| Browser UI with `data-testid` attributes | + E2E |

### Files generated per layer

| Layer | Files |
|-------|-------|
| Unit | `<domain>.schema.test.ts`, `<domain>.service.test.ts`, `schema.helper.ts`, `<domain>.unit-factory.ts` |
| Integration | `<endpoint>.test.ts`, `database.helper.ts`, `auth.helper.ts`, `<domain>.fixture.ts` |
| API | `<method>-<endpoint>.spec.ts`, `<domain>.factory.ts`, `<domain>.api-utils.ts`, `<domain>.cleanup.ts` |
| E2E | `<domain>.<feature>.spec.ts`, `<domain>.page.ts`, `<domain>.factory.ts`, `setup.ts`, `cleanup.ts` |

## When to use it

Trigger the skill with any of these:

```
"I just wrote a UserService with createUser, findById, updateUser, deleteUser.
 Add full test coverage."

"Our POST /api/invoices endpoint has 0 tests. It validates with Zod, calls
 Stripe, and writes to Postgres. Help me add coverage."

"We refactored the payment service to support multi-currency. I want tests
 that cover all the new branches."

"I added a checkout page with data-testid attributes. Write E2E Playwright
 tests for the purchase flow."

"Our PATCH /api/products/:id only has a happy-path test. It needs coverage
 for 401, 403, 404, and 400 validation failures."
```

### What it does not do

The skill is not triggered by — and will not help with — these:

- Debugging a failing test (`Expected 3 to equal 4`)
- Explaining how a testing tool works (`how do I use vi.mock?`)
- Configuring a test runner (`playwright.config.ts` setup)
- Reviewing an existing test suite for anti-patterns
- Migrating between test frameworks (Jest → Vitest)

## How it works

**Step 1 — Analyze.** Reads your source files: Zod schemas, service classes, route handlers, utility functions, Prisma schema, error definitions, UI components. Builds a complete inventory before writing a single test.

**Step 2 — Select layers.** Applies a decision tree to pick only the layers your code needs. States which layers are selected and why any are skipped.

**Step 3 — Generate bottom-up.** Writes unit tests first, then integration, then API, then E2E. Completes and self-validates each layer before moving to the next. Each layer has a built-in checklist.

## No duplication between layers

The same concern is not tested twice. For example, a `title` field with `min(1)`, `max(255)`, `required` rules:

| Layer | What gets tested | Count |
|-------|-----------------|-------|
| Unit | missing, null, empty string, min boundary, max boundary, over-max, wrong type | 8 tests |
| Integration | one representative case — missing title → 400 VALIDATION_ERROR | 1 test |
| API | one representative case — missing title → 400 | 1 test |
| E2E | nothing — E2E does not test field validation | 0 tests |

## Tech stack

| Layer | Tools |
|-------|-------|
| Unit | Vitest, vi.mock, vi.fn, vi.useFakeTimers |
| Integration | Vitest, Prisma (real DB), Chance.js (fixtures) |
| API | Playwright APIRequestContext |
| E2E | Playwright (Chromium), Page Object Model |

## Supported agents

Claude Code, Cursor, GitHub Copilot, Cline

## Repository structure

```
.agents/skills/full-test-coverage/
├── SKILL.md                        # Orchestration: pyramid, layer selection, universal patterns
└── references/
    ├── unit-testing.md             # 8-step workflow, schema helper, factory, mocking patterns
    ├── integration-testing.md      # DatabaseHelper, AuthHelper, fixture structure
    ├── api-testing.md              # Response helpers, API utilities, per-endpoint test counts
    └── e2e-testing.md              # Page Object Model, waiting strategy, auth injection

full-test-coverage.skill            # Packaged skill — ready to install
skills-lock.json                    # Skill dependencies
temp/                               # Source material used to author the skill
.agents/skills/full-test-coverage-workspace/  # Eval runs and benchmark results
```

## Benchmark

Evaluated across 3 realistic scenarios (new CRUD service, existing endpoint with missing cases, E2E login flow):

| | With skill | Without skill |
|--|-----------|---------------|
| Pass rate | 77.7% | 25.3% |
| Delta | **+52pp** | — |

## License

MIT
