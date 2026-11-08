/**
 * Send a saved transcript to the Worker and print the NDJSON stream with client-side timings.
 * Records the stream to fixtures/streams/<videoId>.ndjson for $0 replay in UI work.
 *
 *   npm run analyze -- fixtures/transcripts/<videoId>.json [--title "..."] [--nocache] [--force] [--base http://localhost:8787]
 *   --force: same as the viewer pressing "Analisar este vídeo" (skips the topic check; own daily cap)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Segment, StreamEvent } from "../shared/schema";
import { transcriptHash } from "../shared/transcript";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("usage: analyze <transcript.json>");
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = opt("base") ?? "http://localhost:8787";
const nocache = args.includes("--nocache");
const force = args.includes("--force");

const { videoId, segments, title: savedTitle } = JSON.parse(readFileSync(file, "utf8")) as {
  videoId: string;
  segments: Segment[];
  title?: string;
};
const title = opt("title") ?? savedTitle ?? "";
const hash = await transcriptHash(segments);

const t0 = performance.now();
const res = await fetch(`${base}/analyze${nocache ? "?nocache=1" : ""}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ videoId, title, hash, segments, force }),
});
if (!res.ok || !res.body) {
  console.error(res.status, await res.text());
  process.exit(1);
}

const lines: string[] = [];
let firstCardMs: number | null = null;
const decoder = new TextDecoder();
let buf = "";
for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
  buf += decoder.decode(chunk as Uint8Array, { stream: true });
  let nl: number;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    lines.push(line);
    const ev = JSON.parse(line) as StreamEvent;
    const t = Math.round(performance.now() - t0);
    if (ev.type === "card") {
      if (firstCardMs === null) firstCardMs = t;
      const c = ev.card;
      console.log(`[${t} ms] card @${Math.round(c.startMs / 1000)}s ${c.kind} ${c.nodes.map((n) => n.id).join(",") || c.indicator} — ${c.paraphrase}`);
    } else {
      console.log(`[${t} ms] ${JSON.stringify(ev)}`);
    }
  }
}
const totalMs = Math.round(performance.now() - t0);
console.log(`\nclient: first card ${firstCardMs ?? "-"} ms, done ${totalMs} ms`);

mkdirSync("fixtures/streams", { recursive: true });
writeFileSync(`fixtures/streams/${videoId}.ndjson`, lines.join("\n") + "\n");
