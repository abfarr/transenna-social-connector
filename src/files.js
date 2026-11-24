// Files in the R2 bucket:
//   r/<id>.png                 rendered posts (download links)
//   p/<client>/<id>.<ext>      a client's photo library
//   t/<client>/<id>.jpg        small previews of those photos
// <client> is a hash of the client's key, so the key itself never appears in a URL.

export const MAX_PHOTOS = 300;
const MAX_UPLOAD = 15 * 1024 * 1024;
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function clientId(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const randomId = () => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
};

export const fileUrl = (origin, path) => `${origin}/files/${path}`;

export async function saveRender(env, png) {
  const path = `r/${randomId()}.png`;
  await env.FILES.put(path, png, { httpMetadata: { contentType: "image/png" } });
  return path;
}

export async function serveFile(env, path) {
  if (!/^(r|p|t)\/[A-Za-z0-9/_.-]+$/.test(path) || path.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await env.FILES.get(path);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=86400");
  headers.set("access-control-allow-origin", "*");
  if (path.startsWith("r/")) headers.set("content-disposition", `inline; filename="post-${path.slice(2)}"`);
  return new Response(obj.body, { headers });
}

export async function listPhotos(env, cid) {
  const photos = [];
  let cursor;
  do {
    const page = await env.FILES.list({ prefix: `p/${cid}/`, include: ["customMetadata"], cursor });
    for (const o of page.objects) photos.push({ path: o.key, uploaded: o.uploaded, ...o.customMetadata });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  photos.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return photos;
}

export const thumbPath = (photoPath) => photoPath.replace(/^p\//, "t/").replace(/\.\w+$/, ".jpg");

export async function savePhoto(env, cid, form) {
  const photo = form.get("photo");
  const thumb = form.get("thumb");
  if (!(photo instanceof File) || !(thumb instanceof File)) return { error: "Missing file." };
  const ext = PHOTO_TYPES[photo.type];
  if (!ext) return { error: "Use JPG, PNG or WebP files." };
  if (photo.size > MAX_UPLOAD || thumb.size > 1024 * 1024) return { error: "That file is too large." };
  if ((await listPhotos(env, cid)).length >= MAX_PHOTOS) return { error: `The library holds up to ${MAX_PHOTOS} photos.` };
  const name = String(form.get("name") || "photo").replace(/[^\w .()-]/g, "").slice(0, 80) || "photo";
  const meta = { name, width: String(form.get("width") || ""), height: String(form.get("height") || ""), type: ext };
  const path = `p/${cid}/${randomId()}.${ext}`;
  await env.FILES.put(path, photo.stream(), { httpMetadata: { contentType: photo.type }, customMetadata: meta });
  await env.FILES.put(thumbPath(path), thumb.stream(), { httpMetadata: { contentType: "image/jpeg" } });
  return { path };
}

export async function deletePhoto(env, cid, path) {
  if (typeof path !== "string" || !path.startsWith(`p/${cid}/`) || path.includes("..")) return false;
  await env.FILES.delete([path, thumbPath(path)]);
  return true;
}
