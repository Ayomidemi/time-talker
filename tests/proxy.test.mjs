import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const exports = {};
const code = ts.transpileModule(readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(code, { exports, URL, require: (name) => name === "@/lib/cookies" ? { NAME_COOKIE: "hold_name" } : require(name) });

function request(path, cookie = "") {
  return exports.proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
}

test("logged-out visitors can load fonts and reach onboarding", () => {
  for (const path of ["/fonts/manrope-5.woff2", "/fonts/syne-2.woff2", "/login", "/api/account/enter"]) {
    assert.equal(request(path).status, 200);
  }
  assert.equal(request("/today").headers.get("location"), "http://localhost/login");
});

test("saved profiles enter the app even with a legacy pending cookie", () => {
  assert.equal(request("/today", "hold_name=Ada; hold_pending=1").status, 200);
  assert.equal(request("/login", "hold_name=Ada").headers.get("location"), "http://localhost/");
});
