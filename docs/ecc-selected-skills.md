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

### Phase 1

- `frontend/css/style-v2.css` のみ変更
- Neon Arcade Glass UI を適用
- `snake-v2.js` の Canvas 色定数変更は保留
- GitHub Actions による S3 + CloudFront deploy 成功
- PC / スマホ実機確認で START / PAUSE / RESUME / BGM / Ranking / D-pad すべて問題なし

### Phase 2-B

- `frontend/index-v2.html` に `#fx-bg` を1行追加
- `frontend/css/style-v2.css` に cinematic FX layer を追加
- 追加 effect:
  - background grid drift
  - radial glow
  - title pulse
  - HUD shimmer
  - ranking light sweep
  - level-up burst
  - button hover glow
- `prefers-reduced-motion` に対応
- GitHub Actions による S3 + CloudFront deploy 成功
- PC / スマホ実機確認で表示・操作ともに問題なし

### 変更しなかったもの

- `frontend/js/snake-v2.js`
- `frontend/js/audio-v2.js`
- v2.1 rollback 用ファイル
  - `frontend/index.html`
  - `frontend/css/style.css`
  - `frontend/js/snake.js`