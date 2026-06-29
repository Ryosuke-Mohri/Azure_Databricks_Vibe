-- ============================================================
-- コスモ石油マーケティング Vibe Codingハンズオン
-- データセット投入スクリプト
-- ============================================================
-- 使い方:
--   
--   1. ハンズオンに利用するカタログとスキーマを準備し L13にカタログ名をL14にスキーマ名を指定してください。
--   2. Databricks SQL Editor で SQL Warehouse を選択
--   3. 本ファイル全文をコピペして Run All
--
-- ============================================================

USE CATALOG training;
USE SCHEMA dsg_vibe;

-- ============================================================
-- 1. customers (顧客マスタ 500件)
-- ============================================================
-- 注: rand() のシードは定数しか取れないため、各レコードでランダム値が
-- 必要な箇所は (pmod(hash(id,'salt'), 10000) / 10000.0) で擬似乱数を生成。
-- ============================================================
CREATE OR REPLACE TABLE customers
COMMENT 'コスモ石油マーケティング 顧客マスタ。コスモ・ザ・カード/カーライフ・スクエアの会員ステータスを含む'
AS
WITH src AS (
  SELECT
    id,
    -- 名前のインデックス (0-9 = 男性名, 10-19 = 女性名) を性別と同期させる
    pmod(int(hash(id, 'fn')), 20) AS name_idx
  FROM range(1, 501)
)
SELECT
  printf('C%05d', id) AS customer_id,
  element_at(
    array('佐藤','鈴木','高橋','田中','渡辺','伊藤','山本','中村','小林','加藤',
          '吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水'),
    pmod(int(hash(id, 'ln')), 20) + 1
  ) AS last_name,
  element_at(
    array('翔太','大輔','健一','直樹','拓也','和也','聡','亮','一郎','誠',
          '美咲','陽子','由美','彩','愛','麻衣','優子','沙織','千尋','理恵'),
    name_idx + 1
  ) AS first_name,
  date_add(
    DATE'1955-01-01',
    cast(pmod(int(hash(id, 'birth')), 20000) / 20000.0 * (365*50) AS INT)
  ) AS birthdate,  -- 1955〜2005年生 (21〜71歳)
  CASE WHEN name_idx < 10 THEN '男' ELSE '女' END AS gender,
  element_at(
    array('東京都','神奈川県','千葉県','埼玉県','大阪府','京都府','兵庫県','愛知県',
          '福岡県','北海道','宮城県','広島県','静岡県','茨城県','栃木県'),
    pmod(int(hash(id, 'area')), 15) + 1
  ) AS area,
  date_add(
    DATE'2018-01-01',
    cast(pmod(int(hash(id, 'join')), 10000) / 10000.0 * (365*7) AS INT)
  ) AS join_date,
  -- 自社公式アプリ「カーライフ・スクエア」会員 (約35%)
  pmod(int(hash(id, 'carlife')), 100) < 35 AS carlife_square_member,
  -- 自社カード「コスモ・ザ・カード」保有 (約30%)
  pmod(int(hash(id, 'cosmocard')), 100) < 30 AS cosmo_card_holder
FROM src;

-- ============================================================
-- 2. vehicles (保有車両 500件 = 顧客と1:1)
-- ============================================================
CREATE OR REPLACE TABLE vehicles
COMMENT '顧客の保有車両情報。next_inspection_at で車検時期セグメントを作成可能'
AS
SELECT
  printf('C%05d', id) AS customer_id,
  element_at(
    array('トヨタ','ホンダ','日産','スズキ','ダイハツ','マツダ','スバル','三菱'),
    pmod(int(hash(id, 'maker')), 8) + 1
  ) AS maker,
  element_at(
    array('プリウス','カローラ','アクア','フィット','ノート','セレナ','ワゴンR','タント',
          'デミオ','CX-5','フォレスター','アウトランダー','ヴォクシー','ハリアー','ヴェゼル','ライズ'),
    pmod(int(hash(id, 'model')), 16) + 1
  ) AS model,
  2010 + pmod(int(hash(id, 'year')), 16) AS year_model,
  -- 約10%（10人に1人）の顧客は車検が3ヶ月以内、残りは3ヶ月〜2年先
  CASE
    WHEN pmod(int(hash(id, 'insp_bucket')), 10) = 0
      THEN date_add(
        current_date(),
        cast(pmod(int(hash(id, 'insp_near')), 10000) / 10000.0 * 90 AS INT)
      )
    ELSE date_add(
      current_date(),
      90 + cast(pmod(int(hash(id, 'insp_far')), 10000) / 10000.0 * 640 AS INT)
    )
  END AS next_inspection_at
FROM range(1, 501);

-- ============================================================
-- 3. fuel_transactions (給油トランザクション 5000件)
-- ============================================================
-- 設計上の特徴:
--   - 約15%の顧客は休眠予備軍 (直近60日以上給油なし)
--   - 約20%の顧客はハイオク中心 (ヘビーユーザー候補)
--   - 約15%の顧客はコスモ・ザ・カードを一度も使わない決済プロファイル
--   - 顧客ごとに「主に使うSS」(primary_ss) が決まっており、約20%は強くSS固定
--     (ロイヤル: 90%集中)、約80%は弱い偏り (30%集中) → SEG007 お気に入りSS常連顧客の根拠
--   - 月別ピーク (5月GW, 8月お盆, 12月年末年始) でトランザクション頻度に偏り
--   - 時間帯ピーク (夕方17-19時) で時刻に偏り
--   - 平日30%が weekend bias で土曜にシフト
--   - 夏 (6-8月) は給油量 +10%、冬 (12-2月) は -10% (季節消費差)
-- ============================================================
CREATE OR REPLACE TABLE fuel_transactions
COMMENT '給油トランザクション。最寄りSS偏り・季節性 (月ピーク・曜日・時間帯) を反映'
AS
WITH txn_seq AS (
  SELECT id AS seq FROM range(1, 5001)
),
assigned AS (
  SELECT
    seq,
    printf('C%05d', pmod(int(hash(seq, 'cust')), 500) + 1) AS customer_id
  FROM txn_seq
),
profile AS (
  SELECT
    a.seq,
    a.customer_id,
    -- 顧客の主要SS (決定論的)
    printf('SS%03d', pmod(int(hash(a.customer_id, 'primary_ss')), 50) + 1) AS primary_ss,
    pmod(int(hash(a.customer_id, 'activity')),  20) AS activity_bucket,
    pmod(int(hash(a.customer_id, 'fuel_pref')), 20) AS fuel_pref_bucket,
    pmod(int(hash(a.customer_id, 'card_use')),  20) AS card_use_bucket,
    -- ロイヤル度: 約20%の顧客は強く primary_ss に偏る (ロイヤル)、残り80%は弱く偏る
    pmod(int(hash(a.customer_id, 'loyalty')),   20) AS loyalty_bucket
  FROM assigned a
),
date_seed AS (
  SELECT
    p.*,
    -- 月選択 (weight array length=22): May/Aug/Dec を3倍、Apr/Jul/Oct を2倍に偏らせる
    element_at(
      array(1, 1, 2, 3, 4, 4, 5, 5, 5, 6, 7, 7, 8, 8, 8, 9, 10, 10, 11, 12, 12, 12),
      pmod(int(hash(seq, 'monthsel')), 22) + 1
    ) AS sel_month,
    -- 日選択 1-28 (月末日トラブル回避)
    pmod(int(hash(seq, 'daysel')), 28) + 1 AS sel_day,
    -- 時間帯選択 (weight array length=23): 夕方17-19時にピーク、朝も少し多め
    element_at(
      array(7, 8, 8, 9, 10, 10, 11, 12, 13, 14, 15, 16, 17, 17, 17, 18, 18, 18, 19, 19, 20, 20, 21),
      pmod(int(hash(seq, 'hour')), 23) + 1
    ) AS sel_hour,
    pmod(int(hash(seq, 'min')), 60) AS sel_minute
  FROM profile p
),
date_assembled AS (
  SELECT
    *,
    -- アクティブ顧客は月weightで month を選び、今年/去年を判定。休眠顧客は60-540日前の均一分布
    CASE
      WHEN activity_bucket < 3 THEN
        cast(
          date_sub(
            current_date(),
            60 + cast(pmod(int(hash(seq, 'dormant_d')), 10000) / 10000.0 * 480 AS INT)
          ) AS TIMESTAMP
        )
      ELSE
        cast(
          make_date(
            CASE WHEN sel_month <= month(current_date())
                 THEN year(current_date())
                 ELSE year(current_date()) - 1
            END,
            sel_month,
            sel_day
          ) AS TIMESTAMP
        )
    END AS base_date_ts
  FROM date_seed
),
date_adjusted AS (
  -- weekend bias: 平日 (月-金) かつ 30% で次の土曜まで進める
  SELECT
    *,
    CASE
      WHEN activity_bucket < 3 THEN base_date_ts
      WHEN dayofweek(base_date_ts) IN (1, 7) THEN base_date_ts
      WHEN pmod(int(hash(seq, 'wkbias')), 10) < 3
        THEN timestampadd(DAY, (7 - dayofweek(base_date_ts)) % 7, base_date_ts)
      ELSE base_date_ts
    END AS adjusted_date_ts
  FROM date_assembled
),
final_dates AS (
  -- 未来日チェック: 万一未来になったら 7日戻す
  SELECT
    seq, customer_id, primary_ss,
    activity_bucket, fuel_pref_bucket, card_use_bucket, loyalty_bucket,
    sel_hour, sel_minute,
    CASE
      WHEN adjusted_date_ts > current_timestamp()
        THEN timestampadd(DAY, -7, adjusted_date_ts)
      ELSE adjusted_date_ts
    END AS adj_ts
  FROM date_adjusted
),
generated AS (
  SELECT
    printf('T%07d', seq) AS txn_id,
    customer_id,
    -- SS分布: ロイヤル度高 (20%) は90%が primary_ss、一般 (80%) は30%が primary_ss
    -- SEG007 お気に入りSS常連顧客 (直近90日で同じSSで3回以上) の対象顧客を作り出すための偏り
    CASE
      WHEN loyalty_bucket < 4
        THEN CASE WHEN pmod(int(hash(seq, 'ss_choice_l')), 10) < 9
                  THEN primary_ss
                  ELSE printf('SS%03d', pmod(int(hash(seq, 'ss_other_l')), 50) + 1)
             END
      ELSE
        CASE WHEN pmod(int(hash(seq, 'ss_choice_g')), 10) < 3
             THEN primary_ss
             ELSE printf('SS%03d', pmod(int(hash(seq, 'ss_other_g')), 50) + 1)
        END
    END AS ss_id,
    make_timestamp(
      year(adj_ts), month(adj_ts), day(adj_ts),
      sel_hour, sel_minute, 0
    ) AS txn_at,
    -- 油種: fuel_pref_bucket<4(20%)はハイオク中心、=4(5%)は軽油中心、残りは通常
    CASE
      WHEN fuel_pref_bucket < 4
        THEN element_at(array('ハイオク','ハイオク','ハイオク','ハイオク','レギュラー'),
                        pmod(int(hash(seq, 'ft1')), 5) + 1)
      WHEN fuel_pref_bucket = 4
        THEN '軽油'
      ELSE element_at(array('レギュラー','レギュラー','レギュラー','レギュラー','ハイオク','軽油'),
                      pmod(int(hash(seq, 'ft2')), 6) + 1)
    END AS fuel_type,
    card_use_bucket,
    seq AS _seq
  FROM final_dates
),
with_liters AS (
  SELECT
    g.*,
    -- 季節性: 夏 (6-8月) は給油量 +10%、冬 (12-2月) は -10%
    cast(
      (15 + pmod(int(hash(_seq, 'liters')), 10000) / 10000.0 * 40) *
      CASE
        WHEN month(txn_at) IN (6, 7, 8)  THEN 1.10
        WHEN month(txn_at) IN (12, 1, 2) THEN 0.90
        ELSE 1.00
      END
      AS INT
    ) AS liters
  FROM generated g
)
SELECT
  txn_id,
  customer_id,
  ss_id,
  txn_at,
  fuel_type,
  liters,
  -- 決済方法: card_use_bucket<3 (15%)はコスモ・ザ・カードを一切使わない
  CASE
    WHEN card_use_bucket < 3
      THEN element_at(array('現金','クレジット','クレジット'),
                      pmod(int(hash(_seq, 'pay1')), 3) + 1)
    ELSE element_at(array('コスモ・ザ・カード','コスモ・ザ・カード','コスモ・ザ・カード','クレジット','現金'),
                    pmod(int(hash(_seq, 'pay2')), 5) + 1)
  END AS payment_method,
  -- 金額：油種別単価 × リッター数（±15円の単価ばらつき）
  cast(
    liters *
    CASE fuel_type
      WHEN 'ハイオク' THEN 180 + cast(pmod(int(hash(_seq, 'p1')), 10000) / 10000.0 * 20 AS INT)
      WHEN '軽油'     THEN 145 + cast(pmod(int(hash(_seq, 'p2')), 10000) / 10000.0 * 15 AS INT)
      ELSE                 165 + cast(pmod(int(hash(_seq, 'p3')), 10000) / 10000.0 * 15 AS INT)
    END
    AS BIGINT
  ) AS amount_yen
FROM with_liters;

-- ============================================================
-- 4. campaigns (キャンペーンマスタ 5本)
-- ============================================================
CREATE OR REPLACE TABLE campaigns
COMMENT 'コスモ石油マーケティングの販促キャンペーンマスタ。target_segment は CDP セグメントと対応'
AS
SELECT * FROM VALUES
  ('CAMP001', '夏のハイオク 5円引きキャンペーン',         DATE'2025-06-01', DATE'2025-08-31', 'SEG001'),
  ('CAMP002', '冬のドライブ応援フェア',                   DATE'2025-12-01', DATE'2026-02-28', NULL),
  ('CAMP003', '車検早期予約 5,000円OFF',                  DATE'2025-04-01', DATE'2026-03-31', 'SEG003'),
  ('CAMP004', 'コスモ・ザ・カード新規入会で初回給油 10円引', DATE'2025-04-01', DATE'2026-03-31', 'SEG004'),
  ('CAMP005', 'カーライフ・スクエア DL 200円クーポン',     DATE'2026-03-01', DATE'2026-04-30', 'SEG005')
AS t(campaign_id, campaign_name, start_date, end_date, target_segment);

-- ============================================================
-- 5. campaign_participations (キャンペーン参加履歴 約500件)
-- ============================================================
CREATE OR REPLACE TABLE campaign_participations
COMMENT 'キャンペーン参加履歴。各顧客は各キャンペーンに約20%の確率で参加'
AS
WITH cust_camp AS (
  SELECT
    c.customer_id,
    camp.campaign_id,
    camp.start_date,
    camp.end_date,
    pmod(int(hash(c.customer_id, camp.campaign_id, 'attend')), 100) AS attend_prob
  FROM customers c
  CROSS JOIN campaigns camp
),
attended AS (
  SELECT
    customer_id,
    campaign_id,
    start_date,
    end_date,
    row_number() OVER (ORDER BY customer_id, campaign_id) AS seq
  FROM cust_camp
  WHERE attend_prob < 20  -- 約20% → 500顧客 × 5キャンペーン × 20% = 期待値500件
)
SELECT
  printf('CP%05d', seq) AS participation_id,
  customer_id,
  campaign_id,
  cast(
    timestampadd(
      DAY,
      cast(pmod(int(hash(seq, 'partday')), 10000) / 10000.0 * datediff(end_date, start_date) AS INT),
      cast(start_date AS TIMESTAMP)
    )
    + make_interval(0, 0, 0, 0, pmod(int(hash(seq, 'parthr')), 24), pmod(int(hash(seq, 'partmin')), 60), 0)
    AS TIMESTAMP
  ) AS participated_at
FROM attended;

-- ============================================================
-- 6. segments (顧客セグメント) — 上のテーブルから派生
-- ============================================================
CREATE OR REPLACE TABLE segments (
  segment_id   STRING,
  segment_name STRING,
  customer_id  STRING,
  created_at   TIMESTAMP
)
COMMENT 'CDPセグメント。Audience Builderアプリで追加INSERTする想定';

-- ============================================================
-- 7. segment_definitions (セグメント定義 — UI から保存)
-- ============================================================
-- Audience Builder で保存したセグメントの「条件」を JSON で保持。
-- UI から再ロードして条件ビルダーを復元するためのテーブル。
-- segment_id は segments テーブルと対応する。
-- 組み込みセグメント (SEG001〜SEG008) も SEED として初期投入する。
-- source カラムで 'builtin' / 'user' を区別。組み込みは編集不可扱い。
-- ============================================================
CREATE OR REPLACE TABLE segment_definitions (
  segment_id   STRING NOT NULL,
  segment_name STRING NOT NULL,
  source       STRING,    -- 'builtin' (組み込み: setup.sqlで投入) / 'user' (UIから作成)
  description  STRING,    -- 人間可読の定義説明 (組み込みは元SQLロジックの要約)
  filter_logic STRING,    -- 'AND' / 'OR'
  filter_json  STRING,    -- 条件配列の JSON 文字列。例: [{"field":"gender","operator":"=","value":"女"}]
  created_at   TIMESTAMP,
  updated_at   TIMESTAMP
)
COMMENT 'Audience Builder で保存したセグメントの条件定義。組み込みセグメント (source=builtin) も SEED として登録。UI 一覧では source で区別し、組み込みは編集不可とする';

-- 組み込みセグメントの SEED 投入
-- 注意: filter_json は UI 条件ビルダーで近似表現できる範囲で記述。元のSQLロジックと完全一致は保証しない。
INSERT INTO segment_definitions
SELECT * FROM VALUES
  ('SEG001', 'ハイオクヘビーユーザー', 'builtin',
   'ハイオク累計購入額 > 50,000円',
   'AND',
   '[{"field":"haiokyu_total_amount","operator":">","value":50000}]',
   current_timestamp(), current_timestamp()),
  ('SEG002', '休眠予備軍', 'builtin',
   '直近給油が60日以上前、または未給油',
   'AND',
   '[{"field":"days_since_last_txn","operator":">=","value":60}]',
   current_timestamp(), current_timestamp()),
  ('SEG003', '車検3ヶ月以内', 'builtin',
   '次回車検期日が今日〜90日後',
   'AND',
   '[{"field":"inspection_days","operator":"BETWEEN","value":[0,90]}]',
   current_timestamp(), current_timestamp()),
  ('SEG004', 'コスモ・ザ・カード未活用', 'builtin',
   'コスモ・ザ・カード保有 かつ 直近30日にカード決済なし',
   'AND',
   '[{"field":"cosmo_card_holder","operator":"=","value":true},{"field":"card_payment_count_30d","operator":"=","value":0}]',
   current_timestamp(), current_timestamp()),
  ('SEG005', 'カーライフ・スクエア未会員', 'builtin',
   'カーライフ・スクエア会員フラグが false',
   'AND',
   '[{"field":"carlife_square_member","operator":"=","value":false}]',
   current_timestamp(), current_timestamp()),
  ('SEG006', '車検目前×コスモ・ザ・カード未保有', 'builtin',
   '車検90日以内 かつ コスモ・ザ・カード未保有',
   'AND',
   '[{"field":"inspection_days","operator":"BETWEEN","value":[0,90]},{"field":"cosmo_card_holder","operator":"=","value":false}]',
   current_timestamp(), current_timestamp()),
  ('SEG007', 'お気に入りSS常連顧客', 'builtin',
   '直近90日、同じSSで3回以上給油',
   'AND',
   '[{"field":"same_ss_count_90d","operator":">=","value":3}]',
   current_timestamp(), current_timestamp()),
  ('SEG008', '直近キャンペーン参加経験あり', 'builtin',
   '直近180日に何らかのキャンペーンに参加',
   'AND',
   '[{"field":"has_recent_campaign","operator":"=","value":true}]',
   current_timestamp(), current_timestamp())
AS t(segment_id, segment_name, source, description, filter_logic, filter_json, created_at, updated_at);

-- SEG001: ハイオクヘビーユーザー (ハイオク累計購入額 > 50,000円)
INSERT INTO segments
SELECT
  'SEG001' AS segment_id,
  'ハイオクヘビーユーザー' AS segment_name,
  customer_id,
  current_timestamp() AS created_at
FROM (
  SELECT customer_id, SUM(amount_yen) AS total_haiokyu
  FROM fuel_transactions
  WHERE fuel_type = 'ハイオク'
  GROUP BY customer_id
  HAVING SUM(amount_yen) > 50000
);

-- SEG002: 休眠予備軍 (直近給油が60日以上前、もしくは未給油)
INSERT INTO segments
SELECT
  'SEG002',
  '休眠予備軍',
  c.customer_id,
  current_timestamp()
FROM customers c
LEFT JOIN (
  SELECT customer_id, MAX(txn_at) AS last_txn_at
  FROM fuel_transactions
  GROUP BY customer_id
) t ON c.customer_id = t.customer_id
WHERE t.last_txn_at IS NULL
   OR t.last_txn_at < current_timestamp() - INTERVAL 60 DAYS;

-- SEG003: 車検3ヶ月以内
INSERT INTO segments
SELECT
  'SEG003',
  '車検3ヶ月以内',
  customer_id,
  current_timestamp()
FROM vehicles
WHERE next_inspection_at BETWEEN current_date()
                             AND date_add(current_date(), 90);

-- SEG004: コスモ・ザ・カード未活用 (cosmo_card_holder=true だが直近30日にコスモ・ザ・カード決済なし)
INSERT INTO segments
SELECT
  'SEG004',
  'コスモ・ザ・カード未活用',
  c.customer_id,
  current_timestamp()
FROM customers c
LEFT JOIN (
  SELECT DISTINCT customer_id
  FROM fuel_transactions
  WHERE payment_method = 'コスモ・ザ・カード'
    AND txn_at >= current_timestamp() - INTERVAL 30 DAYS
) e ON c.customer_id = e.customer_id
WHERE c.cosmo_card_holder = true
  AND e.customer_id IS NULL;

-- SEG005: カーライフ・スクエア未会員
INSERT INTO segments
SELECT
  'SEG005',
  'カーライフ・スクエア未会員',
  customer_id,
  current_timestamp()
FROM customers
WHERE carlife_square_member = false;

-- SEG006: 車検目前×コスモ・ザ・カード未保有 (車検90日以内 かつ cosmo_card_holder=false)
INSERT INTO segments
SELECT
  'SEG006',
  '車検目前×コスモ・ザ・カード未保有',
  c.customer_id,
  current_timestamp()
FROM customers c
JOIN vehicles v ON c.customer_id = v.customer_id
WHERE c.cosmo_card_holder = false
  AND v.next_inspection_at BETWEEN current_date()
                               AND date_add(current_date(), 90);

-- SEG007: お気に入りSS常連顧客 (直近90日、同じSSで3回以上給油した顧客)
-- ※ 旧定義 (給油の70%以上が特定SS) は UI 条件ビルダーで表現困難なため、
--    UI で表現可能な「同一SS x 直近90日 x 回数」近似に変更。
INSERT INTO segments
SELECT DISTINCT
  'SEG007',
  'お気に入りSS常連顧客',
  customer_id,
  current_timestamp()
FROM (
  SELECT
    customer_id,
    ss_id,
    COUNT(*) AS n_in_90d
  FROM fuel_transactions
  WHERE txn_at >= current_timestamp() - INTERVAL 90 DAYS
  GROUP BY customer_id, ss_id
)
WHERE n_in_90d >= 3;

-- SEG008: 直近キャンペーン参加経験あり (直近180日以内に何らかのキャンペーン参加)
INSERT INTO segments
SELECT DISTINCT
  'SEG008',
  '直近キャンペーン参加経験あり',
  customer_id,
  current_timestamp()
FROM campaign_participations
WHERE participated_at >= current_timestamp() - INTERVAL 180 DAYS;

-- ============================================================
-- 8. 検証クエリ (任意実行)
-- ============================================================
-- 各テーブル件数
SELECT 'customers'                AS table_name, COUNT(*) AS n FROM customers
UNION ALL SELECT 'vehicles',                COUNT(*) FROM vehicles
UNION ALL SELECT 'fuel_transactions',       COUNT(*) FROM fuel_transactions
UNION ALL SELECT 'campaigns',               COUNT(*) FROM campaigns
UNION ALL SELECT 'campaign_participations', COUNT(*) FROM campaign_participations
UNION ALL SELECT 'segments',                COUNT(*) FROM segments
UNION ALL SELECT 'segment_definitions',     COUNT(*) FROM segment_definitions;

-- セグメント別人数
SELECT segment_id, segment_name, COUNT(DISTINCT customer_id) AS n_customers
FROM segments
GROUP BY segment_id, segment_name
ORDER BY segment_id;

-- 会員率チェック
SELECT
  AVG(CASE WHEN cosmo_card_holder THEN 1.0 ELSE 0.0 END) AS cosmo_card_rate,
  AVG(CASE WHEN carlife_square_member THEN 1.0 ELSE 0.0 END) AS carlife_square_rate
FROM customers;

-- 月別トランザクション分布 (季節性確認)
SELECT
  month(txn_at) AS m,
  COUNT(*) AS n
FROM fuel_transactions
GROUP BY month(txn_at)
ORDER BY m;
