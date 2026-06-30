# SNSの右腕（会員Worker）

あなたのX（旧Twitter）の発信を、**あなた自身の文体のまま**AIが下書きしてくれる「右腕」です。
鍵もデータも**あなたのCloudflare**に置かれ、運営は預かりません（限界費用ゼロ設計）。

> 招待コードをお持ちの方向けです。Cloudflare（無料）と Claude APIキー、X(Twitter)の開発者アカウントが必要です。

## セットアップ（ボタンひとつ）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sns-migiude/sns-migiude-worker)

1. 上のボタン → Cloudflareにログイン（無料アカウントでOK）
2. **Worker / D1 / R2 が自動で作られます**（あなたのアカウント上）
3. 途中で**シークレット**を聞かれます：
   - `API_TOKEN`（ダッシュボードの合言葉。自分で決める）
   - `ANTHROPIC_API_KEY`（Claude APIキー）
   - `CREDS_KEY`（X鍵の暗号化用。自分で決める）
4. デプロイ完了 → あなたのWorkerのURLを開く
5. 画面の案内に従って：**招待コード入力 → 利用規約に同意 → X/Claudeを連携 → 初期設定**
6. あとはAIが毎日下書きを用意します（手動承認モード/自動承認モードは切替可）

## 何が起きるか
- AIが**あなたの過去投稿を文体の正典**として、あなたの声で下書きを作成
- 「効く型」は本部（集合知）から配られ、**型・構成・タイミングの参考**にだけ使う（文体は常にあなた本人）
- 公開した投稿の反応だけが**匿名・構造化**されて集合知に還元される（本文・文体・鍵は送らない）

## 必要なもの
- Cloudflareアカウント（無料）
- Claude APIキー（従量・あなた負担）
- X(Twitter)の開発者アカウント＋APIキー（あなた負担）
- 招待コード（運営から）

## サポート
個別サポートはありません（ノンサポート方針）。画面の案内と本READMEで自己完結できる設計です。
