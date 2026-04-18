/**
 * audio-v2.js — Web Audio API による合成音源モジュール
 *
 * 提供：
 *   window.SnakeAudio = {
 *     startBgm, pauseBgm, resumeBgm, stopBgm,
 *     playEat, playGameOver,
 *     toggle, isEnabled,
 *   }
 *
 * 設計：
 *   - BGM はループ中パターンを AudioContext.currentTime ベースで先行スケジューリング
 *   - pause / resume はスケジューラ停止 + AudioContext.suspend で位置保持
 *   - 効果音は都度 Oscillator を生成（連打対応）
 */
(function () {
  'use strict';

  let ctx          = null;
  let masterGain   = null;
  let enabled      = true;       // ユーザートグル（初期ON）
  let bgmShouldPlay = false;     // 論理状態：BGM 再生中か
  let bgmTimer     = null;       // スケジューラの setInterval ID
  let nextNoteTime = 0;
  let beatIndex    = 0;

  /* ── 音楽定義 (C minor pentatonic 系のチップチューン)  ── */
  const BPM      = 132;
  const BEAT     = 60 / BPM / 2;     // 8分音符の長さ (秒)
  const LOOKAHEAD_MS  = 25;          // スケジューラ実行間隔
  const SCHEDULE_SEC  = 0.12;        // 先行スケジュール秒数
  const MASTER_GAIN   = 0.22;

  // 16 拍のループ（C minor pentatonic 主体 + フィル）
  // 0 は休符
  const LEAD_NOTES = [
    523.25, 622.25, 698.46, 783.99,   // C5 Eb5 F5 G5
    698.46, 622.25, 523.25, 466.16,   // F5 Eb5 C5 Bb4
    523.25, 698.46, 783.99, 932.33,   // C5 F5 G5 Bb5
    783.99, 698.46, 622.25, 523.25,   // G5 F5 Eb5 C5
  ];
  const BASS_NOTES = [
    130.81, 0, 130.81, 0,             // C3
    174.61, 0, 174.61, 0,             // F3
    155.56, 0, 155.56, 0,             // Eb3
    196.00, 0, 174.61, 0,             // G3 → F3
  ];

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = MASTER_GAIN;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function scheduleNote(freq, startTime, duration, type, gain) {
    if (!freq) return;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);
    osc.connect(g).connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  function scheduler() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + SCHEDULE_SEC) {
      const i = beatIndex % LEAD_NOTES.length;
      scheduleNote(LEAD_NOTES[i], nextNoteTime, BEAT * 0.85, 'square',   0.18);
      if (BASS_NOTES[i]) {
        scheduleNote(BASS_NOTES[i], nextNoteTime, BEAT * 0.9, 'triangle', 0.28);
      }
      nextNoteTime += BEAT;
      beatIndex++;
    }
  }

  function startBgm() {
    if (!enabled) return;
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    bgmShouldPlay = true;
    nextNoteTime  = ctx.currentTime + 0.05;
    beatIndex     = 0;
    if (!bgmTimer) bgmTimer = setInterval(scheduler, LOOKAHEAD_MS);
  }

  function pauseBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    if (ctx && ctx.state === 'running') ctx.suspend();
    // bgmShouldPlay は維持（resume 時に復帰判定で使用）
  }

  function resumeBgm() {
    if (!ctx || !enabled || !bgmShouldPlay) return;
    ctx.resume().then(() => {
      nextNoteTime = ctx.currentTime + 0.05;
      if (!bgmTimer) bgmTimer = setInterval(scheduler, LOOKAHEAD_MS);
    });
  }

  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    bgmShouldPlay = false;
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  /* ── 効果音：Food 取得時（上昇ブリップ） ── */
  function playEat() {
    if (!enabled) return;
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.09);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.28, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);
    osc.connect(g).connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /* ── 効果音：GameOver（下降アルペジオ） ── */
  function playGameOver() {
    if (!enabled) return;
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const base = ctx.currentTime;
    const seq  = [523.25, 440, 349.23, 261.63];   // C5 A4 F4 C4
    seq.forEach((f, i) => {
      const t   = base + i * 0.13;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = 'sawtooth';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.18);
      osc.connect(g).connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  /* ── トグル：on/off ── */
  function toggle() {
    enabled = !enabled;
    if (!enabled) stopBgm();
    return enabled;
  }

  window.SnakeAudio = {
    startBgm, pauseBgm, resumeBgm, stopBgm,
    playEat, playGameOver,
    toggle,
    isEnabled: () => enabled,
  };
})();
