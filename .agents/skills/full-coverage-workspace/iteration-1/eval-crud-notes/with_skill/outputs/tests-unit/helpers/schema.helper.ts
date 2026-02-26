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
