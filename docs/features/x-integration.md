# X integration: design notes

Status: the approved four-ticket implementation is committed and has deterministic regression coverage. Live X acceptance remains unverified; the feature PR must remain draft until the required live evidence is collected. See the [codebase guide](../codebase-guide.md#verified-implementation-state) for observed checks and limitations.
Branch: `feat/add-twitter-integration`.
Implementation-agent preference: GPT-6 Astra (`gpt-6-astra`), requested by the maintainer. Use fresh implementation context per approved ticket; this preference does not change the app's analysis providers or authorize starting an unapproved ticket.

## Confirmed scope

- Extend the newer implementation in `webapp/` to support posts on X (formerly Twitter).
- Defer decisions about retaining or porting the original implementation to another session.
- Shared code remains relevant where the newer implementation consumes it.
- The viewer explicitly clicks a Lastro action beside a post while browsing X in the newer Chrome extension.
- Analyze the selected post's own written text. Thread/reply context, embedded quoted-post content, images, and attached video/audio are deferred.
- Preserve Lastro's economics/politics context: attributed claims, intellectual background, opposing views, and comparisons against supported Brazilian official indicators. General-purpose fact checking is outside this first version.
- Results expand in a closable panel directly below the selected post, displaying the post's claims as cards.
- Support the home timeline, individual post pages, search results, and profile feeds in the first version.
- Keep X analyses out of Lastro's public recent-analysis history. Persistence is server-side, shared for public posts, with automatic expiry deferred.
- Read the selected post text loaded on the page; require expansion before analysis when text is truncated. An X API integration is outside this version.
- Before a click, unrelated posts should show no Lastro interface, including no action. Use a lightweight local relevance check for action visibility; hide the action when relevance is uncertain. Model analysis happens only after an explicit click. The local classifier's quality on posts must be validated.
- Persist and reuse X analyses server-side, following the newer YouTube architecture. Browser memory holds the interface's loaded state; no durable browser result archive is required. Changed post text requires fresh analysis.
- For numerical comparisons, an explicit period in the post takes priority. Resolve "today/currently" against the post's publication date and use the relevant official figure available then. Leave uncertain cases unchecked, rather than silently comparing with the latest figure at analysis time.
- Reuse saved analyses of unchanged public-post text across viewers. Skip protected-account posts in this first version.
- No automatic cache expiry or age-based cleanup is part of this POC. The proposed 30-day expiry was explicitly deferred.
- After a requested analysis fails, show a small error and a Retry action. After a successful requested analysis yields zero relevant claims, explicitly say that no relevant claims were found. This overrides the earlier proposal to silently remove an empty result panel.
- Feedback prompts for uncertain classifications and tooling to improve relevance from empty outcomes are future work, not POC deliverables.
- Target Portuguese post text for the POC, retaining the existing English/Portuguese interface behavior. Broader post-language coverage is deferred.

## Current implementation facts

- The newer extension has separate YouTube and X content entries, with host-aware install/update injection.
- The background proxy supports the post analysis/result routes alongside the video routes. Only an explicit eligible-post click submits source text.
- Post contracts and D1 results are separate from timed transcripts, video coverage and public video history. Server-computed text/metadata fingerprints and a versioned claim key control reuse and concurrent retries.
- Post cards reuse graph context and presentation without playback controls. A post-specific resolver selects supported historical observations and leaves uncertain comparisons unchecked.

Sources: [extension manifest](../../webapp/extension/manifest.json), [background proxy](../../webapp/extension/src/background.ts), [contracts](../../webapp/src/types.ts), [Worker](../../webapp/src/worker/index.ts), [migrations](../../webapp/migrations/), [extraction](../../webapp/src/worker/factcheck.ts).

### Implemented boundaries

- [Stance derivation](../../shared/stance.ts) and [card sections](../../webapp/src/web/cardview.ts) are shared. Seek controls remain specific to video cards.
- [Post extraction](../../webapp/src/worker/posts.ts) preserves authored text and validates exact source-substring quotes; it does not use speech cleaning or approximate transcript quote location.
- [Post comparisons](../../webapp/src/worker/post-comparisons.ts) use explicit supported periods or publication-relative daily observations. Qualified/ambiguous dates, unsupported vintages and unavailable observations remain unchecked. The UI identifies current historical series and their revision limitations. The existing YouTube resolver is unchanged.
- [Post reuse](../../webapp/src/worker/post-cache.ts) includes publication metadata and analysis compatibility. Successful empty results are reusable; failed/in-progress attempts remain retryable. Successful entries have no automatic expiry.
- [Mounted X UI](../../webapp/extension/src/x-content.ts) belongs to live source articles and is discarded on replacement/removal. It keeps no durable browser result archive. Shared public-post storage is not a private-result or per-viewer history system.

## Decision log

- Round 1: the maintainer accepted all three recommendations: action inside X, individual post text only, and existing economics/politics scope. A pasted-post entry point in the standalone web app is outside this first version.
- Round 2: the maintainer accepted inline results and exclusion from public history, and expanded initial surface coverage to include search results and profile feeds alongside the home timeline and individual post pages.
- Round 3, including clarification: Q7 accepted (rendered-page text, viewer expansion for truncated posts, no X API). The maintainer then accepted revised Q8 (server-side persistence/reuse), Q9 (historical-date policy), and Q10 (hide the action too; local relevance filtering, explicit model analysis).
- Round 4: Q11 accepted (shared public-post results); Q12 accepted (skip protected accounts); Q13 rejected for now (expiry is future optimization); Q14 accepted for now (hide on uncertainty; user prompting deferred); Q15 accepted with a change (show both technical failures with Retry and explicit no-relevant-claims outcomes after requested analyses). The maintainer emphasized POC/MVP scope.
- Closing round: Q16 accepted (Portuguese-first post scope), Q17 accepted (scope plus the Worker and extension verification interfaces), and Q18 selected GitHub Issues. Target repository from the existing remote: `luanpbrasil/lastro`.
- Overnight request: the maintainer authorized the complete ticket sequence (01, 02, 03, 04), GitHub issue publication, implementation on the existing feature branch, and push plus one final PR. They requested a new Astra CLI session and unattended progress; merging/deployment remain outside the request.

## POC completion criteria

- On each of home, post detail, search, and profile feeds, a relevant public post can expose one Lastro action and open its own closable results panel.
- Selecting one post sends only its own complete text for analysis after the explicit action; quoted posts, neighboring posts, and media are excluded. Truncated text requires viewer expansion.
- Cards attribute claims to the post author, ground quotes in the supplied post text, and show applicable graph context and official comparisons without video controls.
- Dates named in a claim take priority; current-relative claims use the publication date, with ambiguous comparisons left unchecked.
- The same unchanged public-post input can reuse server-side results across viewers; changed text causes fresh analysis. X analyses stay out of public recent history.
- Irrelevant or uncertain posts have no pre-click Lastro action. Protected posts are skipped. A requested analysis clearly distinguishes cards, no relevant claims, and failure with Retry.
- Existing newer YouTube behavior continues to work. Root legacy UI/backend development remains outside this branch's feature scope.

These criteria summarize accepted behavior; they do not assert current implementation or live-site feasibility.

## Implementation references

- [Approved spec](x-integration-spec.md): accepted POC scope, contracts, and verification decisions; published as [#2](https://github.com/luanpbrasil/lastro/issues/2).
- [Ticket breakdown](x-integration-tickets/README.md): approved independent, end-to-end implementation slices.
- [Overnight run](../agents/x-overnight-run.md): client preflight, idempotent GitHub publication, fresh Astra coordinator, sequential tickets, verification, push, and PR instructions. Actual published issues are recorded in the generated issue manifest.

The deterministic suites cover source isolation, publication metadata, conservative gating, shared compatibility and feed lifecycle. Actual X markup, complete-text/public-state assumptions and real model quality still need live acceptance evidence. Missing required source information produces an unavailable-source state; incomplete text requires viewer expansion.

## Agreed verification interfaces

Confirmed by the maintainer in Q17 and implemented in the [Worker](../../webapp/tests/posts-worker.test.mjs) and [extension](../../webapp/tests/posts-extension.test.mjs) suites:

| Interface | Behavior to exercise | Limit |
| --- | --- | --- |
| Post-analysis request/response through the live Worker, with controlled model and official-data inputs and local D1 | Quote grounding, date policy, results versus empty/error outcomes, shared cache reuse and changed-text invalidation | Does not establish live model quality or X page extraction |
| Extension interaction with representative post pages and a controlled backend reply | Local action visibility, selected-post extraction, quote/media exclusion, truncation, protected state, inline panel and Retry on all four surfaces | Captured fixtures can drift from X's live page |

The 14-item Portuguese sample offered 4/6 relevant posts and 0/8 unrelated or uncertain posts. It informed the gate and is not an independent accuracy benchmark. Live Chrome smoke checks on the four X surfaces remain outstanding, as do installed-extension/real-provider acceptance checks. Controlled YouTube saved-card display and seeking pass; they do not establish live playback/capture behavior.

## Deferred from the POC

Cache expiry/cleanup optimization, feedback collection and improvement dashboards, user prompts for uncertain relevance, protected-content support, X API integration, threads/quoted-post content/media analysis, standalone pasted-post entry, and decisions about the original implementation.

Current X access options are documented in [the access research](x-access-research.md), with official sources and untested details distinguished. Rendered-page text is the selected route; the research's alternatives remain background information. These open items are questions, not default requirements.

## Workflow

The four tickets were implemented sequentially in fresh Astra contexts on the existing feature branch, with per-ticket checks and standards/spec review. GitHub issues remain open until the shared feature PR merges. The remaining acceptance work is live validation, not another discovery or publication pass; tracker configuration is in [issue-tracker.md](../agents/issue-tracker.md).
