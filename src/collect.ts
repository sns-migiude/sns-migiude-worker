// 成果収集（メトリクス＋リプ）と、公平な数字への正規化。
// 設計書: 04章（自リプ除外・正規化＝平常比）／06章（安定フラグ＝settled）。
//
// ・er_raw  … 生のエンゲージメント率（自リプは除外して算出）
// ・er_norm … アカウント自身の最近の中央値で割った「平常比」。大小アカを同じ土俵に乗せる
// ・settled … 投稿から一定時間が過ぎ、数字が安定したとみなすフラグ（学習はこれが立った投稿だけ）

import {
  fetchTweetMetrics,
  fetchAccountMetrics,
  fetchReplies,
  type XCreds,
  type TweetMetrics,
} from "./xapi";
import { loadActiveAccounts, xCreds, resolveCreds, type Account, type Env } from "./accounts";
import { callClaude, extractJson } from "./claude";
import { logClaudeUsage } from "./usage";

// この時間が過ぎたら成果が安定したとみなす（初速の過大評価を避ける・06章）
const SETTLE_HOURS = 48;

// 平常比(er_norm)の分母＝このアカウント自身の「確定済みERの中央値」を測る窓と最小本数。
// 当日の収集バッチだけで割ると不安定になる（1本の日は自己割りで1.0固定・若い未確定投稿が混入）ため、
// 確定履歴を分母にして日をまたいで比較可能にする（①の修正）。
const BASELINE_WINDOW_DAYS = 60; // 直近この日数の確定済みERで基準を測る
const BASELINE_MIN_N = 5;        // 基準に必要な確定サンプル数。これ未満はブートストラップ（当日バッチ）で代用

// 反応の内容(ポジ/ネガ)による弱い補正（A案・角を残す）。ポジ1.2 / 中立1.0 / ネガ0.8 ＝ 6:4。
// 中立を1.0に据えるので「リプ全体の量感は今のまま・中身で±20%だけ傾く」。会員ローカルのみ（本部に送らない）。
const REPLY_W: Record<string, number> = { pos: 1.2, neu: 1.0, neg: 0.8 };
const SENTIMENT_MIN_SAMPLE = 5; // 判定済みリプがこれ未満なら中立扱い（少数はノイズなので補正しない）

function median(nums: number[]): number {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// SQLiteの "YYYY-MM-DD HH:MM:SS"(UTC) を Date に直す
function parseSqlUtc(s: string): number {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

interface PostRow {
  id: number;
  platform_post_id: string;
  posted_at: string;
}

async function collectMetricsForAccount(
  env: Env,
  account: Account,
  creds: XCreds
): Promise<number> {
  const windowDays = parseInt(env.METRICS_WINDOW_DAYS, 10) || 14;
  // 既に settled=1 のスナップショットを取れた投稿は再取得しない（API節約＝Xの読み取りコスト削減）。
  // 48h(SETTLE_HOURS)で数字は安定するので、各投稿は「安定前は毎日＋確定の1回」で打ち止め。
  // 確定値は必ず1回記録するのでデータ欠落はない（14日窓×毎日 → 約3回に）。
  const posts = await env.DB.prepare(
    `SELECT p.id, p.platform_post_id, p.posted_at FROM posts p
     WHERE p.account_id = ? AND p.platform = 'x' AND p.status = 'posted'
       AND p.platform_post_id IS NOT NULL AND p.deleted_at IS NULL
       AND p.posted_at >= datetime('now', ?)
       AND NOT EXISTS (
         SELECT 1 FROM post_metrics m WHERE m.post_id = p.id AND m.settled = 1
       )`
  )
    .bind(account.id, `-${windowDays} days`)
    .all<PostRow>();
  if (posts.results.length === 0) return 0;

  const byTweet = new Map<string, PostRow>();
  for (const p of posts.results) byTweet.set(p.platform_post_id, p);

  // 自リプ数（集計から除外する・04章の公平な集計）
  const selfReplies = new Map<number, number>();
  const sr = await env.DB.prepare(
    `SELECT post_id, COUNT(*) AS n FROM replies
     WHERE account_id = ? AND is_self = 1 GROUP BY post_id`
  )
    .bind(account.id)
    .all<{ post_id: number; n: number }>();
  for (const row of sr.results) if (row.post_id != null) selfReplies.set(row.post_id, row.n);

  // 他者リプの内容内訳（post_id → {pos,neu,neg}）。判定済みだけ数える。弱補正に使う。
  // sentiment列が無い古いDB（migration適用前）でも成績収集を止めないよう try で保護＝そのまま中立扱い。
  const senti = new Map<number, { pos: number; neu: number; neg: number }>();
  try {
    const sc = await env.DB.prepare(
      `SELECT post_id, sentiment, COUNT(*) AS n FROM replies
       WHERE account_id = ? AND is_self = 0 AND sentiment IS NOT NULL GROUP BY post_id, sentiment`
    )
      .bind(account.id)
      .all<{ post_id: number; sentiment: string; n: number }>();
    for (const row of sc.results) {
      if (row.post_id == null) continue;
      const e = senti.get(row.post_id) ?? { pos: 0, neu: 0, neg: 0 };
      if (row.sentiment === "pos") e.pos = row.n;
      else if (row.sentiment === "neg") e.neg = row.n;
      else e.neu = row.n;
      senti.set(row.post_id, e);
    }
  } catch { /* sentiment未対応の古いDB（migration前）＝補正なしで続行 */ }

  // メトリクス取得（100件ずつ）→ er_raw と settled を計算
  const ids = posts.results.map((p) => p.platform_post_id);
  const collected: Array<{ post: PostRow; m: TweetMetrics; erRaw: number; settled: number }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const metrics = await fetchTweetMetrics(creds, chunk, true);
    for (const m of metrics) {
      const post = byTweet.get(m.tweetId);
      if (!post) continue;
      const imp = m.impressions ?? 0;
      const selfN = selfReplies.get(post.id) ?? 0;
      const adjReplies = Math.max(0, (m.replies ?? 0) - selfN); // 自リプを引く
      // 反応内容による弱補正：判定済みリプの平均重み(ポジ1.2/中立1.0/ネガ0.8)を全リプに掛ける。少数(<5)は中立。
      const sm = senti.get(post.id) ?? { pos: 0, neu: 0, neg: 0 };
      const classified = sm.pos + sm.neu + sm.neg;
      const avgW =
        classified >= SENTIMENT_MIN_SAMPLE
          ? (REPLY_W.pos * sm.pos + REPLY_W.neu * sm.neu + REPLY_W.neg * sm.neg) / classified
          : 1.0;
      const weightedReplies = adjReplies * avgW;
      const engagements =
        (m.likes ?? 0) +
        (m.retweets ?? 0) +
        (m.quotes ?? 0) +
        (m.bookmarks ?? 0) +
        weightedReplies;
      const erRaw = imp > 0 ? engagements / imp : 0;
      const ageHours = (Date.now() - parseSqlUtc(post.posted_at)) / 3600_000;
      const settled = ageHours >= SETTLE_HOURS ? 1 : 0;
      collected.push({ post, m, erRaw, settled });
    }
  }
  if (collected.length === 0) return 0;

  // 平常比の基準＝このアカウント自身の「確定済みERの中央値」（直近BASELINE_WINDOW_DAYS日）。
  // 当日の収集バッチだけで割ると、1本だけの日は自己割り(=1.0)、若い投稿の未確定ERの混入で歪む（①）。
  // 確定履歴（imp>0・er_raw>0の最新スナップショット）＋今回バッチの確定分をプールして中央値を取る。
  const histRows = await env.DB.prepare(
    `SELECT m.er_raw AS er FROM post_metrics m JOIN posts p ON p.id = m.post_id
      WHERE m.account_id = ? AND m.settled = 1 AND m.er_raw IS NOT NULL AND m.er_raw > 0 AND m.impressions > 0
        AND p.posted_at >= datetime('now', ?)
        AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id AND m2.settled = 1)`
  ).bind(account.id, `-${BASELINE_WINDOW_DAYS} days`).all<{ er: number }>().catch(() => ({ results: [] as Array<{ er: number }> }));
  const pool = (histRows.results ?? []).map((r) => r.er);
  for (const c of collected) if (c.settled === 1 && (c.m.impressions ?? 0) > 0 && c.erRaw > 0) pool.push(c.erRaw);
  let baseline = pool.length >= BASELINE_MIN_N ? median(pool) : 0;
  if (baseline <= 0) {
    // ブートストラップ（確定履歴が浅い新規）：当日バッチの正のERで暫定基準（データが貯まれば自然に安定）。
    baseline = median(collected.filter((c) => (c.m.impressions ?? 0) > 0 && c.erRaw > 0).map((c) => c.erRaw));
  }

  let saved = 0;
  for (const c of collected) {
    const erNorm = baseline > 0 ? c.erRaw / baseline : null;
    // ③ 基準が出せない日（baseline<=0＝反応がまだ全く無い新規）は確定させない＝翌日以降に再取得してリトライ。
    //    基準さえ出れば、反応ゼロの投稿も er_norm=0（＝効かなかった正しい記録）として確定・学習に入る。
    const settledFinal = c.settled === 1 && baseline > 0 ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO post_metrics
        (post_id, account_id, impressions, likes, reposts, replies, quotes, bookmarks,
         url_link_clicks, profile_clicks, er_raw, er_norm, settled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        c.post.id,
        account.id,
        c.m.impressions,
        c.m.likes,
        c.m.retweets,
        c.m.replies,
        c.m.quotes,
        c.m.bookmarks,
        c.m.urlLinkClicks,
        c.m.userProfileClicks,
        c.erRaw,
        erNorm,
        settledFinal
      )
      .run();
    saved++;
  }

  // アカウント日次スナップショット（フォロワー等・正規化の文脈）。失敗しても投稿成果は守る。
  try {
    const a = await fetchAccountMetrics(creds);
    await env.DB.prepare(
      `INSERT INTO account_metrics (account_id, platform, followers, following, posts_count)
       VALUES (?, 'x', ?, ?, ?)`
    )
      .bind(account.id, a.followers, a.following, a.tweets)
      .run();
  } catch (e) {
    console.error(
      `[${account.id}] アカウントメトリクス取得失敗: ${e instanceof Error ? e.message : e}`
    );
  }
  return saved;
}

// 1アカウントぶんのメトリクス＋リプ収集（会員ごとに「最早スロットの少し前」で呼ぶ）。Xクレデンシャルが無ければ何もしない。
export async function collectForAccount(env: Env, account: Account): Promise<number> {
  if (!account.platforms.includes("x")) return 0;
  const creds = await xCreds(env, account.id);
  if (!creds) return 0;
  // 先にリプ取得＆内容判定 → そのあとメトリクス（弱補正に最新の判定を反映させる）
  try { await collectRepliesForAccount(env, account, creds); }
  catch (e) { console.error(`[${account.id}] リプ収集失敗: ${e instanceof Error ? e.message : e}`); }
  try { await classifyRepliesForAccount(env, account); }
  catch (e) { console.error(`[${account.id}] リプ内容判定失敗: ${e instanceof Error ? e.message : e}`); }
  let saved = 0;
  try { saved = await collectMetricsForAccount(env, account, creds); }
  catch (e) { console.error(`[${account.id}] メトリクス収集失敗: ${e instanceof Error ? e.message : e}`); }
  return saved;
}

export async function collectMetrics(
  env: Env
): Promise<Array<{ account: string; saved: number }>> {
  const accounts = await loadActiveAccounts(env);
  const out: Array<{ account: string; saved: number }> = [];
  for (const acc of accounts) {
    if (!acc.platforms.includes("x")) continue;
    const creds = await xCreds(env, acc.id);
    if (!creds) continue;
    try {
      out.push({ account: acc.id, saved: await collectMetricsForAccount(env, acc, creds) });
    } catch (e) {
      console.error(`[${acc.id}] メトリクス収集失敗: ${e instanceof Error ? e.message : e}`);
      out.push({ account: acc.id, saved: 0 });
    }
  }
  return out;
}

// ── リプ収集（is_self判定。自リプを集計除外するためのマーク・04章） ──────────
async function collectRepliesForAccount(
  env: Env,
  account: Account,
  creds: XCreds
): Promise<number> {
  let selfUsername: string | null = account.handle;
  if (!selfUsername) {
    try {
      selfUsername = (await fetchAccountMetrics(creds)).username;
    } catch {
      /* is_self判定が効かなくなるだけ。収集は続行 */
    }
  }

  const rows = await env.DB.prepare(
    `SELECT id, platform_post_id FROM posts
     WHERE account_id = ? AND platform = 'x' AND status = 'posted'
       AND platform_post_id IS NOT NULL AND posted_at >= datetime('now', '-7 days')
     ORDER BY posted_at DESC`
  )
    .bind(account.id)
    .all<{ id: number; platform_post_id: string }>();

  let newReplies = 0;
  for (const r of rows.results) {
    try {
      const replies = await fetchReplies(creds, r.platform_post_id);
      for (const rep of replies) {
        const isSelf = selfUsername && rep.authorUsername === selfUsername ? 1 : 0;
        const res = await env.DB.prepare(
          `INSERT OR IGNORE INTO replies
            (account_id, post_id, platform_post_id, reply_id, author_id, author_username,
             is_self, text, reply_likes, reply_created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            account.id,
            r.id,
            r.platform_post_id,
            rep.replyId,
            rep.authorId,
            rep.authorUsername,
            isSelf,
            rep.text,
            rep.likes,
            rep.createdAt
          )
          .run();
        if ((res.meta.changes ?? 0) > 0) newReplies++;
      }
    } catch (e) {
      console.error(
        `[${account.id}] リプ取得失敗 post#${r.id}: ${e instanceof Error ? e.message : e}`
      );
    }
  }
  return newReplies;
}

// ── リプの内容判定（ポジ/中立/ネガ・Haiku・会員ローカル）。成績の弱補正の材料。本部には一切送らない。 ──
async function classifyRepliesForAccount(env: Env, account: Account): Promise<number> {
  const claudeKey = (await resolveCreds(env, account.id))?.claudeKey || env.ANTHROPIC_API_KEY;
  if (!claudeKey) return 0; // キーが無ければ判定しない（sentiment=NULL＝重み1.0の中立扱い）
  const rows = await env.DB.prepare(
    `SELECT id, text FROM replies
     WHERE account_id = ? AND is_self = 0 AND sentiment IS NULL AND text IS NOT NULL AND text <> ''
     ORDER BY id DESC LIMIT 160`
  )
    .bind(account.id)
    .all<{ id: number; text: string }>();
  if (rows.results.length === 0) return 0;
  const sys =
    "あなたはリプライの感情分類器。各リプが元の投稿に対して肯定的か中立か否定的かを判定する。" +
    "称賛・共感・感謝・同意=pos／質問・単なる情報・無関係・判断不能=neu／皮肉・嘲笑・煽り・強い批判・怒り=neg。" +
    'JSON配列だけを返す（前置き・説明・コードフェンス無し）: [{"i":番号,"s":"pos"|"neu"|"neg"}]';
  let done = 0;
  const BATCH = 40;
  for (let i = 0; i < rows.results.length; i += BATCH) {
    const chunk = rows.results.slice(i, i + BATCH);
    const list = chunk.map((r, j) => `${j}: ${r.text.replace(/\s+/g, " ").slice(0, 160)}`).join("\n");
    try {
      const { text, usage } = await callClaude({
        apiKey: claudeKey,
        model: "claude-haiku-4-5", // 雑務は安いHaiku（判定はeffort/思考オフ必須）
        noEffort: true,
        thinkingMode: "disabled",
        system: [{ text: sys }],
        userText: list,
        stream: false,
        maxTokens: 1200,
      });
      await logClaudeUsage(env, account.id, "claude-haiku-4-5", usage, "reply_sentiment");
      const arr = extractJson<Array<{ i: number; s: string }>>(text) ?? [];
      for (const it of arr) {
        const r = chunk[it?.i];
        if (!r) continue;
        const s = it.s === "pos" ? "pos" : it.s === "neg" ? "neg" : "neu";
        await env.DB.prepare(`UPDATE replies SET sentiment = ? WHERE id = ?`).bind(s, r.id).run();
        done++;
      }
    } catch (e) {
      console.error(`[${account.id}] リプ感情判定バッチ失敗: ${e instanceof Error ? e.message : e}`);
    }
  }
  return done;
}

export async function collectReplies(
  env: Env
): Promise<Array<{ account: string; newReplies: number }>> {
  const accounts = await loadActiveAccounts(env);
  const out: Array<{ account: string; newReplies: number }> = [];
  for (const acc of accounts) {
    if (!acc.platforms.includes("x")) continue;
    const creds = await xCreds(env, acc.id);
    if (!creds) continue;
    out.push({ account: acc.id, newReplies: await collectRepliesForAccount(env, acc, creds) });
  }
  return out;
}
