// Build the judge-facing site served by the Worker as static assets: / (landing) and /demo.
//   node site/build.mjs   → site/dist
// Script and stylesheet URLs get a content hash (?v=…), so a redeploy is never hidden by a browser cache.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("site/dist", { recursive: true, force: true });
mkdirSync("site/dist/demo", { recursive: true });
cpSync("site/static", "site/dist", { recursive: true });
await build({
  entryPoints: { "demo/demo": "site/src/demo.ts" },
  outdir: "site/dist",
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  define: { __DEV__: "false" },
  logLevel: "warning",
});
const v = (f) => createHash("sha256").update(readFileSync(`site/dist/${f}`)).digest("hex").slice(0, 10);
const assets = { "/demo/demo.js": v("demo/demo.js"), "/site.css": v("site.css") };
for (const page of ["index.html", "demo/index.html"]) {
  let html = readFileSync(`site/dist/${page}`, "utf8");
  for (const [path, hash] of Object.entries(assets)) html = html.replaceAll(`"${path}"`, `"${path}?v=${hash}"`);
  writeFileSync(`site/dist/${page}`, html);
}
console.log("site built → site/dist", assets);
