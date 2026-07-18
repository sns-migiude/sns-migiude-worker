// 個性ループ（縦）。設計書06章。
// 生成→投稿→収集→学習を、アカウントごとに周期（3〜5日）で回す。
//
// 投稿(index postSlot)と収集(index metricsSlot)は別Cron枠で動くので、
// cycleの責務は ① 学習（個性プロファイル更新）と ② キュー補充（生成）。
// Claudeを無駄打ちしないよう、cycle_days周期＋在庫が尽きそうな時の緊急補充でゲートする。

import { generateDrafts } from "./generate";
import { loadActiveAccounts, loadAccount, resolveCreds, linkCode, tagUrl, trackedLink, randCode, getPublicUrl, type Account, type Env } from "./accounts";
import { weightedLength } from "./xapi";
import { nextQueueSlot } from "./schedule";
import { TYPE_INSTRUCTIONS, CATALOG_KEYS, DEFAULT_ON, DEFAULT_ON_FREE, isLongType, PATTERNS, metaOf, URL_TYPE_INSTRUCTION, URL_STYLES, type PolicyId } from "./taxonomy";
import { callClaude } from "./claude";
import { logClaudeUsage } from "./usage";
import { ensurePromotedColumns } from "./collect";

// 安定成果が最低10本たまってから学習する（初速の過大評価を避ける・06章）
const MIN_LEARN_SAMPLE = 10;

// 形式フォーカス「連結」用の汎用スレッド指示（型は問わず2ポスト連結にする）。
const THREAD_FOCUS_INSTRUCTION =
  "2つの連続ポストに分ける。1本目(body)で引き付ける一言を作り、2本目(reply_text)で本編・オチ・答えを出す。1本目は短く引きで終え、答えは2本目に書く。";

// サイクルのフォーカス（次の学習サイクルの指針）を読む。未設定なら null＝自動。
// PolicyId＝グループ単位の方針（taxonomy.ts POLICY_CATALOG）。1サイクル限定＝runCycleForAccountの
// サイクル切替時に自動で消す（②の修正：選びっぱなしで永久に固定されるのを防ぐ）。
async function loadFocus(
  env: Env,
  accountId: string
): Promise<{ policy: PolicyId; label?: string } | null> {
  try {
    const r = await env.DB.prepare(
      `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'cycle_focus'`
    )
      .bind(accountId)
      .first<{ v: string }>();
    if (!r?.v) return null;
    const f = JSON.parse(r.v);
    return f && typeof f.policy === "string" ? f : null;
  } catch {
    return null;
  }
}
async function clearFocus(env: Env, accountId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM individual_profile WHERE account_id = ? AND key = 'cycle_focus'`).bind(accountId).run().catch(() => {});
}

// 型被り防止：同じ型(hook)が直近3つ以内に出ないよう貪欲に並べ替える（間に3つ以上挟む）。
// seedHooks＝すでに予約済みの直近3件の型（古い順）。満たせない時はやむなく詰める（フォーカス時など）。
function interleaveByHook<T extends { hook?: string }>(drafts: T[], seedHooks: string[]): T[] {
  const window = seedHooks.slice(-3);
  const remaining = drafts.slice();
  const out: T[] = [];
  while (remaining.length) {
    let idx = remaining.findIndex((d) => !window.includes(d.hook ?? ""));
    if (idx === -1) idx = 0;
    const picked = remaining.splice(idx, 1)[0];
    out.push(picked);
    window.push(picked.hook ?? "");
    if (window.length > 3) window.shift();
  }
  return out;
}

// 学習フェーズ：データが浅いうちは「テスト期」＝幅広く色々な型を探索、溜まったら「微調整期」＝勝ち型を磨く。
const TUNE_MIN_SAMPLE = 20;
// 型の重み補正（微調整期）を効かせるのに必要な、その型の実測本数。これ未満は中立(1.0)＝1本のマグレで
// 採用率が2.5倍動くのを防ぐ（②の修正。自動不採用の AUTO_DEMOTE_MIN_N=5 と同趣旨のガード）。
const MIN_AFFINITY_N = 3;
async function learnPhase(env: Env, accountId: string): Promise<"test" | "tune"> {
  try {
    const r = await env.DB.prepare(
      `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'sample_size'`
    ).bind(accountId).first<{ v: string }>();
    const n = r?.v ? (JSON.parse(r.v).n ?? 0) : 0;
    return n >= TUNE_MIN_SAMPLE ? "tune" : "test";
  } catch {
    return "test";
  }
}

// URL誘導の解放フラグと登録済みの飛ばし先URLを読む。
async function loadUrlInfo(
  env: Env,
  accountId: string
): Promise<{ enabled: boolean; links: Array<{ label: string; title?: string; desc?: string; url: string; note?: string }> }> {
  const enRow = await env.DB.prepare(
    `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'url_posts'`
  )
    .bind(accountId)
    .first<{ v: string }>();
  const enabled = enRow?.v === "1";
  let links: Array<{ label: string; title?: string; desc?: string; url: string; note?: string }> = [];
  try {
    const lr = await env.DB.prepare(
      `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'link_targets'`
    )
      .bind(accountId)
      .first<{ v: string }>();
    const a = JSON.parse(lr?.v ?? "[]");
    if (Array.isArray(a)) links = a;
  } catch {
    /* 壊れていれば空 */
  }
  return { enabled, links };
}

function median(nums: number[]): number {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function parseSqlUtc(s: string): number {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

// 「グループ → 正規化成果の中央値」を出す小さな集計
function aggregate(
  rows: Array<{ key: string; er: number }>
): Array<{ key: string; median: number; n: number }> {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const arr = groups.get(r.key) ?? [];
    arr.push(r.er);
    groups.set(r.key, arr);
  }
  return [...groups.entries()]
    .map(([key, ers]) => ({ key, median: median(ers), n: ers.length }))
    .sort((a, b) => b.median - a.median);
}

interface SettledRow {
  hook: string | null;
  posted_at: string;
  er_raw: number;
  chars: number | null;
  is_thread: number;
}

// ① 学習：settled な成果から個性プロファイル（best_hours / hook_affinity / 長さ / 連結）を更新。
//   最低10本に満たなければ学習しない（持ち越し・06章）。
async function learnForAccount(env: Env, account: Account): Promise<boolean> {
  await ensurePromotedColumns(env); // org/promo 列を保証（学習はcollectと別Cron＝ここでも確認。後続のlearnPromoAffinityも同DBでカバー）
  // 各投稿の「最新の settled スナップショット」を取る
  const rows = await env.DB.prepare(
    `SELECT p.hook AS hook, p.posted_at AS posted_at, p.chars AS chars,
            CASE WHEN p.reply_text IS NOT NULL AND trim(p.reply_text) <> '' THEN 1 ELSE 0 END AS is_thread,
            COALESCE(m.org_er_raw, m.er_raw) AS er_raw
       FROM posts p
       JOIN post_metrics m ON m.post_id = p.id
      WHERE p.account_id = ? AND m.settled = 1 AND COALESCE(m.org_er_raw, m.er_raw) IS NOT NULL
        -- 広告に使った投稿で、オーガニック内訳が取れていないもの（総ER＝広告で薄まる）は
        -- オーガニック学習から除外＝広告が学習を汚さない（手動「広告」マークが実際に効く配線）。
        -- 内訳が取れている広告投稿は org_er_raw を使うのでOK。
        AND NOT (COALESCE(p.promoted, 0) = 1 AND m.org_er_raw IS NULL)
        AND m.fetched_at = (
          SELECT MAX(m2.fetched_at) FROM post_metrics m2
           WHERE m2.post_id = p.id AND m2.settled = 1
        )`
  )
    .bind(account.id)
    .all<SettledRow>();

  if (rows.results.length < MIN_LEARN_SAMPLE) return false;

  // 平常比(er_norm)は「このアカウント自身の確定済みERの中央値」を分母に、その場で計算し直す（①③の根治）。
  // ・収集時の日次バッチ基準に依存しない＝古い保存値のブレを引きずらない（移行不要で全会員に効く）。
  // ・反応ゼロの投稿も er_raw=0 → 平常比0 として「効かなかった正しい低スコア」で学習に入る（③）。
  const learnBase = median(rows.results.map((r) => r.er_raw).filter((v) => v > 0));
  if (!(learnBase > 0)) return false; // 正の反応が一つも無い＝正規化できない（次サイクルへ持ち越し）
  const norm = (erRaw: number) => erRaw / learnBase;

  // フック型ごとの効き
  const hookStats = aggregate(
    rows.results
      .filter((r) => r.hook)
      .map((r) => ({ key: r.hook as string, er: norm(r.er_raw) }))
  );

  // 投稿時間帯（JST時）ごとの効き
  const hourStats = aggregate(
    rows.results.map((r) => {
      const utcHour = new Date(parseSqlUtc(r.posted_at)).getUTCHours();
      const jstHour = (utcHour + 9) % 24;
      return { key: String(jstHour), er: norm(r.er_raw) };
    })
  );

  // 長さ（長文>140字=chars>280 / 短文）・連結(2ポスト) vs 単発 の効き。各3本以上で「優位」を判定。
  const pref = (a: number[], b: number[], al: string, bl: string) => {
    const ma = median(a), mb = median(b);
    const prefer = a.length < 3 || b.length < 3 ? "none" : ma > mb * 1.1 ? al : mb > ma * 1.1 ? bl : "none";
    return { prefer, a: { label: al, median: Math.round(ma * 100) / 100, n: a.length }, b: { label: bl, median: Math.round(mb * 100) / 100, n: b.length } };
  };
  const longE: number[] = [], shortE: number[] = [], thrE: number[] = [], sglE: number[] = [];
  for (const r of rows.results) {
    ((r.chars ?? 0) > 280 ? longE : shortE).push(norm(r.er_raw));
    (r.is_thread ? thrE : sglE).push(norm(r.er_raw));
  }
  const lengthPref = pref(longE, shortE, "長文", "短文");
  const formatPref = pref(thrE, sglE, "連結", "単発");

  const updates: Array<[string, string]> = [
    ["hook_affinity", JSON.stringify(hookStats)],
    ["best_hours", JSON.stringify(hourStats)],
    ["length_pref", JSON.stringify(lengthPref)],
    ["format_pref", JSON.stringify(formatPref)],
    ["sample_size", JSON.stringify({ n: rows.results.length })],
  ];
  for (const [key, value] of updates) {
    await env.DB.prepare(
      `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    )
      .bind(account.id, key, value)
      .run();
  }
  return true;
}

// 広告学習（別アルゴリズム）：広告インプレッションでのER＝「冷たい観客（初見）への刺さり」を型別に学習。
// 分母は広告インプ・基準は自分の広告ERの中央値（オーガニックとは基準も保存先も完全に分離）。
// 出力 promo_affinity は、学習基準トグル（learn_basis）に応じて型選択に6:4でブレンドされる。
const PROMO_LEARN_MIN = 3; // 広告学習に必要な最低本数（広告を使う人はまだ少ない前提で低め）
async function learnPromoAffinity(env: Env, account: Account): Promise<boolean> {
  const rows = await env.DB.prepare(
    `SELECT p.hook AS hook, m.promo_er_raw AS er
       FROM posts p JOIN post_metrics m ON m.post_id = p.id
      WHERE p.account_id = ? AND m.settled = 1 AND m.promo_er_raw IS NOT NULL AND m.promo_impressions > 0 AND p.hook IS NOT NULL
        AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id AND m2.settled = 1)`
  ).bind(account.id).all<{ hook: string; er: number }>().catch(() => ({ results: [] as Array<{ hook: string; er: number }> }));
  const posts = rows.results ?? [];
  if (posts.length < PROMO_LEARN_MIN) return false;
  const base = median(posts.map((r) => r.er).filter((v) => v > 0));
  if (!(base > 0)) return false;
  const stats = aggregate(posts.map((r) => ({ key: r.hook, er: r.er / base })));
  await env.DB.prepare(
    `INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'promo_affinity', ?, datetime('now'))
     ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  ).bind(account.id, JSON.stringify(stats)).run();
  return true;
}

// URL誘導の学習：エンゲージメントではなく「クリック＋CV」の平常比を、誘導スタイル(hook)別に集計して url_affinity に保存。
// URL誘導はリンクへ飛ばす/成約させるのが目的なので、いいね等ではなくクリック率・CVで良し悪しを測る。
const URL_LEARN_MIN = 5;  // URL誘導の学習に必要な最低本数（クリック/CVは貯まりにくいので低め）
const CV_WEIGHT = 20;     // CV1件＝クリック20回相当の価値として重み付け（成約を強く優遇）
async function learnUrlAffinity(env: Env, account: Account): Promise<boolean> {
  const rows = await env.DB.prepare(
    `SELECT p.hook AS hook, p.link_code AS code, m.impressions AS imp
       FROM posts p JOIN post_metrics m ON m.post_id = p.id
      WHERE p.account_id = ? AND p.link_code IS NOT NULL AND TRIM(p.link_code) <> ''
        AND m.settled = 1 AND m.impressions IS NOT NULL AND m.impressions > 0
        AND m.fetched_at = (SELECT MAX(m2.fetched_at) FROM post_metrics m2 WHERE m2.post_id = p.id AND m2.settled = 1)`
  ).bind(account.id).all<{ hook: string | null; code: string; imp: number }>();
  const posts = rows.results ?? [];
  if (posts.length < URL_LEARN_MIN) return false;
  const clk = await env.DB.prepare(`SELECT code, COUNT(*) AS n FROM link_clicks WHERE account_id = ? GROUP BY code`).bind(account.id).all<{ code: string; n: number }>().catch(() => ({ results: [] as Array<{ code: string; n: number }> }));
  const cv = await env.DB.prepare(`SELECT code, COUNT(*) AS n FROM conversions WHERE account_id = ? GROUP BY code`).bind(account.id).all<{ code: string; n: number }>().catch(() => ({ results: [] as Array<{ code: string; n: number }> }));
  const clkMap = new Map<string, number>(); for (const r of clk.results ?? []) clkMap.set(r.code, r.n);
  const cvMap = new Map<string, number>(); for (const r of cv.results ?? []) cvMap.set(r.code, r.n);
  // 各ポストの「価値率」＝(クリック + CV×重み) / インプレッション。
  const rates = posts.map((p) => {
    const value = (clkMap.get(p.code) ?? 0) + CV_WEIGHT * (cvMap.get(p.code) ?? 0);
    return { hook: ((p.hook ?? "").split("##")[0]) || "🔗 URL誘導", rate: value / p.imp };
  });
  const baseline = median(rates.map((r) => r.rate));
  if (!(baseline > 0)) return false; // 全くクリック/CVが無ければ学習しない
  const byHook = aggregate(rates.map((r) => ({ key: r.hook, er: r.rate / baseline }))); // スタイル別の平常比（中央値）
  const aff: Record<string, { median: number; n: number }> = {};
  for (const g of byHook) aff[g.key] = { median: g.median, n: g.n };
  await env.DB.prepare(
    `INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, 'url_affinity', ?, datetime('now'))
     ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  ).bind(account.id, JSON.stringify(aff)).run();
  return true;
}

// url_affinity（誘導スタイル別のクリック/CV平常比）を読む。学習前なら null。
async function loadUrlAffinity(env: Env, acc: string): Promise<Record<string, number> | null> {
  try {
    const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'url_affinity'`).bind(acc).first<{ v: string }>();
    if (!r?.v) return null;
    const o = JSON.parse(r.v) as Record<string, { median: number; n: number }>;
    const m: Record<string, number> = {};
    for (const k of Object.keys(o)) m[k] = o[k]?.median ?? 1;
    return Object.keys(m).length ? m : null;
  } catch { return null; }
}

// スコアが低い型を自動で不採用にする（設定ONのときだけ）。微調整期＋十分なデータ＋床10維持＋手動再採用はピンで保護。
const AUTO_DEMOTE_MIN_N = 5;    // 判定に必要な、その型の確定投稿数
const AUTO_DEMOTE_SCORE = 0.85; // 平常比がこれ未満＝伸び悩み（自分の平均より15%以上低い）
async function autoUnadoptLowScore(env: Env, account: Account): Promise<number> {
  const acc = account.id;
  const read = async (key: string): Promise<unknown> => {
    try { const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = ?`).bind(acc, key).first<{ v: string }>(); return r?.v ? JSON.parse(r.v) : null; } catch { return null; }
  };
  const flag = async (key: string): Promise<boolean> => {
    try { const r = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = ?`).bind(acc, key).first<{ v: string }>(); return r?.v === "1" || r?.v === "true"; } catch { return false; }
  };
  if (!(await flag("auto_demote"))) return 0; // 設定OFF
  if ((await learnPhase(env, acc)) !== "tune") return 0; // ノイズで切らない（実測20本以上で）
  const st = ((await read("type_state")) as Record<string, string>) || {};
  const keep = ((await read("auto_keep")) as Record<string, boolean>) || {}; // 手動で戻した型＝再不採用しない
  let demoted = ((await read("auto_unadopted")) as Array<Record<string, unknown>>) || [];
  const affArr = (await read("hook_affinity")) as Array<{ key: string; median: number; n: number }> | null;
  const hookAff: Record<string, { median: number; n: number }> = {};
  if (Array.isArray(affArr)) for (const x of affArr) if (x && x.key) hookAff[x.key] = { median: x.median, n: x.n };
  const promoArr = (await read("promo_affinity")) as Array<{ key: string; median: number; n: number }> | null;
  const promoAff: Record<string, { median: number; n: number }> = {};
  if (Array.isArray(promoArr)) for (const x of promoArr) if (x && x.key) promoAff[x.key] = { median: x.median, n: x.n };
  const basisRaw = await read("learn_basis");
  const basis: "organic" | "promo" = basisRaw === "promo" ? "promo" : "organic";
  // URL誘導はクリック/CV優先。それ以外は学習基準トグルのブレンド値（広告主体アカで「広告では効く型」を誤って切らない）。
  const urlAff = ((await read("url_affinity")) as Record<string, { median: number; n: number }>) || {};
  // URL誘導はクリック/CV優先。それ以外は学習基準トグルのブレンド値（広告主体アカで「広告では効く型」を誤って切らない）。
  const statForKey = (key: string) => { const base = key.split("##")[0]; return urlAff[base] || urlAff[key] || blendAffinity(hookAff[key], promoAff[key], basis); };
  const premium = await flag("x_premium");
  const urlOn = await flag("url_posts");
  const defaults = premium ? DEFAULT_ON : DEFAULT_ON_FREE;
  // 採用universe（カタログ＝Premium/解放でゲート ＋ 自作）と現在のon状態。
  const entries: Array<{ key: string; name: string; on: boolean }> = [];
  for (const k of CATALOG_KEYS) {
    if (!premium && isLongType(k)) continue;
    if (!urlOn && k.indexOf("##url") >= 0) continue;
    entries.push({ key: k, name: metaOf(k).name, on: st[k] ? st[k] === "on" : defaults.includes(k) });
  }
  try {
    const cr = await env.DB.prepare(`SELECT name, COALESCE(pattern,'single_short') AS pattern FROM custom_types WHERE account_id = ?`).bind(acc).all<{ name: string; pattern: string }>();
    for (const c of cr.results ?? []) { if (!premium && PATTERNS[c.pattern]?.long) continue; const k = `⭐ ${c.name}`; entries.push({ key: k, name: k, on: st[k] ? st[k] === "on" : true }); }
  } catch { /* custom無し */ }
  let active = entries.filter((e) => e.on).length;
  if (active <= 10) return 0; // 床10。これ以上は減らさない
  // 候補：on・ピン無し・データ十分・低スコア。worst（低スコア）順。
  const cands = entries
    .filter((e) => e.on && !keep[e.key])
    .map((e) => { const s = statForKey(e.key); return { ...e, score: s ? s.median : null, n: s ? s.n : 0 }; })
    .filter((e) => e.score != null && e.n >= AUTO_DEMOTE_MIN_N && (e.score as number) < AUTO_DEMOTE_SCORE)
    .sort((a, b) => (a.score as number) - (b.score as number));
  if (!cands.length) return 0;
  const pc = await env.DB.prepare(`SELECT hook, COUNT(*) AS n FROM posts WHERE account_id = ? AND status = 'posted' AND hook IS NOT NULL GROUP BY hook`).bind(acc).all<{ hook: string; n: number }>().catch(() => ({ results: [] as Array<{ hook: string; n: number }> }));
  const postCount: Record<string, number> = {}; for (const r of pc.results ?? []) postCount[r.hook] = r.n;
  const at = new Date().toISOString();
  let done = 0;
  for (const c of cands) {
    if (active <= 10) break;
    st[c.key] = "off"; active--; done++;
    demoted = demoted.filter((d) => d.key !== c.key);
    demoted.unshift({ key: c.key, name: c.name, score: c.score, n: c.n, posts: postCount[c.key] ?? 0, at });
  }
  demoted = demoted.slice(0, 30);
  if (done > 0) {
    const save = async (key: string, val: unknown) => env.DB.prepare(`INSERT INTO individual_profile (account_id, key, value_json, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`).bind(acc, key, JSON.stringify(val)).run();
    await save("type_state", st);
    await save("auto_unadopted", demoted);
  }
  return done;
}

// 型ごとの「実行ノート」更新（微調整＝個性ループの最深層）。
// 添削の差分(before→after)を型別に集め、Haikuで「その型をどう書きたいか」を1〜2文に要約して貯める。
// 新しい添削が+2以上たまった型だけ要約し直す（無駄打ち防止）。voice非依存＝中身でなく“書き方”だけ。
const EXEC_MIN_EDITS = 3;
async function updateExecNotes(env: Env, account: Account): Promise<void> {
  let countRows: { results: Array<{ hook: string; n: number }> };
  let pairRows: { results: Array<{ hook: string; before_body: string; after_body: string }> };
  try {
    countRows = await env.DB.prepare(
      `SELECT p.hook AS hook, COUNT(*) AS n
         FROM sample_feedback f JOIN posts p ON p.id = f.post_id
        WHERE f.account_id = ? AND f.kind = 'edit' AND p.hook IS NOT NULL
        GROUP BY p.hook`
    ).bind(account.id).all<{ hook: string; n: number }>();
    pairRows = await env.DB.prepare(
      `SELECT p.hook AS hook, f.before_body AS before_body, f.after_body AS after_body
         FROM sample_feedback f JOIN posts p ON p.id = f.post_id
        WHERE f.account_id = ? AND f.kind = 'edit' AND p.hook IS NOT NULL
          AND f.before_body IS NOT NULL AND f.after_body IS NOT NULL
        ORDER BY f.created_at DESC LIMIT 120`
    ).bind(account.id).all<{ hook: string; before_body: string; after_body: string }>();
  } catch {
    return; // テーブル未作成等
  }
  const totalByHook = new Map<string, number>();
  for (const r of countRows.results) totalByHook.set(r.hook, r.n);
  const recentByHook = new Map<string, Array<{ before_body: string; after_body: string }>>();
  for (const r of pairRows.results) {
    const a = recentByHook.get(r.hook) ?? [];
    if (a.length < 8) a.push({ before_body: r.before_body, after_body: r.after_body });
    recentByHook.set(r.hook, a);
  }
  // 既存ノート
  let notes: Record<string, { note: string; n: number }> = {};
  try {
    const er = await env.DB.prepare(
      `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'exec_notes'`
    ).bind(account.id).first<{ v: string }>();
    if (er?.v) notes = JSON.parse(er.v);
  } catch { /* skip */ }

  const claudeKey = (await resolveCreds(env, account.id))?.claudeKey;
  if (!claudeKey) return;
  let changed = false;
  for (const [hook, total] of totalByHook) {
    if (total < EXEC_MIN_EDITS) continue;
    const prev = notes[hook];
    if (prev && total < prev.n + 2) continue; // 新しい添削が+2未満なら据え置き
    const pairs = recentByHook.get(hook) ?? [];
    if (pairs.length < EXEC_MIN_EDITS) continue;
    try {
      const diffs = pairs.map((p, i) => `【例${i + 1}】AI初稿：${p.before_body}\n会員の直し：${p.after_body}`).join("\n\n");
      // 微調整＝コピー不能の堀。品質重視で本生成モデル（GEN_MODEL）を使う（頻度は低い＝新添削+2の型だけ）。
      const noteModel = env.GEN_MODEL || "claude-opus-4-8";
      const { text, usage } = await callClaude({
        apiKey: claudeKey,
        model: noteModel,
        effort: "medium",
        maxTokens: 400,
        system: [{
          text:
            "あなたは添削の差分から、その人が『この型をどう書きたいか』の“実行上の好み”を抽出する専門家。" +
            "差分に共通して現れる癖だけを見抜く：構造・トーン・長さ・1行目の作り方・締め・改行・語尾・具体例の量など“書き方”を、再現できるくらい具体的に1〜2文で。" +
            "話題や中身・固有名詞・具体的な言い回しは書かない（中身は会員のもの）。出力は説明文のみ。",
        }],
        userText: `型「${hook}」の添削（AI初稿→会員の直し）：\n\n${diffs}\n\nこの型を書くときの、この会員の“書き方の好み”を1〜2文で。`,
      });
      await logClaudeUsage(env, account.id, noteModel, usage, "exec_note");
      const note = (text ?? "").trim().slice(0, 200);
      if (note) { notes[hook] = { note, n: total }; changed = true; }
    } catch { /* この型はスキップ */ }
  }
  if (changed) {
    await env.DB.prepare(
      `INSERT INTO individual_profile (account_id, key, value_json, updated_at)
       VALUES (?, 'exec_notes', ?, datetime('now'))
       ON CONFLICT(account_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    ).bind(account.id, JSON.stringify(notes)).run();
  }
}

// ② キュー補充：在庫が目標を下回っていれば、その人の文体で下書きを生成して投入。
//   承認モードに従って queued(自動投稿) か pending(承認待ち) で入れる（09章）。
// 投稿ごとの個別計測：本文中の『URL共通リンク』を、その投稿専用のリンクに差し替えて台帳に登録。
// 差し替えできた時だけ per-post 計測（d.link_code）にする。できなければ共通リンク（URL単位計測）のまま。
async function assignPerPostTracking(
  env: Env,
  account: Account,
  d: { body: string; reply_text?: string; link_code?: string },
  url: string,
  perUrlLink: string
): Promise<void> {
  const base = await getPublicUrl(env);
  if (!base || !url || !perUrlLink) return;
  const code = randCode();
  const postLink = trackedLink(base, account.id, code);
  let replaced = false;
  if (d.reply_text && d.reply_text.indexOf(perUrlLink) >= 0) { d.reply_text = d.reply_text.split(perUrlLink).join(postLink); replaced = true; }
  if (d.body && d.body.indexOf(perUrlLink) >= 0) { d.body = d.body.split(perUrlLink).join(postLink); replaced = true; }
  if (!replaced) return;
  d.link_code = code;
  try {
    await env.DB.prepare(
      `INSERT INTO tracked_links (code, account_id, url, kind, label) VALUES (?, ?, ?, 'post', 'ポスト') ON CONFLICT(code) DO NOTHING`
    ).bind(code, account.id, url).run();
  } catch { /* テーブル未作成でも生成は止めない */ }
}

interface HookEntry { hook: string; priority: string }
// 採用ポートフォリオ（採用中の型）をパターン別にまとめる。type_state(on/off)＋既定＋優先度(type_priority)。自作型は既定ON。
async function loadActivePortfolio(env: Env, acc: string): Promise<Record<string, { hooks: HookEntry[]; custom: Array<{ hook: string; prompt: string }> }>> {
  let st: Record<string, string> = {}; let pri: Record<string, string> = {};
  try {
    const rows = await env.DB.prepare(`SELECT key, value_json AS v FROM individual_profile WHERE account_id = ? AND key IN ('type_state','type_priority')`).bind(acc).all<{ key: string; v: string }>();
    for (const r of rows.results ?? []) { try { const o = JSON.parse(r.v); if (o && typeof o === "object") { if (r.key === "type_state") st = o; else pri = o; } } catch { /* 空 */ } }
  } catch { /* 空 */ }
  // 長文＝X Premium限定。非Premiumは長文型を採用ポートフォリオに含めない（生成しても弾かれるため）。
  let premium = false;
  try {
    const pr = await env.DB.prepare(`SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'x_premium'`).bind(acc).first<{ v: string }>();
    premium = pr?.v === "1" || pr?.v === "true";
  } catch { /* 既定=非Premium */ }
  const defaults = premium ? DEFAULT_ON : DEFAULT_ON_FREE;
  const prio = (key: string) => (pri[key] === "more" || pri[key] === "less" ? pri[key] : "normal");
  const byPattern: Record<string, { hooks: HookEntry[]; custom: Array<{ hook: string; prompt: string }> }> = {};
  for (const k of CATALOG_KEYS) {
    if (!premium && isLongType(k)) continue; // 非Premiumは長文型をスキップ
    const on = st[k] ? st[k] === "on" : defaults.includes(k);
    if (!on) continue;
    const m = metaOf(k); if (!m.pattern) continue;
    (byPattern[m.pattern] ??= { hooks: [], custom: [] }).hooks.push({ hook: m.hook, priority: prio(k) });
  }
  try {
    const cr = await env.DB.prepare(`SELECT name, prompt, COALESCE(pattern,'single_short') AS pattern FROM custom_types WHERE account_id = ?`).bind(acc).all<{ name: string; prompt: string; pattern: string }>();
    for (const c of cr.results ?? []) {
      if (!premium && PATTERNS[c.pattern]?.long) continue; // 非Premiumは長文の自作型もスキップ
      const key = `⭐ ${c.name}`;
      const on = st[key] ? st[key] === "on" : true;
      if (!on) continue;
      const g = (byPattern[c.pattern] ??= { hooks: [], custom: [] });
      g.hooks.push({ hook: key, priority: prio(key) }); g.custom.push({ hook: key, prompt: c.prompt });
    }
  } catch { /* custom_types未作成/pattern列なし */ }
  return byPattern;
}

// 型別の学習パフォーマンス（平常比の中央値）と、微調整フェーズか（実測20本以上）を読む。
type AffEntry = { median: number; n: number };
async function loadHookPerf(env: Env, acc: string): Promise<{ affinity: Record<string, AffEntry>; promo: Record<string, AffEntry>; basis: "organic" | "promo"; tune: boolean }> {
  const affinity: Record<string, AffEntry> = {}; const promo: Record<string, AffEntry> = {};
  let n = 0; let basis: "organic" | "promo" = "organic";
  try {
    const rows = await env.DB.prepare(`SELECT key, value_json AS v FROM individual_profile WHERE account_id = ? AND key IN ('hook_affinity','promo_affinity','sample_size','learn_basis')`).bind(acc).all<{ key: string; v: string }>();
    for (const r of rows.results ?? []) {
      try {
        if (r.key === "hook_affinity" || r.key === "promo_affinity") {
          const arr = JSON.parse(r.v);
          const dst = r.key === "hook_affinity" ? affinity : promo;
          if (Array.isArray(arr)) for (const x of arr) if (x && x.key) dst[x.key] = { median: x.median, n: x.n ?? 0 };
        }
        else if (r.key === "sample_size") { n = JSON.parse(r.v).n ?? 0; }
        else if (r.key === "learn_basis") { if (r.v === "promo" || r.v === '"promo"') basis = "promo"; }
      } catch { /* 空 */ }
    }
  } catch { /* 未学習 */ }
  return { affinity, promo, basis, tune: n >= TUNE_MIN_SAMPLE };
}

// 学習基準のブレンド（優先側0.6＋非優先側0.4）。片方しか実測が無い型はある方を100%＝
// 「広告に載せたことがない型」「オーガニック実績がまだ無い型」が不利にならない。
function blendAffinity(org: AffEntry | undefined, promo: AffEntry | undefined, basis: "organic" | "promo"): AffEntry | null {
  const o = org && org.n >= MIN_AFFINITY_N ? org : null;
  const p = promo && promo.n >= MIN_AFFINITY_N ? promo : null;
  if (o && p) {
    const wOrg = basis === "promo" ? 0.4 : 0.6;
    return { median: o.median * wOrg + p.median * (1 - wOrg), n: o.n + p.n };
  }
  return o || p || null;
}

// 重み付きランダム按分。各枠を重みに比例した確率で型に割り当てる（＝毎回ちがう型が選ばれる）。
// 一度選ばれた型は重みを下げて、同じ生成回での型被りを減らし変化を出す（決定論で同じ上位型ばかりにならない）。
function allocateByWeight(count: number, weights: number[]): number[] {
  const w = weights.map((x) => (x > 0 ? x : 0.0001));
  const base = weights.map(() => 0);
  for (let s = 0; s < count; s++) {
    const sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, idx = w.length - 1;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { idx = i; break; } }
    base[idx]++;
    w[idx] *= 0.45; // 一度当たった型は次に選ばれにくく（被り回避・分散）。priorityは重みで反映済み
  }
  return base;
}

// 配列をその場でコピーしてシャッフル（Fisher-Yates）。フックの並び順バイアスを消す。
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// 採用ポートフォリオに沿って生成。優先度(多め/普通/控えめ)×学習パフォーマンス(平常比・微調整期のみ)で
// パターン按分を重み付け＋各パターン内は頻度ガイドでAIに配分させる（控えめ/伸び悩む型はゼロにせず探索は残す）。
async function genOmakase(env: Env, account: Account, count: number, guide: string, seedAvoid: string[] = []): Promise<Array<{ body: string; hook: string; reply_text?: string }>> {
  const byPattern = await loadActivePortfolio(env, account.id);
  // url（URL誘導）はリンク注入・CV計測が要るため、ここでは生成しない（専用フローが担当）。
  const patterns = Object.keys(byPattern).filter((p) => p !== "url");
  if (!patterns.length) return (await generateDrafts(env, account, count, guide, undefined, seedAvoid)) as Array<{ body: string; hook: string; reply_text?: string }>;
  const { affinity, promo, basis, tune } = await loadHookPerf(env, account.id);
  const focus = await loadFocus(env, account.id); // 「次の学習サイクルの指針」（1サイクル限定・グループ単位）
  const PW: Record<string, number> = { more: 3, normal: 2, less: 1 };
  const fullKey = (hook: string, p: string) => (hook.indexOf("⭐") === 0 ? hook : `${hook}##${p}`);
  // ② 微調整期でも、その型の実測が MIN_AFFINITY_N 本未満なら中立(1.0)＝1本のマグレ/事故で採用率が2.5倍動かない。
  // 学習基準トグル：オーガニック優先(既定)＝オーガニック0.6+広告0.4／広告優先＝広告0.6+オーガニック0.4。
  const perfFactor = (key: string) => { if (!tune) return 1; const b = blendAffinity(affinity[key], promo[key], basis); if (!b) return 1; return b.median >= 1.1 ? 1.5 : b.median < 0.9 ? 0.6 : 1.0; };

  // 方針タイル：投稿数・平均インプは、それを使う方針が選ばれている時だけ取得（無駄なDB負荷を避ける）。
  let postCounts: Record<string, number> | null = null;
  let impAvgByHook: Record<string, number> | null = null;
  let impMedian = 0;
  if (focus && (focus.policy === "hook_explore" || focus.policy === "hook_diversify")) {
    const pc = await env.DB.prepare(`SELECT hook, COUNT(*) AS n FROM posts WHERE account_id = ? AND status = 'posted' AND hook IS NOT NULL GROUP BY hook`).bind(account.id).all<{ hook: string; n: number }>().catch(() => ({ results: [] as Array<{ hook: string; n: number }> }));
    postCounts = {}; for (const r of pc.results ?? []) postCounts[r.hook] = r.n;
  }
  if (focus && focus.policy === "reach_impressions") {
    const ir = await env.DB.prepare(
      `SELECT p.hook AS hook, AVG(m.impressions) AS avgImp FROM posts p JOIN post_metrics m ON m.post_id = p.id
        WHERE p.account_id = ? AND m.settled = 1 AND m.impressions IS NOT NULL AND p.hook IS NOT NULL GROUP BY p.hook`
    ).bind(account.id).all<{ hook: string; avgImp: number }>().catch(() => ({ results: [] as Array<{ hook: string; avgImp: number }> }));
    impAvgByHook = {}; for (const r of ir.results ?? []) impAvgByHook[r.hook] = r.avgImp;
    const vals = Object.values(impAvgByHook).sort((a, b) => a - b);
    impMedian = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  }
  // 方針によるグループ単位の重み補正（単一の狭い型を名指しでロックしない＝複数の型/パターンにまたがる）。
  // 倍率は控えめ(最大1.8倍/最小0.4倍)：allocateByWeightは当選ごとに重みを0.45倍するため、
  // 強い倍率でも「その型だけになる」ことはなく、対象グループ内で分散して選ばれる。
  const policyHookMult = (hook: string, p: string): number => {
    if (!focus) return 1;
    switch (focus.policy) {
      case "hook_top": { const b = blendAffinity(affinity[fullKey(hook, p)], promo[fullKey(hook, p)], basis); return b && b.median >= 1.1 ? 1.8 : 1; }
      case "hook_explore": { const n = postCounts?.[hook] ?? 0; return n === 0 ? 2.2 : n < 3 ? 1.5 : 1; }
      case "hook_diversify": { const n = postCounts?.[hook] ?? 0; return 1 / Math.sqrt(n + 1); } // 使用が多いほど下げ、少ないほど上げる
      case "hook_weak_down": { const b = blendAffinity(affinity[fullKey(hook, p)], promo[fullKey(hook, p)], basis); return b && b.median < 0.9 ? 0.4 : 1; }
      case "reach_impressions": { if (!impAvgByHook || !(impMedian > 0)) return 1; const v = impAvgByHook[hook]; if (v == null) return 1; return v >= impMedian * 1.1 ? 1.8 : v < impMedian * 0.9 ? 0.6 : 1; }
      case "promo_effective": { const pr = promo[fullKey(hook, p)]; return pr && pr.n >= MIN_AFFINITY_N && pr.median >= 1.1 ? 1.8 : 1; }
      case "custom_types": return hook.indexOf("⭐") === 0 ? 1.8 : 1;
      default: return 1; // length/format/image/engagement_rateはパターン単位（policyPatternMult）で効く
    }
  };
  const policyPatternMult = (p: string): number => {
    if (!focus) return 1;
    const pat = PATTERNS[p]; if (!pat) return 1;
    switch (focus.policy) {
      case "length_long": return pat.long ? 1.8 : 0.7;
      case "length_short": return !pat.long ? 1.8 : 0.7;
      case "format_thread": return pat.kind === "thread" ? 1.8 : 0.7;
      case "format_single": return pat.kind === "single" ? 1.8 : 0.7;
      case "image_on": return pat.image ? 1.8 : 0.7;
      case "image_off": return !pat.image ? 1.8 : 0.7;
      default: return 1;
    }
  };
  const hookW = (h: HookEntry, p: string) => (PW[h.priority] || 2) * perfFactor(fullKey(h.hook, p)) * policyHookMult(h.hook, p);
  const pweight = patterns.map((p) => (byPattern[p].hooks.reduce((s, h) => s + hookW(h, p), 0) || 1) * policyPatternMult(p));
  const alloc = allocateByWeight(count, pweight);
  const out: Array<{ body: string; hook: string; reply_text?: string }> = [];
  for (let pi = 0; pi < patterns.length; pi++) {
    const p = patterns[pi]; const k = alloc[pi]; if (!k) continue;
    const g = byPattern[p];
    const hooks = shuffle(g.hooks.map((h) => h.hook).filter((v, i, a) => a.indexOf(v) === i)); // 並び順バイアスを消す
    // 頻度ガイド：多め/控えめ＋（微調整期は）効き/伸び悩みを明示。どれもゼロにはしない。
    const more = g.hooks.filter((h) => h.priority === "more").map((h) => h.hook);
    const less = g.hooks.filter((h) => h.priority === "less").map((h) => h.hook);
    const strong = tune ? g.hooks.filter((h) => perfFactor(fullKey(h.hook, p)) > 1).map((h) => h.hook) : [];
    const weak = tune ? g.hooks.filter((h) => perfFactor(fullKey(h.hook, p)) < 1).map((h) => h.hook) : [];
    let freq = "## 型の使う頻度（目安。守りつつ、どの型もゼロにはせず探索を少し残す）\n";
    if (more.length) freq += "・多めに使う型：" + more.join("｜") + "\n";
    if (less.length) freq += "・控えめにする型（少なめ）：" + less.join("｜") + "\n";
    if (strong.length) freq += "・最近よく効いている型（増やす）：" + strong.join("｜") + "\n";
    if (weak.length) freq += "・最近伸び悩む型（減らす）：" + weak.join("｜") + "\n";
    if (focus?.label) freq += "・今回の方針：" + focus.label + "（該当の型・形式を意識して多めに）\n";
    const customGuide = (g.custom.length ? "## 採用中の自作の型（これらも使ってよい・hookは⭐名前で）\n" + g.custom.map((c) => "・" + c.hook + "：" + c.prompt).join("\n") + "\n\n" : "") + freq;
    // この生成回で既に作ったぶん（＋呼び出し元のseed）も「被り回避」に渡す＝同回内のネタ被りを防ぐ。
    const avoid = [...seedAvoid, ...out.map((d) => d.body)].filter(Boolean);
    out.push(...(await generateDrafts(env, account, k, guide, undefined, avoid, { pattern: p, hooks, customGuide })));
  }
  return out;
}

// 在庫の上限＝1日の本数 × サイクル日数（サイクル日数3〜5なので最大＝本数×5）。これを超えて貯めない。
export function inventoryCap(account: { daily_frequency: number; cycle_days: number }): number {
  return Math.max(account.daily_frequency * account.cycle_days, account.daily_frequency * 2);
}
// 在庫カウント用のSQL。自動投稿(auto)は queued のみを在庫と数える：
//   承認待ち(pending)は自動モードでは誰にも承認されず、在庫上限を塞いで補充を飢餓させるため（2026-07-03の実バグ）。
//   手動(queue)モードは pending が本命の在庫なので従来どおり両方数える。
function stockCountSql(approvalMode: string): string {
  return approvalMode === "auto"
    ? `SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND status = 'queued'`
    : `SELECT COUNT(*) AS n FROM posts WHERE account_id = ? AND status IN ('queued','pending')`;
}
// dayspan>0＝手動「1日分追加」（在庫上限まで・1日分）。dayspan=0＝通常サイクル（在庫上限まで・1日分）。
// src＝挿入する source。'tool'＝自動生成（サイクル切替で作り直し対象）。'manual'＝手動生成（会員操作＝作り直しで消さない）。
async function replenishForAccount(env: Env, account: Account, dayspan = 0, src: "tool" | "manual" = "tool", limitN = 0): Promise<number> {
  const perDay = Math.max(account.daily_frequency, 1);
  const target = inventoryCap(account);
  const q = await env.DB.prepare(stockCountSql(account.approval_mode))
    .bind(account.id)
    .first<{ n: number }>();
  const have = q?.n ?? 0;
  if (have >= target) return 0; // 在庫上限：これ以上は作らない（手動・自動とも）
  let need: number;
  if (dayspan > 0) {
    need = Math.min(perDay * dayspan, target - have); // 手動：1日分まで・上限を超えない
  } else {
    need = Math.min(target - have, perDay); // 通常サイクル：1日分まで
  }
  if (need <= 0) return 0;
  // limitN>0＝1リクエスト内の生成本数を絞る（会員ワーカーは無料プラン＝1リクエストに長い生成を
  // 詰めるとCloudflareの実行制限で落ちるため、画面側が1本ずつ複数リクエストに分けて呼ぶ）。
  if (limitN > 0) need = Math.min(need, limitN);
  const status = account.approval_mode === "auto" ? "queued" : "pending";

  // URL誘導は「自動承認モード」かつ「飛ばし先URLが登録済み」のときだけ自動で1本混ぜる。
  // URL未登録なら自動では作らない（プレースホルダを自動投稿しないため）。
  let urlToMake = 0;
  let chosenLink: { label: string; title?: string; desc?: string; url: string; note?: string } | null = null;
  if (status === "queued" && need >= 2) {
    const ui = await loadUrlInfo(env, account.id);
    if (ui.enabled && ui.links.length > 0) {
      urlToMake = 1;
      chosenLink = ui.links[have % ui.links.length]; // 登録URLを順番に使う
    }
  }

  const normalNeed = need - urlToMake;
  const drafts: Array<{ body: string; hook: string; reply_text?: string; link_code?: string }> = [];
  if (normalNeed > 0) {
    const base = "ネタからバランスよく選び、この会員の文体で書く。";
    // 学習フェーズで基本方針を変えつつ生成。「次の学習サイクルの指針」（cycle_focus）が設定されていれば、
    // genOmakase内部でグループ単位の重み付けとして重ねて効く（単一の狭い型を名指しでロックしない・②の修正）。
    const phase = await learnPhase(env, account.id);
    const guide = phase === "test"
      ? `${base}\n今は「テスト期」：採用中の型から幅広く、まだ反応データが少ない型も積極的に試す（探索優先）。`
      : `${base}\n今は「微調整期」：反応が良かった型を中心に、その型の“書き方の好み”を効かせて磨く（勝ち型を多めに・探索は2〜3割残す）。`;
    drafts.push(...(await genOmakase(env, account, normalNeed, guide)));
  }
  if (urlToMake > 0 && chosenLink) {
    // リンクタイトル・説明を渡して、1本目をその内容に沿った引きにする（飛び先はAIが読めないため）。
    const desc = chosenLink.desc || chosenLink.note || "";
    const titleLine = chosenLink.title ? `\n誘導先タイトル: ${chosenLink.title}` : "";
    const descLine = desc ? `\n誘導先の説明: ${desc}\n（1本目も2本目も、この説明に書かれている範囲だけで書く。説明に無い数字・成果・実績・具体・断定を新しく作らない＝飛び先を確認できないので飛躍・煽りは禁止。説明が短ければ無理に盛らず、書かれた価値をそのまま引きにする。言い回しは毎回変える）` : "\n（誘導先の説明が未入力。飛び先の中身を勝手に断定・具体化しない。会員の文体で、リンク先に続きがある、と自然に誘うにとどめる）";
    // 学習済み(url_affinity)があれば、クリック/CV実績で誘導スタイルを重み付け選択（床0.3で探索を残す）。未学習なら順番に回す。
    const urlAff = await loadUrlAffinity(env, account.id);
    let style: { label: string; angle: string };
    if (urlAff) {
      const ws = URL_STYLES.map((s) => Math.max(0.3, urlAff[`🔗 URL誘導・${s.label}`] ?? 1));
      const tot = ws.reduce((a, b) => a + b, 0);
      let r = Math.random() * tot; let idx = URL_STYLES.length - 1;
      for (let i = 0; i < URL_STYLES.length; i++) { r -= ws[i]; if (r <= 0) { idx = i; break; } }
      style = URL_STYLES[idx];
    } else {
      style = URL_STYLES[have % URL_STYLES.length]; // 未学習：誘導の型を順番に回す（探索）
    }
    // クリック＆CV解析：投稿には計測リンク(/r 経由)を入れる。codeは投稿に link_code として記録。
    // PUBLIC_URL未設定時は素のURL+?srにフォールバック（CVのみ計測）。
    const code = (chosenLink as { code?: string }).code || linkCode(account.id, chosenLink.url);
    const pub = await getPublicUrl(env);
    const taggedUrl = pub ? trackedLink(pub, account.id, code) : tagUrl(chosenLink.url, code);
    const instr = `${URL_TYPE_INSTRUCTION}\n${style.angle}\n誘導先URL: ${taggedUrl}（2本目にこのURLをそのまま、一字一句変えずに入れる）${titleLine}${descLine}`;
    // pattern=url で生成＝URL誘導の形式を厳守。hookは誘導スタイルで固定タグ（学習・集計・表示の紐付けを正確に）。
    const urlDrafts = await generateDrafts(env, account, 1, instr, undefined, drafts.map((d) => d.body), { pattern: "url", hooks: [`🔗 URL誘導・${style.label}`] });
    for (const d of urlDrafts) {
      await assignPerPostTracking(env, account, d, chosenLink.url, taggedUrl); // 投稿ごとの個別計測リンクに差し替え
      drafts.push({ ...d, hook: `🔗 URL誘導・${style.label}##url`, link_code: (d as { link_code?: string }).link_code || code });
    }
  }

  // 型被り防止：同じ型(hook)が3つ以内に再登場しないよう並べ替える（間に3つ以上挟む）。
  // 直近の予約/投稿済み3件の型を起点にして、配信順がかぶらないようにする。
  const seedRows = await env.DB.prepare(
    `SELECT hook FROM posts WHERE account_id = ? AND status IN ('queued','posted')
      ORDER BY COALESCE(not_before, posted_at, created_at) DESC LIMIT 3`
  ).bind(account.id).all<{ hook: string | null }>();
  const seedHooks = seedRows.results.map((r) => r.hook ?? "").reverse(); // 古い順
  const ordered = interleaveByHook(drafts, seedHooks);

  console.log(`[replenish] mode=${status} need=${need} 下書き=${drafts.length}件（url枠=${urlToMake}）`);
  let inserted = 0;
  for (const d of ordered) {
    // 自動投稿(queued)は基本配信時間＋ゆらぎで予約。手動(pending)は承認時に予約。
    const notBefore = status === "queued" ? await nextQueueSlot(env, account.id) : null;
    await env.DB.prepare(
      `INSERT INTO posts (account_id, platform, source, body, reply_text, hook, status, not_before, chars, line_breaks, link_code)
       VALUES (?, 'x', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        account.id,
        src,
        d.body,
        d.reply_text ?? null,
        d.hook ?? null,
        status,
        notBefore,
        weightedLength(d.body),
        (d.body.match(/\n/g) ?? []).length,
        (d as { link_code?: string }).link_code ?? null
      )
      .run();
    inserted++;
  }
  return inserted;
}

// オンボーディングのサンプル生成：本数を指定して生成し、必ず pending（承認待ち）で投入。
// サイクルの在庫ロジック（target/need）とは独立＝お試しで決まった本数を見せる用。
export async function generateSamples(
  env: Env,
  account: Account,
  count: number,
  instructions?: string,
  longMix?: boolean,
  typeLabel?: string,
  linkCodeVal?: string,
  urlForTracking?: string,
  pattern?: string
): Promise<number> {
  const genOpts = pattern ? { pattern } : undefined; // 型の開発：選んだパターン(長さ・形式)で生成
  const drafts = await generateDrafts(env, account, count, instructions, longMix, undefined, genOpts);
  const tl = (typeLabel ?? "").trim();
  const lc = (linkCodeVal ?? "").trim() || null; // URL誘導の手動生成時：URL共通コード（per-post差替できなかった時のフォールバック）
  // URL誘導の手動生成：本文に入っているURL共通リンクを、投稿ごとの個別リンクに差し替える。
  const pubBase = await getPublicUrl(env);
  const perUrlLink = urlForTracking && pubBase ? trackedLink(pubBase, account.id, linkCode(account.id, urlForTracking)) : "";
  let inserted = 0;
  for (const d of drafts) {
    if (urlForTracking && perUrlLink) await assignPerPostTracking(env, account, d, urlForTracking, perUrlLink);
    // 選んだ型があればそれを hook（型の種類）として記録。おまかせ時はAIの付けたラベル。
    await env.DB.prepare(
      `INSERT INTO posts (account_id, platform, source, body, reply_text, hook, status, chars, line_breaks, link_code)
       VALUES (?, 'x', 'tool', ?, ?, ?, 'pending', ?, ?, ?)`
    )
      .bind(
        account.id,
        d.body,
        d.reply_text ?? null,
        tl || d.hook || null,
        weightedLength(d.body),
        (d.body.match(/\n/g) ?? []).length,
        (d as { link_code?: string }).link_code || lc
      )
      .run();
    inserted++;
  }
  return inserted;
}

// サイクルが切り替わったか（cycle_days経過 or 初回）。学習＆作り直しはこの時だけ＝厳密にサイクルを保持。
async function isCycleTurn(env: Env, account: Account): Promise<boolean> {
  const st = await env.DB.prepare(
    `SELECT updated_at FROM cycle_state WHERE account_id = ?`
  )
    .bind(account.id)
    .first<{ updated_at: string }>();
  if (!st) return true; // 初回
  const ageDays = (Date.now() - parseSqlUtc(st.updated_at)) / 86400_000;
  return ageDays >= account.cycle_days;
}

async function stampCycle(env: Env, accountId: string, note: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cycle_state (account_id, step, note, updated_at)
     VALUES (?, 'done', ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET step = 'done', note = excluded.note, updated_at = datetime('now')`
  )
    .bind(accountId, note)
    .run();
}

// 全アカウントのサイクルを1回前進させる（Cronの空き枠から呼ばれる）。
// 手動の「予約を全消しして作り直す」ボタン用。
//   予約済み(queued)だけを削除し、その場で1日分を作り直す（残りは毎朝のサイクルで自動補充）。
//   学習(pending=添削待ち)や投稿済み(posted)には触らない。承認モードに応じて queued/pending を作る。
export async function regenerateForAccount(
  env: Env,
  accountId: string
): Promise<{ deleted: number; generated: number; mode: "auto" | "queue" }> {
  const acc = await loadAccount(env, accountId);
  if (!acc) return { deleted: 0, generated: 0, mode: "queue" };
  const del = await env.DB.prepare(
    `DELETE FROM posts WHERE account_id = ? AND status = 'queued'`
  ).bind(accountId).run();
  const deleted = (del as { meta?: { changes?: number } }).meta?.changes ?? 0;
  const generated = await replenishForAccount(env, acc); // 1サイクル分（上限＝1日分）を即時生成
  return { deleted, generated, mode: acc.approval_mode };
}

// 予約（queued）を全てキャンセル（削除のみ）。投稿済み・添削待ち(pending)は消さない。
export async function cancelQueuedForAccount(env: Env, accountId: string): Promise<{ deleted: number }> {
  const del = await env.DB.prepare(
    `DELETE FROM posts WHERE account_id = ? AND status = 'queued'`
  ).bind(accountId).run();
  return { deleted: (del as { meta?: { changes?: number } }).meta?.changes ?? 0 };
}

// 手動「1日分を追加」：1回1日分だけ即時生成（在庫上限まで）。source=manual＝サイクル切替の作り直しで消えない。
//   在庫が上限なら at_cap を返してUIでエラー表示。daysは無視（常に1日分）。
export async function generateDaysForAccount(env: Env, accountId: string, _days?: number, limitN = 0): Promise<{ generated: number; mode: "auto" | "manual"; at_cap?: boolean; cap?: number; have?: number; per_day?: number; room?: number }> {
  const acc = await loadAccount(env, accountId);
  if (!acc) return { generated: 0, mode: "manual" };
  const mode = acc.approval_mode === "auto" ? "auto" : "manual";
  const cap = inventoryCap(acc);
  const have = (await env.DB.prepare(stockCountSql(acc.approval_mode)).bind(accountId).first<{ n: number }>())?.n ?? 0;
  if (have >= cap) return { generated: 0, mode, at_cap: true, cap, have, per_day: acc.daily_frequency, room: 0 };
  const generated = await replenishForAccount(env, acc, 1, "manual", limitN); // 1日分・上限まで（limitN>0なら本数を絞る）
  return { generated, mode, cap, have: have + generated, per_day: acc.daily_frequency, room: Math.max(0, cap - have) };
}

export async function runCycle(
  env: Env
): Promise<Array<{ account: string; learned: boolean; generated: number }>> {
  const accounts = await loadActiveAccounts(env);
  const out: Array<{ account: string; learned: boolean; generated: number }> = [];
  for (const acc of accounts) {
    const r = await runCycleForAccount(env, acc);
    if (r) out.push({ account: acc.id, ...r });
  }
  return out;
}

// 1アカウントぶんのサイクルを回す（会員ごとに「最早スロットの少し前」で呼ぶ＝投稿前に在庫を用意）。
export async function runCycleForAccount(env: Env, acc: Account): Promise<{ learned: boolean; generated: number } | null> {
  if (!acc.platforms.includes("x")) return null;
  try {
    if (await isCycleTurn(env, acc)) {
      // ── サイクル切替：学習し直し → 古い傾向の“自動生成”予約を作り直し（厳密にサイクルを保持） ──
      const learned = await learnForAccount(env, acc);
      await learnUrlAffinity(env, acc); // URL誘導はクリック/CVで学習（誘導スタイルの良し悪し）
      await learnPromoAffinity(env, acc); // 広告ERの型別学習（広告を使った投稿がある人だけ・別基準）
      await autoUnadoptLowScore(env, acc); // 設定ONなら低スコア型を自動不採用（微調整期・床10維持）
      await updateExecNotes(env, acc); // 型別の実行ノート（微調整）を更新。新しい添削があった型だけ
      // 未投稿の“自動生成”予約(source=tool)だけ破棄。会員が編集/手動生成した分(source=manual)・承認待ち(pending)は残す。
      await env.DB.prepare(`DELETE FROM posts WHERE account_id = ? AND status = 'queued' AND source = 'tool'`).bind(acc.id).run();
      const generated = await replenishForAccount(env, acc); // 新しい学習で1日分（source=tool・設定中の指針があればここで反映）
      await clearFocus(env, acc.id); // 「次の学習サイクルの指針」は1サイクル限定＝ここで消費して自動解除（②の修正）
      await stampCycle(env, acc.id, `cycle turn learned=${learned} regen=${generated}`);
      return { learned, generated };
    }
    // ── サイクル途中：在庫が1日分を切ったら緊急補充のみ（学習・作り直し・スタンプはしない＝サイクル日数は進む） ──
    const have = (await env.DB.prepare(stockCountSql(acc.approval_mode)).bind(acc.id).first<{ n: number }>())?.n ?? 0;
    if (have < acc.daily_frequency) {
      const generated = await replenishForAccount(env, acc); // そのサイクルの学習のまま1日分（source=tool）
      return { learned: false, generated };
    }
    return { learned: false, generated: 0 };
  } catch (e) {
    console.error(`[${acc.id}] サイクル失敗: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
