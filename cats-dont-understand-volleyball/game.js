(() => {
  'use strict';

  const W = 960, H = 540, FLOOR = 452, NET_X = 480, NET_TOP = 238;
  const MATCH_TARGET = 25;
  const SAVE_KEY = 'cats-volleyball-progress-v1';
  const PREF_KEY = 'cats-volleyball-prefs-v1';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const shell = $('gameShell');

  const ui = {
    hud: $('hud'), catScore: $('catScore'), rivalScore: $('rivalScore'), rivalName: $('rivalName'),
    setLabel: $('setLabel'), rallyLabel: $('rallyLabel'), zoomiesFill: $('zoomiesFill'), activeCatName: $('activeCatName'), callout: $('callout'), hint: $('hint'),
    title: $('titleOverlay'), brief: $('briefOverlay'), pause: $('pauseOverlay'), results: $('resultsOverlay'), final: $('finalOverlay'),
    settings: $('settingsOverlay'), confirm: $('confirmOverlay'), endlessButton: $('endlessButton'), chaosButton: $('chaosButton'), chaosRules: $('chaosRules'), startButton: $('startButton'),
  };

  const sets = [
    {
      name: 'BALL IS PREY', eyebrow: 'CHAMPIONSHIP · OPENING LINEUP', mascot: 'ฅ^•ﻌ•^ฅ', rival: 'PIGEONS',
      text: 'Drag left or right to move Miso directly. Get under the ball, then tap anywhere to pounce it over the net.',
      rule: `One set, first to ${MATCH_TARGET}. Tap to pounce. Tap again near a high ball to SMASH, or jump at the net to BLOCK.`, button: 'I BELIEVE IN MISO', cats: 1,
      sky: ['#574d8f', '#f2a65a'], court: '#e7c68b', rivalColor: '#e4e1d6'
    },
    {
      name: 'TEAMWORK, ALLEGEDLY', eyebrow: 'CHAMPIONSHIP · DOUBLES', mascot: 'ฅ^•ﻌ•^ฅ  ฅ^•ﻌ•^ฅ', rival: 'CORGIS',
      text: 'Luna joined the team. You directly move the selected cat; Luna reads the ball and covers the open court.',
      rule: 'Switch cats with ↻ or Q. Teammates defend automatically, but only the selected cat pounces on command.', button: 'DEPLOY THE TEAM', cats: 2,
      sky: ['#328b92', '#d9d17f'], court: '#d9b87b', rivalColor: '#d99a58'
    },
    {
      name: 'THE GRAND FUR-NAL', eyebrow: 'CHAMPIONSHIP · FINAL LINEUP', mascot: 'ฅ^•ﻌ•^ฅ  ฅ^•ﻌ•^ฅ  ฅ^•ﻌ•^ฅ', rival: 'PROS',
      text: 'Beans makes three. Switch between cats while your teammates cover their zones, then build ZOOMIES with clean hits.',
      rule: 'At full Zoomies, every cat becomes faster and their pounces hit with championship power.', button: 'MAKE SPORTS HISTORY', cats: 3,
      sky: ['#19162e', '#69467c'], court: '#bd8d6d', rivalColor: '#f3f0e8'
    }
  ];

  const colors = ['#63d6b6', '#ff8a66', '#f4d46c'];
  const catNames = ['MISO', 'LUNA', 'BEANS'];
  let state = 'title';
  let beforePause = 'play';
  let currentSet = 0;
  let endless = false;
  let chaotic = false;
  let score = [0, 0];
  let rally = 0;
  let bestRally = 0;
  let totalBest = 0;
  let pounces = 0;
  let setPounces = 0;
  let journeyStart = 0;
  let elapsedSaved = 0;
  let pointTimer = 0;
  let serveTimer = 0;
  let server = 0;
  let zoomies = 0;
  let zoomiesActive = 0;
  let shake = 0;
  let flash = 0;
  let floorBounces = 0;
  let lastSide = -1;
  let ballTrail = [];
  let particles = [];
  let cats = [];
  let rivals = [];
  let confetti = [];
  let hitCooldown = 0;
  let controlledCat = 0;
  let activeChaosRules = [];
  let chaosRuleCount = 0;
  let chaosWind = 1;
  let crab = null;
  let chaosUiTick = 0;
  let smashPrompted = false;
  let blockPrompted = false;
  let pendingPhase = null;
  let championshipLost = false;
  let saveProgress = loadJSON(SAVE_KEY, { version: 1, set: 0, completed: false, bestRally: 0, totalPounces: 0, elapsed: 0 });
  let prefs = loadJSON(PREF_KEY, { version: 1, volume: .8, gentle: false, chaosBalls: 2 });
  const pointer = { active: false, activeId: null, pulse: 0, startX: 0, startY: 0, moved: false, type: 'mouse', axis: 0 };
  let moveAxis = 0;
  const keys = new Set();

  const chaosDeck = [
    {type:'moon', name:'MOON PAWS', desc:'Floaty jumps & ball'},
    {type:'beach', name:'BEACH BALL', desc:'Huge, slow volleyball'},
    {type:'turbo', name:'TINY TURBO', desc:'Small and very fast'},
    {type:'wind', name:'SIDEWAYS WIND', desc:'The breeze has opinions'},
    {type:'rubber', name:'RUBBER SAND', desc:'Both sides get a bounce'},
    {type:'crab', name:'CRAB REFEREE', desc:'May interfere freely'},
    {type:'zoomies', name:'DOUBLE ZOOMIES', desc:'Everybody goes faster'}
  ];

  let audio = null;
  class Sound {
    constructor() { this.ctx = null; this.master = null; this.compressor = null; this.nextBeat = 0; this.musicStep = 0; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.compressor=this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value=-18;this.compressor.knee.value=16;this.compressor.ratio.value=5;this.compressor.attack.value=.006;this.compressor.release.value=.18;
        this.master.gain.value = prefs.volume * .68;
        this.master.connect(this.compressor);this.compressor.connect(this.ctx.destination);
        this.ctx.resume?.();
      } catch (_) {}
    }
    volume(v) { prefs.volume = v; if (this.master) this.master.gain.setTargetAtTime(v * .68, this.ctx.currentTime, .02); savePrefs(); }
    tone(freq, dur=.08, type='sine', gain=.25, slide=0) {
      if (!this.ctx || prefs.volume <= 0) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(35, freq + slide), t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
    }
    noise(dur=.06, gain=.1, cutoff=1500, filterType='lowpass') {
      if (!this.ctx || prefs.volume <= 0) return;
      const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i=0;i<n;i++) d[i] = Math.random()*2-1;
      const s=this.ctx.createBufferSource(), f=this.ctx.createBiquadFilter(), g=this.ctx.createGain();s.buffer=b;f.type=filterType;f.frequency.value=cutoff;g.gain.setValueAtTime(gain,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+dur);s.connect(f);f.connect(g);g.connect(this.master);s.start();
    }
    impactBody(freq, dur, gain, delay=0, drop=.58) {
      if (!this.ctx || prefs.volume <= 0) return;
      const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type='sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(42,freq*drop),t+dur);
      g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(gain,t+.003);g.gain.exponentialRampToValueAtTime(.001,t+dur);
      o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.01);
    }
    impactNoise(dur, gain, frequency, filterType='bandpass', q=.8, delay=0) {
      if (!this.ctx || prefs.volume <= 0) return;
      const t=this.ctx.currentTime+delay,n=Math.max(1,Math.floor(this.ctx.sampleRate*dur)),b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);
      for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,.45);
      const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=b;f.type=filterType;f.frequency.value=frequency;f.Q.value=q;
      g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(gain,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+dur);
      s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+dur+.01);
    }
    hit(power=1) {
      const strength=Math.max(.65,Math.min(1.3,power)),variation=.94+Math.random()*.12;
      this.impactBody((138+strength*20)*variation,.12,.13+strength*.045,0,.62);
      this.impactBody(255*variation,.065,.035+strength*.018,.004,.72);
      this.impactNoise(.06,.065+strength*.025,1050*variation,'bandpass',.9);
    }
    point(win) { [0,.11,.23].forEach((d,i)=>setTimeout(()=>this.tone((win?[392,523,659]:[330,277,220])[i],.2,'triangle',.28),d*1000));if(win)setTimeout(()=>this.crowd(),120); }
    ui() { this.tone(520,.055,'triangle',.18,90); }
    meow(pitch=1) { this.tone(390*pitch,.1,'sawtooth',.18,-70);setTimeout(()=>this.tone(540*pitch,.15,'triangle',.16,-150),60); }
    step(pitch=1) { this.tone(95*pitch,.035,'triangle',.07,-22);this.noise(.025,.035,700); }
    serve() { this.tone(760,.09,'sine',.18,-180);setTimeout(()=>this.tone(980,.07,'triangle',.11,-260),55); }
    sting() { [262,330,392,523].forEach((f,i)=>setTimeout(()=>this.tone(f,.19,'triangle',.16),i*65));setTimeout(()=>this.noise(.12,.09,3200,'highpass'),170); }
    crowd() { this.noise(.34,.055,1100);this.tone(220,.18,'sawtooth',.035,90); }
    rule() { this.tone(175,.11,'square',.16,350);setTimeout(()=>this.tone(700,.16,'sawtooth',.13,-260),90);this.noise(.12,.08,2400); }
    smash() {
      const variation=.95+Math.random()*.1;
      this.impactBody(112*variation,.155,.28,0,.48);
      this.impactBody(235*variation,.09,.11,.003,.62);
      this.impactNoise(.072,.21,2050*variation,'bandpass',.7);
      this.impactNoise(.13,.075,900,'highpass',.55,.008);
    }
    block() {
      const variation=.95+Math.random()*.1;
      this.impactBody(168*variation,.105,.2,0,.58);
      this.impactBody(315*variation,.06,.055,.003,.7);
      this.impactNoise(.052,.15,1650*variation,'bandpass',1.05);
    }
    music() {
      if (!this.ctx || state !== 'play' || prefs.volume <= 0) return;
      const t=this.ctx.currentTime;
      if (t < this.nextBeat) return;
      const seq = currentSet===2 ? [110,165,147,196,110,220,165,147] : [131,196,165,220,131,247,196,165];
      const note=seq[this.musicStep%seq.length];
      this.tone(note,.16,'triangle',.07,-8);
      if(this.musicStep%2===0){this.tone(note*2,.09,'sine',.055,18);this.tone(62,.07,'sine',.13,-25);}
      else this.noise(.045,.035,3600,'highpass');
      if(this.musicStep%8===6)this.tone(note*3,.12,'square',.028,-55);
      if(this.musicStep%16===0)this.noise(.7,.018,520);
      this.musicStep++; this.nextBeat=t+.28;
    }
  }
  audio = new Sound();

  function loadJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? {...fallback, ...v} : fallback; } catch (_) { return fallback; }
  }
  function storeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function savePrefs() { storeJSON(PREF_KEY, prefs); syncPrefs(); }
  function saveGame() {
    saveProgress = {
      version: 1, set: currentSet, completed: !!saveProgress.completed,
      bestRally: Math.max(saveProgress.bestRally || 0, totalBest), totalPounces: (saveProgress.totalPounces || 0),
      elapsed: elapsedSaved + (journeyStart ? (performance.now()-journeyStart)/1000 : 0)
    };
    storeJSON(SAVE_KEY, saveProgress);
    updateTitle();
  }
  function syncPrefs() {
    const value = Math.round(prefs.volume*100);
    $('volumeSlider').value = value; $('titleVolumeSlider').value = value;
    $('volumeOutput').value = value+'%'; $('titleVolumeOutput').value = value+'%';
    $('motionToggle').checked = !!prefs.gentle; $('titleMotionToggle').checked = !!prefs.gentle;
    prefs.chaosBalls=Math.max(1,Math.min(3,Number(prefs.chaosBalls)||2));
    $('chaosBallSelect').value=String(prefs.chaosBalls);$('titleChaosBallSelect').value=String(prefs.chaosBalls);
    $('muteButton').textContent = prefs.volume > 0 ? '♪' : '×';
  }
  function updateTitle() {
    ui.endlessButton.classList.toggle('hidden', !saveProgress.completed);
    ui.chaosButton.classList.toggle('hidden', !saveProgress.completed);
    ui.startButton.textContent = saveProgress.completed ? 'REPLAY CHAMPIONSHIP' : 'START COACHING';
  }

  class Cat {
    constructor(x, index) {
      this.x=x; this.y=FLOOR; this.vx=0; this.vy=0; this.index=index; this.color=colors[index]; this.grounded=true;
      this.face=1;this.blink=0;this.squash=0;this.cool=0;this.hitGlow=0;this.stepTime=0;this.smashing=0;
    }
    update(dt) {
      this.cool=Math.max(0,this.cool-dt);this.stepTime=Math.max(0,this.stepTime-dt);this.hitGlow=Math.max(0,this.hitGlow-dt);this.smashing=Math.max(0,this.smashing-dt);this.squash*=Math.pow(.001,dt);
      this.blink -= dt; if (this.blink < -Math.random()*3) this.blink=.12;
      const selected = this.index===controlledCat;
      const homeZones = cats.length===1 ? [225] : cats.length===2 ? [155,350] : [105,255,410];
      let target = homeZones[this.index];
      if (!selected && ball && ball.x<NET_X && ball.served) {
        const timeToFloor = ball.vy > 0 ? Math.max(0, (FLOOR-ball.y)/(ball.vy+1)) : .55;
        const landing = Math.max(55,Math.min(NET_X-50,ball.x+ball.vx*timeToFloor));
        const otherAI = cats.filter(c=>c.index!==controlledCat);
        const closestAI = otherAI.reduce((best,c)=>Math.abs(c.x-landing)<Math.abs(best.x-landing)?c:best,otherAI[0]);
        if (closestAI===this) target=landing;
        if (this.grounded && this.cool<=0 && ball.y>245 && ball.y<FLOOR-34 && Math.abs(ball.x-this.x)<78) this.pounce(true);
      }
      if (this.grounded) {
        const max=zoomiesActive>0||chaosHas('zoomies')?330:235; this.vx=Math.max(-max,Math.min(max,this.vx));
        const targetDelta=target-this.x;
        const desiredVelocity=selected?moveAxis*max:(Math.abs(targetDelta)>16?Math.max(-max,Math.min(max,targetDelta*6)):0);
        const response=1-Math.exp(-(selected?(desiredVelocity===0?40:22):12)*dt);
        this.vx+=(desiredVelocity-this.vx)*response;
        if(desiredVelocity===0&&Math.abs(this.vx)<4)this.vx=0;
        if(Math.abs(desiredVelocity)>30)this.face=Math.sign(desiredVelocity);
        if(selected&&Math.abs(this.vx)>78&&this.stepTime<=0){audio.step(.92+this.index*.08);this.stepTime=.19;}
      } else {
        this.vy += 980*dt; this.vx*=Math.pow(.7,dt);
      }
      this.x += this.vx*dt; this.y += this.vy*dt;
      this.x=Math.max(48,Math.min(NET_X-42,this.x));
      if (this.y>=FLOOR) { if (!this.grounded && this.vy>260) { this.squash=.9; dust(this.x,FLOOR,5,this.color); audio.tone(90,.05,'triangle',.06,-20); } this.y=FLOOR; this.vy=0; this.grounded=true; }
    }
    pounce(automatic=false) {
      if (!this.grounded || this.cool>0) return false;
      this.grounded=false;this.vy=chaosHas('moon')?-700:zoomiesActive>0||chaosHas('zoomies')?-650:-580;this.vx+=automatic?Math.sign((ball?.x||this.x)-this.x)*75:moveAxis*115;this.cool=.38;this.squash=.7;
      if(!automatic){pounces++;setPounces++;audio.meow(.9+this.index*.1);}else audio.tone(330+this.index*45,.05,'triangle',.06,50);
      dust(this.x,FLOOR,7,this.color);
      return true;
    }
    beginSmash() {
      if(this.grounded||this.smashing>0)return false;
      const target=threatBall(0);if(!target||target.dead||!target.served||target.x>=NET_X||target.y>365)return false;
      const dx=target.x-this.x,dy=target.y-(this.y-52);
      if(Math.hypot(dx,dy)>185)return false;
      this.smashing=.46;this.vx=Math.max(-380,Math.min(380,dx*6));this.vy=Math.max(-390,Math.min(70,dy*5));this.cool=.22;this.face=dx>=0?1:-1;
      audio.tone(540,.1,'triangle',.13,260);burst(this.x,this.y-55,this.color,10);return true;
    }
    draw() {
      const x=this.x,y=this.y, airborne=!this.grounded;
      ctx.save(); ctx.translate(x,y); ctx.scale(this.face*.9,.9);
      const run=Math.sin(performance.now()*.018+this.index)*Math.min(1,Math.abs(this.vx)/100);
      const sq=this.squash;
      // selected-player halo and sand shadow
      ctx.save();ctx.scale(this.face,1);ctx.fillStyle='#17152c33';ellipse(0,2,36,8,false);if(this.index===controlledCat){ctx.strokeStyle='#fff4d6';ctx.lineWidth=3;ctx.setLineDash([6,5]);ctx.beginPath();ctx.ellipse(0,1,43,12,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffc857';ctx.beginPath();ctx.moveTo(0,-108);ctx.lineTo(-9,-120);ctx.lineTo(9,-120);ctx.closePath();ctx.fill();ctx.strokeStyle='#17152c';ctx.lineWidth=3;ctx.stroke();}ctx.restore();
      if(this.smashing>0){ctx.globalAlpha=.35+this.smashing;ctx.fillStyle='#ffc857';ctx.beginPath();ctx.arc(0,-54,58,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      if (this.hitGlow>0) { ctx.globalAlpha=this.hitGlow*1.6; ctx.fillStyle='#fff'; ctx.beginPath();ctx.arc(0,-51,52,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1; }
      ctx.lineCap='round';ctx.lineJoin='round';
      // long expressive cat tail
      ctx.strokeStyle='#17152c';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-22,-29);ctx.bezierCurveTo(-54,-31,-60,-67,-38,-79);ctx.bezierCurveTo(-25,-87,-28,-99,-37,-101);ctx.stroke();
      ctx.strokeStyle=this.color;ctx.lineWidth=7;ctx.stroke();
      // athletic torso and jersey
      ctx.fillStyle=this.color;ctx.strokeStyle='#17152c';ctx.lineWidth=5;ellipse(0,-31,31*(1+sq*.13),34*(1-sq*.18),true);
      ctx.fillStyle=this.index===0?'#7655c5':this.index===1?'#e85468':'#3188a8';ctx.beginPath();ctx.moveTo(-27,-42);ctx.quadraticCurveTo(0,-49,27,-42);ctx.lineTo(26,-18);ctx.quadraticCurveTo(0,-8,-26,-18);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff4d6';ctx.font='1000 17px system-ui';ctx.textAlign='center';ctx.fillText(String(this.index+1),1,-22);
      // legs and oversized paws
      ctx.strokeStyle='#17152c';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-15,-13);ctx.lineTo(-19+run*7,airborne?-1:0);ctx.moveTo(15,-13);ctx.lineTo(19-run*7,airborne?-3:0);ctx.stroke();ctx.strokeStyle=this.color;ctx.lineWidth=7;ctx.stroke();
      ctx.fillStyle=this.color;ctx.strokeStyle='#17152c';ctx.lineWidth=4;ellipse(-22+run*7,0,12,7,true);ellipse(22-run*7,0,12,7,true);
      // reaching arms and mitten-like paws
      ctx.strokeStyle='#17152c';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-24,-40);ctx.lineTo(-35,-24+(airborne?-12:0));ctx.moveTo(24,-40);ctx.lineTo(34,-27+(airborne?-15:0));ctx.stroke();ctx.strokeStyle=this.color;ctx.lineWidth=7;ctx.stroke();
      // unmistakable feline head: tall ears, cheeks, muzzle and whiskers
      ctx.fillStyle=this.color;ctx.strokeStyle='#17152c';ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(-30,-60);ctx.lineTo(-31,-99);ctx.lineTo(-11,-82);ctx.quadraticCurveTo(3,-88,18,-81);ctx.lineTo(34,-101);ctx.lineTo(33,-61);ctx.quadraticCurveTo(29,-39,2,-38);ctx.quadraticCurveTo(-25,-39,-30,-60);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#ffb5a6';ctx.beginPath();ctx.moveTo(-27,-92);ctx.lineTo(-15,-81);ctx.lineTo(-27,-76);ctx.closePath();ctx.moveTo(30,-92);ctx.lineTo(19,-80);ctx.lineTo(30,-76);ctx.closePath();ctx.fill();
      ctx.fillStyle='#17152c';if(this.blink>0){ctx.fillRect(-17,-64,10,3);ctx.fillRect(12,-64,10,3);}else{ctx.beginPath();ctx.ellipse(-12,-64,3.5,5,0,0,7);ctx.ellipse(17,-64,3.5,5,0,0,7);ctx.fill();}
      ctx.fillStyle='#fff4d6';ellipse(2,-51,17,11,false);ctx.fillStyle='#ff715b';ctx.beginPath();ctx.moveTo(-3,-56);ctx.lineTo(7,-56);ctx.lineTo(2,-50);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#17152c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(2,-50);ctx.quadraticCurveTo(-2,-44,-8,-48);ctx.moveTo(2,-50);ctx.quadraticCurveTo(7,-44,12,-49);ctx.moveTo(-7,-53);ctx.lineTo(-28,-57);ctx.moveTo(-7,-49);ctx.lineTo(-30,-47);ctx.moveTo(11,-53);ctx.lineTo(32,-58);ctx.moveTo(11,-49);ctx.lineTo(34,-46);ctx.stroke();
      ctx.scale(this.face,1);ctx.fillStyle=this.index===controlledCat?'#fff4d6':'#17152c';ctx.font='1000 10px system-ui';ctx.textAlign='center';ctx.fillText(this.index===controlledCat?`▶ ${catNames[this.index]}`:catNames[this.index],0,19);
      ctx.restore();
    }
  }

  class Rival {
    constructor(x,index) { this.x=x;this.y=FLOOR;this.vx=0;this.vy=0;this.index=index;this.grounded=true;this.cool=0;this.face=-1; }
    update(dt) {
      this.cool=Math.max(0,this.cool-dt);
      const skill=.9+currentSet*.1+(endless?Math.min(.18,rally*.009):0)+(chaosHas('zoomies') ? .18 : 0);
      const home = rivals.length===1 ? 730 : rivals.length===2 ? 620+this.index*235 : 575+this.index*165;
      let target=home, defender=false;
      if(ball && ball.x>NET_X && ball.served){
        const disc=Math.max(0,ball.vy*ball.vy+2*620*(FLOOR-ball.y));
        const flight=Math.max(.05,(-ball.vy+Math.sqrt(disc))/620);
        const landing=Math.max(NET_X+48,Math.min(915,ball.x+ball.vx*flight));
        const best=rivals.reduce((a,b)=>Math.abs(a.x-landing)<Math.abs(b.x-landing)?a:b);
        defender=best===this;if(defender)target=landing;
      }
      if(this.grounded){this.vx+=Math.sign(target-this.x)*980*skill*dt;this.vx*=Math.pow(.025,dt);const max=ball&&ball.y>340&&defender?295:235;this.vx=Math.max(-max,Math.min(max,this.vx));}
      else {this.vy+=980*dt;this.vx*=Math.pow(.7,dt);}
      this.x+=this.vx*dt;this.y+=this.vy*dt;this.x=Math.max(NET_X+42,Math.min(922,this.x));
      if(this.y>=FLOOR){this.y=FLOOR;this.vy=0;this.grounded=true;}
      if(ball&&ball.x>NET_X&&defender&&ball.y>165&&ball.y<FLOOR-14&&Math.abs(ball.x-this.x)<112&&this.grounded&&this.cool<=0){this.vy=chaosHas('moon')?-700:-580-(currentSet*12);this.vx+=Math.sign(ball.x-this.x)*80;this.grounded=false;this.cool=.42;}
    }
    draw() {
      ctx.save();ctx.translate(this.x,this.y);ctx.scale(-.9,.9);
      const c=sets[Math.min(2,currentSet)].rivalColor;
      if(currentSet===0){ // pigeon
        ctx.fillStyle=c;ctx.strokeStyle='#17152c';ctx.lineWidth=5;ellipse(0,-32,30,27,true);ellipse(-2,-62,22,23,true);
        ctx.fillStyle='#17152c';ctx.beginPath();ctx.arc(7,-66,3,0,7);ctx.fill();ctx.fillStyle='#ffb547';ctx.beginPath();ctx.moveTo(17,-61);ctx.lineTo(33,-55);ctx.lineTo(17,-52);ctx.fill();
        ctx.strokeStyle='#ef715b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,-9);ctx.lineTo(-9,2);ctx.moveTo(10,-9);ctx.lineTo(12,2);ctx.stroke();
      } else if(currentSet===1){ // corgi
        ctx.fillStyle=c;ctx.strokeStyle='#17152c';ctx.lineWidth=5;ellipse(0,-31,37,28,true);ctx.beginPath();ctx.moveTo(-26,-54);ctx.lineTo(-26,-88);ctx.lineTo(-7,-69);ctx.lineTo(15,-85);ctx.lineTo(26,-51);ctx.quadraticCurveTo(5,-35,-26,-54);ctx.fill();ctx.stroke();ctx.fillStyle='#fff4d6';ellipse(-2,-50,15,17,false);ctx.fillStyle='#17152c';ctx.beginPath();ctx.arc(-9,-60,3,0,7);ctx.arc(12,-61,3,0,7);ctx.fill();
      } else { // pro mascot robot
        ctx.fillStyle='#f3f0e8';ctx.strokeStyle='#17152c';ctx.lineWidth=5;ctx.fillRect(-28,-75,56,61);ctx.strokeRect(-28,-75,56,61);ctx.fillStyle='#62b6e7';ctx.fillRect(-18,-62,36,17);ctx.fillStyle='#17152c';ctx.fillRect(-10,-58,5,8);ctx.fillRect(7,-58,5,8);ctx.strokeStyle='#f3f0e8';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-17,-13);ctx.lineTo(-20,1);ctx.moveTo(17,-13);ctx.lineTo(20,1);ctx.stroke();ctx.strokeStyle='#17152c';ctx.lineWidth=4;ctx.stroke();
      }
      ctx.restore();
    }
  }

  let ball = null;
  let balls = [];
  function newBall(side=0) {
    const count=chaotic?prefs.chaosBalls:1;
    balls=[];
    for(let i=0;i<count;i++){
      const serveY=165-i*42;
      balls.push({x:side===0?185+i*54:775-i*54,y:serveY,serveY,vx:(side===0?1:-1)*(165+i*34),vy:-45+i*12,r:19,spin:i*.8,served:false,dead:false,floorBounces:0,lastSide:side,index:i});
    }
    ball=balls[0];
    serveTimer=1.05;server=side;floorBounces=0;lastSide=side;rally=0;hitCooldown=0;
    updateHud();
  }

  function threatBall(side){
    const candidates=balls.filter(b=>!b.dead&&b.served&&(side===0?b.x<NET_X:b.x>NET_X));
    if(!candidates.length)return balls.find(b=>!b.dead)||null;
    return candidates.reduce((best,b)=>b.y+(b.vy>0?70:0)>best.y+(best.vy>0?70:0)?b:best);
  }
  function resetSet() {
    score=[0,0];bestRally=0;setPounces=0;zoomies=0;zoomiesActive=0;particles=[];ballTrail=[];activeChaosRules=[];chaosRuleCount=0;crab=null;smashPrompted=false;blockPrompted=false;pendingPhase=null;championshipLost=false;renderChaosRules();
    setupTeams();newBall(0);updateHud();
  }
  function setupTeams() {
    const count=endless||chaotic?2:sets[currentSet].cats;
    controlledCat=0;
    cats=[]; for(let i=0;i<count;i++)cats.push(new Cat(155+i*105,i));
    const rc=endless||chaotic?2:currentSet===0?1:currentSet===1?2:3;
    rivals=[];for(let i=0;i<rc;i++)rivals.push(new Rival(710+i*82,i));
    pointer.axis=0;pointer.active=false;pointer.activeId=null;moveAxis=0;
  }

  function beginCampaign() {
    audio.init();audio.ui();endless=false;chaotic=false;
    currentSet=0;elapsedSaved=0;pendingPhase=null;championshipLost=false;
    journeyStart=performance.now();totalBest=saveProgress.bestRally||0;
    hideAll();showBrief();
  }
  function showBrief() {
    state='brief';const s=sets[currentSet];
    $('briefEyebrow').textContent=s.eyebrow;$('briefTitle').textContent=s.name;$('briefMascot').textContent=s.mascot;
    $('briefText').textContent=s.text;$('briefRule').textContent=s.rule;$('briefButton').textContent=s.button;
    $('briefRuleIcon').textContent=currentSet===0?'●':currentSet===1?'□':'⚡';
    hideAll();ui.brief.classList.remove('hidden');draw(performance.now()/1000);
  }
  function startSet() {
    audio.init();audio.ui();state='play';hideAll();ui.hud.classList.remove('hidden');ui.hint.classList.remove('hidden');
    resetSet();audio.sting();callout(`ONE SET · FIRST TO ${MATCH_TARGET}`);
    setTimeout(()=>{if(state==='play')ui.hint.classList.add('hidden');},3800);
  }
  function startEndless() {
    audio.init();endless=true;chaotic=false;currentSet=2;elapsedSaved=0;journeyStart=performance.now();state='play';hideAll();ui.hud.classList.remove('hidden');
    resetSet();audio.sting();callout(`ONE SET · FIRST TO ${MATCH_TARGET}`);
  }

  function startChaos() {
    audio.init();endless=false;chaotic=true;currentSet=2;elapsedSaved=0;journeyStart=performance.now();state='play';hideAll();ui.hud.classList.remove('hidden');ui.chaosRules.classList.remove('hidden');
    resetSet();audio.sting();ui.chaosRules.classList.remove('hidden');callout(`FIRST TO ${MATCH_TARGET} · ${prefs.chaosBalls} BALL${prefs.chaosBalls===1?'':'S'}`);
  }
  function hideAll() { [ui.title,ui.brief,ui.pause,ui.results,ui.final,ui.settings,ui.confirm].forEach(x=>x.classList.add('hidden')); ui.hud.classList.add('hidden');ui.hint.classList.add('hidden');ui.chaosRules.classList.add('hidden'); }
  function title() { state='title';endless=false;chaotic=false;hideAll();ui.title.classList.remove('hidden');updateTitle();draw(performance.now()/1000); }

  function pounce() {
    if(state!=='play'||serveTimer>0||pointTimer>0)return;
    const cat=cats[controlledCat];
    if(!cat)return;
    if(!cat.grounded){if(cat.beginSmash())pointer.pulse=1;return;}
    if(cat.pounce())pointer.pulse=1;
  }

  function switchCat(){
    if(state!=='play'||cats.length<2)return;
    selectCat((controlledCat+1)%cats.length);
  }

  function selectCat(index){
    if(state!=='play'||index===controlledCat||!cats[index])return false;
    controlledCat=index;
    callout(`${catNames[controlledCat]} SELECTED`);audio.tone(460+controlledCat*90,.09,'triangle',.12,120);updateHud();
    return true;
  }

  function selectCatAt(x,y){
    let best=null,bestDistance=Infinity;
    for(const cat of cats){
      if(cat.index===controlledCat)continue;
      const distance=Math.hypot(x-cat.x,y-(cat.y-52));
      if(distance<58&&distance<bestDistance){best=cat;bestDistance=distance;}
    }
    return best?selectCat(best.index):false;
  }

  function chaosHas(type){return chaotic&&activeChaosRules.some(rule=>rule.type===type);}

  function renderChaosRules(){
    ui.chaosRules.replaceChildren();
    for(const rule of activeChaosRules){
      const card=document.createElement('div');card.className='chaos-rule';
      const name=document.createElement('b');name.textContent=`CAT RULE · ${rule.name}`;
      const desc=document.createElement('span');desc.textContent=`${rule.desc} · ${Math.ceil(rule.time)}s`;
      card.append(name,desc);ui.chaosRules.append(card);
    }
  }

  function addChaosRule(){
    const activeTypes=new Set(activeChaosRules.map(rule=>rule.type));
    let options=chaosDeck.filter(rule=>!activeTypes.has(rule.type));
    if(chaosHas('beach'))options=options.filter(rule=>rule.type!=='turbo');
    if(chaosHas('turbo'))options=options.filter(rule=>rule.type!=='beach');
    if(!options.length)return;
    if(activeChaosRules.length>=2)activeChaosRules.shift();
    const template=options[Math.floor(Math.random()*options.length)];
    const rule={...template,time:13};activeChaosRules.push(rule);chaosRuleCount++;
    if(rule.type==='wind')chaosWind=Math.random()<.5?-1:1;
    if(rule.type==='crab')crab={x:NET_X+75,vx:95};
    callout(`CAT RULE: ${rule.name}!`);audio.rule();flash=.4;renderChaosRules();
  }

  function updateChaos(dt){
    if(!chaotic)return;
    activeChaosRules.forEach(rule=>rule.time-=dt);
    const before=activeChaosRules.length;activeChaosRules=activeChaosRules.filter(rule=>rule.time>0);
    if(!chaosHas('crab'))crab=null;
    if(before!==activeChaosRules.length)renderChaosRules();
    if(crab){
      crab.x+=crab.vx*dt;if(crab.x<NET_X+48||crab.x>900){crab.x=Math.max(NET_X+48,Math.min(900,crab.x));crab.vx*=-1;}
      for(const crabBall of balls){
        if(crabBall.dead||crabBall.y<=FLOOR-72||Math.hypot(crabBall.x-crab.x,crabBall.y-(FLOOR-20))>=crabBall.r+28||hitCooldown>0)continue;
        crabBall.vy=-420;crabBall.vx=(crabBall.x<crab.x?-1:1)*(210+Math.abs(crab.vx));hitCooldown=.14;burst(crabBall.x,crabBall.y,'#ff715b',12);audio.hit(1);callout('CRAB CALL!');
      }
    }
    chaosUiTick-=dt;if(chaosUiTick<=0){chaosUiTick=.25;renderChaosRules();}
  }

  function update(dt) {
    pointer.pulse=Math.max(0,pointer.pulse-dt*2.8);flash=Math.max(0,flash-dt*2.4);shake=Math.max(0,shake-dt*5);hitCooldown=Math.max(0,hitCooldown-dt);
    particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;});particles=particles.filter(p=>p.life>0).slice(-180);
    confetti.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;p.rot+=p.vr*dt;});confetti=confetti.filter(p=>p.life>0).slice(-160);
    if(state!=='play')return;
    audio.music();
    const keyboardAxis=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
    moveAxis=pointer.active?pointer.axis:keyboardAxis;
    ball=threatBall(0);cats.forEach(c=>c.update(dt));
    const activeCat=cats[controlledCat],smashBall=threatBall(0);
    if(!smashPrompted&&activeCat&&!activeCat.grounded&&activeCat.smashing<=0&&smashBall&&smashBall.y<365&&Math.hypot(smashBall.x-activeCat.x,smashBall.y-(activeCat.y-52))<185){smashPrompted=true;callout('TAP AGAIN · SMASH!');audio.tone(640,.08,'triangle',.1,150);}
    if(!blockPrompted&&activeCat&&activeCat.grounded&&activeCat.x>315&&smashBall&&smashBall.vx<0&&smashBall.x>345&&smashBall.y<340){blockPrompted=true;callout('JUMP NOW · BLOCK!');audio.tone(520,.08,'square',.1,120);}
    ball=threatBall(1);rivals.forEach(r=>r.update(dt));
    if(zoomiesActive>0){zoomiesActive-=dt;if(zoomiesActive<=0){zoomies=0;callout('ZOOMIES COMPLETE');}}
    if(pointTimer>0){pointTimer-=dt;if(pointTimer<=0){if(endless||chaotic){newBall(score[0]>=score[1]?0:1);}else if(score[0]>=MATCH_TARGET||score[1]>=MATCH_TARGET){finishSet();}else{if(pendingPhase!==null){currentSet=pendingPhase;pendingPhase=null;setupTeams();callout(currentSet===1?'DOUBLES! · LUNA JOINS':'FINAL LINEUP! · BEANS JOINS');audio.sting();}newBall(server);}}return;}
    if(serveTimer>0){serveTimer-=dt;balls.forEach((b,i)=>b.y=b.serveY+Math.sin(serveTimer*7+i)*4);if(serveTimer<=0){balls.forEach(b=>b.served=true);audio.serve();callout(server===0?(balls.length>1?`${balls.length}-BALL SERVE!`:'SERVE!'):'INCOMING!');}return;}
    updateChaos(dt);
    for(const activeBall of [...balls]){if(activeBall.dead)continue;ball=activeBall;updateBall(dt);if(state!=='play')break;}
    balls=balls.filter(b=>!b.dead);ball=threatBall(0)||balls[0]||null;
  }

  function updateBall(dt) {
    if(!ball)return;
    const gravity=chaosHas('moon')?350:chaosHas('beach')?460:chaosHas('turbo')?760:620;
    const targetRadius=chaosHas('beach')?31:chaosHas('turbo')?13:19;
    ball.spikeDiving=Math.max(0,(ball.spikeDiving||0)-dt);
    ball.r+=(targetRadius-ball.r)*(1-Math.exp(-8*dt));
    ball.vy+=gravity*dt;if(chaosHas('wind'))ball.vx+=chaosWind*58*dt;
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.spin+=ball.vx*dt*.02;
    ballTrail.push({x:ball.x,y:ball.y,life:.22});if(ballTrail.length>18)ballTrail.shift();ballTrail.forEach(t=>t.life-=dt);
    if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx)*.82;audio.hit(.4);} if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx)*.82;audio.hit(.4);}
    if(ball.y<ball.r+5){ball.y=ball.r+5;ball.vy=Math.abs(ball.vy)*.75;}
    // net posts and tape
    if(((ball.smashSide!==undefined&&ball.smashSide!==null)||(ball.blockSide!==undefined&&ball.blockSide!==null))&&ball.y+ball.r>NET_TOP-5&&Math.abs(ball.x-NET_X)<ball.r+12){
      ball.y=NET_TOP-ball.r-7;ball.vy=-Math.max(120,Math.abs(ball.vy)*.4);burst(ball.x,ball.y,'#fff4d6',6);
    }else if(ball.y+ball.r>NET_TOP && ball.y<FLOOR && Math.abs(ball.x-NET_X)<ball.r+7){
      const fromLeft=ball.x<NET_X;ball.x=NET_X+(fromLeft?-(ball.r+8):(ball.r+8));ball.vx=(fromLeft?-1:1)*Math.max(105,Math.abs(ball.vx)*.72);ball.vy-=35;audio.tone(145,.07,'square',.12,-25);shake=.18;
    } else if(ball.y+ball.r>NET_TOP-5&&ball.y-ball.r<NET_TOP+8&&Math.abs(ball.x-NET_X)<45){ball.y=NET_TOP-ball.r-6;ball.vy=-Math.abs(ball.vy)*.65;ball.vx*=.92;audio.tone(190,.07,'square',.12,90);}
    collideActors(cats,0);collideActors(rivals,1);
    const side=ball.x<NET_X?0:1;
    if(side!==ball.lastSide){
      if(ball.smashSide!==undefined&&ball.smashSide!==null&&side!==ball.smashSide){ball.vy=Math.max(235,Math.abs(ball.vy)*.72);ball.vx*=.92;ball.smashSide=null;ball.spikeDiving=.65;burst(ball.x,ball.y,'#ffc857',8);}
      else if(ball.blockSide!==undefined&&ball.blockSide!==null&&side!==ball.blockSide){ball.vy=Math.max(175,Math.abs(ball.vy)*.58);ball.vx*=.9;ball.blockSide=null;burst(ball.x,ball.y,'#fff4d6',7);}
      ball.lastSide=side;ball.floorBounces=0;
    }
    if(ball.y+ball.r>=FLOOR){
      const bounceAllowed=side===0||chaosHas('rubber');
      if(bounceAllowed&&ball.floorBounces===0&&Math.abs(ball.vy)<690){
        ball.floorBounces=1;ball.y=FLOOR-ball.r;ball.vy=-Math.max(340,Math.abs(ball.vy)*.66);ball.vx*=.82;audio.tone(105,.09,'triangle',.15,40);callout(chaosHas('rubber')?'RUBBER SAND SAVE!':'ONE CAT BOUNCE!');dust(ball.x,FLOOR,9,'#ffc857');
      }else scorePoint(side===0?1:0);
    }
  }

  function collideActors(team,side) {
    for(const a of team){
      const hx=a.x,hy=a.y-52,dx=ball.x-hx,dy=ball.y-hy,dist=Math.hypot(dx,dy),range=ball.r+27+(side===1?10:0)+(ball.spikeDiving>0?14:0);
      if(dist<range&&hitCooldown<=0){
        const nx=dx/(dist||1),ny=dy/(dist||1);ball.x=hx+nx*range;ball.y=hy+ny*range;
        const airborne=!a.grounded;let speed=(airborne?470:365)*(chaosHas('beach') ? .82 : chaosHas('turbo') ? 1.18 : 1);
        if(side===0&&zoomiesActive>0)speed=590;
        const dir=side===0?1:-1;
        const playerSmash=side===0&&a.smashing>0;
        const rivalSmash=side===1&&airborne&&ball.y<325&&(currentSet>=1||chaotic)&&(rally+a.index)%3===0&&rally>=2;
        const smashing=playerSmash||rivalSmash;
        const playerBlock=side===0&&a.index===controlledCat&&airborne&&!playerSmash&&ball.vx<0&&ball.x>335&&ball.y<340;
        const rivalBlock=side===1&&airborne&&!rivalSmash&&ball.vx>0&&ball.x<625&&ball.y<340;
        const blocking=playerBlock||rivalBlock;
        if(smashing){ball.vx=dir*(playerSmash?650:570);ball.vy=playerSmash?-285:-245;ball.smashSide=side;ball.spikeDiving=0;if(playerSmash)a.smashing=0;speed=playerSmash?690:610;}
        else if(blocking){ball.vx=dir*(playerBlock?535:500);ball.vy=-190;ball.blockSide=side;ball.smashSide=null;ball.spikeDiving=0;speed=560;}
        else{ball.vx=dir*(speed*.72)+a.vx*.34;ball.vy=-speed*(airborne?.78:.63)-Math.max(0,-a.vy)*.28;}
        if((side===0&&ball.x>450)||(side===1&&ball.x<510))ball.vx=dir*Math.abs(ball.vx);
        hitCooldown=smashing||blocking ? .16 : .11;rally++;bestRally=Math.max(bestRally,rally);totalBest=Math.max(totalBest,rally);ball.floorBounces=0;a.hitGlow=.28;
        if(smashing){audio.smash();burst(ball.x,ball.y,playerSmash?'#ffc857':'#ff715b',25);shake=prefs.gentle?.14:.72;callout(playerSmash?'WHISKER SMASH!':'RETURN SMASH!');}
        else if(blocking){audio.block();burst(ball.x,ball.y,playerBlock?'#63d6b6':'#ff715b',18);shake=prefs.gentle?.1:.42;callout(playerBlock?'PAW BLOCK!':'BLOCKED!');}
        else{audio.hit(speed/470);burst(ball.x,ball.y,side===0?(a.color||'#63d6b6'):'#ff715b',10);shake=prefs.gentle?.08:.25;}
        if(side===0){zoomies=Math.min(100,zoomies+(airborne?19:12));if(zoomies>=100&&zoomiesActive<=0){zoomiesActive=5.5;callout('MAXIMUM ZOOMIES!');audio.point(true);for(const c of cats){c.vx+=(c.index%2?1:-1)*110;}}}
        if(chaotic){
          if(rally===3||rally===8||rally===13){callout('⚠ CAT RULE INCOMING...');audio.tone(760,.12,'square',.1,-180);}
          else if(rally===4||rally===9||rally===14)addChaosRule();
        }else if(!smashing&&!blocking&&rally===4)callout('ACTUAL VOLLEYBALL?!');else if(!smashing&&!blocking&&rally===8)callout('SUSPICIOUSLY ATHLETIC!');else if(!smashing&&!blocking&&rally===12)callout('THE CROWD IS CONFUSED!');
        updateHud();break;
      }
    }
  }

  function scorePoint(winner) {
    if(pointTimer>0)return;
    const multiBall=chaotic&&prefs.chaosBalls>1;
    if(multiBall&&ball)ball.dead=true;
    score[winner]++;server=winner;
    if(!endless&&!chaotic&&score[0]<MATCH_TARGET&&score[1]<MATCH_TARGET){
      const totalPoints=score[0]+score[1];
      if(currentSet===0&&totalPoints>=8)pendingPhase=1;
      else if(currentSet===1&&totalPoints>=16)pendingPhase=2;
    }
    const remaining=multiBall?balls.filter(b=>!b.dead).length:0;
    const modeComplete=(endless||chaotic)&&(score[0]>=MATCH_TARGET||score[1]>=MATCH_TARGET);
    const roundOver=!multiBall||remaining===0||modeComplete;
    pointTimer=roundOver?1.65:0;
    if(modeComplete)balls.forEach(b=>b.dead=true);
    flash=.55;shake=prefs.gentle?.12:.55;audio.point(winner===0);
    const winLines=['THAT COUNTS!','PURR-FECTLY LEGAL!','COACHING!','A SPORTS MIRACLE!'];
    const loseLines=['DISTRACTED BY PHYSICS','NO ONE SAW THAT','TAIL FAULT','A TEACHABLE MEOW-MENT'];
    callout(remaining>0?`${remaining} BALL${remaining===1?'':'S'} STILL LIVE!`:(winner===0?winLines:loseLines)[Math.floor(Math.random()*4)]);
    if(winner===0)burst(ball.x,ball.y,'#ffc857',22); else burst(ball.x,ball.y,'#ff715b',14);
    if(endless&&(score[0]>=MATCH_TARGET||score[1]>=MATCH_TARGET)){setTimeout(()=>finishEndless(score[0]>=MATCH_TARGET),1100);}
    if(chaotic&&(score[0]>=MATCH_TARGET||score[1]>=MATCH_TARGET)){setTimeout(()=>finishChaos(score[0]>=MATCH_TARGET),1100);}
    updateHud();
  }
  function finishSet() {
    state='results';saveProgress.totalPounces=(saveProgress.totalPounces||0)+setPounces;
    championshipLost=score[0]<score[1];
    const grade=gradeForSet(),won=!championshipLost;
    $('resultsEyebrow').textContent=won?'CHAMPIONSHIP COMPLETE':'CHAMPIONSHIP RESULT';
    $('statRally').textContent=bestRally;$('statPounces').textContent=setPounces;$('statStyle').textContent=grade;
    $('resultsTitle').textContent=won?'Champions, Somehow':`${score[0]}–${score[1]} · The Pros Win`;
    $('resultsText').textContent=won?'The cats survived one full set, two lineup changes, and twenty-five points of deeply questionable volleyball.':'The cats made it through a full set. The trophy remains tragically un-sat-upon.';
    $('resultsButton').textContent=won?'CLAIM THE TROPHY':'TRY AGAIN';
    if(won)currentSet=3;
    hideAll();ui.results.classList.remove('hidden');
  }
  function advanceResults(){audio.ui();if(chaotic)startChaos();else if(endless)startEndless();else if(championshipLost){currentSet=0;showBrief();}else showFinal();}
  function gradeForSet(){const r=bestRally+(score[1]===0?3:0);return r>=12?'S':r>=8?'A':r>=5?'B':'C';}
  function showFinal(){
    state='final';saveProgress.completed=true;saveProgress.set=0;saveProgress.bestRally=Math.max(saveProgress.bestRally||0,totalBest);saveProgress.elapsed=elapsedSaved+(performance.now()-journeyStart)/1000;storeJSON(SAVE_KEY,saveProgress);
    $('finalRally').textContent=totalBest;$('finalGrade').textContent=totalBest>=12?'S':totalBest>=8?'A':'B';$('finalTime').textContent=formatTime(saveProgress.elapsed);
    hideAll();ui.final.classList.remove('hidden');audio.point(true);updateTitle();
  }
  function finishEndless(won=false){if(state!=='play')return;state='results';totalBest=Math.max(totalBest,bestRally);saveProgress.bestRally=Math.max(saveProgress.bestRally||0,totalBest);storeJSON(SAVE_KEY,saveProgress);$('resultsEyebrow').textContent=won?'RALLY MODE VICTORY':'RALLY MODE COMPLETE';$('resultsTitle').textContent=won?'Twenty-Five Points of Glory':`${score[0]}–${score[1]} · Good Effort`;$('resultsText').textContent=won?'The cats won one full-length set. Against all evidence, this counts as volleyball.':'The opponents reached twenty-five first. The cats blame the concept of rotation.';$('statRally').textContent=bestRally;$('statPounces').textContent=setPounces;$('statStyle').textContent=gradeForSet();$('resultsButton').textContent='RALLY AGAIN';hideAll();ui.results.classList.remove('hidden');}
  function finishChaos(won=false){if(state!=='play')return;state='results';totalBest=Math.max(totalBest,bestRally);saveProgress.bestRally=Math.max(saveProgress.bestRally||0,totalBest);storeJSON(SAVE_KEY,saveProgress);$('resultsEyebrow').textContent=won?'CHAOS CONQUERED':'THE RULEBOOK IS GONE';$('resultsTitle').textContent=won?'Twenty-Five. Somehow.':`${score[0]}–${score[1]} · Chaos Wins`;$('resultsText').textContent=won?'The cats defeated the score, the opponents, and several temporary laws of physics.':'Two cats entered a volleyball court. Several laws of physics left with the victory.';$('statRally').textContent=bestRally;$('statPounces').textContent=chaosRuleCount;$('statStyle').textContent=gradeForSet();$('resultsButton').textContent='CHAOS AGAIN';hideAll();ui.results.classList.remove('hidden');}
  function formatTime(s){s=Math.max(0,Math.floor(s||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}

  function updateHud(){ui.catScore.textContent=`${score[0]}/${MATCH_TARGET}`;ui.rivalScore.textContent=`${score[1]}/${MATCH_TARGET}`;ui.rivalName.textContent=sets[currentSet].rival;ui.setLabel.textContent=chaotic?'CHAOTIC':endless?'RALLY MODE':'CHAMPIONSHIP';ui.rallyLabel.textContent=`RALLY ${rally} · ONE SET`;ui.activeCatName.textContent=catNames[controlledCat]||'MISO';ui.zoomiesFill.style.width=(zoomiesActive>0?Math.max(0,zoomiesActive/5.5*100):zoomies)+'%';}
  function callout(text){ui.callout.textContent=text;ui.callout.classList.remove('show');void ui.callout.offsetWidth;ui.callout.classList.add('show');}
  function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=60+Math.random()*220;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-50,g:330,life:.35+Math.random()*.5,max:.85,color,size:2+Math.random()*5});}}
  function dust(x,y,count,color){for(let i=0;i<count;i++)particles.push({x:x+(Math.random()-.5)*35,y:y-3,vx:(Math.random()-.5)*90,vy:-30-Math.random()*70,g:100,life:.3+Math.random()*.3,max:.6,color,size:2+Math.random()*4});}

  function draw(t) {
    const s=sets[Math.min(2,currentSet)];ctx.save();
    const sx=shake>0&&!prefs.gentle?(Math.random()-.5)*shake*18:0,sy=shake>0&&!prefs.gentle?(Math.random()-.5)*shake*12:0;ctx.translate(sx,sy);
    const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,s.sky[0]);grd.addColorStop(.68,s.sky[1]);ctx.fillStyle=grd;ctx.fillRect(-20,-20,W+40,H+40);
    drawBackground(t,s);drawCourt(s);drawNet();
    if(crab)drawCrab(crab);
    ballTrail.forEach((p,i)=>{ctx.globalAlpha=Math.max(0,p.life)*.5;ctx.fillStyle='#fff4d6';ctx.beginPath();ctx.arc(p.x,p.y,4+i*.35,0,7);ctx.fill();});ctx.globalAlpha=1;
    rivals.forEach(r=>r.draw());cats.forEach(c=>c.draw());balls.forEach(b=>{if(!b.dead)drawBall(b);});
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/(p.max||1));ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);});ctx.globalAlpha=1;
    drawDirectControl(t);
    if(flash>0){ctx.globalAlpha=flash*.18;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
    ctx.restore();
  }
  function drawBackground(t,s){
    // saturated seaside arena, with a night-lit championship variant
    const night=currentSet===2;
    ctx.fillStyle=night?'#173957':'#2d9fca';ctx.fillRect(0,145,W,165);
    ctx.fillStyle=night?'#a9d9dc':'#dff9f0';ctx.globalAlpha=.7;for(let i=0;i<7;i++){ctx.fillRect(0,171+i*19,W,3);ctx.beginPath();ctx.arc((i*167+t*12)%W,176+i*18,42,Math.PI,0);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=3;ctx.stroke();}ctx.globalAlpha=1;
    // sun, clouds and distant islands
    ctx.fillStyle=night?'#fff4d6':'#ffc857';ctx.beginPath();ctx.arc(790,82,night?28:45,0,7);ctx.fill();
    if(night){ctx.fillStyle=s.sky[0];ctx.beginPath();ctx.arc(804,72,25,0,7);ctx.fill();}
    ctx.fillStyle='#fff4d6cc';for(const c of [[120,79,1],[410,105,.72]]){ctx.save();ctx.translate(c[0],c[1]);ctx.scale(c[2],c[2]);ellipse(0,0,43,15,false);ellipse(-32,3,25,11,false);ellipse(30,4,29,12,false);ctx.restore();}
    ctx.fillStyle=night?'#274f58':'#3f9767';ctx.beginPath();ctx.moveTo(0,230);ctx.quadraticCurveTo(82,164,175,230);ctx.quadraticCurveTo(260,187,340,230);ctx.lineTo(340,280);ctx.lineTo(0,280);ctx.fill();ctx.beginPath();ctx.moveTo(720,236);ctx.quadraticCurveTo(830,153,960,226);ctx.lineTo(960,280);ctx.lineTo(720,280);ctx.fill();
    // compact beach crowd behind the court
    ctx.fillStyle='#17152c66';ctx.fillRect(0,270,W,66);
    for(let i=0;i<38;i++){const x=i*27-8,y=302+(i%2)*10;ctx.fillStyle=i%5===0?'#ffc857':i%3===0?'#ff715b':'#fff4d6';ctx.beginPath();ctx.arc(x,y-17-(Math.sin(t*2+i)*1.5),9,0,7);ctx.fill();ctx.fillRect(x-9,y-10,18,22);}
    // palms frame the arcade court
    for(const flip of [0,1]){ctx.save();ctx.translate(flip?925:35,295);ctx.scale(flip?-1:1,1);ctx.strokeStyle='#70462f';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(0,35);ctx.quadraticCurveTo(8,-55,25,-112);ctx.stroke();ctx.strokeStyle=night?'#3a7d68':'#2f9d67';ctx.lineWidth=12;for(let a=-1.5;a<1.6;a+=.5){ctx.beginPath();ctx.moveTo(25,-112);ctx.quadraticCurveTo(50+Math.cos(a)*35,-125+Math.sin(a)*15,72+Math.cos(a)*45,-105+Math.sin(a)*25);ctx.stroke();}ctx.restore();}
    const banners=['CHASE','POUNCE','NAP LATER'];for(let i=0;i<3;i++){ctx.fillStyle=['#63d6b6','#ffc857','#ff715b'][i];ctx.beginPath();ctx.roundRect(70+i*325,239,145,34,8);ctx.fill();ctx.fillStyle='#17152c';ctx.font='1000 13px system-ui';ctx.textAlign='center';ctx.fillText(banners[i],142+i*325,261);}
  }
  function drawCourt(s){
    ctx.fillStyle='#c89955';ctx.fillRect(0,328,W,H-328);
    const sand=ctx.createLinearGradient(0,330,0,H);sand.addColorStop(0,'#f7d98b');sand.addColorStop(1,s.court);ctx.fillStyle=sand;ctx.beginPath();ctx.moveTo(45,332);ctx.lineTo(915,332);ctx.lineTo(960,522);ctx.lineTo(0,522);ctx.closePath();ctx.fill();
    // swept sand bands create a faux-3D beach-court perspective
    ctx.strokeStyle='#fff4d628';ctx.lineWidth=3;for(let y=350;y<525;y+=25){ctx.beginPath();ctx.moveTo(Math.max(0,(y-332)*-.22+45),y);ctx.lineTo(Math.min(960,915+(y-332)*.22),y);ctx.stroke();}
    ctx.strokeStyle='#fff4d6';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(45,337);ctx.lineTo(915,337);ctx.lineTo(950,501);ctx.lineTo(10,501);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(NET_X,337);ctx.lineTo(NET_X,501);ctx.stroke();
    ctx.fillStyle='#17152c22';ctx.fillRect(0,FLOOR,W,88);ctx.fillStyle='#17152c';ctx.font='1000 12px system-ui';ctx.textAlign='left';ctx.fillText('WHISKER BAY · QUESTIONABLE RULES DIVISION',28,523);
  }
  function drawNet(){
    ctx.strokeStyle='#17152c';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(NET_X,NET_TOP-12);ctx.lineTo(NET_X,FLOOR+15);ctx.stroke();ctx.strokeStyle='#fff4d6';ctx.lineWidth=6;ctx.stroke();
    ctx.save();ctx.globalAlpha=.9;ctx.strokeStyle='#fff4d6';ctx.lineWidth=2;for(let y=NET_TOP;y<FLOOR;y+=17){ctx.beginPath();ctx.moveTo(NET_X-34,y);ctx.lineTo(NET_X+34,y);ctx.stroke();}for(let x=NET_X-34;x<=NET_X+34;x+=17){ctx.beginPath();ctx.moveTo(x,NET_TOP);ctx.lineTo(x,FLOOR);ctx.stroke();}ctx.restore();
    ctx.fillStyle='#ff715b';ctx.fillRect(NET_X-40,NET_TOP-6,80,11);ctx.strokeStyle='#17152c';ctx.lineWidth=3;ctx.strokeRect(NET_X-40,NET_TOP-6,80,11);
  }
  function drawBall(b){ctx.save();ctx.translate(b.x,b.y);if((b.smashSide!==undefined&&b.smashSide!==null)||(b.blockSide!==undefined&&b.blockSide!==null)||b.spikeDiving>0){ctx.strokeStyle=b.blockSide!==undefined&&b.blockSide!==null?'#fff4d6bb':'#ffc857aa';ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-Math.sign(b.vx)*22,0);ctx.lineTo(-Math.sign(b.vx)*58,-b.vy*.035);ctx.stroke();}ctx.rotate(b.spin);ctx.fillStyle=['#ffc857','#63d6b6','#ff8a66'][b.index%3];ctx.strokeStyle='#17152c';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,b.r,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff4d6';ctx.lineWidth=Math.max(2,b.r*.19);for(let i=0;i<3;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.arc(-b.r*.58,0,b.r*.78,-.8,.8);ctx.stroke();ctx.restore();}ctx.restore();}
  function drawDirectControl(t){
    if(state!=='play'||Math.abs(moveAxis)<.08)return;const cat=cats[controlledCat];if(!cat)return;const dir=Math.sign(moveAxis),pulse=1+Math.sin(t*12)*.08;ctx.save();ctx.translate(cat.x+dir*50,cat.y-30);ctx.scale(dir*pulse,pulse);ctx.globalAlpha=.78;ctx.fillStyle=colors[controlledCat]||'#63d6b6';ctx.strokeStyle='#17152c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(-5,-13);ctx.lineTo(-5,-6);ctx.lineTo(-20,-6);ctx.lineTo(-20,6);ctx.lineTo(-5,6);ctx.lineTo(-5,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  function drawCrab(c){ctx.save();ctx.translate(c.x,FLOOR-17);ctx.fillStyle='#ff715b';ctx.strokeStyle='#17152c';ctx.lineWidth=4;ellipse(0,0,22,15,true);ctx.beginPath();ctx.arc(-13,-16,7,0,7);ctx.arc(13,-16,7,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#17152c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-16,8);ctx.lineTo(-29,16);ctx.moveTo(-8,10);ctx.lineTo(-17,20);ctx.moveTo(16,8);ctx.lineTo(29,16);ctx.moveTo(8,10);ctx.lineTo(17,20);ctx.stroke();ctx.fillStyle='#fff4d6';ctx.beginPath();ctx.arc(-8,-5,4,0,7);ctx.arc(8,-5,4,0,7);ctx.fill();ctx.fillStyle='#17152c';ctx.beginPath();ctx.arc(-8,-5,2,0,7);ctx.arc(8,-5,2,0,7);ctx.fill();ctx.restore();}
  function ellipse(x,y,rx,ry,stroke){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();if(stroke)ctx.stroke();}

  function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointerdown',e=>{if(state!=='play'||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();audio.init();const p=canvasPoint(e);if(pointer.active&&pointer.activeId!==e.pointerId){if(!selectCatAt(p.x,p.y))pounce();return;}canvas.setPointerCapture?.(e.pointerId);pointer.startX=p.x;pointer.startY=p.y;pointer.moved=false;pointer.type=e.pointerType;pointer.axis=0;pointer.active=true;pointer.activeId=e.pointerId;});
  canvas.addEventListener('pointermove',e=>{if(state!=='play'||!pointer.active||e.pointerId!==pointer.activeId)return;const p=canvasPoint(e),dx=p.x-pointer.startX;if(Math.hypot(dx,p.y-pointer.startY)>12)pointer.moved=true;pointer.axis=Math.abs(dx)<10?0:Math.max(-1,Math.min(1,dx/65));});
  canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer.activeId)return;if(pointer.active&&!pointer.moved){const p=canvasPoint(e);if(!selectCatAt(p.x,p.y))pounce();}pointer.axis=0;pointer.active=false;pointer.activeId=null;canvas.releasePointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointercancel',e=>{if(e.pointerId===pointer.activeId){pointer.axis=0;pointer.active=false;pointer.activeId=null;}});
  window.addEventListener('keydown',e=>{keys.add(e.code);if(['Space','ArrowUp','KeyW'].includes(e.code)){e.preventDefault();audio.init();pounce();}if(['KeyQ','Tab'].includes(e.code)){e.preventDefault();switchCat();}if(e.code==='Escape'&&state==='play')pauseGame();});
  window.addEventListener('keyup',e=>keys.delete(e.code));

  function click(id,fn){$(id).addEventListener('click',()=>{audio.init();audio.ui();fn();});}
  click('startButton',beginCampaign);click('endlessButton',startEndless);click('chaosButton',startChaos);click('finalChaosButton',startChaos);click('briefButton',startSet);click('resultsButton',advanceResults);
  click('switchButton',switchCat);
  click('rallyButton',startEndless);click('replayButton',()=>{saveProgress.set=0;saveProgress.completed=true;storeJSON(SAVE_KEY,saveProgress);currentSet=0;elapsedSaved=0;journeyStart=performance.now();endless=false;showBrief();});
  click('pauseButton',pauseGame);click('resumeButton',resumeGame);click('restartButton',()=>{state='play';hideAll();ui.hud.classList.remove('hidden');if(chaotic)ui.chaosRules.classList.remove('hidden');resetSet();});
  click('quitButton',()=>{ui.pause.classList.add('hidden');ui.confirm.classList.remove('hidden');});
  click('cancelQuitButton',()=>{ui.confirm.classList.add('hidden');ui.pause.classList.remove('hidden');});
  click('confirmQuitButton',()=>{saveGame();title();});
  click('settingsButton',()=>{ui.title.classList.add('hidden');ui.settings.classList.remove('hidden');});click('closeSettingsButton',()=>{ui.settings.classList.add('hidden');ui.title.classList.remove('hidden');});
  click('muteButton',()=>audio.volume(prefs.volume>0?0:.8));
  function slider(id){$(id).addEventListener('input',e=>audio.volume(Number(e.target.value)/100));}slider('volumeSlider');slider('titleVolumeSlider');
  function motion(id){$(id).addEventListener('change',e=>{prefs.gentle=e.target.checked;savePrefs();});}motion('motionToggle');motion('titleMotionToggle');
  function ballCount(id){$(id).addEventListener('change',e=>{prefs.chaosBalls=Math.max(1,Math.min(3,Number(e.target.value)||2));savePrefs();});}ballCount('chaosBallSelect');ballCount('titleChaosBallSelect');
  function pauseGame(){if(state!=='play')return;beforePause=state;state='pause';moveAxis=0;pointer.axis=0;pointer.active=false;pointer.activeId=null;keys.clear();hideAll();ui.pause.classList.remove('hidden');}
  function resumeGame(){if(state!=='pause')return;state=beforePause;hideAll();ui.hud.classList.remove('hidden');if(chaotic)ui.chaosRules.classList.remove('hidden');}

  function orientationCheck(){
    const portrait=innerHeight>innerWidth&&innerWidth<900;
    if(portrait&&state==='play')pauseGame();
  }
  window.addEventListener('resize',orientationCheck);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveGame();if(state==='play')pauseGame();}});
  window.addEventListener('pagehide',saveGame);
  window.addEventListener('blur',()=>{if(state==='play')pauseGame();});
  document.addEventListener('contextmenu',e=>e.preventDefault());

  let last=performance.now();
  function frame(now){const dt=Math.min(.033,Math.max(0,(now-last)/1000));last=now;update(dt);draw(now/1000);requestAnimationFrame(frame);}
  syncPrefs();updateTitle();title();requestAnimationFrame(frame);orientationCheck();
})();
