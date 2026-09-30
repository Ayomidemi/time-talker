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

export function nextHalfHour(from = new Date()) {
  const next = new Date(from.getTime());
  next.setSeconds(0, 0);
  if (next.getMinutes() < 30) {
    next.setMinutes(30);
    return next;
  }
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

function dayPart(hours) {
  if (hours < 5 || hours >= 21) return "at night";
  if (hours < 12) return "in the morning";
  if (hours < 17) return "in the afternoon";
  return "in the evening";
}

function minuteWords(minute) {
  if (minute < 20) return SMALL[minute];
  const ten = Math.floor(minute / 10);
  const one = minute % 10;
  return one === 0 ? TENS[ten] : `${TENS[ten]}-${SMALL[one]}`;
}

export function phraseFor(date, { includePeriod = true } = {}) {
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

export function halfHourProgress(date = new Date()) {
  const elapsed =
    (date.getMinutes() % 30) * 60 * 1000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds();
  return elapsed / (30 * 60 * 1000);
}

export function formatClock(date) {
  const hour12 = date.getHours() % 12 || 12;
  return {
    hm: `${hour12}:${String(date.getMinutes()).padStart(2, "0")}`,
    sec: String(date.getSeconds()).padStart(2, "0"),
    ap: date.getHours() < 12 ? "AM" : "PM",
  };
}

export function formatWhen(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatWait(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
