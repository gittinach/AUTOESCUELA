export const JUNCTION={
  laneX:1.85,roadHalfWidth:4.5,stopLine:10.5,crossEdge:6,
  trafficZ:2.75,trafficStart:-48,trafficEnd:66,trafficSpeed:5.5,
  carHalfLength:2.05,carHalfWidth:.87
};

const SKY=[.69,.8,.82];
const vertexSource=`
  attribute vec3 aPosition;
  attribute vec3 aColor;
  attribute vec2 aUV;
  attribute float aGrain;
  uniform vec3 uEye;
  uniform vec2 uHeading;
  uniform vec2 uProjection;
  uniform float uOffset;
  varying vec3 vColor;
  varying vec2 vUV;
  varying vec2 vGround;
  varying float vGrain;
  varying float vDepth;
  void main(){
    vec3 p=aPosition+vec3(uOffset,0.,0.)-uEye;
    float side=dot(p.xz,uHeading);
    float front=dot(p.xz,vec2(uHeading.y,-uHeading.x));
    float depth=front*.997-p.y*.078;
    float up=p.y*.997+front*.078;
    gl_Position=vec4(side*uProjection.x,up*uProjection.y,depth*1.0016-.20,depth);
    vColor=aColor; vUV=aUV; vGround=aPosition.xz; vGrain=aGrain; vDepth=depth;
  }
`;
const fragmentSource=`
  precision mediump float;
  uniform vec3 uHaze;
  uniform sampler2D uPrint;
  varying vec3 vColor;
  varying vec2 vUV;
  varying vec2 vGround;
  varying float vGrain;
  varying float vDepth;
  void main(){
    vec3 color=vColor;
    if(vUV.x>=0.){
      float ink=texture2D(uPrint,vUV).a;
      if(ink<.45)discard;
    }
    float nearGrain=1.-smoothstep(7.,31.,vDepth);
    vec2 tile=mod(floor(vGround*36.),vec2(97.,89.));
    float grain=fract(sin(dot(tile,vec2(12.9898,57.233)))*4375.3545);
    color+=(grain-.5)*vGrain*nearGrain;
    gl_FragColor=vec4(mix(color,uHaze,smoothstep(27.,105.,vDepth)*.84),1.);
  }
`;

function color(hex,shade=1){
  const value=parseInt(hex.slice(1),16);
  return [value>>16,(value>>8)&255,value&255].map(channel=>channel*shade/255);
}

function mesh(){
  const vertices=[];
  function triangle(a,b,c,tint,grain=0,uv){
    [a,b,c].forEach((p,i)=>vertices.push(...p,...tint,...(uv?.[i]||[-1,-1]),grain));
  }
  function quad(a,b,c,d,tint,grain=0,print=false){
    triangle(a,b,c,tint,grain,print?[[0,0],[1,0],[1,1]]:null);
    triangle(a,c,d,tint,grain,print?[[0,0],[1,1],[0,1]]:null);
  }
  function ground(x1,z1,x2,z2,y,hex,grain=0,print=false){
    quad([x1,y,z1],[x2,y,z1],[x2,y,z2],[x1,y,z2],color(hex),grain,print);
  }
  function box(x,y,z,w,h,d,hex){
    const l=x-w/2,r=x+w/2,n=z-d/2,f=z+d/2,t=y+h;
    quad([l,t,n],[r,t,n],[r,t,f],[l,t,f],color(hex,1.025));
    quad([l,y,f],[r,y,f],[r,t,f],[l,t,f],color(hex,.94));
    quad([r,y,n],[l,y,n],[l,t,n],[r,t,n],color(hex,.73));
    quad([l,y,n],[l,y,f],[l,t,f],[l,t,n],color(hex,.79));
    quad([r,y,f],[r,y,n],[r,t,n],[r,t,f],color(hex,.88));
  }
  function foliage(x,y,z,r,hex){
    const a=[x-r,y,z],b=[x,y,z-r],c=[x+r,y,z],d=[x,y,z+r];
    const top=[x,y+r*.95,z],bottom=[x,y-r*.73,z];
    for(const [p,q,shade] of [[a,b,.86],[b,c,.89],[c,d,1.04],[d,a,1.12]]){
      triangle(p,q,top,color(hex,shade));triangle(q,p,bottom,color(hex,shade*.8));
    }
  }
  return {vertices,triangle,quad,ground,box,foliage};
}

function house(m,x,z,w,d,h,wall,roof){
  const {box,quad,triangle}=m;
  const l=x-w/2-.23,r=x+w/2+.23,n=z-d/2-.25,f=z+d/2+.25,ridge=h+1.2;
  box(x,.1,z,w,h-.1,d,wall);
  box(x,.14,z+.01,w+.03,.33,d+.03,'#9b8f7c');
  quad([l,h,n],[r,h,n],[r,ridge,z],[l,ridge,z],color(roof,.83));
  quad([l,ridge,z],[r,ridge,z],[r,h,f],[l,h,f],color(roof));
  triangle([l,h,n],[l,ridge,z],[l,h,f],color(wall,.81));
  triangle([r,h,f],[r,ridge,z],[r,h,n],color(wall,.92));
  box(x,ridge-.018,z,w+.5,.09,.14,'#be7555');
  for(let i=1;i<7;i++){
    const ratio=i/7,y=ridge-ratio*1.2+.009;
    for(const direction of [-1,1]){
      const edge=z+direction*ratio*(d/2+.25);
      box(x,y,edge,w+.35,.025,.035,roof);
    }
  }
  box(x+w*.2,h+.53,z-.38,.36,.91,.37,'#c18063');
  box(x+w*.2,h+1.44,z-.38,.45,.085,.46,'#8b5849');
  for(const face of [-1,1]){
    const facade=z+face*(d/2+.035);
    for(let off=-w/2+1.3;off<w/2-1;off+=2.25){
      box(x+off,h-.96,facade,.97,1.04,.10,'#ebe0c7');
      box(x+off,h-.85,facade+face*.058,.73,.82,.029,'#34566a');
      box(x+off,h-.71,facade+face*.08,.55,.54,.013,'#52808b');
      box(x+off,h-.87,facade+face*.09,.065,.87,.025,'#e1d8c4');
      box(x+off,h-.91,facade+face*.12,1.07,.075,.18,'#b4a18e');
    }
    box(x+w/5,.22,facade,1.12,2.17,.13,'#666558');
    box(x+w/5,.25,facade+face*.08,.86,1.88,.045,'#37615a');
  }
  for(const face of [-1,1]){
    const facade=x+face*(w/2+.055);
    for(let off=-d/2+1.18;off<d/2-.85;off+=2.1){
      box(facade,h-1.65,z+off,.13,1.04,.95,'#e5d6bb');
      box(facade+face*.07,h-1.53,z+off,.035,.79,.72,'#416979');
      box(facade+face*.09,h-1.57,z+off,.025,.87,.066,'#d8cfb9');
    }
  }
}

function tree(m,x,z,size){
  m.ground(x-.2,z-.14,x+1.35*size,z+.72*size,.132,'#7c8469');
  m.box(x,.12,z,.18*size,1.66*size,.18*size,'#78644a');
  m.foliage(x,2.12*size,z,.87*size,'#587e54');
  m.foliage(x-.48*size,1.97*size,z+.15*size,.62*size,'#719962');
  m.foliage(x+.46*size,2.08*size,z-.17*size,.67*size,'#4b7854');
  m.foliage(x,2.6*size,z-.08*size,.62*size,'#769d65');
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

// Los dos vehículos se construyen mirando hacia la derecha del cruce.
function vehicle(m,x,z,van){
  const {box,ground,quad}=m;
  const length=van?5.3:4.22,half=length/2;
  const width=van?2.25:1.79,body=van?'#e7e6dc':'#e89b4a';
  ground(x-half+.14,z-width/2-.17,x+half+.3,z+width/2+.28,.019,'#333c43');
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
  box(x,.37,z,length,van?.74:.55,width-.08,body);
  box(x,.36,z,length-.06,.14,width-.06,'#49545b');
  if(van){
    box(x-.66,1.095,z,3.84,1.24,width-.11,body);
    box(x-.72,1.13,z,3.18,.055,width-.046,'#aab6b7');
    box(x-.53,1.17,z,2.75,.94,width-.072,'#dedfd7');
  }
  const f=x+(van?1.95:.97),r=x-(van?-.63:1.2),top=van?2.19:1.52,base=van?1.09:.91;
  const topFront=f-.39,topBack=r+.34,side=width*.47,inner=side-.16;
  quad([f,base,z-side],[f,base,z+side],[topFront,top,z+inner],[topFront,top,z-inner],color('#6a8b99'));
  quad([r,base,z+side],[r,base,z-side],[topBack,top,z-inner],[topBack,top,z+inner],color('#466575'));
  for(const s of [-1,1]){
    quad([r,base,z+s*side],[f,base,z+s*side],[topFront,top,z+s*inner],[topBack,top,z+s*inner],color('#436376',s===1?1.13:.94));
    box(x+(van?1.44:.04),base,z+s*(side-.065),.08,top-base-.05,.15,body);
    box(x+half-.08,base,z+s*(width/2+.065),.22,.11,.17,body);
    box(x+half+.008,.68,z+s*width*.31,.023,.14,.38,'#fff0cc');
    box(x-half-.008,.66,z+s*width*.37,.022,van?.27:.14,.19,'#b94742');
  }
  box((topFront+topBack)/2,top-.014,z,topFront-topBack+.10,.08,inner*2+.11,body);
  box(x+half+.012,.51,z,.028,.104,.39,'#e9ece7');
  box(x-half-.012,.51,z,.028,.104,.39,'#e9ece7');
}

function buildStreet(){
  const m=mesh(),{box,ground,quad}=m;
  ground(-112,-110,112,110,-.13,'#8a9b72',.16);
  ground(-108,-6,108,6,0,'#5c6267',.095);
  const half=JUNCTION.roadHalfWidth;
  ground(-half,-106,half,-6,0,'#555d64',.095);
  ground(-half,6,half,106,0,'#555d64',.095);
  const curb='#cec5b4';
  for(const side of [-1,1]){
    for(const z of [-53,53])box(side*(half+.83),-.08,z,1.66,.21,94,curb);
    for(const x of [-52,52])box(x,-.08,side*6.86,95,.21,1.72,curb);
    for(let i=8;i<53;i+=1.25){
      ground(side*(half+.04)-.01,side*i-.008,side*(half+1.6)+.01,side*i+.009,.132,'#aba597');
      ground(side*i-.008,5.99,side*i+.009,7.65,.132,'#aba597');
      ground(side*i-.008,-7.65,side*i+.009,-5.99,.132,'#aba597');
    }
    for(let z=14;z<96;z+=9){
      ground(-.05,side*z-1.46,.05,side*z+1.46,.013,'#f3eddf');
    }
    for(let x=9;x<99;x+=9){
      ground(side*x-1.48,-.055,side*x+1.48,.055,.014,'#f3eddf');
    }
  }
  // Espacio de estacionamiento fuera de la trayectoria del cruce.
  ground(-14.4,6.01,-6.45,9.22,.153,'#707573',.16);
  ground(-14.4,9.17,-6.45,9.21,.16,'#ddd9c9');
  ground(-6.49,6.07,-6.45,9.21,.16,'#ddd9c9');
  vehicle(m,-9.18,7.63,true);

  ground(.08,JUNCTION.stopLine,4.43,JUNCTION.stopLine+.37,.017,'#fff8e9');
  quad([.67,.018,14.12],[3.82,.018,14.12],[3.82,.018,12.10],[.67,.018,12.10],color('#fff8e9'),0,true);
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
  for(const [x,z,size] of [[-6.6,12.8,.77],[6.45,13.2,.82],[-6.45,-9,.9],[6.6,-10.1,.88],[-18.4,-9.35,1.14],
    [18.35,-9.25,1],[-31,-9.7,.95],[32,-9.6,1.1],[-6.6,27.7,.92],[6.65,26.8,1],[-7,-23,1],[6.8,-24,1.12],
    [-16.1,8.1,.79],[16.5,8.2,.78],[-43,8.3,1.14],[43.5,8.25,1.06]])tree(m,x,z,size);
  for(const [x,z,d] of [[-5.7,13.1,1],[5.8,24.4,-1],[5.75,-8.38,-1],[-22,-6.8,1],[21,7.21,-1],[-5.75,-25,1]])streetlight(m,x,z,d);
  return m.vertices;
}

function makeProgram(gl){
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
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

function makePrint(gl){
  const ink=document.createElement('canvas');ink.width=256;ink.height=128;
  const ctx=ink.getContext('2d');
  ctx.font='900 92px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#fff';ctx.fillText('STOP',128,64,248);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ink);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

export function createStreetRenderer(canvas){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,powerPreference:'high-performance'});
  if(!gl)return null;
  const program=makeProgram(gl);
  gl.useProgram(program);gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,0);
  const attributes=[['aPosition',3,0],['aColor',3,3],['aUV',2,6],['aGrain',1,8]].map(
    ([name,size,offset])=>[gl.getAttribLocation(program,name),size,offset]);
  for(const [attribute] of attributes)gl.enableVertexAttribArray(attribute);
  const uniform=name=>gl.getUniformLocation(program,name);
  const eye=uniform('uEye'),heading=uniform('uHeading'),projection=uniform('uProjection'),offset=uniform('uOffset');
  gl.uniform3fv(uniform('uHaze'),SKY);
  const ink=makePrint(gl);
  function upload(points){
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
    return {buffer,count:points.length/9};
  }
  const street=upload(buildStreet()),traffic=mesh();
  vehicle(traffic,0,JUNCTION.trafficZ,false);
  const orange=upload(traffic.vertices);
  function draw(object,shift){
    gl.bindBuffer(gl.ARRAY_BUFFER,object.buffer);
    for(const [attribute,size,start] of attributes)gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,36,start*4);
    gl.uniform1f(offset,shift);gl.drawArrays(gl.TRIANGLES,0,object.count);
  }
  return {
    resize(width,height){
      if(!width||!height)return;
      const ratio=Math.min(window.devicePixelRatio||1,1.35,Math.sqrt(1100000/(width*height)));
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      gl.viewport(0,0,canvas.width,canvas.height);
      const aspect=canvas.width/canvas.height;
      const focal=Math.min(2.22,aspect*2.03);
      gl.uniform2f(projection,focal/aspect,focal);
    },
    draw(x,z,yaw,look,trafficX){
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform3f(eye,x-.29*Math.cos(yaw)+.46*Math.sin(yaw),1.35,z-.29*Math.sin(yaw)-.46*Math.cos(yaw));
      gl.uniform2f(heading,Math.cos(yaw+look),Math.sin(yaw+look));
      draw(street,0);draw(orange,trafficX);
    },
    dispose(){
      gl.deleteBuffer(street.buffer);gl.deleteBuffer(orange.buffer);gl.deleteTexture(ink);gl.deleteProgram(program);
    }
  };
}
