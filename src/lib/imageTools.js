// Turns ANY photo the browser can open (jpg, jpeg, png, webp, gif, heic/heif in Safari) into
// a compressed JPEG (max 1600 px) plus a small JPEG thumbnail (max 400 px).
async function openImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file is not a photo the browser can open"));
    img.src = url;
  });
}
const baseName = (name) => String(name || "photo").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");

export async function prepareImage(file, { full = 1600, thumb = 400 } = {}) {
  const img = await openImage(file);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) throw new Error("Could not read the photo size");
  const make = (max, quality) => new Promise((resolve, reject) => {
    const r = Math.min(1, max / Math.max(W, H));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(W * r)); c.height = Math.max(1, Math.round(H * r));
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress the photo"))), "image/jpeg", quality);
  });
  const [fullBlob, thumbBlob] = [await make(full, 0.78), await make(thumb, 0.7)];
  if (img.close) img.close();
  const base = baseName(file.name);
  return {
    full: new File([fullBlob], base + ".jpg", { type: "image/jpeg" }),
    thumb: new File([thumbBlob], base + "_thumb.jpg", { type: "image/jpeg" }),
  };
}
