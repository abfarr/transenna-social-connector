# Deployment and operations

This is the operator's runbook: how the connector was set up, what is live now, and what to do next time. For the guide you send to clients, see [client-setup.md](client-setup.md).

## What's live

| | |
|---|---|
| Worker name | `scroll-model` |
| Worker URL | https://scroll-model.throbbing-haze-7f38.workers.dev |
| Cloudflare account | Transenna's account (the one `npx wrangler whoami` shows) |
| Client store | KV namespace `CLIENTS`, id `9a4ec26196f9482481acf5192b3ec222` (already in `wrangler.toml`) |
| First deployed | 2026-11-24 |

Opening the Worker URL in a browser should say "Scroll Model connector is running."

Client connector links (`.../mcp/<key>`) are secrets. Never commit them or paste them in shared places. Use `npm run client -- list` to see who has access.

## What was done for the first deploy (2026-11-24)

These steps don't need repeating on this account.

1. `npm install`
2. `npx wrangler login`, signed in to the Transenna Cloudflare account.
3. `npx wrangler kv namespace create CLIENTS` created the client store, and its id went into `wrangler.toml`.
4. `npm run deploy` published the Worker.
5. `npm run client -- add "Alexi Test"` created a test client to try the connector in Claude.

Two fixes came out of doing this on Windows:

- `scripts/clients.mjs` now runs Wrangler with the current Node instead of `npx`, which Windows couldn't find from a script.
- `package.json` has an `allowScripts` block so npm runs the install scripts for `esbuild` and `workerd`, which Wrangler needs. If you upgrade Wrangler and `npm install` warns that it skipped install scripts, update the versions listed there.

## Everyday tasks

The examples use PowerShell. In bash, use `export CONNECTOR_URL=...` instead of `$env:CONNECTOR_URL=...`.

**Ship a change** (edited `content/` or `src/`):

```powershell
npm test
npm run deploy
```

Client links stay the same after a redeploy, so clients don't need to do anything.

**Manage clients:**

```powershell
$env:CONNECTOR_URL="https://scroll-model.throbbing-haze-7f38.workers.dev"
npm run client -- add "Client Name"
npm run client -- list
npm run client -- pause <key>
npm run client -- resume <key>
npm run client -- remove <key>
```

If a client's link leaks, `remove` that key and `add` the client again to get a new link.

**Watch live logs** when debugging:

```powershell
npx wrangler tail scroll-model
```

## Setting up on a new machine

1. Install Node 20 or later and Git, then clone the repo.
2. `npm install`
3. `npx wrangler login` and sign in to the Transenna Cloudflare account. Check with `npx wrangler whoami`.
4. Don't create a new KV namespace. The existing id is already in `wrangler.toml`.

## Still to do

- **Cloudflare plugin for Claude Code (optional).** The marketplace was added with `claude plugin marketplace add cloudflare/skills`, but `claude plugin install cloudflare@cloudflare` failed on Claude Code 2.1.63 (the plugin's manifest uses a newer field). After `claude update`, run the install again and then `/reload-plugins`. The connector doesn't need this plugin, because Wrangler is already logged in.
- **`cf` CLI (optional, beta).** Cloudflare's agent setup also offers `npm install -g cf` and `cf auth login`. It's not installed, and this project uses Wrangler anyway.
- **Custom domain (optional).** To serve the connector from your own domain instead of `workers.dev`, add a route or custom domain in the Cloudflare dashboard (Workers → scroll-model → Settings → Domains & Routes). Existing client links use the `workers.dev` address, so they'd need new links if you switch.
