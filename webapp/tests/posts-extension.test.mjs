import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const ownText = "Juros altos reduzem o investimento no Brasil.";
const card = { quote: ownText, paraphrase: "A autora afirma que juros altos reduzem o investimento no Brasil.", kind: "theory", nodes: [{ id: "s_keynes", role: "echoes" }], indicator: null, claimed_value: null, period: null, check: null };
const bundle = await build({ entryPoints: ["extension/src/x-content.ts"], bundle: true, write: false, format: "iife", loader: { ".css": "text" } });
function postMarkup({ text = ownText, lock = false, incomplete = false, metadata = true, quote = true, lang = "pt", timestamp = "2026-11-01T12:00:00.000Z", handle = "ana", author = "Ana", postId = "1234567890123456789" } = {}) {
  return `<article data-testid="tweet">
    ${metadata ? `<div data-testid="User-Name"><a href="/${handle}">${author}</a><a href="/${handle}">@${handle}</a>${lock ? '<svg aria-label="Conta protegida" data-testid="icon-lock"></svg>' : ''}</div><a href="/${handle}/status/${postId}"><time datetime="${timestamp}">${timestamp.slice(0, 10)}</time></a>` : ''}
    <div data-testid="tweetText" lang="${lang}">${text}</div>
    ${incomplete ? '<button data-testid="tweet-text-show-more-link">Mostrar mais</button>' : ''}
    ${quote ? '<div role="link" tabindex="0"><div data-testid="User-Name">Bruno</div><div data-testid="tweetText" lang="pt">O governo deveria cortar todos os impostos.</div></div>' : ''}
    <div data-testid="tweetPhoto">Foto: não incluir</div><div role="group">Curtir Responder Compartilhar</div>
    </article>`;
}
function fixture(options = {}) {
  const posts = options.posts ?? [options, { text: "A inflação brasileira atingiu 9%.", metadata: false, quote: false }];
  return `<html lang="pt"><head><meta charset="utf-8"></head><body><main>${posts.map(post => `<div data-testid="cellInnerDiv">${postMarkup(post)}</div>`).join("")}</main></body></html>`;
}
async function pageFor(options = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: options.locale ?? "pt-BR" });
    page.setDefaultTimeout(3000);
    await page.route("https://x.com/**", route => route.fulfill({ contentType: "text/html", body: fixture(options) }));
    await page.goto(`https://x.com${options.path ?? "/ana/status/1234567890123456789"}`);
    await page.evaluate(() => { window.requests = []; window.replies = []; window.chrome = { runtime: { sendMessage: message => { window.requests.push(message); return new Promise(resolve => { window.reply = resolve; window.replies.push(resolve); }); } } }; });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    return { browser, page };
  } catch (error) { await browser.close(); throw error; }
}

const surfaces = { home: "/home", detail: "/ana/status/1234567890123456789", search: "/search?q=juros&f=live", profile: "/ana" };
const otherPost = { handle: "bia", author: "Bia", postId: "1234567890123456790", text: "Juros altos reduzem o investimento e o emprego no Brasil." };
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test("install/update injects only each host's declared scripts, preserving YouTube's page-world hook", async () => {
  const background = await build({ entryPoints: ["extension/src/background.ts"], bundle: true, write: false, format: "iife", define: { __WORKER_BASE__: '"https://fixture.invalid"' } });
  const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
  const injected = [];
  let installed;
  const chrome = {
    runtime: { getManifest: () => manifest, onMessage: { addListener() {} }, onInstalled: { addListener(listener) { installed = listener; } } },
    action: { onClicked: { addListener() {} } },
    tabs: {
      onRemoved: { addListener() {} },
      query: async ({ url }) => [
        { id: 1, url: "https://www.youtube.com/watch?v=abcdefghijk" },
        { id: 2, url: "https://x.com/home" },
        { id: 3, url: "https://x.com/ana", discarded: true },
      ].filter(tab => [url].flat().some(pattern => tab.url.startsWith(pattern.replace("*", "")))),
    },
    scripting: { executeScript: async script => { injected.push(JSON.parse(JSON.stringify(script))); } },
  };
  runInNewContext(background.outputFiles[0].text, { chrome, URL });
  installed({ reason: "update" });
  await new Promise(setImmediate);
  assert.deepEqual(injected, [
    { target: { tabId: 1 }, world: "MAIN", files: ["hook.js"] },
    { target: { tabId: 1 }, files: ["content.js"] },
    { target: { tabId: 2 }, files: ["x-content.js"] },
  ]);
});

test("the newer YouTube content script still opens saved context and seeks through its video timestamp", async () => {
  const youtube = await build({ entryPoints: ["extension/src/content.ts"], bundle: true, write: false, format: "iife", loader: { ".css": "text" } });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ locale: "pt-BR" });
    page.setDefaultTimeout(3000);
    await page.route("**/*", route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: '<html><body><div id="movie_player" style="width:1000px;height:700px;position:relative"><video class="html5-main-video"></video></div></body></html>' })
      : route.abort());
    await page.goto("https://www.youtube.com/watch?v=abcdefghijk");
    await page.evaluate(card => {
      window.requests = [];
      window.chrome = { runtime: {
        id: "fixture", getURL: path => `https://fixture.invalid/${path}`,
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage: async message => {
          window.requests.push(message);
          if (message.path === "/api/videos/abcdefghijk/cards?after=0") return { status: 200, data: { cards: [{ ...card, id: 1, startMs: 15000, seg: 0, matchScore: 1 }], cursor: 1, pendingChunks: 0 } };
          return { status: 200, data: {} };
        },
      } };
      window.addEventListener("message", event => {
        if (event.data?.__lastro_meta_req) window.postMessage({ __lastro_meta: true, videoId: "abcdefghijk", found: true, title: "Receita de bolo de chocolate", description: "Uma receita de bolo." }, location.origin);
      });
    }, card);
    await page.addScriptTag({ content: youtube.outputFiles[0].text });
    await page.locator(".ov-status").filter({ hasText: "1 ideia" }).waitFor();
    await page.locator(".ov-main").click();
    await page.locator(".ov-row-open").click();
    await page.getByText("A ideia por trás", { exact: true }).waitFor();
    await page.locator(".ov-time").click();
    assert.equal(await page.locator("video").evaluate(video => video.currentTime), 15);
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
    assert.equal(await page.evaluate(() => window.requests.some(message => message.path?.startsWith("/api/posts/"))), false);
  } finally { await browser.close(); }
});

test("reinjecting the X content script replaces its old UI and ignores its pending result", async () => {
  const { browser, page } = await pageFor({ path: "/home", posts: [{}] });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await settled(page);
    assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 1);
    assert.equal(await page.locator("section.panel").count(), 0);
    await page.evaluate(card => window.replies[0]({ status: 200, data: { id: "old", status: "complete", source: JSON.parse(window.requests[0].body), cards: [card] } }), card);
    assert.equal(await page.locator("section.panel").count(), 0);
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => window.requests.length), 2);
  } finally { await browser.close(); }
});

test("embedded articles stay excluded and a mounted item loses its UI when it becomes an embed or stops being a post", async () => {
  const { browser, page } = await pageFor({ path: "/ana", posts: [{}] });
  try {
    await page.evaluate(markup => document.querySelector("article").insertAdjacentHTML("beforeend", markup), postMarkup(otherPost));
    await settled(page);
    assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="cellInnerDiv"]');
      cell.setAttribute("role", "link");
      cell.setAttribute("tabindex", "0");
    });
    await settled(page);
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
    await page.evaluate(() => document.querySelector('[data-testid="cellInnerDiv"]').removeAttribute("role"));
    await page.getByRole("button", { name: "Lastro", exact: true }).waitFor();
    await page.evaluate(() => document.querySelector("article").removeAttribute("data-testid"));
    await settled(page);
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
    assert.equal(await page.evaluate(() => window.requests.length), 1);
  } finally { await browser.close(); }
});

test("recycled sources cannot render a late reply even before the next animation frame", async () => {
  const { browser, page } = await pageFor({ path: "/search?q=juros", posts: [{}] });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    const staleCards = await page.evaluate(async card => {
      document.querySelector('article [data-testid="tweetText"]').textContent = "Hoje o meu time venceu o campeonato de futebol.";
      window.replies[0]({ status: 200, data: { id: "old", status: "complete", source: JSON.parse(window.requests[0].body), cards: [card] } });
      await Promise.resolve();
      return [...document.querySelectorAll("[data-lastro-post]")].flatMap(host => [...host.shadowRoot.querySelectorAll(".ov-card")]).length;
    }, card);
    assert.equal(staleCards, 0);
    await settled(page);
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
  } finally { await browser.close(); }
});

test("moving an article to another feed cell removes its old panel and attaches one fresh action", async () => {
  const { browser, page } = await pageFor({ path: "/home", posts: [{}] });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.evaluate(() => {
      const cell = document.createElement("div");
      cell.dataset.testid = "cellInnerDiv";
      document.querySelector("main").append(cell);
      cell.append(document.querySelector("article"));
    });
    await settled(page);
    const cells = page.locator('[data-testid="cellInnerDiv"]');
    assert.equal(await cells.nth(0).locator("[data-lastro-post]").count(), 0);
    assert.equal(await cells.nth(1).getByRole("button", { name: "Lastro", exact: true }).count(), 1);
    assert.equal(await page.locator("section.panel").count(), 0);
    await page.evaluate(card => window.replies[0]({ status: 200, data: { id: "late", status: "complete", source: JSON.parse(window.requests[0].body), cards: [card] } }), card);
    assert.equal(await page.locator("section.panel").count(), 0);
    assert.equal(await page.evaluate(() => window.requests.length), 1);
  } finally { await browser.close(); }
});

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: each action submits only its own post and keeps independent inline panels`, async () => {
  const { browser, page } = await pageFor({ path, posts: [{}, otherPost] });
  try {
    const cells = page.locator('[data-testid="cellInnerDiv"]');
    assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 2);
    assert.equal(await page.evaluate(() => window.requests.length), 0);
    await cells.nth(1).getByRole("button", { name: "Lastro", exact: true }).click();
    await cells.nth(0).getByRole("button", { name: "Lastro", exact: true }).click();
    const sources = await page.evaluate(() => window.requests.map(message => JSON.parse(message.body)));
    assert.deepEqual(sources.map(({ postId, text, author }) => ({ postId, text, author })), [
      { postId: "1234567890123456790", text: otherPost.text, author: "Bia" },
      { postId: "1234567890123456789", text: ownText, author: "Ana" },
    ]);
    await page.evaluate(({ sources, card }) => {
      window.replies[1]({ status: 200, data: { id: "ana", status: "complete", source: sources[1], cards: [card], analysedAt: 1 } });
      window.replies[0]({ status: 200, data: { id: "bia", status: "empty", source: sources[0], cards: [], analysedAt: 1 } });
    }, { sources, card });
    await cells.nth(0).getByText("A ideia por trás", { exact: true }).waitFor();
    await cells.nth(1).getByText("Nenhuma afirmação relevante foi encontrada neste post.", { exact: true }).waitFor();
    await cells.nth(0).getByRole("button", { name: "Fechar", exact: true }).click();
    assert.equal(await cells.nth(0).locator("section.panel").count(), 0);
    assert.equal(await cells.nth(1).locator("section.panel").count(), 1);
  } finally { await browser.close(); }
});

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: inserted, replaced, edited and removed posts retain one current action with no automatic requests`, async () => {
  const { browser, page } = await pageFor({ path, posts: [] });
  try {
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
    await page.evaluate(markup => document.querySelector("main").insertAdjacentHTML("beforeend", `<div data-testid="cellInnerDiv">${markup}</div>`), postMarkup());
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    // Replace the DOM node while its request is still in flight.
    await page.evaluate(markup => { document.querySelector("article").outerHTML = markup; }, postMarkup(otherPost));
    await settled(page);
    assert.equal(await page.locator("[data-lastro-post]").count(), 1);
    assert.equal(await page.locator("section.panel").count(), 0);
    await page.evaluate(card => window.replies[0]({ status: 200, data: { id: "old", status: "complete", source: JSON.parse(window.requests[0].body), cards: [card] } }), card);
    assert.equal(await page.locator(".ov-card").count(), 0);
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[1].body).postId), "1234567890123456790");
    // Recycle the same node and preserve the new text exactly in the next explicit request.
    const edited = "Juros altos reduzem o investimento no Brasil. A política monetária precisa considerar o desemprego.";
    await page.evaluate(text => { document.querySelector('article [data-testid="tweetText"]').textContent = text; }, edited);
    await settled(page);
    assert.equal(await page.locator("section.panel").count(), 0);
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[2].body).text), edited);
    await page.evaluate(() => {
      const lock = document.createElement("span");
      lock.setAttribute("aria-label", "Protected account");
      document.querySelector('[data-testid="User-Name"]').append(lock);
    });
    await settled(page);
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
    await page.evaluate(() => document.querySelector('[aria-label="Protected account"]').remove());
    await page.getByRole("button", { name: "Lastro", exact: true }).waitFor();
    await page.evaluate(() => document.querySelector("article").remove());
    await settled(page);
    assert.equal(await page.locator("[data-lastro-post]").count(), 0);
    assert.equal(await page.evaluate(() => window.requests.length), 3);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await browser.close(); }
});

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: English interface retains Portuguese source text and translated loading, Retry and empty states`, async () => {
  const { browser, page } = await pageFor({ path, locale: "en-US", posts: [{}] });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.getByText("Analysing this post…", { exact: true }).waitFor();
    await page.getByText("Post by Ana (@ana)", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[0].body).text), ownText);
    await page.evaluate(() => window.reply({ status: 503, data: { error: "unavailable" } }));
    await page.getByText("This post could not be analysed.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.evaluate(() => window.reply({ status: 200, data: { id: "empty", status: "empty", cards: [], source: JSON.parse(window.requests[1].body), analysedAt: 1 } }));
    await page.getByText("No relevant claims were found in this post.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await page.locator("section.panel").count(), 0);
  } finally { await browser.close(); }
});

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

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: a post comparison displays the official period, source, series and historical revision limitation without playback`, async () => {
  const text = "O Banco Central mantém a Selic em 4,5% para controlar a inflação no Brasil hoje.";
  const { browser, page } = await pageFor({ path, text, timestamp: "2020-01-31T12:00:00.000Z" });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[0].body).publishedAt), "2020-01-31T12:00:00.000Z");
    const comparison = { ...card, quote: text, paraphrase: "A autora afirma que a meta da Selic está em 4,5% ao ano.", kind: "fact", indicator: "selic_meta", claimed_value: 4.5, check: { verdict: "confere", official: {
      label: "Meta da Selic", unit: "% a.a.", source: "Banco Central (SGS 432)", sourceUrl: "https://www3.bcb.gov.br/sgspub/",
      value: 4.5, date: "2020-01-31", periodLabel: "31/01/2020", vintage: "current-series",
      series: [{ date: "2019-12-31", value: 5 }, { date: "2020-01-31", value: 4.5 }],
    } } };
    await page.evaluate(card => window.reply({ status: 200, data: { id: "checked", status: "complete", source: JSON.parse(window.requests[0].body), cards: [card], analysedAt: 1 } }), comparison);
    await page.locator(".verdict.confere").waitFor();
    assert.match(await page.locator(".fact-block").innerText(), /4,5% ao ano/);
    assert.match(await page.locator(".fact-block").innerText(), /31 jan 2020/);
    assert.match(await page.locator(".fact-block").innerText(), /citado no post: 4,5% ao ano/);
    assert.equal(await page.getByRole("link", { name: "Fonte: Banco Central (SGS 432)" }).getAttribute("href"), "https://www3.bcb.gov.br/sgspub/");
    assert.equal(await page.locator("svg.spark path.spark-line").count(), 1);
    assert.match(await page.locator(".fact-block").innerText(), /Série consultada agora; pode conter revisões/);
    assert.match(await page.locator(".fact-block").innerText(), /não comprova o dado disponível na publicação/);
    assert.equal(await page.locator(".ov-time").count(), 0);
    if (surface === "profile" && process.env.LASTRO_SCREENSHOT) {
      await page.addStyleTag({ content: "body{margin:24px;background:#fff;color:#24312b;font:15px/1.5 system-ui}main{max-width:640px;margin:auto}article{padding:16px;border:1px solid #d7e0da;border-radius:12px}article a{color:#246747}article [role=link]{margin:12px;padding:12px;border-left:2px solid #d7e0da}" });
      await page.screenshot({ path: process.env.LASTRO_SCREENSHOT, fullPage: true });
    }
  } finally { await browser.close(); }
});

test("impossible observed publication dates stay missing instead of normalizing to another day", async () => {
  const { browser, page } = await pageFor({ timestamp: "2026-02-30T12:00:00.000Z" });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[0].body).publishedAt), null);
  } finally { await browser.close(); }
});

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: protected, missing-source, unrelated and uncertain posts make no model requests`, async () => {
  for (const options of [{ lock: true }, { metadata: false }, { lang: "" }, { lang: "en" }, { text: "Hoje o meu time venceu o campeonato de futebol." }, { text: "Juros altos reduzem o investimento no Brasil?" }, { text: "Banco Central, inflação, juros, PIB e dívida pública." }]) {
    const { browser, page } = await pageFor({ ...options, path });
    try {
      assert.equal(await page.getByRole("button", { name: "Lastro", exact: true }).count(), 0, JSON.stringify(options));
      assert.equal(await page.evaluate(() => window.requests.length), 0);
      if (options.metadata === false) assert.equal(await page.getByText("Informações da fonte indisponíveis; não é possível analisar este post.", { exact: true }).count(), 1);
    } finally { await browser.close(); }
  }
});

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: truncated text waits for viewer expansion before the full selected text can be submitted`, async () => {
  const { browser, page } = await pageFor({ path, incomplete: true });
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

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: failure offers Retry; a successful empty result is explicit and closable`, async () => {
  const { browser, page } = await pageFor({ path });
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

for (const [surface, path] of Object.entries(surfaces)) test(`${surface}: an analysis in progress offers Retry and reopening requests the server again`, async () => {
  const { browser, page } = await pageFor({ path });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.evaluate(() => window.reply({ status: 409, data: { error: "in_progress" } }));
    await page.getByText("Este post já está sendo analisado. Tente de novo em instantes.", { exact: true }).waitFor({ timeout: 2000 });
    await page.getByRole("button", { name: "Tentar de novo", exact: true }).click();
    assert.equal(await page.evaluate(() => window.requests.length), 2);
    await page.evaluate(() => window.reply({ status: 200, data: { id: "shared-empty", status: "empty", cards: [], source: JSON.parse(window.requests[1].body), analysedAt: 1 } }));
    await page.getByText("Nenhuma afirmação relevante foi encontrada neste post.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => window.requests.length), 3);
    assert.equal(await page.evaluate(() => window.requests[2].body === window.requests[0].body), true);
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

test("an edited inline emoji clears the prior panel before requesting its changed written text", async () => {
  const { browser, page } = await pageFor({ path: "/home", posts: [{ text: `${ownText} <img alt="📉" src="data:,">` }] });
  try {
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    await page.evaluate(() => { document.querySelector('article img').alt = "📈"; });
    await settled(page);
    assert.equal(await page.locator("section.panel").count(), 0);
    await page.getByRole("button", { name: "Lastro", exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(window.requests[1].body).text), `${ownText} 📈`);
  } finally { await browser.close(); }
});
