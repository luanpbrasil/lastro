# 03: Compare numerical claims for the post's relevant date

Status: approved for sequential overnight implementation; actual GitHub publication is recorded in the issue manifest.

## Parent

X post context: Portuguese POC. Link the published spec issue when publishing this ticket.

## What to build

Extend a post's context cards with comparisons against the supported Brazilian official indicators. An explicit period in the post takes priority; otherwise interpret expressions such as "today" against the post's publication date. A reader opening an old post must not receive a comparison against the newest value simply because the analysis happened now.

Keep uncertain dates, unsupported indicators, unavailable observations, and ambiguous periods unchecked. Present the actual official observation period with any comparison. Do not claim that an observation was available at publication if the input/source cannot establish that. This ticket extends the existing card result; it does not add new indicators or a general fact-checking capability.

## Acceptance criteria

- [ ] A claim naming a historical period uses that period rather than the post publication or request date.
- [ ] A post using current-relative wording uses its publication date as the reference for the official comparison.
- [ ] A future observation is not selected merely because it is in the publication's calendar month/year.
- [ ] Missing publication metadata, ambiguous intended periods, unavailable suitable observations, and unsupported figures yield no numerical verdict while preserving useful context cards.
- [ ] A successful comparison displays the official value, source, and observation period, using the existing match/difference policy.
- [ ] Theory and forecast cards receive no truth verdict; a numerical comparison is not presented as a judgement of the entire argument or author.
- [ ] The inline panel shows the comparison and available series without adding playback controls.
- [ ] Controlled request/response examples independently establish explicit-period precedence, historical/current-relative behavior, and unchecked outcomes.
- [ ] Existing newer YouTube comparison behavior remains valid. If the post result contract changes, its analysis compatibility version is advanced so incompatible stored results are not misrepresented.

## Blocked by

01: Contextualize one Portuguese public post.
