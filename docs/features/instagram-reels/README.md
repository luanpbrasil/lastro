# Instagram Reels context

This is the accepted feature contract for the newer app and extension. Required
live acquisition proof is tracked separately; this document does not claim that
the integration is already implemented or verified.

## Scope and evidence

Extend the newer `webapp/` extension/Worker for desktop Instagram in Chrome and
Brave. Analyze selected public Reels from other creators in Portuguese within
Lastro's economics/politics scope. Viewer/permalink surfaces are baseline;
inline-feed Reels are included only if live discovery establishes modest
incremental work using the same acquisition path. Opening from a feed/profile
into a supported viewer remains a valid baseline entry point.

Speech, literal on-screen text (including subtitles/creator-added overlays), and
the written description are independently eligible claim sources. Combine
supporting evidence into coherent ideas: source channels are not card boundaries.
Deduplicate repetitions without flattening genuine differences or contradictions.
Keep attribution and source labels; do not assign quoted/third-party speech to
the uploader merely because they posted it.

Read words/numbers, not the meaning of photographs, gestures, scenes, or values
inferred from chart shapes. Exclude private/follower-only content, Stories, DMs,
comments, neighboring posts, native mobile apps, and broader post languages.
Unknown identity/eligibility cannot silently become a verified public source.

## Selected-Reel interaction

- Offer Lastro on otherwise eligible public Reels without requiring the
  description to pass a relevance gate. No capture, transcription, OCR, or model
  analysis merely from scrolling. Relevance is assessed after explicit activation.
- Explain capture and any browser-required toolbar invocation/sharing step.
  Restart the selected Reel, then capture one pass. If seeking/restart is
  unavailable, show a waiting state until a reliable automatic loop reaches the
  beginning. Bound waiting; report unavailable/partial coverage if no start can
  be established. Subsequent loops do not start another paid pass.
- Target the full selected Reel up to Instagram's supported duration limit,
  without a separate three-minute limit. Verify the current consumer ceiling
  from primary evidence; publishing-API or recommendation limits are not
  interchangeable. Use the observed finite playback duration and bounded
  transport/buffering, not one unbounded recording in memory.
- Pause transcription/frame processing with playback, retain seek gaps as
  unanalyzed, and deduplicate replay. Stop capture on source replacement,
  navigation, or scrolling the selected Reel out of view. These automatic exits
  use Cancel semantics: schedule no further work or partial consolidation.
  Already-dispatched work may finish and completed evidence/results remain
  correctly attributed. Returning or selecting another Reel needs a fresh
  explicit request. Pending work remains fenced to its captured identity.
- Preserve the viewer's volume choice. If audible playback is needed, ask them
  to enable Reel audio. Never substitute microphone or unrelated tab audio.
- Show capture progress and source availability immediately. Consolidate cards
  after the pass ends or **Stop and analyze** produces a partial capture.
  **Cancel**, including closing the panel, stops capture/new job scheduling;
  work already dispatched may finish. Cancellation is not an empty result.

## Cards and outcomes

Use the existing nonmodal glass side-panel language and an immediately visible,
expandable bottom sheet on narrower windows. Keep Instagram interactive and
undimmed. Adapt anchoring to the selected player and preserve X/YouTube behavior.

One coherent card may reference several speech/visible-text passages and times.
Offer seeking only when the currently selected player supports it; label
approximate alignment and do not invent description timestamps. Transcription
and OCR are recognized evidence, not guaranteed verbatim original records.

Distinguish loading/waiting/capturing/processing, cards, no relevant claims,
partial results, unsupported/unavailable sources, budget/technical errors, and
cancellation. Identify analyzed and missing sources, expose coverage and Retry,
and qualify an empty result by the material actually analyzed. An unavailable
source or failed provider is not evidence of no claims.

Bounded sampled visual extraction is acceptable. Typical subtitles/persistent
overlays must work in representative tests; full playback coverage does not
prove that every word in every frame was read. Brief, occluded, unreadable, or
missed text remains an evidence limitation. Incomplete fragments and uncertain
numbers/dates cannot become invented claims or silently repaired quotes.

Preserve fact/theory/forecast distinctions, intellectual context, opposing views,
readings, and supported Brazilian official comparisons. Explicit dates tied to
the claim take priority. An old recording saying "currently" cannot blindly use
the Reel's upload date. When the relevant date/value/observation is unsupported
or uncertain, retain context without a numerical verdict.

## Storage, reuse, and cost

Persist derived transcript/OCR/description evidence, source/timing metadata,
coverage, processing compatibility, and cards server-side. Keep raw audio/video/
frames as temporary processing material, with bounded/released browser buffers
and no durable browser recording archive. Submit only selected-Reel audio and
cropped frames to remote processing; whole-page screenshots and unrelated
sources are outside the allowed input.

Reuse saved analyses across viewers with explicit date, sources, coverage and
Refresh. Invalidate detectable description/source changes and processing-version
changes. If current media equivalence cannot be verified, label the result as a
saved observation rather than a fresh verification. Saved partial stays partial;
failed/cancelled attempts are not cached as successful empty results. Namespace
Instagram identities separately from YouTube/X and preserve existing histories.

No public recently-analyzed Reels list, personal archive interface, or automatic
expiry of successful derived results is required in this POC.

STT, OCR and claim analysis share existing configured aggregate caps: $1/day
Claude and 9,000/day Workers AI neurons. Keep stage-specific reservations and
bounded duration/payload/frame/job/retry work; the current text-call allowance
does not price arbitrary media jobs. Show exhaustion and preserve useful partial
work. No automatic paid retry loops or assumption that a text-only fallback can
accept images/audio.

## Feasibility and verification

Before broad implementation, prove selected-source identity/eligibility,
Portuguese speech and readable cropped on-screen text on actual Chrome and
Brave. Establish valid media transport, timing, realistic bounded provider usage,
and the consumer duration ceiling. Native browser speech support and downloadable
Instagram media are not assumptions. Assess adjacent feed players separately;
feed joins this delivery only if source binding/lifecycle/placement can reuse the
same proven acquisition path without cross-Reel contamination.

Verify Worker requests with controlled STT/OCR/model/official-data responses and
isolated D1; exercise selection, lifecycle, coverage, grouping, reuse, cancellation,
dates, budgets, and failure through observable interfaces. Use extension fixtures
for media/source/UI states and live representative Portuguese samples for actual
acquisition/recognition. Include speech-only, text-only, complementary and repeated
claims, differing numbers, muted/no-speech media, and navigation/loop/seek cases.
Run affected X/YouTube and shared-domain checks. Keep fixtures, real-provider
observations and live acceptance evidence distinct in the relevant GitHub work.

This contract does not promise universal transcription/OCR accuracy, stable
Instagram DOM selectors, or successful acquisition before the live gate passes.

## Implementation tracking

[Parent feature issue](https://github.com/luanpbrasil/lastro/issues/8). Implementation and change-specific
evidence live in GitHub:

- [[Reels 01] Prove live acquisition and bounded processing](https://github.com/luanpbrasil/lastro/issues/9)
- [[Reels 02] Analyze one selected Reel’s speech and description](https://github.com/luanpbrasil/lastro/issues/10)
- [[Reels 03] Read on-screen text and reconcile coherent ideas](https://github.com/luanpbrasil/lastro/issues/11)
- [[Reels 04] Compare numerical claims for the relevant period](https://github.com/luanpbrasil/lastro/issues/12)
- [[Reels 05] Reuse saved analyses with honest freshness and coverage](https://github.com/luanpbrasil/lastro/issues/13)
- [[Reels 06] Support explicitly selected inline-feed Reels, conditionally](https://github.com/luanpbrasil/lastro/issues/14)
- [[Reels 07] Verify integrated behavior and existing consumers](https://github.com/luanpbrasil/lastro/issues/15)

Inline-feed support is conditional on the live feasibility result; its issue
records the inclusion or explicit deferral decision.
