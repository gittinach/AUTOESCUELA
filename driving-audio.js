export function createDrivingAudio(){
  if(!window.AudioContext)return null;
  const context=new AudioContext({latencyHint:'playback'});
  const level=context.createGain();
  level.gain.value=0;
  level.connect(context.destination);

  function channel(destination){
    const gain=context.createGain();gain.gain.value=0;gain.connect(destination);return gain;
  }
  function filter(type,hz,destination){
    const node=context.createBiquadFilter();node.type=type;node.frequency.value=hz;node.Q.value=.36;
    node.connect(destination);return node;
  }
  function oscillator(hz,partials,destination){
    const source=context.createOscillator();source.frequency.value=hz;
    source.setPeriodicWave(context.createPeriodicWave(new Float32Array(partials.length),Float32Array.from(partials)));
    source.connect(destination);source.start();return source;
  }

  const engine=channel(level),engineTone=filter('lowpass',360,engine);
  const motor=oscillator(43,[0,.67,1,.45,.27,.12,.06],engineTone);
  const road=channel(level),roadTone=filter('bandpass',320,road);

  const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
  const samples=buffer.getChannelData(0);
  let previous=0;
  for(let i=0;i<samples.length;i++){
    previous=.65*previous+(Math.random()*2-1)*.35;
    samples[i]=previous*.78;
  }
  const air=context.createBufferSource();air.buffer=buffer;air.loop=true;
  air.connect(roadTone);
  const passers=Array.from({length:2},(_,i)=>{
    const pan=context.createStereoPanner();pan.connect(level);
    const passing=channel(pan),passingTone=filter('lowpass',760,passing);
    const outside=oscillator(72+i*8,[0,1,.58,.2,.095],passingTone);
    const tread=channel(passingTone),treadTone=filter('bandpass',490,tread);
    tread.gain.value=.55;air.connect(treadTone);
    return {pan,passing,passingTone,outside};
  });
  air.start();

  let running=false,timer=0,lastUpdate=-1;
  function setPlaying(active){
    if(running===active)return;
    clearTimeout(timer);running=active;lastUpdate=-1;
    const now=context.currentTime;
    level.gain.cancelScheduledValues(now);
    level.gain.setTargetAtTime(active?.24:0,now,.026);
    if(active)context.resume().catch(()=>{});
    else timer=setTimeout(()=>context.suspend().catch(()=>{}),125);
  }

  return {
    setPlaying,
    update(car,accelerating){
      if(!running || context.state!=='running')return;
      const now=context.currentTime;
      if(now-lastUpdate<.035)return;
      lastUpdate=now;
      const approach=car.speed/10.6,load=accelerating?1:0;
      const angle=car.yaw+car.look;
      const target=(param,value)=>param.setTargetAtTime(value,now,.062);
      target(motor.frequency,43+approach*29+load*10);
      target(engine.gain,.115+approach*.055+load*.052);
      target(engineTone.frequency,340+approach*270+load*130);
      target(road.gain,.043+approach*.19);
      target(roadTone.frequency,315+approach*240);
      const distanceSquared=other=>(other.x-car.x)**2+(other.z-car.z)**2;
      const traffic=car.traffic.length>2?car.traffic.slice().sort((a,b)=>distanceSquared(a)-distanceSquared(b)):car.traffic;
      for(const [i,{pan,passing,passingTone,outside}] of passers.entries()){
        const other=traffic[i];
        if(!other){target(passing.gain,0);continue;}
        const dx=other.x-car.x,dz=other.z-car.z,distance=Math.hypot(dx,dz);
        target(pan.pan,.88*(dx*Math.cos(angle)+dz*Math.sin(angle))/Math.max(2,distance));
        target(passing.gain,.41/(1+(distance/7.4)**2));
        target(passingTone.frequency,440+670/(1+distance/11));
        const relativeSpeed=other.yaw===undefined?other.direction*dx:dx*Math.sin(other.yaw)-dz*Math.cos(other.yaw);
        target(outside.frequency,70+i*8-6*relativeSpeed/Math.max(4,distance));
      }
    },
    dispose(){ clearTimeout(timer);context.close().catch(()=>{}); }
  };
}
