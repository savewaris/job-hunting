import { NextResponse } from 'next/server';
import { runTailorNow } from '@/domain/pipeline/runStage';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await runTailorNow(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
