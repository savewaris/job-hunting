import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetColdEmailById = vi.fn();
const mockUpdateColdEmail = vi.fn();

vi.mock('@/domain/cold-emails', () => ({
  getColdEmailById: (...args: any[]) => mockGetColdEmailById(...args),
  updateColdEmail: (...args: any[]) => mockUpdateColdEmail(...args),
}));

import { PATCH } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/cold-emails/[id]', () => {
  it('only forwards subject/body to the database update, ignoring other fields like recipient_email or status', async () => {
    mockGetColdEmailById.mockResolvedValue({ id: 'email-1', status: 'draft' });
    mockUpdateColdEmail.mockResolvedValue({ id: 'email-1', subject: 'New subject' });

    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ subject: 'New subject', recipient_email: 'attacker@evil.com', status: 'sent' }),
    });
    await PATCH(req, { params: { id: 'email-1' } });

    expect(mockUpdateColdEmail).toHaveBeenCalledWith('email-1', { subject: 'New subject' });
  });

  it('rejects edits once the email has already been sent', async () => {
    mockGetColdEmailById.mockResolvedValue({ id: 'email-1', status: 'sent' });

    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ subject: 'Too late' }),
    });
    const res = await PATCH(req, { params: { id: 'email-1' } });
    const json = await res.json();

    expect(mockUpdateColdEmail).not.toHaveBeenCalled();
    expect(json.success).toBe(false);
    expect(res.status).toBe(409);
  });
});
