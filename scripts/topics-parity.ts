// Parity: TS scorer (shared/topics.ts) vs Python reference on the held-out docs; plus scoring latency.
import { readFileSync, writeFileSync } from "node:fs";
import model from "../shared/topics-model.json";
import { TopicScorer, topicText, topicTokens, type TopicModel } from "../shared/topics";

const TOL = 1e-6;
const py: Record<string, number[]> = JSON.parse(readFileSync("eval/classifier/parity_py.json", "utf8"));
const docs = readFileSync("data/classifier/raw/docs.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const t0 = performance.now();
const scorer = new TopicScorer(model as TopicModel);
const loadMs = performance.now() - t0;

let n = 0, worst = 0;
for (const d of docs) {
  const ref = py[`${d.id}|${d.variant}`];
  if (!ref) continue;
  const tokens = Object.entries(d.counts as Record<string, number>).flatMap(([t, c]) => Array(c).fill(t));
  const p = scorer.probabilities(tokens);
  worst = Math.max(worst, ...p.map((x, i) => Math.abs(x - ref[i])));
  n++;
}

// Latency of the full path the extension runs: compose text → tokenize → score.
const videos = Object.values(JSON.parse(readFileSync("data/classifier/raw/videos.json", "utf8"))) as { title: string; description: string }[];
const times: number[] = [];
for (const v of videos) {
  const a = performance.now();
  scorer.probabilities(topicTokens(topicText(v.title, v.description)));
  times.push(performance.now() - a);
}
times.sort((a, b) => a - b);
const q = (f: number) => times[Math.floor(f * (times.length - 1))].toFixed(2);
const out = { docs: n, maxAbsDiff: worst, tolerance: TOL, pass: n > 0 && worst <= TOL, modelLoadMs: +loadMs.toFixed(1), scoreMs: { p50: +q(0.5), p90: +q(0.9), max: +q(1) } };
writeFileSync("eval/classifier/parity.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
if (!out.pass) process.exit(1);
