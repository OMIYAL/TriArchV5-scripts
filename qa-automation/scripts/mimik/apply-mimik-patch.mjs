#!/usr/bin/env node
/**
 * Applies TriArch annotated-export patch to a local westpoint-io/mimik clone.
 *
 * Usage:
 *   node scripts/mimik/apply-mimik-patch.mjs --mimik-dir C:/path/to/mimik
 *   node scripts/mimik/apply-mimik-patch.mjs --help
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATCHES_DIR = path.join(__dirname, 'patches');

function usage() {
  console.log(`
Apply TriArch Mimik patch (annotated PDF/HTML export)

Usage:
  node scripts/mimik/apply-mimik-patch.mjs --mimik-dir <path>

Options:
  --mimik-dir   Path to mimik repo root (must contain package.json)
  --help        Show this help

After applying:
  cd <mimik-dir> && pnpm install && pnpm build
  Set MIMIK_EXTENSION_PATH to <mimik-dir>/.output/chrome-mv3 in qa-automation/.env
`);
}

function parseArgs(argv) {
  const args = { mimikDir: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--mimik-dir') {
      args.mimikDir = argv[++i];
    } else if (!arg.startsWith('-') && !args.mimikDir) {
      args.mimikDir = arg;
    }
  }
  return args;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function patchPdfExport(content) {
  let next = content;
  let changed = false;

  if (!next.includes("from '@/core/export/render-annotated-screenshot'")) {
    next = next.replace(
      "import { blobToDataUrl, extractDomain, fetchFaviconBase64, formatDate } from '@/core/export/utils';",
      "import { renderAnnotatedScreenshotBlob } from '@/core/export/render-annotated-screenshot';\nimport { blobToDataUrl, extractDomain, fetchFaviconBase64, formatDate } from '@/core/export/utils';",
    );
    changed = true;
  }

  const oldLoopPattern =
    /imgDataUrl = await blobToDataUrl\(screenshot\.blob\)/;
  const newLoopSnippet = `const exportBlob = await renderAnnotatedScreenshotBlob(screenshot, {
          variant: screenshot.bounds ? 'cropped' : 'full',
          mimeType: 'image/jpeg',
          quality: 0.92,
        });
        imgDataUrl = await blobToDataUrl(exportBlob)`;

  if (oldLoopPattern.test(next)) {
    next = next.replace(oldLoopPattern, newLoopSnippet);
    changed = true;
  }

  return { content: next, changed };
}

function patchHtmlExport(content) {
  let next = content;
  let changed = false;

  if (!next.includes("from '@/core/export/render-annotated-screenshot'")) {
    next = next.replace(
      "import { blobToBase64, escapeHtml, extractDomain, fetchFaviconBase64, formatDate } from '@/core/export/utils';",
      "import { renderAnnotatedScreenshotBlob } from '@/core/export/render-annotated-screenshot';\nimport { blobToBase64, escapeHtml, extractDomain, fetchFaviconBase64, formatDate } from '@/core/export/utils';",
    );
    changed = true;
  }

  const oldHtmlPattern = /const b64 = await blobToBase64\(screenshot\.blob\)/;
  const newHtmlSnippet = `const exportBlob = await renderAnnotatedScreenshotBlob(screenshot, {
        variant: screenshot.bounds ? 'cropped' : 'full',
        mimeType: 'image/jpeg',
        quality: 0.92,
      });
      const b64 = await blobToBase64(exportBlob)`;

  if (oldHtmlPattern.test(next)) {
    next = next.replace(oldHtmlPattern, newHtmlSnippet);
    next = next.replace(
      'src="data:${screenshot.mimeType};base64,${b64}"',
      'src="data:image/jpeg;base64,${b64}"',
    );
    changed = true;
  }

  return { content: next, changed };
}

const ZOOM_SCREENSHOT_REPLACEMENT = `import { useEffect, useRef, useState } from 'react';
import { renderAnnotatedScreenshotBlob } from '@/core/export/render-annotated-screenshot';
import type { Screenshot } from '@/core/guides/types';

interface ZoomScreenshotProps {
  screenshot: Screenshot;
  className?: string;
  alt?: string;
  animate?: boolean;
  crop?: boolean;
}

async function renderScreenshot(
  screenshot: Screenshot,
): Promise<{ fullUrl: string; croppedUrl: string } | { fullUrl: string; croppedUrl: null }> {
  const fullBlob = await renderAnnotatedScreenshotBlob(screenshot, {
    variant: 'full',
    mimeType: 'image/webp',
    quality: 0.8,
  });
  const fullUrl = URL.createObjectURL(fullBlob);

  if (!screenshot.bounds) {
    return { fullUrl, croppedUrl: null };
  }

  const croppedBlob = await renderAnnotatedScreenshotBlob(screenshot, {
    variant: 'cropped',
    mimeType: 'image/webp',
    quality: 0.8,
  });
  return { fullUrl, croppedUrl: URL.createObjectURL(croppedBlob) };
}

export default function ZoomScreenshot({`;

function patchZoomScreenshot(content) {
  if (content.includes("from '@/core/export/render-annotated-screenshot'")) {
    return { content, changed: false };
  }
  const marker = 'export default function ZoomScreenshot({';
  const idx = content.indexOf(marker);
  if (idx === -1) {
    throw new Error('Could not find ZoomScreenshot export in mimik/src/ui/sidepanel/ZoomScreenshot.tsx');
  }

  const tail = content.slice(idx);
  return { content: ZOOM_SCREENSHOT_REPLACEMENT + tail.slice(marker.length), changed: true };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }

  const mimikDir = args.mimikDir ? path.resolve(args.mimikDir) : null;
  if (!mimikDir) {
    console.error('Error: --mimik-dir is required.\n');
    usage();
    process.exit(1);
  }

  const pkgPath = path.join(mimikDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`Error: not a mimik repo (missing package.json): ${mimikDir}`);
    process.exit(1);
  }

  const renderSrc = path.join(PATCHES_DIR, 'render-annotated-screenshot.ts');
  const renderDest = path.join(mimikDir, 'src/core/export/render-annotated-screenshot.ts');
  write(renderDest, read(renderSrc));
  console.log(`+ ${path.relative(mimikDir, renderDest)}`);

  const pdfPath = path.join(mimikDir, 'src/core/export/pdf-export.ts');
  const pdf = patchPdfExport(read(pdfPath));
  write(pdfPath, pdf.content);
  console.log(pdf.changed ? `~ ${path.relative(mimikDir, pdfPath)}` : `= ${path.relative(mimikDir, pdfPath)} (no pdf loop changes)`);

  const htmlPath = path.join(mimikDir, 'src/core/export/html-export.ts');
  const html = patchHtmlExport(read(htmlPath));
  write(htmlPath, html.content);
  console.log(html.changed ? `~ ${path.relative(mimikDir, htmlPath)}` : `= ${path.relative(mimikDir, htmlPath)} (no html loop changes)`);

  const zoomPath = path.join(mimikDir, 'src/ui/sidepanel/ZoomScreenshot.tsx');
  const zoom = patchZoomScreenshot(read(zoomPath));
  write(zoomPath, zoom.content);
  console.log(zoom.changed ? `~ ${path.relative(mimikDir, zoomPath)}` : `= ${path.relative(mimikDir, zoomPath)} (already patched)`);

  console.log(`
Patch applied. Next:
  cd ${mimikDir}
  pnpm install
  pnpm build
  Set MIMIK_EXTENSION_PATH=${path.join(mimikDir, '.output/chrome-mv3').replace(/\\\\/g, '/')} in qa-automation/.env
`);
}

main();
