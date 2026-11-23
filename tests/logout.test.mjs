import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup(storageBlocked = false) {
  const calls = [];
  const exports = {};
  const document = {
    get cookie() { return "hold_name=Ada; hold_email=ada%40example.com; sb-old-auth=token"; },
    set cookie(value) { calls.push(["cookie", value]); },
  };
  const source = readFileSync(new URL("../src/lib/logout.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, document,
    require: () => ({ stopSpeech: () => calls.push(["speech"]), stopNotifications: () => calls.push(["notifications"]) }),
    window: {
      localStorage: { clear() { calls.push(["local"]); if (storageBlocked) throw new Error("Blocked"); } },
      sessionStorage: { clear: () => calls.push(["session"]) },
      caches: { keys: async () => ["hold-v1", "old-assets"], delete: async (key) => calls.push(["cache", key]) },
      indexedDB: {
        databases: async () => [{ name: "old-hold" }],
        deleteDatabase: (name) => {
          calls.push(["database", name]);
          const request = {};
          queueMicrotask(() => request.onsuccess());
          return request;
        },
      },
    },
    navigator: { serviceWorker: { getRegistrations: async () => [{
      getNotifications: async () => [{ close: () => calls.push(["push-close"]) }],
      unregister: async () => calls.push(["worker"]),
    }] } },
  });
  return { calls, clear: exports.clearBrowserData };
}

for (const blocked of [false, true]) {
  test(`logout clears storage, cookies, caches and old workers${blocked ? " even when local storage is blocked" : ""}`, async () => {
    const { clear, calls } = setup(blocked);
    await clear();
    for (const kind of ["speech", "notifications", "local", "session", "database", "push-close", "worker"]) {
      assert.ok(calls.some(([action]) => action === kind), kind);
    }
    assert.equal(calls.filter(([action]) => action === "cache").length, 2);
    const cookies = calls.filter(([action]) => action === "cookie");
    assert.equal(cookies.length, 3);
    assert.ok(cookies.every(([, value]) => value.includes("max-age=0")));
  });
}
