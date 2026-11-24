# transenna-social-connector

A connector-based social post system that works with Claude and ChatGPT.

It's an MCP server on Cloudflare Workers. Clients add it to their AI app as a custom connector, then it walks them through onboarding one step at a time, fills in their copy of the Social Post Prompt Kit, holds their photo library, and turns finished designs into PNG files they can post. The kit and the onboarding method live here on the server; clients only ever see the step they're on and their own filled prompts.

## What the client gets

| Tool | What it does |
|---|---|
| `start_onboarding` | Opens onboarding and returns step 1 (ask what they have) |
| `get_onboarding_step` | Returns one step at a time: 2 read their sources, 3 review their socials, 4 fill gaps, 5 hand back the kit |
| `build_kit_prompt` | Returns a kit prompt with their details filled in (Step 1 voice guide, Step 2 brand, Step 3 design system, Step 4 project instructions, Template Index) |
| `get_photo_upload_link` | Gives the client their private photo library page |
| `list_photos` | Lists their library with links and small previews, so the AI can pick photos |
| `render_post` | Turns approved slide designs (HTML) into 1080 x 1350, 1080 x 1920 or 1080 x 1080 PNG download links, with previews the AI checks before handing back |

**Photos.** Posts are built from the client's own photos. They upload them once on their photo library page (`/upload/<their key>`), which shrinks big files in the browser before upload. If the client says yes during onboarding, the AI may also use Unsplash photos for general scenes through the free Unsplash connector, and credits each one.

**What's stored.** Their brief, captions and filled prompts live in their own project. This server stores their photo library and the images it renders, in an R2 bucket. Photo and download links use a hash, never the client's key.

**Rendering safety.** Designs render with scripts turned off, and only https images, fonts and stylesheets (plus the client's own library) can load. Each client can render up to `RENDER_DAILY_LIMIT` images a day (60 by default, set in `wrangler.toml`).

## Where things live

```
content/onboarding/   onboarding steps (overview + steps 1 to 5)
content/kit/          the kit prompts, with {{placeholders}} the server fills
src/tools.js          the tools
src/render.js         turns designs into PNGs (Cloudflare Browser Rendering)
src/files.js          photo library and rendered files (R2)
src/upload-page.js    the client's photo library page
src/index.js          the MCP server and per-client access check
scripts/clients.mjs   add, list, pause, resume and remove clients
docs/client-setup.md  the guide you send to clients
tests/                end-to-end test using the official MCP client
```

To change what clients see, edit the Markdown in `content/` and deploy again.

## First deploy (once)

You need Node 20 or later and your Cloudflare account.

```bash
npm install
npx wrangler login                        # opens a browser to sign in to Cloudflare
npx wrangler kv namespace create CLIENTS  # prints an id
```

Paste that id into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`. Then create the storage bucket for photos and rendered posts:

```bash
npx wrangler r2 bucket create scroll-model-files
```

Optional but worth it: in the Cloudflare dashboard, open **R2 → scroll-model-files → Settings → Object lifecycle rules** and add a rule that deletes objects with the prefix `r/` after 30 days. That clears old rendered posts and leaves photo libraries alone. Then:

```bash
npm run deploy
```

It prints your Worker URL, like `https://scroll-model.<you>.workers.dev`. Opening it in a browser should say the connector is running.

## Adding a client

```bash
export CONNECTOR_URL=https://scroll-model.<you>.workers.dev
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

`remove` deletes the key but not the client's photos. To delete those too, remove the `p/` and `t/` folders for that client in the R2 bucket.

Anyone with a client's URL can use it, so treat it like a password. If one leaks, remove that key and add the client again to get a new URL.

## Testing

```bash
npm test
```

Starts the Worker locally and runs the tools through the official MCP client, the same way Claude or ChatGPT would call them. The render test starts a local Chrome (downloaded on first run). Chrome won't start as the root user, so run tests as a normal user.

To try it in Claude yourself before a client does, add a client for yourself and add that URL as a custom connector.

## Costs

- **Workers Paid ($5 a month)** covers the Worker and KV for this scale.
- **Browser Rendering** (for `render_post`) is billed by browser time beyond what the plan includes. Each render call takes a few seconds. Check Cloudflare's current Browser Rendering pricing, and lower `RENDER_DAILY_LIMIT` if you want a tighter cap.
- **R2** charges for storage beyond its free allowance. Photo libraries are small; the lifecycle rule above keeps renders from piling up.

## Limits worth knowing

- Anything a tool returns appears in the client's chat. Serving one step at a time keeps the full method out of view, but a determined client could still ask the AI to repeat a step back.
- The finished prompts (their voice guide and so on) are the client's to keep, since they run them in their own project.
- Rendering is the same in Claude and ChatGPT, since it happens on this server. Design quality still depends on the AI writing a good HTML layout, and it's best in Claude.
- Anyone with a client's upload link can add or remove photos in that library, so it's private like the connector link.
