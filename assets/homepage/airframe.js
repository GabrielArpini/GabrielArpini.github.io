/* Scroll camera over the credited FlightGear airframe. */
window.mountAirframe = function mountAirframe(host) {
  const THREE = window.THREE;
  if (!THREE || !window.blackbirdMesh) return null;

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  let p = 0, elapsed = 0, width = 0, height = 0, renderer;
  function beginCanvas() {
    renderer = window.makeCanvasFlight(THREE);
    host.replaceChildren(renderer.domElement);
    host.dataset.render = 'canvas';
  }
  try {
    if (new URLSearchParams(location.search).has('canvas')) beginCanvas();
    else {
      renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
      renderer.setClearColor(0, 0);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.23;
      host.replaceChildren(renderer.domElement);
      host.dataset.render = 'webgl';
    }
  } catch {
    try { beginCanvas(); }
    catch { return null; }
  }
  const world = new THREE.Scene();
  const perspective = new THREE.PerspectiveCamera(45, 1, .035, 170);
  perspective.up.set(0, 1, 0);
  const ambient = new THREE.HemisphereLight(0xf7dfbb, 0x574c76, 2.05);
  const sunlight = new THREE.DirectionalLight(0xffd2a6, 3.1);
  sunlight.position.set(1, 11, -17);
  const rim = new THREE.DirectionalLight(0xe3b7e7, 2.55);
  rim.position.set(-3, 5, 15);
  const fill = new THREE.DirectionalLight(0xa7e9f5, 1.35);
  fill.position.set(13, -3, -1);
  world.add(ambient, sunlight, rim, fill);

  function words(text, signed) {
    const bytes = Uint8Array.from(atob(text), char => char.charCodeAt(0));
    return signed ? new Int16Array(bytes.buffer) : new Uint16Array(bytes.buffer);
  }
  const source = window.blackbirdMesh;
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(words(source.positions, true), value => value / 1000), 3));
  bodyGeometry.setIndex(new THREE.BufferAttribute(words(source.indices, false), 1));
  bodyGeometry.computeVertexNormals();
  bodyGeometry.computeBoundingSphere();
  const metal = new THREE.MeshPhysicalMaterial({color: 0x25283a, metalness: .33, roughness: .49, side: THREE.DoubleSide, clearcoat: .20, clearcoatRoughness: .4});
  const plane = new THREE.Mesh(bodyGeometry, metal);
  world.add(plane);

  metal.color.setHex(0x4a5663);
  metal.emissive.setHex(0x101317);
  // This display section follows the silhouettes in Figure 19, in scene units.
  const shell = new THREE.MeshStandardMaterial({color:0x4c5963,metalness:.31,roughness:.48,side:THREE.DoubleSide});
  const steel = new THREE.MeshStandardMaterial({color:0x7c8890,metalness:.39,roughness:.52,side:THREE.DoubleSide});
  const edge = new THREE.MeshStandardMaterial({color:0xbec3bf,metalness:.24,roughness:.64,side:THREE.DoubleSide});
  const olive = new THREE.MeshStandardMaterial({color:0x64764a,metalness:.22,roughness:.52,side:THREE.DoubleSide});
  const dark = new THREE.MeshStandardMaterial({color:0x333d42,metalness:.24,roughness:.52,side:THREE.DoubleSide});
  const warm = new THREE.MeshStandardMaterial({color:0x5f5550,metalness:.25,roughness:.52,side:THREE.DoubleSide});
  const ghost = metal.clone();
  ghost.transparent = true;
  ghost.opacity = .19;
  ghost.depthWrite = false;

  const inlet = new THREE.Vector3(4.104,-.705,-2.4);
  const outlet = new THREE.Vector3(4.215,-.376,-12.9);
  function mountNacelle(direction,name){
    const mouth=inlet.clone();
    const exit=outlet.clone();
    mouth.x*=direction;
    exit.x*=direction;
    const downstream=exit.sub(mouth).normalize();
    const side=new THREE.Vector3(0,1,0).cross(downstream).normalize();
    const vertical=downstream.clone().cross(side);
    const mount=new THREE.Group();
    mount.name=name;
    mount.position.copy(mouth);
    mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,vertical,downstream));
    world.add(mount);
    return mount;
  }
  const section=mountNacelle(1,'J58 propulsion section');


  function revolve(profile,material,sweep=Math.PI*2){
    const geometry = new THREE.LatheGeometry(profile.map(([z,r])=>new THREE.Vector2(r,z)),36,0,sweep);
    geometry.rotateX(Math.PI/2);
    return new THREE.Mesh(geometry,material);
  }

  function cutWall(profile,thickness,material){
    const inner=profile.map(([z,r])=>[z,r-thickness]);
    const jacket=revolve([...profile,...inner.reverse(),profile[0]],material,Math.PI);
    const lips=[];
    for(const sign of [-1,1]){
      for(let i=1;i<profile.length;i++){
        const [z0,r0]=profile[i-1], [z1,r1]=profile[i];
        const a=[0,sign*r0,z0], b=[0,sign*r1,z1], c=[0,sign*(r1-thickness),z1], d=[0,sign*(r0-thickness),z0];
        lips.push(...a,...b,...c,...a,...c,...d);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(lips,3));
    geometry.computeVertexNormals();
    section.add(jacket,new THREE.Mesh(geometry,edge));
  }

  const inletWall=[[-.01,.75],[.10,.79],[.42,.81],[1.16,.82],[1.68,.79],[2.26,.82],[3.47,.87],[4.06,.86]];
  const nacelleWall=[[4.06,.86],[4.42,.86],[5.79,.86],[7.48,.85],[8.48,.86],[9.03,.89]];
  const engineWall=[[3.75,.58],[4.01,.60],[4.29,.59],[4.55,.62],[5.03,.63],[5.35,.66],
    [5.73,.63],[6.10,.66],[6.79,.66],[7.10,.63],[7.44,.64],[7.75,.64],[8.07,.66],[8.63,.66],[9.01,.63]];
  cutWall(inletWall,.045,shell);
  cutWall(nacelleWall,.044,shell);
  cutWall(engineWall,.052,steel);

  const spike=revolve([[-1.60,0],[.19,.44],[.50,.44],[.65,.34],[1.02,.33],[1.28,.44],
    [1.90,.35],[2.50,.31],[3.37,.24],[3.81,.22],[3.81,0]],olive);
  section.add(spike);
  section.add(revolve([[3.72,0],[3.72,.20],[4.50,.30],[5.18,.33],[6.10,.31],
    [6.81,.26],[7.12,.21],[7.12,0]],dark));

  function bladeRow(z,radius,root,material,count){
    const row=new THREE.Group();
    row.position.z=z;
    const geometry=new THREE.BoxGeometry(radius-root,.038,.13);
    for(let blade=0;blade<count;blade++){
      const angle=blade*2*Math.PI/count;
      const vane=new THREE.Mesh(geometry,material);
      const center=(radius+root)*.5;
      vane.position.set(Math.cos(angle)*center,Math.sin(angle)*center,0);
      vane.rotation.set(.12,.22,angle+.18);
      row.add(vane);
    }
    section.add(row);
    return row;
  }
  const rows=[
    bladeRow(4.22,.54,.29,steel,25),bladeRow(4.52,.56,.30,edge,23),
    bladeRow(4.83,.56,.32,steel,25),bladeRow(5.14,.58,.32,edge,23),
    bladeRow(6.43,.55,.30,warm,23),bladeRow(6.69,.55,.28,steel,25),
  ];
  cutWall([[5.31,.51],[5.56,.58],[6.01,.59],[6.28,.51]],.06,warm);
  cutWall([[6.92,.61],[7.25,.62],[7.96,.62],[8.75,.63],[9.08,.59]],.038,warm);

  // Separate inner exhaust from the surrounding ejector petals at the aft end.
  cutWall([[8.98,.87],[9.22,.84],[9.46,.72],[9.68,.64]],.05,shell);
  cutWall([[8.97,.59],[9.16,.55],[9.56,.45],[9.76,.53]],.042,steel);
  const ejectorPetals=new THREE.Group();
  const exitPetals=15;
  for (let i=0;i<exitPetals;i++){
    const petal=revolve([[9.55,.69],[9.81,.76],[10.27,.82],[10.57,.81],[10.57,.766],
      [10.27,.776],[9.81,.716],[9.55,.645],[9.55,.69]],i%2?steel:shell,Math.PI/exitPetals-.014);
    petal.rotation.z=i*Math.PI/exitPetals;
    ejectorPetals.add(petal);
  }
  section.add(ejectorPetals);
  const exhaustLight=new THREE.PointLight(0xeaa36c,0,2.8,1.7);
  exhaustLight.position.set(-.22,0,8.9);
  section.add(exhaustLight);

  function sample(profile,z){
    const next=profile.findIndex(([station])=>station>=z);
    if(next<0)return profile.at(-1)[1];
    if(next===0)return profile[0][1];
    const [a,x]=profile[next-1], [b,y]=profile[next];
    return lerp(x,y,(z-a)/(b-a));
  }
  function makeStream(parent,paths,{start,middle,end,speed,travel,ink,hot=false,particles=false}){
    const colors=[new THREE.Color(start),new THREE.Color(middle),new THREE.Color(end)];
    const tint=new THREE.Color();
    const tintAt=(along,light=1)=>{
      const segment=along<.53?0:1;
      const weight=segment===0?along/.53:(along-.53)/.47;
      return tint.copy(colors[segment]).lerp(colors[segment+1],weight).multiplyScalar(light);
    };
    const vertices=[], vertexColors=[];
    for(const path of paths)for(let i=0;i<56;i++){
      for(const along of [i/56,(i+1)/56]){
        vertices.push(...path(along));
        vertexColors.push(...tintAt(along).toArray());
      }
    }
    const lineGeometry=new THREE.BufferGeometry();
    lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    lineGeometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));
    const lines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({
      vertexColors:true,transparent:true,depthWrite:false,opacity:.24
    }));
    lines.userData.fallbackInk=new THREE.Color(ink);
    lines.userData.glowing=hot;

    const count=paths.length*4, positions=new Float32Array(count*6), trailColors=new Float32Array(count*6);
    const trailGeometry=new THREE.BufferGeometry();
    trailGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setAttribute('color',new THREE.BufferAttribute(trailColors,3).setUsage(THREE.DynamicDrawUsage));
    const trails=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({
      vertexColors:true,transparent:true,depthWrite:false,opacity:.78
    }));
    trails.frustumCulled=false;
    trails.userData.fallbackInk=new THREE.Color(middle);
    parent.add(lines,trails);
    let dots, dotPositions, dotColors;
    if(particles){
      dotPositions=new Float32Array(paths.length*9);
      dotColors=new Float32Array(dotPositions.length);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(dotPositions,3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('color',new THREE.BufferAttribute(dotColors,3).setUsage(THREE.DynamicDrawUsage));
      dots=new THREE.Points(geometry,new THREE.PointsMaterial({
        vertexColors:true,size:hot?.087:.065,transparent:true,depthWrite:false,
        blending:hot?THREE.AdditiveBlending:THREE.NormalBlending
      }));
      dots.frustumCulled=false;
      dots.userData.fallbackInk=new THREE.Color(middle);
      dots.userData.glowing=hot;
      parent.add(dots);
    }
    return (time,strength,particleStrength=0)=>{
      lines.material.opacity=(hot?.44:.34)*strength;
      trails.material.opacity=(hot?.94:.88)*strength;
      if(dots){
        dots.material.opacity=particleStrength;
        dots.visible=particleStrength>.02;
      }
      for(let row=0;row<paths.length;row++)for(let i=0;i<4;i++){
        const phase=(i*.25+row*.073+time*speed)%1;
        const tail=Math.max(0,phase-travel*(.77+.12*(row%4)));
        const offset=(row*4+i)*6;
        positions.set(paths[row](tail),offset);
        const head=paths[row](phase);
        positions.set(head,offset+3);
        trailColors.set(tintAt(tail,.30).toArray(),offset);
        const bright=tintAt(phase,1.35).toArray();
        trailColors.set(bright,offset+3);
        if(dots?.visible&&i<3){
          const index=(row*3+i)*3;
          dotPositions.set(head,index);
          dotColors.set(bright,index);
        }
      }
      trailGeometry.attributes.position.needsUpdate=true;
      trailGeometry.attributes.color.needsUpdate=true;
      if(dots?.visible){
        dots.geometry.attributes.position.needsUpdate=true;
        dots.geometry.attributes.color.needsUpdate=true;
      }
    };
  }
  const radial=(angle,z,r)=>[Math.cos(angle)*r,Math.sin(angle)*r,z];
  const spread=(count,span=2.84)=>Array.from({length:count},(_,i)=>Math.PI+(i/(count-1)-.5)*span);

  const intake=makeStream(section,spread(23).map((angle,i)=>u=>{
    const z=lerp(-2.03,4.13,u);
    const radius=sample([[-2.03,.94],[-.25,.78],[.56,.66],[1.56,.64],[2.6,.71],[4.13,.54]],z)
      +((i%7)-3)*.029;
    return radial(angle,z,radius);
  }),{start:0x4b9cb8,middle:0x9adaed,end:0xd8edf0,speed:.48,travel:.065,ink:0x82c7dd,particles:true});

  const compression=makeStream(section,spread(28).map((angle,i)=>u=>{
    const z=lerp(3.75,7.32,u);
    const channel=(i%9)/8;
    const inner=sample([[3.75,.29],[4.19,.31],[5.16,.36],[6.18,.34],[7.32,.245]],z);
    const outer=sample([[3.75,.57],[4.19,.565],[5.16,.461],[6.18,.45],[7.32,.425]],z);
    return radial(angle+.14*u,z,lerp(inner,outer,.22+.72*channel));
  }),{start:0xd4edf0,middle:0xffdc96,end:0xed924a,speed:.71,travel:.095,ink:0xffc97c,particles:true});

  const casingAir=makeStream(section,spread(18).map((angle,i)=>u=>{
    const z=lerp(2.38,9.78,u);
    const radius=sample([[2.38,.66],[3.15,.74],[4.13,.76],[8.82,.77],[9.4,.63],[9.78,.55]],z)
      +((i%5)-2)*.025;
    return radial(angle,z,radius);
  }),{start:0x74a8b0,middle:0x96c9c4,end:0xdac6a3,speed:.52,travel:.072,ink:0x8bc0bd,particles:true});

  const exhaust=makeStream(section,spread(37).map((angle,i)=>u=>{
    const z=lerp(6.92,12.25,u);
    const boundary=sample([[6.92,.43],[8.99,.55],[9.66,.36],[10.56,.60],[12.25,.97]],z);
    const radius=boundary*Math.sqrt(.19+(i%11)*.078);
    return radial(angle+.11*Math.sin(u*4.2),z,radius);
  }),{start:0xffd184,middle:0xff9d4f,end:0xe95731,speed:.83,travel:.10,ink:0xfb8b4b,hot:true,particles:true});

  const exteriorStreams=[1,-1].map(direction=>{
    const mount=mountNacelle(direction,direction===1?'Starboard exterior airflow':'Port exterior airflow');
    const approach=makeStream(mount,spread(22,5.84).map((angle,i)=>u=>{
      const z=lerp(-7.2,-.07,u);
      const r=lerp(1.35+(i%6)*.12,.48+(i%6)*.043,smooth(0,1,u));
      return radial(angle+.12*u,z,r);
    }),{start:0x356e9c,middle:0x81cde5,end:0xc4f2ef,speed:.61,travel:.082,ink:0x79c6de});
    const jet=makeStream(mount,spread(26,5.90).map((angle,i)=>u=>{
      const z=lerp(10.40,16.25,u);
      const sheath=sample([[10.40,.64],[11.18,.76],[12.32,.67],[14.16,.95],[16.25,1.24]],z);
      const r=sheath*Math.sqrt(.13+(i%10)*.087);
      return radial(angle+.09*Math.sin(u*5.8),z,r);
    }),{start:0xffe7a6,middle:0xff9b55,end:0xd85448,speed:.91,travel:.09,ink:0xfa9659,hot:true});
    const glow=new THREE.PointLight(0xffaa60,0,3.2,1.8);
    glow.position.z=10.64;
    mount.add(glow);
    return (time,strength)=>{
      mount.visible=strength>.015;
      if(!mount.visible)return;
      approach(time,strength*.94);
      jet(time,strength);
      glow.intensity=strength*(2.25+.4*Math.sin(time*5.2+direction));
    };
  });

  const airframeField=new THREE.Group();
  airframeField.name='Airframe aerodynamic illustration';
  world.add(airframeField);

  world.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  const sampleOrigin=new THREE.Vector3();
  const down=new THREE.Vector3(0,-1,0);
  const bodyStreams=Array.from({length:36},(_,i)=>{
    const lane=(i-17.5)*.64, lateral=Math.sign(lane);
    const guide=Array.from({length:29},(_,j)=>{
      const u=j/28, z=lerp(22.2,-23.3,u);
      const wrap=smooth(0,8,18.5-z);
      const release=1-smooth(14,22,-z);
      const nose=.99*Math.exp(-Math.abs(lane)*.29)*wrap*release;
      const wing=1.58*Math.exp(-Math.pow((Math.abs(lane)-3.5)/3.25,2))*Math.sin(Math.PI*clamp((11-z)/33));
      const x=lane+lateral*(nose+wing);
      sampleOrigin.set(x,12,z);
      ray.set(sampleOrigin,down);
      const hit=ray.intersectObject(plane,false)[0];
      const lift=.52+(i%4)*.14;
      return new THREE.Vector3(x,Math.max(lift,(hit?.point.y??0)+lift),z);
    });
    // Follow the display mesh with clearance. These are illustrative paths, not solved flow.
    const softened=guide.map((point,j)=>{
      const neighbors=guide.slice(Math.max(0,j-2),j+3);
      const y=Math.max(point.y, ...neighbors.map((q,i)=>q.y-.25*Math.abs(i-Math.min(2,j))));
      return new THREE.Vector3(point.x,y,point.z);
    });
    const curve=new THREE.CatmullRomCurve3(softened);
    return u=>curve.getPoint(u).toArray();
  });
  const wrapAir=makeStream(airframeField,bodyStreams,{
    start:0x477883,middle:0xa5e8ea,end:0xc0e6d4,speed:.53,travel:.078,ink:0x98dbdf
  });

  const wakeStreams=[1,-1].flatMap(side=>Array.from({length:7},(_,i)=>u=>{
    const z=lerp(-12.72,-23.9,u);
    const angle=i*2*Math.PI/7+side*u*10.2;
    const radius=.12+u*.91;
    return [side*(8.32+.37*u)+Math.cos(angle)*radius,-.42-.26*u+Math.sin(angle)*radius,z];
  }));
  const wingWake=makeStream(airframeField,wakeStreams,{
    start:0x769faa,middle:0xd4e9ab,end:0xc5a77d,speed:.59,travel:.105,ink:0xc4d6a2
  });

  const eye = new THREE.Vector3(), focus = new THREE.Vector3();
  function draw(progress,time=0) {
    p = clamp(progress);
    elapsed = time;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (width !== bounds.width || height !== bounds.height) {
      width=bounds.width; height=bounds.height;
      renderer.setSize(width,height,false);
    }
    const aspect=width/Math.max(1,height);
    const reveal=smooth(.66,.87,p);
    const engineering=smooth(.24,.40,p);
    const detail=smooth(.76,.95,p);
    section.visible=p>.69;
    plane.material=reveal>.06 ? ghost : metal;
    ghost.opacity=lerp(.34,.10,reveal);
    spike.position.z=detail*.28;
    ejectorPetals.scale.x=ejectorPetals.scale.y=1+detail*.043;
    rows.forEach((row,i)=>{row.rotation.z=(i%2?-1:1)*time*.46;});
    exhaustLight.intensity=detail*(4.3+Math.sin(time*3.4)*.33);
    const particles=smooth(.73,.86,p);
    intake(time,reveal,particles*.85);
    compression(time,reveal*(.65+.35*detail),particles*.92);
    casingAir(time,reveal*(.54+.22*detail),particles*.56);
    exhaust(time,reveal*(.32+.68*detail),particles);
    for(const updateExterior of exteriorStreams)updateExterior(time,1-engineering);
    const aerodynamic=engineering*(1-smooth(.67,.79,p));
    airframeField.visible=aerodynamic>.015;
    if(airframeField.visible){
      wrapAir(time,aerodynamic);
      wingWake(time,aerodynamic*.89);
    }

    const exterior=new THREE.Vector3(17,7+Math.sin(time*.47)*.34,-23);
    const center=new THREE.Vector3(0,-.2,.7);
    const drawingEye=new THREE.Vector3(lerp(13.6,10.9,detail),lerp(2.42,1.62,detail),lerp(-8.25,-8.45,detail));
    const drawingFocus=new THREE.Vector3(4.18,-.44,lerp(-7.0,-7.22,detail));
    const highView=new THREE.Vector3(21,26+Math.sin(time*.39)*.37,16);
    const wingFocus=new THREE.Vector3(0,0,-1.3);
    eye.copy(exterior).lerp(highView,engineering).lerp(drawingEye,reveal);
    focus.copy(center).lerp(wingFocus,engineering).lerp(drawingFocus,reveal);
    eye.addScaledVector(eye.clone().sub(focus),Math.max(0,(1.35-aspect)*1.58));
    perspective.fov=lerp(lerp(48,53,engineering),57,reveal)+Math.max(0,.85-aspect)*13;
    perspective.aspect=aspect;
    perspective.position.copy(eye);
    perspective.lookAt(focus);
    perspective.updateProjectionMatrix();
    renderer.render(world,perspective);
  }

  if (host.dataset.render === 'webgl') {
    renderer.domElement.addEventListener('webglcontextlost',event=>{
      event.preventDefault();
      try { beginCanvas(); width=height=0; draw(p,elapsed); }
      catch { host.dataset.render='unavailable'; }
    },{once:true});
  }
  return draw;
};
