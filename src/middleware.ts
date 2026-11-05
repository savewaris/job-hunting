import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isLocalHost } from '@/lib/localOnly';

// Defence in depth against DNS rebinding / mis-binding: this app holds sensitive
// personal data and must only ever be served to the local machine.
export function middleware(req: NextRequest) {
  if (!isLocalHost(req.headers.get('host'))) {
    return NextResponse.json(
      { success: false, error: 'Local access only' },
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
