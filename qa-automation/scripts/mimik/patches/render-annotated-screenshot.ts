/** Mirrors mimik `Screenshot` fields used by export rendering (see westpoint-io/mimik types). */
type ScreenshotBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AnnotatedScreenshotInput = {
  blob: Blob;
  bounds?: ScreenshotBounds;
  pixelRatio?: number;
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function drawRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

export type AnnotatedScreenshotVariant = 'full' | 'cropped';

export type RenderAnnotatedScreenshotOptions = {
  variant?: AnnotatedScreenshotVariant;
  mimeType?: 'image/jpeg' | 'image/webp';
  quality?: number;
};

/** Renders dashed highlight + optional zoom crop (matches sidepanel ZoomScreenshot). */
export async function renderAnnotatedScreenshotBlob(
  screenshot: AnnotatedScreenshotInput,
  options?: RenderAnnotatedScreenshotOptions,
): Promise<Blob> {
  const variant = options?.variant ?? 'cropped';
  const mimeType = options?.mimeType ?? 'image/jpeg';
  const quality = options?.quality ?? 0.92;

  const img = await createImageBitmap(screenshot.blob);
  const imgW = img.width;
  const imgH = img.height;
  const bounds = screenshot.bounds;
  const dpr = screenshot.pixelRatio || 1;

  const fullCanvas = new OffscreenCanvas(imgW, imgH);
  const fullCtx = fullCanvas.getContext('2d')!;
  fullCtx.drawImage(img, 0, 0, imgW, imgH);

  if (!bounds) {
    img.close();
    return fullCanvas.convertToBlob({ type: mimeType, quality });
  }

  const bx = bounds.x * dpr;
  const by = bounds.y * dpr;
  const bw = bounds.width * dpr;
  const bh = bounds.height * dpr;

  fullCtx.strokeStyle = '#4F46E5';
  fullCtx.lineWidth = 3.5;
  fullCtx.setLineDash([8, 5]);
  drawRoundedRect(fullCtx, bx, by, bw, bh, 12);
  fullCtx.setLineDash([]);

  if (variant === 'full') {
    img.close();
    return fullCanvas.convertToBlob({ type: mimeType, quality });
  }

  const PAD_RATIO = 0.3;
  const padH = PAD_RATIO * imgW;
  const padV = PAD_RATIO * imgH;
  const imgAspect = imgW / imgH;
  const elAspect = bw / bh;

  const cx = bx + bw / 2;
  const cy = by + bh / 2;

  let visW = bw + padH;
  let visH = bh + padV;

  if (elAspect > 1) {
    visW = bw + padH;
    visH = visW / imgAspect;
  } else if (elAspect < 1) {
    visH = bh + padV;
    visW = visH * imgAspect;
  }

  visW = Math.min(visW, imgW);
  visH = Math.min(visH, imgH);

  const cropX = clamp(cx - visW / 2, 0, imgW - visW);
  const cropY = clamp(cy - visH / 2, 0, imgH - visH);

  const cropCanvas = new OffscreenCanvas(imgW, imgH);
  const cropCtx = cropCanvas.getContext('2d')!;
  cropCtx.drawImage(img, cropX, cropY, visW, visH, 0, 0, imgW, imgH);

  const scaleX = imgW / visW;
  const scaleY = imgH / visH;
  cropCtx.strokeStyle = '#4F46E5';
  cropCtx.lineWidth = 3.5;
  cropCtx.setLineDash([8, 5]);
  drawRoundedRect(cropCtx, (bx - cropX) * scaleX, (by - cropY) * scaleY, bw * scaleX, bh * scaleY, 12);
  cropCtx.setLineDash([]);

  img.close();
  return cropCanvas.convertToBlob({ type: mimeType, quality });
}
