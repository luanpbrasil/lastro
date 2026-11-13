# Matt Pocock workflow setup proposal

**Status: historical full-setup proposal.** GitHub Issues is selected and the X overnight run has an explicit [tracker configuration](issue-tracker.md). Broader triage setup and a root agent instruction filename are optional follow-up work; neither blocks this authorized run. Findings and choices below describe the original proposal unless noted otherwise.

## Findings

- Remote: `git@github.com:luanpbrasil/lastro.git`.
- No existing root `AGENTS.md` or `CLAUDE.md`, tracker configuration, domain map, or ADR directory was found.
- The local Matt skills include `triage` and the idea-to-implementation flows.
- This is a two-package pnpm workspace with one coherent product vocabulary. A single root glossary is likely sufficient; multiple domain contexts remain an option if the vocabulary actually diverges.
- GitHub CLI was initially absent. Version 2.104.0 was subsequently downloaded from its official release into `.cache/tools/github-cli/bin/gh.exe`. Codex CLI 0.167.2 is signed in, an actual Astra preflight succeeded, and SSH read access to origin was verified. GitHub CLI's browser authorization must also complete for publication/PR commands.

The installed [setup skill](C:/Users/Arthus/.agents/skills/setup-matt-pocock-skills/SKILL.md) says: “Explore, present what you found, confirm with the user, then write.” It also says: “If neither exists, ask the user which one to create; don't pick for them.” These are the reasons active tracker configuration and an agent instruction file have not been created.

## Choices to resolve in order

1. **Tracker:** confirmed GitHub Issues in `luanpbrasil/lastro`, matching the existing remote. GitHub CLI is absent, and no connected GitHub integration was confirmed. After the maintainer authorized another attempt, signed-in Zen access to the repository's Issues page and its New issue action was verified on 2026-11-12. Browser publication is available; no issues have been created.
2. **Triage labels:** an asynchronous question is pending on whether to keep `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.
3. **Domain layout:** confirm single-context (`GLOSSARY.md`, `docs/adr/`) versus multiple contexts, given the workspace signal. Recommendation: single-context, since the product terms are shared.
4. **Instruction file:** choose `AGENTS.md` or `CLAUDE.md`. Recommendation for this Codex workspace: `AGENTS.md`.

The final setup review should show the concrete content below, adjusted for these answers, before writing active configuration. No external labels or issues have been created.

## Proposed instruction file

```markdown
# Working on Lastro

For onboarding or behavior questions, read `docs/codebase-guide.md`, then verify
the relevant source. For feature or integration design, also read
`docs/development-workflow.md`. Confirm which implementation the change targets:
the root extension/KV Worker or the newer webapp/D1 implementation.

## Agent skills

### Issue tracker

[Confirmed tracker and location]. See `docs/agents/issue-tracker.md`.

### Triage labels

[Confirmed label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[Confirmed layout]. See `docs/agents/domain.md`.
```

## Proposed `docs/agents/issue-tracker.md`

If GitHub is selected: configure `luanpbrasil/lastro` using the installed setup skill's GitHub template. Verify the authenticated target before publication. Specs become issues; implementation slices become individual issues with blocking relationships and a parent reference. Publication must follow the task's authorization.

If local Markdown is selected: use `.scratch/<feature>/spec.md` and one issue per `.scratch/<feature>/issues/<NN>-<slug>.md`, ordered blockers first. Each issue declares its status, acceptance behavior, and blockers. Tracker operations are file edits.

The selected template, including read/update/blocking operations, should be rendered in full for the setup review; these alternatives are not active defaults.

## Proposed `docs/agents/domain.md`

```markdown
# Domain docs

Read the root `GLOSSARY.md` for domain language before design, specs, or tests.
Read ADRs relevant to the area being changed when `docs/adr/` exists.
Keep definitions in the glossary, product requirements in specs/tickets, and
consequential trade-off decisions in ADRs. Create ADRs when a decision needs one.
Layout: single-context; root `GLOSSARY.md`, root `docs/adr/`.
```

## Proposed `docs/agents/triage-labels.md`

Pending label confirmation:

| Canonical role | Proposed tracker label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer evaluation needed |
| `needs-info` | `needs-info` | Waiting for reporter information |
| `ready-for-agent` | `ready-for-agent` | Specified and ready for implementation |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |
