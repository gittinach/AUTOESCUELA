export const DISTRICT=52;
export const STREET_HALF=4.5;
export const ROUND={inner:6.35,outer:11.85,join:10.8,mark:13.25,lane:9.15};
export const CITY_LANE=1.85;
const CAR_LENGTH=2.05,CAR_WIDTH=.87;
const PEDESTRIAN_SPEED=1.42;
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

export function planDistrict(previous={},random=Math.random){
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
  const car={...STARTS[start],speed:0,steer:0,look:0};
  const run={...car,goal,start,elapsed:0,reverse:false,traffic:[...cars,...circle],pedestrians,history,
    checks:[],stops:new Map(),ringApproach:null,contact:null,ending:null,parkTime:0,meters:0};
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
      if(safe&&run.elapsed-person.nearSince>person.wait)person.state='walking';
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
      })||sameLaneAhead(car,run,8.5)||run.traffic.some(other=>other!==car&&!other.ring&&sameLaneAhead(car,other,7.5));
      car.velocity=Math.min(car.speed,Math.max(0,car.velocity+(blocked?-5:2.2)*dt));
      car.distance=(car.distance+car.velocity*dt)%LOOP_LENGTH;
    }
    placeTraffic(car);
  }
}

function sameLaneAhead(car,other,distance){
  const x=other.x-car.x,z=other.z-car.z,dx=Math.sin(car.yaw),dz=-Math.cos(car.yaw);
  const ahead=x*dx+z*dz;
  return Math.abs(-x*dz+z*dx)<1.7&&ahead>1.75&&ahead<distance;
}

export function wrapAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}
function alignment(car,road){return Math.sin(car.yaw)*road.dx-Math.cos(car.yaw)*road.dz;}
function corners(x,z,yaw){
  const a=Math.sin(yaw),b=-Math.cos(yaw);
  return [[CAR_LENGTH,CAR_WIDTH],[CAR_LENGTH,-CAR_WIDTH],[-CAR_LENGTH,CAR_WIDTH],[-CAR_LENGTH,-CAR_WIDTH]]
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
  const angle=(npc.angle-a+Math.PI*2)%(Math.PI*2);
  const approaching=angle<.93||angle>Math.PI*2-.22;
  record(run,'Entrada a la glorieta',!approaching,approaching?'Entraste con un coche circulando cerca de la entrada.':'Te incorporaste con espacio para respetar al tráfico de la glorieta.','roundabout');
}

export function driveDistrict(run,controls,dt){
  if(run.ending)return;
  run.dt=dt;run.elapsed+=dt;
  actors(run,dt);
  const steer=Number(controls.has('right'))-Number(controls.has('left'));
  const look=Number(controls.has('lookRight'))-Number(controls.has('lookLeft'));
  run.steer+=(steer-run.steer)*Math.min(1,7*dt);run.look+=(look*1.29-run.look)*Math.min(1,6*dt);
  const acceleration=controls.has('brake')?-7.25:controls.has('gas')?2.6-.064*run.speed:-.76-.078*run.speed;
  run.speed=Math.min(run.reverse?3.25:9.7,Math.max(0,run.speed+acceleration*dt));
  const movement=(run.reverse?-1:1)*run.speed*dt;
  const yaw=wrapAngle(run.yaw+Math.tan(run.steer*.53)*movement/2.62);
  const x=run.x+Math.sin(yaw)*movement,z=run.z-Math.cos(yaw)*movement;
  if(!movement||corners(x,z,yaw).every(([wx,wz])=>districtRoad(wx,wz))){
    run.x=x;run.z=z;run.yaw=yaw;run.meters+=Math.abs(movement);run.contact=null;
  }else{
    run.speed=0;
    if(!run.contact&&Math.abs(movement)>dt*1.1)record(run,'Control del vehículo',false,'Tocaste el bordillo. Maniobra despacio para volver a la calzada.','vehicle');
    run.contact='bordillo';
  }
  checkStops(run);checkCrossings(run);checkRoundabout(run);
  const collision=run.traffic.some(car=>bump(run,car));
  const hitsPerson=run.pedestrians.some(person=>bumpPerson(run,person));
  if(collision||hitsPerson){
    run.speed=0;run.ending='collision';
    record(run,collision?'Colisión con otro vehículo':'Colisión en un paso',false,collision?'Deja espacio antes de entrar en la trayectoria de otro coche.':'Deja terminar de cruzar al peatón.','collision');
    return;
  }
  const parking=CITY_PARKING[run.goal];
  const parked=run.speed<.1&&corners(run.x,run.z,run.yaw).every(([wx,wz])=>{
    const [f,r]=axes(parking,wx,wz);return Math.abs(f)<PARKING.length/2&&r>4.48&&r<PARKING.end;
  });
  run.parkTime=parked?run.parkTime+dt:0;
  if(run.parkTime>.65){run.ending='parked';record(run,'Llegada al destino',true,'Detuviste el coche dentro de la zona de aparcamiento.','parking');}
}
