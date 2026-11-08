// Weak topic labels from Claude Haiku via the Message Batches API (50% price).
//   npm run label -- --estimate     cost estimate only (no API call)
//   npm run label -- --submit       submit the batch (refuses if the estimate is over $1)
//   npm run label -- --collect      wait for the batch and write data/classifier/raw/haiku_labels.json
// The API key is read in-process from .dev.vars; it is never printed or logged.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { costUsd, PRICES } from "../shared/prices";
import { topicText } from "../shared/topics";

const MODEL = "claude-haiku-5-5";
const RAW = "data/classifier/raw";
const MAX_EST_USD = 1;
const BATCH_DISCOUNT = 0.5;

const SYSTEM = `Você rotula vídeos brasileiros do YouTube por tema, a partir do título, da descrição e dos primeiros 3 minutos de legendas.
Responda só com o JSON pedido. Um vídeo pode ter mais de um tema, ou nenhum.

economia: o vídeo explica, analisa ou debate a economia: macroeconomia, juros, inflação, contas públicas, câmbio, emprego, crescimento, política econômica, teorias ou história econômica.
  Não conta: finanças pessoais e dicas de investimento (onde investir, como poupar, renda extra), a menos que a maior parte do trecho explique a economia (por exemplo, por que a Selic subiu e o que isso causa).
politica: o vídeo noticia, explica, analisa ou debate política: governo, eleições, partidos, Congresso, STF, políticas públicas, ideologias, geopolítica.
  Não conta: humor ou esquete com tema político sem análise; fofoca de celebridades.
filosofia: o vídeo explica ou debate ideias filosóficas: ética, filosofia política, epistemologia, metafísica, estoicismo, existencialismo, pensamento de filósofos.
  Não conta: autoajuda ou motivação sem conteúdo filosófico; religião ou teologia sem discussão filosófica.

confianca: "alta" se o tema é claro; "baixa" se o trecho é curto, ambíguo ou fora do padrão.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["economia", "politica", "filosofia", "confianca", "motivo"],
  properties: {
    economia: { type: "boolean" },
    politica: { type: "boolean" },
    filosofia: { type: "boolean" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    motivo: { type: "string" },
  },
};

interface Video { id: string; channel: string; title: string; description: string }
interface Caption { status: "ok" | "none"; segments?: { s: number; d: number; t: string }[] }

function apiKey(): string {
  const line = readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith("ANTHROPIC_API_KEY="));
  const key = line?.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^"|"$/g, "");
  if (!key) throw new Error(".dev.vars has no ANTHROPIC_API_KEY");
  return key;
}

function userPrompt(v: Video): string {
  const capPath = `${RAW}/captions/${v.id}.json`;
  const cap: Caption | null = existsSync(capPath) ? JSON.parse(readFileSync(capPath, "utf8")) : null;
  const segs = cap?.status === "ok" ? cap.segments : undefined;
  const text = topicText(v.title, v.description, segs);
  const [title, desc, ...rest] = text.split("\n");
  const captions = rest.join(" ").trim();
  return `Título: ${title}\nDescrição: ${desc.trim() || "(vazia)"}\nLegendas (3 min): ${captions || "(sem legendas)"}`;
}

function requests() {
  const videos: Record<string, Video> = JSON.parse(readFileSync(`${RAW}/videos.json`, "utf8"));
  return Object.values(videos).map((v) => ({
    custom_id: v.id.replace(/[^A-Za-z0-9_-]/g, "_"),
    params: {
      model: MODEL,
      max_tokens: 300,
      thinking: { type: "disabled" as const },
      output_config: { effort: "low" as const, format: { type: "json_schema" as const, schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user" as const, content: userPrompt(v) }],
    },
  }));
}

function estimate(reqs: ReturnType<typeof requests>): number {
  // ~3.2 characters per token for Portuguese; output ≈ 60 tokens.
  const inTok = reqs.reduce((n, r) => n + (SYSTEM.length + (r.params.messages[0].content as string).length) / 3.2, 0);
  const outTok = reqs.length * 60;
  const p = PRICES[MODEL];
  const usd = ((inTok * p.input + outTok * p.output) / 1e6) * BATCH_DISCOUNT;
  console.log(`${reqs.length} requests · ~${Math.round(inTok / 1000)}k input tokens · ~${Math.round(outTok / 1000)}k output · estimated $${usd.toFixed(4)} (batch price)`);
  return usd;
}

async function main() {
  const mode = process.argv[2];
  const reqs = requests();
  const est = estimate(reqs);
  if (mode === "--estimate") return;
  const client = new Anthropic({ apiKey: apiKey() });
  const batchFile = `${RAW}/batch.json`;

  if (mode === "--submit") {
    if (est > MAX_EST_USD) throw new Error(`estimate $${est.toFixed(2)} is over $${MAX_EST_USD}: ask Luan first`);
    if (existsSync(batchFile)) throw new Error(`${batchFile} exists: a batch was already submitted`);
    const b = await client.messages.batches.create({ requests: reqs });
    writeFileSync(batchFile, JSON.stringify({ id: b.id, createdAt: b.created_at, n: reqs.length }, null, 1));
    console.log(`submitted ${b.id} (${b.processing_status})`);
    return;
  }

  if (mode === "--collect") {
    const { id } = JSON.parse(readFileSync(batchFile, "utf8"));
    for (;;) {
      const b = await client.messages.batches.retrieve(id);
      if (b.processing_status === "ended") break;
      console.log(`${b.processing_status} · processing ${b.request_counts.processing} · succeeded ${b.request_counts.succeeded}`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
    const out: Record<string, unknown> = {};
    let cost = 0;
    let failed = 0;
    for await (const r of await client.messages.batches.results(id)) {
      if (r.result.type !== "succeeded") {
        failed++;
        continue;
      }
      const m = r.result.message;
      cost += costUsd(MODEL, m.usage) * BATCH_DISCOUNT;
      const text = m.content.find((c) => c.type === "text");
      if (m.stop_reason !== "end_turn" || !text || text.type !== "text") {
        failed++;
        continue;
      }
      out[r.custom_id] = JSON.parse(text.text);
    }
    writeFileSync(`${RAW}/haiku_labels.json`, JSON.stringify(out, null, 1));
    writeFileSync(`${RAW}/label_spend.json`, JSON.stringify({ batch: id, costUsd: cost, labelled: Object.keys(out).length, failed }, null, 1));
    console.log(`labelled ${Object.keys(out).length}, failed ${failed}, actual cost $${cost.toFixed(4)}`);
    return;
  }
  console.log("usage: --estimate | --submit | --collect");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
