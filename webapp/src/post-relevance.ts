import { shouldAnalyze, TopicScorer, type TopicModel } from "../../shared/topics";
import topicModel from "../../shared/topics-model.json";
import { postLanguage, type PostLanguage } from "./post-language";

/**
 * Which X posts get the Lastro action, decided in the page before any request, so a feed doesn't trigger a call per
 * post. Pure: used by the extension (extension/src/x-content.ts) and the tests. Languages: src/post-language.ts.
 *
 * SUBJECTS: a concrete policy or economic subject, per language (accents removed, lower case). Without one, the topic
 * model also scores uses such as "economia de bateria" highly.
 */
const SUBJECTS: Record<PostLanguage, RegExp> = {
  pt: /\b(?:selic|inflacao|juros|impostos?|tributaria|tributario|divida publica|banco central|pib|desemprego|politica monetaria|politica fiscal|investimento publico|gastos publicos|governo|congresso|judiciario|executivo|democracia|eleicoes|constituicao|distribuicao de renda)\b/g,
  en: /\b(?:inflation|interest rates?|tax(?:es)?|tariffs?|public debt|national debt|deficit|central bank|federal reserve|gdp|unemployment|monetary policy|fiscal policy|public investment|public spending|government spending|minimum wage|government|congress|parliament|judiciary|supreme court|democracy|elections?|constitution|income distribution|inequality|recession)\b/g,
  es: /\b(?:inflacion|tasas? de interes|impuestos?|aranceles?|deuda publica|deficit|banco central|pib|desempleo|politica monetaria|politica fiscal|inversion publica|gasto publico|salario minimo|gobierno|congreso|parlamento|poder judicial|democracia|elecciones|constitucion|distribucion del ingreso|desigualdad|recesion)\b/g,
};

/** An assertion, per language: topic lists and headlines without one are uncertain, even when they score highly. */
const ASSERTIONS: Record<PostLanguage, (text: string, normalized: string) => boolean> = {
  pt: (text, n) => /(?:^|\s)é(?:\s|$)/i.test(text) || /\b(?:sao|foi|foram|sera|serao|esta|estao|tem|reduz|reduzem|aumenta|aumentam|eleva|elevam|mantem|gera|geram|estimula|estimulam|melhora|melhoram|deve|devem|precisa|precisam|pode|podem|vai|vao|atingiu|chegou|caiu|subiu|impede|impedem|garante|garantem)\b/.test(n),
  en: (_, n) => /\b(?:is|are|was|were|will|has|have|had|reduces?|increases?|raises?|lowers?|keeps?|causes?|creates?|boosts?|hurts?|improves?|should|must|needs?|can|cannot|fell|rose|reached|hit|prevents?|guarantees?|drives?|leads? to)\b/.test(n),
  es: (_, n) => /\b(?:es|son|fue|fueron|sera|seran|esta|estan|tiene|tienen|reduce|reducen|aumenta|aumentan|eleva|elevan|mantiene|mantienen|genera|generan|estimula|estimulan|mejora|mejoran|debe|deben|necesita|necesitan|puede|pueden|va|van|alcanzo|llego|cayo|subio|impide|impiden|garantiza|garantizan)\b/.test(n),
};

const scorer = new TopicScorer(topicModel as TopicModel);

/**
 * Portuguese: a subject, an assertion and the topic model (trained on Portuguese videos). English and Spanish: the
 * topic model can't tell their claims from chit-chat (both score 0.4–0.5), so two different subjects and an
 * assertion stand in for it.
 */
export function relevantPost(text: string, tag: string): boolean {
  const lang = postLanguage(tag);
  if (!lang || text.trim().split(/\s+/).length < 6 || /\?\s*$/.test(text)) return false;
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const subjects = new Set(normalized.match(SUBJECTS[lang]) ?? []);
  if (!subjects.size || !ASSERTIONS[lang](text, normalized)) return false;
  if (lang !== "pt") return subjects.size >= 2;
  const result = scorer.classify(text, "");
  return shouldAnalyze(result) && Math.max(result.scores.economia, result.scores.politica) >= 0.55;
}
