type EntryResult =
  | { needsName: true }
  | { needsName: false; next: "/"; name: string; email: string };

export async function enterAccount(input: { name?: string; email?: string }): Promise<EntryResult> {
  const response = await fetch("/api/account/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Couldn’t continue just now.");
  if (body?.needsName === true) return { needsName: true };
  if (body?.next !== "/" || typeof body.name !== "string" || !body.name.trim() || typeof body.email !== "string") {
    throw new Error("The app received an outdated sign-in response. Restart the local server and refresh this page.");
  }
  return { needsName: false, next: "/", name: body.name, email: body.email };
}

export async function logoutAccount() {
  const response = await fetch("/api/account/logout", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Couldn’t log out. Please try again.");
}
