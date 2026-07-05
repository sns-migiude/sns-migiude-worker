// ポストの「型」の正典リスト。型＝「切り口(hook)」×「長さ・形式パターン」。
// パターン(2026-06-29)：単発・短文／単発・長文／連結・短文／連結・短＋長 の4種。
//   型キー＝`${hook}##${pattern}`。表示名＝`${hook}（パターン名）`。生成はパターンに従って長さ・形式を固定。
//   長文＝日本語200字以上、短文＝140字以内。連結は1本目を必ず140字以内（引き）。

// 切り口（hook）。単発系。
export const POST_HOOKS = [
  "数字・実績から", "体験・告白から", "逆張り・言い切り", "1行目のフック強め", "たとえ話",
  "作品・引用から", "問いかけ", "箇条書き",
  "定義づけ", "ビフォーアフター", "誤解を正す", "チェックリスト", "手順・ステップ", "比較・対比",
  "未来予測", "警告", "あるある共感", "価値観の表明", "ランキング", "反論先回り", "意外な数字",
  "ひとことメモ", "Q&A",
];
// 切り口（hook）。連結系（2ポスト）。
export const THREAD_HOOKS = [
  "🧵 体験→気づき", "🧵 結論→理由", "🧵 常識→本音", "🧵 事例→法則", "🧵 数字→裏側", "🧵 問い→逆転の答え",
  "🧵 物語→教訓", "🧵 問題→解決", "🧵 誤解→真実", "🧵 失敗→立て直し", "🧵 手順（前半→後半）",
];

// 長さ・形式パターン。url＝URL誘導（連結固定・2本目にリンク・解放制）。image＝画像カード付き（解放＝画像カードON）。
export interface Pattern { label: string; kind: "single" | "thread"; long: boolean; url?: boolean; image?: "oneliner" | "list" }
export const PATTERNS: Record<string, Pattern> = {
  single_short: { label: "単発・短文", kind: "single", long: false },
  single_long: { label: "単発・長文", kind: "single", long: true },
  thread_short: { label: "連結・短文", kind: "thread", long: false },
  thread_long: { label: "連結・短＋長", kind: "thread", long: true },
  url: { label: "🔗 URLに繋げる", kind: "thread", long: false, url: true },
  // 画像付き（解放＝画像カードON）。4形式×2中身(一文/箇条書き)＝8パターン。labelは会員向け表示そのまま。
  img_ss_one: { label: "🖼 短文・単発＋画像（一文）", kind: "single", long: false, image: "oneliner" },
  img_sl_one: { label: "🖼 長文・単発＋画像（一文）", kind: "single", long: true, image: "oneliner" },
  img_ts_one: { label: "🖼 短文＋短文・連結＋画像（一文）", kind: "thread", long: false, image: "oneliner" },
  img_tl_one: { label: "🖼 短文＋長文・連結＋画像（一文）", kind: "thread", long: true, image: "oneliner" },
  img_ss_list: { label: "🖼 短文・単発＋画像（箇条書き）", kind: "single", long: false, image: "list" },
  img_sl_list: { label: "🖼 長文・単発＋画像（箇条書き）", kind: "single", long: true, image: "list" },
  img_ts_list: { label: "🖼 短文＋短文・連結＋画像（箇条書き）", kind: "thread", long: false, image: "list" },
  img_tl_list: { label: "🖼 短文＋長文・連結＋画像（箇条書き）", kind: "thread", long: true, image: "list" },
  // 旧キー（後方互換・カタログには出さない）。
  img_oneliner: { label: "🖼 画像・一文", kind: "single", long: false, image: "oneliner" },
  img_list: { label: "🖼 画像・箇条書き", kind: "single", long: false, image: "list" },
};
export const LONG_MIN_CHARS = 200; // 長文＝日本語200字以上

// 「比較・対比」フックの画像カードは2列(compare)で描く。箇条書き(list)指定でもこのフックだけ compare に差し替える。
export const COMPARE_HOOK = "比較・対比";
export function resolveImageType(hook: string | null | undefined, baseImage: string): string {
  return baseImage === "list" && hook === COMPARE_HOOK ? "compare" : baseImage;
}

// URL誘導の生成指示（本体は本部Hub。hydrateTaxonomyで注入）。ラベル（足場）はコードに残す。
export let URL_TYPE_INSTRUCTION = "";

// URL誘導の「誘導の型」。ラベル（足場・カタログ構築に必要）はコードに残し、角度（運営資産）はHubから注入する。
export let URL_STYLES: Array<{ label: string; angle: string }> = [
  { label: "結論→続きはリンク", angle: "" },
  { label: "体験談→リンク", angle: "" },
  { label: "問題提起→リンク", angle: "" },
  { label: "数字・実績→リンク", angle: "" },
  { label: "一部公開→リンク", angle: "" },
  { label: "告知・締切→リンク", angle: "" },
];

// hookに適用するパターン（B方式＝組み合わせを用意）。
function patternsForHook(hook: string): string[] {
  if (THREAD_HOOKS.indexOf(hook) >= 0) return ["thread_short", "thread_long"];
  if (hook === "ひとことメモ") return ["single_short"]; // 一言メモは長文にしない
  return ["single_short", "single_long"];
}

export interface CatalogType { key: string; hook: string; pattern: string; name: string; kind: "single" | "thread"; long: boolean }

// カタログ＝hook×パターンを展開。末尾にURL誘導(url)の各スタイルも並べる（解放制＝表示はindex側で出し分け）。
export const CATALOG: CatalogType[] = (() => {
  const out: CatalogType[] = [];
  for (const hook of [...POST_HOOKS, ...THREAD_HOOKS]) {
    for (const p of patternsForHook(hook)) {
      const pat = PATTERNS[p];
      out.push({ key: `${hook}##${p}`, hook, pattern: p, name: `${hook}（${pat.label}）`, kind: pat.kind, long: pat.long });
    }
  }
  for (const style of URL_STYLES) {
    const hook = `🔗 URL誘導・${style.label}`;
    out.push({ key: `${hook}##url`, hook, pattern: "url", name: `🔗 ${style.label}`, kind: "thread", long: false });
  }
  // 画像付きの型（カタログ・解放制）。4形式×2中身＝8カテゴリ、各5切り口＝計40種。
  //   一文＝見出し/名言向きの切り口、箇条書き＝列挙向きの切り口。単発は単発hook、連結は連結hookを使う。
  const IMG_SINGLE_ONE_HOOKS = ["逆張り・言い切り", "1行目のフック強め", "価値観の表明", "体験・告白から", "定義づけ"];
  const IMG_SINGLE_LIST_HOOKS = ["箇条書き", "手順・ステップ", "チェックリスト", "ランキング", "比較・対比"];
  const IMG_THREAD_ONE_HOOKS = ["🧵 結論→理由", "🧵 常識→本音", "🧵 体験→気づき", "🧵 問い→逆転の答え", "🧵 物語→教訓"];
  const IMG_THREAD_LIST_HOOKS = ["🧵 手順（前半→後半）", "🧵 問題→解決", "🧵 事例→法則", "🧵 数字→裏側", "🧵 失敗→立て直し"];
  const IMG_CATS: Array<{ p: string; hooks: string[] }> = [
    { p: "img_ss_one", hooks: IMG_SINGLE_ONE_HOOKS },
    { p: "img_sl_one", hooks: IMG_SINGLE_ONE_HOOKS },
    { p: "img_ss_list", hooks: IMG_SINGLE_LIST_HOOKS },
    { p: "img_sl_list", hooks: IMG_SINGLE_LIST_HOOKS },
    { p: "img_ts_one", hooks: IMG_THREAD_ONE_HOOKS },
    { p: "img_tl_one", hooks: IMG_THREAD_ONE_HOOKS },
    { p: "img_ts_list", hooks: IMG_THREAD_LIST_HOOKS },
    { p: "img_tl_list", hooks: IMG_THREAD_LIST_HOOKS },
  ];
  for (const cat of IMG_CATS) {
    const pat = PATTERNS[cat.p];
    for (const hook of cat.hooks) out.push({ key: `${hook}##${cat.p}`, hook, pattern: cat.p, name: `${hook}（${pat.label}）`, kind: pat.kind, long: pat.long });
  }
  return out;
})();
export const CATALOG_KEYS = CATALOG.map((c) => c.key);
const CATALOG_BY_KEY: Record<string, CatalogType> = (() => { const m: Record<string, CatalogType> = {}; for (const c of CATALOG) m[c.key] = c; return m; })();

// 新規会員でも自動ONにするコア（各パターンからバランスよく10種）。
export const DEFAULT_ON = [
  "体験・告白から##single_short",
  "逆張り・言い切り##single_short",
  "1行目のフック強め##single_short",
  "数字・実績から##single_short",
  "問いかけ##single_short",
  "体験・告白から##single_long",
  "たとえ話##single_long",
  "🧵 結論→理由##thread_long",
  "🧵 常識→本音##thread_long",
  "🧵 体験→気づき##thread_short",
];

// 非Premium会員の既定（長文＝X Premium機能なので、短文だけで10種）。長文・URLは含めない。
export const DEFAULT_ON_FREE = [
  "体験・告白から##single_short",
  "逆張り・言い切り##single_short",
  "1行目のフック強め##single_short",
  "数字・実績から##single_short",
  "問いかけ##single_short",
  "たとえ話##single_short",
  "箇条書き##single_short",
  "あるある共感##single_short",
  "🧵 体験→気づき##thread_short",
  "🧵 結論→理由##thread_short",
];

// その型キーが長文パターン（＝Premium限定）か。
export function isLongType(key: string): boolean {
  const p = key.split("##")[1];
  return p ? !!(PATTERNS[p] && PATTERNS[p].long) : false;
}

// URL誘導（🔗）の型（別フロー・飛ばし先必須）。
export const URL_TYPES = [
  "🔗 URL誘導・結論→続きはリンク", "🔗 URL誘導・体験談→リンク", "🔗 URL誘導・問題提起→リンク",
  "🔗 URL誘導・数字・実績→リンク", "🔗 URL誘導・一部公開→リンク", "🔗 URL誘導・告知・締切→リンク",
];

// すべての正典型（分析の集計カテゴリ）。
export const ALL_TYPES = [...CATALOG_KEYS, ...URL_TYPES];

// 型キー → メタ（hook/pattern/kind/long/name/instruction）。未知キーは hook単体として素直に解釈。
export function metaOf(key: string): { hook: string; pattern: string | null; kind: "single" | "thread"; long: boolean; name: string; instruction: string } {
  const c = CATALOG_BY_KEY[key];
  if (c) {
    // URL誘導はスタイル別の「誘導の型」を指示にする（URL本体の付与はindex/cycle側）。
    if (c.pattern === "url") {
      const st = URL_STYLES.find((s) => `🔗 URL誘導・${s.label}` === c.hook);
      return { hook: c.hook, pattern: c.pattern, kind: c.kind, long: c.long, name: c.name, instruction: st ? st.angle : "" };
    }
    return { hook: c.hook, pattern: c.pattern, kind: c.kind, long: c.long, name: c.name, instruction: TYPE_INSTRUCTIONS[c.hook] || "" };
  }
  // 旧キー（hookのみ）や⭐自作型のフォールバック。
  const isThread = /^🧵|連結|2本目|reply_text/.test(key);
  return { hook: key, pattern: null, kind: isThread ? "thread" : "single", long: false, name: key, instruction: TYPE_INSTRUCTIONS[key] || "" };
}

// 型名→生成指示（切り口）。プロンプト本体（運営資産）は本部Hubに置き、実行時に hydrateTaxonomy で注入する。
//   このコード（公開する実行エンジン）には指示テキストを持たない＝資産を出さない（03/05章）。
export let TYPE_INSTRUCTIONS: Record<string, string> = {};

// 「次の学習サイクルの指針」の方針カタログ（2026-07-05）。
// 1つの狭い型に75%固定していた旧cycle_focusは、選び続けると偏りが複利的に強まる問題があった（会員指摘）。
// 対策：①必ず複数の型/パターンにまたがる“グループ単位”の方針にする（単一の狭い型を名指しでロックしない）
//      ②サイクルが切り替わったら自動解除（cycle_focusに{policy,label}で保存し、cycle.tsのサイクル切替時に消す）。
export type PolicyId =
  | "hook_top" | "hook_explore" | "hook_diversify" | "hook_weak_down"
  | "length_long" | "length_short" | "format_thread" | "format_single"
  | "image_on" | "image_off"
  | "reach_impressions" | "engagement_rate"
  | "promo_effective" | "custom_types";
export interface PolicyDef { id: PolicyId; category: string; label: string; requires?: "image" | "promo" | "custom" }
export const POLICY_CATALOG: PolicyDef[] = [
  { id: "hook_top", category: "型", label: "好調な型をまとめて増やす" },
  { id: "hook_explore", category: "型", label: "まだ試していない型を試す" },
  { id: "hook_diversify", category: "型", label: "型のバリエーションを増やす" },
  { id: "hook_weak_down", category: "型", label: "伸び悩む型を減らす" },
  { id: "length_long", category: "長さ・形式", label: "長文を増やす" },
  { id: "length_short", category: "長さ・形式", label: "短文を増やす" },
  { id: "format_thread", category: "長さ・形式", label: "連結（スレッド）を増やす" },
  { id: "format_single", category: "長さ・形式", label: "単発を増やす" },
  { id: "image_on", category: "画像", label: "画像つきを増やす", requires: "image" },
  { id: "image_off", category: "画像", label: "画像なし（テキストのみ）を増やす", requires: "image" },
  { id: "reach_impressions", category: "拡散・反応", label: "インプレッションが伸びる型を増やす（拡散重視）" },
  { id: "engagement_rate", category: "拡散・反応", label: "反応率が高い型を増やす" },
  { id: "promo_effective", category: "広告", label: "広告で効く型を増やす", requires: "promo" },
  { id: "custom_types", category: "独自", label: "自作の型を増やす", requires: "custom" },
];
export const POLICY_BY_ID: Record<string, PolicyDef> = Object.fromEntries(POLICY_CATALOG.map((p) => [p.id, p]));

// Hubから取得したプロンプトパックで、型指示・URL誘導の本体（運営資産）を反映する。生成・型・cron の前に呼ぶ。
export function hydrateTaxonomy(pack: {
  type_instructions?: Record<string, string>;
  url_instruction?: string;
  url_styles?: Array<{ label: string; angle: string }>;
}): void {
  if (pack.type_instructions && Object.keys(pack.type_instructions).length) TYPE_INSTRUCTIONS = pack.type_instructions;
  if (typeof pack.url_instruction === "string" && pack.url_instruction) URL_TYPE_INSTRUCTION = pack.url_instruction;
  if (Array.isArray(pack.url_styles) && pack.url_styles.length) URL_STYLES = pack.url_styles;
}
