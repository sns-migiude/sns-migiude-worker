// 会員(支部) ↔ 本部(HQ) の連携。
// 送るのは「型の構造（プロンプト）＋成績シグナル（平常比中央値・サンプル数）」だけ。
// 送らない：本文・文体・ネタ・exec_notes（堀）・各種キー。voice-agnostic を壊さない。
import { getMemberUid, getConfig, setConfig, type Env } from "./accounts";

// 会員ごとの本部トークンを確保する。app_config.honbu_token に無ければ /hq/register で発行して保存。
//   返り値＝以後の連携に使うトークン（per-member）。登録できなければ null（共通トークンにフォールバック）。
async function ensureHonbuToken(env: Env, memberId: string, label: string | null, email: string | null): Promise<string | null> {
  const saved = await getConfig(env, "honbu_token");
  if (saved) return saved;
  if (!env.HONBU_URL) return null; // 登録は招待コードで認証＝共有HONBU_TOKENは必須でない（公開Worker前提）。
  const inviteCode = (await getConfig(env, "invite_code")) || undefined; // 招待コード（オンボで保存）。本部の入口ゲート用。
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.HONBU_TOKEN) headers.Authorization = `Bearer ${env.HONBU_TOKEN}`; // 運営同居など共有トークンがある時だけ付ける
    const res = await fetch(`${env.HONBU_URL}/hq/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({ member_id: memberId, label, email, invite_code: inviteCode }),
    });
    if (res.ok) {
      const d = (await res.json()) as { token?: string };
      if (d.token) {
        await setConfig(env, "honbu_token", d.token);
        return d.token;
      }
    }
    return null; // 409(already_registered)等 → 共通トークンにフォールバック
  } catch {
    return null;
  }
}

// ライセンス有効化：招待コード付きで本部に会員登録する。結果を精密に返す（オンボの同意ゲート用）。
//   ok=true：登録成功 or 既登録（どちらも先へ進んでよい）。ok=false＋error：招待コード不正・本部不通など。
export async function registerWithHonbu(
  env: Env, memberId: string, label: string | null, email: string | null, inviteCode: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.HONBU_URL) return { ok: false, error: "honbu_unconfigured" }; // 招待コード認証＝共有トークンは必須でない
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.HONBU_TOKEN) headers.Authorization = `Bearer ${env.HONBU_TOKEN}`;
    const res = await fetch(`${env.HONBU_URL}/hq/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({ member_id: memberId, label, email, invite_code: inviteCode }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; error?: string };
    if (res.ok && d.token) { await setConfig(env, "honbu_token", d.token); return { ok: true }; }
    if (res.status === 409) return { ok: true, error: "already_registered" }; // 既登録＝OK扱い
    return { ok: false, error: d.error || `http_${res.status}` };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

// この会員の本部トークンを取得（無ければ登録して発行）。リファラル系API用。
async function memberAuthToken(env: Env): Promise<string | null> {
  const saved = await getConfig(env, "honbu_token");
  if (saved) return saved;
  if (!env.HONBU_URL) return null;
  const uid = await getMemberUid(env);
  let label: string | null = null;
  try {
    const r = await env.DB.prepare(`SELECT handle FROM accounts WHERE id = ?`).bind(uid).first<{ handle: string | null }>();
    label = r?.handle ?? null;
  } catch { /* handle不明でも続行 */ }
  const email = await getConfig(env, "member_email");
  return await ensureHonbuToken(env, uid, label, email);
}

// リファラル：1人1種類の招待コード（有効回数つき）。
export interface MyInvites {
  ok: boolean;
  error?: string;
  code?: string;
  max_uses?: number; // 有効回数（1人が招待できる人数）
  used?: number;     // 使用済み回数
  remaining?: number; // 残り有効数
  status?: string;
  deploy_url?: string;
  lp_url?: string;
}

// リファラル：自分の招待コード（無ければ自動発行）を本部から取得。
export async function listMyInvites(env: Env): Promise<MyInvites> {
  if (!env.HONBU_URL) return { ok: false, error: "honbu_unconfigured" };
  const tok = await memberAuthToken(env);
  if (!tok) return { ok: false, error: "not_registered" };
  try {
    const res = await fetch(`${env.HONBU_URL}/hq/my-invites`, { headers: { Authorization: `Bearer ${tok}` } });
    const d = (await res.json().catch(() => ({}))) as MyInvites;
    if (!res.ok) return { ok: false, error: d.error || `http_${res.status}` };
    return d;
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

function median(xs: number[]): number {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface WinSig { m: number; n: number } // m=平常比中央値, n=本数（その期間）
interface ShareType {
  type_key: string;
  name: string;
  prompt: string;
  format: string | null;
  shared: boolean;
  signal: { er_norm_med: number; sample_n: number; windows: Record<string, WinSig> };
}

const SCORE_WINDOWS = [14, 30, 90]; // スコア測定期間（日）

// custom_types を全て集め（強制共有）、各型の平常比中央値とサンプル数を「期間別(14/30/90日)」に付ける。
// 平常比＝その期間内の自分の er_raw 中央値を基準にした比（期間ごとに基準を測り直す）。
async function gatherShareTypes(env: Env, acc: string): Promise<ShareType[]> {
  let rows: Array<{ id: number; name: string; prompt: string }> = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, name, prompt FROM custom_types WHERE account_id = ?`
    ).bind(acc).all<{ id: number; name: string; prompt: string }>();
    rows = r.results ?? [];
  } catch {
    return [];
  }
  // この会員の投稿済みツイートの「最新メトリクスの er_raw」＋投稿からの経過日数＋hook をまとめて取得。
  let posts: Array<{ hook: string; er: number; age: number }> = [];
  try {
    const pr = await env.DB.prepare(
      `SELECT p.hook AS hook, m.er_raw AS er, (julianday('now') - julianday(p.posted_at)) AS age
         FROM posts p JOIN post_metrics m ON m.post_id = p.id
        WHERE p.account_id = ? AND p.status = 'posted' AND p.posted_at IS NOT NULL
          AND m.er_raw IS NOT NULL AND m.impressions > 0
          AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id)`
    ).bind(acc).all<{ hook: string | null; er: number; age: number }>();
    posts = (pr.results ?? [])
      .filter((x) => typeof x.er === "number" && typeof x.age === "number" && x.hook)
      .map((x) => ({ hook: x.hook as string, er: x.er, age: x.age }));
  } catch {
    posts = [];
  }
  // 期間ごとの基準＝その期間内の全投稿の er_raw 中央値。
  const baseline: Record<number, number> = {};
  for (const w of SCORE_WINDOWS) {
    const inW = posts.filter((p) => p.age <= w).map((p) => p.er);
    baseline[w] = inW.length ? median(inW) : 0;
  }
  const out: ShareType[] = [];
  for (const t of rows) {
    const hook = `⭐ ${t.name}`;
    const windows: Record<string, WinSig> = {};
    for (const w of SCORE_WINDOWS) {
      const base = baseline[w];
      if (base <= 0) continue;
      const ers = posts.filter((p) => p.hook === hook && p.age <= w).map((p) => p.er / base);
      if (ers.length) windows[String(w)] = { m: Math.round(median(ers) * 1000) / 1000, n: ers.length };
    }
    const w90 = windows["90"]; // 既定（後方互換の er_norm_med/sample_n）は最も広い90日窓
    const fmt = /2つの連続|連結|reply_text|2本目/.test(t.prompt) ? "thread" : "single";
    out.push({
      type_key: t.name,
      name: t.name,
      prompt: t.prompt,
      format: fmt,
      shared: true,
      signal: { er_norm_med: w90 ? w90.m : 0, sample_n: w90 ? w90.n : 0, windows },
    });
  }
  return out;
}

// 1会員ぶんを本部へ送る。送れた型数を返す。authTok＝会員ごとトークン（無ければ共通HONBU_TOKEN）。email＝周知メール宛先。
export async function pushAccount(env: Env, acc: string, label: string | null, authTok?: string, email?: string | null): Promise<number> {
  if (!env.HONBU_URL) return 0;
  const tok = authTok || env.HONBU_TOKEN; // 会員ごとトークン優先。公開会員はこちら（HONBU_TOKEN無し）。
  if (!tok) return 0; // 認証手段なし（会員トークン未取得＋共有トークンなし）→送れない
  const types = await gatherShareTypes(env, acc);
  if (!types.length) return 0;
  const res = await fetch(`${env.HONBU_URL}/hq/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ member_id: acc, label, email: email ?? undefined, types }),
  });
  if (!res.ok) throw new Error(`HQ ingest ${res.status}`);
  return types.length;
}

// 投稿レコード（運営分析用）を集める。送るのは「公開投稿のID・型ラベル・数値メトリクス・形式/画像/リンクのフラグ」だけ。
// 本文(body)・リプ(reply_text)は送らない（URLは本部側で handle+id から組み立て・公開ポストに飛べる）。
async function gatherSharePosts(env: Env, acc: string): Promise<Array<Record<string, unknown>>> {
  try {
    const r = await env.DB.prepare(
      `SELECT p.platform_post_id AS pid, p.hook AS hook, p.posted_at AS posted_at, p.chars AS chars,
              CASE WHEN p.reply_platform_post_id IS NOT NULL THEN 1 ELSE 0 END AS is_thread,
              CASE WHEN p.link_code IS NOT NULL AND p.link_code <> '' THEN 1 ELSE 0 END AS has_link,
              m.impressions AS impressions, m.likes AS likes, m.reposts AS reposts, m.replies AS replies,
              m.quotes AS quotes, m.bookmarks AS bookmarks, m.url_link_clicks AS link_clicks,
              m.profile_clicks AS profile_clicks, m.er_raw AS er_raw
         FROM posts p JOIN post_metrics m ON m.post_id = p.id
        WHERE p.account_id = ? AND p.status = 'posted' AND p.platform_post_id IS NOT NULL
          AND p.posted_at IS NOT NULL AND p.deleted_at IS NULL
          AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id)
          AND p.posted_at >= datetime('now','-120 days')
        ORDER BY p.posted_at DESC LIMIT 500`
    ).bind(acc).all<Record<string, unknown>>();
    return (r.results ?? []).map((x) => {
      const hook = (x.hook as string) || "";
      const pat = hook.split("##")[1] || "";
      const hasImage = /^img_/.test(pat) ? 1 : 0; // 画像付きパターン
      return { ...x, has_image: hasImage };
    });
  } catch {
    return [];
  }
}

// 投稿レコードを本部へ送る（運営分析用・会員には再配布しない）。送れた件数を返す。
export async function pushPosts(env: Env, acc: string, handle: string | null, authTok?: string): Promise<number> {
  if (!env.HONBU_URL) return 0;
  const tok = authTok || env.HONBU_TOKEN;
  if (!tok) return 0;
  const posts = await gatherSharePosts(env, acc);
  if (!posts.length) return 0;
  const res = await fetch(`${env.HONBU_URL}/hq/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ member_id: acc, handle: handle ? handle.replace(/^@/, "") : null, posts }),
  });
  if (!res.ok) throw new Error(`HQ posts ${res.status}`);
  return posts.length;
}

// 本部の「効く型ライブラリ（昇格）」を取得し、ローカルキャッシュを総入れ替え。
export async function pullLibrary(env: Env, authTok?: string): Promise<number> {
  if (!env.HONBU_URL) return 0;
  const tok = authTok || env.HONBU_TOKEN;
  if (!tok) return 0;
  const res = await fetch(`${env.HONBU_URL}/hq/library?status=listed`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!res.ok) throw new Error(`HQ library ${res.status}`);
  const data = (await res.json()) as {
    library?: Array<{ type_key: string; name: string; prompt: string; format?: string; score?: number; member_count?: number; sample_total?: number; scores_json?: string }>;
  };
  const lib = data.library ?? [];
  await env.DB.prepare(`DELETE FROM hq_library`).run();
  for (const x of lib) {
    if (!x.type_key || !x.prompt) continue;
    await env.DB.prepare(
      `INSERT INTO hq_library (type_key, name, prompt, format, score, member_count, sample_total, scores_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(type_key) DO UPDATE SET name=excluded.name, prompt=excluded.prompt, format=excluded.format,
         score=excluded.score, member_count=excluded.member_count, sample_total=excluded.sample_total,
         scores_json=excluded.scores_json, updated_at=datetime('now')`
    ).bind(x.type_key, x.name ?? x.type_key, x.prompt, x.format ?? null, x.score ?? 0, x.member_count ?? 0, x.sample_total ?? 0, x.scores_json ?? null).run();
  }
  return lib.length;
}

// 本部からのお知らせ（周知）を取得してローカルにキャッシュ（総入れ替え）。
export async function pullBroadcasts(env: Env, authTok?: string): Promise<number> {
  if (!env.HONBU_URL) return 0;
  const tok = authTok || env.HONBU_TOKEN;
  if (!tok) return 0;
  const res = await fetch(`${env.HONBU_URL}/hq/broadcasts`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!res.ok) throw new Error(`HQ broadcasts ${res.status}`);
  const data = (await res.json()) as { broadcasts?: Array<{ id: number; title: string; body: string; created_at?: string }> };
  const bcs = data.broadcasts ?? [];
  await env.DB.prepare(`DELETE FROM hq_broadcasts`).run();
  for (const x of bcs) {
    if (!x.id || !x.title) continue;
    await env.DB.prepare(
      `INSERT INTO hq_broadcasts (id, title, body, created_at, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, created_at=excluded.created_at, fetched_at=datetime('now')`
    ).bind(x.id, x.title, x.body ?? "", x.created_at ?? null).run();
  }
  return bcs.length;
}

// 全会員を本部へpush → ライブラリ＆お知らせをpull。日次cronと手動エンドポイントから呼ぶ。
export async function syncHonbu(env: Env): Promise<{ pushed_accounts: number; pushed_types: number; pushed_posts: number; library: number; broadcasts: number }> {
  if (!env.HONBU_URL) return { pushed_accounts: 0, pushed_types: 0, pushed_posts: 0, library: 0, broadcasts: 0 };
  // この会員(=worker)の永続ユニークID。本部にはこのIDで登録・連携する（1 worker = 1 member）。
  const memberUid = await getMemberUid(env);
  let label: string | null = null;
  try {
    const r = await env.DB.prepare(`SELECT handle FROM accounts WHERE id = ?`).bind(memberUid).first<{ handle: string | null }>();
    label = r?.handle ?? null;
  } catch { /* handle不明でも続行 */ }
  const memberEmail = await getConfig(env, "member_email"); // 周知メール宛先（B方式）
  // 会員ごとトークンを確保（初回は /hq/register で発行）。失敗時は共通HONBU_TOKENにフォールバック。
  const memberToken = await ensureHonbuToken(env, memberUid, label, memberEmail);
  const authTok = memberToken || env.HONBU_TOKEN;
  if (!authTok) return { pushed_accounts: 0, pushed_types: 0, pushed_posts: 0, library: 0, broadcasts: 0 }; // 認証手段なし（招待未登録＋共有トークンなし）→同期不可

  let accounts: Array<{ id: string; handle: string | null }> = [];
  try {
    const r = await env.DB.prepare(`SELECT id, handle FROM accounts WHERE onboarded = 1`).all<{ id: string; handle: string | null }>();
    accounts = r.results ?? [];
  } catch {
    accounts = [];
  }
  let pushedAccounts = 0;
  let pushedTypes = 0;
  let pushedPosts = 0;
  for (const a of accounts) {
    try {
      // per-memberトークンがある場合、本部はトークンからmember_idを確定する（body.member_idは無視）。
      const n = await pushAccount(env, a.id, a.handle ?? label, authTok, memberEmail);
      if (n > 0) {
        pushedAccounts++;
        pushedTypes += n;
      }
    } catch (e) {
      console.error(`HQ push失敗 ${a.id}: ${e instanceof Error ? e.message : e}`);
    }
    try {
      // 投稿レコード（運営分析用・本文は送らない）。失敗しても型pushは活かす。
      pushedPosts += await pushPosts(env, a.id, a.handle ?? label, authTok);
    } catch (e) {
      console.error(`HQ posts push失敗 ${a.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  let library = 0;
  try {
    library = await pullLibrary(env, authTok);
  } catch (e) {
    console.error(`HQ pull失敗: ${e instanceof Error ? e.message : e}`);
  }
  let broadcasts = 0;
  try {
    broadcasts = await pullBroadcasts(env, authTok);
  } catch (e) {
    console.error(`HQ broadcasts取得失敗: ${e instanceof Error ? e.message : e}`);
  }
  return { pushed_accounts: pushedAccounts, pushed_types: pushedTypes, pushed_posts: pushedPosts, library, broadcasts };
}

// 受信専用同期：本部から「効く型ライブラリ」と「お知らせ」だけを取得する（push・メトリクス取得なし）。
// X/Claude APIを一切使わない＝無料。日次のフル同期(syncHonbu)と別の時刻に走らせ、集合知/お知らせのアプリ内反映を早める用途。
export async function pullFromHonbu(env: Env): Promise<{ library: number; broadcasts: number }> {
  if (!env.HONBU_URL) return { library: 0, broadcasts: 0 };
  const memberUid = await getMemberUid(env);
  let label: string | null = null;
  try {
    const r = await env.DB.prepare(`SELECT handle FROM accounts WHERE id = ?`).bind(memberUid).first<{ handle: string | null }>();
    label = r?.handle ?? null;
  } catch { /* handle不明でも続行 */ }
  const memberEmail = await getConfig(env, "member_email");
  const memberToken = await ensureHonbuToken(env, memberUid, label, memberEmail);
  const authTok = memberToken || env.HONBU_TOKEN;
  if (!authTok) return { library: 0, broadcasts: 0 }; // 認証手段なし → 受信不可
  let library = 0;
  try {
    library = await pullLibrary(env, authTok);
  } catch (e) {
    console.error(`HQ pull(受信専用)失敗: ${e instanceof Error ? e.message : e}`);
  }
  let broadcasts = 0;
  try {
    broadcasts = await pullBroadcasts(env, authTok);
  } catch (e) {
    console.error(`HQ broadcasts取得(受信専用)失敗: ${e instanceof Error ? e.message : e}`);
  }
  return { library, broadcasts };
}
