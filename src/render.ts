// カード画像のレンダリング（SVG→PNG）。resvg-wasm はデプロイ時バンドル（Workersは実行時wasm生成を禁止）、
// フォント・背景画像・ロゴは R2 から実行時ロードしてバンドルを軽く保つ。会員ごとテーマ＋テーマ内バリアントで散らす。
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { Env } from "./accounts";

// アイソレート単位でキャッシュ（initWasmは1回だけ呼べる）。
let engineReady = false;
let enginePromise: Promise<void> | null = null;
const fontCache: Record<string, Uint8Array> = {};

async function ensureWasm(): Promise<void> {
  if (engineReady) return;
  if (!enginePromise) enginePromise = initWasm(resvgWasm).then(() => { engineReady = true; });
  await enginePromise;
}

export const CARD_FONTS: Array<{ id: string; name: string }> = [
  { id: "sans", name: "ゴシック" },
  { id: "serif", name: "明朝" },
  { id: "round", name: "丸ゴシック" },
  { id: "pop", name: "ポップ" },
];
const FONT_IDS = CARD_FONTS.map((f) => f.id);

// (fam-weight)→公開元のフォントファイル名。未収録の組合せは sans-bold(Noto) にフォールバックする。
const FONT_FILE: Record<string, string> = {
  "sans-bold": "NotoSansJP-Bold.ttf",
  "sans-regular": "NotoSansJP-Bold.ttf", // regular未収録のためBoldで代用（公開リポにregularを足したら差し替え）
};
// 既定の取得元（会員用 公開リポ同梱のOFLフォント）。公開時に実リポrawへ差し替える。env.FONT_BASE_URL で上書き可。
const FONT_BASE_URL_DEFAULT = "https://raw.githubusercontent.com/REPLACE-ORG/REPLACE-REPO/main/fonts";

// R2にフォントが無い新規会員向け：公開元からTTFを取得してR2へ投入（self-healing・以後はR2から読む）。
async function seedFontToR2(env: Env, key: string, file: string): Promise<Uint8Array | null> {
  const base = (env.FONT_BASE_URL || FONT_BASE_URL_DEFAULT).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/${file}`);
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    if (b.byteLength < 50000) return null; // 取得失敗(HTMLエラーページ等)を弾く。実フォントは数MB。
    try { await env.MEDIA!.put(key, b); } catch {} // 次回以降はR2から。put失敗しても今回分は描画に使える。
    return b;
  } catch { return null; }
}

async function loadFont(env: Env, font: string, weight: "bold" | "regular"): Promise<Uint8Array> {
  const fam = FONT_IDS.indexOf(font) >= 0 ? font : "sans";
  const key = `fonts/${fam}-${weight}.ttf`;
  if (fontCache[key]) return fontCache[key];
  let b: Uint8Array | null = null;
  const f = await env.MEDIA!.get(key);
  if (f) b = new Uint8Array(await f.arrayBuffer());
  // R2に無ければ公開元から自動投入（新規会員の初回カード）。
  if (!b && FONT_FILE[`${fam}-${weight}`]) b = await seedFontToR2(env, key, FONT_FILE[`${fam}-${weight}`]);
  // それでも無ければ既定フォント(sans-bold=Noto)で代替＝どの選択でも必ず描画できる。
  if (!b) {
    const fk = "fonts/sans-bold.ttf";
    if (fontCache[fk]) b = fontCache[fk];
    else {
      const ff = await env.MEDIA!.get(fk);
      b = ff ? new Uint8Array(await ff.arrayBuffer()) : await seedFontToR2(env, fk, FONT_FILE["sans-bold"]);
    }
  }
  if (!b) throw new Error(`フォントを用意できません（${key}／取得元: ${env.FONT_BASE_URL || FONT_BASE_URL_DEFAULT}）`);
  fontCache[key] = b;
  return b;
}

// R2のオブジェクトを data URI（base64）にして SVG に埋め込む。
async function r2DataUri(env: Env, key: string): Promise<string | null> {
  try {
    const o = await env.MEDIA!.get(key);
    if (!o) return null;
    const buf = new Uint8Array(await o.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
    const mime = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${btoa(bin)}`;
  } catch { return null; }
}

export interface CardTheme {
  on?: boolean;
  preset?: string;
  bg: string;
  fg: string;
  accent: string;
  weight?: "bold" | "regular";
  font?: string;     // フォント種類 sans/serif/round/pop。既定sans。
  handle?: string;
  fontSize?: number; // 本文の文字サイズ(px)。既定48。折り返し文字数は自動調整。
  logoSize?: number; // ロゴの一辺(px)。既定64。
  logoKey?: string; // R2キー（ロゴ画像）
  bgKey?: string;   // R2キー（背景画像）
}
function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

// プリセット（会員はここから選んで色・ハンドルだけ調整、or 背景/ロゴをアップ）。
export const CARD_PRESETS: Array<{ id: string; name: string; bg: string; fg: string; accent: string; weight: "bold" | "regular" }> = [
  { id: "midnight", name: "ミッドナイト", bg: "#0f1419", fg: "#ffffff", accent: "#1d9bf0", weight: "bold" },
  { id: "paper", name: "ペーパー", bg: "#faf7f2", fg: "#1a1a1a", accent: "#c0392b", weight: "bold" },
  { id: "mono", name: "モノクロ", bg: "#111111", fg: "#fafafa", accent: "#9aa0a6", weight: "bold" },
  { id: "sky", name: "スカイ", bg: "#eef6ff", fg: "#0b2540", accent: "#1d9bf0", weight: "bold" },
  { id: "forest", name: "フォレスト", bg: "#0e1f17", fg: "#eafff4", accent: "#34d399", weight: "bold" },
  { id: "sunset", name: "サンセット", bg: "#1a1020", fg: "#fff5e6", accent: "#f59e0b", weight: "bold" },
];
export function presetTheme(id: string): CardTheme {
  const p = CARD_PRESETS.find((x) => x.id === id) || CARD_PRESETS[0];
  return { preset: p.id, bg: p.bg, fg: p.fg, accent: p.accent, weight: p.weight };
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 日本語は空白で折れないので、明示改行を尊重しつつ文字数で折り返す。切り捨てはしない（全行返す）。
function wrapAll(text: string, perLine: number): string[] {
  const out: string[] = [];
  for (const para of (text || "").split("\n")) {
    if (para.length === 0) { out.push(""); continue; }
    for (let i = 0; i < para.length; i += perLine) out.push(para.slice(i, i + perLine));
  }
  return out;
}

// 画像の型（カードの中身）。大きく2タイプ。none＝画像なし。
//   oneliner（一文）… 見出し・タイトル・名言・一文切り出し
//   list（箇条書き）… 箇条書き・比較・ランキング
export const IMAGE_TYPES: Array<{ id: string; name: string }> = [
  { id: "oneliner", name: "一文（見出し・名言）" },
  { id: "list", name: "箇条書き（ランキング・リスト）" },
];
// レンダリング可能な全タイプ。compare＝2列の比較カード（比較・対比フックで自動適用。UI選択肢には出さない）。
const RENDERABLE_IMAGE_TYPES = ["oneliner", "list", "compare"];
export function isImageType(id: string | undefined): boolean {
  return !!id && RENDERABLE_IMAGE_TYPES.indexOf(id) >= 0; // none/未設定は false
}
export function normImageType(id: string | undefined): string {
  return id && RENDERABLE_IMAGE_TYPES.indexOf(id) >= 0 ? id : "oneliner";
}

function escapeColor(c: string): string { return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#000000"; }

// 共通：背景・ハンドル・ロゴのレイヤを作る。
function frame(theme: CardTheme, W: number, H: number, M: number, bgUri: string | null, logoUri: string | null, logoSize: number): { bgLayer: string; deco: string } {
  const bgLayer = bgUri
    ? `<image x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" href="${bgUri}"/><rect width="${W}" height="${H}" fill="${theme.bg}" opacity="0.55"/>`
    : `<rect width="${W}" height="${H}" fill="${theme.bg}"/>`;
  const handleSize = 30;
  const handle = theme.handle ? `<text x="${W - M}" y="${H - 44}" font-family="card" font-size="${handleSize}" fill="${theme.accent}" text-anchor="end">${escXml(theme.handle)}</text>` : "";
  const logo = logoUri ? `<image x="${M}" y="${H - logoSize - 32}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet" href="${logoUri}"/>` : "";
  return { bgLayer, deco: handle + logo };
}

function buildCardSvg(theme: CardTheme, text: string, imageType: string, variant: number, bgUri: string | null, logoUri: string | null): string {
  const W = 1200, H = 675, M = 90;
  const baseFont = clampNum(theme.fontSize, 28, 80, 48);
  const logoSize = clampNum(theme.logoSize, 32, 180, 64);
  const fg = escapeColor(theme.fg), accent = escapeColor(theme.accent);
  const { bgLayer, deco } = frame(theme, W, H, M, bgUri, logoUri, logoSize);
  const it = normImageType(imageType);
  void variant;
  let inner = "";
  // 【ルール】本文は必ずこの「安全領域」内に収める。下部はアイコン(ロゴ)と署名(ハンドル)ぶんを予約して避ける。
  const hasLogo = !!logoUri;
  const hasHandle = !!(theme.handle && theme.handle.trim());
  const footer = Math.max(28, hasLogo ? logoSize + 44 : 0, hasHandle ? 78 : 0); // 下部の予約高（ロゴ/署名を避ける）
  const contentTop = Math.round(M * 0.8);
  const contentBottom = H - footer;
  const contentH = Math.max(80, contentBottom - contentTop);
  const contentW = W - M * 2;
  if (it === "compare") {
    // 2列の比較カード（A vs B）。1行目＝タイトル、2行目＝『A名｜B名』、3行目以降＝『aの特徴｜bの特徴』。
    const rowsRaw = (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const title = rowsRaw.length ? rowsRaw[0].replace(/^(タイトル|title)[:：]\s*/i, "").replace(/^[「『"']+|[」』"']+$/g, "").trim() : "";
    const cellsOf = (r: string) => r.split(/\s*[|｜]\s*/).map((x) => x.replace(/^[\s　・\-*•‣◦\d.．)）、,]+/, "").trim());
    const dataRows = rowsRaw.slice(1).map(cellsOf).filter((r) => (r[0] || r[1]));
    const header = dataRows[0] || ["A", "B"];
    const labelA = header[0] || "", labelB = header[1] || "";
    const bodyRows = dataRows.slice(1).slice(0, 6);
    const n = Math.max(1, bodyRows.length);
    const hasTitle = !!title;
    const colGap = 56;
    const colW = (contentW - colGap) / 2;
    const leftX = M, rightX = M + colW + colGap, midX = M + colW + colGap / 2;
    const colCx = (x: number) => Math.round(x + colW / 2);
    const allCells = [labelA, labelB, ...bodyRows.flatMap((r) => [r[0] || "", r[1] || ""])];
    const longestCell = Math.max(1, ...allCells.map((s) => s.length));
    const tLen = Math.max(1, title.length);
    const lineFactor = 1.65, titleFactor = 1.3, headerFactor = 1.15;
    // セルが列幅／タイトルが全幅／全体が高さに収まる最大フォント。クリップしない。
    const heightUnits = (hasTitle ? titleFactor + 0.7 : 0) + headerFactor + 0.85 + n * lineFactor;
    const f = Math.max(15, Math.min(
      baseFont,
      Math.floor((colW - 12) / longestCell),
      hasTitle ? Math.floor(contentW / (titleFactor * tLen)) : 9999,
      Math.floor(contentH / heightUnits),
    ));
    const titleFont = Math.round(f * titleFactor), headerFont = Math.round(f * headerFactor), cellFont = f;
    const lineH = cellFont * lineFactor;
    const titleRegion = hasTitle ? titleFont + Math.round(f * 0.7) : 0;
    const headerRegion = headerFont + Math.round(f * 0.85);
    const totalH = titleRegion + headerRegion + n * lineH;
    const top = contentTop + Math.max(0, (contentH - totalH) / 2);
    if (hasTitle) inner += `<text x="${W / 2}" y="${top + titleFont}" font-family="card" font-size="${titleFont}" fill="${fg}" text-anchor="middle">${escXml(title)}</text>`;
    const headerTop = top + titleRegion;
    inner += `<text x="${colCx(leftX)}" y="${headerTop + headerFont}" font-family="card" font-size="${headerFont}" fill="${accent}" text-anchor="middle">${escXml(labelA)}</text>`;
    inner += `<text x="${colCx(rightX)}" y="${headerTop + headerFont}" font-family="card" font-size="${headerFont}" fill="${accent}" text-anchor="middle">${escXml(labelB)}</text>`;
    const ulY = headerTop + headerFont + Math.round(f * 0.3);
    inner += `<rect x="${leftX}" y="${ulY}" width="${Math.round(colW)}" height="${Math.max(4, Math.round(f * 0.08))}" rx="3" fill="${accent}" opacity="0.45"/>`;
    inner += `<rect x="${Math.round(rightX)}" y="${ulY}" width="${Math.round(colW)}" height="${Math.max(4, Math.round(f * 0.08))}" rx="3" fill="${accent}" opacity="0.45"/>`;
    const rowsTop = top + titleRegion + headerRegion;
    inner += `<rect x="${Math.round(midX) - 1}" y="${Math.round(rowsTop - f * 0.3)}" width="2" height="${Math.round(n * lineH)}" fill="${fg}" opacity="0.16"/>`;
    const startY = rowsTop + cellFont;
    for (let i = 0; i < n; i++) {
      const y = startY + i * lineH;
      const a = (bodyRows[i] && bodyRows[i][0]) || "", b = (bodyRows[i] && bodyRows[i][1]) || "";
      if (a) inner += `<text x="${colCx(leftX)}" y="${y}" font-family="card" font-size="${cellFont}" fill="${fg}" text-anchor="middle">${escXml(a)}</text>`;
      if (b) inner += `<text x="${colCx(rightX)}" y="${y}" font-family="card" font-size="${cellFont}" fill="${fg}" text-anchor="middle">${escXml(b)}</text>`;
    }
  } else if (it === "list") {
    // 箇条書き（比較・ランキング）。画像だけで意味が通るよう、1行目＝タイトル(見出し)、2行目以降＝項目。
    const raw = (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const title = raw.length ? raw[0].replace(/^(タイトル|title)[:：]\s*/i, "").replace(/^[「『"']+|[」』"']+$/g, "").trim() : "";
    const items = raw.slice(1).map((s) => s.replace(/^[\s　・\-*•‣◦\d.．)）、,]+/, "").trim()).filter(Boolean).slice(0, 6);
    const hasTitle = !!title && items.length > 0;
    const list = items.length ? items : [title || "（項目なし）"]; // 項目が無ければタイトルを1項目扱い
    const n = list.length;
    const longest = Math.max(1, ...list.map((s) => s.length));
    const tLen = Math.max(1, title.length);
    const lineFactor = 1.78, titleFactor = 1.32, gapFactor = 0.95, indentFactor = 1.95;
    // 項目フォント f を「番号＋項目幅／タイトル幅／全体高さ」すべてに収まる最大に。クリップ(…)はしない。
    const heightUnits = (hasTitle ? titleFactor + gapFactor : 0) + n * lineFactor;
    const f = Math.max(16, Math.min(
      baseFont,
      Math.floor(contentW / (longest + indentFactor)), // 番号バッジ＋項目テキストが横幅に収まる
      hasTitle ? Math.floor(contentW / (titleFactor * tLen)) : 9999,
      Math.floor(contentH / heightUnits),
    ));
    const itemFont = f, titleFont = Math.round(f * titleFactor);
    const lineH = itemFont * lineFactor;
    const titleRegion = hasTitle ? titleFont + Math.round(itemFont * gapFactor) : 0;
    const totalH = titleRegion + n * lineH;
    const top = contentTop + Math.max(0, (contentH - totalH) / 2); // 安全領域内で縦中央寄せ
    if (hasTitle) {
      const tb = top + titleFont;
      inner += `<text x="${M}" y="${tb}" font-family="card" font-size="${titleFont}" fill="${accent}">${escXml(title)}</text>`;
      const ulW = Math.min(contentW, Math.round(tLen * titleFont * 1.02));
      inner += `<rect x="${M}" y="${tb + Math.round(titleFont * 0.26)}" width="${ulW}" height="${Math.max(4, Math.round(titleFont * 0.08))}" rx="3" fill="${accent}" opacity="0.45"/>`;
    }
    const startY = top + titleRegion + itemFont;
    const badgeR = Math.max(14, Math.round(itemFont * 0.66));      // 番号円の半径
    const numFont = Math.round(badgeR * 1.04);
    const textX = M + Math.round(itemFont * indentFactor);          // 番号円ぶんの字下げ
    const badgeBg = escapeColor(theme.bg);                          // 番号文字は背景色（accent円に反転表示）
    inner += list.map((s, i) => {
      const y = startY + i * lineH;
      const cy = y - itemFont * 0.33;                               // テキストの視覚中心に番号円を合わせる
      const cx = M + badgeR;
      return `<circle cx="${cx}" cy="${cy}" r="${badgeR}" fill="${accent}"/>`
        + `<text x="${cx}" y="${cy + numFont * 0.36}" font-family="card" font-size="${numFont}" fill="${badgeBg}" text-anchor="middle">${i + 1}</text>`
        + `<text x="${textX}" y="${y}" font-family="card" font-size="${itemFont}" fill="${fg}">${escXml(s)}</text>`;
    }).join("");
  } else {
    // 一文（見出し・名言）。中央に大きく。上にアクセント線。安全領域に収まるまでフォントを縮める（行の切り捨てはしない）。
    const t = (text || "").trim() || "（本文なし）";
    const accentH = 40;                         // アクセント線ぶんの上余白
    const availH = Math.max(60, contentH - accentH);
    const lineFactor = 1.42;
    let fontSize = Math.min(120, Math.round(baseFont * 1.9)); // 短文ほど大きく（baseFont基準）
    let lines = [t];
    for (; fontSize >= 20; fontSize -= 2) {
      const perLine = Math.max(1, Math.floor(contentW / fontSize)); // 各行は必ず横幅内
      lines = wrapAll(t, perLine);
      if (lines.length * fontSize * lineFactor <= availH) break;     // 縦も収まったら確定
    }
    const lineH = fontSize * lineFactor;
    const blockH = lines.length * lineH;
    const startY = contentTop + accentH + Math.max(0, (availH - blockH) / 2) + fontSize;
    inner += `<rect x="${W / 2 - 42}" y="${startY - fontSize - 30}" width="84" height="8" rx="4" fill="${accent}"/>`;
    inner += lines.map((ln, i) => `<text x="${W / 2}" y="${startY + i * lineH}" font-family="card" font-size="${fontSize}" fill="${fg}" text-anchor="middle">${escXml(ln)}</text>`).join("");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bgLayer}${inner}${deco}</svg>`;
}

// カードPNGを生成。bg/logo画像があればR2から読んで埋め込む。imageType＝構図（ポストの型に紐づく）。
export async function renderCardPng(env: Env, theme: CardTheme, text: string, imageType = "standard", variant = 0): Promise<Uint8Array> {
  if (!env.MEDIA) throw new Error("MEDIA(R2)バインディングが未設定です");
  await ensureWasm();
  const font = await loadFont(env, theme.font || "sans", theme.weight === "regular" ? "regular" : "bold");
  const bgUri = theme.bgKey ? await r2DataUri(env, theme.bgKey) : null;
  const logoUri = theme.logoKey ? await r2DataUri(env, theme.logoKey) : null;
  const svg = buildCardSvg(theme, text, imageType, variant, bgUri, logoUri);
  const r = new Resvg(svg, {
    background: theme.bg,
    font: { fontBuffers: [font], defaultFontFamily: "card", loadSystemFonts: false },
    fitTo: { mode: "width", value: 1200 },
  });
  return r.render().asPng();
}
