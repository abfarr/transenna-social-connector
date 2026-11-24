# Rendering approved posts to PNG

Do this in your own code sandbox (in Claude: "Code execution and file creation"). The connector doesn't render or store anything; the files stay with the user. If you have no sandbox, tell the user to turn on code execution in their AI app's settings, and stop.

Only render a design the user has approved.

## 1. Photos

- Use the user's image files: the ones attached in this chat, or in this project's files if your sandbox can read them.
- If a photo you chose isn't in your sandbox, ask the user to attach it to this chat. Never swap in a different photo without saying so, and never invent one.
- Stock photos only if the Voice and Content Guide allows them. Get them through the Unsplash connector, save the image file into your sandbox, and credit the photographer in the assumptions line.
- Crop out screenshot leftovers (app buttons, carousel arrows, page dots) before using a photo.

## 2. Fonts

- Use the fonts in the user's design system. If the user attached brand font files, use those.
- Google's font CDN (fonts.googleapis.com) is usually blocked in the sandbox. Download the font files from Google's font repository on GitHub instead: list the folder with `https://api.github.com/repos/google/fonts/contents/ofl/<familyname>` (family name in lowercase, no spaces; a few families live under `apache/` or `ufl/` instead of `ofl/`), then download the files you need from `https://raw.githubusercontent.com/google/fonts/main/...`.
- Load them with `@font-face` from the local files.
- If you can't download a font, don't silently fall back to another one. Tell the user and ask them to attach the font files, or to approve a substitute.

## 3. Build the HTML

- One HTML file per slide, at exactly {{width}} x {{height}} px. `html, body { margin: 0; width: {{width}}px; height: {{height}}px; overflow: hidden; }`
- Every image and font loads from a local file. No external requests and no scripts.
- Follow the design system and the guide's safe area: all text, logos and marks at least 72px from every edge.

## 4. Render

- Use Playwright with headless Chromium. If it isn't installed, install it (`pip install playwright`, then `python -m playwright install chromium`; if that download is blocked, install Chromium through apt and point Playwright at it).
- Viewport {{width}} x {{height}}, device scale factor 1. Load the file, wait for `document.fonts.ready` and for every image to finish loading, then screenshot exactly the viewport as PNG.
- Check that each font really loaded with `document.fonts.check()`. If any text fell back to a default font, fix it and render again.

## 5. Check before handing back

- Look at every PNG at full size and at phone size. For a carousel, also make a 3-across grid of the slides and look at that.
- Run the guide's review checks (section 14) and final checklist (section 15). Fix and re-render anything that fails.

## 6. Hand back

- Name files `<brand>-<topic>-01.png`, `-02.png` and so on, and save them where the user can download them. For a carousel, also give one .zip with every slide in order.
- Then hand back as section 14 of the guide says: the files, the caption ready to copy with hashtags at the end, and one line listing assumptions, [CONFIRM] items and what you fixed.
