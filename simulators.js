import {createSimulatorView} from './simulator-view.js';

const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
const linear=t=>t;
const decelerate=t=>1-(1-t)**2;
const rule='https://www.boe.es/buscar/act.php?id=BOE-A-2003-23514';
const key='<div class="practice-key"><span><i aria-hidden="true"></i>Azul: tu coche</span><span><i aria-hidden="true"></i>Naranja: otro vehículo</span></div>';

function shell(root){
  root.innerHTML=`<section class="card practice-card" aria-labelledby="practice-title">
    <div class="practice-progress"><span id="practice-count"></span><span>Decisiones de circulación</span></div>
    <div class="qprog" id="practice-progress" aria-hidden="true"></div>
    <h2 class="practice-title" id="practice-title"></h2><p class="muted" id="practice-description"></p>
    <div id="practice-scene"></div>${key}<div class="practice-signs" hidden></div>
    <div class="simopts practice-options" id="practice-options"></div>
    <div class="fb" id="practice-feedback" tabindex="-1" aria-live="polite" hidden></div>
  </section>`;
  return selector=>root.querySelector(selector);
}
function focusFeedback(node){
  node.focus({preventScroll:true});
  node.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function signs(node,kind,signHTML){
  node.hidden=!kind;
  node.innerHTML=kind?signHTML(kind)+(kind==='stop'?'Señal de tu acceso: STOP':'Señal del acceso: ceda el paso'):'';
}

export function openPriorityExercise({root,id,set,sample,fallback,signHTML,onResult,mascot}){
  let view=null,index=0,results=[],choices=[],disposed=false;
  const total=set.list.length;
  function start(){index=0;results=[];choices=[];load();}
  function load(){
    if(disposed)return;
    view?.dispose();
    const $=shell(root),s=set.list[index],scene=$('#practice-scene');
    let busy=true;
    const vehicles=Object.fromEntries(Object.entries(s.cars).map(([id,value])=>{
      const car=Array.isArray(value)?{p:value}:value;
      return [id,{...sample(car.p,0),kind:car.kind||(id==='you'?'you':id==='oth'?'oth':'grey')}];
    }));
    view=createSimulatorView(scene,{sample,fallback});
    view.setScene(s.scene,vehicles,s.title+'. '+s.desc);
    view.onReplay(load);
    $('#practice-title').textContent=s.title;$('#practice-description').textContent=s.desc;
    $('#practice-count').textContent=`Situación ${index+1} de ${total}`;
    $('#practice-progress').innerHTML=set.list.map((_,i)=>`<span class="${results[i]===true?'ok':results[i]===false?'bad':i===index?'now':''}"></span>`).join('');
    signs($('.practice-signs'),s.scene.stop?'stop':s.scene.scene==='round'?'ceda':null,signHTML);
    const options=$('#practice-options'),feedback=$('#practice-feedback');
    options.innerHTML=s.opts.map((o,k)=>`<button class="btn ghost" type="button" data-sim-answer="${k}" disabled>${escape(o.label)}</button>`).join('');
    function show(option){
      if(disposed)return;
      const article=s.norma.match(/arts?\.?\s*(\d+)/);
      feedback.className='fb '+(option.ok?'ok':'bad');
      feedback.innerHTML=`<span class="v">${option.ok?'¡Bien hecho!':option.type==='crash'?'Las trayectorias entran en conflicto':escape(s.badTitle||'Revisa esta decisión')}</span>
        <p>${escape((option.ok?s.okMsg+' ':'')+s.expl)}</p><span class="ref">${escape(s.norma)}</span>
        <a class="small" href="${rule}${article?'#a'+article[1]:'#A5'}" target="_blank" rel="noopener">Consultar el Reglamento</a>
        <button class="btn primary" type="button" id="practice-next">${index<total-1?'Siguiente situación':'Ver resultado'}</button>`;
      feedback.hidden=false;
      $('#practice-progress').children[index].className=results[index]?'ok':'bad';
      $('#practice-next').onclick=()=>{index++;if(index<total){load();window.scrollTo(0,0);}else finish();};
      focusFeedback(feedback);
    }
    function answer(k,replaying=false){
      if(busy&&!replaying)return;
      busy=true;
      options.querySelectorAll('button').forEach(b=>b.disabled=true);
      const option=s.opts[k];
      if(choices[index]===undefined){choices[index]=k;results[index]=option.ok;}
      const play=()=>{
        if(option.type==='go'||option.type==='hesitate'||option.type==='block'){
          view.animate(option.moves,()=>{
            if(option.type==='block')view.effect('El cruce ha quedado bloqueado');
            show(option);
          },ease);
        }else{
          view.animate(Object.entries(option.p).map(([c,p])=>({c,p,s:0,d:1000})),()=>{
            view.effect('¡Atención! Trayectorias en conflicto');show(option);
          },linear);
        }
      };
      if(option.type==='hesitate'){
        view.effect('El tráfico espera tu decisión');
        view.animate([],()=>{view.effect('');play();},linear,850);
      }else play();
    }
    options.querySelectorAll('button').forEach(b=>b.onclick=()=>answer(Number(b.dataset.simAnswer)));
    const arrivals=Object.entries(s.cars).map(([id,value])=>{
      const car=Array.isArray(value)?{p:value}:value;
      return {c:id,p:car.p,s:0,d:1500,fn:car.lin?linear:decelerate};
    });
    view.animate(arrivals,()=>{
      busy=false;
      if(choices[index]!==undefined)answer(choices[index],true);
      else options.querySelectorAll('button').forEach(b=>b.disabled=false);
    });
  }
  function finish(){
    const score=results.filter(Boolean).length;view?.dispose();view=null;
    onResult(score,total);
    root.innerHTML=`<section class="card result"><div class="mascot-c">${mascot}</div><h2>${escape(set.name)}</h2>
      <div class="big">${score}/${total}</div><p class="muted">${score===total?'¡Todas las decisiones correctas!':'Repite para afianzar las decisiones que te han costado más.'}</p>
      <div class="grid2" style="width:100%"><button class="btn ghost" type="button" data-back>Volver</button><button class="btn primary" type="button" id="practice-again">Repetir ejercicio</button></div></section>`;
    root.querySelector('#practice-again').onclick=start;window.scrollTo(0,0);
  }
  start();return ()=>{disposed=true;view?.dispose();};
}

export function openStopExercise({root,steps,sample,fallback,signHTML,onResult}){
  let view=null,stage=0,score=0,missed=false,results=[],disposed=false;
  const total=steps.length;
  function start(){
    view?.dispose();stage=0;score=0;missed=false;results=[];
    const $=shell(root);view=createSimulatorView($('#practice-scene'),{sample,fallback});
    signs($('.practice-signs'),'stop',signHTML);
    $('#practice-title').textContent='Cruce con STOP';
    function resetScene(){
      const before=stage?steps[stage-1]:{car:285,traffic:-34};
      view.setScene({scene:'cross',stop:true,limited:true},{
        you:{x:165,y:before.car,h:0,kind:'you',braking:stage>0},
        oth:{x:before.traffic,y:165,h:90,kind:'oth'}
      },'STOP con visibilidad reducida por una furgoneta. '+(steps[stage]?.prompt||''));
      view.onReplay(resetScene);
    }
    resetScene();
    function draw(){
      if(disposed)return;
      const step=steps[stage];
      $('#practice-description').textContent=step.prompt;
      $('#practice-count').textContent=`Decisión ${stage+1} de ${total}`;
      $('#practice-progress').innerHTML=steps.map((_,i)=>`<span class="${i<stage?(results[i]?'ok':'bad'):i===stage?'now':''}"></span>`).join('');
      const options=$('#practice-options'),feedback=$('#practice-feedback');
      options.replaceChildren();
      const alternatives=[[step.good,true],[step.bad,false]];
      if(stage%2)alternatives.reverse();
      for(const [label,correct] of alternatives){
        const button=document.createElement('button');button.className='btn ghost';button.type='button';button.textContent=label;
        button.dataset.stopAnswer=correct?'good':'bad';
        button.onclick=()=>{
          if(!correct){
            missed=true;feedback.hidden=false;feedback.className='fb bad';
            feedback.textContent=step.error;focusFeedback(feedback);return;
          }
          options.querySelectorAll('button').forEach(b=>b.disabled=true);view.onReplay(null);
          results[stage]=!missed;
          if(!missed)score++;
          const before=stage?steps[stage-1]:{car:285,traffic:-34};
          const moves=[{c:'you',p:[[165,before.car],[165,step.car]],s:0,d:step.duration,fn:ease},
            {c:'oth',p:[[before.traffic,165],[step.traffic,165]],s:0,d:step.duration}];
          feedback.hidden=false;feedback.className='fb';feedback.textContent='Maniobra en curso…';
          view.animate(moves,()=>{
            view.place('you',{braking:stage<3});view.draw();
            stage++;missed=false;
            feedback.className='fb ok';feedback.textContent=step.result;
            if(stage===total)finish();else{
              view.onReplay(resetScene);draw();
              $('#practice-description').setAttribute('tabindex','-1');$('#practice-description').focus({preventScroll:true});
            }
          });
        };
        options.appendChild(button);
      }
    }
    function finish(){
      onResult(score,total);
      $('#practice-progress').innerHTML=results.map(ok=>`<span class="${ok?'ok':'bad'}"></span>`).join('');
      $('#practice-count').textContent='Cruce completado';
      $('#practice-feedback').innerHTML=`<span class="v">${score}/${total} decisiones acertadas a la primera</span>
        <p>Has practicado la detención, la visibilidad y la prioridad.</p>
        <a href="${rule}#A5" target="_blank" rel="noopener">Regla del STOP · RGC, anexo I, señal R-2 y marca M-4.1</a>`;
      $('#practice-options').innerHTML='<button class="btn primary" type="button" id="stop-again">Repetir cruce</button><button class="btn ghost" type="button" data-back>Volver</button>';
      $('#stop-again').onclick=start;$('#stop-again').focus({preventScroll:true});
      view.onReplay(null);
    }
    draw();
  }
  start();return ()=>{disposed=true;view?.dispose();};
}
