import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCrossSiteBlocked, isLocalHost } from '@/lib/localOnly';

function deny(error: string) {
  return NextResponse.json(
    { success: false, error },
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
}

// Defence in depth: this app holds sensitive personal data and must only ever be
// served to the local machine, and only to pages of its own origin.
//  1. Host check: DNS rebinding / mis-binding.
//  2. Cross-site check: a web page in the user's own browser calling localhost.
export function middleware(req: NextRequest) {
  if (!isLocalHost(req.headers.get('host'))) {
    return deny('Local access only');
  }
  if (
    isCrossSiteBlocked({
      method: req.method,
      origin: req.headers.get('origin'),
      secFetchSite: req.headers.get('sec-fetch-site'),
      secFetchMode: req.headers.get('sec-fetch-mode'),
    })
  ) {
    return deny('Cross-site request blocked');
  }
  return NextResponse.next();
}

// No exclusions: the guard also covers _next/static, _next/image and the favicon.
export const config = {
  matcher: ['/:path*'],
};
