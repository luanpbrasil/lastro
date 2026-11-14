import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const out = await build({ entryPoints: ["tests/language-entry.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { cleanTracks, detectFrom, tracksFromPlayerResponse, tracksFromSection } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

/** A player response shaped like movie_player.getPlayerResponse() / ytInitialPlayerResponse, trimmed to what matters. */
const player = ({ audio = [], captions = [], title = "" } = {}) => ({
  videoDetails: { videoId: "abcDEF12345", title },
  streamingData: { adaptiveFormats: [{ mimeType: "video/mp4" }, ...audio.flatMap((a) => [{ mimeType: "audio/mp4", audioTrack: a }, { mimeType: "audio/webm", audioTrack: a }])] },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: captions } },
});
/** As the extension does it: hook.ts reads the tracks, posts them, content.ts cleans them and detects. */
const inPage = (pr) => detectFrom(cleanTracks(JSON.parse(JSON.stringify(tracksFromPlayerResponse(pr)))), pr.videoDetails.title);
/** As the Worker does it for the web page, from the watch page's text. */
const fromWatchPage = (pr) => detectFrom(tracksFromSection(`var ytInitialPlayerResponse = ${JSON.stringify(pr)};`), pr.videoDetails.title);

const cases = [
  {
    name: "auto-dubbed video: the original audio track, not the dub the viewer hears",
    pr: player({
      title: "How interest rates work",
      audio: [
        { id: "en.4", displayName: "English (United States) dubbed-auto", audioIsDefault: true, isAutoDubbed: true },
        { id: "pt-BR.4", displayName: "Portuguese (Brazil) original", audioIsDefault: false },
      ],
      captions: [{ languageCode: "en", kind: "asr" }],
    }),
    want: { lang: "pt-BR", source: "audio" },
  },
  {
    name: "automatic captions only: their language",
    pr: player({ title: "Selic 2026", captions: [{ languageCode: "en" }, { languageCode: "es", kind: "asr" }] }),
    want: { lang: "es", source: "captions" },
  },
  {
    name: "no tracks: the title decides",
    pr: player({ title: "Por que o juro alto não segura a inflação" }),
    want: { lang: "pt", source: "title" },
  },
  {
    name: "nothing found: null, so the extension falls back to the captions' or the browser's language",
    pr: player({ title: "Selic 2026", captions: [{ languageCode: "pt" }] }),
    want: null,
  },
];

for (const c of cases) {
  test(`in page: ${c.name}`, () => assert.deepEqual(inPage(c.pr), c.want));
  test(`same answer as the Worker's watch-page parsing: ${c.name}`, () => assert.deepEqual(fromWatchPage(c.pr), c.want));
}

test("tracks posted by any script on the page are rebuilt: wrong types dropped, bad tags ignored", () => {
  assert.equal(cleanTracks(null), null);
  assert.equal(cleanTracks({ audio: "x", captions: [] }), null);
  const t = cleanTracks({ audio: [{ id: 5, displayName: { x: 1 }, isAutoDubbed: "yes" }], captions: [{ languageCode: "<script>", kind: "asr" }, { languageCode: "fr", kind: "asr", extra: "x" }] });
  assert.deepEqual(t.audio, [{ id: undefined, displayName: undefined, audioIsDefault: false, isAutoDubbed: false }]);
  assert.deepEqual(t.captions[1], { languageCode: "fr", kind: "asr" });
  assert.deepEqual(detectFrom(t, ""), { lang: "fr", source: "captions" });
});

test("the extension never calls the Worker's language endpoint (which fetches YouTube's watch page)", async () => {
  for (const f of ["content.ts", "youtube.ts", "hook.ts", "background.ts"]) {
    assert.doesNotMatch(await readFile(`extension/src/${f}`, "utf8"), /\/language["`'/]/, f);
  }
});
