import { NotesService } from '../notes.service';

// ---- Error stubs (mirroring what the service imports) ----
class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// ---- Prisma mock factory ----
function makePrismaMock() {
  return {
    note: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

// ---- Fixtures ----
const USER_ID = 'user-abc-123';
const OTHER_USER_ID = 'user-xyz-999';
const NOTE_ID = 'note-id-001';
const ORG_ID = '123e4567-e89b-12d3-a456-426614174000';

const baseNote = {
  id: NOTE_ID,
  title: 'My Note',
  content: 'Some content',
  organizationId: ORG_ID,
  userId: USER_ID,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

// ---- Tests ----
describe('NotesService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let service: NotesService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    // NotesService accepts PrismaClient; cast to avoid type issues in tests
    service = new NotesService(prismaMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------ //
  //  createNote
  // ------------------------------------------------------------------ //
  describe('createNote', () => {
    const createInput = {
      title: 'My Note',
      content: 'Some content',
      organizationId: ORG_ID,
    };

    it('calls prisma.note.create with merged data including userId', async () => {
      prismaMock.note.create.mockResolvedValue(baseNote);

      const result = await service.createNote(createInput, USER_ID);

      expect(prismaMock.note.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.note.create).toHaveBeenCalledWith({
        data: { ...createInput, userId: USER_ID },
      });
      expect(result).toEqual(baseNote);
    });

    it('returns the created note', async () => {
      prismaMock.note.create.mockResolvedValue(baseNote);

      const result = await service.createNote(createInput, USER_ID);

      expect(result).toMatchObject({ id: NOTE_ID, userId: USER_ID });
    });

    it('works when content is omitted (optional field)', async () => {
      const inputWithoutContent = { title: 'No Content', organizationId: ORG_ID };
      const noteWithoutContent = { ...baseNote, content: null };
      prismaMock.note.create.mockResolvedValue(noteWithoutContent);

      const result = await service.createNote(inputWithoutContent, USER_ID);

      expect(prismaMock.note.create).toHaveBeenCalledWith({
        data: { ...inputWithoutContent, userId: USER_ID },
      });
      expect(result).toEqual(noteWithoutContent);
    });

    it('propagates prisma errors', async () => {
      const dbError = new Error('DB connection failed');
      prismaMock.note.create.mockRejectedValue(dbError);

      await expect(service.createNote(createInput, USER_ID)).rejects.toThrow('DB connection failed');
    });
  });

  // ------------------------------------------------------------------ //
  //  getNote
  // ------------------------------------------------------------------ //
  describe('getNote', () => {
    it('returns note when it exists and belongs to the user', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);

      const result = await service.getNote(NOTE_ID, USER_ID);

      expect(prismaMock.note.findUnique).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
      expect(result).toEqual(baseNote);
    });

    it('throws NotFoundError when note does not exist', async () => {
      prismaMock.note.findUnique.mockResolvedValue(null);

      await expect(service.getNote(NOTE_ID, USER_ID)).rejects.toThrow('Note not found');
    });

    it('throws NotFoundError (not ForbiddenError) for missing note regardless of userId', async () => {
      prismaMock.note.findUnique.mockResolvedValue(null);

      await expect(service.getNote(NOTE_ID, OTHER_USER_ID)).rejects.toThrow('Note not found');
    });

    it('throws ForbiddenError when note belongs to a different user', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote); // note.userId = USER_ID

      await expect(service.getNote(NOTE_ID, OTHER_USER_ID)).rejects.toThrow('Access denied');
    });

    it('error thrown for wrong user is ForbiddenError instance', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);

      try {
        await service.getNote(NOTE_ID, OTHER_USER_ID);
        fail('Expected ForbiddenError to be thrown');
      } catch (err: any) {
        expect(err.name).toBe('ForbiddenError');
      }
    });

    it('error thrown for missing note is NotFoundError instance', async () => {
      prismaMock.note.findUnique.mockResolvedValue(null);

      try {
        await service.getNote(NOTE_ID, USER_ID);
        fail('Expected NotFoundError to be thrown');
      } catch (err: any) {
        expect(err.name).toBe('NotFoundError');
      }
    });

    it('propagates unexpected prisma errors', async () => {
      prismaMock.note.findUnique.mockRejectedValue(new Error('Unexpected DB error'));

      await expect(service.getNote(NOTE_ID, USER_ID)).rejects.toThrow('Unexpected DB error');
    });
  });

  // ------------------------------------------------------------------ //
  //  updateNote
  // ------------------------------------------------------------------ //
  describe('updateNote', () => {
    const updateData = { title: 'Updated Title' };
    const updatedNote = { ...baseNote, title: 'Updated Title' };

    it('fetches note via getNote then calls prisma.note.update', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.update.mockResolvedValue(updatedNote);

      const result = await service.updateNote(NOTE_ID, updateData, USER_ID);

      expect(prismaMock.note.findUnique).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
      expect(prismaMock.note.update).toHaveBeenCalledWith({
        where: { id: baseNote.id },
        data: updateData,
      });
      expect(result).toEqual(updatedNote);
    });

    it('returns the updated note', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.update.mockResolvedValue(updatedNote);

      const result = await service.updateNote(NOTE_ID, updateData, USER_ID);

      expect(result.title).toBe('Updated Title');
    });

    it('throws NotFoundError if note does not exist', async () => {
      prismaMock.note.findUnique.mockResolvedValue(null);

      await expect(service.updateNote(NOTE_ID, updateData, USER_ID)).rejects.toThrow('Note not found');
      expect(prismaMock.note.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError if note belongs to another user', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);

      await expect(service.updateNote(NOTE_ID, updateData, OTHER_USER_ID)).rejects.toThrow('Access denied');
      expect(prismaMock.note.update).not.toHaveBeenCalled();
    });

    it('can update content field', async () => {
      const contentUpdate = { content: 'New content' };
      const updatedWithContent = { ...baseNote, content: 'New content' };
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.update.mockResolvedValue(updatedWithContent);

      const result = await service.updateNote(NOTE_ID, contentUpdate, USER_ID);

      expect(prismaMock.note.update).toHaveBeenCalledWith({
        where: { id: baseNote.id },
        data: contentUpdate,
      });
      expect(result.content).toBe('New content');
    });

    it('can update organizationId field', async () => {
      const newOrgId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const orgUpdate = { organizationId: newOrgId };
      const updatedWithOrg = { ...baseNote, organizationId: newOrgId };
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.update.mockResolvedValue(updatedWithOrg);

      const result = await service.updateNote(NOTE_ID, orgUpdate, USER_ID);

      expect(result.organizationId).toBe(newOrgId);
    });

    it('accepts empty partial update object', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.update.mockResolvedValue(baseNote);

      const result = await service.updateNote(NOTE_ID, {}, USER_ID);

      expect(prismaMock.note.update).toHaveBeenCalledWith({
        where: { id: baseNote.id },
        data: {},
      });
      expect(result).toEqual(baseNote);
    });

    it('propagates prisma update errors', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.update.mockRejectedValue(new Error('Update failed'));

      await expect(service.updateNote(NOTE_ID, updateData, USER_ID)).rejects.toThrow('Update failed');
    });
  });

  // ------------------------------------------------------------------ //
  //  deleteNote
  // ------------------------------------------------------------------ //
  describe('deleteNote', () => {
    it('fetches note via getNote then calls prisma.note.delete', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.delete.mockResolvedValue(baseNote);

      const result = await service.deleteNote(NOTE_ID, USER_ID);

      expect(prismaMock.note.findUnique).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
      expect(prismaMock.note.delete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
      expect(result).toEqual(baseNote);
    });

    it('returns the deleted note', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.delete.mockResolvedValue(baseNote);

      const result = await service.deleteNote(NOTE_ID, USER_ID);

      expect(result).toMatchObject({ id: NOTE_ID });
    });

    it('throws NotFoundError if note does not exist', async () => {
      prismaMock.note.findUnique.mockResolvedValue(null);

      await expect(service.deleteNote(NOTE_ID, USER_ID)).rejects.toThrow('Note not found');
      expect(prismaMock.note.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError if note belongs to another user', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);

      await expect(service.deleteNote(NOTE_ID, OTHER_USER_ID)).rejects.toThrow('Access denied');
      expect(prismaMock.note.delete).not.toHaveBeenCalled();
    });

    it('propagates prisma delete errors', async () => {
      prismaMock.note.findUnique.mockResolvedValue(baseNote);
      prismaMock.note.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(service.deleteNote(NOTE_ID, USER_ID)).rejects.toThrow('Delete failed');
    });
  });

  // ------------------------------------------------------------------ //
  //  Cross-cutting: authorization is enforced for every mutating operation
  // ------------------------------------------------------------------ //
  describe('ownership enforcement', () => {
    it('update: different userId is always rejected even with valid noteId', async () => {
      prismaMock.note.findUnique.mockResolvedValue({ ...baseNote, userId: 'owner-a' });

      await expect(service.updateNote(NOTE_ID, { title: 'x' }, 'owner-b')).rejects.toThrow('Access denied');
    });

    it('delete: different userId is always rejected even with valid noteId', async () => {
      prismaMock.note.findUnique.mockResolvedValue({ ...baseNote, userId: 'owner-a' });

      await expect(service.deleteNote(NOTE_ID, 'owner-b')).rejects.toThrow('Access denied');
    });
  });
});
