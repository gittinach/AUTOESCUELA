import {JUNCTION,createStreetRenderer} from './driving-scene.js';

const ROUTE_TEXT=[
  ['Parada en la línea','Te detuviste antes de la línea del STOP.','Debías detenerte por completo antes de la línea del STOP.'],
  ['Parada con visibilidad','Volviste a detenerte donde podías ver el tráfico.','Debías avanzar despacio y detenerte de nuevo donde tuvieras visibilidad.'],
  ['Prioridad de paso','Entraste con espacio suficiente para cruzar.','Entraste mientras se acercaba un coche con prioridad.']
];
const KEY_ACTION={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'gas',w:'gas',
  ArrowDown:'brake',s:'brake',' ':'brake',q:'lookLeft',e:'lookRight'};
const CAP_SECONDS=1/20;

export function createRun(){
  return {x:JUNCTION.laneX,z:27,yaw:0,speed:0,steer:0,look:0,trafficX:JUNCTION.trafficStart,
    stoppedFor:0,firstStop:false,secondStop:false,clearEntry:null,ending:null};
}

function closeGap(run){
  const distance=run.x-run.trafficX;
  const fastestExpected=Math.max(2.6,run.speed);
  const timeInPath=(JUNCTION.crossEdge-JUNCTION.trafficZ+2*JUNCTION.carHalfLength)/fastestExpected;
  return distance>=-3.4 && distance<3.1+JUNCTION.trafficSpeed*(timeInPath+.55);
}

export function moveThroughJunction(run,controls,dt){
  if(run.ending)return;
  const steer=Number(controls.has('right'))-Number(controls.has('left'));
  const look=Number(controls.has('lookRight'))-Number(controls.has('lookLeft'));
  run.steer+=(steer-run.steer)*Math.min(1,7*dt);
  run.look+=(look*1.18-run.look)*Math.min(1,6*dt);
  const acceleration=controls.has('brake')?-7.8:controls.has('gas')?2.65-.055*run.speed:-.68-.075*run.speed;
  run.speed=Math.min(10.6,Math.max(0,run.speed+acceleration*dt));
  run.yaw+=Math.tan(run.steer*.31)*run.speed/2.72*dt;
  run.x+=Math.sin(run.yaw)*run.speed*dt;
  run.z-=Math.cos(run.yaw)*run.speed*dt;
  run.trafficX+=JUNCTION.trafficSpeed*dt;
  if(run.trafficX>JUNCTION.trafficEnd)run.trafficX=JUNCTION.trafficStart;
  const sin=Math.abs(Math.sin(run.yaw)),cos=Math.abs(Math.cos(run.yaw));
  const halfDepth=JUNCTION.carHalfLength*cos+JUNCTION.carHalfWidth*sin;
  const halfWidth=JUNCTION.carHalfWidth*cos+JUNCTION.carHalfLength*sin;
  const nose=run.z-halfDepth;

  run.stoppedFor=run.speed===0?run.stoppedFor+dt:0;
  if(run.stoppedFor>=.18){
    if(nose>=JUNCTION.stopLine+.37 && nose<=JUNCTION.stopLine+3.1)run.firstStop=true;
    if(nose>=JUNCTION.crossEdge+.17 && nose<=JUNCTION.crossEdge+1.46)run.secondStop=true;
  }
  if(nose<JUNCTION.crossEdge && run.clearEntry===null)run.clearEntry=!closeGap(run);
  if(Math.abs(run.x-run.trafficX)<halfWidth+2.05 && Math.abs(run.z-JUNCTION.trafficZ)<halfDepth+.83){
    run.speed=0;run.clearEntry=false;run.ending='collision';
  }else if(Math.abs(run.x)+halfWidth>JUNCTION.roadHalfWidth || Math.abs(run.yaw)>Math.PI*.41){
    run.speed=0;run.ending='offroad';
  }else if(run.z+halfDepth < -JUNCTION.crossEdge-1){
    run.speed=0;run.ending='complete';
  }
}

const CABIN=`
  <canvas class="road-gl" aria-label="Vista 3D del cruce desde el asiento del conductor" role="img"></canvas>
  <div class="road-cabin" aria-hidden="true">
    <div class="road-pillar left"></div><div class="road-pillar right"></div>
    <div class="road-hood"></div><div class="road-dash"></div>
    <div class="road-vents"><i></i><i></i></div><div class="road-wheel"></div>
  </div>
  <div class="road-hud" hidden>
    <div class="road-top"><span>Cruce con STOP</span><button class="road-tool" type="button" data-road-pause>Pausa</button></div>
    <div class="road-look" aria-label="Mirar por el parabrisas">
      <button class="road-tool" type="button" data-drive="lookLeft" aria-label="Mirar a la izquierda">‹ Mirar</button>
      <button class="road-tool" type="button" data-drive="lookRight" aria-label="Mirar a la derecha">Mirar ›</button>
    </div>
    <div class="road-controls">
      <div class="road-steering" aria-label="Dirección">
        <button type="button" data-drive="left" aria-label="Girar a la izquierda">‹</button>
        <button type="button" data-drive="right" aria-label="Girar a la derecha">›</button>
      </div>
      <div class="road-speed" aria-label="Velocímetro"><b>0</b><span>km/h</span></div>
      <div class="road-pedals" aria-label="Pedales">
        <button type="button" data-drive="brake">Freno</button>
        <button type="button" data-drive="gas">Acelerar</button>
      </div>
    </div>
  </div>
  <section class="road-overlay"><div class="road-panel"></div></section>`;

export function openDrivingGame({onExit,onResult,ruleUrl}){
  const dialog=document.createElement('dialog');
  dialog.className='road-game';dialog.setAttribute('aria-label','Videojuego de conducción');
  const surface=document.createElement('div');
  surface.className='road-surface';surface.tabIndex=-1;surface.innerHTML=CABIN;
  dialog.appendChild(surface);
  document.body.appendChild(dialog);dialog.showModal();
  const canvas=dialog.querySelector('canvas'),hud=dialog.querySelector('.road-hud');
  const speed=hud.querySelector('.road-speed b'),wheel=dialog.querySelector('.road-wheel');
  const cabin=dialog.querySelector('.road-cabin');
  const overlay=dialog.querySelector('.road-overlay'),panel=dialog.querySelector('.road-panel');
  const buttons=Array.from(dialog.querySelectorAll('[data-drive]'));
  const listeners=new AbortController(),{signal}=listeners;
  const heldPointers=new Map(),heldKeys=new Map(),controls=new Set();
  let renderer,run=createRun(),frame=0,lastTime=0,lastSpeed=-1;
  let mode='ready',immersive=false,closed=false;
  try { renderer=createStreetRenderer(canvas); } catch { renderer=null; }

  function show(content){
    panel.innerHTML=content;
    overlay.hidden=false;hud.hidden=true;
    panel.querySelector('button')?.focus({preventScroll:true});
  }
  const leave='<button class="road-button" type="button" data-road-exit>Salir</button>';
  const twoButtons=(label,action)=>`<div class="road-panel-actions"><button class="road-button primary" type="button" data-road-${action}>${label}</button>${leave}</div>`;

  function paint(){
    renderer?.draw(run.x,run.z,run.yaw,run.look,run.trafficX);
    const kmh=Math.round(run.speed*3.6);
    if(kmh!==lastSpeed){speed.textContent=kmh;lastSpeed=kmh;}
    wheel.style.transform=`rotate(${run.steer*72}deg)`;
    cabin.style.setProperty('--road-look',`${run.look*36}%`);
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
  }
  function dispose(){
    if(closed)return;
    closed=true;stopFrame();listeners.abort();observer.disconnect();
    renderer?.dispose();
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
    show(`<h2>Partida en pausa</h2>${twoButtons('Continuar','resume')}`);
  }
  function finish(){
    stopFrame();mode='finished';
    const completed=run.ending==='complete';
    const checks=[run.firstStop,run.secondStop,run.clearEntry];
    const score=checks.filter(Boolean).length;
    onResult(score,checks.length);
    const title={complete:'Cruce completado',collision:'Choque en el cruce',offroad:'Te saliste del recorrido'}[run.ending];
    const heading=completed?`${score} de ${checks.length} comprobaciones superadas.`:
      run.ending==='offroad'?'En este recorrido debes atravesar el cruce en línea recta.':'Repite el cruce y deja pasar al coche naranja antes de entrar.';
    show(`<h2>${title}</h2><p>${heading}</p><ul class="road-results">${ROUTE_TEXT.map(([name,ok,error],index)=>{
      const check=checks[index];
      const summary=check?'Bien':check===null?'Pendiente':'A mejorar';
      return `<li><b>${name} <span class="${check?'ok':'review'}">${summary}</span></b><span>${check?ok:check===null?'La partida acabó antes de entrar en el cruce.':error}</span></li>`;
    }).join('')}</ul>${twoButtons('Volver a jugar','start')}<a class="road-rule" href="${ruleUrl}" target="_blank" rel="noopener">Regla del STOP · RGC, anexo I, R-2</a>`);
  }
  function tick(now){
    if(mode!=='running')return;
    const dt=Math.min(CAP_SECONDS,lastTime?(now-lastTime)/1000:0);
    lastTime=now;
    moveThroughJunction(run,controls,dt);paint();
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
    if(restart)run=createRun();
    mode='running';overlay.hidden=true;hud.hidden=false;
    surface.focus({preventScroll:true});
    enterFullscreen();resize();frame=requestAnimationFrame(tick);
  }
  function unavailable(){
    stopFrame();mode='unavailable';
    show(`<h2>El juego 3D no está disponible</h2><p>Sal y vuelve a entrar para intentarlo de nuevo. Puedes practicar este cruce desde arriba en Conducción urbana.</p><div class="road-panel-actions">${leave}</div>`);
  }

  const observer=new ResizeObserver(resize);observer.observe(canvas);
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-road-exit'))exit();
    if(button.hasAttribute('data-road-start'))play(true);
    if(button.hasAttribute('data-road-resume'))play(false);
    if(button.hasAttribute('data-road-pause'))pause();
  },{signal});
  dialog.addEventListener('cancel',event=>{
    event.preventDefault();
    if(mode==='running')pause();else exit();
  },{signal});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer=null;unavailable();},{signal});
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===surface)immersive=true;
    else if(immersive){immersive=false;pause();}
    resize();
  },{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();},{signal});
  window.addEventListener('blur',pause,{signal});
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
    const action=KEY_ACTION[event.key.length===1?event.key.toLowerCase():event.key];
    if(!action)return;
    event.preventDefault();heldKeys.set(event.code||event.key,action);refreshControls();
  },{signal});
  window.addEventListener('keyup',event=>{
    if(heldKeys.delete(event.code||event.key))refreshControls();
  },{signal});
  if(renderer){
    show(`<h2>Cruce con STOP</h2><p>Conduce hasta el cruce y sigue recto cuando puedas pasar con seguridad.</p>
      <p class="road-hint">Pulsa y mantén los mandos para girar, acelerar, frenar y mirar a los lados. En ordenador puedes usar las flechas y Q o E para mirar.</p>
      <p class="road-hint road-landscape-hint">En horizontal verás más carretera.</p>
      ${twoButtons('Jugar','start')}`);
    resize();
  }else unavailable();
  return dispose;
}
