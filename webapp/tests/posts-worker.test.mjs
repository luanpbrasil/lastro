import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const source = {
  postId: "1234567890123456789", url: "https://x.com/ana/status/1234567890123456789",
  author: "Ana", handle: "ana", publishedAt: "2026-11-01T12:00:00.000Z",
  text: "Juros altos reduzem o investimento no Brasil. A meta é inflação < 4%, não censura. https://exemplo.org @economia",
  lang: "pt", visibility: "public", complete: true,
};
const unit = { quote: "Juros altos reduzem o investimento no Brasil.", headline: "Juros e investimento", paraphrase: "A autora afirma que juros altos reduzem o investimento no Brasil.", kind: "theory", nodes: [{ id: "s_keynes", role: "echoes" }], indicator: null, claimed_value: null, period: null };
const bundle = await build({ entryPoints: ["tests/post-worker-entry.ts"], bundle: true, write: false, format: "esm", platform: "browser" });

async function harness(model, bindings = {}, official = () => new Response("No fixture", { status: 503 })) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-11-01", compatibilityFlags: ["nodejs_compat"], bindings, d1Databases: ["DB"], serviceBindings: { MODEL: model }, outboundService: official }));
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations")).filter(n => n.endsWith(".sql")).sort()) {
    const sql = await readFile(`migrations/${name}`, "utf8");
    for (const statement of sql.replace(/--[^\n]*/g, "").split(";").filter(s => s.trim())) await db.prepare(statement).run();
  }
  return { mf, db, post: (body = source, headers = {}) => mf.dispatchFetch("http://localhost/api/posts/analyze", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }) };
}

test("an explicit historical month takes precedence over publication and analysis dates", async () => {
  const text = "No fim de janeiro de 2020, a meta da Selic no Brasil era 4,5%.";
  // A mistaken model period must not override the authored date.
  const fact = { ...unit, kind: "fact", quote: text, indicator: "selic_meta", claimed_value: 4.5, period: "2026-11" };
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] } }), {}, () => Response.json([
    { data: "31/12/2019", valor: "4.5" }, { data: "31/01/2020", valor: "4.5" }, { data: "01/11/2026", valor: "15" },
  ]));
  try {
    const result = await (await post({ ...source, text })).json();
    assert.equal(result.cards[0].check?.verdict, "confere");
    assert.equal(result.cards[0].check.official.value, 4.5);
    assert.equal(result.cards[0].check.official.date, "2020-01-31");
    assert.equal(result.cards[0].check.official.source, "Banco Central (SGS 432)");
    assert.equal(result.cards[0].check.official.vintage, "current-series");
  } finally { await mf.dispose(); }
});

test("today uses publication day before chart thinning, never a later day in the same month", async () => {
  const text = "Hoje a meta da Selic no Brasil é 2%.";
  const fact = { ...unit, kind: "fact", quote: text, indicator: "selic_meta", claimed_value: 2, period: null };
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] } }), {}, () => Response.json([
    { data: "31/12/2020", valor: "2" }, { data: "15/01/2021", valor: "2" },
    { data: "29/01/2021", valor: "9" }, { data: "31/12/2021", valor: "12" },
  ]));
  try {
    const result = await (await post({ ...source, text, publishedAt: "2021-01-15T12:00:00.000Z" })).json();
    assert.equal(result.cards[0].check?.verdict, "confere");
    assert.equal(result.cards[0].check.official.date, "2021-01-15");
    assert.deepEqual(result.cards[0].check.official.series, [
      { date: "2020-12-31", value: 2 }, { date: "2021-01-15", value: 2 },
    ]);
  } finally { await mf.dispose(); }
});

test("uncertain dates and unsupported comparisons retain context without a numerical verdict", async () => {
  let fact;
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] } }), {}, () => Response.json([
    { data: "01/01/2020", valor: "4.5" }, { data: "31/01/2020", valor: "4.5" }, { data: "28/02/2020", valor: "4.5" },
  ]));
  try {
    const examples = [
      { text: "No fim de janeiro de 2020 ou fevereiro de 2020, a Selic era 4,5%." },
      { text: "Em janeiro de 2020 a Selic era 4,5%." },
      { text: "Hoje a Selic é 4,5%.", publishedAt: null },
      { text: "Em janeiro de 2020 a Selic era 4,5%.", publishedAt: null },
      { text: "A Selic era 4,5%.", period: "2020-01" },
      { text: "Em janeiro a Selic era 4,5%. Hoje os juros importam." },
      { text: "Em janeiro de 2020 o imposto era 4,5%.", indicator: null },
      { text: "Em janeiro de 2020 a Selic deveria ser 4,5%.", kind: "theory" },
      { text: "Em janeiro de 2020 a Selic chegará a 4,5%.", kind: "forecast" },
      { text: "Hoje o Focus prevê Selic de 4,5%.", indicator: "focus_selic" },
      { text: "Em fevereiro de 2021 a Selic era 4,5%." },
      { text: "Em janeiro de 2020 a Selic era 4,5%.", publishedAt: "2020-01-15T12:00:00.000Z" },
      { text: "Em 2020 o IPCA mensal foi 4,5%.", indicator: "ipca_mensal" },
      { text: "Hoje o IPCA mensal é 4,5%.", indicator: "ipca_mensal" },
      { text: "Hoje o PIB no trimestre cresceu 4,5%.", indicator: "pib_tri" },
      { text: "Hoje a Selic era 4,5%.", publishedAt: "2020-02-30T12:00:00.000Z", badRequest: true },
      { text: "Em 30/02/2020 a Selic era 4,5%." },
      { text: "Em 2020-13 a inflação foi 4,5%.", indicator: "ipca_mensal" },
      { text: "Hoje a Selic é 4,5%.", publishedAt: "2099-01-01T12:00:00.000Z" },
    ];
    for (const example of examples) {
      fact = { ...unit, kind: "fact", indicator: "selic_meta", claimed_value: 4.5, period: null, ...example, quote: example.text };
      const reply = await post({ ...source, text: example.text, ...(Object.hasOwn(example, "publishedAt") ? { publishedAt: example.publishedAt } : {}) });
      if (example.badRequest) { assert.equal(reply.status, 400); continue; }
      const result = await reply.json();
      assert.equal(result.status, "complete", example.text);
      assert.equal(result.cards[0].check, null, example.text);
      assert.deepEqual(result.cards[0].nodes, unit.nodes);
    }
  } finally { await mf.dispose(); }
});

test("qualified dates and unresolved relative intervals remain unchecked", async () => {
  let fact;
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] }, usage: { neurons: 1 } }), {}, req => Response.json(
    req.url.includes("sgs.433/") ? [{ data: "01/01/2020", valor: "0.21" }] : [
      { data: "15/01/2020", valor: "4.5" }, { data: "31/01/2020", valor: "4.5" }, { data: "15/01/2021", valor: "4.5" },
    ]));
  try {
    const examples = [
      "Antes de 15/01/2020 a Selic era 4,5%.",
      "Antes de janeiro de 2020 o IPCA mensal foi 0,21%.",
      "Hoje faz um ano que a Selic estava em 4,5%.",
      "Depois de 15/01/2020 a Selic era 4,5%.",
      "Desde 15/01/2020 a Selic está em 4,5%.",
      "Até 15/01/2020 a Selic era 4,5%.",
      "Após 15/01/2020 a Selic era 4,5%.",
      "A partir de 15/01/2020 a Selic era 4,5%.",
      "Hoje lembro que há um ano a Selic era 4,5%.",
      "Hoje lembro que um ano atrás a Selic era 4,5%.",
      "Hoje completa um ano que a Selic estava em 4,5%.",
      "Hoje lembramos que na semana passada a Selic era 4,5%.",
      "Hoje lembramos que na semana anterior a Selic era 4,5%.",
      "Hoje lembramos que anteontem a Selic era 4,5%.",
      "Hoje lembramos que nas semanas passadas a Selic era 4,5%.",
      "Hoje lembramos que nas semanas anteriores a Selic era 4,5%.",
      "Hoje lembramos que na semana seguinte a Selic era 4,5%.",
      "Hoje a Selic está prevista em 4,5% na próxima semana.",
      "Hoje a Selic está prevista em 4,5% nos próximos dias.",
      "Hoje a Selic está prevista em 4,5% amanhã.",
      "Hoje lembramos que no mês retrasado a Selic era 4,5%.",
      "No início de janeiro de 2020 a Selic era 4,5%, no fim de um ciclo.",
      "No fim de um mandato, em janeiro de 2020 a Selic era 4,5%.",
      "No meio de janeiro de 2020 o IPCA mensal foi 0,21%.",
    ];
    const outcomes = [];
    for (const text of examples) {
      fact = { ...unit, kind: "fact", quote: text, indicator: text.includes("IPCA") ? "ipca_mensal" : "selic_meta", claimed_value: text.includes("IPCA") ? 0.21 : 4.5 };
      const result = await (await post({ ...source, text, publishedAt: "2021-01-15T12:00:00.000Z" })).json();
      assert.equal(result.status, "complete", text);
      assert.deepEqual(result.cards[0].nodes, unit.nodes);
      outcomes.push({ text, check: result.cards[0].check });
    }
    assert.deepEqual(outcomes, examples.map(text => ({ text, check: null })));
  } finally { await mf.dispose(); }
});

test("a grounded quote cannot discard a date qualifier from the source", async () => {
  const fact = { ...unit, kind: "fact", quote: "15/01/2020 a Selic era 4,5%.", indicator: "selic_meta", claimed_value: 4.5 };
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] }, usage: { neurons: 1 } }), {}, () => Response.json([
    { data: "15/01/2020", valor: "4.5" },
  ]));
  try {
    for (const text of [
      "Antes de 15/01/2020 a Selic era 4,5%.",
      "Na semana anterior a 15/01/2020 a Selic era 4,5%.",
      "Na semana passada, antes do dia 15/01/2020 a Selic era 4,5%.",
      "Anteontem eu lembrava: em 15/01/2020 a Selic era 4,5%.",
    ]) {
      const result = await (await post({ ...source, text })).json();
      assert.equal(result.status, "complete");
      assert.equal(result.cards[0].check, null, text);
    }
  } finally { await mf.dispose(); }
});

test("missing, stale, future and failed official observations never become numerical verdicts", async () => {
  let rows = [];
  let unavailable = false;
  let fact;
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] }, usage: { neurons: 1 } }), {}, () => unavailable ? new Response("offline", { status: 503 }) : Response.json(rows));
  try {
    for (const [index, example] of [
      { text: "No fim de janeiro de 2020 a Selic era 4,5%.", rows: [{ data: "01/01/2020", valor: "4.5" }] },
      { text: "Hoje a Selic é 4,5%.", rows: [{ data: "29/01/2021", valor: "4.5" }] },
      { text: "Hoje a Selic é 4,5%.", rows: [{ data: "01/01/2021", valor: "4.5" }] },
      { text: "Em 15/01/2020 a Selic era 4,5%.", rows: [], unavailable: true },
      { text: "Em janeiro de 2020 o IPCA mensal foi 4,5%.", indicator: "ipca_mensal", rows: [{ data: "01/02/2020", valor: "4.5" }] },
    ].entries()) {
      rows = example.rows;
      unavailable = example.unavailable ?? false;
      fact = { ...unit, kind: "fact", quote: example.text, indicator: example.indicator ?? "selic_meta", claimed_value: 4.5 };
      const result = await (await post({ ...source, text: `${example.text}\nExemplo ${index}.`, publishedAt: "2021-01-15T12:00:00.000Z" })).json();
      assert.equal(result.status, "complete");
      assert.equal(result.cards[0].check, null, example.text);
    }
  } finally { await mf.dispose(); }
});

test("numeric match and difference use the existing tolerance and persist with the official series", async () => {
  let text;
  let claimed;
  const { mf, post } = await harness(() => Response.json({ response: { units: [{ ...unit, kind: "fact", quote: text, indicator: "selic_meta", claimed_value: claimed }] }, usage: { neurons: 1 } }), {}, () => Response.json([
    { data: "31/12/2019", valor: "4.5" }, { data: "15/01/2020", valor: "4.5" },
  ]));
  try {
    for (const [value, verdict] of [[4.4, "confere"], [3, "diferente"]]) {
      claimed = value;
      text = `Em 15/01/2020 a meta da Selic no Brasil era ${value}%.`;
      const result = await (await post({ ...source, text })).json();
      assert.equal(result.cards[0].check?.verdict, verdict);
      assert.equal(result.cards[0].check.official.value, 4.5);
      assert.deepEqual(await (await mf.dispatchFetch(`http://localhost/api/posts/results/${result.id}`)).json(), result);
      assert.deepEqual(await (await post({ ...source, text })).json(), result);
    }
  } finally { await mf.dispose(); }
});

test("explicit day, month, quarter and year-end use the requested historical observations", async () => {
  let fact;
  const { mf, post } = await harness(() => Response.json({ response: { units: [fact] } }), {}, req => {
    const url = new URL(req.url);
    if (url.pathname.includes("/agregados/6381/")) {
      // Only the requested historical period has this fixture; latest-N is not historical evidence.
      return url.pathname.includes("/periodos/201901-202001/") ? Response.json([{ resultados: [{ series: [{ serie: { "202001": "11.2" } }] }] }]) : new Response("missing period", { status: 404 });
    }
    if (url.hostname === "servicodados.ibge.gov.br") {
      return url.pathname.includes("/periodos/201901-202001/") ? Response.json([{ resultados: [{ series: [{ serie: { "202001": "-1.5" } }] }] }]) : new Response("missing period", { status: 404 });
    }
    return Response.json([
      { data: "31/12/2019", valor: "4.5" }, { data: "01/01/2020", valor: "0.21" },
      { data: "15/01/2020", valor: "4.5" }, { data: "31/01/2020", valor: "4.5" },
      { data: "31/12/2020", valor: "2" },
    ]);
  });
  try {
    for (const example of [
      { text: "Em 15/01/2020 a Selic era 4,5%.", indicator: "selic_meta", value: 4.5, date: "2020-01-15" },
      { text: "Em 2020-01-15 a Selic era 4,5%.", indicator: "selic_meta", value: 4.5, date: "2020-01-15" },
      { text: "No fim de 2020 a Selic era 2%.", indicator: "selic_meta", value: 2, date: "2020-12-31" },
      { text: "Em janeiro de 2020 o IPCA mensal foi 0,21%.", indicator: "ipca_mensal", value: 0.21, date: "2020-01-01" },
      { text: "Em 2020-01 a taxa de desemprego foi 11,2%.", indicator: "desemprego", value: 11.2, date: "2020-01-01" },
      { text: "No 1º trimestre de 2020 o PIB caiu 1,5%.", indicator: "pib_tri", value: -1.5, date: "2020-01-01" },
    ]) {
      fact = { ...unit, kind: "fact", quote: example.text, indicator: example.indicator, claimed_value: example.value, period: null };
      const result = await (await post({ ...source, text: example.text })).json();
      assert.equal(result.cards[0].check?.verdict, "confere", example.text);
      assert.equal(result.cards[0].check.official.date, example.date);
      assert.equal(result.cards[0].check.official.value, example.value);
    }
  } finally { await mf.dispose(); }
});

test("another viewer reuses a successful public-post result when providers are unavailable", async () => {
  let available = true;
  let calls = 0;
  const { mf, post } = await harness(() => {
    calls++;
    return available ? Response.json({ response: { units: [unit] }, usage: { neurons: 1 } }) : new Response("offline", { status: 503 });
  });
  try {
    const first = await (await post(source, { "cf-connecting-ip": "192.0.2.1" })).json();
    available = false;
    const second = await post(source, { "cf-connecting-ip": "192.0.2.2" });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), first);
    assert.equal(calls, 1);
    assert.deepEqual(await (await mf.dispatchFetch("http://localhost/api/videos")).json(), { videos: [] });
  } finally { await mf.dispose(); }
});

test("concurrent requests share an in-progress revision while edited text finishes independently", async () => {
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  let resume;
  const paused = new Promise(resolve => { resume = resolve; });
  let calls = 0;
  const edited = { ...source, text: "O governo deve reduzir os impostos no Brasil." };
  const { mf, post } = await harness(async req => {
    const input = await req.json();
    calls++;
    if (JSON.parse(input.messages[1].content).text === source.text) {
      if (calls === 1) { started(); await paused; }
      return Response.json({ response: { units: [unit] }, usage: { neurons: 1 } });
    }
    return Response.json({ response: { units: [] }, usage: { neurons: 1 } });
  });
  let pending;
  try {
    pending = post();
    await entered;
    const duplicate = await post();
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { error: "in_progress" });
    assert.equal(duplicate.headers.get("retry-after"), "2");
    const revision = await (await post(edited)).json();
    assert.equal(revision.status, "empty");
    resume();
    const original = await (await pending).json();
    assert.equal(original.status, "complete");
    assert.deepEqual(await (await post()).json(), original);
    assert.deepEqual(await (await post(edited)).json(), revision);
    assert.notEqual(revision.id, original.id);
    assert.equal(calls, 2);
  } finally { resume(); await pending; await mf.dispose(); }
});

test("changed text, identity and publication metadata require compatible fresh results regardless of client fingerprints", async () => {
  let calls = 0;
  const { mf, post } = await harness(() => {
    calls++;
    return Response.json({ response: { units: calls === 1 ? [unit] : [] }, usage: { neurons: 1 } });
  });
  try {
    const original = await (await post({ ...source, textFingerprint: "claimed-same-fingerprint" })).json();
    const revisions = [
      { ...source, text: "O governo deve reduzir os impostos no Brasil." },
      { ...source, text: `${source.text}\n` },
      { ...source, postId: "2234567890123456789", url: "https://x.com/ana/status/2234567890123456789" },
      { ...source, publishedAt: "2025-11-01T12:00:00.000Z" },
      { ...source, publishedAt: null },
      { ...source, author: "Ana Silva" },
      { ...source, handle: "ana_silva", url: "https://x.com/ana_silva/status/1234567890123456789" },
    ];
    for (const revision of revisions) {
      const fresh = await (await post({ ...revision, textFingerprint: "claimed-same-fingerprint" })).json();
      assert.equal(fresh.status, "empty");
      assert.deepEqual(fresh.source, revision);
      assert.notEqual(fresh.id, original.id);
      assert.deepEqual(await (await post(revision)).json(), fresh);
    }
    assert.equal(calls, revisions.length + 1);
    assert.deepEqual(await (await post()).json(), original);
  } finally { await mf.dispose(); }
});

test("an older analysis contract stays readable but cannot supply the current requested result", async () => {
  let calls = 0;
  const { mf, db, post } = await harness(() => {
    calls++;
    return Response.json({ response: { units: calls === 1 ? [unit] : [] }, usage: { neurons: 1 } });
  });
  try {
    const older = await (await post()).json();
    // Arrange the persisted state of a prior deployment; observe reuse only through the API.
    await db.prepare("UPDATE post_analysis_keys SET analysis_version = 'post-obsolete'").run();
    const current = await (await post({ ...source, analysisVersion: "post-obsolete" })).json();
    assert.equal(current.status, "empty");
    assert.notEqual(current.id, older.id);
    assert.equal(calls, 2);
    assert.deepEqual(await (await post()).json(), current);
    assert.deepEqual(await (await mf.dispatchFetch(`http://localhost/api/posts/results/${older.id}`)).json(), older);
  } finally { await mf.dispose(); }
});

test("saved cards remain available at the provider cap and a refused fresh revision remains retryable", async () => {
  let calls = 0;
  const { mf, db, post } = await harness(() => { calls++; return Response.json({ response: { units: [unit] }, usage: { neurons: 1 } }); });
  try {
    const saved = await (await post()).json();
    // Model other traffic exhausting the existing shared daily budget.
    await db.prepare("UPDATE usage_daily SET neurons = 1000000000, usd = 1000000000").run();
    assert.deepEqual(await (await post()).json(), saved);
    const edited = { ...source, text: `${source.text} A política fiscal também importa.` };
    assert.equal((await post(edited)).status, 429);
    assert.equal(calls, 1);
    await db.prepare("UPDATE usage_daily SET neurons = 0, usd = 0").run();
    const retried = await (await post(edited)).json();
    assert.equal(retried.status, "complete");
    assert.notEqual(retried.id, saved.id);
    assert.equal(calls, 2);
  } finally { await mf.dispose(); }
});

test("an expired attempt can be retried and its late response cannot replace or release the new attempt", async () => {
  let firstStarted, secondStarted, resumeFirst, resumeSecond;
  const firstEntered = new Promise(resolve => { firstStarted = resolve; });
  const secondEntered = new Promise(resolve => { secondStarted = resolve; });
  const firstPause = new Promise(resolve => { resumeFirst = resolve; });
  const secondPause = new Promise(resolve => { resumeSecond = resolve; });
  let calls = 0;
  const { mf, db, post } = await harness(async () => {
    const call = ++calls;
    if (call === 1) { firstStarted(); await firstPause; }
    if (call === 2) { secondStarted(); await secondPause; }
    return Response.json({ response: { units: call === 1 ? [unit] : [] }, usage: { neurons: 1 } });
  });
  let first, second;
  try {
    first = post();
    await firstEntered;
    // Arrange a lost Worker's expired lease without sleeping for its real recovery window.
    await db.prepare("UPDATE post_analysis_keys SET lease_until = 0 WHERE result_id IS NULL").run();
    second = post();
    await secondEntered;
    resumeFirst();
    assert.equal((await first).status, 409);
    assert.equal((await post()).status, 409);
    resumeSecond();
    const recovered = await (await second).json();
    assert.equal(recovered.status, "empty");
    assert.deepEqual(await (await post()).json(), recovered);
    assert.equal(calls, 2);
  } finally { resumeFirst(); resumeSecond(); await Promise.all([first, second]); await mf.dispose(); }
});

test("a selected post yields grounded authored-text cards, persists, and stays out of video history", async () => {
  let prompt;
  const { mf, post } = await harness(async req => { prompt = await req.json(); return Response.json({ response: { units: [unit, { ...unit, quote: "Uma afirmação que nunca apareceu no post." }] }, usage: { neurons: 1 } }); });
  try {
    const reply = await post();
    assert.equal(reply.status, 200);
    const result = await reply.json();
    assert.equal(result.status, "complete");
    assert.equal(result.source.text, source.text);
    assert.equal(result.cards[0].quote, unit.quote);
    assert.equal(result.cards.length, 1);
    assert.deepEqual(result.cards[0].nodes, [{ id: "s_keynes", role: "echoes" }]);
    assert.equal(result.cards[0].check, null);
    assert.equal("startMs" in result.cards[0], false);
    assert.ok(JSON.stringify(prompt).includes("https://exemplo.org @economia"));
    assert.deepEqual(await (await mf.dispatchFetch(`http://localhost/api/posts/results/${result.id}`)).json(), result);
    assert.deepEqual(await (await mf.dispatchFetch("http://localhost/api/videos")).json(), { videos: [] });
  } finally { await mf.dispose(); }
});

test("an ungrounded response fails, Retry can succeed empty, and empty persists explicitly", async () => {
  let broken = true;
  let calls = 0;
  const { mf, post } = await harness(() => { calls++; return Response.json({ response: { units: broken ? [{ ...unit, quote: "Isso nunca foi escrito pela autora." }] : [] }, usage: { neurons: 1 } }); });
  try {
    const failed = await post();
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: "unavailable" });
    broken = false;
    const empty = await (await post()).json();
    assert.equal(empty.status, "empty");
    assert.deepEqual(empty.cards, []);
    assert.deepEqual(await (await mf.dispatchFetch(`http://localhost/api/posts/results/${empty.id}`)).json(), empty);
    broken = true;
    assert.deepEqual(await (await post()).json(), empty);
    assert.equal(calls, 2);
  } finally { await mf.dispose(); }
});

test("incomplete or nonpublic sources and impossible publication dates never reach the model", async () => {
  let calls = 0;
  const { mf, post } = await harness(() => { calls++; return Response.json({ response: { units: [] } }); });
  try {
    for (const patch of [{ complete: false }, { visibility: "protected" }, { visibility: null }, { author: "" }, { handle: "other" }, { publishedAt: "2026-02-30T12:00:00.000Z" }]) {
      assert.equal((await post({ ...source, ...patch })).status, 400, JSON.stringify(patch));
    }
    assert.equal(calls, 0);
  } finally { await mf.dispose(); }
});

test("a token-limited model completion is a failure even if it contains valid-looking empty JSON", async () => {
  const { mf, post } = await harness(() => Response.json({ choices: [{ finish_reason: "length", message: { content: '{"units":[]}' } }] }));
  try { assert.equal((await post()).status, 503); }
  finally { await mf.dispose(); }
});

test("the existing daily provider cap refuses fresh analysis without calling a model", async () => {
  let calls = 0;
  const { mf, post } = await harness(() => { calls++; return Response.json({ response: { units: [] } }); }, { DAILY_NEURON_CAP: "0", DAILY_USD_CAP: "0" });
  try {
    const reply = await post();
    assert.equal(reply.status, 429);
    assert.deepEqual(await reply.json(), { error: "neurons" });
    assert.equal(calls, 0);
  } finally { await mf.dispose(); }
});
