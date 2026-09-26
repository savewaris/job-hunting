import { NextResponse } from 'next/server';
import { getPipelineSettings, updatePipelineSettings } from '@/domain/pipeline/settings';

export async function GET() {
  try {
    const settings = await getPipelineSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const patch = await req.json();
    const settings = await updatePipelineSettings(patch);
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
