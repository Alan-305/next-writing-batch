const HEADER = "x-proofread-worker-secret";

export function proofreadWorkerSecret(): string {
  return (process.env.NWB_PROOFREAD_WORKER_SECRET ?? "").trim();
}

export function verifyProofreadWorkerRequest(request: Request): boolean {
  const expected = proofreadWorkerSecret();
  if (!expected) return false;
  const got = (request.headers.get(HEADER) ?? "").trim();
  return got.length > 0 && got === expected;
}

export function proofreadWorkerAuthHeader(): Record<string, string> {
  const secret = proofreadWorkerSecret();
  if (!secret) return {};
  return { [HEADER]: secret };
}
