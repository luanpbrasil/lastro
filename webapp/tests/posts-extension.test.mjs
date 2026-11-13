import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const ownText = "Juros altos reduzem o investimento no Brasil.";
const card = { quote: ownText, paraphrase: "A autora afirma que juros altos reduzem o investimento no Brasil.", kind: "theory", nodes: [{ id: "s_keynes", role: "echoes" }], indicator: null, claimed_value: null, period: null, check: null };
const bundle = await build({ entryPoints: ["extension/src/x-content.ts"], bundle: true, write: false, format: "iife", loader: { ".css": "text" } });
function fixture({ text = ownText, lock = false, incomplete = false, metadata = true, quote = true, lang = "pt" } = {}) {
  return `<html lang="pt"><head><meta charset="utf-8"></head><body><main><article data-testid="tweet">
    ${metadata ? `<div data-testid="User-Name"><a href="/ana">Ana</a><a href="/ana">@ana</a>${lock ? '<svg aria-label="Conta protegida" data-testid="icon-lock"></svg>' : ''}</div><a href="/ana/status/1234567890123456789"><time datetime="2026-11-01T12:00:00.000Z">1 nov</time></a>` : ''}
    <div data-testid="tweetText" lang="${lang}">${text}</div>
    ${incomplete ? '<button data-testid="tweet-text-show-more-link">Mostrar mais</button>' : ''}
    ${quote ? '<div role="link" tabindex="0"><div data-testid="User-Name">Bruno</div><div data-testid="tweetText" lang="pt">O governo deveria cortar todos os impostos.</div></div>' : ''}
    <div data-testid="tweetPhoto">Foto: não incluir</div><div role="group">Curtir Responder Compartilhar</div>
    </article><article data-testid="tweet"><div data-testid="tweetText" lang="pt">A inflação brasileira atingiu 9%.</div></article></main></body></html>`;
}
async function pageFor(options = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ locale: "pt-BR" });
  await page.route("https://x.com/**", route => route.fulfill({ contentType: "text/html", body: fixture(options) }));
  await page.goto("https://x.com/ana/status/1234567890123456789");
  await page.evaluate(() => { window.requests = []; window.chrome = { runtime: { sendMessage: message => { window.requests.push(message); return new Promise(resolve => { window.reply = resolve; }); } } }; });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { browser, page };
}

test("the selected public post opens attributed inline context only after a click and can be closed", async () => {
  const { browser, page } = await pageFor();
  try {
    assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.requests.length), 0);
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.getByText("Analisando este post…", { exact: true }).waitFor();
    const request = await page.evaluate(() => window.requests[0]);
    assert.equal(request.path, "/api/posts/analyze");
    const source = JSON.parse(request.body);
    assert.equal(source.text, ownText);
    assert.equal(source.author, "Ana");
    assert.equal(source.postId, "1234567890123456789");
    await page.evaluate(({ source, card }) => window.reply({ status: 200, data: { id: "result", status: "complete", source, cards: [card], analysedAt: 1 } }), { source, card });
    await page.getByText("A ideia por trás", { exact: true }).waitFor();
    assert.ok(await page.getByText("Quem discorda", { exact: true }).count());
    assert.ok(await page.getByText("Para ir além", { exact: true }).count());
    assert.ok(await page.getByText("Post de Ana (@ana)", { exact: true }).count());
    assert.equal(await page.locator(".ov-time").count(), 0);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    assert.equal(await page.getByText("A ideia por trás", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});

test("protected, missing-source, unrelated and uncertain posts make no model requests", async () => {
  for (const options of [{ lock: true }, { metadata: false }, { lang: "" }, { lang: "en" }, { text: "Hoje o meu time venceu o campeonato de futebol." }, { text: "Juros altos reduzem o investimento no Brasil?" }, { text: "Banco Central, inflação, juros, PIB e dívida pública." }]) {
    const { browser, page } = await pageFor(options);
    try {
      assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 0, JSON.stringify(options));
      assert.equal(await page.evaluate(() => window.requests.length), 0);
      if (options.metadata === false) assert.equal(await page.getByText("Informações da fonte indisponíveis; não é possível analisar este post.", { exact: true }).count(), 1);
    } finally { await browser.close(); }
  }
});

test("truncated text waits for viewer expansion before the full selected text can be submitted", async () => {
  const { browser, page } = await pageFor({ incomplete: true });
  try {
    assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 0);
    assert.equal(await page.getByText("Expanda o post completo no X antes de analisar.", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.requests.length), 0);
    await page.evaluate(() => {
      const article = document.querySelector('article');
      article.querySelector('[data-testid="tweetText"]').textContent = "Juros altos reduzem o investimento no Brasil. A política monetária precisa considerar o desemprego.";
      article.querySelector('[data-testid="tweet-text-show-more-link"]').remove();
    });
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[0].body).text), "Juros altos reduzem o investimento no Brasil. A política monetária precisa considerar o desemprego.");
  } finally { await browser.close(); }
});

test("failure offers Retry; a successful empty result is explicit and closable", async () => {
  const { browser, page } = await pageFor();
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.evaluate(() => window.reply({ status: 503, data: { error: "unavailable" } }));
    await page.getByText("Não foi possível analisar este post.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Tentar de novo", exact: true }).click();
    assert.equal(await page.evaluate(() => window.requests.length), 2);
    await page.evaluate(() => window.reply({ status: 200, data: { id: "empty", status: "empty", cards: [], source: JSON.parse(window.requests[1].body), analysedAt: 1 } }));
    await page.getByText("Nenhuma afirmação relevante foi encontrada neste post.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Tentar de novo", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    assert.equal(await page.getByText("Nenhuma afirmação relevante foi encontrada neste post.", { exact: true }).count(), 0);
  } finally { await browser.close(); }
});

test("small labeled Portuguese relevance sample through the extension action", async () => {
  const samples = JSON.parse(await readFile("tests/fixtures/portuguese-posts.json", "utf8"));
  const { browser, page } = await pageFor();
  const results = [];
  try {
    for (const sample of samples) {
      await page.evaluate(text => { document.querySelector('article [data-testid="tweetText"]').textContent = text; }, sample.text);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const offered = await page.getByRole("button", { name: "Lastro", exact: true }).count() === 1;
      results.push({ ...sample, offered });
      if (sample.label !== "relevant") assert.equal(offered, false, sample.text);
    }
    assert.equal(await page.evaluate(() => window.requests.length), 0);
    console.log("Portuguese relevance sample:", JSON.stringify(results));
  } finally { await browser.close(); }
});

test("selected authored text retains line breaks and inline emoji instead of dropping written characters", async () => {
  const { browser, page } = await pageFor({ text: 'Juros altos reduzem o investimento no Brasil. <img alt="📉" src="data:,"> <br>A inflação deve ficar &lt; 4%, segundo @ana.' });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[0].body).text), "Juros altos reduzem o investimento no Brasil. 📉 \nA inflação deve ficar < 4%, segundo @ana.");
  } finally { await browser.close(); }
});
