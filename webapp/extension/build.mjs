// Build the Chrome extension into extension/dist, then load that folder unpacked (chrome://extensions, Developer mode).
//   node extension/build.mjs [--watch] [--worker https://lastro.lovu.club] [--store]
// --worker is the Worker the extension talks to: the deployed site by default, http://127.0.0.1:8788 for `pnpm dev`.
// --store: the zip to upload to the Chrome Web Store, extension/lastro-<version>.zip. It leaves out the manifest's
// "key", which the store refuses on a new item (the store gives the item its own id).
import { execFileSync } from "node:child_process";
import { build, context } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const store = args.includes("--store");
const wi = args.indexOf("--worker");
const worker = new URL(wi >= 0 ? args[wi + 1] : "https://lastro.lovu.club").origin;
const out = join(here, store ? "dist-store" : "dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "icons"), { recursive: true });
mkdirSync(join(out, "fonts"), { recursive: true });

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
manifest.host_permissions = [...manifest.host_permissions, `${worker}/*`];
if (store) delete manifest.key;
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
copyFileSync(join(here, "src/offscreen.html"), join(out, "offscreen.html"));
for (const f of readdirSync(join(here, "icons"))) copyFileSync(join(here, "icons", f), join(out, "icons", f));
// The page's typeface, loaded by YouTube pages from the extension (web_accessible_resources).
const fonts = join(here, "../node_modules/@fontsource-variable/schibsted-grotesk/files");
for (const f of readdirSync(fonts).filter((f) => f.endsWith("-wght-normal.woff2"))) copyFileSync(join(fonts, f), join(out, "fonts", f));

const options = {
  entryPoints: {
    background: join(here, "src/background.ts"),
    content: join(here, "src/content.ts"),
    hook: join(here, "src/hook.ts"),
    offscreen: join(here, "src/offscreen.ts"),
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome116",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  // Stylesheets go into the overlay's shadow root as text.
  loader: { ".css": "text" },
  define: { __WORKER_BASE__: JSON.stringify(worker) },
  logLevel: "info",
};

if (watch) await (await context(options)).watch();
else await build(options);
console.log(`extension → ${out} (Worker ${worker})`);
if (store) {
  const zip = join(here, `lastro-${manifest.version}.zip`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: out });
  console.log(`store zip → ${zip}`);
}
