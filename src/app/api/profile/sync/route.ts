import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getMasterProfile } from '@/domain/profile';

const execFileAsync = promisify(execFile);

export async function POST() {
  try {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'sync-profile.mjs');
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath]);
    
    console.log('[API:sync-profile]', stdout);
    if (stderr) console.warn('[API:sync-profile:stderr]', stderr);

    const freshProfile = getMasterProfile();
    return NextResponse.json({
      success: true,
      profile: freshProfile,
      message: 'Profile synchronized from PersonalWebsite successfully'
    });
  } catch (error: any) {
    console.error('[API:sync-profile:error]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync profile' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const profile = getMasterProfile();
    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
