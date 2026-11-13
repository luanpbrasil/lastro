import { shouldAnalyze, TopicScorer, type TopicModel } from "../../../shared/topics";
import topicModel from "../../../shared/topics-model.json";
import type { PostAnalysis, PostSource } from "../../src/types";
import { el, fullCard } from "../../src/web/cardview";
import { t } from "../../src/web/i18n";
import postStyles from "./x-content.css";
import { openPostPanel } from "./x-panel";
import type { ApiResult } from "./messages";

const scorer = new TopicScorer(topicModel as TopicModel);
const POST = 'article[data-testid="tweet"]';
const EMBEDDED = '[data-testid="quoteTweet"], [role="link"][tabindex="0"]';
// X's public/protected observation is contingent on a complete author header. It is not platform attestation.
const LOCK = '[data-testid="icon-lock"], [aria-label="Protected account"], [aria-label="Conta protegida"], [aria-label="Protected posts"], [aria-label="Posts protegidos"]';

function isSourceArticle(article: HTMLElement): boolean {
  return article.isConnected && article.matches(POST) && !article.closest(EMBEDDED) && !article.parentElement?.closest("article");
}

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
  if (own(article, '[data-testid="tweet-text-show-more-link"]').length) return { state: "expand" };
  if (text.length > 10_000) return { state: "unknown" };
  const timestamp = time.getAttribute("datetime");
  // X emits UTC ISO datetimes. Round-trip the date instead of letting Date.parse
  // normalize impossible days (e.g. 30 February) into historical evidence.
  const canonical = timestamp && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)
    ? timestamp.includes(".") ? timestamp : timestamp.replace(/Z$/, ".000Z") : null;
  const publishedAt = canonical && Number.isFinite(Date.parse(canonical)) && new Date(canonical).toISOString() === canonical ? canonical : null;
  return { state: "ready", source: { postId: match[2], url: `https://x.com/${handle}/status/${match[2]}`, author, handle, publishedAt, text, lang: "pt", visibility: "public", complete: true } };
}

type Placement = { anchor: HTMLElement; side: "before" | "after"; align: "actions" | "author" | "notice" };
function placementFor(article: HTMLElement, ready: boolean): Placement {
  const header = own(article, '[data-testid="User-Name"]')[0];
  if (ready && header) {
    // Prefer Grok's header slot, then More. Never target an embedded post's controls.
    const control = own(article, 'button[aria-label*="grok" i], [role="button"][aria-label*="grok" i], [data-testid="grok-actions"]')[0]
      ?? own(article, '[data-testid="caret"]')[0];
    if (control) {
      let slot = control;
      while (slot.parentElement && slot.parentElement !== article && !slot.parentElement.contains(header)) slot = slot.parentElement;
      if (slot.parentElement !== article && slot.parentElement?.contains(header)) return { anchor: slot, side: "before", align: "actions" };
    }
    // Headers without those actions still expose Lastro above the post text.
    const author = header.querySelector<HTMLElement>('a[href]');
    return { anchor: author ?? header, side: "after", align: "author" };
  }
  return { anchor: article, side: "after", align: "notice" };
}

type Mounted = { host: HTMLElement; signature: string; isPlaced: () => boolean; reposition: () => void; dispose: () => void };
const mounted = new Map<HTMLElement, Mounted>();
let closeActivePanel: (() => void) | undefined;
function mount(article: HTMLElement, observation: Exclude<Observation, { state: "skip" }>, signature: string): Mounted {
  const host = el("div");
  host.dataset.lastroPost = "";
  host.dataset.placement = observation.state === "ready" ? "header" : "notice";
  const articleParent = article.parentElement;
  const placement = placementFor(article, observation.state === "ready");
  host.dataset.align = placement.align;
  const isPlaced = () => {
    const current = placementFor(article, observation.state === "ready");
    return host.isConnected && (!panel || panel.isConnected()) && article.parentElement === articleParent && current.anchor === placement.anchor && current.side === placement.side
      && (placement.side === "before" ? host.nextElementSibling === placement.anchor : host.previousElementSibling === placement.anchor);
  };
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", "", postStyles));
  // X's article click and keyboard handlers must not handle Lastro interactions.
  for (const event of ["click", "keydown", "pointerdown"]) root.addEventListener(event, e => e.stopPropagation());
  let active = true;
  let generation = 0;
  let panel: ReturnType<typeof openPostPanel> | undefined;
  let action: HTMLButtonElement | undefined;
  const close = () => {
    generation++;
    if (!panel) return;
    const restoreFocus = panel.containsFocus();
    panel.dispose();
    panel = undefined;
    if (closeActivePanel === close) closeActivePanel = undefined;
    action?.setAttribute("aria-expanded", "false");
    if (active && restoreFocus && action?.isConnected) action.focus({ preventScroll: true });
  };
  if (observation.state !== "ready") root.append(el("p", "notice", t(`post.${observation.state}`)));
  else {
    action = el("button", "post-action", "Lastro");
    action.type = "button";
    action.setAttribute("aria-expanded", "false");
    const source = observation.source;
    const currentSource = () => {
      const current = observe(article);
      if (!isSourceArticle(article) || !isPlaced() || current.state !== "ready" || JSON.stringify(current.source) !== JSON.stringify(source)) { refresh(); return false; }
      return true;
    };
    const show = async () => {
      // Re-read at the explicit action: edited, collapsed, recycled or protected sources cannot use stale text.
      if (!currentSource()) return;
      closeActivePanel?.();
      close();
      const requestGeneration = generation;
      panel = openPostPanel(article, t("post.by", { author: source.author, handle: source.handle }), close);
      const body = panel.body;
      body.append(el("p", "", t("post.loading")));
      closeActivePanel = close;
      action!.setAttribute("aria-expanded", "true");
      let inProgress = false;
      try {
        const reply = await chrome.runtime.sendMessage({ type: "api", method: "POST", path: "/api/posts/analyze", body: JSON.stringify(source) }) as ApiResult;
        if (!active || requestGeneration !== generation || !host.isConnected || !currentSource()) return;
        inProgress = reply.status === 409 && (reply.data as { error?: string } | null)?.error === "in_progress";
        if (reply.status !== 200) throw new Error("post unavailable");
        const result = reply.data as PostAnalysis;
        if (!result || !["complete", "empty"].includes(result.status) || !Array.isArray(result.cards) || result.source?.text !== source.text || result.source?.postId !== source.postId) throw new Error("invalid post response");
        body.replaceChildren();
        if (result.status === "empty" && result.cards.length === 0) body.append(el("p", "", t("post.empty")));
        else if (result.status === "complete" && result.cards.length > 0) for (const card of result.cards) body.append(fullCard(card));
        else throw new Error("invalid post outcome");
      } catch {
        if (!active || requestGeneration !== generation || !host.isConnected || !currentSource()) return;
        const retry = el("button", "post-retry", t("post.retry"));
        retry.type = "button";
        retry.onclick = () => void show();
        body.replaceChildren(el("p", "", t(inProgress ? "post.pending" : "post.failed")), retry);
      }
    };
    action.onclick = () => { if (panel) close(); else void show(); };
    action.onkeydown = e => { if (e.key === "Escape" && panel) { e.preventDefault(); close(); } };
    root.append(action);
  }
  placement.anchor[placement.side](host);
  return { host, signature, isPlaced, reposition: () => panel?.reposition(), dispose: () => { active = false; close(); host.remove(); } };
}

let stopped = false;
function refresh(): void {
  if (stopped) return;
  // Keep only live top-level sources, and never leave a panel in a recycled cell.
  for (const [article, item] of mounted) if (!isSourceArticle(article) || !item.isPlaced()) { item.dispose(); mounted.delete(article); }
  for (const article of document.querySelectorAll<HTMLElement>(POST)) {
    if (!isSourceArticle(article)) continue;
    const observation = observe(article);
    const signature = JSON.stringify(observation);
    const previous = mounted.get(article);
    if (previous?.signature === signature) { previous.reposition(); continue; }
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
// An install/update injection takes over any older copy, including its pending requests.
const TAKEOVER = "lastro-x:takeover";
function shutdown(): void {
  stopped = true;
  observer.disconnect();
  window.removeEventListener("popstate", refresh);
  document.removeEventListener(TAKEOVER, shutdown);
  for (const item of mounted.values()) item.dispose();
  mounted.clear();
}
document.dispatchEvent(new CustomEvent(TAKEOVER));
document.addEventListener(TAKEOVER, shutdown);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "datetime", "lang", "alt", "aria-label", "data-testid", "role", "tabindex"] });
window.addEventListener("popstate", refresh);
refresh();
