# transenna-social-connector

A connector-based social post system that works with Claude and ChatGPT.

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
docs/deployment.md    operator runbook: what's live, how it was set up, what's left
tests/                end-to-end test using the official MCP client
```

To change what clients see, edit the Markdown in `content/` and deploy again.

## First deploy (once)

Already done for Transenna's account on 2026-11-24. See [docs/deployment.md](docs/deployment.md) for the live URL, what was set up, and how to work from a new machine. These steps are for a fresh Cloudflare account.

You need Node 20 or later and your Cloudflare account.

```bash
npm install
npx wrangler login                        # opens a browser to sign in to Cloudflare
npx wrangler kv namespace create CLIENTS  # prints an id
```

Paste that id into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`. Change `PRODUCT_NAME` there to your product's name. Then:

```bash
npm run deploy
```

It prints your Worker URL, like `https://scroll-model.<you>.workers.dev`. Opening it in a browser should say the connector is running.

## Adding a client

```bash
export CONNECTOR_URL=https://scroll-model.<you>.workers.dev
npm run client -- add "Client Name"
```

In PowerShell, set the URL with `$env:CONNECTOR_URL="https://scroll-model.<you>.workers.dev"` instead of `export`.

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
