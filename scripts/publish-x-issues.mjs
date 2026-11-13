// Publish this POC's approved spec/tickets. Bodies are files; credentials stay with gh.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = "luanpbrasil/lastro";
const gh = existsSync(join(root, ".cache/tools/github-cli/bin/gh.exe"))
  ? join(root, ".cache/tools/github-cli/bin/gh.exe") : "gh";
const cache = join(root, ".cache/github-publication");
const manifestPath = join(root, "docs/features/x-integration-issues.json");
const label = "ready-for-agent";
const definitions = [
  { key: "spec", title: "[Spec] X post context: Portuguese POC", path: "docs/features/x-integration-spec.md", blockedBy: [] },
  { key: "01", title: "[X POC 01] Contextualize one Portuguese public post", path: "docs/features/x-integration-tickets/01-contextualize-one-post.md", blockedBy: [] },
  { key: "02", title: "[X POC 02] Reuse unchanged public-post results across viewers", path: "docs/features/x-integration-tickets/02-reuse-unchanged-results.md", blockedBy: ["01"] },
  { key: "03", title: "[X POC 03] Compare numerical claims for the post's relevant date", path: "docs/features/x-integration-tickets/03-date-aware-comparisons.md", blockedBy: ["01"] },
  { key: "04", title: "[X POC 04] Bring post context to home, search, and profile feeds", path: "docs/features/x-integration-tickets/04-all-x-surfaces.md", blockedBy: ["01"] },
];

function run(args) {
  return execFileSync(gh, args, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" } }).trim();
}
function list() {
  return JSON.parse(run(["issue", "list", "--repo", repo, "--state", "all", "--limit", "500", "--json", "number,title,url,body"]));
}
function bodyFor(definition, published) {
  let body = readFileSync(join(root, definition.path), "utf8")
    .replace(/^# .+\r?\n/, "")
    .replace(/^Status:.*(?:\r?\n|$)/m, "");
  if (definition.key !== "spec") {
    body = body.replace("X post context: Portuguese POC. Link the published spec issue when publishing this ticket.", published.spec.url);
    body = body.replace(/## Blocked by[\s\S]*$/, "");
    body += "\n## Blocked by\n\n" + (definition.blockedBy.length
      ? definition.blockedBy.map((key) => `- ${published[key].url}`).join("\n") : "None (can start immediately).") + "\n";
  }
  return `<!-- lastro-x-poc:${definition.key} -->\n\n${body.trim()}\n`;
}

for (const definition of definitions) {
  if (!existsSync(join(root, definition.path))) throw new Error(`Missing ${definition.path}`);
}
if (process.argv.includes("--check-branch")) {
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
  if (branch !== "feat/add-twitter-integration") throw new Error("This launcher requires feat/add-twitter-integration");
  console.log(`Branch verified: ${branch}`);
  process.exit(0);
}
if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ repo, label, issues: definitions }, null, 2));
  process.exit(0);
}

const identity = JSON.parse(run(["repo", "view", repo, "--json", "nameWithOwner,viewerPermission,defaultBranchRef"]));
if (identity.nameWithOwner !== repo) throw new Error("Unexpected GitHub repository");
if (!["WRITE", "MAINTAIN", "ADMIN"].includes(identity.viewerPermission)) throw new Error("Repository write access is needed for the overnight PR workflow");
const labels = JSON.parse(run(["label", "list", "--repo", repo, "--limit", "1000", "--json", "name"]));
if (!labels.some((entry) => entry.name === label)) {
  run(["label", "create", label, "--repo", repo, "--color", "0E8A16", "--description", "Specified and ready for agent implementation"]);
}
mkdirSync(cache, { recursive: true });
const published = {};
const nativeRelationships = [];
for (const definition of definitions) {
  const marker = `<!-- lastro-x-poc:${definition.key} -->`;
  let issue = list().find((candidate) => candidate.body.includes(marker));
  if (!issue) {
    const bodyPath = join(cache, `${definition.key}.md`);
    writeFileSync(bodyPath, bodyFor(definition, published), "utf8");
    const url = run(["issue", "create", "--repo", repo, "--title", definition.title, "--body-file", bodyPath, "--label", label]);
    const match = url.match(/^https:\/\/github\.com\/luanpbrasil\/lastro\/issues\/(\d+)$/);
    if (!match) throw new Error(`Verify creation result before retrying: ${url}`);
    issue = { number: Number(match[1]), url, title: definition.title };
  }
  published[definition.key] = { key: definition.key, number: issue.number, url: issue.url,
    title: issue.title, path: definition.path, blockedBy: definition.blockedBy.map((key) => published[key].number) };
  writeFileSync(manifestPath, JSON.stringify({ repo, branch: "feat/add-twitter-integration", model: "gpt-6-astra",
    base: identity.defaultBranchRef.name, spec: published.spec,
    tickets: Object.values(published).filter((entry) => entry.key !== "spec"), nativeRelationships }, null, 2) + "\n");
  console.log(`${definition.key}: ${issue.url}`);
}

// Text references above are retained even if the repository lacks native relationships.
for (const definition of definitions.filter((entry) => entry.key !== "spec")) {
  const issue = published[definition.key];
  try {
    run(["issue", "edit", String(issue.number), "--repo", repo, "--parent", String(published.spec.number)]);
    if (issue.blockedBy.length) {
      const current = JSON.parse(run(["issue", "view", String(issue.number), "--repo", repo, "--json", "blockedBy"]));
      const raw = current.blockedBy;
      const blockers = Array.isArray(raw) ? raw : raw?.nodes ?? [];
      for (const blocker of issue.blockedBy) {
        if (!blockers.some((entry) => entry.number === blocker)) {
          run(["issue", "edit", String(issue.number), "--repo", repo, "--add-blocked-by", String(blocker)]);
        }
      }
    }
    nativeRelationships.push({ ticket: definition.key, configured: true });
  } catch {
    nativeRelationships.push({ ticket: definition.key, configured: false });
    console.warn(`${definition.key}: native relationship setup needs inspection; parent/blocker links are in the issue body.`);
  }
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.nativeRelationships = nativeRelationships;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
for (const issue of Object.values(published)) {
  const verified = JSON.parse(run(["issue", "view", String(issue.number), "--repo", repo, "--json", "number,title,url,body,labels"]));
  if (!verified.body.includes(`<!-- lastro-x-poc:${issue.key} -->`)) throw new Error(`Publication verification failed for ${issue.url}`);
  if (!verified.labels.some((entry) => entry.name === label)) throw new Error(`Missing ${label} on ${issue.url}`);
}
console.log(`Verified spec and four tickets. Manifest: ${manifestPath}`);
