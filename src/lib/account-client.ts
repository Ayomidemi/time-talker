type EntryResult =
  | { needsName: true }
  | { needsName: false; next: "/"; name: string; email: string };

export async function enterAccount(input: { name?: string; email?: string }, signal?: AbortSignal): Promise<EntryResult> {
  const response = await fetch("/api/account/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
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

export async function updateDisplayName(name: string, signal: AbortSignal): Promise<string> {
  const response = await fetch("/api/account/name", {
    method: "PATCH", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.name !== "string") throw new Error(body?.error || "Couldn’t save your name. Please try again.");
  return body.name;
}

export async function saveAccountChanges(
  current: { name: string; email: string },
  draft: { name: string; email: string },
  signal: AbortSignal,
): Promise<{ name: string; email: string }> {
  const name = draft.name.trim();
  const email = current.email || draft.email.trim().toLowerCase();
  if (!name || name.length > 40) throw new Error("Name must be between 1 and 40 characters.");
  if (email !== current.email) {
    const result = await enterAccount({ name, email }, signal);
    if (result.needsName) throw new Error("Name is required.");
    return { name: result.name, email: result.email };
  }
  if (name !== current.name && current.email) {
    return { name: await updateDisplayName(name, signal), email };
  }
  return { name, email };
}
