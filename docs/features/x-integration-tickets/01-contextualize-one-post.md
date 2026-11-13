# 01: Contextualize one Portuguese public post

Status: approved for sequential overnight implementation; actual GitHub publication is recorded in the issue manifest.

## Parent

X post context: Portuguese POC. Link the published spec issue when publishing this ticket.

## What to build

Deliver one complete path on an individual X post page: a relevant Portuguese public post offers Lastro; an explicit click analyzes its own complete text through the newer live backend and opens a closable panel below that post. Show attributed claims with available intellectual context, opposing views, readings, and episodes. A successful empty analysis explicitly says no relevant claims were found; a failure shows a small error with Retry.

This is the first working slice, spanning extraction, the post request/result contract, analysis, server-side result persistence, and inline presentation. Keep it independent of shared-result lookup and numerical verdicts, which later tickets add. Use the existing providers and spending caps; do not route posts through fake video IDs or timestamps.

## Acceptance criteria

- [ ] On a representative individual post page, local relevance filtering offers one action for a relevant Portuguese public post and hides it for unrelated or uncertain input.
- [ ] Protected posts are skipped. Required missing source information is handled explicitly rather than treated as proof of public status.
- [ ] Clicking Lastro submits only the selected post's own text and available source metadata. Embedded quoted posts, replies/context, media, and neighboring/interface text are excluded.
- [ ] Truncated text requires viewer expansion before analysis. No model request is sent merely because a post is rendered or locally classified.
- [ ] Output quotes are grounded in the supplied post text; authored-text handling preserves content that speech-specific cleaning would alter.
- [ ] The closable inline panel presents attributed context without video controls. Numerical claims may appear unchecked until the historical-comparison ticket is delivered.
- [ ] Analysis-in-progress, nonempty result, successful empty result, and failure with Retry are distinct observable outcomes.
- [ ] Post results persist separately from video coverage/history semantics, and X requests do not add entries to public recent-analysis history.
- [ ] Deterministic request/response and extension-interaction checks use controlled external inputs; live detail-page evidence and a small labeled Portuguese relevance sample are recorded.
- [ ] The newer YouTube path still typechecks/builds and its shared-domain evaluation remains valid where affected.

## Blocked by

None. Can start immediately once approved for implementation.
