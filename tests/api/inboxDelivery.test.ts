import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import { createApplication } from '@/domain/applications/repo';
import { createInboxItem } from '@/domain/inbox/repo';
import { POST } from '@/app/api/inbox/[id]/resolve/route';
import * as mailer from '@/lib/mailer';
import * as resumePdf from '@/domain/tailoring/resumePdf';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;
let jobId: string;
let approvalId: string;

beforeEach(async () => {
  sql = await createTestDb();
  setDb(sql);
  jobId = (
    await createApplication(sql, {
      companyName: 'Acme Co',
      jobTitle: 'Full Stack Developer',
      contactMethod: { type: 'email', value: 'hr@acme.test' },
    })
  ).id;
  approvalId = (
    await createInboxItem(sql, {
      jobApplicationId: jobId,
      kind: 'approval',
      prompt: 'Approve email application?',
      payload: { channel: 'email', preview: 'Dear Acme, I would like to apply.' },
    })
  ).id;
  vi.spyOn(resumePdf, 'generateTailoredResumePdf').mockResolvedValue(Buffer.from('%PDF-fake'));
});

afterEach(() => {
  setDb(null);
  vi.restoreAllMocks();
});

function approve(id = approvalId) {
  return POST(
    new Request(`http://localhost/api/inbox/${id}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    }),
    { params: { id } },
  );
}

async function appStatus(): Promise<string> {
  const r = await sql.query<{ status: string }>('SELECT status FROM job_applications WHERE id = $1::uuid', [jobId]);
  return r.rows[0].status;
}

async function itemRow() {
  const r = await sql.query<{ status: string; decision: string | null; payload: Record<string, unknown> }>(
    'SELECT status, decision, payload FROM inbox_items WHERE id = $1::uuid',
    [approvalId],
  );
  return r.rows[0];
}

describe('approving an email application', () => {
  it('sends, marks applied, and records the message id on the item', async () => {
    const send = vi.spyOn(mailer, 'sendApplicationEmail').mockResolvedValue({
      sent: true,
      simulated: false,
      recipient: 'hr@acme.test',
      messageId: '<abc@mail.test>',
    });

    const res = await approve();
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await appStatus()).toBe('applied');
    const item = await itemRow();
    expect(item.status).toBe('answered');
    expect(item.payload.delivery).toMatchObject({ sent: true, messageId: '<abc@mail.test>', recipient: 'hr@acme.test' });
  });

  it('does NOT mark applied when the mailer is not configured (simulated); reopens the approval and says why', async () => {
    vi.spyOn(mailer, 'sendApplicationEmail').mockResolvedValue({
      sent: false,
      simulated: true,
      recipient: 'hr@acme.test',
    });

    const res = await approve();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/not configured|EMAIL_/i);

    expect(await appStatus()).toBe('wishlist');
    const item = await itemRow();
    expect(item.status).toBe('open');
    expect(item.decision).toBeNull();
  });

  it('does NOT mark applied when sending throws; reopens so the user can retry, without leaking details', async () => {
    vi.spyOn(mailer, 'sendApplicationEmail').mockRejectedValue(new Error('535 bad credentials user=me@gmail.com'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await approve();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(JSON.stringify(json)).not.toContain('me@gmail.com');

    expect(await appStatus()).toBe('wishlist');
    expect((await itemRow()).status).toBe('open');
  });

  it('a retry after a failed send sends exactly once, and a second approve is rejected (409) without sending again', async () => {
    const send = vi
      .spyOn(mailer, 'sendApplicationEmail')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ sent: true, simulated: false, recipient: 'hr@acme.test', messageId: '<m1>' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await approve()).status).toBe(502);
    expect((await approve()).status).toBe(200);
    expect((await approve()).status).toBe(409);
    expect(send).toHaveBeenCalledTimes(2); // one failed attempt, one real send, none after
    expect(await appStatus()).toBe('applied');
  });

  it('still reports success if the email went out but the follow-up status write fails (never invite a double send)', async () => {
    vi.spyOn(mailer, 'sendApplicationEmail').mockResolvedValue({
      sent: true,
      simulated: false,
      recipient: 'hr@acme.test',
      messageId: '<m2>',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const applications = await import('@/domain/applications/repo');
    vi.spyOn(applications, 'moveApplication').mockRejectedValue(new Error('db hiccup'));

    const res = await approve();
    expect(res.status).toBe(200);
    expect((await itemRow()).status).toBe('answered'); // stays resolved: must not be re-approvable
  });
});
