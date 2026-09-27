import { NextResponse } from 'next/server';
import { updateColdEmail } from '@/domain/cold-emails';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const patch = await req.json();
    const email = await updateColdEmail(params.id, patch);
    return NextResponse.json({ success: true, email });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
