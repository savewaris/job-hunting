import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDb } from '@/lib/sql';
import type { Sql } from '@/lib/sql';
import { createApplication } from '@/domain/applications/repo';
import { GET } from '@/app/api/applications/route';
import { PATCH } from '@/app/api/applications/[id]/route';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
  setDb(sql);
});

afterEach(() => {
  setDb(null);
});

function patch(id: string, body: unknown, raw = false) {
  const req = new Request(`http://localhost/api/applications/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
  return PATCH(req, { params: { id } });
}

async function seed() {
  return createApplication(sql, { companyName: 'Acme', jobTitle: 'Dev' });
}

describe('GET /api/applications', () => {
  it('returns success and the applications', async () => {
    const app = await seed();
    const res = await GET(new Request('http://localhost/api/applications'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.applications.map((a: { id: string }) => a.id)).toEqual([app.id]);
  });
});

describe('PATCH /api/applications/[id]', () => {
  it('moves status', async () => {
    const app = await seed();
    const res = await patch(app.id, { status: 'applied' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.application.status).toBe('applied');
  });

  it('PATCH with status "banana" → 400', async () => {
    const app = await seed();
    const res = await patch(app.id, { status: 'banana' });
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it('PATCH unknown id → 404 and success:false', async () => {
    const res = await patch('00000000-0000-4000-8000-000000000000', { status: 'applied' });
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it('PATCH non-uuid id → 404', async () => {
    const res = await patch('nope', { status: 'applied' });
    expect(res.status).toBe(404);
  });

  it('PATCH {skip:{reason:"bad_pay"}} → 200 and status "skipped"', async () => {
    const app = await seed();
    const res = await patch(app.id, { skip: { reason: 'bad_pay' } });
    expect(res.status).toBe(200);
    expect((await res.json()).application.status).toBe('skipped');
  });

  it('PATCH {skip:{reason:"lol"}} → 400', async () => {
    const app = await seed();
    const res = await patch(app.id, { skip: { reason: 'lol' } });
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it('rejects a non-string skip note with 400', async () => {
    const app = await seed();
    const res = await patch(app.id, { skip: { reason: 'bad_pay', note: 5 } });
    expect(res.status).toBe(400);
  });

  it('rejects bodies that are not JSON objects with 400', async () => {
    const app = await seed();
    for (const raw of ['not json', 'null', '[]', '"str"', '42', '']) {
      const res = await patch(app.id, raw, true);
      expect(res.status, raw).toBe(400);
      expect((await res.json()).success).toBe(false);
    }
  });

  it('rejects both status and skip at once with 400 and changes nothing', async () => {
    const app = await seed();
    const res = await patch(app.id, { status: 'applied', skip: { reason: 'bad_pay' } });
    expect(res.status).toBe(400);
    const rows = await sql.query<{ status: string }>('SELECT status FROM job_applications');
    expect(rows.rows[0].status).toBe('wishlist');
  });

  it('rejects an empty object with 400', async () => {
    const app = await seed();
    expect((await patch(app.id, {})).status).toBe(400);
  });
});
