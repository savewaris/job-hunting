import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'init-facebook-session.mjs');
    
    // Spawn visible Node process so browser window appears directly on user screen
    const child = spawn(process.execPath, [scriptPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Launched secure Facebook login window on your screen. Please log in there!'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
