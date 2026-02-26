// Unit tests for notes Zod schemas
// Vitest globals are enabled — no imports of describe/it/expect/vi needed

import { CreateNoteDto } from "@/notes.dto";
import { expectValid, expectInvalid } from "@/tests-unit/helpers/schema.helper";
import { NotesUnitFactory } from "@/tests-unit/factories/notes/notes.unit-factory";

// ─── Case tree ───────────────────────────────────────────────────────────────
// CreateNoteDto
//
// .title
//   required: missing → ✗, undefined → ✗, null → ✗
//   type:     number → ✗
//   min(1):   "" (0 chars) → ✗, "a" (1 char) → ✓
//   max(255): "a".repeat(255) → ✓, "a".repeat(256) → ✗
//
// .content
//   optional: omitted → ✓, undefined → ✓
//   type when present: number → ✗
//
// .organizationId
//   required: missing → ✗, undefined → ✗, null → ✗
//   uuid:     "not-a-uuid" → ✗, number → ✗, valid UUID → ✓
//
// complete valid object → ✓
// ─────────────────────────────────────────────────────────────────────────────

describe("CreateNoteDto", () => {

  describe(".title", () => {
    it("should accept a valid title", () => {
      expectValid(CreateNoteDto, NotesUnitFactory.valid.complete());
    });

    it("should reject when title is missing", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.missingTitle(), "title");
    });

    it("should reject when title is undefined", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.undefinedTitle(), "title");
    });

    it("should reject when title is null", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.nullTitle(), "title");
    });

    it("should reject when title is wrong type (number)", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.titleWrongType(), "title");
    });

    it("should reject empty string (min 1 boundary — 0 chars)", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.emptyTitle(), "title");
    });

    it("should accept 1 character (min 1 boundary — valid)", () => {
      expectValid(CreateNoteDto, NotesUnitFactory.valid.titleAtMin());
    });

    it("should accept 255 characters (max 255 boundary — valid)", () => {
      expectValid(CreateNoteDto, NotesUnitFactory.valid.atMaxLength());
    });

    it("should reject 256 characters (max 255 boundary + 1 — invalid)", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.titleOneOverMax(), "title");
    });
  });

  describe(".content", () => {
    it("should accept when content is omitted", () => {
      expectValid(CreateNoteDto, NotesUnitFactory.valid.minimal());
    });

    it("should accept when content is undefined", () => {
      expectValid(CreateNoteDto, { ...NotesUnitFactory.valid.minimal(), content: undefined });
    });

    it("should accept when content has a value", () => {
      expectValid(CreateNoteDto, NotesUnitFactory.valid.complete());
    });

    it("should reject when content is wrong type (number)", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.contentWrongType(), "content");
    });
  });

  describe(".organizationId", () => {
    it("should accept a valid UUID", () => {
      expectValid(CreateNoteDto, NotesUnitFactory.valid.complete());
    });

    it("should reject when organizationId is missing", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.missingOrganizationId(), "organizationId");
    });

    it("should reject when organizationId is undefined", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.undefinedOrganizationId(), "organizationId");
    });

    it("should reject when organizationId is null", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.nullOrganizationId(), "organizationId");
    });

    it("should reject when organizationId is not a valid UUID", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.organizationIdNotUuid(), "organizationId");
    });

    it("should reject when organizationId is wrong type (number)", () => {
      expectInvalid(CreateNoteDto, NotesUnitFactory.invalid.organizationIdWrongType(), "organizationId");
    });
  });

  describe("complete valid object", () => {
    it("should accept a complete valid note DTO", () => {
      const result = expectValid(CreateNoteDto, NotesUnitFactory.valid.complete());
      expect(result.title).toBe("My Complete Note");
      expect(result.content).toBe("Some content for this note");
      expect(result.organizationId).toBe("123e4567-e89b-12d3-a456-426614174000");
    });

    it("should accept a minimal valid note DTO (no content)", () => {
      const result = expectValid(CreateNoteDto, NotesUnitFactory.valid.minimal());
      expect(result.title).toBe("My Note");
      expect(result.organizationId).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(result.content).toBeUndefined();
    });
  });
});
