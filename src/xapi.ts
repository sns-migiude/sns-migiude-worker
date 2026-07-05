// X API v2 クライアント（OAuth 1.0a User Context）
// 投稿: POST /2/tweets ／ メトリクス取得: GET /2/tweets?ids=...
//
// 出自: 17.ClaudeCode/X工房/worker/src/xapi.ts を参照して移植。
// creds を引数で受け取る作りなので、SNSの右腕のマルチアカウント（アカウント別の鍵）に
// そのまま使える。アカウント固有の前提はこのファイルには持たせない。

export interface XCreds {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface TweetMetrics {
  tweetId: string;
  impressions: number | null;
  likes: number | null;
  retweets: number | null;
  replies: number | null;
  quotes: number | null;
  bookmarks: number | null;
  urlLinkClicks: number | null;
  userProfileClicks: number | null;
  // オーガニック/広告の内訳（tweet.fields=organic_metrics,promoted_metrics）。
  // 広告(promoted)は「そのポストが広告に使われた時だけ」返る＝広告の自動判別に使う。
  // 取得できないプラン/権限ではフォールバックで undefined のまま（既存動作と同じ）。
  organic?: { impressions: number | null; likes: number | null; retweets: number | null; replies: number | null };
  promoted?: { impressions: number | null; likes: number | null; retweets: number | null; replies: number | null };
}

const enc = new TextEncoder();

// RFC 3986 準拠のパーセントエンコード（OAuth 1.0a 仕様）
function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// OAuth 1.0a Authorizationヘッダーを生成。
// 署名対象にはクエリパラメータを含める（JSONボディは含めない仕様）。
async function oauthHeader(
  creds: XCreds,
  method: string,
  baseUrl: string,
  queryParams: Record<string, string> = {}
): Promise<string> {
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const allParams: Record<string, string> = { ...queryParams, ...oauth };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join("&");
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessSecret)}`;
  oauth.oauth_signature = await hmacSha1Base64(signingKey, signatureBase);

  return (
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`)
      .join(", ")
  );
}

function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join("&");
}

export class XApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`X API ${status}: ${body}`);
  }
}

// X API v2 でツイート削除（DELETE /2/tweets/:id）
export async function deleteTweet(creds: XCreds, tweetId: string): Promise<boolean> {
  const url = `https://api.x.com/2/tweets/${tweetId}`;
  const auth = await oauthHeader(creds, "DELETE", url);
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: auth } });
  const t = await res.text();
  if (!res.ok) throw new XApiError(res.status, t);
  const body = JSON.parse(t) as { data?: { deleted?: boolean } };
  return body.data?.deleted === true;
}

// X API v2 メディアアップロード（単純multipart・画像1枚）。
export async function uploadMedia(creds: XCreds, png: Uint8Array): Promise<string> {
  const url = "https://api.x.com/2/media/upload";
  const ab = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  const form = new FormData();
  form.append("media", new Blob([ab], { type: "image/png" }), "card.png");
  form.append("media_category", "tweet_image");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: await oauthHeader(creds, "POST", url) },
    body: form,
  });
  const t = await res.text();
  if (!res.ok) throw new XApiError(res.status, t);
  const json = JSON.parse(t) as {
    data?: { id?: string; media_key?: string };
    media_id_string?: string;
    id?: string;
  };
  const mediaId = json.data?.id ?? json.media_id_string ?? json.id;
  if (!mediaId) throw new XApiError(0, `media_idなし: ${JSON.stringify(json)}`);
  return mediaId;
}

export async function createPost(
  creds: XCreds,
  text: string,
  inReplyTo?: string,
  mediaIds?: string[]
): Promise<string> {
  const url = "https://api.x.com/2/tweets";
  const auth = await oauthHeader(creds, "POST", url);
  const payload: Record<string, unknown> = { text };
  if (inReplyTo) payload.reply = { in_reply_to_tweet_id: inReplyTo };
  if (mediaIds && mediaIds.length) payload.media = { media_ids: mediaIds };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new XApiError(res.status, bodyText);
  const body = JSON.parse(bodyText) as { data?: { id?: string } };
  if (!body.data?.id) throw new XApiError(res.status, `idなし応答: ${bodyText}`);
  return body.data.id;
}

interface RawContextMetrics {
  impression_count?: number;
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
}
interface RawTweet {
  id: string;
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
  };
  non_public_metrics?: {
    url_link_clicks?: number;
    user_profile_clicks?: number;
  };
  organic_metrics?: RawContextMetrics;
  promoted_metrics?: RawContextMetrics;
}

// 最大100件ずつ取得。non_public/organic/promoted は自分のポスト・30日以内のみ有効で、
// プラン/権限によっては403/400になるため、段階的にフィールドを落として再試行する：
//   ①public+non_public+organic+promoted → ②+organic(promoted落とす) → ③+non_public → ④publicのみ
// （organic/promoted＝広告内訳。promoted_metricsはAds API寄りで取れない権限が多いため、
//   promotedがダメでも organic は残す＝オーガニック学習を守る。②のレベルがその保険。）
export async function fetchTweetMetrics(
  creds: XCreds,
  tweetIds: string[],
  includeNonPublic: boolean,
  fieldLevel?: number
): Promise<TweetMetrics[]> {
  if (tweetIds.length === 0) return [];
  if (tweetIds.length > 100) throw new Error("一度に取得できるのは100件まで");

  const LEVELS = [
    "public_metrics,non_public_metrics,organic_metrics,promoted_metrics",
    "public_metrics,non_public_metrics,organic_metrics",
    "public_metrics,non_public_metrics",
    "public_metrics",
  ];
  const level = fieldLevel ?? (includeNonPublic ? 0 : LEVELS.length - 1);
  const url = "https://api.x.com/2/tweets";
  const params = { ids: tweetIds.join(","), "tweet.fields": LEVELS[level] };
  const auth = await oauthHeader(creds, "GET", url, params);
  const res = await fetch(`${url}?${buildQuery(params)}`, {
    headers: { Authorization: auth },
  });
  const bodyText = await res.text();

  if (!res.ok) {
    if (level < LEVELS.length - 1 && (res.status === 403 || res.status === 400)) {
      console.log(`[xapi] metrics fields level${level} 不可(${res.status})→level${level + 1}で再試行`);
      return fetchTweetMetrics(creds, tweetIds, includeNonPublic, level + 1);
    }
    throw new XApiError(res.status, bodyText);
  }

  const ctx = (m?: RawContextMetrics) =>
    m
      ? {
          impressions: m.impression_count ?? null,
          likes: m.like_count ?? null,
          retweets: m.retweet_count ?? null,
          replies: m.reply_count ?? null,
        }
      : undefined;
  const body = JSON.parse(bodyText) as { data?: RawTweet[] };
  return (body.data ?? []).map((t) => ({
    tweetId: t.id,
    impressions: t.public_metrics?.impression_count ?? null,
    likes: t.public_metrics?.like_count ?? null,
    retweets: t.public_metrics?.retweet_count ?? null,
    replies: t.public_metrics?.reply_count ?? null,
    quotes: t.public_metrics?.quote_count ?? null,
    bookmarks: t.public_metrics?.bookmark_count ?? null,
    urlLinkClicks: t.non_public_metrics?.url_link_clicks ?? null,
    userProfileClicks: t.non_public_metrics?.user_profile_clicks ?? null,
    organic: ctx(t.organic_metrics),
    promoted: ctx(t.promoted_metrics),
  }));
}

export interface AccountMetrics {
  id: string | null;
  username: string | null;
  followers: number | null;
  following: number | null;
  tweets: number | null;
  listed: number | null;
  verifiedType: string | null; // "blue"=Premium / "business" / "government" / "none"
}

// 自分のアカウントのフォロワー数・handle・認証種別など（owned read = $0.001）
export async function fetchAccountMetrics(creds: XCreds): Promise<AccountMetrics> {
  const url = "https://api.x.com/2/users/me";
  const params = { "user.fields": "public_metrics,username,verified_type" };
  const auth = await oauthHeader(creds, "GET", url, params);
  const res = await fetch(`${url}?${buildQuery(params)}`, {
    headers: { Authorization: auth },
  });
  const bodyText = await res.text();
  if (!res.ok) throw new XApiError(res.status, bodyText);
  const body = JSON.parse(bodyText) as {
    data?: {
      id?: string;
      username?: string;
      verified_type?: string;
      public_metrics?: {
        followers_count?: number;
        following_count?: number;
        tweet_count?: number;
        listed_count?: number;
      };
    };
  };
  const pm = body.data?.public_metrics ?? {};
  return {
    id: body.data?.id ?? null,
    username: body.data?.username ?? null,
    followers: pm.followers_count ?? null,
    following: pm.following_count ?? null,
    tweets: pm.tweet_count ?? null,
    listed: pm.listed_count ?? null,
    verifiedType: body.data?.verified_type ?? null,
  };
}

// 自分の最近の投稿（リツイート・リプは除外＝本人の言葉だけ）。文体学習の手本に使う。
export async function fetchRecentTweets(
  creds: XCreds,
  userId: string,
  max: number = 60
): Promise<string[]> {
  const url = `https://api.x.com/2/users/${userId}/tweets`;
  const out: string[] = [];
  let nextToken: string | undefined;
  const per = Math.max(5, Math.min(100, max));
  for (let page = 0; page < 5 && out.length < max; page++) {
    const params: Record<string, string> = {
      max_results: String(per),
      exclude: "retweets,replies",
      "tweet.fields": "created_at",
    };
    if (nextToken) params.pagination_token = nextToken;
    const auth = await oauthHeader(creds, "GET", url, params);
    const res = await fetch(`${url}?${buildQuery(params)}`, {
      headers: { Authorization: auth },
    });
    const bodyText = await res.text();
    if (!res.ok) throw new XApiError(res.status, bodyText);
    const body = JSON.parse(bodyText) as {
      data?: { text?: string }[];
      meta?: { next_token?: string };
    };
    for (const t of body.data ?? []) {
      if (t.text && t.text.trim()) out.push(t.text.trim());
    }
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }
  return out.slice(0, max);
}

export interface ReplyTweet {
  replyId: string;
  authorId: string | null;
  authorUsername: string | null;
  text: string;
  likes: number | null;
  replies: number | null;
  createdAt: string | null;
}

interface RawUser {
  id: string;
  username?: string;
}
interface RawReplyTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
  };
}

// 特定ポストへのリプライをまとめて取得（Recent Search・直近7日制限・1回最大100件）。
export async function fetchReplies(
  creds: XCreds,
  conversationId: string,
  maxPages: number = 3
): Promise<ReplyTweet[]> {
  const url = "https://api.x.com/2/tweets/search/recent";
  const collected: ReplyTweet[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      query: `conversation_id:${conversationId}`,
      "tweet.fields": "public_metrics,created_at,author_id",
      expansions: "author_id",
      "user.fields": "username",
      max_results: "100",
    };
    if (nextToken) params.pagination_token = nextToken;

    const auth = await oauthHeader(creds, "GET", url, params);
    const res = await fetch(`${url}?${buildQuery(params)}`, {
      headers: { Authorization: auth },
    });
    const bodyText = await res.text();
    if (!res.ok) throw new XApiError(res.status, bodyText);

    const body = JSON.parse(bodyText) as {
      data?: RawReplyTweet[];
      includes?: { users?: RawUser[] };
      meta?: { next_token?: string };
    };
    const userMap = new Map<string, string>(
      (body.includes?.users ?? []).map((u) => [u.id, u.username ?? ""])
    );
    for (const t of body.data ?? []) {
      collected.push({
        replyId: t.id,
        authorId: t.author_id ?? null,
        authorUsername: t.author_id ? userMap.get(t.author_id) ?? null : null,
        text: t.text,
        likes: t.public_metrics?.like_count ?? null,
        replies: t.public_metrics?.reply_count ?? null,
        createdAt: t.created_at ?? null,
      });
    }
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }
  return collected;
}

// Xの加重文字数（通常アカウントの上限280）。CJK・全角は2、半角は1、URLは23。
export function weightedLength(text: string): number {
  const urlPattern = /https?:\/\/\S+/g;
  let length = 0;
  let rest = text;
  const urls = text.match(urlPattern) ?? [];
  for (const u of urls) {
    length += 23;
    rest = rest.replace(u, "");
  }
  for (const ch of rest) {
    const cp = ch.codePointAt(0)!;
    const wide =
      (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x2e80 && cp <= 0x9fff) ||
      (cp >= 0xa960 && cp <= 0xa97f) ||
      (cp >= 0xac00 && cp <= 0xd7ff) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f000 && cp <= 0x1ffff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    length += wide ? 2 : 1;
  }
  return length;
}
