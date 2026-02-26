# Unit Testing — Agent Instructions

> This document is the single source of truth for an AI agent generating unit tests.
> Follow every rule exactly. Do not add layers, patterns, or files not described here.

---

# PART 1 — ORIENTATION

## Purpose

Unit tests verify individual functions and modules in complete isolation — no database, no HTTP, no file system, no real external services. Every dependency is replaced with a `vi.mock` / `vi.fn` / `vi.spyOn`.

Unit tests own the coverage that the other two layers deliberately leave out:

| Concern | API tests | Integration tests | Unit tests |
| --- | --- | --- | --- |
| Zod validation | 1 representative 400 per endpoint | 1–2 wiring checks only | **Every rule on every field — exhaustive** |
| Service logic | Not tested | Every branch — real DB and real mocks | Every branch — all deps replaced with `vi.fn()` |
| Pure utility functions | Not tested | Not tested | **Full coverage** |
| Data transformation / calculation | Not tested | Not tested | **Full coverage** |
| Mock call argument verification | Not tested | Not tested | **Exact arguments on every dep call** |
| Guard clause ordering | Not tested | Not tested | **Downstream mocks not called when early throw fires** |
| Timer-dependent logic | Not tested | Not tested | **`vi.useFakeTimers()` — no real waiting** |
| Execution speed | Slow (HTTP + sandbox) | Slow (DB + HTTP) | **Fast — no I/O** |
| Parallelism | Sequential | File-level parallel | **Full parallel — no shared state** |

**Three targets for unit tests — in priority order:**

1. **Zod schemas** — one `describe` per field, one `it()` per rule. This is the primary responsibility of the unit test layer.
2. **Service methods** — every branch, every throw, every mock call verified with exact arguments. No DB, no HTTP.
3. **Utility functions** — every exported function, typical inputs, edge cases, error cases.

---

## Technology Stack

| Tool | Role |
| --- | --- |
| **Vitest** | Test runner, assertion library, and mocking framework |
| **vi.mock** | Module-level dependency replacement |
| **vi.fn() / vi.spyOn()** | Function stubs and spy verification |
| **vi.useFakeTimers()** | Deterministic time control for timer-dependent logic |
| **TypeScript** | Type-safe test code, schema and DTO imports from source |

> **Vitest globals are enabled.** `describe`, `it`, `test`, `expect`, `vi`, `beforeEach`, `afterEach` are available without imports. Do not import them from `"vitest"`.

---

## Directory Structure

```
src/modules/<domain>/
└── test/
    └── unit/
        ├── <domain>.schema.test.ts      # Zod schema — exhaustive field × rule coverage
        ├── <domain>.service.test.ts     # Service logic — all deps mocked
        └── <domain>.utils.test.ts       # Pure utility functions (if module has utils)

tests-unit/
├── helpers/
│   └── schema.helper.ts                # expectValid / expectInvalid — shared schema assertions
└── factories/
    └── <domain>/
        └── <domain>.unit-factory.ts    # Valid + invalid data builders for schema tests
```

---

## Naming Conventions

| Item | Pattern | Example |
| --- | --- | --- |
| Schema test file | `<domain>.schema.test.ts` | `orders.schema.test.ts` |
| Service unit test file | `<domain>.service.test.ts` | `orders.service.test.ts` |
| Utility test file | `<domain>.utils.test.ts` | `orders.utils.test.ts` |
| Unit factory file | `<domain>.unit-factory.ts` | `orders.unit-factory.ts` |
| Describe (schema) | `"<schemaName>"` | `"createOrderSchema"` |
| Describe (field) | `".<fieldName>"` | `".quantity"` |
| Describe (service method) | `"<serviceName>.<methodName>()"` | `"ordersService.create()"` |
| Describe (utility function) | `"<functionName>()"` | `"formatCurrency()"` |
| Test name (valid case) | `"should accept <description>"` | `"should accept quantity at max (1000)"` |
| Test name (invalid case) | `"should reject <description>"` | `"should reject quantity exceeding max (1001)"` |
| Test name (behavior) | `"should <outcome> when <condition>"` | `"should throw NotFound when resource does not exist"` |

---

# PART 2 — GENERATION WORKFLOW

Follow this exact sequence for every module. Do not skip or reorder steps.

## Step 1 — Read source code

Read the following files before writing any code:

| What to read | Location | What to extract |
| --- | --- | --- |
| Zod schemas / DTOs | `src/modules/<domain>/<domain>.dto.ts` | Every field, every rule: required/optional, type, `.min()`, `.max()`, `.regex()`, `.email()`, `.url()`, `.enum()`, `.refine()`, `.superRefine()`, `.transform()`, `.default()` |
| Service class | `src/modules/<domain>/<domain>.service.ts` | Every public method, every branch (`if/else`, `switch`, ternary), every `throw`, every dependency imported and called |
| Utility functions | `src/modules/<domain>/<domain>.utils.ts` or `src/lib/<util>.ts` | Every exported function signature, accepted input types, return types, edge case comments |
| Error definitions | `src/lib/server/errors.ts` or equivalent | Exact error constructors — used to assert `rejects.toThrow(Errors.someError)` |
| External dependency interfaces | `src/lib/<service>.ts` | Method signatures to mock correctly — match the real shape |

**Before proceeding to Step 2:** for each target file, record:
1. **Schema**: list every field name and every rule attached to it
2. **Service**: list every public method name and every dependency it imports
3. **Utils**: list every exported function name

---

## Step 2 — Map all cases

For each target (schema, service method, utility function), complete Steps 2a → 2c before writing any code.

### Step 2a — Extract all cases

**For each Zod schema**, enumerate every field and every rule on that field as a tree:

```
create<Domain>Schema
├── <requiredField>: string
│   ├── required         → ✗ missing, ✗ undefined
│   ├── .min(N)          → ✗ N-1 chars
│   ├── .max(M)          → ✓ "a" × M, ✗ "a" × M+1
│   └── type             → ✗ number, ✗ null
├── <optionalField>: string.optional()
│   ├── optional         → ✓ omitted, ✓ undefined
│   ├── .max(K)          → ✓ K chars, ✗ K+1 chars
│   └── type             → ✗ number when present
```

**For each service method**, list every execution path — every dependency call is a mock that you will verify with exact arguments:

```
<domain>Service.<method>(args...)
├── ✓ Happy path         → calls prisma.<model>.<operation>, returns result
├── ✗ Resource not found → throws Errors.notFound — downstream mocks NOT called
├── ✗ Access denied      → throws Errors.forbidden — downstream mocks NOT called
```

**For each utility function**, list every input variant and expected output:

```
<functionName>(input: <type>): <returnType>
├── typical input  → expected output
├── edge case      → expected output
├── empty input    → expected output
└── boundary       → expected output
```

### Step 2b — Categorize cases

**Schema tests — group by field then by rule category:**
- **Valid**: min boundary value, typical value, max boundary value, optional field omitted, transform output
- **Invalid — required**: field missing, field undefined, field null (if not nullable)
- **Invalid — type**: wrong primitive (number instead of string, boolean instead of number, etc.)
- **Invalid — length**: one below min (or empty string for `.min(1)`), one above max
- **Invalid — format**: regex mismatch, invalid email/URL/date format
- **Invalid — enum**: unknown string value, empty string, wrong case
- **Invalid — conditional**: each branch of `.refine()` / `.superRefine()` that should fail

**Service unit tests — group by outcome:**
- **Happy path**: correct return value + all mock calls verified with exact arguments
- **Error branches**: correct error thrown + downstream mocks verified as NOT called (guard ordering)
- **Side effects**: mock called exactly once, mock called with exact arguments, mock not called

**Utility tests — group by function:**
- Typical input → expected output
- Edge cases: empty string, zero, `null`/`undefined` if accepted, very large values, special characters
- Error cases: invalid input that should throw

### Step 2c — Verify coverage completeness

Before proceeding to Step 3, confirm:
- Every Zod field has a `describe` block with tests for every rule
- Every boundary has both sides tested: `n` (valid) and `n±1` (invalid)
- Every `.refine()` branch has a test
- Every service method branch has a test
- Every `throw` in the target code has a test that triggers it
- Every dependency call in a service method has a test that verifies the exact arguments passed

Write the full case list as comments inside the `describe` block before implementing any `it()`.

---

## Step 3 — Create test infrastructure

Create only what does not already exist. Check `tests-unit/` before creating new files.

### Step 3a — Schema test helpers

`tests-unit/helpers/schema.helper.ts`

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

**Parameters:**
- `schema` — the Zod schema to test
- `input` — the raw input to parse
- `expectedPath` (optional) — dot-joined field path, e.g. `"name"`, `"address.city"`, `"tags.0"`
- `expectedMessageSubstring` (optional) — substring to match against issue messages, e.g. `"Name is required"`

### Step 3b — Unit factories

`tests-unit/factories/<domain>/<domain>.unit-factory.ts`

Unit factories provide **named, deterministic data variants** — both valid and exhaustively invalid — for schema tests and service unit tests. Use plain literal values, not Chance.js. Deterministic values make failing test output readable.

```typescript
// Replace <Domain>, <CreateDto>, <UpdateDto>, field names, and boundary values
// with the actual names and constraints from <domain>.dto.ts.

import type { <CreateDto>, <UpdateDto> } from "@/src/modules/<domain>/<domain>.dto";

export const <Domain>UnitFactory = {
  // ── <CreateDto> — valid builders ────────────────────────────────────────────

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
      <requiredField>: "a".repeat(<maxLength>),    // max(<maxLength>)
      <optionalField>: "b".repeat(<maxLength>),    // max(<maxLength>)
    }),
  },

  // ── <CreateDto> — invalid builders ──────────────────────────────────────────

  invalid: {
    // <requiredField>
    missing<Field>: () => ({ <otherField>: "<valid value>" }),
    undefined<Field>: () => ({ <requiredField>: undefined }),
    null<Field>: () => ({ <requiredField>: null }),
    empty<Field>: () => ({ <requiredField>: "" }),
    <field>OneOverMax: () => ({ <requiredField>: "a".repeat(<maxLength + 1>) }),
    <field>WrongType: () => ({ <requiredField>: 42 }),

    // <optionalField>
    <optionalField>OneOverMax: () => ({
      <requiredField>: "<valid value>",
      <optionalField>: "c".repeat(<maxLength + 1>),
    }),
    <optionalField>WrongType: () => ({
      <requiredField>: "<valid value>",
      <optionalField>: 99,
    }),
  },

  // ── <UpdateDto> — valid / invalid builders ──────────────────────────────────

  update: {
    valid: {
      /** Single field update */
      <field>Only: (): <UpdateDto> => ({
        <field>: "<updated value>",
      }),

      /** All fields */
      complete: (): <UpdateDto> => ({
        <requiredField>: "<updated value>",
        <optionalField>: "<updated value>",
      }),

      /** Empty object — all fields optional, so {} is valid */
      empty: (): <UpdateDto> => ({}),

      /** Boundary values */
      atMaxLength: (): <UpdateDto> => ({
        <requiredField>: "a".repeat(<maxLength>),
        <optionalField>: "b".repeat(<maxLength>),
      }),
    },

    invalid: {
      empty<Field>: () => ({ <field>: "" }),
      <field>OneOverMax: () => ({ <field>: "a".repeat(<maxLength + 1>) }),
      <field>WrongType: () => ({ <field>: 42 }),
      // ... repeat for each field that has constraints when present
    },
  },
};
```

> **Why plain values, not Chance.js?** Unit tests assert on exact return values and mock arguments. When a test fails, the output must show the exact value that caused it. Random values produce non-reproducible failures and hide assertion mismatches.

---

## Step 4 — Write schema tests

`src/modules/<domain>/test/unit/<domain>.schema.test.ts`

Complete Step 4a before Step 4b.

### Step 4a — Plan schema test cases

Write the case list as comments inside the `describe` block before any `it()`. Group by field. Each rule on a field gets its own test.

```typescript
describe("create<Domain>Schema", () => {
  describe("valid inputs", () => {
    // - should accept minimal valid input
    // - should accept complete input with all optional fields
    // - should accept all fields at maximum length (boundary ✓)
  });

  describe(".<requiredField>", () => {
    // Valid
    // - should accept single character (min boundary ✓)
    // - should accept <maxLength> characters (max boundary ✓)
    // Invalid
    // - should reject when <field> is missing
    // - should reject when <field> is undefined
    // - should reject when <field> is null
    // - should reject empty string (min(1) violation)
    // - should reject <maxLength + 1> characters (one over max)
    // - should reject number (wrong type)
  });

  describe(".<optionalField> (optional)", () => {
    // Valid
    // - should accept when <field> is omitted
    // - should accept when <field> is undefined
    // - should accept <maxLength> characters (max boundary ✓)
    // Invalid
    // - should reject <maxLength + 1> characters (one over max)
    // - should reject number when present (wrong type)
  });
});
```

Only proceed to Step 4b when the comment list accounts for every rule identified in Step 2a.

### Step 4b — Implement schema tests

```typescript
import { create<Domain>Schema } from "@/src/modules/<domain>/<domain>.dto";
import { <Domain>UnitFactory } from "@/tests-unit/factories/<domain>/<domain>.unit-factory";
import { expectValid, expectInvalid } from "@/tests-unit/helpers/schema.helper";

describe("create<Domain>Schema", () => {

  // =========================================================
  // VALID INPUTS
  // =========================================================

  describe("valid inputs", () => {
    it("should accept minimal valid input", () => {
      expectValid(create<Domain>Schema, <Domain>UnitFactory.valid.minimal());
    });

    it("should accept complete input with all optional fields", () => {
      expectValid(create<Domain>Schema, <Domain>UnitFactory.valid.complete());
    });

    it("should accept all fields at maximum length", () => {
      expectValid(create<Domain>Schema, <Domain>UnitFactory.valid.atMaxLength());
    });
  });

  // =========================================================
  // FIELD: <requiredField>
  // =========================================================

  describe(".<requiredField>", () => {
    it("should accept single character (min boundary ✓)", () => {
      expectValid(create<Domain>Schema, {
        ...<Domain>UnitFactory.valid.minimal(),
        <requiredField>: "A",
      });
    });

    it("should accept <maxLength> characters (max boundary ✓)", () => {
      expectValid(create<Domain>Schema, {
        ...<Domain>UnitFactory.valid.minimal(),
        <requiredField>: "a".repeat(<maxLength>),
      });
    });

    it("should reject when <field> is missing", () => {
      expectInvalid(create<Domain>Schema, <Domain>UnitFactory.invalid.missing<Field>(), "<requiredField>");
    });

    it("should reject empty string (min(1) violation)", () => {
      expectInvalid(create<Domain>Schema, <Domain>UnitFactory.invalid.empty<Field>(), "<requiredField>");
    });

    it("should reject <maxLength + 1> characters (one over max)", () => {
      expectInvalid(create<Domain>Schema, <Domain>UnitFactory.invalid.<field>OneOverMax(), "<requiredField>");
    });

    it("should reject number (wrong type)", () => {
      expectInvalid(create<Domain>Schema, <Domain>UnitFactory.invalid.<field>WrongType(), "<requiredField>");
    });
  });

  // =========================================================
  // FIELD: <optionalField> (optional)
  // =========================================================

  describe(".<optionalField> (optional)", () => {
    it("should accept when <field> is omitted", () => {
      expectValid(create<Domain>Schema, <Domain>UnitFactory.valid.minimal());
    });

    it("should accept when <field> is undefined", () => {
      expectValid(create<Domain>Schema, {
        ...<Domain>UnitFactory.valid.minimal(),
        <optionalField>: undefined,
      });
    });

    it("should accept <maxLength> characters (max boundary ✓)", () => {
      expectValid(create<Domain>Schema, {
        ...<Domain>UnitFactory.valid.minimal(),
        <optionalField>: "c".repeat(<maxLength>),
      });
    });

    it("should reject <maxLength + 1> characters (one over max)", () => {
      expectInvalid(create<Domain>Schema, <Domain>UnitFactory.invalid.<optionalField>OneOverMax(), "<optionalField>");
    });

    it("should reject number when present (wrong type)", () => {
      expectInvalid(create<Domain>Schema, <Domain>UnitFactory.invalid.<optionalField>WrongType(), "<optionalField>");
    });
  });
});
```

### Multiple schemas per module

When a module exports multiple schemas (e.g. `create<Domain>Schema`, `update<Domain>Schema`), write a separate top-level `describe` for each schema in the same test file. Update schemas where all fields are optional have different coverage patterns:

- `{}` (empty object) is valid — test it explicitly
- Each field must still be tested for its constraints when present
- "Required" tests (missing/undefined) do not apply — skip them

```typescript
describe("update<Domain>Schema", () => {
  describe("valid inputs", () => {
    it("should accept empty object (all fields optional)", () => {
      expectValid(update<Domain>Schema, <Domain>UnitFactory.update.valid.empty());
    });

    it("should accept single field only", () => {
      expectValid(update<Domain>Schema, <Domain>UnitFactory.update.valid.<field>Only());
    });

    it("should accept all fields at max length", () => {
      expectValid(update<Domain>Schema, <Domain>UnitFactory.update.valid.atMaxLength());
    });
  });

  describe(".<field> (optional)", () => {
    it("should reject empty string when <field> is present", () => {
      expectInvalid(update<Domain>Schema, <Domain>UnitFactory.update.invalid.empty<Field>(), "<field>");
    });

    it("should reject <maxLength + 1> characters (one over max)", () => {
      expectInvalid(update<Domain>Schema, <Domain>UnitFactory.update.invalid.<field>OneOverMax(), "<field>");
    });
  });

  // ... same pattern for each field
});
```

#### Use test.each for groups of invalid cases on the same field

When multiple invalid variants target the same field, collapse them into `test.each` to reduce repetition without hiding coverage:

```typescript
describe(".<field>", () => {
  test.each([
    { label: "missing",        input: <Domain>UnitFactory.invalid.missing<Field>() },
    { label: "undefined",      input: <Domain>UnitFactory.invalid.undefined<Field>() },
    { label: "null",           input: <Domain>UnitFactory.invalid.null<Field>() },
    { label: "empty string",   input: <Domain>UnitFactory.invalid.empty<Field>() },
    { label: "one over max",   input: <Domain>UnitFactory.invalid.<field>OneOverMax() },
    { label: "wrong type",     input: <Domain>UnitFactory.invalid.<field>WrongType() },
  ])("should reject <field> when $label", ({ input }) => {
    expectInvalid(create<Domain>Schema, input, "<field>");
  });
});
```

`test.each` also works well for service tests — e.g. testing multiple error branches:

```typescript
describe("error branches", () => {
  test.each([
    {
      label: "resource not found",
      mockSetup: () => vi.mocked(prisma.<model>.findUnique).mockResolvedValueOnce(null),
      expectedErrorCode: "NOT_FOUND",
    },
    {
      label: "access denied",
      mockSetup: () => vi.mocked(prisma.<model>.findUnique).mockResolvedValueOnce({
        ...MOCK_RECORD,
        organizationId: "other-org",
      } as any),
      expectedErrorCode: "FORBIDDEN",
    },
  ])("should throw when $label", async ({ mockSetup, expectedErrorCode }) => {
    mockSetup();
    await expect(<domain>Service.<method>(/* args */)).rejects.toMatchObject({
      code: expectedErrorCode,
    });
  });
});
```

And for enum values:

```typescript
test.each(["value1", "value2", "value3"] as const)(
  'should accept <field> "%s"',
  (value) => {
    expectValid(schema, { ...factory.valid.minimal(), <field>: value });
  }
);
```

---

## Step 5 — Write service unit tests

`src/modules/<domain>/test/unit/<domain>.service.test.ts`

Service unit tests verify business logic with all external dependencies replaced by mocks. No database, no HTTP, no WireMock.

Complete Step 5a before Step 5b.

### Step 5a — Plan service test cases

Write the case list as comments before any implementation:

```typescript
describe("<domain>Service.<method>()", () => {
  // Happy path
  // - should return created <resource> when input is valid
  // - should call prisma.<model>.create with correct arguments

  // Guard clauses
  // - should throw Errors.notFound when <resource> does not exist
  // - should throw Errors.forbidden when <resource> belongs to different organization
  // (downstream mocks must NOT be called after guard throw)
});
```

### Step 5b — Implement service tests

```typescript
// ── Step 1: Declare vi.mock calls FIRST, before any imports ───────────────────
// Vitest hoists vi.mock() to the top of the file. Declare them here.

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
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  Errors,
}));

// ── Step 2: Import modules AFTER vi.mock declarations ─────────────────────────

import { <domain>Service } from "@/src/modules/<domain>/<domain>.service";
import { Errors, DomainError } from "@/src/lib/server/errors";
import { <Domain>UnitFactory } from "@/tests-unit/factories/<domain>/<domain>.unit-factory";
import { prisma } from "@/src/lib/server";

// ── Test data ─────────────────────────────────────────────────────────────────

const USER_ID = "user-123";
const ORG_ID  = "org-456";
const RECORD_ID = "record-789";

const MOCK_RECORD = {
  id: RECORD_ID,
  // ... fields matching the Prisma model shape
  userId: USER_ID,
  organizationId: ORG_ID,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe("<domain>Service.create()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path mock state — override per test as needed
    vi.mocked(prisma.<model>.create).mockResolvedValue(MOCK_RECORD as any);
  });

  // =========================================================
  // HAPPY PATH
  // =========================================================

  describe("happy path", () => {
    it("should return the created <resource>", async () => {
      const dto = <Domain>UnitFactory.valid.complete();

      const result = await <domain>Service.create(USER_ID, ORG_ID, dto);

      expect(result).toEqual(MOCK_RECORD);
    });

    it("should call prisma.<model>.create with the correct arguments", async () => {
      const dto = <Domain>UnitFactory.valid.complete();

      await <domain>Service.create(USER_ID, ORG_ID, dto);

      expect(prisma.<model>.create).toHaveBeenCalledOnce();
      expect(prisma.<model>.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          userId: USER_ID,
          organizationId: ORG_ID,
        },
      });
    });
  });
});

describe("<domain>Service.getById()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.<model>.findUnique).mockResolvedValue(MOCK_RECORD as any);
  });

  it("should return the <resource> when found and authorized", async () => {
    const result = await <domain>Service.getById(ORG_ID, RECORD_ID);
    expect(result).toEqual(MOCK_RECORD);
  });

  it("should throw when <resource> does not exist", async () => {
    vi.mocked(prisma.<model>.findUnique).mockResolvedValueOnce(null);

    await expect(<domain>Service.getById(ORG_ID, RECORD_ID)).rejects.toThrow(DomainError);
  });

  it("should throw when <resource> belongs to different organization", async () => {
    vi.mocked(prisma.<model>.findUnique).mockResolvedValueOnce({
      ...MOCK_RECORD,
      organizationId: "other-org",
    } as any);

    await expect(<domain>Service.getById(ORG_ID, RECORD_ID)).rejects.toThrow(DomainError);
  });
});
```

> **`as any` in mock return values:** Use `as any` when the mock return value does not need to satisfy the full Prisma type. This is acceptable in unit tests because the mock is a stand-in — the type safety of the actual Prisma call is verified by TypeScript compilation of the source code, not the test. Avoid `as any` on test inputs — those should match the real DTO types.

---

## Step 6 — Write utility tests (if applicable)

`src/modules/<domain>/test/unit/<domain>.utils.test.ts`

Only create this file if the module exports utility functions. Utility tests require no mocking unless the utility calls an external module.

```typescript
import { formatValue, truncateText, isExpired } from "@/src/modules/<domain>/<domain>.utils";

// =========================================================
// PURE TRANSFORMATION
// =========================================================

describe("formatValue()", () => {
  it("should trim leading and trailing whitespace", () => {
    expect(formatValue("  some input  ")).toBe("some input");
  });

  it("should return empty string unchanged", () => {
    expect(formatValue("")).toBe("");
  });

  it("should handle a single character", () => {
    expect(formatValue("a")).toBe("a");
  });
});

// =========================================================
// BOUNDARY BEHAVIOR
// =========================================================

describe("truncateText()", () => {
  it("should return text unchanged when within limit", () => {
    expect(truncateText("short", 100)).toBe("short");
  });

  it("should return text unchanged at exactly the limit", () => {
    const text = "a".repeat(100);
    expect(truncateText(text, 100)).toBe(text);
  });

  it("should truncate and append ellipsis when text exceeds limit", () => {
    const result = truncateText("a".repeat(101), 100);
    expect(result).toBe("a".repeat(100) + "...");
  });

  it("should handle an empty string", () => {
    expect(truncateText("", 100)).toBe("");
  });
});

// =========================================================
// TIME-DEPENDENT LOGIC — use vi.useFakeTimers()
// =========================================================

describe("isExpired()", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("should return true when expiry date is in the past", () => {
    vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));
    const past = new Date("2024-06-01T11:00:00Z");
    expect(isExpired(past)).toBe(true);
  });

  it("should return false when expiry date is in the future", () => {
    vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));
    const future = new Date("2024-06-01T13:00:00Z");
    expect(isExpired(future)).toBe(false);
  });

  it("should return true when expiry is exactly now", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    vi.setSystemTime(now);
    expect(isExpired(now)).toBe(true);
  });
});
```

---

## Step 7 — Run tests and fix

Run the unit tests and iterate until all pass:

```bash
vitest run src/modules/<domain>/test/unit/
```

1. Run the tests
2. If any test fails, read the error output carefully
3. Fix the failing test or the factory/helper causing the failure
4. Re-run until all tests pass (0 failures)
5. Only proceed to Step 8 when all tests are green

---

## Step 8 — Self-validate

Run the [Self-Validation Checklist](#self-validation-checklist) against every created file. Fix all failures before marking the task complete.

---

# PART 3 — REFERENCE

## Infrastructure Components

### Schema helper

`tests-unit/helpers/schema.helper.ts`

Two functions — `expectValid` and `expectInvalid` — are the only assertion helpers needed for schema tests. See Step 3a for the full implementation.

**Usage rules:**
- `expectValid` returns the parsed value — use it to assert transforms: `const result = expectValid(schema, input); expect(result.<field>).toBe("Trimmed")`
- `expectInvalid` accepts an optional `expectedPath` (3rd param) — always pass it to confirm the error targets the right field
- `expectInvalid` accepts an optional `expectedMessageSubstring` (4th param) — use it to verify specific error messages: `expectInvalid(schema, input, "<field>", "<field> is required")`
- `expectInvalid` returns the `ZodError` — use it for further assertions when needed: `const error = expectInvalid(schema, input, "<field>"); expect(error.issues).toHaveLength(1);`
- Never call `schema.parse()` directly in tests — it throws on failure and produces worse error messages than `safeParse`

---

### Unit factories

`tests-unit/factories/<domain>/<domain>.unit-factory.ts`

See Step 3b for the full implementation pattern.

**Usage rules:**
- One factory file per domain — mirrors the integration fixture file
- Suffix with `.unit-factory.ts` to distinguish from integration fixture files
- Use plain literal values — not Chance.js — for deterministic, readable test output
- For boundary values, encode the limit in the variable name: `<field>OneOverMax`, `atMaxLength`
- Every invalid builder must produce exactly one invalid field — other fields must be valid so the error can only come from the intended field
- Use spread to override a single field from a valid base: `{ ...valid.minimal(), <field>: "" }`
- When a module has multiple schemas (create/update), nest update variants under `update.valid` / `update.invalid`

---

## Mocking patterns

### vi.mock — module-level replacement

Declare `vi.mock()` calls at the top of the file, before any imports that depend on them. Vitest hoists `vi.mock()` to the top automatically — but the declaration must exist before the imports.

```typescript
// ✓ Correct — mock declared before the module is imported
vi.mock("@/src/lib/server", () => ({
  prisma: {
    <model>: { create: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "@/src/lib/server"; // safely receives the mock
```

```typescript
// ✗ Wrong — the real module is imported before the mock is declared
import { prisma } from "@/src/lib/server";
vi.mock("@/src/lib/server", ...);           // too late
```

**Rules:**
1. Mock the module at the exact import path the **source file** uses — not a re-export
2. Mock only the methods the tested module actually calls
3. `vi.clearAllMocks()` in `beforeEach` — resets call history between tests
4. Set **default mock return values in `beforeEach`** — override per test with `mockResolvedValueOnce` or `mockReturnValueOnce`

### vi.fn() — inline stubs

```typescript
const handler = vi.fn().mockReturnValue("processed");
handler("input");
expect(handler).toHaveBeenCalledWith("input");
expect(handler).toHaveBeenCalledOnce();
```

### vi.spyOn() — wrapping real implementations

Use when you need to observe calls to a real module without replacing it entirely. Always restore in `afterEach`.

```typescript
import * as utils from "@/src/modules/<domain>/<domain>.utils";

let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spy = vi.spyOn(utils, "<functionName>").mockReturnValue("Mocked Value");
});
afterEach(() => {
  spy.mockRestore();
});

it("should call <functionName> with the raw input", () => {
  targetFunction({ <field>: "  raw  " });
  expect(spy).toHaveBeenCalledWith("  raw  ");
});
```

### Mock call assertions — always verify arguments

```typescript
// ✓ Verify exact arguments — proves the correct data was passed
expect(prisma.<model>.create).toHaveBeenCalledWith({
  data: { <field>: "<value>", userId: "user-123", organizationId: "org-456" },
});

// ✓ Use objectContaining only when some fields are dynamic
expect(prisma.<model>.create).toHaveBeenCalledWith({
  data: expect.objectContaining({ <field>: "<value>" }),
});

// ✗ Proves nothing about what was passed
expect(prisma.<model>.create).toHaveBeenCalled();
```

### Setting up mock return values

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  // Default return for all tests in this suite
  vi.mocked(prisma.<model>.findUnique).mockResolvedValue(MOCK_RECORD as any);
});

it("should handle missing <resource>", async () => {
  // Override default for this specific test only
  vi.mocked(prisma.<model>.findUnique).mockResolvedValueOnce(null);
  // ...
});
```

> **`as any` on mock return values:** Prisma return types are complex (include relations, metadata, etc.). Using `as any` on mock return values is acceptable and expected — the source code's type safety is enforced by TypeScript compilation, not by the test mock. Avoid `as any` on test inputs (DTO data) — those should match the real schema types.

---

## Zod schema testing patterns

### Boundary values — always test both sides

For every `.min(n)` and `.max(n)` rule, test the **valid boundary** (`n`) AND **one step beyond** (`n-1` or `n+1`):

```typescript
// max(N) on <field>:
it("should accept N characters (max boundary ✓)", () => {
  expectValid(schema, { <field>: "a".repeat(N) });      // boundary must be valid
});
it("should reject N+1 characters (one over max)", () => {
  expectInvalid(schema, { <field>: "a".repeat(N + 1) }, "<field>");  // one over must fail
});
```

Testing only the rejection side leaves the boundary value itself unverified — a schema with a lower `.max()` would still pass that test.

### Optional vs nullable — different behavior, both must be tested

```typescript
// .optional() → undefined is accepted, null is rejected
it("should accept undefined for optional field", () => {
  expectValid(schema, { <requiredField>: "ok", <optionalField>: undefined });
});
it("should reject null for optional field", () => {
  expectInvalid(schema, { <requiredField>: "ok", <optionalField>: null }, "<optionalField>");
});

// .nullable() → null is accepted, undefined is rejected (unless also .optional())
it("should accept null for nullable field", () => {
  expectValid(schema, { <requiredField>: "ok", <nullableField>: null });
});
it("should reject undefined for nullable-only field", () => {
  expectInvalid(schema, { <requiredField>: "ok", <nullableField>: undefined }, "<nullableField>");
});
```

### Transform testing — assert the output value

When a schema applies `.transform()`, use `expectValid`'s return value to assert the transformation result:

```typescript
it("should trim whitespace from <field>", () => {
  const result = expectValid(schema, { <field>: "  Hello  " });
  expect(result.<field>).toBe("Hello");   // assert the transformed output
});

it("should lowercase email", () => {
  const result = expectValid(schema, { email: "User@EXAMPLE.COM" });
  expect(result.email).toBe("user@example.com");
});
```

### Default value testing — assert the output includes the default

When a schema applies `.default()`, use `expectValid`'s return value to assert the default is applied:

```typescript
// Schema: <field>: z.enum(["value1", "value2"]).default("value1")
it("should default <field> to 'value1' when omitted", () => {
  const result = expectValid(schema, { <requiredField>: "some value" });
  expect(result.<field>).toBe("value1");
});

it("should accept explicit <field> and not override with default", () => {
  const result = expectValid(schema, { <requiredField>: "some value", <field>: "value2" });
  expect(result.<field>).toBe("value2");
});
```

### Conditional validation — test every branch of .refine()

```typescript
// Schema: if type === "external", url is required; otherwise url is ignored
it("should accept external type with url", () => {
  expectValid(schema, { type: "external", url: "https://example.com" });
});
it("should reject external type without url", () => {
  expectInvalid(schema, { type: "external" }, "url");
});
it("should accept internal type without url", () => {
  expectValid(schema, { type: "internal" });
});
it("should accept internal type with url (url ignored)", () => {
  expectValid(schema, { type: "internal", url: "https://example.com" });
});
```

### Nested object and array testing

For schemas with nested objects or arrays, use dot-path notation in `expectedPath`:

```typescript
// Schema: z.object({ address: z.object({ city: z.string().min(1) }) })
it("should reject empty city in nested address", () => {
  expectInvalid(schema, { address: { city: "" } }, "address.city");
});

// Schema: z.object({ tags: z.array(z.string()).min(1).max(10) })
it("should reject empty tags array", () => {
  expectInvalid(schema, { tags: [] }, "tags");
});

it("should reject tags array exceeding max (11 items)", () => {
  expectInvalid(schema, { tags: Array(11).fill("tag") }, "tags");
});

// Array element validation — path includes the index
it("should reject invalid element in tags array", () => {
  expectInvalid(schema, { tags: [42] }, "tags.0");
});
```

### `.passthrough()` / `.strip()` / `.strict()` testing

Test how the schema handles extra (unknown) fields:

```typescript
// Default behavior (strip) — extra fields are silently removed
it("should strip unknown fields", () => {
  const result = expectValid(schema, { <requiredField>: "ok", extraField: "should be removed" });
  expect(result).not.toHaveProperty("extraField");
});

// .passthrough() — extra fields are preserved
it("should preserve unknown fields with passthrough", () => {
  const result = expectValid(passthroughSchema, { <requiredField>: "ok", extra: "kept" });
  expect(result).toHaveProperty("extra", "kept");
});

// .strict() — extra fields cause rejection
it("should reject unknown fields with strict schema", () => {
  expectInvalid(strictSchema, { <requiredField>: "ok", extra: "not allowed" });
});
```

---

## Test file rules

### Structure rules

1. **No vitest imports** — globals are enabled. Do not `import { describe, it, expect, vi } from "vitest"`
2. **`vi.clearAllMocks()` in `beforeEach`** — mandatory in every service test file. Never rely on mock state from a previous test
3. **Default mock state in `beforeEach`** — set the happy-path defaults once; override with `mockResolvedValueOnce` per test
4. **Arrange-Act-Assert** — every test follows this three-section pattern explicitly
5. **Grouped by behavior** — use nested `describe` blocks: happy path / guard clauses / error mapping for service tests; field name for schema tests
6. **One concept per test** — if the test name needs "and", split it into two tests

### Isolation rules

Unit tests run in **full parallelism** — no shared state concerns since there is no I/O.

1. **No real I/O** — no `prisma`, no `axios`, no `fs`, no real external services in any unit test
2. **No `setTimeout` / `sleep`** — for timer-dependent logic, use `vi.useFakeTimers()` + `vi.setSystemTime()`. Always restore with `vi.useRealTimers()` in `afterEach`
3. **No shared mutable state** — test data constants (`MOCK_RECORD`, `USER_ID`) are fine as module-level consts since they are never mutated. Mock return values must be set fresh in `beforeEach`
4. **No snapshot tests** — never use `.toMatchSnapshot()` or `.toMatchInlineSnapshot()`. Snapshot diffs are non-descriptive and mask intent

### Assertion rules

1. **Assert return values, not mock calls alone** — verify `result` matches the expected value before checking mock interactions
2. **Assert mock arguments explicitly** — always use `toHaveBeenCalledWith(...)`, never just `toHaveBeenCalled()`
3. **Assert guard ordering** — when a method throws early, verify that downstream mocks were NOT called: `expect(prisma.<model>.create).not.toHaveBeenCalled()`
4. **No `expect.anything()`** — always assert explicit values or `expect.any(String)` / `expect.any(Number)`
5. **Error assertions use the specific error** — `rejects.toThrow(DomainError)` not just `rejects.toThrow()`

---

## Coverage requirements

| Target | Required coverage |
| --- | --- |
| Zod schemas | Every field × every rule. Both boundary sides for `.min()`/`.max()`. Every enum value. Every `.refine()` branch. Transform output for `.transform()`. Default output for `.default()` |
| Service methods | Every public method. Every branch. Every `throw`. Every mock call verified with exact arguments. Every guard clause verified that downstream mocks are not called |
| Utility functions | Every exported function. Typical input, boundary values, edge cases, error cases |

**Out of scope for unit tests:**
- HTTP routing and middleware (API / integration layer)
- Real database interactions (integration layer)
- End-to-end flows across multiple services (integration layer)
- Third-party service sandbox behavior (integration layer)

**Skipping tests:** only allowed with a JIRA ticket reference.

```typescript
// ✓ Correct
// PROJ-1234: .refine() condition not yet stable — skip until schema is finalized
it.skip("should reject mismatched password confirmation", () => { ... });

// ✗ Forbidden — no ticket
it.skip("should reject empty <field>", () => { ... });
```

---

# PART 4 — FINAL VALIDATION

## Critical Mistakes

| Mistake | Rule |
| --- | --- |
| Missing boundary valid test | For every `.min(n)` / `.max(n)`, always test `n` (valid) in addition to `n±1` (invalid). Testing only the rejection side leaves the rule itself unverified |
| Testing only rejection, not acceptance | Each schema field must have at least one valid test confirming what IS accepted, not just what is rejected |
| `vi.mock()` declared after imports | `vi.mock()` must appear before the import that uses the mocked module. Declaring it after means the real module is already bound — the mock is silently ignored |
| Missing `vi.clearAllMocks()` in `beforeEach` | Without clearing, mock call counts from previous tests accumulate and cause false assertions on `toHaveBeenCalledOnce()` |
| Default mock set outside `beforeEach` | Default return values set at module scope persist mutated state. Always set defaults in `beforeEach` so each test starts clean |
| Asserting mock was called without arguments | `expect(fn).toHaveBeenCalled()` proves nothing about correctness. Always use `toHaveBeenCalledWith(...)` with exact or objectContaining arguments |
| Missing guard clause verification | After asserting a guard throw, always verify that downstream mocks were not called: `expect(prisma.<model>.create).not.toHaveBeenCalled()` |
| Real I/O in unit tests | Any test that hits Prisma, HTTP, or the file system is not a unit test. Mock every external dependency before calling the target function |
| Using `setTimeout` / `sleep` | Introduces real wait time and makes tests non-deterministic. Use `vi.useFakeTimers()` + `vi.setSystemTime()` for time-dependent logic |
| `expect.anything()` in mock assertions | Proves nothing about the actual value. Use explicit values or `expect.any(String)` |
| Snapshot tests | Never use `.toMatchSnapshot()` — snapshots are opaque and hide test intent |
| Shared invalid factory data affecting other fields | Every invalid builder must have only one invalid field. All other fields must be valid so the error can only come from the intended field |
| Missing `.refine()` tests | Conditional Zod rules are easy to overlook. Explicitly list every `.refine()` in Step 2a and write tests for both branches |
| Skipping without JIRA | Every `.skip()` must reference a ticket |
| Importing vitest globals | `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach` are globals — do not import them from `"vitest"` |

---

## Self-Validation Checklist

After generating all unit test files for a module, re-read every file and validate:

**Schema coverage:**
- [ ] Every field in every schema has a dedicated `describe(".<fieldName>")` block
- [ ] Every required field has: missing test, undefined test, null test (unless nullable), wrong-type test
- [ ] Every optional field has: omitted test, undefined test, wrong-type-when-present test
- [ ] Every `.min()` / `.max()` has both a boundary-valid test (`n`) and a one-step-beyond invalid test (`n±1`)
- [ ] Every `.regex()` / `.email()` / `.url()` has a valid format test and at least one invalid format test
- [ ] Every `.enum()` has a test for each valid value and a test for an unknown value
- [ ] Every `.refine()` / `.superRefine()` has tests for every branch of the condition
- [ ] Every `.transform()` uses `expectValid`'s return value to assert the transformed output
- [ ] Every `.default()` has a test confirming the default is applied when the field is omitted, and a test confirming an explicit value is not overridden
- [ ] Nested objects use dot-path in `expectedPath` (e.g. `"address.city"`)
- [ ] Array schemas test `.min()` / `.max()` on the array itself, and element validation uses indexed paths (e.g. `"tags.0"`)
- [ ] `.strict()` schemas test that extra fields cause rejection
- [ ] `.passthrough()` schemas test that extra fields are preserved
- [ ] Update schemas (all-optional) test `{}` as valid and skip "required" tests

**Service coverage:**
- [ ] Every public service method has a `describe` block
- [ ] Every happy path verifies the return value AND mock call arguments with `toHaveBeenCalledWith`
- [ ] Every error branch verifies the thrown error type AND that downstream mocks were NOT called
- [ ] `vi.clearAllMocks()` is called in `beforeEach`
- [ ] Default mock return values are set in `beforeEach`, not at module scope
- [ ] All `vi.mock()` declarations appear before the imports that use them

**Utility coverage:**
- [ ] Every exported function has a `describe` block
- [ ] Typical input, boundary values, and edge cases are all covered
- [ ] Time-dependent functions use `vi.useFakeTimers()` + `vi.setSystemTime()`, restored in `afterEach`

**Test quality:**
- [ ] No `import { describe, it, expect, vi } from "vitest"` — globals are enabled
- [ ] No real Prisma, HTTP, or file system calls — all deps mocked
- [ ] No `setTimeout` / `sleep` — use fake timers
- [ ] No `expect.anything()` in mock argument assertions
- [ ] No snapshot tests
- [ ] Each `it()` tests exactly one concept
- [ ] `as any` used only on mock return values, not on test inputs

**Scenario planning:**
- [ ] Step 2a case list was written as comments before any `it()` was implemented
- [ ] Every case in the Step 2a list has a corresponding `it()` in the file

**Test execution:**
- [ ] Run all unit tests: `vitest run src/modules/<domain>/test/unit/`
- [ ] Verify all tests pass (0 failures)
- [ ] Fix any failing tests before considering the work complete
- [ ] Re-run after fixes to confirm all pass
