import type { Cadence } from "./types";

const HOURS = [
  "twelve",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
];

const SMALL = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];

export function intervalMinutes(cadence: Exclude<Cadence, "off">) {
  return cadence === "quarter" ? 15 : 30;
}

export function lastBoundary(from = new Date(), cadence: Cadence = "half") {
  if (cadence === "off") return null;
  const step = intervalMinutes(cadence);
  const boundary = new Date(from.getTime());
  boundary.setSeconds(0, 0);
  const minutes = boundary.getMinutes();
  boundary.setMinutes(minutes - (minutes % step), 0, 0);
  return boundary;
}

export function nextAnnouncement(from = new Date(), cadence: Cadence = "half") {
  if (cadence === "off") return null;
  const step = intervalMinutes(cadence);
  const next = new Date(from.getTime());
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const remainder = minutes % step;
  const add = remainder === 0 ? step : step - remainder;
  next.setMinutes(minutes + add, 0, 0);
  return next;
}

function dayPart(hours: number) {
  if (hours < 5 || hours >= 21) return "at night";
  if (hours < 12) return "in the morning";
  if (hours < 17) return "in the afternoon";
  return "in the evening";
}

function minuteWords(minute: number) {
  if (minute < 20) return SMALL[minute];
  const ten = Math.floor(minute / 10);
  const one = minute % 10;
  return one === 0 ? TENS[ten] : `${TENS[ten]}-${SMALL[one]}`;
}

export function phraseFor(date: Date, { includePeriod = true } = {}) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour = HOURS[hours % 12];
  const body =
    minutes === 0
      ? `${hour} o'clock`
      : minutes < 10
        ? `${hour} oh ${SMALL[minutes]}`
        : `${hour} ${minuteWords(minutes)}`;
  const period = includePeriod ? ` ${dayPart(hours)}` : "";
  return `It's ${body}${period}.`;
}

export function intervalProgress(date = new Date(), cadence: Cadence = "half") {
  if (cadence === "off") return 0;
  const step = intervalMinutes(cadence);
  const elapsed =
    (date.getMinutes() % step) * 60 * 1000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds();
  return elapsed / (step * 60 * 1000);
}

export function formatClock(date: Date) {
  const hour12 = date.getHours() % 12 || 12;
  return {
    hm: `${hour12}:${String(date.getMinutes()).padStart(2, "0")}`,
    sec: String(date.getSeconds()).padStart(2, "0"),
    ap: date.getHours() < 12 ? "AM" : "PM",
  };
}

export function formatWhen(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatWait(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function slotKey(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ].join("-");
}
