import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    const sessionDir = path.resolve(process.cwd(), '.browser-sessions', 'facebook-profile');
    const infoFile = path.join(sessionDir, 'session-info.json');

    const isConnected = fs.existsSync(infoFile);
    let connectedAt: string | undefined;

    if (isConnected) {
      try {
        const info = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
        connectedAt = info.connectedAt;
      } catch (e) {}
    }

    return NextResponse.json({
      connected: isConnected,
      connectedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: err.message });
  }
}
