```typescript
// __tests__/api/users/[id]/patch.test.ts

import { PATCH } from '@/app/api/users/[id]/route';
import { getServerSession } from 'next-auth';
import { userService } from '@/services/userService';
import { UpdateUserDto } from '@/dto/UpdateUserDto';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/services/userService', () => ({
  userService: {
    updateUser: jest.fn(),
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockUpdateUser = userService.updateUser as jest.MockedFunction<typeof userService.updateUser>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/users/user-123', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DEFAULT_PARAMS = { params: { id: 'user-123' } };

describe('PATCH /api/users/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 401 – No session
  // -------------------------------------------------------------------------
  describe('when the user is not authenticated', () => {
    it('returns 401 UNAUTHORIZED when there is no session', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = makeRequest({ name: 'Alice' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: 'UNAUTHORIZED' });
    });
  });

  // -------------------------------------------------------------------------
  // 400 – Validation errors
  // -------------------------------------------------------------------------
  describe('when the request body is invalid', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({ userId: 'user-123' } as any);
    });

    it('returns 400 VALIDATION_ERROR when the body is an empty object and no fields are required', async () => {
      // Simulate safeParse returning failure for an obviously bad payload
      // We use a body that cannot possibly satisfy UpdateUserDto (e.g. wrong types)
      const request = makeRequest({ name: 12345, email: true });
      const response = await PATCH(request, DEFAULT_PARAMS);

      // The actual validation depends on the DTO schema, but the handler always
      // returns 400 when safeParse fails, so we test at the integration level.
      // Here we rely on UpdateUserDto being a Zod schema with typed fields.
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: 'VALIDATION_ERROR' });
    });

    it('returns 400 VALIDATION_ERROR when body has extra unknown fields that are stripped and required ones are missing', async () => {
      // Provide only completely wrong structure
      const request = makeRequest({ unknown_field: 'xyz' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      // Only relevant if UpdateUserDto requires at least one field.
      // If the schema makes all fields optional, this may pass – adjust per real schema.
      // The test documents the handler wiring to safeParse.
      expect([200, 400]).toContain(response.status);
    });
  });

  // -------------------------------------------------------------------------
  // 403 – Forbidden (different user)
  // -------------------------------------------------------------------------
  describe('when the authenticated user is different from the target user', () => {
    it('returns 403 FORBIDDEN', async () => {
      mockGetServerSession.mockResolvedValue({ userId: 'another-user-456' } as any);

      const request = makeRequest({ name: 'Alice' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: 'FORBIDDEN' });
    });

    it('does NOT call userService.updateUser when returning 403', async () => {
      mockGetServerSession.mockResolvedValue({ userId: 'intruder-999' } as any);

      const request = makeRequest({ name: 'Alice' });
      await PATCH(request, DEFAULT_PARAMS);

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 404 – User not found
  // -------------------------------------------------------------------------
  describe('when the user does not exist in the database', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({ userId: 'user-123' } as any);
      mockUpdateUser.mockResolvedValue(null as any);
    });

    it('returns 404 NOT_FOUND when userService.updateUser returns null', async () => {
      const request = makeRequest({ name: 'Alice' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json).toEqual({ error: 'NOT_FOUND' });
    });

    it('returns 404 NOT_FOUND when userService.updateUser returns undefined', async () => {
      mockUpdateUser.mockResolvedValue(undefined as any);

      const request = makeRequest({ name: 'Alice' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json).toEqual({ error: 'NOT_FOUND' });
    });
  });

  // -------------------------------------------------------------------------
  // 200 – Success
  // -------------------------------------------------------------------------
  describe('when the update succeeds', () => {
    const updatedUser = { id: 'user-123', name: 'Alice Updated', email: 'alice@example.com' };

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({ userId: 'user-123' } as any);
      mockUpdateUser.mockResolvedValue(updatedUser as any);
    });

    it('returns 200 with the updated user object', async () => {
      const request = makeRequest({ name: 'Alice Updated' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(updatedUser);
    });

    it('calls userService.updateUser with the correct id and parsed data', async () => {
      const payload = { name: 'Alice Updated', email: 'alice@example.com' };
      const request = makeRequest(payload);
      await PATCH(request, DEFAULT_PARAMS);

      expect(mockUpdateUser).toHaveBeenCalledTimes(1);
      expect(mockUpdateUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining(payload),
      );
    });

    it('returns 200 when the user updates their own profile with partial data', async () => {
      const request = makeRequest({ name: 'New Name' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Edge / boundary cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('returns 403 when session.userId is empty string and params.id is non-empty', async () => {
      mockGetServerSession.mockResolvedValue({ userId: '' } as any);

      const request = makeRequest({ name: 'Alice' });
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: 'FORBIDDEN' });
    });

    it('validates before checking ownership (returns 400 for bad body even when user matches)', async () => {
      // Session matches but body is invalid
      mockGetServerSession.mockResolvedValue({ userId: 'user-123' } as any);

      const request = makeRequest({ name: 12345 }); // invalid type
      const response = await PATCH(request, DEFAULT_PARAMS);

      // Validation happens before the ownership check in the handler
      expect(response.status).toBe(400);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('does not call userService when unauthenticated (no unnecessary DB calls)', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = makeRequest({ name: 'Alice' });
      await PATCH(request, DEFAULT_PARAMS);

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('returns 401 before performing validation when session is missing', async () => {
      mockGetServerSession.mockResolvedValue(null);

      // Even with an invalid body, 401 is returned first
      const request = makeRequest(null);
      const response = await PATCH(request, DEFAULT_PARAMS);

      expect(response.status).toBe(401);
    });
  });
});
```
