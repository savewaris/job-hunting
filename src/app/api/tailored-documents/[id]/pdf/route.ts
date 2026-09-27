import { getSupabaseClient } from '@/lib/supabase';
import { getMasterProfile } from '@/domain/profile';
import { generateResumePdf } from '@/lib/pdf/generateResumePdf';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseClient();
  const { data: doc, error } = await supabase
    .from('tailored_documents')
    .select('*')
    .eq('id', params.id)
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
