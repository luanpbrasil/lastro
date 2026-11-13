# Working on Lastro

Start with the [codebase guide](codebase-guide.md) and [glossary](../GLOSSARY.md). This workflow adapts the locally installed Matt Pocock skills to the repository's current shape. Skill names below refer to those installed skills, not repository scripts. Repo-specific tracker setup is still pending; see the [setup proposal](agents/setup-proposal.md).

## Understand before designing

For an ownership or explanation session, ask the agent to read the guide, then follow the relevant source links and report:

- The user-visible behavior and which implementation supplies it.
- The input-to-output path and the rules enforced along it.
- Evidence from source and existing checks, with unverified assumptions named.
- The smallest runnable example or existing fixture that makes the behavior concrete.

Example: “Read the codebase guide and trace how a caption becomes a numerical comparison in the newer extension. Explain each decision in plain English, cite the source, and identify what the current checks miss.”

This session produced an implementation assessment and vocabulary. It did not establish new product requirements or retrospective ADRs. Record a new ADR only when an actual decision resolves a consequential trade-off; use the glossary solely for domain definitions.

## From a feature idea to a build

1. **Shape the idea with `/grill-with-docs`.** State the viewer's problem and a concrete example. The agent investigates facts in the repo and interviews you about choices. Agree on target surfaces, acceptance behavior, exclusions, error cases, and meaningful testing seams. Capture resolved domain terms and consequential decisions as they emerge.
2. **Settle a runnable uncertainty with `/prototype` when needed.** Use a prototype for a specific question, such as whether a caption retry state feels right or a new card interaction works. Carry its result back into the design. Read the installed skill before invocation for its branch/handoff requirements.
3. **For work spanning sessions, use `/to-spec`, then `/to-tickets`.** The spec synthesizes the agreed design and test seams. Tickets should each deliver a verifiable path through the required layers, declare blockers, and carry enough context for a fresh session. Tracker publication follows the confirmed repo configuration. The small-work path can proceed directly to `/implement` with agreed behavior.
4. **Implement one behavioral slice at a time.** `/implement` uses `/tdd` where practical: agree the seam, make a meaningful behavior fail, then implement enough to pass. Test callers' observable behavior. Run checks for every affected implementation. The installed `/implement` also commits on the current branch; invoke it when that is the intended operation.
5. **Review against both standards and intent.** `/code-review` compares against a supplied fixed point and assesses documented standards and the originating spec separately. It uses parallel reviewers. Preserve the spec/ticket reference and review base so this step has concrete inputs.
6. **Use `/retro` after the build.** Improve navigation, checks, or working conventions based on actual friction in that session.

Read a skill's current `SKILL.md` before executing it; this document is a route through the process, not a replacement for its instructions. A new feature usually starts at step 1, while a question about current behavior starts with source tracing.

## Questions that matter for an integration

Bring a concrete example to `/grill-with-docs`: “I want to ingest captions from source X so a viewer can do Y.” Then resolve the following together:

| Decision | Why Lastro needs it |
| --- | --- |
| Which implementation and surfaces? | The root and live Workers have different protocols, caches, and validators. |
| What input is trusted, and why? | A valid listening token does not prove that submitted text belongs to a video. |
| How are time, identity, language, and source represented? | Quote location, coverage, and timeline behavior all depend on these meanings. |
| What happens to existing cards and coverage? | Live coverage is shared by video; a new transcript or prompt does not automatically trigger reanalysis. |
| What is saved or exposed, and for how long? | Upload logs, accepted chunk text, cards, and shared history have different lifecycles. |
| What happens on interruption or partial success? | Some cards may have been saved before a provider fails. Retries must have defined semantics. |
| How are provider cost and failure handled? | Claude and Workers AI have different reservations and delivery behavior. |
| Which observable behavior proves the integration works? | A passing build alone does not establish ingestion, recovery, or browser behavior. |

Prefer existing interfaces such as upload `Transport`, timeline `PlayerAdapter`, and the Worker request/response interface when they fit. Consult `/codebase-design` when deciding a new module's shape: place substantial behavior behind a small interface, and keep knowledge/change local. Adding another provider does not by itself require a general plugin framework.

## Pick validation to match the change

| Area touched | Existing checks | Additional evidence a feature may need |
| --- | --- | --- |
| Shared graph/stance/transcript logic | Root typecheck, offline eval, both consumer typechecks | A concrete regression example through the relevant public function |
| Live Worker ingestion/storage/budgets | Live typecheck/build, local migrations | Request/response behavior with isolated D1/provider inputs, concurrency/recovery cases relevant to the feature |
| Live overlay/timeline/uploader | Live typecheck/build, newer extension build | Behavior through the player/transport interface and browser interaction for the affected surface |
| Original extension/Worker/demo | Root typecheck/eval, original extension/site builds | Relevant recorded stream behavior and a runtime/browser check |
| Official-data integration | Typechecks; `pnpm facts` exercises real APIs | Independently chosen expected examples and explicit missing/slow-data behavior |
| Topic model/training | Existing classifier reports and parity tooling | Local raw dataset/venv, held-out evaluation, TS/Python parity; these require more than a fresh clone |

The [guide's verification table](codebase-guide.md#verified-implementation-state) lists the exact commands exercised during onboarding. Local live inference calls real providers; decide separately whether a check needs model calls or can use deterministic inputs. Agree new testing seams before running the installed `/tdd` flow.

## Keep the next session useful

Update the guide when a change alters a flow or ownership boundary. Update the glossary when a domain meaning changes. Keep workflow decisions in the configured tracker and ADRs, with source links and acceptance behavior on each ticket.

For a new session, a useful starting prompt is:

> Read `docs/codebase-guide.md`, `docs/development-workflow.md`, and the glossary, then verify the source for the area we're touching. Our task is [concrete behavior]. Explain current behavior and unresolved product choices before proposing an implementation. Use `/grill-with-docs` to resolve those choices, then agree acceptance behavior and test seams.
