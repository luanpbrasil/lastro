# 02: Reuse unchanged public-post results across viewers

Status: approved for sequential overnight implementation; actual GitHub publication is recorded in the issue manifest.

## Parent

X post context: Portuguese POC. Link the published spec issue when publishing this ticket.

## What to build

Make a requested analysis of an unchanged public post reuse a compatible server-side result, including when another viewer produced it. Changed text must get fresh analysis. Reopening a post should not require a durable browser archive, and neither cache hits nor new analyses should add X activity to public recent-analysis history.

Reuse the first ticket's complete detail-page flow and saved results. Compatibility must include source identity, the server-validated complete-text fingerprint, and the analysis contract version. Define failed versus successful empty results so Retry does not replay a failed request as an empty success. No expiry policy or cleanup project belongs in this ticket.

## Acceptance criteria

- [ ] Two requested analyses with the same public-post identity, unchanged complete text, and compatible analysis version reuse the saved successful result rather than make another model call.
- [ ] A second viewer can obtain that compatible public-post result through the same supported interaction.
- [ ] Changed text cannot receive the previous text's cards as its current analysis. A fingerprint claimed by the client is recomputed or validated server-side.
- [ ] An incompatible analysis version does not silently reuse earlier results.
- [ ] Successful empty analyses remain explicit empty outcomes; failed/incomplete attempts remain retryable and are not valid empty cache entries.
- [ ] When fresh analysis is blocked by existing provider limits or unavailable providers, a compatible saved result can still be read.
- [ ] Repeated clicks and concurrent requests have a defined in-progress/retry path and do not overwrite another source revision's result.
- [ ] X results remain excluded from public recent-analysis history, without creating a per-viewer browsing-history feature.
- [ ] Request/response regression checks demonstrate reuse, changed text, empty versus failure, and analysis-version behavior with local D1 and controlled provider inputs.
- [ ] No durable browser result archive, automatic expiry, periodic deletion, or cache-management UI is introduced.

## Blocked by

01: Contextualize one Portuguese public post.
