import type { VideoSummary, VideosResponse } from "../types";
import { intlLocale, plural, t } from "./i18n";

const relative = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function ago(ms: number): string {
  const diff = ms - Date.now();
  for (const [unit, size] of UNITS) if (Math.abs(diff) >= size || unit === "minute") return relative.format(Math.round(diff / size), unit);
  return "";
}


function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "Recently analysed": the latest videos with saved ideas. Opening one shows its cards at once. */
export class History {
  private videos: VideoSummary[] = [];
  private current = "";
  private loading: Promise<void> | null = null;

  constructor(
    private list: HTMLElement,
    private empty: HTMLElement,
    private onOpen: (id: string) => void,
  ) {}

  load(): Promise<void> {
    this.loading ??= fetch("/api/videos")
      .then(async (r) => {
        if (r.ok) this.videos = ((await r.json()) as VideosResponse).videos;
        this.render();
      })
      .catch(() => {})
      .finally(() => (this.loading = null));
    return this.loading;
  }

  select(id: string): void {
    this.current = id;
    this.render();
  }

  private render(): void {
    this.empty.hidden = this.videos.length > 0;
    this.list.replaceChildren(...this.videos.map((v) => this.item(v)));
  }

  private item(v: VideoSummary): HTMLElement {
    const li = el("li");
    const b = el("button", "video");
    b.type = "button";
    if (v.id === this.current) b.setAttribute("aria-current", "true");
    b.onclick = () => this.onOpen(v.id);

    const thumb = el("img", "thumb");
    thumb.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.width = 320;
    thumb.height = 180;

    const text = el("span", "text");
    text.append(el("span", "title", v.title || t("history.untitled")));
    if (v.author) text.append(el("span", "channel", v.author));
    const meta = el("span", "meta");
    meta.append(el("span", "", v.cards ? plural(v.cards, "history.idea", "history.ideas") : t("history.noIdeas")));
    if (v.facts) meta.append(el("span", "fact", plural(v.facts, "history.checkedOne", "history.checked")));
    meta.append(el("span", "when", ago(v.analysedAt)));
    text.append(meta);

    b.append(thumb, text);
    li.append(b);
    return li;
  }
}
