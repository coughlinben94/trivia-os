// Pure generator half of concepts/haunted-forest-walk-v3.html (Phase 3b-1).
// Lines ~122-569 and moonSvg (~598-605) of v3 are copied verbatim inside makeForest(), plus the
// pure item-model helpers the mount layer reads (zrel, fm4, collect). No DOM, no globals, no
// unseeded randomness: every call builds its own ITEMS/GITEMS/OCC/EXCL, so calls never share state.
// Only changes from v3: D = walk.stepM, DUR = walk.durMs (parity values 6 / 4000 reproduce v3), and
// the seed mix in rngFor (see there).
//
// Seed: v3 has no explicit seed; every stream comes from rngFor(...keys), an FNV-style hash that
// starts at 2166136261. Here the start is 2166136261 ^ Math.imul(seed, 0x9e3779b1). seed 0 (the
// default) leaves the start unchanged (x ^ 0 === x after the int32 cast v3 already does on the first
// step), so makeForest() is byte-identical to v3; any other seed shifts every stream (trees, fog,
// ground decals, fence and grave shapes) at once.
export const DEFAULT_SEED = 0;

export function makeForest({ walk = { durMs: 4000, stepM: 6 }, seed = DEFAULT_SEED } = {}) {
const stepM = walk.stepM, durMs = walk.durMs;
// ---------- constants (design px at 1920x1080, world in metres) ----------
const W=1920, H=1080, VX=960, VY=700;      // vanishing point = horizon, low in frame
const F=1371, E=1.7;                        // focal length px, eye height m
const D=stepM, NS=13, L=NS*D, REST=9;           // metres per station, 13 stations, loop length, landmark rest distance
const ZFAR=42, FADE=7, ZMIN=0.45, M=48, KCAP=6, ZG0=6.1, ZG1=34;
const DUR=durMs, STOPS=24, AUTO_MS=7000, CAPFADE=400;   // DUR: one station-to-station walk; AUTO_MS keeps a 3s pause between walks
const EASE=bez(.45,.05,.25,1);
const NAMES=['forest edge, broken fence gate','lantern on a post','scarecrow with a pumpkin head','leaning gravestone row','row of jack-o\'-lanterns','crow on a stump','stone well, glowing green','abandoned cart','fallen log, glowing mushrooms','will-o\'-wisps over a bog','harvest moon through the canopy','cabin with a lit window','signpost with a skull'];

const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const fm=n=>Math.round(n*10)/10;
const TAU=Math.PI*2;
const P=(X,h,z)=>[VX+X*F/z, VY+(E-h)*F/z];
const fogAmt=z=>1-Math.exp(-Math.max(0,z-2.5)/17);
const litAmt=(X,z)=>clamp(1.3-z/11)*(X>0?1:0.6);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function rngFor(...k){let h=2166136261^Math.imul(seed,0x9e3779b1);   // seed mix: seed 0 === v3 (see header)
  for(const v of k){h=Math.imul(h^(v+0x9e3779b9),16777619);h^=h>>>13}return mulberry32(h>>>0)}
const rr=(r,a,b)=>a+r()*(b-a);
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.substr(i,2),16)*(1-t)+parseInt(b.substr(i,2),16)*t).toString(16).padStart(2,'0')).join('');
function bez(x1,y1,x2,y2){const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const sx=t=>((ax*t+bx)*t+cx)*t, sy=t=>((ay*t+by)*t+cy)*t;
  return x=>{let lo=0,hi=1,t=x;for(let i=0;i<30;i++){t=(lo+hi)/2;if(sx(t)<x)lo=t;else hi=t}return sy(t)}}
function dPoly(pts){return 'M'+pts.map(p=>fm(p[0])+' '+fm(p[1])).join('L')+'Z'}
function bbox(lists){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const l of lists)for(const p of l){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}return[x0,y0,x1,y1]}
// ribbon polygon around a spine [[x,y,width],...]
function ribbon(sp){const A=[],B=[];for(let i=0;i<sp.length;i++){const a=sp[Math.max(0,i-1)],b=sp[Math.min(sp.length-1,i+1)];const dx=b[0]-a[0],dy=b[1]-a[1],m=Math.hypot(dx,dy)||1,nx=-dy/m,ny=dx/m,w=sp[i][2]/2;A.push([sp[i][0]+nx*w,sp[i][1]+ny*w]);B.push([sp[i][0]-nx*w,sp[i][1]-ny*w])}return A.concat(B.reverse())}
// world spine [[X,h,w]] -> screen ribbon at depth z, never thinner than 7px (TV legibility floor)
const wRib=(sp,X0,z)=>ribbon(sp.map(([x,h,w])=>{const p=P(X0+x,h,z);return[p[0],p[1],Math.max(w*F/z,7)]}));
const rot=(pts,a,ox=0,oy=0)=>pts.map(([x,y])=>[ox+(x-ox)*Math.cos(a)-(y-oy)*Math.sin(a), oy+(x-ox)*Math.sin(a)+(y-oy)*Math.cos(a)]);
function lgrad(id,x1,y1,x2,y2,stops){return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fm(x1)}" y1="${fm(y1)}" x2="${fm(x2)}" y2="${fm(y2)}">${stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2]??1}"/>`).join('')}</linearGradient>`}
function rgrad(id,cx,cy,r,stops,sy=1){return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fm(cx)}" cy="${fm(cy)}" r="${fm(r)}" gradientTransform="translate(${fm(cx)} ${fm(cy)}) scale(1 ${sy}) translate(${fm(-cx)} ${fm(-cy)})">${stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2]??1}"/>`).join('')}</radialGradient>`}

// ---------- trees (world-space shape, projected per pose) ----------
function treeShape(r,w,hmin){
  const lean=r()<0.4?(r()-0.5)*0.14:(r()-0.5)*0.03;
  const HS=[-0.12,0,0.5,1.4,4,8,13,19,26,34];
  const cx=[],ww=[];let k=0;
  HS.forEach((h,i)=>{if(i>=4)k+=(r()-0.5)*w*0.4;cx.push(lean*Math.max(0,h)+k);
    ww.push(w*(h<=0?1.5:h<=0.5?1.18:h<=1.4?1.03:Math.max(0.5,1-(h-1.4)/42)))});
  const b0=cx[0],bw0=ww[0];
  const trunk=[[b0-bw0*0.62,-0.06],[b0-bw0*0.5,0.1]].concat(HS.slice(1).map((h,i)=>[cx[i+1]-ww[i+1]/2,h]),HS.slice(1).map((h,i)=>[cx[i+1]+ww[i+1]/2,h]).reverse(),[[b0+bw0*0.5,0.1],[b0+bw0*0.62,-0.06],[b0+bw0*0.25,-0.12],[b0-bw0*0.25,-0.12]]);
  const at=h=>{let i=0;while(i<HS.length-2&&HS[i+1]<h)i++;const t=(h-HS[i])/(HS[i+1]-HS[i]);return[cx[i]+(cx[i+1]-cx[i])*t,ww[i]+(ww[i+1]-ww[i])*t]};
  const branches=[];const nb=2+Math.floor(r()*3);const bias=r()<.5?-1:1;
  for(let b=0;b<nb;b++){
    const h0=rr(r,hmin,Math.max(hmin+2,22)); const side=r()<0.75?bias:-bias; const [c0,w0]=at(h0);
    let ang=rr(r,0.45,1.15); const len=rr(r,2.2,6.5)*Math.sqrt(w/0.7); const bw=Math.max(0.2,w0*rr(r,0.28,0.4));
    let x=c0+side*w0*0.3, y=h0; const sp=[[x,y,bw]];
    for(let s=1;s<=3;s++){ang+=(r()-0.35)*0.4;x+=side*Math.sin(ang)*len/3;y+=Math.cos(ang)*len/3;sp.push([x,y,bw*(1-s*0.22)])}
    branches.push(sp);
    if(r()<0.55){const q=sp[1];let a2=ang-0.5;const l2=len*0.45;branches.push([[q[0],q[1],bw*0.55],[q[0]+side*Math.sin(a2)*l2*0.5,q[1]+Math.cos(a2)*l2*0.5,bw*0.42],[q[0]+side*Math.sin(a2-0.2)*l2,q[1]+Math.cos(a2-0.2)*l2,bw*0.3]])}
  }
  return {trunk,branches,cx,ww,HS};
}
function litStrip(sh,inner,frac){
  const pts=[],back=[];sh.HS.forEach((h,i)=>{if(h>6.5)return;const e=sh.cx[i]+inner*sh.ww[i]/2;pts.push([e,h]);back.push([e-inner*frac*sh.ww[i],h])});
  return pts.concat(back.reverse());
}
function treeItem(Z,X,w,r){
  const sh=treeShape(r,w,Math.abs(X)<4?8:4); const inner=X>0?-1:1;
  const LF=0.35,litA=litStrip(sh,inner,LF);
  const edgeAt=h=>{const i=sh.HS.findIndex(v=>v>=h);const e=sh.cx[i]+inner*sh.ww[i]/2;return[e,e-inner*LF*sh.ww[i]]};
  // bark furrows: dark vertical ribbons across the lit side, below 6 m
  const fur=[0.1,0.2,0.29].slice(0,2+Math.floor(r()*2)).map(f=>{const ph=r()*6,h0=rr(r,0.5,1.4),h1=rr(r,3.5,6);const at2=h=>{let i=0;while(i<sh.HS.length-2&&sh.HS[i+1]<h)i++;const t=(h-sh.HS[i])/(sh.HS[i+1]-sh.HS[i]);return[sh.cx[i]+(sh.cx[i+1]-sh.cx[i])*t,sh.ww[i]+(sh.ww[i+1]-sh.ww[i])*t]};
    return [...Array(9)].map((_,i)=>{const t=i/8,h=h0+(h1-h0)*t,[c,ww]=at2(h);return[c+inner*ww*(0.5-f)+Math.sin(h*2.1+ph)*ww*0.03,h,w*0.05*Math.sin(Math.PI*(0.08+t*0.84))]})});
  return {grp:'w',Z,X,kind:'tree',fastDim:2,op:z=>clamp((ZFAR-z)/FADE),
    lops:[null,z=>fogAmt(z),z=>litAmt(X,z)*(1-fogAmt(z))],
    geom(z,id){
      const pr=p=>P(X+p[0],p[1],z);
      const tr=sh.trunk.map(pr), br=sh.branches.map(b=>wRib(b,X,z));
      const all=dPoly(tr)+br.map(dPoly).join('');
      const fy0=P(0,-0.2,z)[1],fy2=P(0,18,z)[1],ly1=P(0,0.3,z)[1],ly2=P(0,4.8,z)[1];const [e0,e1]=edgeAt(1.5);const ex0=P(X+e0,1.5,z)[0],ex1=P(X+e1,1.5,z)[0];const lb=bbox([litA.map(pr)]);
      const warm=clamp(1.25-z/9)*(X>0?1:0.75),c0=mix('#4A4035','#6e5436',warm),c1=mix('#3d342b','#523e2a',warm);
      const furs=w*F/z>=70?fur.map(sp=>`<path d="${dPoly(wRib(sp,X,z))}" fill="#1c160f" opacity=".6"/>`).join(''):'';
      return {bb:bbox([tr,...br]),pb:[tr,...br].map(l=>bbox([l])),layers:[
        `<path d="${all}" fill="#070706"/>`,
        // fog tint: the base is fog-coloured, so far trunks sink into the ground fog instead of ending on a hard dark foot
        `<defs>${lgrad(id+'f',0,fy0,0,fy2,[[0,'#2a2b2e'],[.07,'#27282a'],[.16,'#262729'],[.55,'#18191c'],[1,'#0b0c0e']])}</defs><path d="${all}" fill="url(#${id}f)"/>`,
        `<defs>${lgrad(id+'l',ex0,0,ex1,0,[[0,c0,1],[.35,c1,.55],[1,'#2A2620',0]])}${lgrad(id+'v',0,ly1,0,ly2,[[0,'#fff',1],[.4,'#fff',.8],[1,'#fff',0]])}<mask id="${id}k" maskUnits="userSpaceOnUse" x="${fm(lb[0]-4)}" y="${fm(lb[1]-4)}" width="${fm(lb[2]-lb[0]+8)}" height="${fm(lb[3]-lb[1]+8)}"><rect x="${fm(lb[0]-4)}" y="${fm(lb[1]-4)}" width="${fm(lb[2]-lb[0]+8)}" height="${fm(lb[3]-lb[1]+8)}" fill="url(#${id}v)"/></mask></defs><g mask="url(#${id}k)"><path d="${dPoly(litA.map(pr))}" fill="url(#${id}l)"/>${furs}</g>`
      ]};
    }};
}
// overhead limb reaching in from an off-frame trunk: a world item you walk under (it rises out of the top of frame)
function limbItem(Z,sd,r){
  const x0=sd*rr(r,6.5,9),h0=rr(r,4.8,5.8),x1=sd*rr(r,-1.4,1.0),h1=rr(r,7.2,8.8),w0=rr(r,0.32,0.46),n=7,sp=[];
  const ph=rr(r,0,TAU);
  for(let i=0;i<=n;i++){const t=i/n;sp.push([x0+(x1-x0)*t,h0+(h1-h0)*Math.pow(t,0.6)+Math.sin(t*5+ph)*0.28*t,w0*(1-t*0.7)])}
  const limbs=[sp];
  for(const k of[2,4,6]){if(r()<.25)continue;const p=sp[k];const up=r()<.6;const l=rr(r,1.0,2.2);const dx=-sd*rr(r,0.2,0.9);
    limbs.push([[p[0],p[1],p[2]*0.55],[p[0]+dx*0.5,p[1]+(up?1:-0.6)*l*0.5,p[2]*0.38],[p[0]+dx,p[1]+(up?1:-0.9)*l,p[2]*0.25]])}
  return {grp:'w',Z,X:0,kind:'limb',op:z=>clamp((ZFAR-z)/FADE)*clamp((17-z)/4),lops:[null,z=>fogAmt(z)*0.8],
    geom(z){const ps=limbs.map(s=>wRib(s,0,z));const d=ps.map(dPoly).join('');
      return {bb:bbox(ps),pb:ps.map(l=>bbox([l])),layers:[`<path d="${d}" fill="#050505"/>`,`<path d="${d}" fill="#1c1d20"/>`]};}};
}

// ---------- fog shaped by trunks ----------
function fogShaft(Z,X,wd,r){
  const dx=fm(rr(r,10,22)),d=fm(rr(r,17,29)),dl=-fm(rr(r,0,20)),pk=rr(r,.10,.17);
  return {grp:'w',Z,X,kind:'fog',op:z=>clamp((ZFAR-z)/FADE)*clamp((z-3)/5),lops:[null],drift:[{dx,d,dl}],
    geom(z,id){const a=P(X-wd/2,15,z),b=P(X+wd/2,0,z);
      return {bb:[a[0]-40,a[1],b[0]+40,b[1]],layers:[
        `<defs>${lgrad(id+'h',a[0],0,b[0],0,[[0,'#5c6068',0],[.5,'#5c6068',pk],[1,'#5c6068',0]])}${lgrad(id+'v',0,a[1],0,b[1],[[0,'#fff',0],[.55,'#fff',1],[1,'#fff',.7]])}<mask id="${id}k"><rect x="${fm(a[0]-40)}" y="${fm(a[1])}" width="${fm(b[0]-a[0]+80)}" height="${fm(b[1]-a[1])}" fill="url(#${id}v)"/></mask></defs><rect mask="url(#${id}k)" x="${fm(a[0])}" y="${fm(a[1])}" width="${fm(b[0]-a[0])}" height="${fm(b[1]-a[1])}" fill="url(#${id}h)"/>`]};}};
}
function groundFog(Z,X,wd,r){
  const dx=fm(rr(r,20,40)),d=fm(rr(r,19,31)),dl=-fm(rr(r,0,20)),pk=rr(r,.28,.42);
  return {grp:'w',Z,X,kind:'fog',op:z=>clamp((ZFAR-z)/FADE)*clamp((z-4)/5),lops:[null],drift:[{dx,d,dl}],
    geom(z,id){const c=P(X,0.35,z),rx=wd/2*F/z,ry=0.75*F/z;
      return {bb:[c[0]-rx-45,c[1]-ry,c[0]+rx+45,c[1]+ry],layers:[
        `<defs>${rgrad(id+'g',c[0],c[1],rx,[[0,'#34363a',pk],[.6,'#2c2e32',pk*.5],[1,'#2c2e32',0]],ry/rx)}</defs><ellipse cx="${fm(c[0])}" cy="${fm(c[1])}" rx="${fm(rx)}" ry="${fm(ry)}" fill="url(#${id}g)"/>`]};}};
}

// ---------- ground: ONE layer. Walking forward over a flat ground is an exact 2D homography about the
// vanishing point (w = 1 - dz*(y-VY)/(E*F)), so the whole floor animates as a single matrix3d, no per-decal layers ----------
const GITEMS=[];
const LEAFC=['#6b4a26','#7a5a2c','#5a3a1e','#4f3d27','#836236','#6a3c1c'];
const gi=(Z,X,draw)=>GITEMS.push({Z,X,draw});
function leaf(Z,X,r){
  const l=rr(r,0.22,0.4),a=rr(r,0,Math.PI),c=LEAFC[Math.floor(r()*LEAFC.length)];
  const shp=rot([[-l/2,0],[-l/4,l*0.22],[0,l*0.3],[l/4,l*0.2],[l/2,0],[l/4,-l*0.2],[0,-l*0.3],[-l/4,-l*0.22]],a);
  gi(Z,X,z=>`<path d="${dPoly(shp.map(([dx,dz])=>P(X+dx,0,z+dz)))}" fill="${c}"/>`);
}
function root(Z,X,sd,r){
  const n=6,x0=X,x1=sd*rr(r,-0.6,0.5),th=rr(r,0.08,0.13),sp=[];
  for(let i=0;i<n;i++){const t=i/(n-1);sp.push([x0+(x1-x0)*t,Math.sin(t*3+r())*0.35])}
  gi(Z,X,z=>{
    const top=sp.map(([x,dz],i)=>P(x,th*(1-0.5*i/(n-1)),z+dz)),bot=sp.map(([x,dz])=>P(x,0,z+dz)).reverse();
    const hl=sp.map(([x,dz],i)=>P(x,th*(1-0.5*i/(n-1))*0.95,z+dz-0.02)),hl2=sp.map(([x,dz],i)=>P(x,th*(1-0.5*i/(n-1))*0.6,z+dz-0.02)).reverse();
    return `<path d="${dPoly(top.concat(bot))}" fill="#1e170f"/><path d="${dPoly(hl.concat(hl2))}" fill="#5a4a36" opacity=".8"/>`});
}
function stone(Z,X,r){
  const w=rr(r,0.2,0.42),h=rr(r,0.08,0.18),n=9,top=[];
  for(let i=0;i<=n;i++){const t=i/n*Math.PI;top.push([-Math.cos(t)*w/2,Math.sin(t)*h*(0.8+r()*0.3)])}
  gi(Z,X,z=>{const pts=top.map(([x,hh])=>P(X+x,hh,z));const lit=top.slice(2,7).map(([x,hh])=>P(X+x,hh,z));const lb=top.slice(2,7).map(([x,hh])=>P(X+x*0.8,hh*0.6,z)).reverse();
    return `<path d="${dPoly(pts)}" fill="#2c2a26"/><path d="${dPoly(lit.concat(lb))}" fill="#6a655c"/>`});
}
function tuft(Z,X,r){
  const nb=3+Math.floor(r()*3),bl=[];for(let i=0;i<nb;i++){const bx=rr(r,-0.12,0.12),hh=rr(r,0.25,0.55),lean=rr(r,-0.12,0.12);bl.push([[bx-0.03,0],[bx+lean,hh],[bx+0.03,0]])}
  gi(Z,X,z=>bl.map(b=>`<path d="${dPoly(b.map(([x,hh])=>P(X+x,hh,z)))}" fill="#26241a"/>`).join(''));
}
function patch(Z,X,r){
  const w=rr(r,0.7,1.4),dz=rr(r,0.9,2.0),n=12,sh=[];for(let i=0;i<n;i++){const a=i/n*TAU;sh.push([Math.cos(a)*w/2*(0.8+r()*0.3),Math.sin(a)*dz/2*(0.8+r()*0.3)])}
  const c=r()<.5?'#2a2219':'#5c4f3b';
  gi(Z,X,z=>`<path d="${dPoly(sh.map(([x,d])=>P(X+x,0,z+d)))}" fill="${c}" opacity=".8"/>`);
}
// the path itself: a world-space strip whose centre and width wander (periodic in the loop length, so 12 -> 0 closes)
const pathC=Z=>0.35*Math.sin(TAU*2*Z/L)+0.15*Math.sin(TAU*5*Z/L+1.3);
const pathHW=Z=>1.3+0.16*Math.sin(TAU*9*Z/L+0.4)+0.07*Math.sin(TAU*23*Z/L+2);
function groundSvg(c){
  const Zc=c*D,zs=[];for(let z=ZG0;z<ZG1;z*=1.03)zs.push(z);zs.push(ZG1);
  const edge=(off,sd)=>zs.map(z=>P(pathC(Zc+z)+sd*(pathHW(Zc+z)+off),0,z));
  const strip=off=>{const a=edge(off,-1),b=edge(off,1);return dPoly(a.concat(b.reverse()))};
  const line=(fx,wm,col,op)=>`<path d="${dPoly(ribbon(zs.map(z=>{const p=P(fx(Zc+z),0,z);return[p[0],p[1],Math.max(wm*F/z,7)]})))}" fill="${col}"${op?` opacity="${op}"`:''}/>`;
  let s=`<path d="${strip(0.55)}" fill="#30281e"/><path d="${strip(0)}" fill="#46392b"/>`;
  s+=line(Z=>pathC(Z),0.6,'#544634',.7);                                              // raised crown between the ruts
  for(const sd of[-1,1])s+=line(Z=>pathC(Z)+sd*(0.5+0.05*Math.sin(TAU*13*Z/L+sd)),0.2,'#2b2319'); // two worn ruts
  const list=[];for(const g of GITEMS){const z=((g.Z-Zc)%L+L)%L;if(z>ZG0-1.2&&z<ZG1)list.push([z,g])}
  list.sort((a,b)=>b[0]-a[0]);for(const [z,g] of list)s+=g.draw(z);
  return `<svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute;left:0;top:0;overflow:visible">${s}</svg>`;
}
function groundKF(name){const s=[];for(let i=0;i<=STOPS;i++){const t=i/STOPS,dz=D*EASE(t);s.push(`${fm(t*100)}%{transform:matrix3d(1,0,0,0,0,1,0,${(-dz/(E*F)).toFixed(7)},0,0,1,0,0,0,0,1)}`)}return `@keyframes ${name}{${s.join('')}}`}

// ---------- landmarks ----------
// station 0 — PASS = a fresh viewer names this as "a broken wooden fence with a gate hanging off it"
function fenceItem(Z){
  const r=rngFor(0,4242);const parts=[];const posts=[];
  for(const sd of[-1,1]){let x=1.45;let i=0;while(x<13){const gate=i===0;const hh=gate?1.6:rr(r,1.05,1.3)*(r()<.15?0.6:1);const pw=gate?0.2:0.15;const lean=gate?0:(r()-0.5)*0.12;
      posts.push({x:sd*x,hh});const p=[[-pw/2,-0.1],[pw/2,-0.1],[pw/2,hh-0.05],[0,hh+0.06],[-pw/2,hh-0.05]];parts.push(rot(p,lean).map(([a,b])=>[a+sd*x,b]));x+=rr(r,2.0,2.5);i++}}
  posts.sort((a,b)=>a.x-b.x);
  for(let i=0;i<posts.length-1;i++){const a=posts[i],b=posts[i+1];if(a.x<0&&b.x>0)continue;
    for(const rh of[0.48,0.98]){if(Math.min(a.hh,b.hh)<rh+0.05)continue;
      if(i===1&&rh===0.98){parts.push(ribbon([[a.x+0.05,rh,0.1],[a.x+0.9,rh-0.45,0.1],[a.x+1.35,0.02,0.1]]));continue} // broken rail, dangling
      const sag=r()*0.05;parts.push(ribbon([[a.x,rh,0.1],[(a.x+b.x)/2,rh-sag,0.1],[b.x,rh,0.1]]))}}
  // the gate, hanging off its top hinge on the right gate post, bottom-left corner dragging
  const g=[];const gw=1.2,gh=1.05,hx=1.35,hy=1.35;const bar=(pts,t)=>g.push(ribbon(pts.map(p=>[p[0],p[1],t])));
  bar([[hx-gw,hy-gh],[hx,hy-gh]],0.11);bar([[hx-gw,hy],[hx,hy]],0.11);bar([[hx-gw,hy-gh],[hx-gw,hy]],0.11);bar([[hx,hy-gh],[hx,hy]],0.11);bar([[hx-gw,hy-gh],[hx,hy]],0.09);bar([[hx-gw/2,hy-gh],[hx-gw/2,hy]],0.08);
  g.forEach(p=>parts.push(rot(p,-0.26,hx,hy)));
  return {grp:'w',Z,X:0,kind:'lm',op:z=>clamp((ZFAR-z)/FADE),lops:[null,z=>clamp((z-3.5)/3)*(1-fogAmt(z)),z=>fogAmt(z)],
    geom(z,id){const ps=parts.map(p=>p.map(([x,h])=>P(x,h,z)));const d=ps.map(dPoly).join('');const c=P(0.7,0.7,z);const cf=P(0,1.2,z),cf2=P(0,0,z);
      return{bb:bbox(ps),pb:ps.map(l=>bbox([l])),layers:[`<path d="${d}" fill="#0f0d0b"/>`,`<defs>${rgrad(id+'w',c[0],c[1],3.2*F/z,[[0,'#6e5b42'],[.35,'#40352a'],[.7,'#15120e'],[1,'#0f0d0b']],0.55)}</defs><path d="${d}" fill="url(#${id}w)"/>`,
        `<defs>${lgrad(id+'f',0,cf[1],0,cf2[1],[[0,'#2a2b2d'],[1,'#202123']])}</defs><path d="${d}" fill="url(#${id}f)"/>`]};}};
}
// station 1 — PASS = "an old lantern hanging from a wooden post, lit"
function lanternItem(Z,X){
  const post=[[-0.09,-0.1],[0.09,-0.1],[0.08,3.05],[-0.08,3.05]];
  const arm=ribbon([[-0.05,2.95,0.1],[0.45,2.97,0.1],[0.72,2.93,0.09]]);
  const brace=ribbon([[0.03,2.45,0.07],[0.4,2.93,0.07]]);
  const lx=0.66;const cap=[[lx-0.2,2.55],[lx+0.2,2.55],[lx+0.1,2.72],[lx-0.1,2.72]];const hook=ribbon([[lx,2.72,0.05],[lx,2.9,0.05]]);
  const glass=[[lx-0.15,2.12],[lx+0.15,2.12],[lx+0.16,2.55],[lx-0.16,2.55]];const base=[[lx-0.2,2.05],[lx+0.2,2.05],[lx+0.17,2.13],[lx-0.17,2.13]];
  const bars=[ribbon([[lx-0.15,2.12,0.05],[lx-0.16,2.55,0.05]]),ribbon([[lx+0.15,2.12,0.05],[lx+0.16,2.55,0.05]])];
  const dark=[post,arm,brace,cap,hook,base,...bars];
  return {grp:'w',Z,X,kind:'lm',op:z=>clamp((ZFAR-z)/FADE),lops:[null,z=>fogAmt(z)*0.95,z=>clamp((14.5-z)/4.5),z=>clamp((16.5-z)/6)],flick:[0,0,'flick',0],fastDim:3,
    geom(z,id){const pr=p=>P(X+p[0],p[1],z);const s=F/z;const gc=pr([lx,2.33]);const ps=dark.map(p=>p.map(pr));const gp=glass.map(pr);
      const halo=1.05*s;
      return{bb:bbox([...ps,[[gc[0]-halo,gc[1]-halo],[gc[0]+halo,gc[1]+halo]]]),layers:[
        `<defs>${lgrad(id+'p',...pr([0.09,0]),...pr([-0.09,0]),[[0,'#5a4a36'],[.5,'#1c1712'],[1,'#0a0908']])}</defs><path d="${ps.map(dPoly).join('')}" fill="url(#${id}p)"/><path d="${dPoly(gp)}" fill="#1c150d"/>${ps.slice(6).map(p=>`<path d="${dPoly(p)}" fill="#141008"/>`).join('')}`,
        `<path d="${ps.map(dPoly).join('')+dPoly(gp)}" fill="#242527"/>`,
        `<defs>${rgrad(id+'h',gc[0],gc[1],halo,[[0,'#ffcf8a',.55],[.25,'#ffb060',.2],[1,'#ff9a40',0]])}</defs><circle cx="${fm(gc[0])}" cy="${fm(gc[1])}" r="${fm(halo)}" fill="url(#${id}h)"/>`,
        `<defs>${lgrad(id+'g',0,gp[2][1],0,gp[0][1],[[0,'#ffe9b8'],[.6,'#ffc56a'],[1,'#e08a30']])}</defs><path d="${dPoly(gp)}" fill="url(#${id}g)"/>${ps.slice(6).map(p=>`<path d="${dPoly(p)}" fill="#141008"/>`).join('')}`]};}};
}
function lanternPool(Z,X){
  return {grp:'w',Z,X,kind:'lm',op:z=>clamp((ZFAR-z)/FADE),lops:[z=>clamp(1.1-fogAmt(z)*1.5)],
    geom(z,id){const c=P(X,0,z),rx=2.9*F/z,near=P(X,0,Math.max(z-2.2,0.6))[1],far=P(X,0,z+3)[1];const ry=(near-far)/2,cy=(near+far)/2;
      return{bb:[c[0]-rx,cy-ry,c[0]+rx,cy+ry],layers:[`<defs>${rgrad(id+'p',c[0],cy,rx,[[0,'#ffc070',.55],[.4,'#e08c40',.24],[1,'#c07030',0]],ry/rx)}</defs><ellipse cx="${fm(c[0])}" cy="${fm(cy)}" rx="${fm(rx)}" ry="${fm(ry)}" fill="url(#${id}p)"/>`]};}};
}
// station 3 — PASS = "a row of old tilted gravestones in moonlight"
function graveItem(Z,X,r,kind){
  const w=rr(r,0.5,0.75),h=rr(r,0.85,1.25),lean=(r()<.5?-1:1)*rr(r,0.06,0.24);let s;
  if(kind===0){s=[[-w/2,-0.1],[w/2,-0.1],[w/2,h-w/2]];for(let i=1;i<10;i++){const a=i/10*Math.PI;s.push([Math.cos(a)*w/2,h-w/2+Math.sin(a)*w/2])}s.push([-w/2,h-w/2])}
  else if(kind===1){const t=w*0.3;s=[[-t/2,-0.1],[t/2,-0.1],[t/2,h*0.62],[w/2,h*0.62],[w/2,h*0.62+t],[t/2,h*0.62+t],[t/2,h],[-t/2,h],[-t/2,h*0.62+t],[-w/2,h*0.62+t],[-w/2,h*0.62],[-t/2,h*0.62]]}
  else if(kind===2){s=[[-w/2,-0.1],[w/2,-0.1],[w/2,h*0.7],[w*0.3,h*0.9],[0,h],[-w*0.3,h*0.9],[-w/2,h*0.7]]}
  else {s=[[-w/2,-0.1],[w/2,-0.1],[w/2,h*0.7],[w*0.2,h*0.78],[w*0.05,h*0.95],[-w/2,h]]}
  s=rot(s,lean);const eng=[[[-w*0.25,h*0.5,0.05],[w*0.25,h*0.5,0.05]],[[-w*0.2,h*0.36,0.05],[w*0.2,h*0.36,0.05]]];
  return {grp:'w',Z,X,kind:'lm',op:z=>clamp((ZFAR-z)/FADE),lops:[null,z=>fogAmt(z)*0.9],
    geom(z,id){const pr=p=>P(X+p[0],p[1],z);const ps=s.map(pr);const top=pr([-w/2,h]),bot=pr([w/2,0]);const e=eng.map(sp=>rot(wRib(sp,X,z),-lean,...pr([0,0])));const sd=[...Array(12)].map((_,i)=>{const a=i/12*TAU;return P(X+w*0.1+Math.cos(a)*w*1.1,0,z+Math.sin(a)*0.35)});
      return{bb:bbox([ps,sd]),layers:[
        `<defs>${lgrad(id+'s',top[0],top[1],bot[0],bot[1],[[0,'#98abc2'],[.28,'#4a5464'],[.62,'#1c2027'],[1,'#101216']])}</defs><path d="${dPoly(sd)}" fill="#050506" opacity=".7"/><path d="${dPoly(ps)}" fill="url(#${id}s)"/>${e.map(p=>`<path d="${dPoly(p)}" fill="#0c0e12" opacity=".85"/>`).join('')}`,
        `<path d="${dPoly(ps)}" fill="#24262a"/>`]};}};
}
function moonPool(Z){
  return {grp:'w',Z,X:-4,kind:'lm',op:z=>clamp((ZFAR-z)/FADE),lops:[z=>clamp(1-fogAmt(z)*1.2)],
    geom(z,id){const c=P(-4.6,0,z),rx=3*F/z,n=P(0,0,Math.max(z-1.8,0.6))[1],f=P(0,0,z+2.2)[1],ry=(n-f)/2,cy=(n+f)/2;
      return{bb:[c[0]-rx,cy-ry,c[0]+rx,cy+ry],layers:[`<defs>${rgrad(id+'p',c[0],cy,rx,[[0,'#9fb4d0',.2],[.5,'#8aa0c0',.08],[1,'#8aa0c0',0]],ry/rx)}</defs><ellipse cx="${fm(c[0])}" cy="${fm(cy)}" rx="${fm(rx)}" ry="${fm(ry)}" fill="url(#${id}p)"/>`]};}};
}

// ---------- side landmarks: one per station, off the path (world |X| >= 3.8 at rest, outside the text box) ----------
// generic prop: world shapes relative to (X,Z). p = polygon [[x,h]], s = spine [[x,h,w]] (7px floor), e = ellipse [cx,h,rx,ry],
// hole = even-odd inner polygon. Layers: 0 back light (rim glow behind a silhouette), 1 colours, 2 fog veil, 3 light (emissive shapes + glows)
const ell=(cx,h,rx,ry,n=18)=>[...Array(n)].map((_,i)=>{const a=i/n*TAU;return[cx+Math.cos(a)*rx,h+Math.sin(a)*ry]});
const rotS=(sh,a,ox,oy)=>Object.assign({},sh,sh.s?{s:sh.s.map(([x,h,w])=>{const[q]=rot([[x,h]],a,ox,oy);return[q[0],q[1],w]})}:{p:rot(sh.p,a,ox,oy),hole:sh.hole&&rot(sh.hole,a,ox,oy)});
// while a prop's main light passes behind the text box on the approach, it dims (reads as a thicker patch of fog)
const boxDim=(X,h,z)=>{const u=Math.abs(X*F/z),v=Math.abs(VY+(E-h)*F/z-539.5);return 1-0.55*clamp((616-u)/80)*clamp((277.5-v)/80)};
function prop(Z,X,body,lit,opts={}){
  const zr=opts.zr||REST;const g0=(opts.glows||[]).find(g=>!g.back)||{x:0,h:1};
  const lightOp=z=>clamp((zr+5.5-z)/4.5)*boxDim(X+g0.x,g0.h,z);
  const norm=sh=>sh.e?Object.assign({},sh,{p:ell(...sh.e)}):sh;
  body=body.map(norm);lit=lit.map(norm);const glows=opts.glows||[];
  return {grp:'w',Z,X,kind:'lm',op:z=>clamp((ZFAR-z)/FADE),
    // the light switches on as you come out of the fog, so a landmark two stations ahead never lights up the text box
    lops:[lightOp,null,z=>fogAmt(z)*0.95,lightOp],flick:opts.flick?[0,0,0,'flick']:null,drift:opts.drift?[null,null,null,opts.drift]:null,
    geom(z,id){
      const pts=sh=>sh.s?wRib(sh.s,X,z):sh.p.map(([x,h])=>P(X+x,h,z));
      const path=sh=>`<path d="${dPoly(pts(sh))}${sh.hole?dPoly(sh.hole.map(([x,h])=>P(X+x,h,z))):''}"${sh.hole?' fill-rule="evenodd"':''} fill="${sh.c}"${sh.o?` opacity="${sh.o}"`:''}/>`;
      let gi=0;const glow=g=>{const c=P(X+g.x,g.h,z),r=g.r*F/z,gid=id+'g'+(gi++);
        return `<defs>${rgrad(gid,c[0],c[1],r,[[0,g.c,g.a],[.35,g.c,g.a*.45],[1,g.c,0]],g.sy||1)}</defs><ellipse cx="${fm(c[0])}" cy="${fm(c[1])}" rx="${fm(r)}" ry="${fm(r*(g.sy||1))}" fill="url(#${gid})"/>`};
      const all=[...body,...lit].map(pts);const gb=glows.map(g=>{const c=P(X+g.x,g.h,z),r=g.r*F/z;return[[c[0]-r,c[1]-r*(g.sy||1)],[c[0]+r,c[1]+r*(g.sy||1)]]});
      const veil=body.filter(sh=>!sh.back).map(sh=>`<path d="${dPoly(pts(sh))}" fill="#242527"/>`).join('');
      return {bb:bbox([...all,...gb]),pb:all.map(l=>bbox([l])),layers:[
        glows.filter(g=>g.back).map(glow).join(''),
        body.map(path).join(''),
        veil,
        lit.map(path).join('')+glows.filter(g=>!g.back).map(glow).join('')]};
    }};
}
const keep=(X,Z,hw=2.6,dz=3)=>[X-hw,X+hw,Z-dz,Z+dz];
// station 2 — PASS = a fresh viewer names this as "a scarecrow with a glowing pumpkin head"
function scarecrow(Z,X){
  const cloth='#3a2a1c',straw='#8a6a2c';
  return prop(Z,X,[
    {p:[[-.05,-.05],[.05,-.05],[.045,2.25],[-.045,2.25]],c:'#241a10'},
    {s:[[-.8,1.72,.09],[.8,1.76,.09]],c:'#2a1f14'},
    {p:[[-.46,1.8],[.46,1.8],[.4,1.3],[.42,.95],[.3,.88],[.22,.98],[.1,.86],[-.02,.97],[-.14,.85],[-.26,.96],[-.36,.87],[-.42,.95],[-.4,1.3]],c:cloth},
    {p:[[.08,1.2],[.26,1.22],[.25,1.4],[.07,1.38]],c:'#5a3f22'},
    {s:[[-.42,1.74,.2],[-.75,1.72,.17]],c:cloth},{s:[[.42,1.76,.2],[.75,1.78,.17]],c:cloth},
    {p:[[-.75,1.8],[-.95,1.88],[-.88,1.76],[-1,1.7],[-.86,1.68],[-.93,1.58],[-.75,1.64]],c:straw},
    {p:[[.75,1.82],[.95,1.9],[.88,1.78],[1,1.72],[.86,1.7],[.93,1.6],[.75,1.66]],c:straw},
    {p:[[-.22,.9],[-.18,.7],[-.13,.9]],c:straw},{p:[[.04,.9],[.1,.68],[.15,.9]],c:straw},{p:[[.27,.9],[.33,.72],[.37,.9]],c:straw},
    {e:[0,2.02,.25,.2],c:'#8a4516'},
    {s:[[-.1,1.86,.04],[-.13,2.02,.045],[-.1,2.18,.04]],c:'#5e2e0e'},{s:[[.1,1.86,.04],[.13,2.02,.045],[.1,2.18,.04]],c:'#5e2e0e'},
    {s:[[-.34,2.2,.05],[.34,2.22,.05]],c:'#141010'},
    {p:[[-.17,2.21],[.15,2.23],[.07,2.5],[.22,2.62],[-.01,2.53]],c:'#141010'},
  ],[
    {p:[[-.14,2.02],[-.04,2.02],[-.09,2.11]],c:'#ffc15a'},{p:[[.04,2.02],[.14,2.02],[.09,2.11]],c:'#ffc15a'},
    {p:[[-.14,1.94],[.14,1.94],[.11,1.88],[.06,1.92],[.02,1.87],[-.02,1.92],[-.06,1.87],[-.11,1.9]],c:'#ffb347'},
  ],{flick:1,glows:[{x:0,h:1.98,r:.6,c:'#ffa040',a:.38},{x:0,h:1.6,r:1.5,c:'#6c7a92',a:.16,back:1}]});
}
// station 4 — PASS = "a row of glowing carved jack-o'-lanterns"
function jackRow(Z,X){
  const body=[],lit=[],glows=[];
  for(const [cx,r] of [[-.95,.26],[-.35,.33],[.25,.24],[.78,.3]]){
    body.push({e:[cx,.88*r,1.2*r,.9*r],c:'#86400f'});
    for(const sd of[-1,1])body.push({s:[[cx+sd*.42*r,.16*r,.05],[cx+sd*.55*r,.88*r,.06],[cx+sd*.42*r,1.6*r,.05]],c:'#5a2a0a'});
    body.push({s:[[cx,1.7*r,.07],[cx+.05,1.98*r,.06]],c:'#2f3316'});
    lit.push({p:[[cx-.6*r,.95*r],[cx-.15*r,.95*r],[cx-.38*r,1.32*r]],c:'#ffc45e'},{p:[[cx+.15*r,.95*r],[cx+.6*r,.95*r],[cx+.38*r,1.32*r]],c:'#ffc45e'},
      {p:[[cx-.62*r,.62*r],[cx+.62*r,.62*r],[cx+.46*r,.38*r],[cx+.2*r,.54*r],[cx,.34*r],[cx-.2*r,.54*r],[cx-.46*r,.38*r]],c:'#ffb040'});
    glows.push({x:cx,h:.9*r,r:r*2.6,c:'#ff9a30',a:.36});
  }
  glows.push({x:-.1,h:.02,r:1.7,c:'#ff9a40',a:.22,sy:.22});
  return prop(Z,X,body,lit,{flick:1,glows});
}
// station 5 — PASS = "a big crow perched on a broken tree stump"
function crowStump(Z,X){
  const bird='#07080a';
  return prop(Z,X,[
    {p:[[-.62,-.04],[-.3,.16],[-.3,.12],[-.27,.92],[-.18,1.04],[-.08,.96],[.02,1.08],[.12,.94],[.2,1.02],[.27,.9],[.3,.12],[.62,-.03],[.4,-.05],[-.4,-.05]],c:'#2a2016'},
    {s:[[-.1,.1,.05],[-.12,.85,.05]],c:'#15100b'},{s:[[.13,.1,.05],[.1,.8,.05]],c:'#15100b'},
    {p:[[-.2,1.1],[.1,1.06],[.28,1.1],[.52,1.0],[.55,1.07],[.34,1.2],[.22,1.34],[0,1.4],[-.14,1.38],[-.22,1.28]],c:bird},
    {e:[-.22,1.43,.12,.11],c:bird},
    {p:[[-.31,1.47],[-.5,1.41],[-.31,1.38]],c:'#101114'},
    {s:[[-.04,1.08,.035],[-.06,1.0,.03]],c:bird},{s:[[.08,1.08,.035],[.09,1.0,.03]],c:bird},
    {s:[[-.08,1.32,.05],[.16,1.26,.05],[.36,1.17,.04]],c:'#262a34'},
  ],[{e:[-.25,1.45,.035,.035,10],c:'#ffd24a'}],{glows:[{x:-.05,h:1.25,r:1.35,c:'#8090a8',a:.3,back:1},{x:-.25,h:1.45,r:.2,c:'#ffcc40',a:.5}]});
}
// station 6 — PASS = "an old stone well with a roof, glowing green inside"
function well(Z,X){
  const mort='#1c1b18',wood='#2a2016',sp=[];
  for(const h of[.3,.58])sp.push({s:[[-.64,h,.05],[.64,h,.05]],c:mort});
  for(const [x,a,b] of[[-.3,0,.3],[.25,0,.3],[-.05,.3,.58],[.45,.3,.58],[-.45,.58,.85],[.15,.58,.85]])sp.push({s:[[x,a,.05],[x,b,.05]],c:mort});
  return prop(Z,X,[
    {p:[[-.65,-.05],[.65,-.05],[.66,.85],[-.66,.85]],c:'#3a3832'},...sp,
    {e:[0,.86,.72,.11],c:'#4a473f'},
    {s:[[-.56,.85,.09],[-.56,1.95,.08]],c:wood},{s:[[.56,.85,.09],[.56,1.95,.08]],c:wood},
    {s:[[-.62,1.62,.07],[.62,1.62,.07]],c:wood},{s:[[.05,1.62,.03],[.05,1.28,.03]],c:'#6a5a3a'},
    {p:[[-.08,1.28],[.18,1.28],[.15,1.05],[-.05,1.05]],c:'#3a2c1c'},
    {p:[[-.92,1.86],[0,2.42],[.92,1.86],[.8,1.79],[0,2.28],[-.8,1.79]],c:'#1e1812'},
  ],[{e:[0,.88,.56,.07],c:'#b8ffcc'}],{glows:[{x:0,h:1.0,r:.95,c:'#70f0a0',a:.36,sy:.8},{x:0,h:1.55,r:.75,c:'#70f0a0',a:.14}]});
}
// station 7 — PASS = "an abandoned wooden cart with a broken wheel"
function cart(Z,X){
  const wood='#3a2a1a',dk='#1e160e',tilt=-0.1;
  const sh=[
    {p:[[-1,.55],[.9,.55],[.95,1],[-1.05,1]],c:wood},
    {s:[[-1,.7,.04],[.92,.7,.04]],c:dk},{s:[[-1,.85,.04],[.93,.85,.04]],c:dk},
    {s:[[-.95,1,.07],[-.97,1.35,.06]],c:'#2e2216'},{s:[[-.2,1,.07],[-.2,1.3,.06]],c:'#2e2216'},{s:[[.6,1,.07],[.62,1.28,.06]],c:'#2e2216'},
    {s:[[-.97,1.3,.06],[.63,1.26,.06]],c:'#2e2216'},
    {e:[-.55,1.1,.2,.15],c:'#8a4516'},{e:[-.12,1.08,.17,.13],c:'#7a3c12'},
    {p:ell(-.5,.45,.45,.45,24),hole:ell(-.5,.45,.37,.37,24),c:'#2e2216'},
    ...[0,1,2,3,4,5].map(i=>{const a=i/6*Math.PI;return{s:[[-.5-Math.cos(a)*.4,.45-Math.sin(a)*.4,.05],[-.5+Math.cos(a)*.4,.45+Math.sin(a)*.4,.05]],c:'#2e2216'}}),
    {e:[-.5,.45,.08,.08],c:'#1a140c'},
    {s:[[.9,.75,.07],[1.6,.35,.06],[1.85,.05,.05]],c:'#2e2216'},
  ].map(s=>rotS(s.e?Object.assign({},s,{p:ell(...s.e),e:null}):s,tilt,0,0));
  // mirror: shafts point toward the path, so the cart body stays inside the frame
  sh.push({p:ell(.6,.07,.44,.09,24),hole:ell(.6,.07,.34,.05,24),c:'#2e2216'});
  const lamp=rotS({p:[[.55,1.02],[.69,1.02],[.69,1.19],[.55,1.19]],c:'#ffcf7a'},tilt,0,0);
  const lh=rot([[.62,1.1]],tilt,0,0)[0];
  sh.push(rotS({s:[[.62,1.19,.03],[.62,1.28,.03]],c:'#141008'},tilt,0,0));
  const mir=o=>Object.assign({},o,o.s?{s:o.s.map(([x,h,w])=>[-x,h,w])}:{p:o.p.map(([x,h])=>[-x,h]),hole:o.hole&&o.hole.map(([x,h])=>[-x,h])});
  return prop(Z,X,sh.map(mir),[mir(lamp)],{flick:1,glows:[{x:-lh[0],h:lh[1],r:.75,c:'#ffb060',a:.4},{x:-.3,h:.02,r:1.2,c:'#ffb060',a:.18,sy:.25}]});
}
// station 8 — PASS = "a fallen mossy log with glowing mushrooms"
function logShrooms(Z,X){
  const lit=[],glows=[{x:0,h:.6,r:1.7,c:'#40c0b0',a:.12}];
  for(const [x,h,r] of[[-1.1,.58,.09],[-.95,.6,.13],[-.2,.63,.1],[.35,.58,.12],[.52,.57,.08],[1.0,.55,.1]]){
    lit.push({s:[[x,h-.1,.04],[x,h,.035]],c:'#cfeee0'},{p:[[x-r,h],[x-r*.8,h+r*.45],[x,h+r*.62],[x+r*.8,h+r*.45],[x+r,h]],c:'#7ff0d8'});
    glows.push({x,h:h+.04,r:r*4,c:'#50e0c0',a:.34});
  }
  return prop(Z,X,[
    {s:[[-1.5,.3,.56],[-.5,.33,.58],[.6,.3,.55],[1.35,.28,.5]],c:'#2c2218'},
    {s:[[-1.3,.53,.1],[0,.57,.12],[1.1,.51,.1]],c:'#2e3a1c'},
    {s:[[-.4,.5,.1],[-.55,.85,.07],[-.5,1.0,.05]],c:'#2c2218'},
    {e:[1.38,.28,.12,.26],c:'#6a5236'},{e:[1.38,.28,.06,.14],c:'#4a3824'},
  ],lit,{glows});
}
// station 9 — PASS = "glowing will-o'-wisps floating over a swamp"
function bogWisps(Z,X){
  const water=[...Array(18)].map((_,i)=>{const a=i/18*TAU;return[Math.cos(a)*1.75*(1+.07*Math.sin(i*2.3)),Math.sin(a)*1.5]});
  const it=prop(Z,X,[
    {s:[[-.9,.01,.05],[.4,.01,.05]],c:'#2c4448'},{s:[[-.3,.01,.05],[.9,.01,.05]],c:'#243a3e'},
    ...[[-1.35,.1],[-1.18,-.06],[-1.02,.12],[.95,-.1],[1.12,.08],[1.32,-.04]].flatMap(([x,l])=>[{s:[[x,0,.05],[x+l,.95,.04]],c:'#1a1a10'},{s:[[x+l*.88,.8,.08],[x+l,1.0,.08]],c:'#3a2a18'}]),
    {s:[[.3,0,.14],[.35,1.2,.1],[.2,1.7,.06]],c:'#1a1612'},{s:[[.34,1.0,.06],[.62,1.32,.05]],c:'#1a1612'},
  ],[{e:[-.6,.9,.06,.06,10],c:'#e8fcff'},{e:[.1,1.42,.05,.05,10],c:'#e8fcff'},{e:[.85,.75,.055,.055,10],c:'#e8fcff'}],
  {drift:{dx:14,d:9,dl:-3},glows:[{x:-.6,h:.9,r:.55,c:'#80e0ff',a:.45},{x:.1,h:1.42,r:.5,c:'#80e0ff',a:.42},{x:.85,h:.75,r:.5,c:'#80e0ff',a:.45},{x:0,h:.02,r:1.5,c:'#80e0ff',a:.14,sy:.22}]});
  const g=it.geom;
  it.geom=(z,id)=>{const r=g(z,id);const wp=water.map(([x,dz])=>P(X+x,0,z+dz));r.layers[1]=`<path d="${dPoly(wp)}" fill="#0b1113"/>`+r.layers[1];r.bb=bbox([[[r.bb[0],r.bb[1]],[r.bb[2],r.bb[3]]],wp]);return r};
  return it;
}
// station 11 — PASS = "a small cabin in the woods with a lit window (and someone in it)"
function cabin(Z,X,zr){
  const logs=[.3,.6,.9,1.2,1.5].map(h=>({s:[[-1.3,h,.05],[1.3,h,.05]],c:'#15100b'}));
  return prop(Z,X,[
    {p:[[-1.3,-.05],[1.3,-.05],[1.3,1.8],[-1.3,1.8]],c:'#2a2118'},...logs,
    {p:[[-1.3,1.8],[0,2.72],[1.3,1.8]],c:'#231a12'},
    {p:[[.6,2.1],[.95,2.1],[.95,3.05],[.6,3.05]],c:'#2c2a26'},
    {s:[[-1.62,1.68,.14],[0,2.86,.14],[1.62,1.68,.14]],c:'#120e0a'},
    {p:[[-.95,-.05],[-.4,-.05],[-.4,1.3],[-.95,1.3]],c:'#0c0a08'},
    {s:[[-1.05,.05,.1],[-.3,.05,.1]],c:'#1e1812'},
  ],[
    {p:[[.15,.65],[.85,.65],[.85,1.3],[.15,1.3]],c:'#ffc766'},
    {e:[.62,1.07,.09,.11],c:'#3a2410'},{p:[[.44,.65],[.8,.65],[.76,.9],[.62,.96],[.48,.9]],c:'#3a2410'},
    {s:[[.5,.65,.06],[.5,1.3,.06]],c:'#2a1a0c'},{s:[[.15,.97,.06],[.85,.97,.06]],c:'#2a1a0c'},
  ],{zr,flick:1,glows:[{x:.5,h:1.0,r:1.25,c:'#ffb050',a:.3},{x:.5,h:.02,r:1.4,c:'#ffb050',a:.2,sy:.25}]});
}
// station 12 — PASS = "a crooked wooden signpost with a skull on it"
function signpost(Z,X){
  const b='#5a4530',dk='#241a10';
  return prop(Z,X,[
    {s:[[0,-.05,.14],[.02,2.3,.12]],c:'#2e2317'},
    rotS({p:[[-.8,1.98],[-.62,2.12],[.3,2.1],[.3,1.86],[-.62,1.84]],c:b},.06,0,2),
    rotS({s:[[-.5,1.98,.04],[.1,1.98,.04]],c:dk},.06,0,2),
    rotS({p:[[-.2,1.5],[.62,1.52],[.8,1.4],[.62,1.28],[-.2,1.3]],c:b},-.14,0,1.4),
    rotS({s:[[-.05,1.41,.04],[.5,1.41,.04]],c:dk},-.14,0,1.4),
    rotS({p:[[-.34,1.0],[.34,1.0],[.34,.82],[-.34,.82]],c:'#4a3826'},.45,.3,.95),
    {e:[.0,2.42,.13,.14],c:'#cfc6b0'},{p:[[-.08,2.3],[.08,2.3],[.07,2.22],[-.07,2.22]],c:'#bdb39c'},
    {e:[-.05,2.43,.035,.045,10],c:'#141008'},{e:[.05,2.43,.035,.045,10],c:'#141008'},
  ],[],{glows:[{x:0,h:1.7,r:1.5,c:'#8a98b0',a:.26,back:1}]});
}

// ---------- the world: pure function of seeds, built once ----------
const ITEMS=[];
const OCC=[];
const EXCL=[]; // keep-clear boxes around landmarks, absolute world coords [xmin,xmax,Zmin,Zmax]
(function buildWorld(){
  const lm=(it,box)=>{ITEMS.push(it);if(box)EXCL.push(box)};
  lm(fenceItem(0*D+6.6));   // the gate is walked through: close enough (6.6 m) that it is gone by station 1
  lm(lanternPool(1*D+REST+0.05,-4.1));lm(lanternItem(1*D+REST,-5.7),[-7.6,-2.6,1*D+REST-2.5,1*D+REST+2.5]);   // far enough out that the lit glass never crosses the text box on the approach
  const rgv=rngFor(3,55);[[-2.3,9],[-3.1,9.8],[-4.0,10.5],[-5.0,11.3],[-6.1,12],[-7.2,12.7]].forEach(([X,o],i)=>ITEMS.push(graveItem(3*D+o,X,rgv,i%4)));
  EXCL.push([-8.5,-1.6,3*D+7,3*D+14]);lm(moonPool(3*D+11));
  const R=s=>s*D+REST;
  // no trunk may stand between the viewer and a landmark at its own station: screen window [xa,xb] at rest
  const occ=(s,X,hw,zr=REST)=>OCC.push({Z0:s*D,zr,xa:VX+(X-hw)*F/zr-30,xb:VX+(X+hw)*F/zr+30});
  occ(1,-5.3,.9);occ(2,4.9,1.1);occ(3,-4.7,2.6,11);occ(4,-4.6,1.3);occ(5,4.4,.8);occ(6,-4.8,1.0);occ(7,5.0,1.2);occ(8,-4.6,1.6);occ(9,4.6,1.8);occ(11,-7.1,1.7,13);occ(12,4.8,.9);
  lm(scarecrow(R(2),4.9),keep(4.9,R(2)));
  lm(jackRow(R(4),-4.6),keep(-4.6,R(4)));
  lm(crowStump(R(5),4.4),keep(4.4,R(5)));
  lm(well(R(6),-4.8),keep(-4.8,R(6)));
  lm(cart(R(7),5.0),keep(5.2,R(7),3));
  lm(logShrooms(R(8),-4.6),keep(-4.6,R(8)));
  lm(bogWisps(R(9),4.6),keep(4.6,R(9)));
  lm(cabin(R(11)+4,-7.1,REST+4),keep(-7.1,R(11)+4,3));   // a building sits further back: z=13 so it fits beside the text box
  lm(signpost(R(12),4.8),keep(4.8,R(12)));
  const clear=(X,Z,w=1)=>!EXCL.some(e=>X>e[0]&&X<e[1]&&Z>e[2]&&Z<e[3])&&
    !OCC.some(o=>{const z=((Z-o.Z0)%L+L)%L;if(z<=0.3||z>=o.zr)return false;const x=VX+X*F/z,hw=w*0.8*F/z;return x+hw>o.xa&&x-hw<o.xb});
  // keep the harvest moon visible from station 10 (screen rect of the moon)
  const moonHole=bb=>bb&&bb[2]>1480&&bb[0]<1840&&bb[1]<290;
  const inMoon=(X,Zabs)=>{const z=((Zabs-10*D)%L+L)%L;if(z<0.5||z>ZFAR)return false;const x=VX+X*F/z;return x>1500&&x<1800};
  for(let seg=0;seg<NS;seg++){
    const r=rngFor(seg,11), Z0=seg*D;
    const add=(X,off,w)=>{X=Math.sign(X)*Math.max(Math.abs(X),2.3+w*0.6);const Z=Z0+off;if(clear(X,Z,w)&&!inMoon(X,Z))ITEMS.push(treeItem(Z,X,w,rngFor(seg,Math.round(off*97),Math.round(X*131))))};
    for(const sd of[-1,1]){
      const off=rr(r,3.0,5.4); let k=rr(r,0.5,0.72); if(seg===10&&sd>0)k=0.8;
      add(sd*Math.max(2.1,off*k),off,rr(r,0.7,1.1));                         // near frame trunk
      const n2=1+Math.floor(r()*2);for(let i=0;i<n2;i++)add(sd*rr(r,3.8,9),rr(r,1.5,6),rr(r,0.45,0.9));
    }
    const nf=3+Math.floor(r()*3);for(let i=0;i<nf;i++){const sd=r()<.5?-1:1;add(sd*rr(r,2.4,16),rr(r,0,D),rr(r,0.35,0.75))}
    // overhead limbs, one or two per segment
    const rl=rngFor(seg,77);
    for(const sd of[-1,1]){if(rl()<.3)continue;const Z=Z0+rr(rl,0,D);const it=limbItem(Z,sd,rl);
      const z10=((Z-10*D)%L+L)%L;if(z10>4&&z10<ZFAR&&moonHole(it.geom(z10,'x').bb))continue;ITEMS.push(it)}
    // fog: shafts in the gaps between trunks, low ground fog
    const rf=rngFor(seg,23);
    for(let i=0;i<2;i++){const sd=rf()<.5?-1:1;ITEMS.push(fogShaft(Z0+rr(rf,0,D),sd*rr(rf,2.6,9),rr(rf,1.3,2.8),rf))}
    ITEMS.push(groundFog(Z0+rr(rf,0,D),rr(rf,-6,6),rr(rf,5,10),rf));
    // ground decals (all drawn into the one ground layer)
    const rg=rngFor(seg,37);
    for(let i=0;i<12;i++){const onPath=rg()<.55;leaf(Z0+rr(rg,0,D),onPath?rr(rg,-1.3,1.3):(rg()<.5?-1:1)*rr(rg,1.5,3.6),rg)}
    for(let i=0;i<2;i++){const sd=rg()<.5?-1:1;root(Z0+rr(rg,0,D),sd*rr(rg,1.5,2.6),sd,rg)}
    for(let i=0;i<2;i++)stone(Z0+rr(rg,0,D),rr(rg,-2,2),rg);
    for(let i=0;i<3;i++){const sd=rg()<.5?-1:1;tuft(Z0+rr(rg,0,D),sd*rr(rg,1.5,2.4),rg)}
    for(let i=0;i<2;i++){const Z=Z0+rr(rg,0,D);patch(Z,pathC(Z)+rr(rg,-0.6,0.6),rg)}
  }
})();

// station 10 — PASS = "a big orange harvest moon behind the trees"
function moonSvg(){const cx=1650,cy=158,R=84;
  return `<defs><radialGradient id="mh"><stop offset="0" stop-color="#e88a3a" stop-opacity=".4"/><stop offset=".35" stop-color="#c8662a" stop-opacity=".15"/><stop offset="1" stop-color="#c8662a" stop-opacity="0"/></radialGradient>
  <radialGradient id="md" cx=".44" cy=".42" r=".56"><stop offset="0" stop-color="#f6ae66"/><stop offset=".62" stop-color="#e3813a"/><stop offset=".86" stop-color="#c9642a" stop-opacity=".95"/><stop offset="1" stop-color="#b8561f" stop-opacity="0"/></radialGradient>
  <radialGradient id="md2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8904a" stop-opacity=".55"/><stop offset=".8" stop-color="#d0702c" stop-opacity=".35"/><stop offset="1" stop-color="#b8561f" stop-opacity="0"/></radialGradient>
  <radialGradient id="mm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#b85a24" stop-opacity=".32"/><stop offset="1" stop-color="#b85a24" stop-opacity="0"/></radialGradient></defs>
  <circle cx="${cx}" cy="${cy}" r="${R*3.2}" fill="url(#mh)"/><ellipse cx="${cx+5}" cy="${cy-3}" rx="${R*1.14}" ry="${R*1.1}" fill="url(#md2)"/><circle cx="${cx}" cy="${cy}" r="${R*1.16}" fill="url(#md)"/>
  <ellipse cx="${cx-18}" cy="${cy-10}" rx="46" ry="34" fill="url(#mm)"/><ellipse cx="${cx+26}" cy="${cy+24}" rx="34" ry="26" fill="url(#mm)"/>
  <path d="${dPoly(ribbon([[cx+200,cy+62,20],[cx+110,cy+30,15],[cx+30,cy+14,12],[cx-40,cy-18,10],[cx-110,cy-30,8]]))}${dPoly(ribbon([[cx+60,cy+22,10],[cx+40,cy+70,9],[cx+14,cy+104,7]]))}${dPoly(ribbon([[cx-10,cy,9],[cx-18,cy-44,8],[cx-6,cy-78,7]]))}${dPoly(ribbon([[cx-60,cy-24,8],[cx-96,cy-66,7]]))}" fill="#050505"/>`;}

// ---------- pure item-model helpers read by mount()/collect() ----------
function zrel(it,c){return ((it.Z-c*D)%L+L)%L}
function fm4(n){return Math.round(n*10000)/10000}
function collect(c,walking){
  const ext=walking?D:0;const list=[];
  for(const it of ITEMS){const z=zrel(it,c);if(z>1&&z<=ZFAR+ext)list.push([z,it])}   // nothing closer than 1 m: it would be a blob
  list.sort((a,b)=>b[0]-a[0]);return list;
}

return {
  items: ITEMS, gitems: GITEMS, collect, groundSvg, groundKF, moonSvg, names: NAMES, seed,
  constants: { W,H,VX,VY,F,E,NS,L,D,REST,ZFAR,FADE,ZMIN,M,KCAP,STOPS,DUR,CAPFADE,EASE, zrel,clamp,fm,fm4,bez },
};
}
