# Snake Game — AWS 3層アーキテクチャ構成

## 概要

スネークゲームを AWS 上で運用するための 3層アーキテクチャ構成です。
静的フロントエンドの高速配信、サーバーレス API によるスコア管理、DynamoDB によるランキングデータ永続化を実現します。

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
└───────────────────────────────────────┘
        │
        │ AWS SDK (boto3) / IAM ロール認証
        │ VPC 不要・インターネット経由なし（AWS 内部ネットワーク）
        ▼
┌───────────────────────────────────────┐
│  データ層                             │
│                                       │
│  DynamoDB（フルマネージド・サーバーレス）│
│  └── scores テーブル                  │
│      ├── player_name (PK)             │
│      ├── score                        │
│      ├── level_reached                │
│      └── created_at                   │
└───────────────────────────────────────┘
```

---

## フォルダ構成

```
snake_game_demo/
│
├── frontend/                        # プレゼンテーション層 (S3 + CloudFront)
│   ├── index.html                   # メインページ（ランキング表示・スコア登録モーダル）
│   ├── css/
│   │   └── style.css                # スタイル（レスポンシブ・モバイル対応）
│   └── js/
│       ├── api.js                   # API Gateway クライアント
│       └── snake.js                 # ゲームロジック（ESC ポーズ・スワイプ操作対応）
│
├── backend/                         # アプリケーション層 (API Gateway + Lambda)
│   ├── post_score/
│   │   └── lambda_function.py       # スコア登録 Lambda (POST /scores)
│   └── get_ranking/
│       └── lambda_function.py       # ランキング取得 Lambda (GET /ranking)
│
└── infrastructure/                  # IaC 定義
    └── template.yaml                # SAM テンプレート（全 AWS リソース定義）
```

---

## 各層の設計詳細

### プレゼンテーション層（S3 + CloudFront）

| 項目 | 内容 |
|---|---|
| S3 バケット | パブリックアクセス全遮断、OAC 経由で CloudFront のみ許可 |
| CloudFront | HTTPS 強制（HTTP → HTTPS リダイレクト）、HTTP/2 and HTTP/3 対応 |
| キャッシュ | CachingOptimized ポリシー適用、静的ファイルを CDN でキャッシュ |
| 配信エリア | PriceClass_200（北米・欧州・アジア） |

**ゲームの主な機能**

- ESC キー / ボタンでポーズ・再開
- スマートフォン・タブレット対応（D-pad ボタン・スワイプ操作）
- レスポンシブレイアウト（デスクトップ・モバイル自動切り替え）
- タブ非表示時の自動ポーズ
- ゲームオーバー後のスコア登録モーダル
- リアルタイムランキング表示

---

### アプリケーション層（API Gateway + Lambda）

#### API 一覧

| メソッド | パス | 説明 | Lambda 関数 |
|---|---|---|---|
| POST | `/scores` | スコアを登録する | `post_score` |
| GET | `/ranking` | ランキング上位を取得する | `get_ranking` |

#### POST /scores

**リクエスト**
```json
{
  "player_name":   "PLAYER_A",
  "score":         20,
  "level_reached": 4
}
```

**レスポンス（201 Created）**
```json
{
  "rank": 3
}
```

#### GET /ranking

**クエリパラメータ**

| パラメータ | デフォルト | 最大 | 説明 |
|---|---|---|---|
| `limit` | 10 | 100 | 取得件数 |

**レスポンス（200 OK）**
```json
[
  {
    "rank": 1,
    "player_name": "PLAYER_A",
    "score": 25,
    "level_reached": 6,
    "played_at": "2026-04-11T10:00:00"
  }
]
```

#### Lambda 設計ポイント

- ランタイム: Python 3.12（ARM64 / Graviton2 でコスト最適化）
- DB 接続: boto3 で DynamoDB に直接アクセス（外部ライブラリ不要）
- 認証: IAM ロールによる最小権限アクセス（Secrets Manager 不要）
- VPC 外配置: DynamoDB は AWS 内部ネットワーク経由でアクセス（VPC エンドポイント不要）
- タイムアウト: 15 秒
- CORS: API Gateway レベルで CloudFront ドメインのみ許可

---

### データ層（DynamoDB）

#### テーブル設計

| 属性名 | 型 | 役割 |
|---|---|---|
| `player_name` | String | パーティションキー (PK) |
| `score` | Number | スコア（最高スコアのみ保持） |
| `level_reached` | Number | 到達レベル（将来の表示拡張用） |
| `created_at` | String | ISO 8601 形式の日時（タイブレーク用） |

#### アクセスパターン

| パターン | 操作 | 説明 |
|---|---|---|
| AP1 | `put_item` | スコア登録（既存より高い場合のみ上書き） |
| AP2 | `scan` + Python ソート | スコア降順で上位 N 件取得 |

#### キー設計の方針

```
PK のみ構成（Sort Key なし）
  → player_name が一意 = 1 プレイヤー 1 レコード
  → 同一プレイヤーの put_item は常に上書き
  → Lambda 側でスコア比較し、最高スコアのみ保持
```

#### DynamoDB 設定

| 項目 | dev | prod | 備考 |
|---|---|---|---|
| 課金モード | PAY_PER_REQUEST | PAY_PER_REQUEST | リクエスト単位課金・Auto Scaling 不要 |
| 暗号化 | AWS 管理キー | AWS 管理キー | デフォルト有効 |
| DeletionProtection | 無効 | 有効 | Stage パラメータで自動選択 |
| ポイントインタイムリカバリ | 無効 | 有効 | Stage パラメータで自動選択 |

---

## デプロイ手順

### 前提条件

- AWS CLI v2 設定済み（`aws configure`）
- AWS SAM CLI インストール済み（`sam --version`）
- Python 3.12 インストール済み
- 対象 AWS リージョン: `ap-northeast-1`（東京）推奨

> **VPC・サブネット・NAT Gateway は不要です。**
> DynamoDB への通信は AWS 内部ネットワーク経由のため、Lambda を VPC 内に配置する必要がありません。

---

### Step 1 — SAM ビルド

```bash
cd infrastructure
sam build
```

---

### Step 2 — SAM デプロイ（初回）

```bash
sam deploy --guided
```

対話形式で以下を入力します。

| 項目 | 入力例 | 備考 |
|---|---|---|
| Stack Name | `snake-game-stack` | |
| AWS Region | `ap-northeast-1` | |
| Stage | `dev` or `prod` | prod 時は DeletionProtection・PITR が自動有効化 |
| Confirm changes before deploy | `y` | |
| Allow SAM CLI IAM role creation | `y` | |

> RDS 時代に必要だった `VpcId` / `PrivateSubnet` / `PrivateRouteTable` / `DBName` / `DBUser` のパラメータは不要になりました。

---

### Step 3 — フロントエンドの API エンドポイント設定

デプロイ出力の `ApiEndpoint` を `frontend/index.html` に設定します。

```html
<!-- index.html 内のコメントを外して URL を変更 -->
<script>
  window.API_BASE = 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod';
</script>
```

---

### Step 4 — フロントエンドを S3 へアップロード

```bash
# デプロイ出力の FrontendBucketName を使用
aws s3 sync frontend/ s3://<BUCKET_NAME>/ --delete

# CloudFront キャッシュを無効化
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

---

### Step 5 — 動作確認

デプロイ出力の `CloudFrontURL` にアクセスしてゲームが表示されれば完了です。

```
https://xxxxxxxxxxxxxxxx.cloudfront.net
```

---

## 2回目以降のデプロイ

```bash
cd infrastructure
sam build && sam deploy
```

フロントエンドのみ更新する場合は Step 4 のみ実行します。

---

## 環境変数一覧（Lambda）

SAM テンプレートで自動設定されます。手動設定が必要な場合は Lambda コンソールから変更してください。

| 変数名 | 説明 | 設定箇所 |
|---|---|---|
| `TABLE_NAME` | DynamoDB テーブル名 | template.yaml で自動設定 |

---

## コスト概算（東京リージョン / 月額）

| サービス | 想定利用量 | 概算コスト |
|---|---|---|
| CloudFront | 10GB 転送 + 100万リクエスト | 約 $1–2 |
| S3 | 1MB ストレージ + PUT/GET | 約 $0.01 以下 |
| API Gateway | 10万リクエスト | 約 $0.10 |
| Lambda | 10万実行 × 256MB × 1秒 | 無料枠内 |
| DynamoDB | 10万 R/W + 1MB ストレージ | 約 $0.01 以下 |
| **合計 (dev)** | | **約 $3–4 / 月** |

> **RDS 構成（約 $43–46 / 月）から約 $40 のコスト削減を実現しています。**
> VPC Interface エンドポイント（約 $29）と RDS（約 $13）が不要になったことが主な削減要因です。

---

## セキュリティ考慮事項

- S3 バケットはパブリックアクセス全遮断（CloudFront OAC 経由のみ）
- Lambda は IAM ロールによる最小権限で DynamoDB にアクセス（`dynamodb:PutItem` / `dynamodb:Scan` のみ付与）
- DB 認証情報が不要なため、Secrets Manager・パスワード管理のリスクがゼロ
- CORS は API Gateway レベルで CloudFront ドメインのみ許可
- prod 環境では DeletionProtection・PITR が自動有効化され、誤削除・データ損失を防止

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
| Lv 10（最大） | 45 | 60ms/tick |
