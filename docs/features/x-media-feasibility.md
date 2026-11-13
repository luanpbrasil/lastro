# X media feasibility

Research date: 2026-11-12. Feasibility only; no implementation or accepted-scope change.
The accepted [X specification](x-integration-spec.md) analyzes the selected public
post's own written text from the rendered page, on explicit action, without X API access.
Images, audio, and video remain deferred by that specification.

## Relative difficulty

| Capability | Assessment relative to the text POC | Main additional work |
| --- | --- | --- |
| Read words in an attached image | Moderate, bounded extension | Acquire the selected attachment, extract text, identify it as OCR evidence, handle uncertain readings. |
| Interpret a chart, diagram, or photograph | Larger than OCR | Visual grounding, attribution, units/axes/context, and evidence rules beyond copied text. |
| Analyze a video's spoken claims | Moderate-to-large; useful reuse exists | Select the right player, capture/transcribe its audio, handle playback and partial coverage. |
| Analyze what a video shows | Substantial separate feature | Frame acquisition/sampling, audio/frame alignment, coverage limits, and visual evidence. |

These are engineering judgments, not delivery estimates. Acquisition on real public X
pages has not been validated, and there is no claim that rendered media URLs provide
a complete, stable downloadable file or that an available thumbnail represents a video.

## Model capabilities verified

Anthropic's official page lists the exact configured `claude-haiku-5-5` model with
text and image input and text output. Its documented modalities do not establish native
audio/video input; do not treat an MP4 or a video URL as directly analyzable by this path.
[Haiku 5.5 capabilities](https://platform.claude.com/docs/en/models/haiku-5-5/overview#capabilities)

The Messages API accepts image blocks using base64, URLs, or uploaded file references.
It accepts JPEG, PNG, GIF, and WebP, but animations use only their first frame. Multiple
images can be analyzed together; sampled video frames could therefore be sent as images,
which is an application-built pipeline rather than documented native video ingestion.
[Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision)

Image resolution affects tokens and latency; extra frames multiply this work. Anthropic
warns about mistakes on small, rotated, or low-quality images and approximate localization.
Reading a plotted value or screenshot is therefore an extraction result, not proof that
the underlying claim is true. Existing text-call cost reservations need reassessment
before media calls, without assuming an increase in spending caps.
[Image costs and limitations](https://platform.claude.com/docs/en/build-with-claude/vision#limitations)

Cloudflare describes the configured `@cf/zai-org/glm-4.7-flash` as text generation.
Vision support for that exact fallback is unverified here and must be verified before
promising equivalent image behavior; silently dropping attachments would change meaning.
[Cloudflare model page](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)

## Existing code that can be reused, with boundaries

[factcheck.ts](../../webapp/src/worker/factcheck.ts) currently sends text to the model,
then locates each returned quote in the supplied transcript before accepting its card.
OCR/transcription could supply a separate text evidence layer for this machinery, but
quote presence would validate against recognized text, not original pixels or sound.
Visual claims without source words need a new evidence representation and validator;
they cannot safely be forced through the existing quote requirement.

[offscreen.ts](../../webapp/extension/src/offscreen.ts) already turns a captured tab
audio track into `SpeechListener` text. [background.ts](../../webapp/extension/src/background.ts)
starts capture from the toolbar action and currently restricts it to YouTube watch pages.
Chrome documents user invocation of the extension as a prerequisite, and supports passing
a service-worker stream ID to an offscreen document from Chrome 116. Do not assume the
POC's in-page Analyze button automatically grants this capture authorization.
[Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture/)

That API captures tab audio, not an individually selected post's video. Other playing
content can contaminate it; playback, mute state, navigation, language and stopping rules
need validation on X. The Web Speech specification accepts a live audio track and returns
recognition text; it does not inspect visual frames. Reusing this path would analyze
spoken claims during captured playback, not an entire unseen video in one action.
[Web Speech specification](https://wicg.github.io/speech-api/#dom-speechrecognition-start)

## Product and cache consequences if media is later authorized

The accepted local text relevance filter hides the action for unrelated or uncertain
text. Inference: an economics chart or meaningful video with an empty caption may never
offer Analyze. Supporting that case needs a deliberate local-media relevance rule or
user-triggered media affordance, which changes current scope.

Shared D1 caching can be reused conceptually, but text-only fingerprints are insufficient:
compatibility would need media identity/content, extraction/model versions and, for video,
language and coverage/frame policy. A partial playback transcript must not masquerade as
a complete video result. Attachment evidence must stay separate from post-author text,
quoted-post media, surrounding UI and neighboring posts.

The smallest plausible follow-on is clearly labeled text extraction from selected images,
then spoken-video claims; interpreting charts and video scenes warrants a separate design.
These options are research findings, not additions to the current POC or ticket set.
