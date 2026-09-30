import {
  formatClock,
  formatWait,
  formatWhen,
  halfHourProgress,
  nextHalfHour,
  phraseFor,
} from "./time.js";

const hmEl = document.querySelector("#hm");
const secEl = document.querySelector("#sec");
const ampmEl = document.querySelector("#ampm");
const progressEl = document.querySelector("#progress");
const untilEl = document.querySelector("#until");
const phraseEl = document.querySelector("#phrase");
const errorEl = document.querySelector("#error");
const liveEl = document.querySelector("#live");
const toggleEl = document.querySelector("#toggle");
const voiceEl = document.querySelector("#voice");
const periodEl = document.querySelector("#period");
const speakEl = document.querySelector("#speak");

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let state = {
  enabled: true,
  voice: "",
  includePeriod: true,
  speaking: false,
  lastPhrase: null,
  lastSpokenAt: null,
  lastError: null,
};
let pendingSpeak = false;
let speakRequest = 0;
let heardAt = null;

progressEl.style.strokeDasharray = String(CIRCUMFERENCE);

function setError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

function voiceLabel(voice) {
  const locale = voice.locale.replaceAll("_", "-");
  let language = voice.locale;
  try {
    language = languageNames.of(locale) || voice.locale;
  } catch {
    language = voice.locale;
  }
  return `${voice.name} · ${language}`;
}

function renderVoices(voices) {
  const english = voices.filter((voice) => voice.locale.startsWith("en"));
  const other = voices.filter((voice) => !voice.locale.startsWith("en"));
  voiceEl.replaceChildren();
  for (const [label, group] of [
    ["English", english],
    ["Other languages", other],
  ]) {
    if (!group.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = label;
    for (const voice of group) {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = voiceLabel(voice);
      optgroup.append(option);
    }
    voiceEl.append(optgroup);
  }
  if (state.voice) voiceEl.value = state.voice;
}

function syncControls() {
  toggleEl.setAttribute("aria-checked", String(state.enabled));
  document.body.classList.toggle("is-paused", !state.enabled);
  document.body.classList.toggle("is-speaking", state.speaking || pendingSpeak);
  if (document.activeElement !== voiceEl && state.voice) voiceEl.value = state.voice;
  if (document.activeElement !== periodEl) periodEl.checked = state.includePeriod;
  const busy = state.speaking || pendingSpeak;
  speakEl.disabled = busy;
  speakEl.textContent = busy ? "Speaking…" : "Say the time now";
  setError(state.lastError);
}

function paint(now) {
  const clock = formatClock(now);
  hmEl.textContent = clock.hm;
  secEl.textContent = clock.sec;
  ampmEl.textContent = clock.ap;
  document.title = `${clock.hm} ${clock.ap} · Time Talker`;

  const progress = halfHourProgress(now);
  progressEl.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));

  const next = nextHalfHour(now);
  const upcoming = phraseFor(next, { includePeriod: state.includePeriod });
  const busy = state.speaking || pendingSpeak;

  if (busy) {
    untilEl.textContent = "Speaking now";
    phraseEl.textContent = state.lastPhrase || upcoming;
  } else if (!state.enabled) {
    untilEl.textContent = "Announcements are off";
    phraseEl.textContent = `Next would be ${formatWhen(next)}`;
  } else {
    untilEl.textContent = `${formatWait(next.getTime() - now.getTime())} until ${formatWhen(next)}`;
    phraseEl.textContent = upcoming;
  }

  if (state.lastSpokenAt && state.lastSpokenAt !== heardAt && state.lastPhrase) {
    heardAt = state.lastSpokenAt;
    liveEl.textContent = state.lastPhrase;
  }
}

async function refresh() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) return;
    state = await response.json();
    syncControls();
  } catch {
    setError("Lost the connection to Time Talker.");
  }
}

async function save(partial) {
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.lastError || "Couldn’t save that.");
      return;
    }
    state = body;
    syncControls();
    return true;
  } catch {
    setError("Couldn’t save that. Is Time Talker still running?");
    return false;
  }
}

async function speakNow() {
  const request = ++speakRequest;
  pendingSpeak = true;
  state = {
    ...state,
    lastPhrase: phraseFor(new Date(), { includePeriod: state.includePeriod }),
  };
  syncControls();
  try {
    const response = await fetch("/api/speak", { method: "POST" });
    const body = await response.json();
    if (request !== speakRequest) return;
    state = body;
    if (!response.ok) setError(body.lastError || "Couldn’t speak just now.");
  } catch {
    if (request === speakRequest) setError("Couldn’t speak just now.");
  } finally {
    if (request === speakRequest) {
      pendingSpeak = false;
      syncControls();
    }
  }
}

toggleEl.addEventListener("click", () => {
  const enabled = toggleEl.getAttribute("aria-checked") !== "true";
  state = { ...state, enabled };
  syncControls();
  save({ enabled });
});

voiceEl.addEventListener("change", async () => {
  const voice = voiceEl.value;
  if (!voice || voice === state.voice) return;
  const saved = await save({ voice });
  if (saved) speakNow();
});

periodEl.addEventListener("change", () => {
  state = { ...state, includePeriod: periodEl.checked };
  save({ includePeriod: periodEl.checked });
});

speakEl.addEventListener("click", () => {
  speakNow();
});

const boot = Promise.all([fetch("/api/state"), fetch("/api/voices")])
  .then(async ([stateResponse, voiceResponse]) => {
    if (!stateResponse.ok || !voiceResponse.ok) throw new Error("Time Talker didn’t answer.");
    state = await stateResponse.json();
    const payload = await voiceResponse.json();
    renderVoices(payload.voices || []);
    syncControls();
  })
  .catch(() => {
    setError("Time Talker didn’t answer.");
  });

function frame() {
  paint(new Date());
  requestAnimationFrame(frame);
}

boot.then(() => {
  requestAnimationFrame(frame);
  setInterval(refresh, 1000);
});
