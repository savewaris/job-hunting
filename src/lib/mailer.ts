import nodemailer from 'nodemailer';
import { getCandidateContact } from '@/domain/profile';

export interface SendApplicationEmailInput {
  to: string;
  subject: string;
  body: string;
  resumePdfBuffer: Buffer;
  resumeFilename: string;
}

export interface SendApplicationEmailResult {
  sent: boolean;
  simulated: boolean;
  recipient: string;
  messageId?: string;
}

export function isMailerConfigured(): boolean {
  const service = process.env.EMAIL_SERVICE;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  return Boolean(
    service &&
      user &&
      pass &&
      !user.startsWith('you@') &&
      !pass.startsWith('your-'),
  );
}

/**
 * Sends an approved job application email with the candidate's tailored PDF
 * resume attached. If `EMAIL_APP_PASSWORD` is not yet configured in `.env.local`,
 * returns `{ sent: false, simulated: true }` so local testing and board
 * progression work smoothly without crashing.
 */
export async function sendApplicationEmail(
  input: SendApplicationEmailInput,
): Promise<SendApplicationEmailResult> {
  if (!isMailerConfigured()) {
    return {
      sent: false,
      simulated: true,
      recipient: input.to,
    };
  }

  const contact = getCandidateContact();
  const fromName = process.env.EMAIL_FROM_NAME || `${contact.fullName} (${contact.preferredName})`;
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const info = await transporter.sendMail({
    from: `"${fromName}" <${process.env.EMAIL_USER}>`,
    to: input.to,
    subject: input.subject,
    text: input.body,
    attachments: [
      {
        filename: input.resumeFilename,
        content: input.resumePdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  return {
    sent: true,
    simulated: false,
    recipient: input.to,
    messageId: info.messageId,
  };
}
