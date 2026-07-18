// voice-agnostic 生成。設計書04章（個性は会員本人の文体）・09章。
//
// SNSの右腕の核：他の和佐工房と真逆で、和佐節は持ち込まない。
// 各会員自身の過去投稿（corpus.voice_samples）を「文体の正典」として、その人の声で書く。
// 集合知/ローカルの「効くパターン」は型・タイミングのレベルでだけ効かせる（金太郎飴化を防ぐ）。

import { callClaude, extractJson } from "./claude";
import { weightedLength } from "./xapi";
import { resolveCreds, type Account, type Env } from "./accounts";
import { checkPost } from "./filter";
import { logClaudeUsage } from "./usage";
import { PATTERNS, DEFAULT_ON, LONG_MIN_CHARS } from "./taxonomy";
import { refreshPrompts, getPromptPack } from "./prompts";

export interface GeneratedDraft {
  body: string;
  hook: string;
  reply_text?: string;
  link_code?: string; // URL誘導ポストの誘導先コード（クリック→CV解析の紐づけ・cycleで付与）
}

const DRAFTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          body: { type: "string" },
          hook: { type: "string" },
          reply_text: { type: "string" },
        },
        required: ["body", "hook"],
      },
    },
  },
  required: ["posts"],
};

async function loadCorpus(env: Env, accountId: string): Promise<Record<string, string>> {
  const rows = await env.DB.prepare(
    `SELECT key, content FROM corpus WHERE account_id = ?`
  )
    .bind(accountId)
    .all<{ key: string; content: string }>();
  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.content;
  return map;
}

// ネタ原石を未使用優先で選ぶ（カテゴリ循環の簡易版）。idも返す＝使用後に used_count を回すため。
async function pickGems(env: Env, accountId: string, n: number): Promise<Array<{ id: string; content: string }>> {
  const rows = await env.DB.prepare(
    `SELECT id, content FROM gems WHERE account_id = ?
     ORDER BY used_count ASC, last_used_at ASC NULLS FIRST LIMIT ?`
  )
    .bind(accountId, n)
    .all<{ id: string; content: string }>();
  return rows.results ?? [];
}

// 使ったネタ原石の used_count を回す（次回は別の種が未使用優先で surface する＝話題を機械的にローテーション）。
async function markGemsUsed(env: Env, accountId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const ph = ids.map(() => "?").join(",");
  await env.DB.prepare(
    `UPDATE gems SET used_count = used_count + 1, last_used_at = datetime('now') WHERE account_id = ? AND id IN (${ph})`
  ).bind(accountId, ...ids).run().catch(() => {});
}

// ネタ原石の自動配線：gemsが空でネタ元素材(neta_files)がある会員に、素材をAI(Haiku)で
// 「話題の種」に分解して gems に投入する（1会員1回。以後はローテーションが回る）。素材が無い/失敗時は何もしない。
// これが無いと gems は常に空＝話題ローテーションが効かず、モデルが同じ題材を言い換えて“ネタ被り”になる。
async function ensureGems(env: Env, accountId: string, claudeKey: string): Promise<void> {
  try {
    const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM gems WHERE account_id = ?`).bind(accountId).first<{ n: number }>();
    if ((cnt?.n ?? 0) > 0) return; // 既に配線済み
    const nrows = await env.DB.prepare(
      `SELECT content FROM neta_files WHERE account_id = ? ORDER BY created_at DESC`
    ).bind(accountId).all<{ content: string }>();
    // 種の抽出は「素材全体」から広く拾う（生成プロンプトの生素材は別途18000字キャップだが、種はコンパクトなので
    // 素材全体を対象にできる＝素材を増やすほど話題が増えてネタ被りが減る）。総量上限は GEMS_MATERIAL_CAP。
    const GEMS_MATERIAL_CAP = 90000; // 抽出に使う素材の総量上限（Haiku代を読める範囲に）
    const CHUNK = 30000;             // 1回のHaikuに渡す素材量（3チャンクまで）
    let material = "";
    for (const r of nrows.results ?? []) { material += (material ? "\n\n---\n\n" : "") + (r.content ?? ""); if (material.length > GEMS_MATERIAL_CAP) break; }
    material = material.slice(0, GEMS_MATERIAL_CAP).trim();
    if (!material) return; // 素材が無ければ配線しない（従来どおりテーマから自由生成）
    const seeds: string[] = [];
    for (let off = 0; off < material.length; off += CHUNK) {
      const chunk = material.slice(off, off + CHUNK);
      if (!chunk.trim()) continue;
      try {
        const { text, usage } = await callClaude({
          apiKey: claudeKey,
          model: "claude-haiku-4-5", // 抽出は安いHaiku（effort/思考オフ）
          noEffort: true, thinkingMode: "disabled", maxTokens: 4000, stream: false,
          system: [{
            text:
              "あなたは、与えられた素材から『投稿1本になりうる“話題の種”』を、できるだけ多く・重複なく列挙する専門家。" +
              "1つの種＝1つの具体的な題材/主張/エピソード/切り口（例：ある失敗談・ある数字・ある反論・ある比較・ある問い）。" +
              "抽象的なテーマ名ではなく、書き出しの取っ掛かりになる具体で。40〜80個。中身は素材の範囲から拾い、事実の捏造はしない。" +
              'JSON配列だけを返す（前置き・説明・コードフェンス無し）：["種1","種2",...]',
          }],
          userText: chunk,
        });
        await logClaudeUsage(env, accountId, "claude-haiku-4-5", usage, "gems_extract");
        const a = extractJson<string[]>(text);
        if (Array.isArray(a)) for (const s of a) if (typeof s === "string" && s.trim()) seeds.push(s.trim().slice(0, 200));
      } catch { /* このチャンクはスキップ */ }
    }
    // 重複を軽く除去して最大200個まで
    const seen = new Set<string>(); const uniq: string[] = [];
    for (const s of seeds) { const k = s.replace(/\s+/g, ""); if (!seen.has(k)) { seen.add(k); uniq.push(s); } if (uniq.length >= 200) break; }
    if (!uniq.length) return;
    for (let i = 0; i < uniq.length; i++) {
      const id = "A" + String(i + 1).padStart(3, "0");
      await env.DB.prepare(
        `INSERT INTO gems (account_id, id, category, content, source, ai_generated) VALUES (?, ?, 'auto', ?, 'neta', 1)
         ON CONFLICT(account_id, id) DO NOTHING`
      ).bind(accountId, id, uniq[i]).run().catch(() => {});
    }
  } catch { /* 抽出失敗でも生成は止めない */ }
}

// 添削の差分（before→after）と★評価を読み込んで、生成の指針にする。
// テーブル未作成でも生成は止めない（best-effort）。
//   editPairs＝添削(kind='edit')の差分／liked・avoid＝良い例・避ける例／exemplars＝★5お手本の実投稿。
//   ★は2系統：投稿済みへの自己評価(kind='post_rate')＝主／承認待ち時代の★(kind='rate')＝旧。
//   同じ post_id に post_rate があれば旧 rate はスキップ（二重計上しない）。★3(post_rate)は記録のみでAIに渡さない。
async function loadFeedback(
  env: Env,
  accountId: string
): Promise<{ editPairs: { before: string; after: string }[]; liked: string[]; avoid: string[]; exemplars: string[] }> {
  try {
    // 添削(edit)＋承認待ち時代の★(rate)。post_rate 混入で LIMIT を食い潰さないよう kind を絞る。
    const rows = await env.DB.prepare(
      `SELECT post_id, kind, rating, before_body, after_body FROM sample_feedback
       WHERE account_id = ? AND kind IN ('edit','rate') ORDER BY created_at DESC LIMIT 40`
    )
      .bind(accountId)
      .all<{ post_id: number | null; kind: string; rating: number | null; before_body: string | null; after_body: string | null }>();

    // 投稿済みポストへの自己評価(post_rate)。新しい順で最大100件。テーブル未整備でも止めない。
    let prRows: Array<{ post_id: number | null; rating: number | null; before_body: string | null }> = [];
    try {
      const pr = await env.DB.prepare(
        `SELECT post_id, rating, before_body FROM sample_feedback
         WHERE account_id = ? AND kind = 'post_rate' ORDER BY created_at DESC LIMIT 100`
      )
        .bind(accountId)
        .all<{ post_id: number | null; rating: number | null; before_body: string | null }>();
      prRows = pr.results ?? [];
    } catch { prRows = []; }
    // post_rate がある post_id は、旧 rate 行で二重に数えない（新しい post_rate を優先）。
    const prPostIds = new Set<number>();
    for (const r of prRows) { if (r.post_id != null) prPostIds.add(r.post_id); }

    const editPairs: { before: string; after: string }[] = [];
    for (const r of rows.results) {
      if (r.kind === "edit" && r.before_body && r.after_body && editPairs.length < 8) {
        editPairs.push({ before: r.before_body, after: r.after_body });
      }
    }

    // お手本＝post_rate★5の実投稿（新しい順・最大8件・各800字で切り詰め・合計6000字まで）。
    const exemplars: string[] = [];
    let exBudget = 6000;
    for (const r of prRows) {
      if ((r.rating ?? 0) !== 5 || !r.before_body) continue;
      if (exemplars.length >= 8) break;
      const s = r.before_body.length > 800 ? r.before_body.slice(0, 800) : r.before_body;
      if (exBudget - s.length < 0) break;
      exBudget -= s.length;
      exemplars.push(s);
    }

    // liked/avoid の合成（決定的）。いずれも新しい順・最大6件。★3(post_rate)は入れない（記録のみ）。
    const prStar4 = prRows.filter((r) => (r.rating ?? 0) === 4 && r.before_body).map((r) => r.before_body!);
    const prStar1 = prRows.filter((r) => (r.rating ?? 0) === 1 && r.before_body).map((r) => r.before_body!);
    const prStar2 = prRows.filter((r) => (r.rating ?? 0) === 2 && r.before_body).map((r) => r.before_body!);
    const rate5: string[] = []; // 旧 rate★5（post_rate のない post_id のみ）
    const rateLow: string[] = []; // 旧 rate★2以下（同上）
    for (const r of rows.results) {
      if (r.kind !== "rate" || !r.before_body) continue;
      if (r.post_id != null && prPostIds.has(r.post_id)) continue; // post_rate があればスキップ
      if ((r.rating ?? 0) === 5) rate5.push(r.before_body);
      else if ((r.rating ?? 0) <= 2) rateLow.push(r.before_body);
    }
    const liked = [...prStar4, ...rate5].slice(0, 6);
    const avoid = [...prStar1, ...prStar2, ...rateLow].slice(0, 6); // ★1が先頭＝最も避ける

    return { editPairs, liked, avoid, exemplars };
  } catch {
    return { editPairs: [], liked: [], avoid: [], exemplars: [] };
  }
}

// 直近◯日のポスト本文（ネタ被り防止用。全status＝下書き〜投稿済みを対象。件数は安全のため上限）
async function loadRecentBodies(env: Env, accountId: string, days: number, cap: number): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT body FROM posts WHERE account_id = ? AND body IS NOT NULL AND trim(body) <> ''
       AND created_at >= datetime('now', ?)
     ORDER BY created_at DESC LIMIT ?`
  )
    .bind(accountId, `-${Math.max(1, Math.round(days))} days`, cap)
    .all<{ body: string }>();
  return rows.results.map((r) => r.body);
}
// テキスト類似度＝文字bigramのJaccard（0〜1）。記号・空白を無視。
function normForSim(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[、。，．！？!?…・「」『』（）()\[\]【】#＃~〜ー]/g, "")
    .toLowerCase();
}
function bigramSet(s: string): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}
function textSimilarity(a: string, b: string): number {
  const A = bigramSet(normForSim(a));
  const B = bigramSet(normForSim(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
const SIMILAR_THRESHOLD = 0.35; // これ以上は「かぶり」として落とす（直近20日と一切かぶらせない方針。調整可）

export async function generateDrafts(
  env: Env,
  account: Account,
  count: number,
  instructions?: string,
  longMix?: boolean,
  avoidBodies?: string[], // 追加で「かぶらせない」本文（型トレーニングの既出サンプル等＝DB未保存ぶん）
  genOpts?: { pattern?: string; hooks?: string[]; customGuide?: string } // 型のパターン(長さ・形式)＋使う切り口リスト
): Promise<GeneratedDraft[]> {
  // Claude鍵は会員所有（必須）。運営の共通鍵にはフォールバックしない（限界費用ゼロ・設計書02章）。
  const claudeKeyMaybe = (await resolveCreds(env, account.id))?.claudeKey;
  if (!claudeKeyMaybe) throw new Error(`[${account.id}] Claude APIキーが未設定です（連携時に会員が入力）`);
  const claudeKey: string = claudeKeyMaybe; // クロージャ(runRound)でも string として扱えるよう束ねる
  // プロンプト本体（運営資産）を本部から取得し、型指示(taxonomy)も反映。取得できなければ生成しない（資産はコードに持たない）。
  const pack = await refreshPrompts(env);
  if (!pack) throw new Error(`[${account.id}] プロンプト本体を取得できません（本部不通・キャッシュ無し）。次回に回します。`);

  const corpus = await loadCorpus(env, account.id);
  // 添削差分・★評価・お手本(★5)を先に読む。exemplars を「かぶらせない対象(recent)」に合流させるため前倒し。
  const fb = await loadFeedback(env, account.id);
  const voiceSamples = corpus.voice_samples ?? ""; // 過去ポスト（連携/再学習）
  const voiceEdits = corpus.voice_edits ?? "";     // 添削ぶん（会員が手直し承認した文章）
  const winning = corpus.winning_patterns ?? "";
  const direction = corpus.direction ?? ""; // 発信の方向性（何を・誰に・どんなスタンスで）
  // URL誘導モード＝飛び先の説明に忠実に書く。話題の種・ネタ元素材・自動拡張は使わない（無関係な素材の
  // 混入や、飛び先の中身の捏造＝飛躍を防ぐ。文体サンプルは通常どおり使う）。指示側(instructions)に説明が入る。
  const urlMode = genOpts?.pattern === "url";
  let gems: string[] = [];
  if (!urlMode) {
    await ensureGems(env, account.id, claudeKey); // 素材から話題の種を配線（空の会員のみ・1回）＝ネタ被り対策の要
    // 1本あたり少なめに絞って回す（種を早く食い潰さない）。使った種は used_count を回して次回は別の種を出す。
    const gemPicks = await pickGems(env, account.id, Math.max(count + 2, 4));
    gems = gemPicks.map((g) => g.content);
    await markGemsUsed(env, account.id, gemPicks.map((g) => g.id));
  }
  const recent = await loadRecentBodies(env, account.id, 20, 250); // 直近20日（最大250件）＝ネタ被り厳禁の対象
  // 型トレーニングの既出サンプルはpostsに保存されないので、明示で渡された本文を被り対象に合流（先頭＝最優先で避ける）
  if (avoidBodies && avoidBodies.length) {
    for (const a of avoidBodies) { const t = (a || "").trim(); if (t) recent.unshift(t); }
  }
  // ★5お手本も「かぶらせない対象」に入れる＝お手本の焼き直し（クローン）は類似度フィルタで自動的に落ちる。
  for (const ex of fb.exemplars) { const t = (ex || "").trim(); if (t) recent.push(t); }
  // X有料プランなら長文ポストを許可。無料=140字（重み280）／有料=最大1000字（重み2000）。
  const premiumRow = await env.DB.prepare(
    `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'x_premium'`
  )
    .bind(account.id)
    .first<{ v: string }>();
  const premium = premiumRow?.v === "1" || premiumRow?.v === "true";
  const charMax = premium ? 1000 : 140;
  const weightMax = premium ? 2000 : 280;
  const LONG_MIN = LONG_MIN_CHARS; // 長文の定義（日本語200字以上）
  // 型のパターンで形式(単発/連結)と長さ(短/長)を決める。pattern未指定なら従来挙動。
  const pat = genOpts?.pattern ? PATTERNS[genOpts.pattern] : null;
  const isThreadType = pat ? pat.kind === "thread" : (instructions ?? "").includes("2つの連続ポスト");
  // 単発・長文＝全本を長文／単発・短文＝0／連結＝1本目は常に短文（長さは2本目で出す）。
  const longN = pat
    ? (pat.kind === "single" && pat.long ? count : 0)
    : (premium && !isThreadType && (longMix === undefined ? true : longMix) ? Math.max(1, Math.round(count * 0.4)) : 0);
  // 連結の2本目(reply)の長さ：thread_long は長文(≥200)、thread_short は短文(≤140)。
  const replyLong = pat ? (pat.kind === "thread" && pat.long) : false;
  const replyMaxWeight = isThreadType ? (replyLong ? weightMax : 280) : weightMax;
  const replyMinWeight = isThreadType && replyLong ? LONG_MIN * 2 : 0; // 200字≒重み400
  // 本文(body)上限：連結は常に280(=140字)。単発は短文なら280(=140字)、長文ならプラン上限。
  // ※パターン指定時は短文/長文を厳格に区別（Premiumでも短文が140字を超えないように）。未指定(レガシー混在)は従来通り。
  const bodyWeightMax = isThreadType
    ? 280
    : (pat ? (pat.long ? weightMax : 280) : weightMax);
  // ネタ元データ（会員アップロードの内容素材）。総量を約18000字に抑えてサンプル。テーブル未作成でも止めない。
  // URL誘導モードでは注入しない（飛び先の説明に集中させ、無関係な素材の混入＝ズレを防ぐ）。
  let neta = "";
  if (!urlMode) {
    try {
      const nrows = await env.DB.prepare(
        `SELECT content FROM neta_files WHERE account_id = ? ORDER BY created_at DESC`
      )
        .bind(account.id)
        .all<{ content: string }>();
      for (const r of nrows.results) {
        if (neta.length > 18000) break;
        neta += (neta ? "\n\n---\n\n" : "") + r.content;
      }
      if (neta.length > 18000) neta = neta.slice(0, 18000);
    } catch { /* neta_files未作成 */ }
  }
  // 学習データの自動拡張（ON=範囲を超えてAIが内容も考える / OFF=範囲を出ない）
  const aeRow = await env.DB.prepare(
    `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'auto_expand'`
  )
    .bind(account.id)
    .first<{ v: string }>();
  const autoExpand = aeRow?.v === "1";

  // 使う切り口（hook）＝呼び出し側が渡す（パターンごと）。無ければDEFAULT_ONの切り口（##前）を既定に。
  const activeHooks: string[] = (genOpts?.hooks && genOpts.hooks.length)
    ? genOpts.hooks.slice()
    : DEFAULT_ON.map((k) => k.split("##")[0]).filter((v, i, a) => a.indexOf(v) === i);
  const customGuide = genOpts?.customGuide || "";
  // 成果（反応）から学んだ傾向：効くフック型・伸びる時間帯（cycleがindividual_profileに集計）
  let learnedTrend = "";
  try {
    const prof = await env.DB.prepare(
      `SELECT key, value_json AS v FROM individual_profile WHERE account_id = ? AND key IN ('hook_affinity','best_hours','length_pref','format_pref')`
    )
      .bind(account.id)
      .all<{ key: string; v: string }>();
    const pm: Record<string, unknown> = {};
    for (const r of prof.results) { try { pm[r.key] = JSON.parse(r.v); } catch { /* skip */ } }
    const ha = pm.hook_affinity as Array<{ key: string }> | undefined;
    const bh = pm.best_hours as Array<{ key: string }> | undefined;
    const hooksA = Array.isArray(ha) ? ha.slice(0, 3).map((h) => h.key).filter(Boolean) : [];
    const hours = Array.isArray(bh) ? bh.slice(0, 3).map((h) => h.key + "時").filter(Boolean) : [];
    const parts: string[] = [];
    if (hooksA.length) parts.push(`反応が良かった切り口：${hooksA.join("・")}（優先的に試す）`);
    if (hours.length) parts.push(`反応が良かった時間帯：${hours.join("・")}`);
    learnedTrend = parts.join("\n");
  } catch { /* individual_profile未蓄積 */ }

  const system: { text: string; cache?: boolean }[] = [
    { text: pack.system, cache: true },              // 中核system（運営資産・Hubから）
    { text: pack.system_thread, cache: true },       // 連結スレッドの鉄則（運営資産・Hubから）
  ];
  if (voiceSamples.trim()) {
    // プロンプトが重くなりすぎないよう上限（最大4万字）。安定プレフィックスなのでキャッシュに載せる。
    const v = voiceSamples.length > 40000 ? voiceSamples.slice(0, 40000) : voiceSamples;
    system.push({ text: `## この会員の文体サンプル（過去ポスト・正典）\n${v}`, cache: true });
  }
  if (voiceEdits.trim()) {
    // 添削ぶん＝会員が手直しして承認した文章。最新ほど効くので末尾2万字を採用。文体の特に強い手本。
    const e = voiceEdits.length > 20000 ? voiceEdits.slice(-20000) : voiceEdits;
    system.push({ text: `## あなたが手直し・承認した文章（文体の特に重要な手本。最優先で寄せる）\n${e}` });
  }
  if (fb.exemplars.length) {
    // ★5お手本＝本人が「これが理想」と認めた実投稿。書き方・構成の最優先の手本（題材の使い回しは禁止）。
    system.push({
      text:
        `## お手本ポスト（この会員が★5を付けた実際の投稿。文体・構成・切り口の最優先の手本）\n` +
        `以下は本人が「これが理想」と認めた実投稿。書き方・リズム・構成はここに最優先で寄せる。ただし題材の使い回しはしない（同じ内容の書き直し・焼き直しは禁止。あくまで“書き方”の手本）。\n` +
        fb.exemplars.join("\n---\n"),
    });
  }
  if (direction.trim()) {
    // 文体は voice_samples が正典。ここは「何を・誰に・どんなスタンスで」の内容の方向性のみ。
    system.push({
      text: `## このアカウントの発信の方向性（内容の指針。文体は上のサンプルが正典）\n${direction}`,
      cache: true,
    });
  }
  if (neta.trim()) {
    // ネタ元データ＝内容の素材（文体ではない）。ここから題材・主張・具体例を拾う。
    system.push({
      text: `## ネタ元データ（会員が用意した「内容の素材」。ここから題材・主張・具体例を拾って書く。文体は上のサンプルが正典で、ここは内容のみ）\n${neta}`,
    });
  }
  // 内容の範囲ポリシー（自動拡張のON/OFF）。
  // URL誘導モードは会員のON/OFF設定に関わらず「厳守」＝飛び先の説明を超えて敷衍しない（飛び先は確認できず、
  // 書いていない数字・成果・具体を作ると"飛躍"になるため）。指示側で渡す誘導先の説明・タイトルだけを根拠にする。
  system.push({
    text: urlMode
      ? `## 内容の範囲：URL誘導（厳守）\n下の指示にある「誘導先の説明・タイトル」に書かれている範囲だけで書く。説明に無い数字・実績・成果・断定・具体を新しく作らない（飛び先ページは読めないので、書いていないことを事実のように言わない＝飛躍・煽りの禁止）。説明が短いときは無理に具体を盛らず、説明された価値をそのまま引きにする。`
      : autoExpand
        ? `## 内容の範囲：自動拡張ON\nネタ元データ・方向性を起点に、関連する内容はAIがある程度ふくらませて書いてよい（方向性・スタンスは守る。事実の捏造はしない）。`
        : `## 内容の範囲：自動拡張OFF（厳守）\nネタ元データ・方向性に書かれている範囲を超えない。書かれていない新しい主張・エピソード・固有の事実は作らない。素材の中から書く。`,
  });

  // 型別の「実行ノート」（微調整）：その型を書くときの会員の書き方の好み（cycleがHaikuで要約・蓄積）。
  let execNotesText = "";
  try {
    const er = await env.DB.prepare(
      `SELECT value_json AS v FROM individual_profile WHERE account_id = ? AND key = 'exec_notes'`
    ).bind(account.id).first<{ v: string }>();
    if (er?.v) {
      const m = JSON.parse(er.v) as Record<string, { note?: string }>;
      const lines = Object.entries(m)
        .filter(([, o]) => o && o.note)
        .slice(0, 12)
        .map(([h, o]) => `・${h}：${o.note}`);
      if (lines.length) execNotesText = lines.join("\n");
    }
  } catch { /* 未蓄積 */ }
  if (execNotesText) {
    system.push({
      text:
        `## 型別の書き方の好み（この会員の傾向。その型で書くときだけ、この“書き方”に寄せる。内容は会員のもの）\n${execNotesText}`,
    });
  }

  // 添削の差分（AI初稿→会員の直し）と★評価を生成の指針に。差分学習＝最初から直された形で書く。
  // ※ fb は loadCorpus 直後で取得済み（exemplars を recent に合流させるため前倒し）。
  if (fb.editPairs.length) {
    const pairs = fb.editPairs
      .map((p, i) => `【例${i + 1}】\nAI初稿：${p.before}\n会員の直し：${p.after}`)
      .join("\n\n");
    system.push({
      text:
        `## 添削の傾向（最重要）\n` +
        `この会員はAIの初稿を下のように直す。次は「直したあとの形」を最初から書くこと（同じ直しをさせない）。\n${pairs}`,
    });
  }
  if (fb.liked.length) {
    system.push({ text: `## 良い例（会員が高評価。この方向を増やす）\n${fb.liked.join("\n---\n")}` });
  }
  if (fb.avoid.length) {
    system.push({ text: `## 避ける例（会員が低評価。この方向は避ける）\n${fb.avoid.join("\n---\n")}` });
  }

  if (learnedTrend) {
    system.push({ text: `## 成果から学んだ傾向（実際の反応データ。型・タイミングの参考）\n${learnedTrend}` });
  }
  if (winning.trim()) {
    system.push({ text: `## 効くパターン（型・タイミングの参考のみ）\n${winning}` });
  }
  if (recent.length) {
    // 直近50件と「一切かぶらせない」。本文をそのまま渡して厳禁する。
    // プロンプトが膨らみすぎないよう各本文は要点まで（280字）・全体上限（約15000字）でサンプル。
    let budget = 15000;
    const shown: string[] = [];
    for (const r of recent) {
      const snippet = r.length > 280 ? r.slice(0, 280) + "…" : r;
      if (budget - snippet.length < 0) break;
      budget -= snippet.length;
      shown.push(snippet);
    }
    system.push({
      text:
        `## 直近20日のポスト（【厳守】これらと一切かぶらせない）\n` +
        `下のポストと、テーマ・主張・書き出し・使う具体例・たとえ・締めの言い回しが重複しないこと。` +
        `同じ題材・同じ話を言い換えただけのポストは禁止。毎回ちがう題材・ちがう切り口で書く。\n` +
        shown.join("\n---\n"),
    });
  }

  // hook（型）は集計できるよう正典リストに寄せる。ただし指示側で型名を指定している場合（URL誘導等）はそちらを優先。
  const hasHookDirective = (instructions ?? "").includes("hook");
  const hookRule = hasHookDirective
    ? ""
    : `hook には必ず次の型名リストから、その投稿に最も近いものを1つだけ選んで入れる（リストに無い新しい名前は作らない・複数書かない・記号も含めて表記どおり）：${activeHooks.join("｜")}。`
      + (customGuide ? "\n\n" + customGuide : "");

  // 生成ルール（運営資産）はHubパックから。{LONG_MIN}は実値に差し替え。組み立ての条件分岐はコードが持つ。
  const longHookRule = pack.rules.long_hook;
  // ※URL誘導(pat.url)は専用指示（1本目引き→2本目CTA+URL）を instructions 側で渡すので、汎用threadRuleは出さない。
  const threadRule = (isThreadType && !pat?.url)
    ? pack.rules.thread_head
      + (replyLong ? pack.rules.thread_reply_long.replace("{LONG_MIN}", String(LONG_MIN)) + longHookRule : pack.rules.thread_reply_short) + `\n\n`
    : "";
  // 単発パターン：1ポスト完結。2本目（reply_text）を出させない（出たら後処理でも捨てる）。
  const singleRule = (pat && pat.kind === "single") ? pack.rules.single : "";

  // 1ラウンド分の生成。system（重い文脈）は使い回す＝プロンプトキャッシュが効く。床チェックまでして返す。
  async function runRound(n: number, longNForRound: number): Promise<GeneratedDraft[]> {
    const userText =
      `# 今回の題材（この中から選んで書く。毎回ちがう種が出るので、下の「直近ポスト」と題材が被らないものを優先）\n${gems.length ? gems.map((g) => "・" + g).join("\n") : "（ネタプール未登録。会員のテーマに沿って書く）"}\n\n` +
      `# 指示\n${instructions ?? "ネタからバランスよく選び、この会員の文体で書く。"}\n\n` +
      threadRule + singleRule +
      `# 制約\n${longNForRound > 0 ? n + "本のうち、ちょうど" + longNForRound + "本は必ず日本語" + LONG_MIN + "字以上の長文にする（理想300字前後・最大" + charMax + "字。改行で段落を作り、体験→深掘り→気づき等で展開。" + LONG_MIN + "字を必ず超えること）。残り" + (n - longNForRound) + "本は140字以内の短文。※文体・語彙はサンプル準拠だが、長文では短くまとめず十分に展開する（サンプルが短いからと縮めない）。" : "本文(body)は必ず日本語140文字以内に収める。"}（英数字は2文字で1カウント）\n\n` +
      `${n}本、指定のJSON形式で返す。各postは body（本文）と hook` + (isThreadType ? "、reply_text（2本目）" : "（reply_textは付けない）") + "。" +
      hookRule;
    const { text, usage } = await callClaude({
      apiKey: claudeKey,
      model: env.GEN_MODEL,
      effort: "high",
      schema: DRAFTS_SCHEMA,
      system,
      userText,
      stream: true, // 5本生成は数十秒〜2分かかる → ストリーミングで524回避
    });
    await logClaudeUsage(env, account.id, env.GEN_MODEL || "claude-opus-4-8", usage, "generate"); // モデル別の料金記録
    let parsed: { posts?: GeneratedDraft[] };
    try {
      parsed = extractJson(text);
    } catch (je) {
      // 拒否応答や構造化失敗時は空。原因調査のため要約をログに残す（本文は先頭だけ）。
      console.error(`[gen] JSON抽出失敗: ${je instanceof Error ? je.message : je} / text先頭=${(text || "").slice(0, 100).replace(/\n/g, " ")}`);
      return [];
    }
    const ds = (parsed.posts ?? []).filter((d) => d.body && d.body.trim());
    // 床チェック：字数オーバー／不足／禁止パターン（08章 Layer 1）に触れるものは落とす。
    // どこで何件落ちたかをログに残す（生成が静かに0件になる問題の診断用）。
    const drop = { len: 0, replyMissing: 0, replyLen: 0, ng: 0 };
    const kept0 = ds.filter((d) => {
      if (weightedLength(d.body) > bodyWeightMax) { drop.len++; return false; }
      // パターンが分かっているときは形式を強制：単発は2本目を捨て、連結は2本目が無ければ落とす。
      if (pat) {
        if (pat.kind === "single") { if (d.reply_text) delete d.reply_text; }
        else if (!(d.reply_text && d.reply_text.trim())) { drop.replyMissing++; return false; }
      }
      const rw = (d.reply_text && d.reply_text.trim()) ? weightedLength(d.reply_text) : 0;
      if (rw > replyMaxWeight) { drop.replyLen++; return false; }
      if (replyMinWeight > 0 && rw < replyMinWeight) { drop.replyLen++; return false; } // 連結・短＋長：2本目が短すぎたら落とす
      if (checkPost(d.body).length > 0) { drop.ng++; return false; }
      return true;
    });
    console.log(`[gen] pat=${pat ? pat.kind : "-"} 生成=${ds.length} 採用=${kept0.length} 落選={字数:${drop.len},2本目欠:${drop.replyMissing},2本目長短:${drop.replyLen},禁止:${drop.ng}} 上限=${bodyWeightMax}`);
    return kept0;
  }

  // 直近50件＋同バッチと「一切かぶらない」よう機械的に弾く。落ちた分は追加生成で埋める（最大3ラウンド）。
  const kept: GeneratedDraft[] = [];
  for (let round = 0; round < 3 && kept.length < count; round++) {
    const need = count - kept.length;
    const longNForRound = round === 0 ? longN : 0; // 長文ミックスは初回ラウンドのみ
    const drafts = await runRound(need, longNForRound);
    if (drafts.length === 0) break; // 生成0＝これ以上粘らない（無駄打ち防止）
    for (const d of drafts) {
      if (kept.length >= count) break;
      const dupRecent = recent.some((r) => textSimilarity(d.body, r) >= SIMILAR_THRESHOLD);
      const dupBatch = kept.some((k) => textSimilarity(d.body, k.body) >= SIMILAR_THRESHOLD);
      if (!dupRecent && !dupBatch) kept.push(d);
    }
  }
  // パターン指定時：hookを型キー（切り口##パターン）に揃える（集計・採用と一致させる）。
  if (genOpts?.pattern) {
    for (const d of kept) {
      const base = (d.hook || "").split("##")[0].trim();
      if (base && base.indexOf("⭐") !== 0) d.hook = `${base}##${genOpts.pattern}`;
    }
  }
  return kept;
}

// 画像カードの中身（見出し一文 / 箇条書き）を本文からAI(Haiku)で生成。安いモデルで要約のみ。
export async function distillCardText(env: Env, accountId: string, body: string, imageType: string): Promise<string> {
  const claudeKey = (await resolveCreds(env, accountId))?.claudeKey || env.ANTHROPIC_API_KEY;
  if (!claudeKey) throw new Error(`[${accountId}] Claude APIキーが未設定です`);
  // distillプロンプト（運営資産）はHubパックから。取得できなければ本文スライスにフォールバック（カードは止めない）。
  const pack = await getPromptPack(env);
  if (!pack) return body.slice(0, imageType === "oneliner" ? 35 : 80);
  const sys = imageType === "compare" ? pack.distill.compare : imageType === "list" ? pack.distill.list : pack.distill.oneliner;
  // Haiku4.5は adaptive thinking も effort パラメータも非対応（どちらも付くと400）。要約用途なので両方オフにする。
  const { text, usage } = await callClaude({ apiKey: claudeKey, model: "claude-haiku-4-5", noEffort: true, thinkingMode: "disabled", system: [{ text: sys }], userText: body, stream: false, maxTokens: 320 });
  await logClaudeUsage(env, accountId, "claude-haiku-4-5", usage, "card_distill");
  let out = (text || "").trim().replace(/^[「『""'']+|[」』""'']+$/g, "").trim();
  if (!out) out = body.slice(0, imageType === "oneliner" ? 35 : 80);
  return out;
}
