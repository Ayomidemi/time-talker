import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToString } from "react-dom/server";

const require = createRequire(import.meta.url);

test("server rendering reaches route children without reading browser data", () => {
  const exports = {};
  const browserOnly = () => { throw new Error("Browser data accessed during server rendering"); };
  const mocks = {
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/storage": { loadProfile: browserOnly, loadSettings: browserOnly, loadCommitments: browserOnly, loadCheckIns: browserOnly },
    "@/lib/time": { todayKey: browserOnly },
    "@/lib/types": { DEFAULT_SETTINGS: { cadence: "half", intensity: "gentle", enabled: true, includePeriod: true } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/components/hold-provider.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => mocks[name] ?? (name.startsWith("@/") ? {} : require(name)),
  });
  function RouteChild() {
    const hold = exports.useHold();
    assert.equal(hold.hydrated, false);
    assert.equal(hold.now, null);
    return React.createElement("main", null, "Route shell rendered");
  }
  const html = renderToString(React.createElement(exports.HoldProvider, null, React.createElement(RouteChild)));
  assert.match(html, /<main>Route shell rendered<\/main>/);
});
