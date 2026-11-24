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

test("lists the tools", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "build_kit_prompt", "get_onboarding_step", "get_photo_upload_link", "list_photos", "render_post", "start_onboarding",
  ]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, t.name !== "render_post");
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
  assert.match(t, /from my photo library \(call list_photos/);
  assert.match(t, /Don't use stock photos\./);
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
  assert.equal((await res.json()).result.tools.length, 6);
});

test("Unsplash is allowed only when the client opts in", async () => {
  const client = await connect();
  const t = textOf(await client.callTool({
    name: "build_kit_prompt",
    arguments: { prompt: "voice_guide", name: "Ivy", your_name: "Ivy", account_type: "creator", website: "none", stock_photos: true },
  }));
  assert.match(t, /Unsplash connector, only for general scenes/);
  assert.doesNotMatch(t, /Don't use stock photos/);
  await client.close();
});

// A real 64x48 PNG, so the upload path sees a real image.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAZUlEQVR4nO3PUQkAIBTAwNfIKhawfw1D+HEIgwW4zTr764YLGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEteOwCB59Ql3yB1XYAAAAASUVORK5CYII=",
  "base64"
);

test("photo library: upload page, upload, list with previews, delete", async () => {
  const page = await fetch(`${BASE}/upload/${KEY}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Your photo library/);
  assert.equal((await fetch(`${BASE}/upload/not_a_real_key_000000000`)).status, 401);

  const form = new FormData();
  form.append("photo", new Blob([PNG], { type: "image/png" }), "cutout.png");
  form.append("thumb", new Blob([PNG], { type: "image/jpeg" }), "thumb.jpg");
  form.append("name", "logo-green.png");
  form.append("width", "64");
  form.append("height", "48");
  const up = await fetch(`${BASE}/upload/${KEY}`, { method: "POST", body: form });
  assert.equal(up.status, 200, await up.clone().text());
  const { path } = await up.json();

  const client = await connect();
  const link = textOf(await client.callTool({ name: "get_photo_upload_link", arguments: {} }));
  assert.match(link, new RegExp(`/upload/${KEY}`));
  const listed = await client.callTool({ name: "list_photos", arguments: {} });
  const listText = listed.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  assert.match(listText, /1 photos in the library/);
  assert.match(listText, /logo-green\.png 64x48 \(PNG, may be a cutout or logo\)/);
  assert.equal(listed.content.filter((c) => c.type === "image").length, 1);
  assert.doesNotMatch(listText, new RegExp(KEY), "the client key must not appear in photo links");

  const photoUrl = listText.match(/https?:\/\/\S+\/files\/p\/\S+/)[0];
  const served = await fetch(photoUrl);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");

  const del = await fetch(`${BASE}/upload/${KEY}/delete`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }),
  });
  assert.equal(del.status, 200);
  assert.match(textOf(await client.callTool({ name: "list_photos", arguments: {} })), /library is empty/);
  await client.close();
});

test("render_post turns HTML slides into PNG downloads with previews", async () => {
  const client = await connect();
  const slide = (bg, words) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body{background:${bg};font:bold 96px sans-serif;color:#fff;display:flex;align-items:center;justify-content:center}
  </style></head><body><div>${words}</div><script>document.body.style.background="red"</script></body></html>`;
  const r = await client.callTool({ name: "render_post", arguments: { slides: [slide("#2f5d50", "Your mornings can be calmer."), slide("#1d1b18", "Here's how.")] } });
  assert.notEqual(r.isError, true, textOf(r));
  const t = r.content[0].text;
  assert.match(t, /Rendered 2 images \(1080x1350 PNG\)/);
  const urls = [...t.matchAll(/Slide \d: (\S+)/g)].map((m) => m[1]);
  assert.equal(urls.length, 2);
  assert.equal(r.content.filter((c) => c.type === "image").length, 2);

  const png = Buffer.from(await (await fetch(urls[0])).arrayBuffer());
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
  await client.close();
});

test("render_post rejects bad input", async () => {
  const client = await connect();
  const none = await client.callTool({ name: "render_post", arguments: { slides: [] } });
  assert.equal(none.isError, true);
  const tooMany = await client.callTool({ name: "render_post", arguments: { slides: Array(11).fill("<p>x</p>") } });
  assert.equal(tooMany.isError, true);
  await client.close();
});
