# X integration: design notes

Status: product scope, verification interfaces, ticket breakdown, sequential implementation, branch push, and one PR are authorized. GitHub publication and the fresh Astra run are being prepared; see the overnight instructions for actual launch and verification steps.
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

- The newer extension's manifest injects scripts only on YouTube.
- Its background request allowlist accepts only the existing per-video routes.
- Worker contracts and D1 persistence are video-oriented; cards carry playback positions and ingestion uses timed transcript segments.
- Card extraction, graph context, stance, and official-data comparisons are potential reuse points. Their suitability for posts still needs to be established.

Sources: [extension manifest](../../webapp/extension/manifest.json), [background proxy](../../webapp/extension/src/background.ts), [contracts](../../webapp/src/types.ts), [Worker](../../webapp/src/worker/index.ts), [migrations](../../webapp/migrations/), [extraction](../../webapp/src/worker/factcheck.ts).

### Reuse investigation

- [Stance derivation](../../shared/stance.ts) uses node links rather than video metadata. Card content sections are reusable, but [the renderer](../../webapp/src/web/cardview.ts) always adds a seek/timestamp button and [the timeline](../../webapp/src/web/timeline.ts) requires a player. Posts need presentation without playback assumptions.
- [Speech sanitization](../../webapp/src/worker/sanitize.ts) strips characters such as emoji, handles' `@`, and hashtags' `#`, normalizes whitespace, and caps individual segments at 600 characters. Post text cannot be assumed to survive unchanged through that path.
- [Quote location](../../shared/locate.ts) accepts approximate token matches and produces segment/time positions. Highlighting a passage inside a written post would need a separate text-position contract if desired.
- [Official value selection](../../shared/indicators.ts) currently treats an absent period as latest data; the extraction input has no post publication timestamp. The agreed historical-date policy requires adapting this behavior for posts.
- Existing live card/history reads have no per-viewer visibility controls, and accepted chunk text is retained. Keeping analyses out of the public history alone would not establish private storage or private result access.
- YouTube cards are persisted in server-side D1 and fetched by the page/extension. The browser keeps loaded cards in runtime memory; the newer implementation has no durable browser result cache. Its browser storage holds language preference and listening-tab state, not card history.
- The existing model can produce zero cards. Its prompt and empty-state text refer to videos/speech; post attribution and empty-state wording need adaptation.

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

## Next steps

- [Spec draft](x-integration-spec.md): accepted POC scope, contracts, and verification decisions.
- [Ticket breakdown](x-integration-tickets/README.md): approved independent, end-to-end implementation slices.
- [Overnight run](../agents/x-overnight-run.md): client preflight, idempotent GitHub publication, fresh Astra coordinator, sequential tickets, verification, push, and PR instructions. Actual published issues are recorded in the generated issue manifest.

Technical investigation during the build must establish reliable post boundaries, complete text and publication-date extraction, protected-state handling, and local classification behavior across the four surfaces. Missing required source information must produce an honest unsupported/incomplete state rather than fabricated context. Source identity, content hash, and analysis-version compatibility need to be specified in the technical plan.

## Agreed verification interfaces

Confirmed by the maintainer in Q17; no tests have been written:

| Interface | Behavior to exercise | Limit |
| --- | --- | --- |
| Post-analysis request/response through the live Worker, with controlled model and official-data inputs and local D1 | Quote grounding, date policy, results versus empty/error outcomes, shared cache reuse and changed-text invalidation | Does not establish live model quality or X page extraction |
| Extension interaction with representative post pages and a controlled backend reply | Local action visibility, selected-post extraction, quote/media exclusion, truncation, protected state, inline panel and Retry on all four surfaces | Captured fixtures can drift from X's live page |

Add a live Chrome smoke check of the four surfaces and a small labeled post sample for classifier sanity. These observations complement deterministic behavior checks; they do not promise general model accuracy. Use the existing typechecks/builds and shared evaluation for affected consumers.

## Deferred from the POC

Cache expiry/cleanup optimization, feedback collection and improvement dashboards, user prompts for uncertain relevance, protected-content support, X API integration, threads/quoted-post content/media analysis, standalone pasted-post entry, and decisions about the original implementation.

Current X access options are documented in [the access research](x-access-research.md), with official sources and untested details distinguished. Rendered-page text is the selected route; the research's alternatives remain background information. These open items are questions, not default requirements.

## Workflow

Product discovery is complete. Continue with `/to-spec` and `/to-tickets`, then implement approved tickets with the agreed verification interfaces. GitHub is selected; access and remaining repo setup choices are recorded in [the setup proposal](../agents/setup-proposal.md).
