# Unit Testing Reference

> Agent instructions for generating unit tests. No database, no HTTP, no real external services.

## Table of Contents
1. [Orientation](#orientation)
2. [Generation Workflow (Steps 1–8)](#generation-workflow)
3. [Schema Test Helper — verbatim template](#schema-test-helper)
4. [Unit Factory — template](#unit-factory)
5. [Service Test — template](#service-test-template)
6. [Mocking Patterns](#mocking-patterns)
7. [Zod Testing Patterns](#zod-testing-patterns)
8. [Critical Mistakes](#critical-mistakes)
9. [Self-Validation Checklist](#self-validation-checklist)

---

## Orientation

**Three targets — in priority order:**
1. **Zod schemas** — one `describe` per field, one `it()` per rule. Exhaustive coverage.
2. **Service methods** — every branch, every throw, every mock call verified with exact arguments.
3. **Utility functions** — every exported function, typical inputs, edge cases, errors.

| Concern | Unit tests | Other layers |
|---------|-----------|--------------|
| Zod validation | **Every rule on every field — exhaustive** | API: 1 per endpoint; Integration: 1–2 wiring only |
| Service logic | **Every branch — all deps replaced with vi.fn()** | Integration: every branch with real DB |
| Pure utility functions | **Full coverage** | Not tested elsewhere |
| Mock call argument verification | **Exact arguments on every dep call** | Not tested elsewhere |
| Guard clause ordering | **Downstream mocks not called when early throw fires** | Not tested elsewhere |
| Timer-dependent logic | **vi.useFakeTimers() — no real waiting** | Not tested elsewhere |

**Tech stack:** Vitest (runner + assertions + mocking) · TypeScript · vi.mock / vi.fn / vi.spyOn · vi.useFakeTimers()

> **Vitest globals are enabled.** `describe`, `it`, `test`, `expect`, `vi`, `beforeEach`, `afterEach` are available without imports. Do NOT import them from `"vitest"`.

**Directory structure:**
```
src/modules/<domain>/test/unit/
├── <domain>.schema.test.ts      # Zod schema — exhaustive field × rule coverage
├── <domain>.service.test.ts     # Service logic — all deps mocked
└── <domain>.utils.test.ts       # Pure utility functions (if applicable)

tests-unit/
├── helpers/schema.helper.ts     # expectValid / expectInvalid
└── factories/<domain>/<domain>.unit-factory.ts
```

**Naming conventions:**
| Item | Pattern | Example |
|------|---------|---------|
| Schema test file | `<domain>.schema.test.ts` | `orders.schema.test.ts` |
| Service unit test file | `<domain>.service.test.ts` | `orders.service.test.ts` |
| Unit factory file | `<domain>.unit-factory.ts` | `orders.unit-factory.ts` |
| Describe (schema) | `"<schemaName>"` | `"createOrderSchema"` |
| Describe (field) | `".<fieldName>"` | `".quantity"` |
| Describe (service method) | `"<serviceName>.<methodName>()"` | `"ordersService.create()"` |
| Test name (valid) | `"should accept <description>"` | `"should accept quantity at max (1000)"` |
| Test name (invalid) | `"should reject <description>"` | `"should reject quantity exceeding max (1001)"` |
| Test name (behavior) | `"should <outcome> when <condition>"` | `"should throw NotFound when resource does not exist"` |

---

## Generation Workflow

Follow this exact sequence. Do not skip or reorder steps.

**Step 1 — Read source code**
Read: Zod schemas/DTOs, service class, utility functions, error definitions, external dependency interfaces.
Record: every field + every rule; every public method + every dependency it calls; every exported utility function.

**Step 2 — Map all cases**
For each schema field, draw a tree: `required → ✗ missing/undefined; .min(n) → ✗ n-1; .max(n) → ✓ n, ✗ n+1; type → ✗ wrong-type`.
For each service method, list every execution path: happy path calls + error throws + guard clauses.
Write the full case list as comments inside the `describe` block before any `it()`.

**Step 3 — Create test infrastructure** (check `tests-unit/` first — don't recreate)
- `tests-unit/helpers/schema.helper.ts` — see [Schema Test Helper](#schema-test-helper)
- `tests-unit/factories/<domain>/<domain>.unit-factory.ts` — see [Unit Factory](#unit-factory)

**Step 4 — Write schema tests** (`<domain>.schema.test.ts`)
Write case list as comments first (Step 4a). Only then implement tests (Step 4b). One `describe` per field. One `it()` per rule. See [Zod Testing Patterns](#zod-testing-patterns).

**Step 5 — Write service unit tests** (`<domain>.service.test.ts`)
Declare `vi.mock()` calls **before any imports**. Set default mock return values in `beforeEach`. See [Service Test Template](#service-test-template).

**Step 6 — Write utility tests** (`<domain>.utils.test.ts`)
Only if the module exports utility functions. No mocking unless the utility calls an external module.

**Step 7 — Run tests**
```bash
vitest run src/modules/<domain>/test/unit/
```
Fix all failures. Never mark complete while tests are red.

**Step 8 — Self-validate**
Run the [Self-Validation Checklist](#self-validation-checklist).

---

## Schema Test Helper

`tests-unit/helpers/schema.helper.ts` — create verbatim if it doesn't exist:

```typescript
import { ZodSchema, ZodError } from "zod";

/**
 * Asserts that the schema accepts the input without errors.
 * Returns the parsed (and transformed) value for further assertions.
 */
export function expectValid<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  expect(
    result.success,
    `Expected valid but schema rejected: ${
      !result.success ? JSON.stringify(result.error.issues, null, 2) : ""
    }`
  ).toBe(true);
  return (result as { success: true; data: T }).data;
}

/**
 * Asserts that the schema rejects the input.
 * If expectedPath is provided, asserts the error targets that specific field.
 * If expectedMessageSubstring is provided, asserts at least one issue message contains it.
 * Returns the ZodError for further assertions if needed.
 */
export function expectInvalid(
  schema: ZodSchema,
  input: unknown,
  expectedPath?: string,
  expectedMessageSubstring?: string
): ZodError {
  const result = schema.safeParse(input);
  expect(result.success, "Expected schema to reject input but it accepted it").toBe(false);
  const error = (result as { success: false; error: ZodError }).error;
  if (expectedPath !== undefined) {
    const errorPaths = error.issues.map((issue) => issue.path.join("."));
    expect(
      errorPaths,
      `Expected error on path "${expectedPath}" but errors were on: [${errorPaths.join(", ")}]`
    ).toContain(expectedPath);
  }
  if (expectedMessageSubstring !== undefined) {
    const messages = error.issues.map((issue) => issue.message);
    const hasMatch = messages.some((msg) => msg.includes(expectedMessageSubstring));
    expect(
      hasMatch,
      `Expected an issue message containing "${expectedMessageSubstring}" but got: [${messages.join(", ")}]`
    ).toBe(true);
  }
  return error;
}
```

**Usage:**
- `expectValid` returns parsed value — use for transform assertions: `const r = expectValid(schema, input); expect(r.field).toBe("Trimmed")`
- `expectInvalid` third param = dot-path e.g. `"name"`, `"address.city"`, `"tags.0"` — always pass it
- Never call `schema.parse()` directly — it throws and produces worse errors

---

## Unit Factory

`tests-unit/factories/<domain>/<domain>.unit-factory.ts` — use plain literal values, not random:

```typescript
// Replace <Domain>, <CreateDto>, <UpdateDto>, field names, and boundary values
// with actual names and constraints from <domain>.dto.ts.

import type { <CreateDto>, <UpdateDto> } from "@/src/modules/<domain>/<domain>.dto";

export const <Domain>UnitFactory = {
  valid: {
    /** Only required fields at their simplest valid values */
    minimal: (): <CreateDto> => ({
      <requiredField>: "<typical value>",
    }),
    /** All fields at typical values */
    complete: (): <CreateDto> => ({
      <requiredField>: "<typical value>",
      <optionalField>: "<typical value>",
    }),
    /** Every field at its maximum allowed length — boundary ✓ */
    atMaxLength: (): <CreateDto> => ({
      <requiredField>: "a".repeat(<maxLength>),   // max(<maxLength>)
      <optionalField>: "b".repeat(<maxLength>),   // max(<maxLength>)
    }),
  },
  invalid: {
    // Each invalid builder has exactly ONE invalid field — all others valid
    missing<Field>: () => ({ <otherField>: "<valid value>" }),
    undefined<Field>: () => ({ <requiredField>: undefined }),
    null<Field>: () => ({ <requiredField>: null }),
    empty<Field>: () => ({ <requiredField>: "" }),
    <field>OneOverMax: () => ({ <requiredField>: "a".repeat(<maxLength + 1>) }),
    <field>WrongType: () => ({ <requiredField>: 42 }),
    <optionalField>OneOverMax: () => ({
      <requiredField>: "<valid value>",
      <optionalField>: "c".repeat(<maxLength + 1>),
    }),
  },
  update: {
    valid: {
      <field>Only: (): <UpdateDto> => ({ <field>: "<updated value>" }),
      complete: (): <UpdateDto> => ({ <requiredField>: "<updated>", <optionalField>: "<updated>" }),
      empty: (): <UpdateDto> => ({}),  // all optional → valid
      atMaxLength: (): <UpdateDto> => ({ <requiredField>: "a".repeat(<maxLength>) }),
    },
    invalid: {
      empty<Field>: () => ({ <field>: "" }),
      <field>OneOverMax: () => ({ <field>: "a".repeat(<maxLength + 1>) }),
    },
  },
};
```

> Why plain values not random: unit tests assert exact return values and mock arguments. Random values produce non-reproducible failures.

---

## Service Test Template

```typescript
// ── Step 1: Declare vi.mock calls FIRST, before any imports ───────────────────
vi.mock("@/src/lib/server", () => ({
  prisma: {
    <model>: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  Errors,
}));

// ── Step 2: Import modules AFTER vi.mock declarations ─────────────────────────
import { <domain>Service } from "@/src/modules/<domain>/<domain>.service";
import { Errors, DomainError } from "@/src/lib/server/errors";
import { <Domain>UnitFactory } from "@/tests-unit/factories/<domain>/<domain>.unit-factory";
import { prisma } from "@/src/lib/server";

// ── Test data constants (never mutate these) ──────────────────────────────────
const USER_ID = "user-123";
const ORG_ID  = "org-456";
const RECORD_ID = "record-789";
const MOCK_RECORD = {
  id: RECORD_ID,
  userId: USER_ID,
  organizationId: ORG_ID,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
};

describe("<domain>Service.create()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.<model>.create).mockResolvedValue(MOCK_RECORD as any);
  });

  describe("happy path", () => {
    it("should return the created <resource>", async () => {
      const dto = <Domain>UnitFactory.valid.complete();
      const result = await <domain>Service.create(USER_ID, ORG_ID, dto);
      expect(result).toEqual(MOCK_RECORD);
    });

    it("should call prisma.<model>.create with correct arguments", async () => {
      const dto = <Domain>UnitFactory.valid.complete();
      await <domain>Service.create(USER_ID, ORG_ID, dto);
      expect(prisma.<model>.create).toHaveBeenCalledOnce();
      expect(prisma.<model>.create).toHaveBeenCalledWith({
        data: { ...dto, userId: USER_ID, organizationId: ORG_ID },
      });
    });
  });

  describe("guard clauses", () => {
    it("should throw when <resource> does not exist", async () => {
      vi.mocked(prisma.<model>.findUnique).mockResolvedValueOnce(null);
      await expect(<domain>Service.getById(ORG_ID, RECORD_ID)).rejects.toThrow(DomainError);
      // Verify downstream mocks NOT called
      expect(prisma.<model>.create).not.toHaveBeenCalled();
    });
  });
});
```

---

## Mocking Patterns

### vi.mock — declare before imports
```typescript
// ✓ Correct
vi.mock("@/src/lib/server", () => ({
  prisma: { <model>: { create: vi.fn() } },
}));
import { prisma } from "@/src/lib/server"; // receives mock

// ✗ Wrong
import { prisma } from "@/src/lib/server"; // real module already bound
vi.mock("@/src/lib/server", ...);           // too late
```
Rules: mock at exact import path the source file uses; only mock methods the tested module calls; `vi.clearAllMocks()` in `beforeEach`; set defaults in `beforeEach`, override with `mockResolvedValueOnce` per test.

### Mock call assertions — always verify arguments
```typescript
// ✓ Exact arguments
expect(prisma.<model>.create).toHaveBeenCalledWith({
  data: { <field>: "<value>", userId: "user-123" },
});
// ✗ Proves nothing
expect(prisma.<model>.create).toHaveBeenCalled();
```

### vi.spyOn — wrap real implementations
```typescript
let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { spy = vi.spyOn(utils, "<fn>").mockReturnValue("Mocked"); });
afterEach(() => { spy.mockRestore(); });
```

### test.each — collapse repeated invalid cases
```typescript
describe(".<field>", () => {
  test.each([
    { label: "missing",      input: Factory.invalid.missing<Field>() },
    { label: "empty string", input: Factory.invalid.empty<Field>() },
    { label: "one over max", input: Factory.invalid.<field>OneOverMax() },
    { label: "wrong type",   input: Factory.invalid.<field>WrongType() },
  ])("should reject <field> when $label", ({ input }) => {
    expectInvalid(schema, input, "<field>");
  });
});
```

---

## Zod Testing Patterns

**Boundary values — always test both sides:**
```typescript
it("should accept N characters (max boundary ✓)", () => {
  expectValid(schema, { <field>: "a".repeat(N) });
});
it("should reject N+1 characters (one over max)", () => {
  expectInvalid(schema, { <field>: "a".repeat(N + 1) }, "<field>");
});
```

**Transform — assert the output:**
```typescript
it("should trim whitespace from <field>", () => {
  const result = expectValid(schema, { <field>: "  Hello  " });
  expect(result.<field>).toBe("Hello");
});
```

**Optional vs nullable:**
- `.optional()` → `undefined` accepted, `null` rejected
- `.nullable()` → `null` accepted, `undefined` rejected (unless also `.optional()`)

**Nested paths:** use dot-notation: `"address.city"`, `"tags.0"`

**Timer-dependent logic:**
```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
it("should return true when expiry is in the past", () => {
  vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));
  expect(isExpired(new Date("2024-06-01T11:00:00Z"))).toBe(true);
});
```

---

## Critical Mistakes

| Mistake | Rule |
|---------|------|
| Missing boundary valid test | For every `.max(n)`, test `n` (valid) AND `n+1` (invalid). Testing only rejection leaves the rule itself unverified |
| `vi.mock()` declared after imports | Must appear before the import that uses the mocked module — the real module is already bound if declared after |
| Missing `vi.clearAllMocks()` in `beforeEach` | Without clearing, call counts from previous tests accumulate and cause false `toHaveBeenCalledOnce()` assertions |
| Default mock set outside `beforeEach` | Module-scope defaults persist mutated state. Always set in `beforeEach` |
| Asserting mock called without arguments | `toHaveBeenCalled()` proves nothing. Always use `toHaveBeenCalledWith(...)` |
| Missing guard clause verification | After asserting a guard throw, verify downstream mocks were NOT called |
| Real I/O in unit tests | Any test hitting Prisma, HTTP, or file system is not a unit test |
| `setTimeout` / `sleep` | Use `vi.useFakeTimers()` + `vi.setSystemTime()` |
| `expect.anything()` | Use explicit values or `expect.any(String)` |
| Snapshot tests | Never use `.toMatchSnapshot()` |
| Importing vitest globals | `describe`, `it`, `expect`, `vi` are globals — do not import from `"vitest"` |
| Shared invalid factory data | Every invalid builder must have exactly one invalid field — all others valid |

---

## Self-Validation Checklist

**Schema coverage:**
- [ ] Every field in every schema has a dedicated `describe(".<fieldName>")` block
- [ ] Every required field has: missing, undefined, null (unless nullable), wrong-type tests
- [ ] Every optional field has: omitted, undefined, wrong-type-when-present tests
- [ ] Every `.min()` / `.max()` has both a boundary-valid (`n`) and one-step-beyond (`n±1`) test
- [ ] Every `.regex()` / `.email()` / `.url()` has a valid format test and at least one invalid
- [ ] Every `.enum()` has a test for each valid value and one for an unknown value
- [ ] Every `.refine()` / `.superRefine()` has tests for every branch
- [ ] Every `.transform()` uses `expectValid`'s return value to assert transformed output
- [ ] Every `.default()` has: omitted → default applied; explicit value → not overridden
- [ ] Update schemas (all-optional): `{}` is valid; skip "required" tests

**Service coverage:**
- [ ] Every public service method has a `describe` block
- [ ] Every happy path verifies return value AND mock call arguments with `toHaveBeenCalledWith`
- [ ] Every error branch verifies thrown error AND downstream mocks NOT called
- [ ] `vi.clearAllMocks()` called in `beforeEach`
- [ ] Default mock return values set in `beforeEach`, not at module scope
- [ ] All `vi.mock()` declarations appear before the imports that use them

**Test quality:**
- [ ] No `import { describe, it, expect, vi } from "vitest"` — globals are enabled
- [ ] No real Prisma, HTTP, or file system calls
- [ ] No `setTimeout` / `sleep` — use fake timers
- [ ] No `expect.anything()` in mock argument assertions
- [ ] No snapshot tests

**Test execution:**
- [ ] Run: `vitest run src/modules/<domain>/test/unit/`
- [ ] All tests pass (0 failures)
- [ ] Fix failures — adjust test logic, not production code
