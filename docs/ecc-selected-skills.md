# ECC Selected Skills

## 導入方針

ECC はフル導入せず、Claude Code 用 skill のみを選択導入する。

## Phase 1

- context-budget
- codebase-onboarding
- git-workflow
- gateguard
- frontend-patterns
- backend-patterns

## Phase 2

- api-design
- deployment-patterns
- documentation-lookup
- ai-regression-testing
- e2e-testing

## 非導入

- hooks
- MCP
- continuous-learning
- autonomous-loops
- full plugin install

## 注意

ECC hooks は `templates/.claude/settings.json` には入れない。
必要な場合のみ `settings.examples/settings.ecc-hooks.json` として参考保存する。

## UI改修検証結果

- Phase 1 として `frontend/css/style-v2.css` のみ変更
- Neon Arcade Glass UI を適用
- `snake-v2.js` の Canvas 色定数変更は保留
- GitHub Actions による S3 + CloudFront deploy 成功
- PC / スマホ実機確認で START / PAUSE / RESUME / BGM / Ranking / D-pad すべて問題なし