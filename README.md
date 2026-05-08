# Snake Game — AWS 3層アーキテクチャ構成

## 概要

スネークゲームを AWS 上で運用するための 3層アーキテクチャ構成です。
静的フロントエンドの高速配信、サーバーレス API によるスコア管理、DynamoDB によるランキングデータ永続化、ElastiCache Redis によるキャッシュを実現します。

---

## このプロジェクトで実現したこと

- 静的フロントエンドを S3 + CloudFront + OAC で安全に配信
- API Gateway + Lambda によるサーバーレス API を実装
- DynamoDB の GSI によりランキング取得を scan から query に改善
- ElastiCache Redis によるランキングキャッシュを導入し、読み取り負荷を軽減
- RDS 構成から DynamoDB 構成へ移行し、月額コストを削減
- CloudWatch Logs Interface VPC Endpoint を削除し、VPC 固定費を最適化
- GitHub Actions + AWS SAM による CI/CD を構築
- Neon Arcade UI、名前バリデーション、Web Audio API による BGM / 効果音を実装

---

## バージョン履歴

| バージョン | 内容 | 状態 |
|---|---|---|
| v1.0 | S3 + CloudFront + API Gateway + Lambda + RDS MySQL | 旧構成(廃止) |
| v2.0 | RDS → DynamoDB 移行、VPC 撤廃、コスト最適化 | リリース済み |
| v2.1 | DynamoDB GSI 追加(scan → query 移行)、ElastiCache Redis 導入 | リリース済み |
| v2.2 | UI 改修 + BGM / 効果音追加(ui-audio-v2) | リリース済み |
| **v2.3** | **Neon Arcade UI 改修、Player Name validation 強化、BGM Level連動 BPM + Micro Ramp 追加** | **リリース済み** |

### v2.2 ハイライト

- HUD 3列化、level-flash アニメーション、背景色連動
- Web Audio API による自己生成 BGM (chiptune) と eat / game-over 効果音
- BGM toggle / pause / resume / stop 対応
- v2.1 ファイル共存パターンによる rollback 機構

### v2.3 ハイライト

- Neon Arcade Glass UI(タイトル / HUD / Modal / Ranking Panel の刷新)
- Background FX layer (cinematic glow / shimmer / sweep / level-up burst)
- Player Name validation(URL / 連絡先 / 不適切表現の最小検出 + 多言語 policy note)
- BGM Level 連動 BPM (108→164、Micro Ramp で滑らかに加速)
- `prefers-reduced-motion` 全面対応

詳細な作業ログ・Phase 単位の検証結果は [docs/ecc-selected-skills.md](docs/ecc-selected-skills.md) を参照。

---

## アーキテクチャ

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
│  ├── index-v2.html                    │
│  ├── css/style-v2.css                 │
│  └── js/                              │
│      ├── api.js                       │
│      ├── snake-v2.js                  │
│      └── audio-v2.js                  │
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
│      ├── PK: player_name              │
│      └── GSI: RankingIndex            │
│          ├── gsi_pk (HASH)            │
│          └── score (RANGE)            │
└───────────────────────────────────────┘
```

> v2.1 rollback 用ファイル(`index.html` / `css/style.css` / `js/snake.js`)も S3 上に共存しており、CloudFront の Default Root Object 切替で v2.1 へ rollback 可能。

---

## フォルダ構成

```
snake_game_demo_dynamoDB/
│
├── frontend/                        # プレゼンテーション層 (S3 + CloudFront)
│   ├── index.html                   # v2.1 メインページ(rollback 用に保持)
│   ├── index-v2.html                # v2.2/v2.3 メインページ(現 Default Root Object)
│   ├── css/
│   │   ├── style.css                # v2.1 スタイル(rollback 用に保持)
│   │   └── style-v2.css             # v2.2/v2.3 スタイル
│   └── js/
│       ├── api.js                   # API Gateway クライアント(共通)
│       ├── snake.js                 # v2.1 ゲームロジック(rollback 用に保持)
│       ├── snake-v2.js              # v2.2/v2.3 ゲームロジック
│       └── audio-v2.js              # Web Audio API 音源モジュール (BGM Micro Ramp 対応)
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
│   └── samconfig.toml.example       # SAM デプロイ設定サンプル
│       # samconfig.toml はローカル専用(.gitignore対象)
│
├── scripts/                         # 運用スクリプト
│   └── backfill_gsi.py              # DynamoDB GSI バックフィルスクリプト
│
├── docs/                            # 補助ドキュメント
│   └── ecc-selected-skills.md       # ECC スキル選定 + Phase 単位の作業ログ
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

## API仕様

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

## データ設計

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

## キャッシュ設計

### ElastiCache Redis

| 対象 | TTL | 用途 |
|---|---|---|
| ランキングデータ (`ranking:top10`) | 環境変数 `CACHE_TTL`(デフォルト 3600秒 = 1時間) | `get_ranking` の DynamoDB Query 結果をキャッシュ |

**TTL 適用方針:**
- `get_ranking` Lambda 内で `setex(KEY, CACHE_TTL, value)` を呼び、Redis に TTL 付きで永続化
- TTL 切れ後は自動削除され、次回 `get_ranking` で MISS → DynamoDB Query → 再キャッシュ
- TTL は環境変数 `CACHE_TTL`(秒数)で制御し、値の変更は `infrastructure/template.yaml` で行う

**Lambda での参照パターン:**

```
get_ranking Lambda
    ├─ Redis HIT  → キャッシュデータを返却(高速)
    └─ Redis MISS → DynamoDB Query → setex で TTL 付き保存 → データ返却
```

---

## デプロイ

### GitHub Actions ワークフロー

| ワークフロー | トリガー | 処理 |
|---|---|---|
| `deploy-frontend.yml` | `frontend/**` への push | S3 sync + CloudFront Invalidation |
| `deploy-sam.yml` | `backend/**` / `infrastructure/**` への push | SAM build + deploy |

### GitHub Actions 認証方式

公開ポートフォリオでは、長期アクセスキーを GitHub Secrets に保存しない方針です。
本番運用では **GitHub Actions OIDC + IAM Role** により、一時認証情報を取得して AWS へデプロイします。

必要な GitHub Secrets / Variables は以下を想定します。

| 名前 | 内容 |
|---|---|
| `AWS_REGION` | `ap-northeast-1` |
| `S3_BUCKET` | フロントエンド配信用 S3 バケット名 |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront ディストリビューション ID |
| `SAM_STACK_NAME` | CloudFormation スタック名 |
| `SAM_S3_BUCKET` | SAM アーティファクト用 S3 バケット名 |
| `AWS_ROLE_TO_ASSUME` | GitHub Actions から AssumeRole する IAM Role ARN |

> 旧方式として `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を使うことも可能ですが、公開リポジトリでは OIDC を推奨します。

---

## 運用

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

## ゲーム仕様

### 操作方法

| 操作 | キーボード | モバイル |
|---|---|---|
| 移動 | 矢印キー / WASD | D-pad ボタン / スワイプ |
| スタート / リトライ | SPACE | START ボタン |
| ポーズ / 再開 | ESC | PAUSE / RESUME ボタン |

### レベル進行

| レベル | 必要スコア | 速度 | BGM BPM |
|---|---|---|---|
| Lv 1 | 0 | 180ms/tick | 108 |
| Lv 2 | 5 | 150ms/tick | 116 |
| Lv 3 | 10 | 135ms/tick | 124 |
| Lv 4 | 15 | 120ms/tick | 132 |
| Lv 5 | 20 | 105ms/tick | 140 |
| Lv 6 | 25 | 90ms/tick | 148 |
| Lv 10(最大) | 45 | 60ms/tick | 164(上限) |

> v2.3 から Level 連動で BGM の BPM が段階的に上昇(Micro Ramp で滑らかに加速、Lv 8 以降は 164 BPM 上限)。

---

## コスト

(東京リージョン / 月額)

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

## セキュリティ

- S3 バケットはパブリックアクセス全遮断(CloudFront OAC 経由のみ)
- Lambda から DynamoDB / ElastiCache への通信は VPC 内で完結
- CORS は API Gateway レベルで CloudFront ドメインのみ許可
- IAM ポリシーは最小権限の原則に従い設定
- GitHub Secrets で AWS 認証情報を管理(コードへのハードコード禁止)

---

## 変更履歴

詳細な作業ログ・Phase 単位の検証結果は以下を参照してください。

- [docs/ecc-selected-skills.md](docs/ecc-selected-skills.md)
