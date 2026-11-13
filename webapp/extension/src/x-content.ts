import { shouldAnalyze, TopicScorer, type TopicModel } from "../../../shared/topics";
import topicModel from "../../../shared/topics-model.json";
import type { PostAnalysis, PostSource } from "../../src/types";
import { el, fullCard } from "../../src/web/cardview";
import { t } from "../../src/web/i18n";
import cardStyles from "../../src/web/overlay.css";
import type { ApiResult } from "./messages";

const scorer = new TopicScorer(topicModel as TopicModel);
const POST = 'article[data-testid="tweet"]';
const EMBEDDED = '[data-testid="quoteTweet"], [role="link"][tabindex="0"]';
// X's public/protected observation is contingent on a complete author header. It is not platform attestation.
const LOCK = '[data-testid="icon-lock"], [aria-label="Protected account"], [aria-label="Conta protegida"], [aria-label="Protected posts"], [aria-label="Posts protegidos"]';

function own(article: HTMLElement, selector: string): HTMLElement[] {
  return [...article.querySelectorAll<HTMLElement>(selector)].filter(e => e.closest(POST) === article && !e.closest(EMBEDDED));
}

function relevant(text: string, lang: string): boolean {
  if (!/^pt(?:-|$)/i.test(lang) || text.trim().split(/\s+/).length < 6 || /\?\s*$/.test(text)) return false;
  // The video-trained model also scores uses such as "economia de bateria" highly.
  // Require a concrete policy/economic subject as well as a confident model score.
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (!/\b(?:selic|inflacao|juros|impostos?|tributaria|tributario|divida publica|banco central|pib|desemprego|politica monetaria|politica fiscal|investimento publico|gastos publicos|governo|congresso|judiciario|executivo|democracia|eleicoes|constituicao|distribuicao de renda)\b/.test(normalized)) return false;
  // Topic lists and headlines without an assertion are uncertain, even when they score highly.
  if (!/(?:^|\s)é(?:\s|$)/i.test(text) && !/\b(?:sao|foi|foram|sera|serao|esta|estao|tem|reduz|reduzem|aumenta|aumentam|eleva|elevam|mantem|gera|geram|estimula|estimulam|melhora|melhoram|deve|devem|precisa|precisam|pode|podem|vai|vao|atingiu|chegou|caiu|subiu|impede|impedem|garante|garantem)\b/.test(normalized)) return false;
  const result = scorer.classify(text, "");
  return shouldAnalyze(result) && Math.max(result.scores.economia, result.scores.politica) >= 0.55;
}

type Observation = { state: "ready"; source: PostSource } | { state: "expand" } | { state: "unknown" } | { state: "skip" };
/** X renders written emoji as inline images and line breaks as <br>; innerText drops the emoji. */
function writtenText(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const image of copy.querySelectorAll("img")) image.replaceWith(document.createTextNode(image.alt));
  for (const br of copy.querySelectorAll("br")) br.replaceWith(document.createTextNode("\n"));
  return copy.textContent ?? "";
}
function observe(article: HTMLElement): Observation {
  const texts = own(article, '[data-testid="tweetText"]');
  if (texts.length !== 1) return { state: "skip" };
  const text = writtenText(texts[0]);
  if (!relevant(text, texts[0].lang)) return { state: "skip" };
  if (own(article, LOCK).length) return { state: "skip" };
  const header = own(article, '[data-testid="User-Name"]')[0];
  const authorLinks = header ? [...header.querySelectorAll<HTMLAnchorElement>('a[href]')] : [];
  const handleLink = authorLinks.find(a => /^@[A-Za-z0-9_]{1,15}$/.test(a.innerText.trim()));
  const handle = handleLink?.innerText.trim().slice(1);
  const author = authorLinks.find(a => a !== handleLink && a.pathname.toLowerCase() === `/${handle}`.toLowerCase())?.innerText.trim();
  const time = own(article, "time[datetime]")[0];
  const permalink = time?.closest<HTMLAnchorElement>('a[href]');
  const match = permalink?.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})$/);
  if (!header || !author || !handle || !match || match[1].toLowerCase() !== handle.toLowerCase() || handleLink?.pathname.toLowerCase() !== `/${handle}`.toLowerCase()) return { state: "unknown" };
  // Ticket 01 intentionally offers only the selected detail-page post, never the neighboring replies.
  const selected = location.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1];
  if (selected !== match[2]) return { state: "skip" };
  if (own(article, '[data-testid="tweet-text-show-more-link"]').length) return { state: "expand" };
  if (text.length > 10_000) return { state: "unknown" };
  const timestamp = time.getAttribute("datetime");
  const publishedAt = timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
  return { state: "ready", source: { postId: match[2], url: `https://x.com/${handle}/status/${match[2]}`, author, handle, publishedAt, text, lang: "pt", visibility: "public", complete: true } };
}

const styles = `:host{display:block;color:#24312b;font:14px/1.5 system-ui;--muted:#52645a;--faint:#64766b;--line:#d7e0da;--brand-gold:#9c742b;--accent:#246747;--surface:#f6f9f6}*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:1px solid #b3c8ba;border-radius:8px;background:#f6f9f6;color:#245239;padding:6px 12px}button:focus-visible{outline:2px solid #246747;outline-offset:2px}.panel{background:#f6f9f6;border:1px solid #b3c8ba;border-radius:12px;padding:14px;margin:10px 0;overflow-wrap:anywhere}.bar{display:flex;justify-content:space-between;align-items:center;gap:12px}.ov-card{display:grid;gap:12px;padding:12px 0;border-top:1px solid var(--line)}.ov-card p,.ov-card h4{margin:0}.ov-card blockquote{white-space:pre-wrap;margin:0}.muted{color:var(--muted)}.notice{font-size:12px;color:var(--muted)}.ov-meta{display:flex;gap:12px}`;

type Mounted = { host: HTMLElement; signature: string; dispose: () => void };
const mounted = new Map<HTMLElement, Mounted>();
function mount(article: HTMLElement, observation: Exclude<Observation, { state: "skip" }>, signature: string): Mounted {
  const host = el("div");
  host.dataset.lastroPost = "";
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", "", cardStyles + styles));
  let active = true;
  let generation = 0;
  let panel: HTMLElement | undefined;
  const close = () => { generation++; panel?.remove(); panel = undefined; };
  if (observation.state !== "ready") root.append(el("p", "notice", t(`post.${observation.state}`)));
  else {
    const action = el("button", "", "Lastro");
    action.type = "button";
    const source = observation.source;
    const show = async () => {
      // Re-read at the explicit action: edited, collapsed, recycled or protected sources cannot use stale text.
      const current = observe(article);
      if (current.state !== "ready" || JSON.stringify(current.source) !== JSON.stringify(source)) { refresh(); return; }
      close();
      const requestGeneration = generation;
      panel = el("section", "panel");
      panel.setAttribute("aria-label", "Lastro");
      const bar = el("div", "bar");
      const dismiss = el("button", "", t("close"));
      dismiss.type = "button";
      dismiss.onclick = close;
      bar.append(el("strong", "", t("post.by", { author: source.author, handle: source.handle })), dismiss);
      const body = el("div");
      body.setAttribute("aria-live", "polite");
      body.append(el("p", "", t("post.loading")));
      panel.append(bar, body);
      root.append(panel);
      try {
        const reply = await chrome.runtime.sendMessage({ type: "api", method: "POST", path: "/api/posts/analyze", body: JSON.stringify(source) }) as ApiResult;
        if (!active || requestGeneration !== generation || !host.isConnected) return;
        if (reply.status !== 200) throw new Error("post unavailable");
        const result = reply.data as PostAnalysis;
        if (!result || !["complete", "empty"].includes(result.status) || !Array.isArray(result.cards) || result.source?.text !== source.text || result.source?.postId !== source.postId) throw new Error("invalid post response");
        body.replaceChildren();
        if (result.status === "empty" && result.cards.length === 0) body.append(el("p", "", t("post.empty")));
        else if (result.status === "complete" && result.cards.length > 0) for (const card of result.cards) body.append(fullCard(card));
        else throw new Error("invalid post outcome");
      } catch {
        if (!active || requestGeneration !== generation || !host.isConnected) return;
        const retry = el("button", "", t("post.retry"));
        retry.type = "button";
        retry.onclick = () => void show();
        body.replaceChildren(el("p", "", t("post.failed")), retry);
      }
    };
    action.onclick = () => { if (!panel) void show(); };
    root.append(action);
  }
  // A sibling directly under the selected article, inside X's cell, keeps the result out of extracted text.
  article.after(host);
  return { host, signature, dispose: () => { active = false; generation++; host.remove(); } };
}

function refresh(): void {
  for (const [article, item] of mounted) if (!article.isConnected || !item.host.isConnected) { item.dispose(); mounted.delete(article); }
  for (const article of document.querySelectorAll<HTMLElement>(POST)) {
    if (article.closest(EMBEDDED)) continue;
    const observation = observe(article);
    const signature = JSON.stringify(observation);
    const previous = mounted.get(article);
    if (previous?.signature === signature) continue;
    previous?.dispose();
    mounted.delete(article);
    if (observation.state !== "skip") mounted.set(article, mount(article, observation, signature));
  }
}
let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; refresh(); });
});
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "datetime", "lang", "aria-label", "data-testid"] });
window.addEventListener("popstate", refresh);
refresh();
