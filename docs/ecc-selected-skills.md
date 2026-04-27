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

  ### Phase 3-A

- `frontend/css/style-v2.css` のみ変更
- Ranking Panel の visual states を改善
- Top 3 を gold / silver / bronze のネオン配色で強調
- 4位以降の ranking row 表示を Neon Arcade UI に合わせて調整
- Empty / Error 表示をゲームUIらしく調整
- desktop hover effect を追加
- `prefers-reduced-motion` に対応
- PC / スマホ実機確認で表示・操作ともに問題なし

#### Phase 3-A mobile fix

- `frontend/css/style-v2.css` のみ変更
- スマホ表示で Top 3 の medal emoji と順位番号が重複していたため補正
- mobile では medal emoji を非表示にし、順位番号 `1 / 2 / 3` を gold / silver / bronze 色で表示
- 4位以降の2列レイアウトを維持
- PC表示の medal emoji 仕様は維持
- PC / スマホ実機確認で表示崩れなし

### Phase 4-B

- `frontend/index-v2.html`、`frontend/css/style-v2.css`、`frontend/js/snake-v2.js` を変更
- Game Over Modal の Player Name policy UX を改善
- 名前入力ポリシーの注意文を短縮
- validation error を Ranking status ではなく、Player Name input 直下に表示するよう変更
- `setRankingStatus` は API通信・ランキング更新系の表示に用途を整理
- input 再入力時、modal close 時、validation OK 時に error 表示がクリアされることを確認
- `validatePlayerName` による client-side validation を強化
- URL / email / 電話番号らしき文字列をブロック
- 不適切な名前は `inappropriate` 扱いにして「別の名前を使ってください」と表示
- PC / スマホ実機確認で validation とエラー表示の挙動に問題なし

#### validation 確認例

- `gay` / `GAY` / `g a y` / `g_a_y` → block
- `yama_isGAY` / `yama_is_Gay` / `2024Gay_isyama` → block
- `sex` / `S E X` / `s_e_x` → block
- `セックス` / `せっくす` / `げい` / `ゲイ` / `シックス` → block
- `太郎` / `Alex` / `Player2024` → ok

### Redis Ranking Cache TTL 修正

- `backend/get_ranking/lambda_function.py` を変更
- DynamoDB のランキングデータを全削除しても、画面上に古いランキングが残る問題を調査
- DynamoDB 側は `Count: 0` で削除済みだったが、Redis に `ranking:top10` の古いキャッシュが残っていたことが原因
- `CACHE_TTL=3600` は環境変数として存在していたが、実際の Redis 保存処理では TTL なしで保存されていた

### 今回変更しなかったもの
- `frontend/js/audio-v2.js`
- Canvas / Snake / Food 描画処理
- Ranking API 仕様
- Score 登録 API 仕様
- v2.1 rollback 用ファイル
  - `frontend/index.html`
  - `frontend/css/style.css`
  - `frontend/js/snake.js`

  ### Phase 4-C Lite

- `frontend/index-v2.html`、`frontend/css/style-v2.css` を変更
- タイトル表示を `SNAKE` から `NEON SNAKE` + `// SERVERLESS ARCADE` に改善
- `#title` ID は維持し、`title-main` / `title-sub` の2段構成に変更
- 軽い title intro animation を追加
- `prefers-reduced-motion` に対応
- Game Over Modal の見た目を控えめに調整
- `GAME OVER` title の glow / pulse を上品な強さに調整
- Modal box の depth / glass 感を維持しつつ、強すぎる発光を抑制
- Player Name input の focus glow を控えめに調整
- 前回案で違和感があった以下は採用しない方針に変更
  - 大きな SCORE panel
  - score 数字の強い magenta glow
  - scanline overlay
  - modal burst animation
  - score scale / glow burst animation
- PC 実機確認で表示・操作ともに問題なし
- スマホ表示でも title / modal / input / submit / skip の崩れがないことを確認

#### Phase 4-C Lite で変更しなかったもの

- `frontend/js/snake-v2.js`
- `frontend/js/audio-v2.js`
- `validatePlayerName` の判定ロジック
- Player Name policy note / error 表示UX
- Score登録API仕様
- Ranking API仕様
- Canvas / Snake / Food 描画処理
- v2.1 rollback 用ファイル
  - `frontend/index.html`
  - `frontend/css/style.css`
  - `frontend/js/snake.js`