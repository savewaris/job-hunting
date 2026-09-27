import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getColdEmailById, updateColdEmail } from '@/domain/cold-emails';
import { getMasterProfile } from '@/domain/profile';
import { generateResumePdf } from '@/lib/pdf/generateResumePdf';
import { sendColdEmail } from '@/lib/mailer';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const email = await getColdEmailById(params.id);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Cold email not found' }, { status: 404 });
    }

    if (email.status === 'sent') {
      // Already sent — a network retry or double-click on the Send button
      // must not re-email a real employer a second time.
      return NextResponse.json({ success: true });
    }

    const supabase = getSupabaseClient();
    const { data: doc } = await supabase
      .from('tailored_documents')
      .select('*')
      .eq('job_application_id', email.jobApplicationId)
      .eq('doc_type', 'resume')
      .single();

    const profile = getMasterProfile();
    const pdfBuffer = await generateResumePdf(profile, doc?.content ?? '');

    await sendColdEmail({
      to: email.recipientEmail,
      subject: email.subject,
      body: email.body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: `${profile.fullName.replace(/\s+/g, '_')}_Resume.pdf`,
    });

    await updateColdEmail(email.id, { status: 'sent' });
    await supabase
      .from('job_applications')
      .update({ pipeline_stage: 'sent', status: 'applied' })
      .eq('id', email.jobApplicationId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
