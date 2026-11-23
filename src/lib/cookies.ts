const YEAR = 60 * 60 * 24 * 365;

export function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${encodeURIComponent(name)}=`) || row.startsWith(`${name}=`));
  if (!match) return "";
  const value = match.slice(match.indexOf("=") + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function writeCookie(name: string, value: string, maxAge = YEAR) {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}
