import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const out = await build({ entryPoints: ["tests/notes-entry.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { ClaudeCards, factCheckChunk, postWithWorkersAI, withNote } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const segments = [
  { s: 0, d: 6000, t: "o governo emite a propria moeda então nunca vai faltar dinheiro para pagar a divida" },
  { s: 6000, d: 6000, t: "e o limite do gasto publico é a inflação e não uma regra contabil qualquer" },
];
const input = { title: "Teste", lang: "pt", source: "captions", context: [], segments, knownIdeas: [] };
const unit = (quote, extra = {}) => ({ headline: "Moeda própria", quote, paraphrase: "O falante afirma que um país que emite a própria moeda não fica sem dinheiro.", kind: "theory", nodes: [{ id: "s_mmt", role: "relies_on" }], indicator: null, claimed_value: null, period: null, ...extra });
const units = [unit("emite a propria moeda então nunca vai faltar dinheiro"), unit("o limite do gasto publico é a inflação")];
const notes = [
  { i: 0, context: "Quem emite a moeda paga em moeda: o raciocínio parte do Estado como emissor.", against: "s_novoconsenso", counterpoint: "Para essa visão, o limite é a inflação que o banco central precisa controlar." },
  // Speaks for the speaker's own side: the counterpoint is dropped, the context stays.
  { i: 1, context: "O limite real do gasto, nessa visão, é a inflação.", against: "s_mmt", counterpoint: "Isso está certo." },
];

async function replay(text, pieces = 1) {
  const cards = [];
  const cc = new ClaudeCards(input, async (c) => void cards.push(c), false);
  const step = Math.ceil(text.length / pieces);
  for (let i = 0; i < text.length; i += step) cc.push(text.slice(i, i + step));
  await cc.end();
  return cards;
}

test("Claude: a card waits for its note; counterpoint kept only for a view under 'who disagrees'", async () => {
  const cards = [];
  const cc = new ClaudeCards(input, async (c) => void cards.push(c), false);
  const json = JSON.stringify({ units, notes });
  cc.push(json.slice(0, json.indexOf('"notes"')));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cards.length, 0, "no card before its note");
  cc.push(json.slice(json.indexOf('"notes"')));
  await cc.end();
  assert.equal(cards.length, 2);
  const [a, b] = cards.sort((x, y) => x.startMs - y.startMs);
  assert.match(a.context, /emissor/);
  assert.equal(a.counterpointBy, "s_novoconsenso");
  assert.match(a.counterpoint, /banco central/);
  assert.match(b.context, /inflação/);
  assert.equal(b.counterpoint, undefined);
  assert.equal(b.counterpointBy, undefined);
});

test("Claude: a reply cut off in the notes still saves every card, the rest without context", async () => {
  const json = JSON.stringify({ units, notes });
  const cut = json.slice(0, json.indexOf('{"i":1'));
  const cards = await replay(cut, 7);
  assert.equal(cards.length, 2);
  assert.equal(cards.filter((c) => c.context).length, 1);
});

test("Claude: a reply without notes (older prompt) saves the cards as before", async () => {
  const cards = await replay(JSON.stringify({ units }), 5);
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => c.context === undefined && c.counterpoint === undefined));
});

test("notes: links, oversize text and cards without nodes get no context", () => {
  const card = { nodes: [{ id: "s_mmt", role: "relies_on" }] };
  assert.equal(withNote(card, { context: "veja https://exemplo.org", against: null, counterpoint: "" }).context, undefined);
  assert.equal(withNote(card, { context: "x".repeat(501), against: null, counterpoint: "" }).context, undefined);
  assert.equal(withNote({ nodes: [] }, { context: "Um contexto qualquer.", against: null, counterpoint: "" }).context, undefined);
  const kept = withNote(card, { context: "Contexto.", against: "s_novoconsenso", counterpoint: "siga @alguem" });
  assert.equal(kept.context, "Contexto.");
  assert.equal(kept.counterpoint, undefined);
});

test("Workers AI fallback: asked without notes, and cards still save with or without them", async () => {
  let asked;
  const ai = (reply) => ({ run: async (_m, p) => ((asked = p), reply) });
  for (const reply of [
    { response: JSON.stringify({ units }) },
    { response: { units } },
    { choices: [{ message: { content: JSON.stringify({ units, notes }) } }] },
    { response: JSON.stringify({ units, notes }).slice(0, -40) },
  ]) {
    const r = await factCheckChunk(ai(reply), input);
    assert.equal(r.cards.length, 2);
    assert.ok(r.cards.every((c) => c.context === undefined));
  }
  assert.equal(asked.response_format.json_schema.properties.notes, undefined);
  assert.ok(!asked.response_format.json_schema.required.includes("notes"));
  assert.doesNotMatch(asked.messages[0].content, /"notes"/);
});

test("X posts, Workers AI: asked without notes, cards unchanged", async () => {
  const text = "O governo emite a própria moeda, então nunca vai faltar dinheiro para pagar a dívida.";
  const source = { postId: "1", url: "https://x.com/a/status/1", author: "A", handle: "a", publishedAt: null, text, lang: "pt", visibility: "public", complete: true };
  let asked;
  const ai = { run: async (_m, p) => ((asked = p), { response: { units: [unit("O governo emite a própria moeda")] } }) };
  const r = await postWithWorkersAI(ai, source);
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].context, undefined);
  assert.equal(asked.response_format.json_schema.properties.notes, undefined);
});

test("names: a paraphrase naming a politician drops the card; a headline, context or counterpoint naming one is cleared", async () => {
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(m);
  try {
    const named = [
      unit("emite a propria moeda então nunca vai faltar dinheiro", { paraphrase: "O falante afirma que o governo Lula pode emitir moeda sem faltar dinheiro." }),
      unit("o limite do gasto publico é a inflação", { headline: "PT e o limite do gasto" }),
    ];
    const noteNames = [
      { i: 0, context: "Contexto qualquer sobre emissão de moeda.", against: null, counterpoint: "" },
      { i: 1, context: "Como diria Bolsonaro, o limite é a inflação.", against: "s_novoconsenso", counterpoint: "Para essa visão, quem controla a inflação é o banco central." },
    ];
    const cards = await replay(JSON.stringify({ units: named, notes: noteNames }), 3);
    assert.equal(cards.length, 1, "the card whose paraphrase names Lula is dropped");
    assert.equal(cards[0].headline, undefined, "headline naming PT cleared");
    assert.equal(cards[0].context, undefined, "context naming Bolsonaro cleared (and with it the counterpoint)");
    const events = logs.map((m) => JSON.parse(m)).filter((e) => e.event === "politics_filtered");
    assert.deepEqual(events.map((e) => `${e.field}:${e.action}`).sort(), ["context:cleared", "headline:cleared", "paraphrase:dropped"]);
  } finally {
    console.log = orig;
  }
});

test("names: offices, 'lira turca' and lowercase words are not names", async () => {
  const card = { nodes: [{ id: "s_mmt", role: "relies_on" }] };
  assert.equal(withNote(card, { context: "O presidente e a lira turca mostram o limite da moeda.", against: null, counterpoint: "" }).context, "O presidente e a lira turca mostram o limite da moeda.");
  assert.equal(withNote(card, { context: "Quem moro aqui sabe que a inflação pesa.", against: null, counterpoint: "" }).context, "Quem moro aqui sabe que a inflação pesa.");
});

test("names, X posts: the quote may name a politician, Lastro's paraphrase may not", async () => {
  const text = "Lula disse que o governo emite a própria moeda, então nunca vai faltar dinheiro.";
  const source = { postId: "2", url: "https://x.com/a/status/2", author: "A", handle: "a", publishedAt: null, text, lang: "pt", visibility: "public", complete: true };
  const orig = console.log;
  console.log = () => {};
  try {
    const ok = unit("Lula disse que o governo emite a própria moeda", { paraphrase: "A autora afirma que um país que emite a própria moeda não fica sem dinheiro." });
    const r = await postWithWorkersAI({ run: async () => ({ response: { units: [ok] } }) }, source);
    assert.equal(r.cards.length, 1);
    assert.match(r.cards[0].quote, /^Lula/);
    const bad = { ...ok, paraphrase: "A autora afirma que Lula defende emitir moeda sem limite." };
    await assert.rejects(postWithWorkersAI({ run: async () => ({ response: { units: [bad] } }) }, source), /No grounded post units/);
  } finally {
    console.log = orig;
  }
});
