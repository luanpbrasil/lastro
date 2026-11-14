# Working on Lastro

Lastro explains economic and political claims with attributed context, opposing
views, readings, and supported official figures. Cards contextualize a claim;
they do not judge the truth of an entire argument or its author.

## Find the relevant context

- For architecture or behavior questions, read `docs/codebase-guide.md` and
  `GLOSSARY.md`, then follow the relevant source links.
- For changes and verification, follow `CONTRIBUTING.md`. For feature behavior,
  read the corresponding `docs/features/<feature>/README.md` (`x` or
  `instagram-reels`).
- For running the newer app and extension, use `webapp/README.md`.
- If `.local/context.md` exists, read it for optional personal preferences and
  session handoffs. Verify recorded branch, process, and implementation state
  against the current checkout and task. Fresh clones do not require this file.

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

Keep durable product decisions in the relevant feature document, architecture
changes in the guide, and domain meanings in the glossary. Use GitHub issues and
PRs for tickets and change-specific evidence. Personal workflows, machine setup,
and session handoffs belong in ignored `.local/`; generated artifacts belong in
`.cache/`. Keep shared guidance portable and link to its authoritative document
instead of repeating it. Credentials stay in their existing local stores.
