// End-to-end test: runs the Worker locally with `wrangler dev` and talks to it
// with the official MCP client, the same way Claude or ChatGPT would.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = "test_key_0123456789abcdef";
const PAUSED = "paused_key_0123456789abcd";
let dev;

const kvPut = (key, value) =>
  execFileSync("npx", ["wrangler", "kv", "key", "put", key, JSON.stringify(value), "--binding", "CLIENTS", "--local"], {
    stdio: "ignore",
  });

before(async () => {
  kvPut(KEY, { client: "Test Bakery", active: true });
  kvPut(PAUSED, { client: "Paused Co", active: false });
  dev = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler dev did not start");
});

after(() => {
  try { process.kill(-dev.pid); } catch {}
});

async function connect(key = KEY) {
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp/${key}`)));
  return client;
}
const textOf = (r) => r.content.map((c) => c.text).join("");

test("lists the three tools, all read-only", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["build_kit_prompt", "get_onboarding_step", "start_onboarding"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  assert.match(client.getInstructions(), /start_onboarding/);
  await client.close();
});

test("onboarding is served one step at a time", async () => {
  const client = await connect();
  const start = textOf(await client.callTool({ name: "start_onboarding", arguments: {} }));
  assert.match(start, /Step 1 of 5/);
  assert.doesNotMatch(start, /Step 2 of 5/);
  for (const step of [2, 3, 4, 5]) {
    const t = textOf(await client.callTool({ name: "get_onboarding_step", arguments: { step } }));
    assert.match(t, new RegExp(`Step ${step} of 5`));
  }
  const bad = await client.callTool({ name: "get_onboarding_step", arguments: { step: 9 } });
  assert.equal(bad.isError, true);
  await client.close();
});

test("fills the Step 1 prompt with no blanks left", async () => {
  const client = await connect();
  const r = await client.callTool({
    name: "build_kit_prompt",
    arguments: { prompt: "voice_guide", name: "Crumb & Co", your_name: "Dana", account_type: "sells", website: "https://crumb.example", sells_ctas: "order online, DM to order" },
  });
  const t = textOf(r);
  assert.match(t, /posts for Crumb & Co, my business\. You'll write as me, Dana,/);
  assert.match(t, /My website is https:\/\/crumb\.example\./);
  assert.match(t, /ACCOUNT TYPE: SELLS/);
  assert.match(t, /CTAs: order online, DM to order\./);
  assert.match(t, /Make it look like Crumb & Co/);
  assert.doesNotMatch(t, /\{\{|\[Your name\]|\[URL|\[paste one/);
  assert.doesNotMatch(t, /ACCOUNT TYPE: TEACHES/);
  await client.close();
});

test("asks for missing fields instead of guessing", async () => {
  const client = await connect();
  const r = await client.callTool({ name: "build_kit_prompt", arguments: { prompt: "voice_guide", name: "X" } });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /Missing your_name, account_type, website/);
  await client.close();
});

test("fills the other prompts", async () => {
  const client = await connect();
  const call = (args) => client.callTool({ name: "build_kit_prompt", arguments: args }).then(textOf);
  assert.match(await call({ prompt: "brand_existing", brand_materials: "logo.png, https://x.example" }), /giving you: logo\.png, https:\/\/x\.example\./);
  assert.match(await call({ prompt: "brand_new" }), /I don't have a brand yet/);
  assert.match(await call({ prompt: "design_system" }), /Text slots/);
  assert.match(await call({ prompt: "project_instructions", name: "Ivy Studio", your_name: "Ivy" }), /for Ivy Studio as Ivy.*paste your design system link/s);
  assert.match(await call({ prompt: "template_index", name: "Ivy Studio" }), /Every saved template for Ivy Studio/);
  await client.close();
});

test("rejects unknown and paused keys", async () => {
  for (const key of ["not_a_real_key_000000000", PAUSED]) {
    const res = await fetch(`${BASE}/mcp/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(res.status, 401);
  }
});

test("also accepts the key as a bearer token", async () => {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).result.tools.length, 3);
});
