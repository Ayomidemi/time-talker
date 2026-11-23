import type { Commitment } from "./types";

export type CommitmentChange = { operation: "add" | "update" | "delete"; id: string; title?: string; done?: boolean; dueAt?: string | null };

export async function accountCommitments(day: string, signal: AbortSignal, change?: CommitmentChange): Promise<Commitment[]> {
  const response = await fetch(`/api/commitments?day=${encodeURIComponent(day)}`, {
    method: change ? "POST" : "GET", cache: "no-store", signal,
    ...(change ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...change, day }) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.commitments)) throw new Error(body?.error || "Couldn’t load your commitments. Please try again.");
  return body.commitments;
}
