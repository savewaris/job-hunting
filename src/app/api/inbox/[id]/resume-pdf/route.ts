import { getDb } from '@/lib/sql';
import { fail } from '@/lib/http';
import { generateTailoredResumePdf } from '@/domain/tailoring/resumePdf';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  if (!UUID_RE.test(params.id)) return fail('Inbox item not found', 404);

  try {
    const sql = getDb();
    const res = await sql.query<{
      company_name: string | null;
      job_title: string | null;
      job_description: string | null;
      requirements: string[] | null;
    }>(
      `SELECT a.company_name, a.job_title, a.job_description, a.requirements
       FROM inbox_items i LEFT JOIN job_applications a ON a.id = i.job_application_id
       WHERE i.id = $1::uuid`,
      [params.id],
    );
    if (res.rows.length === 0) return fail('Inbox item not found', 404);
    const row = res.rows[0];

    const pdf = await generateTailoredResumePdf({
      companyName: row.company_name,
      jobTitle: row.job_title,
      jobDescription: row.job_description,
      requirements: row.requirements,
    });

    const safeCompany = (row.company_name ?? 'Company')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40);
    const filename = `Waris_Khamkaweepart_Resume_${safeCompany}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[inbox:resume-pdf]', err);
    return fail('Failed to generate resume PDF', 500);
  }
}
