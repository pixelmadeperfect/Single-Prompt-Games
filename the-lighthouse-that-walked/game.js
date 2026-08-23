const W = 960;
const H = 540;
const SEA_HORIZON = 235;
const SAVE_KEY = "lighthouse-walked-progress-v1";
const PREF_KEY = "lighthouse-walked-preferences-v1";
const SAVE_VERSION = 1;
const PREF_VERSION = 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const random = (min, max) => min + Math.random() * (max - min);

const ACTS = [
  {
    roman: "ACT I",
    name: "FIRST LIGHT",
    speaker: "MARA · HARBOR KEEPER",
    character: "mara",
    side: "left",
    intro: "“The storm erased every safe route home, and the fishing fleet is drifting toward the reefs. Keeper, hold each ship in your light until its crew can follow a safe course.”",
    button: "LIGHT THE WAY",
    objective: "Steer four boats safely through the reefs",
  },
  {
    roman: "ACT II",
    name: "THE LIVING FOG",
    speaker: "CAPTAIN ORIN · THROUGH THE RADIO",
    character: "orin",
    side: "right",
    intro: "“The living fog swallowed the returning fleet before they reached harbor. Approach from the harbor side, reveal the boats inside, and keep their paths from closing again.”",
    button: "STEP INTO THE FOG",
    objective: "Clear the fog and find four lost boats",
  },
  {
    roman: "ACT III",
    name: "THE GREAT STORM",
    speaker: "MARA · HARBOR KEEPER",
    character: "mara",
    side: "left",
    intro: "“The great ship carries the last families still at sea, but your light cannot cross this storm alone. Wake the old beacons, then relay their signal to the ship—one link at a time.”",
    button: "FACE THE STORM",
    objective: "Awaken three beacons",
  },
];

class SafeStorage {
  static read(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  static write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage is optional; the game remains playable without it.
    }
  }
}

class Soundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.ambienceBus = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.oceanGain = null;
    this.windGain = null;
    this.beamGain = null;
    this.volume = 1;
    this.muted = false;
    this.musicClock = 0;
    this.beatIndex = 0;
    this.lastAct = -1;
  }

  init() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.ambienceBus = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.sfxBus = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * 0.58;
      this.ambienceBus.gain.value = 0.72;
      this.musicBus.gain.value = 0.88;
      this.sfxBus.gain.value = 1;
      this.ambienceBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.context.destination);
      this.startContinuousLayers();
    } catch {
      this.context = null;
      this.master = null;
    }
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.58, this.context.currentTime, 0.025);
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.setVolume(this.volume);
  }

  tone(frequency, duration = 0.12, options = {}) {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const attack = Math.min(options.attack ?? 0.015, duration * 0.4);
    const release = Math.min(options.release ?? duration, duration - attack);
    const peak = options.gain || 0.18;
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    if (options.release) gain.gain.setValueAtTime(peak * 0.86, now + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    if (options.filterFrequency) {
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.filterFrequency;
      filter.Q.value = 0.7;
      oscillator.connect(filter);
      filter.connect(gain);
    } else {
      oscillator.connect(gain);
    }
    gain.connect(options.bus === "music" ? this.musicBus : this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  noise(duration = 0.2, gainAmount = 0.08) {
    if (!this.context || !this.sfxBus || this.muted) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 640;
    gain.gain.value = gainAmount;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    source.start();
  }

  makeNoiseBuffer(seconds = 2) {
    const length = Math.max(1, Math.floor(this.context.sampleRate * seconds));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < length; index += 1) {
      brown = brown * 0.965 + (Math.random() * 2 - 1) * 0.035;
      data[index] = brown * 3.2;
    }
    return buffer;
  }

  startContinuousLayers() {
    const oceanSource = this.context.createBufferSource();
    const oceanFilter = this.context.createBiquadFilter();
    this.oceanGain = this.context.createGain();
    oceanSource.buffer = this.makeNoiseBuffer(2.5);
    oceanSource.loop = true;
    oceanFilter.type = "lowpass";
    oceanFilter.frequency.value = 520;
    oceanFilter.Q.value = 0.45;
    this.oceanGain.gain.value = 0.07;
    oceanSource.connect(oceanFilter);
    oceanFilter.connect(this.oceanGain);
    this.oceanGain.connect(this.ambienceBus);
    oceanSource.start();

    const windSource = this.context.createBufferSource();
    const windFilter = this.context.createBiquadFilter();
    this.windGain = this.context.createGain();
    windSource.buffer = this.makeNoiseBuffer(2.1);
    windSource.loop = true;
    windFilter.type = "bandpass";
    windFilter.frequency.value = 780;
    windFilter.Q.value = 0.65;
    this.windGain.gain.value = 0.012;
    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.ambienceBus);
    windSource.start();

    const beamOscillator = this.context.createOscillator();
    const beamOvertone = this.context.createOscillator();
    this.beamGain = this.context.createGain();
    const overtoneGain = this.context.createGain();
    beamOscillator.type = "sine";
    beamOscillator.frequency.value = 86;
    beamOvertone.type = "triangle";
    beamOvertone.frequency.value = 172;
    this.beamGain.gain.value = 0.0001;
    overtoneGain.gain.value = 0.22;
    beamOscillator.connect(this.beamGain);
    beamOvertone.connect(overtoneGain);
    overtoneGain.connect(this.beamGain);
    this.beamGain.connect(this.ambienceBus);
    beamOscillator.start();
    beamOvertone.start();
  }

  setBeamActive(active) {
    if (!this.context || !this.beamGain) return;
    this.beamGain.gain.setTargetAtTime(active && !this.muted ? 0.055 : 0.0001, this.context.currentTime, active ? 0.06 : 0.14);
  }

  ui() { this.tone(440, 0.08, { type: "triangle", gain: 0.09, slide: 620 }); }
  step() {
    this.tone(random(82, 102), 0.09, { type: "sine", gain: 0.055, slide: 62 });
    this.noise(0.06, 0.025);
  }
  guidePing(amount) {
    this.tone(470 + amount * 360, 0.075, { type: "sine", gain: 0.055, slide: 520 + amount * 400 });
  }
  horn(large = false) {
    if (large) {
      const root = random(74, 79);
      this.tone(root, 2.25, { type: "sawtooth", gain: 0.15, slide: root * 0.91, attack: 0.12, release: 0.42, filterFrequency: 430 });
      this.tone(root * 1.5, 2.05, { type: "triangle", gain: 0.09, slide: root * 1.39, attack: 0.1, release: 0.38 });
      this.tone(root * 2, 1.85, { type: "sine", gain: 0.055, slide: root * 1.82, attack: 0.1, release: 0.34 });
      return;
    }
    const root = random(132, 142);
    this.tone(root, 1.35, { type: "sawtooth", gain: 0.105, slide: root * 0.93, attack: 0.075, release: 0.3, filterFrequency: 620 });
    this.tone(root * 1.5, 1.25, { type: "triangle", gain: 0.07, slide: root * 1.42, attack: 0.065, release: 0.26 });
    this.tone(root * 2, 1.08, { type: "sine", gain: 0.045, slide: root * 1.88, attack: 0.06, release: 0.24 });
  }
  scrape() {
    this.noise(0.38, 0.14);
    this.tone(118, 0.32, { type: "sawtooth", gain: 0.07, slide: 68 });
  }
  sparkle() {
    this.tone(660, 0.16, { type: "sine", gain: 0.12, slide: 920 });
    setTimeout(() => this.tone(990, 0.2, { type: "triangle", gain: 0.08 }), 65);
  }
  rescue() {
    [392, 523.25, 659.25].forEach((note, index) => {
      setTimeout(() => this.tone(note, 0.35, { type: "triangle", gain: 0.13 }), index * 80);
    });
  }
  thunder() {
    this.noise(0.55, 0.2);
    this.tone(54, 0.65, { type: "sine", gain: 0.16, slide: 32 });
  }
  lightning() {
    this.noise(0.07, 0.13);
    this.tone(1100, 0.08, { type: "sawtooth", gain: 0.045, slide: 280 });
    setTimeout(() => this.thunder(), 170);
  }
  dawn() {
    [392, 493.88, 587.33, 783.99].forEach((note, index) => {
      setTimeout(() => this.tone(note, 0.7, { type: "sine", gain: 0.09, bus: "music" }), index * 135);
    });
  }

  update(dt, act, state, intensity = 0) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const playing = state === "playing";
    if (this.oceanGain) this.oceanGain.gain.setTargetAtTime(playing ? 0.07 + act * 0.012 : 0.025, now, 0.5);
    if (this.windGain) this.windGain.gain.setTargetAtTime(playing ? 0.01 + act * 0.018 + intensity * 0.012 : 0.004, now, 0.5);
    if (!playing || this.muted) {
      this.setBeamActive(false);
      return;
    }
    if (act !== this.lastAct) {
      this.lastAct = act;
      this.beatIndex = 0;
      this.musicClock = 0;
    }
    this.musicClock -= dt;
    if (this.musicClock > 0) return;
    const themes = [
      [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23],
      [220, 261.63, 329.63, 293.66, 196, 246.94, 293.66, 261.63],
      [196, 246.94, 293.66, 246.94, 174.61, 220, 261.63, 220],
    ];
    const chords = [
      [[130.81, 164.81, 196], [146.83, 174.61, 220]],
      [[110, 130.81, 164.81], [98, 123.47, 146.83]],
      [[98, 123.47, 146.83], [87.31, 110, 130.81]],
    ];
    const beatLength = act === 0 ? 0.36 : act === 1 ? 0.46 : 0.32;
    const theme = themes[act] || themes[0];
    const note = theme[this.beatIndex % theme.length];
    this.tone(note, beatLength * 1.5, { type: act === 1 ? "sine" : "triangle", gain: 0.032 + intensity * 0.014, bus: "music" });
    if (this.beatIndex % 2 === 0) {
      this.tone(note / 2, beatLength * 1.8, { type: "sine", gain: 0.035 + intensity * 0.012, bus: "music" });
      if (act !== 1 || intensity > 0.45) this.tone(62 + act * 7, 0.09, { type: "sine", gain: 0.035, slide: 42, bus: "music" });
    }
    if (this.beatIndex % 8 === 0) {
      const chord = chords[act][Math.floor(this.beatIndex / 8) % 2];
      chord.forEach((frequency) => this.tone(frequency, beatLength * 7.5, { type: "sine", gain: 0.018, bus: "music" }));
    }
    if ((this.beatIndex + 1) % 4 === 0 && (act === 2 || intensity > 0.5)) this.noise(0.075, 0.025 + intensity * 0.025);
    this.beatIndex += 1;
    this.musicClock = beatLength;
  }
}

class LighthouseGame {
  constructor() {
    this.canvas = document.querySelector("#game");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = true;
    this.sound = new Soundscape();
    this.state = "title";
    this.previousState = "title";
    this.act = 0;
    this.progress = this.freshProgress();
    this.totalTime = 0;
    this.actTime = 0;
    this.lastTime = performance.now();
    this.saveCooldown = 0;
    this.toastTimer = 0;
    this.chapterTransition = false;
    this.completed = false;
    this.orientationPaused = false;
    this.gentleMotion = false;
    this.cameraShake = 0;
    this.flash = 0;
    this.lightning = 0;
    this.lightningX = 720;
    this.lightningClock = 4;
    this.waveClock = 9;
    this.spawnClock = 1;
    this.storyClock = 0;
    this.tutorialStep = 0;
    this.act1Spawned = 0;
    this.act2Spawned = 0;
    this.conclusionClock = 0;
    this.conclusionPhase = 0;
    this.input = { left: false, right: false, moveAxis: 0, pointerAim: false };
    this.lighthouse = this.createLighthouse();
    this.boats = [];
    this.fogs = [];
    this.reefs = [];
    this.beacons = [];
    this.waves = [];
    this.rain = [];
    this.particles = [];
    this.stars = this.createStars();
    this.clouds = this.createClouds();
    this.dom = this.collectDom();
    this.loadPreferences();
    this.syncViewport();
    this.bindEvents();
    this.prepareTitleWorld();
    this.checkSavedJourney();
    requestAnimationFrame((time) => this.frame(time));
  }

  collectDom() {
    const ids = [
      "hud", "actNumber", "actName", "objectiveText", "objectiveProgress", "muteButton", "pauseButton",
      "touchControls", "movementControl", "movementStick", "beamControl", "beamStick", "titleOverlay", "startButton",
      "titleSettingsButton", "saveOverlay", "saveSummary", "continueButton", "startOverButton", "confirmOverlay",
      "confirmResetButton", "cancelResetButton", "chapterOverlay", "chapterAct", "chapterTitle", "chapterButton",
      "actDialogue", "dialoguePortrait", "dialogueSpeaker", "dialogueText", "dialogueButton",
      "pauseOverlay", "resumeButton", "volumeSlider", "volumeOutput", "motionToggle",
      "restartActButton", "quitButton", "completeOverlay", "boatsStat", "lightsStat", "timeStat", "replayButton",
      "titleButton", "settingsDrawer", "titleVolumeSlider", "titleVolumeOutput", "titleMotionToggle",
      "closeSettingsButton", "rotateOverlay", "toast",
    ];
    return Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
  }

  freshProgress() {
    return {
      rescued: [0, 0, 0],
      fogCleared: 0,
      beaconsLit: 0,
      stormWaves: 0,
      shipGuidance: 0,
      missed: 0,
      totalRescued: 0,
    };
  }

  createLighthouse() {
    return {
      x: 250,
      y: 430,
      vx: 0,
      aim: -0.52,
      targetAim: -0.52,
      stepClock: 0,
      walkPhase: 0,
      glow: 0,
      stability: 1,
    };
  }

  createStars() {
    return Array.from({ length: 70 }, (_, index) => ({
      x: random(0, W),
      y: random(20, 255),
      size: random(0.5, 2),
      phase: random(0, Math.PI * 2),
      close: index < 9,
    }));
  }

  createClouds() {
    return Array.from({ length: 9 }, () => ({
      x: random(-100, W),
      y: random(55, 215),
      speed: random(2, 7),
      scale: random(0.55, 1.25),
      alpha: random(0.1, 0.28),
    }));
  }

  loadPreferences() {
    const stored = SafeStorage.read(PREF_KEY);
    let migratedLegacyDefault = false;
    if (stored && typeof stored === "object") {
      const storedVolume = clamp(Number(stored.volume) || 0, 0, 1);
      migratedLegacyDefault = !stored.version && Math.abs(storedVolume - 0.7) < 0.001;
      this.sound.volume = migratedLegacyDefault ? 1 : storedVolume;
      this.sound.muted = Boolean(stored.muted);
      this.gentleMotion = Boolean(stored.gentleMotion);
    }
    const volume = Math.round(this.sound.volume * 100);
    this.dom.volumeSlider.value = String(volume);
    this.dom.titleVolumeSlider.value = String(volume);
    this.dom.volumeOutput.value = `${volume}%`;
    this.dom.titleVolumeOutput.value = `${volume}%`;
    this.dom.motionToggle.checked = this.gentleMotion;
    this.dom.titleMotionToggle.checked = this.gentleMotion;
    this.updateMuteButton();
    if (migratedLegacyDefault) this.savePreferences();
  }

  savePreferences() {
    SafeStorage.write(PREF_KEY, {
      version: PREF_VERSION,
      volume: this.sound.volume,
      muted: this.sound.muted,
      gentleMotion: this.gentleMotion,
    });
  }

  validSave(value) {
    if (!value || value.version !== SAVE_VERSION) return false;
    if (!Number.isInteger(value.act) || value.act < 0 || value.act > 2) return false;
    if (!value.progress || !Array.isArray(value.progress.rescued)) return false;
    return true;
  }

  checkSavedJourney() {
    const save = SafeStorage.read(SAVE_KEY);
    if (!this.validSave(save)) return;
    this.pendingSave = save;
    const act = ACTS[save.act];
    const when = save.completed ? "Journey completed" : `${act.roman}: ${act.name}`;
    const ships = clamp(Number(save.progress.totalRescued) || 0, 0, 99);
    this.dom.saveSummary.textContent = save.completed
      ? `The sea is calm. Replay your completed journey with ${ships} ships guided?`
      : `Continue from ${when} · ${ships} ${ships === 1 ? "ship" : "ships"} guided`;
    this.dom.saveOverlay.classList.remove("hidden");
    this.dom.titleOverlay.inert = true;
    setTimeout(() => this.dom.continueButton.focus(), 0);
  }

  saveProgress(force = false) {
    if (!force && this.saveCooldown > 0) return;
    if (!["playing", "paused", "chapter", "conclusion", "complete"].includes(this.state)) return;
    const payload = {
      version: SAVE_VERSION,
      act: this.act,
      progress: this.progress,
      totalTime: this.totalTime,
      completed: this.completed,
      savedAt: Date.now(),
    };
    SafeStorage.write(SAVE_KEY, payload);
    this.saveCooldown = 0.8;
  }

  bindEvents() {
    const click = (element, handler) => element.addEventListener("click", () => {
      this.sound.init();
      this.sound.ui();
      handler();
    });

    click(this.dom.startButton, () => this.beginNewJourney());
    click(this.dom.continueButton, () => this.continueJourney());
    click(this.dom.startOverButton, () => {
      this.dom.saveOverlay.inert = true;
      this.dom.confirmOverlay.classList.remove("hidden");
      this.dom.cancelResetButton.focus();
    });
    click(this.dom.cancelResetButton, () => {
      this.dom.confirmOverlay.classList.add("hidden");
      this.dom.saveOverlay.inert = false;
      this.dom.startOverButton.focus();
    });
    click(this.dom.confirmResetButton, () => {
      SafeStorage.remove(SAVE_KEY);
      this.dom.confirmOverlay.classList.add("hidden");
      this.dom.saveOverlay.classList.add("hidden");
      this.dom.saveOverlay.inert = false;
      this.dom.titleOverlay.inert = false;
      this.beginNewJourney();
    });
    click(this.dom.chapterButton, () => this.startAct());
    click(this.dom.dialogueButton, () => this.beginActGameplay());
    click(this.dom.pauseButton, () => this.pause());
    click(this.dom.resumeButton, () => this.resume());
    click(this.dom.restartActButton, () => this.restartAct());
    click(this.dom.quitButton, () => this.returnToTitle());
    click(this.dom.replayButton, () => this.beginNewJourney(true));
    click(this.dom.titleButton, () => this.returnToTitle());
    click(this.dom.muteButton, () => {
      this.sound.setMuted(!this.sound.muted);
      this.updateMuteButton();
      this.savePreferences();
    });
    click(this.dom.titleSettingsButton, () => {
      this.dom.titleOverlay.inert = true;
      this.dom.settingsDrawer.classList.remove("hidden");
      this.dom.closeSettingsButton.focus();
    });
    click(this.dom.closeSettingsButton, () => {
      this.dom.settingsDrawer.classList.add("hidden");
      this.dom.titleOverlay.inert = false;
      this.dom.titleSettingsButton.focus();
    });

    const updateVolume = (value) => {
      const amount = clamp(Number(value) / 100, 0, 1);
      this.sound.setVolume(amount);
      this.sound.setMuted(false);
      this.dom.volumeSlider.value = String(Math.round(amount * 100));
      this.dom.titleVolumeSlider.value = String(Math.round(amount * 100));
      this.dom.volumeOutput.value = `${Math.round(amount * 100)}%`;
      this.dom.titleVolumeOutput.value = `${Math.round(amount * 100)}%`;
      this.updateMuteButton();
      this.savePreferences();
    };
    this.dom.volumeSlider.addEventListener("input", (event) => updateVolume(event.target.value));
    this.dom.titleVolumeSlider.addEventListener("input", (event) => updateVolume(event.target.value));

    const updateMotion = (checked) => {
      this.gentleMotion = Boolean(checked);
      this.dom.motionToggle.checked = this.gentleMotion;
      this.dom.titleMotionToggle.checked = this.gentleMotion;
      this.savePreferences();
    };
    this.dom.motionToggle.addEventListener("change", (event) => updateMotion(event.target.checked));
    this.dom.titleMotionToggle.addEventListener("change", (event) => updateMotion(event.target.checked));

    this.bindMoveControl();
    this.bindAimControl();

    window.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") this.input.left = true;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") this.input.right = true;
      if ((event.key === "Escape" || event.key.toLowerCase() === "p") && this.state === "playing") this.pause();
      else if ((event.key === "Escape" || event.key.toLowerCase() === "p") && this.state === "paused") this.resume();
      if (["localhost", "127.0.0.1"].includes(location.hostname) && event.shiftKey && event.key.toLowerCase() === "n") this.qaAdvance();
    });
    window.addEventListener("keyup", (event) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") this.input.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") this.input.right = false;
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" && !this.input.pointerAim) return;
      this.aimAtClient(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      this.sound.init();
      this.input.pointerAim = true;
      this.canvas.setPointerCapture?.(event.pointerId);
      this.aimAtClient(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("pointerup", () => { this.input.pointerAim = false; });
    this.canvas.addEventListener("pointercancel", () => { this.input.pointerAim = false; });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.saveProgress(true);
        if (this.state === "playing") this.pause(true);
      }
    });
    window.addEventListener("pagehide", () => this.saveProgress(true));
    window.addEventListener("blur", () => {
      if (this.state === "playing") this.pause(true);
    });
    window.addEventListener("resize", () => this.syncViewport());
    window.visualViewport?.addEventListener("resize", () => this.syncViewport());
    window.visualViewport?.addEventListener("scroll", () => this.syncViewport());
    window.addEventListener("orientationchange", () => {
      this.syncViewport();
      setTimeout(() => {
        this.syncViewport();
        this.handleOrientation();
      }, 180);
    });
    window.matchMedia?.("(orientation: portrait)").addEventListener?.("change", () => this.handleOrientation());
  }

  bindHoldButton(button, direction) {
    const press = (event) => {
      event.preventDefault();
      this.sound.init();
      this.input[direction] = true;
      button.classList.add("active");
      button.setPointerCapture?.(event.pointerId);
    };
    const release = (event) => {
      event.preventDefault();
      this.input[direction] = false;
      button.classList.remove("active");
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  bindMoveControl() {
    const control = this.dom.movementControl;
    const move = (event) => {
      event.preventDefault();
      const rect = control.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const radius = rect.width * 0.3;
      const distance = Math.hypot(dx, dy);
      const scale = distance > radius ? radius / distance : 1;
      const stickX = dx * scale;
      const stickY = dy * scale;
      const rawAxis = clamp(dx / radius, -1, 1);
      this.input.moveAxis = Math.abs(rawAxis) < 0.14 ? 0 : rawAxis;
      this.dom.movementStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
      control.classList.toggle("active", this.input.moveAxis !== 0);
    };
    const stop = (event) => {
      event.preventDefault();
      this.input.moveAxis = 0;
      this.dom.movementStick.style.transform = "translate(-50%, -50%)";
      control.classList.remove("active");
      control.releasePointerCapture?.(event.pointerId);
    };
    control.addEventListener("pointerdown", (event) => {
      this.sound.init();
      control.setPointerCapture?.(event.pointerId);
      move(event);
    });
    control.addEventListener("pointermove", (event) => {
      if (control.hasPointerCapture?.(event.pointerId)) move(event);
    });
    control.addEventListener("pointerup", stop);
    control.addEventListener("pointercancel", stop);
    control.addEventListener("lostpointercapture", () => {
      this.input.moveAxis = 0;
      this.dom.movementStick.style.transform = "translate(-50%, -50%)";
      control.classList.remove("active");
    });
  }

  bindAimControl() {
    const control = this.dom.beamControl;
    const aim = (event) => {
      event.preventDefault();
      const rect = control.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = Math.min(-3, event.clientY - cy);
      this.lighthouse.targetAim = clamp(Math.atan2(dy, dx), -Math.PI + 0.08, -0.08);
      const length = Math.min(rect.width * 0.29, Math.hypot(dx, dy));
      const x = Math.cos(this.lighthouse.targetAim) * length;
      const y = Math.sin(this.lighthouse.targetAim) * length;
      this.dom.beamStick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    };
    const stop = (event) => {
      event.preventDefault();
      control.releasePointerCapture?.(event.pointerId);
    };
    control.addEventListener("pointerdown", (event) => {
      this.sound.init();
      control.setPointerCapture?.(event.pointerId);
      aim(event);
    });
    control.addEventListener("pointermove", (event) => {
      if (control.hasPointerCapture?.(event.pointerId)) aim(event);
    });
    control.addEventListener("pointerup", stop);
    control.addEventListener("pointercancel", stop);
  }

  aimAtClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * W / rect.width;
    const y = (clientY - rect.top) * H / rect.height;
    const origin = this.beamOrigin();
    const dy = Math.min(-4, y - origin.y);
    this.lighthouse.targetAim = clamp(Math.atan2(dy, x - origin.x), -Math.PI + 0.08, -0.08);
  }

  syncViewport() {
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const root = document.documentElement.style;
    root.setProperty("--viewport-width", `${width}px`);
    root.setProperty("--viewport-height", `${height}px`);
    root.setProperty("--viewport-left", `${left}px`);
    root.setProperty("--viewport-top", `${top}px`);
  }

  handleOrientation() {
    const portrait = window.matchMedia?.("(orientation: portrait)").matches;
    if (portrait && this.state === "playing") {
      this.orientationPaused = true;
      this.pause(true);
    }
  }

  beginNewJourney(replay = false) {
    SafeStorage.remove(SAVE_KEY);
    this.pendingSave = null;
    this.act = 0;
    this.progress = this.freshProgress();
    this.totalTime = 0;
    this.completed = false;
    this.chapterTransition = false;
    this.dom.titleOverlay.inert = false;
    this.dom.saveOverlay.inert = false;
    this.dom.titleOverlay.classList.add("hidden");
    this.dom.saveOverlay.classList.add("hidden");
    this.dom.completeOverlay.classList.add("hidden");
    this.showChapter(0);
    if (replay) this.toast("The light begins again");
  }

  continueJourney() {
    if (!this.validSave(this.pendingSave)) {
      this.beginNewJourney();
      return;
    }
    this.act = this.pendingSave.act;
    this.progress = this.sanitizeProgress(this.pendingSave.progress);
    this.totalTime = clamp(Number(this.pendingSave.totalTime) || 0, 0, 60 * 60);
    this.completed = Boolean(this.pendingSave.completed);
    this.dom.titleOverlay.inert = false;
    this.dom.saveOverlay.inert = false;
    this.dom.saveOverlay.classList.add("hidden");
    this.dom.titleOverlay.classList.add("hidden");
    if (this.completed) {
      this.showComplete();
    } else {
      this.showChapter(this.act, true);
    }
  }

  sanitizeProgress(source) {
    const fresh = this.freshProgress();
    fresh.rescued = [0, 1, 2].map((index) => clamp(Math.floor(Number(source.rescued?.[index]) || 0), 0, index === 2 ? 1 : 4));
    fresh.fogCleared = clamp(Math.floor(Number(source.fogCleared) || 0), 0, 4);
    fresh.beaconsLit = clamp(Math.floor(Number(source.beaconsLit) || 0), 0, 3);
    fresh.stormWaves = clamp(Math.floor(Number(source.stormWaves) || 0), 0, 99);
    fresh.shipGuidance = clamp(Number(source.shipGuidance) || 0, 0, 3);
    fresh.missed = clamp(Math.floor(Number(source.missed) || 0), 0, 99);
    fresh.totalRescued = clamp(Math.floor(Number(source.totalRescued) || 0), 0, 99);
    return fresh;
  }

  showChapter(act, returning = false) {
    this.state = "chapter";
    this.act = act;
    this.toastTimer = 0;
    this.dom.toast.classList.remove("show");
    const data = ACTS[act];
    this.dom.chapterAct.textContent = data.roman;
    this.dom.chapterTitle.textContent = data.name;
    this.dom.chapterButton.textContent = returning ? "RETURN TO THE HORIZON" : "CONTINUE";
    this.dom.chapterOverlay.classList.remove("hidden");
    this.dom.actDialogue.classList.add("hidden");
    this.dom.hud.classList.add("hidden");
    this.dom.touchControls.classList.add("hidden");
    this.prepareActWorld();
    this.saveProgress(true);
    setTimeout(() => this.dom.chapterButton.focus(), 0);
  }

  startAct() {
    this.state = "briefing";
    this.actTime = 0;
    this.spawnClock = 1.1;
    this.waveClock = 7;
    this.lightningClock = random(3.8, 5.8);
    this.storyClock = 0;
    this.tutorialStep = 0;
    this.act1Spawned = this.progress.rescued[0];
    this.act2Spawned = Math.max(this.progress.fogCleared, this.progress.rescued[1]);
    this.dom.chapterOverlay.classList.add("hidden");
    this.dom.pauseOverlay.classList.add("hidden");
    this.dom.hud.classList.remove("hidden");
    this.dom.touchControls.classList.add("hidden");
    this.dom.hud.inert = true;
    this.updateHud();
    const data = ACTS[this.act];
    this.dom.dialoguePortrait.className = `dialogue-portrait ${data.character}`;
    this.dom.dialogueSpeaker.textContent = data.speaker;
    this.dom.dialogueText.textContent = data.intro;
    this.dom.dialogueButton.textContent = data.button;
    this.dom.actDialogue.classList.toggle("from-right", data.side === "right");
    this.dom.actDialogue.classList.remove("hidden");
    setTimeout(() => this.dom.dialogueButton.focus(), 0);
  }

  beginActGameplay() {
    if (this.state !== "briefing") return;
    this.state = "playing";
    this.dom.actDialogue.classList.add("hidden");
    this.dom.touchControls.classList.remove("hidden");
    this.dom.hud.inert = false;
    if (this.act === 0) this.toast("Hold the beam to set a safe course", 3.5);
    if (this.act === 1) this.toast("Clear nearby fog—boats are moving inside", 3.7);
    if (this.act === 2) this.toast("Stand near a beacon and focus the light", 3.7);
  }

  prepareTitleWorld() {
    this.lighthouse = this.createLighthouse();
    this.lighthouse.x = 260;
    this.boats = [{ x: 720, y: 320, speed: 0, guided: 1, need: 1, state: "sailing", scale: 1.1, kind: "fishing", bob: 0 }];
    this.fogs = [];
    this.reefs = [];
    this.beacons = [];
    this.waves = [];
    this.rain = [];
    this.particles = [];
  }

  prepareActWorld() {
    this.lighthouse = this.createLighthouse();
    this.lighthouse.x = this.act === 2 ? 150 : 230;
    this.boats = [];
    this.fogs = [];
    this.reefs = this.act === 0 ? [
      { x: 690, y: 260, radius: 29, spikes: 7, phase: 0.4 },
      { x: 505, y: 286, radius: 33, spikes: 8, phase: 1.7 },
      { x: 330, y: 236, radius: 26, spikes: 6, phase: 2.8 },
    ] : [];
    this.beacons = [];
    this.waves = [];
    this.rain = [];
    this.particles = [];
    if (this.act === 1) {
      this.act2Spawned = Math.max(this.progress.fogCleared, this.progress.rescued[1]);
      const pendingBoats = Math.min(2, Math.max(0, this.progress.fogCleared - this.progress.rescued[1]));
      const lanes = [276, 326, 242, 306];
      for (let index = 0; index < pendingBoats; index += 1) {
        const rescueIndex = this.progress.rescued[1] + index;
        this.spawnBoat({ lane: lanes[rescueIndex % 4], need: 3.2 + rescueIndex * 0.2, speed: 29 + rescueIndex * 2, revealed: true });
      }
      if (this.act2Spawned < 4) this.createNextFog();
    }
    if (this.act === 2) this.createBeacons();
  }

  createNextFog() {
    const index = this.act2Spawned;
    if (index >= 4 || this.fogs.length >= 2) return;
    const positions = [
      { x: 760, y: 264, size: 88 },
      { x: 585, y: 218, size: 96 },
      { x: 815, y: 304, size: 108 },
      { x: 625, y: 278, size: 116 },
    ];
    const position = positions[index];
    this.fogs.push({ ...position, strength: 0, need: 3.1 + index * 0.3, phase: random(0, 8), index, revealed: false });
    this.spawnBoat({
      x: position.x + 74,
      lane: clamp(position.y + (index % 2 ? 30 : 18), 230, 334),
      need: 3.15 + index * 0.22,
      speed: 28 + index * 2,
      fogIndex: index,
      revealed: false,
      kind: index % 2 ? "sail" : "fishing",
    });
    this.act2Spawned += 1;
  }

  createBeacons() {
    const positions = [300, 530, 770];
    this.beacons = positions.map((x, index) => ({
      x,
      y: 360 - (index % 2) * 18,
      charge: index < this.progress.beaconsLit ? 1 : 0,
      lit: index < this.progress.beaconsLit,
      need: 3.4 + index * 0.35,
      phase: index * 1.7,
    }));
  }

  restartAct() {
    this.dom.pauseOverlay.classList.add("hidden");
    this.prepareActWorld();
    this.showChapter(this.act, true);
  }

  returnToTitle() {
    this.saveProgress(true);
    this.state = "title";
    this.dom.pauseOverlay.classList.add("hidden");
    this.dom.completeOverlay.classList.add("hidden");
    this.dom.chapterOverlay.classList.add("hidden");
    this.dom.actDialogue.classList.add("hidden");
    this.dom.hud.classList.add("hidden");
    this.dom.touchControls.classList.add("hidden");
    this.dom.titleOverlay.classList.remove("hidden");
    this.dom.titleOverlay.inert = false;
    this.prepareTitleWorld();
    setTimeout(() => this.dom.startButton.focus(), 0);
  }

  pause(automatic = false) {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.input.left = false;
    this.input.right = false;
    this.input.moveAxis = 0;
    this.dom.movementStick.style.transform = "translate(-50%, -50%)";
    this.dom.movementControl.classList.remove("active");
    this.sound.setBeamActive(false);
    this.saveProgress(true);
    this.dom.pauseOverlay.classList.remove("hidden");
    this.dom.touchControls.classList.add("hidden");
    this.dom.hud.inert = true;
    setTimeout(() => this.dom.resumeButton.focus(), 0);
    if (automatic) this.dom.pauseOverlay.querySelector(".eyebrow").textContent = "YOUR LIGHT IS SAFE";
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.orientationPaused = false;
    this.dom.pauseOverlay.classList.add("hidden");
    this.dom.touchControls.classList.remove("hidden");
    this.dom.hud.inert = false;
    this.dom.pauseOverlay.querySelector(".eyebrow").textContent = "THE SEA IS WAITING";
    this.lastTime = performance.now();
  }

  frame(time) {
    const rawDt = (time - this.lastTime) / 1000;
    const dt = clamp(rawDt || 0, 0, 0.05);
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(dt) {
    this.saveCooldown = Math.max(0, this.saveCooldown - dt);
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer <= 0) this.dom.toast.classList.remove("show");
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.lightning = Math.max(0, this.lightning - dt);
    this.cameraShake = Math.max(0, this.cameraShake - dt * 14);

    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * dt * (this.act === 2 ? 2.2 : 1);
      if (cloud.x < -160) cloud.x = W + 120;
    }
    this.updateParticles(dt);

    if (this.state === "title" || this.state === "chapter") {
      this.lighthouse.aim = Math.sin(performance.now() * 0.00035) * 0.42 - 0.7;
      for (const boat of this.boats) boat.bob += dt;
      return;
    }
    if (this.state === "conclusion") {
      this.updateConclusion(dt);
      return;
    }
    if (this.state !== "playing") return;

    this.totalTime += dt;
    this.actTime += dt;
    this.updateLighthouse(dt);
    this.updateWeather(dt);
    this.updateBoats(dt);
    this.updateFogs(dt);
    this.updateBeacons(dt);
    this.updateStorm(dt);
    this.updateRain(dt);
    this.updateActFlow(dt);
    this.updateHud();
    const beamActive = this.boats.some((boat) => boat.hit) || this.fogs.some((fog) => this.beamHits(fog.x, fog.y, 0.025)) || this.beacons.some((beacon) => !beacon.lit && this.beamHits(beacon.x, beacon.y - 55, 0.035));
    this.sound.setBeamActive(beamActive);
    this.sound.update(dt, this.act, this.state, this.gameIntensity());
  }

  gameIntensity() {
    if (this.act === 0) {
      const danger = this.boats.some((boat) => boat.warning > 0) ? 0.35 : 0;
      return clamp((this.boats.length - 1) * 0.3 + this.progress.rescued[0] * 0.08 + danger, 0, 1);
    }
    if (this.act === 1) return clamp(0.2 + this.fogs.length * 0.2 + this.boats.length * 0.22, 0, 0.8);
    return clamp(0.45 + this.waves.length * 0.2 + (this.progress.beaconsLit >= 3 ? 0.25 : 0), 0, 1);
  }

  updateLighthouse(dt) {
    const keyboardDirection = Number(this.input.right) - Number(this.input.left);
    const direction = this.input.moveAxis || keyboardDirection;
    const targetVelocity = direction * 155;
    this.lighthouse.vx = lerp(this.lighthouse.vx, targetVelocity, 1 - Math.exp(-dt * 8));
    if (!direction) this.lighthouse.vx *= Math.pow(0.03, dt);
    this.lighthouse.x = clamp(this.lighthouse.x + this.lighthouse.vx * dt, 85, 875);
    this.lighthouse.stability = clamp(this.lighthouse.stability + dt * 0.62, 0, 1);
    this.lighthouse.aim += angleDelta(this.lighthouse.targetAim, this.lighthouse.aim) * (1 - Math.exp(-dt * 10));
    this.lighthouse.glow = lerp(this.lighthouse.glow, 0, dt * 2);
    if (Math.abs(this.lighthouse.vx) > 18) {
      this.lighthouse.walkPhase += dt * Math.abs(this.lighthouse.vx) * 0.075;
      this.lighthouse.stepClock -= dt;
      if (this.lighthouse.stepClock <= 0) {
        this.lighthouse.stepClock = 0.32;
        this.sound.step();
        this.spawnParticles(this.lighthouse.x, 430, "splash", 3);
      }
    }
  }

  beamOrigin() {
    return { x: this.lighthouse.x, y: this.lighthouse.y - 112 + Math.sin(this.lighthouse.walkPhase) * 2 };
  }

  beamContact(x, y, extraWidth = 0) {
    const origin = this.beamOrigin();
    const dx = x - origin.x;
    const dy = y - origin.y;
    const directionX = Math.cos(this.lighthouse.aim);
    const directionY = Math.sin(this.lighthouse.aim);
    const distance = dx * directionX + dy * directionY;
    const perpendicular = Math.abs(dx * directionY - dy * directionX);
    const width = 23 + Math.max(0, distance) * 0.095 + extraWidth * 180;
    const occlusion = this.beamOcclusionDistance();
    return {
      hit: distance >= 0 && distance <= 660 && distance < occlusion + 12 && perpendicular <= width,
      distance,
      perpendicular,
      width,
      beamY: origin.y + (Math.abs(directionX) < 0.02 ? 0 : (x - origin.x) * directionY / directionX),
      strength: clamp(1 - Math.max(0, distance) / 980, 0.32, 1),
    };
  }

  beamOcclusionDistance() {
    if (this.act !== 0 || this.progress.rescued[0] < 1 || !this.reefs.length) return 690;
    const origin = this.beamOrigin();
    const directionX = Math.cos(this.lighthouse.aim);
    const directionY = Math.sin(this.lighthouse.aim);
    let nearest = 690;
    for (const reef of this.reefs) {
      const dx = reef.x - origin.x;
      const dy = reef.y - origin.y;
      const projection = dx * directionX + dy * directionY;
      const perpendicular = Math.abs(dx * directionY - dy * directionX);
      if (projection > 0 && perpendicular < reef.radius * 0.52) nearest = Math.min(nearest, projection - reef.radius * 0.3);
    }
    return nearest;
  }

  beamHits(x, y, extraWidth = 0) {
    return this.beamContact(x, y, extraWidth).hit;
  }

  spawnBoat(options = {}) {
    const act = this.act;
    const lane = options.lane ?? (act === 0 ? random(225, 300) : random(260, 345));
    const large = options.kind === "great";
    this.boats.push({
      x: options.x ?? (act === 0 ? W + random(-35, 35) : W + random(55, 130)),
      y: lane,
      targetY: lane,
      vy: options.vy ?? random(-4, 4),
      speed: options.speed ?? (large ? 19 : random(36, 44) + act * 2),
      guided: options.guided ?? 0,
      need: options.need ?? (act === 0 ? 3.7 : 4.7),
      state: "sailing",
      scale: large ? 1.75 : random(0.86, 1.1),
      kind: options.kind || (Math.random() > 0.72 ? "sail" : "fishing"),
      bob: random(0, Math.PI * 2),
      hit: false,
      missed: false,
      special: Boolean(options.special),
      fogIndex: Number.isInteger(options.fogIndex) ? options.fogIndex : null,
      revealed: options.revealed ?? act !== 1,
      hornClock: options.hornClock ?? random(1.2, 2.2),
      pingClock: 0,
      lightGrace: 0,
      courseSet: false,
      collisionCooldown: 0,
      damage: 0,
      warning: 0,
      currentSeed: random(0, Math.PI * 2),
      avoidSide: options.avoidSide ?? (lane < 265 ? -1 : 1),
    });
  }

  updateBoats(dt) {
    for (const boat of this.boats) {
      if (boat.state !== "sailing") continue;
      boat.bob += dt * (boat.kind === "great" ? 1.5 : 2.4);
      const learningAssist = this.act === 0 && !boat.courseSet && this.progress.rescued[0] === 0 && boat.damage === 0 && this.reefs.some((reef) => boat.x > reef.x && boat.x - reef.x < 145);
      const concealedScale = this.act === 1 && !boat.revealed ? 0.48 : 1;
      const travelScale = boat.courseSet ? 1.95 : (learningAssist ? 0.64 : concealedScale);
      boat.x -= boat.speed * dt * travelScale;
      boat.hornClock -= dt;
      boat.pingClock -= dt;
      boat.lightGrace = Math.max(0, boat.lightGrace - dt);
      boat.collisionCooldown = Math.max(0, boat.collisionCooldown - dt);
      boat.warning = Math.max(0, boat.warning - dt * 1.8);
      const contact = this.beamContact(boat.x, boat.y - 10, boat.kind === "great" ? 0.04 : 0);
      const linkedFog = this.act === 1 && boat.fogIndex !== null
        ? this.fogs.find((fog) => fog.index === boat.fogIndex)
        : null;
      const visibleThroughFog = !linkedFog || linkedFog.strength / linkedFog.need >= 0.32;
      const stormRelay = this.act === 2 && boat.kind === "great";
      const relayStage = clamp(Math.floor(this.progress.shipGuidance), 0, 2);
      const relayBeacon = stormRelay ? this.beacons[relayStage] : null;
      const relayReady = !stormRelay || (relayBeacon && Math.abs(this.lighthouse.x - relayBeacon.x) <= 74 && this.lighthouse.stability >= 0.55);
      const hit = contact.hit && visibleThroughFog && relayReady;
      if (hit) {
        boat.lightGrace = this.act === 0
          ? (this.progress.rescued[0] === 0 ? 1 : (this.progress.rescued[0] < 2 ? 0.65 : 0.56))
          : 0.8;
      }
      const guidedActive = hit || boat.lightGrace > 0;
      boat.hit = guidedActive;
      if (hit) {
        if (stormRelay) {
          const previousLink = Math.floor(this.progress.shipGuidance);
          this.progress.shipGuidance = clamp(this.progress.shipGuidance + dt / 2.65, 0, 3);
          boat.guided = this.progress.shipGuidance;
          const completedLink = Math.floor(this.progress.shipGuidance);
          if (completedLink > previousLink) {
            this.sound.rescue();
            this.spawnParticles(relayBeacon.x, relayBeacon.y - 55, "celebrate", 18);
            if (completedLink < 3) this.toast(`Signal linked! Move to Beacon ${completedLink + 1}`, 2.6);
            this.saveProgress(true);
          }
        } else {
          boat.guided = clamp(boat.guided + dt * contact.strength, 0, boat.need);
        }
        if (this.act === 0) {
          const manualOffset = contact.beamY + 10 - boat.y;
          const desiredY = Math.abs(manualOffset) > 26
            ? clamp(contact.beamY + 10, 205, 306)
            : this.safeCourseFor(boat);
          boat.vy = lerp(boat.vy, clamp((desiredY - boat.y) * 1.5, -58, 58), 1 - Math.exp(-dt * 3.8));
        } else {
          boat.targetY = lerp(boat.targetY, 310, dt * 0.9);
        }
        this.lighthouse.glow = 1;
        if (Math.random() < dt * 7) this.spawnParticles(boat.x, boat.y - 18, "light", 1);
        if (boat.pingClock <= 0) {
          boat.pingClock = 0.52 - clamp(boat.guided / boat.need, 0, 1) * 0.2;
          this.sound.guidePing(boat.guided / boat.need);
        }
        if (stormRelay && this.progress.shipGuidance >= 3) {
          this.toast("Every light answers—the great ship is homeward bound!", 3.2);
          this.rescueBoat(boat);
          continue;
        }
      } else if (guidedActive && this.act === 0) {
        const desiredY = this.safeCourseFor(boat);
        boat.vy = lerp(boat.vy, clamp((desiredY - boat.y) * 1.35, -52, 52), 1 - Math.exp(-dt * 3.1));
      } else if (this.act === 0) {
        const steady = boat.guided >= boat.need * 0.95;
        const currentStrength = this.progress.rescued[0] >= 2 ? 20 : 16;
        const current = Math.sin(this.actTime * 0.72 + boat.currentSeed) * (steady ? 6 : currentStrength) + (this.boats.length > 1 && !steady ? 6 : 0);
        boat.vy = lerp(boat.vy, current, 1 - Math.exp(-dt * 0.75));
        if (!steady && this.progress.rescued[0] >= 1) {
          const overlapPressure = this.boats.length > 1 ? 0.1 : 0.055;
          boat.guided = Math.max(0, boat.guided - dt * overlapPressure);
        }
      } else {
        boat.targetY += Math.sin(boat.bob * 0.65) * dt * (this.act === 2 ? 9 : 4);
        if (this.act === 1 && boat.revealed) boat.guided = Math.max(0, boat.guided - dt * 0.18);
        if (stormRelay && this.progress.shipGuidance < 3) {
          const securedLinks = Math.floor(this.progress.shipGuidance);
          this.progress.shipGuidance = Math.max(securedLinks, this.progress.shipGuidance - dt * 0.07);
          boat.guided = this.progress.shipGuidance;
        }
      }
      if (this.act === 0 && this.progress.rescued[0] >= 1 && !boat.courseSet && boat.guided >= boat.need * 0.68) {
        this.spawnClock = Math.min(this.spawnClock, 1.15);
      }
      if (this.act === 0 && !boat.courseSet && boat.guided >= boat.need * 0.98) {
        boat.courseSet = true;
        boat.lightGrace = 0;
        boat.warning = 0;
        this.sound.rescue();
        this.spawnParticles(boat.x, boat.y - 18, "light", 12);
        this.toast("COURSE SET — sailing safely", 2.2);
        if (this.progress.rescued[0] >= 2) this.spawnClock = Math.min(this.spawnClock, 1.8);
      }
      if (this.act === 0 && boat.courseSet) {
        const desiredY = this.safeCourseFor(boat);
        boat.vy = lerp(boat.vy, clamp((desiredY - boat.y) * 1.45, -58, 58), 1 - Math.exp(-dt * 3.6));
      }
      if (this.act === 0) {
        boat.y = clamp(boat.y + boat.vy * dt, 192, 326);
      } else {
        boat.y = lerp(boat.y, boat.targetY, dt * 1.3);
      }

      if (this.act === 0 && !boat.courseSet) this.checkReefCollisions(boat);
      if (boat.state !== "sailing") continue;

      if (boat.hornClock <= 0) {
        boat.hornClock = boat.kind === "great"
          ? random(7.5, 10.5)
          : (this.act === 1 && !boat.revealed ? random(10, 14) : random(13, 18));
        this.sound.horn(boat.kind === "great");
      }

      if (boat.x < 96) {
        const enoughLight = boat.guided >= boat.need * (this.act === 0 ? 0.72 : 0.98);
        const safeCourse = this.act !== 0 || (boat.y >= 205 && boat.y <= 312);
        if (enoughLight && safeCourse) this.rescueBoat(boat);
        else this.missBoat(boat);
      }
    }
    this.boats = this.boats.filter((boat) => boat.state !== "remove");
  }

  safeCourseFor(boat) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const reef of this.reefs) {
      const distance = boat.x - reef.x;
      if (distance > -30 && distance < 225 && distance < nearestDistance) {
        nearest = reef;
        nearestDistance = distance;
      }
    }
    if (!nearest) return clamp(262 + Math.sin(boat.currentSeed) * 12, 225, 295);
    const clearance = nearest.radius + 43;
    return clamp(nearest.y + boat.avoidSide * clearance, 205, 310);
  }

  checkReefCollisions(boat) {
    for (const reef of this.reefs) {
      const dx = boat.x - reef.x;
      const dy = boat.y - reef.y;
      const dangerDistance = reef.radius + 64;
      if (dx > 0 && dx < 185 && Math.abs(dy) < dangerDistance) boat.warning = 1;
      if (Math.hypot(dx, dy) > reef.radius + 14 || boat.collisionCooldown > 0) continue;
      boat.collisionCooldown = 2.6;
      boat.damage += 1;
      boat.x += 105;
      boat.vy = (boat.y <= reef.y ? -1 : 1) * 72;
      boat.guided = Math.max(0, boat.guided - 0.55);
      this.sound.scrape();
      this.cameraShake = this.gentleMotion ? 1 : 7;
      this.spawnParticles(boat.x, boat.y, "splash", 16);
      if (boat.damage >= 3) {
        this.missBoat(boat);
      } else {
        this.toast("Hull scraped! Guide them clear", 2.2);
      }
      return;
    }
  }

  rescueBoat(boat) {
    boat.state = "remove";
    this.progress.totalRescued += 1;
    if (this.act < 2) this.progress.rescued[this.act] += 1;
    else this.progress.rescued[2] = 1;
    this.sound.rescue();
    this.cameraShake = this.gentleMotion ? 0 : 3;
    this.spawnParticles(105, boat.y, "celebrate", 22);
    if (boat.kind === "great") {
      this.toast("The great ship sees the harbor!", 2.4);
    } else if (this.act === 0 && this.progress.rescued[0] === 1) {
      this.toast("Safe harbor—another distress horn approaches", 3.1);
    } else if (this.act === 0 && this.progress.rescued[0] === 2) {
      this.tutorialStep = 2;
      this.toast("Two boats incoming—reposition around reefs", 3.6);
    } else {
      this.toast("Safe harbor! ✦", 2.4);
    }
    if (this.act === 0) this.spawnClock = Math.max(this.spawnClock, 2.8);
    this.saveProgress(true);
  }

  missBoat(boat) {
    if (this.act === 1) {
      this.progress.missed += 1;
      boat.x = W + 75;
      boat.guided = Math.max(0, boat.guided * 0.3);
      boat.targetY = clamp(boat.targetY, 235, 330);
      boat.hornClock = random(10, 14);
      this.sound.horn(false);
      this.toast("Lost in fog—their horn circles back", 2.6);
      return;
    }
    boat.state = "remove";
    this.progress.missed += 1;
    this.sound.tone(160, 0.42, { type: "triangle", gain: 0.1, slide: 92 });
    this.toast("Lost in the dark—but circling back", 2.5);
    this.spawnClock = Math.max(this.spawnClock, 2.1);
  }

  updateFogs(dt) {
    for (const fog of this.fogs) {
      fog.phase += dt;
      const hit = this.beamHits(fog.x, fog.y, 0.025);
      const harborSideDistance = fog.x - this.lighthouse.x;
      const closeEnough = harborSideDistance >= 80 && harborSideDistance <= 420;
      if (hit && closeEnough) {
        fog.strength += dt * 0.92;
        this.lighthouse.glow = 1;
        if (Math.random() < dt * 10) this.spawnParticles(fog.x + random(-30, 30), fog.y + random(-18, 18), "mist", 1);
      } else {
        fog.strength = Math.max(0, fog.strength - dt * (fog.revealed ? 0.13 : 0.2));
      }
      if (!fog.revealed && fog.strength / fog.need >= 0.32) {
        fog.revealed = true;
        const boat = this.boats.find((candidate) => candidate.fogIndex === fog.index);
        if (boat) {
          boat.revealed = true;
          boat.hornClock = random(11, 15);
        }
        this.sound.horn(false);
        this.toast("Boat found—balance its light with the fog", 2.9);
        this.spawnClock = Math.min(this.spawnClock, 2.6);
      }
      if (fog.strength >= fog.need) {
        this.clearFog(fog);
      }
    }
    this.fogs = this.fogs.filter((fog) => !fog.cleared);
  }

  clearFog(fog) {
    fog.cleared = true;
    this.progress.fogCleared += 1;
    this.sound.sparkle();
    this.flash = this.gentleMotion ? 0.12 : 0.32;
    this.spawnParticles(fog.x, fog.y, "mist", 28);
    this.toast("Fog broken—the boat still needs your light", 2.3);
    const boat = this.boats.find((candidate) => candidate.fogIndex === fog.index);
    if (boat) boat.revealed = true;
    this.spawnClock = Math.min(this.spawnClock, 1.8);
    this.saveProgress(true);
  }

  updateBeacons(dt) {
    if (this.act !== 2) return;
    for (const beacon of this.beacons) {
      beacon.phase += dt;
      if (beacon.lit) continue;
      const hit = this.beamHits(beacon.x, beacon.y - 55, 0.035);
      const closeEnough = Math.abs(this.lighthouse.x - beacon.x) <= 130;
      if (hit && closeEnough && this.lighthouse.stability >= 0.45) {
        beacon.charge = clamp(beacon.charge + dt / beacon.need, 0, 1);
        this.lighthouse.glow = 1;
        if (Math.random() < dt * 8) this.spawnParticles(beacon.x, beacon.y - 55, "light", 1);
      } else if (!beacon.lit) {
        beacon.charge = Math.max(0, beacon.charge - dt * 0.04);
      }
      if (beacon.charge >= 1) {
        beacon.lit = true;
        this.progress.beaconsLit += 1;
        this.sound.rescue();
        this.flash = this.gentleMotion ? 0.08 : 0.2;
        this.spawnParticles(beacon.x, beacon.y - 55, "celebrate", 18);
        this.toast(`Beacon ${this.progress.beaconsLit} awakened`, 2.2);
        this.saveProgress(true);
        if (this.progress.beaconsLit === 3) {
          this.storyClock = 3.2;
          this.dom.objectiveText.textContent = "Stand together against the storm";
        }
      }
    }
  }

  updateWeather(dt) {
    this.lightningClock -= dt;
    if (this.lightningClock <= 0) {
      const intervals = [[7.2, 10.5], [6.2, 9], [3.8, 6.2]];
      const [minimum, maximum] = intervals[this.act] || intervals[0];
      this.lightningClock = random(minimum, maximum);
      this.lightning = 0.16;
      this.lightningX = random(390, 875);
      const severity = [0.2, 0.26, 0.38][this.act] || 0.2;
      this.flash = Math.max(this.flash, this.gentleMotion ? 0.08 : severity);
      this.cameraShake = Math.max(this.cameraShake, this.gentleMotion ? 1 : (this.act === 2 ? 5 : 3));
      this.sound.lightning();
      if (this.act === 0) {
        const gust = Math.random() < 0.5 ? -1 : 1;
        for (const boat of this.boats) {
          if (!boat.courseSet) boat.vy += gust * (boat.hit ? 12 : 28);
        }
      }
    }
  }

  updateStorm(dt) {
    if (this.act !== 2) return;
    this.waveClock -= dt;
    if (this.waveClock <= 0 && this.progress.rescued[2] === 0) {
      this.waveClock = this.progress.beaconsLit >= 3 ? random(3.7, 4.9) : random(5.7, 7.5);
      this.progress.stormWaves += 1;
      this.waves.push({ x: W + 80, width: 95, life: 1, speed: random(175, 215) });
      this.sound.noise(0.24, 0.075);
      this.cameraShake = this.gentleMotion ? 1 : 6;
      this.flash = this.gentleMotion ? 0.08 : 0.23;
      this.saveProgress(true);
    }

    for (const wave of this.waves) {
      wave.x -= wave.speed * dt;
      if (!wave.hit && Math.abs(wave.x - this.lighthouse.x) < wave.width * 0.5) {
        wave.hit = true;
        this.lighthouse.x = clamp(this.lighthouse.x - 106, 85, 875);
        this.lighthouse.vx = -245;
        this.lighthouse.stability = 0;
        if (this.progress.shipGuidance > 0 && this.progress.shipGuidance < 3) {
          const securedLinks = Math.floor(this.progress.shipGuidance);
          this.progress.shipGuidance = Math.max(securedLinks, this.progress.shipGuidance - 0.36);
          const greatShip = this.boats.find((boat) => boat.kind === "great");
          if (greatShip) greatShip.guided = this.progress.shipGuidance;
        }
        this.cameraShake = this.gentleMotion ? 2 : 10;
        this.sound.noise(0.3, 0.12);
        this.spawnParticles(this.lighthouse.x, 420, "splash", 20);
        const nextBeacon = clamp(Math.floor(this.progress.shipGuidance) + 1, 1, 3);
        const relayMessage = this.progress.shipGuidance > 0
          ? `The link broke—regain Beacon ${nextBeacon}!`
          : `Wave struck—reach Beacon ${nextBeacon}!`;
        this.toast(this.progress.beaconsLit >= 3 ? relayMessage : "The wave snuffed your focus—stand and relight", 2.3);
      }
    }
    this.waves = this.waves.filter((wave) => wave.x > -130);

    if (this.progress.beaconsLit >= 3 && this.progress.rescued[2] === 0) {
      this.storyClock -= dt;
      if (this.storyClock <= 0 && !this.boats.some((boat) => boat.kind === "great")) {
        this.spawnBoat({ x: W - 20, kind: "great", lane: 255, need: 3, guided: this.progress.shipGuidance, speed: 17, special: true });
        this.toast("The great ship! Stand at Beacon 1 and hold the link", 4);
      }
    }
  }

  updateRain(dt, targetOverride = null) {
    const targetCount = targetOverride ?? (this.act === 2 ? 175 : this.act === 1 ? 105 : 82);
    while (this.rain.length < targetCount) {
      this.rain.push({ x: random(0, W), y: random(-H, H), speed: random(420, 700), length: random(8, 20) });
    }
    if (this.rain.length > targetCount) this.rain.length = targetCount;
    for (const drop of this.rain) {
      drop.x -= drop.speed * 0.22 * dt;
      drop.y += drop.speed * dt;
      if (drop.y > H + 30 || drop.x < -30) {
        drop.x = random(0, W + 160);
        drop.y = random(-170, -20);
      }
    }
  }

  updateActFlow(dt) {
    this.spawnClock -= dt;
    if (this.act === 0) {
      if (this.tutorialStep === 0 && this.actTime > 4.6) {
        this.tutorialStep = 1;
        this.toast("Center the beam; move gently to steer", 3.2);
      } else if (this.tutorialStep === 1 && this.progress.rescued[0] >= 2) {
        this.tutorialStep = 2;
        this.toast("Reefs block the beam—reposition", 3.2);
      }
      const target = 4;
      const desiredActive = this.progress.rescued[0] === 0 ? 1 : 2;
      const remaining = target - this.progress.rescued[0] - this.boats.length;
      if (remaining > 0 && this.boats.length < desiredActive && this.spawnClock <= 0) {
        const lanes = [258, 296, 222, 284, 242, 306];
        const speeds = [36, 39, 38, 41, 40, 42];
        const index = this.act1Spawned % lanes.length;
        this.spawnBoat({
          x: W - 30 + (this.boats.length ? 72 : 0),
          lane: lanes[index],
          speed: speeds[index],
          need: this.progress.rescued[0] === 0 ? 2 : (this.progress.rescued[0] < 2 ? 2.85 : 3.55),
          kind: index % 3 === 2 ? "sail" : "fishing",
        });
        this.act1Spawned += 1;
        this.spawnClock = this.progress.rescued[0] === 0 ? 3.4 : (this.boats.length > 0 ? 7.2 : 3.2);
      }
      if (this.progress.rescued[0] >= target) this.finishAct();
    }

    if (this.act === 1) {
      const canLayerNextRescue = this.fogs.length === 0 || this.fogs.some((fog) => fog.revealed);
      if (this.act2Spawned < 4 && this.fogs.length < 2 && canLayerNextRescue && this.spawnClock <= 0) {
        this.createNextFog();
        this.spawnClock = 4.2;
      }
      if (this.progress.rescued[1] >= 4 && this.progress.fogCleared >= 4) this.finishAct();
    }

    if (this.act === 2 && this.progress.rescued[2] >= 1) this.finishJourney();
  }

  finishAct() {
    if (this.chapterTransition) return;
    this.chapterTransition = true;
    this.sound.rescue();
    this.flash = this.gentleMotion ? 0.12 : 0.45;
    this.toast(`${ACTS[this.act].name} complete`, 2.5);
    const nextAct = this.act + 1;
    setTimeout(() => {
      this.chapterTransition = false;
      if (nextAct < ACTS.length) this.showChapter(nextAct);
    }, 1900);
  }

  finishJourney() {
    if (this.chapterTransition) return;
    this.chapterTransition = true;
    this.completed = true;
    this.state = "conclusion";
    this.conclusionClock = 0;
    this.conclusionPhase = 0;
    this.waves = [];
    this.dom.hud.classList.add("hidden");
    this.dom.touchControls.classList.add("hidden");
    this.dom.toast.classList.remove("show");
    this.toastTimer = 0;
    this.sound.setBeamActive(false);
    this.sound.rescue();
    this.flash = this.gentleMotion ? 0.15 : 0.75;
    this.saveProgress(true);
  }

  updateConclusion(dt) {
    this.conclusionClock += dt;
    const clearing = ease((this.conclusionClock - 0.7) / 5.2);
    this.updateRain(dt, Math.floor(140 * (1 - clearing)));
    this.lighthouse.aim = lerp(this.lighthouse.aim, -0.32, 1 - Math.exp(-dt * 1.4));
    this.lighthouse.targetAim = this.lighthouse.aim;
    this.lighthouse.glow = lerp(this.lighthouse.glow, 1, dt * 0.8);

    if (this.conclusionPhase === 0 && this.conclusionClock >= 1.2) {
      this.conclusionPhase = 1;
      this.sound.dawn();
      this.spawnParticles(170, 350, "celebrate", 28);
    }
    if (this.conclusionPhase === 1 && this.conclusionClock >= 4.3) {
      this.conclusionPhase = 2;
      this.sound.rescue();
      this.spawnParticles(245, 365, "celebrate", 42);
    }
    if (this.conclusionClock >= 8.2) this.showComplete();
  }

  showComplete() {
    this.state = "complete";
    this.completed = true;
    this.dom.hud.classList.add("hidden");
    this.dom.touchControls.classList.add("hidden");
    this.dom.completeOverlay.classList.remove("hidden");
    this.dom.boatsStat.textContent = String(this.progress.totalRescued);
    this.dom.lightsStat.textContent = String(this.progress.beaconsLit + 1);
    this.dom.timeStat.textContent = this.formatTime(this.totalTime);
    this.saveProgress(true);
    setTimeout(() => this.dom.replayButton.focus(), 0);
  }

  updateHud() {
    const data = ACTS[this.act];
    this.dom.actNumber.textContent = data.roman;
    this.dom.actName.textContent = data.name;
    let text = data.objective;
    let amount = 0;
    if (this.act === 0) {
      amount = this.progress.rescued[0] / 4;
      const danger = this.boats.filter((boat) => boat.warning > 0).length;
      text = danger ? `REEF AHEAD · ${danger} ${danger === 1 ? "boat needs" : "boats need"} your light!` : `Steer the homecoming fleet · ${this.progress.rescued[0]}/4`;
    } else if (this.act === 1) {
      amount = (this.progress.fogCleared + this.progress.rescued[1]) / 8;
      const unrevealedFog = this.fogs.find((fog) => !fog.revealed);
      const fogOffset = unrevealedFog ? unrevealedFog.x - this.lighthouse.x : 0;
      const wrongSide = unrevealedFog && fogOffset < 80;
      const tooFar = unrevealedFog && fogOffset > 420;
      const revealedBoats = this.boats.filter((boat) => boat.revealed).length;
      if (wrongSide) text = "Move to the harbor side—the fog rejects light from behind";
      else if (tooFar) text = "Walk closer—the distant beam cannot pierce this fog";
      else if (unrevealedFog) text = "Reveal the moving boat inside the fog";
      else if (revealedBoats) text = `Balance fog and ships · ${this.progress.fogCleared}/4 paths · ${this.progress.rescued[1]}/4 ships`;
      else text = `Search the fog · ${this.progress.fogCleared}/4 paths · ${this.progress.rescued[1]}/4 ships`;
    } else if (this.progress.beaconsLit < 3) {
      amount = this.progress.beaconsLit / 3;
      const nextBeacon = this.beacons.find((beacon) => !beacon.lit);
      const nearby = nextBeacon && Math.abs(this.lighthouse.x - nextBeacon.x) <= 130;
      text = nearby
        ? `Focus on Beacon ${this.progress.beaconsLit + 1} · ${this.progress.beaconsLit}/3 awake`
        : `Walk to Beacon ${this.progress.beaconsLit + 1} · ${this.progress.beaconsLit}/3 awake`;
    } else {
      const ship = this.boats.find((boat) => boat.kind === "great");
      amount = this.progress.shipGuidance / 3;
      const relay = clamp(Math.floor(this.progress.shipGuidance) + 1, 1, 3);
      const relayBeacon = this.beacons[relay - 1];
      const nearby = relayBeacon && Math.abs(this.lighthouse.x - relayBeacon.x) <= 74;
      text = ship
        ? `${nearby ? `Hold the link at Beacon ${relay}` : `Return to Beacon ${relay}`} · ${Math.floor(this.progress.shipGuidance)}/3 signals`
        : "The beacons are calling the great ship…";
    }
    this.dom.objectiveText.textContent = text;
    this.dom.objectiveProgress.style.width = `${clamp(amount, 0, 1) * 100}%`;
  }

  updateMuteButton() {
    this.dom.muteButton.textContent = this.sound.muted ? "×" : "♪";
    this.dom.muteButton.setAttribute("aria-label", this.sound.muted ? "Unmute audio" : "Mute audio");
  }

  toast(message, duration = 2.8) {
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add("show");
    this.toastTimer = duration;
  }

  formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  }

  qaAdvance() {
    if (this.state !== "playing" || this.chapterTransition) return;
    if (this.act === 0) {
      this.progress.totalRescued += Math.max(0, 4 - this.progress.rescued[0]);
      this.progress.rescued[0] = 4;
      this.boats = [];
      this.finishAct();
    } else if (this.act === 1) {
      this.progress.totalRescued += Math.max(0, 4 - this.progress.rescued[1]);
      this.progress.fogCleared = 4;
      this.progress.rescued[1] = 4;
      this.boats = [];
      this.fogs = [];
      this.finishAct();
    } else if (this.progress.beaconsLit < 3) {
      this.progress.beaconsLit = 3;
      this.beacons.forEach((beacon) => { beacon.lit = true; beacon.charge = 1; });
      this.storyClock = 0;
      this.updateHud();
    } else {
      this.progress.totalRescued += Math.max(0, 1 - this.progress.rescued[2]);
      this.progress.rescued[2] = 1;
      this.boats = [];
      this.finishJourney();
    }
    this.saveProgress(true);
  }

  spawnParticles(x, y, kind, count) {
    const colors = {
      light: ["#fff4ad", "#ffc85a", "#ffffff"],
      splash: ["#b9eff0", "#4da4bf", "#ffffff"],
      celebrate: ["#fff4ad", "#ffc85a", "#ef725e", "#b9eff0"],
      mist: ["#d2e4e2", "#8ba9b0", "#ffffff"],
    };
    for (let index = 0; index < count && this.particles.length < 220; index += 1) {
      const angle = kind === "splash" ? random(-Math.PI, 0) : random(0, Math.PI * 2);
      const speed = kind === "light" ? random(8, 28) : random(25, 105);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (kind === "celebrate" ? 28 : 0),
        life: random(0.35, kind === "mist" ? 1.2 : 0.85),
        maxLife: 1,
        size: random(1.5, kind === "mist" ? 8 : 4.5),
        color: colors[kind][Math.floor(Math.random() * colors[kind].length)],
        kind,
      });
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.kind === "splash" || particle.kind === "celebrate") particle.vy += 75 * dt;
      particle.vx *= Math.pow(0.4, dt);
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  render() {
    const ctx = this.ctx;
    const shakeAmount = this.gentleMotion ? Math.min(1, this.cameraShake) : this.cameraShake;
    const shakeX = shakeAmount ? random(-shakeAmount, shakeAmount) : 0;
    const shakeY = shakeAmount ? random(-shakeAmount * 0.55, shakeAmount * 0.55) : 0;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(shakeX, shakeY);
    this.drawSky(ctx);
    this.drawDistantSea(ctx);
    this.drawConclusionDawn(ctx);
    this.drawHarbor(ctx);
    this.drawConclusionHarbor(ctx);
    this.drawBeam(ctx);
    this.drawClouds(ctx);
    this.drawLightning(ctx);
    this.drawFogs(ctx);
    this.drawBeacons(ctx);
    this.drawReefs(ctx);
    this.drawBoats(ctx);
    this.drawWaves(ctx);
    this.drawForegroundSea(ctx);
    this.drawLighthouse(ctx);
    this.drawRain(ctx);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawConclusionCaption(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,245,203,${this.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawSky(ctx) {
    const act = this.state === "title" ? 0 : this.act;
    const gradients = [
      ["#102f4a", "#527f8c"],
      ["#0b243b", "#395566"],
      ["#071628", "#26384e"],
    ];
    const gradient = ctx.createLinearGradient(0, 0, 0, 390);
    gradient.addColorStop(0, gradients[act][0]);
    gradient.addColorStop(1, gradients[act][1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    if (this.state === "playing" && act < 2) {
      ctx.fillStyle = `rgba(3,14,26,${act === 0 ? 0.13 : 0.2})`;
      ctx.fillRect(0, 0, W, H);
    }

    const moonX = act === 2 ? 790 : 790 - act * 80;
    const moonY = act === 2 ? 88 : 104;
    const moonRadius = act === 2 ? 35 : 45;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 2, moonX, moonY, moonRadius * 2.4);
    moonGlow.addColorStop(0, "rgba(255,239,181,.9)");
    moonGlow.addColorStop(.32, "rgba(255,226,148,.35)");
    moonGlow.addColorStop(1, "rgba(255,226,148,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = act === 2 ? "#c5d2ce" : "#ffe8a8";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    ctx.fill();

    for (const star of this.stars) {
      const alpha = act === 2 ? 0.15 : 0.38 + Math.sin(performance.now() * 0.0018 + star.phase) * 0.25;
      ctx.fillStyle = `rgba(255,244,196,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    const horizon = ctx.createLinearGradient(0, 260, 0, 385);
    horizon.addColorStop(0, "rgba(255,204,123,0)");
    horizon.addColorStop(1, act === 2 ? "rgba(103,126,139,.08)" : "rgba(255,196,111,.16)");
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 235, W, 155);
  }

  drawClouds(ctx) {
    const act = this.state === "title" ? 0 : this.act;
    const clearing = this.state === "conclusion" ? ease((this.conclusionClock - 0.7) / 5.2) : 0;
    for (const cloud of this.clouds) {
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      const stormCloud = act === 2 ? "26,39,55" : (act === 1 ? "47,65,76" : "67,88,99");
      const cloudAlpha = (cloud.alpha + [0.1, 0.14, 0.17][act]) * (1 - clearing * 0.88);
      ctx.fillStyle = `rgba(${clearing > 0.45 ? "215,225,218" : stormCloud},${cloudAlpha})`;
      for (let index = 0; index < 5; index += 1) {
        ctx.beginPath();
        ctx.ellipse(index * 28, Math.sin(index * 1.7) * 7, 38, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawConclusionDawn(ctx) {
    if (this.state !== "conclusion") return;
    const amount = ease((this.conclusionClock - 0.7) / 5.2);
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = amount * 0.82;
    const dawn = ctx.createLinearGradient(0, 0, 0, H);
    dawn.addColorStop(0, "#4b9ec4");
    dawn.addColorStop(0.52, "#ffc875");
    dawn.addColorStop(1, "#246e82");
    ctx.fillStyle = dawn;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = amount;
    const sunGlow = ctx.createRadialGradient(790, 100, 4, 790, 100, 100);
    sunGlow.addColorStop(0, "rgba(255,247,191,.9)");
    sunGlow.addColorStop(1, "rgba(255,211,112,0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(790, 100, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLightning(ctx) {
    if (this.lightning <= 0 || this.state !== "playing") return;
    const alpha = clamp(this.lightning / 0.16, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#fff8d4";
    ctx.shadowColor = "#dff7ff";
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(this.lightningX, -10);
    ctx.lineTo(this.lightningX - 22, 72);
    ctx.lineTo(this.lightningX + 5, 66);
    ctx.lineTo(this.lightningX - 34, 158);
    ctx.lineTo(this.lightningX - 17, 151);
    ctx.lineTo(this.lightningX - 48, 238);
    ctx.stroke();
    ctx.restore();
  }

  drawDistantSea(ctx) {
    const act = this.state === "title" ? 0 : this.act;
    const gradient = ctx.createLinearGradient(0, SEA_HORIZON, 0, H);
    gradient.addColorStop(0, act === 2 ? "#183d55" : "#1f6580");
    gradient.addColorStop(1, act === 2 ? "#071d34" : "#0a3958");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, SEA_HORIZON, W, H - SEA_HORIZON);

    ctx.lineWidth = 2;
    for (let row = 0; row < 8; row += 1) {
      const y = SEA_HORIZON + 18 + row * 25;
      ctx.strokeStyle = `rgba(185,239,240,${0.05 + row * 0.007})`;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 20) {
        const wave = Math.sin(x * 0.025 + performance.now() * 0.0015 + row) * (2 + row * 0.3);
        if (x === -20) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "#102b3c";
    ctx.beginPath();
    ctx.moveTo(0, 402);
    ctx.quadraticCurveTo(80, 380, 165, 414);
    ctx.quadraticCurveTo(250, 438, 335, 406);
    ctx.quadraticCurveTo(420, 380, 520, 420);
    ctx.quadraticCurveTo(625, 446, 715, 405);
    ctx.quadraticCurveTo(815, 380, 960, 414);
    ctx.lineTo(960, 540);
    ctx.lineTo(0, 540);
    ctx.closePath();
    ctx.fill();
  }

  drawHarbor(ctx) {
    const lights = clamp(this.progress.totalRescued, 0, 8);
    const buildings = [
      { x: 18, y: 355, w: 34, h: 32 },
      { x: 55, y: 342, w: 42, h: 45 },
      { x: 101, y: 351, w: 31, h: 36 },
      { x: 136, y: 333, w: 44, h: 54 },
    ];
    ctx.save();
    ctx.fillStyle = "rgba(5,22,35,.82)";
    ctx.fillRect(0, 381, 192, 9);
    buildings.forEach((building, index) => {
      ctx.fillStyle = index % 2 ? "#102c3c" : "#0b2535";
      ctx.fillRect(building.x, building.y, building.w, building.h);
      ctx.beginPath();
      ctx.moveTo(building.x - 4, building.y);
      ctx.lineTo(building.x + building.w / 2, building.y - 15);
      ctx.lineTo(building.x + building.w + 4, building.y);
      ctx.closePath();
      ctx.fill();
      for (let windowIndex = 0; windowIndex < 2; windowIndex += 1) {
        const lightIndex = index * 2 + windowIndex;
        const lit = lightIndex < lights;
        const x = building.x + 8 + windowIndex * Math.max(13, building.w - 19);
        const y = building.y + 12;
        if (lit) {
          const glow = ctx.createRadialGradient(x + 4, y + 4, 1, x + 4, y + 4, 18);
          glow.addColorStop(0, "rgba(255,224,125,.45)");
          glow.addColorStop(1, "rgba(255,224,125,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x + 4, y + 4, 18, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = lit ? "#ffe28c" : "#294454";
        ctx.fillRect(x, y, 8, 9);
      }
    });
    ctx.strokeStyle = "rgba(191,233,225,.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 391);
    ctx.lineTo(205, 391);
    ctx.stroke();
    ctx.restore();
  }

  drawConclusionHarbor(ctx) {
    if (this.state !== "conclusion") return;
    const arrival = ease((this.conclusionClock - 3.1) / 2.2);
    if (arrival <= 0) return;
    const time = performance.now() * 0.001;
    ctx.save();
    ctx.globalAlpha = arrival;

    const anchoredBoats = [225, 305, 382];
    anchoredBoats.forEach((x, index) => {
      const y = 390 + Math.sin(time * 1.8 + index) * 2;
      ctx.fillStyle = index === 2 ? "#315166" : "#8c4935";
      ctx.beginPath();
      ctx.moveTo(x - 26, y);
      ctx.lineTo(x + 28, y);
      ctx.lineTo(x + 17, y + 13);
      ctx.lineTo(x - 17, y + 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe4a3";
      ctx.fillRect(x - 12, y - 12, 22, 12);
      ctx.fillStyle = "#fff5bf";
      ctx.fillRect(x - 7, y - 8, 5, 5);
      ctx.fillRect(x + 3, y - 8, 5, 5);
    });

    const people = [35, 62, 91, 124, 157, 190, 220, 251, 282, 316];
    people.forEach((x, index) => {
      const baseY = 389 - (index % 3) * 3;
      const wave = Math.sin(time * 5 + index * 1.7) * 5;
      ctx.strokeStyle = index % 2 ? "#d96c52" : "#4f8091";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, baseY - 13);
      ctx.lineTo(x, baseY);
      ctx.moveTo(x, baseY - 9);
      ctx.lineTo(x - 6, baseY - 15 - wave);
      ctx.moveTo(x, baseY - 9);
      ctx.lineTo(x + 6, baseY - 15 + wave);
      ctx.stroke();
      ctx.fillStyle = ["#d49a6a", "#8a5a43", "#e2b88b"][index % 3];
      ctx.beginPath();
      ctx.arc(x, baseY - 18, 5, 0, Math.PI * 2);
      ctx.fill();
      if (index % 3 === 0) {
        const glow = ctx.createRadialGradient(x - 7, baseY - 19 - wave, 1, x - 7, baseY - 19 - wave, 13);
        glow.addColorStop(0, "rgba(255,236,145,.75)");
        glow.addColorStop(1, "rgba(255,213,93,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x - 7, baseY - 19 - wave, 13, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  drawConclusionCaption(ctx) {
    if (this.state !== "conclusion") return;
    const moments = [
      { start: 0.35, end: 2.8, text: "The last signal holds." },
      { start: 2.7, end: 5.6, text: "The storm loosens its grip." },
      { start: 5.5, end: 8.2, text: "Every light led someone home." },
    ];
    const moment = moments.find((item) => this.conclusionClock >= item.start && this.conclusionClock < item.end);
    if (!moment) return;
    const fadeIn = clamp((this.conclusionClock - moment.start) / 0.45, 0, 1);
    const fadeOut = clamp((moment.end - this.conclusionClock) / 0.55, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(3,18,30,.62)";
    ctx.fillRect(270, 36, 420, 54);
    ctx.fillStyle = "#fff5cc";
    ctx.font = "900 23px Georgia, serif";
    ctx.fillText(moment.text, W / 2, 70);
    ctx.restore();
  }

  drawBeam(ctx) {
    const origin = this.beamOrigin();
    const length = this.beamOcclusionDistance();
    const spread = 0.125;
    const end1 = {
      x: origin.x + Math.cos(this.lighthouse.aim - spread) * length,
      y: origin.y + Math.sin(this.lighthouse.aim - spread) * length,
    };
    const end2 = {
      x: origin.x + Math.cos(this.lighthouse.aim + spread) * length,
      y: origin.y + Math.sin(this.lighthouse.aim + spread) * length,
    };
    const gradient = ctx.createLinearGradient(origin.x, origin.y, origin.x + Math.cos(this.lighthouse.aim) * length, origin.y + Math.sin(this.lighthouse.aim) * length);
    gradient.addColorStop(0, "rgba(255,245,181,.68)");
    gradient.addColorStop(.45, "rgba(255,227,130,.28)");
    gradient.addColorStop(1, "rgba(255,227,130,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(end1.x, end1.y);
    ctx.lineTo(end2.x, end2.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,247,196,.75)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + Math.cos(this.lighthouse.aim) * length, origin.y + Math.sin(this.lighthouse.aim) * length);
    ctx.stroke();
  }

  drawFogs(ctx) {
    for (const fog of this.fogs) {
      const dissolve = clamp(fog.strength / fog.need, 0, 1);
      ctx.save();
      ctx.translate(fog.x, fog.y);
      ctx.globalAlpha = 1 - dissolve * 0.72;
      for (let index = 0; index < 10; index += 1) {
        const angle = index / 10 * Math.PI * 2 + fog.phase * (index % 2 ? .12 : -.09);
        const radius = fog.size * (0.18 + (index % 3) * .16);
        const x = Math.cos(angle) * fog.size * .32;
        const y = Math.sin(angle) * fog.size * .18;
        const mist = ctx.createRadialGradient(x, y, 2, x, y, radius);
        mist.addColorStop(0, "rgba(191,209,208,.76)");
        mist.addColorStop(1, "rgba(87,111,119,0)");
        ctx.fillStyle = mist;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,244,181,${0.16 + dissolve * .55})`;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + dissolve * 12, 0, Math.PI * 2);
      ctx.fill();
      this.drawProgressRing(ctx, 0, 0, 28, dissolve, "#ffe396");
      ctx.restore();
    }
  }

  drawBeacons(ctx) {
    for (let beaconIndex = 0; beaconIndex < this.beacons.length; beaconIndex += 1) {
      const beacon = this.beacons[beaconIndex];
      const relayTarget = this.state === "playing"
        && this.act === 2
        && this.progress.beaconsLit >= 3
        && this.progress.shipGuidance < 3
        && beaconIndex === Math.floor(this.progress.shipGuidance);
      ctx.save();
      ctx.translate(beacon.x, beacon.y);
      if (relayTarget) {
        const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.12;
        ctx.strokeStyle = "rgba(255,226,140,.9)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 18, 70 * pulse, 20 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fff2ad";
        ctx.font = "900 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`STAND HERE · LINK ${beaconIndex + 1}`, 0, 50);
      }
      ctx.fillStyle = "#071724";
      ctx.beginPath();
      ctx.moveTo(-28, 17);
      ctx.lineTo(-13, -43);
      ctx.lineTo(13, -43);
      ctx.lineTo(28, 17);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#35526a";
      ctx.fillRect(-15, -50, 30, 14);
      ctx.fillStyle = beacon.lit ? "#fff3a9" : "#6d7c80";
      ctx.fillRect(-9, -47, 18, 8);
      if (beacon.lit || beacon.charge > 0) {
        const alpha = beacon.lit ? .55 + Math.sin(beacon.phase * 2) * .1 : beacon.charge * .4;
        const glow = ctx.createRadialGradient(0, -45, 2, 0, -45, 52);
        glow.addColorStop(0, `rgba(255,239,155,${alpha})`);
        glow.addColorStop(1, "rgba(255,220,120,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, -45, 52, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!beacon.lit && beacon.charge > 0) this.drawProgressRing(ctx, 0, -45, 21, beacon.charge, "#ffe396");
      ctx.restore();
    }
  }

  drawReefs(ctx) {
    const time = performance.now() * 0.001;
    for (const reef of this.reefs) {
      const threatened = this.boats.some((boat) => boat.warning > 0 && boat.x > reef.x - 35 && boat.x < reef.x + 170 && Math.abs(boat.y - reef.y) < reef.radius + 70);
      ctx.save();
      ctx.translate(reef.x, reef.y);
      ctx.fillStyle = "rgba(182,235,234,.28)";
      ctx.beginPath();
      ctx.ellipse(0, reef.radius * 0.42, reef.radius * 1.45, reef.radius * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      const rockGradient = ctx.createLinearGradient(-reef.radius, -reef.radius, reef.radius, reef.radius);
      rockGradient.addColorStop(0, "#52666a");
      rockGradient.addColorStop(.48, "#263e47");
      rockGradient.addColorStop(1, "#122936");
      ctx.fillStyle = rockGradient;
      ctx.beginPath();
      for (let index = 0; index < reef.spikes; index += 1) {
        const angle = index / reef.spikes * Math.PI * 2 - Math.PI / 2;
        const jag = index % 2 ? .72 : 1;
        const radius = reef.radius * jag;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * .72;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(222,245,234,.34)";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (threatened) {
        const pulse = 1 + Math.sin(time * 8 + reef.phase) * .12;
        ctx.strokeStyle = "rgba(255,119,91,.9)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, (reef.radius + 13) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fff2c7";
        ctx.font = "900 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("!", 0, -reef.radius - 20);
      }
      ctx.restore();
    }
  }

  drawBoats(ctx) {
    for (const boat of this.boats) {
      const bob = Math.sin(boat.bob) * 3;
      ctx.save();
      if (this.act === 1 && !boat.revealed) ctx.globalAlpha = 0.28;
      ctx.translate(boat.x, boat.y + bob);
      ctx.scale(boat.scale, boat.scale);

      if (boat.hit) {
        const glow = ctx.createRadialGradient(0, -14, 1, 0, -14, 60);
        glow.addColorStop(0, "rgba(255,241,166,.46)");
        glow.addColorStop(1, "rgba(255,220,110,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, -14, 60, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = boat.kind === "great" ? "#1e3142" : "#4d3429";
      ctx.beginPath();
      ctx.moveTo(-43, 2);
      ctx.lineTo(42, 2);
      ctx.lineTo(27, 22);
      ctx.lineTo(-27, 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = boat.kind === "great" ? "#d5c5a1" : "#d68154";
      ctx.fillRect(-30, -5, 55, 9);

      if (boat.kind === "sail") {
        ctx.strokeStyle = "#33261f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(0, -62);
        ctx.stroke();
        ctx.fillStyle = "#f2ddb4";
        ctx.beginPath();
        ctx.moveTo(-2, -58);
        ctx.lineTo(-2, -12);
        ctx.lineTo(-37, -14);
        ctx.closePath();
        ctx.fill();
      } else {
        const cabins = boat.kind === "great" ? 4 : 2;
        ctx.fillStyle = boat.kind === "great" ? "#e1d4b7" : "#f0d8ad";
        ctx.fillRect(-23, boat.kind === "great" ? -37 : -24, boat.kind === "great" ? 58 : 38, boat.kind === "great" ? 33 : 20);
        for (let index = 0; index < cabins; index += 1) {
          ctx.fillStyle = boat.hit ? "#ffe594" : "#607681";
          ctx.fillRect(-17 + index * 14, boat.kind === "great" ? -29 : -18, 8, 7);
        }
        if (boat.kind === "great") {
          ctx.fillStyle = "#263d4d";
          ctx.fillRect(-3, -57, 9, 21);
          ctx.fillStyle = "rgba(222,229,218,.32)";
          ctx.beginPath();
          ctx.arc(1, -64, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.strokeStyle = "rgba(185,239,240,.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(35, 22);
      ctx.quadraticCurveTo(52, 28, 68, 20);
      ctx.stroke();

      const amount = clamp(boat.guided / boat.need, 0, 1);
      if (amount < 1) {
        this.drawProgressRing(ctx, 0, -76 / boat.scale, 16 / boat.scale, amount, boat.hit ? "#ffe396" : "rgba(255,255,255,.5)");
      } else if (this.act === 0 && boat.courseSet) {
        ctx.fillStyle = "#fff2ad";
        ctx.font = `900 ${11 / boat.scale}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("COURSE SET", 0, -72 / boat.scale);
      }
      if (boat.warning > 0) {
        ctx.fillStyle = "#ef725e";
        ctx.beginPath();
        ctx.arc(27 / boat.scale, -72 / boat.scale, 10 / boat.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = `900 ${13 / boat.scale}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("!", 27 / boat.scale, -67.5 / boat.scale);
      }
      ctx.restore();
    }
  }

  drawProgressRing(ctx, x, y, radius, amount, color) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(5,23,40,.45)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(amount, 0, 1));
    ctx.stroke();
    ctx.restore();
  }

  drawWaves(ctx) {
    for (const wave of this.waves) {
      ctx.save();
      ctx.translate(wave.x, 402);
      ctx.fillStyle = "rgba(102,183,200,.72)";
      ctx.beginPath();
      ctx.moveTo(-wave.width, 25);
      ctx.bezierCurveTo(-wave.width * .5, -30, 0, -58, wave.width * .55, -5);
      ctx.bezierCurveTo(wave.width * .2, -20, wave.width * .05, 0, wave.width, 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(225,252,247,.82)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-wave.width * .5, -11);
      ctx.quadraticCurveTo(0, -58, wave.width * .5, -5);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawForegroundSea(ctx) {
    const time = performance.now() * 0.001;
    ctx.fillStyle = "rgba(5,26,45,.64)";
    ctx.beginPath();
    ctx.moveTo(0, 438);
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, 438 + Math.sin(x * .025 + time * 1.8) * 5);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(185,239,240,.34)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const y = 437 + Math.sin(x * .025 + time * 1.8) * 5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLighthouse(ctx) {
    const house = this.lighthouse;
    const moving = Math.abs(house.vx) > 18;
    const walkBob = moving ? Math.sin(house.walkPhase * 2) * 4 : Math.sin(performance.now() * .0018) * 1.2;
    ctx.save();
    ctx.translate(house.x, house.y + walkBob);

    const reflection = ctx.createLinearGradient(0, -10, 0, 60);
    reflection.addColorStop(0, "rgba(255,214,112,.2)");
    reflection.addColorStop(1, "rgba(255,214,112,0)");
    ctx.fillStyle = reflection;
    ctx.beginPath();
    ctx.ellipse(0, 28, 55, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const legSwing = moving ? Math.sin(house.walkPhase * 2) * 12 : 0;
    ctx.strokeStyle = "#142b38";
    ctx.lineWidth = 13;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-22 + legSwing, 19);
    ctx.lineTo(-34 + legSwing, 30);
    ctx.moveTo(18, -6);
    ctx.lineTo(22 - legSwing, 19);
    ctx.lineTo(34 - legSwing, 30);
    ctx.stroke();
    ctx.strokeStyle = "#d2e0d5";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-22 + legSwing, 18);
    ctx.moveTo(18, -6);
    ctx.lineTo(22 - legSwing, 18);
    ctx.stroke();

    const bodyGradient = ctx.createLinearGradient(-35, 0, 34, 0);
    bodyGradient.addColorStop(0, "#ddd6b6");
    bodyGradient.addColorStop(.45, "#fff1c9");
    bodyGradient.addColorStop(1, "#b8ae93");
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(-35, 0);
    ctx.lineTo(-24, -89);
    ctx.quadraticCurveTo(0, -101, 24, -89);
    ctx.lineTo(35, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d85f4e";
    ctx.beginPath();
    ctx.moveTo(-30, -41);
    ctx.lineTo(30, -41);
    ctx.lineTo(27, -62);
    ctx.lineTo(-27, -62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ef725e";
    ctx.fillRect(-25, -24, 53, 13);

    ctx.fillStyle = "#1a3948";
    ctx.beginPath();
    ctx.roundRect(-9, -34, 18, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#ffc85a";
    ctx.beginPath();
    ctx.arc(5, -17, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#142b38";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-34, -91);
    ctx.lineTo(34, -91);
    ctx.stroke();
    ctx.fillStyle = "#274252";
    ctx.fillRect(-30, -111, 60, 21);
    ctx.fillStyle = "#fff2ad";
    ctx.fillRect(-21, -107, 42, 13);

    const lampGlow = ctx.createRadialGradient(0, -101, 1, 0, -101, 42 + house.glow * 14);
    lampGlow.addColorStop(0, `rgba(255,249,196,${.75 + house.glow * .2})`);
    lampGlow.addColorStop(1, "rgba(255,214,103,0)");
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(0, -101, 52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d85f4e";
    ctx.beginPath();
    ctx.moveTo(-37, -112);
    ctx.lineTo(0, -134);
    ctx.lineTo(37, -112);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffc85a";
    ctx.beginPath();
    ctx.arc(0, -134, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-17, -105);
    ctx.lineTo(-14, -94);
    ctx.stroke();
    ctx.restore();
  }

  drawRain(ctx) {
    if (!this.rain.length) return;
    ctx.strokeStyle = this.act === 2 ? "rgba(190,224,229,.36)" : "rgba(190,224,229,.18)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const drop of this.rain) {
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.length * .22, drop.y + drop.length);
    }
    ctx.stroke();
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / Math.max(.01, particle.maxLife), 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      if (particle.kind === "mist") {
        ctx.arc(particle.x, particle.y, particle.size * (1 + (1 - particle.life) * 1.4), 0, Math.PI * 2);
      } else {
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }
}

window.__LIGHTHOUSE_GAME__ = new LighthouseGame();
