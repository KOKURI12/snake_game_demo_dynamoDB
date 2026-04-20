# Snake Game — AWS 3層アーキテクチャ構成

## 概要

スネークゲームを AWS 上で運用するための 3層アーキテクチャ構成です。
静的フロントエンドの高速配信、サーバーレス API によるスコア管理、DynamoDB によるランキングデータ永続化、ElastiCache Redis によるキャッシュを実現します。

---

## バージョン履歴

| バージョン | 内容 | 状態 |
|---|---|---|
| v1.0 | S3 + CloudFront + API Gateway + Lambda + RDS MySQL | 旧構成(廃止) |
| v2.0 | RDS → DynamoDB 移行、VPC 撤廃、コスト最適化 | リリース済み |
| v2.1 | DynamoDB GSI 追加(scan → query 移行)、ElastiCache Redis 導入 | リリース済み |
| **v2.2** | **UI 改修 + BGM / 効果音追加(ui-audio-v2)** | **リリース済み** |

---

## アーキテクチャ全体図

```
ユーザー (ブラウザ / スマートフォン)
        │
        │ HTTPS
        ▼
┌───────────────────────────────────────┐
│  プレゼンテーション層                  │
│                                       │
│  CloudFront (CDN・HTTPS 終端)         │
│       │                               │
│       ▼                               │
│  S3 Bucket (静的ファイル配信)          │
│  ├── index.html                       │
│  ├── css/style.css                    │
│  └── js/                             │
│      ├── api.js                       │
│      └── snake.js                    │
└───────────────────────────────────────┘
        │
        │ API 呼び出し (HTTPS / JSON)
        ▼
┌───────────────────────────────────────┐
│  アプリケーション層                   │
│                                       │
│  API Gateway (HTTP API)               │
│  ├── POST /scores  ──▶ Lambda         │
│  │                    post_score      │
│  └── GET  /ranking ──▶ Lambda         │
│                        get_ranking    │
│                            │          │
│                    ┌───────▼──────┐   │
│                    │ ElastiCache  │   │
│                    │ Redis Cache  │   │
│                    └──────────────┘   │
└───────────────────────────────────────┘
        │
        │ DynamoDB API (HTTPS)
        ▼
┌───────────────────────────────────────┐
│  データ層                             │
│                                       │
│  DynamoDB (PAY_PER_REQUEST)           │
│  └── ScoresTable                      │
│      ├── PK: player_name             │
│      └── GSI: RankingIndex           │
│          ├── gsi_pk (HASH)           │
│          └── score (RANGE)           │
└───────────────────────────────────────┘
```

---

## フォルダ構成

```
snake_game_demo_dynamoDB/
│
├── frontend/                        # プレゼンテーション層 (S3 + CloudFront)
│   ├── index.html                   # v2.1 メインページ(rollback 用に保持)
│   ├── index-v2.html                # v2.2 メインページ(現 Default Root Object)
│   ├── css/
│   │   ├── style.css                # v2.1 スタイル(rollback 用に保持)
│   │   └── style-v2.css             # v2.2 スタイル(level-flash + 背景色連動)
│   └── js/
│       ├── api.js                   # API Gateway クライアント(共通)
│       ├── snake.js                 # v2.1 ゲームロジック(rollback 用に保持)
│       ├── snake-v2.js              # v2.2 ゲームロジック(BGM・フラッシュ統合)
│       └── audio-v2.js             # v2.2 Web Audio API 音源モジュール(新規)
│
├── backend/                         # アプリケーション層 (API Gateway + Lambda)
│   ├── post_score/
│   │   └── lambda_function.py       # スコア登録 Lambda (POST /scores)
│   ├── get_ranking/
│   │   └── lambda_function.py       # ランキング取得 Lambda (GET /ranking)
│   └── layer/
│       └── requirements.txt         # Lambda Layer 依存関係
│
├── infrastructure/                  # IaC + SAM 設定
│   ├── template.yaml                # SAM テンプレート(全 AWS リソース定義)
│   └── samconfig.toml               # SAM デプロイ設定
│
├── scripts/                         # 運用スクリプト
│   └── backfill_gsi.py             # DynamoDB GSI バックフィルスクリプト
│
├── .claude/                         # Claude Code スキル設定
│   └── skills/
│       ├── frontend-token-saving/   # フロントエンド作業用
│       ├── lambda-dynamodb-backend/ # バックエンド作業用
│       └── cloudformation-infrastructure/ # インフラ作業用
│
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml      # フロントエンド自動デプロイ
│       └── deploy-sam.yml           # バックエンド + インフラ自動デプロイ
│
└── backup/                          # DynamoDB バックアップ (gitignore 対象)
```

---

## API 仕様

### POST /scores — スコア登録

**リクエスト**
```json
{
  "player_name":   "PLAYER_A",
  "score":         20,
  "level_reached": 4
}
```

**レスポンス (201 Created)**
```json
{
  "message": "Score posted successfully"
}
```

### GET /ranking — ランキング取得

**クエリパラメータ**

| パラメータ | デフォルト | 最大 | 説明 |
|---|---|---|---|
| `limit` | 10 | 100 | 取得件数 |

**レスポンス (200 OK)**
```json
[
  {
    "rank": 1,
    "player_name": "PLAYER_A",
    "score": 25,
    "level_reached": 6,
    "played_at": "2026-04-18T10:00:00"
  }
]
```

---

## DynamoDB 設計

### ScoresTable

| 属性 | 型 | 役割 |
|---|---|---|
| `player_name` | String | テーブル PK(1プレイヤー = 最高スコアのみ保持) |
| `score` | Number | スコア |
| `level_reached` | Number | 到達レベル |
| `gsi_pk` | String | GSI 用定数値(`"ALL"`) |
| `created_at` | String | 登録日時 |

### RankingIndex (GSI)

| 属性 | 型 | 役割 |
|---|---|---|
| `gsi_pk` | String (HASH) | 定数 `"ALL"` で全件を同一パーティションに集約 |
| `score` | Number (RANGE) | 降順ソートで Top N 取得 |

**設計ポイント:**
- `player_name` を PK にすることで「1プレイヤー = 最高スコアのみ保持」を自然に実現
- GSI の `gsi_pk = "ALL"` 定数パターンにより、scan を使わず query で Top N 取得が可能
- `PAY_PER_REQUEST` モードで小規模〜中規模のリクエスト変動に対応

---

## ElastiCache Redis 設計

### キャッシュ戦略

| 対象 | TTL | 用途 |
|---|---|---|
| ランキングデータ | 3600秒(1時間) | `get_ranking` の DynamoDB Query 結果をキャッシュ |

**Lambda での参照パターン:**

```
get_ranking Lambda
    ├─ Redis に hit → キャッシュデータを返す(高速)
    └─ Redis に miss → DynamoDB Query → Redis に保存 → データ返却
```

---

## デプロイ構成

### GitHub Actions ワークフロー

| ワークフロー | トリガー | 処理 |
|---|---|---|
| `deploy-frontend.yml` | `frontend/**` への push | S3 sync + CloudFront Invalidation |
| `deploy-sam.yml` | `backend/**` / `infrastructure/**` への push | SAM build + deploy |

### 必要な GitHub Secrets

| シークレット名 | 内容 |
|---|---|
| `AWS_ACCESS_KEY_ID` | デプロイ用 IAM アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | デプロイ用 IAM シークレットキー |
| `AWS_REGION` | `ap-northeast-1` |
| `S3_BUCKET` | フロントエンド配信用 S3 バケット名 |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront ディストリビューション ID |
| `SAM_STACK_NAME` | CloudFormation スタック名 |
| `SAM_S3_BUCKET` | SAM アーティファクト用 S3 バケット名 |

---

## 開発時の運用

### ブランチ運用

```
main ──── 本番デプロイ対象(GitHub Actions が自動デプロイ)
  └── feature/xxx ──── 機能開発ブランチ
                         └── PR / merge → main でデプロイ発火
```

### Claude Code スキルによる作業分担

| スキル | 対象範囲 | 用途 |
|---|---|---|
| `frontend-token-saving` | `frontend/` 配下 | HTML / CSS / JS の調査・修正 |
| `lambda-dynamodb-backend` | `backend/` 配下 | Lambda / DynamoDB / API Gateway の調査・修正 |
| `cloudformation-infrastructure` | `infrastructure/` 配下 | CloudFormation YAML の変更・IAM設計 |

---

## v2.2 リリース済み:ui-audio-v2

### 実装内容

#### 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| `frontend/index-v2.html` | 新規 | HUD 3列構成 + BGM トグルボタン |
| `frontend/css/style-v2.css` | 新規 | level-flash アニメーション + 背景色連動 |
| `frontend/js/audio-v2.js` | 新規 | Web Audio API チップチューン BGM + 効果音 |
| `frontend/js/snake-v2.js` | 新規 | BGM 制御 + レベルフラッシュ統合 |
| `frontend/index.html` | 変更なし | 旧バージョン(rollback 用に保持) |
| `frontend/css/style.css` | 変更なし | 旧バージョン(rollback 用に保持) |
| `frontend/js/snake.js` | 変更なし | 旧バージョン(rollback 用に保持) |

#### 要件1: level バナー移動 ✅

```
変更前: [SCORE]          [BEST]
         [LEVEL] ← 独立表示
変更後: [SCORE]  [LEVEL]  [BEST] ← HUD 3列横並び
```

- HUD を flex 3列に再構成、LEVEL を中央に配置
- レベルアップ時: `.level-flash` クラスを 800ms 付与してアニメーション発火

```css
@keyframes level-pulse {
  0%   { transform: scale(1)    rotate(0deg); }
  20%  { transform: scale(1.45) rotate(-6deg); }
  40%  { transform: scale(1.25) rotate(5deg); }
  60%  { transform: scale(1.4)  rotate(-4deg); }
  80%  { transform: scale(1.15) rotate(2deg); }
  100% { transform: scale(1)    rotate(0deg); }
}
```

#### 要件2: 背景色連動 ✅

- レベルアップ時: `#app` に `.level-up-bg` クラスを付与
- ウォームグラデーションへ transition でフェード変化
- snake / food の視認性を損なわない薄い変化に設計

#### 要件3: BGM 制御 ✅

- **音源:** 外部ファイル不要、Web Audio API で完全自己生成
- **スタイル:** C マイナーペンタトニック、132 BPM チップチューン(Square リード + Triangle ベース)
- **初期状態:** BGM デフォルト ON

```javascript
// AudioContext.suspend/resume で停止位置を保持
startGame()  → SnakeAudio.startBgm()
pauseGame()  → SnakeAudio.pauseBgm()   // AudioContext.suspend()
resumeGame() → SnakeAudio.resumeBgm()  // AudioContext.resume()
gameOver()   → SnakeAudio.stopBgm()
```

- BGM トグルボタン: `🔊 / 🔇` でオン/オフ切り替え可能

#### 要件4: 効果音 ✅

| 効果音 | タイミング | 音 |
|---|---|---|
| Eat SE | food 取得時 | 660→1760 Hz の上昇 Square ブリップ |
| GameOver SE | ゲームオーバー時 | C5→A4→F4→C4 の下降 Sawtooth アルペジオ |

#### 要件5: rollback 対応 ✅

**ファイル共存パターンによる rollback:**

```
S3 / CloudFront
├── index.html      ← 旧バージョン v2.1(rollback 時はここを Default Root Object に戻す)
├── index-v2.html   ← 新バージョン v2.2(現在の Default Root Object)
├── css/style.css       ← 旧バージョン(変更なし)
├── css/style-v2.css    ← 新バージョン
├── js/snake.js         ← 旧バージョン(変更なし)
├── js/snake-v2.js      ← 新バージョン
└── js/audio-v2.js      ← 新バージョン(新規追加)
```

**rollback 手順(30秒で完了):**

```
1. CloudFront コンソール → ディストリビューション設定
2. Default Root Object を index-v2.html → index.html に変更
3. 保存 → キャッシュ削除(Invalidation: /*)
```

Git ブランチによる rollback:
- `feature/add-elasticache` ブランチが v2.2 直前の状態を保持

---

### v2.2 で発生したトラブルと解決策

| 問題 | 原因 | 解決 |
|---|---|---|
| feature ブランチで GitHub Actions が未発火 | deploy-frontend.yml が `main` ブランチのみを対象 | main にマージして push |
| デプロイ後も UI が変わらない | CloudFront の Default Root Object が旧 `index.html` のまま | AWS コンソールで `index-v2.html` に変更 |
| CloudFront Invalidation でエラー | パス入力が `/\n/index.html` と解釈された | `/*` で一括削除に変更 |

---

## コスト概算(東京リージョン / 月額)

| サービス | 想定利用量 | 概算コスト |
|---|---|---|
| CloudFront | 10GB 転送 + 100万リクエスト | 約 $1〜2 |
| S3 | 1MB ストレージ + PUT/GET | 約 $0.01 以下 |
| API Gateway | 10万リクエスト | 約 $0.10 |
| Lambda | 10万実行 × 256MB × 1秒 | 無料枠内 |
| DynamoDB | PAY_PER_REQUEST | 約 $0.50〜1 |
| ElastiCache Redis (cache.t3.micro) | 730時間稼働 | 約 $14〜16 |
| **合計** | | **約 $16〜20 / 月** |

> **旧 RDS 構成との比較:**
> - 旧(RDS + VPC Interface EP): 約 $43〜46 / 月
> - 現(DynamoDB + ElastiCache): 約 $16〜20 / 月
> - **約 $25〜26 / 月のコスト削減**

---

## ゲーム操作方法

| 操作 | キーボード | モバイル |
|---|---|---|
| 移動 | 矢印キー / WASD | D-pad ボタン / スワイプ |
| スタート / リトライ | SPACE | START ボタン |
| ポーズ / 再開 | ESC | PAUSE / RESUME ボタン |

### レベル進行

| レベル | 必要スコア | 速度 |
|---|---|---|
| Lv 1 | 0 | 180ms/tick |
| Lv 2 | 5 | 150ms/tick |
| Lv 3 | 10 | 135ms/tick |
| Lv 4 | 15 | 120ms/tick |
| Lv 5 | 20 | 105ms/tick |
| Lv 6 | 25 | 90ms/tick |
| Lv 10(最大) | 45 | 60ms/tick |

---

## セキュリティ考慮事項

- S3 バケットはパブリックアクセス全遮断(CloudFront OAC 経由のみ)
- Lambda から DynamoDB / ElastiCache への通信は VPC 内で完結
- CORS は API Gateway レベルで CloudFront ドメインのみ許可
- IAM ポリシーは最小権限の原則に従い設定
- GitHub Secrets で AWS 認証情報を管理(コードへのハードコード禁止)
