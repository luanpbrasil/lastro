import type { ApiRequest, ApiResult, FromContent, FromOffscreen, ListenReply, ToContent, ToOffscreen } from "./messages";

/**
 * Lastro's background service worker.
 * - Talks to the Worker for the content scripts: from the extension's origin, which the Worker allows
 *   (EXTENSION_ORIGINS), and without CORS. Only the API's per-video paths are passed on.
 * - Listening, for videos without captions: Chrome gives an extension a tab's audio only after the viewer invokes it,
 *   so the toolbar icon (or its shortcut) starts and stops listening. The audio is held and recognised in the
 *   offscreen document; this worker passes each phrase to the tab.
 */

const BASE = __WORKER_BASE__;
const API_PATH = /^\/api\/videos\/[A-Za-z0-9_-]{11}\/(sessions|transcript|cards(\?after=\d{1,10})?|language|coverage)$/;
const OFFSCREEN = "offscreen.html";
const WATCH = /^https:\/\/www\.youtube\.com\/watch\?/;

// ---- the Worker ------------------------------------------------------------------------

async function api(msg: ApiRequest): Promise<ApiResult> {
  if (!API_PATH.test(msg.path) || (msg.method !== "GET" && msg.method !== "POST")) return { status: 400, data: { error: "bad_request" } };
  try {
    const r = await fetch(`${BASE}${msg.path}`, msg.method === "POST" ? { method: "POST", headers: { "content-type": "application/json" }, body: msg.body ?? "{}" } : {});
    return { status: r.status, data: await r.json().catch(() => null) };
  } catch {
    return { status: 0, data: null };
  }
}

chrome.runtime.onMessage.addListener((msg: FromContent | FromOffscreen | ToOffscreen, sender, reply) => {
  if ("target" in msg) {
    if (msg.target === "background") void fromOffscreen(msg);
    return false; // ToOffscreen messages are for the offscreen document
  }
  // Everything else comes from the content scripts, in YouTube tabs.
  const tabId = sender.tab?.id;
  switch (msg.type) {
    case "api":
      void api(msg).then(reply);
      return true; // replies later
    case "beacon":
      void api({ type: "api", method: "POST", path: msg.path, body: msg.body });
      return false;
    case "listen-stop":
      if (tabId !== undefined) void stopListening(tabId);
      return false;
    case "shortcut":
      void chrome.commands.getAll().then((all) => reply(all.find((c) => c.name === "_execute_action")?.shortcut ?? ""));
      return true;
  }
  return false;
});

// ---- listening ---------------------------------------------------------------------------

/** The tab being listened to. In session storage: this worker can be stopped between events. */
async function listeningTab(): Promise<number | null> {
  const { listening } = await chrome.storage.session.get("listening");
  return typeof listening === "number" ? listening : null;
}

async function setListening(tabId: number | null, previous: number | null): Promise<void> {
  await chrome.storage.session.set({ listening: tabId });
  if (previous !== null) void chrome.action.setBadgeText({ tabId: previous, text: "" }).catch(() => {});
  if (tabId !== null) {
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "#A4442B" }).catch(() => {});
    void chrome.action.setBadgeText({ tabId, text: "●" }).catch(() => {});
  }
}

const toTab = (tabId: number, msg: ToContent) => chrome.tabs.sendMessage(tabId, msg).catch(() => null);
const toOffscreen = (msg: ToOffscreen) => chrome.runtime.sendMessage(msg).catch(() => {});

async function ensureOffscreen(): Promise<void> {
  const open = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (open.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Recognise the speech in a YouTube video without captions, when the viewer asks Lastro to listen.",
  });
}

chrome.action.onClicked.addListener((tab) => void onIconClick(tab));

async function onIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const current = await listeningTab();
  if (current === tab.id) return stopListening(tab.id);
  if (!WATCH.test(tab.url ?? "")) return;
  // Ask for the audio first, while Chrome still counts the click.
  let streamId: string;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch {
    void toTab(tab.id, { type: "listen-stopped", error: "capture" });
    return;
  }
  // The tab says what to listen for, or that it doesn't need to (it reads this video's captions).
  const asked = (await toTab(tab.id, { type: "listen-request" })) as ListenReply | null;
  if (!asked?.listen) return;
  if (current !== null) await stopListening(current);
  await ensureOffscreen();
  await setListening(tab.id, current);
  await toOffscreen({ target: "offscreen", type: "start", streamId, lang: asked.lang, tabId: tab.id });
}

/** The tab is told once the offscreen document has sent the last words ("ended"). */
async function stopListening(tabId: number): Promise<void> {
  const current = await listeningTab();
  if (current !== tabId) return;
  await setListening(null, tabId);
  await toOffscreen({ target: "offscreen", type: "stop" });
}

async function fromOffscreen(msg: FromOffscreen): Promise<void> {
  if (msg.type === "speech") {
    void toTab(msg.tabId, { type: "speech", event: msg.event });
    return;
  }
  // Ended: stopped on request, or the audio or recognition failed.
  const current = await listeningTab();
  if (current === msg.tabId) await setListening(null, msg.tabId);
  void toTab(msg.tabId, { type: "listen-stopped", error: msg.error });
  if ((await listeningTab()) === null) await chrome.offscreen.closeDocument().catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => void stopListening(tabId));

// ---- install and update ------------------------------------------------------------------

/**
 * On install or update, YouTube tabs that are already open don't get the content scripts until they're reloaded.
 * Inject them now, in the manifest's order: the page hook (MAIN world) first, then the content script. Both skip
 * themselves if a live copy already runs in the tab. Tabs that can't be scripted are skipped quietly.
 */
chrome.runtime.onInstalled.addListener(() => void injectOpenTabs());

async function injectOpenTabs(): Promise<void> {
  const scripts = (chrome.runtime.getManifest().content_scripts ?? []) as { js?: string[]; world?: string }[];
  const mainFiles = scripts.filter((c) => c.world === "MAIN").flatMap((c) => c.js ?? []);
  const isolatedFiles = scripts.filter((c) => c.world !== "MAIN").flatMap((c) => c.js ?? []);
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id === undefined || tab.discarded) continue;
    try {
      if (mainFiles.length) await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", files: mainFiles });
      if (isolatedFiles.length) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: isolatedFiles });
    } catch {
      /* discarded, crashed, or not scriptable: skip */
    }
  }
}
