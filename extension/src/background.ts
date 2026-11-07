/**
 * Lastro background service worker.
 * Talks to the Worker for the content script (extension origin, so no CORS / private-network issues).
 * Captions come from the page hook (hook.ts), not from here.
 * The Anthropic API key never touches the extension: it lives only on the Worker.
 */
declare const __WORKER_BASE__: string;
const BASE = __WORKER_BASE__;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "lastro") return;
  port.onMessage.addListener(async (msg) => {
    try {
      if (msg.type === "lookup") {
        const r = await fetch(`${BASE}/c/${msg.videoId}/${msg.hash}`);
        port.postMessage(r.ok ? { type: "cached", data: await r.json() } : { type: "miss" });
      } else if (msg.type === "analyze") {
        const r = await fetch(`${BASE}/analyze`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(msg.body),
        });
        if (!r.ok || !r.body) {
          port.postMessage({ type: "http", status: r.status, body: await r.text() });
          return;
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) port.postMessage({ type: "event", ev: JSON.parse(line) });
          }
        }
        port.postMessage({ type: "end" });
      }
    } catch (e) {
      port.postMessage({ type: "neterror", message: e instanceof Error ? e.message : String(e) });
    }
  });
});
