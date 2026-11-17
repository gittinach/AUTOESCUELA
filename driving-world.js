export const DISTRICT=52;
export const STREET_HALF=4.5;
export const ROUND={inner:6.35,outer:11.85,join:10.8,mark:13.25,lane:9.15};
export const CITY_LANE=1.85;
const CAR_LENGTH=2.05,CAR_WIDTH=.87;
const WHEEL_LENGTH=1.87,WHEEL_WIDTH=.77;
const PEDESTRIAN_SPEED=1.42;
const STREET_AXES=[-DISTRICT,0,DISTRICT];
export const ROADS=[
  [-56.5,-56.5,56.5,-47.5],[-56.5,47.5,56.5,56.5],
  [-56.5,-47.5,-47.5,47.5],[47.5,-47.5,56.5,47.5],
  [-STREET_HALF,-47.5,STREET_HALF,-ROUND.join],[-STREET_HALF,ROUND.join,STREET_HALF,47.5],
  [-47.5,-STREET_HALF,-ROUND.join,STREET_HALF],[ROUND.join,-STREET_HALF,47.5,STREET_HALF]
];
export const CITY_STOPS=[
  {id:'stop-n',x:0,z:-52,dx:0,dz:-1}, {id:'stop-s',x:0,z:52,dx:0,dz:1},
  {id:'stop-w',x:-52,z:0,dx:-1,dz:0}, {id:'stop-e',x:52,z:0,dx:1,dz:0}
];
export const CITY_ENTRIES=[
  {id:'ring-s',x:0,z:0,dx:0,dz:-1},{id:'ring-n',x:0,z:0,dx:0,dz:1},
  {id:'ring-w',x:0,z:0,dx:1,dz:0},{id:'ring-e',x:0,z:0,dx:-1,dz:0}
];
export const CITY_CROSSINGS=[
  {id:'paso-n',x:25,z:-52,dx:1,dz:0}, {id:'paso-e',x:52,z:25,dx:0,dz:1},
  {id:'paso-s',x:-25,z:52,dx:1,dz:0}, {id:'paso-w',x:-52,z:-25,dx:0,dz:1}
];
export const CITY_LIGHTS={...CITY_CROSSINGS[3],line:2.5};

export function trafficLight(frame){
  const phase=(frame.elapsed+frame.lightOffset)%32;
  return phase<14||phase>=30?'red':phase<27?'green':'amber';
}

export function districtWeather(frame){
  const env=frame.environment;
  if(!env)return 'clear';
  return frame.elapsed>=env.changeAt?env.next:env.weather;
}
export const CITY_SPEED_ZONES=[
  {id:'avenida-20',x:52,z:0,dx:0,dz:1,from:12,to:42,limit:20},
  {id:'mercado-30',x:0,z:-52,dx:1,dz:0,from:8.6,to:44,limit:30}
];
export const CITY_PARKING=[
  {name:'Mercado',x:32,z:-52,dx:1,dz:0},{name:'Biblioteca',x:52,z:34,dx:0,dz:1},
  {name:'Polideportivo',x:-33,z:52,dx:-1,dz:0},{name:'Parque',x:-52,z:-34,dx:0,dz:-1}
];
export const PARKING={length:11,start:4.22,end:9.25};
export const STOP_LINE=7.2;
const STARTS=[
  {x:-20,z:-52+CITY_LANE,yaw:Math.PI/2},
  {x:52-CITY_LANE,z:-20,yaw:Math.PI},
  {x:20,z:52-CITY_LANE,yaw:-Math.PI/2},
  {x:-52+CITY_LANE,z:20,yaw:0}
];
const SIDE_CORNERS=[[-DISTRICT,-DISTRICT],[-DISTRICT,DISTRICT],[DISTRICT,-DISTRICT],[DISTRICT,DISTRICT]];

export function roadPoint({x,z,dx,dz},forward=0,right=0){return [x+dx*forward-dz*right,z+dz*forward+dx*right];}
function axes({x,z,dx,dz},px,pz){return [(px-x)*dx+(pz-z)*dz,-(px-x)*dz+(pz-z)*dx];}
export function districtRoad(x,z){
  const radial=Math.hypot(x,z);
  return (radial>=ROUND.inner&&radial<=ROUND.outer)||ROADS.some(([x1,z1,x2,z2])=>x>=x1&&x<=x2&&z>=z1&&z<=z2)||
    CITY_PARKING.some(spot=>{
      const [f,r]=axes(spot,x,z);return Math.abs(f)<=PARKING.length/2&&r>=PARKING.start&&r<=PARKING.end;
    });
}

function weigh(values,count,random){
  const weights=values.map(index=>1/(1+(Number.isSafeInteger(count[index])?Math.max(0,count[index]):0)));
  let position=random()*weights.reduce((sum,n)=>sum+n,0);
  return values.find((_,index)=>(position-=weights[index])<0)??values.at(-1);
}

export function planDistrict(previous={},random=Math.random,assisted=true){
  const pairs=[];
  for(const [start,point] of STARTS.entries())for(const [goal,spot] of CITY_PARKING.entries()){
    if(Math.hypot(point.x-spot.x,point.z-spot.z)>69&&previous.pair!==start+'-'+goal)pairs.push({start,goal});
  }
  const [lastStart,lastGoal]=typeof previous.pair==='string'?previous.pair.split('-').map(Number):[];
  const different=pairs.filter(pair=>pair.start!==lastStart&&pair.goal!==lastGoal);
  const choices=different.length?different:pairs;
  const {start,goal}=choices[Math.floor(random()*choices.length)];
  const options=CITY_CROSSINGS.map((_,i)=>i),counts=Array.isArray(previous.counts)?previous.counts:[];
  const first=weigh(options,counts,random);
  const remaining=options.filter(i=>i!==first&&[first,i].sort().join('-')!==previous.crossings);
  const second=weigh(remaining,counts,random);
  const selected=[first,second];
  const pedestrians=CITY_CROSSINGS.map((crossing,i)=>({ ...crossing,side:random()<.5?1:-1,
    present:selected.includes(i),wait:.35+random()*1.7,progress:0,state:'waiting',nearSince:null,judged:false }));
  for(const person of pedestrians)[person.walkX,person.walkZ]=roadPoint(person,0,person.side*5.35);
  const history={pair:start+'-'+goal,crossings:selected.sort().join('-'),counts:options.map(i=>Number.isSafeInteger(counts[i])?counts[i]:0)};
  const cars=Array.from({length:3},(_,i)=>({id:i,model:i%2,speed:4.4+random()*1.8,velocity:0,
    distance:(i+.18+random()*.65)*LOOP_LENGTH/3}));
  const circle=[{id:3,model:1,speed:4.15+random()*1.15,velocity:4.1,angle:random()*Math.PI*2,ring:true}];
  const times=['day','sunset','night'],weather=['clear','rain','fog'];
  const environment={time:times[Math.floor(random()*times.length)],weather:weather[Math.floor(random()*weather.length)],
    changeAt:75+random()*50};
  environment.next=weather[(weather.indexOf(environment.weather)+1+Math.floor(random()*2))%weather.length];
  const car={...STARTS[start],speed:0,steer:0,look:0};
  const run={...car,goal,start,elapsed:0,reverse:false,traffic:[...cars,...circle],pedestrians,history,
    checks:[],stops:new Map(),ringApproach:null,contact:null,clearance:0,ending:null,parkTime:0,meters:0,
    indicator:0,indicatorSince:0,indicatorTurn:0,lowBeams:false,braking:false,
    assisted,manualUntil:0,streetTurn:null,speedZone:null,guidePath:null,guideCircle:null,turnChoice:0,turnHeld:0,
    lightOffset:random()*32,signalVisit:null,environment,lightUse:null};
  for(const npc of run.traffic){
    placeTraffic(npc);
    if(!npc.ring&&Math.hypot(npc.x-run.x,npc.z-run.z)<11){
      npc.distance=(npc.distance+19)%LOOP_LENGTH;placeTraffic(npc);
    }
  }
  return run;
}

const LOOP_EDGE=50.12,CORNER=5.15,SPAN=2*(LOOP_EDGE-CORNER),ARC=CORNER*Math.PI/2,LOOP_LENGTH=4*(SPAN+ARC);
function placeTraffic(car){
  if(car.ring){
    car.x=Math.cos(car.angle)*ROUND.lane;car.z=Math.sin(car.angle)*ROUND.lane;car.yaw=car.angle;return;
  }
  const segment=SPAN+ARC,turn=Math.floor(car.distance/segment)%4,within=car.distance%segment;
  let x,z,yaw;
  if(within<SPAN){x=-LOOP_EDGE+CORNER+within;z=-LOOP_EDGE;yaw=Math.PI/2;}
  else{
    const a=(within-SPAN)/CORNER;
    x=LOOP_EDGE-CORNER+CORNER*Math.sin(a);
    z=-LOOP_EDGE+CORNER-CORNER*Math.cos(a);yaw=Math.PI/2+a;
  }
  for(let i=0;i<turn;i++)[x,z]=[-z,x];
  car.x=x;car.z=z;car.yaw=yaw+turn*Math.PI/2;
}

function actors(run,dt){
  for(const person of run.pedestrians){
    if(!person.present)continue;
    const [forward,right]=axes(person,run.x,run.z);
    if(!person.seen&&Math.abs(forward)<30&&Math.abs(right)<6&&Math.abs(alignment(run,person))>.65){
      person.seen=true;
      const key=CITY_CROSSINGS.findIndex(c=>c.id===person.id);
      run.history.counts[key]++;
    }
    if(person.state==='waiting'&&Math.abs(right)<6&&Math.abs(alignment(run,person))>.65&&Math.abs(forward)>3.4&&Math.abs(forward)<27){
      person.nearSince??=run.elapsed;
      const distance=Math.abs(forward)-CAR_LENGTH;
      const safe=run.speed<.25||distance/Math.max(1.4,run.speed)>4;
      const phase=(run.elapsed+run.lightOffset)%32;
      const permitted=person.id!==CITY_LIGHTS.id||phase>1&&phase<5.5;
      if(safe&&permitted&&run.elapsed-person.nearSince>person.wait)person.state='walking';
    }
    if(person.state==='walking'){
      person.progress+=PEDESTRIAN_SPEED*dt;
      if(person.progress>=10.7){person.progress=10.7;person.state='clear';}
    }
    const [x,z]=roadPoint(person,0,person.side*(5.35-person.progress));
    person.walkX=x;person.walkZ=z;
  }
  for(const car of run.traffic){
    if(car.ring){
      const angle=Math.atan2(run.z,run.x),radius=Math.hypot(run.x,run.z);
      const gap=(car.angle-angle+Math.PI*4)%(Math.PI*2);
      const ahead=radius>ROUND.inner&&radius<ROUND.outer&&gap>.16&&gap<.82&&Math.abs(wrapAngle(run.yaw-angle))<.8;
      car.velocity=Math.min(car.speed,Math.max(0,car.velocity+(ahead?-5:2.2)*dt));
      car.angle=wrapAngle(car.angle-car.velocity/ROUND.lane*dt);
    }else{
      const dx=Math.sin(car.yaw),dz=-Math.cos(car.yaw);
      const blocked=run.pedestrians.some(person=>{
        if(person.state!=='walking')return false;
        const x=person.x-car.x,z=person.z-car.z;
        return Math.abs(-x*dz+z*dx)<5.2&&x*dx+z*dz>1.9&&x*dx+z*dz<10;
      })||sameLaneAhead(car,run,8.5)||run.traffic.some(other=>other!==car&&!other.ring&&sameLaneAhead(car,other,7.5))||
        stopsAtLight(run,car);
      const area=CITY_SPEED_ZONES.find(zone=>{
        const [f,r]=axes(zone,car.x,car.z);return f>=zone.from&&f<=zone.to&&Math.abs(r)<STREET_HALF;
      });
      const pace=Math.min(car.speed,(area?.limit||30)/3.6);
      car.velocity=Math.min(pace,Math.max(0,car.velocity+(blocked?-5:2.2)*dt));
      car.distance=(car.distance+car.velocity*dt)%LOOP_LENGTH;
    }
    placeTraffic(car);
  }
}

function stopsAtLight(run,car){
  if(trafficLight(run)==='green')return false;
  const [f,r]=axes(CITY_LIGHTS,car.x,car.z),direction=Math.sign(alignment(car,CITY_LIGHTS));
  const distance=-CITY_LIGHTS.line-f*direction-JUNCTION_NPC_FRONT;
  return Math.abs(r)<STREET_HALF&&distance>-.12&&distance<10;
}
const JUNCTION_NPC_FRONT=2.11;

function sameLaneAhead(car,other,distance){
  const x=other.x-car.x,z=other.z-car.z,dx=Math.sin(car.yaw),dz=-Math.cos(car.yaw);
  const ahead=x*dx+z*dz;
  return Math.abs(-x*dz+z*dx)<1.7&&ahead>1.75&&ahead<distance;
}

export function wrapAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}
function alignment(car,road){return Math.sin(car.yaw)*road.dx-Math.cos(car.yaw)*road.dz;}
function corners(x,z,yaw,length=CAR_LENGTH,width=CAR_WIDTH){
  const a=Math.sin(yaw),b=-Math.cos(yaw);
  return [[length,width],[length,-width],[-length,width],[-length,-width]]
    .map(([f,r])=>[x+a*f-b*r,z+b*f+a*r]);
}

function bump(car,other){
  const x=other.x-car.x,z=other.z-car.z;
  if(x*x+z*z>22)return false;
  const [a,b]=[car.yaw,other.yaw],gap=a-b,c=Math.abs(Math.cos(gap)),s=Math.abs(Math.sin(gap));
  const projects=(axis,half,opposite)=>Math.abs(x*Math.sin(axis)-z*Math.cos(axis))<half+opposite;
  return projects(a,CAR_LENGTH,2.10*c+.88*s)&&projects(a+Math.PI/2,CAR_WIDTH,2.10*s+.88*c)&&
    projects(b,2.10,CAR_LENGTH*c+CAR_WIDTH*s)&&projects(b+Math.PI/2,.88,CAR_LENGTH*s+CAR_WIDTH*c);
}

function bumpPerson(car,person){
  if(person.state!=='walking')return false;
  const dx=person.walkX-car.x,dz=person.walkZ-car.z,c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  return Math.abs(dx*s-dz*c)<CAR_LENGTH+.25&&Math.abs(dx*c+dz*s)<CAR_WIDTH+.25;
}

function record(run,title,ok,detail,source){run.checks.push({title,ok,detail,source,at:run.elapsed});}
function priorityConflict(run,node){
  return run.traffic.some(car=>{
    if(car.ring)return false;
    const [clear,across]=axes(node,car.x,car.z);
    const lateralSpeed=-Math.sin(car.yaw)*node.dz-Math.cos(car.yaw)*node.dx;
    return Math.abs(clear)<4.2&&Math.abs(across)<17&&across*lateralSpeed<3.35;
  });
}

function checkStops(run){
  for(const node of CITY_STOPS){
    const [f,r]=axes(node,run.x,run.z);
    if(f< -15||Math.abs(r)>5.5){run.stops.delete(node.id);continue;}
    if(run.reverse||alignment(run,node)<.78||r<-.2||r>STREET_HALF)continue;
    let stop=run.stops.get(node.id);
    if(!stop){if(f> -6)continue;stop={halt:0,passed:false,entered:false};run.stops.set(node.id,stop);}
    const nose=f+CAR_LENGTH;
    if(!stop.passed&&run.speed===0&&nose>=-STOP_LINE-2.5&&nose<=-STOP_LINE-.02)stop.halt+=run.dt;
    if(!stop.passed&&nose>=-STOP_LINE){
      stop.passed=true;
      const ok=stop.halt>=.16;
      record(run,'STOP',ok,ok?'Te detuviste antes de la línea.':'Franqueaste la línea sin hacer una parada completa.','stop');
    }
    if(stop.passed&&!stop.entered&&nose>=-STREET_HALF){
      stop.entered=true;
      const clear=!priorityConflict(run,node);
      record(run,'Prioridad en el STOP',clear,clear?'Entraste con espacio suficiente en la vía preferente.':'Entraste con un vehículo acercándose por la vía preferente.','stop');
    }
  }
}

function checkCrossings(run){
  for(const person of run.pedestrians){
    if(Math.abs(alignment(run,person))<.64||run.reverse)continue;
    const [f,r]=axes(person,run.x,run.z),direction=Math.sign(alignment(run,person));
    if(Math.abs(r)>STREET_HALF||f*direction< -19||f*direction>4)continue;
    const front=f*direction+CAR_LENGTH;
    if(person.state==='walking'&&person.progress>.75&&person.progress<9.95){
      person.opportunity=true;
      if(front>=-1.67&&front<=2.05&&!person.judged){
        person.judged=true;
        record(run,'Paso de peatones',false,'Avanzaste sobre el paso mientras el peatón seguía cruzando.','pedestrian');
      }
    }
    if(person.state==='clear'&&person.opportunity&&!person.judged&&front>=-1.67){
      person.judged=true;
      record(run,'Paso de peatones',true,'Dejaste que el peatón terminara de cruzar.','pedestrian');
    }
  }
}

function checkTrafficLight(run){
  if(run.reverse||Math.abs(alignment(run,CITY_LIGHTS))<.72){run.signalVisit=null;return;}
  const [f,r]=axes(CITY_LIGHTS,run.x,run.z),direction=Math.sign(alignment(run,CITY_LIGHTS));
  const front=f*direction+CAR_LENGTH,color=trafficLight(run);
  if(Math.abs(r)>STREET_HALF||front< -27||front>7){run.signalVisit=null;return;}
  const state=run.signalVisit??={passed:false,lastColor:color,canClearAmber:false};
  if(color==='amber'&&state.lastColor!=='amber')state.canClearAmber=-CITY_LIGHTS.line-front<run.speed**2/(2*5.3)+.65;
  state.lastColor=color;
  if(!state.passed&&front>=-CITY_LIGHTS.line){
    state.passed=true;
    const ok=color==='green'||color==='amber'&&state.canClearAmber;
    record(run,'Semáforo',ok,ok?(color==='green'?'Pasaste con luz verde.':'Continuaste al encenderse el ámbar porque estabas demasiado cerca para detenerte con seguridad.'):
      color==='red'?'Franqueaste la línea con el semáforo en rojo.':'En ámbar debes parar si puedes hacerlo con seguridad.','traffic-light');
  }
}

function checkLighting(run){
  const weather=districtWeather(run);
  const required=run.environment.time==='night'||weather==='fog'||weather==='rain';
  if(!required){run.lightUse=null;return;}
  const state=run.lightUse??={dark:0,reported:false};
  if(run.speed<.3||state.reported)return;
  state.dark=run.lowBeams?0:state.dark+run.dt;
  if(state.dark>=2.0){
    state.reported=true;
    record(run,'Alumbrado',false,run.environment.time==='night'?'Al circular de noche debes encender las luces de cruce.':
      weather==='fog'?'La niebla reduce la visibilidad. Debes utilizar el alumbrado correspondiente.':'Con lluvia intensa debes utilizar el alumbrado correspondiente.', 'lighting');
  }
}

function checkRoundabout(run){
  if(Math.hypot(run.x,run.z)>24){run.ringApproach=null;return;}
  if(!run.ringApproach){
    const entry=CITY_ENTRIES.find(node=>{
      const [f,r]=axes(node,run.x,run.z);
      return f< -13.3&&f> -24&&r>=-.1&&r<STREET_HALF&&alignment(run,node)>.77;
    });
    if(entry)run.ringApproach={entry,done:false};
  }
  const approach=run.ringApproach;
  if(!approach||approach.done||run.reverse)return;
  const [f]=axes(approach.entry,run.x,run.z);
  if(f+CAR_LENGTH< -ROUND.outer)return;
  approach.done=true;
  const a=Math.atan2(run.z,run.x),npc=run.traffic.find(c=>c.ring);
  const angle=npc?(npc.angle-a+Math.PI*2)%(Math.PI*2):Math.PI;
  const approaching=angle<.93||angle>Math.PI*2-.22;
  record(run,'Entrada a la glorieta',!approaching,approaching?'Entraste con un coche circulando cerca de la entrada.':'Te incorporaste con espacio para respetar al tráfico de la glorieta.','roundabout');
}

function cardinal(yaw){
  const heading=Math.round(yaw/(Math.PI/2))*Math.PI/2;
  return {yaw:heading,dx:Math.round(Math.sin(heading)),dz:-Math.round(Math.cos(heading))};
}

function checkStreetTurn(run){
  if(run.reverse){run.streetTurn=null;return;}
  let turn=run.streetTurn;
  const direction=cardinal(run.yaw);
  if(!turn){
    if(Math.abs(wrapAngle(run.yaw-direction.yaw))>.40)return;
    const node=CITY_STOPS.find(({x,z})=>{
      const [f,r]=axes({x,z,...direction},run.x,run.z);
      return f>=-14.5&&f<=-7.1&&Math.abs(r)<=STREET_HALF;
    });
    if(node)run.streetTurn={node,direction,signal:null};
    return;
  }
  const {node,direction:original}=turn;
  const distance=Math.hypot(run.x-node.x,run.z-node.z);
  const angle=wrapAngle(run.yaw-original.yaw);
  if(distance>16||Math.abs(angle)>2.2){run.streetTurn=null;return;}
  if(turn.signal===null&&distance<8.6&&Math.abs(angle)>.14)turn.signal=run.indicator;
  const [forward,side]=axes({...node,...direction},run.x,run.z);
  if(forward<6.75||Math.abs(side)>STREET_HALF||Math.abs(wrapAngle(run.yaw-direction.yaw))>.39)return;
  const change=wrapAngle(direction.yaw-original.yaw);
  if(Math.abs(change)>1.2){
    const sign=Math.sign(change),ok=sign===turn.signal;
    const side=sign<0?'izquierda':'derecha';
    record(run,'Intermitente al girar',ok,ok?`Señalizaste el giro a la ${side} antes de iniciarlo.`:
      `Señaliza con antelación el giro a la ${side}.`, 'signal');
  }
  run.streetTurn=null;
}

const limit=(v,min,max)=>Math.min(max,Math.max(min,v));

function checkSpeed(run){
  const zone=run.reverse?null:CITY_SPEED_ZONES.find(place=>{
    const [forward,side]=axes(place,run.x,run.z);
    return forward>=place.from&&forward<=place.to&&Math.abs(side)<=STREET_HALF&&Math.abs(alignment(run,place))>.66;
  });
  let visit=run.speedZone;
  if(visit&&zone?.id!==visit.zone.id){
    if(!visit.reported&&run.meters-visit.started>8.5)record(run,'Límite de velocidad',true,
      `Respetaste la señal de ${visit.zone.limit} km/h.`, 'speed');
    visit=run.speedZone=null;
  }
  if(!zone)return;
  if(!visit)visit=run.speedZone={zone,started:run.meters,above:0,reported:false};
  if(visit.reported)return;
  const kmh=run.speed*3.6;
  visit.above=kmh>zone.limit+.35?visit.above+run.dt:0;
  if(visit.above>=.20){
    visit.reported=true;
    record(run,'Límite de velocidad',false,`Circulabas a ${Math.round(kmh)} km/h en un tramo señalizado a ${zone.limit} km/h.`, 'speed');
  }
}

function straightLane(run){
  const radius=Math.hypot(run.x,run.z);
  if(radius<ROUND.outer+3.4||CITY_STOPS.some(({x,z})=>Math.hypot(x-run.x,z-run.z)<8.4)||
     SIDE_CORNERS.some(([x,z])=>Math.hypot(x-run.x,z-run.z)<8.4))return null;
  if(CITY_PARKING.some(spot=>{
    const [f,r]=axes(spot,run.x,run.z);return Math.abs(f)<PARKING.length/2+2&&r>2.65&&r<PARKING.end+.1;
  }))return null;
  const direction=cardinal(run.yaw);
  if(Math.abs(wrapAngle(run.yaw-direction.yaw))>.42)return null;
  const across=direction.dz?run.x:run.z;
  const axis=STREET_AXES.reduce((best,value)=>Math.abs(value-across)<Math.abs(best-across)?value:best);
  const side=direction.dz?-direction.dz:direction.dx;
  const lateral=(across-axis)*side;
  if(lateral<-.16||lateral>STREET_HALF)return null;
  return {direction,axis,side,lateral};
}

function assistedSteering(run,lane){
  if(run.reverse||!run.assisted||run.elapsed<run.manualUntil||run.speed<.3)return 0;
  const radius=Math.hypot(run.x,run.z),tangent=Math.atan2(run.z,run.x);
  if(Math.abs(radius-ROUND.lane)<1.28&&Math.abs(wrapAngle(run.yaw-tangent))<.42){
    const bearing=tangent+Math.atan2(ROUND.lane-radius,3.1);
    return limit(-.46+wrapAngle(bearing-run.yaw)*1.55,-.69,.51);
  }
  if(!lane)return 0;
  const bearing=lane.direction.yaw+Math.atan2((CITY_LANE-lane.lateral)*.67,4.5);
  return limit(wrapAngle(bearing-run.yaw)*1.65,-.44,.44);
}

function roadFits(x,z,yaw){
  return corners(x,z,yaw,WHEEL_LENGTH,WHEEL_WIDTH).every(([wx,wz])=>districtRoad(wx,wz));
}

// La ayuda usa la geometría de la calle. No consulta señales, tráfico ni peatones.
function curveAhead(run,distance,curvature,lane){
  let {x,z,yaw}=run;
  const sign=Math.sign(distance),step=sign*.60;
  const count=run.reverse?3:limit(Math.ceil((1.85+run.speed*.26)/Math.abs(step)),4,8);
  for(let i=0;i<count;i++){
    yaw+=curvature*step;
    x+=Math.sin(yaw)*step;z-=Math.cos(yaw)*step;
    if(!roadFits(x,z,yaw))return i;
    if(lane){
      const across=(lane.direction.dz?x:z)-lane.axis;
      if(across*lane.side<Math.min(lane.lateral,.78)-.02)return i;
    }
  }
  return count;
}

function worldPath(run,points,after=null){
  const length=[0];
  for(let i=1;i<points.length;i++)length.push(length[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  run.guidePath={points,length,travelled:0,after};run.turnChoice=0;
}

function bezierPath(run,end,heading,reach){
  const a=[run.x,run.z],d=end;
  const b=[a[0]+Math.sin(run.yaw)*reach,a[1]-Math.cos(run.yaw)*reach];
  const c=[d[0]-Math.sin(heading)*reach,d[1]+Math.cos(heading)*reach];
  const points=Array.from({length:37},(_,i)=>{
    const t=i/36,u=1-t;
    return [u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0],u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1]];
  });
  worldPath(run,points);
}

const GUIDE_BEND=4.94;
const GUIDE_NEAR=CITY_LANE+GUIDE_BEND;
const GUIDE_FAR=Math.sqrt((GUIDE_BEND+ROUND.lane)**2-GUIDE_NEAR**2);
const GUIDE_ENTRY=Math.atan2(GUIDE_FAR,GUIDE_NEAR);
const GUIDE_EXIT=Math.atan2(GUIDE_NEAR,GUIDE_FAR);

function chooseGuidePath(run,command){
  if(run.guidePath||run.reverse)return;
  if(!run.guideCircle&&Math.abs(Math.hypot(run.x,run.z)-ROUND.lane)<.42&&
    Math.abs(wrapAngle(run.yaw-Math.atan2(run.z,run.x)))<.28){
    const angle=Math.atan2(run.z,run.x),exit=cardinal(run.yaw-1.1).yaw;
    run.guideCircle={angle,exit:{yaw:exit,a:exit-Math.PI/2+GUIDE_EXIT}};
  }
  if(run.guideCircle){
    if(command&&command!==run.turnHeld){
      const options=[0,Math.PI/2,Math.PI,-Math.PI/2].map(yaw=>({yaw,a:yaw-Math.PI/2+GUIDE_EXIT}));
      options.sort((a,b)=>((run.guideCircle.angle-a.a+Math.PI*4)%(Math.PI*2))-((run.guideCircle.angle-b.a+Math.PI*4)%(Math.PI*2)));
      run.guideCircle.exit=options[command>0?0:2];run.turnChoice=0;
    }
    return;
  }
  const direction=cardinal(run.yaw);
  if(Math.abs(wrapAngle(run.yaw-direction.yaw))>.42)return;
  if(run.turnChoice===1){
    const parking=CITY_PARKING.find(spot=>{
      const [f,r]=axes(spot,run.x,run.z);
      return f>=-3.3&&f< -1.5&&r>.5&&r<3.2&&alignment(run,spot)>.85;
    });
    if(parking){
      const end=roadPoint(parking,2.7,(PARKING.start+PARKING.end)/2);
      bezierPath(run,end,direction.yaw,2.85);return;
    }
  }
  const centre=-run.x*direction.dz+run.z*direction.dx;
  const towards=run.x*direction.dx+run.z*direction.dz;
  if(Math.abs(centre-CITY_LANE)<1.1&&towards>=-GUIDE_FAR-.13&&towards< -11){
    const outgoing=direction.yaw+run.turnChoice*Math.PI/2;
    const anchor={x:0,z:0,...direction};
    const points=Array.from({length:30},(_,i)=>{
      const angle=i*GUIDE_ENTRY/29;
      return roadPoint(anchor,-GUIDE_FAR+GUIDE_BEND*Math.sin(angle),GUIDE_NEAR-GUIDE_BEND*Math.cos(angle));
    });
    points[0]=[run.x,run.z];
    const last=points.at(-1),a=Math.atan2(last[1],last[0]);
    worldPath(run,points,{angle:a,exit:{yaw:outgoing,a:outgoing-Math.PI/2+GUIDE_EXIT}});return;
  }
  const nodes=[...CITY_STOPS,...SIDE_CORNERS.map(([x,z])=>({x,z}))];
  const node=nodes.find(point=>{
    const [f,r]=axes({...point,...direction},run.x,run.z);
    return f>=-7.68&&f< -6.5&&r>.55&&r<3.2;
  });
  if(!node)return;
  const allowed=change=>{
    const yaw=direction.yaw+change*Math.PI/2;
    return districtRoad(node.x+16*Math.sin(yaw)+CITY_LANE*Math.cos(yaw),node.z-16*Math.cos(yaw)+CITY_LANE*Math.sin(yaw));
  };
  let selected=run.turnChoice;
  if(!allowed(selected))selected=[0,1,-1].find(allowed);
  if(!selected){run.turnChoice=0;return;}
  const out=direction.yaw+selected*Math.PI/2;
  const end=roadPoint({...node,...direction},-selected*CITY_LANE,selected*7.68);
  bezierPath(run,end,out,selected>0?4.0:6.1);
}

function followGuidePath(run,distance){
  const path=run.guidePath;
  if(!path)return false;
  path.travelled=Math.min(path.travelled+distance,path.length.at(-1));
  let index=1;
  while(index<path.length.length-1&&path.length[index]<path.travelled)index++;
  const previous=path.points[index-1],next=path.points[index];
  const amount=(path.travelled-path.length[index-1])/(path.length[index]-path.length[index-1]);
  const old=run.yaw;
  run.x=previous[0]+(next[0]-previous[0])*amount;run.z=previous[1]+(next[1]-previous[1])*amount;
  run.yaw=Math.atan2(next[0]-previous[0],previous[1]-next[1]);run.meters+=distance;run.contact=null;
  run.steer=limit(wrapAngle(run.yaw-old)*2.62/Math.max(.01,distance),-.8,.8);
  if(path.travelled>=path.length.at(-1)){
    run.guideCircle=path.after;run.guidePath=null;
  }
  return true;
}

function followGuideCircle(run,distance){
  const circle=run.guideCircle;
  if(!circle)return false;
  const remaining=(circle.angle-circle.exit.a+Math.PI*4)%(Math.PI*2);
  if(remaining<distance/ROUND.lane+.018){
    const direction=cardinal(circle.exit.yaw),node={x:0,z:0,...direction};
    const points=Array.from({length:29},(_,i)=>{
      const a=GUIDE_EXIT+(Math.PI/2-GUIDE_EXIT)*i/28;
      return roadPoint(node,GUIDE_FAR-GUIDE_BEND*Math.cos(a),GUIDE_NEAR-GUIDE_BEND*Math.sin(a));
    });
    points[0]=[run.x,run.z];run.guideCircle=null;worldPath(run,points);
    return followGuidePath(run,distance);
  }
  circle.angle-=distance/ROUND.lane;
  run.x=Math.cos(circle.angle)*ROUND.lane;run.z=Math.sin(circle.angle)*ROUND.lane;
  run.yaw=wrapAngle(circle.angle);run.steer=-.47;run.meters+=distance;run.contact=null;
  return true;
}

function guidedCurve(run,distance,curve,lock,lane,command){
  const expected=curveAhead(run,distance,curve,lane);
  if(expected>=6||expected>=4&&run.speed<5||run.reverse&&expected>=3)return curve;
  // Al llegar al fondo de una calle en T, el jugador elige hacia dónde salir.
  const atEnd=!command&&CITY_STOPS.some(node=>alignment(run,node)>.83&&Math.hypot(run.x-node.x,run.z-node.z)<8.6);
  if(atEnd)return curve;
  const maximum=Math.tan(lock)/2.62;
  let preferred=curve,best=expected;
  for(const offset of [-.30,.30,-.60,.60,-1,1]){
    const option=limit(curve+offset*maximum,-maximum,maximum);
    const clearance=curveAhead(run,distance,option,lane);
    if(clearance>best){best=clearance;preferred=option;}
  }
  return preferred;
}

function moveAlongStreet(run,distance,lane,command){
  if(!distance)return;
  // A velocidad de maniobra se conserva el giro cerrado. A más velocidad, el volante es menos sensible.
  const lock=run.assisted?.53:.53-.29*limit((run.speed-4.15)/5.55,0,1);
  const manual=Math.tan(run.steer*lock)/2.62;
  const curve=run.assisted?guidedCurve(run,distance,manual,lock,lane,command):manual;
  const turn=curve*distance;
  function tryMove(step,steering){
    const yaw=wrapAngle(run.yaw+steering);
    const x=run.x+Math.sin(yaw)*step,z=run.z-Math.cos(yaw)*step;
    if(!roadFits(x,z,yaw))return false;
    run.x=x;run.z=z;run.yaw=yaw;run.meters+=Math.abs(step);
    return true;
  }
  if(tryMove(distance,turn)){
    if(run.contact){
      run.clearance+=Math.abs(distance);
      if(run.clearance>=.48)run.contact=null;
    }
    return;
  }
  if(run.assisted){
    if(tryMove(distance*.45,turn*.45))return;
    run.speed=0;run.contact=null;
    return;
  }
  // Se reduce la marcha cuando el giro rebasa el borde. Las ruedas se mantienen sobre la calzada.
  const slowStep=distance*.32;
  if(tryMove(slowStep,turn*.32)||tryMove(slowStep,0)){
    run.speed*=.43;run.contact='roce';
  }else{
    run.speed=0;run.contact='bloqueado';
  }
  run.clearance=0;
}

export function selectIndicator(run,direction){
  run.indicator=run.indicator===direction?0:direction;
  run.indicatorSince=run.elapsed;
  run.indicatorTurn=0;
}

export function flashingIndicator(frame){
  return frame.indicator&&(frame.elapsed-frame.indicatorSince)% .72<.36?frame.indicator:0;
}

export function driveDistrict(run,controls,dt){
  if(run.ending)return;
  run.dt=dt;run.elapsed+=dt;
  actors(run,dt);
  const steer=Number(controls.has('right'))-Number(controls.has('left'));
  const look=Number(controls.has('lookRight'))-Number(controls.has('lookLeft'));
  if(run.assisted){
    if(steer&&steer!==run.turnHeld)run.turnChoice=steer;
    if(run.reverse){run.guidePath=null;run.guideCircle=null;}
    else chooseGuidePath(run,steer);
  }else{
    run.guidePath=null;run.guideCircle=null;
    if(steer)run.manualUntil=run.elapsed+.38;
  }
  run.turnHeld=steer;
  const lane=run.assisted&&!run.reverse?straightLane(run):null;
  const command=run.assisted&&!run.reverse?0:steer;
  const guided=command||assistedSteering(run,lane);
  run.steer+=(guided-run.steer)*Math.min(1,(command?7:10)*dt);run.look+=(look*1.29-run.look)*Math.min(1,6*dt);
  run.braking=controls.has('brake');
  const gas=controls.has('gas');
  const acceleration=run.braking?-7.25:gas?2.6-.064*run.speed:-.76-.078*run.speed;
  run.speed=limit(run.speed+acceleration*dt,0,run.reverse?3.25:9.7);
  const previousYaw=run.yaw;
  const movement=(run.reverse?-1:1)*run.speed*dt;
  if(!run.assisted||run.reverse||!followGuidePath(run,movement)&&!followGuideCircle(run,movement)){
    moveAlongStreet(run,movement,lane,command);
  }
  checkStreetTurn(run);
  if(run.indicator&&!run.reverse){
    run.indicatorTurn+=wrapAngle(run.yaw-previousYaw)*run.indicator;
    if(run.indicatorTurn>.55&&Math.abs(run.steer)<.14)selectIndicator(run,0);
  }
  checkStops(run);checkCrossings(run);checkRoundabout(run);checkSpeed(run);checkTrafficLight(run);checkLighting(run);
  const collision=run.traffic.some(car=>bump(run,car));
  const hitsPerson=run.pedestrians.some(person=>bumpPerson(run,person));
  if(collision||hitsPerson){
    run.speed=0;run.ending='collision';
    record(run,collision?'Colisión con otro vehículo':'Colisión en un paso',false,collision?'Deja espacio antes de entrar en la trayectoria de otro coche.':'Deja terminar de cruzar al peatón.','collision');
    return;
  }
  const parking=CITY_PARKING[run.goal];
  const parked=run.speed<.1&&!controls.has('gas')&&corners(run.x,run.z,run.yaw).every(([wx,wz])=>{
    const [f,r]=axes(parking,wx,wz);return Math.abs(f)<PARKING.length/2&&r>4.48&&r<PARKING.end;
  });
  run.parkTime=parked?run.parkTime+dt:0;
  if(run.parkTime>.65){run.ending='parked';record(run,'Llegada al destino',true,'Detuviste el coche dentro de la zona de aparcamiento.','parking');}
}
