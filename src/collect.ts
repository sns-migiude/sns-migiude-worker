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

// オーガニック/広告カラムの自己修復。マイグレーション記録(d1_migrations)がドリフトしていても
// 確実に列を用意する（PRAGMAで存在チェック→無ければALTER。既存なら即return＝毎回の無駄打ちなし）。
// 収集・学習の入口で呼ぶ＝どのDBでも新カラムのINSERT/SELECTが失敗しない。
let _promoColsReady = false;
export async function ensurePromotedColumns(env: Env): Promise<void> {
  if (_promoColsReady) return;
  try {
    const info = await env.DB.prepare(`PRAGMA table_info(post_metrics)`).all<{ name: string }>();
    const has = (info.results ?? []).some((c) => c.name === "org_er_raw");
    if (!has) {
      for (const sql of [
        `ALTER TABLE post_metrics ADD COLUMN org_impressions INTEGER`,
        `ALTER TABLE post_metrics ADD COLUMN org_er_raw REAL`,
        `ALTER TABLE post_metrics ADD COLUMN promo_impressions INTEGER`,
        `ALTER TABLE post_metrics ADD COLUMN promo_er_raw REAL`,
      ]) { try { await env.DB.prepare(sql).run(); } catch { /* 既存列 */ } }
    }
    try { await env.DB.prepare(`ALTER TABLE posts ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0`).run(); } catch { /* 既存列 */ }
    _promoColsReady = true;
  } catch { /* PRAGMA不可でも収集は続行（各SQLはtry/COALESCEで吸収） */ }
}

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
  creds: XCreds,
  onlyPostId?: number
): Promise<number> {
  await ensurePromotedColumns(env); // どのDBでも org/promo 列を保証してから収集（ドリフト耐性）
  const windowDays = parseInt(env.METRICS_WINDOW_DAYS, 10) || 14;
  // 収集対象の選定。通常は2分岐（OR）：
  //  ① windowDays窓 かつ settled=1 が未取得の投稿（従来の「安定前は毎日＋確定の1回」で打ち止め）。
  //     確定値は必ず1回記録するのでデータ欠落はない（14日窓×毎日 → 約3回に）＝Xの読み取りコスト節約。
  //  ② 広告マーク済み(promoted=1)は settle 済みでも29日窓で追い取得する。
  //     広告インプは投稿後48h(SETTLE_HOURS)以降に伸びるので、settle打ち止めだと取り逃す。
  //     逆算②（public − organic）で内訳を埋め直すため、organic が返ったフェッチを後から1回でも当てる。
  //     -29日は「100件チャンクに30日超が混じるとそのチャンクの organic が全滅（チャンク毒化）」を
  //     避ける安全マージン（Xの内訳は投稿後30日まで）。
  // onlyPostId 指定時は「その1本だけ・settledフィルタ無視」で下の全ロジック（自リプ控除・感情補正・
  // baseline・逆算②・promoted自動判定）を同系統で通す（内訳の即時取得。別ロジックは作らない）。
  const posts = onlyPostId != null
    ? await env.DB.prepare(
        `SELECT p.id, p.platform_post_id, p.posted_at FROM posts p
         WHERE p.account_id = ? AND p.platform = 'x' AND p.status = 'posted'
           AND p.platform_post_id IS NOT NULL AND p.deleted_at IS NULL
           AND p.id = ?`
      )
        .bind(account.id, onlyPostId)
        .all<PostRow>()
    : await env.DB.prepare(
        `SELECT p.id, p.platform_post_id, p.posted_at FROM posts p
         WHERE p.account_id = ? AND p.platform = 'x' AND p.status = 'posted'
           AND p.platform_post_id IS NOT NULL AND p.deleted_at IS NULL
           AND (
             ( p.posted_at >= datetime('now', ?)
               AND NOT EXISTS (SELECT 1 FROM post_metrics m
                               WHERE m.post_id = p.id AND m.settled = 1) )
             OR
             ( COALESCE(p.promoted, 0) = 1
               AND p.posted_at >= datetime('now', '-29 days') )
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
  const collected: Array<{
    post: PostRow; m: TweetMetrics; erRaw: number; settled: number;
    orgImp: number | null; orgEr: number | null; promoImp: number | null; promoEr: number | null;
  }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const metrics = await fetchTweetMetrics(creds, chunk, true);
    for (const m of metrics) {
      const post = byTweet.get(m.tweetId);
      if (!post) continue;
      const imp = m.impressions ?? 0;
      const selfN = selfReplies.get(post.id) ?? 0;
      // 反応内容による弱補正：判定済みリプの平均重み(ポジ1.2/中立1.0/ネガ0.8)を全リプに掛ける。少数(<5)は中立。
      const sm = senti.get(post.id) ?? { pos: 0, neu: 0, neg: 0 };
      const classified = sm.pos + sm.neu + sm.neg;
      const avgW =
        classified >= SENTIMENT_MIN_SAMPLE
          ? (REPLY_W.pos * sm.pos + REPLY_W.neu * sm.neu + REPLY_W.neg * sm.neg) / classified
          : 1.0;
      const adjReplies = Math.max(0, (m.replies ?? 0) - selfN); // 自リプを引く
      const engagements =
        (m.likes ?? 0) +
        (m.retweets ?? 0) +
        (m.quotes ?? 0) +
        (m.bookmarks ?? 0) +
        adjReplies * avgW;
      const erRaw = imp > 0 ? engagements / imp : 0;
      // ── オーガニック/広告の内訳（取れた時だけ）────────────────────────
      // ・organic側：自リプ（自分のリプはオーガニック文脈）と弱補正を同様に適用。
      //   quotes/bookmarksは内訳APIに無いのでオーガニック帰属で加算（広告経由の引用/ブクマは僅少）。
      // ・promoted側：広告に使われたポストにだけ返る＝広告インプ>0で自動判別に使う。
      let orgImp: number | null = null, orgEr: number | null = null;
      let promoImp: number | null = null, promoEr: number | null = null;
      // organic内訳は「インプ>0で実際に集計されている時」だけ採用。
      // 若い投稿だとXが organic を一時的に0で返す（集計遅延）ため、それを 0スコアとして保存すると
      // 反応のあった投稿を“死んだ投稿”と誤学習する → その場合は null にして合算ERにフォールバックさせる。
      if (m.organic && (m.organic.impressions ?? 0) > 0) {
        orgImp = m.organic.impressions as number;
        const oReplies = Math.max(0, (m.organic.replies ?? 0) - selfN) * avgW;
        const oEng = (m.organic.likes ?? 0) + (m.organic.retweets ?? 0) + (m.quotes ?? 0) + (m.bookmarks ?? 0) + oReplies;
        orgEr = oEng / orgImp;
      }
      if (m.promoted && (m.promoted.impressions ?? 0) > 0) {
        // ① promoted_metrics が直接取れた場合はそれを使う（Ads API寄りで取れる権限のとき）。
        promoImp = m.promoted.impressions ?? 0;
        const pEng = (m.promoted.likes ?? 0) + (m.promoted.retweets ?? 0) + ((m.promoted.replies ?? 0) * avgW);
        promoEr = (promoImp ?? 0) > 0 ? pEng / (promoImp as number) : 0;
      } else if (m.organic && orgImp != null && orgImp > 0) {
        // ② promoted_metrics が空でも、organic が取れていれば「広告分 ＝ public − organic」で逆算する。
        //    public = organic + promoted（Xの定義）。ブースト/正規広告どちらでも organic さえ取れれば検出できる。
        //    スナップショットは同一取得なので差＝広告分。ノイズ回避に下限（5以上かつpublicの2%以上）を設ける。
        const pImp = (m.impressions ?? 0) - orgImp;
        if (pImp >= 5 && pImp >= (m.impressions ?? 0) * 0.02) {
          promoImp = pImp;
          const pLikes = Math.max(0, (m.likes ?? 0) - (m.organic.likes ?? 0));
          const pRt = Math.max(0, (m.retweets ?? 0) - (m.organic.retweets ?? 0));
          const pReplies = Math.max(0, (m.replies ?? 0) - (m.organic.replies ?? 0)) * avgW;
          const pEng = pLikes + pRt + pReplies; // quotes/bookmarksはorganic帰属＝広告分は0扱い（内訳APIに無いため）
          promoEr = pEng / pImp;
        }
      }
      const ageHours = (Date.now() - parseSqlUtc(post.posted_at)) / 3600_000;
      const settled = ageHours >= SETTLE_HOURS ? 1 : 0;
      collected.push({ post, m, erRaw, settled, orgImp, orgEr, promoImp, promoEr });
    }
  }
  if (collected.length === 0) return 0;

  // 平常比の基準＝このアカウント自身の「確定済みERの中央値」（直近BASELINE_WINDOW_DAYS日）。
  // 当日の収集バッチだけで割ると、1本だけの日は自己割り(=1.0)、若い投稿の未確定ERの混入で歪む（①）。
  // 確定履歴（imp>0・er_raw>0の最新スナップショット）＋今回バッチの確定分をプールして中央値を取る。
  // 基準・学習に使うER＝オーガニックER優先（広告の買ったインプで薄まらない）。取れない環境は従来の合算ER。
  const histRows = await env.DB.prepare(
    `SELECT COALESCE(m.org_er_raw, m.er_raw) AS er FROM post_metrics m JOIN posts p ON p.id = m.post_id
      WHERE m.account_id = ? AND m.settled = 1 AND COALESCE(m.org_er_raw, m.er_raw) > 0 AND m.impressions > 0
        AND NOT (COALESCE(p.promoted, 0) = 1 AND m.org_er_raw IS NULL) -- 広告で薄まった総ERは基準から除外
        AND p.posted_at >= datetime('now', ?)
        AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id AND m2.settled = 1)`
  ).bind(account.id, `-${BASELINE_WINDOW_DAYS} days`).all<{ er: number }>().catch(() => ({ results: [] as Array<{ er: number }> }));
  const pool = (histRows.results ?? []).map((r) => r.er);
  const learnEr = (c: (typeof collected)[number]) => c.orgEr ?? c.erRaw;
  for (const c of collected) if (c.settled === 1 && (c.m.impressions ?? 0) > 0 && learnEr(c) > 0) pool.push(learnEr(c));
  let baseline = pool.length >= BASELINE_MIN_N ? median(pool) : 0;
  if (baseline <= 0) {
    // ブートストラップ（確定履歴が浅い新規）：当日バッチの正のERで暫定基準（データが貯まれば自然に安定）。
    baseline = median(collected.filter((c) => (c.m.impressions ?? 0) > 0 && learnEr(c) > 0).map((c) => learnEr(c)));
  }

  let saved = 0;
  for (const c of collected) {
    // er_norm＝オーガニックERの平常比（広告なしの投稿は従来と同値）。ダッシュボードのスコア表示・学習の土台。
    const erNorm = baseline > 0 ? learnEr(c) / baseline : null;
    // ③ 基準が出せない日（baseline<=0＝反応がまだ全く無い新規）は確定させない＝翌日以降に再取得してリトライ。
    //    基準さえ出れば、反応ゼロの投稿も er_norm=0（＝効かなかった正しい記録）として確定・学習に入る。
    const settledFinal = c.settled === 1 && baseline > 0 ? 1 : 0;
    // 「1投稿に settled=1 行は最大1行」という不変条件を守る（cycle.ts の AVG(m.impressions) が依存）。
    // これから確定行を書く(settledFinal=1)で、既に確定行がある投稿は INSERT せず、その確定行を UPDATE。
    // ＝広告マーク済みの追い取得（②）で確定行が重複せず、reach学習が過重加重されない。
    // 確定行が無い（新規）は従来どおり INSERT。settledFinal=0（安定前スナップショット）も INSERT。
    let existingSettledId: number | null = null;
    if (settledFinal === 1) {
      const ex = await env.DB.prepare(
        `SELECT id FROM post_metrics WHERE post_id = ? AND settled = 1 ORDER BY fetched_at DESC LIMIT 1`
      ).bind(c.post.id).first<{ id: number }>().catch(() => null);
      existingSettledId = ex?.id ?? null;
    }
    if (existingSettledId != null) {
      // 上書きは内訳＋インプ系のみ（settled行の同一性は保つ）。fetched_at を更新して最新スナップショット扱いに。
      await env.DB.prepare(
        `UPDATE post_metrics SET
           impressions = ?, er_raw = ?, er_norm = ?,
           org_impressions = ?, org_er_raw = ?, promo_impressions = ?, promo_er_raw = ?,
           fetched_at = datetime('now')
         WHERE id = ?`
      )
        .bind(
          c.m.impressions,
          c.erRaw,
          erNorm,
          c.orgImp,
          c.orgEr,
          c.promoImp,
          c.promoEr,
          existingSettledId
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO post_metrics
          (post_id, account_id, impressions, likes, reposts, replies, quotes, bookmarks,
           url_link_clicks, profile_clicks, er_raw, er_norm, settled,
           org_impressions, org_er_raw, promo_impressions, promo_er_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          settledFinal,
          c.orgImp,
          c.orgEr,
          c.promoImp,
          c.promoEr
        )
        .run();
    }
    saved++;
    // 広告の自動判別：広告インプが観測されたら posts.promoted=1（手動マークと同じフラグ。自動では戻さない）。
    if ((c.promoImp ?? 0) > 0) {
      await env.DB.prepare(`UPDATE posts SET promoted = 1 WHERE id = ? AND promoted = 0`).bind(c.post.id).run().catch(() => {});
    }
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

// 1投稿だけを対象に、settledフィルタ無視で内訳を取り直す（会員が「内訳を調べる」/「広告にする」を押した時）。
// 中身は onlyPostId 指定で collectMetricsForAccount を呼ぶだけの薄いラッパ＝収集ロジックは1系統に保つ。
// 返り値＝保存(INSERT/UPDATE)した行数。Xクレデンシャルが無ければ 0（＝マーク自体は呼び出し側で成功させる）。
export async function collectSinglePost(
  env: Env,
  account: Account,
  postId: number
): Promise<number> {
  if (!account.platforms.includes("x")) return 0;
  const creds = await xCreds(env, account.id);
  if (!creds) return 0;
  return collectMetricsForAccount(env, account, creds, postId);
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
