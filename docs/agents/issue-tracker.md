# Issue tracker: GitHub

The maintainer selected **GitHub Issues in `luanpbrasil/lastro`** and explicitly authorized publication of the X POC spec and four tickets, sequential implementation, branch push, and one final PR. Target that repository explicitly with `--repo luanpbrasil/lastro`; verify it with `gh repo view` before writes.

- Actual spec/ticket URLs and graph: `docs/features/x-integration-issues.json`.
- `ready-for-agent` marks the approved X POC work. The publication script creates that label only if missing. Broader triage-label setup is not needed for this run.
- Read an issue: `gh issue view <number> --repo luanpbrasil/lastro --json number,title,body,labels,comments`.
- Create/edit bodies with `--body-file` and UTF-8 files. Keep real newlines; do not shell-interpolate Markdown bodies.
- Use native parent/sub-issue and blocking relationships when available. The published issue bodies also carry parent and blocker links as a readable fallback.
- Read the graph before implementation. A chosen sequential execution order does not add new blocking edges.
- Issues remain open until the feature PR merges. Record ticket completion in commits and the handover report; the final PR carries closing references.
- Search existing issues/PRs before creating duplicates. The X publication helper uses stable body markers and a checked-in manifest.
- GitHub CLI may be repo-local at `.cache/tools/github-cli/bin/gh.exe`. Authentication uses GitHub CLI's own credential handling; do not print tokens.

PRs as a request surface: no.
