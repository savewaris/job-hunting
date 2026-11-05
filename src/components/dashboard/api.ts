export interface ApiResult {
  ok: boolean;
  status: number;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

/** fetch + JSON with the project's `{ success, error }` envelope; never throws. */
export async function callApi(url: string, init?: RequestInit): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
    let data: { success?: boolean; error?: string } | undefined;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    if (res.ok && data?.success !== false) return { ok: true, status: res.status, data };
    return { ok: false, status: res.status, error: data?.error ?? `Request failed (${res.status})`, data };
  } catch {
    return { ok: false, status: 0, error: 'Network error — is the dev server running?' };
  }
}

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d16]';

export const BTN_PRIMARY = `inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 min-h-[44px] sm:min-h-[36px] text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const BTN_SECONDARY = `inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 min-h-[44px] sm:min-h-[36px] text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const INPUT = `w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 min-h-[44px] sm:min-h-[36px] text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-50 ${FOCUS}`;
export const PANEL = 'rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5';
