// Claude API 中継用 Durable Object（米国配置）。
//
// なぜ必要か：Cloudflare無料プランは日本からのアクセスをHKG（香港）のデータセンターで
// 実行することがあり、Anthropicは香港からのAPIアクセスを地域ブロックする
// （403 {"error":{"type":"forbidden","message":"Request not allowed"}}）。
// → Claude呼び出しだけを米国東部（enam）に固定配置したDO経由にして回避する。
//
// プライバシー：DOは会員自身のCloudflareアカウント内で動く。鍵も本文も
// 運営のサーバーは一切経由しない（従来の約束のまま）。
export class UsRelay {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname !== "api.anthropic.com") {
      return new Response("relay: forbidden host", { status: 403 });
    }
    return fetch(req);
  }
}
