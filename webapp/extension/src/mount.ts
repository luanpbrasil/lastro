import fontsCss from "@fontsource-variable/schibsted-grotesk/wght.css";
import overlayCss from "../../src/web/overlay.css";
import hostCss from "./host.css";

/**
 * The overlay's place on YouTube: a shadow root inside the player (#movie_player), so the overlay follows the player
 * into theater mode and full screen, and neither page's styles reach the other. Inside it: the same overlay as on
 * lastro (src/web/overlay.ts and overlay.css).
 */

// Not the first extension's "lastro-overlay": the two can be installed side by side.
const TAG = "lastro-live-overlay";
/** Events from the overlay stop at its host: a click on a card mustn't pause the video, ← → mustn't seek. */
const CONTAINED = ["keydown", "keyup", "keypress", "click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu"];

/**
 * The typeface, declared on the page: Chrome ignores @font-face inside a shadow root. The files come from the
 * extension (web_accessible_resources).
 */
function injectFonts(): void {
  if (document.getElementById("lastro-fonts")) return;
  const s = document.createElement("style");
  s.id = "lastro-fonts";
  s.textContent = fontsCss.replace(/url\(\.\/files\//g, `url(${chrome.runtime.getURL("fonts/")}`);
  (document.head ?? document.documentElement).append(s);
}

export interface Mount {
  /** The element the Overlay draws in. */
  root: HTMLElement;
  /** Shown on watch pages only. */
  show(on: boolean): void;
  remove(): void;
}

export function mountOverlay(): Mount {
  for (const old of document.querySelectorAll(TAG)) old.remove(); // copies cut off by an extension reload
  injectFonts();
  const host = document.createElement(TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${hostCss}\n${overlayCss}`;
  const screen = document.createElement("div");
  screen.className = "screen";
  const root = document.createElement("div");
  screen.append(root);
  shadow.append(style, screen);
  for (const type of CONTAINED) host.addEventListener(type, (e) => e.stopPropagation());
  // YouTube builds the player after this script starts and can rebuild it: keep the overlay in it.
  const attach = () => {
    const player = document.getElementById("movie_player");
    if (player && host.parentElement !== player) player.append(host);
  };
  attach();
  const timer = window.setInterval(attach, 1000);
  return {
    root,
    show: (on) => (host.style.display = on ? "" : "none"),
    remove: () => {
      window.clearInterval(timer);
      host.remove();
    },
  };
}
