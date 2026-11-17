import {JUNCTION,PARKED_VAN,SIDE_LOOK,createStreetRenderer,driverEye} from './driving-scene.js';
import {createDrivingAudio} from './driving-audio.js';
import {CITY_CROSSINGS,CITY_PARKING,ROADS,ROUND,roadPoint,planDistrict,driveDistrict,wrapAngle,selectIndicator,flashingIndicator} from './driving-world.js';

const ROUTE_TEXT=[
  ['Parada en la línea','Te detuviste antes de la línea del STOP.','Debías detenerte por completo antes de la línea del STOP.'],
  ['Parada con visibilidad','Volviste a detenerte donde podías ver el tráfico.','Debías avanzar despacio y detenerte de nuevo donde tuvieras visibilidad.'],
  ['Prioridad de paso','Entraste con espacio suficiente para cruzar.','Entraste mientras se acercaba un coche con prioridad.']
];
const KEY_ACTION={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'gas',w:'gas',
  ArrowDown:'brake',s:'brake',' ':'brake',q:'lookLeft',e:'lookRight'};
const CAP_SECONDS=1/20;
const SOUND_SETTING='autoescuela_game_sound';
const DISTRICT_HISTORY='autoescuela_district_history';
const TRAFFIC_PATTERNS=[
  [[1,43,5.2]],
  [[-1,50,5.45]],
  [[1,36,4.95],[-1,65,5.2]],
  [[-1,39,5.75],[1,64,5.15]]
];
const REPLAY_SECONDS=1.6;
const CAMERAS=['cabin','follow','overhead'];
const CAMERA_NAMES={cabin:'Cabina',follow:'Exterior',overhead:'Vista alta'};

export function createRun(pattern=0){
  const traffic=TRAFFIC_PATTERNS[pattern].map(([direction,distance,speed])=>({
    direction,x:-direction*distance,z:direction*JUNCTION.trafficZ,speed
  }));
  return {x:JUNCTION.laneX,z:27,yaw:0,speed:0,steer:0,look:0,traffic,elapsed:0,entryAt:null,
    stoppedFor:0,firstStop:false,secondStop:false,clearEntry:null,priorityFrom:0,ending:null};
}

function hasViewPastVan(run){
  const [eyeX,,eyeZ]=driverEye(run);
  const targetX=-22,targetZ=JUNCTION.trafficZ;
  const atX=x=>eyeZ+(targetZ-eyeZ)*(x-eyeX)/(targetX-eyeX);
  const near=atX(PARKED_VAN.x+PARKED_VAN.length/2);
  const far=atX(PARKED_VAN.x-PARKED_VAN.length/2);
  return Math.max(near,far)<PARKED_VAN.z-PARKED_VAN.width/2 || Math.min(near,far)>PARKED_VAN.z+PARKED_VAN.width/2;
}

function crossingConflict(run,car,halfDepth,halfWidth){
  const clearance=halfWidth+JUNCTION.trafficHalfLength;
  const lateral=(run.x-car.x)*car.direction;
  const trafficArrives=(lateral-clearance)/car.speed,trafficClears=(lateral+clearance)/car.speed;
  const near=car.z+JUNCTION.trafficHalfWidth,far=car.z-JUNCTION.trafficHalfWidth;
  if(run.z+halfDepth<far || trafficClears<-.38)return false;
  // Tiempos estimados para esta escena. La aceleración moderada evita asumir una salida a fondo.
  const speed=Math.max(.25,run.speed),acceleration=.85;
  const timeTo=distance=>(Math.sqrt(speed*speed+2*acceleration*Math.max(0,distance))-speed)/acceleration;
  const arriving=timeTo(run.z-halfDepth-near),clearing=timeTo(run.z+halfDepth-far);
  return trafficArrives<clearing+.5 && trafficClears>arriving-.38;
}

export function moveThroughJunction(run,controls,dt){
  if(run.ending)return;
  run.elapsed+=dt;
  const steer=Number(controls.has('right'))-Number(controls.has('left'));
  const look=Number(controls.has('lookRight'))-Number(controls.has('lookLeft'));
  run.steer+=(steer-run.steer)*Math.min(1,7*dt);
  run.look+=(look*SIDE_LOOK-run.look)*Math.min(1,6*dt);
  const acceleration=controls.has('brake')?-7.8:controls.has('gas')?2.65-.055*run.speed:-.68-.075*run.speed;
  run.speed=Math.min(10.6,Math.max(0,run.speed+acceleration*dt));
  run.yaw+=Math.tan(run.steer*.31)*run.speed/2.72*dt;
  run.x+=Math.sin(run.yaw)*run.speed*dt;
  run.z-=Math.cos(run.yaw)*run.speed*dt;
  for(const car of run.traffic)car.x+=car.direction*car.speed*dt;
  const sin=Math.abs(Math.sin(run.yaw)),cos=Math.abs(Math.cos(run.yaw));
  const halfDepth=JUNCTION.carHalfLength*cos+JUNCTION.carHalfWidth*sin;
  const halfWidth=JUNCTION.carHalfWidth*cos+JUNCTION.carHalfLength*sin;
  const nose=run.z-halfDepth;

  run.stoppedFor=run.speed===0?run.stoppedFor+dt:0;
  if(run.stoppedFor>=.18){
    if(nose>=JUNCTION.stopLine+.37 && nose<=JUNCTION.stopLine+3.1)run.firstStop=true;
    if(nose>=JUNCTION.crossEdge+.17 && nose<=JUNCTION.crossEdge+1.46 && hasViewPastVan(run))run.secondStop=true;
  }
  if(nose<JUNCTION.crossEdge && run.entryAt===null){
    run.entryAt=run.elapsed;
    const conflict=run.traffic.find(car=>crossingConflict(run,car,halfDepth,halfWidth));
    run.clearEntry=!conflict;run.priorityFrom=conflict?.direction||0;
  }
  const collision=run.traffic.find(car=>Math.abs(run.x-car.x)<halfWidth+JUNCTION.trafficHalfLength &&
    Math.abs(run.z-car.z)<halfDepth+JUNCTION.trafficHalfWidth);
  if(collision){
    run.speed=0;run.clearEntry=false;run.priorityFrom=collision.direction;run.ending='collision';
  }else if(Math.abs(run.x)+halfWidth>JUNCTION.roadHalfWidth || Math.abs(run.yaw)>Math.PI*.41){
    run.speed=0;run.ending='offroad';
  }else if(run.z+halfDepth < -JUNCTION.crossEdge-1){
    run.speed=0;run.ending='complete';
  }
}

function captureFrame({x,z,yaw,look,steer,speed,traffic,pedestrians=[],elapsed,indicator,indicatorSince,lowBeams,braking,reverse},camera){
  return {x,z,yaw,look,steer,speed,elapsed,camera,indicator,indicatorSince,lowBeams,braking,reverse,
    traffic:traffic.map(car=>({...car})),pedestrians:pedestrians.map(person=>({...person}))};
}

function interpolateFrame(before,after,elapsed){
  const t=(elapsed-before.elapsed)/(after.elapsed-before.elapsed);
  const blend=(a,b)=>a+(b-a)*t;
  const angle=(a,b)=>a+wrapAngle(b-a)*t;
  return {...before,elapsed,x:blend(before.x,after.x),z:blend(before.z,after.z),yaw:angle(before.yaw,after.yaw),
    look:blend(before.look,after.look),steer:blend(before.steer,after.steer),speed:blend(before.speed,after.speed),
    traffic:before.traffic.map((car,i)=>({...car,x:blend(car.x,after.traffic[i].x),z:blend(car.z,after.traffic[i].z),
      yaw:car.yaw===undefined?undefined:angle(car.yaw,after.traffic[i].yaw)})),
    pedestrians:before.pedestrians.map((person,i)=>({...person,
      progress:blend(person.progress,after.pedestrians[i].progress),
      walkX:blend(person.walkX,after.pedestrians[i].walkX),walkZ:blend(person.walkZ,after.pedestrians[i].walkZ)}))};
}

function drawDistrictMap(canvas,run){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const size=canvas.width,scale=size/130,origin=size/2;
  ctx.translate(origin,origin);ctx.scale(scale,scale);
  ctx.fillStyle='#253b3e';ctx.fillRect(-65,-65,130,130);
  ctx.fillStyle='#abaaa1';
  for(const [x,z,x2,z2] of ROADS)ctx.fillRect(x,z,x2-x,z2-z);
  ctx.beginPath();ctx.arc(0,0,ROUND.outer,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#425d4e';ctx.beginPath();ctx.arc(0,0,ROUND.inner,0,2*Math.PI);ctx.fill();
  ctx.strokeStyle='#e5e1cf';ctx.lineWidth=.7;
  for(const crossing of CITY_CROSSINGS){
    const a=roadPoint(crossing,0,-4),b=roadPoint(crossing,0,4);
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
  }
  const [x,z]=roadPoint(CITY_PARKING[run.goal],0,6.2);
  ctx.fillStyle='#1d634b';ctx.strokeStyle='#c8f3d5';ctx.lineWidth=.7;
  ctx.beginPath();ctx.roundRect(x-3.7,z-3.7,7.4,7.4,1.5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='bold 4.9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('P',x,z+.3);
  ctx.translate(run.x,run.z);ctx.rotate(run.yaw);
  ctx.beginPath();ctx.moveTo(0,-4.6);ctx.lineTo(2.85,3.3);ctx.lineTo(0,2.1);ctx.lineTo(-2.85,3.3);ctx.closePath();
  ctx.fillStyle='#5fbbf1';ctx.strokeStyle='#18313e';ctx.lineWidth=.55;ctx.fill();ctx.stroke();
}

const CABIN=`
  <canvas class="road-gl" aria-label="Vista 3D desde el asiento del conductor" role="img"></canvas>
  <div class="road-cabin" aria-hidden="true">
    <div class="road-headliner"></div>
    <div class="road-pillar left"></div><div class="road-pillar right"></div>
    <div class="road-hood"></div><div class="road-wipers"><i></i><i></i></div><div class="road-dash"></div>
    <div class="road-cluster"></div>
    <div class="road-vents"><i></i><i></i></div><div class="road-wheel"></div>
  </div>
  <div class="road-hud" hidden>
    <div class="road-top"><span data-road-title>Cruce con STOP</span><div class="road-tools">
      <button class="road-tool" type="button" data-road-map hidden>Mapa</button>
      <button class="road-tool" type="button" data-road-sound aria-label="Sonido del videojuego" aria-pressed="true">Sonido</button>
      <button class="road-tool" type="button" data-road-pause>Pausa</button>
    </div></div>
    <p class="road-notice" role="status" hidden></p>
    <div class="road-signals" aria-label="Intermitentes" hidden>
      <button class="road-tool road-signal" type="button" data-road-signal="-1" aria-label="Intermitente izquierdo" aria-pressed="false"><span aria-hidden="true">←</span> Interm.</button>
      <button class="road-tool road-signal" type="button" data-road-signal="1" aria-label="Intermitente derecho" aria-pressed="false">Interm. <span aria-hidden="true">→</span></button>
    </div>
    <div class="road-look" aria-label="Mirar por el parabrisas">
      <button class="road-tool" type="button" data-drive="lookLeft" aria-label="Mirar a la izquierda">‹ Mirar</button>
      <button class="road-tool" type="button" data-drive="lookRight" aria-label="Mirar a la derecha">Mirar ›</button>
    </div>
    <div class="road-controls">
      <div class="road-steering" aria-label="Dirección">
        <button type="button" data-drive="left" aria-label="Girar a la izquierda">‹</button>
        <button type="button" data-drive="right" aria-label="Girar a la derecha">›</button>
      </div>
      <div class="road-instruments"><div class="road-speed" aria-label="Velocímetro"><b>0</b><span>km/h</span></div>
        <div class="road-assist">
          <button class="road-tool" type="button" data-road-camera aria-label="Cambiar a vista exterior" hidden>Exterior</button>
          <button class="road-tool road-gear" type="button" data-road-gear aria-label="Activar marcha atrás" aria-pressed="false" hidden>R</button>
          <button class="road-tool road-lights" type="button" data-road-lights aria-label="Luces de cruce" aria-pressed="false" hidden>Luces</button>
        </div></div>
      <div class="road-pedals" aria-label="Pedales">
        <button type="button" data-drive="brake">Freno</button>
        <button type="button" data-drive="gas">Acelerar</button>
      </div>
    </div>
  </div>
  <div class="road-review-view" hidden>
    <div class="road-top"><span class="road-replay-label" role="status"></span><button class="road-tool" type="button" data-road-results>Resultados</button></div>
    <div class="road-review-controls" aria-label="Vista al entrar al cruce" hidden>
      <button class="road-tool" type="button" data-road-view="left" aria-pressed="false">Izquierda</button>
      <button class="road-tool" type="button" data-road-view="original" aria-pressed="true">Tu vista</button>
      <button class="road-tool" type="button" data-road-view="right" aria-pressed="false">Derecha</button>
    </div>
  </div>
  <section class="road-overlay"><div class="road-panel"></div></section>`;

export function openDrivingGame({onExit,onResult,ruleUrl,district=false}){
  const dialog=document.createElement('dialog');
  dialog.className=district?'road-game road-district':'road-game';dialog.setAttribute('aria-label','Videojuego de conducción');
  const surface=document.createElement('div');
  surface.className='road-surface';surface.tabIndex=-1;surface.innerHTML=CABIN;
  dialog.appendChild(surface);
  document.body.appendChild(dialog);dialog.showModal();
  const canvas=dialog.querySelector('canvas'),hud=dialog.querySelector('.road-hud');
  const speed=hud.querySelector('.road-speed b'),wheel=dialog.querySelector('.road-wheel');
  const soundButton=hud.querySelector('[data-road-sound]');
  const gear=hud.querySelector('[data-road-gear]'),destination=hud.querySelector('[data-road-title]');
  const camera=hud.querySelector('[data-road-camera]');
  const lights=hud.querySelector('[data-road-lights]'),signals=Array.from(hud.querySelectorAll('[data-road-signal]'));
  const accessories=[camera,lights,...signals];
  const notice=hud.querySelector('.road-notice');
  gear.hidden=camera.hidden=lights.hidden=!district;
  hud.querySelector('[data-road-map]').hidden=hud.querySelector('.road-signals').hidden=!district;
  const cabin=dialog.querySelector('.road-cabin');
  const overlay=dialog.querySelector('.road-overlay'),panel=dialog.querySelector('.road-panel');
  const review=dialog.querySelector('.road-review-view'),reviewControls=review.querySelector('.road-review-controls');
  const replayLabel=review.querySelector('.road-replay-label');
  const buttons=Array.from(dialog.querySelectorAll('[data-drive]'));
  const listeners=new AbortController(),{signal}=listeners;
  const heldPointers=new Map(),heldKeys=new Map(),controls=new Set();
  let nextPattern=Math.floor(Math.random()*TRAFFIC_PATTERNS.length),tripHistory={};
  if(district)try { tripHistory=JSON.parse(localStorage.getItem(DISTRICT_HISTORY))||{}; } catch {}
  let renderer,run=district?planDistrict(tripHistory):createRun(nextPattern),frame=0,lastTime=0,lastSpeed=-1;
  let recent=[],replayFrame=null,replayLook,replayClip=[],reviewAt='Al entrar al cruce',cameraView='cabin';
  const replays=new Map();
  let mode='ready',immersive=false,closed=false;
  let audio,soundOn=true;
  try { soundOn=localStorage.getItem(SOUND_SETTING)!=='off'; } catch {}
  try { renderer=createStreetRenderer(canvas,paint,district); } catch { renderer=null; }

  function saveTrip(){
    if(district&&mode!=='ready')try { localStorage.setItem(DISTRICT_HISTORY,JSON.stringify(run.history)); } catch {}
  }

  function syncAudio(){
    if(soundOn&&mode==='running'&&audio===undefined){
      try { audio=createDrivingAudio(); } catch { audio=null; }
    }
    audio?.setPlaying(soundOn&&mode==='running');
    soundButton.disabled=audio===null;
    soundButton.setAttribute('aria-pressed',String(soundOn&&audio!==null));
    soundButton.textContent=audio===null?'Sin sonido':soundOn?'Sonido':'Silencio';
  }

  function show(content){
    panel.innerHTML=content;
    overlay.hidden=false;hud.hidden=true;review.hidden=true;
    panel.querySelector('button')?.focus({preventScroll:true});
  }
  const leave='<button class="road-button" type="button" data-road-exit>Salir</button>';
  const twoButtons=(label,action)=>`<div class="road-panel-actions"><button class="road-button primary" type="button" data-road-${action}>${label}</button>${leave}</div>`;

  function paint(){
    const view=replayFrame||run,look=replayLook??view.look;
    const angle=replayFrame?.camera??cameraView;
    renderer?.draw(view,look,angle);cabin.hidden=district&&angle!=='cabin';
    const kmh=Math.round(view.speed*3.6);
    if(kmh!==lastSpeed){speed.textContent=kmh;lastSpeed=kmh;}
    wheel.style.transform=`rotate(${view.steer*72}deg)`;
    cabin.style.setProperty('--road-look',`${look*36}%`);
    if(district&&mode==='running'){
      const bay=CITY_PARKING[run.goal];
      const text=`${bay.name} · ${Math.round(Math.hypot(run.x-bay.x,run.z-bay.z)/5)*5} m`;
      if(destination.textContent!==text)destination.textContent=text;
      const hint=run.contact==='bloqueado'?'Bordillo. Corrige el giro o usa R para retroceder.':
        run.contact==='roce'?'Bordillo cerca. Abre un poco el giro.':'';
      notice.hidden=!hint;
      if(notice.textContent!==hint)notice.textContent=hint;
      gear.disabled=run.speed>.12;
      syncLights();
    }
  }
  function syncLights(){
    const lit=flashingIndicator(run);
    for(const button of signals){
      const side=Number(button.dataset.roadSignal);
      const pressed=String(run.indicator===side);
      if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
      button.classList.toggle('lit',lit===side);
    }
    const on=String(run.lowBeams);
    if(lights.getAttribute('aria-pressed')!==on)lights.setAttribute('aria-pressed',on);
  }
  function resize(){
    renderer?.resize(canvas.clientWidth,canvas.clientHeight);
    paint();
  }
  function refreshControls(){
    controls.clear();
    for(const action of heldPointers.values())controls.add(action);
    for(const action of heldKeys.values())controls.add(action);
    for(const button of buttons)button.classList.toggle('held',controls.has(button.dataset.drive));
  }
  function stopFrame(){
    cancelAnimationFrame(frame);frame=0;lastTime=0;
    heldPointers.clear();heldKeys.clear();refreshControls();
    audio?.setPlaying(false);
  }
  function dispose(){
    if(closed)return;
    closed=true;saveTrip();stopFrame();listeners.abort();observer.disconnect();
    renderer?.dispose();audio?.dispose();
    if(document.fullscreenElement===surface){
      screen.orientation?.unlock?.();
      document.exitFullscreen().catch(()=>{});
    }
    dialog.close();dialog.remove();
  }
  function exit(){dispose();onExit();}
  function pause(){
    if(mode!=='running')return;
    stopFrame();mode='paused';
    show(`<h2>Partida en pausa</h2>${district?districtMenu():twoButtons('Continuar','resume')}`);
  }
  function districtMenu(){return `<div class="road-panel-actions"><button class="road-button primary" type="button" data-road-resume>Continuar</button>
    <button class="road-button" type="button" data-road-finish>Terminar y revisar</button>${leave}</div>`;}
  function openMap(){
    if(!district||mode!=='running')return;
    stopFrame();mode='map';
    show(`<h2>Destino · ${CITY_PARKING[run.goal].name}</h2><canvas class="road-map" width="300" height="300" role="img"
      aria-label="Mapa del barrio con tu posición y el aparcamiento de destino"></canvas>
      <p class="road-hint">Tu coche es la flecha azul. La P marca dónde aparcar.</p>${districtMenu()}`);
    drawDistrictMap(panel.querySelector('canvas'),run);
  }
  function finish(){
    if(district){
      saveTrip();
      if(run.checks.length)onResult(run.checks.filter(check=>check.ok).length,run.checks.length);
    }else onResult([run.firstStop,run.secondStop,run.clearEntry].filter(Boolean).length,ROUTE_TEXT.length);
    showResults();
  }
  function districtResults(){
    const count=run.checks.length,score=run.checks.filter(check=>check.ok).length;
    const title=run.ending==='parked'?'Has llegado a '+CITY_PARKING[run.goal].name:run.ending==='collision'?'Trayecto interrumpido':'Trayecto terminado';
    const heading=count?`${score} de ${count} decisiones correctas · ${Math.round(run.meters)} m recorridos.`:'Todavía no has pasado por una situación evaluada.';
    const items=run.checks.slice(-10).map(({title,ok,detail},i)=>{
      const index=Math.max(0,count-10)+i;
      const replay=replays.has(index)?`<button type="button" class="road-tool road-clip" data-road-replay="${index}" aria-label="Repetir ${title}">Ver</button>`:'';
      return `<li>${replay}<b>${title} <span class="${ok?'ok':'review'}">${ok?'Bien':'A mejorar'}</span></b><span>${detail}</span></li>`;
    }).join('');
    show(`<h2>${title}</h2><p>${heading}</p>${count>10?'<p class="road-hint">Últimas diez decisiones.</p>':''}<ul class="road-results">${items}</ul>
      ${twoButtons('Nueva partida','start')}<a class="road-rule" href="${ruleUrl}" target="_blank" rel="noopener">Reglamento General de Circulación</a>`);
  }
  function showResults(){
    stopFrame();mode='finished';replayFrame=null;replayLook=undefined;paint();
    if(district){districtResults();return;}
    const completed=run.ending==='complete';
    const checks=[run.firstStop,run.secondStop,run.clearEntry];
    const score=checks.filter(Boolean).length;
    const title={complete:'Cruce completado',collision:'Choque en el cruce',offroad:'Te saliste del recorrido'}[run.ending];
    const heading=completed?`${score} de ${checks.length} comprobaciones superadas.`:
      run.ending==='offroad'?'En este recorrido debes atravesar el cruce en línea recta.':'Vuelve a intentarlo cuando la vía transversal quede libre.';
    show(`<h2>${title}</h2><p>${heading}</p><ul class="road-results">${ROUTE_TEXT.map(([name,ok,error],index)=>{
      const check=checks[index];
      const summary=check?'Bien':check===null?'Pendiente':'A mejorar';
      const direction=run.priorityFrom===1?'la izquierda':'la derecha';
      const advice=index===2&&run.priorityFrom?`Se acercaba un coche con prioridad por ${direction}. Espera a que pase.`:error;
      return `<li><b>${name} <span class="${check?'ok':'review'}">${summary}</span></b><span>${check?ok:check===null?'La partida acabó antes de entrar en el cruce.':advice}</span></li>`;
    }).join('')}</ul><div class="road-panel-actions"><button class="road-button primary" type="button" data-road-start>Volver a jugar</button>
    ${run.entryAt===null?'':'<button class="road-button" type="button" data-road-replay>Ver repetición</button>'}${leave}</div>
    <a class="road-rule" href="${ruleUrl}" target="_blank" rel="noopener">Regla del STOP · RGC, anexo I, R-2</a>`);
  }
  function rememberApproach(force=false){
    const previous=recent.at(-1)?.elapsed??-1;
    if(!district&&run.entryAt!==null&&previous>=run.entryAt)return;
    if(!force&&(district||run.entryAt===null)&&run.elapsed-previous<1/24)return;
    if(previous>=run.elapsed)return;
    recent.push(captureFrame(run,cameraView));
    while(recent.length>1&&recent[1].elapsed<run.elapsed-REPLAY_SECONDS)recent.shift();
  }
  function selectReviewView(side){
    replayLook=side==='original'?undefined:side==='left'?-SIDE_LOOK:SIDE_LOOK;
    for(const button of reviewControls.querySelectorAll('button')){
      button.setAttribute('aria-pressed',String(button.dataset.roadView===side));
    }
    paint();
  }
  function freezeAtEntry(){
    cancelAnimationFrame(frame);frame=0;
    replayFrame=replayClip.at(-1);
    replayLabel.textContent=reviewAt;reviewControls.hidden=false;
    selectReviewView('original');
  }
  function startReplay(index){
    if(mode!=='finished')return;
    replayClip=district?replays.get(Number(index)):recent;
    if(!replayClip?.length)return;
    reviewAt=district?run.checks[Number(index)].title:'Al entrar al cruce';
    const end=replayClip.at(-1).elapsed;
    mode='replay';overlay.hidden=true;review.hidden=false;reviewControls.hidden=true;
    replayLabel.textContent='Repetición';
    review.querySelector('[data-road-results]').focus({preventScroll:true});
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||replayClip.length<2){freezeAtEntry();return;}
    const from=Math.max(replayClip[0].elapsed,end-REPLAY_SECONDS);
    let start,nextFrame=1;
    replayFrame=replayClip[0];paint();
    function advance(now){
      start??=now;
      const elapsed=from+(now-start)*.00074;
      if(elapsed>=end){freezeAtEntry();return;}
      while(replayClip[nextFrame].elapsed<elapsed)nextFrame++;
      replayFrame=interpolateFrame(replayClip[nextFrame-1],replayClip[nextFrame],elapsed);
      paint();frame=requestAnimationFrame(advance);
    }
    frame=requestAnimationFrame(advance);
  }
  function tick(now){
    if(mode!=='running')return;
    const dt=Math.min(CAP_SECONDS,lastTime?(now-lastTime)/1000:0);
    lastTime=now;
    if(district){
      const start=run.checks.length;
      driveDistrict(run,controls,dt);rememberApproach(start!==run.checks.length);
      for(let i=start;i<run.checks.length;i++){
        replays.set(i,recent.slice());
        if(replays.size>8)replays.delete(replays.keys().next().value);
      }
    }else{moveThroughJunction(run,controls,dt);rememberApproach();}
    paint();
    audio?.update(run,controls.has('gas')&&!controls.has('brake'));
    if(run.ending)finish();else frame=requestAnimationFrame(tick);
  }
  function enterFullscreen(){
    if(document.fullscreenElement===surface || !surface.requestFullscreen)return;
    surface.requestFullscreen({navigationUI:'hide'}).then(()=>{
      if(closed || document.fullscreenElement!==surface)return;
      immersive=true;
      screen.orientation?.lock?.('landscape')?.catch(()=>{});
    }).catch(()=>{});
  }
  function play(restart){
    if(!renderer)return;
    if(restart){
      if(district){if(mode!=='ready')run=planDistrict(run.history);}
      else{run=createRun(nextPattern);nextPattern=(nextPattern+1)%TRAFFIC_PATTERNS.length;}
      recent=[];replayFrame=null;replayLook=undefined;replays.clear();
      gear.setAttribute('aria-pressed','false');gear.setAttribute('aria-label','Activar marcha atrás');
    }
    mode='running';overlay.hidden=true;hud.hidden=false;
    if(restart)saveTrip();
    surface.focus({preventScroll:true});
    syncAudio();enterFullscreen();resize();frame=requestAnimationFrame(tick);
  }
  function unavailable(){
    stopFrame();mode='unavailable';
    show(`<h2>El juego 3D no está disponible</h2><p>Sal y vuelve a entrar para intentarlo de nuevo. Puedes practicar este cruce desde arriba en Conducción urbana.</p><div class="road-panel-actions">${leave}</div>`);
  }
  function toggleGear(){
    if(!district||mode!=='running'||run.speed>.12)return;
    run.reverse=!run.reverse;
    gear.setAttribute('aria-pressed',String(run.reverse));
    gear.setAttribute('aria-label',run.reverse?'Volver a marcha adelante':'Activar marcha atrás');
  }
  function toggleCamera(){
    if(!district||mode!=='running')return;
    const next=(CAMERAS.indexOf(cameraView)+1)%CAMERAS.length;
    cameraView=CAMERAS[next];
    const option=CAMERA_NAMES[CAMERAS[(next+1)%CAMERAS.length]];
    camera.textContent=option;
    camera.setAttribute('aria-label',`Cambiar a ${option.toLowerCase()}`);
    paint();
  }
  function changeAccessory(button){
    if(!district||mode!=='running')return;
    if(button===camera){toggleCamera();return;}
    if(button===lights)run.lowBeams=!run.lowBeams;
    else selectIndicator(run,Number(button.dataset.roadSignal));
    paint();
  }

  const observer=new ResizeObserver(resize);observer.observe(canvas);
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-road-exit'))exit();
    if(button.hasAttribute('data-road-start'))play(true);
    if(button.hasAttribute('data-road-resume'))play(false);
    if(button.hasAttribute('data-road-pause'))pause();
    if(button.hasAttribute('data-road-replay'))startReplay(button.dataset.roadReplay);
    if(button.hasAttribute('data-road-results'))showResults();
    if(button.hasAttribute('data-road-map'))openMap();
    if(button.hasAttribute('data-road-gear'))toggleGear();
    if(event.detail===0&&accessories.includes(button))changeAccessory(button);
    if(button.hasAttribute('data-road-finish')){run.ending='ended';finish();}
    if(button.dataset.roadView)selectReviewView(button.dataset.roadView);
    if(button.hasAttribute('data-road-sound')){
      soundOn=!soundOn;
      try { localStorage.setItem(SOUND_SETTING,soundOn?'on':'off'); } catch {}
      syncAudio();
    }
  },{signal});
  dialog.addEventListener('cancel',event=>{
    event.preventDefault();
    if(mode==='running')pause();else if(mode==='replay')showResults();else if(mode==='map')play(false);else exit();
  },{signal});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer=null;unavailable();},{signal});
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===surface)immersive=true;
    else if(immersive){immersive=false;if(mode==='replay')freezeAtEntry();else pause();}
    resize();
  },{signal});
  function pauseOnInterrupt(){if(mode==='replay')freezeAtEntry();else pause();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseOnInterrupt();},{signal});
  window.addEventListener('blur',pauseOnInterrupt,{signal});
  // Otra pulsación táctil puede cambiar las luces mientras el pulgar sigue en un pedal.
  for(const button of accessories)button.addEventListener('pointerdown',event=>{
    if(event.button!==0||mode!=='running')return;
    event.preventDefault();changeAccessory(button);
  },{signal});
  for(const button of buttons){
    button.addEventListener('pointerdown',event=>{
      if(mode!=='running'||event.button!==0)return;
      event.preventDefault();button.setPointerCapture(event.pointerId);
      heldPointers.set(event.pointerId,button.dataset.drive);refreshControls();
    },{signal});
    const release=event=>{heldPointers.delete(event.pointerId);refreshControls();};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release,{signal});
    button.addEventListener('contextmenu',event=>event.preventDefault(),{signal});
  }
  window.addEventListener('keydown',event=>{
    if(mode!=='running'||event.metaKey||event.altKey||event.ctrlKey)return;
    if(district&&event.key.toLowerCase()==='r'&&!event.repeat){event.preventDefault();toggleGear();return;}
    if(district&&event.key.toLowerCase()==='c'&&!event.repeat){event.preventDefault();toggleCamera();return;}
    const accessory={z:signals[0],x:signals[1],l:lights}[event.key.toLowerCase()];
    if(district&&accessory){event.preventDefault();if(!event.repeat)changeAccessory(accessory);return;}
    const action=KEY_ACTION[event.key.length===1?event.key.toLowerCase():event.key];
    if(!action)return;
    event.preventDefault();heldKeys.set(event.code||event.key,action);refreshControls();
  },{signal});
  window.addEventListener('keyup',event=>{
    if(heldKeys.delete(event.code||event.key))refreshControls();
  },{signal});
  if(renderer){
    show(`<h2>${district?'Conduce por el barrio':'Cruce con STOP'}</h2>${district?
      `<p>Tu destino es ${CITY_PARKING[run.goal].name}. Elige por qué calles llegar y detente dentro de la zona de aparcamiento.</p>
      <p class="road-hint">Usa Exterior para anticipar la calle y Vista alta para aparcar. Toca las flechas de Interm. o Luces mientras conduces.</p>`:
      '<p>Conduce hasta el cruce y sigue recto cuando puedas pasar con seguridad.</p>'}
      <p class="road-hint">Pulsa y mantén los mandos para girar, acelerar, frenar y mirar a los lados. En ordenador puedes usar las flechas y Q o E para mirar.</p>
      <p class="road-hint road-landscape-hint">En horizontal verás más carretera.</p>
      ${twoButtons('Jugar','start')}`);
    resize();
  }else unavailable();
  return dispose;
}
