import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function client(response, calls = []) {
  const exports = {};
  const source = readFileSync(new URL("../src/lib/account-client.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, AbortSignal, fetch: async (...args) => { calls.push(args); return response; } });
  return exports;
}

test("logout surfaces a failed request instead of pretending it succeeded", async () => {
  await assert.rejects(client({ ok: false }).logoutAccount(), /Couldn’t log out/);
  await client({ ok: true }).logoutAccount();
});

test("entry rejects a malformed successful response", async () => {
  await assert.rejects(client({ ok: true, json: async () => ({ next: "/", name: "" }) }).enterAccount({}), /outdated sign-in response/);
});


test("shared save sends only a name patch for an existing email profile", async () => {
  const calls = [];
  const api = client({ ok: true, json: async () => ({ name: "New" }) }, calls);
  const result = await api.saveAccountChanges({ name: "Old", email: "ada@example.com" }, { name: " New ", email: "ada@example.com" }, new AbortController().signal);
  assert.equal(result.name, "New");
  assert.equal(calls[0][0], "/api/account/name");
  assert.deepEqual(JSON.parse(calls[0][1].body), { name: "New" });
});

test("shared save adds an email with the name needed for account creation", async () => {
  const calls = [];
  const api = client({ ok: true, json: async () => ({ next: "/", name: "Ada", email: "ada@example.com" }) }, calls);
  await api.saveAccountChanges({ name: "Ada", email: "" }, { name: "Ada", email: " ADA@Example.com " }, new AbortController().signal);
  assert.equal(calls[0][0], "/api/account/enter");
  assert.deepEqual(JSON.parse(calls[0][1].body), { name: "Ada", email: "ada@example.com" });
});

test("shared save keeps guest-only edits local and skips unchanged account requests", async () => {
  const calls = [];
  const api = client({}, calls);
  const guest = await api.saveAccountChanges({ name: "Old", email: "" }, { name: "New", email: "" }, new AbortController().signal);
  assert.equal(guest.name, "New");
  await api.saveAccountChanges({ name: "Ada", email: "ada@example.com" }, { name: " Ada ", email: "ada@example.com" }, new AbortController().signal);
  assert.equal(calls.length, 0);
});
