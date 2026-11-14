import { sha256Hex } from "../../../shared/transcript";
import type { PostAnalysis, PostSource } from "../types";

/** Bump whenever extraction, validation, graph context or numerical comparison semantics change. */
const ANALYSIS_VERSION = "post-v3"; // v3: Claude adds context and counterpoint (notes.ts)
// Recovery for an interrupted Worker, not an expiry policy for successful results.
const CLAIM_MS = 3 * 60 * 1000;
type PostKey = [postId: string, textFingerprint: string, metadataFingerprint: string, version: string];
const KEY_WHERE = "post_id = ? AND text_fingerprint = ? AND metadata_fingerprint = ? AND analysis_version = ?";
interface PostClaim { key: PostKey; attemptId: string }
type ClaimOutcome = { status: "cached"; id: string } | { status: "pending" } | { status: "claimed"; claim: PostClaim };

async function postKey(source: PostSource): Promise<PostKey> {
  // Exact complete text: no speech cleaning, normalization or client-supplied hash.
  // Metadata affects attribution and date policy; missing dates must not reuse dated results.
  const [text, metadata] = await Promise.all([
    sha256Hex(source.text),
    sha256Hex(JSON.stringify([source.url, source.author, source.handle, source.publishedAt, source.lang])),
  ]);
  return [source.postId, text, metadata, ANALYSIS_VERSION];
}

async function cachedPostId(db: D1Database, key: PostKey): Promise<string | null> {
  const row = await db.prepare(`SELECT result_id FROM post_analysis_keys WHERE ${KEY_WHERE}`).bind(...key).first<{ result_id: string }>();
  return row?.result_id ?? null;
}

export async function claimPost(db: D1Database, source: PostSource): Promise<ClaimOutcome> {
  const key = await postKey(source);
  const cached = await cachedPostId(db, key);
  if (cached) return { status: "cached", id: cached };
  const attemptId = crypto.randomUUID();
  const now = Date.now();
  const acquired = await db.prepare(`
    INSERT INTO post_analysis_keys (post_id, text_fingerprint, metadata_fingerprint, analysis_version, attempt_id, lease_until)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (post_id, text_fingerprint, metadata_fingerprint, analysis_version) DO UPDATE
    SET attempt_id = excluded.attempt_id, lease_until = excluded.lease_until
    WHERE post_analysis_keys.result_id IS NULL AND post_analysis_keys.lease_until <= ?
  `).bind(...key, attemptId, now + CLAIM_MS, now).run();
  if (acquired.meta.changes) return { status: "claimed", claim: { key, attemptId } };
  // A competing request may have finished since the initial lookup.
  const completed = await cachedPostId(db, key);
  return completed ? { status: "cached", id: completed } : { status: "pending" };
}

export async function releasePost(db: D1Database, { key, attemptId }: PostClaim): Promise<void> {
  // Failed attempts remain retryable. An old attempt cannot release its successor's lease.
  await db.prepare(`UPDATE post_analysis_keys SET lease_until = 0 WHERE ${KEY_WHERE} AND attempt_id = ? AND result_id IS NULL`)
    .bind(...key, attemptId).run();
}

export async function savePost(db: D1Database, { key, attemptId }: PostClaim, result: PostAnalysis): Promise<boolean> {
  // The result and its lookup become visible atomically, only while this attempt owns the lease.
  // Late providers cannot overwrite or publish results after another attempt takes over.
  const [saved] = await db.batch([
    db.prepare(`INSERT INTO post_results (id, post_id, source, status, cards, analysed_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS
      (SELECT 1 FROM post_analysis_keys WHERE ${KEY_WHERE} AND attempt_id = ? AND result_id IS NULL AND lease_until > ?)`)
      .bind(result.id, result.source.postId, JSON.stringify(result.source), result.status, JSON.stringify(result.cards), result.analysedAt, ...key, attemptId, Date.now()),
    db.prepare(`UPDATE post_analysis_keys SET result_id = ?, lease_until = 0 WHERE ${KEY_WHERE} AND attempt_id = ?
      AND EXISTS (SELECT 1 FROM post_results WHERE id = ?)`)
      .bind(result.id, ...key, attemptId, result.id),
  ]);
  return saved.meta.changes === 1;
}
