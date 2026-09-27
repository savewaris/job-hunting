import { NextResponse } from 'next/server';
import { getColdEmailById, updateColdEmail } from '@/domain/cold-emails';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const existing = await getColdEmailById(params.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Cold email not found' }, { status: 404 });
    }
    if (existing.status === 'sent') {
      return NextResponse.json(
        { success: false, error: 'Cannot edit an email that has already been sent' },
        { status: 409 }
      );
    }

    // Whitelist editable fields — the request body is untrusted `any`, and
    // forwarding it straight to a DB update would let a caller rewrite
    // recipient_email or status directly, bypassing the send route entirely.
    const body = await req.json();
    const patch: { subject?: string; body?: string } = {};
    if (typeof body.subject === 'string') patch.subject = body.subject;
    if (typeof body.body === 'string') patch.body = body.body;

    const email = await updateColdEmail(params.id, patch);
    return NextResponse.json({ success: true, email });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
