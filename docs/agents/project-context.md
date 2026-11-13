# Shared Lastro project context

Last updated: 2026-11-13. This is a session handoff, not an instruction to rerun
completed work. Check source, GitHub, the working tree, and process health when
the current task depends on their live state.

## Product and implementation

- Active implementation: `webapp/`, with a browser extension in
  `webapp/extension/`, shared interface components in `webapp/src/web/`, and a
  Cloudflare Worker backed by D1 in `webapp/src/worker/`.
- Original implementation: root `extension/`, `worker/` (KV), and `site/`.
  Deciding whether to retain parts of that approach is deferred.
- Shared graph, topic classification, stance, and official-data behavior live
  in `shared/`. The app's inference providers are separate from the model used
  by the coding agent; choosing Astra does not change an application provider.
- Architecture and source navigation: [codebase guide](../codebase-guide.md).
  Domain terminology: [glossary](../../GLOSSARY.md).
- The maintainer wants ownership and explanations grounded in source, using the
  [Matt Pocock inspired development workflow](../development-workflow.md).
  Read installed skills when applying them; the workflow doc is a route map.

## X integration and review state

- Feature branch at this handoff: `feat/add-twitter-integration`.
- [Draft PR #7](https://github.com/luanpbrasil/lastro/pull/7) contains the four
  sequentially implemented slices. Last verified pushed head:
  `2d4716f8a1c4d02957412f0523e94330ca0e4997`.
- [Spec #2](https://github.com/luanpbrasil/lastro/issues/2), with tickets
  [01 / #3](https://github.com/luanpbrasil/lastro/issues/3),
  [02 / #4](https://github.com/luanpbrasil/lastro/issues/4),
  [03 / #5](https://github.com/luanpbrasil/lastro/issues/5), and
  [04 / #6](https://github.com/luanpbrasil/lastro/issues/6).
  The [spec](../features/x-integration-spec.md) and
  [ticket index](../features/x-integration-tickets/README.md) hold accepted scope.
- X support covers individual public Portuguese posts on home, detail, search,
  and profile feeds. It analyzes complete authored written text after a click;
  quoted posts, replies, threads, images, and video are outside this POC.
- A conservative local relevance gate hides the action on unrelated or uncertain
  content. The inline closable panel distinguishes cards, explicit no-relevant-
  claims results, and errors with Retry. Protected posts are skipped.
- Results are saved/reused in server-side D1, independently of YouTube history.
  Changed text requires fresh analysis; there is no durable browser result
  archive and no automatic cache expiry in this POC.
- Numerical comparisons use grounded explicit periods before publication-relative
  dates; ambiguous or unsupported comparisons stay unchecked. See the spec and
  guide for the complete policy.
- The overnight implementation completed and stopped. Its instruction to execute
  all tickets is historical, not a standing queue for future sessions.
- The feature PR has not been merged or deployed. This handoff does not authorize
  new publication, deployment, remote migration, merging, or changes to provider
  spending caps.

## Current UI adjustment handoff

On 2026-11-13 the maintainer reported that the Lastro button appears on live X
in Brave and analysis results were generated using the locally running app.
This is a user-reported successful smoke check. No post URL, screenshot, or
complete four-surface acceptance record was captured in this session.

The maintainer now wants to guide a **new Astra session** through UI adjustments.
The desired visual changes have not been specified. Read the current UI before
discussing adjustments, then obtain the maintainer's first concrete example or
direction. A new session should not invent a redesign from this handoff.

Relevant UI source:

- `webapp/extension/src/x-content.ts`: action placement, post lifecycle,
  shadow-root panel and post-specific styles.
- `webapp/src/web/cardview.ts`: shared card rendering, also used by YouTube.
- `webapp/src/web/overlay.css`: shared card/overlay styles.
- `webapp/src/web/i18n.ts`: English and Brazilian Portuguese interface strings.

Preserve YouTube behavior when changing shared presentation. The maintainer is
testing X in Brave; the installed extension is built to use the local Worker.

## Local testing on the maintainer's machine

At this handoff the server was started in the background and verified:
`http://127.0.0.1:8788/` and `/api/videos` returned HTTP 200. The post-analysis
route accepted the configured extension origin and rejected an empty body with
HTTP 400 without making an inference request. Recheck health before claiming it
is still running.

From the repository root:

```powershell
pnpm --filter lastro-live run db:local
pnpm --filter lastro-live dev --host 127.0.0.1 --strictPort
```

Build the extension for this local server explicitly; the default extension
build targets the deployed backend:

```powershell
pnpm --filter lastro-live run ext:build --worker http://127.0.0.1:8788
```

In Brave, open `brave://extensions`, enable Developer mode, and Load unpacked from
`webapp/extension/dist` (resolve this relative to the checkout). Reload an existing
installation after rebuilding, then refresh the relevant X/YouTube tabs.
On X use the inline Lastro button. The extension toolbar action is for YouTube
listening. The standalone localhost page is the YouTube interface, not an X-post
paste interface.

Workers AI connects to the real Cloudflare service even during local development.
Wrangler sign-in and the account's `workers.dev` setup were completed on this
machine; credentials are stored by Wrangler, not in the repository. Other
machines need their own setup. An app deployment is not needed for this local
flow. Keep the configured caps; real inference consumes provider allowance.

Startup previously failed first because Wrangler was signed out and then because
the account lacked a `workers.dev` subdomain. Wrangler's suggested
`/workers/onboarding` dashboard link returned 404. Account setup was completed
through Workers & Pages. Port 8976 was only a temporary OAuth callback; the app
uses 8788.

Local-only artifacts, if still present:

- `.cache/local-dev/run.json`, `server.log`, `server-errors.log`: launcher metadata
  and development-server logs. Verify process identity before stopping anything.
- `.cache/x-overnight/report.md`: detailed implementation/review handover and log
  pointers. Fresh clones may not have these ignored artifacts.
- `.cache/tools/github-cli/bin/gh.exe`: repo-local GitHub CLI on this machine;
  normal `gh` is also supported where installed.
- On this Windows setup, use `codex.cmd` if the `codex.ps1` shim is blocked by
  PowerShell's execution policy. No policy bypass is required.

## Verification baseline and limits

The overnight run at the recorded pushed head passed 19 Worker/local-D1 checks
and 43 extension checks (62 total), 770 shared evaluation checks, root and newer
app typechecks, and newer app/extension builds. These are dated results, not
proof that later edits pass.

Use the scripts in `package.json` and `webapp/package.json` for current commands.
`test:posts` runs the Worker suite before the extension suite: overlapping or
Chrome-first runs previously stalled local workerd. Fixture checks use desktop
Chrome. Preserve logs and identify task-owned processes before cleanup.

Remaining acceptance gaps include full live surface/lifecycle/protected-post
coverage, real-provider quality evaluation, and live YouTube regression checks.
The small Portuguese sample detected 4/6 relevant items and offered no action on
8 unrelated/uncertain items; it is not an independent accuracy benchmark.

A pre-existing modification to `docs/features/x-integration-issues.json` was
preserved outside the implementation commits: the publisher marks native links
unconfigured when reapplying an existing parent fails as a duplicate. Real
parent/blocker relationships were previously verified. Inspect current state
before correcting this supporting-tool issue; preserve unrelated work.
