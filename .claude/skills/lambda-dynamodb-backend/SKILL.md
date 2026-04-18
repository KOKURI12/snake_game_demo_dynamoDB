---
name: lambda-dynamodb-backend
description: Use this skill when the user is working on Python Lambda functions or DynamoDB operations in the backend/ directory through Claude Code. Triggers on Lambda handler debugging, boto3 DynamoDB queries (get_item, put_item, query, scan, update_item), API Gateway event parsing, Lambda environment variables, or CloudWatch Logs investigation. Do NOT use for frontend HTML/CSS/JS work, CloudFormation/infrastructure YAML changes, IAM policy definitions in IaC files, or general web chat conversations.
---

# Lambda + DynamoDB バックエンド作業ルール

Claude Code で `backend/` 配下の Python Lambda 関数および DynamoDB 操作を扱う際、Claude が従うべき行動ルール。
バックエンドは**実行時に即影響が出る**領域なので、誤修正のリスクを最小化することを最優先する。

---

## Claude が従う行動ルール

### 1. 対象 Lambda 関数・対象 DynamoDB 操作に限定
- ユーザーが指定した関数・ハンドラ・クエリ以外は読みに行かない
- 「ついでに他のハンドラも確認」「似た処理もチェック」は **禁止**
- 1 Lambda 関数の範囲を超える変更は事前に確認する

### 2. DynamoDB のテーブル設計を勝手に変更しない
以下は **ユーザーの明示的指示なしに提案・変更してはならない**:
- PartitionKey / SortKey の変更
- GSI / LSI の追加・削除
- 属性名のリネーム
- Single Table Design / Multi Table Design の切り替え
- BillingMode(PROVISIONED ↔ PAY_PER_REQUEST)の変更

既存データとの互換性を壊すため、設計変更は別タスクとして扱う。

### 3. IAM 権限の変更を backend 側で提案しない
- IAM ポリシー・ロールは `infrastructure/` 側の責務
- 「この Lambda に dynamodb:Query 権限が必要です」等の**情報提供は可**
- ただし backend コード内で権限追加の YAML を生成しない
- 必要な権限は**不足情報として列挙**し、infrastructure 作業として分離する

### 4. 環境変数・設定値を勝手に追加しない
- Lambda 環境変数(TABLE_NAME 等)を新規追加しない
- ハードコードされている値を環境変数化する提案は明示指示があるときのみ
- 既存の環境変数名・参照方法は変更しない

### 5. エラーハンドリングは既存スタイルを踏襲
- try/except の粒度・ログ出力形式は既存コードに合わせる
- 新しいログライブラリ(structlog, loguru 等)の導入を勝手に提案しない
- print vs logger の使い分けも既存方針を維持

### 6. boto3 / DynamoDB 操作の注意
以下は**必ず意識して回答する**:
- `scan` の使用は**コスト警告**を出す(テーブル全走査のため)
- `query` では **KeyConditionExpression** と **FilterExpression** の違いを明示
- `Decimal` 型と JSON 変換の扱い(DynamoDB は Decimal を返す)
- `ConditionExpression` による楽観ロック
- ページネーション(`LastEvaluatedKey`)の考慮漏れ
- BatchWriteItem の 25件制限 / BatchGetItem の 100件制限

### 7. 回答形式
- 原因特定時:**箇条書き3点以内**、結論から
- 冒頭で「主因: Lambda / DynamoDB / API Gateway / IAM のいずれか」を明示
- 修正コードは求められたときだけ、該当関数のみ

### 8. 提案を勝手に追加しない
以下は明示要求時のみ:
- ユニットテスト(pytest / moto)の生成
- 型ヒント(type hints)の追加
- リファクタ(関数分割、クラス化)
- Lambda Layers への切り出し提案
- パフォーマンスチューニング

---

## 調査の切り分け観点

| 症状 | 最初に見る範囲 |
|---|---|
| Lambda が起動しない | handler 名 / runtime 指定 / CloudWatch Logs のエラー1件 |
| DynamoDB データが取れない | KeyConditionExpression / テーブル名環境変数 / IAM権限(情報のみ) |
| API Gateway 500 エラー | handler の return 形式(statusCode / body / headers) |
| タイムアウト | Lambda timeout 設定 / DynamoDB クエリ効率 / VPC Lambda の場合は ENI |
| Decimal JSON エラー | DynamoDB レスポンスの json.dumps 時の default 関数 |
| CORS エラー | handler の response headers / API Gateway 側の CORS 設定(infrastructure 側) |
| Throttling | DynamoDB RCU/WCU / Lambda 同時実行数 |

---

## 標準応答フォーマット

### 原因特定時
```
主因: [Lambda / DynamoDB / API Gateway / IAM(情報のみ)]
原因: [1〜2行]
根拠: [コード行番号 or エラーメッセージの該当箇所]
次アクション: [backend で直すか infrastructure で直すかを明示]
```

### 修正コード提示時
- 該当関数のみ、変更行を含む最小範囲
- diff 形式歓迎
- 解説は1〜2行まで

---

## DynamoDB 操作の定型チェック

Lambda から DynamoDB を呼ぶコードを見るとき、以下を**毎回確認**:

1. **scan を使っていないか?** → 使っていたら必ず警告
2. **KeyConditionExpression と FilterExpression が混同されていないか?**
3. **Decimal → JSON 変換処理が入っているか?**
4. **ConditionExpression で楽観ロックすべき箇所か?**
5. **ページネーション考慮が必要な件数か?**

これらは指摘ポイントとして忘れない。

---

## ユーザー向けコピペプロンプト

### A. Lambda 関数の原因特定のみ
```
backend/ の [関数名] だけ見て、原因特定のみしてください。
修正コードは不要。箇条書き3点以内。
主因が Lambda / DynamoDB / API Gateway / IAM のどれかを冒頭に明示。
```

### B. DynamoDB クエリの最適化確認
```
この DynamoDB クエリだけ見て、以下の観点でチェック。
- scan 使用の有無
- KeyCondition と Filter の使い分け
- ページネーション要否
修正は提案せず、問題点のみ列挙。
```

### C. API Gateway レスポンス形式の確認
```
この Lambda の return 文だけ見て、API Gateway Proxy Integration の
レスポンス形式(statusCode / headers / body)が正しいか確認。
問題があれば最小修正コードのみ。
```

### D. CloudWatch Logs からの原因特定
```
このログ抜粋だけ見て、原因に直結する行を最大3件抜き出し、
各1行で理由を書いてください。修正コードは不要。
```

---

## 禁止事項

- `backend/` 以外のファイル(frontend, infrastructure)を勝手に読む
- DynamoDB テーブル設計の変更を無断で提案
- IAM ポリシー YAML を backend 側の回答で生成
- 環境変数・設定値の勝手な追加
- ユニットテスト・型ヒント・リファクタの押し付け
- `scan` を無警告で推奨
- Decimal 型の扱いを無視した JSON 化コード

---

## 最重要原則

**対象 Lambda 関数に限定・テーブル設計を守る・IAM は infrastructure の仕事。**

backend の修正は本番データに直結する。範囲を広げないことが最優先。
