import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function client(response) {
  const exports = {};
  const source = readFileSync(new URL("../src/lib/account-client.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, AbortSignal, fetch: async () => response });
  return exports;
}

test("logout surfaces a failed request instead of pretending it succeeded", async () => {
  await assert.rejects(client({ ok: false }).logoutAccount(), /Couldn’t log out/);
  await client({ ok: true }).logoutAccount();
});

test("entry rejects a malformed successful response", async () => {
  await assert.rejects(client({ ok: true, json: async () => ({ next: "/", name: "" }) }).enterAccount({}), /outdated sign-in response/);
});
