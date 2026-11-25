import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("guest history survives loading a later day and updating older items", () => {
  const rows = [
    { id: "old", day: "2026-11-23", title: "Earlier task", done: false },
    { id: "complete", day: "2026-11-24", title: "Finished task", done: true },
    { id: "new", day: "2026-11-25", title: "New task", done: false },
  ];
  const data = new Map([["hold.commitments", JSON.stringify(rows)]]);
  const exports = {};
  const source = readFileSync(new URL("../src/lib/storage.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, {
    exports, require: () => ({}),
    window: { localStorage: { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) } },
  });
  assert.equal(exports.loadCommitments().length, 3);
  exports.saveCommitments(exports.loadCommitments().map((item) => item.id === "old" ? { ...item, done: true } : item));
  const saved = exports.loadCommitments();
  assert.equal(saved.length, 3);
  assert.equal(saved[0].day, "2026-11-23");
  assert.equal(saved[0].done, true);
  exports.saveCommitments(saved.filter((item) => item.id !== "old"));
  assert.equal(exports.loadCommitments().length, 2);
});
