// Anthropic Messages API クライアント（Worker用・raw fetch・依存ゼロ）
// 出自: 17.ClaudeCode/X工房/worker/src/claude.ts を参照して移植。
// 現行API（claude-opus-4-8 / adaptive thinking / output_config.effort / output_config.format）に準拠。
// ※ このファイルはAPIの「窓口」にすぎない。文体は generate.ts が渡すプロンプト内容で決まる
//   （SNSの右腕は voice-agnostic ＝ 各会員自身の文体で生成・和佐節は持ち込まない）。

export interface ClaudeOpts {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  noEffort?: boolean; // output_config.effort を送らない（effort非対応モデル/雑務用）
  thinkingMode?: "adaptive" | "disabled";
  // 長い生成（Opus＋思考で数十秒〜2分）はストリーミングで接続を維持し、Cloudflareの524タイムアウトを回避する
  stream?: boolean;
  // 安定プレフィックス（system）はプロンプトキャッシュに載せる
  system: { text: string; cache?: boolean }[];
  userText?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  // 構造化出力スキーマ（指定すると応答が必ずこのJSON形になる）
  schema?: object;
}

// 構造化出力でも稀にmarkdownフェンスや前置きが付くので、堅牢にJSONを取り出す
export function extractJson<T = unknown>(text: string): T {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const first = t.indexOf("{");
    const last = t.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(t.slice(first, last + 1)) as T;
    throw new Error(`JSON抽出失敗: ${t.slice(0, 120)}`);
  }
}

// ── 地域ブロック回避の中継（us-relay.ts参照）─────────────────────
// 無料プランのWorkerがHKG（香港）で実行されるとAnthropicに地域ブロックされるため、
// US_RELAYバインディングがあれば米国配置DO経由でfetchする。無い環境では従来どおり直接。
let relayNs: DurableObjectNamespace | null = null;
export function setClaudeRelay(ns: DurableObjectNamespace | undefined | null): void {
  relayNs = ns ?? null;
}
function anthropicFetch(url: string, init: RequestInit): Promise<Response> {
  if (relayNs) {
    try {
      const stub = relayNs.get(relayNs.idFromName("us"), { locationHint: "enam" });
      return stub.fetch(url, init);
    } catch {
      // 中継が使えない環境（ローカル等）では直接fetchにフォールバック
    }
  }
  return fetch(url, init);
}

export class ClaudeError extends Error {
  constructor(
    public status: number,
    body: string
  ) {
    super(`Claude API ${status}: ${body}`);
  }
}

interface ClaudeResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// Claude APIキーの有効性チェック（モデル一覧を叩くだけ＝トークン消費なし）。連携時の検証用。
export async function verifyClaudeKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey || !apiKey.trim()) return { ok: false, error: "Claude APIキーが空です" };
  try {
    const res = await anthropicFetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": apiKey.trim(), "anthropic-version": "2023-06-01" },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Claude APIキーが正しくありません（401）。キーを確認してください" };
    const t = await res.text();
    return { ok: false, error: `Claude APIエラー（${res.status}）：${t.slice(0, 80)}` };
  } catch (e) {
    return { ok: false, error: `Claudeに接続できません：${e instanceof Error ? e.message.slice(0, 80) : ""}` };
  }
}

export async function callClaude(opts: ClaudeOpts): Promise<{
  text: string;
  usage: ClaudeResponse["usage"];
}> {
  const outputConfig: Record<string, unknown> = {};
  if (!opts.noEffort) outputConfig.effort = opts.effort ?? "high";
  const body: Record<string, unknown> = {
    model: opts.model ?? "claude-opus-4-8",
    max_tokens: opts.maxTokens ?? 8000,
    output_config: outputConfig,
  };
  // thinking: disabled指定時は thinking パラメータごと省略（Opus 4.8は省略=思考なし）
  if (opts.thinkingMode !== "disabled") {
    body.thinking = { type: "adaptive" };
  }
  body.system = opts.system.map((s) =>
    s.cache
      ? { type: "text", text: s.text, cache_control: { type: "ephemeral" } }
      : { type: "text", text: s.text }
  );
  if (opts.messages && opts.messages.length) {
    body.messages = opts.messages;
  } else {
    body.messages = [{ role: "user", content: opts.userText ?? "" }];
  }
  if (opts.schema) {
    (body.output_config as Record<string, unknown>).format = {
      type: "json_schema",
      schema: opts.schema,
    };
  }
  if (opts.stream) body.stream = true;

  const res = await anthropicFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new ClaudeError(res.status, errText);
  }

  // ── ストリーミング（SSE）: チャンクを逐次読みつつ text を組み立てる。
  //    接続が常に流れているので、長い生成でもCloudflareの524（タイムアウト）に当たらない。
  if (opts.stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    const usage: NonNullable<ClaudeResponse["usage"]> = {};
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let ev: {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: ClaudeResponse["usage"] };
          usage?: ClaudeResponse["usage"];
          error?: unknown;
        };
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          text += ev.delta.text;
        } else if (ev.type === "message_start" && ev.message?.usage) {
          Object.assign(usage, ev.message.usage);
        } else if (ev.type === "message_delta" && ev.usage) {
          Object.assign(usage, ev.usage);
        } else if (ev.type === "error") {
          throw new ClaudeError(529, JSON.stringify(ev.error ?? ev));
        }
      }
    }
    return { text, usage };
  }

  const bodyText = await res.text();
  const parsed = JSON.parse(bodyText) as ClaudeResponse;
  // 安全側：拒否応答（refusal）はテキスト空。呼び出し側で空配列扱いになる
  const text = (parsed.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("");
  return { text, usage: parsed.usage };
}
