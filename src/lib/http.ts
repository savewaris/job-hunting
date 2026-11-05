/** Success envelope: `{ success: true, ...payload }`. */
export function ok(payload: object = {}, status = 200): Response {
  return Response.json({ success: true, ...payload }, { status });
}

/** Failure envelope: `{ success: false, error }`. */
export function fail(error: string, status: number): Response {
  return Response.json({ success: false, error }, { status });
}
