# Working on Lastro

Lastro explains economic and political claims with attributed context, opposing
views, readings, and supported official figures. Cards contextualize a claim;
they do not judge the truth of an entire argument or its author.

## Start a session

Read `docs/agents/project-context.md` for the current implementation, accepted
scope, working state, and local testing handoff. Verify the current branch,
working tree, and relevant source before relying on recorded status.

- For architecture or behavior questions, use `docs/codebase-guide.md` and
  `GLOSSARY.md`, then follow their source links.
- For feature or integration design, follow `docs/development-workflow.md`:
  resolve product choices, agree observable acceptance behavior and testing
  seams, then implement verifiable slices. Scale the process to the change.
- For X work, read `docs/features/x-integration-spec.md` and the relevant ticket
  under `docs/features/x-integration-tickets/`. Keep agreed behavior intact
  unless the current task changes it.
- For GitHub work, use `docs/agents/issue-tracker.md`; target
  `luanpbrasil/lastro` explicitly.
- For running or validating the newer app, use `webapp/README.md` and the local
  testing notes in `docs/agents/project-context.md`.

## Implementation boundaries

Active feature development targets `webapp/`: its extension, web interface, and
D1-backed Worker. The root `extension/`, `worker/`, and `site/` are the original
implementation. `shared/` is consumed by both; validate both consumers when
changing shared behavior. The root README's original setup is not the newer
app's setup.

Match verification to the behavior changed. Record controlled tests, real
provider checks, and live browser observations separately. Browser fixtures and
passing builds do not establish compatibility with live X or YouTube.

## Carry context forward

Keep durable decisions and handoffs in repository documents so another session
can find them. Update the project context when the active task or verification
status changes; update the guide for architecture changes and the glossary for
domain meanings. Link to the authoritative spec instead of duplicating it.
Separate dated observations from standing instructions. Conversation transcripts,
ignored `.cache/` artifacts, credentials, and running processes are not portable
project context. Keep secrets in their existing local credential stores.
