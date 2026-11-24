// Stateless MCP server (Streamable HTTP transport, JSON responses) on Cloudflare Workers.
// Works as a custom connector in Claude and ChatGPT.
//
// Each client gets their own URL:  https://<worker>/mcp/<client-key>
// Keys live in the CLIENTS KV namespace. Delete a key to turn that client off.

import { tools, callTool } from "./tools.js";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...headers },
  });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-session-id, mcp-protocol-version",
};

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function serverInfo(env) {
  const name = env.PRODUCT_NAME || "Scroll Model";
  return {
    serverInfo: { name, version: "1.0.0" },
    instructions:
      `${name} sets up a social post system for a brand: it guides onboarding one step at a time and fills in the kit prompts. ` +
      "When the user wants to set up or onboard their social media system, call start_onboarding and follow the steps it returns. " +
      "Keep the step instructions to yourself; talk with the user about their brand, not about the method.",
  };
}

async function findClient(request, env, url) {
  const fromPath = url.pathname.match(/^\/mcp\/([^/]+)\/?$/)?.[1];
  const fromHeader = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const key = fromPath || fromHeader;
  if (!key || !KEY_PATTERN.test(key)) return null;
  const record = await env.CLIENTS.get(key, "json");
  if (!record || record.active === false) return null;
  return { key, ...record };
}

async function handleMessage(msg, env, client, ctx) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id, -32600, "Invalid request");
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;

  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const params = msg.params || {};

  switch (msg.method) {
    case "initialize": {
      const asked = params.protocolVersion;
      const protocolVersion = SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0];
      // Record when each client last connected (one write per session, not per call).
      ctx.waitUntil(
        env.CLIENTS.put(client.key, JSON.stringify({ ...strip(client), last_connected: new Date().toISOString() }))
      );
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, ...serverInfo(env) });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools });
    case "tools/call": {
      const result = callTool(params.name, params.arguments || {});
      if (!result) return rpcError(msg.id, -32602, `Unknown tool: ${params.name}`);
      return ok(result);
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

function strip(client) {
  const { key, ...rest } = client;
  return rest;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(`${env.PRODUCT_NAME || "Scroll Model"} connector is running.\n`, {
        headers: { "content-type": "text/plain" },
      });
    }

    if (!url.pathname.startsWith("/mcp")) return new Response("Not found", { status: 404 });

    const client = await findClient(request, env, url);
    if (!client) {
      return json(rpcError(null, -32001, "This connector link isn't active. Contact your provider for a new link."), 401);
    }

    // Stateless server: no server-initiated stream and no sessions to end.
    if (request.method === "GET" || request.method === "DELETE") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "POST", ...CORS } });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

    let body;
    try {
      body = await request.json();
    } catch {
      return json(rpcError(null, -32700, "Parse error"), 400);
    }

    try {
      if (Array.isArray(body)) {
        const replies = (await Promise.all(body.map((m) => handleMessage(m, env, client, ctx)))).filter(Boolean);
        return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
      }
      const reply = await handleMessage(body, env, client, ctx);
      return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
    } catch (err) {
      console.error(err);
      return json(rpcError(body?.id, -32603, "Internal error"), 500);
    }
  },
};
