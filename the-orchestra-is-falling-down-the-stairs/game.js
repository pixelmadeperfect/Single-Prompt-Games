(() => {
  "use strict";

  const W = 720;
  const H = 1280;
  const TAU = Math.PI * 2;
  const SAVE_KEY = "orchestra-stairs-progress-v2";
  const PREF_KEY = "orchestra-stairs-prefs-v2";
  const MOVEMENTS = [
    { roman: "I", name: "Allegro con Gravity", hud: "I · ALLEGRO", brief: "Sweep upward. Keep the strings above the spotlight.", duration: 42, cap: 2, gravity: 430, tempo: 92, spawn: [1.45, 2.35] },
    { roman: "II", name: "Scherzo for Loose Brass", hud: "II · SCHERZO", brief: "Now the brass section is rolling in harmony.", duration: 48, cap: 4, gravity: 520, tempo: 106, spawn: [1.3, 2.2] },
    { roman: "III", name: "Piano Without a Handrail", hud: "III · PIANO", brief: "Catch the piano to launch the whole ensemble.", duration: 52, cap: 5, gravity: 555, tempo: 116, spawn: [1.2, 2.05], feature: 5 },
    { roman: "IV", name: "Rondo of Runaway Percussion", hud: "IV · RONDO", brief: "Strike the drums. Their shockwaves rescue nearby players.", duration: 56, cap: 5, gravity: 585, tempo: 126, spawn: [1.05, 1.85], feature: 2 },
    { roman: "V", name: "Grand Staircase Coda", hud: "V · CODA", brief: "Perfect beats now resonate through the entire orchestra.", duration: 62, cap: 5, gravity: 610, tempo: 132, spawn: [1.08, 1.82] }
  ];
  const TYPES = [
    { name: "Violin", cell: 0, color: "#ef7b3b", pitch: 76, r: 47 },
    { name: "Trumpet", cell: 1, color: "#f5c74c", pitch: 67, r: 48 },
    { name: "Drum", cell: 2, color: "#e84a4c", pitch: 48, r: 50 },
    { name: "Cello", cell: 3, color: "#9e4f2c", pitch: 43, r: 52 },
    { name: "Flute", cell: 4, color: "#58b7b2", pitch: 81, r: 46 },
    { name: "Piano", cell: 5, color: "#d39a4a", pitch: 52, r: 64 }
  ];
  const SCORE = [
    { roots: [48, 55, 57, 53], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], melody: [12, 16, 19, 24, 19, 16, 14, 19] },
    { roots: [50, 57, 59, 55], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], melody: [12, 14, 16, 19, 21, 19, 16, 14] },
    { roots: [52, 59, 61, 57], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], melody: [12, 16, 19, 23, 24, 23, 19, 16] },
    { roots: [55, 62, 64, 60], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], melody: [12, 16, 19, 21, 24, 21, 19, 16] },
    { roots: [60, 67, 69, 65], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], melody: [12, 16, 19, 24, 28, 24, 23, 19] }
  ];

  const $ = (s) => document.querySelector(s);
  const canvas = $("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const screens = [...document.querySelectorAll(".screen")];
  const hud = $("#hud");
  const comboEl = $("#combo");
  const images = {
    bg: Object.assign(new Image(), { src: "assets/grand-staircase-portrait.png" }),
    conductor: Object.assign(new Image(), { src: "assets/conductor.png" }),
    atlas: Object.assign(new Image(), { src: "assets/ensemble-atlas.png" })
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  function safeParse(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) { return fallback; }
  }

  class SoundHouse {
    constructor() {
      const stored = safeParse(PREF_KEY, {});
      this.volume = clamp(Number(stored.volume ?? 0.8), 0, 1);
      this.muted = !!stored.muted;
      this.reducedMotion = !!stored.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.ctx = null;
      this.master = null;
      this.music = null;
      this.fx = null;
      this.noise = null;
      this.hall = null;
      this.hallGain = null;
      this.compressor = null;
      this.lastUi = 0;
      this.musicOn = false;
      this.activeMusicVoices = 0;
      this.activeFxVoices = 0;
    }
    savePrefs() {
      try { localStorage.setItem(PREF_KEY, JSON.stringify({ volume: this.volume, muted: this.muted, reducedMotion: this.reducedMotion })); } catch (_) {}
    }
    async ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.music = this.ctx.createGain();
        this.fx = this.ctx.createGain();
        this.hall = this.ctx.createConvolver();
        this.hallGain = this.ctx.createGain();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.music.gain.value = this.musicOn ? 0.4 : 0.0001;
        this.fx.gain.value = 0.46;
        this.music.connect(this.master);
        this.music.connect(this.hall);
        this.hall.connect(this.hallGain);
        this.hallGain.connect(this.master);
        this.fx.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        this.noise = this.makeNoise();
        this.hall.buffer = this.makeHallImpulse(0.9, 3.6);
        this.hallGain.gain.value = 0.1;
        this.compressor.threshold.value = -14;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 3;
        this.compressor.attack.value = 0.012;
        this.compressor.release.value = 0.24;
        this.applyVolume();
      }
      if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    }
    makeNoise() {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }
    makeHallImpulse(seconds, decay) {
      const length = Math.floor(this.ctx.sampleRate * seconds);
      const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const envelope = (1 - i / length) ** decay;
          data[i] = (Math.random() * 2 - 1) * envelope * (channel ? 0.88 : 1);
        }
      }
      return impulse;
    }
    applyVolume() {
      if (!this.master || !this.ctx) return;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    setMusicActive(active) {
      this.musicOn = active;
      if (!this.music || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setTargetAtTime(active ? 0.4 : 0.0001, now, active ? 0.18 : 0.045);
    }
    claimVoices(music, count = 1) {
      const key = music ? "activeMusicVoices" : "activeFxVoices";
      const limit = music ? 24 : 16;
      if (this[key] + count > limit) return false;
      this[key] += count;
      return true;
    }
    releaseVoices(music, count = 1) {
      const key = music ? "activeMusicVoices" : "activeFxVoices";
      this[key] = Math.max(0, this[key] - count);
    }
    panNode(pan = 0) {
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = clamp(pan, -0.85, 0.85);
        return p;
      }
      return this.ctx.createGain();
    }
    tone(freq, duration, opts = {}) {
      if (!this.ctx || this.muted) return;
      const isMusic = !!opts.music;
      if (!this.claimVoices(isMusic)) return;
      const t = this.ctx.currentTime + (opts.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const pan = this.panNode(opts.pan || 0);
      const filter = this.ctx.createBiquadFilter();
      osc.type = opts.type || "sine";
      osc.frequency.setValueAtTime(freq, t);
      if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + duration);
      filter.type = "lowpass";
      filter.frequency.value = opts.cutoff || 8000;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(opts.gain || 0.1, t + (opts.attack || 0.012));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(isMusic ? this.music : this.fx);
      osc.onended = () => this.releaseVoices(isMusic);
      osc.start(t); osc.stop(t + duration + 0.03);
    }
    orchestraVoice(note, duration, kind, opts = {}) {
      if (!this.ctx || this.muted) return;
      const recipes = {
        strings: [["sawtooth", -7, 0.38], ["sawtooth", 7, 0.38], ["triangle", 0, 0.34]],
        violin: [["sawtooth", -3, 0.44], ["triangle", 3, 0.56]],
        woodwind: [["sine", 0, 0.72], ["triangle", 1200, 0.2], ["sine", 1900, 0.08]],
        brass: [["sawtooth", -4, 0.46], ["sawtooth", 4, 0.46], ["square", 0, 0.08]],
        bass: [["triangle", 0, 0.68], ["sawtooth", -5, 0.22], ["sine", -1200, 0.1]]
      };
      const recipe = recipes[kind] || recipes.strings;
      const hasVibrato = kind === "strings" || kind === "violin" || kind === "woodwind";
      const voiceCost = recipe.length + (hasVibrato ? 1 : 0);
      if (!this.claimVoices(true, voiceCost)) return;
      const t = this.ctx.currentTime + (opts.delay || 0);
      const end = t + duration;
      const base = midi(note);
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const pan = this.panNode(opts.pan || 0);
      const attack = opts.attack ?? (kind === "strings" ? 0.24 : kind === "violin" ? 0.035 : kind === "woodwind" ? 0.08 : 0.025);
      const level = opts.gain || 0.04;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(opts.cutoff || (kind === "brass" ? 1500 : kind === "bass" ? 650 : kind === "violin" ? 3200 : 2200), t);
      filter.Q.value = kind === "woodwind" ? 1.8 : 0.65;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + Math.min(attack, duration * 0.42));
      gain.gain.setValueAtTime(level * 0.88, Math.max(t + attack, end - Math.min(0.2, duration * 0.3)));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      const oscillators = [];
      for (const [type, detune, mix] of recipe) {
        const osc = this.ctx.createOscillator();
        const voiceGain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(base, t);
        osc.detune.value = detune;
        voiceGain.gain.value = mix;
        osc.connect(voiceGain); voiceGain.connect(filter);
        osc.onended = () => this.releaseVoices(true);
        osc.start(t); osc.stop(end + 0.04);
        oscillators.push(osc);
      }
      if (hasVibrato) {
        const vibrato = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        vibrato.frequency.value = kind === "strings" ? 5.1 : kind === "violin" ? 6.2 : 5.7;
        depth.gain.value = kind === "strings" ? 5 : kind === "violin" ? 11 : 9;
        vibrato.connect(depth);
        oscillators.forEach((osc) => depth.connect(osc.detune));
        vibrato.onended = () => this.releaseVoices(true);
        vibrato.start(t + Math.min(0.12, attack)); vibrato.stop(end + 0.02);
      }
      filter.connect(gain); gain.connect(pan); pan.connect(this.music);
    }
    hiss(duration, gainValue, cutoff = 1400, panValue = 0, music = false) {
      if (!this.ctx || this.muted || !this.noise) return;
      if (!this.claimVoices(music)) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      const pan = this.panNode(panValue);
      src.buffer = this.noise;
      filter.type = "bandpass"; filter.frequency.value = cutoff; filter.Q.value = 1.2;
      gain.gain.setValueAtTime(gainValue, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(music ? this.music : this.fx);
      src.onended = () => this.releaseVoices(music);
      src.start(); src.stop(t + duration + 0.02);
    }
    ui(kind = "tap") {
      if (!this.ctx || performance.now() - this.lastUi < 35) return;
      this.lastUi = performance.now();
      const f = kind === "back" ? 310 : kind === "danger" ? 155 : 520;
      this.tone(f, 0.08, { type: "triangle", gain: 0.055, slide: kind === "danger" ? 0.72 : 1.12 });
    }
    beat(index, movement) {
      if (!this.musicOn) return;
      const score = SCORE[movement];
      const beatDur = 60 / MOVEMENTS[movement].tempo;
      const beatInBar = index % 4;
      const bar = Math.floor(index / 4);
      const chordIndex = bar % score.roots.length;
      const root = score.roots[chordIndex];
      const chord = score.chords[chordIndex];

      // A warm sustained string bed keeps the hall alive between impacts.
      if (beatInBar === 0) {
        chord.forEach((interval, voice) => {
          this.orchestraVoice(root + 12 + interval, beatDur * 3.85, "strings", {
            gain: voice === 0 ? 0.028 : 0.021, cutoff: 1350 + movement * 260,
            attack: 0.32, pan: (voice - 1) * 0.34
          });
        });
        if (movement >= 2 && (movement < 4 || bar % 2 === 0)) {
          [0].forEach((interval, voice) => this.orchestraVoice(root + interval, beatDur * 1.15, "brass", {
            gain: 0.018, cutoff: 1250, pan: voice ? 0.24 : -0.18
          }));
        }
      }

      // Low strings mark the strong beats without filling every available audio slot.
      if (beatInBar === 0 || beatInBar === 2) {
        this.orchestraVoice(root - 12 + (beatInBar === 2 ? 7 : 0), beatDur * 0.82, "bass", {
          gain: beatInBar === 0 ? 0.065 : 0.043, cutoff: 560,
          attack: 0.025, pan: -0.12
        });
      }

      // Pizzicato eighth-notes provide continuous motion without becoming a metronome.
      const arp = [0, 7, 12, 7, 4, 7, 12, 7];
      const arpStart = (beatInBar * 2 + bar) % arp.length;
      const subdivisions = movement === 0 ? 2 : 3;
      for (let i = 0; i < subdivisions; i++) {
        const interval = arp[(arpStart + i) % arp.length];
        this.tone(midi(root + 12 + interval), beatDur * 0.34, {
          type: "triangle", gain: Math.min(0.033, 0.027 + movement * 0.002), cutoff: 2100,
          attack: 0.008, music: true, pan: i % 2 ? 0.3 : -0.3,
          delay: i * beatDur / subdivisions
        });
      }

      // A nimble solo violin carries a clear, cheerful tune above the catastrophe.
      const note = score.melody[(index + bar) % score.melody.length];
      this.orchestraVoice(root + note, beatDur * 0.62, "violin", {
        gain: Math.min(0.04, 0.032 + movement * 0.002), attack: 0.032,
        cutoff: 3400, pan: 0.18, delay: beatDur * 0.055
      });

      // A low timpani-like thump anchors the first beat without masking collisions.
      this.tone(beatInBar === 0 ? 76 : 102, beatInBar === 0 ? 0.16 : 0.07, {
        type: "sine", gain: beatInBar === 0 ? 0.075 : 0.021, slide: 0.52, music: true,
        cutoff: 480
      });
      if (beatInBar === 1 || beatInBar === 3) {
        this.hiss(0.045, 0.009 + movement * 0.003, 4300, 0.15, true);
      }
    }
    musician(type, perfect, pan) {
      const p = TYPES[type].pitch + (perfect ? 12 : 0);
      if (type === 0) {
        this.tone(midi(p), 0.42, { type: "sawtooth", gain: 0.08, cutoff: 2400, attack: 0.035, pan });
        this.tone(midi(p + 7), 0.32, { type: "triangle", gain: 0.04, pan, delay: 0.025 });
      } else if (type === 1) {
        this.tone(midi(p), 0.3, { type: "square", gain: 0.055, cutoff: 1600, pan });
        this.tone(midi(p + 4), 0.24, { type: "sawtooth", gain: 0.04, cutoff: 2200, pan, delay: 0.02 });
      } else if (type === 2) {
        this.tone(145, 0.18, { type: "sine", gain: 0.11, slide: 0.32, pan });
        this.hiss(0.13, 0.052, 1900, pan);
      } else if (type === 3) {
        this.tone(midi(p), 0.58, { type: "sawtooth", gain: 0.09, cutoff: 900, attack: 0.045, pan });
        this.tone(midi(p + 12), 0.4, { type: "triangle", gain: 0.035, pan });
      } else if (type === 4) {
        this.tone(midi(p), 0.46, { type: "sine", gain: 0.08, slide: 1.015, attack: 0.03, pan });
        this.hiss(0.18, 0.018, 6200, pan);
      } else {
        [0, 4, 7].forEach((n, i) => this.tone(midi(p + n), 0.65 - i * 0.08, { type: i === 0 ? "triangle" : "sine", gain: 0.066 - i * 0.013, pan, delay: i * 0.025 }));
        this.tone(70, 0.22, { type: "sine", gain: 0.075, slide: 0.55, pan });
      }
      if (perfect) this.tone(midi(p + 19), 0.55, { type: "sine", gain: 0.045, pan, delay: 0.06 });
    }
    miss(pan) {
      this.tone(170, 0.5, { type: "sawtooth", gain: 0.08, cutoff: 700, slide: 0.38, pan });
      this.hiss(0.35, 0.04, 460, pan);
    }
    fanfare(success = true) {
      const notes = success ? [60, 64, 67, 72, 76] : [52, 50, 47];
      notes.forEach((n, i) => this.tone(midi(n), success ? 0.65 : 0.5, { type: success ? "sawtooth" : "triangle", gain: 0.06, cutoff: 1800, delay: i * 0.13 }));
    }
  }

  const sound = new SoundHouse();
  const pointer = { x: 600, y: 660, down: false };
  const game = {
    mode: "title",
    returnScreen: "title-screen",
    movement: 0,
    elapsed: 0,
    score: 0,
    movementStartScore: 0,
    ovation: 3,
    combo: 0,
    bestCombo: 0,
    perfects: 0,
    musicians: [],
    particles: [],
    labels: [],
    spawnTimer: 0,
    shake: 0,
    flash: 0,
    lastTime: performance.now(),
    lastBeat: -1,
    lastSecond: -1,
    nextId: 1,
    baton: { ax: 350, ay: 1135, angle: -1.08, target: -1.08, length: 535, tipX: 602, tipY: 663, prevTipX: 602, prevTipY: 663, vx: 0, vy: 0 },
    progress: null,
    won: false,
    confirmNewUntil: 0,
    confirmRestartUntil: 0
  };

  function freshProgress() {
    return { version: 1, active: false, checkpoint: 0, score: 0, bestScore: 0, bestCombo: 0, completed: false, lastPlayed: 0 };
  }
  function loadProgress() {
    const p = safeParse(SAVE_KEY, freshProgress());
    if (p.version !== 1) return freshProgress();
    return {
      ...freshProgress(), ...p,
      checkpoint: clamp(Math.floor(Number(p.checkpoint) || 0), 0, MOVEMENTS.length - 1),
      score: Math.max(0, Math.floor(Number(p.score) || 0)),
      bestScore: Math.max(0, Math.floor(Number(p.bestScore) || 0)),
      bestCombo: Math.max(0, Math.floor(Number(p.bestCombo) || 0))
    };
  }
  function saveProgress(active = game.mode === "playing" || game.mode === "paused" || game.mode === "intro") {
    if (!game.progress) game.progress = freshProgress();
    game.progress.active = active;
    if (active) {
      game.progress.checkpoint = game.movement;
      game.progress.score = game.movementStartScore;
    }
    game.progress.bestScore = Math.max(game.progress.bestScore, game.score);
    game.progress.bestCombo = Math.max(game.progress.bestCombo, game.bestCombo);
    game.progress.lastPlayed = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.progress)); } catch (_) {}
  }

  function showScreen(id = null) {
    screens.forEach((el) => el.classList.toggle("active", el.id === id));
  }
  function setHud(on) { hud.classList.toggle("hidden", !on); }
  function updateTitleRecord() {
    const p = game.progress;
    $("#best-line").textContent = p.bestScore ? `House record: ${p.bestScore.toLocaleString()} · Cadenza ×${Math.max(1, p.bestCombo)}` : "House record: awaiting its first disaster";
  }
  function startFresh() {
    game.progress.active = false;
    game.progress.checkpoint = 0;
    game.progress.score = 0;
    game.score = 0;
    game.bestCombo = 0;
    game.perfects = 0;
    game.won = false;
    beginMovement(0);
  }
  function offerStart() {
    sound.ensure(); sound.ui();
    if (game.progress.active) {
      const m = MOVEMENTS[game.progress.checkpoint];
      $("#continue-summary").textContent = `Movement ${m.roman}: ${m.name}. The house has held your score of ${game.progress.score.toLocaleString()}.`;
      showScreen("continue-screen");
      game.mode = "menu";
    } else startFresh();
  }
  function continueRun() {
    sound.ui();
    game.score = game.progress.score;
    game.bestCombo = 0;
    game.perfects = 0;
    beginMovement(game.progress.checkpoint);
  }
  function beginMovement(index) {
    game.movement = index;
    game.elapsed = 0;
    game.ovation = 3;
    game.combo = 0;
    game.movementStartScore = game.score;
    game.musicians.length = 0;
    game.particles.length = 0;
    game.labels.length = 0;
    game.spawnTimer = 0.2;
    game.lastBeat = -1;
    game.lastSecond = -1;
    game.baton.angle = game.baton.target = -1.08;
    game.mode = "intro";
    setHud(true);
    updateHud();
    updateProgressHud(true);
    const m = MOVEMENTS[index];
    $("#movement-kicker").textContent = `MOVEMENT ${m.roman}`;
    $("#movement-title").textContent = m.name;
    $("#movement-brief").textContent = m.brief;
    showScreen("movement-screen");
    saveProgress(true);
    sound.setMusicActive(true);
    sound.fanfare(true);
    window.setTimeout(() => {
      if (game.mode !== "intro") return;
      game.mode = "playing";
      showScreen(null);
      spawnMusician(MOVEMENTS[index].feature ?? (index === 1 ? 1 : 0), true);
    }, sound.reducedMotion ? 850 : 2350);
  }
  function finishMovement() {
    if (game.movement < MOVEMENTS.length - 1) {
      game.score += 1200 * (game.movement + 1) + game.ovation * 300;
      game.movementStartScore = game.score;
      game.progress.checkpoint = game.movement + 1;
      game.progress.score = game.score;
      saveProgress(true);
      beginMovement(game.movement + 1);
    } else finishRun(true);
  }
  function finishRun(success) {
    game.mode = "results";
    sound.setMusicActive(false);
    game.musicians.length = 0;
    setHud(false);
    game.progress.bestScore = Math.max(game.progress.bestScore, game.score);
    game.progress.bestCombo = Math.max(game.progress.bestCombo, game.bestCombo);
    game.won = success;
    if (success) {
      game.progress.completed = true;
      game.progress.active = false;
    }
    saveProgress(!success);
    $("#results-kicker").textContent = success ? "A STANDING OVATION" : "THE CURTAIN FALLS";
    $("#results-title").textContent = success ? "Calamity, conducted beautifully." : "A dignified catastrophe.";
    $("#result-score").textContent = game.score.toLocaleString();
    $("#result-combo").textContent = `×${Math.max(1, game.bestCombo)}`;
    $("#result-perfect").textContent = game.perfects;
    const rank = game.score > 76000 ? "S" : game.score > 56000 ? "A" : game.score > 36000 ? "B" : game.score > 18000 ? "C" : "D";
    $("#result-rank").textContent = rank;
    $("#result-copy").textContent = success
      ? "Bruised instruments. Unbroken tempo. The audience assumes every impact was in the score."
      : `Movement ${MOVEMENTS[game.movement].roman} remains unconducted. Your checkpoint is safe.`;
    $("#retry-button").textContent = success ? "PLAY THE ENCORE" : "RESTART MOVEMENT";
    showScreen("results-screen");
    sound.fanfare(success);
    updateTitleRecord();
  }
  function returnTitle() {
    sound.ui("back");
    sound.setMusicActive(false);
    if (game.mode === "playing" || game.mode === "paused" || game.mode === "intro") saveProgress(true);
    game.mode = "title";
    setHud(false);
    showScreen("title-screen");
    updateTitleRecord();
  }
  function pause() {
    if (game.mode !== "playing") return;
    game.mode = "paused";
    sound.setMusicActive(false);
    saveProgress(true);
    showScreen("pause-screen");
    sound.ui();
  }
  function resume() {
    if (game.mode !== "paused") return;
    game.mode = "playing";
    sound.setMusicActive(true);
    game.lastBeat = -1;
    game.lastTime = performance.now();
    showScreen(null);
    sound.ensure(); sound.ui();
  }

  function spawnMusician(forceType = null, gentle = false) {
    const movement = game.movement;
    let maxType = movement === 0 ? 1 : movement === 1 ? 4 : 5;
    let type = forceType === null ? Math.floor(rand(0, maxType + 0.999)) : forceType;
    if (movement < 2 && type === 5) type = 4;
    const data = TYPES[type];
    const isPiano = type === 5;
    game.musicians.push({
      id: game.nextId++, type,
      x: rand(135, 585), y: gentle ? rand(90, 160) : -data.r - rand(5, 110),
      vx: rand(-90, 95) + (isPiano ? -20 : 0), vy: gentle ? rand(45, 110) : rand(70, 160),
      r: data.r, rot: rand(-0.35, 0.35), vr: rand(-1.6, 1.6),
      cooldown: 0, glow: 0, hits: 0, born: game.elapsed
    });
  }

  function updateBaton(dt) {
    const b = game.baton;
    const dx = pointer.x - b.ax;
    const dy = pointer.y - b.ay;
    let target = Math.atan2(dy, dx);
    target = clamp(target, -2.88, -0.25);
    b.target = pointer.down ? target : lerp(b.target, -1.08, Math.min(1, dt * 1.6));
    let diff = ((b.target - b.angle + Math.PI * 3) % TAU) - Math.PI;
    b.angle += diff * Math.min(1, dt * 14);
    b.prevTipX = b.tipX; b.prevTipY = b.tipY;
    b.tipX = b.ax + Math.cos(b.angle) * b.length;
    b.tipY = b.ay + Math.sin(b.angle) * b.length;
    b.vx = (b.tipX - b.prevTipX) / Math.max(dt, 1 / 120);
    b.vy = (b.tipY - b.prevTipY) / Math.max(dt, 1 / 120);
  }

  function closestOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0, 1);
    return { x: ax + abx * t, y: ay + aby * t, t };
  }
  function beatWindow() {
    const m = MOVEMENTS[game.movement];
    const beat = 60 / m.tempo;
    const phase = (game.elapsed % beat) / beat;
    return Math.min(phase, 1 - phase);
  }
  function hitMusician(o, contact) {
    const b = game.baton;
    const segX = b.vx * contact.t, segY = b.vy * contact.t;
    const sx = b.tipX - b.ax, sy = b.tipY - b.ay;
    let nx = sy / b.length, ny = -sx / b.length;
    if (ny > 0) { nx *= -1; ny *= -1; }
    const sweep = Math.hypot(segX, segY);
    const speed = clamp(520 + sweep * 0.18 + Math.max(0, -segY) * 0.22, 520, o.type === 5 ? 760 : 930);
    o.vx = nx * speed + segX * 0.16 + (contact.t - 0.5) * 100;
    o.vy = Math.min(-300, ny * speed + segY * 0.09);
    o.rot += clamp((segX - o.vx) * 0.0025, -2.2, 2.2);
    o.cooldown = 0.16;
    o.glow = 1;
    o.hits++;
    const perfect = beatWindow() < 0.135;
    game.combo++;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    if (perfect) game.perfects++;
    const comboMult = 1 + Math.min(4, Math.floor(game.combo / 5));
    game.score += (perfect ? 240 : 100) * comboMult + Math.floor(sweep * 0.025);
    game.flash = perfect ? 0.32 : 0.1;
    game.shake = sound.reducedMotion ? 0 : Math.min(8, 2 + sweep * 0.0015);
    sound.musician(o.type, perfect, o.x / W * 2 - 1);
    addLabel(o.x, o.y - o.r, perfect ? "PERFECT BEAT!" : game.combo > 1 ? `CADENZA ×${comboMult}` : TYPES[o.type].name.toUpperCase(), perfect ? "#ffe8a3" : TYPES[o.type].color);
    burst(o.x, o.y, TYPES[o.type].color, perfect ? 18 : 10, perfect ? 240 : 150);
    if (game.movement >= 2 && o.type === 5) {
      ensembleShockwave(o, 280, 270, "#ffe4a0");
      addLabel(o.x, o.y - o.r - 22, "PIANO WAVE!", "#ffe4a0");
    }
    if (game.movement === 3 && o.type === 2) {
      ensembleShockwave(o, 235, 330, "#ff7f68");
      addLabel(o.x, o.y - o.r - 22, "DRUM RESCUE!", "#ffb08b");
    }
    if (game.movement === 4 && perfect) {
      ensembleShockwave(o, 360, 190, "#fff4bd");
      addLabel(o.x, o.y - o.r - 22, "GRAND RESONANCE!", "#fff4bd");
    }
    updateHud();
  }
  function ensembleShockwave(source, radius, strength, color) {
    for (const o of game.musicians) {
      if (o === source) continue;
      const dx = o.x - source.x, dy = o.y - source.y;
      const d = Math.hypot(dx, dy);
      if (d < radius && d > 1) {
        const force = (1 - d / radius) * strength;
        o.vx += dx / d * force;
        o.vy += Math.min(-120, dy / d * force - 130);
        o.glow = Math.max(o.glow, 0.45);
      }
    }
    game.particles.push({ ring: true, x: source.x, y: source.y, life: 0.7, max: 0.7, radius: 20, color });
  }
  function missMusician(o) {
    game.ovation--;
    game.combo = 0;
    sound.miss(o.x / W * 2 - 1);
    addLabel(clamp(o.x, 120, W - 120), H - 80, `${TYPES[o.type].name.toUpperCase()} DOWN!`, "#ff8690");
    burst(o.x, H - 30, "#a32332", 18, 190);
    game.shake = sound.reducedMotion ? 0 : 10;
    updateHud();
    saveProgress(true);
    if (game.ovation <= 0) finishRun(false);
  }

  function burst(x, y, color, count, speed) {
    const room = Math.max(0, 120 - game.particles.length);
    for (let i = 0; i < Math.min(count, room); i++) {
      const a = rand(0, TAU), s = rand(speed * 0.25, speed);
      game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.85), max: 0.85, size: rand(2, 6), color, note: Math.random() < 0.22 });
    }
  }
  function addLabel(x, y, text, color) {
    game.labels.push({ x, y, text, color, life: 1, max: 1 });
    if (game.labels.length > 12) game.labels.shift();
  }
  function updateParticles(dt) {
    for (const p of game.particles) {
      p.life -= dt;
      if (p.ring) p.radius += 330 * dt;
      else { p.vy += 250 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    game.particles = game.particles.filter((p) => p.life > 0);
    for (const l of game.labels) { l.life -= dt; l.y -= 42 * dt; }
    game.labels = game.labels.filter((l) => l.life > 0);
  }
  function updateHud() {
    $("#hud-movement").textContent = MOVEMENTS[game.movement].hud;
    $("#hud-score").textContent = String(Math.floor(game.score)).padStart(6, "0");
    [...$("#ovation-pips").children].forEach((p, i) => p.classList.toggle("lost", i >= game.ovation));
    const mult = 1 + Math.min(4, Math.floor(game.combo / 5));
    comboEl.querySelector("b").textContent = mult;
    comboEl.classList.toggle("show", game.combo >= 2);
  }
  function updateProgressHud(force = false) {
    const m = MOVEMENTS[game.movement];
    const remaining = Math.max(0, Math.ceil(m.duration - game.elapsed));
    if (!force && remaining === game.lastSecond) return;
    game.lastSecond = remaining;
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, "0");
    const finalMovement = game.movement === MOVEMENTS.length - 1;
    $("#progress-stage").textContent = `MOVEMENT ${game.movement + 1} OF ${MOVEMENTS.length}`;
    $("#progress-next").textContent = finalMovement
      ? `FINAL CURTAIN · ${minutes}:${seconds}`
      : `NEXT: MOVEMENT ${MOVEMENTS[game.movement + 1].roman} · ${minutes}:${seconds}`;
    $("#progress-fill").style.width = `${clamp(game.elapsed / m.duration, 0, 1) * 100}%`;
  }

  function update(dt) {
    updateBaton(dt);
    updateParticles(dt);
    game.flash = Math.max(0, game.flash - dt * 2.2);
    game.shake = Math.max(0, game.shake - dt * 24);
    if (game.mode !== "playing") return;
    game.elapsed += dt;
    const m = MOVEMENTS[game.movement];
    updateProgressHud();
    const beatDur = 60 / m.tempo;
    const beatIndex = Math.floor(game.elapsed / beatDur);
    if (beatIndex !== game.lastBeat) {
      game.lastBeat = beatIndex;
      sound.beat(beatIndex, game.movement);
    }
    game.spawnTimer -= dt;
    const activeCap = game.movement === 0 && game.elapsed < 10 ? 1 : m.cap;
    if (game.spawnTimer <= 0 && game.musicians.length < activeCap) {
      const featureMissing = m.feature !== undefined && !game.musicians.some((o) => o.type === m.feature);
      spawnMusician(featureMissing && Math.random() < 0.72 ? m.feature : null);
      game.spawnTimer = rand(m.spawn[0], m.spawn[1]);
    }
    const b = game.baton;
    for (let i = game.musicians.length - 1; i >= 0; i--) {
      const o = game.musicians[i];
      o.cooldown -= dt; o.glow = Math.max(0, o.glow - dt * 2.4);
      o.vy += m.gravity * dt;
      o.vx *= Math.pow(0.997, dt * 60);
      o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
      if (o.x < o.r + 20 && o.vx < 0) { o.x = o.r + 20; o.vx *= -0.72; }
      if (o.x > W - o.r - 20 && o.vx > 0) { o.x = W - o.r - 20; o.vx *= -0.72; }
      if (o.y < -o.r * 2.2 && o.vy < 0) o.y = -o.r * 2.2;
      if (o.cooldown <= 0 && o.y > 40) {
        const c = closestOnSegment(o.x, o.y, b.ax, b.ay, b.tipX, b.tipY);
        const dx = o.x - c.x, dy = o.y - c.y;
        if (dx * dx + dy * dy < (o.r + 13) ** 2 && o.vy - b.vy * c.t > -80) hitMusician(o, c);
      }
      if (o.y - o.r > H + 35) {
        game.musicians.splice(i, 1);
        missMusician(o);
        if (game.mode !== "playing") break;
      }
    }
    if (game.mode === "playing" && game.elapsed >= m.duration) finishMovement();
  }

  function drawBackground() {
    if (images.bg.complete && images.bg.naturalWidth) {
      const scale = Math.max(W / images.bg.naturalWidth, H / images.bg.naturalHeight);
      const sw = W / scale, sh = H / scale;
      const sx = (images.bg.naturalWidth - sw) / 2, sy = (images.bg.naturalHeight - sh) / 2;
      ctx.drawImage(images.bg, sx, sy, sw, sh, 0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#641825"); g.addColorStop(1, "#090407"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const vignette = ctx.createRadialGradient(W * 0.52, H * 0.46, 80, W * 0.52, H * 0.46, 700);
    vignette.addColorStop(0, "rgba(10,4,7,.03)"); vignette.addColorStop(1, "rgba(5,2,4,.72)");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  }
  function drawConductor() {
    if (!images.conductor.complete || !images.conductor.naturalWidth) return;
    ctx.save();
    ctx.globalAlpha = game.mode === "playing" || game.mode === "intro" || game.mode === "paused" ? 0.88 : 0.28;
    ctx.shadowColor = "#000"; ctx.shadowBlur = 26;
    ctx.drawImage(images.conductor, 18, 958, 310, 316);
    ctx.restore();
  }
  function drawBeatPulse() {
    if (game.mode !== "playing") return;
    const beat = 60 / MOVEMENTS[game.movement].tempo;
    const phase = (game.elapsed % beat) / beat;
    const r = 18 + phase * 42;
    ctx.save();
    ctx.globalAlpha = (1 - phase) * 0.55;
    ctx.strokeStyle = "#ffd877"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(game.baton.ax, game.baton.ay, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function drawBaton() {
    const b = game.baton;
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = beatWindow() < 0.135 && game.mode === "playing" ? "#fff1a6" : "#e9ae52";
    ctx.shadowBlur = beatWindow() < 0.135 ? 28 : 15;
    const grad = ctx.createLinearGradient(b.ax, b.ay, b.tipX, b.tipY);
    grad.addColorStop(0, "#8a4b25"); grad.addColorStop(0.12, "#e2ad5c"); grad.addColorStop(0.18, "#fff8d4"); grad.addColorStop(1, "#fffdf1");
    ctx.strokeStyle = grad; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(b.tipX, b.tipY); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.ax + 18 * Math.cos(b.angle), b.ay + 18 * Math.sin(b.angle)); ctx.lineTo(b.tipX, b.tipY); ctx.stroke();
    ctx.fillStyle = "#f3ca75"; ctx.beginPath(); ctx.arc(b.ax, b.ay, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff8d1"; ctx.beginPath(); ctx.arc(b.tipX, b.tipY, 9, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawMusician(o) {
    const type = TYPES[o.type];
    const pulse = 1 + o.glow * 0.12;
    const r = o.r * pulse;
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rot * 0.12);
    ctx.shadowColor = o.glow > 0 ? "#fff0a3" : "#000"; ctx.shadowBlur = o.glow > 0 ? 30 : 16;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    if (images.atlas.complete && images.atlas.naturalWidth) {
      const col = type.cell % 3, row = Math.floor(type.cell / 3);
      const cw = images.atlas.naturalWidth / 3, ch = images.atlas.naturalHeight / 2;
      ctx.drawImage(images.atlas, col * cw, row * ch, cw, ch, -r, -r, r * 2, r * 2);
    } else { ctx.fillStyle = type.color; ctx.fillRect(-r, -r, r * 2, r * 2); }
    ctx.restore();
    ctx.save(); ctx.translate(o.x, o.y);
    ctx.strokeStyle = o.glow > 0 ? "#fff6c8" : type.color; ctx.lineWidth = o.glow > 0 ? 6 : 4;
    ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(17,7,10,.86)"; ctx.strokeStyle = "#e8ba61"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(-31, r - 10, 62, 18, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffe6ae"; ctx.font = "700 10px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(type.name.toUpperCase(), 0, r - 1);
    ctx.restore();
  }
  function drawParticles() {
    for (const p of game.particles) {
      ctx.save(); ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.strokeStyle = p.color; ctx.fillStyle = p.color;
      if (p.ring) { ctx.lineWidth = 5 * p.life / p.max; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, TAU); ctx.stroke(); }
      else if (p.note) { ctx.font = `${Math.max(12, p.size * 4)}px Georgia`; ctx.fillText("♪", p.x, p.y); }
      else { ctx.translate(p.x, p.y); ctx.rotate(p.x); ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); }
      ctx.restore();
    }
    for (const l of game.labels) {
      ctx.save(); ctx.globalAlpha = clamp(l.life / l.max, 0, 1); ctx.fillStyle = l.color; ctx.strokeStyle = "#240910"; ctx.lineWidth = 6;
      ctx.font = "900 18px Arial"; ctx.textAlign = "center"; ctx.strokeText(l.text, l.x, l.y); ctx.fillText(l.text, l.x, l.y); ctx.restore();
    }
  }
  function drawProgress() {
    if (game.mode !== "playing" && game.mode !== "intro" && game.mode !== "paused") return;
    const m = MOVEMENTS[game.movement];
    const p = clamp(game.elapsed / m.duration, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(15,5,9,.74)"; ctx.fillRect(90, H - 25, 540, 9);
    const g = ctx.createLinearGradient(90, 0, 630, 0); g.addColorStop(0, "#ab2936"); g.addColorStop(1, "#ffe08a");
    ctx.fillStyle = g; ctx.fillRect(90, H - 25, 540 * p, 9);
    for (let i = 0; i <= 4; i++) { ctx.fillStyle = i / 4 <= p ? "#ffe2a0" : "#53232a"; ctx.beginPath(); ctx.arc(90 + 540 * i / 4, H - 20.5, 5, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function render() {
    ctx.save();
    if (game.shake > 0) ctx.translate(rand(-game.shake, game.shake), rand(-game.shake, game.shake));
    drawBackground();
    if (game.mode !== "title") {
      drawBeatPulse();
      drawConductor();
      for (const o of game.musicians) drawMusician(o);
      drawBaton();
      drawParticles();
      drawProgress();
    }
    ctx.restore();
    if (game.flash > 0) { ctx.fillStyle = `rgba(255,233,158,${game.flash})`; ctx.fillRect(0, 0, W, H); }
  }
  function frame(now) {
    const dt = clamp((now - game.lastTime) / 1000, 0, 0.033);
    game.lastTime = now;
    update(dt); render();
    requestAnimationFrame(frame);
  }

  function pointerCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (game.mode !== "playing") return;
    const p = pointerCoords(e); pointer.x = p.x; pointer.y = p.y; pointer.down = true;
    canvas.setPointerCapture?.(e.pointerId); sound.ensure();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.down) return;
    const p = pointerCoords(e); pointer.x = p.x; pointer.y = p.y;
  });
  const endPointer = () => { pointer.down = false; };
  canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key.toLowerCase() === "p") game.mode === "playing" ? pause() : game.mode === "paused" && resume();
    if (game.mode !== "playing") return;
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") { pointer.down = true; pointer.x = 90; pointer.y = 700; }
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") { pointer.down = true; pointer.x = 630; pointer.y = 700; }
  });
  window.addEventListener("keyup", (e) => { if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D"].includes(e.key)) pointer.down = false; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (game.mode === "playing") pause(); saveProgress(); } });
  window.addEventListener("blur", () => { if (game.mode === "playing") pause(); });
  window.addEventListener("pagehide", () => saveProgress());

  $("#start-button").addEventListener("click", offerStart);
  $("#how-button").addEventListener("click", () => { sound.ensure(); sound.ui(); game.mode = "menu"; showScreen("how-screen"); });
  $("#how-back").addEventListener("click", returnTitle);
  $("#how-play").addEventListener("click", () => { sound.ensure(); sound.ui(); startFresh(); });
  $("#continue-button").addEventListener("click", continueRun);
  $("#new-button").addEventListener("click", (e) => {
    const now = performance.now();
    if (now > game.confirmNewUntil) {
      game.confirmNewUntil = now + 3000; e.currentTarget.textContent = "PRESS AGAIN TO ERASE CONCERT"; sound.ui("danger"); return;
    }
    e.currentTarget.textContent = "START THIS CONCERT OVER"; sound.ui("danger"); startFresh();
  });
  $("#pause-button").addEventListener("click", pause);
  $("#resume-button").addEventListener("click", resume);
  $("#restart-button").addEventListener("click", (e) => {
    const now = performance.now();
    if (now > game.confirmRestartUntil) {
      game.confirmRestartUntil = now + 2500; e.currentTarget.textContent = "PRESS AGAIN TO RESTART"; sound.ui("danger"); return;
    }
    e.currentTarget.textContent = "RESTART MOVEMENT"; game.score = game.movementStartScore; beginMovement(game.movement);
  });
  $("#quit-button").addEventListener("click", returnTitle);
  $("#retry-button").addEventListener("click", () => {
    sound.ui();
    if (game.won) startFresh();
    else { game.score = game.movementStartScore; beginMovement(game.movement); }
  });
  $("#result-title-button").addEventListener("click", returnTitle);

  function openSettings(from) {
    sound.ensure(); sound.ui(); game.returnScreen = from; showScreen("settings-screen");
  }
  $("#title-settings").addEventListener("click", () => openSettings("title-screen"));
  $("#pause-settings").addEventListener("click", () => openSettings("pause-screen"));
  $("#settings-close").addEventListener("click", () => { sound.ui(); showScreen(game.returnScreen); });
  $("#volume").value = sound.volume;
  $("#mute").checked = sound.muted;
  $("#reduced-motion").checked = sound.reducedMotion;
  $("#volume").addEventListener("input", (e) => { sound.volume = Number(e.target.value); sound.applyVolume(); sound.savePrefs(); });
  $("#mute").addEventListener("change", (e) => { sound.muted = e.target.checked; sound.applyVolume(); sound.savePrefs(); if (!sound.muted) sound.ui(); });
  $("#reduced-motion").addEventListener("change", (e) => { sound.reducedMotion = e.target.checked; sound.savePrefs(); });

  game.progress = loadProgress();
  updateTitleRecord();
  updateHud();
  render();
  requestAnimationFrame(frame);
})();
