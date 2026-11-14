# X post context

Lastro adds context to economic and political claims in selected public
Portuguese, English and Spanish posts on X. It uses the newer [app and extension](../../../webapp/README.md).
This document is the maintained feature contract; implementation tickets and
change-specific validation evidence belong in GitHub.

## Viewer experience

- Home, post detail, search, and profile feeds use the same interaction. A local
  topic/assertion gate offers **Lastro** on likely relevant posts
  ([`src/post-relevance.ts`](../../../webapp/src/post-relevance.ts)). The post's
  language is X's own `lang` tag on the post text; Portuguese, English and Spanish
  posts are supported, and posts in any other language (or `und`) get no action.
  Portuguese posts need a policy/economic subject, an assertion verb and the topic
  model's score. The topic model is trained on Portuguese and can't separate
  English or Spanish claims from chit-chat, so those need two different subjects
  and an assertion verb instead.
  Unrelated or uncertain posts have no action; scrolling sends no analysis
  requests. The conservative gate can miss relevant posts.
- Analyze only the selected post's own complete written text. Preserve written
  emoji and line breaks. Expand truncated posts on X first. Exclude quoted-post
  bodies, surrounding replies, neighboring posts, and attached media. Observed
  protected-account markers suppress the action; incomplete source metadata
  produces an unavailable-source notice.
- Place the action in the post header beside Grok, then More, then the author
  name when those controls are absent. It should hug the adjacent control rather
  than float in the header's empty space.
- Open one nonmodal glass reading panel to the post's right when space permits.
  Blur only the panel background; leave the source readable and X interactive
  and scrollable. Long results scroll inside the panel. When the panel cannot fit
  beside the post, open a bottom sheet immediately in the viewport without
  changing the page's scroll position. It starts at about 40% of viewport height;
  an Expand/Collapse control toggles it to 75% for reading. Keep Close visible and
  the page above interactive and undimmed. The sheet covers the lower part of the
  page; viewers can scroll X above it while scrolling cards independently inside
  it. It stays docked while the page scrolls and returns to the side layout when
  enough horizontal space is available.
- Show loading, attributed cards, an explicit **no relevant claims** result, or
  an error with **Retry**. A competing request also offers Retry. Post cards have
  no video timestamps or seek controls. Interface labels use the existing English
  and Brazilian Portuguese selection. Cards (headline, paraphrase, context,
  counterpoint) are written in the post's language, like video cards in the
  video's language.
- Close, the Lastro trigger, or Escape from within the panel/trigger dismisses
  the panel. Interaction elsewhere leaves it open. Scroll and resize reposition
  it. Edits, moved/removed/recycled sources, and repeated injection clear stale
  UI; late responses cannot populate a different source. Reopening requests the
  server again.

## Decisions and rationale

| Decision | Why it matters |
| --- | --- |
| Read the rendered page through the extension, without X API integration | Reuses the existing browser interaction. DOM text and public-state markers are browser observations, not platform-attested identity or completeness. |
| Require an explicit analysis click after a local relevance gate | Keeps unrelated UI quiet and avoids submitting posts merely because someone scrolls past them. |
| Use exact authored-text quote grounding | The video speech-cleaning and approximate quote-location behavior can change written punctuation or source meaning. Returned quotes must occur in the submitted post text. |
| Preserve fact/theory/forecast distinctions | Graph context, opposing views, episodes, and readings explain an attributed claim. Official figures contextualize supported numerical facts; they do not judge the author or entire argument. |
| Separate posts from video storage and public history | Post results have no playback coverage or video session semantics. Shared reuse does not create a personal browsing-history feature. |
| Reuse compatible results server-side | D1 avoids repeating analysis across viewers without a durable browser result archive. Changed text, publication metadata, or analysis semantics require a different compatible key. |
| Keep failed attempts distinct from successful empty results | A provider/validation failure remains retryable and cannot masquerade as a saved no-relevant-claims result. |
| Use a nonmodal panel attached to the selected source | The viewer can keep reading the post and browsing X while inspecting context. |

Content-script access and its trust boundary are described in the
[Chrome content-script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
The extension declares X host access explicitly: an injected page button is not
itself an `activeTab` permission grant. See
[Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

## Numerical comparisons

The model extracts claims; deterministic post-specific code selects official
observations. The [comparison resolver](../../../webapp/src/worker/post-comparisons.ts)
and [Worker tests](../../../webapp/tests/posts-worker.test.mjs) define supported
date forms and boundary examples.

- Grounded explicit dates take precedence over publication-relative wording.
  Model-only dates, unresolved qualifiers, conflicting dates, invalid dates,
  and omitted source date wording cannot silently become a current comparison.
- Daily Selic/PTAX comparisons use a supported exact day, or an explicitly
  grounded end-of-period reference. The selected daily observation is no later
  than the reference and at most seven days earlier. Monthly indicators require
  an explicit month; GDP requires an explicit quarter.
- Current-relative daily wording uses the post's canonical UTC publication day,
  rather than the day of analysis. Missing/future source dates, future intended
  periods, unsupported measures, theories, and forecasts stay unchecked.
- Relative monthly/quarterly claims and historical Focus expectations remain
  unchecked because the supported endpoints do not establish publication-time
  availability. Historical unemployment is a rolling quarter ending in the
  named month; GDP is change from the preceding quarter.
- Show the official source, observation period, value, and available chart
  series when a comparison succeeds. A historical series fetched now may contain
  revisions; it is not evidence of the exact vintage available at publication.
  A failed or timed-out official lookup leaves the context card unchecked.

## Request, storage, and change boundaries

`POST /api/posts/analyze` accepts the `PostSource` contract and returns a
`PostAnalysis` with `complete` or `empty` status. The Worker validates the source
and computes exact-text and metadata fingerprints itself. Together with post
identity and the server-owned analysis version, they identify reusable results.
Cached successful cards and empty results remain readable without new inference.

Atomic D1 claims serialize identical compatible attempts. Competing requests
receive `409 in_progress` with Retry-After. Temporary attempt leases permit
recovery after interrupted work; fencing prevents stale attempts from overwriting
newer work. Successful results have no automatic expiry. A malformed response,
ungrounded nonempty extraction, or provider failure is not saved as empty.
`GET /api/posts/results/:id` reads a result by opaque id; there is no public X
history endpoint. The post route shares the application's existing provider
order and spending reservations; cached reads do not reserve new inference.

| Responsibility | Source |
| --- | --- |
| Source observation, local gate, click and source lifecycle | [`x-content.ts`](../../../webapp/extension/src/x-content.ts) |
| Post panel positioning, interaction and cleanup | [`x-panel.ts`](../../../webapp/extension/src/x-panel.ts), [`x-content.css`](../../../webapp/extension/src/x-content.css) |
| Extension API transport and host-aware injection | [`background.ts`](../../../webapp/extension/src/background.ts), [`manifest.json`](../../../webapp/extension/manifest.json) |
| Request/response contracts and routing | [`types.ts`](../../../webapp/src/types.ts), [`index.ts`](../../../webapp/src/worker/index.ts) |
| Authored-post extraction and exact quote validation | [`posts.ts`](../../../webapp/src/worker/posts.ts) |
| Compatibility keys and attempt lifecycle | [`post-cache.ts`](../../../webapp/src/worker/post-cache.ts) |
| Official observation/date policy | [`post-comparisons.ts`](../../../webapp/src/worker/post-comparisons.ts) |
| Post storage | [`0008_posts.sql`](../../../webapp/migrations/0008_posts.sql), [`0009_post_reuse.sql`](../../../webapp/migrations/0009_post_reuse.sql) |
| Shared card rendering and interface labels | [`cardview.ts`](../../../webapp/src/web/cardview.ts), [`i18n.ts`](../../../webapp/src/web/i18n.ts) |

When extraction, validation, graph context, or comparison semantics change, review
the server-owned analysis version so existing results cannot silently satisfy a
different contract. Keep video ingestion, coverage, storage, and playback behavior
separate when changing the post path.

## Verification and limits

Follow [contribution verification](../../../CONTRIBUTING.md#verification) and
[local extension setup](../../../webapp/README.md#chrome-extension).
[Worker checks](../../../webapp/tests/posts-worker.test.mjs) use isolated D1 and
controlled model/official-data responses. [Extension checks](../../../webapp/tests/posts-extension.test.mjs)
cover source isolation, local filtering, lifecycle, presentation, empty/error
states, retry, and newer YouTube saved-card interaction with controlled inputs.

Check live home/detail/search/profile behavior, protected and expanded-post
markers, and YouTube regressions when those assumptions change. Representative
fixtures do not guarantee compatibility with live X markup. Exact quote grounding
proves presence in supplied text, not source authenticity or claim truth. The
small [Portuguese relevance sample](../../../webapp/tests/fixtures/portuguese-posts.json)
is a development sanity check, not an independent model-quality benchmark.
Real-provider quality and live media playback/capture need their own evidence.

Unsupported: protected content, surrounding threads/replies, quoted-post bodies,
image/audio/video analysis, X API/OAuth access, standalone pasted-post input,
post languages other than Portuguese, English and Spanish, automatic analysis on scroll, cache expiry, feedback
collection, and per-viewer history. Media would need its own acquisition and
evidence-grounding contract; the current contract is written text only.

Design history: [parent issue #2](https://github.com/luanpbrasil/lastro/issues/2),
[first post flow #3](https://github.com/luanpbrasil/lastro/issues/3),
[shared reuse #4](https://github.com/luanpbrasil/lastro/issues/4),
[historical comparisons #5](https://github.com/luanpbrasil/lastro/issues/5),
[feed surfaces #6](https://github.com/luanpbrasil/lastro/issues/6), and
[implementation PR #7](https://github.com/luanpbrasil/lastro/pull/7).
