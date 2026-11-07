/**
 * Lastro background service worker.
 * Talks to the Worker for the content script (extension origin, so no CORS / private-network issues).
 * Captions come from the page hook (hook.ts), not from here.
 * The Anthropic API key never touches the extension: it lives only on the Worker.
 */
import { episodeSeries, resolveFact } from "../../shared/indicators";
import type { Indicator } from "../../shared/schema";

declare const __WORKER_BASE__: string;
const BASE = __WORKER_BASE__;

/** Official data (BCB, IBGE) is fetched here, straight from the public APIs: free, no key, no Worker. */
const TTL_MS = 6 * 3600e3;
const dataCache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = dataCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  dataCache.set(key, { at: Date.now(), value });
  return value;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "fact") {
    cached(`fact:${msg.indicator}:${msg.period ?? "now"}`, () => resolveFact(msg.indicator as Indicator, msg.period ?? null))
      .then((r) => sendResponse({ ok: true, fact: r }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  }
  if (msg?.type === "series") {
    cached(`series:${msg.indicator}:${msg.from}:${msg.to}`, () => episodeSeries(msg.indicator as Indicator, msg.from, msg.to))
      .then((s) => sendResponse({ ok: true, series: s }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

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
