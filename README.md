# transenna-social-connector

Scroll Model: a connector-based social post system, built for Claude.

**Running it?** See [docs/admin-guide.md](docs/admin-guide.md) for what's live, setup on a new computer (Windows), adding clients, shipping changes, and the decisions so far. Clients get [docs/client-setup.md](docs/client-setup.md).

It's an MCP server on Cloudflare Workers. Clients add it to their AI app as a custom connector, then it walks them through onboarding one step at a time and fills in their copy of the Social Post Prompt Kit. The kit and the onboarding method live here on the server; clients only ever see the step they're on and their own filled prompts.

## What the client gets

Four tools, all read-only:

| Tool | What it does |
|---|---|
| `start_onboarding` | Opens onboarding and returns step 1 (ask what they have) |
| `get_onboarding_step` | Returns one step at a time: 2 read their sources, 3 review their socials, 4 fill gaps, 5 hand back the kit |
| `build_kit_prompt` | Returns a kit prompt with their details filled in (Step 1 voice guide, Step 2 brand, Step 3 design system, Step 4 project instructions, Template Index) |
| `get_render_steps` | Returns the steps for turning an approved design into PNG files in the client's own code sandbox (post, story or square size) |

The server stores nothing about the client. Their brief, captions, filled prompts and photos stay in their own project, and posts are rendered to PNG inside their own AI app: the client's AI builds each slide as HTML and screenshots it with a headless browser in its code sandbox. That needs "Code execution and file creation" turned on in Claude, which it is by default on Pro and Max.

**Stock photos.** If the client says yes during onboarding, the AI may also use Unsplash photos for general scenes through the free Unsplash connector, and credits each one. Their own photos always come first.

## Where things live

```
content/onboarding/   onboarding steps (overview + steps 1 to 5)
content/kit/          the kit prompts, with {{placeholders}} the server fills
content/render.md     the render steps the client's AI follows
src/tools.js          the tools
src/index.js          the MCP server and per-client access check
scripts/clients.mjs   add, list, pause, resume and remove clients
docs/client-setup.md  the guide you send to clients
tests/                end-to-end test using the official MCP client
```

To change what clients see, edit the Markdown in `content/` and deploy again.

## First deploy

The live setup and the full Windows steps are in [docs/admin-guide.md](docs/admin-guide.md). In short: `npm install`, `npx wrangler login`, make sure `wrangler.toml` has your `CLIENTS` KV namespace id (create one with `npx wrangler kv namespace create CLIENTS` only on a new Cloudflare account), then `npm run deploy`.

## Adding a client

```bash
export CONNECTOR_URL=https://scroll-model.throbbing-haze-7f38.workers.dev   # PowerShell: $env:CONNECTOR_URL="..."
npm run client -- add "Client Name"
```

That prints the client's private connector URL. Send it to them with `docs/client-setup.md`.

Other commands:

```bash
npm run client -- list            # every client and when they last connected
npm run client -- pause <key>     # turn a client off (e.g. unpaid), keep their record
npm run client -- resume <key>
npm run client -- remove <key>    # delete for good
```

Anyone with a client's URL can use it, so treat it like a password. If one leaks, remove that key and add the client again to get a new URL.

## Testing

```bash
npm test
```

Starts the Worker locally and runs the tools through the official MCP client, the same way Claude or ChatGPT would call them.

To try it in Claude yourself before a client does, add a client for yourself and add that URL as a custom connector.

## Limits worth knowing

- Anything a tool returns appears in the client's chat. Serving one step at a time keeps the full method out of view, but a determined client could still ask the AI to repeat a step back.
- The finished prompts (their voice guide and so on) are the client's to keep, since they run them in their own project.
- Rendering is tested in Claude. ChatGPT's code tool usually has no internet access, so it can't download fonts and may not have a browser; expect ChatGPT clients to get the copy and concepts but not reliable PNGs until that's tested.
- On Claude Team and Enterprise, network access in the sandbox is off by default, so fonts can't be downloaded. The owner can allow it under Organization settings → Capabilities, or clients can attach their font files.

## Decision log

What we decided while building Scroll Model, and why. Add new decisions here, newest at the bottom, with the date.

_All decided 2026-11-24._

- **Delivery: a connector, not a skill file or a done-for-you service.** The onboarding started as a Claude skill (social-kit-client-onboarding, saved in Alexi's Claude). Clients get it through the connector instead, so it's self-serve and the method isn't handed over.
- **Connector instead of a full app.** Cheap to run, clients use their own Claude subscription, and Claude already handles projects, files and design. Revisit an app after 5 to 10 paying clients if setup friction or copying becomes a problem.
- **Step-at-a-time delivery.** The kit and method stay on the server; clients see only the current step and their own filled prompts. Anything returned does appear in their chat, so this protects the method but doesn't lock it.
- **Per-client links, no sign-in yet.** Each client's link has its own key you can pause or remove. Add proper sign-in (OAuth) only if link sharing becomes a real problem.
- **Nothing stored about clients.** Photos stay in the client's own project. A server-side photo library and renderer were built and then removed for this reason.
- **Rendering happens in the client's Claude.** Claude builds each slide as HTML and renders it to PNG with headless Chromium in its own code sandbox. Google's font CDN is blocked there, so fonts come from Google's font repo on GitHub. Tested in a regular claude.ai chat: worked.
- **Hosting on Cloudflare Workers** (Workers Paid, $5 a month), with client keys in Workers KV. Stateless MCP server, no database.
- **Product name: Scroll Model.**
- **Kit fixes while moving it onto the server:** the Sells account type got the topic, interview, CTA and prop lines it was missing; Step 1 now reads the Client Onboarding Brief and Example Captions first; Step 3's stray "B0" reference was fixed; project instructions end with rendering approved posts to PNG.
- **Admin runs from Alexi's Windows PC** in `C:\Users\alexi\VSCodeProjects\transenna-social-connector`. Cloudflare's general agent setup isn't needed. Its plugin marketplace was added to Claude Code on that PC, but the plugin install failed on Claude Code 2.1.63, so nothing else from it is installed.
- **The KV namespace id is committed in `wrangler.toml`**, since it isn't a secret. Client links are secrets and are never committed.
- **`package.json` keeps `allowScripts` for esbuild and workerd**, which Wrangler needs. Update the versions there when Wrangler is upgraded.
- **The client script runs Wrangler with Node instead of `npx`**, so it works on Windows.
- **Served from the workers.dev address for now.** Moving to a custom domain means giving every client a new link.
- **Unsplash is opt-in.** Only if the client says yes during onboarding, only for general scenes, always credited, and through their own Unsplash connector.
- **Claude first.** ChatGPT can add the connector, but its code tool usually has no internet, so PNG rendering likely won't work there. Not tested yet.
- **Claude Team and Enterprise clients:** the workspace owner must allow sandbox network access for fonts, or the client attaches font files.
- **Suggested pricing (unvalidated):** self-serve $500 setup + $49 a month; done-with-you $1,500 setup + $99 a month; founding discount for the first 5 clients.
