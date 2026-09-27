import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetColdEmailById = vi.fn();
const mockUpdateColdEmail = vi.fn();
const mockFrom = vi.fn();
const mockGetMasterProfile = vi.fn();
const mockGenerateResumePdf = vi.fn();
const mockSendColdEmail = vi.fn();

vi.mock('@/domain/cold-emails', () => ({
  getColdEmailById: (...args: any[]) => mockGetColdEmailById(...args),
  updateColdEmail: (...args: any[]) => mockUpdateColdEmail(...args),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));
vi.mock('@/domain/profile', () => ({
  getMasterProfile: (...args: any[]) => mockGetMasterProfile(...args),
}));
vi.mock('@/lib/pdf/generateResumePdf', () => ({
  generateResumePdf: (...args: any[]) => mockGenerateResumePdf(...args),
}));
vi.mock('@/lib/mailer', () => ({
  sendColdEmail: (...args: any[]) => mockSendColdEmail(...args),
}));

import { POST } from '../route';

function chainable(result: any) {
  const chain: any = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(chainable({ data: { content: 'bullets' }, error: null }));
  mockGetMasterProfile.mockReturnValue({ fullName: 'Jane Doe' });
  mockGenerateResumePdf.mockResolvedValue(Buffer.from('pdf'));
});

describe('POST /api/cold-emails/[id]/send', () => {
  it('does not send twice when the email is already marked sent', async () => {
    mockGetColdEmailById.mockResolvedValue({
      id: 'email-1',
      jobApplicationId: 'job-1',
      recipientEmail: 'hr@acme.co',
      subject: 'Application',
      body: 'body',
      status: 'sent',
    });

    const res = await POST(new Request('http://localhost/x'), { params: { id: 'email-1' } });
    const json = await res.json();

    expect(mockSendColdEmail).not.toHaveBeenCalled();
    expect(json.success).toBe(true);
  });

  it('sends and marks as sent when the email is still a draft', async () => {
    mockGetColdEmailById.mockResolvedValue({
      id: 'email-1',
      jobApplicationId: 'job-1',
      recipientEmail: 'hr@acme.co',
      subject: 'Application',
      body: 'body',
      status: 'draft',
    });

    const res = await POST(new Request('http://localhost/x'), { params: { id: 'email-1' } });
    const json = await res.json();

    expect(mockSendColdEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdateColdEmail).toHaveBeenCalledWith('email-1', { status: 'sent' });
    expect(json.success).toBe(true);
  });

  it('refuses to send (409) when no tailored resume document exists, instead of emailing a blank one', async () => {
    mockGetColdEmailById.mockResolvedValue({
      id: 'email-1',
      jobApplicationId: 'job-1',
      recipientEmail: 'hr@acme.co',
      subject: 'Application',
      body: 'body',
      status: 'draft',
    });
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'no rows' } }));

    const res = await POST(new Request('http://localhost/x'), { params: { id: 'email-1' } });
    const json = await res.json();

    expect(mockSendColdEmail).not.toHaveBeenCalled();
    expect(json.success).toBe(false);
    expect(res.status).toBe(409);
  });

  it('still reports success if the email sent but the post-send status update failed, so the UI never invites a resend', async () => {
    mockGetColdEmailById.mockResolvedValue({
      id: 'email-1',
      jobApplicationId: 'job-1',
      recipientEmail: 'hr@acme.co',
      subject: 'Application',
      body: 'body',
      status: 'draft',
    });
    mockUpdateColdEmail.mockRejectedValue(new Error('supabase write timed out'));

    const res = await POST(new Request('http://localhost/x'), { params: { id: 'email-1' } });
    const json = await res.json();

    expect(mockSendColdEmail).toHaveBeenCalledTimes(1);
    expect(json.success).toBe(true);
  });
});
