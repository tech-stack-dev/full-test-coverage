import { z } from 'zod';
import { CreateNoteDto } from '../notes.dto';

describe('CreateNoteDto', () => {
  // Valid input baseline
  const validInput = {
    title: 'My Note',
    content: 'Some content',
    organizationId: '123e4567-e89b-12d3-a456-426614174000',
  };

  describe('title', () => {
    it('accepts a valid title', () => {
      const result = CreateNoteDto.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects an empty title', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, title: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.title).toBeDefined();
      }
    });

    it('rejects a title exceeding 255 characters', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, title: 'a'.repeat(256) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.title).toBeDefined();
      }
    });

    it('accepts a title of exactly 255 characters', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, title: 'a'.repeat(255) });
      expect(result.success).toBe(true);
    });

    it('accepts a title of exactly 1 character', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, title: 'a' });
      expect(result.success).toBe(true);
    });

    it('rejects missing title', () => {
      const { title, ...withoutTitle } = validInput;
      const result = CreateNoteDto.safeParse(withoutTitle);
      expect(result.success).toBe(false);
    });

    it('rejects a non-string title', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, title: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('content', () => {
    it('accepts input without content (optional)', () => {
      const { content, ...withoutContent } = validInput;
      const result = CreateNoteDto.safeParse(withoutContent);
      expect(result.success).toBe(true);
    });

    it('accepts undefined content explicitly', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, content: undefined });
      expect(result.success).toBe(true);
    });

    it('accepts empty string content', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, content: '' });
      expect(result.success).toBe(true);
    });

    it('accepts long content', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, content: 'x'.repeat(10000) });
      expect(result.success).toBe(true);
    });

    it('rejects non-string content', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, content: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe('organizationId', () => {
    it('accepts a valid UUID v4', () => {
      const result = CreateNoteDto.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects a non-UUID organizationId', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, organizationId: 'not-a-uuid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.organizationId).toBeDefined();
      }
    });

    it('rejects missing organizationId', () => {
      const { organizationId, ...withoutOrg } = validInput;
      const result = CreateNoteDto.safeParse(withoutOrg);
      expect(result.success).toBe(false);
    });

    it('rejects empty string organizationId', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, organizationId: '' });
      expect(result.success).toBe(false);
    });

    it('rejects a UUID-like but malformed organizationId', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, organizationId: '123e4567-e89b-12d3-a456-ZZZZZZZZZZZZ' });
      expect(result.success).toBe(false);
    });
  });

  describe('overall schema', () => {
    it('returns parsed data with correct types on success', () => {
      const result = CreateNoteDto.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('My Note');
        expect(result.data.content).toBe('Some content');
        expect(result.data.organizationId).toBe('123e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('strips extra fields (zod default behavior)', () => {
      const result = CreateNoteDto.safeParse({ ...validInput, extra: 'field' });
      // By default zod strips unknown keys
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).extra).toBeUndefined();
      }
    });

    it('rejects null input', () => {
      const result = CreateNoteDto.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('rejects array input', () => {
      const result = CreateNoteDto.safeParse([]);
      expect(result.success).toBe(false);
    });

    it('rejects completely empty object', () => {
      const result = CreateNoteDto.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
