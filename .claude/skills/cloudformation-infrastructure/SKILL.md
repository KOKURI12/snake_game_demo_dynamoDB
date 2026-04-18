---
name: cloudformation-infrastructure
description: Use this skill when the user is working on CloudFormation YAML templates in the infrastructure/ directory through Claude Code. Triggers on CFn template edits, Resources/Parameters/Outputs sections, IAM policy definitions, DynamoDB table definitions, Lambda function resources, API Gateway resources, IntrinsicFunctions (Ref/GetAtt/Sub/Join), DeletionPolicy, UpdateReplacePolicy, or cfn-lint / aws cloudformation validate-template errors. Do NOT use for Python Lambda handler code in backend/, frontend HTML/CSS/JS, SAM/CDK/Terraform (this project uses raw CloudFormation YAML), or general web chat conversations.
---

# CloudFormation インフラ作業ルール

Claude Code で `infrastructure/` 配下の CloudFormation YAML テンプレートを扱う際、Claude が従うべき行動ルール。
インフラ変更は**既存リソースの削除・置換・データ損失**を引き起こすリスクがあるため、backend 以上に慎重に扱う。

---

## Claude が従う行動ルール

### 1. 対象リソース・対象スタックに限定
- ユーザーが指定した Resources セクションの該当リソースのみ扱う
- 「ついでに他のリソースも整理」は **禁止**
- テンプレート全体の構造変更(Parameters 追加、Outputs 追加)は明示指示時のみ

### 2. 既存リソースの論理ID・物理名を勝手に変更しない
以下の変更は **既存スタックの削除再作成または置換** を引き起こす:
- Resources の論理ID(YAML キー名)の変更
- `TableName`, `FunctionName`, `RoleName` 等の物理名変更
- `AWS::DynamoDB::Table` の KeySchema 変更
- `AWS::Lambda::Function` の FunctionName 変更

これらを変更する前に、**Replacement 発生リスクを必ず警告**する。

### 3. DeletionPolicy / UpdateReplacePolicy の尊重
- `DeletionPolicy: Retain` / `Snapshot` が付いているリソースは特に慎重に扱う
- 既存のポリシー設定を勝手に削除・変更しない
- DynamoDB / RDS など**ステートフルなリソース**は Retain 推奨を念押しする

### 4. IAM ポリシーは最小権限の原則を守る
以下は **禁止**:
- `Action: "*"` の使用
- `Resource: "*"` の安易な使用
- `AdministratorAccess` 等の強力なマネージドポリシーのアタッチ
- 不要な広範囲権限(dynamodb:* を1テーブルアクセスのためだけに付与する等)

リソース指定は ARN を `!Sub` で組み立てるか、`!GetAtt` で参照する。

### 5. 組み込み関数の使い方を守る
- `!Ref` / `!GetAtt` / `!Sub` / `!Join` の使い分けを統一
- 既存テンプレートのスタイルに合わせる(短縮形 `!Sub` か フル形式 `Fn::Sub` か)
- ハードコード値を勝手に `!Sub` 化しない(既存スタイル優先)

### 6. デプロイコマンドは実行しない、提示のみ
- `aws cloudformation deploy` / `create-stack` / `update-stack` を**Claude が実行しない**
- 必要なコマンドは**コマンド文字列として提示**するだけ
- `--capabilities CAPABILITY_NAMED_IAM` 等の必須オプションも忘れず明記
- ChangeSet 作成を推奨(いきなり update-stack しない)

### 7. コスト影響のある変更は警告
以下の変更は**必ずコスト警告**を出す:
- DynamoDB の BillingMode 変更(PROVISIONED ↔ PAY_PER_REQUEST)
- DynamoDB の RCU/WCU 大幅増加
- Lambda の MemorySize 大幅増加
- Lambda の ReservedConcurrentExecutions 設定
- API Gateway の Throttling 設定
- CloudWatch Logs の RetentionInDays 削除(= 無期限保持化)

### 8. CloudFormation 特有の罠を意識
以下は**必ず意識して回答する**:
- YAML インデント崩れによる parse エラー
- `!Sub` 内での `${}` 変数展開(`!Ref` と使い分け)
- 循環依存(DependsOn の要否)
- スタックパラメータのデフォルト値欠落
- AMI ID などリージョン依存値のハードコード
- CFn の **Intrinsic Function は短縮形と完全形を混ぜない**

### 9. 提案を勝手に追加しない
以下は明示要求時のみ:
- Nested Stack への分割
- CDK / SAM / Terraform への移行提案
- cfn-lint / cfn_nag の導入
- タグ付け戦略の変更

---

## 調査の切り分け観点

| 症状 | 最初に見る範囲 |
|---|---|
| `aws cloudformation validate-template` エラー | YAML 構文 / Intrinsic Function の記法 |
| スタック作成失敗 | CloudFormation イベントの最初の FAILED / ROLLBACK |
| IAM 関連エラー | Role の AssumeRolePolicyDocument / Policies の Statement |
| Lambda デプロイ失敗 | Code プロパティ / Runtime / Handler の指定 |
| DynamoDB 作成失敗 | KeySchema / AttributeDefinitions の整合性 / BillingMode |
| Replacement 警告 | 変更プロパティの Update requires 属性 |
| 循環依存エラー | DependsOn / 相互 Ref |

---

## 標準応答フォーマット

### 原因特定時
```
主因: [YAML構文 / IAM / Resource定義 / Intrinsic Function / 依存関係]
原因: [1〜2行]
根拠: [該当行 or エラーメッセージ]
Replacement リスク: [あり / なし / 不明]
次アクション: [最小修正の方向性]
```

### 修正コード提示時
- 該当 Resource ブロックのみ
- YAML インデント(スペース2)を厳守
- Intrinsic Function の記法を既存テンプレートに合わせる
- 変更していない Properties は再掲しない

---

## IAM ポリシーの定型チェック

IAM Policy を見るとき、以下を**毎回確認**:

1. **`Action: "*"` を使っていないか?** → 使っていたら必ず警告
2. **`Resource: "*"` が必要か?** → 特定リソースに絞れないか検討
3. **ARN は `!Sub` / `!GetAtt` で動的生成されているか?**(ハードコード警告)
4. **Condition で制限できないか?**(SourceIp, MFA 等)
5. **AssumeRolePolicy の Principal が正しいサービスか?**

---

## ユーザー向けコピペプロンプト

### A. CFn テンプレートの原因特定のみ
```
infrastructure/ の [ファイル名] の [Resource名] だけ見て、
原因特定のみ。修正は提案不要。
Replacement リスクがあれば必ず明示。
```

### B. IAM ポリシーのセキュリティチェック
```
この IAM Policy ブロックだけ見て、
Action: "*" / Resource: "*" / 過剰権限がないか確認。
問題のみ箇条書き、修正コードは不要。
```

### C. 最小修正 YAML のみ
```
この Resource の [プロパティ名] だけ修正してください。
他の Resources・Parameters・Outputs は触らない。
修正後の該当ブロックのみ、インデント厳守で返す。
```

### D. デプロイ前チェック
```
この変更で Replacement(再作成)が発生するリソースはありますか?
該当する場合、論理ID・プロパティ・影響(データ損失の可能性等)を
箇条書きで。実行コマンドは提示のみ、勝手に実行しない。
```

### E. コスト影響の確認
```
この変更でコストに影響する項目はありますか?
DynamoDB BillingMode / Lambda MemorySize / Logs RetentionInDays 
などの観点で、影響の大きい順に3点まで。
```

---

## 禁止事項

- `aws cloudformation` コマンドの直接実行
- 既存リソースの論理ID / 物理名の無断変更
- DeletionPolicy: Retain の無断削除
- `Action: "*"` / `Resource: "*"` を無警告で生成
- テンプレート全体の構造変更を勝手に提案
- SAM / CDK / Terraform への移行を勝手に提案
- `infrastructure/` 以外のファイルを勝手に読む
- YAML インデントを既存と変える(2スペース → 4スペース等)

---

## 最重要原則

**対象リソースに限定・Replacement を警告・IAM は最小権限・コマンドは提示のみ。**

インフラ変更は本番リソースの削除・データ損失につながる。backend より一段慎重に。
