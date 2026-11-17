import {CITY_STOPS,CITY_ENTRIES,CITY_CROSSINGS,CITY_PARKING,ROADS,ROUND,PARKING,STOP_LINE,roadPoint} from './driving-world.js';

export const JUNCTION={
  laneX:1.85,roadHalfWidth:4.5,stopLine:10.5,crossEdge:6,
  trafficZ:2.75,trafficHalfLength:2.11,trafficHalfWidth:.895,
  carHalfLength:2.05,carHalfWidth:.87
};
export const PARKED_VAN={x:-9.18,z:8.24,length:5.3,width:2.25};
export const SIDE_LOOK=1.29;

export function driverEye({x,z,yaw}){
  return [x-.39*Math.cos(yaw)+.38*Math.sin(yaw),1.24,z-.39*Math.sin(yaw)-.38*Math.cos(yaw)];
}

const SKY=[.75,.82,.84];
const VERTEX_SIZE=10;
const SHADOW_SIZE=1024;
const lightSpace=`
  vec3 sunSpace(vec3 world){
    vec3 p=world-vec3(0.,0.,7.);
    return vec3(dot(p,vec3(.382,0.,.924))/29.,
                dot(p,vec3(.468,.863,-.193))/24.,
                -dot(p,vec3(-.797,.506,.329))/37.);
  }
`;
const vertexSource=`
  attribute vec3 aPosition;
  attribute vec3 aColor;
  attribute vec2 aUV;
  attribute float aGrain;
  attribute float aMaterial;
  uniform vec3 uEye;
  uniform vec2 uHeading;
  uniform vec2 uProjection;
  uniform vec4 uPlacement;
  uniform float uStride;
  varying vec3 vColor;
  varying vec2 vUV;
  varying vec2 vGround;
  varying float vGrain;
  varying float vDepth;
  varying float vMaterial;
  varying vec3 vShadow;
  ${lightSpace}
  void main(){
    vec3 local=aPosition;
    if(uStride!=0.&&local.y<.86)local.x+=sign(local.z)*uStride*(1.-local.y/.86);
    vec2 world=vec2(local.x*uPlacement.z+local.z*uPlacement.w,
                    -local.x*uPlacement.w+local.z*uPlacement.z)+uPlacement.xy;
    vec3 point=vec3(world.x,aPosition.y,world.y);
    vec3 p=point-uEye;
    float side=dot(p.xz,uHeading);
    float front=dot(p.xz,vec2(uHeading.y,-uHeading.x));
    float depth=front*.996-p.y*.088;
    float up=p.y*.996+front*.088;
    gl_Position=vec4(side*uProjection.x,up*uProjection.y,depth*1.0016-.20,depth);
    vColor=aColor; vUV=aUV; vGround=world; vGrain=aGrain; vDepth=depth;
    vMaterial=aMaterial;
    vShadow=sunSpace(point)*.5+.5;
  }
`;
const fragmentSource=`
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif
  uniform vec3 uHaze;
  uniform sampler2D uPrint;
  uniform sampler2D uAsphalt;
  uniform sampler2D uStucco;
  uniform sampler2D uRoof;
  uniform sampler2D uPaving;
  uniform sampler2D uShadow;
  uniform bool uShadows;
  uniform bool uTextured;
  varying vec3 vColor;
  varying vec2 vUV;
  varying vec2 vGround;
  varying float vGrain;
  varying float vDepth;
  varying float vMaterial;
  varying vec3 vShadow;
  float shadeAt(vec2 offset){
    vec2 depth=texture2D(uShadow,vShadow.xy+offset/${SHADOW_SIZE}.).rg;
    return smoothstep(.0034,.0053,vShadow.z-dot(depth,vec2(1.,1./255.)));
  }
  void main(){
    vec3 color=vColor;
    float opacity=1.;
    if(vMaterial<.5&&vUV.x>=0.){
      opacity=texture2D(uPrint,vUV).a;
      if(opacity<.04)discard;
    }
    if(uTextured&&vMaterial>.5){
      vec3 texel=vMaterial<1.5?texture2D(uAsphalt,vUV).rgb:
        vMaterial<2.5?texture2D(uStucco,vUV).rgb:
        vMaterial<3.5?texture2D(uRoof,vUV).rgb:texture2D(uPaving,vUV).rgb;
      float mapped=dot(texel,vec3(.299,.587,.114));
      float middle=vMaterial<1.5?.35:vMaterial<2.5?.72:vMaterial<3.5?.45:.64;
      color*=clamp(1.+(mapped-middle)*1.52,.58,1.36);
    }else if(vGrain>.0){
      float nearGrain=1.-smoothstep(7.,31.,vDepth);
      vec2 tile=mod(floor(vGround*38.),vec2(97.,89.));
      float grain=fract(sin(dot(tile,vec2(12.9898,57.233)))*4375.3545);
      float patches=sin(vGround.x*1.34+vGround.y*.48)*sin(vGround.y*.82-vGround.x*.62);
      color+=vGrain*((grain-.5)*nearGrain+patches*.16);
    }
    if(uShadows&&vShadow.x>.004&&vShadow.x<.996&&vShadow.y>.004&&vShadow.y<.996&&vDepth<77.){
      float shadow=(shadeAt(vec2(-.65,-.5))+shadeAt(vec2(.65,.5)))*.5;
      color=mix(color,color*vec3(.67,.72,.80),shadow*(1.-smoothstep(57.,77.,vDepth)));
    }
    gl_FragColor=vec4(mix(color,uHaze,smoothstep(27.,105.,vDepth)*.84)*opacity,opacity);
  }
`;

const shadowVertex=`
  attribute vec3 aPosition;
  ${lightSpace}
  void main(){gl_Position=vec4(sunSpace(aPosition),1.);}
`;
const shadowFragment=`
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif
  void main(){
    vec2 depthPair=fract(gl_FragCoord.z*vec2(1.,255.));
    gl_FragColor=vec4(depthPair.x-depthPair.y/255.,depthPair.y,0.,1.);
  }
`;

function color(hex,shade=1){
  const value=parseInt(hex.slice(1),16);
  return [value>>16,(value>>8)&255,value&255].map(channel=>channel*shade/255);
}

function mesh(){
  const vertices=[];
  function triangle(a,b,c,tint,grain=0,uv,material=0){
    const perVertex=Array.isArray(tint[0]);
    [a,b,c].forEach((p,i)=>vertices.push(...p,...(perVertex?tint[i]:tint),...(uv?.[i]||[-1,-1]),grain,material));
  }
  function quad(a,b,c,d,tint,grain=0,print=false,material=0){
    const uv=typeof print==='function'?print:print?null:undefined;
    triangle(a,b,c,tint,grain,uv?[uv(a),uv(b),uv(c)]:print?[[0,0],[1,0],[1,1]]:null,material);
    triangle(a,c,d,tint,grain,uv?[uv(a),uv(c),uv(d)]:print?[[0,0],[1,1],[0,1]]:null,material);
  }
  function ground(x1,z1,x2,z2,y,hex,grain=0,material=0){
    const metres=material===4?2.35:2.95;
    quad([x1,y,z1],[x2,y,z1],[x2,y,z2],[x1,y,z2],color(hex),grain,
      material?([x,,z])=>[x/metres,z/metres]:false,material);
  }
  function box(x,y,z,w,h,d,hex,material=0){
    const l=x-w/2,r=x+w/2,n=z-d/2,f=z+d/2,t=y+h;
    const top=material===4,wall=material===2;
    const xz=([a,,b])=>[a/2.35,b/2.35],xy=([a,b])=>[a/3.8,b/3.8],zy=([,a,b])=>[b/3.8,a/3.8];
    quad([l,t,n],[r,t,n],[r,t,f],[l,t,f],color(hex,1.025),0,top&&xz,top?material:0);
    quad([l,y,f],[r,y,f],[r,t,f],[l,t,f],color(hex,.96),0,wall&&xy,wall?material:0);
    quad([r,y,n],[l,y,n],[l,t,n],[r,t,n],color(hex,.77),0,wall&&xy,wall?material:0);
    quad([l,y,n],[l,y,f],[l,t,f],[l,t,n],color(hex,.89),0,wall&&zy,wall?material:0);
    quad([r,y,f],[r,y,n],[r,t,n],[r,t,f],color(hex,.79),0,wall&&zy,wall?material:0);
  }
  function foliage(x,y,z,r,hex){
    const top=[x,y+r*.94,z],bottom=[x,y-r*.71,z];
    const points=Array.from({length:9},(_,i)=>{
      const angle=i*Math.PI*2/9,dx=Math.cos(angle),dz=Math.sin(angle);
      const spread=r*(1+(i%3-1)*.09);
      return {
        lower:[x+dx*spread,y-r*.21,z+dz*spread],
        upper:[x+dx*spread*.73,y+r*(.33+i%2*.14),z+dz*spread*.73],
        shade:.91+(-dx+dz)*.12
      };
    });
    for(const [i,p] of points.entries()){
      const q=points[(i+1)%points.length];
      triangle(p.upper,q.upper,top,[color(hex,p.shade*1.08),color(hex,q.shade*1.08),color(hex,1.21)]);
      triangle(p.lower,q.lower,q.upper,[color(hex,p.shade*.85),color(hex,q.shade*.85),color(hex,q.shade*1.08)]);
      triangle(p.lower,q.upper,p.upper,[color(hex,p.shade*.85),color(hex,q.shade*1.08),color(hex,p.shade*1.08)]);
      triangle(p.lower,bottom,q.lower,color(hex,p.shade*.72));
    }
  }
  return {vertices,triangle,quad,ground,box,foliage};
}

function wallWindow(m,x,y,z,front,face,shutters){
  function plate(left,bottom,width,height,offset,hex){
    const point=(u,v)=>front?[x+u,y+v,z+face*offset]:[x+face*offset,y+v,z+u];
    m.quad(point(left,bottom),point(left+width,bottom),point(left+width,bottom+height),
      point(left,bottom+height),color(hex,face>0?1:.84));
  }
  plate(-.47,0,.94,1.04,.012,'#977f6d');
  plate(-.44,.05,.88,.92,.025,'#f3e6ce');
  plate(-.354,.13,.708,.75,.04,'#2e4c5a');
  plate(-.343,.49,.686,.37,.042,'#7e9ea0');
  plate(-.026,.11,.052,.8,.046,'#dbd4be');
  plate(-.36,.446,.72,.046,.047,'#d1c9b4');
  plate(-.51,-.028,1.02,.095,.055,'#eee0c5');
  if(shutters){
    for(const dx of [-.69,.48]){
      plate(dx,.06,.21,.89,.029,shutters);
      for(let row=.19;row<.88;row+=.14)plate(dx+.021,row,.168,.013,.032,'#c9ba98');
    }
  }
}

function balcony(m,x,z,y){
  m.box(x,y,z,2.32,.18,.84,'#d7c8ad');
  m.box(x,y+.89,z+.36,2.33,.054,.049,'#3e4d48');
  m.box(x,y+.25,z+.36,2.33,.05,.048,'#485751');
  for(let i=-5;i<=5;i++)m.box(x+i*.215,y+.22,z+.36,.031,.70,.031,'#485751');
  for(const s of [-1,1]){
    m.box(x+s*1.13,y+.89,z,.044,.054,.74,'#3e4d48');
    m.box(x+s*1.13,y+.17,z,.046,.75,.043,'#485751');
  }
  m.box(x+.68,y+.20,z+.02,.48,.21,.21,'#ad7358');
  m.foliage(x+.69,y+.45,z+.02,.23,'#707b45');
}

function house(m,x,z,w,d,h,wall,roof){
  const {box,quad,triangle}=m;
  const l=x-w/2-.23,r=x+w/2+.23,n=z-d/2-.25,f=z+d/2+.25,ridge=h+1.2;
  box(x,.1,z,w,h-.1,d,wall,2);
  box(x,.0,z,w+.05,.39,d+.05,'#9b8b79');
  box(x,.392,z,w+.075,.085,d+.075,'#ccb79c');
  const roofUV=([a,,b])=>[a/2.2,Math.abs(b-z)/1.85];
  quad([l,h,n],[r,h,n],[r,ridge,z],[l,ridge,z],color(roof,.83),0,roofUV,3);
  quad([l,ridge,z],[r,ridge,z],[r,h,f],[l,h,f],color(roof),0,roofUV,3);
  triangle([l,h,n],[l,ridge,z],[l,h,f],color(wall,.81));
  triangle([r,h,f],[r,ridge,z],[r,h,n],color(wall,.92));
  box(x,ridge-.018,z,w+.5,.09,.14,'#be7555');
  for(let i=1;i<11;i++){
    const ratio=i/11,y=ridge-ratio*1.2+.013;
    for(const direction of [-1,1]){
      const edge=z+direction*ratio*(d/2+.25);
      box(x,y,edge,w+.35,.027,.048,i%3?'#ab6e54':'#c38968');
    }
  }
  box(x+w*.2,h+.53,z-.38,.36,.91,.37,'#c18063');
  box(x+w*.2,h+1.44,z-.38,.45,.085,.46,'#8b5849');
  const shutters=x<0?'#547064':'#789590';
  for(const face of [-1,1]){
    const facade=z+face*(d/2+.035);
    for(let off=-w/2+1.3;off<w/2-1;off+=2.25){
      wallWindow(m,x+off,h-1.31,facade,true,face,shutters);
    }
    box(x+w/5,.22,facade,1.12,2.17,.13,'#666558');
    box(x+w/5,.25,facade+face*.08,.86,1.88,.045,'#37615a');
    box(x+w/5,.27,facade+face*.108,.69,.12,.10,'#b9a588');
    box(x+w/5+.28,1.20,facade+face*.123,.065,.12,.055,'#dbb27a');
    box(x+w/5,2.37,facade+face*.17,1.38,.12,.52,roof);
  }
  for(const face of [-1,1]){
    const facade=x+face*(w/2+.055);
    for(let off=-d/2+1.18;off<d/2-.85;off+=2.1){
      wallWindow(m,facade,h-1.47,z+off,false,face,shutters);
    }
  }
  if(z< -10&&Math.abs(x)<25)balcony(m,x-w*.19,z+d/2+.38,h-1.53);
}

function groundShade(m,x,z,y,w,d,hex,strength,grain){
  const edge=color(hex),inside=color(hex,strength);
  for(let i=0;i<12;i++){
    const point=(step,scale)=>{
      const a=step*Math.PI/6;
      return [x+Math.cos(a)*w*scale,y,z+Math.sin(a)*d*scale];
    };
    const a=point(i,1),b=point(i+1,1),c=point(i+1,.51),d1=point(i,.51);
    m.triangle(a,b,c,[edge,edge,inside],grain);
    m.triangle(a,c,d1,[edge,inside,inside],grain);
    m.triangle(d1,c,[x,y,z],inside,grain);
  }
}

function tree(m,x,z,size){
  const onPaving=Math.abs(z)<7.72;
  const ground=onPaving?.134:-.126;
  groundShade(m,x+.76*size,z-.43*size,ground,1.35*size,.61*size,onPaving?'#cec5b4':'#88996d',.79,onPaving?0:.11);
  m.box(x,.124,z,.32*size,.13,.29*size,'#776a4f');
  m.box(x,ground,z,.19*size,1.87*size,.2*size,'#80684c');
  m.foliage(x,2.12*size,z,.88*size,'#597d49');
  m.foliage(x-.49*size,2.14*size,z+.21*size,.64*size,'#769753');
  m.foliage(x+.48*size,2.13*size,z-.12*size,.68*size,'#496f44');
  m.foliage(x-.025,2.63*size,z-.08*size,.64*size,'#779949');
}

function streetlight(m,x,z,direction){
  m.box(x,.12,z,.105,3.45,.105,'#526870');
  m.box(x+direction*.265,3.49,z,.64,.085,.11,'#526870');
  m.box(x+direction*.58,3.46,z,.36,.12,.21,'#3e525e');
  m.box(x+direction*.58,3.45,z,.22,.02,.13,'#f2e1b7');
}

function octagon(m,x,y,z,r,hex){
  for(let i=0;i<8;i++){
    const a=(i+.5)*Math.PI/4,b=a+Math.PI/4;
    m.triangle([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],
      [x+Math.cos(b)*r,y+Math.sin(b)*r,z],color(hex));
  }
}

function hatchbackBody(m,x,z,half,width,paint){
  const stations=[[-half,.62,.70],[-half+.28,.87,.84],[-.92,.90,.98],
    [.78,.91,1],[half-.27,.80,.92],[half,.65,.72]];
  for(const [i,[a,topA,wa]] of stations.slice(0,-1).entries()){
    const [b,topB,wb]=stations[i+1];
    const ea=wa*width/2,eb=wb*width/2;
    m.quad([x+a,topA,z-ea*.87],[x+b,topB,z-eb*.87],[x+b,topB,z+eb*.87],[x+a,topA,z+ea*.87],color(paint,1.13));
    for(const side of [-1,1]){
      m.quad([x+a,.59,z+side*ea],[x+b,.59,z+side*eb],[x+b,topB,z+side*eb*.87],
        [x+a,topA,z+side*ea*.87],color(paint,side===1?1.02:.91));
      m.quad([x+a,.35,z+side*ea*.89],[x+b,.35,z+side*eb*.89],[x+b,.59,z+side*eb],
        [x+a,.59,z+side*ea],color(paint,side===1?.83:.72));
    }
  }
  for(const [a,y,w] of [stations[0],stations.at(-1)]){
    m.box(x+a,.35,z,.021,y-.35,w*width*.89,paint);
  }
}

// Las mallas se dibujan hacia +x. El motor gira el tráfico que circula hacia -x.
function vehicle(m,x,z,van,paint='#d68a42'){
  const {box,quad}=m;
  const length=van?PARKED_VAN.length:JUNCTION.trafficHalfLength*2,half=length/2;
  const width=van?PARKED_VAN.width:JUNCTION.trafficHalfWidth*2,body=van?'#e7e6dc':paint;
  groundShade(m,x+.14,z-.09,van?.156:.022,half+.4,width*.76,van?'#656662':'#5c5c5b',.54,van?.16:.095);
  const raisedStart=m.vertices.length;
  for(const wheel of [-half+.87,half-.82]){
    for(const side of [-1,1]){
      const face=z+side*(width/2-.015),axis=x+wheel;
      for(let i=0;i<10;i++){
        const a=i*Math.PI/5,b=a+Math.PI/5;
        for(const [radius,offset,tint] of [[.34,0,'#262d33'],[.19,.007,'#a9b1b6'],[.085,.012,'#626e78']]){
          const surface=face+side*offset;
          m.triangle([axis,.34,surface],[axis+Math.cos(a)*radius,.34+Math.sin(a)*radius,surface],
            [axis+Math.cos(b)*radius,.34+Math.sin(b)*radius,surface],color(tint));
        }
      }
    }
  }
  if(van)box(x,.37,z,length,.74,width-.08,body);
  else hatchbackBody(m,x,z,half,width,body);
  box(x,.33,z,length-.24,.095,width*.72,'#353e43');
  if(van){
    box(x-.66,1.095,z,3.84,1.24,width-.11,body);
    box(x-.72,1.13,z,3.18,.055,width-.046,'#aab6b7');
    box(x-.53,1.17,z,2.75,.94,width-.072,'#dedfd7');
    for(const s of [-1,1]){
      const panel=z+s*(width/2-.022);
      box(x-.45,1.16,panel,.024,.91,.018,'#9eaaa8');
      box(x-.26,1.29,panel,.19,.061,.039,'#52626a');
      box(x-.69,.65,panel,3.24,.095,.017,'#8c999c');
    }
    box(x+half+.013,.66,z,.02,.14,.83,'#364a53');
    box(x+half+.018,.744,z,.023,.022,.87,'#9aa8a9');
  }
  const f=x+(van?1.95:.97),r=x-(van?-.63:1.2),top=van?2.19:1.52,base=van?1.09:.91;
  const topFront=f-.39,topBack=r+.34,side=width*.47,inner=side-.16;
  quad([f,base,z-side],[f,base,z+side],[topFront,top,z+inner],[topFront,top,z-inner],color('#6a8b99'));
  quad([r,base,z+side],[r,base,z-side],[topBack,top,z-inner],[topBack,top,z+inner],color('#466575'));
  for(const s of [-1,1]){
    quad([r,base,z+s*side],[f,base,z+s*side],[topFront,top,z+s*inner],[topBack,top,z+s*inner],color('#436376',s===1?1.13:.94));
    box(x+(van?1.44:.04),base,z+s*(side-.065),.08,top-base-.05,.15,body);
    box(x+half-.08,base,z+s*(width/2+.065),.22,.11,.17,body);
    box(x+half+.008,.65,z+s*width*.31,.027,.174,.38,'#495861');
    box(x+half+.029,.676,z+s*width*.31,.022,.12,.31,'#faf3d9');
    box(x-half-.008,.64,z+s*width*.37,.023,van?.27:.18,.22,'#63343a');
    box(x-half-.024,.666,z+s*width*.37,.020,van?.21:.122,.19,'#cb5148');
    box(x+.31,base-.088,z+s*(width/2-.041),.21,.030,.017,'#d0d3c9');
  }
  box((topFront+topBack)/2,top-.014,z,topFront-topBack+.10,.08,inner*2+.11,body);
  box(x+half+.012,.51,z,.028,.104,.39,'#e9ece7');
  box(x-half-.012,.51,z,.028,.104,.39,'#e9ece7');
  if(van)for(let i=raisedStart+1;i<m.vertices.length;i+=VERTEX_SIZE)m.vertices[i]+=.154;
}

function drain(m,x,z){
  m.ground(x-.16,z-.35,x+.16,z+.35,.015,'#92918b');
  m.ground(x-.127,z-.313,x+.127,z+.313,.018,'#555d61');
  for(let slot=-.25;slot<.3;slot+=.085){
    m.ground(x-.113,z+slot,x+.113,z+slot+.035,.020,'#323c42');
  }
}

function hills(m){
  const rings=[[108,10,'#98aaa0'],[87,6.9,'#798d78']];
  for(const [radius,peak,hex] of rings){
    function ridge(i){
      const a=i*Math.PI/22;
      const height=peak*(.73+.24*Math.sin(a*5+.2)+.20*Math.sin(a*9+1.6));
      return [Math.cos(a)*radius,height,Math.sin(a)*radius];
    }
    for(let i=0;i<44;i++){
      const a=ridge(i),b=ridge(i+1);
      m.quad([a[0],-.22,a[2]],[b[0],-.22,b[2]],b,a,color(hex,.95+i%3*.026));
    }
  }
}

function roadSurface(m,node,near,far,left,right,y,tint,print=false){
  const p=(f,r)=>{const [x,z]=roadPoint(node,f,r);return [x,y,z];};
  m.quad(p(near,left),p(near,right),p(far,right),p(far,left),color(tint),0,print);
}

function postSign(m,node,distance,kind){
  const [x,z]=roadPoint(node,distance,5.15);
  const facing=roadPoint(node,distance-.055,5.15);
  const p=(dx,y)=>[facing[0]-node.dz*dx,y,facing[1]+node.dx*dx];
  m.box(x,.13,z,.061,2.3,.061,'#778386');
  if(kind==='stop'){
    for(const [radius,ink] of [[.438,'#fff7e9'],[.382,'#b72e34']])for(let i=0;i<8;i++){
      const a=(i+.5)*Math.PI/4,b=a+Math.PI/4,step=radius<.4?.004:0;
      const face=(tx,y)=>{const pt=p(tx,y);return [pt[0]-node.dx*step,pt[1],pt[2]-node.dz*step];};
      m.triangle(face(0,2.28),face(Math.cos(a)*radius,2.28+Math.sin(a)*radius),
        face(Math.cos(b)*radius,2.28+Math.sin(b)*radius),color(ink));
    }
    const text=(dx,y)=>{const t=p(dx,y);return [t[0]-node.dx*.009,t[1],t[2]-node.dz*.009];};
    m.quad(text(-.32,2.15),text(.32,2.15),text(.32,2.41),text(-.32,2.41),color('#fff'),0,true);
  }else{
    m.triangle(p(-.45,2.61),p(.45,2.61),p(0,1.84),color('#f0e9de'));
    const inset=(dx,y,layer)=>{const pt=p(dx,y);return [pt[0]-node.dx*layer,pt[1],pt[2]-node.dz*layer];};
    m.triangle(inset(-.394,2.578,.004),inset(.394,2.578,.004),inset(0,1.93,.004),color('#bf3035'));
    m.triangle(inset(-.284,2.511,.008),inset(.284,2.511,.008),inset(0,2.055,.008),color('#fff8e8'));
  }
}

function parkingSign(m,spot){
  const [x,z]=roadPoint(spot,2.4,PARKING.end+.16);
  m.box(x,.07,z,.058,2.25,.058,'#697780');
  const p=(dx,y)=>[x-spot.dz*dx-spot.dx*.05,y,z+spot.dx*dx-spot.dz*.05];
  m.quad(p(-.31,1.91),p(.31,1.91),p(.31,2.53),p(-.31,2.53),color('#e7eff1'));
  const panel=(dx,y)=>{const t=p(dx,y);return [t[0]-spot.dx*.006,t[1],t[2]-spot.dz*.006];};
  m.quad(panel(-.275,1.945),panel(.275,1.945),panel(.275,2.495),panel(-.275,2.495),color('#2864a0'));
  const letter=(a,b,c,d)=>{
    const q=(dx,y)=>{const t=panel(dx,y);return [t[0]-spot.dx*.006,t[1],t[2]-spot.dz*.006];};
    m.quad(q(a,b),q(c,b),q(c,d),q(a,d),color('#fff'));
  };
  letter(-.13,2.03,-.054,2.41);letter(-.065,2.34,.11,2.41);
  letter(.065,2.22,.135,2.36);letter(-.065,2.19,.09,2.26);
}

function buildDistrict(){
  const m=mesh(),{box,ground}=m;
  hills(m);
  ground(-108,-108,108,108,-.15,'#8b9b72',.10);
  for(const rect of ROADS)ground(...rect,0,'#575955',.08,1);
  for(let i=0;i<72;i++){
    const a=i*Math.PI/36,b=(i+1)*Math.PI/36;
    const p=(angle,r,y)=>[Math.cos(angle)*r,y,Math.sin(angle)*r];
    const [left,right]=[a,b].map(angle=>p(angle,ROUND.outer,.005));
    const uv=([x,,z])=>[x/2.95,z/2.95];
    m.quad(left,right,p(b,ROUND.inner,.005),p(a,ROUND.inner,.005),color('#575955'),.08,uv,1);
    m.triangle([0,.21,0],p(a,ROUND.inner,.21),p(b,ROUND.inner,.21),color('#7f915d'),.12);
    m.quad(p(a,ROUND.inner,0),p(b,ROUND.inner,0),p(b,ROUND.inner,.21),p(a,ROUND.inner,.21),color('#cdbfa9'));
  }
  const paint='#e9e5d8',stone='#cec4b4';
  for(const sx of [-1,1])for(const sz of [-1,1]){
    box(28*sx,-.12,28*sz,39,.25,39,stone,4);
    box(6.5*sx,-.12,30.8*sz,4,.25,33.3,stone,4);
    box(30.8*sx,-.12,6.5*sz,33.3,.25,4,stone,4);
    box(58.1*sx,-.13,28.4*sz,3.18,.26,56.8,stone,4);
    box(27.9*sx,-.13,58.1*sz,55.8,.26,3.18,stone,4);
    for(const [u,v,w,d,h,wall,roof] of [[15,19,8.6,10,4.4,'#dfc49b','#a3624a'],[35,17,13,8,5.1,'#d6c0a0','#a26953'],
      [16,35,10,12,5.0,'#dbd4b6','#a26a4f'],[34,34,12,10,4.3,'#c6ccbb','#97674e'],[68,26,11,13,4.8,'#d9c5ac','#9c604d'],
      [18,64,13,8.8,4.6,'#d6c7a8','#9c684d'],[38,65,13,9.4,4.9,'#c3cbb8','#93614d']]){
      house(m,u*sx,v*sz,w,d,h,wall,roof);
    }
    const landscaping=[[9.7,15],[16.5,8],[25,11.4],[39,10.8],[8.7,31],[11,41],[27,41],[43,24],[60,34],[28,59.9]];
    for(const [i,[x,z]] of landscaping.entries())tree(m,x*sx,z*sz,.70+i%3*.13);
    for(const [x,z] of [[5.35,19],[17,5.35],[5.35,39],[38,5.35],[46.1,21],[23,46.1]])streetlight(m,x*sx,z*sz,-sx);
    for(let offset=17;offset<46;offset+=6.6){
      ground(-.038,offset*sz-.96,.038,offset*sz+.96,.014,paint);
      ground(offset*sx-.96,-.038,offset*sx+.96,.038,.014,paint);
    }
    for(let offset=7.5;offset<46;offset+=6.7){
      ground(offset*sx-1.1,52*sz-.034,offset*sx+1.1,52*sz+.034,.019,paint);
      ground(52*sx-.034,offset*sz-1.1,52*sx+.034,offset*sz+1.1,.019,paint);
    }
  }
  for(const [x,z,size] of [[-.3,2.2,1.25],[-2.6,-1.7,.82],[2.49,-2.03,1.0]])tree(m,x,z,size);
  for(const stop of CITY_STOPS){
    roadSurface(m,stop,-STOP_LINE,-STOP_LINE+.27,.06,4.44,.021,paint);
    roadSurface(m,stop,-STOP_LINE-3.2,-STOP_LINE-1.1,.55,3.94,.022,paint,true);
    postSign(m,stop,-STOP_LINE,'stop');
  }
  for(const entry of CITY_ENTRIES){
    for(let r=.15;r<4.2;r+=.72)roadSurface(m,entry,-ROUND.mark,-ROUND.mark+.28,r,r+.43,.021,paint);
    postSign(m,entry,-ROUND.mark,'yield');
  }
  for(const crossing of CITY_CROSSINGS)for(let r=-4.27;r<4.33;r+=.98){
    roadSurface(m,crossing,-1.6,1.6,r,r+.51,.021,paint);
  }
  for(const spot of CITY_PARKING){
    // La plaza está sobre el lado derecho de su calle, con salida directa a la calzada.
    roadSurface(m,spot,-PARKING.length/2,PARKING.length/2,PARKING.start,PARKING.end,.139,'#757b79');
    const edge=PARKING.end-.08;
    for(const [near,far,left,right] of [[-5.48,-5.4,4.51,edge],[5.39,5.48,4.51,edge],[-5.48,5.48,edge-.08,edge]]){
      roadSurface(m,spot,near,far,left,right,.146,'#f3e6ca');
    }
    parkingSign(m,spot);
  }
  return m.vertices;
}

function humanModel(){
  const m=mesh();
  m.box(0,.79,0,.28,.5,.47,'#394f76');
  m.box(0,1.31,0,.13,.12,.14,'#bf896e');
  m.box(.016,1.43,0,.22,.235,.217,'#d1a081');m.box(0,1.62,0,.22,.086,.227,'#4d3930');
  for(const side of [-1,1]){
    m.box(side*.071,.32,side*.122,.153,.50,.16,'#334758');
    m.box(side*.16,.045,side*.122,.26,.274,.15,'#334758');
    m.box(side*.22,.03,side*.122,.27,.092,.175,'#2c333b');
    m.box(side*.067,.78,side*.262,.136,.43,.126,'#435e89');
    m.box(side*.093,.71,side*.28,.109,.114,.102,'#c99578');
  }
  return m.vertices;
}

function buildStreet(){
  const m=mesh(),{box,ground,quad}=m;
  hills(m);
  ground(-112,-110,112,110,-.13,'#88996d',.11);
  ground(-108,-6,108,6,0,'#5c5c5b',.095,1);
  const half=JUNCTION.roadHalfWidth;
  ground(-half,-106,half,-6,0,'#565754',.095,1);
  ground(-half,6,half,106,0,'#565754',.095,1);
  const curb='#d4cbbb';
  for(const side of [-1,1]){
    for(const z of [-53,53])box(side*(half+.83),-.08,z,1.66,.21,94,curb,4);
    for(const x of [-52,52])box(x,-.08,side*6.86,95,.21,1.72,curb,4);
    for(const z of [-53,53])box(side*(half+.043),.125,z,.075,.016,94,'#e2d4bd');
    for(const x of [-52,52])box(x,.125,side*6.043,95,.016,.075,'#e2d4bd');
    for(let z=14;z<96;z+=9){
      ground(-.05,side*z-1.46,.05,side*z+1.46,.013,'#f3eddf');
    }
    for(let x=9;x<99;x+=9){
      ground(side*x-1.48,-.055,side*x+1.48,.055,.014,'#f3eddf');
    }
  }
  // Espacio de estacionamiento fuera de la trayectoria del cruce.
  ground(-14.4,6.01,-6.45,9.69,.153,'#656662',.16,1);
  ground(-14.4,9.63,-6.45,9.67,.16,'#ddd9c9');
  ground(-6.49,6.07,-6.45,9.67,.16,'#ddd9c9');
  vehicle(m,PARKED_VAN.x,PARKED_VAN.z,true);

  for(const z of [7.1,13.4,24,37]){
    drain(m,4.27,z);drain(m,-4.27,-z);
  }

  ground(.08,JUNCTION.stopLine,4.43,JUNCTION.stopLine+.37,.017,'#fff8e9',.038);
  quad([.68,.019,14.27],[3.82,.019,14.27],[3.82,.019,11.94],[.68,.019,11.94],color('#fff8e9'),.024,true);
  box(5.24,.13,10.61,.067,2.35,.065,'#6f7b81');
  octagon(m,5.24,2.29,10.613,.45,'#8f292d');
  octagon(m,5.24,2.29,10.652,.439,'#f9f4e8');
  octagon(m,5.24,2.29,10.657,.396,'#bf2f36');
  quad([4.92,2.16,10.661],[5.56,2.16,10.661],[5.56,2.42,10.661],[4.92,2.42,10.661],color('#fff9ec'),0,true);

  const buildings=[
    [-12.1,19.1,8.0,10.4,4.1,'#dfc5a3','#a3614c'],[11.6,18.7,7.4,9.3,4.5,'#ded6ba','#a9755b'],
    [-12.4,-14.7,9.1,8.8,4.5,'#e5c8a1','#a55d49'],[12.1,-15.8,9.3,9.7,4.9,'#e5d6b6','#aa6e56'],
    [-24.0,-14.1,9.7,9.8,4.0,'#b8c4b4','#846d66'],[23.7,-13.9,9.2,8.3,4.1,'#d9b493','#a37762'],
    [-24.0,13.9,9.8,6.2,3.9,'#d6ab8b','#92594a'],[24.0,13.7,9.4,6.8,4.2,'#e2caa7','#9e634e'],
    [-12.4,34,9.7,10.2,4.7,'#d8bc98','#916950'],[12.3,35,8.8,11.0,4.3,'#c9cbb6','#87766b'],
    [-13.0,-31,9.8,9.6,4.4,'#cbbd9c','#796c64'],[12.3,-33,8.8,10.0,5.0,'#dec5a9','#9c674f'],
    [-42,-13,13,8,5.8,'#d7bd9e','#996451'],[40,-14,13,9,5.6,'#cbb8a0','#826454']
  ];
  for(const params of buildings)house(m,...params);
  box(6.68,-.11,21.2,.32,.64,8.2,'#b5a78f');
  box(6.68,.52,21.2,.41,.075,8.22,'#dfceb2');
  box(6.68,1.21,21.2,.061,.05,8.06,'#424d47');
  for(let z=17.2;z<25.34;z+=.31)box(6.68,.59,z,.034,.65,.034,'#49544d');
  for(const z of [17.15,19.9,22.48,25.3]){
    box(6.68,-.11,z,.43,1.39,.43,'#baa98f');
    box(6.68,1.26,z,.5,.065,.5,'#deceb3');
  }
  for(const [x,z,size] of [[-6.6,12.8,.77],[6.45,13.2,.82],[-6.45,-9,.9],[6.6,-10.1,.88],[-18.4,-9.35,1.14],
    [18.35,-9.25,1],[-31,-9.7,.95],[32,-9.6,1.1],[-6.6,27.7,.92],[6.65,26.8,1],[-7,-23,1],[6.8,-24,1.12],
    [-16.1,8.1,.79],[16.5,8.2,.78],[-43,8.3,1.14],[43.5,8.25,1.06]])tree(m,x,z,size);
  for(const [x,z] of [[-8.8,15.4],[8.1,15.1],[-8.5,-10.2],[8.6,-10.1],[-18.6,-10.4],[19,-8.5],
    [-7.1,27.9],[8.1,25.2],[-10,26],[8.2,30.3],[-7.5,21],[7.5,21.3]]){
    m.foliage(x,.24,z,.57,'#697d47');
    m.foliage(x-.28,.26,z-.12,.34,'#849553');
    m.foliage(x+.32,.16,z+.16,.31,'#879d5c');
  }
  for(const [x,z,d] of [[-5.7,13.1,1],[5.8,24.4,-1],[5.75,-8.38,-1],[-22,-6.8,1],[21,7.21,-1],[-5.75,-25,1]])streetlight(m,x,z,d);
  return m.vertices;
}

function makeProgram(gl,vertexShader,fragmentShader){
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertexShader],[gl.FRAGMENT_SHADER,fragmentShader]]){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const message=gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);gl.deleteProgram(program);throw new Error(message);
    }
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    const message=gl.getProgramInfoLog(program);
    gl.deleteProgram(program);throw new Error(message);
  }
  return program;
}

function loadMaterials(gl,onReady){
  const image=new Image();
  const textures=Array.from({length:4},(_,i)=>{
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    return texture;
  });
  image.onload=()=>{
    const tile=document.createElement('canvas');tile.width=256;tile.height=256;
    const ctx=tile.getContext('2d');ctx.imageSmoothingQuality='high';
    const edge=image.naturalWidth/2,anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    for(const [i,texture] of textures.entries()){
      ctx.drawImage(image,i%2*edge+2,Math.floor(i/2)*edge+2,edge-4,edge-4,0,0,256,256);
      gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tile);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(3,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    onReady();
  };
  image.src=new URL('./driving-materials.jpg',import.meta.url).href;
  return ()=>{image.onload=null;for(const texture of textures)gl.deleteTexture(texture);};
}

// El sol y los edificios son fijos, así que este mapa se calcula una sola vez.
function makeShadow(gl,street){
  const material=makeProgram(gl,shadowVertex,shadowFragment);
  const texture=gl.createTexture(),target=gl.createFramebuffer(),depth=gl.createRenderbuffer();
  gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,SHADOW_SIZE,SHADOW_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,SHADOW_SIZE,SHADOW_SIZE);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  const ready=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  if(ready){
    gl.useProgram(material);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
    gl.viewport(0,0,SHADOW_SIZE,SHADOW_SIZE);
    gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER,street.buffer);
    const position=gl.getAttribLocation(material,'aPosition');
    gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,VERTEX_SIZE*4,0);
    gl.drawArrays(gl.TRIANGLES,0,street.count);gl.disableVertexAttribArray(position);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
  gl.deleteFramebuffer(target);gl.deleteRenderbuffer(depth);gl.deleteProgram(material);
  return {ready,texture};
}

function makePrint(gl){
  const ink=document.createElement('canvas');ink.width=256;ink.height=128;
  const ctx=ink.getContext('2d');
  ctx.font='900 92px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#fff';ctx.fillText('STOP',128,64,248);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ink);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
    Math.min(4,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

export function createStreetRenderer(canvas,materialReady,district=false){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,powerPreference:'high-performance'});
  if(!gl)return null;
  const program=makeProgram(gl,vertexSource,fragmentSource);
  function upload(points){
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
    return {buffer,count:points.length/VERTEX_SIZE};
  }
  const street=upload(district?buildDistrict():buildStreet());
  const shadow=makeShadow(gl,street);
  gl.useProgram(program);gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0,0,0,0);
  const attributes=[['aPosition',3,0],['aColor',3,3],['aUV',2,6],['aGrain',1,8],['aMaterial',1,9]].map(
    ([name,size,offset])=>[gl.getAttribLocation(program,name),size,offset]);
  for(const [attribute] of attributes)gl.enableVertexAttribArray(attribute);
  const uniform=name=>gl.getUniformLocation(program,name);
  const eye=uniform('uEye'),heading=uniform('uHeading'),projection=uniform('uProjection'),placement=uniform('uPlacement');
  const stride=uniform('uStride');
  gl.uniform3fv(uniform('uHaze'),SKY);
  for(const [unit,name] of ['uPrint','uAsphalt','uStucco','uRoof','uPaving','uShadow'].entries())gl.uniform1i(uniform(name),unit);
  gl.uniform1i(uniform('uShadows'),Number(shadow.ready));
  const textured=uniform('uTextured');
  gl.activeTexture(gl.TEXTURE0);
  const ink=makePrint(gl);
  const disposeMaterials=loadMaterials(gl,()=>{gl.uniform1i(textured,1);materialReady?.();});
  const cars=['#d68a42','#507d95'].map(paint=>{
    const model=mesh();vehicle(model,0,0,false,paint);return upload(model.vertices);
  });
  const human=district?upload(humanModel()):null;
  function draw(object,x=0,z=0,angle=0,step=0){
    gl.bindBuffer(gl.ARRAY_BUFFER,object.buffer);
    for(const [attribute,size,start] of attributes)gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,VERTEX_SIZE*4,start*4);
    gl.uniform4f(placement,x,z,Math.cos(angle),Math.sin(angle));gl.uniform1f(stride,step);gl.drawArrays(gl.TRIANGLES,0,object.count);
  }
  return {
    resize(width,height){
      if(!width||!height)return;
      const ratio=Math.min(window.devicePixelRatio||1,1.35,Math.sqrt(1100000/(width*height)));
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      gl.viewport(0,0,canvas.width,canvas.height);
      const aspect=canvas.width/canvas.height;
      const focal=Math.min(2.5,aspect*1.92);
      gl.uniform2f(projection,focal/aspect,focal);
    },
    draw(frame,look=frame.look){
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(eye,driverEye(frame));
      gl.uniform2f(heading,Math.cos(frame.yaw+look),Math.sin(frame.yaw+look));
      draw(street);
      for(const car of frame.traffic){
        if(!district&&Math.abs(car.x)>=78)continue;
        const angle=district?Math.PI/2-car.yaw:car.direction===1?0:Math.PI;
        draw(cars[district?car.model:car.direction===1?0:1],car.x,car.z,angle);
      }
      if(human)for(const person of frame.pedestrians){
        if(!person.present||person.state==='clear')continue;
        const step=person.state==='walking'?Math.sin(person.progress*Math.PI*2/.92)*.17:0;
        draw(human,person.walkX,person.walkZ,Math.atan2(person.dx*person.side,person.dz*person.side),step);
      }
    },
    dispose(){
      gl.deleteBuffer(street.buffer);
      for(const car of cars)gl.deleteBuffer(car.buffer);
      if(human)gl.deleteBuffer(human.buffer);
      disposeMaterials();gl.deleteTexture(shadow.texture);gl.deleteTexture(ink);gl.deleteProgram(program);
    }
  };
}
