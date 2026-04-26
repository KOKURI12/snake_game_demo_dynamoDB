# PROJECT_CONTEXT.md

## プロジェクト名

snake_game_demo_dynamoDB

---

## プロジェクト概要

このプロジェクトは、Snake Game を AWS 上で運用するための 3層アーキテクチャ構成のポートフォリオプロジェクトです。

静的フロントエンドを S3 + CloudFront で配信し、API Gateway + Lambda によりスコア登録・ランキング取得 API を提供します。ランキングデータは DynamoDB に永続化し、ElastiCache Redis によりランキング取得結果をキャッシュします。

現在の最新リリースは **v2.2 ui-audio-v2** です。

---

## 現在のバージョン

| バージョン | 状態 | 内容 |
|---|---|---|
| v1.0 | 廃止 | S3 + CloudFront + API Gateway + Lambda + RDS MySQL |
| v2.0 | リリース済み | RDS から DynamoDB へ移行、VPC 撤廃、コスト最適化 |
| v2.1 | リリース済み | DynamoDB GSI 追加、scan から query へ移行、ElastiCache Redis 導入 |
| v2.2 | リリース済み | UI 改修、BGM / 効果音追加、ui-audio-v2 |

---

## アーキテクチャ

### 3層構成

| 層 | AWS / 技術 | 役割 |
|---|---|---|
| プレゼンテーション層 | S3 / CloudFront | 静的フロントエンド配信、HTTPS 終端、CDN |
| アプリケーション層 | API Gateway / Lambda / ElastiCache Redis | API 提供、スコア登録、ランキング取得、キャッシュ |
| データ層 | DynamoDB | スコア・ランキングデータ永続化 |

### API 構成

| Method | Path | Lambda | 用途 |
|---|---|---|---|
| POST | `/scores` | `post_score` | スコア登録 |
| GET | `/ranking` | `get_ranking` | ランキング取得 |

---

## 技術スタック

| 分類 | 技術 |
|---|---|
| Frontend | HTML / CSS / JavaScript |
| Audio | Web Audio API |
| Backend | Python / AWS Lambda |
| API | Amazon API Gateway HTTP API |
| Database | Amazon DynamoDB |
| Cache | Amazon ElastiCache Redis |
| CDN / Hosting | Amazon CloudFront / Amazon S3 |
| IaC | AWS SAM / CloudFormation |
| CI/CD | GitHub Actions |
| Region | ap-northeast-1 |
| 開発補助 | Claude Code / Cursor / AI Coding Agent |

---

## フォルダ構成

```txt
snake_game_demo_dynamoDB/
├── frontend/
│   ├── index.html
│   ├── index-v2.html
│   ├── css/
│   │   ├── style.css
│   │   └── style-v2.css
│   └── js/
│       ├── api.js
│       ├── snake.js
│       ├── snake-v2.js
│       └── audio-v2.js
│
├── backend/
│   ├── post_score/
│   │   └── lambda_function.py
│   ├── get_ranking/
│   │   └── lambda_function.py
│   └── layer/
│       └── requirements.txt
│
├── infrastructure/
│   ├── template.yaml
│   └── samconfig.toml
│
├── scripts/
│   └── backfill_gsi.py
│
├── .claude/
│   └── skills/
│
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml
│       └── deploy-sam.yml
│
└── backup/
```

---

## 主要ファイル

### Frontend

| ファイル | 用途 |
|---|---|
| `frontend/index.html` | v2.1 旧メインページ。rollback 用に保持 |
| `frontend/index-v2.html` | v2.2 現行メインページ。現在の Default Root Object |
| `frontend/css/style.css` | v2.1 旧スタイル |
| `frontend/css/style-v2.css` | v2.2 スタイル。level-flash と背景色連動 |
| `frontend/js/api.js` | API Gateway クライアント |
| `frontend/js/snake.js` | v2.1 旧ゲームロジック |
| `frontend/js/snake-v2.js` | v2.2 ゲームロジック。BGM 制御・レベルフラッシュ統合 |
| `frontend/js/audio-v2.js` | Web Audio API 音源モジュール |

### Backend

| ファイル | 用途 |
|---|---|
| `backend/post_score/lambda_function.py` | POST /scores 用 Lambda |
| `backend/get_ranking/lambda_function.py` | GET /ranking 用 Lambda |
| `backend/layer/requirements.txt` | Lambda Layer 依存関係 |

### Infrastructure

| ファイル | 用途 |
|---|---|
| `infrastructure/template.yaml` | SAM / CloudFormation リソース定義 |
| `infrastructure/samconfig.toml` | SAM デプロイ設定 |

### Scripts

| ファイル | 用途 |
|---|---|
| `scripts/backfill_gsi.py` | DynamoDB GSI バックフィルスクリプト |

---

## 環境情報

| 環境 | 説明 | AI Agent の直接操作 |
|---|---|---|
| local | ローカル開発・静的ファイル確認 | 許可 |
| dev | 開発用 AWS 環境がある場合のみ | 要確認 |
| stg | ステージング環境がある場合のみ | 要確認 |
| prd | main ブランチ経由でデプロイされる本番相当環境 | 禁止。必ず事前確認 |

---

## デプロイ構成

### GitHub Actions

| Workflow | Trigger | 処理 |
|---|---|---|
| `.github/workflows/deploy-frontend.yml` | `frontend/**` への push | S3 sync + CloudFront Invalidation |
| `.github/workflows/deploy-sam.yml` | `backend/**` / `infrastructure/**` への push | SAM build + deploy |

### ブランチ運用

```txt
main
└── feature/xxx
```

- `main` は本番デプロイ対象
- feature ブランチで作業し、PR / merge 後に main でデプロイ発火
- AI Agent は `main` への直接 push や本番デプロイ操作を行わないこと

---

## 必要な GitHub Secrets

以下は GitHub Secrets で管理し、コードや README に実値を書かないこと。

| Secret | 用途 |
|---|---|
| `AWS_ACCESS_KEY_ID` | デプロイ用 IAM アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | デプロイ用 IAM シークレットキー |
| `AWS_REGION` | AWS リージョン。想定は `ap-northeast-1` |
| `S3_BUCKET` | フロントエンド配信用 S3 バケット名 |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront ディストリビューション ID |
| `SAM_STACK_NAME` | CloudFormation スタック名 |
| `SAM_S3_BUCKET` | SAM アーティファクト用 S3 バケット名 |

---

## DynamoDB 設計

### ScoresTable

| 属性 | 型 | 役割 |
|---|---|---|
| `player_name` | String | テーブル PK。1プレイヤー = 最高スコアのみ保持 |
| `score` | Number | スコア |
| `level_reached` | Number | 到達レベル |
| `gsi_pk` | String | GSI 用定数値 `"ALL"` |
| `created_at` | String | 登録日時 |

### RankingIndex

| 属性 | 型 | 役割 |
|---|---|---|
| `gsi_pk` | String HASH | 定数 `"ALL"` で全件を同一パーティションに集約 |
| `score` | Number RANGE | 降順ソートで Top N 取得 |

注意：

- ランキング取得は scan ではなく GSI query を使う
- `player_name` を PK とし、同一プレイヤーは最高スコアのみ保持する設計
- DynamoDB テーブル、GSI、PK 設計は勝手に変更しないこと

---

## ElastiCache Redis 設計

| 対象 | TTL | 用途 |
|---|---|---|
| ランキングデータ | 3600秒 | `get_ranking` の DynamoDB Query 結果をキャッシュ |

注意：

- Redis はランキング取得の高速化目的
- TTL やキャッシュキー設計を変更する場合は事前確認すること
- Redis 削除・flush 系操作は実行しないこと

---

## API 仕様

### POST /scores

リクエスト例：

```json
{
  "player_name": "PLAYER_A",
  "score": 20,
  "level_reached": 4
}
```

レスポンス例：

```json
{
  "message": "Score posted successfully"
}
```

### GET /ranking

クエリパラメータ：

| Parameter | Default | Max | 説明 |
|---|---|---|---|
| `limit` | 10 | 100 | 取得件数 |

レスポンス例：

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

## ゲーム仕様

### 操作方法

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
| Lv 10 | 45 | 60ms/tick |

---

## v2.2 ui-audio-v2 の注意点

v2.2 では以下が実装済み。

- HUD 3列構成
- LEVEL 中央配置
- level-flash アニメーション
- レベルアップ時の背景色連動
- Web Audio API による BGM
- Eat SE / GameOver SE
- BGM トグルボタン
- 旧 v2.1 ファイルを rollback 用に保持

### rollback 方針

rollback はファイル削除ではなく、CloudFront の Default Root Object を戻す方式。

```txt
index-v2.html → index.html
```

注意：

- v2.1 系ファイルを削除しないこと
- `index.html` / `style.css` / `snake.js` は rollback 用に保持すること
- `index-v2.html` / `style-v2.css` / `snake-v2.js` / `audio-v2.js` は v2.2 用

---

## セキュリティ注意事項

- AWS 認証情報をコードに直接書かない
- `.env`、`.env.*`、秘密鍵、pem、key、credentials を読まない・表示しない・変更しない
- GitHub Secrets の実値を出力しない
- IAM Policy / IAM Role は最小権限を維持する
- S3 バケットは CloudFront OAC 経由のみ公開する
- CORS は CloudFront ドメインのみ許可する
- main ブランチへの直接 push は行わない
- 本番環境や AWS リソース変更は必ず事前確認する

---

## AI Agent 作業ルール

### 共通

- 作業前に `AGENTS.md`、`CLAUDE.md`、この `PROJECT_CONTEXT.md` を確認する
- ユーザーの依頼範囲に関係するファイルだけを確認する
- 大きなリファクタリングや設計変更は事前確認する
- 修正前に作業方針を簡潔に説明する
- 修正後は変更ファイル、変更理由、確認結果、懸念点を報告する

### Frontend 作業

対象：

```txt
frontend/
```

確認対象：

- `frontend/index-v2.html`
- `frontend/css/style-v2.css`
- `frontend/js/snake-v2.js`
- `frontend/js/audio-v2.js`
- 必要に応じて `frontend/js/api.js`

注意：

- 旧 v2.1 ファイルは rollback 用のため、原則変更しない
- v2.2 の UI / BGM / 効果音を修正する場合は v2.2 系ファイルを優先する
- Web Audio API の BGM / SE は外部音源ファイルを追加せず、自己生成方式を維持する

### Backend 作業

対象：

```txt
backend/
```

確認対象：

- `backend/post_score/lambda_function.py`
- `backend/get_ranking/lambda_function.py`
- `backend/layer/requirements.txt`

注意：

- `/scores` と `/ranking` の API 仕様を壊さない
- DynamoDB の PK / GSI 設計を勝手に変更しない
- Redis キャッシュ TTL / キー設計を変更する場合は事前確認する

### Infrastructure 作業

対象：

```txt
infrastructure/
.github/workflows/
```

確認対象：

- `infrastructure/template.yaml`
- `infrastructure/samconfig.toml`
- `.github/workflows/deploy-frontend.yml`
- `.github/workflows/deploy-sam.yml`

注意：

- IAM、DynamoDB、ElastiCache、CloudFront、S3、API Gateway、Lambda の変更は事前確認
- `sam deploy`、`aws *`、`terraform *`、`kubectl *` 系は勝手に実行しない
- 課金が増える可能性がある変更は必ず事前確認する

---

## 確認コマンド

README にはローカル用の npm / pytest / SAM 検証コマンドが明示されていないため、実行前に `package.json`、Python 依存関係、SAM 設定を確認すること。

候補：

```powershell
git status
git diff
```

Frontend 静的確認候補：

```powershell
# 必要に応じてローカルサーバーで frontend を確認
```

Backend / Infrastructure 確認候補：

```powershell
# 必要に応じて sam validate / sam build を確認
```

注意：

- 実際の AWS デプロイ、CloudFront Invalidation、S3 sync、SAM deploy は事前確認なしに実行しない
- README に明記されていないコマンドは、実行前にユーザー確認する

---

## コスト注意

現在構成の想定コストは東京リージョンで月額約 **$16〜20**。  
ElastiCache Redis がコストの大部分を占める。

注意：

- ElastiCache の起動・削除・サイズ変更は事前確認する
- コストに影響する構成変更は勝手に行わない

---

## 今後の作業候補

- README 整備
- PROJECT_CONTEXT.md の更新
- UI / BGM / 効果音の追加改善
- スコアランキング改善
- DynamoDB / Redis 周りの改善
- GitHub Actions の安全性確認
- SAM template のレビュー
- AWS 構成図の追加
