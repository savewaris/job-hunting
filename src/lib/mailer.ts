import nodemailer from 'nodemailer';

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error(
      'Email sending is not configured — set EMAIL_USER and EMAIL_APP_PASSWORD in .env.local'
    );
  }
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return cachedTransport;
}

interface SendColdEmailOptions {
  to: string;
  subject: string;
  text: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  fromName?: string;
}

export async function sendColdEmailWithResume(options: SendColdEmailOptions) {
  const transport = getTransport();
  const fromAddress = process.env.EMAIL_USER!;
  const fromName = options.fromName || process.env.EMAIL_FROM_NAME || fromAddress;

  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    attachments: [
      {
        filename: options.pdfFilename,
        content: options.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}
