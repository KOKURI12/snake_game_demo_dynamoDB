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

### Phase 5-A

- `frontend/js/audio-v2.js`、`frontend/js/snake-v2.js` を変更
- BGM の固定 BPM を Level 連動 BPM に変更
- `audio-v2.js` に `currentBpm` / `targetBpm` / `getBeatSec()` を追加
- `SnakeAudio.setLevel(level, options)` を追加
- Level up 時に target BPM 側へ 30% 即時寄せし、その後 beat ごとに easing して約1秒弱で目標 BPM に到達する Micro Ramp を実装
- BPM 設計:
  - Lv1: 108
  - Lv2: 116
  - Lv3: 124
  - Lv4: 132
  - Lv5: 140
  - Lv6: 148
  - Lv7: 156
  - Lv8+: 164 上限
- new game / restart 時は `setLevel(1, { instant: true })` により Lv1 BPM へ即時 reset
- `stopBgm()` では BPM state を reset しない方針に変更
- BGM OFF→ON、pause / resume 時も現在 level の BPM state を保持
- `snake-v2.js` 側では new game 時と level up 時に `SnakeAudio.setLevel()` を呼ぶ最小変更にした
- 既存の chiptune BGM メロディ、eat sound、game-over sound は変更なし
- 外部音源・外部ライブラリは追加なし
- mobile Safari の AudioContext 制約対応は既存実装を維持
- PC / スマホ実機確認で違和感なし
- Lv up 時のテンポ上昇、Restart 時の Lv1 BPM reset、Lv8+ の 164 BPM 上限、BGM toggle / pause / resume / stop の挙動に問題なし

#### Phase 5-A で変更しなかったもの

- `frontend/index-v2.html`
- `frontend/css/style-v2.css`
- BGM toggle UI 構造
- eat sound / game-over sound の基本挙動
- Canvas / Snake / Food 描画処理
- Ranking API 仕様
- Score 登録 API 仕様
- backend/
- infrastructure/
- v2.1 rollback 用ファイル
  - `frontend/index.html`
  - `frontend/css/style.css`
  - `frontend/js/snake.js`

### Phase 6-A / v2.4

- `frontend/index-v2.html`、`frontend/css/style-v2.css`、`frontend/js/snake-v2.js`、`README.md` を変更
- Special Food System を追加
  - Normal Core / Slow Core / Rebirth Core の3種構成を導入
  - Lv5到達時に Slow Core を1回だけ確定出現させる intro spawn を追加
  - Slow Core:
    - Lv5以上で出現
    - score +1
    - snake.length +1
    - 5秒間 speed × 1.35
    - SLOW chip に残秒数を表示
  - Rebirth Core:
    - Lv6以上で出現候補
    - Lv6以上の抽選比率を Slow / Rebirth = 40 / 60 に調整
    - score +1
    - snake.length -3
    - 最低長さ3未満にはしない
    - REBIRTH -3 chip を約1秒表示
  - Special Food は最大1個まで出現
  - 通常餌 / snake本体 / specialFood の重なり回避を実装
  - TTL 7秒、自動消滅、pause / resume / retry / game over の状態リセットに対応
  - frame-delta ベースの timer により pause復帰 / tab復帰時の delta 暴走を防止
- Dev Mode を追加
  - `?dev=1` の時だけ有効
  - Jump Lv5 / Jump Lv6 / Spawn Slow / Spawn Rebirth / Clear Special
  - Shift + 5 / 6 / S / R / X の検証用ショートカット
  - Dev Mode中は score submit を無効化
  - 通常URLでは Dev UI 非表示、ショートカット無効
- PC / iPhone Safari 同一Wi-Fi環境で実機確認済み
- 通常モード・Dev Mode ともに表示・操作・BGM・Ranking・D-pad への影響なし

#### Phase 6-A / v2.4 実機確認結果

- Lv1〜Lv4で特殊餌が出現しないことを確認
- Lv5到達時のSlow Core初回確定出現を確認
- Slow Core取得、5秒後復帰、pause/resume、retryを確認
- Lv6以降のSlow/Rebirth抽選を確認
- Rebirth Core取得時の score +1 / snake.length -3 / REBIRTH -3 chip を確認
- snake.length=3 でRebirthを取得しても最低長さ未満にならないことを確認
- 7秒間取得されない場合の自動消滅を確認
- game over → retry で状態が完全リセットされることを確認
- mobile iPhone SafariでDev panelのタップ操作と通常操作への影響なしを確認
- BGM toggle / Ranking / Score API / mobile操作への影響なしを確認
- Dev Mode中のscore submit無効化を確認

#### Phase 6-A / v2.4 で変更しなかったもの

- `frontend/js/audio-v2.js`
- `backend/`
- `infrastructure/`
- Ranking API
- Score登録API
- GitHub Actions
- v2.1 rollback files
  - `frontend/index.html`
  - `frontend/css/style.css`
  - `frontend/js/snake.js`
- v2.3 rollback snapshot files
  - `frontend/index-v2.3.html`
  - `frontend/css/style-v2.3.css`
  - `frontend/js/snake-v2.3.js`
  - `frontend/js/audio-v2.3.js`

#### Phase 6-A / v2.4 balance notes

- 初期実装では Rebirth Core の snake.length -1 が弱く感じられたため、実機確認後に snake.length -3 へ調整
- Lv6以降でRebirthの価値を高めるため、Slow / Rebirth 抽選比率を 40 / 60 に調整
- Special Foodの出現頻度を 14秒間隔 / 55% 確率、失敗時4秒retry に調整

### Phase 6-B / v2.5

#### 変更ファイル

- `frontend/index-v2.html`
- `frontend/css/style-v2.css`
- `frontend/js/snake-v2.js`

#### 変更しなかったファイル

- `frontend/js/audio-v2.js`
- `frontend/js/api.js`
- `backend/`
- `infrastructure/`
- Ranking API
- Score登録API
- GitHub Actions
- v2.1 rollback files
  - `frontend/index.html`
  - `frontend/css/style.css`
  - `frontend/js/snake.js`
- v2.3 rollback snapshot files
  - `frontend/index-v2.3.html`
  - `frontend/css/style-v2.3.css`
  - `frontend/js/snake-v2.3.js`
  - `frontend/js/audio-v2.3.js`

#### 実装内容

- Rebirth Fever Mode
  - Rebirth Core 取得時に Fever Mode を 6 秒間付与
  - Fever 中に Normal Core を取得した場合のみ score +2
  - Slow Core / Rebirth Core 自体は倍率対象外
  - Rebirth Core 再取得時は Fever 時間を 6 秒にリセット(加算しない)
  - Slow と Fever は独立タイマーで同時存在可能
  - score +2 による 5 点境界跨ぎの level up に対応
- Buff Bar UX
  - 旧 special-status chip(単一表示・優先順位切替)を廃止
  - HUD と canvas の間に Buff Bar を新設し、FEVER / SLOW / REBIRTH / PICKUP / COMBO を独立 chip として並列表示
  - PICKUP chip は `PICKUP: SLOW Ns` / `PICKUP: REBIRTH Ns` の prefix 付きで active buff と区別
  - 固定 min-height で予約領域確保、layout shift ゼロ
  - モバイル幅は 5 chip 折返しを 2 段分の min-height で事前予約
- Rebirth Tail Highlight
  - Rebirth Core 取得時、削除された tail segment を trim ghost として描画
  - 描画専用で collision / snake 本体ロジックには影響しない
  - Neon Dissolve 風(細い mint ring + 内側 white-mint glow + 短い diagonal slash + 微小 spark)で 0.5 秒 fade out + scale down
- Rebirth Spawn Bias / Combo Charge
  - Lv6 以上で有効
  - Normal Core を 3 秒以内に連続取得すると comboCount が上昇(上限 5)
  - 次回 specialFood 抽選時の Rebirth 出現率を `min(0.6 + comboCount × 0.05, 0.85)` に加算
  - combo ≥ 2 のときだけ COMBO chip を表示
  - specialFood 取得 / TTL 切れ / gameOver / retry / Dev Clear Special で combo reset
  - spawn 抽選失敗のみでは combo は維持
  - specialFood の spawn delay / retry delay / TTL / spawn probability は変更せず、Lv6+ の type selection のみへの bias

#### 実機確認結果

- PC確認済み
- スマホ確認済み
- D-pad / スワイプ操作に問題なし
- Buff Bar 表示確認済み
- FEVER / SLOW / REBIRTH / PICKUP / COMBO chip 表示確認済み
- Rebirth Tail Highlight 視認性調整済み
- Combo Charge による Rebirth 出現率調整確認済み
- pause / resume / tab復帰 / gameOver / retry の timer 暴走なし

#### 発生した問題と対応

- Buff Bar が表示されないように見えたが、ハードリロード後に表示確認。ブラウザキャッシュ起因と判断
- HUD / Buff Bar / canvas 間隔が広かったため、`#buff-bar` の margin / min-height をCSSで調整
- Tail Highlight が派手すぎたため、Neon Dissolve 風に調整
- Rebirth length -3 が -4 に見える問題を調査し、trim ghost / length 処理を修正・確認済み
  - 原因: Rebirth pop ループの 1 回目が `unshift +1` の打ち消し(通常移動相当)であり、本来 ghost に含めるべきでなかった
  - 対応: 「通常 pop 1 回(ghost なし) + Rebirth penalty 最大 3 回(ghost あり)」に分離し、ghost 個数を 3 個に修正
- Lv6以降の Rebirth Core 出現率が低く感じたため、Combo Charge による Rebirth Spawn Bias を追加
- これにより、高レベル帯で高得点を狙いやすい戦略性を追加