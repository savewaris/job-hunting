import nodemailer from 'nodemailer';

export function getMailer() {
  const service = process.env.EMAIL_SERVICE;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!service || !user || !pass) {
    throw new Error('Missing EMAIL_SERVICE, EMAIL_USER, or EMAIL_APP_PASSWORD in the environment.');
  }

  return nodemailer.createTransport({ service, auth: { user, pass } });
}

export async function sendColdEmail(opts: {
  to: string;
  subject: string;
  body: string;
  attachmentBuffer: Buffer;
  attachmentFilename: string;
}) {
  const transporter = getMailer();
  const fromName = process.env.EMAIL_FROM_NAME || 'Job Applicant';

  return transporter.sendMail({
    from: `"${fromName}" <${process.env.EMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    attachments: [{ filename: opts.attachmentFilename, content: opts.attachmentBuffer }],
  });
}
