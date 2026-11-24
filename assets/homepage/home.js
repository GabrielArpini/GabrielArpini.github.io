"use strict";

const mast = document.querySelector(".mast");
const writingLink = mast.querySelector('a[href="#writing"]');
const chapters = ["about","language","flight","after-hours","writing"].map(id=>document.getElementById(id));
const [about, language, flight, night, writing] = chapters;
const opening = document.getElementById("opening-field");
const openingContext = opening.getContext("2d");
const airframe = document.querySelector(".airframe");
const flightBeats = Array.from(flight.querySelectorAll("[data-flight-beat]"));
const flightTitle = document.getElementById("flight-display");
const globe = document.getElementById("globe");
const nightCanvas = document.getElementById("night-contours");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce), (max-height: 470px)");
const clamp = value => Math.min(1, Math.max(0, value));
const ease = value => { const t = clamp(value); return t*t*(3-2*t); };
const rad = Math.PI/180;

let frame, renderFlight, currentChapter, activeBeat, lastTick;
let lastOpening = -Infinity, lastMap = -Infinity, lastFlight = -Infinity, lastNight = -Infinity;
let cameraProgress = 0, mapProgress = 0, lastVisible = false, lastMapVisible = false;
const mapContext = globe.getContext("2d");
const contourContext = nightCanvas.getContext("2d");

function canvasSize(canvas, context) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.round(width*scale), h = Math.round(height*scale);
  if (canvas.width!==w || canvas.height!==h) {canvas.width=w;canvas.height=h;}
  context.setTransform(scale,0,0,scale,0,0);
  context.clearRect(0,0,width,height);
  return [width,height];
}

function fillPolygon(ctx,points,paint){
  ctx.fillStyle=paint;
  ctx.beginPath();
  points.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
  ctx.closePath();
  ctx.fill();
}

function openingGrain(ctx,w,h,color){
  ctx.fillStyle=color;
  let seed=29197;
  const sample=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<990;i++){
    const x=w*(.35+.65*sample()),y=h*sample();
    ctx.globalAlpha=.12+sample()*.40;
    ctx.fillRect(x,y,1,1);
  }
  ctx.globalAlpha=1;
}

function paintWindow(ctx,w,h,time){
  const shift=Math.sin(time*.27)*w*.025;
  const x=w*(w<620?.69:.74), y=h*.27;
  const corners=[[x-w*.045,y+h*.072],[x+w*.135,y],[x+w*.135,y+h*.313],[x-w*.045,y+h*.274]];
  const glow=ctx.createRadialGradient(x+w*.07,y+h*.20,0,x+w*.07,y+h*.20,Math.max(w,h)*.42);
  glow.addColorStop(0,"#c18c4d59");glow.addColorStop(.57,"#90664521");glow.addColorStop(1,"#171d2500");
  ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);

  fillPolygon(ctx,[[x-w*.16,y-h*.19],[w,y-h*.31],[w,y+h*.40],[x-w*.16,y+h*.337]],"#15252d");
  fillPolygon(ctx,[[x-w*.16,y+h*.337],[w,y+h*.40],[w,h],[x-w*.29,h]],"#142027");
  const pool=ctx.createLinearGradient(x,y+h*.27,x-w*.20,h);
  pool.addColorStop(0,"#d8a66aa8");pool.addColorStop(.71,"#ab785535");pool.addColorStop(1,"#4c4d4b06");
  fillPolygon(ctx,[corners[3],corners[2],[w*.93+shift,h],[w*.46+shift,h]],pool);
  const pane=ctx.createLinearGradient(x,y,x+w*.14,y+h*.32);
  pane.addColorStop(0,"#ebcf9a");pane.addColorStop(.48,"#dfa96c");pane.addColorStop(1,"#a57551");
  fillPolygon(ctx,corners,pane);
  fillPolygon(ctx,[[x-w*.052,y+h*.058],[x+w*.139,y-h*.017],[x+w*.140,y],[x-w*.052,y+h*.077]],"#372c28");

  ctx.strokeStyle="#453c33";ctx.lineWidth=Math.max(1.4,w*.0022);ctx.beginPath();
  const separation=x+w*.03;
  ctx.moveTo(separation,y+h*.044);ctx.lineTo(separation,y+h*.29);
  ctx.moveTo(x-w*.045,y+h*.169);ctx.lineTo(x+w*.135,y+h*.159);
  ctx.stroke();
  fillPolygon(ctx,[[separation,y+h*.29],[separation+w*.005,y+h*.291],[w*.64+shift,h],[w*.617+shift,h]],"#17222a54");
  openingGrain(ctx,w,h,"#e3bb8240");
}

function paintPlate(ctx,w,h,time){
  const narrow=w<620, step=narrow?19:25, x=w*(narrow?.73:.77), y=h*.49;
  const size=Math.min(w*(narrow?.46:.31),h*.53), turn=time*.16;
  ctx.strokeStyle="#59645225";ctx.lineWidth=1;ctx.beginPath();
  for(let i=w*.42;i<w;i+=step){ctx.moveTo(i,0);ctx.lineTo(i,h);}
  for(let i=step;i<h;i+=step){ctx.moveTo(w*.42,i);ctx.lineTo(w,i);}
  ctx.stroke();
  for(let line=0;line<29;line++){
    const r=size*(.19+.035*line);
    ctx.strokeStyle=line%6===0?"#48594e92":"#6070606d";
    ctx.lineWidth=line%6===0?1.2:.75;ctx.beginPath();
    for(let n=0;n<=132;n++){
      const a=n*Math.PI/66;
      const fold=.82+.18*Math.cos(3*a+turn+line*.045)+.14*Math.sin(2*a+.9);
      const px=x+r*Math.cos(a)*fold*1.25;
      const py=y+r*Math.sin(a)*fold*.91;
      if(n===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      if(n%16===0&&line%4===0){
        ctx.fillStyle=line<17?"#963e2ba8":"#4d605272";
        ctx.fillRect(px-1.5,py-1.5,3,3);
      }
    }
    ctx.closePath();ctx.stroke();
  }
  openingGrain(ctx,w,h,"#4358444f");
}

function paintThermal(ctx,w,h,time){
  const x=w*(w<620?.75:.79), y=h*.51, radius=Math.min(w*.47,h*.67);
  const shift=Math.sin(time*.19)*radius*.13;
  const center=ctx.createRadialGradient(x+shift,y-radius*.08,radius*.02,x,y,radius);
  center.addColorStop(0,"#ffbe77e8");center.addColorStop(.20,"#d65d52cf");
  center.addColorStop(.45,"#8c3a68bc");center.addColorStop(.71,"#503259a3");center.addColorStop(1,"#2c214000");
  ctx.fillStyle=center;
  ctx.fillRect(w*.31,0,w*.69,h);

  const shadow=ctx.createLinearGradient(x-radius*.45,0,x+radius*.50,h);
  shadow.addColorStop(0,"#15172100");shadow.addColorStop(.47,"#221d3300");
  shadow.addColorStop(.53,"#3a284b98");shadow.addColorStop(.70,"#252738b0");shadow.addColorStop(1,"#23192400");
  fillPolygon(ctx,[[w*.60,0],[w,0],[w,h],[w*.38,h]],shadow);

  const pixel=w<620?8:11;
  for(let row=0;row<h/pixel;row++){
    for(let col=Math.floor(w*.51/pixel);col<w/pixel;col++){
      const dx=(col*pixel-x-shift)/radius;
      const dy=(row*pixel-y)/radius;
      const field=1-Math.hypot(dx*1.06,dy*.86)+Math.sin(dy*8+dx*4+time*.32)*.10;
      if(field<.16)continue;
      ctx.fillStyle=field>.65?"#ffce8f":"#ad78a5";
      ctx.globalAlpha=field*.38;
      const size=field> .45 ? 2.5 : 1.5;
      ctx.fillRect(col*pixel,row*pixel,size,size);
    }
  }
  ctx.globalAlpha=1;
  openingGrain(ctx,w,h,"#ffdba158");
}

function paintOpening(time){
  if(!openingContext)return;
  const ctx=openingContext,[w,h]=canvasSize(opening,ctx);
  if(!w||!h)return;
  const paint={window:paintWindow,plate:paintPlate,thermal:paintThermal}[about.dataset.opening]??paintWindow;
  paint(ctx,w,h,time);
}

function sphereFrontDepth(x,y,radius,centerDepth=0){
  const squared=radius*radius-x*x-y*y;
  return squared<0?-Infinity:centerDepth+Math.sqrt(squared);
}

function lunarOrbit(angle,radius){
  const tilt=65*rad, bearing=-17*rad;
  const u=radius*Math.cos(angle), v=radius*Math.sin(angle)*Math.cos(tilt);
  return [
    u*Math.cos(bearing)-v*Math.sin(bearing),
    u*Math.sin(bearing)+v*Math.cos(bearing),
    radius*Math.sin(angle)*Math.sin(tilt)
  ];
}

function isLand(longitude,latitude){
  const row=Math.max(0,Math.min(landMask.length-1,Math.round((latitude/rad+88)/2)));
  const column=((Math.round((longitude/rad+180)/2)%180)+180)%180;
  return landMask[row][column]==="1";
}

function paintWorld(progress,time){
  if(!mapContext)return;
  const ctx=mapContext,[w,h]=canvasSize(globe,ctx);
  if(!w||!h)return;

  const compact=w<760;
  const radius=compact?Math.min(w*.27,h*.189):Math.min(h*.29,w*.205);
  const centerX=w*(compact?.56:.738), centerY=h*(compact?.213:.48);
  const yaw=(-14+28*progress+time*1.05)*rad;
  const north=24*rad, a=Math.sin(north), b=Math.cos(north);
  const orbitRadius=radius*1.48, lunarRadius=radius*.107;
  const moon=lunarOrbit(-.60+time*.105+progress*.13,orbitRadius);
  const step=Math.max(compact?3.15:3.9,radius/54);
  const pointRadius=compact?.87:1.12;
  const batches=new Map();

  // Fix sampling to the display lattice so dots retain their shape at the poles and limb.
  function dot(x,y,r,ink){
    let points=batches.get(ink);
    if(!points){points=[];batches.set(ink,points);}
    points.push(centerX+x,centerY+y,r);
  }

  const registration=compact?20:25;
  for(let row=-Math.ceil(centerY/registration);row<(h-centerY)/registration;row++){
    for(let col=-Math.ceil(centerX/registration);col<(w-centerX)/registration;col++){
      const x=col*registration, y=row*registration;
      if(sphereFrontDepth(x,y,radius)!==-Infinity)continue;
      if(sphereFrontDepth(x-moon[0],y-moon[1],lunarRadius,moon[2])!==-Infinity)continue;
      dot(x,y,(row%4===0&&col%4===0)?.71:.41,"#35434639");
    }
  }

  const limit=radius/step;
  for(let row=-Math.floor(limit);row<=limit;row++){
    const y=row*step;
    for(let col=-Math.floor(limit);col<=limit;col++){
      const x=col*step,z=sphereFrontDepth(x,y,radius);
      if(z===-Infinity)continue;
      if(sphereFrontDepth(x-moon[0],y-moon[1],lunarRadius+step*.65,moon[2])>z)continue;
      const latitude=Math.asin(Math.max(-1,Math.min(1,(z*a-y*b)/radius)));
      const longitude=yaw+Math.atan2(x,z*b+y*a);
      if(isLand(longitude,latitude)){
        dot(x,y,pointRadius,"#101b1b");
      }else if(row%3===0&&col%3===0){
        dot(x,y,.52,"#42525082");
      }
    }
  }

  // Compare visible surface depths in the same frame, even when the disks partially overlap.
  for(let i=0;i<174;i++){
    const [x,y,z]=lunarOrbit(i*Math.PI*2/174,orbitRadius);
    if(sphereFrontDepth(x,y,radius)>z)continue;
    if(sphereFrontDepth(x-moon[0],y-moon[1],lunarRadius,moon[2])>z)continue;
    dot(x,y,.65,z>0?"#3e5250a6":"#4d5d5b73");
  }

  const lunarStep=step*.82;
  const lunarLimit=Math.floor(lunarRadius/lunarStep);
  for(let row=-lunarLimit;row<=lunarLimit;row++){
    for(let col=-lunarLimit;col<=lunarLimit;col++){
      const dx=col*lunarStep,dy=row*lunarStep;
      const z=sphereFrontDepth(dx,dy,lunarRadius,moon[2]);
      if(z===-Infinity)continue;
      const x=moon[0]+dx,y=moon[1]+dy;
      if(sphereFrontDepth(x,y,radius)>z)continue;
      dot(x,y,pointRadius,"#090f10");
    }
  }

  for(const [ink,points] of batches){
    ctx.fillStyle=ink;
    ctx.beginPath();
    for(let i=0;i<points.length;i+=3){
      const x=points[i],y=points[i+1],r=points[i+2];
      ctx.moveTo(x+r,y);
      ctx.arc(x,y,r,0,Math.PI*2);
    }
    ctx.fill();
  }
}

function paintContours(time){
  if(!contourContext)return;
  const ctx=contourContext,[w,h]=canvasSize(nightCanvas,ctx);
  if(!w||!h)return;
  const x=w*.79,y=h*.47,narrow=w<760;
  for(let i=0;i<18;i++){
    const r=50+i*(narrow?22:31);
    ctx.beginPath();
    for(let n=0;n<=144;n++){
      const angle=n*Math.PI/72;
      const wobble=1+.12*Math.sin(angle*3+i*.24+time*.23)+.085*Math.sin(angle*5-time*.17);
      const px=x+Math.cos(angle)*r*wobble*1.58;
      const py=y+Math.sin(angle)*r*wobble*.86;
      if(n===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      if(n%9===0){
        ctx.fillStyle=i%4===0?"#d6b67a79":"#82a69a56";
        ctx.fillRect(px-1,py-1,i%4===0?3:2,i%4===0?3:2);
      }
    }
    ctx.strokeStyle=i%4===0?"#d0ae6d44":"#8fa8993c";ctx.lineWidth=1;ctx.stroke();
  }
}

function progress(section){
  const travel=section.offsetHeight-section.firstElementChild.offsetHeight;
  return clamp((mast.offsetHeight-section.getBoundingClientRect().top)/Math.max(1,travel));
}
function schedule(){
  if(frame===undefined&&!document.hidden)frame=requestAnimationFrame(update);
}
function invalidate(){
  lastOpening=lastMap=lastFlight=lastNight=-Infinity;
  schedule();
}
const visible=section=>{
  const bounds=section.getBoundingClientRect();
  return bounds.top<innerHeight && bounds.bottom>mast.offsetHeight;
};

function update(now){
  frame=undefined;
  const still=reduceMotion.matches, time=still?0:now*.001;
  const aboutVisible=visible(about), mapVisible=visible(language), flightVisible=visible(flight), nightVisible=visible(night);
  const delta=lastTick===undefined?0:Math.min(.05,Math.max(0,(now-lastTick)*.001));
  lastTick=now;
  const target=still?0:progress(flight);
  if(!lastVisible||still) cameraProgress=target;
  else cameraProgress+=(target-cameraProgress)*(1-Math.exp(-delta*2.9));
  lastVisible=flightVisible;
  const mapTarget=still?.09:progress(language);
  if(!lastMapVisible||still) mapProgress=mapTarget;
  else mapProgress+=(mapTarget-mapProgress)*(1-Math.exp(-delta*1.25));
  lastMapVisible=mapVisible;

  if(aboutVisible&&(lastOpening===-Infinity||(!still&&now-lastOpening>32))){
    paintOpening(time+.8);lastOpening=now;
  }
  if(lastMap===-Infinity||(mapVisible&&!still&&now-lastMap>32)){
    paintWorld(mapProgress,time);lastMap=now;
  }
  if(flightVisible&&(lastFlight===-Infinity||(!still&&now-lastFlight>48))){
    if(renderFlight===undefined)renderFlight=window.mountAirframe?.(airframe)??null;
    renderFlight?.(cameraProgress,time);
    flight.style.setProperty("--horizon-shift", (Math.sin(time*.17)*2.5 + cameraProgress*6).toFixed(2)+"%");
    lastFlight=now;
  }
  if(nightVisible&&(lastNight===-Infinity||(!still&&now-lastNight>65))){
    paintContours(time);lastNight=now;
  }

  const beat=cameraProgress<.33?0:cameraProgress<.70?1:2;
  if(beat!==activeBeat){
    activeBeat=beat;
    flight.dataset.beat=String(beat);
    flightTitle.firstChild.data=["Design","Engineering","First principles"][beat];
    flightBeats.forEach((item,i)=>item.toggleAttribute("data-active",i===beat));
  }
  let active=0;
  chapters.forEach((section,i)=>{if(section.getBoundingClientRect().top<innerHeight*.43)active=i;});
  if(active!==currentChapter){
    currentChapter=active;
    if(chapters[active]===writing)writingLink.setAttribute("aria-current","location");
    else writingLink.removeAttribute("aria-current");
  }
  mast.style.setProperty("--page",clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)));
  if(!still&&(aboutVisible||mapVisible||flightVisible||nightVisible))schedule();
}
function applyMotion(){
  document.documentElement.classList.toggle("motion",!reduceMotion.matches);
  invalidate();
}
addEventListener("scroll",schedule,{passive:true});
addEventListener("resize",invalidate);
reduceMotion.addEventListener("change",applyMotion);
document.addEventListener("visibilitychange",()=>{
  lastTick=undefined;
  if(document.hidden){cancelAnimationFrame(frame);frame=undefined;}else invalidate();
});
document.fonts?.ready.then(invalidate);
applyMotion();
