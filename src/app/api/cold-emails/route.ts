import { NextResponse } from 'next/server';
import { getDraftColdEmails } from '@/domain/cold-emails';

export async function GET() {
  try {
    const emails = await getDraftColdEmails();
    return NextResponse.json({ success: true, emails });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
