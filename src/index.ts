// SNSの右腕 会員Worker（Phase 1：単独マルチペルソナ）エントリポイント
// - Cron（30分おき）: 今がJSTでどの枠かを判定し、有効アカウントを順に処理
//     投稿枠   → 各アカウントのキュー先頭を1本投稿
//     メトリクス枠 → 成果収集（次スライスで実装）
//     それ以外  → 個性ループのサイクル前進（次スライスで実装）
// - HTTP API: アカウント登録・キュー投入・投稿テスト・状態確認（UIは後回し。当面これで駆動）

import {
  createPost,
  deleteTweet,
  fetchAccountMetrics,
  fetchRecentTweets,
  uploadMedia,
  weightedLength,
  type XCreds,
} from "./xapi";
import {
  loadActiveAccounts,
  loadAccount,
  xCreds,
  saveCreds,
  resolveCreds,
  linkCode,
  getMemberUid,
  getConfig,
  setConfig,
  rememberPublicUrl,
  type Account,
  type AccountCreds,
  type Env,
} from "./accounts";
import { callClaude, verifyClaudeKey, setClaudeRelay } from "./claude";
export { UsRelay } from "./us-relay";
import { HELP_SPEC, HELP_RULES } from "./help";
import { generateDrafts } from "./generate";
import { logClaudeUsage } from "./usage";
import { syncHonbu, pullFromHonbu, registerWithHonbu, listMyInvites, ensureHonbuToken, fetchHonbuEmail } from "./honbu";
import { getPromptPack, refreshPrompts, hydrateFromCache } from "./prompts";
import { TYPE_INSTRUCTIONS, CATALOG, CATALOG_KEYS, DEFAULT_ON, DEFAULT_ON_FREE, isLongType, PATTERNS, metaOf, URL_TYPE_INSTRUCTION, URL_STYLES, resolveImageType } from "./taxonomy";

// URL誘導(url)パターンの生成指示を作る。登録済みの飛ばし先があれば、その「タイトル・説明・URL」を使って
// サンプルも実情報ベースで生成する（1本目をその内容に沿わせ、2本目に実URL）。未登録なら仮URL。
async function urlSampleInstr(env: Env, accountId: string, angle: string): Promise<string> {
  const a = (angle ?? "").trim();
  let link: { url?: string; title?: string; desc?: string; note?: string } | null = null;
  try {
    const r = await env.DB.prepare(
      `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'link_targets'`
    ).bind(accountId).first<{ v: string }>();
    const arr = JSON.parse(r?.v ?? "[]");
    if (Array.isArray(arr) && arr.length) link = arr[0]; // 登録済みの最初の飛ばし先を使う
  } catch { /* 未登録 */ }
  if (link && link.url) {
    const desc = link.desc || link.note || "";
    const titleLine = link.title ? `\n誘導先タイトル: ${link.title}` : "";
    const descLine = desc ? `\n誘導先の説明: ${desc}（1本目はこの説明に沿った価値・引きにする。誘導先の中身に即して書く）` : "";
    return `${URL_TYPE_INSTRUCTION}${a ? "\n" + a : ""}${titleLine}${descLine}\n誘導先URL: ${link.url}（2本目にこのURLをそのまま入れる。実際の配信時はクリック計測リンクに置き換わります）`;
  }
  return `${URL_TYPE_INSTRUCTION}${a ? "\n" + a : ""}\n誘導先URL: [ここにURL]（飛ばし先URLが未登録です。設定で登録すると、その記事の内容に沿ったサンプルになります）`;
}
import { renderCardPng, presetTheme, CARD_PRESETS, CARD_FONTS, isImageType, normImageType, type CardTheme } from "./render";
import { collectMetrics, collectReplies, collectForAccount } from "./collect";
import { runCycle, runCycleForAccount, generateSamples, regenerateForAccount, cancelQueuedForAccount, generateDaysForAccount, inventoryCap } from "./cycle";
import { distillCardText } from "./generate";
import { nextQueueSlot, reflowQueue, getAccountSlots, accountPrepHHMM, sqlUtc } from "./schedule";
import { DASHBOARD_HTML } from "./dashboard";

// ── このワーカーのコード版（2桁小数・0.01刻み 例 1.00→1.01→…→1.99→2.00）。本部の latest_code_version と数値で比べて「更新あり」を出す。 ──
// リリース手順：公開リポ更新時にここを +0.01（大きい更新は +1.00 等）→ 本部コンソールで「最新版」を同じ数字に。
const CODE_VERSION = "1.20";

const MAX_RETRY = 3;
const USDJPY_FALLBACK = 155; // 取得できないときの概算レート

// 対象月のUSD/JPYレートを返す（料金目安の換算用）。
// ・過去の確定月：その月末時点の実レートを一度だけ取得してキャッシュ（以後は固定）。
// ・当月：まだ月末が来ていないので最新レートを使う（1日1回まで取得し直す）。
// frankfurter.app（無料・キーなし・ECBデータ）。取得失敗時はキャッシュ→フォールバック。
async function getMonthRate(
  env: Env,
  mKey: string,
  isCurrent: boolean,
  lastDay: number
): Promise<{ rate: number; as_of: string | null; fallback: boolean }> {
  let row: { usdjpy: number; as_of: string | null; fetched_at: string } | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT usdjpy, as_of, fetched_at FROM fx_rates WHERE month = ?`
    )
      .bind(mKey)
      .first<{ usdjpy: number; as_of: string | null; fetched_at: string }>();
  } catch {
    row = null; // テーブル未作成等
  }
  // 過去の確定月はキャッシュがあればそのまま（月末レートは変わらない）。
  if (row && !isCurrent) return { rate: row.usdjpy, as_of: row.as_of, fallback: false };
  // 当月はキャッシュが当日なら使い回し（取得を1日1回に抑える）。
  if (row && isCurrent) {
    const today = new Date().toISOString().slice(0, 10);
    if (String(row.fetched_at ?? "").slice(0, 10) === today) {
      return { rate: row.usdjpy, as_of: row.as_of, fallback: false };
    }
  }
  // 取得（当月＝最新／過去月＝その月末日のレート。月末が休日ならAPIが直近営業日を返す）。
  try {
    const date = isCurrent ? "latest" : `${mKey}-${String(lastDay).padStart(2, "0")}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?from=USD&to=JPY`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const j = (await res.json()) as { date?: string; rates?: { JPY?: number } };
      const rate = j?.rates?.JPY;
      if (typeof rate === "number" && rate > 0) {
        try {
          await env.DB.prepare(
            `INSERT INTO fx_rates (month, usdjpy, as_of, fetched_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(month) DO UPDATE SET usdjpy = excluded.usdjpy, as_of = excluded.as_of, fetched_at = datetime('now')`
          )
            .bind(mKey, rate, j.date ?? null)
            .run();
        } catch {
          /* 保存失敗でも値は使える */
        }
        return { rate, as_of: j.date ?? null, fallback: false };
      }
    }
  } catch {
    /* 取得失敗 */
  }
  if (row) return { rate: row.usdjpy, as_of: row.as_of, fallback: false }; // 古くても既存値
  return { rate: USDJPY_FALLBACK, as_of: null, fallback: true };
}

// X有料プラン（Premium）か。trueなら長文ポストを許可。individual_profile key='x_premium'。
async function isPremium(env: Env, accountId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'x_premium'`
  )
    .bind(accountId)
    .first<{ v: string }>();
  return row?.v === "1" || row?.v === "true";
}
// URL誘導(🔗)ポストを解放しているか。individual_profile key='url_posts'。
async function isUrlUnlocked(env: Env, accountId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'url_posts'`
  )
    .bind(accountId)
    .first<{ v: string }>();
  return row?.v === "1" || row?.v === "true";
}
// 会員のカードテーマを読む（未設定なら null）。
async function loadCardTheme(env: Env, accountId: string): Promise<CardTheme | null> {
  try {
    const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'card_theme'`).bind(accountId).first<{ v: string }>();
    if (!r?.v) return null;
    const t = JSON.parse(r.v);
    if (t && typeof t === "object") return t as CardTheme;
  } catch { /* 未設定 */ }
  return null;
}
// 文字数上限（重み）。無料=280（日本語140字）／有料=2000（長文・約1000字）。
function charLimitWeighted(premium: boolean): number {
  return premium ? 2000 : 280;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// 実投稿の許可（"0"なら投稿しない＝開発環境の安全装置）
function postingEnabled(env: Env): boolean {
  return env.POST_ENABLED !== "0";
}

// individual_profile に貯めた数値カウンタ（edit_count / star5_count 等）を読む
async function readCount(env: Env, accountId: string, key: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = ?`
  )
    .bind(accountId, key)
    .first<{ v: string }>();
  return row ? parseInt(row.v, 10) || 0 : 0;
}
// individual_profile のカウンタを +1
async function bumpCount(env: Env, accountId: string, key: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
     VALUES (?, ?, '1', datetime('now'))
     ON CONFLICT(account_id, key) DO UPDATE SET
       value_json = CAST(CAST(individual_profile.value_json AS INTEGER) + 1 AS TEXT),
       updated_at = datetime('now')`
  )
    .bind(accountId, key)
    .run();
}
// individual_profile のカウンタに値をセット（上書き）
async function setCount(env: Env, accountId: string, key: string, value: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  )
    .bind(accountId, key, String(value))
    .run();
}
// 利用イベントを記録（料金の目安用。テーブル未作成でも本処理は止めない）。
async function logUsage(env: Env, accountId: string, kind: string, units: number): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO usage_events (account_id, kind, units) VALUES (?, ?, ?)`
    )
      .bind(accountId, kind, Math.max(0, Math.round(units)))
      .run();
  } catch (e) {
    console.error(`[${accountId}] usage_events記録失敗（テーブル未作成?）: ${e instanceof Error ? e.message : e}`);
  }
}

// ---- 投稿 -------------------------------------------------------------------

interface QueuedPost {
  id: number;
  body: string;
  reply_text: string | null;
  link_code: string | null;
  hook: string | null;
}

// 1アカウントのキュー先頭を1本投稿する。
async function postNext(
  env: Env,
  account: Account,
  creds: XCreds
): Promise<{ posted: boolean; detail: string }> {
  const next = await env.DB.prepare(
    `SELECT id, body, reply_text, link_code, hook FROM posts
     WHERE account_id = ? AND platform = 'x' AND status = 'queued'
       AND (not_before IS NULL OR not_before <= datetime('now'))
     ORDER BY id LIMIT 1`
  )
    .bind(account.id)
    .first<QueuedPost>();

  if (!next) return { posted: false, detail: "queue_empty" };

  // URL誘導の安全装置：飛ばし先が未設定（[ここにURL]等のプレースホルダのまま）なら投稿しない。
  // ＝「URLが設定されている場合のみ」自動投稿で扱う。直して再予約できるよう failed にする。
  const placeholderRe = /\[(ここにURL|リンク|URL)\]/;
  if (placeholderRe.test(next.body) || (next.reply_text != null && placeholderRe.test(next.reply_text))) {
    await env.DB.prepare(
      `UPDATE posts SET status = 'failed', error = ? WHERE id = ?`
    )
      .bind("飛ばし先URLが未設定のため投稿を止めました（2本目の [ここにURL] を実際のリンクに直してください）", next.id)
      .run();
    return { posted: false, detail: "url_placeholder" };
  }

  // 開発環境の安全装置：実際の投稿をしない（キューに残す）。
  if (!postingEnabled(env)) {
    console.log(`[${account.id}] POST_ENABLED=0 のため投稿スキップ post#${next.id}`);
    return { posted: false, detail: "posting_disabled" };
  }

  // 二重投稿防止：この投稿を原子的に予約（queued→posting）。手動 /api/post-now と毎分cron が
  // 同時に走っても、予約を取れた1プロセスだけが投稿する。取れなければ他が処理中なのでスキップ。
  const claim = await env.DB.prepare(
    `UPDATE posts SET status = 'posting' WHERE id = ? AND status = 'queued'`
  ).bind(next.id).run();
  if ((claim.meta.changes ?? 0) === 0) return { posted: false, detail: "already_claimed" };

  try {
    // 画像カード：テーマONなら本文をカード画像にして添付。URL誘導(link_code)はOGP任せでカード無し。
    // 失敗してもテキストのみで投稿（カードのために投稿を落とさない）。バリアントはpost idで毎回ばらす。
    let mediaIds: string[] | undefined;
    try {
      const theme = await loadCardTheme(env, account.id);
      // 画像の型は「型」で決める。自作型(⭐)＝image_type／カタログ型＝パターン(img_*＝PATTERNS[p].image)。
      let composition = "none";
      if ((next.hook || "").indexOf("⭐ ") === 0) {
        const cn = (next.hook as string).slice(2).trim();
        const cr = await env.DB.prepare(`SELECT COALESCE(image_type,'none') AS it FROM custom_types WHERE account_id = ? AND name = ?`).bind(account.id, cn).first<{ it: string }>().catch(() => null);
        if (cr?.it) composition = cr.it;
      } else {
        const pp = (next.hook || "").split("##")[1];
        composition = PATTERNS[pp]?.image || "none";
        composition = resolveImageType((next.hook || "").split("##")[0], composition); // 比較・対比は2列(compare)
      }
      // マスター「画像カードを使う」がONのときだけカードを付ける。
      if (isImageType(composition) && theme?.on === true && !next.link_code) {
        // 連結はカードを1本目に付けるが、中身は1本目＋2本目を要約ソースにして見出し/箇条書きを作る。
        const cardSrc = next.reply_text && next.reply_text.trim() ? `${next.body}\n${next.reply_text}` : next.body;
        const cardText = await distillCardText(env, account.id, cardSrc, composition); // 本文→見出し一文/箇条書き(AI)
        const png = await renderCardPng(env, theme || presetTheme("midnight"), cardText, composition, next.id);
        mediaIds = [await uploadMedia(creds, png)];
      }
    } catch (ce) {
      console.error(`[${account.id}] カード生成失敗（テキストのみで投稿）post#${next.id}: ${ce instanceof Error ? ce.message : ce}`);
    }
    const tweetId = await createPost(creds, next.body, undefined, mediaIds);
    await env.DB.prepare(
      `UPDATE posts SET status = 'posted', platform_post_id = ?, posted_at = datetime('now'), error = NULL
       WHERE id = ?`
    )
      .bind(tweetId, next.id)
      .run();
    console.log(`[${account.id}] 投稿成功: post#${next.id} → ${tweetId}${mediaIds ? " (カード付き)" : ""}`);

    // ぶら下げリプ（CTA・補足）。失敗しても本文は投稿済みなのでログのみ。
    if (next.reply_text && next.reply_text.trim()) {
      try {
        const replyId = await createPost(creds, next.reply_text.trim(), tweetId);
        await env.DB.prepare(
          `UPDATE posts SET reply_platform_post_id = ? WHERE id = ?`
        )
          .bind(replyId, next.id)
          .run();
      } catch (re) {
        console.error(
          `[${account.id}] リプ投稿失敗（本文は成功）post#${next.id}: ${re instanceof Error ? re.message : re}`
        );
      }
    }
    return { posted: true, detail: tweetId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await env.DB.prepare(
      `UPDATE posts SET
         retry_count = retry_count + 1,
         error = ?,
         status = CASE WHEN retry_count + 1 >= ? THEN 'failed' ELSE 'queued' END
       WHERE id = ?`
    )
      .bind(msg.slice(0, 1000), MAX_RETRY, next.id)
      .run();
    console.error(`[${account.id}] 投稿失敗 post#${next.id}: ${msg}`);
    return { posted: false, detail: msg };
  }
}

// 投稿枠：有効アカウントを順に、それぞれ1本ずつ投稿する。
async function postSlotAllAccounts(env: Env): Promise<void> {
  const accounts = await loadActiveAccounts(env);
  for (const acc of accounts) {
    if (!acc.platforms.includes("x")) continue;
    const creds = await xCreds(env, acc.id);
    if (!creds) {
      console.error(`[${acc.id}] X連携が未設定のためスキップ`);
      continue;
    }
    await postNext(env, acc, creds);
  }
}

// ---- HTTP API ---------------------------------------------------------------

// アカウント登録／更新（UIが無いので当面これで台帳を作る）
async function handleUpsertAccount(req: Request, env: Env): Promise<Response> {
  const b = (await req.json().catch(() => null)) as {
    id?: string;
    handle?: string;
    display_name?: string;
    niche?: string;
    cycle_days?: number;
    daily_frequency?: number;
    approval_mode?: string;
    platforms?: string[];
    active?: number;
  } | null;
  if (!b?.id) return json({ error: "id は必須" }, 400);

  await env.DB.prepare(
    `INSERT INTO accounts (id, handle, display_name, niche, cycle_days, daily_frequency, approval_mode, platforms, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       handle = excluded.handle, display_name = excluded.display_name, niche = excluded.niche,
       cycle_days = excluded.cycle_days, daily_frequency = excluded.daily_frequency,
       approval_mode = excluded.approval_mode, platforms = excluded.platforms, active = excluded.active`
  )
    .bind(
      b.id,
      b.handle ?? null,
      b.display_name ?? null,
      b.niche ?? null,
      b.cycle_days ?? 5,
      Math.max(1, Math.min(5, Math.round(b.daily_frequency ?? 3))),
      b.approval_mode === "auto" ? "auto" : "queue",
      JSON.stringify(b.platforms ?? ["x"]),
      b.active ?? 1
    )
    .run();
  return json({ ok: true, id: b.id });
}

async function handleListAccounts(env: Env): Promise<Response> {
  const accounts = await loadActiveAccounts(env);
  // 鍵があるかだけ示す（鍵そのものは返さない）
  const withCreds = await Promise.all(
    accounts.map(async (a) => ({ ...a, has_creds: !!(await xCreds(env, a.id)) }))
  );
  return json({ accounts: withCreds });
}

// キュー投入: { account, posts: [{ body, reply_text?, not_before?, hook?, source? }] }
async function handleQueue(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    account?: string;
    posts?: Array<{
      body?: string;
      reply_text?: string;
      not_before?: string;
      hook?: string;
      source?: string;
    }>;
  } | null;
  if (!body?.account) return json({ error: "account は必須" }, 400);
  if (!body.posts?.length) return json({ error: "posts が空" }, 400);

  const acc = await loadAccount(env, body.account);
  if (!acc) return json({ error: `account 未登録: ${body.account}` }, 404);

  const queued: number[] = [];
  const warnings: string[] = [];
  for (const p of body.posts) {
    const text = (p.body ?? "").trim();
    if (!text) {
      warnings.push("空のポストをスキップ");
      continue;
    }
    const wlen = weightedLength(text);
    if (wlen > 280) {
      warnings.push(`加重${wlen}/280字超過: ${text.slice(0, 20)}…`);
    }
    const r = await env.DB.prepare(
      `INSERT INTO posts (account_id, platform, source, body, reply_text, hook, not_before, chars, line_breaks)
       VALUES (?, 'x', ?, ?, ?, ?, datetime(?), ?, ?) RETURNING id`
    )
      .bind(
        body.account,
        p.source === "manual" || p.source === "historical" ? p.source : "tool",
        text,
        p.reply_text ?? null,
        p.hook ?? null,
        p.not_before ?? null,
        wlen,
        (text.match(/\n/g) ?? []).length
      )
      .first<{ id: number }>();
    if (r) queued.push(r.id);
  }
  return json({ queued, warnings });
}

async function handleStatus(env: Env, accountId: string): Promise<Response> {
  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM posts WHERE account_id = ? GROUP BY status`
  )
    .bind(accountId)
    .all<{ status: string; n: number }>();
  const nextUp = await env.DB.prepare(
    `SELECT id, body, reply_text, hook, not_before FROM posts
     WHERE account_id = ? AND status = 'queued'
     ORDER BY (not_before IS NULL), not_before, id LIMIT 20`
  )
    .bind(accountId)
    .all();
  const recent = await env.DB.prepare(
    `SELECT p.id, p.body, p.reply_text, p.platform_post_id, p.posted_at, p.hook,
            m.impressions, m.likes, m.reposts, m.replies
       FROM posts p
       LEFT JOIN post_metrics m ON m.post_id = p.id
         AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id)
      WHERE p.account_id = ? AND p.status = 'posted' ORDER BY p.posted_at DESC LIMIT 30`
  )
    .bind(accountId)
    .all();
  // 不採用（★1-4で評価して捨てたもの）。学習にも使われる。直近の評価★を併記。
  const notAdopted = await env.DB.prepare(
    `SELECT p.id, p.body, p.reply_text, p.created_at,
            (SELECT f.rating FROM sample_feedback f WHERE f.post_id = p.id AND f.kind = 'rate' ORDER BY f.created_at DESC LIMIT 1) AS rating
       FROM posts p
      WHERE p.account_id = ? AND p.status = 'rated'
      ORDER BY p.created_at DESC LIMIT 20`
  ).bind(accountId).all().catch(() => ({ results: [] as unknown[] }));
  // 投稿に失敗したもの（X側エラー＝字数オーバー等）
  const failed = await env.DB.prepare(
    `SELECT id, body, reply_text, error, created_at FROM posts
      WHERE account_id = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 20`
  ).bind(accountId).all();
  const acc = await env.DB.prepare(
    `SELECT daily_frequency, cycle_days FROM accounts WHERE id = ?`
  ).bind(accountId).first<{ daily_frequency: number; cycle_days: number }>();
  // 予約ポストに画像タイプを付与（一覧でカードプレビューを出すため）。⭐自作型はcustom_typesから引く。
  const customImg: Record<string, string> = {};
  const ctr = await env.DB.prepare(`SELECT name, COALESCE(image_type,'none') AS it FROM custom_types WHERE account_id = ?`).bind(accountId).all<{ name: string; it: string }>().catch(() => ({ results: [] as Array<{ name: string; it: string }> }));
  for (const c of ctr.results ?? []) customImg["⭐ " + c.name] = c.it;
  const withImageType = (rows: unknown[]) => (rows as Array<{ hook?: string }>).map((p) => {
    const hook = p.hook || "";
    let img = "none";
    if (hook.indexOf("⭐ ") === 0) img = customImg[hook] || "none";
    else { const pat = hook.split("##")[1]; img = resolveImageType(hook.split("##")[0], (pat && PATTERNS[pat]?.image) || "none"); }
    return { ...p, image_type: isImageType(img) ? img : null };
  });
  // 学習サイクルの進み具合：cycle_state.updated_at（前回サイクル実行日時・UTC）からの経過日数で「何日目か」を出す。
  const cycTotal = acc?.cycle_days ?? 5;
  const cycSt = await env.DB.prepare(`SELECT updated_at FROM cycle_state WHERE account_id = ?`).bind(accountId).first<{ updated_at: string }>().catch(() => null);
  let cycleDay = 1;
  if (cycSt?.updated_at) {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(cycSt.updated_at.replace(" ", "T") + "Z").getTime()) / 86400_000));
    cycleDay = Math.min(elapsed + 1, cycTotal);
  }
  return json({
    account: accountId,
    counts: Object.fromEntries(counts.results.map((c) => [c.status, c.n])),
    next_up: withImageType(nextUp.results),
    recently_posted: recent.results,
    not_adopted: notAdopted.results,
    failed: failed.results,
    post_slots: await getAccountSlots(env, accountId),
    daily_frequency: acc?.daily_frequency ?? 3,
    cycle_days: cycTotal,
    cycle_day: cycleDay,
    cycle_started: !!cycSt,
    char_limit: (await isPremium(env, accountId)) ? 1000 : 140,
  });
}

// 投稿テスト: キューを介さず即時1本投稿（捨てアカウントでの動作確認用）
// body: { account, text }
async function handleTestPost(req: Request, env: Env): Promise<Response> {
  const b = (await req.json().catch(() => null)) as {
    account?: string;
    text?: string;
  } | null;
  if (!b?.account) return json({ error: "account は必須" }, 400);
  if (!postingEnabled(env)) return json({ ok: false, error: "開発環境では実際の投稿はしません（POST_ENABLED=0）" }, 200);
  const creds = await xCreds(env, b.account);
  if (!creds) return json({ error: `${b.account} はX連携が未設定です` }, 400);
  const text = (b.text ?? "（SNSの右腕：投稿テストです）").trim();
  try {
    const tweetId = await createPost(creds, text);
    await setConfig(env, "write_verified", "1"); // 投稿(書き込み)権限の確認済みフラグ（以後ボタンを隠す）
    return json({ ok: true, account: b.account, tweet_id: tweetId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// ---- entrypoints ------------------------------------------------------------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    setClaudeRelay(env.US_RELAY); // Claude呼び出しを米国配置DO経由に（HKG実行時の地域ブロック回避）
    const url = new URL(req.url);
    await rememberPublicUrl(env, url.origin); // 会員ごとの公開URLをリクエストから記憶（計測リンク/r・cronでも使う）
    await hydrateFromCache(env); // 型指示・URL（運営資産）をキャッシュから反映（metaOfの表示・生成前提。Hubは叩かない）

    // ダッシュボード（HTML自体に鍵は無い。データ取得は画面内からBearer認証で叩く）
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const label = env.ENV_LABEL ?? "";
      // devのときだけ本番環境へのリンクを併記（本番は label="" なので非表示）。
      const banner = label
        ? `<div class="envbar">SNSの右腕（${label}）　<a href="https://sns-migiude.dw-e56.workers.dev" target="_blank" rel="noopener" style="color:#4a3206;text-decoration:underline;font-weight:600">→ 本番環境を開く</a></div>`
        : "";
      const html = DASHBOARD_HTML.replace("{{ENV_BANNER}}", banner).split("{{ENV_LABEL}}").join(label);
      // no-cache：デプロイ後に古いダッシュボードJSが残らないよう、毎回サーバへ再検証させる。
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, must-revalidate" },
      });
    }

    // 計測リンク（公開・認証なし）。Xポストのリンクとして使う。クリックを記録して誘導先へ302。
    //   GET /r?a=<account>&c=<code>  → クリック記録 → 誘導先URL(+?sr=code)へリダイレクト。
    if (req.method === "GET" && url.pathname === "/r") {
      const a = (url.searchParams.get("a") || "").slice(0, 80);
      const c = (url.searchParams.get("c") || "").slice(0, 40);
      // code→誘導先URL を解決：まず台帳(tracked_links)、無ければ link_targets（共通コード）。
      let dest = "";
      try {
        const tl = await env.DB.prepare(`SELECT url FROM tracked_links WHERE code = ? AND account_id = ?`).bind(c, a).first<{ url: string }>();
        dest = tl?.url ?? "";
      } catch { dest = ""; }
      if (!dest) {
        try {
          const row = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id=? AND key='link_targets'`).bind(a).first<{ v: string }>();
          const arr = JSON.parse(row?.v ?? "[]") as Array<{ url?: string; code?: string }>;
          const hit = arr.find((x) => x.code === c) || arr.find((x) => x.url && linkCode(a, x.url) === c);
          dest = hit?.url ?? "";
        } catch { dest = ""; }
      }
      if (!dest) return new Response("リンクが見つかりません。", { status: 404 });
      // SNS・チャットのカード生成ボット（Twitterbot/facebookexternalhit/Slackbot…）はクリックに数えない。
      //   これらは投稿直後にプレビュー取得で /r を踏むため、数えると人間のクリック数が水増しされる。
      //   ボットでもリダイレクトは通す（→ 誘導先のOGPカードは今まで通り生成される）。
      const ua = (req.headers.get("user-agent") || "").toLowerCase();
      const isBot = /bot|crawler|spider|crawl|preview|facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|whatsapp|line-poker|skypeuripreview|embedly|quora link preview|pinterest|redditbot|applebot|bingbot|googlebot|yahoo|baiduspider|petalbot|bytespider|headless|curl|wget|python-requests|go-http-client/.test(ua);
      if (!isBot) {
        try {
          const ipHash = linkCode(a, (req.headers.get("cf-connecting-ip") || "") + "|" + c);
          const dup = await env.DB.prepare(`SELECT 1 FROM link_clicks WHERE account_id=? AND code=? AND ip_hash=? AND created_at >= datetime('now','-1 minutes')`).bind(a, c, ipHash).first().catch(() => null);
          if (!dup) await env.DB.prepare(`INSERT INTO link_clicks (account_id, code, ip_hash) VALUES (?, ?, ?)`).bind(a, c, ipHash).run();
        } catch { /* テーブル未作成でもリダイレクトは通す */ }
      }
      const sep = dest.includes("?") ? "&" : "?";
      const to = /[?&]sr=/.test(dest) ? dest : dest + sep + "sr=" + encodeURIComponent(c); // 着地でCVピクセルが拾えるよう sr を付与
      return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
    }

    // クリック→CVの計測ピクセル（公開・認証なし）。誘導先のサンクスページのタグが叩く。
    //   GET /cv?a=<account>&sr=<code>&v=<amount>  → 1x1 gif を返しつつCVを記録。
    if (req.method === "GET" && url.pathname === "/cv") {
      const a = (url.searchParams.get("a") || "").slice(0, 80);
      const sr = (url.searchParams.get("sr") || "").slice(0, 40);
      const v = Math.max(0, Number(url.searchParams.get("v") || 0) || 0);
      const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0x21, 0xf9, 4, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]);
      const pixel = () => new Response(gif, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
      if (a && sr) {
        try {
          const ipHash = linkCode(a, (req.headers.get("cf-connecting-ip") || "") + "|" + sr); // 簡易の重複目安
          // 同一(account,code,ip)が直近10分以内なら二重カウントしない。
          const dup = await env.DB.prepare(
            `SELECT 1 FROM conversions WHERE account_id=? AND code=? AND ip_hash=? AND created_at >= datetime('now','-10 minutes')`
          ).bind(a, sr, ipHash).first().catch(() => null);
          if (!dup) {
            // 売上＝&v 指定があればそれ、無ければ誘導先URLの『単価』を自動計上。
            let value = v;
            if (!value) {
              try {
                const tl = await env.DB.prepare(`SELECT url FROM tracked_links WHERE code = ? AND account_id = ?`).bind(sr, a).first<{ url: string }>();
                const lt = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'link_targets'`).bind(a).first<{ v: string }>();
                const arr = JSON.parse(lt?.v ?? "[]") as Array<{ url?: string; code?: string; unit?: number }>;
                const hit = tl?.url ? arr.find((x) => x.url === tl.url) : (arr.find((x) => x.code === sr) || arr.find((x) => x.url && linkCode(a, x.url) === sr));
                value = Math.max(0, Math.floor(Number(hit?.unit ?? 0)) || 0);
              } catch { value = 0; }
            }
            await env.DB.prepare(`INSERT INTO conversions (account_id, code, value, ip_hash) VALUES (?, ?, ?, ?)`).bind(a, sr, value, ipHash).run();
          }
        } catch { /* テーブル未作成等でもピクセルは返す */ }
      }
      return pixel();
    }

    // プロンプト本体の取得状態を返す健全性チェック（本文は返さない＝版・件数のみ）。会員↔本部の配信疎通の確認用。
    if (req.method === "GET" && url.pathname === "/prompt-pack-status") {
      const p = await getPromptPack(env);
      if (!p) return json({ ok: false, error: "未取得（本部不通かキャッシュ無し）" }, 200);
      return json({ ok: true, version: p.version, has_system: !!p.system, has_system_thread: !!p.system_thread, has_type_dev: !!p.type_dev_system, type_instructions_count: Object.keys(p.type_instructions || {}).length, url_styles: (p.url_styles || []).length, distill_keys: Object.keys(p.distill || {}) });
    }
    // 【dev限定・検証用】カードPNGをそのまま返す（resvgが無料プランCPUで動くかの実測用）。本番(ENV_LABEL="")では無効。
    if (req.method === "GET" && url.pathname === "/card-test") {
      if (!env.ENV_LABEL) return json({ error: "dev限定" }, 404);
      const text = url.searchParams.get("text") || "完璧主義って、ただの「完成させない言い訳」だったりする。\n本当に必要なのは、出してから直す勇気の方。";
      const variant = Number(url.searchParams.get("v") || 0) || 0;
      const theme = { bg: "#0f1419", fg: "#ffffff", accent: "#1d9bf0", handle: "@" + (url.searchParams.get("account") || "you"), font: url.searchParams.get("font") || "sans", fontSize: Number(url.searchParams.get("fs")) || undefined, logoSize: Number(url.searchParams.get("ls")) || undefined, logoKey: url.searchParams.get("logoKey") || undefined };
      const t0 = Date.now();
      try {
        const png = await renderCardPng(env, theme, text, url.searchParams.get("it") || "standard", variant);
        return new Response(png as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Render-Ms": String(Date.now() - t0), "X-Png-Bytes": String(png.byteLength) } });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 }, 200);
      }
    }

    // 認証（APIはBearerトークン必須。ダッシュボードのHTMLはこの手前で返す）
    // 合言葉は新名 LOGIN_PASSWORD を優先・旧名 API_TOKEN は後方互換。
    const loginSecret = env.LOGIN_PASSWORD ?? env.API_TOKEN;
    const auth = req.headers.get("Authorization");
    if (!loginSecret || auth !== `Bearer ${loginSecret}`) {
      return json({ error: "unauthorized" }, 401);
    }

    // このworkerの会員ID（account_id）を返す。ダッシュボードは起動時にこれを取得してACCに使う
    // （ハードコード廃止）。会員workerは1人＝1workerなので、永続ユニークIDを1つ確定して返す。
    if (req.method === "GET" && url.pathname === "/api/whoami") {
      const uid = await getMemberUid(env);
      const acc = await loadAccount(env, uid);
      let onboarded = false;
      try {
        const row = await env.DB.prepare(`SELECT onboarded FROM accounts WHERE id = ?`).bind(uid).first<{ onboarded: number }>();
        onboarded = !!(row && row.onboarded);
      } catch { /* accounts未作成 */ }
      const email = await getConfig(env, "member_email");
      const latest = (await getConfig(env, "latest_code_version")) || "";
      const minVer = (await getConfig(env, "min_code_version")) || "";
      const updateNote = (await getConfig(env, "update_note")) || "";
      const cur = parseFloat(CODE_VERSION) || 0;
      return json({
        ok: true, account_id: uid, handle: acc?.handle ?? null, onboarded, email: email ?? null,
        version: CODE_VERSION, latest_version: latest, min_version: minVer,
        update_available: (parseFloat(latest) || 0) > cur,
        update_required: (parseFloat(minVer) || 0) > cur, // 必須版に満たない＝ブロック
        update_note: updateNote,
        update_url: "https://join.sns-migiude.com/update",
      });
    }
    // 会員メールの登録・更新（連絡/周知メール宛先＋将来のメールログイン土台）。app_config に保存。
    if (req.method === "POST" && url.pathname === "/api/account/email") {
      const b = (await req.json().catch(() => null)) as { account?: string; email?: string } | null;
      const email = String(b?.email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json({ ok: false, error: "メールアドレスの形式が正しくありません。" }, 200);
      }
      await setConfig(env, "member_email", email);
      return json({ ok: true, email });
    }
    if (req.method === "POST" && url.pathname === "/api/accounts") {
      return handleUpsertAccount(req, env);
    }
    if (req.method === "GET" && url.pathname === "/api/accounts") {
      return handleListAccounts(env);
    }
    if (req.method === "POST" && url.pathname === "/api/queue") {
      return handleQueue(req, env);
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      return handleStatus(env, acc);
    }
    // 投稿枠を手動で1回回す（テスト用）：全アカウントが1本ずつ投稿
    if (req.method === "POST" && url.pathname === "/api/post-now") {
      await postSlotAllAccounts(env);
      return json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/test-post") {
      return handleTestPost(req, env);
    }
    // 接続テスト（読み取りのみ・公開フットプリントゼロ）：鍵が有効か・どのアカウントか確認
    if (req.method === "GET" && url.pathname === "/api/check") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const creds = await xCreds(env, acc);
      if (!creds) return json({ error: `${acc} はX連携が未設定です`, connected: false }, 400);
      try {
        const me = await fetchAccountMetrics(creds);
        return json({
          ok: true,
          account: acc,
          handle: me.username,
          followers: me.followers,
          note: "読み取り成功。鍵は有効で投稿はしていません。",
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    // テスト投稿の即削除：body { account, tweet_id }
    if (req.method === "POST" && url.pathname === "/api/delete-tweet") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        tweet_id?: string;
      } | null;
      if (!b?.account || !b.tweet_id) return json({ error: "account と tweet_id が必要" }, 400);
      const creds = await xCreds(env, b.account);
      if (!creds) return json({ error: `${b.account} はX連携が未設定です` }, 400);
      try {
        const deleted = await deleteTweet(creds, b.tweet_id);
        await env.DB.prepare(
          `UPDATE posts SET status = 'rejected', error = 'deleted via api' WHERE platform_post_id = ?`
        )
          .bind(b.tweet_id)
          .run();
        return json({ ok: true, deleted, tweet_id: b.tweet_id });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    // 個性ループのサイクルを手動で1回回す（テスト用）：学習＋キュー補充
    if (req.method === "POST" && url.pathname === "/api/cycle-now") {
      return json({ ok: true, results: await runCycle(env) });
    }
    // オンボーディングのサンプル生成（本数固定・承認待ちで投入。サイクルとは独立）
    if (req.method === "POST" && url.pathname === "/api/account/sample") {
      const b = (await req.json().catch(() => null)) as { account?: string; count?: number; instructions?: string; long_mix?: boolean; type_label?: string; link_code?: string; url?: string; pattern?: string; type_key?: string; url_post?: boolean; url_style?: string; post_url?: string; url_title?: string; url_desc?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const acc = await loadAccount(env, b.account);
      if (!acc) return json({ error: "アカウントが見つかりません" }, 404);
      await refreshPrompts(env); // 型指示・URL（運営資産）を最新化＋反映してから解決する
      const count = Math.max(1, Math.min(10, b.count ?? 5));
      let instr = b.instructions && b.instructions.trim() ? b.instructions.trim() : undefined;
      const longMix = typeof b.long_mix === "boolean" ? b.long_mix : undefined;
      let pat = b.pattern && PATTERNS[b.pattern] ? b.pattern : undefined;
      // base型：型キー→指示文（パック由来）。連結フックはthread_shortに固定（単発はlongMixを活かすためpatternは付けない）。
      if (b.type_key) {
        const m = metaOf(b.type_key);
        if (m.instruction) instr = m.instruction;
        if (m.kind === "thread") pat = "thread_short";
      }
      // URL誘導：指示文（運営資産）はサーバが組み立てる。clientは型ラベル＋会員のリンクデータのみ渡す。
      if (b.url_post) {
        const angle = b.url_style ? (URL_STYLES.find((s) => s.label === b.url_style)?.angle || "") : "";
        const guidance = angle || ("誘導の型は次から1つAIが選ぶ：" + URL_STYLES.map((s) => s.label).join("／") + "。選んだ型名を hook に『🔗 URL誘導・(選んだ型名)』の形で必ず入れる。");
        let u = `${URL_TYPE_INSTRUCTION}\n${guidance}`;
        if (b.post_url) u += `\n誘導先URL: ${b.post_url}（2本目にこのURLをそのまま、一字一句変えずに入れる）`;
        if (b.url_title) u += `\n誘導先タイトル: ${b.url_title}`;
        if (b.url_desc) u += `\n誘導先の説明: ${b.url_desc}（1本目はこの説明に沿った価値・引きにする。2本目はこのタイトル・説明に合うひと言＋URL）`;
        instr = u;
        pat = "url";
      }
      const made = await generateSamples(env, acc, count, instr, longMix, b.type_label, b.link_code, b.url, pat);
      return json({ ok: true, made });
    }
    // 型のサンプルを「その場で試す」プレビュー（投稿キューに入れない＝生成して返すだけ）。型の検索で使う。
    //   type_key（カタログ型キー）が来たら、その切り口＋パターン(長さ/形式)で生成。集合知はinstructions(+pattern)。
    if (req.method === "POST" && url.pathname === "/api/account/sample-preview") {
      const b = (await req.json().catch(() => null)) as { account?: string; instructions?: string; type_key?: string; pattern?: string; count?: number; image_type?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const acc = await loadAccount(env, b.account);
      if (!acc) return json({ error: "アカウントが見つかりません" }, 404);
      let instr = (b.instructions ?? "").trim();
      let genOpts: { pattern?: string; hooks?: string[] } | undefined;
      // 画像型なら、サンプルにもカード画像を出す。type_keyのパターン or 明示image_typeから判定。
      let imageType = "none";
      if (b.type_key) {
        const m = metaOf(b.type_key);
        instr = m.instruction || instr;
        if (m.pattern) genOpts = { pattern: m.pattern, hooks: [m.hook] };
        if (m.pattern && PATTERNS[m.pattern]?.image) imageType = resolveImageType(m.hook, PATTERNS[m.pattern]!.image!); // 比較・対比は2列(compare)
      } else if (b.pattern && PATTERNS[b.pattern]) {
        genOpts = { pattern: b.pattern };
        if (PATTERNS[b.pattern]?.image) imageType = PATTERNS[b.pattern]!.image!;
      }
      if (isImageType(b.image_type)) imageType = b.image_type as string;
      // URL誘導パターン：1本目引き→2本目CTA＋URL の指示を付与（登録URLがあれば実情報ベース）。
      if (genOpts?.pattern === "url") instr = await urlSampleInstr(env, b.account, instr);
      const count = Math.max(1, Math.min(3, b.count ?? 1));
      try {
        let drafts = await generateDrafts(env, acc, count, instr || undefined, undefined, undefined, genOpts);
        if (!drafts.length) drafts = await generateDrafts(env, acc, count, instr || undefined, undefined, undefined, genOpts); // 空のとき1回だけ再試行（生成が時々空になるため）
        const theme = isImageType(imageType) ? ((await loadCardTheme(env, b.account)) || presetTheme("midnight")) : null;
        const out: Array<{ body: string; reply_text: string | null; hook: string | null; card: string | null }> = [];
        for (const d of drafts) {
          let card: string | null = null;
          if (theme && isImageType(imageType)) {
            // 連結は1本目＋2本目を要約ソースにして、1ポスト目に付くカードを作る（本番投稿と同じ挙動）。
            try {
              const cardSrc = d.reply_text && d.reply_text.trim() ? `${d.body}\n${d.reply_text}` : d.body;
              const cardText = await distillCardText(env, b.account, cardSrc, imageType);
              const png = await renderCardPng(env, theme, cardText, imageType, 0);
              let bin = ""; const u = png as Uint8Array;
              for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
              card = `data:image/png;base64,${btoa(bin)}`;
            } catch { card = null; }
          }
          out.push({ body: d.body, reply_text: d.reply_text ?? null, hook: d.hook ?? null, card });
        }
        return json({ ok: true, drafts: out });
      } catch (e) {
        return json({ ok: false, error: `サンプル生成に失敗（${e instanceof Error ? e.message.slice(0, 80) : ""}）` }, 200);
      }
    }
    // 予約を全消しして作り直す：queuedを削除→その場で1日分を再生成（残りは毎朝のサイクルで補充）。
    if (req.method === "POST" && url.pathname === "/api/account/regenerate") {
      const b = (await req.json().catch(() => null)) as { account?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      try {
        const r = await regenerateForAccount(env, b.account);
        return json({ ok: true, ...r });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
      }
    }
    // 予約を全てキャンセル（queued削除のみ・再生成しない）。
    if (req.method === "POST" && url.pathname === "/api/account/cancel-queued") {
      const b = (await req.json().catch(() => null)) as { account?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      try {
        const r = await cancelQueuedForAccount(env, b.account);
        return json({ ok: true, ...r });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
      }
    }
    // N日分を即時生成（削除はしない・在庫に追加）。days=1〜14。
    if (req.method === "POST" && url.pathname === "/api/account/generate-days") {
      const b = (await req.json().catch(() => null)) as { account?: string; days?: number; one?: boolean } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      try {
        // one=true：1本だけ生成（画面側が1日分を1本ずつ複数リクエストで呼ぶ。
        // 無料プランのワーカーで1リクエストに複数の長い生成を詰めるとCloudflareの実行制限で落ちるため）。
        const r = await generateDaysForAccount(env, b.account, undefined, b.one ? 1 : 0);
        if (r.at_cap) return json({ ok: false, at_cap: true, error: `予約の在庫が上限（${r.cap}本）です。今ある予約が投稿されると、また追加できます。` }, 200);
        const dayTotal = Math.min(r.per_day ?? 1, r.room ?? 1);
        return json({ ok: true, ...r, day_total: dayTotal });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
      }
    }
    // 承認：承認待ち(pending)の下書きを投稿キュー(queued)へ
    const approveMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const pid = Number(approveMatch[1]);
      const prow = await env.DB.prepare(
        `SELECT account_id FROM posts WHERE id = ? AND status = 'pending'`
      )
        .bind(pid)
        .first<{ account_id: string }>();
      if (!prow) return json({ error: "該当する承認待ちポストがありません" }, 404);
      const slot = await nextQueueSlot(env, prow.account_id); // 次の投稿スロットを予約
      await env.DB.prepare(
        `UPDATE posts SET status = 'queued', not_before = ? WHERE id = ?`
      )
        .bind(slot, pid)
        .run();
      return json({ approved: pid, scheduled_at: slot });
    }
    // 手直しして投稿（添削）：本文を編集→承認。添削後の本文を学習データ(voice_samples)に積む。
    // 投稿失敗(failed)を本文そのままで再予約（1クリック復帰）。
    //   クレジット切れ等の外部要因で失敗したポスト用。一度承認済みの本文なので添削は要求しない。
    //   学習には一切書き込まない。retry_countを0に戻す（残したままだと次の失敗1回で即failedに戻るため）。
    const requeueMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/requeue$/);
    if (req.method === "POST" && requeueMatch) {
      const id = Number(requeueMatch[1]);
      const post = await env.DB.prepare(
        `SELECT account_id FROM posts WHERE id = ? AND status = 'failed'`
      ).bind(id).first<{ account_id: string }>();
      if (!post) return json({ error: "該当する失敗ポストがありません" }, 404);
      // 在庫上限を尊重（failed→queuedは在庫が増えるため。edit-approveと同じ基準）。
      const ac = await env.DB.prepare(`SELECT daily_frequency, cycle_days FROM accounts WHERE id = ?`).bind(post.account_id).first<{ daily_frequency: number; cycle_days: number }>();
      const cap = inventoryCap({ daily_frequency: ac?.daily_frequency ?? 3, cycle_days: ac?.cycle_days ?? 5 });
      const have = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND status IN ('queued','pending')`).bind(post.account_id).first<{ n: number }>())?.n ?? 0;
      if (have >= cap) return json({ ok: false, at_cap: true, error: `予約の在庫が上限（${cap}本）です。先に予約を消化してから再予約してください。` }, 200);
      const slot = await nextQueueSlot(env, post.account_id);
      await env.DB.prepare(
        `UPDATE posts SET status = 'queued', not_before = ?, retry_count = 0, error = NULL WHERE id = ? AND status = 'failed'`
      ).bind(slot, id).run();
      return json({ ok: true, not_before: slot });
    }
    const editMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/edit-approve$/);
    if (req.method === "POST" && editMatch) {
      const b = (await req.json().catch(() => null)) as {
        body?: string;
        reply_text?: string;
      } | null;
      const newBody = (b?.body ?? "").trim();
      if (!newBody) return json({ error: "本文が空です" }, 400);
      const id = Number(editMatch[1]);
      // 承認待ち(pending)・不採用(rated)・投稿失敗(failed)を、添削して採用（再予約）できる
      const post = await env.DB.prepare(
        `SELECT account_id, body, reply_text, status FROM posts WHERE id = ? AND status IN ('pending','rated','failed')`
      )
        .bind(id)
        .first<{ account_id: string; body: string; reply_text: string | null; status: string }>();
      if (!post) return json({ error: "該当するポストがありません" }, 404);
      // 在庫を増やす採用（不採用/失敗→予約）は在庫上限を尊重。pending→予約は在庫数が変わらないので対象外。
      if (post.status === "rated" || post.status === "failed") {
        const ac = await env.DB.prepare(`SELECT daily_frequency, cycle_days FROM accounts WHERE id = ?`).bind(post.account_id).first<{ daily_frequency: number; cycle_days: number }>();
        const cap = inventoryCap({ daily_frequency: ac?.daily_frequency ?? 3, cycle_days: ac?.cycle_days ?? 5 });
        const have = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND status IN ('queued','pending')`).bind(post.account_id).first<{ n: number }>())?.n ?? 0;
        if (have >= cap) return json({ ok: false, at_cap: true, error: `予約の在庫が上限（${cap}本）です。先に予約を消化してから採用してください。` }, 200);
      }
      // 文字数上限（有料プランは長文OK）
      const editLimit = charLimitWeighted(await isPremium(env, post.account_id));
      if (weightedLength(newBody) > editLimit) {
        return json({ ok: false, error: `${Math.floor(editLimit / 2)}文字以内にしてください（Xの上限）` }, 400);
      }
      // 2本目（連結リプ）。送られて来た時だけ更新（未指定はCOALESCEで既存を保持）。
      const replyProvided = typeof b?.reply_text === "string";
      const newReply = replyProvided ? ((b!.reply_text as string).trim() || null) : null;
      if (newReply && weightedLength(newReply) > editLimit) {
        return json({ ok: false, error: `2本目も${Math.floor(editLimit / 2)}文字以内にしてください（Xの上限）` }, 400);
      }
      const beforeBody = post.body; // 添削前＝AI初稿（差分学習用に残す）
      const bodyChanged = beforeBody.trim() !== newBody;
      const replyChanged = replyProvided && (post.reply_text ?? "") !== (newReply ?? "");
      // 未変更のまま「完成」はNG：AI文がvoice_samplesに混ざる（捏造防止）。手直しを促す。
      // ※2本目だけ直した場合は通す（=replyChanged）。as-is投稿は本編の「これで投稿」(/approve)が担当。
      // ※投稿失敗(failed)は一度承認を通った本文＝そのまま再予約してよい（学習への書き込みはbodyChanged時のみで変わらず安全）。
      if (!bodyChanged && !replyChanged && post.status !== "failed") {
        return json({ ok: false, unchanged: true, error: "少し手直ししてみましょう（直した文章がそのまま学習になります）" });
      }
      const editSlot = await nextQueueSlot(env, post.account_id); // 次の投稿スロットを予約
      await env.DB.prepare(
        `UPDATE posts SET body = ?, reply_text = COALESCE(?, reply_text), status = 'queued', source = 'manual', not_before = ?, chars = ?, line_breaks = ? WHERE id = ?`
      )
        .bind(newBody, newReply, editSlot, weightedLength(newBody), (newBody.match(/\n/g) ?? []).length, id)
        .run();
      // 学習（差分・voice_edits・添削カウント）は本文が変わった時だけ＝未編集のAI本文が学習に混ざるのを防ぐ。
      if (bodyChanged) {
        // 添削前後を残す（差分学習）。テーブル未作成でも添削自体は止めない（best-effort）。
        try {
          await env.DB.prepare(
            `INSERT INTO sample_feedback (account_id, post_id, kind, before_body, after_body)
             VALUES (?, ?, 'edit', ?, ?)`
          )
            .bind(post.account_id, id, beforeBody, newBody)
            .run();
        } catch (e) {
          console.error(`[${post.account_id}] sample_feedback(edit)保存失敗（テーブル未作成?）: ${e instanceof Error ? e.message : e}`);
        }
        // 添削後の本文＝会員自身の言葉。「添削ぶん」(voice_edits)に追記。
        // ※過去ポスト(voice_samples)とは別キー。再学習(=voice_samples上書き)で消えないようにするため。
        await env.DB.prepare(
          `INSERT INTO corpus (account_id, key, content, updated_at)
           VALUES (?, 'voice_edits', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET content = corpus.content || char(10) || char(10) || excluded.content, updated_at = datetime('now')`
        )
          .bind(post.account_id, newBody)
          .run();
        // 添削回数をカウント（トレーニング本数・自動投稿の解放条件の一部）
        await bumpCount(env, post.account_id, "edit_count");
      }
      return json({ ok: true, approved: id, learned: bodyChanged });
    }
    // ★評価（5段階）。★5＝合格（投稿予約＋トレーニング本数にカウント）。★1-4＝フィードバックのみ（生成の良い例/避ける例）。
    const rateMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/rate$/);
    if (req.method === "POST" && rateMatch) {
      const b = (await req.json().catch(() => null)) as { rating?: number } | null;
      const rating = Math.max(1, Math.min(5, Math.round(Number(b?.rating ?? 0))));
      if (!rating) return json({ error: "rating は1〜5" }, 400);
      const id = Number(rateMatch[1]);
      const post = await env.DB.prepare(
        `SELECT account_id, body FROM posts WHERE id = ? AND status = 'pending'`
      )
        .bind(id)
        .first<{ account_id: string; body: string }>();
      if (!post) return json({ error: "該当する承認待ちポストがありません" }, 404);
      try {
        await env.DB.prepare(
          `INSERT INTO sample_feedback (account_id, post_id, kind, rating, before_body)
           VALUES (?, ?, 'rate', ?, ?)`
        )
          .bind(post.account_id, id, rating, post.body)
          .run();
      } catch (e) {
        console.error(`[${post.account_id}] sample_feedback(rate)保存失敗（テーブル未作成?）: ${e instanceof Error ? e.message : e}`);
      }
      if (rating === 5) {
        // ★5＝合格：投稿予約（次のスロット）＋トレーニング本数にカウント
        const rateSlot = await nextQueueSlot(env, post.account_id);
        await env.DB.prepare(`UPDATE posts SET status = 'queued', not_before = ? WHERE id = ?`).bind(rateSlot, id).run();
        await bumpCount(env, post.account_id, "star5_count");
        return json({ ok: true, rated: id, rating, pass: true });
      }
      // ★1-4＝フィードバックのみ（投稿しない・本数に数えない）
      await env.DB.prepare(`UPDATE posts SET status = 'rated' WHERE id = ?`).bind(id).run();
      return json({ ok: true, rated: id, rating, pass: false });
    }
    // アカウント設定の部分更新（指定した項目だけ・他は維持）
    if (req.method === "POST" && url.pathname === "/api/account/update") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        display_name?: string;
        niche?: string;
        approval_mode?: string;
        cycle_days?: number;
        daily_frequency?: number;
        x_premium?: boolean;
        auto_expand?: boolean;
        url_posts?: boolean;
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      // X有料プランの有無を保存（長文ポストの可否に使う）
      if (typeof b.x_premium === "boolean") {
        await env.DB.prepare(
          `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
           VALUES (?, 'x_premium', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
        )
          .bind(b.account, b.x_premium ? "1" : "0")
          .run();
      }
      // 学習データの自動拡張（ON=範囲を超えてAIが内容も考える / OFF=範囲を出ない）
      if (typeof b.auto_expand === "boolean") {
        await env.DB.prepare(
          `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
           VALUES (?, 'auto_expand', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
        )
          .bind(b.account, b.auto_expand ? "1" : "0")
          .run();
      }
      // URL誘導ポスト（リンクで外部に飛ばす型）の解放。ONにした人だけ型メニューに出す。
      if (typeof b.url_posts === "boolean") {
        await env.DB.prepare(
          `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
           VALUES (?, 'url_posts', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
        )
          .bind(b.account, b.url_posts ? "1" : "0")
          .run();
      }
      const mode =
        b.approval_mode === "auto" ? "auto" : b.approval_mode === "queue" ? "queue" : null;
      // 1日のポスト数は 1〜5 にクランプ（上限5本）。
      const freq5 = typeof b.daily_frequency === "number" ? Math.max(1, Math.min(5, Math.round(b.daily_frequency))) : null;
      // 自動投稿の解放条件：トレーニング（添削＋★5合格）が10本以上（設計書06章）
      if (mode === "auto") {
        const pass = (await readCount(env, b.account, "edit_count")) + (await readCount(env, b.account, "star5_count"));
        if (pass < 10) {
          return json(
            { error: "自動投稿は、AIのトレーニング（手直し＋★5合格）が10本になってから使えます", pass_count: pass, need: 10 },
            400
          );
        }
      }
      await env.DB.prepare(
        `UPDATE accounts SET
           display_name = COALESCE(?, display_name),
           niche = COALESCE(?, niche),
           approval_mode = COALESCE(?, approval_mode),
           cycle_days = COALESCE(?, cycle_days),
           daily_frequency = COALESCE(?, daily_frequency)
         WHERE id = ?`
      )
        .bind(
          b.display_name ?? null,
          b.niche ?? null,
          mode,
          b.cycle_days ?? null,
          freq5,
          b.account
        )
        .run();
      // 自動投稿モードで保存されたら、承認待ち(pending)を整理して即補充する。
      //   手動→自動の切替後、誰にも承認されないpendingが在庫上限を塞ぎ自動補充が飢餓するため。
      //   pendingはAIの未承認下書き＝消しても学習は失われない（いつでも作り直せる）。
      let pendingCleared = 0;
      if (mode === "auto") {
        const del = await env.DB.prepare(`DELETE FROM posts WHERE account_id = ? AND status = 'pending'`)
          .bind(b.account).run().catch(() => null);
        pendingCleared = del?.meta?.changes ?? 0;
      }
      // 補充生成はここでは行わない（1リクエストに複数の長い生成を詰めると実行制限で落ちる）。
      // 画面側が needs_generate を見て、1本ずつの生成リクエストを回す。
      return json({ ok: true, pending_cleared: pendingCleared, needs_generate: mode === "auto" });
    }
    // 発信の方向性（構造化：メインテーマ/サブテーマ/届けたい相手/スタンス）。
    // niche(メイン) を accounts に、まとめテキストを corpus.direction に保存（上書き）。
    if (req.method === "POST" && url.pathname === "/api/account/direction") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        main?: string;
        subthemes?: string[];
        audience?: string[];
        stance?: string[];
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const clean = (a?: string[]) =>
        Array.isArray(a) ? a.map((s) => String(s).trim()).filter(Boolean) : [];
      const main = (b.main ?? "").trim();
      const subs = clean(b.subthemes);
      const aud = clean(b.audience);
      const stance = clean(b.stance);
      if (main) {
        await env.DB.prepare(`UPDATE accounts SET niche = ? WHERE id = ?`).bind(main, b.account).run();
      }
      const parts: string[] = [];
      if (main) parts.push(`メインテーマ：${main}`);
      if (subs.length) parts.push(`サブテーマ：${subs.join("、")}`);
      if (aud.length) parts.push(`届けたい相手：${aud.join("、")}`);
      if (stance.length) parts.push(`発信のスタンス・トーン：${stance.join("、")}`);
      const text = parts.join("\n");
      if (text) {
        await env.DB.prepare(
          `INSERT INTO corpus (account_id, key, content, updated_at)
           VALUES (?, 'direction', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
        )
          .bind(b.account, text)
          .run();
        // 後から編集できるよう、選択内容(構造)もJSONで保存
        await env.DB.prepare(
          `INSERT INTO corpus (account_id, key, content, updated_at)
           VALUES (?, 'direction_struct', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
        )
          .bind(b.account, JSON.stringify({ main, subthemes: subs, audience: aud, stance }))
          .run();
      }
      return json({ ok: true, saved: !!text });
    }
    // オンボーディングの進捗（チュートリアルの現在地を“状態”から判定する元。閉じても続きから戻れる）
    if (req.method === "GET" && url.pathname === "/api/account/state") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const row = await env.DB.prepare(
        `SELECT handle, onboarded, niche, cycle_days, daily_frequency, approval_mode FROM accounts WHERE id = ?`
      )
        .bind(acc)
        .first<{
          handle: string | null;
          onboarded: number;
          niche: string | null;
          cycle_days: number | null;
          daily_frequency: number | null;
          approval_mode: string | null;
        }>();
      // オンボーディングの「連携済み」は“UIで連携したか（account_creds）”で判定。
      // 運営フォールバックのACCOUNTS_CREDSシークレットは数えない（リセットしやすく・体験が正確）。
      const credsRow = await env.DB.prepare(
        `SELECT 1 FROM account_creds WHERE account_id = ?`
      )
        .bind(acc)
        .first();
      const connected = !!credsRow;
      const voiceRow = await env.DB.prepare(
        `SELECT SUM(length(content)) AS n FROM corpus WHERE account_id = ? AND key IN ('voice_samples','voice_edits')`
      )
        .bind(acc)
        .first<{ n: number }>();
      const hasVoice = !!(voiceRow && (voiceRow.n ?? 0) > 0);
      const dc = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND status = 'pending'`
      )
        .bind(acc)
        .first<{ n: number }>();
      const editCount = await readCount(env, acc, "edit_count");
      const star5Count = await readCount(env, acc, "star5_count");
      const passCount = editCount + star5Count; // トレーニング本数＝添削＋★5合格
      const voicePosts = await readCount(env, acc, "voice_posts"); // 学習した過去投稿数（連携/再学習時に保存）
      const xPremium = await isPremium(env, acc); // X有料プラン（長文ポスト可）
      const aeRow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'auto_expand'`
      ).bind(acc).first<{ v: string }>();
      const autoExpand = aeRow?.v === "1";
      const urlRow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'url_posts'`
      ).bind(acc).first<{ v: string }>();
      const urlPosts = urlRow?.v === "1"; // URL誘導ポストの解放フラグ
      const lbRow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'learn_basis'`
      ).bind(acc).first<{ v: string }>();
      const learnBasis = (lbRow?.v === "promo" || lbRow?.v === '"promo"') ? "promo" : "organic"; // 学習基準トグル（既定=オーガニック優先）
      const promoRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND promoted = 1`
      ).bind(acc).first<{ n: number }>().catch(() => null);
      const promotedCount = promoRow?.n ?? 0; // 広告に使った投稿の数（自動判別＋手動マーク）
      const linkRow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'link_targets'`
      ).bind(acc).first<{ v: string }>();
      let linkTargets: Array<{ label: string; url: string }> = [];
      try { const a = JSON.parse(linkRow?.v ?? "[]"); if (Array.isArray(a)) linkTargets = a; } catch { /* 壊れていれば空 */ }
      const netaRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM neta_files WHERE account_id = ?`
      ).bind(acc).first<{ n: number }>().catch(() => null);
      const netaCount = netaRow?.n ?? 0;
      const dirRow = await env.DB.prepare(
        `SELECT content FROM corpus WHERE account_id = ? AND key = 'direction'`
      )
        .bind(acc)
        .first<{ content: string }>();
      const dir = !!(dirRow && dirRow.content);
      const dsRow = await env.DB.prepare(
        `SELECT content FROM corpus WHERE account_id = ? AND key = 'direction_struct'`
      )
        .bind(acc)
        .first<{ content: string }>();
      let directionStruct: unknown = null;
      if (dsRow?.content) { try { directionStruct = JSON.parse(dsRow.content); } catch { /* skip */ } }
      return json({
        onboarded: row?.onboarded ? 1 : 0,
        connected,
        has_voice: hasVoice,
        has_direction: dir,
        direction: dirRow?.content ?? "",
        direction_struct: directionStruct,
        voice_posts: voicePosts,
        drafts: dc?.n ?? 0,
        edit_count: editCount,
        star5_count: star5Count,
        pass_count: passCount,
        auto_unlocked: passCount >= 10,
        x_premium: xPremium,
        char_limit: xPremium ? 1000 : 140,
        auto_expand: autoExpand,
        url_posts: urlPosts,
        learn_basis: learnBasis, // 学習基準：organic（既定）/ promo
        promoted_count: promotedCount, // 広告に使った投稿数（トグルの意味が出るか判断用）
        card_on: (await loadCardTheme(env, acc))?.on === true, // 画像カード・マスターON＝検索/型に画像付きを出す

        link_targets: linkTargets,
        neta_count: netaCount,
        handle: row?.handle ?? null,
        niche: row?.niche ?? null,
        cycle_days: row?.cycle_days ?? 5,
        daily_frequency: row?.daily_frequency ?? 3,
        approval_mode: row?.approval_mode ?? "queue",
        email: (await getConfig(env, "member_email")) ?? null, // 会員メール（連絡/周知・将来ログイン）
        write_verified: (await getConfig(env, "write_verified")) === "1", // テスト投稿で書き込み権限確認済み
        consented: !!(await getConfig(env, "consent_at")), // 利用規約・プライバシー同意済み（オンボの入口ゲート）
        licensed: !!(await getConfig(env, "honbu_token")), // 招待コードでライセンス有効化済み（本部に登録済み）
      });
    }
    // ライセンス有効化：招待コード＋同意を保存し、本部に会員登録（招待コードを検証）。オンボの入口ゲート。
    if (req.method === "POST" && url.pathname === "/api/account/license") {
      const b = (await req.json().catch(() => null)) as { invite_code?: string; consent?: boolean } | null;
      if (!b?.consent) return json({ ok: false, error: "利用規約・プライバシー方針への同意が必要です。" }, 200);
      const code = String(b.invite_code ?? "").trim().toUpperCase();
      if (!code) return json({ ok: false, error: "招待コードを入力してください。" }, 200);
      const uid = await getMemberUid(env);
      const acc = await loadAccount(env, uid);
      const email = (await getConfig(env, "member_email")) ?? null;
      // 同意は先に記録（同意自体は済んでいる）。コード検証に失敗しても、正しいコードで再試行できる。
      await setConfig(env, "consent_at", new Date().toISOString());
      await setConfig(env, "consent_version", "1");
      await setConfig(env, "invite_code", code);
      const r = await registerWithHonbu(env, uid, acc?.handle ?? null, email, code, url.origin);
      if (!r.ok) {
        const msg = r.error === "invite_invalid" ? "招待コードが正しくありません。確認して入れ直してください。"
          : r.error === "invite_not_personal" ? "そのコードは紹介リンク用です。紹介リンクを開いてお名前とメールを登録すると、あなた専用の招待コードがメールで届きます。そのコードを入れてください。"
          : r.error === "invite_used_up" ? "この招待コードは使用上限に達しています。運営にお問い合わせください。"
          : r.error === "invite_required" ? "招待コードを入力してください。"
          : r.error === "unreachable" || r.error === "honbu_unconfigured" ? "本部に接続できませんでした。少し待って、もう一度お試しください。"
          : "ライセンスを有効化できませんでした。もう一度お試しください。";
        return json({ ok: false, error: msg }, 200);
      }
      return json({ ok: true, licensed: true });
    }
    // 利用APIコストの「目安」。実測の利用回数 × 仮の単価。正確な請求額ではない（あくまで目安）。
    if (req.method === "GET" && url.pathname === "/api/account/usage") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const num = async (sql: string, binds: unknown[]): Promise<number> => {
        try {
          const r = await env.DB.prepare(sql).bind(...binds).first<{ n: number }>();
          return r?.n ?? 0;
        } catch {
          return 0; // テーブル未作成等でも目安表示は止めない
        }
      };
      // 対象月（?month=YYYY-MM、無指定は今月）。表示も月境界もすべて日本時間(JST=UTC+9)で判定する。
      // 保存値(posted_at/fetched_at/created_at)はUTC文字列なので、JSTの月境界をUTCに直して突き合わせる。
      const pad = (n: number) => String(n).padStart(2, "0");
      const JST_MS = 9 * 60 * 60 * 1000;
      const now = new Date();
      const nowJst = new Date(now.getTime() + JST_MS); // JSTの壁時計をUTC getterで読むための寄せ
      const curMonth = `${nowJst.getUTCFullYear()}-${pad(nowJst.getUTCMonth() + 1)}`;
      const mIn = url.searchParams.get("month") || "";
      const mKey = /^\d{4}-\d{2}$/.test(mIn) ? mIn : curMonth;
      const [yy, mm] = mKey.split("-").map(Number);
      const nextY = mm === 12 ? yy + 1 : yy;
      const nextM = mm === 12 ? 1 : mm + 1;
      // JSTの月初00:00:00 を UTC の "YYYY-MM-DD HH:MM:SS" 文字列に（＝JST境界の9時間前）。保存値=UTCと突き合わせる。
      const utcStamp = (d: Date) =>
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      const start = utcStamp(new Date(Date.UTC(yy, mm - 1, 1) - JST_MS));
      const end = utcStamp(new Date(Date.UTC(nextY, nextM - 1, 1) - JST_MS));
      const isCurrent = mKey === curMonth;
      const daysInMonth = new Date(Date.UTC(nextY, nextM - 1, 1) - 86400000).getUTCDate();
      const daysElapsed = isCurrent ? Math.max(1, nowJst.getUTCDate()) : daysInMonth;

      // 書き込み（X投稿）＝posted本数＋連結の2本目。取り込み過去ポスト(historical)は除外。
      const writes = async (binds: unknown[], range: string) =>
        (await num(`SELECT COUNT(*) AS n FROM posts WHERE account_id=? AND status='posted' AND source<>'historical'${range}`, binds)) +
        (await num(`SELECT COUNT(*) AS n FROM posts WHERE account_id=? AND status='posted' AND source<>'historical' AND reply_text IS NOT NULL AND trim(reply_text)<>''${range}`, binds));
      // 読み取り（反応の取得）＝post_metrics＋account_metrics。バッチ取得もあるので上振れ目安。
      const reads = async (binds: unknown[], range: string) =>
        (await num(`SELECT COUNT(*) AS n FROM post_metrics WHERE account_id=?${range}`, binds)) +
        (await num(`SELECT COUNT(*) AS n FROM account_metrics WHERE account_id=?${range}`, binds));
      // 過去ポストの学習＝X読み取り（連携・再学習時に件数を記録）。
      const learns = async (binds: unknown[], range: string) =>
        await num(`SELECT COALESCE(SUM(units),0) AS n FROM usage_events WHERE account_id=? AND kind='learn_read'${range}`, binds);
      // 仮の単価（目安）。X従量課金＋Claudeは「モデル別の実トークン×単価」。為替は月末レートを取得。
      const X_POST_USD = 0.015; // 1ツイート書き込み
      const X_READ_USD = 0.005; // 1回の読み取り
      const fx = await getMonthRate(env, mKey, isCurrent, daysInMonth);
      const USDJPY = fx.rate; // 対象月のUSD/JPY（過去＝月末時点・当月＝最新）
      const xPostJpy = X_POST_USD * USDJPY;
      const xReadJpy = X_READ_USD * USDJPY;
      // モデル別の100万トークンあたり単価（USD）。未知モデルはOpus単価で代用。
      const MODEL_RATES: Record<string, { in: number; out: number; label: string }> = {
        "claude-opus-4-8": { in: 5, out: 25, label: "AI生成（Opus・本生成）" },
        "claude-sonnet-5": { in: 3, out: 15, label: "AI生成（Sonnet 5・本生成）" }, // 導入価格は $2/$10（〜2026/8/31）。目安は標準$3/$15で安全側
        "claude-haiku-4-5": { in: 1, out: 5, label: "AI下準備（Haiku・要約など）" },
      };
      // Claude利用をモデル別に集計し、実トークン×単価で円に。
      const aiAgg = async (binds: unknown[], range: string) => {
        try {
          const r = await env.DB.prepare(
            `SELECT model, COUNT(*) AS calls, COALESCE(SUM(in_tokens),0) AS in_t,
                    COALESCE(SUM(cached_tokens),0) AS cached_t, COALESCE(SUM(out_tokens),0) AS out_t
               FROM claude_usage WHERE account_id=?${range} GROUP BY model ORDER BY model`
          )
            .bind(...binds)
            .all<{ model: string; calls: number; in_t: number; cached_t: number; out_t: number }>();
          return (r.results ?? []).map((m) => {
            const rate = MODEL_RATES[m.model] ?? { in: 5, out: 25, label: m.model };
            // キャッシュ読みは約1割課金として概算。
            const usd = ((m.in_t + m.cached_t * 0.1) / 1e6) * rate.in + (m.out_t / 1e6) * rate.out;
            return { model: m.model, label: rate.label ?? m.model, calls: m.calls, jpy: Math.round(usd * USDJPY) };
          });
        } catch {
          return []; // テーブル未作成等でも止めない
        }
      };

      const mB = [acc, start, end];
      const aB = [acc];
      const writesMonth = await writes(mB, " AND posted_at>=? AND posted_at<?");
      const readsMonth = await reads(mB, " AND fetched_at>=? AND fetched_at<?");
      const learnMonth = await learns(mB, " AND created_at>=? AND created_at<?");
      const aiMonth = await aiAgg(mB, " AND created_at>=? AND created_at<?");
      const writesTotal = await writes(aB, "");
      const readsTotal = await reads(aB, "");
      const learnTotal = await learns(aB, "");
      const aiTotal = await aiAgg(aB, "");

      const buildCalc = (
        w: number,
        rd: number,
        ln: number,
        aiModels: Array<{ model: string; label: string; calls: number; jpy: number }>
      ) => {
        const aiJpy = aiModels.reduce((s, a) => s + a.jpy, 0);
        return {
          x_posts: w,
          x_reads: rd,
          learn_reads: ln,
          x_post_jpy: Math.round(w * xPostJpy),
          x_read_jpy: Math.round(rd * xReadJpy),
          learn_jpy: Math.round(ln * xReadJpy),
          ai_models: aiModels,
          ai_jpy: aiJpy,
          total_jpy: Math.round(w * xPostJpy + rd * xReadJpy + ln * xReadJpy + aiJpy),
        };
      };
      const monthCalc = buildCalc(writesMonth, readsMonth, learnMonth, aiMonth);

      // ── 今月の予想（スケジュール連動）──
      // 「1日平均×日数」ではなく、確定スケジュール(daily_frequency/cycle_days)で“量”を、実測トークンで“単価”を出して
      // 1日あたりの定常コストを積み上げる。一回きり費用（初期の過去ポスト学習＝learn_read）は残り日数に掛けない。
      const acctRow = await env.DB.prepare(`SELECT daily_frequency, cycle_days FROM accounts WHERE id=?`)
        .bind(acc).first<{ daily_frequency: number; cycle_days: number }>().catch(() => null);
      const freq = Math.max(0, acctRow?.daily_frequency ?? 0);
      // claude_usage を kind×model で集計し、kind別の円・回数に（generate＝定常の主役、exec_note＝学習AI）。
      const kindAgg = async (binds: unknown[], range: string): Promise<Record<string, { jpy: number; calls: number }>> => {
        const out: Record<string, { jpy: number; calls: number }> = {};
        try {
          const r = await env.DB.prepare(
            `SELECT kind, model, COUNT(*) AS calls, COALESCE(SUM(in_tokens),0) AS in_t,
                    COALESCE(SUM(cached_tokens),0) AS cached_t, COALESCE(SUM(out_tokens),0) AS out_t
               FROM claude_usage WHERE account_id=?${range} GROUP BY kind, model`
          ).bind(...binds).all<{ kind: string; model: string; calls: number; in_t: number; cached_t: number; out_t: number }>();
          for (const m of (r.results ?? [])) {
            const rate = MODEL_RATES[m.model] ?? { in: 5, out: 25, label: m.model };
            const usd = ((m.in_t + m.cached_t * 0.1) / 1e6) * rate.in + (m.out_t / 1e6) * rate.out;
            const k = out[m.kind] || { jpy: 0, calls: 0 };
            k.jpy += Math.round(usd * USDJPY); k.calls += m.calls;
            out[m.kind] = k;
          }
        } catch { /* テーブル未作成等でも止めない */ }
        return out;
      };
      const kindsM = await kindAgg(mB, " AND created_at>=? AND created_at<?");
      const execM = kindsM["exec_note"] || { jpy: 0, calls: 0 };

      // ── 本生成(generate)の1日あたりコスト：ハイブリッド ──
      // 直近14日を日別に集計し、「初期構築・再学習の山（生成コール数が異常に多い日）」を除いた“通常運転日”の平均＝実測ペース。
      // 通常運転日がまだ無ければ スケジュール推定（1日freq本 × 1本あたり概算）。使うほど実測に寄る。
      // ※1回の生成APIで複数本まとめて作るので「1回あたり×本数」は使わない。日別の実コストで見る。
      const cycleDays = Math.max(1, acctRow?.cycle_days ?? 3);
      const PER_POST_JPY = 10; // 1本あたりの概算（Sonnet 5・スケジュール推定の単価）。実測が無い間だけ使う
      let genDailyJpy = freq * PER_POST_JPY;
      let genBasis: "observed" | "schedule" = "schedule";
      try {
        const gr = await env.DB.prepare(
          `SELECT date(created_at) AS d, model, COUNT(*) AS calls,
                  COALESCE(SUM(in_tokens),0) AS in_t, COALESCE(SUM(cached_tokens),0) AS cached_t, COALESCE(SUM(out_tokens),0) AS out_t
             FROM claude_usage WHERE account_id=? AND kind='generate' AND created_at >= datetime('now','-14 days')
             GROUP BY d, model`
        ).bind(acc).all<{ d: string; model: string; calls: number; in_t: number; cached_t: number; out_t: number }>();
        const dayJpy: Record<string, number> = {}, dayCalls: Record<string, number> = {};
        for (const r of (gr.results ?? [])) {
          const rate = MODEL_RATES[r.model] ?? { in: 5, out: 25, label: r.model };
          const usd = ((r.in_t + r.cached_t * 0.1) / 1e6) * rate.in + (r.out_t / 1e6) * rate.out;
          dayJpy[r.d] = (dayJpy[r.d] || 0) + usd * USDJPY;
          dayCalls[r.d] = (dayCalls[r.d] || 0) + r.calls;
        }
        // 通常運転の1日（サイクル補充を含む）の生成コール上限。これを超える日＝初期構築/再学習の山とみなして除外。
        const callCap = Math.max(freq * cycleDays * 2, 20);
        const normalDays = Object.keys(dayCalls).filter((d) => dayCalls[d] <= callCap);
        if (normalDays.length >= 1) {
          genDailyJpy = normalDays.reduce((s, d) => s + dayJpy[d], 0) / normalDays.length;
          genBasis = "observed";
        }
      } catch { /* テーブル未作成等でもスケジュール推定で続行 */ }

      const readsPerDay = readsMonth / daysElapsed; // メトリクス取得の実測日平均
      const execPerDay = execM.jpy / daysElapsed;   // 学習AI(exec_note)を日割り
      // 1日あたりの定常コスト＝X投稿(確定)＋本生成(ハイブリッド)＋メトリクス取得(実測日割)＋学習AI(実測日割)。
      // ※ learn_read（過去ポスト学習の読み取り）は初月だけの一回きりとみなし、定常には含めない。
      const xPostComponent = Math.round(freq * xPostJpy);
      const genComponent = Math.round(genDailyJpy);
      const readsComponent = Math.round(readsPerDay * xReadJpy);
      const learnComponent = Math.round(execPerDay);
      const steadyDailyJpy = freq * xPostJpy + genDailyJpy + readsPerDay * xReadJpy + execPerDay;
      const remainingDays = isCurrent ? Math.max(0, daysInMonth - daysElapsed) : 0;
      // 今月の着地＝これまでの実績（一回きり込み）＋残り日数×定常コスト。
      const forecastJpy = isCurrent ? Math.round(monthCalc.total_jpy + remainingDays * steadyDailyJpy) : null;
      // 毎月の定常目安＝定常1日×月日数（初期費用を含まない“ならし”の月額）。
      const steadyMonthlyJpy = isCurrent ? Math.round(steadyDailyJpy * daysInMonth) : null;
      const oneTimeJpy = isCurrent ? monthCalc.learn_jpy : null; // 初月だけの大物（過去ポスト学習の読み取り）
      return json({
        account: acc,
        month_label: mKey,
        is_current: isCurrent,
        can_next: !isCurrent,
        days_elapsed: daysElapsed,
        days_in_month: daysInMonth,
        daily_frequency: freq,
        forecast_jpy: forecastJpy,
        steady_monthly_jpy: steadyMonthlyJpy, // 毎月の定常目安（初期費用なし）
        steady_daily_jpy: isCurrent ? Math.round(steadyDailyJpy) : null,
        one_time_jpy: oneTimeJpy, // 初月だけの一回きり費用の目安
        forecast_detail: isCurrent ? {
          actual_so_far: monthCalc.total_jpy, // これまでの実績（今月・一回きり込み）
          one_time: monthCalc.learn_jpy,      // うち初期費用
          remaining_days: remainingDays,
          steady_daily: Math.round(steadyDailyJpy),
          daily: { x_post: xPostComponent, gen: genComponent, reads: readsComponent, learn: learnComponent },
          gen_basis: genBasis, // "observed"=実測ペース / "schedule"=スケジュール推定
          freq: freq,
        } : null,
        assumptions: {
          x_post_usd: X_POST_USD,
          x_read_usd: X_READ_USD,
          usdjpy: Math.round(USDJPY * 100) / 100,
          usdjpy_as_of: fx.as_of, // 適用レートの日付（月末時点 等）
          usdjpy_fallback: fx.fallback, // 取得できず概算値を使ったか
          x_post_jpy: Math.round(xPostJpy * 10) / 10,
          x_read_jpy: Math.round(xReadJpy * 10) / 10,
          ai_models: [
            { label: "Sonnet 5（本生成）", in_usd: 3, out_usd: 15 },
            { label: "Haiku（要約など）", in_usd: 1, out_usd: 5 },
          ],
        },
        month: monthCalc,
        total: buildCalc(writesTotal, readsTotal, learnTotal, aiTotal),
      });
    }
    // 飛ばし先URLをAIが読んで「説明」を下書きする（雑務なので安いモデル＝Haiku）。
    // 読めないページ（JS描画・ログイン必須など）は素直に失敗を返し、手入力に促す。
    if (req.method === "POST" && url.pathname === "/api/account/link-describe") {
      const b = (await req.json().catch(() => null)) as { account?: string; url?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const target = String(b?.url ?? "").trim();
      if (!/^https?:\/\/.+/.test(target)) return json({ ok: false, error: "URL（http から始まる）を入れてください" }, 400);
      const claudeKey = (await resolveCreds(env, b.account))?.claudeKey;
      if (!claudeKey) return json({ ok: false, error: "Claude APIキーが未設定です" }, 400);

      // ページ取得（タイムアウト・サイズ制限つき）。bot扱いを避けるため実ブラウザ風のヘッダ。
      let html = "";
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(target, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en;q=0.8",
          },
          redirect: "follow",
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return json({ ok: false, error: `ページ取得に失敗（HTTP ${res.status}）。手入力してください。` }, 200);
        const ct = res.headers.get("content-type") ?? "";
        if (!/html|text|xml/i.test(ct)) return json({ ok: false, error: `テキストとして読めません（${ct || "不明"}）。手入力してください。` }, 200);
        html = (await res.text()).slice(0, 250000);
      } catch (fe) {
        const m = fe instanceof Error ? fe.message : String(fe);
        return json({ ok: false, error: `ページに接続できませんでした（${m.slice(0, 80)}）。手入力してください。` }, 200);
      }

      // タイトル・メタ説明・本文テキストを抽出。
      const pick = (re: RegExp) => (html.match(re)?.[1] ?? "").replace(/\s+/g, " ").trim();
      const pageTitle = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const metaDesc =
        pick(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
        pick(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
      const bodyText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // 中身がほぼ無い＝JS描画ページなどで読めていない。
      if (bodyText.length < 200 && metaDesc.length < 40) {
        return json({ ok: false, error: `本文を読み取れませんでした（取得 ${bodyText.length}字・自動描画/限定公開の可能性）。手入力してください。` }, 200);
      }

      try {
        const { text, usage } = await callClaude({
          apiKey: claudeKey,
          model: "claude-haiku-4-5", // 雑務は安いモデルで
          noEffort: true, // effort非対応でも確実に動くように省略
          thinkingMode: "disabled",
          maxTokens: 700,
          system: [
            {
              text:
                "あなたはWebページの内容を、Xの誘導ポスト作成のために短く要約するアシスタント。" +
                "出力は説明文のみ（前置き・見出し・箇条書き記号・URLは不要）。日本語で。",
            },
          ],
          userText:
            "次のページを、誘導ポスト作成用に200〜400字で要約して。" +
            "「何のページか／誰向けか／主な提供価値／申込・締切などの行動」が分かるように。\n\n" +
            `タイトル: ${pageTitle}\nメタ説明: ${metaDesc}\n本文抜粋: ${bodyText.slice(0, 8000)}`,
        });
        await logClaudeUsage(env, b.account, "claude-haiku-4-5", usage, "describe"); // モデル別の料金記録
        const desc = (text ?? "").trim().slice(0, 500);
        if (!desc) return json({ ok: false, error: "AIが要約を返しませんでした（拒否応答の可能性）。手入力してください。" }, 200);
        return json({ ok: true, desc, title: pageTitle.slice(0, 120) });
      } catch (ce) {
        const m = ce instanceof Error ? ce.message : String(ce);
        return json({ ok: false, error: `AI要約に失敗（${m.slice(0, 120)}）。手入力してください。` }, 200);
      }
    }
    // CV計測タグの設置チェック：サンクスページURLを取得し、HTML内にこの会員のタグ署名があるか判定。
    //   注意：サーバ側でHTMLを読むだけ（JS実行なし）。タグマネージャ等でJS注入している場合や
    //   ログイン必須ページは検出できない＝「見つからない＝必ず未設置」ではない、と返し方で伝える。
    if (req.method === "POST" && url.pathname === "/api/account/check-tag") {
      const b = (await req.json().catch(() => null)) as { account?: string; url?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const target = String(b?.url ?? "").trim();
      if (!/^https?:\/\/.+/.test(target)) return json({ ok: false, error: "URL（http から始まる）を入れてください" }, 200);
      let html = "";
      let status = 0;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(target, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en;q=0.8",
          },
          redirect: "follow",
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        status = res.status;
        if (!res.ok) return json({ ok: true, found: false, reachable: false, status, hint: `ページを取得できませんでした（HTTP ${status}）。ログイン必須のページ等は自動チェックできません。実際に1件テストするのが確実です。` }, 200);
        const ct = res.headers.get("content-type") ?? "";
        if (!/html|text|xml/i.test(ct)) return json({ ok: true, found: false, reachable: false, status, hint: `HTMLとして読めませんでした（${ct || "不明"}）。` }, 200);
        html = (await res.text()).slice(0, 500000);
      } catch (fe) {
        const m = fe instanceof Error ? fe.message : String(fe);
        return json({ ok: true, found: false, reachable: false, hint: `ページに接続できませんでした（${m.slice(0, 80)}）。ログイン必須のページ等は自動チェックできません。` }, 200);
      }
      // 署名：完了タグ＝このサービス由来の /cv?a=<account> を含む（snippetがlocation.origin+"/cv?a="+ACCで固定生成するため確実）。
      //       入口タグ＝/cv を含まず localStorageキー sns_sr だけを含む。
      const origin = (env.PUBLIC_URL || new URL(req.url).origin).replace(/\/+$/, "");
      const sig1 = `${origin}/cv?a=${b.account}`;
      const sig2 = `/cv?a=${b.account}`; // origin違い（プロキシ等）でも拾えるよう緩めの署名
      const foundCv = html.includes(sig1) || html.includes(sig2);
      const foundEntry = !foundCv && html.includes("sns_sr"); // 完了タグにも sns_sr が含まれるため、完了タグ無しのときだけ入口タグと判定
      const found = foundCv || foundEntry;
      return json({
        ok: true,
        found,
        reachable: true,
        status,
        hint: foundCv
          ? "完了タグを確認できました。このページに着いた人はCVとして記録されます。（入口タグはLP側に貼ってください）"
          : foundEntry
            ? "入口タグを確認できました。ここが計測リンクの着地ページ（LP）ならOKです。もしここがサンクスページ（完了画面）なら、貼るのは「②完了タグ」の方です（CVの記録は完了タグだけが行います）。"
            : "このページにタグが見つかりませんでした。LPなら①入口タグ、サンクスページ（完了画面）なら②完了タグを<head>に貼ってください。※タグマネージャ等でJS経由設置している場合は、この自動チェックでは検出できないことがあります（その場合は実際に1件テストして確認）。",
      });
    }
    // 飛ばし先URLの登録（複数）。リスト全体を受け取って上書き保存。
    if (req.method === "POST" && url.pathname === "/api/account/links") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        links?: Array<{ label?: string; title?: string; desc?: string; url?: string; note?: string }>;
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const raw = Array.isArray(b.links) ? b.links : [];
      // 1件＝ラベル(管理名)・リンクタイトル・説明(AIが生成に使う・最大500字)・URL の4つを必須。http(s)のみ・最大20件。
      const clean = raw
        .map((x) => {
          const url = String(x?.url ?? "").trim();
          return {
            label: String(x?.label ?? "").trim(),
            title: String(x?.title ?? "").trim(),
            desc: String(x?.desc ?? x?.note ?? "").trim().slice(0, 500), // 旧noteも引き継ぐ
            url,
            unit: Math.max(0, Math.floor(Number((x as { unit?: unknown })?.unit ?? 0)) || 0), // 1件あたり想定単価（CVの売上）
            code: url ? linkCode(b.account!, url) : "", // そのURLの『共通』計測コード（決定的）
          };
        })
        .filter((x) => x.label && x.title && x.desc && /^https?:\/\/.+/.test(x.url)) // 4つ揃ったものだけ保存
        .slice(0, 20);
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
         VALUES (?, 'link_targets', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      )
        .bind(b.account, JSON.stringify(clean))
        .run();
      // 各URLの『共通リンク』を台帳に登録（手動コピー用・既存は更新）。
      for (const c of clean) {
        if (!c.code) continue;
        await env.DB.prepare(
          `INSERT INTO tracked_links (code, account_id, url, kind, label) VALUES (?, ?, ?, 'url', ?)
           ON CONFLICT(code) DO UPDATE SET url = excluded.url, label = excluded.label`
        ).bind(c.code, b.account, c.url, c.label).run().catch(() => {});
      }
      return json({ ok: true, links: clean });
    }
    // クリック→CV解析：誘導先URL別に クリック(X指標)・CV・CVR・売上 を返す。
    if (req.method === "GET" && url.pathname === "/api/account/cv") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      // 登録済み誘導先（code・単価付き）を読む。
      const linkRow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'link_targets'`
      ).bind(acc).first<{ v: string }>().catch(() => null);
      let targets: Array<{ label?: string; title?: string; desc?: string; url?: string; code?: string; unit?: number }> = [];
      try { const a = JSON.parse(linkRow?.v ?? "[]"); if (Array.isArray(a)) targets = a; } catch { /* 空 */ }
      const upRow = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'url_posts'`).bind(acc).first<{ v: string }>().catch(() => null);
      const urlPosts = upRow?.v === "1";

      // 集計に必要な生データを「アカウント単位」でまとめて取得し、JS側でURL→コード群に畳み込む。
      // （1つのURLに 共通コード＋投稿ごとコード が複数ぶら下がるので、コード別に集計してURLへ合算する）
      const tlRows = (await env.DB.prepare(
        `SELECT code, url, kind FROM tracked_links WHERE account_id=?`
      ).bind(acc).all<{ code: string; url: string; kind: string }>().catch(() => ({ results: [] }))).results;
      const clkRows = (await env.DB.prepare(
        `SELECT code, COUNT(*) AS n FROM link_clicks WHERE account_id=? GROUP BY code`
      ).bind(acc).all<{ code: string; n: number }>().catch(() => ({ results: [] }))).results;
      const cvRows = (await env.DB.prepare(
        `SELECT code, COUNT(*) AS n, COALESCE(SUM(value),0) AS val FROM conversions WHERE account_id=? GROUP BY code`
      ).bind(acc).all<{ code: string; n: number; val: number }>().catch(() => ({ results: [] }))).results;
      const postRows = (await env.DB.prepare(
        `SELECT link_code AS code, body, status, created_at FROM posts WHERE account_id=? AND link_code IS NOT NULL AND link_code != '' ORDER BY created_at DESC`
      ).bind(acc).all<{ code: string; body: string; status: string; created_at: string }>().catch(() => ({ results: [] }))).results;

      const clkMap = new Map<string, number>(); for (const r of clkRows) clkMap.set(r.code, r.n);
      const cvMap = new Map<string, { n: number; val: number }>(); for (const r of cvRows) cvMap.set(r.code, { n: r.n, val: r.val });
      const postsByCode = new Map<string, Array<{ body: string; status: string; created_at: string }>>();
      for (const r of postRows) { const a = postsByCode.get(r.code) ?? []; a.push({ body: r.body, status: r.status, created_at: r.created_at }); postsByCode.set(r.code, a); }
      const pct = (n: number, c: number) => (c > 0 ? Math.round((n / c) * 1000) / 10 : null);

      const items = [];
      for (const t of targets) {
        const common = t.code || (t.url ? linkCode(acc, t.url) : "");
        if (!common || !t.url) continue;
        const unit = Math.max(0, Math.floor(Number(t.unit ?? 0)) || 0);
        // このURLに属するコード群＝共通コード＋tracked_linksでurl一致するコード（投稿ごと含む）。
        const codeSet = new Set<string>([common]);
        for (const r of tlRows) if (r.url === t.url) codeSet.add(r.code);
        let clicks = 0, conv = 0, value = 0;
        for (const c of codeSet) {
          clicks += clkMap.get(c) ?? 0;
          const cv = cvMap.get(c); if (cv) { conv += cv.n; value += cv.val; }
        }
        // 投稿ごと明細：このURLのコード群に属する投稿を、その投稿のコードの数字付きで返す。
        const perPost: Array<{ code: string; body: string; status: string; created_at: string; clicks: number; conversions: number; value: number; cvr_pct: number | null; is_common: boolean }> = [];
        for (const c of codeSet) {
          for (const p of postsByCode.get(c) ?? []) {
            const pc = clkMap.get(c) ?? 0; const pv = cvMap.get(c);
            perPost.push({
              code: c, body: (p.body ?? "").slice(0, 140), status: p.status, created_at: p.created_at,
              clicks: pc, conversions: pv?.n ?? 0, value: pv?.val ?? 0, cvr_pct: pct(pv?.n ?? 0, pc), is_common: c === common,
            });
          }
        }
        perPost.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        items.push({
          label: t.label ?? "", title: t.title ?? "", desc: t.desc ?? "", url: t.url, code: common, unit,
          posts: perPost.length, clicks, conversions: conv, value, cvr_pct: pct(conv, clicks),
          per_post: perPost,
        });
      }
      items.sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);
      return json({ ok: true, items, url_posts: urlPosts });
    }
    // 分析＆改善：投稿の反応（表示回数・いいね・リポスト・反応率）を集計し、型別・時間帯別の成績と
    // 伸びたポスト、AIが学習して効かせている傾向を返す。反応データが無ければ has_data:false。
    if (req.method === "GET" && url.pathname === "/api/account/analysis") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      // 集計期間（?days=N、0/未指定=全期間）。整数にクランプしてSQLに直書き（注入対策済み）。
      const daysRaw = parseInt(url.searchParams.get("days") ?? "0", 10);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 3650) : 0;
      const periodSql = days > 0 ? ` AND p.posted_at >= datetime('now', '-${days} days')` : "";
      // 各投稿の「最新スナップショット」を取る（日次で更新されるため）。
      let rows: Array<{
        hook: string | null; body: string; posted_at: string; pid: string | null;
        impressions: number | null; likes: number | null; reposts: number | null; replies: number | null;
        quotes: number | null; bookmarks: number | null; url_link_clicks: number | null;
        er_raw: number | null; er_norm: number | null;
      }> = [];
      try {
        const r = await env.DB.prepare(
          `SELECT p.hook AS hook, p.body AS body, p.posted_at AS posted_at, p.platform_post_id AS pid,
                  m.impressions, m.likes, m.reposts, m.replies, m.quotes, m.bookmarks, m.url_link_clicks, m.er_raw, m.er_norm
             FROM posts p
             JOIN post_metrics m ON m.post_id = p.id
            WHERE p.account_id = ? AND p.status = 'posted'${periodSql}
              AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id)
            ORDER BY p.posted_at DESC LIMIT 300`
        ).bind(acc).all<typeof rows[number]>();
        rows = r.results ?? [];
      } catch {
        rows = [];
      }
      // AIが学習して効かせている傾向（個性プロファイル）。データが無くても返す。
      const profRow = await env.DB.prepare(
        `SELECT key, value_json AS v FROM individual_profile WHERE account_id = ? AND key IN ('hook_affinity','best_hours','length_pref','format_pref','sample_size','cycle_focus','exec_notes')`
      ).bind(acc).all<{ key: string; v: string }>().catch(() => ({ results: [] as Array<{ key: string; v: string }> }));
      const prof: Record<string, unknown> = {};
      for (const pr of profRow.results ?? []) { try { prof[pr.key] = JSON.parse(pr.v); } catch { /* skip */ } }

      if (!rows.length) {
        return json({ account: acc, has_data: false, focus: prof.cycle_focus ?? null, learned: { hook_affinity: prof.hook_affinity ?? [], best_hours: prof.best_hours ?? [], length_pref: prof.length_pref ?? null, format_pref: prof.format_pref ?? null } });
      }

      const med = (a: number[]) => {
        const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
        if (!s.length) return 0;
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      };
      const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const num = (x: number | null) => (typeof x === "number" ? x : 0);
      const erPct = (x: number | null) => Math.round(num(x) * 1000) / 10; // er_raw(比) → %（小数1桁）

      // 反応の中身（ポジ/ネガ）の内訳。成績の弱補正（ポジ1.2/中立1.0/ネガ0.8）に使っている分を可視化。
      const senti = { pos: 0, neu: 0, neg: 0 };
      try {
        const sr = await env.DB.prepare(
          `SELECT r.sentiment AS s, COUNT(*) AS n FROM replies r
             JOIN posts p ON p.id = r.post_id
            WHERE r.account_id = ? AND r.is_self = 0 AND r.sentiment IS NOT NULL AND p.status = 'posted'${periodSql}
            GROUP BY r.sentiment`
        ).bind(acc).all<{ s: string; n: number }>();
        for (const row of sr.results ?? []) {
          if (row.s === "pos") senti.pos = row.n; else if (row.s === "neg") senti.neg = row.n; else senti.neu = row.n;
        }
      } catch { /* sentiment未対応の古いDBでも分析は動かす */ }
      const sentiTotal = senti.pos + senti.neu + senti.neg;

      // サマリー
      const summary = {
        posts: rows.length,
        avg_impressions: Math.round(avg(rows.map((r) => num(r.impressions)))),
        avg_likes: Math.round(avg(rows.map((r) => num(r.likes)))),
        avg_reposts: Math.round(avg(rows.map((r) => num(r.reposts)))),
        avg_er_pct: Math.round(avg(rows.map((r) => num(r.er_raw))) * 1000) / 10,
        sum_link_clicks: rows.reduce((s, r) => s + num(r.url_link_clicks), 0),
        reply_classified: sentiTotal,
        reply_pos: senti.pos,
        reply_neg: senti.neg,
        reply_pos_pct: sentiTotal ? Math.round((senti.pos / sentiTotal) * 100) : null,
        reply_neg_pct: sentiTotal ? Math.round((senti.neg / sentiTotal) * 100) : null,
      };
      // 1グループ（型・時間帯）の平均指標。順位の公平性のため正規化er中央値(score)も付ける。
      type Row = typeof rows[number];
      const aggMetrics = (rs: Row[]) => ({
        n: rs.length,
        impressions: Math.round(avg(rs.map((r) => num(r.impressions)))),
        likes: Math.round(avg(rs.map((r) => num(r.likes)))),
        reposts: Math.round(avg(rs.map((r) => num(r.reposts)))),
        quotes: Math.round(avg(rs.map((r) => num(r.quotes)))),
        bookmarks: Math.round(avg(rs.map((r) => num(r.bookmarks)))),
        clicks: Math.round(avg(rs.map((r) => num(r.url_link_clicks)))),
        er_pct: Math.round(avg(rs.map((r) => num(r.er_raw))) * 1000) / 10,
        score: Math.round(med(rs.map((r) => r.er_norm).filter((x): x is number => x != null)) * 100) / 100,
      });

      // 型ラベルの英語パターンキー(##single_long 等)を日本語の補足に直す（UIに英語を出さない）。
      const patShort = (key: string): string => {
        const p = PATTERNS[key]; if (!p) return "";
        if (p.url) return ""; // prefixが既にURL誘導を示すので付けない
        return (p.kind === "thread" ? "連結" : "単発") + (p.long ? "・長文" : "・短文") + (p.image ? "・画像" : "");
      };
      const hookLabel = (h: string): string => {
        const i = h.indexOf("##"); if (i < 0) return h;
        const prefix = h.slice(0, i), s = patShort(h.slice(i + 2));
        return s ? `${prefix}（${s}）` : prefix;
      };

      // 型別
      const byTypeMap = new Map<string, Row[]>();
      for (const r of rows) {
        const k = r.hook || "(型なし)";
        (byTypeMap.get(k) ?? byTypeMap.set(k, []).get(k)!).push(r);
      }
      const by_type = [...byTypeMap.entries()].map(([hook, rs]) => ({ hook, hook_label: hookLabel(hook), ...aggMetrics(rs) }));

      // 時間帯別（JST時）
      const byHourMap = new Map<number, Row[]>();
      for (const r of rows) {
        const utcH = new Date(String(r.posted_at).replace(" ", "T") + "Z").getUTCHours();
        const jst = (utcH + 9) % 24;
        (byHourMap.get(jst) ?? byHourMap.set(jst, []).get(jst)!).push(r);
      }
      const by_hour = [...byHourMap.entries()].map(([hour, rs]) => ({ hour, ...aggMetrics(rs) }));

      // ポスト別（1ポスト＝1行・生の値。多すぎないよう直近100件）
      const by_post = rows.slice(0, 100).map((r) => ({
        hook: r.hook, body: r.body.slice(0, 80), posted_at: r.posted_at, pid: r.pid,
        impressions: num(r.impressions), likes: num(r.likes), reposts: num(r.reposts),
        quotes: num(r.quotes), bookmarks: num(r.bookmarks), clicks: num(r.url_link_clicks),
        er_pct: erPct(r.er_raw), score: r.er_norm != null ? Math.round(r.er_norm * 100) / 100 : null,
      }));

      // 改善カード（行動に移せる focus＝サイクルを寄せられる）＋ 補足インサイト。
      // 平常比(er_norm,1.0=平常)で評価。カードは benefit順、探索で必ず3枚以上に埋める。
      type Focus = { dim: "hook" | "length" | "format"; value: string; label: string };
      const pctOf = (score: number) => Math.round((score - 1) * 100);
      const isThread = (r: Row) => !!r.hook && (r.hook.indexOf("🧵") === 0 || r.hook.indexOf("🔗") === 0);
      const normOf = (rs: Row[]) => med(rs.map((r) => r.er_norm).filter((x): x is number => x != null));
      const longRows = rows.filter((r) => r.body.length > 140);
      const shortRows = rows.filter((r) => r.body.length <= 140);
      const thrRows = rows.filter(isThread);
      const sglRows = rows.filter((r) => !isThread(r));

      const cardCands: Array<{ benefit: number; tone: "good" | "tip"; text: string; focus: Focus }> = [];
      // 型（n≥2・平常比プラス・URL以外）
      for (const t of by_type) {
        if (t.n >= 2 && t.score > 1.0 && t.hook && t.hook in TYPE_INSTRUCTIONS) {
          cardCands.push({ benefit: t.score - 1, tone: "good", text: `「${hookLabel(t.hook)}」が平常比+${pctOf(t.score)}%。多めに作ると効果的。`, focus: { dim: "hook", value: t.hook, label: `「${hookLabel(t.hook)}」を多めに` } });
        }
      }
      // 長さ（各3件以上）
      if (longRows.length >= 3 && shortRows.length >= 3) {
        const ls = normOf(longRows), ss = normOf(shortRows);
        if (ls > ss * 1.05) cardCands.push({ benefit: ls / ss - 1, tone: "tip", text: "長め(140字超)が短めより反応が良いです。", focus: { dim: "length", value: "長文", label: "長文を多めに" } });
        else if (ss > ls * 1.05) cardCands.push({ benefit: ss / ls - 1, tone: "tip", text: "短めが長めより反応が良いです。", focus: { dim: "length", value: "短文", label: "短文を多めに" } });
      }
      // 形式（各3件以上）
      if (thrRows.length >= 3 && sglRows.length >= 3) {
        const ts = normOf(thrRows), ss = normOf(sglRows);
        if (ts > ss * 1.05) cardCands.push({ benefit: ts / ss - 1, tone: "tip", text: "2ポスト連結が単発より反応が良いです。", focus: { dim: "format", value: "連結", label: "2ポスト連結を多めに" } });
        else if (ss > ts * 1.05) cardCands.push({ benefit: ss / ts - 1, tone: "tip", text: "単発が連結より反応が良いです。", focus: { dim: "format", value: "単発", label: "単発を多めに" } });
      }
      cardCands.sort((a, b) => b.benefit - a.benefit);
      // 探索カードで3枚以上に：まだ十分試せていない正典型（n<2）
      const testedWell = new Set(by_type.filter((t) => t.n >= 2).map((t) => t.hook));
      for (const k of CATALOG_KEYS) {
        const nm = metaOf(k).name;
        if (!testedWell.has(k)) cardCands.push({ benefit: -1, tone: "tip", text: `「${nm}」はまだあまり試せていません。試してみては。`, focus: { dim: "hook", value: k, label: `「${nm}」を試す` } });
      }
      const cards = cardCands.slice(0, 9).map(({ benefit, ...c }) => { void benefit; return c; });

      // 補足インサイト（カードにしない情報）
      const insights: Array<{ tone: "good" | "bad" | "tip"; text: string }> = [];
      const hoursByScore = [...by_hour].filter((h) => h.n >= 2).sort((a, b) => b.score - a.score);
      if (hoursByScore.length && hoursByScore[0].score > 1.05) insights.push({ tone: "good", text: `${hoursByScore[0].hour}時台がよく伸びています（配信を寄せると効果的）。` });
      const typesByScore = [...by_type].filter((t) => t.n >= 2).sort((a, b) => b.score - a.score);
      if (typesByScore.length) {
        const worst = typesByScore[typesByScore.length - 1];
        if (worst.score < 0.9) insights.push({ tone: "bad", text: `「${hookLabel(worst.hook)}」は平常比${pctOf(worst.score)}%と低め。切り口を変えるのも手。` });
      }
      if (rows.length < 10) insights.push({ tone: "tip", text: "まだデータが少なめ。各型10件ほどで提案の精度が上がります。" });

      return json({
        account: acc,
        has_data: true,
        period_days: days,
        learn_phase: ((prof.sample_size as { n?: number } | undefined)?.n ?? 0) >= 20 ? "tune" : "test",
        focus: prof.cycle_focus ?? null,
        summary,
        cards,
        insights,
        by_type,
        by_post,
        by_hour,
        learned: { hook_affinity: prof.hook_affinity ?? [], best_hours: prof.best_hours ?? [], length_pref: prof.length_pref ?? null, format_pref: prof.format_pref ?? null, exec_notes: prof.exec_notes ?? null, sample_size: prof.sample_size ?? null },
      });
    }
    // のび（ダッシュボード用）：フォロワーの推移＋直近期間の反応合計（いいね/インプ/リポスト）。
    // すべてD1の既存スナップショットから集計＝X APIは消費しない。
    if (req.method === "GET" && url.pathname === "/api/account/growth") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const daysRaw = parseInt(url.searchParams.get("days") ?? "30", 10);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30;
      // フォロワー時系列（日次スナップショット）。同日複数はその日の最後を採用。
      let pts: Array<{ at: string; v: number }> = [];
      try {
        const r = await env.DB.prepare(
          `SELECT followers AS v, fetched_at AS at FROM account_metrics
            WHERE account_id=? AND followers IS NOT NULL AND fetched_at >= datetime('now','-${days} days')
            ORDER BY fetched_at ASC`
        ).bind(acc).all<{ v: number; at: string }>();
        const byDay = new Map<string, { at: string; v: number }>();
        for (const x of r.results ?? []) byDay.set(String(x.at).slice(0, 10), { at: x.at, v: x.v });
        pts = [...byDay.values()];
      } catch { pts = []; }
      const curF = pts.length ? pts[pts.length - 1].v : null;
      const firstF = pts.length ? pts[0].v : null;
      const change = curF != null && firstF != null ? curF - firstF : null;
      // 期間の反応合計（各ポストの最新スナップショットで集計。取り込み過去ポストは除外）。
      const totals = { posts: 0, impressions: 0, likes: 0, reposts: 0 };
      try {
        const t = await env.DB.prepare(
          `SELECT COUNT(*) AS posts, COALESCE(SUM(m.impressions),0) AS imp,
                  COALESCE(SUM(m.likes),0) AS likes, COALESCE(SUM(m.reposts),0) AS rp
             FROM posts p JOIN post_metrics m ON m.post_id = p.id
            WHERE p.account_id=? AND p.status='posted' AND p.source<>'historical'
              AND p.posted_at >= datetime('now','-${days} days')
              AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id)`
        ).bind(acc).first<{ posts: number; imp: number; likes: number; rp: number }>();
        if (t) { totals.posts = t.posts; totals.impressions = t.imp; totals.likes = t.likes; totals.reposts = t.rp; }
      } catch { /* post_metrics未作成等でも止めない */ }
      return json({
        account: acc,
        period_days: days,
        has_followers: pts.length > 0,
        followers: { current: curF, change, series: pts.map((p) => p.v) },
        totals,
      });
    }
    // サイクルのフォーカス設定（改善カードを選ぶ／自動に戻す）。
    // focus=null で解除（＝自動）。{dim:'hook'|'length'|'format', value, label} で寄せる。
    if (req.method === "POST" && url.pathname === "/api/account/focus") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        focus?: { dim?: string; value?: string; label?: string } | null;
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const f = b.focus;
      let store: string | null = null;
      if (f && (f.dim === "hook" || f.dim === "length" || f.dim === "format") && typeof f.value === "string" && f.value) {
        store = JSON.stringify({ dim: f.dim, value: f.value, label: String(f.label ?? f.value) });
      }
      if (store === null) {
        await env.DB.prepare(`DELETE FROM individual_profile WHERE account_id = ? AND key = 'cycle_focus'`).bind(b.account).run();
        return json({ ok: true, focus: null });
      }
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
         VALUES (?, 'cycle_focus', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      ).bind(b.account, store).run();
      return json({ ok: true, focus: JSON.parse(store) });
    }
    // AIに「次の指針（フォーカスカード）」を提案させる（押すたびに新しい3案・Haiku）。
    if (req.method === "POST" && url.pathname === "/api/account/suggest-cards") {
      const b = (await req.json().catch(() => null)) as { account?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const claudeKey = (await resolveCreds(env, b.account))?.claudeKey;
      if (!claudeKey) return json({ ok: false, error: "Claude APIキーが未設定です" }, 400);
      // 型別の成績（平常比＝er_norm平均）
      let typeRows: Array<{ hook: string; n: number; score: number }> = [];
      try {
        const tr = await env.DB.prepare(
          `SELECT p.hook AS hook, COUNT(*) AS n, AVG(m.er_norm) AS score
             FROM posts p JOIN post_metrics m ON m.post_id = p.id
            WHERE p.account_id = ? AND p.status = 'posted' AND m.er_norm IS NOT NULL
              AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id)
            GROUP BY p.hook ORDER BY score DESC`
        ).bind(b.account).all<{ hook: string; n: number; score: number }>();
        typeRows = tr.results ?? [];
      } catch { typeRows = []; }
      // 使える型（おまかせ生成できる＝URL以外）：正典＋オリジナル型
      const customRows = await env.DB.prepare(`SELECT name FROM custom_types WHERE account_id = ?`).bind(b.account).all<{ name: string }>().catch(() => ({ results: [] as Array<{ name: string }> }));
      const availTypes = [...CATALOG_KEYS, ...(customRows.results ?? []).map((c) => "⭐ " + c.name)];
      const top = typeRows.filter((t) => t.n >= 2).slice(0, 5).map((t) => `${t.hook}（平常比${Math.round((t.score - 1) * 100)}%・${t.n}本）`).join("、") || "（まだ十分なデータなし）";
      const bottom = typeRows.filter((t) => t.n >= 2).slice(-3).map((t) => `${t.hook}（平常比${Math.round((t.score - 1) * 100)}%）`).join("、");
      const SUG_SCHEMA = {
        type: "object", additionalProperties: false,
        properties: { cards: { type: "array", items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, dim: { type: "string" }, value: { type: "string" } }, required: ["text", "dim", "value"] } } },
        required: ["cards"],
      };
      try {
        const { text, usage } = await callClaude({
          apiKey: claudeKey, model: "claude-haiku-4-5", noEffort: true, thinkingMode: "disabled", maxTokens: 600, schema: SUG_SCHEMA,
          system: [{ text: "あなたはX投稿の分析から『次に試す指針』を提案するアシスタント。提案は必ず会員が実行できる形（型/長さ/形式）に落とす。前向きで具体的に。" }],
          userText:
            `# データ\n効いている型：${top}\n伸び悩み：${bottom || "（なし）"}\n\n` +
            `# 使える型名（hookのvalueはこの中から選ぶ）\n${availTypes.join("｜")}\n\n` +
            `次に試すと良い指針を3つ、毎回ちがう切り口で。各カード：text=一言の提案（なぜ良いか）、dim='hook'|'length'|'format'、value=(hookなら上の型名から1つ／lengthなら'長文'か'短文'／formatなら'連結'か'単発')。効く型を伸ばす案と、まだ試せていない型を試す案をバランスよく。`,
        });
        await logClaudeUsage(env, b.account, "claude-haiku-4-5", usage, "suggest_cards");
        const parsed = JSON.parse(text) as { cards?: Array<{ text?: string; dim?: string; value?: string }> };
        const cards = (parsed.cards ?? [])
          .map((c) => {
            const dim = c.dim, value = String(c.value ?? "");
            if (dim === "hook" && availTypes.includes(value)) return { tone: "tip", text: String(c.text ?? "").slice(0, 120), focus: { dim, value, label: `「${value}」を多めに` } };
            if (dim === "length" && (value === "長文" || value === "短文")) return { tone: "tip", text: String(c.text ?? "").slice(0, 120), focus: { dim, value, label: `${value}を多めに` } };
            if (dim === "format" && (value === "連結" || value === "単発")) return { tone: "tip", text: String(c.text ?? "").slice(0, 120), focus: { dim, value, label: value === "連結" ? "2ポスト連結を多めに" : "単発を多めに" } };
            return null;
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)
          .slice(0, 3);
        if (!cards.length) return json({ ok: false, error: "提案を作れませんでした。もう一度お試しください。" }, 200);
        return json({ ok: true, cards });
      } catch (e) {
        return json({ ok: false, error: `提案に失敗（${e instanceof Error ? e.message.slice(0, 80) : ""}）` }, 200);
      }
    }

    // ── オリジナルの型を開発する ─────────────────────────────────────────
    // 型の「プロンプト」はAIが作る（会員は手書きしない）。voice非依存＝構造・切り口だけ。
    // 型開発system（運営資産）は本部Hubのパックから取得する（このコードには持たない）。
    const TYPE_PROMPT_SCHEMA = {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" }, prompt: { type: "string" }, change_summary: { type: "string" } },
      required: ["name", "prompt"],
    };
    // ① AIに型のプロンプト＋名前を作らせる（初回／追加指示で作り直し）。
    if (req.method === "POST" && url.pathname === "/api/types/draft-prompt") {
      const b = (await req.json().catch(() => null)) as {
        account?: string; mode?: string; text?: string; current_prompt?: string; feedback?: string; examples?: string[];
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const text = String(b.text ?? "").trim().slice(0, 4000);
      if (!text && !b.current_prompt) return json({ ok: false, error: "イメージ、または参考ポストを入れてください。" }, 400);
      const claudeKey = (await resolveCreds(env, b.account))?.claudeKey;
      if (!claudeKey) return json({ ok: false, error: "Claude APIキーが未設定です" }, 400);
      const pack = await refreshPrompts(env);
      if (!pack) return json({ ok: false, error: "本部からプロンプトを取得できませんでした。少し待って、もう一度お試しください。" }, 200);
      let userText =
        b.mode === "sample"
          ? `# 参考にするポスト\n${text}\n\n上の"構造"を抽出して、再利用できる型のプロンプトと短い名前を作る。`
          : `# 型のイメージ・参考ポスト\n${text || "（指定なし）"}\n\n上は「作りたい型のイメージ（こんな型がほしい、という説明）」か「参考にしたいポスト」のどちらか、または両方。内容から判断して、再利用できる型のプロンプトと短い名前を作る。参考ポストが含まれている場合は、その"構造"（書き方・流れ・トーン）を抽出して再利用できる形にする（中身そのものはコピーしない）。`;
      if (b.current_prompt) userText += `\n\n# いまのプロンプト（これを改善する）\n${b.current_prompt}\n# 追加の指示\n${String(b.feedback ?? "").slice(0, 2000)}\n# 出力の追加要件\n改善した場合は change_summary に「改善前との違い」を日本語30字程度で一言だけ（例：『言い切りを強め、締めに余白を追加』）。変えていなければ空文字。`;
      if (Array.isArray(b.examples) && b.examples.length) {
        userText += `\n\n# トレーニングで採用された投稿例（この型がこういう"構造"の投稿を生むよう、プロンプトを改善する。中身ではなく書き方の傾向を取り込む）\n${b.examples.slice(0, 12).join("\n---\n").slice(0, 6000)}`;
      }
      // 学習データを踏まえる：発信の方向性／効いている切り口／過去投稿（＝アップロードしたデータ）。
      // ※ voice-agnostic維持：文体・語尾はコピーしない。あくまで「この人にフィットする型か」の判断材料。
      try {
        const cr = await env.DB.prepare(
          `SELECT key, content FROM corpus WHERE account_id = ? AND key IN ('direction','winning_patterns','voice_samples')`
        ).bind(b.account).all<{ key: string; content: string }>().catch(() => ({ results: [] as Array<{ key: string; content: string }> }));
        const cmap: Record<string, string> = {};
        for (const r of cr.results ?? []) cmap[r.key] = r.content;
        const hookRow = await env.DB.prepare(
          `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'hook_affinity'`
        ).bind(b.account).first<{ v: string }>().catch(() => null);
        let learned = "";
        if (cmap.direction?.trim()) learned += `\n\n# この人の発信の方向性（何を・誰に・どんなスタンスで）\n${cmap.direction.slice(0, 800)}`;
        if (hookRow?.v) {
          try {
            const ha = JSON.parse(hookRow.v) as unknown[];
            const names = Array.isArray(ha) ? ha.map((x) => (typeof x === "string" ? x : ((x as { hook?: string; name?: string })?.hook ?? (x as { name?: string })?.name ?? ""))).filter(Boolean) : [];
            if (names.length) learned += `\n\n# この人に効いている切り口/型（成績上位・型の方向性の参考）\n${names.slice(0, 8).join(" / ")}`;
          } catch { /* 形が違えば無視 */ }
        }
        if (cmap.winning_patterns?.trim()) learned += `\n\n# 効いている書き方の傾向\n${cmap.winning_patterns.slice(0, 600)}`;
        if (cmap.voice_samples?.trim()) learned += `\n\n# この人の過去投稿（アップロード済み。扱うテーマ・話題・切り口の参考。文体や語尾はコピーしない＝型は構造だけ）\n${cmap.voice_samples.slice(0, 2000)}`;
        if (learned) userText += learned + `\n\n# 使い方\n上の学習データは「この人に本当にフィットする型か・どの切り口が効くか」を見極める材料。型のプロンプトは voice-agnostic（構造・切り口・流れだけ／特定の文体や語尾は書かない）で出力する。`;
      } catch { /* 学習データが取れなくても型ドラフトは続行 */ }
      try {
        const { text: out, usage } = await callClaude({
          apiKey: claudeKey, model: env.GEN_MODEL, effort: "medium", schema: TYPE_PROMPT_SCHEMA,
          system: [{ text: pack.type_dev_system, cache: true }], userText, stream: true,
        });
        await logClaudeUsage(env, b.account, env.GEN_MODEL || "claude-opus-4-8", usage, "type_prompt");
        const parsed = JSON.parse(out) as { name?: string; prompt?: string; change_summary?: string };
        if (!parsed?.prompt) return json({ ok: false, error: "型を作れませんでした。もう一度お試しください。" }, 200);
        return json({ ok: true, name: String(parsed.name ?? "オリジナルの型").slice(0, 40), prompt: String(parsed.prompt).slice(0, 1200), change_summary: String(parsed.change_summary ?? "").slice(0, 120) });
      } catch (e) {
        return json({ ok: false, error: `型の生成に失敗（${e instanceof Error ? e.message.slice(0, 100) : ""}）` }, 200);
      }
    }
    // ② トレーニング：この型のプロンプトで5本作る（DBには入れず返すだけ。添削/追加指示で再生成）。
    if (req.method === "POST" && url.pathname === "/api/types/train") {
      const b = (await req.json().catch(() => null)) as {
        account?: string; prompt?: string; pattern?: string; feedback?: string; examples?: string[]; reject?: string[]; avoid?: string[];
      } | null;
      if (!b?.account || !b.prompt) return json({ error: "account と prompt は必須" }, 400);
      const trainPat = b.pattern && PATTERNS[b.pattern] ? b.pattern : undefined;
      let instr = trainPat === "url" ? await urlSampleInstr(env, b.account, b.prompt) : b.prompt;
      if (b.feedback && b.feedback.trim()) instr += `\n# 追加指示\n${b.feedback.trim().slice(0, 2000)}`;
      if (Array.isArray(b.examples) && b.examples.length) instr += `\n# 理想に近い例（この方向で書く）\n${b.examples.slice(0, 5).join("\n---\n").slice(0, 4000)}`;
      // イマイチ評価（★1〜4）＝避ける方向。似せない・繰り返さないための負のフィードバック（トレーニング中に学習が進む）。
      if (Array.isArray(b.reject) && b.reject.length) instr += `\n# 避けたい例（この切り口・トーン・言い回しは低評価だった。似せない・別の方向で書く）\n${b.reject.slice(0, 8).join("\n---\n").slice(0, 3000)}`;
      // 既出サンプル＝ネタ被り防止に渡す（postsに未保存のため明示）。件数・長さは安全のため制限。
      const avoidList = Array.isArray(b.avoid)
        ? b.avoid.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 60).map((x) => x.slice(0, 400))
        : [];
      try {
        const account = await loadAccount(env, b.account);
        if (!account) return json({ ok: false, error: "アカウントが見つかりません。" }, 404);
        const drafts = await generateDrafts(env, account, 5, instr, undefined, avoidList, trainPat ? { pattern: trainPat } : undefined);
        return json({ ok: true, drafts });
      } catch (e) {
        return json({ ok: false, error: `生成に失敗（${e instanceof Error ? e.message.slice(0, 100) : ""}）` }, 200);
      }
    }
    // ③ 採用：型を保存（新規）／更新（id指定＝既存の型を編集・再トレーニング）。
    //    トレーニングで作ったポストを下書きに残すかは任意（keep_posts）。
    if (req.method === "POST" && url.pathname === "/api/types/save") {
      const b = (await req.json().catch(() => null)) as {
        account?: string; id?: number; name?: string; prompt?: string; origin?: string; pattern?: string; image_type?: string;
        keep_posts?: Array<{ body?: string; reply_text?: string }>;
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      // 型名は「型の管理」のonclick/onchange引数に出るため、XSSになりうる文字（引用符・山括弧・バックスラッシュ・制御文字）を除去。日本語はそのまま。
      const name = String(b.name ?? "").replace(/["'<>\\\x00-\x1f]/g, "").trim().slice(0, 40);
      const prompt = String(b.prompt ?? "").trim().slice(0, 1200);
      if (!name || !prompt) return json({ ok: false, error: "名前とプロンプトが必要です。" }, 400);
      const pattern = b.pattern && PATTERNS[b.pattern] ? b.pattern : "single_short";
      const imageType = normImageType(b.image_type);
      const updated = !!b.id;
      if (b.id) {
        await env.DB.prepare(
          `UPDATE custom_types SET name = ?, prompt = ?, origin = ?, pattern = ?, image_type = ? WHERE id = ? AND account_id = ?`
        ).bind(name, prompt, String(b.origin ?? "").slice(0, 2000), pattern, imageType, b.id, b.account).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO custom_types (account_id, name, prompt, origin, pattern, image_type) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(b.account, name, prompt, String(b.origin ?? "").slice(0, 2000), pattern, imageType).run();
      }
      let kept = 0;
      if (Array.isArray(b.keep_posts)) {
        for (const p of b.keep_posts.slice(0, 10)) {
          const body = String(p?.body ?? "").trim();
          if (!body) continue;
          await env.DB.prepare(
            `INSERT INTO posts (account_id, platform, source, body, reply_text, hook, status, chars, line_breaks)
             VALUES (?, 'x', 'tool', ?, ?, ?, 'pending', ?, ?)`
          ).bind(b.account, body, p.reply_text ? String(p.reply_text) : null, `⭐ ${name}`, weightedLength(body), (body.match(/\n/g) ?? []).length).run();
          kept++;
        }
      }
      return json({ ok: true, kept, updated });
    }
    // 型の削除
    if (req.method === "POST" && url.pathname === "/api/types/delete") {
      const b = (await req.json().catch(() => null)) as { account?: string; id?: number } | null;
      if (!b?.account || !b.id) return json({ error: "account と id は必須" }, 400);
      await env.DB.prepare(`DELETE FROM custom_types WHERE id = ? AND account_id = ?`).bind(b.id, b.account).run();
      return json({ ok: true });
    }
    // 型の一覧
    if (req.method === "GET" && url.pathname === "/api/types/list") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const r = await env.DB.prepare(
        `SELECT id, name, prompt, origin, COALESCE(shared, 1) AS shared, COALESCE(pattern,'single_short') AS pattern, COALESCE(image_type,'standard') AS image_type, created_at FROM custom_types WHERE account_id = ? ORDER BY created_at DESC`
      ).bind(acc).all().catch(() => ({ results: [] as unknown[] }));
      return json({ types: r.results ?? [] });
    }
    // 型ポートフォリオ：自作の型＋標準型を返す（採用on/off ＋ 優先度つき）。「型の管理」で使う。
    if (req.method === "GET" && url.pathname === "/api/types/portfolio") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const cr = await env.DB.prepare(
        `SELECT id, name, prompt, origin, COALESCE(pattern,'single_short') AS pattern, COALESCE(image_type,'standard') AS image_type, created_at FROM custom_types WHERE account_id = ? ORDER BY created_at DESC`
      ).bind(acc).all<{ id: number; name: string; prompt: string; origin: string | null; pattern: string; image_type: string }>().catch(() => ({ results: [] }));
      const pr4 = await env.DB.prepare(
        `SELECT key, value_json AS v FROM individual_profile WHERE account_id = ? AND key IN ('type_priority','type_state')`
      ).bind(acc).all<{ key: string; v: string }>().catch(() => ({ results: [] }));
      let pri: Record<string, string> = {}; let st: Record<string, string> = {};
      for (const r of pr4.results ?? []) {
        try { const o = JSON.parse(r.v); if (r.key === "type_priority" && o && typeof o === "object") pri = o; if (r.key === "type_state" && o && typeof o === "object") st = o; } catch { /* 空 */ }
      }
      const premium = await isPremium(env, acc); // 長文＝Premium限定
      const urlOn = await isUrlUnlocked(env, acc); // URL誘導＝解放制
      const cardOn = ((await loadCardTheme(env, acc))?.on === true); // 画像カードON＝画像付きの型を解放
      const defaults = premium ? DEFAULT_ON : DEFAULT_ON_FREE;
      const isOn = (k: string, def: boolean) => (st[k] ? st[k] === "on" : def);
      // 実際に投稿した件数（型別）と、学習スコア（平常比）。型管理で「データに基づく判断」ができるように。
      const pc = await env.DB.prepare(`SELECT hook, COUNT(*) AS n FROM posts WHERE account_id = ? AND status = 'posted' AND hook IS NOT NULL GROUP BY hook`).bind(acc).all<{ hook: string; n: number }>().catch(() => ({ results: [] as Array<{ hook: string; n: number }> }));
      const postCount: Record<string, number> = {}; for (const r of pc.results ?? []) postCount[r.hook] = r.n;
      const aff: Record<string, { median: number; n: number }> = {}; let urlAff: Record<string, { median: number; n: number }> = {};
      try {
        const ar = await env.DB.prepare(`SELECT key, value_json AS v FROM individual_profile WHERE account_id = ? AND key IN ('hook_affinity','url_affinity')`).bind(acc).all<{ key: string; v: string }>();
        for (const r of ar.results ?? []) {
          try {
            if (r.key === "hook_affinity") { const arr = JSON.parse(r.v); if (Array.isArray(arr)) for (const x of arr) if (x && x.key) aff[x.key] = { median: x.median, n: x.n }; }
            else if (r.key === "url_affinity") { urlAff = JSON.parse(r.v) || {}; }
          } catch { /* 空 */ }
        }
      } catch { /* 未学習 */ }
      const scoreFrom = (s?: { median: number; n: number }) => ({ score: s ? s.median : null, score_n: s ? s.n : 0 });
      const stdStat = (key: string, hook: string, isUrl: boolean) => ({ posts: postCount[key] ?? 0, ...scoreFrom(isUrl ? urlAff[hook] : aff[key]) });
      const cusStat = (ck: string, isUrl: boolean) => ({ posts: postCount[ck] ?? 0, ...scoreFrom(isUrl ? urlAff[ck] : aff[ck]) });
      const standard = CATALOG
        .filter((c) => premium || !c.long) // 非Premiumには長文カタログを出さない
        .filter((c) => urlOn || c.pattern !== "url") // 未解放にはURL誘導カタログを出さない
        .filter((c) => cardOn || !PATTERNS[c.pattern]?.image) // 画像カードOFFには画像付きカタログを出さない
        .map((c) => ({
          name: c.name, key: c.key, kind: c.kind, pattern: c.pattern, pattern_label: PATTERNS[c.pattern]?.label || "", source: "standard",
          priority: pri[c.key] || "normal", on: isOn(c.key, defaults.includes(c.key)), core: defaults.includes(c.key),
          desc: metaOf(c.key).instruction || TYPE_INSTRUCTIONS[c.hook] || "",
          ...stdStat(c.key, c.hook, c.pattern === "url"),
        }));
      const custom = (cr.results ?? []).map((c) => ({ id: c.id, name: c.name, prompt: c.prompt, origin: c.origin, pattern: c.pattern, image_type: c.image_type, source: "custom", priority: pri["⭐ " + c.name] || "normal", on: isOn("⭐ " + c.name, true), ...cusStat("⭐ " + c.name, c.pattern === "url") }));
      const active = standard.filter((t) => t.on).length + custom.filter((t) => t.on).length;
      // 自動不採用の設定と、自動で不採用にした型の一覧（不採用リスト）。
      let autoDemote = false; let autoUnadopted: unknown[] = [];
      try { const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'auto_demote'`).bind(acc).first<{ v: string }>(); autoDemote = r?.v === "1" || r?.v === "true"; } catch { /* 既定OFF */ }
      try { const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'auto_unadopted'`).bind(acc).first<{ v: string }>(); const a = r?.v ? JSON.parse(r.v) : []; if (Array.isArray(a)) autoUnadopted = a; } catch { /* 空 */ }
      let learnBasis = "organic"; let promotedCount = 0;
      try { const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'learn_basis'`).bind(acc).first<{ v: string }>(); if (r?.v === "promo" || r?.v === '"promo"') learnBasis = "promo"; } catch { /* 既定organic */ }
      try { const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND promoted = 1`).bind(acc).first<{ n: number }>(); promotedCount = r?.n ?? 0; } catch { /* 0 */ }
      return json({ ok: true, custom, standard, active, min_active: 10, premium, auto_demote: autoDemote, auto_unadopted: autoUnadopted, learn_basis: learnBasis, promoted_count: promotedCount });
    }
    // 学習基準トグル：organic（オーガニックの反応率優先・既定）/ promo（広告の反応率優先）。
    // アカウント単位の“軸足の宣言”。型選択は優先側0.6＋非優先側0.4でブレンド（cycle.ts）。
    if (req.method === "POST" && url.pathname === "/api/account/learn-basis") {
      const b = (await req.json().catch(() => null)) as { account?: string; basis?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const basis = b.basis === "promo" ? "promo" : "organic";
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'learn_basis', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      ).bind(b.account, basis).run();
      return json({ ok: true, basis });
    }
    // 投稿に「広告に使った」手動マークを付け外し（APIで自動検出できない別広告アカウント出稿の保険）。
    // 自動判別（promoted_metrics観測）とは独立で、どちらか一方でも1なら広告扱い。手動offは自動判別を消さない。
    if (req.method === "POST" && url.pathname === "/api/post/promoted") {
      const b = (await req.json().catch(() => null)) as { account?: string; post_id?: number; on?: boolean } | null;
      if (!b?.account || !b.post_id) return json({ error: "account と post_id は必須" }, 400);
      await env.DB.prepare(`UPDATE posts SET promoted = ? WHERE id = ? AND account_id = ?`)
        .bind(b.on ? 1 : 0, b.post_id, b.account).run();
      return json({ ok: true, on: !!b.on });
    }
    // 「スコアが低い型は自動で不採用にする」のON/OFFを保存。
    if (req.method === "POST" && url.pathname === "/api/account/auto-demote") {
      const b = (await req.json().catch(() => null)) as { account?: string; on?: boolean } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'auto_demote', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      ).bind(b.account, b.on ? "1" : "0").run();
      return json({ ok: true, on: !!b.on });
    }
    // 不採用リストから再採用：採用ONに戻し、以後の自動不採用から保護（ピン）＋不採用リストから外す。
    if (req.method === "POST" && url.pathname === "/api/account/readopt") {
      const b = (await req.json().catch(() => null)) as { account?: string; key?: string } | null;
      if (!b?.account || !b.key) return json({ error: "account と key は必須" }, 400);
      const key = String(b.key).slice(0, 120);
      const readJson = async (k: string) => { try { const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = ?`).bind(b.account, k).first<{ v: string }>(); return r?.v ? JSON.parse(r.v) : null; } catch { return null; } };
      const st = (await readJson("type_state")) || {}; const keep = (await readJson("auto_keep")) || {};
      let un = (await readJson("auto_unadopted")) || []; if (!Array.isArray(un)) un = [];
      st[key] = "on"; keep[key] = true; un = un.filter((d: { key?: string }) => d.key !== key);
      const save = async (k: string, val: unknown) => env.DB.prepare(`INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`).bind(b.account, k, JSON.stringify(val)).run();
      await save("type_state", st); await save("auto_keep", keep); await save("auto_unadopted", un);
      return json({ ok: true });
    }
    // 画像カードのテーマ取得（プリセット一覧つき）。
    if (req.method === "GET" && url.pathname === "/api/account/card-theme") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const saved = await loadCardTheme(env, acc);
      const theme = saved || { ...presetTheme("midnight"), on: false, handle: "" };
      return json({ ok: true, theme, presets: CARD_PRESETS, fonts: CARD_FONTS });
    }
    // 画像カードのテーマ保存。
    if (req.method === "POST" && url.pathname === "/api/account/card-theme") {
      const b = (await req.json().catch(() => null)) as (Partial<CardTheme> & { account?: string }) | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const hex = (s: unknown, def: string) => (typeof s === "string" && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : def);
      const clampInt = (v: unknown, min: number, max: number, def: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
      const cur = (await loadCardTheme(env, b.account)) || presetTheme("midnight");
      const theme: CardTheme = {
        on: typeof b.on === "boolean" ? b.on : !!cur.on,
        preset: typeof b.preset === "string" ? b.preset.slice(0, 24) : cur.preset,
        bg: hex(b.bg, cur.bg), fg: hex(b.fg, cur.fg), accent: hex(b.accent, cur.accent),
        weight: b.weight === "regular" ? "regular" : "bold",
        font: typeof b.font === "string" && CARD_FONTS.some((f) => f.id === b.font) ? b.font : (cur.font || "sans"),
        handle: typeof b.handle === "string" ? b.handle.slice(0, 40) : (cur.handle || ""),
        fontSize: clampInt(b.fontSize, 28, 80, cur.fontSize ?? 48),
        logoSize: clampInt(b.logoSize, 32, 180, cur.logoSize ?? 64),
        logoKey: typeof b.logoKey === "string" ? b.logoKey.slice(0, 200) : cur.logoKey,
        bgKey: typeof b.bgKey === "string" ? (b.bgKey || undefined) : cur.bgKey,
      };
      await env.DB.prepare(`INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'card_theme', ?, datetime('now')) ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`).bind(b.account, JSON.stringify(theme)).run();
      return json({ ok: true, theme });
    }
    // 画像カード用の画像アップロード（ロゴ/背景）。raw body＝画像バイト、?account=&kind=logo|bg。
    if (req.method === "POST" && url.pathname === "/api/account/card-upload") {
      if (!env.MEDIA) return json({ ok: false, error: "画像保存が未設定です。" }, 200);
      const acc = url.searchParams.get("account"); const kind = url.searchParams.get("kind") === "bg" ? "bg" : "logo";
      if (!acc) return json({ error: "account は必須" }, 400);
      const ct = req.headers.get("content-type") || "image/png";
      const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
      const buf = await req.arrayBuffer();
      if (buf.byteLength === 0) return json({ ok: false, error: "画像が空です。" }, 200);
      if (buf.byteLength > 4 * 1024 * 1024) return json({ ok: false, error: "画像は4MBまでにしてください。" }, 200);
      const key = `cards/${acc}/${kind}.${ext}`;
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct } });
      return json({ ok: true, key });
    }
    // 画像カードのプレビュー（保存テーマ＋指定テキストでレンダ→data URIで返す）。
    if (req.method === "POST" && url.pathname === "/api/account/card-preview") {
      const b = (await req.json().catch(() => null)) as (Partial<CardTheme> & { account?: string; text?: string; variant?: number; imageType?: string; raw?: boolean }) | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const saved = (await loadCardTheme(env, b.account)) || presetTheme("midnight");
      // 未保存の編集中テーマをプレビューできるよう、来た項目で上書き。
      const theme: CardTheme = {
        ...saved,
        bg: b.bg || saved.bg, fg: b.fg || saved.fg, accent: b.accent || saved.accent,
        weight: b.weight || saved.weight, font: b.font || saved.font, handle: (b.handle != null ? b.handle : saved.handle),
        fontSize: b.fontSize != null ? Number(b.fontSize) : saved.fontSize,
        logoSize: b.logoSize != null ? Number(b.logoSize) : saved.logoSize,
        logoKey: b.logoKey !== undefined ? (b.logoKey || undefined) : saved.logoKey,
        bgKey: b.bgKey !== undefined ? (b.bgKey || undefined) : saved.bgKey,
      };
      const body = (b.text || "完璧主義って、ただの「完成させない言い訳」だったりする。本当に必要なのは、出してから直す勇気の方。").slice(0, 400);
      const it = normImageType(b.imageType);
      let cardText = body;
      if (!b.raw) { try { cardText = await distillCardText(env, b.account, body, it); } catch { cardText = body.slice(0, it === "list" ? 80 : 35); } }
      try {
        const png = await renderCardPng(env, theme, cardText, it, Number(b.variant) || 0);
        let bin = ""; const u = png as Uint8Array;
        for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
        return json({ ok: true, png: `data:image/png;base64,${btoa(bin)}` });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message.slice(0, 120) : String(e) }, 200);
      }
    }
    // 型の優先度を保存（more / normal / less）。標準型は型名、自作型は「⭐名前」をキーに。
    if (req.method === "POST" && url.pathname === "/api/account/type-priority") {
      const b = (await req.json().catch(() => null)) as { account?: string; name?: string; level?: string } | null;
      if (!b?.account || !b.name) return json({ error: "account と name は必須" }, 400);
      const name = String(b.name).slice(0, 120);
      const level = b.level === "more" || b.level === "less" ? b.level : "normal";
      const prow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'type_priority'`
      ).bind(b.account).first<{ v: string }>().catch(() => null);
      let pri: Record<string, string> = {};
      try { const o = JSON.parse(prow?.v ?? "{}"); if (o && typeof o === "object") pri = o; } catch { /* 空 */ }
      if (level === "normal") delete pri[name]; else pri[name] = level;
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'type_priority', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      ).bind(b.account, JSON.stringify(pri)).run();
      return json({ ok: true, level });
    }
    // 型の採用ON/OFF（type_state で on/off を上書き）。採用合計が10未満になるOFFは拒否（探索の幅を必ず残す）。
    if (req.method === "POST" && url.pathname === "/api/account/type-onoff") {
      const b = (await req.json().catch(() => null)) as { account?: string; key?: string; on?: boolean } | null;
      if (!b?.account || !b.key) return json({ error: "account と key は必須" }, 400);
      const key = String(b.key).slice(0, 120);
      const premium = await isPremium(env, b.account); // 長文＝Premium限定
      const urlOn = await isUrlUnlocked(env, b.account); // URL誘導＝解放制
      const cardOn = ((await loadCardTheme(env, b.account))?.on === true); // 画像カード＝マスターON
      const isUrlKey = (k: string) => k.indexOf("##url") >= 0;
      const isImgKey = (k: string) => { const p = k.split("##")[1]; return !!PATTERNS[p]?.image; };
      // 非Premiumが長文型をONにしようとしたら拒否（XのPremium機能のため）。
      if (!premium && isLongType(key) && b.on !== false) {
        return json({ ok: false, error: "長文ポストはX Premium（有料）の機能です。設定でPremiumをONにすると使えます。", min_active: 10 }, 200);
      }
      // 未解放でURL誘導型をONにしようとしたら拒否。
      if (!urlOn && isUrlKey(key) && b.on !== false) {
        return json({ ok: false, error: "URL誘導ポストは設定で解放してから使えます。", min_active: 10 }, 200);
      }
      // 画像カードOFFで画像付き型をONにしようとしたら拒否。
      if (!cardOn && isImgKey(key) && b.on !== false) {
        return json({ ok: false, error: "画像付きの型は「画像カードの型」をONにしてから使えます。", min_active: 10 }, 200);
      }
      // 採用universe＝カタログ型(非Premiumは長文を除く・未解放はURL誘導/画像を除く) ＋ 自作型(⭐名前)。既定ON＝Premium別。自作は既定ON。
      const cr = await env.DB.prepare(`SELECT name FROM custom_types WHERE account_id = ?`).bind(b.account).all<{ name: string }>().catch(() => ({ results: [] }));
      const customHooks = (cr.results ?? []).map((c) => "⭐ " + c.name);
      const universe = [...CATALOG_KEYS.filter((k) => (premium || !isLongType(k)) && (urlOn || !isUrlKey(k)) && (cardOn || !isImgKey(k))), ...customHooks];
      const defaults = premium ? DEFAULT_ON : DEFAULT_ON_FREE;
      const defOn = (k: string) => (k.indexOf("⭐ ") === 0 ? true : defaults.includes(k));
      const prow = await env.DB.prepare(
        `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'type_state'`
      ).bind(b.account).first<{ v: string }>().catch(() => null);
      let st: Record<string, string> = {};
      try { const o = JSON.parse(prow?.v ?? "{}"); if (o && typeof o === "object") st = o; } catch { /* 空 */ }
      const activeCount = (state: Record<string, string>) => universe.filter((k) => (state[k] ? state[k] === "on" : defOn(k))).length;
      if (b.on === false) {
        const trial = { ...st, [key]: "off" };
        if (activeCount(trial) < 10) return json({ ok: false, error: "採用は10種類以上にしてください（最低10種は残します）。先に別の型を採用してから外してください。", active: activeCount(st), min_active: 10 }, 200);
        st[key] = "off";
      } else {
        st[key] = "on";
      }
      // 既定と一致する項目はマップから消して肥大化を防ぐ（on==既定 / off==既定）。
      for (const k of Object.keys(st)) { if ((st[k] === "on") === defOn(k)) delete st[k]; }
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'type_state', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      ).bind(b.account, JSON.stringify(st)).run();
      return json({ ok: true, active: activeCount(st), min_active: 10 });
    }
    // 型ごとの集合知共有のON/OFF（デフォルト共有・オプトアウト）。
    if (req.method === "POST" && url.pathname === "/api/types/share") {
      const b = (await req.json().catch(() => null)) as { account?: string; id?: number; shared?: boolean } | null;
      if (!b?.account || !b.id) return json({ error: "account と id は必須" }, 400);
      await env.DB.prepare(`UPDATE custom_types SET shared = ? WHERE id = ? AND account_id = ?`)
        .bind(b.shared === false ? 0 : 1, b.id, b.account).run();
      return json({ ok: true });
    }
    // 本部(HQ)と同期：全会員の型＋成績をpush → 効く型ライブラリをpull（手動トリガ／cronでも実行）。
    if (req.method === "POST" && url.pathname === "/api/hq/sync") {
      const r = await syncHonbu(env, CODE_VERSION);
      return json({ ok: true, ...r });
    }
    // ローカルにキャッシュした「みんなに効く型」ライブラリ（型の開発のおすすめ用）。accを渡すと導入済みか印を付ける。
    if (req.method === "GET" && url.pathname === "/api/hq/library") {
      const acc = url.searchParams.get("account");
      const lib = await env.DB.prepare(
        `SELECT type_key, name, prompt, format, score, member_count, sample_total, scores_json FROM hq_library ORDER BY score DESC LIMIT 200`
      ).all<{ type_key: string; name: string; prompt: string; format: string | null; score: number; member_count: number; sample_total: number; scores_json: string | null }>().catch(() => ({ results: [] as Array<{ type_key: string; name: string; prompt: string; format: string | null; score: number; member_count: number; sample_total: number; scores_json: string | null }> }));
      let mine = new Set<string>();
      if (acc) {
        try {
          const r = await env.DB.prepare(`SELECT name FROM custom_types WHERE account_id = ?`).bind(acc).all<{ name: string }>();
          mine = new Set((r.results ?? []).map((x) => x.name));
        } catch { /* 無ければ空 */ }
      }
      const items = (lib.results ?? []).map((x) => ({ ...x, mine: mine.has(x.name) }));
      return json({ ok: true, library: items });
    }
    // 自分が共有した型が「みんなの中でどう効いているか」を本部から取得（中継）。会員の貢献の見える化。
    if (req.method === "GET" && url.pathname === "/api/hq/my-types") {
      if (!env.HONBU_URL) return json({ ok: true, types: [] });
      const tok = (await getConfig(env, "honbu_token")) || env.HONBU_TOKEN || null;
      if (!tok) return json({ ok: true, types: [] });
      try {
        const r = await fetch(`${env.HONBU_URL}/hq/my-types`, { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok) return json({ ok: true, types: [] });
        const d = (await r.json()) as { types?: unknown[] };
        return json({ ok: true, types: d.types ?? [] });
      } catch {
        return json({ ok: true, types: [] });
      }
    }
    // 本部からのお知らせ（ローカルキャッシュ）。ダッシュボードで表示。
    if (req.method === "GET" && url.pathname === "/api/hq/announcements") {
      const r = await env.DB.prepare(
        `SELECT id, title, body, created_at FROM hq_broadcasts ORDER BY created_at DESC LIMIT 5`
      ).all().catch(() => ({ results: [] as unknown[] }));
      return json({ ok: true, announcements: r.results ?? [] });
    }
    // チュートリアル完了
    if (req.method === "POST" && url.pathname === "/api/account/finish-onboarding") {
      const b = (await req.json().catch(() => null)) as { account?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      await env.DB.prepare(`UPDATE accounts SET onboarded = 1 WHERE id = ?`).bind(b.account).run();
      return json({ ok: true });
    }
    // X連携：会員がUIから4つの鍵を入れる → 暗号化してD1保存 → 接続確認（投稿せず読み取りのみ）
    if (req.method === "POST" && url.pathname === "/api/account/connect") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        x?: { apiKey?: string; apiSecret?: string; accessToken?: string; accessSecret?: string };
        claudeKey?: string;
        email?: string;
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const x = b.x || {};
      if (!x.apiKey || !x.apiSecret || !x.accessToken || !x.accessSecret) {
        return json({ error: "Xの4つの鍵（API Key / API Key Secret / Access Token / Access Token Secret）がすべて必要です" }, 400);
      }
      if (!b.claudeKey || !b.claudeKey.trim()) {
        return json({ error: "Claude APIキーが必要です（AIの文章生成に使います）" }, 400);
      }
      // メール：連携画面に入力欄は無い（1.17）。ゲート通過時に本部から引き継ぐのが基本経路で、
      //   未保存なら本部/hq/meから取得を試す。それでも無ければ連携は止めない（周知メールは本部が
      //   members.email宛に送る＝本部側にあれば会員に届く。ローカルは設定画面の表示用）。
      const existingEmail = await getConfig(env, "member_email");
      const emailIn = String(b.email ?? "").trim();
      if (emailIn) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailIn) || emailIn.length > 254) {
          return json({ error: "メールアドレスを正しい形式で入力してください。" }, 400);
        }
        await setConfig(env, "member_email", emailIn);
      } else if (!existingEmail) {
        const hqEmail = await fetchHonbuEmail(env);
        if (hqEmail) await setConfig(env, "member_email", hqEmail);
      }
      const xc: XCreds = {
        apiKey: x.apiKey.trim(),
        apiSecret: x.apiSecret.trim(),
        accessToken: x.accessToken.trim(),
        accessSecret: x.accessSecret.trim(),
      };
      const creds: AccountCreds = { x: xc, claudeKey: b.claudeKey.trim() };
      // アカウントが無ければ作る（既定：手動承認・有効）
      await env.DB.prepare(
        `INSERT INTO accounts (id, platforms, active) VALUES (?, '["x"]', 1) ON CONFLICT(id) DO NOTHING`
      )
        .bind(b.account)
        .run();
      await saveCreds(env, b.account, creds);
      // 接続確認：X と Claude を別々に検証し、どちらで失敗したか返す（鍵は保存済み）。
      let xOk = false, xError = "", handle: string | null = null, followers: number | null = null, learned = 0;
      let me: Awaited<ReturnType<typeof fetchAccountMetrics>> | null = null;
      try {
        me = await fetchAccountMetrics(xc);
        xOk = true;
        handle = me.username ?? null;
        followers = me.followers ?? null;
        if (me.username) await env.DB.prepare(`UPDATE accounts SET handle = ? WHERE id = ?`).bind(me.username, b.account).run();
        await env.DB.prepare(
          `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
           VALUES (?, 'x_premium', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
        ).bind(b.account, me.verifiedType === "blue" ? "1" : "0").run();
      } catch (e) {
        xError = `X APIの接続に失敗しました：${e instanceof Error ? e.message.slice(0, 140) : String(e)}（4つの鍵の打ち間違い、または権限が Read and Write になっているか確認してください）`;
      }
      // Claudeキーの検証（トークン消費なし）。
      const ck = await verifyClaudeKey(b.claudeKey.trim());
      const claudeOk = ck.ok;
      const claudeError = ck.ok ? "" : (ck.error ?? "Claude APIキーを確認してください");
      // 過去投稿の自動学習（Xがok かつ voice未取得のときだけ）。
      if (xOk && me && me.id) {
        const existing = await env.DB.prepare(`SELECT 1 FROM corpus WHERE account_id = ? AND key = 'voice_samples'`).bind(b.account).first();
        if (!existing) {
          try {
            const tweets = await fetchRecentTweets(xc, me.id, 100);
            if (tweets.length) {
              await env.DB.prepare(
                `INSERT INTO corpus (account_id, key, content, updated_at) VALUES (?, 'voice_samples', ?, datetime('now'))
                 ON CONFLICT(account_id, key) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
              ).bind(b.account, tweets.join("\n\n")).run();
              learned = tweets.length;
              await setCount(env, b.account, "voice_posts", tweets.length);
              await logUsage(env, b.account, "learn_read", tweets.length);
            }
          } catch (le) {
            console.error(`[${b.account}] 過去投稿の自動学習に失敗: ${le instanceof Error ? le.message : le}`);
          }
        }
      }
      return json({
        ok: true,
        connected: xOk && claudeOk, // 両方OKで連携成立
        x_ok: xOk, x_error: xError,
        claude_ok: claudeOk, claude_error: claudeError,
        handle, followers, learned,
      });
    }
    // 見送り：承認待ち(pending)の下書きをボツ(rejected)に
    const rejectMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/reject$/);
    if (req.method === "POST" && rejectMatch) {
      const r = await env.DB.prepare(
        `UPDATE posts SET status = 'rejected' WHERE id = ? AND status = 'pending'`
      )
        .bind(rejectMatch[1])
        .run();
      if ((r.meta.changes ?? 0) === 0) {
        return json({ error: "該当する承認待ちポストがありません" }, 404);
      }
      return json({ rejected: Number(rejectMatch[1]) });
    }
    // 予約済みの削除（キューから外す＝rejected）
    const delMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/delete$/);
    if (req.method === "POST" && delMatch) {
      const r = await env.DB.prepare(
        `UPDATE posts SET status = 'rejected' WHERE id = ? AND status IN ('queued','failed')`
      )
        .bind(delMatch[1])
        .run();
      if ((r.meta.changes ?? 0) === 0) return json({ error: "該当する予約ポストがありません" }, 404);
      return json({ ok: true, deleted: Number(delMatch[1]) });
    }
    // 予約済み→下書き（承認待ち）に戻す。予約時刻はクリア。
    const toDraftMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/to-draft$/);
    if (req.method === "POST" && toDraftMatch) {
      const r = await env.DB.prepare(
        `UPDATE posts SET status = 'pending', not_before = NULL WHERE id = ? AND status = 'queued'`
      )
        .bind(toDraftMatch[1])
        .run();
      if ((r.meta.changes ?? 0) === 0) return json({ error: "該当する予約ポストがありません" }, 404);
      return json({ ok: true, to_draft: Number(toDraftMatch[1]) });
    }
    // （不採用→採用は edit-approve で「添削して昇格」に一本化。as-is採用は廃止）
    // 予約済みポストの本文を直接編集（status=queuedのまま・予約時刻は維持）
    const editBodyMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/edit-body$/);
    if (req.method === "POST" && editBodyMatch) {
      const b = (await req.json().catch(() => null)) as { body?: string; reply_text?: string } | null;
      const newBody = (b?.body ?? "").trim();
      if (!newBody) return json({ error: "本文が空です" }, 400);
      const id = Number(editBodyMatch[1]);
      const post = await env.DB.prepare(
        `SELECT account_id FROM posts WHERE id = ? AND status = 'queued'`
      )
        .bind(id)
        .first<{ account_id: string }>();
      if (!post) return json({ error: "該当する予約ポストがありません" }, 404);
      const limit = charLimitWeighted(await isPremium(env, post.account_id));
      if (weightedLength(newBody) > limit) {
        return json({ ok: false, error: `${Math.floor(limit / 2)}文字以内にしてください（Xの上限）` }, 400);
      }
      // 2本目（連結リプ）。送られて来た時だけ更新（未指定はCOALESCEで既存を保持）。
      const newReply = typeof b?.reply_text === "string" ? ((b.reply_text as string).trim() || null) : null;
      if (newReply && weightedLength(newReply) > limit) {
        return json({ ok: false, error: `2本目も${Math.floor(limit / 2)}文字以内にしてください（Xの上限）` }, 400);
      }
      await env.DB.prepare(
        `UPDATE posts SET body = ?, reply_text = COALESCE(?, reply_text), source = 'manual', chars = ?, line_breaks = ? WHERE id = ?`
      )
        .bind(newBody, newReply, weightedLength(newBody), (newBody.match(/\n/g) ?? []).length, id)
        .run();
      return json({ ok: true, edited: id });
    }
    // 各ポストの投稿日時を変更。body.not_before = "YYYY-MM-DDTHH:MM"（JST想定）
    const schedMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/schedule$/);
    if (req.method === "POST" && schedMatch) {
      const b = (await req.json().catch(() => null)) as { not_before?: string } | null;
      const m = String(b?.not_before ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!m) return json({ error: "日時の形式が不正です" }, 400);
      const jstMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
      const slot = sqlUtc(jstMs - 9 * 3600_000); // JST→UTC
      const r = await env.DB.prepare(
        `UPDATE posts SET not_before = ? WHERE id = ? AND status = 'queued'`
      )
        .bind(slot, schedMatch[1])
        .run();
      if ((r.meta.changes ?? 0) === 0) return json({ error: "該当する予約ポストがありません" }, 404);
      return json({ ok: true, scheduled_at: slot });
    }
    // 順番入替：隣の予約ポストと投稿日時を入れ替える。body.dir = 'up' | 'down'
    const moveMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/move$/);
    if (req.method === "POST" && moveMatch) {
      const b = (await req.json().catch(() => null)) as { dir?: string } | null;
      const id = Number(moveMatch[1]);
      const cur = await env.DB.prepare(
        `SELECT account_id, not_before FROM posts WHERE id = ? AND status = 'queued'`
      )
        .bind(id)
        .first<{ account_id: string; not_before: string | null }>();
      if (!cur) return json({ error: "該当する予約ポストがありません" }, 404);
      const up = b?.dir === "up";
      // 自分より前(up)／後(down)で最も近い予約ポスト
      const neighbor = await env.DB.prepare(
        up
          ? `SELECT id, not_before FROM posts WHERE account_id = ? AND status = 'queued' AND id <> ?
               AND ((not_before < ?) OR (? IS NULL)) ORDER BY not_before DESC, id DESC LIMIT 1`
          : `SELECT id, not_before FROM posts WHERE account_id = ? AND status = 'queued' AND id <> ?
               AND (not_before > ?) ORDER BY not_before ASC, id ASC LIMIT 1`
      )
        .bind(cur.account_id, id, cur.not_before, cur.not_before)
        .first<{ id: number; not_before: string | null }>();
      if (!neighbor) return json({ ok: true, moved: false }); // 端
      // not_before を入れ替え
      await env.DB.prepare(`UPDATE posts SET not_before = ? WHERE id = ?`).bind(neighbor.not_before, id).run();
      await env.DB.prepare(`UPDATE posts SET not_before = ? WHERE id = ?`).bind(cur.not_before, neighbor.id).run();
      return json({ ok: true, moved: true });
    }
    // 基本配信時間の設定。body.slots = ["06:30",...]、daily_frequency で本数も更新、reflow=true で予約組み直し
    if (req.method === "POST" && url.pathname === "/api/account/slots") {
      const b = (await req.json().catch(() => null)) as { account?: string; slots?: string[]; daily_frequency?: number; reflow?: boolean } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      // 本数（1日の投稿本数）。時刻の数はこれに揃える。
      let freq = typeof b.daily_frequency === "number" ? Math.max(1, Math.min(5, Math.round(b.daily_frequency))) : 0;
      if (freq) {
        await env.DB.prepare(`UPDATE accounts SET daily_frequency = ? WHERE id = ?`).bind(freq, b.account).run();
      } else {
        const row = await env.DB.prepare(`SELECT daily_frequency FROM accounts WHERE id = ?`).bind(b.account).first<{ daily_frequency: number }>();
        freq = row?.daily_frequency ?? 3;
      }
      let slots = (Array.isArray(b.slots) ? b.slots : [])
        .map((s) => String(s).trim())
        .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
      if (!slots.length) return json({ error: "時刻を1つ以上（例 06:30）入れてください" }, 400);
      if (slots.length > freq) slots = slots.slice(0, freq); // 本数を超える時刻は持たない
      await env.DB.prepare(
        `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
         VALUES (?, 'post_slots', ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
      )
        .bind(b.account, JSON.stringify(slots))
        .run();
      if (b.reflow) await reflowQueue(env, b.account);
      return json({ ok: true, slots });
    }
    // 承認待ち一覧（承認モードの会員が捌くため）
    if (req.method === "GET" && url.pathname === "/api/pending") {
      const acc = url.searchParams.get("account");
      if (!acc) return json({ error: "?account=ID が必要" }, 400);
      const rows = await env.DB.prepare(
        `SELECT id, body, reply_text, hook, created_at FROM posts
         WHERE account_id = ? AND status = 'pending' ORDER BY id`
      )
        .bind(acc)
        .all();
      return json({ pending: rows.results });
    }
    // Xから過去投稿を自動学習：本人の最近の投稿（RT・リプ除外）を取得→voice_samplesに保存（手本）。
    if (req.method === "POST" && url.pathname === "/api/account/learn-posts") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        count?: number;
      } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const creds = await xCreds(env, b.account);
      if (!creds) return json({ error: `${b.account} はX連携が未設定です` }, 400);
      const count = Math.max(5, Math.min(500, b.count ?? 100));
      try {
        const me = await fetchAccountMetrics(creds);
        if (!me.id) return json({ error: "ユーザーIDを取得できませんでした" }, 500);
        const tweets = await fetchRecentTweets(creds, me.id, count);
        if (!tweets.length) {
          return json({ ok: true, learned: 0, note: "取得できる投稿がありませんでした" });
        }
        const content = tweets.join("\n\n");
        await env.DB.prepare(
          `INSERT INTO corpus (account_id, key, content, updated_at)
           VALUES (?, 'voice_samples', ?, datetime('now'))
           ON CONFLICT(account_id, key) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
        )
          .bind(b.account, content)
          .run();
        await setCount(env, b.account, "voice_posts", tweets.length); // 学習した過去投稿数
        await logUsage(env, b.account, "learn_read", tweets.length); // 過去ポスト学習＝X読み取り（料金の目安）
        return json({ ok: true, learned: tweets.length, bytes: content.length });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    // 学習データ（corpus）アップロード：voice_samples / neta_pool / winning_patterns 等
    // PUT /api/corpus?account=ID&key=KEY  body＝本文（生テキストでOK・ファイルもそのまま投げられる）
    if (req.method === "PUT" && url.pathname === "/api/corpus") {
      const account = url.searchParams.get("account");
      const key = url.searchParams.get("key");
      if (!account || !key) return json({ error: "?account=ID&key=KEY が必要" }, 400);
      const content = await req.text();
      if (!content.trim()) return json({ error: "本文が空" }, 400);
      await env.DB.prepare(
        `INSERT INTO corpus (account_id, key, content, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(account_id, key) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
      )
        .bind(account, key, content)
        .run();
      return json({ ok: true, account, key, bytes: content.length });
    }
    // corpus一覧（何が入っているか確認・中身は返さずキーとサイズだけ）
    if (req.method === "GET" && url.pathname === "/api/corpus") {
      const account = url.searchParams.get("account");
      if (!account) return json({ error: "?account=ID が必要" }, 400);
      const rows = await env.DB.prepare(
        `SELECT key, length(content) AS bytes, updated_at FROM corpus WHERE account_id = ? ORDER BY key`
      )
        .bind(account)
        .all();
      return json({ account, corpus: rows.results });
    }
    // ネタ元データのアップロード（txt/md。1ファイル最大500KB・最大50件）
    if (req.method === "POST" && url.pathname === "/api/neta/upload") {
      const b = (await req.json().catch(() => null)) as { account?: string; filename?: string; content?: string } | null;
      if (!b?.account) return json({ error: "account は必須" }, 400);
      const content = (b.content ?? "").trim();
      const filename = (b.filename ?? "uploaded.txt").slice(0, 120);
      if (!content) return json({ error: "中身が空です" }, 400);
      const bytes = new TextEncoder().encode(content).length;
      if (bytes > 512000) return json({ error: `「${filename}」は500KBを超えています（${Math.round(bytes / 1024)}KB）` }, 400);
      const cnt = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM neta_files WHERE account_id = ?`
      ).bind(b.account).first<{ n: number }>();
      if ((cnt?.n ?? 0) >= 50) return json({ error: "ネタ元データは最大50件までです（不要なものを削除してください）" }, 400);
      await env.DB.prepare(
        `INSERT INTO neta_files (account_id, filename, content, bytes) VALUES (?, ?, ?, ?)`
      ).bind(b.account, filename, content, bytes).run();
      return json({ ok: true, filename, bytes });
    }
    // ネタ元データ一覧（中身は返さずファイル名とサイズだけ）
    if (req.method === "GET" && url.pathname === "/api/neta/list") {
      const account = url.searchParams.get("account");
      if (!account) return json({ error: "?account=ID が必要" }, 400);
      const rows = await env.DB.prepare(
        `SELECT id, filename, bytes, created_at FROM neta_files WHERE account_id = ? ORDER BY created_at DESC`
      ).bind(account).all();
      return json({ account, files: rows.results });
    }
    // ネタ元データ削除
    if (req.method === "POST" && url.pathname === "/api/neta/delete") {
      const b = (await req.json().catch(() => null)) as { account?: string; id?: number } | null;
      if (!b?.account || !b?.id) return json({ error: "account と id が必要" }, 400);
      await env.DB.prepare(`DELETE FROM neta_files WHERE id = ? AND account_id = ?`).bind(b.id, b.account).run();
      return json({ ok: true, deleted: b.id });
    }
    // メトリクス＋リプ収集を手動で1回（テスト用）
    if (req.method === "POST" && url.pathname === "/api/collect-now") {
      const metrics = await collectMetrics(env);
      let replies: Array<{ account: string; newReplies: number }> = [];
      try {
        replies = await collectReplies(env);
      } catch (e) {
        console.error(`リプ収集失敗: ${e instanceof Error ? e.message : e}`);
      }
      return json({ ok: true, metrics, replies });
    }

    // AIに聞く（操作サポート）：会員のClaudeに仕様書(HELP_SPEC)を渡して質問へ回答。安いHaiku・料金は会員負担。
    // リファラル：自分の招待コード（1人1種類・有効回数つき・残り有効数つき）。無ければ本部が自動発行。
    if (req.method === "GET" && url.pathname === "/api/invites") {
      return json(await listMyInvites(env));
    }

    if (req.method === "POST" && url.pathname === "/api/help-ask") {
      const b = (await req.json().catch(() => null)) as {
        account?: string;
        question?: string;
        history?: { role?: string; content?: string }[];
      } | null;
      const q = String(b?.question ?? "").trim().slice(0, 1000);
      if (!q) return json({ ok: false, error: "質問を入力してください。" }, 200);
      const claudeKey = (b?.account ? (await resolveCreds(env, b.account))?.claudeKey : null) || env.ANTHROPIC_API_KEY;
      if (!claudeKey) return json({ ok: false, error: "Claude APIキーが未設定です（アカウント設定で連携してください）。" }, 200);
      // 直近の会話履歴（最大6往復ぶん）を文脈として渡す。役割は user/assistant のみ採用し、各発言は長さを制限。
      const hist = (Array.isArray(b?.history) ? b!.history! : [])
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .slice(-12)
        .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1500) }));
      const messages = [...hist, { role: "user" as const, content: q }];
      try {
        const { text } = await callClaude({
          apiKey: claudeKey,
          model: "claude-haiku-4-5",
          noEffort: true,
          thinkingMode: "disabled",
          maxTokens: 900,
          system: [{ text: HELP_SPEC + "\n\n---\n" + HELP_RULES, cache: true }],
          messages,
        });
        return json({ ok: true, answer: text });
      } catch (e) {
        console.error(`help-ask失敗: ${e instanceof Error ? e.message : e}`);
        return json({ ok: false, error: "回答に失敗しました。時間をおいて再度お試しください。" }, 200);
      }
    }

    // 要望・不具合：AI先回り（会員のClaudeが、ヘルプ＋直近の対応済みを根拠に一次対応）。安いHaiku・料金は会員負担。
    if (req.method === "POST" && url.pathname === "/api/feedback-triage") {
      const b = (await req.json().catch(() => null)) as { account?: string; kind?: string; body?: string } | null;
      const text = String(b?.body ?? "").trim().slice(0, 2000);
      if (!text) return json({ ok: false, error: "内容を入力してください。" }, 200);
      const kind = b?.kind === "bug" ? "bug" : "request";
      const claudeKey = (b?.account ? (await resolveCreds(env, b.account))?.claudeKey : null) || env.ANTHROPIC_API_KEY;
      if (!claudeKey) return json({ ok: false, error: "Claude APIキーが未設定です（アカウント設定で連携してください）。" }, 200);
      // 直近の更新（=対応済み）を本部から取得して根拠に加える。取れなくてもヘルプだけで対応。
      let fixesText = "";
      try {
        if (env.HONBU_URL) {
          const rf = await fetch(`${env.HONBU_URL}/hq/recent-fixes`);
          if (rf.ok) {
            const d = (await rf.json()) as { items?: { version?: string; note?: string }[] };
            const items = Array.isArray(d.items) ? d.items.slice(0, 20) : [];
            if (items.length) fixesText = items.map((x) => `- v${x.version}: ${x.note}`).join("\n");
          }
        }
      } catch { /* 取れなくても続行 */ }
      const triagePrompt =
        "## あなたの役割（要望・不具合の一次対応）\n" +
        "会員が「要望」または「不具合」を書きました。あなたはまず一次対応します。\n" +
        "1) ヘルプや下の『最近の更新（対応済み）』を見て、もう解決できる/既に対応済みなら、その方法や“対応済みである旨”を具体的にやさしく答える（resolved=true）。\n" +
        "2) 本当に新しい要望や未対応の不具合で、運営に届けたほうがよいものは、共感しつつ『運営にお届けします』と述べる（recommend_send=true）。\n" +
        "3) 不確かな推測や、できない約束はしない。専門用語・英語・コードは避け、平易な日本語で短く。\n" +
        (fixesText ? ("\n## 最近の更新（対応済み）\n" + fixesText + "\n") : "") +
        "\n出力はJSONで answer（会員に見せる返答）・resolved（その場で解決/対応済みで完結したか）・recommend_send（運営に届けるべき新規の要望/不具合か）。";
      try {
        const { text: out } = await callClaude({
          apiKey: claudeKey,
          model: "claude-haiku-4-5",
          noEffort: true,
          thinkingMode: "disabled",
          maxTokens: 900,
          schema: {
            type: "object",
            properties: {
              answer: { type: "string", description: "会員に見せる返答（やさしい日本語）" },
              resolved: { type: "boolean", description: "その場で解決・対応済みで完結したか" },
              recommend_send: { type: "boolean", description: "運営に届けるべき新規の要望/不具合か" },
            },
            required: ["answer", "resolved", "recommend_send"],
            additionalProperties: false,
          },
          system: [{ text: HELP_SPEC + "\n\n---\n" + HELP_RULES + "\n\n---\n" + triagePrompt, cache: true }],
          messages: [{ role: "user", content: `種別：${kind === "bug" ? "不具合" : "要望"}\n内容：${text}` }],
        });
        let parsed: { answer?: string; resolved?: boolean; recommend_send?: boolean } = {};
        try { parsed = JSON.parse(out); } catch { parsed = { answer: out, resolved: false, recommend_send: true }; }
        return json({ ok: true, answer: parsed.answer ?? "", resolved: !!parsed.resolved, recommend_send: parsed.recommend_send !== false });
      } catch (e) {
        console.error(`feedback-triage失敗: ${e instanceof Error ? e.message : e}`);
        return json({ ok: false, error: "AIの一次対応に失敗しました。そのまま運営に送ることもできます。" }, 200);
      }
    }

    // 要望・不具合：運営（本部）へ送る。会員ワーカーが本部トークンで転送。返信先は登録メール。
    if (req.method === "POST" && url.pathname === "/api/feedback-send") {
      const b = (await req.json().catch(() => null)) as { account?: string; kind?: string; body?: string; ai_answer?: string; env_info?: string } | null;
      const text = String(b?.body ?? "").trim().slice(0, 4000);
      if (!text) return json({ ok: false, error: "内容を入力してください。" }, 200);
      const kind = b?.kind === "bug" ? "bug" : "request";
      // 環境情報（ブラウザ/画面/版など）を本文末尾に自動添付＝運営が状況を把握しやすく。
      const envInfo = String(b?.env_info ?? "").slice(0, 1000);
      const finalBody = envInfo ? (text + "\n\n――― 環境情報 ―――\n" + envInfo) : text;
      if (!env.HONBU_URL) return json({ ok: false, error: "本部が設定されていません。" }, 200);
      const uid = await getMemberUid(env);
      const email = (await getConfig(env, "member_email")) || null;
      const token = (await ensureHonbuToken(env, uid, null, email)) || env.HONBU_TOKEN || null;
      if (!token) return json({ ok: false, error: "本部への接続が未確立です。少し待って再度お試しください。" }, 200);
      try {
        const res = await fetch(`${env.HONBU_URL}/hq/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ kind, body: finalBody, ai_answer: String(b?.ai_answer ?? "").slice(0, 4000), email, app_version: CODE_VERSION, member_id: uid }),
        });
        if (!res.ok) return json({ ok: false, error: "送信に失敗しました。時間をおいて再度お試しください。" }, 200);
        return json({ ok: true });
      } catch {
        return json({ ok: false, error: "送信に失敗しました。時間をおいて再度お試しください。" }, 200);
      }
    }

    return json({ error: "not found" }, 404);
  },

  // Cronは細かめ（*/10）。予約は not_before（基本配信時間±10分のゆらぎ）で持つので、
  // 毎回「期限が来た予約」を1本ずつ出す。メトリクス/サイクルは指定時刻に実行。
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    setClaudeRelay(env.US_RELAY); // Claude呼び出しを米国配置DO経由に（HKG実行時の地域ブロック回避）
    await refreshPrompts(env).catch(() => {}); // 本部からプロンプト本体を最新化＋反映（生成系より前に・失敗してもキャッシュで継続）
    const jst = new Date(event.scheduledTime + 9 * 3600_000);
    const hhmm =
      String(jst.getUTCHours()).padStart(2, "0") +
      ":" +
      String(jst.getUTCMinutes()).padStart(2, "0");
    // 本部への日次同期（push+pull）の固定時刻。生成タイミングとは独立（集合知共有は時間にシビアでない）。
    const honbuSyncSlot = (env.METRICS_SLOT_JST ?? "05:00").trim();
    // 受信専用同期の時刻（既定17:00 JST）。""にすると無効。効く型/お知らせの反映だけ早める。
    const pullSlot = (env.HONBU_PULL_SLOT_JST ?? "17:00").trim();
    // 「準備」を初回投稿の何分前に回すか（既定30分）。会員ごとに最早スロットへ寄せる。
    const leadMin = parseInt(env.PREP_LEAD_MIN ?? "30", 10) || 30;

    // 毎回：期限が来た予約（not_before<=now）を各アカウント1本ずつ投稿（ゆらぎを尊重）
    await postSlotAllAccounts(env);

    // 会員ごと：その日いちばん早い投稿の (leadMin) 分前に「メトリクス取得→学習→生成」を実行。
    //   投稿時刻を自由に設定しても（早朝でも）、初回投稿までに在庫が用意される。
    try {
      const accounts = await loadActiveAccounts(env);
      for (const acc of accounts) {
        if (!acc.platforms.includes("x")) continue;
        const prep = await accountPrepHHMM(env, acc.id, leadMin);
        if (hhmm === prep) {
          await collectForAccount(env, acc); // X読み取り（最新の反応数値）→学習の材料
          await runCycleForAccount(env, acc); // 学習→生成（サイクル切替=作り直し / 途中=緊急補充）
        }
      }
    } catch (e) {
      console.error(`会員ごとの準備処理に失敗: ${e instanceof Error ? e.message : e}`);
    }

    // 本部との同期（生成とは独立・固定時刻）。push=最新の型/成績、pull=効く型ライブラリ＋お知らせ。
    if (hhmm === honbuSyncSlot) {
      try {
        await syncHonbu(env, CODE_VERSION);
      } catch (e) {
        console.error(`本部同期失敗: ${e instanceof Error ? e.message : e}`);
      }
    } else if (pullSlot && hhmm === pullSlot) {
      try {
        const r = await pullFromHonbu(env);
        console.log(`本部 受信専用同期: 効く型${r.library}件・お知らせ${r.broadcasts}件を取得`);
      } catch (e) {
        console.error(`本部 受信専用同期 失敗: ${e instanceof Error ? e.message : e}`);
      }
    }
  },
} satisfies ExportedHandler<Env>;
