-- SNSの右腕 会員Worker D1スキーマ（Phase 1：単独マルチペルソナ＝和佐10アカ運用）
-- 設計書: docs/11_データ設計.md / docs/03,04,06,09
-- 適用: npm run db:init（リモート） / npm run db:init:local（ローカル）
--
-- X工房のスキーマを参照しつつ、SNSの右腕の設計で新規構築：
--   ・全テーブルに account_id（マルチアカウント軸）
--   ・posts.source（tool/manual/historical・04章）
--   ・posts.platform（x/threads…・14章）
--   ・post_metrics に er_norm / settled（公平な集計・10本下限・04/06章）
--   ・individual_profile（縦の学び・voice-agnostic・06章）
--   ・corpus は account 単位（Phase 1は account-local。Phase 4でHub由来に）

-- ── アカウント（ペルソナ）：1 Workerで複数アカウントを回す軸 ──────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,                 -- 'acc_xxx'（account_id）
  handle        TEXT,                             -- @handle（is_self判定・URL用）
  display_name  TEXT,
  niche         TEXT,                             -- 経営者/コーチ/士業…（04・07章）
  cycle_days    INTEGER NOT NULL DEFAULT 5,       -- 3〜5（06章）
  daily_frequency INTEGER NOT NULL DEFAULT 3,     -- 1日の投稿本数（06章）
  approval_mode TEXT NOT NULL DEFAULT 'queue',    -- queue | auto（09章）
  platforms     TEXT NOT NULL DEFAULT '["x"]',    -- 有効プラットフォームのJSON配列（14章）
  active        INTEGER NOT NULL DEFAULT 1,
  onboarded     INTEGER NOT NULL DEFAULT 0,       -- 強制チュートリアル完了フラグ（0=未完了→チュートリアル）
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── このworker自身の設定（key-value）。会員workerは1人＝1workerなので、
--    member_uid（この会員の永続ユニークID）や honbu_token（本部の会員別トークン）を持つ。
--    既存DBは: CREATE TABLE 後そのまま（IF NOT EXISTSで安全）。
CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── アカウント別の鍵（会員がUIから連携・AES-GCM暗号化して保存） ──────────
-- 生の鍵はここに置かない。creds_enc は暗号文のみ（復号はWorker内・crypto.ts）。
CREATE TABLE IF NOT EXISTS account_creds (
  account_id  TEXT PRIMARY KEY,
  creds_enc   TEXT NOT NULL,                    -- 暗号化した creds JSON（x/claudeKey/threads）
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 投稿（全アカ横断・account_id ＋ source ＋ platform） ────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'x',        -- x | threads | …（14章）
  source        TEXT NOT NULL DEFAULT 'tool',     -- tool | manual | historical（04章）
  body          TEXT NOT NULL,                    -- 本文（会員のもの）
  reply_text    TEXT,                             -- ぶら下げリプ（CTA・補足）
  hook          TEXT,                             -- フック型ラベル（抽象化前の特徴）
  chars         INTEGER,
  line_breaks   INTEGER,
  cta_pos       TEXT,
  exp           TEXT,                             -- 実験/コホートタグ（07章。実験外はnull）
  status        TEXT NOT NULL DEFAULT 'queued',   -- queued | posted | failed | rejected
  not_before    TEXT,                             -- この日時(UTC)以前は投稿しない
  retry_count   INTEGER NOT NULL DEFAULT 0,
  platform_post_id        TEXT,                   -- 投稿先のID（tweet_id / threads_id）
  reply_platform_post_id  TEXT,
  posted_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT,                             -- 削除追従（04・11章）
  error         TEXT,
  link_code     TEXT                              -- URL誘導ポストが使った誘導先コード（クリック→CV解析の紐づけ）
);
-- 既存DBへの列追加（db:init後に一度だけ手動ALTER）:
--   ALTER TABLE posts ADD COLUMN link_code TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_acc_status ON posts(account_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_acc_posted ON posts(account_id, posted_at);
CREATE INDEX IF NOT EXISTS idx_posts_platform_id ON posts(platform_post_id);

-- ── 成果（raw ＋ norm ＋ settled・日次スナップショット） ──────────────────
CREATE TABLE IF NOT EXISTS post_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER NOT NULL,
  account_id    TEXT NOT NULL,
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
  impressions   INTEGER,
  likes         INTEGER,
  reposts       INTEGER,
  replies       INTEGER,
  quotes        INTEGER,
  bookmarks     INTEGER,
  url_link_clicks   INTEGER,
  profile_clicks    INTEGER,
  er_raw        REAL,                             -- 生のER
  er_norm       REAL,                             -- 正規化済み（平常比・04/06章）
  settled       INTEGER NOT NULL DEFAULT 0        -- 安定フラグ（≥10本判定の対象・06章）
);
CREATE INDEX IF NOT EXISTS idx_metrics_post ON post_metrics(post_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_metrics_acc ON post_metrics(account_id, fetched_at);

-- ── 個性プロファイル（縦の学び・account単位・voice-agnostic・06章） ────────
CREATE TABLE IF NOT EXISTS individual_profile (
  account_id    TEXT NOT NULL,
  key           TEXT NOT NULL,                    -- best_hours | hook_affinity | tone_bias | voice_core …
  value_json    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, key)
);

-- ── 声パック／学習素材（Phase 1は account-local。Phase 4でHub由来に・04章） ──
CREATE TABLE IF NOT EXISTS corpus (
  account_id    TEXT NOT NULL,
  key           TEXT NOT NULL,                    -- voice_samples | winning_patterns | neta_pool | exemplars …
  content       TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, key)
);

-- ── ネタプール原石（account単位・カテゴリ循環） ──────────────────────────
CREATE TABLE IF NOT EXISTS gems (
  account_id    TEXT NOT NULL,
  id            TEXT NOT NULL,                    -- 'N001' 等
  category      TEXT NOT NULL,
  content       TEXT NOT NULL,
  source        TEXT,
  used_count    INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT,
  ai_generated  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS idx_gems_cycle ON gems(account_id, category, used_count, last_used_at);

-- ── アカウント日次スナップショット（フォロワー等・正規化の土台・04/06章） ──
CREATE TABLE IF NOT EXISTS account_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'x',
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
  followers     INTEGER,
  following     INTEGER,
  posts_count   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_acc_metrics ON account_metrics(account_id, fetched_at);

-- ── リプ収集（is_self＝自リプ+1問題対応・04章の公平な集計の素地） ──────────
CREATE TABLE IF NOT EXISTS replies (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       TEXT NOT NULL,
  post_id          INTEGER,
  platform_post_id TEXT NOT NULL,                 -- 元ポストのID
  reply_id         TEXT NOT NULL UNIQUE,
  author_id        TEXT,
  author_username  TEXT,
  is_self          INTEGER NOT NULL DEFAULT 0,    -- 自分のリプ＝集計から除外（04章）
  text             TEXT NOT NULL,
  reply_likes      INTEGER,
  reply_created_at TEXT,
  fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(account_id, post_id);

-- ── サイクル状態機械（account単位・06章の個性ループ） ────────────────────
CREATE TABLE IF NOT EXISTS cycle_state (
  account_id    TEXT PRIMARY KEY,
  step          TEXT NOT NULL DEFAULT 'idle',     -- idle | metrics | learn | generate | filter | done
  note          TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- （旧 documents / inbox テーブルは未使用のため撤去。既存DBに残っていても無害＝放置でよい）

-- ── サンプル/トレーニングのフィードバック（添削の差分＋★評価・account単位） ──
-- 添削(kind='edit')：before_body=AI初稿 / after_body=会員の言葉 を両方残す＝差分学習用。
-- 評価(kind='rate')：rating=1〜5。voice_samplesには混ぜず、生成の「良い例/避ける例」に使う。
CREATE TABLE IF NOT EXISTS sample_feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  post_id       INTEGER,
  kind          TEXT NOT NULL,                    -- edit | rate
  rating        INTEGER,                          -- 1〜5（kind='rate'）
  before_body   TEXT,                             -- 添削前＝AI初稿（kind='edit'）
  after_body    TEXT,                             -- 添削後＝会員の言葉（kind='edit'）
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_acc ON sample_feedback(account_id, kind, created_at);

-- ── ネタ元データ（会員がアップロードする内容の素材。文体ではなく「何を書くか」の材料） ──
-- txt/mdをアップロード。1ファイル最大500KB・最大50件。生成時に内容のネタ元として参照。
CREATE TABLE IF NOT EXISTS neta_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content       TEXT NOT NULL,
  bytes         INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_neta_files_acc ON neta_files(account_id, created_at);

-- ── 利用イベント（API料金の「目安」用。投稿/メトリクスはそれぞれのテーブルから数えるので、 ──
--    ここには表に出ない読み取り＝過去ポストの学習読み取りなどを時刻つきで記録する（月別集計用）。
CREATE TABLE IF NOT EXISTS usage_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,                    -- learn_read（過去ポスト学習の読み取り）など
  units         INTEGER NOT NULL DEFAULT 0,       -- 読み取り件数など
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_events_acc ON usage_events(account_id, kind, created_at);

-- ── Claude利用（モデル別の料金目安用）。1回のAPI呼び出し＝1行。トークン実数とモデルを残す。 ──
CREATE TABLE IF NOT EXISTS claude_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  model         TEXT NOT NULL,                    -- claude-opus-4-8 / claude-haiku-4-5 など
  kind          TEXT,                             -- generate（本生成）/ describe（URL要約）等
  in_tokens     INTEGER NOT NULL DEFAULT 0,       -- 入力（uncached＝input + cache_creation）
  cached_tokens INTEGER NOT NULL DEFAULT 0,       -- キャッシュ読み（cache_read・約1割課金）
  out_tokens    INTEGER NOT NULL DEFAULT 0,       -- 出力
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_claude_usage_acc ON claude_usage(account_id, model, created_at);

-- ── 会員が開発した「オリジナルの型」（プロンプトはAIが生成・構造のみ・voice非依存）。 ──
--    将来は共有・昇格（集合知）にも使う。prompt＝生成指示、origin＝由来（指示/サンプル）。
CREATE TABLE IF NOT EXISTS custom_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  origin        TEXT,
  shared        INTEGER NOT NULL DEFAULT 1,        -- 集合知(本部)へ共有するか。1=共有(既定)/0=オプトアウト
  pattern       TEXT DEFAULT 'single_short',       -- 長さ・形式パターン(single_short/single_long/thread_short/thread_long)
  image_type    TEXT DEFAULT 'standard',           -- 画像の型(構図): standard/big/quote/number/list
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 既存DBへの列追加（db:init後に一度だけ手動ALTER）:
--   ALTER TABLE custom_types ADD COLUMN pattern TEXT DEFAULT 'single_short';
--   ALTER TABLE custom_types ADD COLUMN image_type TEXT DEFAULT 'standard';
CREATE INDEX IF NOT EXISTS idx_custom_types_acc ON custom_types(account_id, created_at);
-- 既存DBへの shared 列追加（無ければ db:init 後に一度だけ手動 ALTER）:
--   ALTER TABLE custom_types ADD COLUMN shared INTEGER NOT NULL DEFAULT 1;

-- ── 本部(HQ)から配られた「みんなに効く型」ライブラリのローカルキャッシュ（全アカウント共通）。 ──
--    本部の昇格セットを定期取得して総入れ替え。型の開発のおすすめ／新規会員のコールドスタートに使う。
CREATE TABLE IF NOT EXISTS hq_library (
  type_key     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  format       TEXT,
  score        REAL NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  sample_total INTEGER NOT NULL DEFAULT 0,
  scores_json  TEXT,                              -- 期間別スコア {"14":{"s","mc","st"},"30":..,"90":..}
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 既存DBへの列追加（db:init後に一度だけ手動ALTER）:
--   ALTER TABLE hq_library ADD COLUMN scores_json TEXT;

-- ── クリック→コンバージョン解析：誘導先で発生したCVを計測ピクセルから記録。 ──
--    投稿の誘導先URLに ?sr=<code>（code=account+urlの決定的ハッシュ＝link_targetsに保持）を付け、
--    会員がサンクスページに置いたタグが /cv?a=&sr=&v= を叩いて記録する。
CREATE TABLE IF NOT EXISTS conversions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT NOT NULL,
  code        TEXT NOT NULL,                      -- どの誘導先URL由来か（link_targetsのcode）
  value       REAL NOT NULL DEFAULT 0,            -- 売上額など（任意）
  ip_hash     TEXT,                               -- 簡易重複除外用
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv ON conversions(account_id, code, created_at);

-- 計測リンクの台帳（code→誘導先URL）。URLごとの『共通リンク』と、投稿ごとの『個別リンク』を持つ。
--   kind='url'＝そのURLの共通リンク（手動コピー用）／kind='post'＝投稿ごとの個別リンク（どの投稿が効いたか）。
CREATE TABLE IF NOT EXISTS tracked_links (
  code        TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'url',        -- url | post
  label       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tlinks ON tracked_links(account_id, url);

-- 計測リンク（/r 経由リダイレクト）のクリック記録。手動・自動どちらのポストでもクリックを数えられる。
CREATE TABLE IF NOT EXISTS link_clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT NOT NULL,
  code        TEXT NOT NULL,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clicks ON link_clicks(account_id, code, created_at);

-- ── 本部からのお知らせ（周知）のローカルキャッシュ。同期時に取得して総入れ替え。 ──
CREATE TABLE IF NOT EXISTS hq_broadcasts (
  id          INTEGER PRIMARY KEY,                 -- 本部側のbroadcast id
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 為替レート（月別・USD/JPY）。料金目安の換算に使う。月末時点の実レートを月ごとにキャッシュ。 ──
CREATE TABLE IF NOT EXISTS fx_rates (
  month         TEXT PRIMARY KEY,                 -- YYYY-MM
  usdjpy        REAL NOT NULL,                    -- 1ドル＝何円
  as_of         TEXT,                             -- 実際のレートの日付（月末営業日 等）
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
