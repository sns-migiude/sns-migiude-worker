// プロンプト本体の取得＋二段キャッシュ（05章）。
//   会員Workerはプロンプト資産を持たず、本部(Hub)から取得してローカル(D1)にキャッシュする。
//   ① manifestで版を軽く確認 → ② 変わっていたら本体を取得 → ③ D1に保存。
//   Hubが落ちていても、最後に取得したキャッシュで生成を続行する（発信は止まらない）。
import { getConfig, setConfig, type Env } from "./accounts";
import { hydrateTaxonomy } from "./taxonomy";

export interface PromptPack {
  version: number;
  system: string;
  system_thread: string;
  type_dev_system: string;
  type_instructions: Record<string, string>;
  url_instruction: string;
  url_styles: Array<{ label: string; angle: string }>;
  rules: { long_hook: string; thread_head: string; thread_reply_long: string; thread_reply_short: string; single: string };
  distill: { oneliner: string; list: string; compare: string };
}

let isoCache: PromptPack | null = null; // アイソレート内メモリキャッシュ（同一実行での再取得を避ける）

async function hqAuth(env: Env): Promise<string | null> {
  return (await getConfig(env, "honbu_token")) || env.HONBU_TOKEN || null;
}

async function hqGet(env: Env, path: string): Promise<Record<string, unknown> | null> {
  if (!env.HONBU_URL) return null;
  const tok = await hqAuth(env);
  if (!tok) return null;
  try {
    const res = await fetch(`${env.HONBU_URL}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// プロンプト本体を返す。差分があればHubから取得→D1キャッシュ。Hub不通はキャッシュで継続。
//   返り値 null＝一度も取得できていない（初回かつHub不通）。呼び出し側は生成をスキップして次回に回す。
export async function getPromptPack(env: Env): Promise<PromptPack | null> {
  // 1. キャッシュ（メモリ→D1）
  let cached: PromptPack | null = isoCache;
  if (!cached) {
    const cj = await getConfig(env, "prompt_pack");
    if (cj) { try { cached = JSON.parse(cj) as PromptPack; isoCache = cached; } catch { /* 壊れていれば取り直す */ } }
  }
  // 2. manifestで版を確認（軽量）。Hub不通なら latest=null → キャッシュをそのまま使う。
  const m = await hqGet(env, "/hq/manifest");
  // 本部が公開している「最新のコード版」と更新メモも拾ってキャッシュ（ダッシュボードの“更新あり”表示に使う）。
  if (m) {
    if (typeof m.code === "string" || typeof m.code === "number") await setConfig(env, "latest_code_version", String(m.code));
    if (typeof m.min === "string" || typeof m.min === "number") await setConfig(env, "min_code_version", String(m.min));
    if (typeof m.note === "string") await setConfig(env, "update_note", (m.note as string).slice(0, 300));
  }
  const latest = m && typeof m.prompt === "number" ? (m.prompt as number) : null;
  // 3. 版が変わった／キャッシュ無し のときだけ本体を取得して保存。
  if (latest !== null && (!cached || cached.version !== latest)) {
    const r = await hqGet(env, "/hq/prompts");
    const pack = r && r.ok && r.pack ? (r.pack as PromptPack) : null;
    if (pack && pack.version) {
      cached = pack;
      isoCache = pack;
      await setConfig(env, "prompt_pack", JSON.stringify(pack));
      await setConfig(env, "prompt_pack_version", String(pack.version));
    }
  }
  return cached;
}

// 取得（manifest差分→本体→キャッシュ）して taxonomy（型指示・URL）へ反映し、パックを返す。
//   生成・型開発・cron など「最新が欲しい」入口で呼ぶ。null＝初回かつHub不通。
export async function refreshPrompts(env: Env): Promise<PromptPack | null> {
  const p = await getPromptPack(env);
  if (p) hydrateTaxonomy(p);
  return p;
}

// キャッシュのみ反映（Hubを叩かない）。表示系の各リクエスト先頭で軽く呼ぶ用。
export async function hydrateFromCache(env: Env): Promise<void> {
  if (isoCache) { hydrateTaxonomy(isoCache); return; }
  const cj = await getConfig(env, "prompt_pack");
  if (cj) { try { const p = JSON.parse(cj) as PromptPack; isoCache = p; hydrateTaxonomy(p); } catch { /* 壊れていれば次回取得 */ } }
}
