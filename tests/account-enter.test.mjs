import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/account/enter/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ configured = true, data = null, error = null } = {}) {
  const calls = [];
  const exports = {};
  const modules = {
    "@supabase/supabase-js": {
      createClient: () => ({ rpc: async (...args) => {
        calls.push(args);
        return { data, error };
      } }),
    },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/account": { writeIdentity: (response, identity) => { response.identity = identity; } },
    "@/lib/supabase/server": { isSupabaseConfigured: () => configured },
  };
  vm.runInNewContext(compiled, { exports, require: (name) => modules[name], process: { env: {} } });
  return {
    calls,
    post: (body) => exports.POST(new Request("http://localhost/api/account/enter", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    })),
  };
}

test("guests can enter without a configured database", async () => {
  const { post, calls } = setup({ configured: false });
  const result = await post({ name: " Ada ", email: "" });
  assert.equal(result.status, 200);
  assert.equal(result.body.name, "Ada");
  assert.equal(result.body.next, "/");
  assert.equal(result.identity.pending, false);
  assert.equal(calls.length, 0);
});

test("blank email and name requests the name without setting identity", async () => {
  const { post } = setup();
  const result = await post({ email: "" });
  assert.equal(result.body.needsName, true);
  assert.equal(result.identity, undefined);
});

test("returning email uses the stored name and bypasses name collection", async () => {
  const { post, calls } = setup({ data: { name: "Saved name", needs_name: false } });
  const result = await post({ email: " ADA@Example.com ", name: "Different name" });
  assert.equal(calls[0][1].target_email, "ada@example.com");
  assert.equal(result.body.name, "Saved name");
  assert.equal(result.identity.name, "Saved name");
  assert.equal(result.identity.pending, false);
  assert.equal(result.body.next, "/");
});

test("unknown email asks for name without setting identity", async () => {
  const { post, calls } = setup({ data: { needs_name: true } });
  const result = await post({ email: "new@example.com" });
  assert.equal(result.body.needsName, true);
  assert.equal(result.identity, undefined);
  assert.equal(calls[0][1].target_name, null);
});

test("new email and name create a profile and enter immediately", async () => {
  const { post, calls } = setup({ data: { name: "Ada", needs_name: false } });
  const result = await post({ email: "new@example.com", name: " Ada " });
  assert.equal(calls[0][1].target_name, "Ada");
  assert.equal(result.body.next, "/");
  assert.equal(result.body.email, "new@example.com");
  assert.equal(result.identity.pending, false);
});

test("invalid bodies are rejected before database access", async () => {
  const { post, calls } = setup();
  for (const body of [null, [], { name: 42 }, { email: {} }, { email: "nope" }, { name: "a".repeat(41) }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("database failure never becomes a new account or signed-in profile", async () => {
  for (const config of [{ configured: false }, { error: { message: "Unavailable" } }, { data: {} }]) {
    const result = await setup(config).post({ email: "ada@example.com" });
    assert.ok(result.status >= 500);
    assert.equal(result.identity, undefined);
    assert.equal(result.body.needsName, undefined);
  }
});
