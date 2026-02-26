// Replace <Domain>, <CreateDto>, <UpdateDto>, field names, and boundary values
// with actual names and constraints from notes.dto.ts.
//
// CreateNoteDto fields:
//   title: z.string().min(1).max(255)          — required
//   content: z.string().optional()             — optional
//   organizationId: z.string().uuid()          — required

export const NotesUnitFactory = {
  valid: {
    /** Only required fields at their simplest valid values */
    minimal: () => ({
      title: "My Note",
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    /** All fields at typical values */
    complete: () => ({
      title: "My Complete Note",
      content: "Some content for this note",
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    /** Every field at its maximum allowed length — boundary ✓ */
    atMaxLength: () => ({
      title: "a".repeat(255),              // max(255) — boundary valid
      content: "b".repeat(10000),          // no max on content
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    /** title at minimum allowed length — boundary ✓ */
    titleAtMin: () => ({
      title: "a",                          // min(1) — boundary valid
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
  },
  invalid: {
    // Each invalid builder has exactly ONE invalid field — all others valid

    // title invalids
    missingTitle: () => ({
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    undefinedTitle: () => ({
      title: undefined,
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    nullTitle: () => ({
      title: null,
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    emptyTitle: () => ({
      title: "",
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    titleOneOverMax: () => ({
      title: "a".repeat(256),             // max(255)+1 — boundary invalid
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
    titleWrongType: () => ({
      title: 42,
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),

    // organizationId invalids
    missingOrganizationId: () => ({
      title: "My Note",
    }),
    undefinedOrganizationId: () => ({
      title: "My Note",
      organizationId: undefined,
    }),
    nullOrganizationId: () => ({
      title: "My Note",
      organizationId: null,
    }),
    organizationIdNotUuid: () => ({
      title: "My Note",
      organizationId: "not-a-uuid",
    }),
    organizationIdWrongType: () => ({
      title: "My Note",
      organizationId: 123,
    }),

    // content invalids (optional field — only wrong-type-when-present)
    contentWrongType: () => ({
      title: "My Note",
      content: 999,
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
    }),
  },
  update: {
    valid: {
      titleOnly: () => ({ title: "Updated Title" }),
      contentOnly: () => ({ content: "Updated content" }),
      organizationIdOnly: () => ({ organizationId: "223e4567-e89b-12d3-a456-426614174000" }),
      complete: () => ({
        title: "Updated Title",
        content: "Updated content",
        organizationId: "223e4567-e89b-12d3-a456-426614174000",
      }),
      empty: () => ({}),                  // all fields optional in Partial<CreateNoteInput> → valid
      titleAtMaxLength: () => ({ title: "a".repeat(255) }),
    },
    invalid: {
      emptyTitle: () => ({ title: "" }),
      titleOneOverMax: () => ({ title: "a".repeat(256) }),
      organizationIdNotUuid: () => ({ organizationId: "not-a-uuid" }),
    },
  },
};
