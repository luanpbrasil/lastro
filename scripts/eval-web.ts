/**
 * Gold eval on the webapp's Claude path (webapp/src/worker/factcheck.ts), $0 by default.
 *
 * Each gold transcript is cut into the uploads the webapp's page would send (src/web/uploader.ts: first after 15 s,
 * then every 30 s or once ~900 characters build up), cleaned like the Worker cleans them, and analysed chunk by chunk
 * with the context and "ideas already recorded" the Worker builds (src/worker/index.ts runChunk). The cards then go
 * through the same gold checks as the root eval (scripts/gold-checks.ts).
 *
 *   pnpm eval:web                                   replay every recorded run in fixtures/web-streams/ ($0, offline)
 *   pnpm eval:web -- --live --tag <name> --runs 3   call Claude, record fixtures/web-streams/<name>/<video>.r<N>.json
 *   pnpm eval:web -- --tag <name> --verbose         replay one tag, printing each failed check
 *   --no-notes (with --live): ask Claude without notes, as before p9 · --video <id>: one gold video · --plan: chunks only
 *
 * Gaps: speech-recognition input (misheard words, no punctuation) is not covered: the gold transcripts are captions.
 * The extension's own captions feeder sends ~2500-character chunks instead (extension/src/captions.ts); --chunker
 * captions simulates that one.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Card, Segment } from "../shared/schema";
import type { CheckedCard } from "../webapp/src/types";
import { ClaudeCards, factCheckWithClaude, type ChunkInput, type ClaudeTrace } from "../webapp/src/worker/factcheck";
import { cleanSpeech, cleanTitle } from "../webapp/src/worker/sanitize";
import { goldChecks, namesPolitics, type Gold } from "./gold-checks";

const OUT = "fixtures/web-streams";
const CONTEXT_SEGMENTS = 10; // webapp/src/worker/index.ts
const KNOWN_IDEAS = 20;
const LOOKBACK_MS = 120_000;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const chunker = (opt("chunker") ?? "uploader") as "uploader" | "captions";

interface RecordedChunk {
  input: ChunkInput;
  text: string;
  usage: ClaudeTrace["usage"];
  stopReason: string | null;
  usd: number;
  ms: number;
  /** ms from the call to the first card handed over (null: no card). */
  firstCardMs: number | null;
}
interface RecordedRun {
  tag: string;
  videoId: string;
  run: number;
  chunker: string;
  at: string;
  chunks: RecordedChunk[];
}

/** src/web/uploader.ts: flushes at 15 s, then every 30 s, and whenever 900+ characters wait. Segments arrive when they end. */
function uploaderChunks(segs: Segment[]): Segment[][] {
  const out: Segment[][] = [];
  let buf: Segment[] = [];
  let next = 15_000;
  const flush = () => {
    while (buf.length) {
      // takeBatch: at most 160 segments / 8000 characters per upload.
      let n = 0;
      let chars = 0;
      while (n < buf.length && n < 160 && (n === 0 || chars + buf[n].t.length <= 8000)) chars += buf[n++].t.length;
      out.push(buf.splice(0, n));
    }
  };
  for (const s of segs) {
    const at = s.s + s.d;
    while (at >= next) {
      flush();
      next = next === 15_000 ? 30_000 : next + 30_000;
    }
    buf.push(s);
    if (buf.reduce((n, x) => n + x.t.length, 0) >= 900) flush();
  }
  flush();
  return out;
}

/** extension/src/captions.ts chunksOf: 2500 characters or 150 segments per chunk. */
function captionChunks(segs: Segment[]): Segment[][] {
  const out: Segment[][] = [];
  let cur: Segment[] = [];
  let chars = 0;
  for (const s of segs) {
    if (cur.length && (chars + s.t.length > 2500 || cur.length >= 150)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(s);
    chars += s.t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The Worker's parseSegments: cleaned text, empty segments dropped, rounded times. */
const clean = (segs: Segment[]) =>
  segs.flatMap((x) => {
    const t = cleanSpeech(x.t);
    return t ? [{ s: Math.round(x.s), d: Math.round(x.d), t }] : [];
  });

function golds(): { gold: Gold; title: string; segs: Segment[] }[] {
  const only = opt("video");
  return readdirSync("eval/gold")
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`eval/gold/${f}`, "utf8")) as Gold)
    .filter((g) => !only || g.videoId === only)
    .map((gold) => {
      const file = gold.transcript ?? `fixtures/transcripts/${gold.videoId}.json`;
      const t = JSON.parse(readFileSync(file, "utf8")) as { title?: string; segments: Segment[] };
      return { gold, title: cleanTitle(gold.title ?? t.title ?? ""), segs: t.segments };
    });
}

function apiKey(): string {
  for (const f of ["webapp/.dev.vars", ".dev.vars"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  throw new Error("ANTHROPIC_API_KEY not found in webapp/.dev.vars or .dev.vars");
}

/** One live pass over a video, chunk by chunk, as the Worker would run it. */
async function liveRun(key: string, title: string, segs: Segment[]): Promise<RecordedChunk[]> {
  const chunks = (chunker === "captions" ? captionChunks : uploaderChunks)(segs).map(clean).filter((c) => c.length);
  const recorded: RecordedChunk[] = [];
  const paraphrases: string[] = [];
  let prev: Segment[] | null = null;
  for (const segments of chunks) {
    const startMs = segments[0].s;
    const prevEnd = prev ? Math.max(...prev.map((s) => s.s + s.d)) : -Infinity;
    const context = prev && prev[0].s < startMs && prevEnd >= startMs - LOOKBACK_MS ? prev.slice(-CONTEXT_SEGMENTS) : [];
    const input: ChunkInput = { title, lang: "pt", source: "captions", context, segments, knownIdeas: paraphrases.slice(-KNOWN_IDEAS).reverse() };
    const t0 = Date.now();
    let first: number | null = null;
    let trace: ClaudeTrace | null = null;
    const got: CheckedCard[] = [];
    await factCheckWithClaude(key, input, async (c) => {
      first ??= Date.now() - t0;
      got.push(c);
    }, { trace: (t) => (trace = t), checkFacts: false, notes: !flag("no-notes") });
    const t = trace as ClaudeTrace | null;
    if (!t) throw new Error("no trace");
    recorded.push({ input, text: t.text, usage: t.usage, stopReason: t.stopReason, usd: t.usd, ms: Date.now() - t0, firstCardMs: first });
    paraphrases.push(...got.map((c) => c.paraphrase));
    prev = segments;
  }
  return recorded;
}

/** Re-derive the cards of a recorded run with the current parsing and checks ($0). */
async function replay(run: RecordedRun): Promise<CheckedCard[]> {
  const cards: CheckedCard[] = [];
  for (const ch of run.chunks) {
    const out = new ClaudeCards(ch.input, async (c) => void cards.push(c), false);
    out.push(ch.text);
    await out.end();
  }
  return cards;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const videos = golds();
  if (flag("plan")) {
    for (const v of videos) {
      const ch = (chunker === "captions" ? captionChunks : uploaderChunks)(v.segs).map(clean).filter((c) => c.length);
      console.log(`  ${v.gold.videoId}: ${v.segs.length} segments, ${Math.round((v.segs.at(-1)!.s + v.segs.at(-1)!.d) / 1000)} s → ${ch.length} chunks: ${ch.map((c) => `${c.length}seg/${c.reduce((n, s) => n + s.t.length, 0)}ch`).join(", ")}`);
    }
    return;
  }
  if (flag("live")) {
    const tag = opt("tag");
    if (!tag) throw new Error("--live needs --tag <name>");
    const runs = Number(opt("runs") ?? 1);
    const key = apiKey();
    mkdirSync(`${OUT}/${tag}`, { recursive: true });
    let spent = 0;
    for (let r = 1; r <= runs; r++) {
      for (const v of videos) {
        const chunks = await liveRun(key, v.title, v.segs);
        const usd = chunks.reduce((n, c) => n + c.usd, 0);
        spent += usd;
        const rec: RecordedRun = { tag, videoId: v.gold.videoId, run: r, chunker, at: new Date().toISOString(), chunks };
        writeFileSync(`${OUT}/${tag}/${v.gold.videoId}.r${r}.json`, JSON.stringify(rec, null, 1));
        console.log(`  recorded ${tag} r${r} ${v.gold.videoId}: ${chunks.length} chunks, $${usd.toFixed(4)}`);
      }
    }
    console.log(`  live spend ${tag}: $${spent.toFixed(4)}\n`);
  }

  // Replay: every tag, or the one asked for.
  const tags = existsSync(OUT) ? readdirSync(OUT).filter((t) => !opt("tag") || t === opt("tag")).sort() : [];
  let pass = 0;
  let fail = 0;
  for (const tag of tags) {
    console.log(`\n${tag}`);
    const files = readdirSync(`${OUT}/${tag}`).filter((f) => f.endsWith(".json")).sort();
    const byVideo = new Map<string, RecordedRun[]>();
    for (const f of files) {
      const run = JSON.parse(readFileSync(`${OUT}/${tag}/${f}`, "utf8")) as RecordedRun;
      byVideo.set(run.videoId, [...(byVideo.get(run.videoId) ?? []), run]);
    }
    for (const v of videos) {
      const runs = byVideo.get(v.gold.videoId) ?? [];
      if (!runs.length) continue;
      const caseOk = new Map<string, number>();
      let allPass = 0;
      let enrichOk = 0;
      let forbidden = 0;
      const cardsPer: number[] = [];
      const usdPer: number[] = [];
      const firstMs: number[] = [];
      const doneMs: number[] = [];
      let withContext = 0;
      let nodeCards = 0;
      let counterpoints = 0;
      for (const run of runs) {
        const cards = await replay(run);
        const notes = run.chunks.some((c) => /"notes"\s*:/.test(c.text));
        let runFail = 0;
        const lines = goldChecks(v.gold, cards as Card[], notes ? 9 : 8, (ok, what) => {
          if (ok) pass++;
          else {
            fail++;
            runFail++;
            if (flag("verbose")) console.log(`    ✗ r${run.run} ${what}`);
          }
        });
        for (const l of lines) {
          const ok = l.startsWith("  ✓");
          const name = l.replace(/^ {2}[✓✗] [^:]+: /, "");
          if (name.startsWith("context on")) enrichOk += ok ? 1 : 0;
          else caseOk.set(name, (caseOk.get(name) ?? 0) + (ok ? 1 : 0));
        }
        if (!runFail) allPass++;
        // Any party or politician in any free text the card shows.
        forbidden += cards.filter((c) => namesPolitics([c.paraphrase, c.headline ?? "", c.context ?? "", c.counterpoint ?? ""].join(" ")).length).length;
        cardsPer.push(cards.length);
        usdPer.push(run.chunks.reduce((n, c) => n + c.usd, 0));
        firstMs.push(...run.chunks.flatMap((c) => (c.firstCardMs === null ? [] : [c.firstCardMs])));
        doneMs.push(...run.chunks.map((c) => c.ms));
        for (const c of cards) {
          if (c.nodes.length && c.kind !== "fact") {
            nodeCards++;
            if (c.context) withContext++;
          }
          if (c.counterpoint) counterpoints++;
        }
      }
      const n = runs.length;
      console.log(
        `  ${v.gold.videoId}: all-pass ${allPass}/${n} · cards/run ${median(cardsPer)} · $/video ${median(usdPer).toFixed(4)} · ` +
          `per chunk first card ${(median(firstMs) / 1000).toFixed(1)} s, done ${(median(doneMs) / 1000).toFixed(1)} s · ` +
          `context ${withContext}/${nodeCards} theory/forecast node cards · counterpoints ${counterpoints} · political names ${forbidden}`,
      );
      for (const [name, ok] of caseOk) console.log(`    ${ok}/${n} ${name}`);
    }
  }
  console.log(`\n${pass} checks passed, ${fail} failed (model output: a report, not a gate)`);
  if (flag("strict")) process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  // Never print request details: they could carry the key in a header dump.
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : "failed");
  process.exitCode = 1;
});
