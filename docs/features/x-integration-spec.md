# X post context: Portuguese POC

Status: approved for GitHub publication and sequential overnight implementation. Product scope, the two testing interfaces, ticket breakdown, existing feature branch, push, and one final PR are authorized. GitHub CLI authentication/publication is checked by the overnight launcher. No feature implementation is included in this document.

Target: `luanpbrasil/lastro`, branch `feat/add-twitter-integration`.

## Problem Statement

A viewer reading an economic or political post on X cannot use Lastro's existing YouTube context experience to understand its claims. The viewer needs intellectual background, opposing views, and applicable official figures beside the selected post, without analyzing unrelated content or leaving the feed.

## Solution

Extend the newer Lastro Chrome extension and live backend with a Portuguese-first post experience. A local relevance check offers a Lastro action on likely relevant public posts. Clicking it analyzes the post's own complete written text and opens a closable panel directly below that post. The experience works on the home timeline, individual post pages, search results, and profile feeds.

Reuse intellectual context and official-data capabilities where their meanings carry over. Keep the post experience free of video timestamps and playback controls. Save analyses server-side and reuse compatible results for unchanged public-post text across viewers. Keep X activity out of the public recent-analysis history. This is a POC; automatic expiry and feedback tooling are deferred.

## User Stories

1. As a viewer reading Portuguese posts, I want relevant economic and political posts to offer a Lastro action, so that I can ask for context without leaving X.
2. As a viewer, I want unrelated or uncertain posts to have no Lastro action, so that the extension keeps my feed quiet.
3. As a viewer, I want the initial relevance check to happen locally, so that merely scrolling does not send posts to the analysis backend.
4. As a viewer, I want model analysis to begin only after I click Lastro, so that I choose which post is analyzed.
5. As a viewer on an individual post page, I want context attached to that post, so that I can relate each card to its source.
6. As a viewer on the home timeline, I want the same interaction on a post in the feed, so that I can request context while browsing normally.
7. As a viewer searching X, I want the interaction on search-result posts, so that I can contextualize a claim I found through a search.
8. As a viewer browsing a profile, I want the interaction on its feed posts, so that I can inspect a particular claim there.
9. As a viewer, I want only the selected post's own text analyzed, so that replies, embedded quoted posts, and attached media are not attributed to its author.
10. As a viewer encountering truncated text, I want to expand it before analysis, so that a partial statement does not produce misleading context.
11. As a viewer, I want protected-account posts excluded, so that this first version operates on public content only.
12. As a viewer, I want the cards in a closable panel below the selected post, so that the source and result stay together and I can resume browsing.
13. As a viewer, I want separate cards for distinct relevant claims, so that I can understand each claim without a video-style timeline.
14. As a viewer, I want each card to attribute its claim to the post author and quote the supplied text, so that I can distinguish the author's statement from Lastro's explanation.
15. As a viewer, I want available intellectual background, opposing views, episodes, and readings, so that I can explore the claim in context.
16. As a viewer, I want applicable Brazilian numerical claims compared with supported official indicators, so that I can see whether the values match or differ.
17. As a viewer reading an old post, I want explicit dates and publication-relative expressions interpreted correctly, so that an old claim is not compared against today's latest figure by accident.
18. As a viewer, I want an uncertain or unsupported numerical comparison to remain unchecked, so that a lack of evidence is not presented as a verdict.
19. As a viewer, I want unchanged public-post text to reuse an existing analysis, so that I do not wait and spend resources on the same analysis repeatedly.
20. As a viewer of an edited post, I want changed text to receive a fresh analysis, so that cards for an earlier version are not presented as its current context.
21. As a viewer, I want successful analyses with no relevant claims to say so explicitly, so that I understand the result rather than mistake it for a failed request.
22. As a viewer, I want failures to show a small error with Retry, so that I can recover from an interrupted or unavailable analysis.
23. As a viewer, I want X analyses excluded from Lastro's public recent-analysis history, so that requesting context does not add my browsing activity to that list.
24. As an existing Lastro user, I want the newer YouTube experience to continue working, so that support for X does not regress the existing product.

## Implementation Decisions

### Scope and interfaces

- Extend the newer app/backend/extension. Shared domain capabilities may be reused; keep the original extension/backend and decisions about retiring or porting them outside this feature.
- Introduce a post-specific analysis request and result contract rather than representing post text as timed speech. Carry a stable post identity, source text, available publication metadata, and explicit analysis outcomes. Render post cards without requiring a player.
- Preserve the existing English/Portuguese interface selection. Portuguese is the supported and evaluated post-content language for this POC; broader post-language support is deferred.
- Read rendered page text using extension access. No X API integration, separate X authorization flow, or standalone pasted-post entry is part of this version.
- Keep reuse focused on behavior with matching semantics: card content, graph stance, indicators, provider handling, and existing interface strings/styles where appropriate. A general-purpose multi-platform framework is not a POC requirement.

### Source handling and local relevance

- Detect posts independently of the current X surface. Each action and panel belongs to one source post, including when the feed changes or the same post appears again.
- Extract only the selected post's own written content. Exclude quoted-post bodies, thread/reply context, media, surrounding interface text, and neighboring posts.
- Require complete text before model analysis. A truncated post needs viewer expansion; unavailable or unsupported input must not silently become a partial successful analysis.
- Skip protected-account posts. Validate how the extension determines protected/public state on actual X pages; missing required source information must not be treated as proof of public status.
- Treat extracted text and metadata as untrusted client input. A browser observation is not platform attestation of the original author, complete text, or visibility. The POC must not describe this access route as authoritative verification.
- Run relevance filtering locally and conservatively: hide the action for unrelated or uncertain input. Evaluate the existing classifier on a small labeled Portuguese post sample before relying on it for this interaction. User prompts for uncertain classifications are deferred.
- Send selected text for model analysis only after the explicit action. No feed-wide server classification or automatic model analysis is included.

### Analysis and context

- Adapt extraction instructions to authored posts and preserve attribution. Keep the existing fact/theory/forecast distinctions and economics/politics scope.
- Ground displayed quotes in the submitted post text. Speech-specific truncation and normalization must not silently change the post's content. Validate model output and render untrusted text safely.
- Reuse graph-based intellectual context, opposing views, episodes, and readings when a claim has suitable links. Do not fabricate context where none applies.
- Compare only supported Brazilian official indicators. The model extracts claims; deterministic official-data comparison determines whether numerical values match or differ.
- An explicit period in the post takes priority. Resolve current-relative wording against the source publication date, not the date when a viewer requests analysis. Display the period of the selected official observation.
- If the source date, intended period, or suitable contemporaneous official observation cannot be established, retain the context card without a numerical verdict. Do not select a future observation merely because it falls in the same calendar period, or claim that a currently revised historical series proves exactly what was available at publication.

### Persistence, reuse, and request lifecycle

- Store compatible post results in the live server database, separate from video coverage and public video-history semantics. No durable browser result archive is required.
- Reuse analyses across viewers for the same public post and unchanged complete source text. Server-side compatibility must account for the content fingerprint and analysis version, so an edit or changed analysis contract cannot silently reuse incompatible cards. Recompute/validate client-supplied fingerprints server-side.
- A successful empty analysis is distinct from a failed request, including in any saved result. Retry must not mistake a failed request for a valid cached empty analysis.
- Keep client state limited to the interface's needs as posts enter and leave the page. Avoid accumulating a permanent in-memory archive of every post viewed.
- Keep X analyses out of the public recent-analysis history. Shared cached analysis does not imply a new per-viewer browsing-history feature.
- Reuse the current model-provider order and existing spending guardrails. Supporting X does not authorize increasing the configured provider spending caps. Keep cached results available when new analysis is unavailable.
- No automatic expiry, periodic deletion, feedback ingestion, or new analytics system is required for this POC.

### Visible outcomes

- Before any click, unrelated or uncertain posts have no Lastro action or panel.
- After a click, show an analysis-in-progress state, then cards, an explicit no-relevant-claims message, or a small error with Retry.
- Closing a panel returns space to the feed. No playback/time navigation controls appear in a post result.
- The explicit empty-result message supersedes the earlier interview proposal to silently remove an empty panel. It does not authorize automatic analyses or a feedback-collection feature.

## Testing Decisions

The maintainer approved two observable testing interfaces. Test behavior through these interfaces rather than private functions or internal call sequences. Use independent expected examples and controlled external responses for deterministic checks.

1. **Live Worker post-analysis request/response**, with local D1 and controlled model and official-data inputs. Cover valid cards, source quote grounding, empty versus failed outcomes, historical-date selection, unsupported/ambiguous comparisons, shared result reuse, and changed-text/version incompatibility. This establishes backend behavior; it does not measure a live model's extraction quality or X page parsing.
2. **Extension post-to-panel interaction**, using representative page fixtures and controlled backend replies. Cover action visibility, selected-text extraction, quoted/neighboring content exclusion, truncation/expansion, protected state, closable inline presentation, and retry/empty outcomes on all four surfaces. Fixtures do not establish ongoing compatibility with X's live DOM.

Complement those checks with a live desktop Chrome smoke check on home, post detail, search, and profile feeds, plus a small labeled Portuguese post sample for relevance sanity. Save the observed evidence and distinguish behavior regressions from model-quality limitations.

Existing prior art consists of the shared stance/graph/transcript evaluation, recorded model streams, the extension's background transport, and its existing interface adapters. There is no dedicated live post integration suite to extend yet. Add only the harness needed to exercise the two agreed interfaces; avoid a broad test-framework or architecture migration.

Run affected typechecks and builds, and the existing shared evaluation after shared-domain changes. Confirm that the newer YouTube flow still works. Any live model smoke run must report that it used real providers; deterministic verification should not require paid calls.

## Out of Scope

- The original implementation's retirement, migration, or generated-enrichment parity.
- Protected-content support, private-result accounts, or X OAuth/API integration.
- Threads, replies as surrounding context, embedded quoted-post content, images, audio, and video analysis.
- A standalone web-app input for pasted posts or URLs.
- Supported post languages beyond Portuguese in the POC.
- Automatic server/model analysis while scrolling.
- General-purpose fact checking, truth scores, or verdicts on theories, authors, or whole arguments.
- Cache expiry/cleanup optimization, feedback prompts, telemetry collection, and model-improvement dashboards.
- A reusable platform/plugin framework or broad restructuring of the existing video system.

## Further Notes

The acceptance behavior is agreed; actual X extraction and protected-state detection have not been browser-validated yet. Treat those as early implementation evidence to collect, not capabilities already established by research. If live evidence invalidates a required assumption, report the concrete gap before broadening scope.

GitHub Issues is the confirmed tracker. The maintainer approved the implementation slices and authorized publication followed by sequential execution. Authenticated access to the target repository is required; the publication helper verifies the destination, creates the used ready-for-agent label if absent, publishes the spec/tickets, and records their actual identifiers for the overnight run.
