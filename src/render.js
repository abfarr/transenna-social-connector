// Turns post designs (HTML) into PNG files with Cloudflare Browser Rendering.
import puppeteer from "@cloudflare/puppeteer";
import { saveRender, fileUrl } from "./files.js";

export const FORMATS = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};
export const MAX_SLIDES = 10;
const MAX_HTML = 400_000;
const PREVIEW_SCALE = 0.4;

// Wrap a fragment in a page of exactly the right size. Full documents are used as they are.
function toDocument(html, { width, height }) {
  const reset = `<style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}</style>`;
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (m) => m + reset);
  }
  return `<!doctype html><html><head><meta charset="utf-8">${reset}</head><body>${html}</body></html>`;
}

// The designs are plain HTML and CSS. No scripts run, and only https images,
// fonts and stylesheets load, so a design can't reach anything else.
const ALLOWED = new Set(["image", "font", "stylesheet", "media"]);
function guard(page, origin) {
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("data:")) return req.continue();
    if (url.startsWith(`${origin}/files/`)) return req.continue(); // the client's own photo library
    if (url.startsWith("https://") && ALLOWED.has(req.resourceType())) return req.continue();
    return req.abort();
  });
}

export function validateRenderInput(args) {
  const format = FORMATS[args.format || "post"];
  if (!format) return { error: "format must be post, story or square." };
  const slides = Array.isArray(args.slides) ? args.slides : [];
  if (!slides.length) return { error: "Pass at least one slide's HTML in slides." };
  if (slides.length > MAX_SLIDES) return { error: `Render at most ${MAX_SLIDES} slides at a time.` };
  if (slides.some((s) => typeof s !== "string" || !s.trim())) return { error: "Each slide must be an HTML string." };
  if (slides.some((s) => s.length > MAX_HTML)) {
    return { error: "A slide's HTML is too large. Link images by URL instead of embedding them." };
  }
  return { format, slides };
}

export async function renderSlides(env, origin, slides, format) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const results = [];
    for (const [i, html] of slides.entries()) {
      // A fresh page per slide, so one slide's fonts or images can't leak into the next.
      const page = await browser.newPage();
      try {
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        guard(page, origin);
        await page.setViewport({ ...format, deviceScaleFactor: 1 });
        try {
          await page.setContent(toDocument(html, format), { waitUntil: "networkidle0", timeout: 20_000 });
        } catch (err) {
          throw new RenderError(`Slide ${i + 1} didn't finish loading in 20 seconds. Check its image and font links.`);
        }
        const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, ...format } });
        // A small copy for the AI to check its own work at phone size.
        await page.setViewport({ ...format, deviceScaleFactor: PREVIEW_SCALE });
        const preview = await page.screenshot({ type: "jpeg", quality: 70, clip: { x: 0, y: 0, ...format } });
        const path = await saveRender(env, png);
        results.push({ url: fileUrl(origin, path), preview: toBase64(preview) });
      } finally {
        await page.close().catch(() => {});
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

export class RenderError extends Error {}

function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export { toBase64 };
