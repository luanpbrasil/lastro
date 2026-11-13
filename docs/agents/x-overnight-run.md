# Overnight X POC implementation

This file is the implementation instruction for a fresh **GPT-6 Astra** coordinator. The maintainer explicitly authorized implementing all four approved tickets sequentially, committing the changes, pushing the existing feature branch, and creating one PR. Routine implementation, tests, necessary dependency installation, conflict resolution, commits, push, and PR creation are in scope. PR merging and production deployment are not authorized.

## Start here

1. Read `docs/features/x-integration-spec.md`, `docs/features/x-integration-tickets/README.md`, `GLOSSARY.md`, and `docs/codebase-guide.md`. The source-backed guide is a snapshot; verify current code before changing it.
2. Read `docs/features/x-integration-issues.json` for the actual GitHub spec, ticket identifiers, repository, and base branch. Fetch each relevant issue with GitHub CLI before starting it. The user approved this breakdown and sequential order in the overnight request.
3. Work in the existing checkout on **`feat/add-twitter-integration`**. Inspect the initial working tree and preserve all existing changes. Planning documents from this session belong to this feature. Keep a clear planning/bootstrap commit if one is not already present; stage named files rather than unrelated local data.
4. The GitHub CLI executable may be repo-local at `.cache/tools/github-cli/bin/gh.exe`. The launcher prepends that directory to PATH. Confirm `gh auth status` and the explicit target `gh repo view luanpbrasil/lastro --json nameWithOwner,viewerPermission`. Existing SSH access to origin was verified during setup. Never print tokens, read unrelated credential stores, or request pasted secrets.

## Scope that is already decided

- Newer `webapp/` implementation, public Portuguese X posts, own complete written text only.
- Home timeline, individual post pages, search results, and profile feeds.
- A local conservative relevance check controls visibility; unrelated/uncertain posts have no action. No text is sent for model analysis until the explicit click.
- Closable inline results below the selected post, attributed claims, graph context, and supported Brazilian official comparisons. Keep the existing English/Portuguese interface selection.
- Skip protected posts. Require viewer expansion for truncated text. Exclude neighboring/interface text, quoted-post bodies, thread context, and media.
- Shared server-side results for compatible unchanged public-post text; changed text needs fresh analysis. No browser result archive or public X recent-history list.
- Explicit dates take priority; current-relative claims use the publication date. Ambiguous or unsupported comparisons remain unchecked.
- Distinguish progress, cards, explicit no-relevant-claims results, and failure with Retry.
- Images, video, broader languages, feedback collection, cache expiry, and original-implementation migration remain deferred. The media research is not approval to implement media.

## Sequential execution

Use the installed `/implement-spec` and `/implement` workflows, adapted to the user's explicit **sequential execution on the existing branch**. Keep the current feature branch as the integration branch. Avoid unnecessary worktree/branch creation for this sequential run.

Process **01 → 02 → 03 → 04**. The graph has 01 as the blocker of the other three; this order is valid. Do not invent extra graph dependencies merely to represent the chosen sequence.

For each ticket:

1. Record its issue number/title, acceptance criteria, and starting commit in `.cache/x-overnight/progress.md` (create the directory when needed). Honor the work completed by prior tickets.
2. Give that ticket to **one fresh implementer context**, explicitly using `gpt-6-astra` when a model override is needed. Pass pointers to the spec, selected ticket, guide, current branch, and starting commit. Use an empty/fresh conversation rather than forking all of the coordinator history. Run only one code-writing implementer at a time in this checkout.
3. Use `/tdd` at the pre-agreed interfaces below where appropriate. Resolve ordinary implementation choices yourself. The user is going to sleep: proceed through the accepted scope without waiting for per-ticket permission.
4. Review the ticket diff against its starting commit and ticket/spec using `/code-review`; its standards and spec reviewers may work in parallel because they are read-only. Fix actionable findings. Do not ask again for a review base or spec: they are the recorded starting commit and issue/spec pointers.
5. Run the relevant checks, commit that ticket's implementation on the current branch, and record the commit, checks, and remaining evidence gaps. Each ticket must provide its own working behavior and regression checks; do not defer all tests until the end.
6. Continue to the next ticket once its prerequisite behavior is implemented and the deterministic checks pass. Keep GitHub issues open until the final PR is merged; a locally implemented blocker is sufficient for the following ticket in this authorized single-branch run.

If fresh subagents are unavailable, use a fresh `codex exec` Astra child for the selected ticket, with an explicit prompt and result file, and wait for it before starting the next. Avoid recursive coordinators: a child implements only its assigned ticket. If the environment cannot start any fresh context, continue sequentially with documented context limits rather than silently dropping tickets.

## Agreed test interfaces

1. **Post-analysis request/response through the live Worker**, with local D1 and controlled model/official-data inputs: quote grounding, date policy, cards/empty/error states, shared reuse, changed text, and incompatible versions.
2. **Extension selected-post-to-panel behavior**, with representative page fixtures and controlled backend replies: local filtering, text extraction, quoted/neighboring content exclusion, truncation/protected state, inline UI, and Retry on all four surfaces.

Use meaningful expected examples and the repository's existing shared evaluation. Existing baseline commands are `pnpm run typecheck`, `pnpm run eval`, `pnpm --filter lastro-live run typecheck`, `pnpm --filter lastro-live run build`, and `pnpm --filter lastro-live run ext:build`. Add only the harness necessary for the agreed observable behaviors. Validate new migrations on local D1. The existing shared evaluation is not a live-post integration suite.

Run a small labeled Portuguese relevance sample and live Chrome smoke checks when the available browser/account access permits them. Do not fabricate live model or browser evidence. A missing paid key, unavailable authenticated browser, or approval denial must be recorded precisely. Continue independent implementation and deterministic verification; leave the final PR as a **draft** if required live acceptance evidence is missing. Do not claim the entire POC is verified in that case.

Keep existing provider spending caps unchanged. Avoid paid model calls merely to exercise tests that can use controlled responses. A key is not needed for the deterministic suite. Do not deploy, migrate remote databases, modify production data, merge the PR, force-push, reset away user work, or weaken sandbox/security settings.

## Final integration and PR

1. Integrate all four tickets on the existing feature branch and run the full affected verification once. Repeat checks only when fixes or unresolved concerns justify it.
2. Review the complete feature diff against the recorded base branch and the parent spec. Fix findings and confirm that the newer YouTube behavior remains valid.
3. Update source-backed docs that changed, remove stale draft/publication metadata from the local planning index, and keep `.cache/`, credentials, generated bundles, and transcripts out of commits. Respect existing user edits.
4. Push with ordinary `git push -u origin feat/add-twitter-integration`. Read origin's existing base/default branch rather than assuming a different destination. Target only `luanpbrasil/lastro`.
5. Use `/pr` to write a concise evidence-backed PR description, using a UTF-8 body file and `gh pr create --body-file`. Link the actual parent and four ticket issues from the manifest with closing references; they close on merge, not now. Search for an existing PR for this head before creating one, and update it if present.
6. Publish one PR into the base branch. Mark it ready only when its claimed acceptance checks actually passed; otherwise publish a draft with a clear remaining-evidence list. Never merge it.
7. Save a handover report in `.cache/x-overnight/report.md` with the PR URL, ticket-to-commit mapping, commands/results, manual/live checks still needed, and concrete blockers. In the final response report the PR and actual completion state. Use `/retro` for a brief environment retrospective after the implementation/review, without starting an unrelated refactor project.

## When to stop

Stop only for a genuine prerequisite failure that blocks meaningful progress, exhausted service/account limits, a safety/approval denial that cannot be resolved within the authorized scope, or completion of the feature and PR. Preserve commits and write the exact blocker and next command/action in the report. Do not label incomplete work complete to satisfy an overnight deadline.

## CLI guidance

From this repository in a VS Code PowerShell terminal, run:

```powershell
.\scripts\start-x-overnight.cmd
```

The `.cmd` launcher avoids the PowerShell script-policy issue previously observed with `codex.ps1`. It starts a **new** session using `codex.cmd`, Astra, High reasoning, and `--approve-for-me`. That mode uses automatic approval review with the workspace-write sandbox; it does not promise that every action will be approved. Do not add `--sandbox` or `--ask-for-approval` alongside that flag. Keep the terminal open and the computer awake. Complete GitHub device authorization and any initial trust/login prompts before leaving it unattended.

The launcher publishes/verifies the spec and four tickets first, so a missing manifest cannot silently skip GitHub setup. For a client-only preflight without publication or implementation, use `scripts\start-x-overnight.cmd --check`.

If GitHub authorization is still needed, start it in the same VS Code terminal and complete the browser approval before running the launcher:

```powershell
& .\.cache\tools\github-cli\bin\gh.exe auth login --hostname github.com --git-protocol ssh --web --skip-ssh-key
& .\.cache\tools\github-cli\bin\gh.exe auth status
```

If the earlier device code has expired, this command gives a fresh code. Do not paste passwords or tokens into chat or repository files. Once the terminal reports a successful login, run the launcher once. It contains the full all-ticket instruction; launching a session with only `/implement` for 01 would not instruct that session to continue through the remaining tickets.
