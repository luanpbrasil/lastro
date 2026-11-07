// Build the extension into extension/dist (load it unpacked from there).
//   node extension/build.mjs [--watch] [--prod] [--worker https://lastro.example.workers.dev]
import { context, build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const prod = args.includes("--prod");
const wi = args.indexOf("--worker");
const worker = wi >= 0 ? args[wi + 1] : "http://127.0.0.1:8787";

// Dev build (debug line, sourcemaps) → extension/dist. Demo build (--prod: no debug line, minified) → extension/dist-demo.
const outdir = prod ? "extension/dist-demo" : "extension/dist";
mkdirSync(outdir, { recursive: true });
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
manifest.host_permissions = [
  "https://www.youtube.com/*",
  `${new URL(worker).origin}/*`,
  // official data, fetched directly by the background worker
  "https://api.bcb.gov.br/*",
  "https://olinda.bcb.gov.br/*",
  "https://apisidra.ibge.gov.br/*",
  "https://servicodados.ibge.gov.br/*",
];
writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));

const opts = {
  entryPoints: { background: "extension/src/background.ts", content: "extension/src/content.ts", hook: "extension/src/hook.ts" },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: prod,
  sourcemap: prod ? false : "inline",
  define: { __WORKER_BASE__: JSON.stringify(worker), __DEV__: JSON.stringify(!prod) },
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  await build(opts);
}
