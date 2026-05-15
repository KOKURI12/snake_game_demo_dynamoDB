/**
 * snake-v2.js — ゲームロジック（v2: UI改修 + 音響対応版）
 *
 * v2 変更点：
 *   - LEVEL 表示を HUD 内 SCORE / BEST 間へ移動（数字のみ）
 *   - level up 時に HUD / ゲームカード背景を一時的にハイライト
 *   - BGM / 効果音連動（window.SnakeAudio を呼び出す）
 *   - BGM on/off トグルボタン対応
 */
(function () {
  'use strict';

  /* ── Constants ── */
  const COLS = 20, ROWS = 20, SZ = 20;
  const W = COLS * SZ, H = ROWS * SZ;
  const BASE_SPEED = 180, MIN_SPEED = 60;

  // Phase 6-B / v2.5.2: Level Threshold Curve
  // index N = Lv(N+1) に到達するために必要な累計 score
  // Lv1〜Lv5 までは旧仕様（5 点ごと）、Lv6 以降は段階的に重くして
  // Rebirth Charge / Fever / Combo を活用する時間を確保する
  const LEVEL_THRESHOLDS = [0, 5, 10, 15, 20, 25, 35, 50, 70, 95];

  const COLOR_BG    = '#fafffa';
  const COLOR_GRID  = '#e0ebe0';
  const COLOR_FOOD  = '#ef5350';
  const COLOR_EYES  = '#ffffff';
  const COLOR_PUPIL = '#1b5e20';
  const SNAKE_COLORS = [
    '#1b5e20', '#2e7d32', '#388e3c',
    '#43a047', '#4caf50', '#66bb6a', '#81c784'
  ];

  const LEVEL_FLASH_MS = 800;  // v2: level up ハイライト継続時間

  // Phase 6-A: Special Food
  const SPECIAL_FOOD_TTL_MS         = 7000;
  const SPECIAL_FOOD_SPAWN_DELAY_MS = 14000;   // v2.4: 22000 → 14000（出現頻度 up）
  const SPECIAL_FOOD_SPAWN_RETRY_MS = 4000;    // v2.4: 5000 → 4000
  const SPECIAL_FOOD_SPAWN_PROB     = 0.55;    // v2.4: 0.35 → 0.55
  const SLOW_EFFECT_DURATION_MS     = 5000;
  const SLOW_SPEED_MULT             = 1.35;
  const SLOW_MIN_LV                 = 5;
  const REBIRTH_MIN_LV              = 6;
  const MIN_SNAKE_LENGTH            = 3;
  const REBIRTH_TRIM_COUNT          = 3;       // v2.4: Rebirth で snake を縮める segment 数（-1 → -3）
  // Phase 6-B / v2.5.3: REBIRTH_WEIGHT_LV6_PLUS / REBIRTH_WEIGHT_MAX は廃止し、
  // getRebirthWeightRange(lvl) で Lv 別の base/max を返す方式に移行（Slow Assist）
  const REBIRTH_FLASH_MS            = 1000;
  const COLOR_SLOW                  = '#ff9b3d';
  const COLOR_REBIRTH               = '#7fffaf';
  const FRAME_DELTA_MAX_MS          = 200;   // resume 直後の delta 暴走 guard

  // Phase 6-B / v2.5: Rebirth Fever Mode
  const FEVER_DURATION_MS           = 6000;  // Fever 継続時間（6 秒）
  const FEVER_NORMAL_SCORE          = 2;     // Fever 中の Normal Core score 加算量（通常 +1 → Fever +2）

  // Phase 6-B / v2.5 UX: Rebirth Tail Highlight（Neon Ash Dissolve / Digital Dust Fade）
  // v2.5.1: 高速 Lv で見えにくかった件への視認性チューニング
  const TRIM_GHOST_DURATION_MS      = 900;             // 全体の fade 継続時間（700 → 900ms）
  const TRIM_GHOST_SEGMENT_PHASE_MS = 150;             // 最初に segment shape を見せる時間（100 → 150ms）
  const TRIM_GHOST_PARTICLE_COUNT   = 9;               // 1 segment あたりの粒子数（7 → 9）
  const COLOR_TRIM_GHOST_SEGMENT    = '#bfeaff';       // pale cyan の segment ghost
  const COLOR_TRIM_GHOST_PARTICLE_A = '#7fe8ff';       // 粒子色 A（cyan）
  const COLOR_TRIM_GHOST_PARTICLE_B = '#ffffff';       // 粒子色 B（white）
  const COLOR_TRIM_GHOST_PARTICLE_C = '#d8f3ff';       // 粒子色 C（pale blue）

  // Phase 6-B / v2.5: Rebirth Spawn Bias / Combo Charge（Lv6+ 限定）
  const COMBO_MIN_LV                = 6;       // combo が有効になる最低レベル
  const COMBO_WINDOW_MS             = 3000;    // Normal Core 連続取得の許容間隔（3 秒）
  const COMBO_MAX                   = 5;       // combo 内部上限
  const COMBO_BIAS_STEP             = 0.05;    // combo 1 ごとの Rebirth bias 加算（+5%）
  const COMBO_DISPLAY_MIN           = 2;       // COMBO chip を表示する閾値

  // Phase 6-B / v2.5.3: Soft Anti-Stall Timer
  // 最後に Normal Core を取得してからの経過時間で specialFood spawn timer の進行倍率を変える
  // 待機戦略を緩やかに抑制する（timer は reset せず進行速度のみ調整）
  const STALL_PHASE1_END_MS         = 5000;    // 0〜5 秒: 通常速度（100%）
  const STALL_PHASE2_END_MS         = 10000;   // 5〜10 秒: 25% 速度
  const STALL_PHASE2_MULT           = 0.25;    // phase2 の進行倍率（phase3 は 0 で完全停止）

  // Phase 6-B / v2.5.1: Rebirth Charge / Guarantee System（Lv6+ 限定）
  // 小数誤差を避けるため integer step 管理（0〜10）
  const REBIRTH_CHARGE_MIN_LV       = 6;       // Charge が有効になる最低レベル
  const REBIRTH_CHARGE_MAX_STEPS    = 10;      // Charge 上限（10 個取得で REBIRTH READY）
  const REBIRTH_CHARGE_DISPLAY_MIN  = 5;       // (v2.5.1) 旧 CHARGE chip 表示閾値 / v2.5.4 では未使用

  // Phase 6-B / v2.5.4: Rebirth Charge Body UX（snake body amber/gold glow 表現）
  // v2.5.4 polish2: 緑ベース維持 + 外側 halo / rim 強化 + wave は accent のみ
  const COLOR_CHARGE_GLOW_AMBER     = '#ffd060';   // 通常 charge 帯 (ratio < 0.5) の amber
  const COLOR_CHARGE_GLOW_GOLD      = '#ffe07a';   // 強い charge 帯 (ratio >= 0.5) の gold 寄り amber
  const COLOR_CHARGE_AURA_GOLD      = '#fff2b0';   // READY 時の head aura / wave 中心の明るい gold

  // 本体 overlay は控えめ（緑を残すため alpha を polish 値から大きめに下げる / v2.5.4 polish3 で更に微減）
  const CHARGE_BODY_ALPHA_LOW       = 0.08;        // ratio < 0.5 の glow alpha
  const CHARGE_BODY_ALPHA_HIGH      = 0.14;        // ratio >= 0.5 の glow alpha
  const CHARGE_BODY_ALPHA_READY     = 0.22;        // READY 時の全身 glow alpha

  // 外側 halo（発光のベース、controlled に少し抑える）
  const CHARGE_HALO_ALPHA_LOW       = 0.22;        // ratio < 0.5
  const CHARGE_HALO_ALPHA_HIGH      = 0.34;        // ratio >= 0.5
  const CHARGE_HALO_ALPHA_READY     = 0.46;        // READY
  const CHARGE_HALO_EXPAND_PX       = 3;

  // Rim glow（segment 縁の細い stroke、controlled に少し抑える）
  const CHARGE_RIM_ALPHA_LOW        = 0.32;
  const CHARGE_RIM_ALPHA_HIGH       = 0.44;
  const CHARGE_RIM_ALPHA_READY      = 0.58;
  const CHARGE_RIM_LINE_WIDTH       = 1.2;

  // Phase 6-B / v2.5.4 polish3: Electric Arc（短い lightning 線で「電流が流れる」体感）
  const COLOR_ARC_CORE              = '#fffbe6';   // 白〜pale gold の芯線
  const COLOR_ARC_GLOW              = '#ffe07a';   // gold の太い glow 線
  const ARC_PERIOD_MS               = 700;         // arc 動き 1 周期（jagged 形状の seed リフレッシュ）
  const ARC_FLOW_PERIOD_MS          = 1300;        // tail → head の流れ周期
  const ARC_GLOW_LINE_WIDTH         = 3.0;         // 太い半透明 glow 線
  const ARC_CORE_LINE_WIDTH         = 1.2;         // 細い芯線
  const ARC_GLOW_ALPHA              = 0.45;        // glow 線の alpha
  const ARC_CORE_ALPHA              = 0.85;        // 芯線の alpha
  const ARC_JITTER_PX               = 3.5;         // jagged 中間点のずらし最大 px
  const ARC_MIDPOINTS               = 2;           // 隣接 segment 間に置く中間点の個数
  const ARC_DENSITY_LOW             = 0.45;        // ratio < 0.5 で arc 発生する比率
  const ARC_DENSITY_HIGH            = 0.70;        // ratio >= 0.5
  const ARC_DENSITY_READY           = 0.90;        // READY 時の発生比率
  const ARC_FLOW_BAND_HALF          = 2.2;         // 流れバンドの半幅（segment 単位）

  // Energy pulse wave は本体全体を黄色化せず、wave ピーク中だけ accent を強める方式に変更
  const CHARGE_WAVE_AMP             = 0.30;        // overlay alpha 加算上限（控えめに）
  const CHARGE_WAVE_HALO_AMP        = 0.25;        // halo alpha 加算上限
  const CHARGE_WAVE_RIM_AMP         = 0.35;        // rim alpha 加算上限（光が縁を走る感）
  const CHARGE_WAVE_WIDTH           = 2.0;         // wave の幅（segment 単位の半幅、少し絞る）
  const CHARGE_WAVE_PERIOD_MS       = 1300;        // wave 1 周期の所要時間（tail → head）

  // READY head aura
  const CHARGE_READY_ALPHA_BASE     = 0.50;        // READY aura の基本 alpha（少し強化）
  const CHARGE_READY_PULSE_AMP      = 0.25;        // pulse 振幅（reduced-motion 時は 0 固定）
  const CHARGE_READY_PULSE_MS       = 1400;        // pulse 周期
  const CHARGE_READY_AURA_RADIUS_PX = 7;           // READY aura の追加半径

  // Phase 6-A Dev Mode: ?dev=1 クエリで有効化
  const isDevMode = (() => {
    try {
      return new URLSearchParams(window.location.search).get('dev') === '1';
    } catch (_) {
      return false;
    }
  })();

  // Phase 6-B / v2.5.4: prefers-reduced-motion 判定（READY aura の pulse 制御に使用）
  const prefersReducedMotion = (() => {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  })();

  /* ── DOM ── */
  const appEl     = document.getElementById('app');
  const canvas    = document.getElementById('game-canvas');
  const ctx       = canvas.getContext('2d');
  const scoreEl   = document.getElementById('score-val');
  const hiEl      = document.getElementById('hi-val');
  const msgEl     = document.getElementById('message');
  const levelEl   = document.getElementById('level-display');
  const actionBtn = document.getElementById('action-btn');
  const bgmBtn    = document.getElementById('bgm-toggle');

  // Modal elements
  const scoreModal    = document.getElementById('score-modal');
  const modalScoreEl  = document.getElementById('modal-final-score');
  const playerNameEl  = document.getElementById('player-name-input');
  const submitBtn     = document.getElementById('submit-score-btn');
  const skipBtn       = document.getElementById('skip-score-btn');
  const playerNameError = document.getElementById('player-name-error');

  // Ranking elements
  const rankingList   = document.getElementById('ranking-list');
  const rankingEmpty  = document.getElementById('ranking-empty');
  const rankingStatus = document.getElementById('ranking-status');

  // Phase 6-B / v2.5: Buff Bar（active buff chip 3個 + pickup hint chip 1個）
  const buffFeverEl   = document.getElementById('buff-fever');
  const buffSlowEl    = document.getElementById('buff-slow');
  const buffRebirthEl = document.getElementById('buff-rebirth');
  const buffPickupEl  = document.getElementById('buff-pickup');
  const buffComboEl   = document.getElementById('buff-combo');
  // Phase 6-B / v2.5.4: 旧 #buff-charge chip を廃止し、READY 専用 #buff-rebirth-ready に置換
  const buffReadyEl   = document.getElementById('buff-rebirth-ready');

  /* ── State ── */
  let snake, dir, nextDir, food;
  let score = 0, hi = 0, lvl = 1, speed = BASE_SPEED;
  let state = 'idle';
  let rafId = null, lastTs = 0;
  let flashTimer = null;

  // Phase 6-A: Special Food state
  let specialFood         = null;   // { x, y, type: 'slow' | 'rebirth', ttlMs }
  let specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
  let slowEffectMs        = 0;
  let rebirthFlashMs      = 0;
  let feverMs             = 0;     // Phase 6-B / v2.5: Fever 残時間（slowEffectMs と独立管理）
  let trimGhosts          = [];    // Phase 6-B / v2.5 UX: Rebirth tail ghost { x, y, ageMs }[]（描画専用）
  let comboCount          = 0;     // Phase 6-B / v2.5: Normal Core 連続取得 combo（0〜COMBO_MAX）
  let comboWindowMs       = 0;     // combo 維持の残時間（frame-delta 管理）
  let rebirthChargeSteps  = 0;     // Phase 6-B / v2.5.1: Rebirth Charge 累積（integer 0〜REBIRTH_CHARGE_MAX_STEPS）
  let stallMs             = 0;     // Phase 6-B / v2.5.3: 最後の Normal Core 取得からの経過時間（Soft Anti-Stall Timer）
  let lastFrameTs         = 0;     // updateSpecialTimers 用 per-frame delta tracker
  let hasSpawnedLevel5IntroSlow = false;   // Lv5 到達時の 1 回限り force spawn フラグ

  /* ── Audio shim（SnakeAudio 未ロード時でも安全に動く） ── */
  const Audio = {
    start()     { window.SnakeAudio && window.SnakeAudio.startBgm(); },
    pause()     { window.SnakeAudio && window.SnakeAudio.pauseBgm(); },
    resume()    { window.SnakeAudio && window.SnakeAudio.resumeBgm(); },
    stop()      { window.SnakeAudio && window.SnakeAudio.stopBgm(); },
    eat()       { window.SnakeAudio && window.SnakeAudio.playEat(); },
    over()      { window.SnakeAudio && window.SnakeAudio.playGameOver(); },
    toggle()    { return window.SnakeAudio ? window.SnakeAudio.toggle() : false; },
    isOn()      { return window.SnakeAudio ? window.SnakeAudio.isEnabled() : false; },
    // Phase 5-A: Level 連動 BPM（setLevel が未ロードでも安全）
    setLevel(level, options) {
      if (window.SnakeAudio && window.SnakeAudio.setLevel) {
        window.SnakeAudio.setLevel(level, options);
      }
    },
  };

  /* ── Canvas DPR / Resize ── */
  function setupCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const scale = (rect.width * dpr) / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  function redrawCurrent() {
    if (state === 'running' || state === 'paused') {
      draw();
      if (state === 'paused') drawPauseOverlay();
    } else if (state === 'over') {
      draw();
      drawGameOverOverlay();
    } else {
      drawIdle();
    }
  }
  window.addEventListener('resize', () => {
    setupCanvas();
    redrawCurrent();
  });

  /* ── State machine ── */
  function setState(s) {
    state = s;
    switch (s) {
      case 'idle':    actionBtn.textContent = 'START';  break;
      case 'running': actionBtn.textContent = 'PAUSE';  break;
      case 'paused':  actionBtn.textContent = 'RESUME'; break;
      case 'over':    actionBtn.textContent = 'RETRY';  break;
    }
  }
  function handleAction() {
    if (state === 'idle' || state === 'over') startGame();
    else if (state === 'running')              pauseGame();
    else if (state === 'paused')               resumeGame();
  }

  /* ── Start / Reset ── */
  function startGame() {
    closeModal();
    cancelAnimationFrame(rafId);
    snake   = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    dir     = {x:1,y:0};
    nextDir = {x:1,y:0};
    score   = 0;
    lvl     = 1;
    speed   = BASE_SPEED;
    lastTs  = 0;
    // Phase 6-A: Special Food state を完全リセット（前ゲームの状態を持ち越さない）
    specialFood         = null;
    specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
    slowEffectMs        = 0;
    rebirthFlashMs      = 0;
    feverMs             = 0;
    trimGhosts          = [];
    comboCount          = 0;
    comboWindowMs       = 0;
    rebirthChargeSteps  = 0;
    stallMs             = 0;
    lastFrameTs         = 0;
    hasSpawnedLevel5IntroSlow = false;
    updateBuffBar();
    placeFood();
    updateHUD();
    levelEl.textContent = '1';
    clearLevelFlash();
    setState('running');
    rafId = requestAnimationFrame(loop);
    // Phase 5-A: BGM 開始前に BPM を Lv1 デフォルトに snap（前ゲームの高 BPM を持ち越さない）
    Audio.setLevel(1, { instant: true });
    Audio.start();
  }

  /* ── Pause / Resume ── */
  function pauseGame() {
    if (state !== 'running') return;
    cancelAnimationFrame(rafId);
    setState('paused');
    drawPauseOverlay();
    Audio.pause();
  }
  function resumeGame() {
    if (state !== 'paused') return;
    lastTs = 0;
    // Phase 6-A: per-frame delta tracker もリセット（pause 中の経過時間を Special timer に流入させない）
    lastFrameTs = 0;
    setState('running');
    rafId = requestAnimationFrame(loop);
    Audio.resume();
  }
  function togglePause() {
    if (state === 'running')     pauseGame();
    else if (state === 'paused') resumeGame();
  }

  /* ── Food ── */
  function placeFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS)
      };
    } while (
      snake.some(s => s.x === pos.x && s.y === pos.y) ||
      (specialFood && specialFood.x === pos.x && specialFood.y === pos.y)
    );
    food = pos;
  }

  // Phase 6-B / v2.5.1: Rebirth Charge が READY 状態か判定（Lv6+ かつ steps が上限到達）
  function isRebirthReady() {
    return lvl >= REBIRTH_CHARGE_MIN_LV && rebirthChargeSteps >= REBIRTH_CHARGE_MAX_STEPS;
  }

  // Phase 6-B / v2.5.3: Lv 別の Rebirth weight range（base / max）を返す（Slow Assist）
  // 操作難度が上がる高 Lv ほど Slow Core を出やすくして救済する。
  // READY 中は呼ばれない（呼び出し側で isRebirthReady() を優先判定するため）。
  function getRebirthWeightRange(lvl) {
    if (lvl >= 10) return { base: 0.45, max: 0.70 };   // Lv10: Slow 最低 30%（combo MAX 時）
    if (lvl >= 8)  return { base: 0.50, max: 0.75 };   // Lv8-9: Slow 最低 25%
    return { base: 0.55, max: 0.80 };                  // Lv6-7: Slow 最低 20%
  }

  // Phase 6-B / v2.5.2: score 更新後に呼んで、必要なら 1 段 level up する共通関数
  // Normal Core / Slow Core / Rebirth Core のどの取得経路からも呼べるよう切り出し済み
  // 現在の最大加点は Fever +2 までなので 1 段ずつの if 判定で十分（飛び級は起きない）。
  // 将来 +3 以上の score bonus を導入する場合は while ループ化が必要。
  function applyLevelUpIfNeeded() {
    if (lvl < LEVEL_THRESHOLDS.length && score >= LEVEL_THRESHOLDS[lvl]) {
      const prev = lvl;
      lvl = lvl + 1;
      speed = Math.max(MIN_SPEED, BASE_SPEED - lvl * 15);
      levelEl.textContent = String(lvl);
      if (lvl !== prev) {
        triggerLevelFlash();
        // Phase 5-A: Level 連動 BPM（Micro Ramp で 30% 即時 + 残り ease）
        Audio.setLevel(lvl);
        // Phase 6-A: Lv5 到達時に Slow Core を 1 回だけ 100% force spawn（intro 体験用）
        if (lvl === SLOW_MIN_LV && !hasSpawnedLevel5IntroSlow && !specialFood) {
          if (spawnSpecialFoodForced('slow')) {
            hasSpawnedLevel5IntroSlow = true;
          }
        }
      }
    }
  }

  /* ── Phase 6-A: Special Food ── */
  function findEmptyCell() {
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (food && food.x === x && food.y === y) continue;
      // Phase 6-A: snake が未初期化（idle / over 状態）でも安全に動作
      if (snake && snake.some(s => s.x === x && s.y === y)) continue;
      return { x, y };
    }
    return null;
  }

  function spawnSpecialFood() {
    const candidates = [];
    if (lvl >= SLOW_MIN_LV)    candidates.push('slow');
    if (lvl >= REBIRTH_MIN_LV) candidates.push('rebirth');
    if (candidates.length === 0) {
      specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
      return;
    }
    const cell = findEmptyCell();
    if (!cell) {
      specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_RETRY_MS;
      return;
    }
    // v2.4: Lv6+ で candidates が ['slow', 'rebirth'] の場合は重み付き抽選
    // Phase 6-B / v2.5: combo に応じて Rebirth bias を上げる
    // Phase 6-B / v2.5.1: REBIRTH READY 中は Combo bias を skip して Rebirth を確定
    // Phase 6-B / v2.5.3: Lv 別の base/max を getRebirthWeightRange() から取得し、高 Lv ほど Slow を出やすくする
    let type;
    if (candidates.length === 1) {
      type = candidates[0];
    } else if (isRebirthReady() && candidates.indexOf('rebirth') !== -1) {
      type = 'rebirth';
    } else {
      const range = getRebirthWeightRange(lvl);
      const weight = Math.min(range.base + comboCount * COMBO_BIAS_STEP, range.max);
      type = Math.random() < weight ? 'rebirth' : 'slow';
    }
    specialFood = { x: cell.x, y: cell.y, type, ttlMs: SPECIAL_FOOD_TTL_MS };
    updateBuffBar();
  }

  // Phase 6-A: 確率抽選をバイパスして特定 type を強制 spawn（Lv5 intro / dev mode で使用）
  function spawnSpecialFoodForced(type) {
    const cell = findEmptyCell();
    if (!cell) return false;
    specialFood = { x: cell.x, y: cell.y, type, ttlMs: SPECIAL_FOOD_TTL_MS };
    updateBuffBar();
    return true;
  }

  function despawnSpecialFood() {
    specialFood = null;
    specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
    // Phase 6-B / v2.5: 取得・TTL 切れの両方を通る一元 reset 点（spawn 抽選失敗ではここを通らない）
    comboCount    = 0;
    comboWindowMs = 0;
    updateBuffBar();
  }

  // dispatch（将来 Phase 拡張時の hook ポイント）
  function applySpecialFoodEffect(type) {
    if (type === 'slow')    applySlowEffect();
    if (type === 'rebirth') applyRebirthEffect();
  }

  function applySlowEffect() {
    // 重複取得時は加算せず常にリセット
    slowEffectMs = SLOW_EFFECT_DURATION_MS;
  }

  function applyRebirthEffect() {
    // snake.length 操作は update() 内で行う（pre-length guard を一元管理）
    // ここでは chip flash トリガー + Fever 開始
    rebirthFlashMs = REBIRTH_FLASH_MS;
    // Phase 6-B / v2.5: Rebirth 取得で Fever 開始。重複取得時は加算せず常にリセット（6 秒に戻す）
    feverMs = FEVER_DURATION_MS;
  }

  function updateSpecialTimers(deltaMs) {
    // Phase 6-B / v2.5.3: Soft Anti-Stall Timer 用に最後の Normal Core 取得からの経過時間を進める
    // （pause / resume / タブ復帰は既存 FRAME_DELTA_MAX_MS clamp と lastFrameTs リセットで暴走防止）
    stallMs += deltaMs;
    // stallMs に応じた spawn timer の進行倍率を決定（specialFood TTL は通常速度を維持）
    let stallMult;
    if (stallMs < STALL_PHASE1_END_MS)      stallMult = 1.0;
    else if (stallMs < STALL_PHASE2_END_MS) stallMult = STALL_PHASE2_MULT;
    else                                     stallMult = 0;

    // specialFood TTL
    if (specialFood) {
      specialFood.ttlMs -= deltaMs;
      if (specialFood.ttlMs <= 0) {
        despawnSpecialFood();
      } else {
        updateBuffBar();   // PICKUP 残秒数表示更新
      }
    } else if (lvl >= SLOW_MIN_LV) {
      // 抽選 timer（Soft Anti-Stall Timer の倍率を適用、stallMs >= 10秒で完全停止）
      specialSpawnDelayMs -= deltaMs * stallMult;
      if (specialSpawnDelayMs <= 0) {
        // Phase 6-B / v2.5.1: REBIRTH READY 中は spawn probability を bypass し、確定で spawn 発火
        // type selection 側で Rebirth が確定的に選ばれる
        if (isRebirthReady()) {
          spawnSpecialFood();
          specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
        } else if (Math.random() < SPECIAL_FOOD_SPAWN_PROB) {
          spawnSpecialFood();
        } else {
          // 失敗時は短い retry delay
          specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_RETRY_MS;
        }
      }
    }
    // Slow 効果残時間
    if (slowEffectMs > 0) {
      slowEffectMs -= deltaMs;
      if (slowEffectMs <= 0) slowEffectMs = 0;
      updateBuffBar();
    }
    // REBIRTH chip flash 残時間
    if (rebirthFlashMs > 0) {
      rebirthFlashMs -= deltaMs;
      if (rebirthFlashMs <= 0) {
        rebirthFlashMs = 0;
        updateBuffBar();
      }
    }
    // Phase 6-B / v2.5: Fever 残時間（Slow と独立管理 / speed には影響しない）
    if (feverMs > 0) {
      feverMs -= deltaMs;
      if (feverMs <= 0) feverMs = 0;
      updateBuffBar();
    }
    // Phase 6-B / v2.5 UX: trim ghost の age 更新（既存 frame-delta システムに乗せる）
    if (trimGhosts.length > 0) {
      for (let i = 0; i < trimGhosts.length; i++) {
        trimGhosts[i].ageMs += deltaMs;
      }
      // 期限切れ ghost を除去
      trimGhosts = trimGhosts.filter(g => g.ageMs < TRIM_GHOST_DURATION_MS);
    }
    // Phase 6-B / v2.5: combo timer（3 秒以内に Normal Core 再取得しないと reset）
    if (comboWindowMs > 0) {
      comboWindowMs -= deltaMs;
      if (comboWindowMs <= 0) {
        comboWindowMs = 0;
        comboCount    = 0;
      }
      updateBuffBar();
    }
  }

  // Phase 6-B / v2.5 UX: 各 buff chip を独立に表示・非表示する（優先順位切替ではなく並列表示）
  function updateBuffBar() {
    // FEVER chip
    if (buffFeverEl) {
      if (feverMs > 0) {
        buffFeverEl.textContent = 'FEVER x' + FEVER_NORMAL_SCORE + ' ' + Math.ceil(feverMs / 1000) + 's';
        buffFeverEl.hidden = false;
      } else {
        buffFeverEl.textContent = '';
        buffFeverEl.hidden = true;
      }
    }
    // SLOW chip（active な speed × 1.35 効果中）
    if (buffSlowEl) {
      if (slowEffectMs > 0) {
        buffSlowEl.textContent = 'SLOW ' + Math.ceil(slowEffectMs / 1000) + 's';
        buffSlowEl.hidden = false;
      } else {
        buffSlowEl.textContent = '';
        buffSlowEl.hidden = true;
      }
    }
    // REBIRTH chip（取得直後 1 秒の length 減少フラッシュ）
    if (buffRebirthEl) {
      if (rebirthFlashMs > 0) {
        buffRebirthEl.textContent = 'REBIRTH -' + REBIRTH_TRIM_COUNT;
        buffRebirthEl.hidden = false;
      } else {
        buffRebirthEl.textContent = '';
        buffRebirthEl.hidden = true;
      }
    }
    // PICKUP chip（フィールド上に specialFood がある TTL hint、active buff と明確に区別）
    if (buffPickupEl) {
      if (specialFood) {
        const label = specialFood.type === 'slow' ? 'SLOW' : 'REBIRTH';
        buffPickupEl.textContent = 'PICKUP: ' + label + ' ' + Math.ceil(specialFood.ttlMs / 1000) + 's';
        buffPickupEl.hidden = false;
      } else {
        buffPickupEl.textContent = '';
        buffPickupEl.hidden = true;
      }
    }
    // COMBO chip（combo >= 2 のときだけ表示、Rebirth bias の可視化）
    if (buffComboEl) {
      if (comboCount >= COMBO_DISPLAY_MIN && comboWindowMs > 0) {
        buffComboEl.textContent = 'COMBO x' + comboCount + ' ' + Math.ceil(comboWindowMs / 1000) + 's';
        buffComboEl.hidden = false;
      } else {
        buffComboEl.textContent = '';
        buffComboEl.hidden = true;
      }
    }
    // Phase 6-B / v2.5.4: REBIRTH READY chip（READY 時のみ表示 / Charge 進捗は snake body glow で表現）
    if (buffReadyEl) {
      if (lvl >= REBIRTH_CHARGE_MIN_LV && rebirthChargeSteps >= REBIRTH_CHARGE_MAX_STEPS) {
        buffReadyEl.textContent = 'REBIRTH READY';
        buffReadyEl.hidden = false;
      } else {
        buffReadyEl.textContent = '';
        buffReadyEl.hidden = true;
      }
    }
  }

  // Phase 6-B / v2.5 UX: Rebirth で削除された tail を Neon Ash Dissolve / Digital Dust Fade で描画
  // 描画専用：collision / snake 本体ロジックには影響しない
  // 構成:
  //   - phase 1 (0〜100ms): segment shape を薄い角丸四角として残し、軽く発光
  //   - phase 2 (100ms〜700ms): 粒子が上方向へほどけて drift、後半は外側へ散って fade out
  // 粒子の random 値は生成時（createTrimGhost）に固定済み → 毎フレームの揺らぎ・チラつきなし
  function drawTrimGhosts() {
    if (trimGhosts.length === 0) return;
    const particleColors = [
      COLOR_TRIM_GHOST_PARTICLE_A,
      COLOR_TRIM_GHOST_PARTICLE_B,
      COLOR_TRIM_GHOST_PARTICLE_C,
    ];
    ctx.save();
    for (let i = 0; i < trimGhosts.length; i++) {
      const g = trimGhosts[i];
      const t = g.ageMs / TRIM_GHOST_DURATION_MS;   // 0 → 1
      if (t >= 1) continue;
      const cx = g.x * SZ + SZ / 2;
      const cy = g.y * SZ + SZ / 2;

      // ── Phase 1: segment ghost（最初の 150ms だけ薄い角丸四角を残して軽く発光） ──
      // v2.5.1: 初動の認知を担保するため alpha を 0.55 → 0.75 に強化
      if (g.ageMs < TRIM_GHOST_SEGMENT_PHASE_MS) {
        const segT = g.ageMs / TRIM_GHOST_SEGMENT_PHASE_MS;   // 0 → 1
        const segAlpha = (1 - segT) * 0.75;
        ctx.globalAlpha = segAlpha;
        ctx.fillStyle = COLOR_TRIM_GHOST_SEGMENT;
        roundRect(g.x * SZ + 1.5, g.y * SZ + 1.5, SZ - 3, SZ - 3, 5);
        ctx.fill();
      }

      // ── Phase 2: ash particles（生成時固定の random 値で上方向へ drift） ──
      const ageSec = g.ageMs / 1000;
      for (let k = 0; k < g.particles.length; k++) {
        const p = g.particles[k];
        // 粒子個別の寿命（lifeRatioSeed で人ごとに少しずれて消える）
        const pLife = t / p.lifeRatioSeed;
        if (pLife >= 1) continue;
        // 後半は少し外側へ散らす（横速度に t を掛けた追加 drift）
        const driftX = p.velocityX * ageSec + (p.velocityX * 0.6) * t;
        const driftY = p.velocityY * ageSec;   // 上方向（velocityY は負値）
        const px = cx + p.offsetX + driftX;
        const py = cy + p.offsetY + driftY;
        // 後半急に薄くなる感を出すため fade を二乗
        const fade = 1 - pLife;
        ctx.globalAlpha = p.alphaSeed * fade * fade;
        ctx.fillStyle = particleColors[p.colorIndex];
        // size もわずかに縮ませる（crumbled 感）
        const size = p.size * (0.85 + 0.15 * fade);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSpecialFood() {
    if (!specialFood) return;
    const color = specialFood.type === 'slow' ? COLOR_SLOW : COLOR_REBIRTH;
    const label = specialFood.type === 'slow' ? 'S' : 'R';
    const px = specialFood.x * SZ + SZ / 2;
    const py = specialFood.y * SZ + SZ / 2;
    const r  = SZ / 2 - 3;
    // glow
    const grad = ctx.createRadialGradient(px, py, 1, px, py, r + 4);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r + 4, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    // label
    ctx.fillStyle = '#0a0e1a';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);
  }

  /* ── Phase 6-A Dev Mode（?dev=1 で有効化、検証専用） ── */
  function devJumpToLevel(targetLvl) {
    // Phase 6-B / v2.5.2: LEVEL_THRESHOLDS から逆引き（旧 (targetLvl - 1) * 5 は固定式依存だったため廃止）
    const clampedLvl = Math.max(1, Math.min(targetLvl, 10));
    score = LEVEL_THRESHOLDS[clampedLvl - 1] ?? 0;
    if (score > hi) hi = score;
    lvl   = clampedLvl;
    speed = Math.max(MIN_SPEED, BASE_SPEED - lvl * 15);
    updateHUD();
    if (levelEl) levelEl.textContent = String(lvl);
    Audio.setLevel(lvl);
  }
  function devJumpToLevel5() {
    devJumpToLevel(5);
    if (specialFood) { specialFood = null; updateBuffBar(); }
    if (spawnSpecialFoodForced('slow')) {
      hasSpawnedLevel5IntroSlow = true;
    }
  }
  function devJumpToLevel6() {
    devJumpToLevel(6);
    if (specialFood) { specialFood = null; updateBuffBar(); }
    spawnSpecialFoodForced('rebirth');
    // Lv5 intro spawn を skip した扱いにし、後で意図せず force spawn しないようにする
    hasSpawnedLevel5IntroSlow = true;
  }
  function devSpawnSlow() {
    if (specialFood) { specialFood = null; updateBuffBar(); }
    spawnSpecialFoodForced('slow');
  }
  function devSpawnRebirth() {
    if (specialFood) { specialFood = null; updateBuffBar(); }
    spawnSpecialFoodForced('rebirth');
  }
  function devClearSpecial() {
    specialFood         = null;
    slowEffectMs        = 0;
    rebirthFlashMs      = 0;
    feverMs             = 0;
    trimGhosts          = [];
    comboCount          = 0;
    comboWindowMs       = 0;
    rebirthChargeSteps  = 0;
    stallMs             = 0;
    specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
    updateBuffBar();
  }
  function initDevMode() {
    const devPanel = document.getElementById('dev-panel');
    if (devPanel) devPanel.hidden = false;
    const map = {
      jump5:        devJumpToLevel5,
      jump6:        devJumpToLevel6,
      spawnSlow:    devSpawnSlow,
      spawnRebirth: devSpawnRebirth,
      clearSpecial: devClearSpecial,
    };
    document.querySelectorAll('[data-dev]').forEach(btn => {
      const action = btn.getAttribute('data-dev');
      if (map[action]) btn.addEventListener('click', map[action]);
    });
  }

  /* ── Game loop ── */
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    // Phase 6-A: per-frame delta for special timers (clamp で resume 直後 / tab 復帰時の暴走 guard)
    if (lastFrameTs > 0) {
      const frameDelta = Math.min(ts - lastFrameTs, FRAME_DELTA_MAX_MS);
      if (frameDelta > 0) updateSpecialTimers(frameDelta);
    }
    lastFrameTs = ts;

    // Phase 6-A: Slow 効果中は実効 speed を係数倍に
    const effectiveSpeed = slowEffectMs > 0 ? speed * SLOW_SPEED_MULT : speed;
    if (ts - lastTs < effectiveSpeed) return;
    lastTs = ts;
    update();
    draw();
  }

  function update() {
    dir = { ...nextDir };
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // 壁衝突
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameOver(); return;
    }
    // 自己衝突（テール除外）
    const body = snake.slice(0, -1);
    if (body.some(s => s.x === head.x && s.y === head.y)) {
      gameOver(); return;
    }

    snake.unshift(head);

    // Normal Core 衝突
    let normalAte = false;
    if (head.x === food.x && head.y === food.y) {
      normalAte = true;
      // Phase 6-B / v2.5.3: Soft Anti-Stall Timer — Normal Core 取得で stall を解除
      stallMs = 0;
      // Phase 6-B / v2.5: Fever 中は Normal Core のみ +2、それ以外は +1
      const inc = feverMs > 0 ? FEVER_NORMAL_SCORE : 1;
      score += inc;
      if (score > hi) hi = score;
      updateHUD();
      Audio.eat();
      // Phase 6-B / v2.5.2: LEVEL_THRESHOLDS による段階的 level up（共通関数に集約）
      applyLevelUpIfNeeded();
      // Phase 6-B / v2.5: Rebirth Spawn Bias / Combo Charge + v2.5.1: Rebirth Charge
      // level up 判定の後で lvl を見ることで、Lv6 到達したその取得から combo=1 / charge=1 が立つ
      // updateBuffBar() は両者の更新後に末尾で 1 回だけ呼び、無駄な再描画を抑える
      let buffChanged = false;
      if (lvl >= COMBO_MIN_LV) {
        comboCount    = Math.min(comboCount + 1, COMBO_MAX);
        comboWindowMs = COMBO_WINDOW_MS;
        buffChanged = true;
      }
      if (lvl >= REBIRTH_CHARGE_MIN_LV) {
        rebirthChargeSteps = Math.min(rebirthChargeSteps + 1, REBIRTH_CHARGE_MAX_STEPS);
        buffChanged = true;
      }
      if (buffChanged) updateBuffBar();
      placeFood();
    }

    // Phase 6-A: Special Food 衝突
    let specialType = null;
    if (specialFood && head.x === specialFood.x && head.y === specialFood.y) {
      specialType = specialFood.type;
      score++;
      if (score > hi) hi = score;
      updateHUD();
      Audio.eat();
      applySpecialFoodEffect(specialType);
      // Phase 6-B / v2.5.2: Slow / Rebirth 取得時の score +1 も threshold を跨ぐ可能性があるため
      // 共通関数で level up 判定を行う（Slow/Rebirth は Lv5/Lv6 以降出現なので Lv1〜4 経路は通常通らないが、
      // 累積 score で threshold に届くケースを正しく扱うため必ず呼ぶ）
      applyLevelUpIfNeeded();
      // Phase 6-B / v2.5.1: Rebirth Core を実際に取得した時のみ Charge を reset
      // Slow Core 取得 / TTL 切れ / spawn 失敗では Charge を維持（仕様通り）
      if (specialType === 'rebirth') {
        rebirthChargeSteps = 0;
      }
      despawnSpecialFood();
    }

    // Phase 6-A / v2.4: 長さ調整
    // - Normal eat        → grow +1 (skip pop)
    // - Slow eat          → grow +1 (skip pop) — 通常 food と同じ growth
    // - Rebirth eat       → 通常 pop 1 回（unshift +1 の打ち消し / ghost 対象外）+
    //                      Rebirth penalty として追加で REBIRTH_TRIM_COUNT 個 pop（ghost 対象）。
    //                      MIN_SNAKE_LENGTH 未満にはしない
    // - 何も食べていない → normal pop = 据え置き
    const ateAndGrow = normalAte || specialType === 'slow';
    if (!ateAndGrow) {
      if (specialType === 'rebirth') {
        // (1) 通常移動相当の pop（unshift +1 を打ち消す / ghost には含めない）
        if (snake.length > MIN_SNAKE_LENGTH) snake.pop();
        // (2) Rebirth penalty として追加で REBIRTH_TRIM_COUNT 個だけ縮める（ghost 対象）
        const targetLen = Math.max(snake.length - REBIRTH_TRIM_COUNT, MIN_SNAKE_LENGTH);
        while (snake.length > targetLen) {
          const tail = snake[snake.length - 1];
          trimGhosts.push(createTrimGhost(tail.x, tail.y));
          snake.pop();
        }
      } else {
        snake.pop();   // 通常の steady-state pop
      }
    }
  }

  // Phase 6-B / v2.5 UX: trim ghost 生成（粒子のランダム値は作成時に固定 / 毎フレーム再生成しない）
  // v2.5.1: size / alphaSeed / velocityY を上方修正し、高速 Lv でも視認できる強度に
  function createTrimGhost(x, y) {
    const particles = [];
    for (let i = 0; i < TRIM_GHOST_PARTICLE_COUNT; i++) {
      particles.push({
        offsetX:       (Math.random() - 0.5) * SZ * 0.6,      // segment 内のランダム初期位置
        offsetY:       (Math.random() - 0.5) * SZ * 0.6,
        velocityX:     (Math.random() - 0.5) * 14,            // 横方向ゆらぎ（px/秒）
        velocityY:     -(10 + Math.random() * 20),            // 上方向 drift -10〜-30 px/秒（v2.5.1: 25% 増）
        size:          1.0 + Math.random() * 1.6,             // 1.0〜2.6px（v2.5.1: 上限引き上げ）
        lifeRatioSeed: 0.65 + Math.random() * 0.35,           // 粒子ごとの寿命比（0.65〜1.0）
        alphaSeed:     0.65 + Math.random() * 0.35,           // 粒子ごとの最大 alpha 0.65〜1.0（v2.5.1: 底上げ）
        colorIndex:    Math.floor(Math.random() * 3),         // 0=cyan / 1=white / 2=pale blue
      });
    }
    return { x, y, ageMs: 0, particles };
  }

  /* ── v2: Level up ハイライト ── */
  function triggerLevelFlash() {
    clearLevelFlash();
    levelEl.classList.add('level-flash');
    appEl.classList.add('level-up-bg');
    flashTimer = setTimeout(() => {
      levelEl.classList.remove('level-flash');
      appEl.classList.remove('level-up-bg');
      flashTimer = null;
    }, LEVEL_FLASH_MS);
  }
  function clearLevelFlash() {
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    levelEl.classList.remove('level-flash');
    appEl.classList.remove('level-up-bg');
  }

  /* ── Draw ── */
  function drawGrid() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * SZ + 0.5, 0);
      ctx.lineTo(i * SZ + 0.5, H);
      ctx.stroke();
    }
    for (let j = 1; j < ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * SZ + 0.5);
      ctx.lineTo(W, j * SZ + 0.5);
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // Phase 6-B / v2.5.4 polish2: charged segment の外側に gold halo を敷く（本体の下層、発光の主役）
  // wave ピーク中はさらに halo alpha を加算して「光が流れる」体感を halo 側に集約
  function drawChargeBodyHalo(seg, chargeRatio, isReady, waveBoost) {
    let alpha;
    if (isReady)                alpha = CHARGE_HALO_ALPHA_READY;
    else if (chargeRatio < 0.5) alpha = CHARGE_HALO_ALPHA_LOW;
    else                        alpha = CHARGE_HALO_ALPHA_HIGH;
    if (waveBoost > 0) alpha = Math.min(1, alpha + CHARGE_WAVE_HALO_AMP * waveBoost);
    const expand = CHARGE_HALO_EXPAND_PX;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = (chargeRatio < 0.5 && !isReady && waveBoost < 0.5)
      ? COLOR_CHARGE_GLOW_AMBER
      : COLOR_CHARGE_GLOW_GOLD;
    roundRect(
      seg.x * SZ + 1.5 - expand,
      seg.y * SZ + 1.5 - expand,
      SZ - 3 + expand * 2,
      SZ - 3 + expand * 2,
      5 + expand
    );
    ctx.fill();
    ctx.restore();
  }

  // Phase 6-B / v2.5.4: 本体 overlay は控えめにし、緑をしっかり残す（gold は accent として乗せる程度）
  // wave ピーク中のみ alpha 加算で「ハイライトが流れる」体感を出す
  function drawChargeBodyGlow(seg, chargeRatio, isReady, waveBoost) {
    let alpha, color;
    if (isReady) {
      alpha = CHARGE_BODY_ALPHA_READY;
      color = COLOR_CHARGE_GLOW_GOLD;
    } else if (chargeRatio < 0.5) {
      alpha = CHARGE_BODY_ALPHA_LOW;
      color = COLOR_CHARGE_GLOW_AMBER;
    } else {
      alpha = CHARGE_BODY_ALPHA_HIGH;
      color = COLOR_CHARGE_GLOW_GOLD;
    }
    if (waveBoost > 0) {
      alpha = Math.min(1, alpha + CHARGE_WAVE_AMP * waveBoost);
      if (waveBoost >= 0.7) color = COLOR_CHARGE_AURA_GOLD;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    roundRect(seg.x * SZ + 1.5, seg.y * SZ + 1.5, SZ - 3, SZ - 3, 5);
    ctx.fill();
    ctx.restore();
  }

  // Phase 6-B / v2.5.4 polish2: charged segment の縁に gold rim を描き「光が体の縁に走る」体感を出す
  // 緑本体の色を活かしつつ、輪郭だけが gold に光る形（wave ピーク中は rim alpha を加算）
  function drawChargeBodyRim(seg, chargeRatio, isReady, waveBoost) {
    let alpha;
    if (isReady)                alpha = CHARGE_RIM_ALPHA_READY;
    else if (chargeRatio < 0.5) alpha = CHARGE_RIM_ALPHA_LOW;
    else                        alpha = CHARGE_RIM_ALPHA_HIGH;
    if (waveBoost > 0) alpha = Math.min(1, alpha + CHARGE_WAVE_RIM_AMP * waveBoost);
    const color = (waveBoost >= 0.7)
      ? COLOR_CHARGE_AURA_GOLD
      : (chargeRatio < 0.5 && !isReady ? COLOR_CHARGE_GLOW_AMBER : COLOR_CHARGE_GLOW_GOLD);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = CHARGE_RIM_LINE_WIDTH;
    roundRect(seg.x * SZ + 1.5, seg.y * SZ + 1.5, SZ - 3, SZ - 3, 5);
    ctx.stroke();
    ctx.restore();
  }

  // Phase 6-B / v2.5.4 polish: charged 部分を tail → head 方向に流れる pulse wave の強度を返す
  // 戻り値 0〜1 で、その segment が wave ピーク内かどうか + 中心からの距離による減衰
  // prefersReducedMotion 時は常に 0（wave 停止）、静止 glow のみで表現
  function getChargeWaveBoost(i, snakeLen, glowSegCount, chargeRatio) {
    if (prefersReducedMotion || glowSegCount <= 0 || chargeRatio <= 0) return 0;
    // wave 中心位置（segment index 空間で tail → head に進む）。
    // glow 範囲: snake.length - glowSegCount 〜 snake.length - 1（i の値が大きいほど tail 側）
    // 体感的には tail から head（i 大 → i 小）に流れさせたいので、t の逆方向で進行させる
    const t = (Date.now() % CHARGE_WAVE_PERIOD_MS) / CHARGE_WAVE_PERIOD_MS;   // 0 → 1
    const glowStartIdx = snakeLen - glowSegCount;                              // 一番 head 寄りの glow segment 位置
    const glowEndIdx   = snakeLen - 1;                                         // tail
    // tail (t=0) → head (t=1) で wave 中心が移動
    const centerIdx = glowEndIdx - (glowEndIdx - glowStartIdx) * t;
    const dist = Math.abs(i - centerIdx);
    if (dist > CHARGE_WAVE_WIDTH) return 0;
    // 中心ほど強い（cos 形状の減衰）
    return 0.5 + 0.5 * Math.cos((dist / CHARGE_WAVE_WIDTH) * Math.PI);
  }

  // Phase 6-B / v2.5.4 polish3: charged segment 間に短い lightning / electric arc を描く
  // 各 arc は隣接 segment の center を結ぶ折れ線で、中間点を sin + 擬似乱数で揺らす
  // 描画専用：collision / snake.length / movement に影響しない
  function drawChargeElectricArcs(chargeRatio, isReady, glowSegCount) {
    if (prefersReducedMotion) return;                  // reduced-motion 時は arc 停止
    if (!snake || snake.length < 2 || glowSegCount < 1) return;
    if (chargeRatio <= 0) return;

    const now = Date.now();
    const arcSeedT = now / ARC_PERIOD_MS;             // jagged 形状の更新周期
    const flowT = (now % ARC_FLOW_PERIOD_MS) / ARC_FLOW_PERIOD_MS;   // 0 → 1
    const density = isReady ? ARC_DENSITY_READY
                  : (chargeRatio < 0.5 ? ARC_DENSITY_LOW : ARC_DENSITY_HIGH);

    // 流れバンドの中心位置（segment index 空間、tail → head 方向）
    const glowStartIdx = snake.length - glowSegCount;
    const glowEndIdx   = snake.length - 1;
    const flowCenterIdx = glowEndIdx - (glowEndIdx - glowStartIdx) * flowT;

    // charged 範囲の隣接ペアを走査（i は head 側 / i+1 は tail 側）
    for (let i = glowStartIdx; i < glowEndIdx; i++) {
      // 両端が glow 範囲内であることを確認（i+1 も glow 範囲）
      const pairCenter = (i + (i + 1)) / 2;
      const distToFlow = Math.abs(pairCenter - flowCenterIdx);
      // 流れバンド外でも density に応じて稀に出すが、バンド内では強く出す
      const inFlowBand = distToFlow <= ARC_FLOW_BAND_HALF;
      // 擬似乱数（seed: pairCenter + 時刻スロット） — Math.random は使わずチラつかない
      const seed = Math.sin((pairCenter + Math.floor(arcSeedT)) * 12.9898) * 43758.5453;
      const r1 = seed - Math.floor(seed);   // 0〜1
      const threshold = inFlowBand ? density : density * 0.25;
      if (r1 > threshold) continue;

      // 隣接 segment center 座標
      const a = snake[i];
      const b = snake[i + 1];
      const ax = a.x * SZ + SZ / 2;
      const ay = a.y * SZ + SZ / 2;
      const bx = b.x * SZ + SZ / 2;
      const by = b.y * SZ + SZ / 2;
      // 線分に垂直なベクトル（中間点を垂直方向に揺らすため）
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      // jagged 中間点を生成（各点を擬似乱数 + sin で垂直方向にずらす）
      const points = [];
      points.push({ x: ax, y: ay });
      for (let m = 1; m <= ARC_MIDPOINTS; m++) {
        const f = m / (ARC_MIDPOINTS + 1);
        // pair / midpoint / 時刻スロットの組合せで seed を変える
        const s = Math.sin((pairCenter * 7.13 + m * 5.71 + Math.floor(arcSeedT)) * 23.456) * 91.351;
        const r = s - Math.floor(s);                  // 0〜1
        const offset = (r - 0.5) * 2 * ARC_JITTER_PX; // -JITTER〜+JITTER
        points.push({ x: ax + dx * f + nx * offset, y: ay + dy * f + ny * offset });
      }
      points.push({ x: bx, y: by });

      // wave / flow band 内では alpha を強化、バンド外は控えめ
      const bandBoost = inFlowBand ? 1.0 : 0.6;

      // (1) 太い半透明 glow 線
      ctx.save();
      ctx.globalAlpha = ARC_GLOW_ALPHA * bandBoost;
      ctx.strokeStyle = COLOR_ARC_GLOW;
      ctx.lineWidth = ARC_GLOW_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
      ctx.stroke();
      ctx.restore();

      // (2) 細い白〜pale gold の芯線
      ctx.save();
      ctx.globalAlpha = ARC_CORE_ALPHA * bandBoost;
      ctx.strokeStyle = COLOR_ARC_CORE;
      ctx.lineWidth = ARC_CORE_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Phase 6-B / v2.5.4: REBIRTH READY 時に head 周囲に gold aura を描く（v2.5.4 polish で半径・alpha 強化）
  // prefers-reduced-motion 時は pulse を停止し固定 alpha で描画（aura 自体は常に表示）
  function drawChargeReadyAura(head) {
    let pulseAlpha;
    if (prefersReducedMotion) {
      pulseAlpha = CHARGE_READY_ALPHA_BASE;
    } else {
      const t = (Date.now() % CHARGE_READY_PULSE_MS) / CHARGE_READY_PULSE_MS;
      pulseAlpha = CHARGE_READY_ALPHA_BASE + CHARGE_READY_PULSE_AMP * Math.sin(t * Math.PI * 2);
    }
    if (pulseAlpha <= 0) return;
    const px = head.x * SZ + SZ / 2;
    const py = head.y * SZ + SZ / 2;
    const r  = SZ / 2 + CHARGE_READY_AURA_RADIUS_PX;   // polish で半径拡大
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    const grad = ctx.createRadialGradient(px, py, 1, px, py, r + 6);
    grad.addColorStop(0, COLOR_CHARGE_AURA_GOLD);
    grad.addColorStop(0.55, 'rgba(255, 224, 122, 0.55)');
    grad.addColorStop(1, 'rgba(255, 242, 176, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    drawGrid();

    // Phase 6-B / v2.5.4: Rebirth Charge Body UX
    // chargeRatio から glow 対象 segment 数を計算（短 snake でも最低 1 segment が光るよう補正）
    const chargeRatio = (lvl >= REBIRTH_CHARGE_MIN_LV && snake)
      ? rebirthChargeSteps / REBIRTH_CHARGE_MAX_STEPS
      : 0;
    const isReady = chargeRatio >= 1.0;
    let glowSegCount = 0;
    if (chargeRatio > 0 && snake) {
      const rawGlowSegCount = Math.round(snake.length * chargeRatio);
      glowSegCount = Math.max(1, Math.min(snake.length, rawGlowSegCount));
    }
    // READY 時の head aura は snake 本体の下に敷く（aura → halo → 本体 → glow + wave の順）
    if (isReady && snake) drawChargeReadyAura(snake[0]);

    // v2.5.4 polish2: charged segment の外側 halo を snake 本体より前に敷く（wave 反映）
    if (glowSegCount > 0 && snake) {
      for (let i = 0; i < snake.length; i++) {
        const isGlow = (snake.length - 1 - i) < glowSegCount;
        if (isGlow) {
          const waveBoost = getChargeWaveBoost(i, snake.length, glowSegCount, chargeRatio);
          drawChargeBodyHalo(snake[i], chargeRatio, isReady, waveBoost);
        }
      }
    }

    snake.forEach((seg, i) => {
      const ci = Math.min(SNAKE_COLORS.length - 1, Math.floor(i / 3));
      ctx.fillStyle = SNAKE_COLORS[ci];
      roundRect(seg.x * SZ + 1.5, seg.y * SZ + 1.5, SZ - 3, SZ - 3, 5);
      ctx.fill();

      // Phase 6-B / v2.5.4 polish2: tail → head 方向に流れる energy wave を accent として
      //   - body overlay は控えめ（緑を残す）
      //   - rim stroke で「光が縁を走る」感を強める
      const isGlowSeg = glowSegCount > 0 && (snake.length - 1 - i) < glowSegCount;
      if (isGlowSeg) {
        const waveBoost = getChargeWaveBoost(i, snake.length, glowSegCount, chargeRatio);
        drawChargeBodyGlow(seg, chargeRatio, isReady, waveBoost);
        drawChargeBodyRim(seg, chargeRatio, isReady, waveBoost);
      }

      if (i === 0) {
        const cx = seg.x * SZ + SZ / 2;
        const cy = seg.y * SZ + SZ / 2;
        const ox = dir.x * 3, oy = dir.y * 3;
        const px = Math.abs(dir.x) ? 0 : 4;
        const py = Math.abs(dir.y) ? 0 : 4;

        ctx.fillStyle = COLOR_EYES;
        ctx.beginPath();
        ctx.arc(cx + ox - px, cy + oy - py, 2.8, 0, Math.PI * 2);
        ctx.arc(cx + ox + px, cy + oy + py, 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = COLOR_PUPIL;
        ctx.beginPath();
        ctx.arc(cx + ox - px + dir.x, cy + oy - py + dir.y, 1.3, 0, Math.PI * 2);
        ctx.arc(cx + ox + px + dir.x, cy + oy + py + dir.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Phase 6-B / v2.5.4 polish3: charged segment 間に短い electric arc を重ねる
    // （snake 本体・eyes より上、food より下のレイヤー / reduced-motion 時は内部で early return）
    if (glowSegCount > 0) drawChargeElectricArcs(chargeRatio, isReady, glowSegCount);

    const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 250);
    const fx = food.x * SZ + SZ / 2;
    const fy = food.y * SZ + SZ / 2;
    const r  = (SZ / 2 - 3) * pulse;
    const grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, r + 4);
    grad.addColorStop(0, COLOR_FOOD);
    grad.addColorStop(1, 'rgba(239, 83, 80, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR_FOOD;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(fx - r * 0.35, fy - r * 0.35, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Phase 6-B / v2.5 UX: Rebirth tail ghost を snake 本体の後・specialFood より前に描画
    drawTrimGhosts();
    // Phase 6-A: Special Food 描画（Normal Core より後ろに描画）
    drawSpecialFood();
  }

  function drawIdle() {
    drawGrid();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2e7d32';
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('SNAKE', W / 2, H / 2 - 6);
    ctx.fillStyle = '#8aa090';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('START を押してゲーム開始', W / 2, H / 2 + 22);
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2e7d32';
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2 - 8);
    ctx.fillStyle = '#4e6a52';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('ESC / RESUME で再開', W / 2, H / 2 + 20);
  }

  /* ── Game Over ── */
  function gameOver() {
    cancelAnimationFrame(rafId);
    setState('over');
    clearLevelFlash();
    // Phase 6-A: 死亡時に Special Food / 効果 / chip を完全リセット
    // Phase 6-B / v2.5: Fever 残時間も同タイミングでリセット
    // Phase 6-B / v2.5 UX: trim ghost も死亡時に完全消去（残留させない）
    specialFood         = null;
    slowEffectMs        = 0;
    rebirthFlashMs      = 0;
    feverMs             = 0;
    trimGhosts          = [];
    comboCount          = 0;
    comboWindowMs       = 0;
    rebirthChargeSteps  = 0;
    stallMs             = 0;
    specialSpawnDelayMs = SPECIAL_FOOD_SPAWN_DELAY_MS;
    hasSpawnedLevel5IntroSlow = false;
    updateBuffBar();
    drawGameOverOverlay();
    Audio.stop();
    Audio.over();
    openScoreModal(score);
  }

  function drawGameOverOverlay() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c62828';
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 14);
    ctx.fillStyle = '#4e6a52';
    ctx.font = '15px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('SCORE: ' + score, W / 2, H / 2 + 14);
  }

  function updateHUD() {
    scoreEl.textContent = score;
    hiEl.textContent    = hi;
  }

  /* ── Score Modal ── */
  function openScoreModal(finalScore) {
    if (!scoreModal) return;
    if (finalScore === 0) return;
    modalScoreEl.textContent = finalScore;
    playerNameEl.value = '';
    // Phase 6-A Dev Mode: スコア登録を視覚的に無効化（ボタンの状態 + 案内文）
    if (isDevMode) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'DEV MODE';
      setPlayerNameError('DEV MODE: スコア登録は無効（本番ranking には送信されません）');
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT';
    }
    scoreModal.removeAttribute('hidden');
    setTimeout(() => playerNameEl.focus(), 100);
  }

  function closeModal() {
    if (scoreModal) scoreModal.setAttribute('hidden', '');
    setPlayerNameError('');
  }

  function setPlayerNameError(msg) {
    if (playerNameError) playerNameError.textContent = msg || '';
  }

  /**
   * Phase 4: 最小限の client-side player name バリデーション
   * - trim / 制御文字除去 / 20文字制限
   * - URL / email / 長い数字列（連絡先）検出
   * - 露骨な性的・暴力・差別表現の最小検出
   * - NG ワードリストは意図的に小さく保つ（過剰判定回避）
   * - 判定は normalize('NFKC').toLowerCase() 後の文字列で行う
   * - API 送信は元の name（trim・制御文字除去・truncate のみ）を使う
   * 戻り値: { ok, name, reason: 'empty' | 'contact' | 'inappropriate' | null }
   */
  function validatePlayerName(rawName) {
    let name = (rawName || '').trim();
    if (!name) return { ok: false, name: '', reason: 'empty' };

    name = name.replace(/[\x00-\x1f\x7f]/g, '');
    if (name.length > 20) name = name.slice(0, 20);
    if (!name) return { ok: false, name: '', reason: 'empty' };

    // 全角→半角・互換文字統合 + 小文字化（判定専用）
    const normalized = name.normalize('NFKC').toLowerCase();
    // Phase 4-D: 空白 + 区切り文字（_-./・ー~〜/\|）も除去して回避対策強化
    // 例: "yama_isGAY" → "yamaisgay" / "g-a-y" → "gay" / "S_E_X" → "sex"
    const compactNormalized = normalized.replace(/[\s._\-・ー~〜/\\|]+/g, '');

    // 連絡先系（URL / email / 9桁以上の連続数字）
    if (/https?:\/\//.test(normalized) || /www\./.test(normalized) ||
        /[\w.+-]+@[\w-]+\.[\w.-]+/.test(normalized) || /\d{9,}/.test(normalized)) {
      return { ok: false, name, reason: 'contact' };
    }

    // Phase 4-D: gay / sex / kana 系は compactNormalized.includes() で substring 検出
    // word boundary を使わないため "yama_isGAY" / "2024Gay_isyama" / "g_a_y" 等も catch
    const BLOCKED_COMPACT_TERMS = [
      'gay', 'sex', 'sexy', 'sexual',
      'げい', 'ゲイ', 'シックス',
      'セックス', 'せっくす',
    ];
    if (BLOCKED_COMPACT_TERMS.some(term => compactNormalized.includes(term))) {
      return { ok: false, name, reason: 'inappropriate' };
    }

    // その他の NG パターン（substring 単純検出が向かないもの・word boundary 必須）
    const NG_PATTERNS = [
      // 性的（その他の露骨表現）
      /fuck/i, /\bporn/i,
      /ファック|ポルノ/,
      /性交|操逼/,
      // 暴力・脅迫
      /\brape\b/i, /\bmurder\b/i,
      /レイプ|殺害|殺人/,
      // 差別・侮辱（明確な slurs / 死ね）
      /\bnigger\b/i, /\bfaggot\b/i,
      /死ね/,
    ];
    if (NG_PATTERNS.some(p => p.test(normalized) || p.test(compactNormalized))) {
      return { ok: false, name, reason: 'inappropriate' };
    }

    return { ok: true, name, reason: null };
  }

  async function handleScoreSubmit() {
    // Phase 6-A Dev Mode: スコア登録を完全 block（API 送信前に return）
    if (isDevMode) {
      setPlayerNameError('DEV MODE: スコア登録は無効です');
      return;
    }
    const result = validatePlayerName(playerNameEl.value);
    if (!result.ok) {
      if (result.reason === 'empty') {
        setPlayerNameError('名前を入力してください');
      } else if (result.reason === 'contact') {
        setPlayerNameError('URL・連絡先は使えません');
      } else if (result.reason === 'inappropriate') {
        setPlayerNameError('別の名前を使ってください');
      }
      return;
    }
    setPlayerNameError('');
    const name = result.name;
    submitBtn.disabled = true;
    submitBtn.textContent = '登録中…';
    try {
      await window.SnakeAPI.postScore(name, score, lvl);
      submitBtn.textContent = 'SUBMIT';
      submitBtn.disabled = false;
      setRankingStatus('ランキング更新中…');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await loadRanking();
      closeModal();
      setRankingStatus('登録完了！ランキングを更新しました');
    } catch (err) {
      submitBtn.textContent = 'SUBMIT';
      submitBtn.disabled = false;
      setRankingStatus('登録に失敗しました');
      console.warn('postScore error:', err);
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', handleScoreSubmit);
    playerNameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleScoreSubmit();
    });
    playerNameEl.addEventListener('input', () => setPlayerNameError(''));
  }
  if (skipBtn) {
    skipBtn.addEventListener('click', closeModal);
  }

  /* ── Ranking ── */
  function setRankingStatus(msg) {
    if (rankingStatus) rankingStatus.textContent = msg;
    if (msg) setTimeout(() => { if (rankingStatus) rankingStatus.textContent = ''; }, 3000);
  }

  async function loadRanking() {
    if (!rankingList || !window.SnakeAPI) return;
    try {
      const data = await window.SnakeAPI.getRanking(10);
      renderRanking(data);
    } catch (err) {
      if (rankingEmpty) rankingEmpty.textContent = 'ランキング取得できませんでした';
      console.warn('getRanking error:', err);
    }
  }

  function renderRanking(items) {
    if (!rankingList) return;
    rankingList.innerHTML = '';
    if (!items || items.length === 0) {
      if (rankingEmpty) rankingEmpty.style.display = 'block';
      return;
    }
    if (rankingEmpty) rankingEmpty.style.display = 'none';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      const rank = i + 1;
      li.innerHTML = `
        <span class="rank-num ${rank <= 3 ? 'top3' : ''}">${rank}</span>
        <span class="rank-name" title="${escHtml(item.player_name)}">${escHtml(item.player_name)}</span>
        <span class="rank-score">${item.score}</span>
      `;
      rankingList.appendChild(li);
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Input: Keyboard ── */
  document.addEventListener('keydown', (e) => {
    // Phase 6-A Dev Mode: Shift+5/6/S/R/X ショートカット（dev mode 限定）
    if (isDevMode && e.shiftKey) {
      if (e.code === 'Digit5') { e.preventDefault(); devJumpToLevel5(); return; }
      if (e.code === 'Digit6') { e.preventDefault(); devJumpToLevel6(); return; }
      if (e.code === 'KeyS')   { e.preventDefault(); devSpawnSlow();    return; }
      if (e.code === 'KeyR')   { e.preventDefault(); devSpawnRebirth(); return; }
      if (e.code === 'KeyX')   { e.preventDefault(); devClearSpecial(); return; }
    }
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      if (scoreModal && !scoreModal.hidden) { closeModal(); return; }
      togglePause();
      return;
    }
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (state === 'idle' || state === 'over') startGame();
      else if (state === 'paused') resumeGame();
      return;
    }
    if (state !== 'running') return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map = {
      ArrowUp:    { x:  0, y: -1 },
      ArrowDown:  { x:  0, y:  1 },
      ArrowLeft:  { x: -1, y:  0 },
      ArrowRight: { x:  1, y:  0 },
      w: { x:  0, y: -1 },
      s: { x:  0, y:  1 },
      a: { x: -1, y:  0 },
      d: { x:  1, y:  0 },
    };
    const nd = map[key];
    if (!nd) return;
    if (nd.x !== -dir.x || nd.y !== -dir.y) nextDir = nd;
    e.preventDefault();
  });

  /* ── Action button ── */
  actionBtn.addEventListener('click', handleAction);

  /* ── v2: BGM トグル ── */
  function syncBgmBtn(on) {
    if (!bgmBtn) return;
    bgmBtn.textContent = on ? '🔊' : '🔇';
    bgmBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    bgmBtn.setAttribute('aria-label', on ? 'BGM オフにする' : 'BGM オンにする');
  }
  if (bgmBtn) {
    syncBgmBtn(Audio.isOn());
    bgmBtn.addEventListener('click', () => {
      const on = Audio.toggle();
      syncBgmBtn(on);
      if (on && state === 'running') Audio.start();
    });
  }

  /* ── D-pad ── */
  const dpadMap = {
    'btn-up':    { x:  0, y: -1 },
    'btn-down':  { x:  0, y:  1 },
    'btn-left':  { x: -1, y:  0 },
    'btn-right': { x:  1, y:  0 },
  };
  Object.entries(dpadMap).forEach(([id, nd]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const apply = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (state !== 'running') return;
      if (nd.x !== -dir.x || nd.y !== -dir.y) nextDir = nd;
    };
    el.addEventListener('touchstart', apply, { passive: false });
    el.addEventListener('click', apply);
  });

  /* ── Swipe gesture ── */
  let touchStart = null;
  const SWIPE_MIN = 24;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!touchStart || state !== 'running') return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    let nd;
    if (Math.abs(dx) > Math.abs(dy)) {
      nd = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      nd = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }
    if (nd.x !== -dir.x || nd.y !== -dir.y) nextDir = nd;
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  canvas.addEventListener('touchend',    () => { touchStart = null; });
  canvas.addEventListener('touchcancel', () => { touchStart = null; });

  /* ── Auto-pause on tab hidden ── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') pauseGame();
  });

  /* ── Boot ── */
  setupCanvas();
  drawIdle();
  loadRanking();
  // Phase 6-A Dev Mode: ?dev=1 のときだけ Dev UI とショートカットを有効化
  if (isDevMode) initDevMode();

})();
