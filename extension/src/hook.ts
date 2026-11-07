/**
 * Runs in the page's MAIN world at document_start, before the YouTube player loads.
 * Passes the player's own caption responses (/api/timedtext, signed with `pot`) to the content script.
 * No extra request is made: we read the response the player already received.
 */
(() => {
  const TAG = "__lastro_captions";
  const post = (url: string, body: string) => {
    if (body) window.postMessage({ [TAG]: true, url, body }, location.origin);
  };
  const isCaptions = (url: string) => url.includes("/api/timedtext");

  const origFetch = window.fetch;
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const res = await origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (isCaptions(url)) res.clone().text().then((b) => post(url, b), () => {});
    } catch {
      /* never break the page */
    }
    return res;
  } as typeof fetch;

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const urls = new WeakMap<XMLHttpRequest, string>();
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    urls.set(this, String(url));
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = urls.get(this);
    if (url && isCaptions(url)) {
      this.addEventListener("load", () => {
        try {
          const t = this.responseType;
          const b =
            t === "" || t === "text"
              ? this.responseText
              : t === "json"
                ? JSON.stringify(this.response)
                : t === "arraybuffer"
                  ? new TextDecoder().decode(this.response as ArrayBuffer)
                  : "";
          post(new URL(url, location.href).toString(), b);
        } catch {
          /* ignore */
        }
      });
    }
    return origSend.call(this, body);
  };
})();
