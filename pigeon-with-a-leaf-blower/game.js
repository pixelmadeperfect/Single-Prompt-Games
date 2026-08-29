(() => {
  'use strict';

  const W = 540, H = 960, SAVE_KEY = 'pigeon_leafblower_v1', PREF_KEY = 'pigeon_leafblower_prefs_v1';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    hud:$('hud'), altitude:$('altitudeValue'), district:$('districtLabel'), objective:$('objectiveLabel'),
    battery:$('batteryFill'), health:$('healthFill'), combo:$('combo'), comboValue:$('comboValue'), toast:$('toast'),
    hint:$('pointerHint'), title:$('titleOverlay'), brief:$('briefOverlay'), how:$('howOverlay'), pause:$('pauseOverlay'),
    crash:$('crashOverlay'), final:$('finalOverlay'), settings:$('settingsOverlay'), start:$('startButton'),
    continue:$('continueButton'), continueAltitude:$('continueAltitude'), bestScore:$('bestScore'),
    volume:$('volumeSlider'), volumeOut:$('volumeOutput'), titleVolume:$('titleVolumeSlider'), titleVolumeOut:$('titleVolumeOutput'),
    motion:$('motionToggle'), titleMotion:$('titleMotionToggle')
  };

  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const rand = (a,b) => a+Math.random()*(b-a);
  const dist2 = (a,b) => (a.x-b.x)**2+(a.y-b.y)**2;
  const TAU = Math.PI*2;

  let prefs = loadJSON(PREF_KEY,{volume:.75,motion:true});
  let save = loadJSON(SAVE_KEY,{version:1,checkpoint:0,best:0,completed:false});
  prefs.volume = clamp(Number(prefs.volume)||0,0,1); prefs.motion = prefs.motion !== false;
  save.checkpoint = [0,400,800,1200].includes(save.checkpoint) ? save.checkpoint : 0;
  save.best = Math.max(0,Number(save.best)||0);

  const game = {
    state:'title', last:0, time:0, flightTime:0, altitude:0, score:0, health:3, battery:100,
    combo:1, comboTimer:0, nextSpawn:0, district:0, checkpoint:0, scroll:0, shake:0,
    objects:[], particles:[], clouds:[], buildings:[], deflects:0, finaleTimer:0, hat:null,
    tutorial:true, controlStarted:false, milestoneShown:new Set(), flash:0, flashColor:'#fff', savedAt:0
  };
  const player = {x:270,y:700,vx:0,vy:0,r:28,angle:-Math.PI/2,flap:0,hit:0,invuln:0};
  const input = {active:false,pointerId:null,startX:0,startY:0,x:0,y:0,dx:0,dy:0,burstX:0,burstY:0,burstPower:0,burstTime:0,keys:new Set()};

  function loadJSON(key,fallback){ try { const raw=localStorage.getItem(key); return raw?{...fallback,...JSON.parse(raw)}:fallback; } catch { return fallback; } }
  function storeJSON(key,value){ try { localStorage.setItem(key,JSON.stringify(value)); } catch {} }
  function savePrefs(){ storeJSON(PREF_KEY,prefs); }
  function saveProgress(){ save.best=Math.max(save.best,Math.round(game.score)); if(game.state==='playing') save.checkpoint=Math.max(save.checkpoint,game.checkpoint); storeJSON(SAVE_KEY,save); updateTitle(); }

  class AudioBus {
    constructor(){ this.ctx=null; this.master=null; this.lastWhoosh=0; }
    init(){
      if(this.ctx){ if(this.ctx.state==='suspended') this.ctx.resume(); return; }
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
      this.ctx=new AC(); this.master=this.ctx.createGain(); this.master.gain.value=prefs.volume*.24; this.master.connect(this.ctx.destination);
    }
    setVolume(v){ prefs.volume=v; if(this.master)this.master.gain.setTargetAtTime(v*.24,this.ctx.currentTime,.03); savePrefs(); }
    tone(freq,dur=.12,type='sine',vol=.4,slide=1){ if(!this.ctx||!prefs.volume)return; const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain(); o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02); }
    click(){this.tone(440,.05,'square',.18,1.15)}
    blast(){const n=performance.now();if(n-this.lastWhoosh<95)return;this.lastWhoosh=n;this.tone(rand(70,95),.08,'sawtooth',.06,.75)}
    collect(){this.tone(620,.08,'sine',.28,1.3);setTimeout(()=>this.tone(880,.09,'sine',.2,1.1),55)}
    hit(){this.tone(125,.25,'sawtooth',.5,.35)}
    checkpoint(){[330,440,660,880].forEach((f,i)=>setTimeout(()=>this.tone(f,.18,'triangle',.25,1.02),i*80))}
    win(){[392,523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,.28,'triangle',.3,1.03),i*120))}
  }
  const audio=new AudioBus();

  function setOverlay(overlay){
    [ui.title,ui.brief,ui.how,ui.pause,ui.crash,ui.final,ui.settings].forEach(el=>el.classList.add('hidden'));
    if(overlay) overlay.classList.remove('hidden');
  }
  function updateTitle(){
    ui.bestScore.textContent=save.best.toLocaleString();
    const canContinue=save.checkpoint>0&&!save.completed;
    ui.continue.classList.toggle('hidden',!canContinue); ui.continueAltitude.textContent=save.checkpoint;
    ui.start.textContent=save.completed?'START A FRESH BAD IDEA':'START THE BAD IDEA';
  }
  function toast(text,color='#ffd34f',duration=1900){ ui.toast.textContent=text;ui.toast.style.background=color;ui.toast.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('show'),duration); }
  function syncSettings(){ const n=Math.round(prefs.volume*100);ui.volume.value=n;ui.titleVolume.value=n;ui.volumeOut.value=n+'%';ui.titleVolumeOut.value=n+'%';ui.motion.checked=prefs.motion;ui.titleMotion.checked=prefs.motion; }

  function startBrief(){ audio.init();audio.click();game.state='brief';setOverlay(ui.brief); }
  function beginGame(from=0){
    audio.init();if(from===0){save.completed=false;save.checkpoint=0;storeJSON(SAVE_KEY,save);} resetGame(from); game.state='playing'; setOverlay(null); ui.hud.classList.remove('hidden');
    ui.hint.classList.remove('hidden'); setTimeout(()=>ui.hint.classList.add('hidden'),4200);
    toast(from?`CHECKPOINT ${from}m — THE HAT REMEMBERS`:'THE HAT HAS NO INSURANCE', '#55e0ba');
  }
  function resetGame(from=0){
    game.time=0;game.flightTime=0;game.altitude=from;game.score=from*2;game.health=3;game.battery=100;game.combo=1;game.comboTimer=0;game.nextSpawn=.45;game.district=from>=1200?3:from>=800?2:from>=400?1:0;game.checkpoint=from;game.scroll=0;game.shake=0;game.objects=[];game.particles=[];game.clouds=[];game.deflects=0;game.finaleTimer=0;game.hat=null;game.tutorial=from===0;game.controlStarted=false;game.milestoneShown=new Set();game.savedAt=from;
    player.x=270;player.y=700;player.vx=0;player.vy=0;player.angle=-Math.PI/2;player.hit=0;player.invuln=0;
    input.active=false;input.burstTime=0;input.keys.clear();
    for(let i=0;i<12;i++) game.clouds.push({x:rand(-60,W),y:rand(-100,H),s:rand(.45,1.2),layer:Math.random()<.5?0:1});
  }
  function pause(){ if(game.state!=='playing'&&game.state!=='finale')return;game.previousState=game.state;game.state='paused';input.active=false;setOverlay(ui.pause); }
  function resume(){ if(game.state!=='paused')return;audio.init();game.state=game.previousState||'playing';game.last=performance.now();setOverlay(null); }
  function title(){ saveProgress();game.state='title';ui.hud.classList.add('hidden');setOverlay(ui.title);updateTitle(); }
  function crash(){
    game.state='crash';saveProgress();ui.hud.classList.add('hidden');setOverlay(ui.crash);audio.hit();
    $('crashAltitude').textContent=Math.floor(game.altitude)+'m';$('crashScore').textContent=Math.round(game.score).toLocaleString();$('crashDeflects').textContent=game.deflects;
    const lines=[['Gravity Has Submitted Feedback','The hat survived. Your professional reputation did not.'],['The Sky Declined Your Application','Apparently “more blower” was not a flight plan.'],['Airspace Has Won This Round','Several socks have been promoted in your absence.']];const line=lines[Math.floor(Math.random()*lines.length)];$('crashTitle').textContent=line[0];$('crashText').textContent=line[1];
  }
  function complete(){
    game.state='complete';save.completed=true;save.checkpoint=0;saveProgress();ui.hud.classList.add('hidden');setOverlay(ui.final);audio.win();
    $('finalScore').textContent=Math.round(game.score).toLocaleString();$('finalDeflects').textContent=game.deflects;$('finalTime').textContent=formatTime(game.flightTime);
    const rank=game.health===3?'UNREASONABLY AIRWORTHY':game.score>6500?'LICENSE-ADJACENT':'MUNICIPALLY ACCEPTABLE';$('rankLine').textContent='RANK: '+rank;
  }
  function showFinalPreview(){
    game.state='complete';ui.hud.classList.add('hidden');setOverlay(ui.final);
    $('finalScore').textContent='175,667';$('finalDeflects').textContent='301';$('finalTime').textContent='8:11';$('rankLine').textContent='RANK: LICENSE-ADJACENT';
  }
  function formatTime(t){const m=Math.floor(t/60),s=Math.floor(t%60);return `${m}:${String(s).padStart(2,'0')}`}

  function getMoveVector(){
    let x=0,y=0;
    if(input.keys.has('arrowleft')||input.keys.has('a'))x--;
    if(input.keys.has('arrowright')||input.keys.has('d'))x++;
    if(input.keys.has('arrowup')||input.keys.has('w'))y--;
    if(input.keys.has('arrowdown')||input.keys.has('s'))y++;
    if(x||y){const l=Math.hypot(x,y);return {x:x/l,y:y/l,power:1};}
    if(input.active){const l=Math.hypot(input.dx,input.dy);if(l>9)return{x:input.dx/l,y:input.dy/l,power:clamp(l/80,.35,1)};}
    if(input.burstTime>0)return{x:input.burstX,y:input.burstY,power:input.burstPower};
    return{x:0,y:0,power:0};
  }
  function pointerPosition(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointerdown',e=>{if(game.state!=='playing'&&game.state!=='finale')return;e.preventDefault();audio.init();game.controlStarted=true;const p=pointerPosition(e);input.active=true;input.burstTime=0;input.pointerId=e.pointerId;input.startX=p.x;input.startY=p.y;input.x=p.x;input.y=p.y;input.dx=0;input.dy=-10;canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!input.active||e.pointerId!==input.pointerId)return;const p=pointerPosition(e);input.x=p.x;input.y=p.y;input.dx=p.x-input.startX;input.dy=p.y-input.startY;});
  const endPointer=e=>{if(e.pointerId!==input.pointerId)return;const l=Math.hypot(input.dx,input.dy);if(l>12){input.burstX=input.dx/l;input.burstY=input.dy/l;input.burstPower=clamp(l/80,.4,1);input.burstTime=.38;}input.active=false;input.pointerId=null;input.dx=input.dy=0;};
  canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup','arrowdown',' ','w','a','s','d'].includes(k))e.preventDefault();if(k==='p'||k==='escape'){game.state==='paused'?resume():pause();return;}if(k==='m')toggleMute();if(['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(k))game.controlStarted=true;input.keys.add(k);audio.init();});
  window.addEventListener('keyup',e=>input.keys.delete(e.key.toLowerCase()));

  function spawnObject(){
    const d=game.district;let pool=d===0?['sock','sock','pillow','battery','umbrella']:d===1?['balloon','balloon','umbrella','battery','kite','sock']:d===2?['drone','cloud','balloon','battery','umbrella','kite']:['drone','cloud','umbrella','battery','pillow'];
    const type=pool[Math.floor(Math.random()*pool.length)], defs={sock:[18,.35],pillow:[25,.6],battery:[18,.2],umbrella:[28,1.5],balloon:[25,.5],kite:[22,.75],drone:[27,1.7],cloud:[31,2.1]};
    const [r,mass]=defs[type];game.objects.push({type,x:rand(45,W-45),y:-70,vx:rand(-35,35),vy:rand(10,45)+d*8,r,mass,rot:rand(0,TAU),vr:rand(-2,2),gusted:false,dead:false,hazard:['umbrella','drone','cloud','kite'].includes(type),phase:rand(0,TAU)});
    game.nextSpawn=rand(.65,1.12)-d*.08;
  }
  function emit(x,y,color,count=5,speed=100){for(let i=0;i<count;i++){const a=rand(0,TAU),s=rand(speed*.3,speed);game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.65),max:.65,color,size:rand(2,6)});}if(game.particles.length>180)game.particles.splice(0,game.particles.length-180);}
  function gustParticle(dir,power){const bx=player.x-dir.x*36,by=player.y-dir.y*36;for(let i=0;i<2;i++)game.particles.push({x:bx+rand(-8,8),y:by+rand(-8,8),vx:-dir.x*rand(190,310)+rand(-30,30),vy:-dir.y*rand(190,310)+rand(-30,30),life:rand(.18,.36),max:.36,color:'#fff6d7',size:rand(2,5),line:true});}

  function update(dt){
    game.time+=dt;input.burstTime=Math.max(0,input.burstTime-dt);
    if(game.state!=='playing'&&game.state!=='finale')return;
    game.flightTime+=dt;player.invuln=Math.max(0,player.invuln-dt);player.hit=Math.max(0,player.hit-dt);game.shake=Math.max(0,game.shake-dt*10);game.flash=Math.max(0,game.flash-dt*2);
    const mv=getMoveVector(), blasting=mv.power>0&&game.battery>1;
    if(blasting){
      const power=mv.power*(game.battery<16?.68:1), accel=580*power;player.vx+=mv.x*accel*dt;player.vy+=mv.y*accel*dt;player.angle=Math.atan2(mv.y,mv.x);player.flap+=dt*20;game.battery=Math.max(0,game.battery-dt*(18+power*7));audio.blast();gustParticle(mv,power);applyGust(mv,power,dt);
    }else{game.battery=Math.min(100,game.battery+dt*30);player.flap+=dt*5;}
    if(!game.controlStarted){game.battery=100;player.flap+=dt*4;updateParticles(dt);updateHUD();return;}
    player.vy+=165*dt;const damping=Math.pow(.33,dt);player.vx*=damping;player.vy*=Math.pow(.42,dt);const max=360,l=Math.hypot(player.vx,player.vy);if(l>max){player.vx=player.vx/l*max;player.vy=player.vy/l*max;}
    player.x+=player.vx*dt;player.y+=player.vy*dt;
    if(player.x<30){player.x=30;player.vx=Math.abs(player.vx)*.35;}if(player.x>W-30){player.x=W-30;player.vx=-Math.abs(player.vx)*.35;}if(player.y<145){player.y=145;player.vy=Math.abs(player.vy)*.25;}
    if(game.state==='playing') updateClimb(dt); else updateFinale(dt);
    updateParticles(dt);updateHUD();
  }

  function applyGust(mv,power,dt){
    const gx=-mv.x,gy=-mv.y,bx=player.x+gx*28,by=player.y+gy*28;
    for(const o of game.objects){const dx=o.x-bx,dy=o.y-by,d=Math.hypot(dx,dy);if(d>205||d<1)continue;const dot=(dx/d)*gx+(dy/d)*gy;if(dot<.58)continue;const force=(1-d/230)*760*power/o.mass;o.vx+=gx*force*dt;o.vy+=gy*force*dt;o.vr+=rand(-5,5)*dt;if(!o.gusted&&force>130){o.gusted=true;game.deflects++;addScore(o.hazard?120:70,o.x,o.y);emit(o.x,o.y,o.hazard?'#ff7c47':'#55e0ba',5,80);}}
    if(game.hat){const h=game.hat,dx=h.x-bx,dy=h.y-by,d=Math.hypot(dx,dy);if(d<310){const dot=(dx/d)*gx+(dy/d)*gy;if(dot>.18){const f=(1-d/340)*760*power;h.vx+=gx*f*dt;h.vy+=gy*f*dt;h.assist=2.4;emit(h.x,h.y,'#ffd34f',1,25);}}}
  }
  function addScore(base,x,y){game.combo=clamp(game.combo+1,1,8);game.comboTimer=2.6;game.score+=base*game.combo;floatingText(`+${base*game.combo}`,x,y,'#ffd34f');audio.collect();}
  function floatingText(text,x,y,color){game.particles.push({x,y,vx:0,vy:-45,life:.8,max:.8,color,size:16,text});}

  function updateClimb(dt){
    const lift=clamp((720-player.y)*.15 + Math.max(0,-player.vy)*.16,0,125);game.scroll=lerp(game.scroll,lift,dt*2.2);game.altitude+=game.scroll*dt*.18;
    if(player.y>955){damage('THE GROUND WAS ALWAYS THERE');player.y=810;player.vy=-150;}
    game.nextSpawn-=dt;if(game.nextSpawn<=0)spawnObject();
    for(const c of game.clouds){c.y+=game.scroll*dt*(c.layer?.38:.16);if(c.y>1040){c.y=-120;c.x=rand(-70,W);}}
    for(const o of game.objects){
      o.phase+=dt;o.rot+=o.vr*dt;o.x+=o.vx*dt;o.y+=(o.vy+game.scroll)*dt;o.vx*=Math.pow(.8,dt);o.vy*=Math.pow(.87,dt);
      if(o.type==='balloon')o.vy-=20*dt;if(o.type==='drone')o.x+=Math.sin(o.phase*2.2)*40*dt;if(o.type==='cloud')o.x+=Math.sin(o.phase)*20*dt;
      if(o.x<-100||o.x>W+100||o.y>1050||o.y<-180){if(o.gusted&&o.hazard)game.score+=35;o.dead=true;}
      if(!o.dead&&dist2(o,player)<(o.r+player.r-4)**2){if(o.type==='battery'){game.battery=Math.min(100,game.battery+48);o.dead=true;game.score+=150;toast('INDUSTRIAL LEAF JUICE +48','#55e0ba',1100);audio.collect();emit(o.x,o.y,'#55e0ba',12,140);}else if(o.hazard){o.dead=true;damage(typeHitLine(o.type));emit(o.x,o.y,'#ef476f',16,190);}else{o.vx+=(o.x-player.x)*4;o.vy-=120;addScore(45,o.x,o.y);}}
    }
    game.objects=game.objects.filter(o=>!o.dead);
    game.comboTimer-=dt;if(game.comboTimer<=0)game.combo=Math.max(1,game.combo-dt*2.4);
    const nextDistrict=game.altitude>=1200?3:game.altitude>=800?2:game.altitude>=400?1:0;if(nextDistrict!==game.district){game.district=nextDistrict;checkpoint(nextDistrict*400);}
    if(game.altitude>=1500)beginFinale();
    if(game.altitude-game.savedAt>80){game.savedAt=game.altitude;saveProgress();}
  }
  function typeHitLine(t){return({umbrella:'UMBRELLA: 1 · AVIATION: 0',kite:'KITE STRING HAS OPINIONS',drone:'DRONE CLAIMS RIGHT OF WAY',cloud:'CLOUD WAS FEELING PERSONAL'})[t]||'AERIAL DISAGREEMENT'}
  function damage(line){if(player.invuln>0)return;game.health--;player.invuln=2;player.hit=.45;game.combo=1;game.shake=prefs.motion?12:2;game.flash=.7;game.flashColor='#ef476f';toast(line,'#ef476f');audio.hit();navigator.vibrate?.(35);if(game.health<=0)crash();}
  function checkpoint(value){game.checkpoint=value;save.checkpoint=value;save.completed=false;saveProgress();audio.checkpoint();const names=['','BALLOON SUBURBS — WIND HAS CONSEQUENCES','CLOUD OFFICE — MANAGEMENT IS FURIOUS','CITY HALL AIRSPACE — DEFINITELY RESTRICTED'];toast(`CHECKPOINT ${value}m · ${names[game.district]}`,'#55e0ba',2600);game.health=Math.min(3,game.health+1);game.battery=100;game.flash=.55;game.flashColor='#55e0ba';}
  function beginFinale(){
    game.state='finale';game.altitude=1500;game.objects=[];game.scroll=0;player.x=270;player.y=780;player.vx=0;player.vy=0;game.hat={x:270,y:650,vx:rand(-45,45),vy:-120,r:27,rot:0,assist:0};game.finaleTimer=0;game.objective='BLOW THE HAT ONTO THE GOLD HOOK';toast('OH NO. THE IMPORTANT HAT IS FREE.','#ffd34f',3000);audio.checkpoint();
  }
  function updateFinale(dt){
    const h=game.hat;if(!h)return;h.assist=Math.max(0,(h.assist||0)-dt);if(h.assist>0){h.vx+=(270-h.x)*.72*dt;h.vy+=(220-h.y)*.34*dt;}h.vy+=82*dt;h.vx*=Math.pow(.68,dt);h.vy*=Math.pow(.86,dt);h.x+=h.vx*dt;h.y+=h.vy*dt;h.rot+=h.vx*dt*.01;
    if(h.x<30){h.x=30;h.vx=Math.abs(h.vx)*.6}if(h.x>W-30){h.x=W-30;h.vx=-Math.abs(h.vx)*.6}if(h.y<120){h.y=120;h.vy=Math.abs(h.vy)*.4}if(h.y>900){h.y=820;h.x=rand(120,420);h.vy=-150;game.finaleTimer=0;toast('THE HAT HAS REQUESTED ANOTHER ATTEMPT','#ff7c47',1500);}
    const target={x:270,y:220};const inside=Math.abs(h.x-target.x)<58&&Math.abs(h.y-target.y)<39&&Math.hypot(h.vx,h.vy)<140;
    if(inside){game.finaleTimer+=dt;h.vx*=.88;h.vy*=.88;if(game.finaleTimer>1.5){game.score+=2000;complete();}}else game.finaleTimer=Math.max(0,game.finaleTimer-dt*.5);
    if(player.y>920){player.y=820;player.vy=-130;}
  }
  function updateParticles(dt){for(const p of game.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.text)p.vy+=30*dt;}game.particles=game.particles.filter(p=>p.life>0);}
  function updateHUD(){
    ui.altitude.textContent=Math.floor(game.altitude);ui.battery.style.width=game.battery+'%';ui.health.style.width=(game.health/3*100)+'%';
    const names=['LAUNDRY DISTRICT','BALLOON SUBURBS','CLOUD OFFICE','CITY HALL AIRSPACE'];ui.district.textContent=game.state==='finale'?'THE HAT FINALE':names[game.district];ui.objective.textContent=game.state==='finale'?'BLOW HAT ONTO THE GOLD HOOK':'REACH CITY HALL · 1,500m';
    ui.combo.classList.toggle('hidden',game.combo<2);ui.comboValue.textContent=Math.floor(game.combo);
  }

  function draw(){
    const shakeX=game.shake?rand(-game.shake,game.shake):0,shakeY=game.shake?rand(-game.shake,game.shake):0;ctx.save();ctx.translate(shakeX,shakeY);
    drawSky();drawCity();drawClouds();if(game.state==='finale')drawCityHall();for(const o of game.objects)drawObject(o);if(game.hat)drawHat(game.hat);drawPlayer();drawParticles();if(game.state==='finale')drawFinalTarget();ctx.restore();
    if(game.flash>0){ctx.globalAlpha=game.flash*.28;ctx.fillStyle=game.flashColor;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
  }
  function drawSky(){
    const palettes=[['#5bc5ed','#376eb7'],['#52b9df','#926bc2'],['#4a67a7','#242e65'],['#29345e','#141932']][game.district]||['#5bc5ed','#376eb7'];const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,palettes[1]);g.addColorStop(1,palettes[0]);ctx.fillStyle=g;ctx.fillRect(-20,-20,W+40,H+40);
    ctx.globalAlpha=.15;ctx.strokeStyle='#fff';ctx.lineWidth=2;for(let y=(game.time*35)%80-80;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y+40);ctx.stroke();}ctx.globalAlpha=1;
  }
  function drawCity(){const base=H-70+(game.altitude%180)*2.2;ctx.fillStyle='#1b2853';for(let i=0;i<9;i++){const x=i*68-20,h=randSeed(i+3,90,260);ctx.fillRect(x,base-h,54,h);ctx.fillStyle='#ffd34f55';for(let wy=base-h+20;wy<base-10;wy+=30)for(let wx=x+9;wx<x+50;wx+=20)ctx.fillRect(wx,wy,7,10);ctx.fillStyle='#1b2853';}ctx.fillStyle='#10162f';ctx.fillRect(0,base,W,H-base);}
  function randSeed(n,a,b){const s=Math.sin(n*999+Math.floor(game.altitude/180))*43758.5453;return a+(s-Math.floor(s))*(b-a)}
  function drawClouds(){for(const c of game.clouds){ctx.save();ctx.globalAlpha=c.layer?.28:.55;ctx.translate(c.x,c.y);ctx.scale(c.s,c.s);ctx.fillStyle='#fff6d7';blobCloud(0,0);ctx.restore();}}
  function blobCloud(x,y){ctx.beginPath();ctx.arc(x,y,28,0,TAU);ctx.arc(x+30,y-13,36,0,TAU);ctx.arc(x+70,y,27,0,TAU);ctx.rect(x,y,72,30);ctx.fill();}
  function drawPlayer(){
    const a=player.angle,blink=player.invuln>0&&Math.floor(game.time*12)%2===0;if(blink)ctx.globalAlpha=.35;ctx.save();ctx.translate(player.x,player.y);ctx.rotate(a+Math.PI/2);const bob=Math.sin(player.flap)*4;
    ctx.strokeStyle='#10162f';ctx.lineWidth=6;ctx.lineJoin='round';ctx.fillStyle='#9da9c8';ctx.beginPath();ctx.ellipse(0,bob,27,34,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#7f8eaf';ctx.beginPath();ctx.ellipse(-25,bob+3,11,25,-.7,0,TAU);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(25,bob+3,11,25,.7,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#55c8ad';ctx.beginPath();ctx.ellipse(0,bob-9,26,14,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-9,bob-20,7,0,TAU);ctx.arc(9,bob-20,7,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#10162f';ctx.beginPath();ctx.arc(-8,bob-20,2,0,TAU);ctx.arc(8,bob-20,2,0,TAU);ctx.fill();
    ctx.fillStyle='#ff7c47';ctx.beginPath();ctx.moveTo(-7,bob-12);ctx.lineTo(0,bob-3);ctx.lineTo(7,bob-12);ctx.closePath();ctx.fill();ctx.stroke();
    if(!game.hat) drawHatShape(0,bob-47,.72,0);
    ctx.fillStyle='#ff7c47';ctx.fillRect(-12,bob+22,24,15);ctx.strokeRect(-12,bob+22,24,15);ctx.fillStyle='#ffd34f';ctx.beginPath();ctx.moveTo(-7,bob+37);ctx.lineTo(-22,bob+83);ctx.lineTo(22,bob+83);ctx.lineTo(7,bob+37);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#10162f';ctx.font='900 8px system-ui';ctx.textAlign='center';ctx.fillText('9000',0,bob+65);
    ctx.restore();ctx.globalAlpha=1;
  }
  function drawObject(o){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.rot);ctx.lineWidth=5;ctx.strokeStyle='#10162f';ctx.lineJoin='round';if(o.gusted){ctx.shadowColor='#fff6d7';ctx.shadowBlur=12;}
    if(o.type==='sock'){ctx.fillStyle='#fff6d7';ctx.beginPath();ctx.moveTo(-9,-25);ctx.lineTo(13,-25);ctx.lineTo(11,4);ctx.quadraticCurveTo(32,13,15,25);ctx.quadraticCurveTo(-8,35,-13,12);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#ef476f';ctx.fillRect(-9,-25,22,9);}
    else if(o.type==='pillow'){ctx.fillStyle='#fff6d7';roundRect(-27,-20,54,40,10);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,0,4,0,TAU);ctx.stroke();}
    else if(o.type==='battery'){ctx.fillStyle='#55e0ba';roundRect(-17,-25,34,50,7);ctx.fill();ctx.stroke();ctx.fillStyle='#10162f';ctx.fillRect(-7,-33,14,8);ctx.fillStyle='#ffd34f';ctx.font='900 24px system-ui';ctx.textAlign='center';ctx.fillText('⚡',0,9);}
    else if(o.type==='umbrella'){ctx.fillStyle='#ef476f';ctx.beginPath();ctx.arc(0,0,30,Math.PI,TAU);ctx.lineTo(0,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,36);ctx.quadraticCurveTo(0,49,13,43);ctx.stroke();}
    else if(o.type==='balloon'){ctx.fillStyle='#ffd34f';ctx.beginPath();ctx.ellipse(0,-5,24,30,0,0,TAU);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,25);ctx.quadraticCurveTo(17,42,-4,58);ctx.stroke();}
    else if(o.type==='kite'){ctx.fillStyle='#ef476f';ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(25,0);ctx.lineTo(0,31);ctx.lineTo(-25,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,31);ctx.quadraticCurveTo(25,50,-5,68);ctx.stroke();}
    else if(o.type==='drone'){ctx.fillStyle='#6878a5';roundRect(-26,-15,52,30,8);ctx.fill();ctx.stroke();for(const s of [-1,1]){ctx.beginPath();ctx.moveTo(s*22,-8);ctx.lineTo(s*42,-22);ctx.stroke();ctx.beginPath();ctx.ellipse(s*42,-23,20,5,0,0,TAU);ctx.stroke();}ctx.fillStyle='#ef476f';ctx.beginPath();ctx.arc(0,0,6,0,TAU);ctx.fill();}
    else if(o.type==='cloud'){ctx.fillStyle='#66749b';blobCloud(-36,-8);ctx.stroke();ctx.fillStyle='#10162f';ctx.beginPath();ctx.arc(-3,-5,4,0,TAU);ctx.arc(22,-5,4,0,TAU);ctx.fill();ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(4,12);ctx.lineTo(17,12);ctx.stroke();}
    ctx.restore();}
  function drawHat(h){ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.rot);drawHatShape(0,0,1,0);ctx.restore();}
  function drawHatShape(x,y,s,rot){ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(s,s);ctx.fillStyle='#ffd34f';ctx.strokeStyle='#10162f';ctx.lineWidth=6;roundRect(-30,-21,60,35,6);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(0,15,44,10,0,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#10162f';ctx.font='900 8px system-ui';ctx.textAlign='center';ctx.fillText('MAYOR',0,1);ctx.restore();}
  function drawCityHall(){ctx.fillStyle='#e8d6a6';ctx.strokeStyle='#10162f';ctx.lineWidth=7;ctx.fillRect(70,90,400,185);ctx.strokeRect(70,90,400,185);ctx.fillStyle='#ffd34f';ctx.beginPath();ctx.moveTo(50,90);ctx.lineTo(270,10);ctx.lineTo(490,90);ctx.closePath();ctx.fill();ctx.stroke();for(let x=110;x<=430;x+=80){ctx.fillStyle='#fff6d7';ctx.fillRect(x,115,32,160);ctx.strokeRect(x,115,32,160);}ctx.fillStyle='#10162f';ctx.font='1000 21px system-ui';ctx.textAlign='center';ctx.fillText('CITY HALL / HAT DEPT.',270,78);}
  function drawFinalTarget(){const p=clamp(game.finaleTimer/2.1,0,1);ctx.save();ctx.strokeStyle='#ffd34f';ctx.lineWidth=6;ctx.setLineDash([10,8]);ctx.beginPath();ctx.ellipse(270,220,58,40,0,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#10162fcc';roundRect(150,290,240,48,14);ctx.fill();ctx.fillStyle='#fff6d7';ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillText(p>0?'HOLD IT STEADY…':'BLOW HAT INTO GOLD HOOK',270,312);if(p>0){ctx.fillStyle='#55e0ba';ctx.fillRect(165,322,210*p,6);}ctx.restore();}
  function drawParticles(){for(const p of game.particles){ctx.save();ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.strokeStyle=p.color;if(p.text){ctx.font=`1000 ${p.size}px system-ui`;ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}else if(p.line){ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.07,p.y-p.vy*.07);ctx.stroke();}else{ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,TAU);ctx.fill();}ctx.restore();}}
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):(ctx.rect(x,y,w,h));}

  function toggleMute(){audio.init();const v=prefs.volume>0?0:.75;audio.setVolume(v);syncSettings();$('muteButton').textContent=v?'♪':'×';}
  $('startButton').onclick=startBrief;$('briefButton').onclick=()=>beginGame(0);$('continueButton').onclick=()=>beginGame(save.checkpoint);
  $('howButton').onclick=()=>{audio.click();setOverlay(ui.how)};$('closeHowButton').onclick=()=>{audio.click();setOverlay(ui.title)};
  $('settingsButton').onclick=()=>{audio.click();syncSettings();setOverlay(ui.settings)};$('closeSettingsButton').onclick=()=>{audio.click();setOverlay(ui.title)};
  $('pauseButton').onclick=pause;$('resumeButton').onclick=resume;$('restartButton').onclick=()=>beginGame(game.checkpoint);$('quitButton').onclick=title;
  $('retryButton').onclick=()=>beginGame(game.checkpoint);$('crashTitleButton').onclick=title;$('replayButton').onclick=()=>{save.completed=false;beginGame(0)};$('finalTitleButton').onclick=title;$('muteButton').onclick=toggleMute;
  function volumeChange(e){const v=Number(e.target.value)/100;audio.init();audio.setVolume(v);syncSettings();}
  ui.volume.oninput=volumeChange;ui.titleVolume.oninput=volumeChange;
  function motionChange(e){prefs.motion=e.target.checked;savePrefs();syncSettings();}ui.motion.onchange=motionChange;ui.titleMotion.onchange=motionChange;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(game.state==='playing'||game.state==='finale')pause();saveProgress();}});window.addEventListener('pagehide',saveProgress);
  window.addEventListener('blur',()=>{if(game.state==='playing'||game.state==='finale')pause()});

  function loop(now){const dt=Math.min(.033,Math.max(0,(now-game.last)/1000||0));game.last=now;update(dt);draw();requestAnimationFrame(loop);}
  syncSettings();updateTitle();for(let i=0;i<12;i++)game.clouds.push({x:rand(-60,W),y:rand(-100,H),s:rand(.45,1.2),layer:Math.random()<.5?0:1});if(new URLSearchParams(location.search).get('final')==='1')showFinalPreview();requestAnimationFrame(loop);
})();
