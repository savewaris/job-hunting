import { getSupabaseClient } from '@/lib/supabase';
import { getMasterProfile } from '@/domain/profile';
import { generateResumePdf } from '@/lib/pdf/generateResumePdf';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseClient();
  // params.id is a job_applications.id, not a tailored_documents.id — this
  // matches Task 12's send route, which looks up the resume doc the same
  // way (by job_application_id), and matches what callers (the cold-email
  // review queue) actually have on hand.
  const { data: doc, error } = await supabase
    .from('tailored_documents')
    .select('*')
    .eq('job_application_id', params.id)
    .eq('doc_type', 'resume')
    .single();

  if (error || !doc) {
    return new Response('Tailored document not found', { status: 404 });
  }

  const profile = getMasterProfile();
  const buffer = await generateResumePdf(profile, doc.content);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="resume-${params.id}.pdf"`,
    },
  });
}
