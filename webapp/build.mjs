// Build the page served by the Worker as static assets. Script and stylesheet URLs get a content hash.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

process.chdir(import.meta.dirname);
rmSync("dist", { recursive: true, force: true });
cpSync("static", "dist", { recursive: true });
await build({ entryPoints: { app: "src/web/main.ts" }, outdir: "dist", bundle: true, format: "iife", target: "es2022", minify: true, logLevel: "warning" });

const hash = (f) => createHash("sha256").update(readFileSync(`dist/${f}`)).digest("hex").slice(0, 10);
let html = readFileSync("dist/index.html", "utf8");
for (const f of ["app.js", "style.css"]) html = html.replaceAll(`"/${f}"`, `"/${f}?v=${hash(f)}"`);
writeFileSync("dist/index.html", html);
console.log("webapp built → webapp/dist");
