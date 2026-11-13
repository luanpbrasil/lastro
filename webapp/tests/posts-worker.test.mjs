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

async function harness(model, bindings = {}) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-11-01", compatibilityFlags: ["nodejs_compat"], bindings, d1Databases: ["DB"], serviceBindings: { MODEL: model } }));
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations")).filter(n => n.endsWith(".sql")).sort()) {
    const sql = await readFile(`migrations/${name}`, "utf8");
    for (const statement of sql.replace(/--[^\n]*/g, "").split(";").filter(s => s.trim())) await db.prepare(statement).run();
  }
  return { mf, post: (body = source) => mf.dispatchFetch("http://localhost/api/posts/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) };
}

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
  const { mf, post } = await harness(() => Response.json({ response: { units: broken ? [{ ...unit, quote: "Isso nunca foi escrito pela autora." }] : [] }, usage: { neurons: 1 } }));
  try {
    const failed = await post();
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: "unavailable" });
    broken = false;
    const empty = await (await post()).json();
    assert.equal(empty.status, "empty");
    assert.deepEqual(empty.cards, []);
    assert.deepEqual(await (await mf.dispatchFetch(`http://localhost/api/posts/results/${empty.id}`)).json(), empty);
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
