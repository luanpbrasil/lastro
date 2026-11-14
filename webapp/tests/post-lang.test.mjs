import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const out = await build({ entryPoints: ["tests/post-lang-entry.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { postLanguage, relevantPost, parsePost, postWithWorkersAI, notesRules, namesPolitics } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const claims = {
  pt: "Juros altos reduzem o investimento no Brasil. A política monetária precisa considerar o desemprego.",
  en: "High interest rates reduce investment. The central bank should weigh unemployment, not only inflation.",
  es: "Las tasas de interés altas reducen la inversión. El banco central debe considerar el desempleo.",
};
const chat = {
  pt: "Hoje o meu time venceu o campeonato de futebol.",
  en: "Just finished a great book about cooking, highly recommend it to everyone.",
  es: "Hoy mi equipo ganó el campeonato de fútbol, qué partido increíble.",
};

test("post language: X's tag, pt/en/es only", () => {
  for (const [tag, want] of [["pt", "pt"], ["pt-BR", "pt"], ["en", "en"], ["en-GB", "en"], ["es", "es"], ["ES", "es"], ["fr", null], ["und", null], ["qme", null], ["", null], ["en_US", null], ["english", null]]) {
    assert.equal(postLanguage(tag), want, tag);
  }
});

test("relevance: a claim passes and chit-chat is skipped, in each language", () => {
  for (const lang of ["pt", "en", "es"]) {
    assert.equal(relevantPost(claims[lang], lang), true, `${lang} claim`);
    assert.equal(relevantPost(chat[lang], lang), false, `${lang} chit-chat`);
    assert.equal(relevantPost(claims[lang].replace(/\.$/, "?"), lang), false, `${lang} question`);
  }
  // English and Spanish have no topic model: two different subjects stand in for it.
  assert.equal(relevantPost("The government shutdown is ruining my holiday plans this year, honestly.", "en"), false, "one subject");
  assert.equal(relevantPost("Tariffs raise prices for consumers and will push inflation up next year.", "en"), true);
  assert.equal(relevantPost("El gobierno debe recortar el gasto público porque el déficit mantiene alta la inflación.", "es"), true);
  assert.equal(relevantPost("Inflation, interest rates, the central bank and the public debt.", "en"), false, "a topic list without an assertion");
});

test("relevance: a supported claim in an unsupported or unknown language is skipped", () => {
  for (const tag of ["fr", "de", "und", "", "zxx"]) assert.equal(relevantPost(claims.en, tag), false, tag);
  assert.equal(relevantPost("Des taux d'intérêt élevés réduisent l'investissement et la banque centrale doit agir.", "fr"), false);
});

const source = { postId: "1", url: "https://x.com/ana/status/1", author: "Ana", handle: "ana", publishedAt: null, text: claims.en, lang: "en", visibility: "public", complete: true };

test("parsePost: the post's language is validated, not fixed to pt", () => {
  for (const lang of ["pt", "en", "es", "pt-BR"]) assert.equal(parsePost({ ...source, lang })?.lang, lang, lang);
  for (const lang of ["fr", "und", "", "pt_BR", "en-US-x-something-long", 1, null, undefined]) assert.equal(parsePost({ ...source, lang }), null, String(lang));
});

test("prompt: cards are written in the post's language, with pt/en/es examples", async () => {
  let system = "";
  await postWithWorkersAI({ run: async (_model, input) => { system = input.messages[0].content; return { response: { units: [] } }; } }, source);
  assert.match(system, /from a public written post\./);
  assert.match(system, /in the language of the post/);
  assert.doesNotMatch(system, /Portuguese public written post|sentence in Portuguese/);
  for (const example of ["A autora afirma que", "The author argues that", "La autora sostiene que"]) assert.ok(system.includes(example), example);
  assert.match(notesRules("post"), /in the language of the post/);
  assert.match(notesRules("transcript"), /in the language of the video/);
});

test("name list on English and Spanish text", () => {
  for (const t of ["the PT government cut spending", "Lula's plan raises taxes", "el gobierno de Lula", "PT and PL voted", "PSDB y PL", "the Workers' Party", "el Partido de los Trabajadores", "Bolsonaro's tariffs"]) {
    assert.ok(namesPolitics(t).length > 0, t);
  }
  for (const t of ["the president raised taxes", "el ministro de Hacienda", "the PL 2630 bill on platforms", "the central bank is independent"]) {
    assert.deepEqual(namesPolitics(t), [], t);
  }
});
