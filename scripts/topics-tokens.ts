// Token counts per video and variant, from the same tokenizer the extension uses (shared/topics.ts).
// Writes data/classifier/raw/docs.jsonl: {id, channel, variant, counts} — "full" only when captions exist.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { topicText, topicTokens, type TopicVariant } from "../shared/topics";

const RAW = "data/classifier/raw";
const videos: Record<string, { id: string; channel: string; title: string; description: string }> = JSON.parse(readFileSync(`${RAW}/videos.json`, "utf8"));
const lines: string[] = [];
let full = 0;
for (const v of Object.values(videos)) {
  const p = `${RAW}/captions/${v.id}.json`;
  const cap = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  const variants: [TopicVariant, string][] = [["meta", topicText(v.title, v.description)]];
  if (cap?.status === "ok" && cap.segments.length) {
    variants.push(["full", topicText(v.title, v.description, cap.segments)]);
    full++;
  }
  for (const [variant, text] of variants) {
    const counts: Record<string, number> = {};
    for (const t of topicTokens(text)) counts[t] = (counts[t] ?? 0) + 1;
    lines.push(JSON.stringify({ id: v.id, channel: v.channel, variant, counts }));
  }
}
writeFileSync(`${RAW}/docs.jsonl`, lines.join("\n") + "\n");
console.log(`${Object.keys(videos).length} videos · ${full} with captions · ${lines.length} docs`);
