import {createStreetRenderer} from './driving-scene.js';

// Cámara, reproducción y limpieza comunes a los ejercicios de normativa.
export function createSimulatorView(host,{sample,fallback}){
  host.classList.add('practice-scene');
  host.innerHTML=`<canvas class="practice-canvas" role="img"></canvas>
    <div class="practice-fallback" hidden></div>
    <span class="practice-badge" aria-hidden="true">VISTA ELEVADA · 3D</span>
    <span class="practice-effect" aria-hidden="true" hidden></span>`;
  const canvas=host.querySelector('canvas'),plain=host.querySelector('.practice-fallback');
  const badge=host.querySelector('.practice-badge'),effect=host.querySelector('.practice-effect');
  const toolbar=document.createElement('div');toolbar.className='practice-controls';
  toolbar.innerHTML=`<button class="btn ghost" type="button" data-sim-pause aria-pressed="false" disabled>Pausar animación</button>
    <button class="btn ghost" type="button" data-sim-replay>Repetir escena</button>`;
  host.after(toolbar);
  const pause=toolbar.querySelector('[data-sim-pause]'),replay=toolbar.querySelector('[data-sim-replay]');
  const status=document.createElement('p');status.className='small muted practice-status';status.setAttribute('role','status');
  toolbar.after(status);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer=null,positions={},spec={},disposed=false,task=null,frame=0,last=0,paused=false,contextLost=false;
  let replayAction=null;

  function draw(){
    if(disposed||contextLost)return;
    if(renderer){renderer.draw({positions,look:0});return;}
    plain.querySelectorAll('[data-car]').forEach(node=>{
      const p=positions[node.dataset.car];
      if(p)node.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${p.h})`);
    });
  }
  function resize(){
    if(disposed)return;
    const rect=host.getBoundingClientRect();
    renderer?.resize(rect.width,rect.height);draw();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);
  function ui(){
    pause.disabled=!task||contextLost;
    pause.textContent=paused?'Continuar animación':'Pausar animación';
    pause.setAttribute('aria-pressed',String(paused));
    replay.disabled=!replayAction||contextLost;
  }
  function schedule(){
    if(!frame&&task&&!paused&&!document.hidden&&!contextLost&&!disposed)frame=requestAnimationFrame(tick);
  }
  function tick(now){
    frame=0;
    if(disposed||!task||paused||document.hidden||contextLost)return;
    task.elapsed=reduced.matches?task.end:Math.min(task.end,task.elapsed+(last?Math.min(50,now-last):0));last=now;
    const current=task;
    for(const move of current.moves){
      if(current.elapsed<move.s)continue;
      const k=Math.min(1,Math.max(0,(current.elapsed-move.s)/move.d));
      const point=sample(move.p,(move.fn||current.ease)(k));
      if(move.p.every(p=>p[0]===move.p[0][0]&&p[1]===move.p[0][1]))delete point.h;
      place(move.c,point);
    }
    draw();
    if(current.elapsed>=current.end){task=null;ui();current.done?.();}
    schedule();
  }
  function visibility(){
    last=0;
    if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();
  }
  document.addEventListener('visibilitychange',visibility);
  pause.onclick=()=>{
    paused=!paused;last=0;ui();
    if(paused){cancelAnimationFrame(frame);frame=0;status.textContent='Animación pausada. Puedes observar la situación.';}
    else{status.textContent=renderer?'':'Vista sencilla: no está disponible la aceleración 3D.';schedule();}
  };
  replay.onclick=()=>{if(!disposed)replayAction?.();};
  function cancel(){cancelAnimationFrame(frame);frame=0;task=null;last=0;paused=false;ui();}
  function place(id,point){positions[id]={...positions[id],...point};}
  function useFallback(){
    renderer?.dispose();renderer=null;canvas.hidden=true;plain.hidden=false;
    plain.innerHTML=fallback(spec,positions);badge.textContent='VISTA SENCILLA';
    status.textContent='Vista sencilla: no está disponible la aceleración 3D. Puedes completar el ejercicio.';draw();
  }
  function lost(event){
    event.preventDefault();if(disposed)return;
    contextLost=true;cancelAnimationFrame(frame);frame=0;ui();
    status.textContent='La vista 3D se ha interrumpido. Esperando a que se recupere…';
  }
  function restored(){
    if(disposed)return;contextLost=false;
    const saved=positions,pending=task,wasPaused=paused,description=canvas.getAttribute('aria-label');
    setScene(spec,saved,description);
    task=pending;paused=wasPaused;last=0;ui();schedule();
  }
  canvas.addEventListener('webglcontextlost',lost);
  canvas.addEventListener('webglcontextrestored',restored);
  function setScene(next,vehicles,description='Situación de circulación en tres dimensiones, vista desde arriba'){
    cancel();spec=next;positions=structuredClone(vehicles);effect.hidden=true;
    canvas.setAttribute('aria-label',description);
    renderer?.dispose();renderer=null;plain.hidden=true;canvas.hidden=false;status.textContent='';
    try{renderer=createStreetRenderer(canvas,draw,false,spec);}catch{renderer=null;}
    if(!renderer)useFallback();
    else{badge.textContent='VISTA ELEVADA · 3D';resize();}
    ui();
  }
  return {
    setScene,place,draw,
    animate(moves,done,ease=t=>t,wait=0){
      cancel();task={moves,done,ease,elapsed:0,end:Math.max(wait,...moves.map(m=>m.s+m.d))};
      if(!task.end)task.end=1;ui();schedule();
    },
    effect(message){effect.textContent=message;effect.hidden=!message;},
    onReplay(action){replayAction=action;ui();},
    lockReplay(locked){replay.disabled=locked||!replayAction;},
    dispose(){
      if(disposed)return;disposed=true;cancel();observer.disconnect();
      document.removeEventListener('visibilitychange',visibility);
      canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
      renderer?.dispose();renderer=null;
      canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
      toolbar.remove();status.remove();
    }
  };
}
