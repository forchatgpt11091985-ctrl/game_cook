import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Original procedural assets: all textures and geometry are bundled, no remote requests.
let seed = 71;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }
const textures = new Map<string, T.CanvasTexture>();
function texture(kind: string) {
  if (textures.has(kind)) return textures.get(kind)!;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = kind === 'paving' ? '#8d8171' : '#eeeae2'; x.fillRect(0, 0, 512, 512);
  if (kind === 'paving') {
    for (let row = -1; row < 10; row++) for (let col = -1; col < 9; col++) {
      const v = 160 + Math.floor(random() * 40);
      x.fillStyle = `rgb(${v+16},${v+5},${v-12})`;
      x.beginPath(); x.roundRect(col * 66 + (row % 2) * 33 + 3, row * 54 + 3, 60 + random()*2, 48, 7); x.fill();
      x.strokeStyle = '#f7e6c833'; x.lineWidth=2; x.stroke();
    }
  }
  for (let i = 0; i < 16000; i++) {
    x.fillStyle = random() > .5 ? '#ffffff12' : '#3b241515';
    x.fillRect(random()*512,random()*512,kind === 'wood' ? 1 : 2,kind === 'wood' ? 12+random()*60 : 2);
  }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(kind === 'paving' ? 4 : 1, kind === 'paving' ? 4 : 1);
  tex.anisotropy = 8; textures.set(kind,tex); return tex;
}
const mats = new Map<string,T.MeshStandardMaterial>();
export function surface(color: number, kind = 'plaster') {
  const key = `${color}/${kind}`; if (mats.has(key)) return mats.get(key)!;
  const map = texture(kind);
  const m = new T.MeshStandardMaterial({color, map, bumpMap: map, bumpScale: kind === 'paving' ? .065 : .025, roughness: .88});
  mats.set(key,m); return m;
}
export function solid(color: number, roughness=.8) { const key=`${color}/${roughness}`; if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,roughness}));return mats.get(key)!; }
export function piece(parent:T.Object3D, geometry:T.BufferGeometry, material:T.Material, x=0,y=0,z=0) {
  const mesh = new T.Mesh(geometry, material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function box(parent:T.Object3D,w:number,h:number,d:number,color:number,x=0,y=0,z=0,r=.035) {
  return piece(parent,new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/3,h/3,d/3)),solid(color),x,y,z);
}
function sphere(parent:T.Object3D,r:number,color:number,x:number,y:number,z:number,sx=1,sy=1,sz=1) {
  const m=piece(parent,new T.SphereGeometry(r,r<.2?8:16,r<.2?6:10),solid(color),x,y,z);m.scale.set(sx,sy,sz);return m;
}
function tube(parent:T.Object3D,points:T.Vector3[],r:number,color:number) {
  return piece(parent,new T.TubeGeometry(new T.CatmullRomCurve3(points),24,r,6,false),solid(color));
}
function archShape(w:number,h:number) {
  const s = new T.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h-w/2);
  s.absarc(0,h-w/2,w/2,0,Math.PI,false);s.lineTo(-w/2,0);return s;
}
export function terracottaPot(parent:T.Object3D,x:number,y:number,z:number,scale=1,flowers=false) {
  const g=new T.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
  piece(g,new T.CylinderGeometry(.24,.16,.42,16),surface(0xcc7f52),0,.21,0);
  piece(g,new T.TorusGeometry(.24,.035,6,20),solid(0xe5aa79),0,.4,0).rotation.x=Math.PI/2;
  for(let i=0;i<9;i++) {
    const a=i*2.4,rr=.1+random()*.18;
    const leaf=sphere(g,.16,flowers?0x68804a:0x426b35,Math.cos(a)*rr,.48+random()*.26,Math.sin(a)*rr,.5,1.5,.35);leaf.rotation.z=Math.sin(a)*.6;
    if(flowers)sphere(g,.075,[0xba5b83,0xdda0a8,0xf1d7ba][i%3],Math.cos(a)*rr,.7+random()*.16,Math.sin(a)*rr);
  }
  return g;
}
function lantern(parent:T.Object3D,x:number,y:number,z:number) {
  box(parent,.05,.5,.06,0x4c4836,x,y+.08,z);
  box(parent,.2,.29,.16,0x494a34,x,y,z+.15);
  piece(parent,new T.BoxGeometry(.13,.2,.17),new T.MeshStandardMaterial({color:0xffd49b,emissive:0xffa13d,emissiveIntensity:1.2}),x,y,z+.16);
  piece(parent,new T.ConeGeometry(.19,.13,4),solid(0x494a34),x,y+.2,z+.15).rotation.y=Math.PI/4;
}
export function detailedHouse(w:number,h:number,d:number,color:number) {
  const g=new T.Group(), wall=surface(color), wood=surface(0x63745c,'wood'), stone=surface(0xe9cfaa);
  piece(g,new T.BoxGeometry(.22,h,d),wall,-w/2,h/2,0);piece(g,new T.BoxGeometry(.22,h,d),wall,w/2,h/2,0);
  piece(g,new T.BoxGeometry(w,h,.22),wall,0,h/2,-d/2);
  const facade = new T.Shape();facade.moveTo(-w/2,0);facade.lineTo(w/2,0);facade.lineTo(w/2,h);facade.lineTo(-w/2,h);facade.closePath();
  const entrance = archShape(w>=6?1.9:1.1,w>=6?2.6:2.1);
  const hole=new T.Path(entrance.getPoints(24));facade.holes.push(hole);
  piece(g,new T.ExtrudeGeometry(facade,{depth:.22,bevelEnabled:false,curveSegments:20}),wall,0,0,d/2-.1);
  const aw=w>=6?1.9:1.1,ah=w>=6?2.6:2.1;
  for(let i=0;i<13;i++) {
    const a=i*Math.PI/12;
    const b=box(g,.26,.23,.33,0xdfc5a1,Math.cos(a)*(aw/2+.09),ah-aw/2+Math.sin(a)*(aw/2+.1),d/2+.07);b.rotation.z=a-Math.PI/2;
  }
  for(const side of [-1,1])for(let y=.15;y<ah-aw/2;y+=.28)piece(g,new T.BoxGeometry(.23,.25,.3),stone,side*(aw/2+.1),y,d/2+.07);
  if(w<6) {
    piece(g,new T.ShapeGeometry(archShape(aw,ah),20),surface(0x755440,'wood'),0,0,d/2-.04);
    for(let i=-2;i<=2;i++)box(g,.012,1.65,.012,0x523f32,i*.18,.83,d/2+.005,.004);
    sphere(g,.055,0xc4a45c,.33,.95,d/2+.04);
  } else {
    const interior = new T.Mesh(new T.PlaneGeometry(w-.2,h-.2),solid(0x70513d));interior.position.set(0,h/2,-d/2+.2);g.add(interior);
    const oven = detailedOven();oven.scale.setScalar(.85);oven.position.set(.1,0,d/2-1.8);g.add(oven);
    const signCanvas=document.createElement('canvas');signCanvas.width=768;signCanvas.height=192;
    const signContext=signCanvas.getContext('2d')!;signContext.fillStyle='#f0e4cc';signContext.fillRect(0,0,768,192);
    signContext.strokeStyle='#8f784f';signContext.lineWidth=8;signContext.strokeRect(12,12,744,168);
    signContext.fillStyle='#3e6250';signContext.textAlign='center';signContext.font='bold 68px Georgia';signContext.fillText('PIZZERIA',384,94);
    signContext.font='25px Georgia';signContext.fillText('DI MARCO  ·  CUCINA TOSCANA',384,146);
    const signMap=new T.CanvasTexture(signCanvas);signMap.colorSpace=T.SRGBColorSpace;
    box(g,3.3,.7,.12,0x6d5940,0,3.45,d/2+.15);
    piece(g,new T.PlaneGeometry(3.2,.62),new T.MeshStandardMaterial({map:signMap,roughness:.9}),0,3.45,d/2+.22);
    const glow = new T.PointLight(0xffa24b,5,6,2);glow.position.set(.1,1.3,d/2-1);g.add(glow);
  }
  // Gabled terracotta roof with separate eaves, ridge and rows of curved tiles.
  const roofRise=1.35, slope=Math.atan2(roofRise,w/2+.25), span=Math.hypot(w/2+.3,roofRise);
  const gable=new T.Shape();gable.moveTo(-w/2,0);gable.lineTo(w/2,0);gable.lineTo(0,roofRise);gable.closePath();
  piece(g,new T.ShapeGeometry(gable),wall,0,h,d/2+.01);
  const backGable=piece(g,new T.ShapeGeometry(gable),wall,0,h,-d/2-.01);backGable.rotation.y=Math.PI;
  for(const side of [-1,1]) {
    const roof=piece(g,new T.BoxGeometry(span,.15,d+.7),surface(side<0?0xc17b51:0xb96c43),side*(w/4+.1),h+roofRise/2,0);roof.rotation.z=-side*slope;
  }
  const tiles: T.Matrix4[]=[];const q=new T.Quaternion(),pos=new T.Vector3(),scale=new T.Vector3(1,1,1);
  for(const side of [-1,1])for(let row=0;row<Math.ceil(span/.4);row++)for(let col=0;col<Math.ceil((d+.6)/.32);col++) {
    const distance=(row+.5)*.38;pos.set(side*(distance*Math.cos(slope)),h+roofRise-distance*Math.sin(slope)+.1,-d/2-.2+col*.32);
    q.setFromEuler(new T.Euler(Math.PI/2,0,-side*slope,'ZYX'));tiles.push(new T.Matrix4().compose(pos,q,scale));
  }
  const tileMesh=new T.InstancedMesh(new T.CylinderGeometry(.17,.17,.43,8,1,true,0,Math.PI),surface(0xc88a62),tiles.length);
  tiles.forEach((m,i)=>tileMesh.setMatrixAt(i,m));tileMesh.castShadow=true;g.add(tileMesh);
  box(g,.25,.22,d+.8,0xbd774b,0,h+roofRise+.1,0);
  for(const xx of [-w*.3,w*.3]) {
    const yy=h*.67;piece(g,new T.ShapeGeometry(archShape(.72,1.05),16),solid(0x314f4c),xx,yy-.5,d/2+.025);
    for(const side of [-1,1]) {
      piece(g,new T.BoxGeometry(.3,1.05,.075),wood,xx+side*.5,yy,d/2+.04);
      for(let l=0;l<5;l++)box(g,.31,.025,.11,0x809379,xx+side*.5,yy-.4+l*.18,d/2+.09,.006);
    }
    box(g,1.5,.12,.32,0xe3c79a,xx,yy-.62,d/2+.12);
    const flowerbox=box(g,1.2,.2,.3,0x785b42,xx,yy-.55,d/2+.25);
    for(let i=0;i<7;i++)sphere(flowerbox,.12,i%2?0xb77e9e:0xe5b6ba,-.5+i*.17,.2,.04,1,1.5,1);
  }
  // Stone footing, vines, lanterns and pots give the frontage human scale.
  for(let i=0;i<Math.floor(w/.5);i++)box(g,.46,.28,.28,0xd9c7a5,-w/2+.25+i*.5,.14,d/2+.06);
  lantern(g,-aw/2-.6,1.8,d/2+.2);lantern(g,aw/2+.6,1.8,d/2+.2);
  terracottaPot(g,-w/2+.35,0,d/2+.6,.9,true);terracottaPot(g,w/2-.35,0,d/2+.6,1.2,false);
  const foliage=new T.InstancedMesh(new T.SphereGeometry(.1,6,4),solid(0x617b46),240);
  const sprig=new T.Object3D();
  for(let i=0;i<240;i++) {
    const t=i/240, edge=i%2?-1:1;
    const xx=t<.45?edge*(w/2-.22)+Math.sin(t*20)*.2:(t-.45)/.55*w-w/2;
    const yy=t<.45?t/.45*h:h-.25+Math.sin(t*19)*.22;
    sprig.position.set(xx+(random()-.5)*.45,yy+(random()-.5)*.45,d/2+.2+random()*.12);
    sprig.scale.set(1.3,.7,.3);sprig.rotation.z=random()*6;sprig.updateMatrix();foliage.setMatrixAt(i,sprig.matrix);
    foliage.setColorAt(i,new T.Color([0x5c7746,0x7c945c,0x45683b][i%3]));
  }
  foliage.castShadow=true;g.add(foliage);
  const blooms=new T.InstancedMesh(new T.SphereGeometry(.07,6,4),solid(0xb99bc9),100);
  for(let i=0;i<100;i++) {
    const col=Math.floor(i/10),j=i%10;
    sprig.position.set(-w/2+.3+col*.2,h-.3-j*.09,d/2+.23+Math.sin(j)*.03);
    sprig.scale.setScalar(1-j*.055);sprig.updateMatrix();blooms.setMatrixAt(i,sprig.matrix);
  }
  blooms.castShadow=true;g.add(blooms);
  return g;
}
export function detailedOven() {
  const g=new T.Group();box(g,2.5,.9,1.7,0xac8363,0,.45,0);
  piece(g,new T.SphereGeometry(1.2,24,16,0,Math.PI*2,0,Math.PI/2),surface(0xc49369),0,.9,0);
  piece(g,new T.ShapeGeometry(archShape(1.25,1.1)),solid(0x2d271e),0,.9,1.05);
  for(let i=0;i<11;i++) {
    const a=i*Math.PI/10,b=box(g,.22,.25,.28,0xd4ae84,Math.cos(a)*.72,1.4+Math.sin(a)*.72,1.07);b.rotation.z=a;
  }
  for(let i=0;i<5;i++) {
    const m=new T.MeshStandardMaterial({color:i%2?0xffc46c:0xf76b27,emissive:0xff842a,emissiveIntensity:1.7});
    piece(g,new T.ConeGeometry(.12,.35+i*.05,10),m,-.4+i*.2,1.15,1.09);
  }
  piece(g,new T.CylinderGeometry(.23,.28,1.1,12),surface(0xae7a54),0,2.3,-.25);
  return g;
}
export function detailedStall(color:number) {
  const g=new T.Group(),wood=surface(0x9a7651,'wood');
  piece(g,new T.BoxGeometry(2.5,.8,1.15),wood,0,.45,0);
  for(let i=0;i<10;i++)box(g,.02,.72,.035,0x735239,-1.1+i*.25,.46,.59,.005);
  for(const x of [-1.2,1.2])for(const z of [-.45,.45])piece(g,new T.CylinderGeometry(.045,.06,2.6,10),wood,x,1.3,z);
  const fabric=new T.Shape();fabric.moveTo(-.9,0);fabric.quadraticCurveTo(0,.25,.9,0);fabric.lineTo(.9,-.04);fabric.quadraticCurveTo(0,.21,-.9,-.04);fabric.closePath();
  for(let i=0;i<10;i++) {
    const m=piece(g,new T.ExtrudeGeometry(fabric,{depth:.29,bevelEnabled:false,curveSegments:12}),solid(i%2?0xf4e6c8:color),-1.45+i*.29,2.42,0);m.rotation.y=-Math.PI/2;
    const fringe=piece(g,new T.SphereGeometry(.145,10,6,0,Math.PI,0,Math.PI/2),solid(i%2?0xf4e6c8:color),-1.3+i*.29,2.34,.9);fringe.rotation.z=Math.PI;
  }
  for(let crate=0;crate<3;crate++) {
    const xx=-.82+crate*.82;
    box(g,.75,.18,.85,0x9b714b,xx,.99,0);
    for(const zz of [-.4,.4])box(g,.75,.15,.035,0xc59a66,xx,1.1,zz);
    for(let i=0;i<9;i++) {
      const px=xx-.23+(i%3)*.22,pz=-.25+Math.floor(i/3)*.24;
      const fruit=sphere(g,.115,crate===0?0xc9472d:crate===1?0xe1b846:0x5c3760,px,1.18+(i%2)*.03,pz,crate===2?.65:1,crate===2?1.6:1,1);
      if(crate===0)piece(fruit,new T.ConeGeometry(.075,.04,5),solid(0x46774d),0,.11,0);
    }
  }
  terracottaPot(g,1.5,0,.55,1.1);terracottaPot(g,-1.5,0,.2,.85,true);
  return g;
}
export function detailedFountain() {
  const g=new T.Group(),stone=surface(0xd2c7a9);
  piece(g,new T.CylinderGeometry(1.9,2,.18,32),stone,0,.09,0);
  piece(g,new T.CylinderGeometry(1.7,1.82,.45,32),stone,0,.37,0);
  piece(g,new T.TorusGeometry(1.65,.12,8,48),stone,0,.62,0).rotation.x=Math.PI/2;
  const water=new T.MeshPhysicalMaterial({color:0x75c4c4,roughness:.15,metalness:.15,transparent:true,opacity:.84});
  piece(g,new T.CircleGeometry(1.55,48),water,0,.59,0).rotation.x=-Math.PI/2;
  const points=[new T.Vector2(.45,0),new T.Vector2(.27,.2),new T.Vector2(.17,.65),new T.Vector2(.28,.9),new T.Vector2(.63,1),new T.Vector2(.76,1.15)];
  piece(g,new T.LatheGeometry(points,24),stone,0,.55,0);
  piece(g,new T.TorusGeometry(.72,.07,8,32),stone,0,1.73,0).rotation.x=Math.PI/2;
  piece(g,new T.CylinderGeometry(.07,.13,.52,16),stone,0,1.95,0);
  sphere(g,.16,0xd8cfb5,0,2.27,0);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    tube(g,[new T.Vector3(0,2.24,0),new T.Vector3(Math.cos(a)*.4,2.4,Math.sin(a)*.4),new T.Vector3(Math.cos(a)*.9,1.1,Math.sin(a)*.9)],.018,0xb7e7db);
  }
  terracottaPot(g,-1.9,0,.7,1,true);terracottaPot(g,1.5,0,1.3,.8,true);return g;
}
export function dressCharacter(rig:{group:T.Group;body:T.Mesh;head:T.Mesh;leftArm:T.Mesh;rightArm:T.Mesh;leftLeg:T.Mesh;rightLeg:T.Mesh},hero:boolean,grandma:boolean,chef:boolean) {
  const h=rig.head;
  // Local coordinates keep face, ears and hair attached to the animated head.
  sphere(h,.35,grandma?0xa5a39a:0x543d2e,0,.06,-.08,1,.85,.85);
  for(const side of [-1,1]) {
    sphere(h,.085,0xf0b78e,side*.33,-.015,0,.7,1,.6);
    sphere(h,.065,0xfff7df,side*.12,.035,.29,.8,1,.5);
    sphere(h,.039,0x4e3827,side*.12,.035,.33,.85,1,.45);
    sphere(h,.015,0xffffff,side*.12-.012,.057,.35,.7,1,.4);
    const brow=box(h,.14,.035,.025,grandma?0x82796b:0x513a29,side*.12,.155,.3,.012);brow.rotation.z=side*.13;
    sphere(h,.065,0xe6a08a,side*.22,-.085,.255,1,.6,.4);
  }
  sphere(h,.07,0xf2be96,0,-.04,.345,.7,1,1.1);
  tube(h,[new T.Vector3(-.09,-.14,.3),new T.Vector3(0,-.17,.325),new T.Vector3(.09,-.14,.3)],.012,0x9b5d4d);
  for(let i=0;i<11;i++) {
    const a=i*2.4;
    sphere(h,.12,grandma?0xa5a39a:0x543d2e,Math.sin(a)*.27,.17+Math.cos(a)*.08,Math.cos(a)*.21,1,.9,1);
  }
  for(const leg of [rig.leftLeg,rig.rightLeg]) {
    box(leg,.29,.17,.42,0x65472e,0,-.23,.07,.07);
    box(leg,.3,.045,.44,0x3c342b,0,-.3,.07,.015);
  }
  for(const arm of [rig.leftArm,rig.rightArm]) {
    sphere(arm,.12,0xf2c29c,0,-.32,.01,.85,1.15,.8);
    piece(arm,new T.CylinderGeometry(.12,.12,.1,12),solid(0xe8ddc8),0,-.19,0);
  }
  if(hero) {
    const b=rig.body;
    box(b,.5,.56,.23,0x98714c,0,.02,-.39,.08);
    box(b,.38,.24,.07,0xb48e62,0,-.06,-.54,.04);
    for(const side of [-1,1])box(b,.055,.58,.04,0xb99c70,side*.2,.1,.325,.012);
    piece(b,new T.TorusGeometry(.15,.045,8,16),solid(0xb44336),0,.43,.01).rotation.x=Math.PI/2;
    box(b,.13,.25,.04,0xb44336,.08,.3,.34,.02).rotation.z=-.3;
    piece(b,new T.CylinderGeometry(.018,.018,.65,8),solid(0xb99a65),.26,.3,-.5);
    sphere(b,.1,0xb99a65,.26,.65,-.5,.6,1.4,.25);
    box(b,.22,.16,.025,0xd8cdb7,0,-.12,.35,.025);
  }
  if(chef&&!hero)for(const side of [-1,1])sphere(h,.09,0x503b2a,side*.07,-.08,.34,1.3,.45,.5);
  if(grandma) {
    sphere(h,.15,0xaaa69a,0,.16,-.28);
    piece(h,new T.TorusGeometry(.09,.012,6,20),solid(0x9c8659),-.12,.03,.36);
    piece(h,new T.TorusGeometry(.09,.012,6,20),solid(0x9c8659),.12,.03,.36);
    for(const side of [-1,1])piece(h,new T.TorusGeometry(.065,.014,6,16),solid(0xd6b35f),side*.34,-.09,.02);
  }
}
export function setDressing(scene:T.Scene) {
  // Hills sit outside the playable radius and never block quests.
  for(let i=0;i<9;i++) {
    const g=new T.Group();g.position.set(-70+i*17,-4,-48-(i%3)*12);
    const hill=sphere(g,1,[0x73866a,0x879676,0x97a67e][i%3],0,0,0,18,7+i%3,14);hill.receiveShadow=false;scene.add(g);
  }
  for(const [x,z] of [[-18,-1],[-16,8],[16,6],[18,-2]] as const) {
    const g=new T.Group();g.position.set(x,0,z);scene.add(g);
    piece(g,new T.CylinderGeometry(.75,.75,.1,32),surface(0xe4ceb0),0,.95,0);
    piece(g,new T.CylinderGeometry(.09,.16,.9,12),solid(0x725940),0,.45,0);
    for(const side of [-1,1]) {
      box(g,.48,.1,.48,0x806345,side*1.05,.48,0);
      box(g,.48,.62,.07,0x957351,side*1.05,.82,-.22);
      for(const s of [-1,1])box(g,.06,.45,.06,0x725940,side*1.05+s*.18,.23,.18);
    }
    terracottaPot(g,0,1.01,0,.35,true);
  }
  // Festoon lights follow the edges of the square, leaving a wide central path.
  for(const side of [-1,1]) {
    const points=[];
    for(let i=0;i<=20;i++)points.push(new T.Vector3(side*13,4.8-Math.sin(i/20*Math.PI)*.65,-11+i));
    tube(scene,points,.018,0x64583c);
    for(let i=0;i<=10;i++) {
      const y=4.8-Math.sin(i/10*Math.PI)*.65;
      sphere(scene,.065,0xffe2a3,side*13,y-.12,-11+i*2);
    }
  }
}
export function oliveTree() {
  const g=new T.Group();
  piece(g,new T.CylinderGeometry(.18,.32,2.8,10),surface(0x88745a,'wood'),0,1.4,0).rotation.z=.08;
  for(let i=0;i<6;i++) {
    const a=i*2.4;
    const twig=piece(g,new T.CylinderGeometry(.07,.13,1.5,8),surface(0x88745a,'wood'),Math.cos(a)*.45,2.1,Math.sin(a)*.45);twig.rotation.z=Math.sin(a)*.6;
  }
  const leaves=new T.InstancedMesh(new T.SphereGeometry(.2,6,4),solid(0x7c9062),100);
  const dummy=new T.Object3D();
  for(let i=0;i<100;i++) {
    const a=random()*Math.PI*2,r=Math.sqrt(random())*1.7;
    dummy.position.set(Math.cos(a)*r,2.7+random()*1.2,Math.sin(a)*r);
    dummy.rotation.set(random(),a,random());dummy.scale.set(1.7,.65,1);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);
    leaves.setColorAt(i,new T.Color([0x687d54,0x91a078,0x7f9265][i%3]));
  }
  leaves.castShadow=true;g.add(leaves);return g;
}
export function enrichVillage(scene:T.Scene) {
  const dummy=new T.Object3D();
  // Meadow edge: small instanced grass tufts and flowers, not a flat green disc.
  const grassGeo=new T.ConeGeometry(.07,.35,3), grasses=new T.InstancedMesh(grassGeo,solid(0x769559),1400);
  for(let i=0;i<1400;i++) {
    const a=random()*Math.PI*2,r=16.2+random()*22;
    dummy.position.set(Math.cos(a)*r,.12,Math.sin(a)*r);dummy.rotation.set(0,random()*6,.2*(random()-.5));dummy.scale.setScalar(.6+random());dummy.updateMatrix();grasses.setMatrixAt(i,dummy.matrix);
    grasses.setColorAt(i,new T.Color([0x759159,0x9eae71,0x607c43][i%3]));
  }
  scene.add(grasses);
  // Distant cypresses make the region readable from the starting view.
  for(let i=0;i<22;i++) {
    const x=-40+i*4, z=-28-Math.sin(i*.6)*7;
    const g=new T.Group();g.position.set(x,0,z);
    piece(g,new T.CylinderGeometry(.1,.17,1.1,8),solid(0x78654c),0,.55,0);
    sphere(g,.7,0x48664a,0,2.5,0,.65,2.6,.65);scene.add(g);
  }
  const tree=oliveTree();tree.position.set(-6.5,0,8.5);tree.scale.setScalar(1.6);scene.add(tree);
  // Low planting beds and pots frame the fountain without blocking its approach.
  for(const side of [-1,1]) {
    const bed=new T.Group();bed.position.set(side*3.3,0,1.6);scene.add(bed);
    box(bed,1.6,.2,.7,0xd3c0a0,0,.1,0);
    for(let i=0;i<6;i++)terracottaPot(bed,-.6+i*.24,.15,0,.55,true);
  }
  for(const [x,z] of [[-6,6],[11.5,3]] as const) {
    const table=new T.Group();table.position.set(x,0,z);scene.add(table);
    box(table,1.65,.12,1.3,0xa3805a,0,.98,0);
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#f3e5cc';ctx.fillRect(0,0,128,128);
    ctx.fillStyle='#b9514966';for(let i=0;i<8;i++){ctx.fillRect(i*16,0,8,128);ctx.fillRect(0,i*16,128,8)}
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(3,2);
    piece(table,new T.BoxGeometry(1.7,.025,1.35),new T.MeshStandardMaterial({map,roughness:1}),0,1.06,0);
    for(const sx of [-1,1])for(const sz of [-1,1])box(table,.07,.96,.07,0x886b47,sx*.64,.48,sz*.46);
    for(const side of [-1,1]) {
      const chair=new T.Group();chair.position.set(side*1.3,0,0);chair.rotation.y=-side*Math.PI/2;table.add(chair);
      box(chair,.55,.08,.55,0xa28054,0,.47,0);box(chair,.58,.65,.08,0xa28054,0,.81,-.24);
      for(const xx of [-.21,.21])for(const zz of [-.21,.21])box(chair,.06,.45,.06,0x85613e,xx,.225,zz);
      piece(table,new T.CylinderGeometry(.31,.31,.025,32),solid(0xf4eee0),side*.48,1.09,0);
      piece(table,new T.CylinderGeometry(.25,.25,.05,32),solid(0xc6914d),side*.48,1.13,0);
      piece(table,new T.CylinderGeometry(.21,.21,.015,32),solid(0xb84229),side*.48,1.16,0);
      for(let i=0;i<4;i++)sphere(table,.06,0xf7e6b4,side*.48+Math.cos(i*2)*.13,1.18,Math.sin(i*2)*.13,1,.25,1);
      piece(table,new T.CylinderGeometry(.055,.045,.17,12),new T.MeshPhysicalMaterial({color:0xc1e0dc,transparent:true,opacity:.4,roughness:.1}),side*.47,1.16,-.45);
    }
    terracottaPot(table,0,1.08,-.1,.35,true);
  }
}

/** Batch only static meshes. Characters, pickups, clouds and particles keep their own transforms. */
export function batchStaticWorld(scene:T.Scene, animated:Set<T.Object3D>) {
  scene.updateMatrixWorld(true);
  const batches=new Map<string,{material:T.Material;geometries:T.BufferGeometry[];cast:boolean;receive:boolean}>();
  const removed:T.Mesh[]=[];
  function visit(object:T.Object3D) {
    if(animated.has(object))return;
    if(object instanceof T.Mesh && !(object instanceof T.InstancedMesh) && !Array.isArray(object.material) && !object.material.transparent) {
      const key=object.material.uuid+'/'+object.castShadow+'/'+object.receiveShadow;
      if(!batches.has(key))batches.set(key,{material:object.material,geometries:[],cast:object.castShadow,receive:object.receiveShadow});
      const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);batches.get(key)!.geometries.push(geometry);removed.push(object);
    }
    for(const child of object.children)visit(child);
  }
  visit(scene);
  for(const mesh of removed)mesh.removeFromParent();
  for(const batch of batches.values()) {
    const geometry=mergeGeometries(batch.geometries,false);
    if(!geometry)throw new Error('Could not batch village geometry');
    const mesh=new T.Mesh(geometry,batch.material);mesh.castShadow=batch.cast;mesh.receiveShadow=batch.receive;mesh.name='Village static batch';scene.add(mesh);
    for(const part of batch.geometries)part.dispose();
  }
}
