(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const shell = document.querySelector('#game-shell');
  const startScreen = document.querySelector('#start-screen');
  const endScreen = document.querySelector('#end-screen');
  const healthFill = document.querySelector('#health-fill');
  const healthText = document.querySelector('#health-text');
  const chargeFill = document.querySelector('#charge-fill');
  const chargeText = document.querySelector('#charge-text');
  const chargeHint = document.querySelector('#charge-hint');
  const waveNumber = document.querySelector('#wave-number');
  const timerText = document.querySelector('#timer');
  const objectiveCopy = document.querySelector('#objective-copy');
  const toast = document.querySelector('#toast');
  const crosshair = document.querySelector('#crosshair');
  const touchControls = document.querySelector('#touch-controls');
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const TAU = Math.PI * 2;
  let W = 0, H = 0, dpr = 1, last = 0, gameState = 'menu', elapsed = 0, wave = 1, kills = 0;
  let player, enemies = [], bullets = [], enemyBullets = [], shards = [], particles = [], stars = [], keys = {}, pointer = {x:0,y:0,down:false}, moveTouch = {}, audioOn = false, audioCtx;
  let spawnQueue = [], spawnClock = 0, pulseEffect = 0, flash = 0, toastClock = 0, shake = 0, safeDamageClock = 0;

  function resize(){
    const r = shell.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    stars = Array.from({length:Math.floor(W*H/8500)},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.5+.25,a:Math.random()*.55+.1,phase:Math.random()*TAU}));
    if(player && gameState!=='playing'){ player.x=W*.5; player.y=H*.55; }
  }
  window.addEventListener('resize',resize); resize();
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function showToast(text){toast.textContent=text;toast.classList.add('show');toastClock=1.8;}
  function updateHud(){
    if(!player)return;
    healthFill.style.width=`${clamp(player.hp,0,100)}%`; healthText.textContent=Math.ceil(player.hp);
    chargeFill.style.width=`${player.charge}%`;chargeText.textContent=`${player.charge}%`;
    chargeHint.textContent=player.charge>=100?'Q / TAP TO RELEASE':'COLLECT SHARDS TO CHARGE';
    document.querySelector('#touch-pulse').classList.toggle('ready',player.charge>=100);
    document.querySelector('#touch-pulse small').textContent=player.charge>=100?'READY':`${player.charge}%`;
    waveNumber.innerHTML=`0${wave} <em>/ 03</em>`;
    document.querySelectorAll('.wave-dots i').forEach((el,i)=>el.classList.toggle('active',i<wave));
    const left=Math.max(0,120-elapsed);timerText.textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(Math.floor(left%60)).padStart(2,'0')}`;
  }
  function startGame(){
    gameState='playing';elapsed=0;wave=1;kills=0;enemies=[];bullets=[];enemyBullets=[];shards=[];particles=[];spawnQueue=[];spawnClock=.8;pulseEffect=0;flash=0;safeDamageClock=0;
    player={x:W*.5,y:H*.57,r:15,hp:100,charge:0,fireCd:0,invuln:0,angle:-Math.PI/2};
    for(let i=0;i<7;i++)spawnQueue.push({type:'skitter',delay:i*.82});
    startScreen.classList.remove('visible');endScreen.classList.remove('visible');touchControls.classList.toggle('active',isTouch);crosshair.style.display=isTouch?'none':'block';objectiveCopy.textContent='Defeat the incoming riftborn. Keep moving.';showToast('BREACH DETECTED — HOLD THE LINE');updateHud();
  }
  function endGame(won){
    gameState=won?'won':'lost';touchControls.classList.remove('active');crosshair.style.display='none';
    document.querySelector('#end-kicker').innerHTML=`<span></span> ${won?'MISSION REPORT':'SIGNAL LOST'}`;
    document.querySelector('#end-sigil').textContent=won?'✦':'⌁';document.querySelector('#end-title').textContent=won?'CITADEL SECURED':'THE BREACH CONSUMES';
    document.querySelector('#end-copy').textContent=won?'The rift is sealed. This world gets another dawn.':'The Citadel fell, but the fight isn’t over. Regroup and go again.';
    document.querySelector('#score').textContent=String(kills).padStart(2,'0');
    const survival=Math.floor(elapsed);document.querySelector('#survival-time').textContent=`${String(Math.floor(survival/60)).padStart(2,'0')}:${String(survival%60).padStart(2,'0')}`;
    endScreen.classList.add('visible');
  }
  function randomEdge(){const side=Math.floor(Math.random()*4),pad=48;return side===0?{x:rand(20,W-20),y:pad}:side===1?{x:W-pad,y:rand(90,H-20)}:side===2?{x:rand(20,W-20),y:H-pad}:{x:pad,y:rand(90,H-20)};}
  function spawnEnemy(type){
    const p=randomEdge();const big=type==='brute';
    enemies.push({x:p.x,y:p.y,r:big?22:14,hp:big?7:type==='spitter'?3:2,maxHp:big?7:type==='spitter'?3:2,type,speed:big?48:type==='spitter'?56:78,hitCd:0,shotCd:rand(1.0,2.4),phase:Math.random()*TAU,knock:0});
  }
  function addBurst(x,y,color,count=9,power=120){for(let i=0;i<count;i++){const a=rand(0,TAU),s=rand(power*.25,power),life=rand(.24,.7);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,r:rand(1,3),color});}}
  function killEnemy(e){
    const ix=enemies.indexOf(e);if(ix<0)return;enemies.splice(ix,1);kills++;addBurst(e.x,e.y,e.type==='brute'?'#ff875d':'#74e6dd',15,180);
    if(Math.random()<.78 || e.type==='brute')shards.push({x:e.x,y:e.y,r:7,life:12,phase:Math.random()*TAU});
    if(wave===3&&e.type==='brute')showToast('WARDEN DOWN — FINISH THE WAVE');
  }
  function fire(){
    if(!player||player.fireCd>0)return;
    let target;
    if(!isTouch && pointer.x>0){target={x:pointer.x,y:pointer.y};}
    else if(enemies.length){target=enemies.reduce((a,e)=>!a||dist(player,e)<dist(player,a)?e:a,null);}
    else target={x:player.x+Math.cos(player.angle)*100,y:player.y+Math.sin(player.angle)*100};
    const angle=Math.atan2(target.y-player.y,target.x-player.x);player.angle=angle;
    const speed=570;bullets.push({x:player.x+Math.cos(angle)*17,y:player.y+Math.sin(angle)*17,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:4,life:.95});player.fireCd=.19;
    addBurst(player.x+Math.cos(angle)*18,player.y+Math.sin(angle)*18,'#8df6eb',2,45);playTone(480,.035,'triangle',.018);
  }
  function usePulse(){
    if(gameState!=='playing'||player.charge<100)return;
    player.charge=0;pulseEffect=.85;shake=9;flash=.2;playTone(85,.42,'sawtooth',.045);
    showToast('RIFT PULSE — GRAVITY INVERTED');
    for(const e of [...enemies]){
      const d=dist(player,e);if(d<215){const strength=1-d/260;e.hp-=e.type==='brute'?2.5:9;e.knock=.5;e.x=player.x+(e.x-player.x)*.34;e.y=player.y+(e.y-player.y)*.34;addBurst(e.x,e.y,'#72eee0',5,120);if(e.hp<=0)killEnemy(e);}
    }
    for(let i=0;i<44;i++){const a=rand(0,TAU),d=rand(45,235);particles.push({x:player.x+Math.cos(a)*d,y:player.y+Math.sin(a)*d,vx:-Math.cos(a)*rand(80,210),vy:-Math.sin(a)*rand(80,210),life:rand(.35,.8),max:.8,r:rand(1,3),color:'#6de2dc'});}
    updateHud();
  }
  function playTone(freq,duration,type='sine',volume=.03){if(!audioOn)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}catch(e){}}

  function drawBackground(t){
    const grad=ctx.createRadialGradient(W*.53,H*.48,20,W*.52,H*.52,Math.max(W,H)*.8);grad.addColorStop(0,'#142d35');grad.addColorStop(.42,'#0d202b');grad.addColorStop(1,'#07111b');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    for(const s of stars){ctx.globalAlpha=s.a*(.75+.25*Math.sin(t*1.5+s.phase));ctx.fillStyle='#b8e4de';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,TAU);ctx.fill();}ctx.globalAlpha=1;
    // distant rift-lit spires
    for(let i=0;i<8;i++){const x=((i*197+W*.1)%W),h=65+(i*53%90),y=H*.52-h;ctx.fillStyle=i%2?'rgba(26,52,61,.38)':'rgba(23,46,57,.48)';ctx.beginPath();ctx.moveTo(x-25,H*.58);ctx.lineTo(x-17,y+18);ctx.lineTo(x-4,y);ctx.lineTo(x+2,y+22);ctx.lineTo(x+14,y+7);ctx.lineTo(x+25,H*.58);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(102,188,183,.12)';ctx.lineWidth=1;ctx.stroke();}
    // tiled broken floor
    const grid=54,off=(elapsed*9)%grid;ctx.lineWidth=1;ctx.strokeStyle='rgba(106,174,172,.09)';ctx.beginPath();for(let x=0;x<W;x+=grid){ctx.moveTo(x,70);ctx.lineTo(x,H);}for(let y=74-off;y<H;y+=grid){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();
    // central reactor platform
    const cx=W*.5,cy=H*.52,rad=Math.min(W*.25,H*.34);ctx.fillStyle='rgba(8,21,29,.46)';ctx.beginPath();ctx.ellipse(cx,cy,rad*1.48,rad*.86,0,0,TAU);ctx.fill();ctx.strokeStyle='rgba(85,184,179,.22)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(cx,cy,rad*1.42,rad*.82,0,0,TAU);ctx.stroke();ctx.setLineDash([6,14]);ctx.lineWidth=1;ctx.strokeStyle='rgba(109,226,220,.16)';ctx.beginPath();ctx.ellipse(cx,cy,rad*1.19,rad*.68,0,0,TAU);ctx.stroke();ctx.setLineDash([]);
    // cracks
    ctx.strokeStyle='rgba(121,175,169,.11)';ctx.lineWidth=2;for(let i=0;i<8;i++){const a=i*.79+.12;const x=cx+Math.cos(a)*rad*1.2,y=cy+Math.sin(a)*rad*.67;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a+.35)*(20+(i%3)*7),y+Math.sin(a-.2)*25);ctx.lineTo(x+Math.cos(a)*52,y+Math.sin(a)*39);ctx.stroke();}
    // far rift
    const riftX=W*.76,riftY=H*.43;ctx.save();ctx.translate(riftX,riftY);ctx.rotate(t*.12);ctx.strokeStyle='rgba(255,117,86,.23)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,44+Math.sin(t*2)*4,103,0,0,TAU);ctx.stroke();ctx.rotate(-t*.24);ctx.strokeStyle='rgba(109,226,220,.18)';ctx.beginPath();ctx.ellipse(0,0,30,82,0,0,TAU);ctx.stroke();ctx.restore();
    // Collapse safe area warning
    if(gameState==='playing'){
      const pct=clamp(elapsed/120,0,1),base=Math.min(W,H)*.56,rx=base*(1-.38*pct),ry=rx*.73;ctx.save();ctx.setLineDash([10,12]);ctx.lineWidth=2;ctx.strokeStyle=pct>.55?'rgba(255,115,82,.48)':'rgba(255,135,93,.25)';ctx.beginPath();ctx.ellipse(W/2,H*.53,rx,ry,0,0,TAU);ctx.stroke();ctx.setLineDash([]);
      const outside=Math.abs(player.x-W/2)>rx || Math.abs(player.y-H*.53)>ry;
      if(outside){ctx.fillStyle='rgba(255,75,60,.06)';ctx.fillRect(0,0,W,H);}ctx.restore();
    }
    const vignette=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.22,W/2,H/2,Math.max(W,H)*.73);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'rgba(1,6,12,.55)');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  }
  function drawPlayer(){
    if(!player)return;const p=player;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    if(p.invuln>0&&Math.floor(elapsed*12)%2===0)ctx.globalAlpha=.45;
    // shadow + cloak
    ctx.fillStyle='rgba(0,0,0,.4)';ctx.beginPath();ctx.ellipse(-2,8,17,11,0,0,TAU);ctx.fill();
    ctx.fillStyle='#173944';ctx.beginPath();ctx.moveTo(-11,-9);ctx.lineTo(-19,13);ctx.lineTo(0,20);ctx.lineTo(13,10);ctx.lineTo(11,-10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#78dcd4';ctx.beginPath();ctx.moveTo(2,-13);ctx.lineTo(17,-8);ctx.lineTo(18,-3);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e7e5d7';ctx.beginPath();ctx.arc(0,-5,9,0,TAU);ctx.fill();ctx.fillStyle='#203a43';ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(9,-9);ctx.lineTo(7,-3);ctx.lineTo(-7,-3);ctx.lineTo(-8,-9);ctx.closePath();ctx.fill();
    ctx.fillStyle='#63e5dc';ctx.shadowColor='#69eee0';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(3,3,4,0,TAU);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#bdd2cf';ctx.beginPath();ctx.moveTo(14,-3);ctx.lineTo(24,0);ctx.lineTo(14,4);ctx.closePath();ctx.fill();
    ctx.restore();
    if(pulseEffect>0){const r=(1-pulseEffect/.85)*260;ctx.save();ctx.strokeStyle=`rgba(109,226,220,${pulseEffect})`;ctx.lineWidth=3+pulseEffect*5;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.stroke();ctx.restore();}
  }
  function drawEnemy(e){
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.sin(elapsed*2+e.phase)*.08);
    ctx.shadowColor=e.type==='brute'?'#ff765b':'#df567e';ctx.shadowBlur=13;
    if(e.type==='brute'){
      ctx.fillStyle='#482c36';ctx.beginPath();ctx.moveTo(-18,-16);ctx.lineTo(-10,-25);ctx.lineTo(0,-21);ctx.lineTo(13,-23);ctx.lineTo(22,-12);ctx.lineTo(19,13);ctx.lineTo(7,22);ctx.lineTo(-12,20);ctx.lineTo(-22,8);ctx.closePath();ctx.fill();ctx.strokeStyle='#ff8966';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#ff9872';ctx.fillRect(-10,-4,6,3);ctx.fillRect(5,-4,6,3);ctx.fillStyle='#f8b18a';ctx.beginPath();ctx.arc(0,7,4,0,TAU);ctx.fill();
    } else {
      ctx.fillStyle=e.type==='spitter'?'#552d48':'#492b3c';ctx.beginPath();ctx.moveTo(0,-17);ctx.lineTo(13,-8);ctx.lineTo(17,5);ctx.lineTo(7,16);ctx.lineTo(-7,16);ctx.lineTo(-17,5);ctx.lineTo(-12,-9);ctx.closePath();ctx.fill();ctx.strokeStyle=e.type==='spitter'?'#d881d1':'#ed6e86';ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle='#ffb08d';ctx.fillRect(-8,-3,5,3);ctx.fillRect(4,-3,5,3);ctx.fillStyle='#291a29';ctx.beginPath();ctx.moveTo(-5,9);ctx.lineTo(0,4);ctx.lineTo(5,9);ctx.fill();
    }
    ctx.shadowBlur=0;ctx.restore();
    if(e.hp<e.maxHp){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(e.x-16,e.y-e.r-9,32,3);ctx.fillStyle=e.type==='brute'?'#ff946d':'#dc758b';ctx.fillRect(e.x-16,e.y-e.r-9,32*e.hp/e.maxHp,3);}
  }
  function draw(){
    ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));drawBackground(elapsed);
    // reactor glow
    const rg=ctx.createRadialGradient(W*.5,H*.52,0,W*.5,H*.52,55);rg.addColorStop(0,'rgba(72,201,192,.19)');rg.addColorStop(1,'transparent');ctx.fillStyle=rg;ctx.fillRect(W*.5-60,H*.52-60,120,120);
    ctx.save();ctx.translate(W*.5,H*.52);ctx.rotate(elapsed*.35);ctx.strokeStyle='rgba(109,226,220,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(18,0);ctx.lineTo(0,22);ctx.lineTo(-18,0);ctx.closePath();ctx.stroke();ctx.restore();
    for(const s of shards){const pulse=1+Math.sin(elapsed*5+s.phase)*.18;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(elapsed*1.2);ctx.shadowBlur=16;ctx.shadowColor='#6de2dc';ctx.fillStyle='#9bf3e7';ctx.beginPath();ctx.moveTo(0,-7*pulse);ctx.lineTo(6*pulse,0);ctx.lineTo(0,7*pulse);ctx.lineTo(-6*pulse,0);ctx.closePath();ctx.fill();ctx.restore();}
    for(const b of bullets){ctx.fillStyle='#a1fff1';ctx.shadowColor='#67e8dc';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();ctx.shadowBlur=0;}
    for(const b of enemyBullets){ctx.fillStyle='#ff9678';ctx.shadowColor='#ff6c5a';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();ctx.shadowBlur=0;}
    for(const e of enemies)drawEnemy(e);drawPlayer();
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();}ctx.globalAlpha=1;
    if(flash>0){ctx.fillStyle=`rgba(149,255,240,${flash*.48})`;ctx.fillRect(-20,-20,W+40,H+40);}ctx.restore();
  }
  function update(dt){
    if(toastClock>0){toastClock-=dt;if(toastClock<=0)toast.classList.remove('show');}
    if(gameState!=='playing')return;
    elapsed+=dt;player.invuln=Math.max(0,player.invuln-dt);player.fireCd-=dt;player.charge=clamp(player.charge,0,100);
    const left=keys.ArrowLeft||keys.KeyA||moveTouch.left,right=keys.ArrowRight||keys.KeyD||moveTouch.right,up=keys.ArrowUp||keys.KeyW||moveTouch.up,down=keys.ArrowDown||keys.KeyS||moveTouch.down;
    let dx=(right?1:0)-(left?1:0),dy=(down?1:0)-(up?1:0);if(dx||dy){const m=Math.hypot(dx,dy);player.x+=dx/m*230*dt;player.y+=dy/m*230*dt;}
    player.x=clamp(player.x,20,W-20);player.y=clamp(player.y,90,H-20);
    if(pointer.down||keys.Space||isTouch&&keys.TouchFire)fire();
    // The safe zone steadily closes; being outside drains health.
    const safe=Math.min(W,H)*.56*(1-.38*clamp(elapsed/120,0,1));
    if(((player.x-W/2)/safe)**2+((player.y-H*.53)/(safe*.73))**2>1){safeDamageClock+=dt;if(safeDamageClock>.4){safeDamageClock=0;player.hp-=4;showToast('WARNING — RETURN TO THE SAFE ZONE');}}else safeDamageClock=0;
    // Scheduled wave deployment
    spawnClock-=dt;while(spawnQueue.length&&spawnQueue[0].delay<=elapsed){const item=spawnQueue.shift();spawnEnemy(item.type);}
    if(wave===1&&elapsed>13){wave=2;for(let i=0;i<8;i++)spawnQueue.push({type:i%3===0?'spitter':'skitter',delay:elapsed+rand(.4,8)});spawnQueue.sort((a,b)=>a.delay-b.delay);objectiveCopy.textContent='Wave 2: ranged riftborn detected. Break their line.';showToast('WAVE 02 — THEY’RE LEARNING');}
    if(wave===2&&elapsed>38){wave=3;spawnQueue.push({type:'brute',delay:elapsed+1});for(let i=0;i<8;i++)spawnQueue.push({type:i%3===0?'spitter':'skitter',delay:elapsed+rand(2,12)});spawnQueue.sort((a,b)=>a.delay-b.delay);objectiveCopy.textContent='Wave 3: take down the Warden. The zone is collapsing.';showToast('WARDEN INBOUND — FINAL WAVE');}
    if(elapsed>=120){endGame(true);return;}
    for(const e of enemies){
      e.hitCd-=dt;e.shotCd-=dt;const vx=player.x-e.x,vy=player.y-e.y,d=Math.hypot(vx,vy)||1;
      if(e.type==='spitter'){
        if(d>205){e.x+=vx/d*e.speed*dt;e.y+=vy/d*e.speed*dt;}else if(d<145){e.x-=vx/d*e.speed*.65*dt;e.y-=vy/d*e.speed*.65*dt;}
        if(e.shotCd<=0&&d<430){const a=Math.atan2(vy,vx);enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*205,vy:Math.sin(a)*205,r:5,life:3});e.shotCd=rand(1.65,2.6);}
      }else{e.x+=vx/d*e.speed*dt;e.y+=vy/d*e.speed*dt;}
      if(d<e.r+player.r+1&&e.hitCd<=0){player.hp-=e.type==='brute'?17:9;player.invuln=.45;e.hitCd=.72;shake=4;addBurst(player.x,player.y,'#ff8065',7,100);}
    }
    for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;for(const e of [...enemies])if(Math.hypot(b.x-e.x,b.y-e.y)<e.r+b.r){e.hp--;b.life=0;addBurst(b.x,b.y,'#a1fff1',3,55);if(e.hp<=0)killEnemy(e);break;}}
    for(const b of enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(Math.hypot(b.x-player.x,b.y-player.y)<player.r+b.r&&player.invuln<=0){b.life=0;player.hp-=8;player.invuln=.28;shake=3;addBurst(player.x,player.y,'#ff8065',6,90);}}
    bullets=bullets.filter(b=>b.life>0&&b.x>-30&&b.x<W+30&&b.y>-30&&b.y<H+30);enemyBullets=enemyBullets.filter(b=>b.life>0);
    for(const s of shards){s.life-=dt;if(Math.hypot(s.x-player.x,s.y-player.y)<25){player.charge=clamp(player.charge+25,0,100);s.life=0;addBurst(s.x,s.y,'#8df6eb',8,100);playTone(760,.1,'sine',.04);if(player.charge===100)showToast('RIFT PULSE CHARGED — PRESS Q');}}
    shards=shards.filter(s=>s.life>0);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt;}particles=particles.filter(p=>p.life>0);
    pulseEffect=Math.max(0,pulseEffect-dt);flash=Math.max(0,flash-dt);shake=Math.max(0,shake-dt*20);
    if(player.hp<=0){player.hp=0;updateHud();endGame(false);return;}
    if(wave===3&&spawnQueue.length===0&&enemies.length===0){endGame(true);return;}
    updateHud();
  }
  function loop(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;if(gameState==='playing')update(dt);draw();requestAnimationFrame(loop);}
  requestAnimationFrame(loop);

  document.querySelector('#start-btn').addEventListener('click',startGame);
  document.querySelector('#retry-btn').addEventListener('click',startGame);
  document.querySelector('#menu-btn').addEventListener('click',()=>{endScreen.classList.remove('visible');startScreen.classList.add('visible');gameState='menu';});
  document.querySelector('#touch-pulse').addEventListener('pointerdown',e=>{e.preventDefault();usePulse();});
  document.querySelector('#touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();keys.TouchFire=true;});
  for(const b of document.querySelectorAll('.move-pad button')){const dir=b.dataset.move;b.addEventListener('pointerdown',e=>{e.preventDefault();moveTouch[dir]=true;b.setPointerCapture(e.pointerId);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>moveTouch[dir]=false);}
  document.querySelector('#touch-fire').addEventListener('pointerup',()=>keys.TouchFire=false);document.querySelector('#touch-fire').addEventListener('pointercancel',()=>keys.TouchFire=false);
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;if(!isTouch){crosshair.style.left=`${e.clientX}px`;crosshair.style.top=`${e.clientY}px`;}});
  canvas.addEventListener('pointerdown',e=>{if(e.button===0){pointer.down=true;canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointerup',()=>pointer.down=false);canvas.addEventListener('pointercancel',()=>pointer.down=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyQ'||e.code==='KeyE')usePulse();if(e.code==='Escape'&&gameState==='playing')showToast('NO EXTRACTION — KEEP FIGHTING');});
  window.addEventListener('keyup',e=>keys[e.code]=false);
  document.querySelector('#sound-btn').addEventListener('click',e=>{audioOn=!audioOn;e.currentTarget.classList.toggle('sound-on',audioOn);e.currentTarget.textContent=audioOn?'♫':'♪';if(audioOn)playTone(520,.09);});
  // avoid stuck held controls when the browser loses focus
  window.addEventListener('blur',()=>{keys={};pointer.down=false;moveTouch={};});
})();
