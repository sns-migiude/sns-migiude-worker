// アカウント（ペルソナ）の読込と、アカウント別の鍵（creds）の解決。
// Phase 1（単独マルチペルソナ）の土台：1 Workerで複数アカウントを回すための要。
//
// ・運用設定（ニッチ・周期・頻度・承認モード等）は D1 の accounts テーブル
// ・鍵（X/Claude/Threads）は Worker Secret ACCOUNTS_CREDS（JSON）から解決
//   → 鍵はクエリ可能なDBに置かず、シークレット1本に集約（設計書12章）

import type { XCreds } from "./xapi";
import { decryptString } from "./crypto";

export interface Env {
  DB: D1Database;
  LOGIN_PASSWORD?: string; // ログイン用の合言葉（新名）。XのAPIキーとは別物
  API_TOKEN?: string;      // 旧名（後方互換：LOGIN_PASSWORD未設定なら従来どおりこれを使う）
  CREDS_KEY?: string; // D1のcreds暗号化に使う鍵素材（無ければ合言葉で代用）
  ACCOUNTS_CREDS?: string; // フォールバック用JSON（UI連携前の手動設定）
  ANTHROPIC_API_KEY?: string;
  GEN_MODEL?: string;
  POST_SLOTS_JST: string;
  METRICS_SLOT_JST: string;
  METRICS_WINDOW_DAYS: string;
  CYCLE_START_JST?: string; // （旧）固定のサイクル時刻。現在は会員ごとに「最早スロット−PREP_LEAD_MIN分」で回すため未使用
  PREP_LEAD_MIN?: string; // 準備（メトリクス→学習→生成）を初回投稿の何分前に回すか（既定30）
  HONBU_PULL_SLOT_JST?: string; // 受信専用同期の時刻（既定17:00 JST・""で無効）。効く型/お知らせの反映を早める無料の追加pull
  ENV_LABEL?: string; // 環境表示（本番は空・devは「開発環境」）
  POST_ENABLED?: string; // "0" なら実際の投稿をしない（開発環境の安全装置）
  HONBU_URL?: string; // 本部(HQ)のベースURL。未設定なら集合知連携はスキップ
  HONBU_TOKEN?: string; // 本部との連携トークン（INGEST_TOKEN）。本部側と共有
  PUBLIC_URL?: string; // この会員workerの公開URL（計測リンク /r の組み立てに使う）
  MEDIA?: R2Bucket; // 画像・カードのレンダ素材（resvg wasm/フォント/背景/ロゴ）の保存先
  US_RELAY?: DurableObjectNamespace; // Claude API中継DO（米国配置・地域ブロック回避。us-relay.ts）
  FONT_BASE_URL?: string; // カード用フォントの取得元(公開リポraw)。R2未投入の新規会員が初回カード時に自動取得する。
}

// 誘導先URLのコード（account+urlの決定的ハッシュ・FNV-1a→base36）。クリック→CV解析の紐づけキー。
export function linkCode(account: string, url: string): string {
  let h = 0x811c9dc5;
  const s = `${account}|${url}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// 投稿ごとの個別計測コード（ランダム）。どの投稿が効いたかを分けて計測する用。
export function randCode(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(36)).join("").slice(0, 10);
}

// ── worker自身の設定（app_config: key-value） ───────────────────────────────
export async function getConfig(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT value FROM app_config WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>()
    .catch(() => null);
  return row?.value ?? null;
}

export async function setConfig(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  )
    .bind(key, value)
    .run();
}

// この会員Workerの公開URL。Deployボタンで会員ごとにURLが変わるため、リクエストから自動取得して記憶する。
//   PUBLIC_URL var があればそれを優先（wasa本番など）。cron（リクエスト無し）でも config から読めるようにする。
let _pubUrlChecked = false;
export async function rememberPublicUrl(env: Env, origin: string): Promise<void> {
  if (_pubUrlChecked || env.PUBLIC_URL || !origin) { _pubUrlChecked = true; return; }
  _pubUrlChecked = true;
  try {
    if (!(await getConfig(env, "public_url"))) await setConfig(env, "public_url", origin.replace(/\/+$/, ""));
  } catch { /* 失敗しても致命的でない */ }
}
export async function getPublicUrl(env: Env): Promise<string> {
  return env.PUBLIC_URL || (await getConfig(env, "public_url")) || "";
}

// この会員workerの永続ユニークID（account_id）。
//   ① app_config.member_uid があればそれ
//   ② 無く、既にアカウント行があれば最古/オンボ済みのidを採用（既存 "wasa" 等を温存）
//   ③ どちらも無ければ m_<ランダム> を新規発行して永続化
// ＝ハードコードを廃し、worker初回に自動で一意なIDを確定する。
export async function getMemberUid(env: Env): Promise<string> {
  const saved = await getConfig(env, "member_uid");
  if (saved) return saved;
  let uid = "";
  try {
    const ex = await env.DB.prepare(
      `SELECT id FROM accounts ORDER BY (onboarded = 1) DESC, rowid ASC LIMIT 1`
    ).first<{ id: string }>();
    if (ex?.id) uid = ex.id;
  } catch {
    /* accounts 未作成でも続行 */
  }
  if (!uid) uid = "m_" + randCode() + randCode(); // 新規発行（推測されない一意ID）
  await setConfig(env, "member_uid", uid).catch(() => {});
  return uid;
}

// 計測リンク（本サービス経由のリダイレクト）。Xポストに貼る用。クリックを自前計測しCVピクセルへ繋ぐ。
export function trackedLink(base: string, account: string, code: string): string {
  const b = (base || "").replace(/\/+$/, "");
  return `${b}/r?a=${encodeURIComponent(account)}&c=${encodeURIComponent(code)}`;
}

// 誘導先URLに ?sr=<code> を付ける（既存クエリ/ハッシュを尊重）。投稿本文に入るURL用。
export function tagUrl(url: string, code: string): string {
  if (!url || !code) return url;
  const hashIdx = url.indexOf("#");
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  if (/[?&]sr=/.test(base)) return url; // 既に付いていれば触らない
  return base + (base.includes("?") ? "&" : "?") + "sr=" + encodeURIComponent(code) + hash;
}

export interface ThreadsCreds {
  userId: string;
  accessToken: string;
}

export interface AccountCreds {
  x?: XCreds;
  claudeKey?: string;
  threads?: ThreadsCreds;
}

export interface Account {
  id: string;
  handle: string | null;
  display_name: string | null;
  niche: string | null;
  cycle_days: number;
  daily_frequency: number;
  approval_mode: "queue" | "auto";
  platforms: string[];
  active: number;
}

interface AccountRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  niche: string | null;
  cycle_days: number;
  daily_frequency: number;
  approval_mode: string;
  platforms: string; // JSON文字列
  active: number;
}

function parseAccount(row: AccountRow): Account {
  let platforms: string[] = ["x"];
  try {
    const p = JSON.parse(row.platforms);
    if (Array.isArray(p)) platforms = p.map(String);
  } catch {
    /* 壊れていたら x のみにフォールバック */
  }
  return {
    id: row.id,
    handle: row.handle,
    display_name: row.display_name,
    niche: row.niche,
    cycle_days: row.cycle_days,
    daily_frequency: row.daily_frequency,
    approval_mode: row.approval_mode === "auto" ? "auto" : "queue",
    platforms,
    active: row.active,
  };
}

export async function loadActiveAccounts(env: Env): Promise<Account[]> {
  const rows = await env.DB.prepare(
    `SELECT id, handle, display_name, niche, cycle_days, daily_frequency, approval_mode, platforms, active
       FROM accounts WHERE active = 1 ORDER BY id`
  ).all<AccountRow>();
  return rows.results.map(parseAccount);
}

export async function loadAccount(env: Env, id: string): Promise<Account | null> {
  const row = await env.DB.prepare(
    `SELECT id, handle, display_name, niche, cycle_days, daily_frequency, approval_mode, platforms, active
       FROM accounts WHERE id = ?`
  )
    .bind(id)
    .first<AccountRow>();
  return row ? parseAccount(row) : null;
}

// ACCOUNTS_CREDS(JSON)を読む。壊れていても落とさず空に倒す。
function allCreds(env: Env): Record<string, AccountCreds> {
  if (!env.ACCOUNTS_CREDS) return {};
  try {
    const parsed = JSON.parse(env.ACCOUNTS_CREDS);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, AccountCreds>) : {};
  } catch {
    console.error("ACCOUNTS_CREDS のJSONパースに失敗。鍵が解決できません。");
    return {};
  }
}

// 鍵の解決：D1の暗号化creds（会員がUIから連携したもの）を優先。
// 無ければ ACCOUNTS_CREDS シークレット（UI連携前の手動設定）にフォールバック。
export async function resolveCreds(env: Env, accountId: string): Promise<AccountCreds | null> {
  const row = await env.DB.prepare(
    `SELECT creds_enc FROM account_creds WHERE account_id = ?`
  )
    .bind(accountId)
    .first<{ creds_enc: string }>();
  if (row && row.creds_enc) {
    try {
      const json = await decryptString(row.creds_enc, env.CREDS_KEY ?? env.API_TOKEN ?? env.LOGIN_PASSWORD ?? "");
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object") return parsed as AccountCreds;
    } catch {
      console.error(`[${accountId}] creds の復号に失敗`);
    }
  }
  return allCreds(env)[accountId] ?? null;
}

// ログイン用の合言葉を解決（新名 LOGIN_PASSWORD を優先・旧名 API_TOKEN は後方互換）。
export function loginSecret(env: Env): string {
  return env.LOGIN_PASSWORD ?? env.API_TOKEN ?? "";
}

// X投稿に使う鍵。無ければ null（呼び出し側でスキップ）。
export async function xCreds(env: Env, accountId: string): Promise<XCreds | null> {
  const c = (await resolveCreds(env, accountId))?.x;
  if (!c || !c.apiKey || !c.apiSecret || !c.accessToken || !c.accessSecret) return null;
  return c;
}

// 暗号化して保存（UIからの連携）。creds JSON を暗号文にして account_creds に upsert。
export async function saveCreds(
  env: Env,
  accountId: string,
  creds: AccountCreds
): Promise<void> {
  const { encryptString } = await import("./crypto");
  const enc = await encryptString(JSON.stringify(creds), env.CREDS_KEY ?? env.API_TOKEN ?? env.LOGIN_PASSWORD ?? "");
  await env.DB.prepare(
    `INSERT INTO account_creds (account_id, creds_enc, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET creds_enc = excluded.creds_enc, updated_at = datetime('now')`
  )
    .bind(accountId, enc)
    .run();
}
