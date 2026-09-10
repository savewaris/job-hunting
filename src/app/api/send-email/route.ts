import { NextResponse } from 'next/server';
import { ColdEmail, MasterProfile } from '@/types';
import { generateResumePdfBuffer } from '@/lib/pdf/generateResumePdf';
import { sendColdEmailWithResume } from '@/lib/mailer';
import { saveColdEmailToDb } from '@/lib/db';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { email, masterProfile } = (await req.json()) as {
      email: ColdEmail;
      masterProfile: MasterProfile;
    };

    if (!email?.recipientEmail || !EMAIL_REGEX.test(email.recipientEmail.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Recipient email is missing or invalid. Edit the draft and add a real recipient before sending.',
        },
        { status: 400 }
      );
    }
    if (!email.subject?.trim() || !email.body?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Subject and body are required before sending.' },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateResumePdfBuffer({
      masterProfile,
      tailoredSummary: email.tailoredSummary,
      suggestedBullets: email.suggestedBullets,
      targetCompany: email.companyName,
      targetTitle: email.jobTitle,
    });

    const safeName = (masterProfile.fullName || 'Resume').replace(/\s+/g, '_');
    const pdfFilename = `${safeName}_Resume_${email.companyName}.pdf`.replace(/[^\w.-]/g, '_');

    const info = await sendColdEmailWithResume({
      to: email.recipientEmail.trim(),
      subject: email.subject,
      text: email.body,
      pdfBuffer,
      pdfFilename,
      fromName: masterProfile.fullName,
    });

    const sentAt = new Date().toISOString();
    await saveColdEmailToDb({ ...email, status: 'sent', sentAt });

    return NextResponse.json({ success: true, messageId: info.messageId, sentAt });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
