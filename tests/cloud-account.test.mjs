import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, modules) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, process: { env: {} }, require: (name) => modules[name] ?? require(name) });
  return exports;
}
const preferenceHelpers = compile("../src/lib/preferences.ts", {});
const helper = compile("../src/lib/email-account-server.ts", {
  "@/lib/supabase/env": { holdSupabaseUrl: () => "https://example.supabase.co", holdSupabaseAnonKey: () => "test-key" },
  "next/headers": {}, "./cookies": { EMAIL_COOKIE: "hold_email" },
});
function routes({ data = [], error = null, guest = false } = {}) {
  const calls = [];
  const mock = {
    ...helper,
    emailAccountDatabase: async () => guest ? { error: Response.json({ error: "Sign in" }, { status: 401 }) } : {
      email: "ada@example.com",
      supabase: { rpc: async (fn, args) => { calls.push({ fn, args }); return { data, error }; } },
    },
  };
  return {
    calls,
    preferences: compile("../src/app/api/account/preferences/route.ts", { "@/lib/email-account-server": mock, "@/lib/preferences": preferenceHelpers }),
    commitments: compile("../src/app/api/commitments/route.ts", { "@/lib/email-account-server": mock }),
    name: compile("../src/app/api/account/name/route.ts", { "@/lib/email-account-server": mock }),
  };
}
const id = "12345678-1234-1234-1234-123456789abc";
function request(body) {
  return new Request("http://localhost/api/commitments", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

test("commitments load for the cookie account and requested day", async () => {
  const { commitments, calls } = routes({ data: [{ id, title: "Read" }] });
  const response = await commitments.GET(new Request("http://localhost/api/commitments?day=2026-11-23&email=other@example.com"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls[0].args.target_email, "ada@example.com");
  assert.equal(calls[0].args.target_day, "2026-11-23");
  assert.equal((await response.json()).commitments[0].id, id);
});

test("all mutations scope the item to the cookie email and day", async () => {
  for (const operation of ["add", "update", "delete"]) {
    const { commitments, calls } = routes();
    const response = await commitments.POST(request({ operation, id, day: "2026-11-23", title: " Read ", done: true, email: "other@example.com" }));
    assert.equal(response.status, 200);
    assert.equal(calls[0].args.target_email, "ada@example.com");
    assert.equal(calls[0].args.target_day, "2026-11-23");
    assert.equal(calls[0].args.item_id, id);
    assert.equal(calls[0].args.operation, operation);
  }
});

test("bad dates, IDs, titles and done values never reach the database", async () => {
  const { commitments, calls } = routes();
  for (const changes of [{ day: "2026-02-30" }, { id: "bad" }, { title: " " }, { title: "x".repeat(121) }, { dueAt: "not-a-date" }, { dueAt: 123 }, { operation: "update", done: "true" }]) {
    const response = await commitments.POST(request({ day: "2026-11-23", id, title: "Read", operation: "add", ...changes }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 0);
});

test("display name updates use the current account and leave cookie writes to the active client", async () => {
  const { name, calls } = routes({ data: { name: "New name" } });
  const response = await name.PATCH(request({ name: " New name ", email: "other@example.com" }));
  assert.equal(response.status, 200);
  assert.equal(calls[0].args.target_email, "ada@example.com");
  assert.equal(calls[0].args.target_name, "New name");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await response.json()).name, "New name");
});

test("guests cannot use cloud operations and failed loads do not become empty success", async () => {
  const guest = routes({ guest: true });
  assert.equal((await guest.name.PATCH(request({ name: "Ada" }))).status, 401);
  assert.equal((await guest.commitments.GET(new Request("http://localhost/api/commitments?day=2026-11-23"))).status, 401);
  const failed = routes({ error: { code: "PGRST202", message: "Missing function" } });
  const response = await failed.commitments.GET(new Request("http://localhost/api/commitments?day=2026-11-23"));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /migration/);
});


test("deadline is optional and timezone offsets become a single UTC instant", async () => {
  for (const dueAt of [undefined, null, "2026-11-24T10:30:00+01:00"]) {
    const { commitments, calls } = routes();
    const response = await commitments.POST(request({ operation: "add", id, day: "2026-11-23", title: "Read", dueAt }));
    assert.equal(response.status, 200);
    assert.equal(calls[0].args.item_due_at, dueAt ? "2026-11-24T09:30:00.000Z" : null);
  }
});


test("preferences load from the cookie profile without caching", async () => {
  const settings = { cadence: "quarter", intensity: "annoying", includePeriod: false, enabled: false };
  const { preferences, calls } = routes({ data: settings });
  const response = await preferences.GET();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).settings, settings);
  assert.equal(calls[0].args.target_email, "ada@example.com");
  assert.deepEqual(Object.keys(calls[0].args.changes), []);
});

test("preferences save only changed fields and reject invalid payloads", async () => {
  const { preferences, calls } = routes({ data: {} });
  assert.equal((await preferences.PATCH(request({ enabled: false }))).status, 200);
  assert.equal(calls[0].args.changes.enabled, false);
  assert.deepEqual(Object.keys(calls[0].args.changes), ["enabled"]);
  for (const body of [null, [], {}, { cadence: "minute" }, { intensity: null }, { enabled: "false" }, { email: "other@example.com" }]) {
    assert.equal((await preferences.PATCH(request(body))).status, 400);
  }
  assert.equal(calls.length, 1);
});

test("guest preference requests are rejected and storage errors remain visible", async () => {
  assert.equal((await routes({ guest: true }).preferences.GET()).status, 401);
  const response = await routes({ error: { code: "PGRST202", message: "Missing migration" } }).preferences.GET();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /migration/);
});
