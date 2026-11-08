/**
 * Runs in the page's MAIN world at document_start, before the YouTube player loads.
 * Passes two of the page's own responses to the content script. No extra request is made: we read what the page received.
 * - /api/timedtext: the player's captions (signed with `pot`). Empty and error responses are passed on too, with their
 *   status, so the content script can say at once that YouTube sent no captions instead of waiting.
 * - /youtubei/v1/get_transcript and /youtubei/v1/get_panel: the "Mostrar transcrição" panel (older and newer
 *   versions), used when the player's captions fail. get_panel also serves other panels: only bodies with
 *   transcript rows are passed on.
 */
(() => {
  const CAPTIONS = "__lastro_captions";
  const TRANSCRIPT = "__lastro_transcript";
  const kindOf = (url: string) =>
    url.includes("/api/timedtext") ? CAPTIONS : url.includes("/youtubei/v1/get_transcript") || url.includes("/youtubei/v1/get_panel") ? TRANSCRIPT : null;
  const post = (tag: string, url: string, status: number, body: string) => {
    if (tag === TRANSCRIPT && url.includes("/get_panel") && status === 200 && !body.includes("transcriptSegmentViewModel")) return;
    window.postMessage({ [tag]: true, url, status, body }, location.origin);
  };
  const urlOf = (input: unknown) =>
    typeof input === "string" ? input : input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);

  const origFetch = window.fetch;
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    let tag: string | null = null;
    let url = "";
    try {
      url = new URL(urlOf(args[0]), location.href).toString();
      tag = kindOf(url);
    } catch {
      /* never break the page */
    }
    let res: Response;
    try {
      res = await origFetch.apply(this, args);
    } catch (e) {
      if (tag) post(tag, url, 0, ""); // network error
      throw e;
    }
    try {
      if (tag) res.clone().text().then((b) => post(tag!, url, res.status, b), () => post(tag!, url, res.status, ""));
    } catch {
      /* never break the page */
    }
    return res;
  } as typeof fetch;

  // Title + full description for the topic check, from the page's own player data (no request of ours).
  // movie_player.getPlayerResponse() follows in-app navigation; ytInitialPlayerResponse is right only on a first load.
  // Answers only when videoDetails.videoId is the video asked for, so a stale response is never used.
  type VideoDetails = { videoId?: string; title?: string; shortDescription?: string };
  const META_WAIT_MS = 3_000;
  const detailsFor = (id: string): { d: VideoDetails; from: string } | null => {
    try {
      const mp = document.getElementById("movie_player") as unknown as { getPlayerResponse?: () => { videoDetails?: VideoDetails } } | null;
      const live = mp?.getPlayerResponse?.()?.videoDetails;
      if (live?.videoId === id) return { d: live, from: "player" };
      const first = (window as unknown as { ytInitialPlayerResponse?: { videoDetails?: VideoDetails } }).ytInitialPlayerResponse?.videoDetails;
      if (first?.videoId === id) return { d: first, from: "initial" };
    } catch {
      /* never break the page */
    }
    return null;
  };
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data?.__lastro_meta_req) return;
    const id = String(e.data.videoId);
    const end = performance.now() + META_WAIT_MS;
    const tryNow = () => {
      const hit = detailsFor(id);
      if (hit || performance.now() >= end) {
        window.postMessage(
          { __lastro_meta: true, videoId: id, found: !!hit, from: hit?.from ?? null, title: hit?.d.title ?? "", description: hit?.d.shortDescription ?? "" },
          location.origin,
        );
      } else setTimeout(tryNow, 200);
    };
    tryNow();
  });

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const urls = new WeakMap<XMLHttpRequest, string>();
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    urls.set(this, String(url));
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const raw = urls.get(this);
    const tag = raw ? kindOf(raw) : null;
    if (raw && tag) {
      const url = new URL(raw, location.href).toString();
      this.addEventListener("loadend", () => {
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
          post(tag, url, this.status, b ?? "");
        } catch {
          post(tag, url, this.status, "");
        }
      });
    }
    return origSend.call(this, body);
  };
})();
