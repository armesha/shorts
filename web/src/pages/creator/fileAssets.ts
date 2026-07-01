function dataUrlBytes(value: string): number {
  const base64 = value.split(",", 2)[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = dataUrl;
  });
}

export async function prepareCreatorBackground(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error("bad-type");
  }
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImageDataUrl(sourceUrl);
  const sizes = [
    { w: 1080, h: 1920 },
    { w: 900, h: 1600 },
    { w: 720, h: 1280 },
  ];
  const qualities = [0.9, 0.82, 0.74, 0.66];
  let last = sourceUrl;
  for (const size of sizes) {
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = size.w / size.h;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (sourceRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = (image.naturalHeight - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size.w, size.h);
    for (const quality of qualities) {
      const next = canvas.toDataURL("image/jpeg", quality);
      last = next;
      if (dataUrlBytes(next) <= 1.9 * 1024 * 1024) return next;
    }
  }
  return last;
}

export async function prepareCreatorSticker(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error("bad-type");
  }
  const sourceUrl = await readFileAsDataUrl(file);
  if (dataUrlBytes(sourceUrl) <= 1.5 * 1024 * 1024) return sourceUrl;
  const image = await loadImageDataUrl(sourceUrl);
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceUrl;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

export async function prepareCreatorMotionGif(file: File): Promise<string> {
  if (!/^image\/gif$/i.test(file.type) && !/\.gif$/i.test(file.name)) {
    throw new Error("bad-type");
  }
  const dataUrl = await readFileAsDataUrl(file);
  if (!/^data:image\/gif;base64,/i.test(dataUrl)) throw new Error("bad-type");
  if (dataUrlBytes(dataUrl) > 1.8 * 1024 * 1024) throw new Error("too-large");
  return dataUrl;
}

export async function prepareCreatorMusic(file: File): Promise<string> {
  if (!/^audio\/(mpeg|mp3|mp4|m4a|aac|wav|ogg|opus)$/i.test(file.type) && !/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(file.name)) {
    throw new Error("bad-type");
  }
  const dataUrl = await readFileAsDataUrl(file);
  if (!/^data:audio\/(mpeg|mp3|mp4|m4a|aac|wav|ogg|opus);base64,/i.test(dataUrl)) throw new Error("bad-type");
  if (dataUrlBytes(dataUrl) > 7 * 1024 * 1024) throw new Error("too-large");
  return dataUrl;
}
