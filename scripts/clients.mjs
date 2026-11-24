#!/usr/bin/env node
// Manage client access to the connector.
//
//   npm run client -- add "Client Name"     create a key and print the client's connector URL
//   npm run client -- list                  list every client and when they last connected
//   npm run client -- pause <key>           turn a client off but keep their record
//   npm run client -- resume <key>          turn a paused client back on
//   npm run client -- remove <key>          delete a client's key for good
//
// Add --local to work against the local dev store instead of Cloudflare.
// Set CONNECTOR_URL (e.g. https://social-post-connector.you.workers.dev) to print full links.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const local = args.includes("--local");
const [cmd, arg] = args.filter((a) => a !== "--local");
const where = local ? "--local" : "--remote";
const base = (process.env.CONNECTOR_URL || (local ? "http://localhost:8787" : "https://<your-worker-url>")).replace(/\/$/, "");

// Run wrangler's own script with this Node, so it works the same on Windows, Mac and Linux
// (no shell, so the JSON values aren't mangled by quoting rules).
const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

function wrangler(...rest) {
  return execFileSync(process.execPath, [WRANGLER, "kv", ...rest, "--binding", "CLIENTS", where], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}
const get = (key) => JSON.parse(wrangler("key", "get", key, "--text"));
const put = (key, value) => wrangler("key", "put", key, JSON.stringify(value));

switch (cmd) {
  case "add": {
    if (!arg) throw new Error('Give the client a name: npm run client -- add "Client Name"');
    const key = randomBytes(24).toString("base64url");
    put(key, { client: arg, active: true, created: new Date().toISOString() });
    console.log(`\nAdded ${arg}.\nConnector URL: ${base}/mcp/${key}\n`);
    break;
  }
  case "list": {
    const keys = JSON.parse(wrangler("key", "list"));
    if (!keys.length) console.log("No clients yet.");
    for (const { name } of keys) {
      const c = get(name);
      console.log(`${c.active === false ? "paused" : "active"}  ${c.client}  last connected: ${c.last_connected || "never"}\n        ${base}/mcp/${name}`);
    }
    break;
  }
  case "pause":
  case "resume": {
    if (!arg) throw new Error(`Usage: npm run client -- ${cmd} <key>`);
    const c = get(arg);
    put(arg, { ...c, active: cmd === "resume" });
    console.log(`${cmd === "pause" ? "Paused" : "Resumed"} ${c.client}.`);
    break;
  }
  case "remove": {
    if (!arg) throw new Error("Usage: npm run client -- remove <key>");
    wrangler("key", "delete", arg);
    console.log("Removed.");
    break;
  }
  default:
    console.log("Commands: add, list, pause, resume, remove. See the top of scripts/clients.mjs.");
}
