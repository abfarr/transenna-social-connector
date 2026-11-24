// The page where a client adds photos and logo files to their library.
import { fileUrl, thumbPath, MAX_PHOTOS } from "./files.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function uploadPage({ product, clientName, photos, origin }) {
  const tiles = photos
    .map(
      (p) => `<figure data-path="${esc(p.path)}">
        <img src="${esc(fileUrl(origin, thumbPath(p.path)))}" alt="${esc(p.name)}" loading="lazy">
        <figcaption><span>${esc(p.name)}</span><button type="button" class="del" aria-label="Remove ${esc(p.name)}">Remove</button></figcaption>
      </figure>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(product)} photo library</title>
<style>
:root{--bg:#f7f5f1;--card:#fff;--ink:#1d1b18;--muted:#6b665e;--line:#e4dfd6;--accent:#2f5d50;--accent-ink:#fff;--danger:#a3362b}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--card:#201f1c;--ink:#f1eee8;--muted:#a39d93;--line:#34322d;--accent:#7fb8a6;--accent-ink:#10201b;--danger:#e0857a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;margin:0 0 4px}
p{margin:0 0 16px;color:var(--muted)}
.drop{display:block;border:2px dashed var(--line);border-radius:14px;background:var(--card);padding:32px 16px;text-align:center;cursor:pointer}
.drop.over{border-color:var(--accent)}
.drop strong{display:block;font-size:18px;color:var(--ink);margin-bottom:4px}
.drop input{display:none}
#status{min-height:24px;margin:12px 0 24px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
figure img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:var(--line)}
figcaption{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;font-size:13px}
figcaption span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.del{border:0;background:none;color:var(--danger);font:inherit;cursor:pointer;padding:0}
h2{font-size:18px;margin:0 0 12px}
</style></head>
<body><main>
<h1>Your photo library</h1>
<p>${esc(clientName ? clientName + ": " : "")}add your best photos, product shots, cutouts (PNG with a transparent background) and logo files. Your AI assistant picks from these when it designs your posts. Name files clearly, like "storefront-morning.jpg" or "logo-white.png".</p>
<label class="drop" id="drop"><strong>Choose photos or drop them here</strong>JPG, PNG or WebP. Up to ${MAX_PHOTOS} files.<input id="file" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
<div id="status" role="status"></div>
<h2>In your library (<span id="count">${photos.length}</span>)</h2>
<div class="grid" id="grid">${tiles}</div>
</main>
<script>
const endpoint = location.pathname.replace(/\\/$/, "");
const status = document.getElementById("status");
const drop = document.getElementById("drop");

async function resize(file, maxSide, type, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, type, quality));
  return { blob, width: w, height: h };
}

async function upload(files) {
  let done = 0;
  for (const file of files) {
    status.textContent = "Uploading " + (done + 1) + " of " + files.length + "...";
    try {
      const keepPng = file.type === "image/png";
      const full = await resize(file, 2160, keepPng ? "image/png" : "image/jpeg", 0.9);
      const thumb = await resize(file, 480, "image/jpeg", 0.75);
      const form = new FormData();
      form.append("photo", full.blob, file.name);
      form.append("thumb", thumb.blob, "thumb.jpg");
      form.append("name", file.name);
      form.append("width", full.width);
      form.append("height", full.height);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");
      done++;
    } catch (e) {
      status.textContent = file.name + ": " + e.message;
      return;
    }
  }
  status.textContent = "Added " + done + (done === 1 ? " photo." : " photos.");
  setTimeout(() => location.reload(), 600);
}

document.getElementById("file").addEventListener("change", (e) => upload([...e.target.files]));
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => upload([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))));

document.getElementById("grid").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("del")) return;
  const fig = e.target.closest("figure");
  e.target.disabled = true;
  const res = await fetch(endpoint + "/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: fig.dataset.path }) });
  if (res.ok) { fig.remove(); const c = document.getElementById("count"); c.textContent = Number(c.textContent) - 1; }
  else { e.target.disabled = false; status.textContent = "Couldn't remove that photo. Try again."; }
});
</script>
</body></html>`;
}
