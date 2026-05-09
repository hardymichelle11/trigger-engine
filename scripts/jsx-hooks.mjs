// =====================================================================
// Node module-load hook — transforms .jsx via vite's bundled esbuild so
// scripts/test-te-smoke.js can import React component files directly.
// CSS/SVG/image imports are stubbed to empty modules so component-level
// imports of asset files don't crash the loader.
// =====================================================================

import { transformWithOxc } from "vite";
import { fileURLToPath } from "node:url";

const ASSET_RX = /\.(css|svg|png|jpg|jpeg|gif|webp|ico)$/i;

export async function load(url, context, nextLoad) {
  if (ASSET_RX.test(url)) {
    return { format: "module", shortCircuit: true, source: "export default '';" };
  }
  if (url.endsWith(".jsx")) {
    const result = await nextLoad(url, { ...context, format: "module" });
    let source = result.source;
    if (typeof source !== "string") {
      source = Buffer.from(source).toString("utf8");
    }
    const out = await transformWithOxc(source, fileURLToPath(url), {
      lang: "jsx",
      jsx: { runtime: "automatic" },
    });
    return { format: "module", shortCircuit: true, source: out.code };
  }
  return nextLoad(url, context);
}

import { existsSync } from "node:fs";
import { fileURLToPath as ftp } from "node:url";

const TRY_EXTS = [".js", ".jsx", ".mjs", "/index.js", "/index.jsx"];

export async function resolve(specifier, context, nextResolve) {
  // Vite resolves extensionless relative imports like "./tickerCatalog"
  // automatically. Node ESM doesn't — so we replicate that resolution
  // here, only for relative specifiers, only when no extension.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.(js|jsx|mjs|cjs|json|css|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(specifier) &&
    context.parentURL
  ) {
    for (const ext of TRY_EXTS) {
      try {
        const tryUrl = new URL(specifier + ext, context.parentURL).href;
        if (existsSync(ftp(tryUrl))) {
          return nextResolve(specifier + ext, context);
        }
      } catch { /* try next */ }
    }
  }
  return nextResolve(specifier, context);
}
