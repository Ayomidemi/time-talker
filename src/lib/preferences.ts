import type { Settings } from "./types";

export function validPreferences(value: unknown): value is Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (key === "cadence") return ["off", "half", "quarter"].includes(item);
    if (key === "intensity") return ["gentle", "annoying"].includes(item);
    if (key === "includePeriod" || key === "enabled") return typeof item === "boolean";
    return false;
  });
}

export async function accountPreferences(signal: AbortSignal, changes?: Partial<Settings>): Promise<Settings> {
  const response = await fetch("/api/account/preferences", {
    method: changes ? "PATCH" : "GET", cache: "no-store", signal,
    ...(changes ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Couldn’t save preferences. Please try again.");
  const settings = body?.settings;
  if (!validPreferences(settings) || Object.keys(settings).length !== 4) throw new Error("Couldn’t load preferences. Please try again.");
  return settings as Settings;
}
