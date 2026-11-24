# Scroll Model admin guide

Everything needed to run Scroll Model: what's live, how it was set up, how to set it up again on a new computer, and how to add clients and ship changes. Written for Windows and PowerShell, since that's the computer it runs from.

## What's live

| | |
|---|---|
| Worker URL | https://scroll-model.throbbing-haze-7f38.workers.dev |
| Cloudflare account | the Transenna account (Workers Paid, $5 a month) |
| Worker name | `scroll-model` (set in `wrangler.toml`) |
| Client key store | Workers KV namespace `CLIENTS`, id `9a4ec26196f9482481acf5192b3ec222` (in `wrangler.toml`) |
| First deployed | 2026-11-24 |
| Code on your PC | `C:\Users\alexi\VSCodeProjects\transenna-social-connector` |
| Stored about clients | Only their access key, name, and when they last connected. No brand data, photos or posts. |

Opening the Worker URL in a browser should say "Scroll Model connector is running."

## One-time setup on a new computer (Windows)

These are the steps used for the first setup, including the snags we hit.

### 1. Install the tools

1. Install **Node.js LTS** from nodejs.org with the default options. At the end, the installer may open a window offering "Tools for Node.js Native Modules" (Python and Visual Studio Build Tools, about 7 GB). **Close that window without pressing a key.** This project doesn't need them.
2. Install **Git for Windows** from git-scm.com with the defaults. To update an existing Git: `git update-git-for-windows`.
3. Open PowerShell and allow npm's scripts to run (once per Windows account, from any folder):
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
4. Check: `node -v` and `git --version` should both print versions. (First setup: Node v26.13.1, Git 2.56.1.)

### 2. Get the code

```powershell
cd C:\Users\alexi\VSCodeProjects
git clone https://github.com/abfarr/transenna-social-connector
cd transenna-social-connector
npm install
```

Newer npm versions hold back packages' install scripts and print an `install-scripts` warning for `esbuild` and `workerd`. Both are Cloudflare's own build tools, so allow them:

```powershell
npm install-scripts approve esbuild
npm install-scripts approve workerd
npm rebuild esbuild workerd
```

This is recorded in the `allowScripts` block in `package.json`, so a fresh clone shouldn't ask again. If you upgrade Wrangler and `npm install` warns that it skipped install scripts, approve the new versions the same way.

### 3. Connect Cloudflare

```powershell
npx wrangler login     # opens a browser; click Allow
npx wrangler whoami    # confirms which account you're signed in to
```

The `CLIENTS` key store already exists and its id is already in `wrangler.toml`, so **don't create another one**. Only if you ever set up a brand-new Cloudflare account: run `npx wrangler kv namespace create CLIENTS` and put the id it prints into `wrangler.toml`.

Cloudflare's own "set up your AI agent" prompt (developers.cloudflare.com/agent-setup) isn't needed for any of this. It installs general Cloudflare plugins and tools, not this project.

### 4. Deploy

```powershell
npm run deploy
```

It prints the Worker URL. Deploying again later keeps the same URL and every client's link, so clients never need to do anything after an update.

### 5. Connect your own Claude for testing

1. Make a test client (see "Adding a client" below). The first one was "Alexi Test".
2. In Claude, open **Settings → Capabilities** and check **Code execution and file creation** is on. That's how posts become PNG files.
3. **Customize → Connectors → + Add → Add custom connector**. Name it "Scroll Model", paste the `/mcp/...` link, choose **No sign in**, then **Add**.
4. In a Claude project, say "Start my social post onboarding."

## Adding a client (about 2 minutes)

Open the folder in VS Code and use its terminal (Ctrl + `), or in PowerShell:

```powershell
cd C:\Users\alexi\VSCodeProjects\transenna-social-connector
$env:CONNECTOR_URL="https://scroll-model.throbbing-haze-7f38.workers.dev"
npm run client -- add "Client Name"
```

Send the client the `/mcp/...` link it prints, plus `docs/client-setup.md`. Treat the link like a password.

Other client commands:

```powershell
npm run client -- list            # every client and when they last connected
npm run client -- pause <key>     # turn a client off, keep their record
npm run client -- resume <key>
npm run client -- remove <key>    # delete for good
```

The `<key>` is the last part of their link, after `/mcp/`. If a link leaks, `remove` it and `add` the client again for a new link.

## Shipping a change

1. Describe the change in the Social Media Manager project in Claude. Claude edits the repo, tests it, and opens a pull request.
2. Merge the pull request on GitHub.
3. On your PC:
   ```powershell
   cd C:\Users\alexi\VSCodeProjects\transenna-social-connector
   git checkout main
   git pull
   npm run deploy
   ```
   Or ask Claude in the project to run this on your PC.

To check live traffic or errors while debugging: `npx wrangler tail scroll-model`.

What clients see lives in `content/` (onboarding steps, kit prompts, render steps). The server code is in `src/`. `npm test` runs the end-to-end tests (needs a normal, non-root user).

## Decisions

The decision log is in the [README](../README.md#decision-log).

## Possible next steps

- **Custom domain (optional).** To serve the connector from your own domain instead of `workers.dev`, add one in the Cloudflare dashboard under Workers → scroll-model → Settings → Domains & Routes. Existing client links use the `workers.dev` address, so they'd need new links if you switch.
- **Cloudflare plugin for Claude Code (optional, not needed).** During setup, Cloudflare's plugin marketplace was added to Claude Code on the PC, but the plugin install failed on Claude Code 2.1.63. Either run `claude update` and then `claude plugin install cloudflare@cloudflare`, or remove it with `claude plugin marketplace remove cloudflare`. Cloudflare's beta `cf` CLI was not installed.

- Auto-deploy on merge (GitHub Action with a Cloudflare API token saved as a GitHub secret), so step 3 of "Shipping a change" goes away.
- Test with ChatGPT.
- Proper sign-in if link sharing becomes a problem.
