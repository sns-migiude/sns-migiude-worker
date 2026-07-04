-- オーガニック/広告(promoted)の内訳と、広告に使った投稿フラグ。
-- 学習をオーガニックER基準にし、広告は別アルゴリズム(promo_affinity)で学習するため（1.20）。
-- ※ 既存DBはワーカー実行時の自己修復(ensurePromotedColumns)でも補われる（d1_migrationsドリフト対策）。
ALTER TABLE post_metrics ADD COLUMN org_impressions INTEGER;
ALTER TABLE post_metrics ADD COLUMN org_er_raw REAL;
ALTER TABLE post_metrics ADD COLUMN promo_impressions INTEGER;
ALTER TABLE post_metrics ADD COLUMN promo_er_raw REAL;
ALTER TABLE posts ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0;
