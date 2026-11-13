import { el } from "../../src/web/cardview";
import { t } from "../../src/web/i18n";
import cardStyles from "../../src/web/overlay.css";
import postStyles from "./x-content.css";

/** A nonmodal reading panel. Only the panel surface blurs what is behind it. */
export function openPostPanel(article: HTMLElement, attribution: string, onClose: () => void) {
  const host = el("div");
  host.dataset.lastroPanel = "";
  const root = host.attachShadow({ mode: "open" });
  root.append(el("style", "", cardStyles + postStyles));
  const panel = el("section", "panel ov ov-panel");
  panel.setAttribute("aria-label", "Lastro");
  panel.setAttribute("popover", "manual");
  const bar = el("div", "ov-bar");
  const dismiss = el("button", "ov-x", "×");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", t("close"));
  dismiss.title = t("close");
  dismiss.onclick = onClose;
  let expanded = false;
  const expand = el("button", "post-expand", t("post.expandPanel"));
  expand.type = "button";
  expand.setAttribute("aria-expanded", "false");
  expand.setAttribute("aria-controls", "post-reading-body");
  expand.onclick = () => {
    expanded = !expanded;
    panel.dataset.expanded = String(expanded);
    expand.setAttribute("aria-expanded", String(expanded));
    expand.textContent = t(expanded ? "post.collapsePanel" : "post.expandPanel");
  };
  const heading = el("div", "post-heading");
  heading.append(el("strong", "", "Lastro"), el("p", "post-author", attribution));
  const controls = el("div", "post-controls");
  controls.append(expand, dismiss);
  bar.append(heading, controls);
  const body = el("div", "ov-scroll post-body");
  body.id = "post-reading-body";
  body.setAttribute("aria-live", "polite");
  panel.append(bar, body);
  root.append(panel);
  article.after(host);

  let disposed = false;
  let frame = 0;
  const position = () => {
    frame = 0;
    if (disposed) return;
    const rect = article.getBoundingClientRect();
    const room = document.documentElement.clientWidth - rect.right - 24;
    const floating = room >= 300;
    panel.dataset.layout = floating ? "side" : "sheet";
    if (floating && root.activeElement === expand) dismiss.focus({ preventScroll: true });
    expand.hidden = floating;
    if (floating) {
      panel.style.width = `${Math.min(380, room)}px`;
      panel.style.left = `${rect.right + 12}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 12))}px`;
    } else {
      const width = Math.min(560, document.documentElement.clientWidth - 16);
      panel.style.width = `${width}px`;
      panel.style.left = `${(document.documentElement.clientWidth - width) / 2}px`;
      panel.style.removeProperty("top");
    }
  };
  const schedulePosition = () => { if (!frame) frame = requestAnimationFrame(position); };
  // The popover top layer escapes transformed/clipped X cells without making X inert.
  const resize = new ResizeObserver(schedulePosition);
  resize.observe(article);
  resize.observe(panel);
  window.addEventListener("resize", schedulePosition);
  window.addEventListener("scroll", schedulePosition, true);
  root.addEventListener("keydown", e => {
    if (e instanceof KeyboardEvent && e.key === "Escape") { e.preventDefault(); onClose(); }
    e.stopPropagation();
  });
  for (const event of ["click", "pointerdown"]) root.addEventListener(event, e => e.stopPropagation());
  position();
  panel.showPopover();
  dismiss.focus({ preventScroll: true });
  return {
    body,
    isConnected: () => host.isConnected && host.previousElementSibling === article,
    reposition: schedulePosition,
    containsFocus: () => root.activeElement !== null,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      if (panel.matches(":popover-open")) panel.hidePopover();
      host.remove();
    },
  };
}
