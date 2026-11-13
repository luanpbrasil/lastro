# Contributing to Lastro

Start with the [codebase guide](docs/codebase-guide.md) and
[glossary](GLOSSARY.md). The active app, extension, and D1 Worker are in
`webapp/`; the root extension, KV Worker, and demo site are the original
implementation. Identify the target before changing a flow. Shared code has
consumers in both implementations.

## Design and implementation

1. Describe the viewer's problem and a concrete before/after example. Trace the
   relevant source before proposing a solution.
2. Resolve product choices, exclusions, error cases, and observable acceptance
   behavior. For a larger feature, put the agreed contract and important
   decisions in `docs/features/<feature>/README.md` and link its GitHub issues.
3. Implement verifiable slices. Use a meaningful failing behavior test where
   practical; keep test inputs controlled when checking deterministic behavior.
   Small presentation changes can use targeted interaction and visual checks.
4. Verify affected consumers and review against the agreed behavior. Report
   what was tested and the limits of that evidence in the PR.

The [X feature document](docs/features/x/README.md) records its behavior and
decisions. Tool selection and personal agent workflows are optional; the
repository does not require a particular coding assistant, model, or skill pack.

## Run locally

Use the pnpm version pinned by `package.json` and install from the repository
root with `pnpm install --frozen-lockfile`. Follow the
[newer app setup](webapp/README.md#run-locally) and
[extension instructions](webapp/README.md#chrome-extension) for interactive use.
The [root README](README.md) describes the original implementation's setup.

The extension's default build uses a hosted backend. Build explicitly for the
local app when testing local changes; rebuilding also requires reloading the
unpacked extension and refreshing the affected browser tabs.

## Verification

Run from the repository root. Choose checks for the area changed; current
scripts and dependencies are defined by the package manifests.

| Area | Commands |
| --- | --- |
| Newer Worker, web client, or extension | `pnpm --filter lastro-live run typecheck` |
| Newer app bundle | `pnpm --filter lastro-live run build` |
| Newer extension bundle | `pnpm --filter lastro-live run ext:build` |
| X request/storage and browser behavior | `pnpm --filter lastro-live run test:posts` |
| Local D1 schema | `pnpm --filter lastro-live run db:local` |
| Shared domain behavior | `pnpm run typecheck`, `pnpm run eval`, and newer app typecheck/builds |
| Original extension or demo | `pnpm run build:ext`, `pnpm run build:site`, and relevant root checks |

The post suite runs Worker tests before extension tests. Overlapping or
Chrome-first runs have stalled local workerd; preserve this order when running
the combined suite. Extension fixtures require installed desktop Google Chrome.
Worker checks use isolated local D1 and controlled model/official-data inputs.
Fixtures cover UI interaction and source lifecycle without making provider
calls. Check live X surfaces and newer YouTube behavior when those flows change.

Separate deterministic test results, real-provider observations, and live
browser evidence. A passing fixture does not establish compatibility with a
site's current DOM, live playback/capture, or model extraction quality. Put
command results, screenshots, sampled posts, and remaining acceptance gaps in
the PR or issue rather than accumulating dated run reports in repository docs.

Local inference uses real provider accounts and their allowances. Use it when
the validation needs a real provider; deterministic checks do not require it.
Keep the configured application spending limits.

## Issues and pull requests

Use [luanpbrasil/lastro](https://github.com/luanpbrasil/lastro) for issues and PRs.
Look for existing work before creating duplicates. Feature issues describe
acceptance behavior and real dependencies; the feature document describes the
maintained contract. Reference the relevant issues in the PR and use closing
references when appropriate. Completion of local implementation does not close
an issue before its PR merges.

A PR should explain the problem, resulting behavior, relevant verification, and
material gaps. Use UTF-8 body files for multiline CLI submissions. Branch push,
merge, deployment, and remote database migration are distinct operations.

## Documentation boundaries

- Commit portable setup, architecture, domain language, current feature
  contracts, important rationale, and known product limitations.
- Keep one concise document per feature initially. Link to source and GitHub
  history; split documents only when they serve a distinct maintained purpose.
- Keep personal agent preferences, machine-specific notes, session handoffs,
  exploratory research, and one-off automation in ignored `.local/`. Root
  `AGENTS.md` optionally loads `.local/context.md` when it exists.
- Keep generated logs, screenshots, downloaded tools, and runtime metadata in
  ignored `.cache/`. Store credentials through the appropriate local credential
  mechanism. Shared project utilities remain in `scripts/`.
