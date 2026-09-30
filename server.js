import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextHalfHour, phraseFor } from "./public/time.js";

const PORT = Number(process.env.PORT) || 4173;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const SETTINGS_PATH = path.join(ROOT, "data", "settings.json");
const LATE_LIMIT_MS = 45_000;

const DEFAULTS = {
  enabled: true,
  voice: "",
  includePeriod: true,
  rate: 175,
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const PREFERRED_VOICES = ["Samantha", "Daniel", "Karen", "Moira"];

function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

function parseVoices(output) {
  const seen = new Set();
  const voices = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^(.+?)\s+([a-z]{2,3}_[A-Za-z0-9]+)\s+#\s*(.*)$/);
    if (!match) continue;
    const name = match[1].trim();
    if (seen.has(name)) continue;
    seen.add(name);
    voices.push({
      name,
      locale: match[2],
      sample: match[3].trim(),
    });
  }
  voices.sort((a, b) => {
    const aEnglish = a.locale.startsWith("en") ? 0 : 1;
    const bEnglish = b.locale.startsWith("en") ? 0 : 1;
    if (aEnglish !== bEnglish) return aEnglish - bEnglish;
    return a.name.localeCompare(b.name);
  });
  return voices;
}

function listVoices() {
  return new Promise((resolve, reject) => {
    const child = spawn("say", ["-v", "?"]);
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(error.trim() || "Could not list voices."));
        return;
      }
      resolve(parseVoices(output));
    });
  });
}

function preferredVoice(available) {
  const localeScore = (locale) => (locale === "en_US" ? 0 : locale === "en_GB" ? 1 : 2);
  for (const wanted of PREFERRED_VOICES) {
    const matches = available.filter((voice) => {
      if (!voice.locale.startsWith("en")) return false;
      return voice.name === wanted || voice.name.startsWith(`${wanted} (`);
    });
    matches.sort((a, b) => localeScore(a.locale) - localeScore(b.locale));
    if (matches.length) return matches[0].name;
  }
  return available.find((voice) => voice.locale.startsWith("en"))?.name || available[0]?.name || "";
}

let settings = loadSettings();
let voices = [];
let speaking = false;
let lastPhrase = null;
let lastSpokenAt = null;
let lastError = null;
let nextAt = null;
let sayProcess = null;
let generation = 0;
let timer = null;
let announcedSlot = "";

function statePayload() {
  return {
    enabled: settings.enabled,
    voice: settings.voice,
    includePeriod: settings.includePeriod,
    rate: settings.rate,
    speaking,
    lastPhrase,
    lastSpokenAt,
    lastError,
    nextAt: nextAt ? nextAt.toISOString() : null,
  };
}

function ensureVoice() {
  if (!voices.length) return;
  const known = voices.some((voice) => voice.name === settings.voice);
  if (!known) {
    settings.voice = preferredVoice(voices);
    saveSettings();
  }
}

function applySettings(input) {
  if (typeof input.enabled === "boolean") settings.enabled = input.enabled;
  if (typeof input.includePeriod === "boolean") settings.includePeriod = input.includePeriod;
  if (typeof input.rate === "number" && Number.isFinite(input.rate)) {
    settings.rate = Math.min(220, Math.max(120, Math.round(input.rate)));
  }
  if (typeof input.voice === "string" && voices.some((voice) => voice.name === input.voice)) {
    settings.voice = input.voice;
  }
  saveSettings();
}

function runSay(text) {
  return new Promise((resolve, reject) => {
    if (sayProcess) sayProcess.kill();
    const child = spawn("say", ["-v", settings.voice, "-r", String(settings.rate), text]);
    sayProcess = child;
    child.on("error", (error) => {
      if (sayProcess === child) sayProcess = null;
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (sayProcess === child) sayProcess = null;
      if (signal) resolve(false);
      else if (code === 0) resolve(true);
      else reject(new Error(`Speech stopped (${code}).`));
    });
  });
}

async function announce(text) {
  const id = ++generation;
  speaking = true;
  lastPhrase = text;
  lastError = null;
  try {
    const finished = await runSay(text);
    if (id !== generation) return false;
    if (finished) lastSpokenAt = new Date().toISOString();
    return finished;
  } catch (error) {
    if (id === generation) lastError = error.message;
    throw error;
  } finally {
    if (id === generation) speaking = false;
  }
}

function slotId(date) {
  return [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()].join("-");
}

function arm() {
  clearTimeout(timer);
  const target = nextHalfHour(new Date());
  nextAt = target;
  const delay = Math.max(0, target.getTime() - Date.now());
  const when = target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  console.log(`Next announcement at ${when}${settings.enabled ? "" : " (paused)"}`);
  const chime = async () => {
    const late = Date.now() - target.getTime();
    if (late < -250) {
      timer = setTimeout(chime, -late);
      return;
    }
    const slot = slotId(target);
    if (settings.enabled && late < LATE_LIMIT_MS && announcedSlot !== slot) {
      announcedSlot = slot;
      const text = phraseFor(target, settings);
      console.log(`Announcing: ${text}`);
      try {
        await announce(text);
      } catch (error) {
        console.error(error.message);
      }
    } else if (settings.enabled && late >= LATE_LIMIT_MS) {
      console.log(`Skipped a late chime (${Math.round(late / 1000)}s late).`);
    }
    arm();
  };
  timer = setTimeout(chime, delay);
}

function watchClock() {
  setInterval(() => {
    if (!nextAt) return;
    if (Date.now() - nextAt.getTime() > LATE_LIMIT_MS) arm();
  }, 15_000);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10_000) {
        reject(new Error("Request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("That was not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, requested));
  const relative = path.relative(PUBLIC_DIR, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, contents) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500).end();
      return;
    }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    res.end(contents);
  });
}

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, statePayload());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/voices") {
      sendJson(res, 200, { voices });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      applySettings(await readJson(req));
      sendJson(res, 200, statePayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/speak") {
      if (!settings.voice) {
        sendJson(res, 503, { ...statePayload(), lastError: "No speaking voice is available." });
        return;
      }
      const text = phraseFor(new Date(), settings);
      console.log(`Announcing: ${text}`);
      await announce(text);
      sendJson(res, 200, statePayload());
      return;
    }
    if (req.method === "GET") {
      serveStatic(res, decodeURIComponent(url.pathname));
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 400, { ...statePayload(), lastError: error.message });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other Time Talker, or run with PORT=4174 npm start.`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

try {
  voices = await listVoices();
} catch (error) {
  console.error(error.message);
}

ensureVoice();

server.listen(PORT, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${PORT}`;
  console.log(`Time Talker is running at ${address}`);
  arm();
  watchClock();
  if (process.env.TIME_TALKER_OPEN !== "0") {
    exec(`open "${address}"`);
  }
});

process.on("SIGINT", () => {
  clearTimeout(timer);
  if (sayProcess) sayProcess.kill();
  process.exit(0);
});
process.on("SIGTERM", () => {
  clearTimeout(timer);
  if (sayProcess) sayProcess.kill();
  process.exit(0);
});
