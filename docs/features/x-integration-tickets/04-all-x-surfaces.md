# 04: Bring post context to home, search, and profile feeds

Status: approved for sequential overnight implementation; actual GitHub publication is recorded in the issue manifest.

## Parent

X post context: Portuguese POC. Link the published spec issue when publishing this ticket.

## What to build

Bring the first ticket's post-to-panel interaction to the home timeline, search results, and profile feeds as well as individual post pages. Keep actions and panels attached to the correct public Portuguese post as X loads or replaces content. Classify locally and conservatively, so unrelated or uncertain posts stay quiet until no action is available; analysis still requires an explicit click on an eligible post.

Reuse the post request/result interface so shared reuse and historical comparisons compose with the new surfaces when their tickets land. Avoid a separate analysis pipeline per surface. Do not add thread, quoted-post, media, protected-content, or non-Portuguese scope.

## Acceptance criteria

- [ ] Relevant public Portuguese posts can expose one Lastro action on home, post detail, search, and profile feeds.
- [ ] Each action extracts its own post and opens its own closable inline panel; neighboring or embedded quoted posts are not accidentally selected.
- [ ] New and replaced feed items receive correct behavior without duplicate actions, orphan panels, or a permanent browser archive of every post encountered.
- [ ] Local filtering hides actions for irrelevant or uncertain input on each surface; no feed-wide server/model analysis is introduced.
- [ ] Protected or incomplete source handling and viewer expansion for truncated text remain consistent across surfaces.
- [ ] Requested analyses show nonempty cards, explicit no-relevant-claims outcomes, and failures with Retry consistently.
- [ ] Fixture-based extension-interaction checks cover the four surfaces, content replacement, source isolation, filtering, truncation, and result states.
- [ ] A small labeled Portuguese post sample and live desktop Chrome observations of all four surfaces document classifier and page-access behavior, with limitations stated concretely.
- [ ] When the shared-reuse and historical-comparison tickets are integrated, their behavior works through the same action/panel interface on every surface.
- [ ] The newer YouTube extension experience still works; no root legacy UI/backend work or new feedback collection is included.

## Blocked by

01: Contextualize one Portuguese public post.
