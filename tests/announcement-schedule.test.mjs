import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function compile(file, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Date, require: (name) => modules[name] });
  return exports;
}
const time = compile("../src/lib/time.ts");
const { AnnouncementSchedule } = compile("../src/lib/announcement-schedule.ts", { "./time": time });
const at = (hours, minutes, seconds = 0) => new Date(2026, 10, 25, hours, minutes, seconds);

test("half-hour schedule speaks once at :30 and again at :00", () => {
  const schedule = new AnnouncementSchedule();
  assert.equal(schedule.due(at(10, 20), "half"), null);
  const first = schedule.due(at(10, 30), "half");
  assert.equal(first.getTime(), at(10, 30).getTime());
  assert.equal(schedule.due(at(10, 30, 1), "half"), null);
  schedule.settled(first, true, at(10, 30, 2).getTime());
  assert.equal(schedule.due(at(10, 45), "half"), null);
  assert.equal(schedule.due(at(11, 0), "half").getTime(), at(11, 0).getTime());
});

test("a delayed tab tick no longer misses the 45-second announcement window", () => {
  const schedule = new AnnouncementSchedule();
  schedule.due(at(10, 29), "half");
  assert.equal(schedule.due(at(10, 32), "half").getTime(), at(10, 30).getTime());
});

test("failed speech retries without overlapping utterances", () => {
  const schedule = new AnnouncementSchedule();
  const due = schedule.due(at(10, 30), "half");
  schedule.settled(due, false, at(10, 30).getTime());
  assert.equal(schedule.due(at(10, 30, 14), "half"), null);
  assert.equal(schedule.due(at(10, 30, 15), "half").getTime(), due.getTime());
  assert.equal(schedule.due(at(10, 30, 16), "half"), null);
});

test("returning after multiple intervals speaks only the latest boundary", () => {
  const schedule = new AnnouncementSchedule();
  schedule.due(at(10, 20), "half");
  assert.equal(schedule.due(at(12, 4), "half").getTime(), at(12, 0).getTime());
});

test("disabled speech stays off and quarter-hour settings use :15 boundaries", () => {
  const schedule = new AnnouncementSchedule();
  assert.equal(schedule.due(at(10, 30), "off"), null);
  assert.equal(schedule.due(at(10, 40), "quarter"), null);
  assert.equal(schedule.due(at(10, 45), "quarter").getTime(), at(10, 45).getTime());
});
