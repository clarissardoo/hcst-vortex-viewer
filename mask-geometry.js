// Positions on each optical face use µm. Heights are positive out of the glass.
// The central cutaway compresses the 1 mm substrate so both faces can be seen.
const scienceRamp = 0.780 / (1.4537 - 1);
const frontRecess = 0.650 / 8;
const maskShape = {
  radius: 34.632, halfWidth: 59, recess: frontRecess, step: frontRecess + scienceRamp / 2,
  ramp: scienceRamp, substrateFront: -18, dichroicMicrons: 1,
  rearExaggeration: 17, frontExaggeration: 24,
  dichroicExaggeration: 6.3, dichroicToArDisplayRatio: 3.5
};

function displayedDichroicThickness(frontLift) {
  const scale = frontLift === 1 ? 1 : maskShape.dichroicExaggeration;
  return maskShape.dichroicMicrons * scale;
}

function coatedFrontDatum(frontLift) {
  return maskShape.substrateFront - displayedDichroicThickness(frontLift);
}

function rearCoatingOffset(frontLift) {
  return displayedDichroicThickness(frontLift) / maskShape.dichroicToArDisplayRatio;
}

function makeMaskMesh(rear, rearLift, frontLift) {
  const {radius, halfWidth, recess, substrateFront} = maskShape;
  const frontDatum = coatedFrontDatum(frontLift);
  const floorZ = frontDatum + recess * frontLift;
  const addedFaces = [];
  function triangle(a,b,c,color) {
    for (const p of [a,b,c]) addedFaces.push(...p,...color);
  }
  function quad(a,b,c,d,color) {
    triangle(a,b,c,color); triangle(a,c,d,color);
  }
  const segments = 192; // includes each corner of the square crop
  function section(i) {
    const angle = (i % segments) * 2 * Math.PI / segments;
    const x = Math.cos(angle), y = Math.sin(angle);
    const outer = halfWidth / Math.max(Math.abs(x),Math.abs(y));
    return {
      rim: [radius*x,radius*y,frontDatum], floor: [radius*x,radius*y,floorZ],
      outer: [outer*x,outer*y,frontDatum],
      substrateEdge: [outer*x,outer*y,substrateFront],
      // The existing rear mesh's side skirt ends 0.16 µm below its relief datum.
      backEdge: [outer*x,outer*y,-0.16*rearLift], angle
    };
  }
  for (let i=0;i<segments;i++) {
    const a=section(i), b=section(i+1);
    // The dichroic coats the rim, floor, and wall of the Zernike recess.
    quad(a.rim,b.rim,b.outer,a.outer,[.91,.69,.79]);
    triangle([0,0,floorZ],a.floor,b.floor,[.78,.43,.59]);
    const shade=.62+.13*Math.cos(a.angle+.65);
    quad(a.floor,b.floor,b.rim,a.rim,[.82*shade,.34*shade,.56*shade]);
    const glass=.78+.08*Math.cos(a.angle-.7);
    quad(a.outer,b.outer,b.substrateEdge,a.substrateEdge,[.99*glass,.56*glass,.75*glass]);
    quad(a.substrateEdge,b.substrateEdge,b.backEdge,a.backEdge,[.80*glass,.89*glass,.92*glass]);
  }
  const rearMesh = rear.slice();
  const arOffset = rearCoatingOffset(frontLift);
  const raisedEdge = point => [point[0], point[1], point[2] + arOffset];
  for (let i=2;i<rearMesh.length;i+=6) rearMesh[i] *= rearLift;
  for (let i=0;i<rear.length;i+=18) {
    // Each skirt quad has one triangle with two edge vertices on the relief.
    // Bridge that edge to the coated surface to show the blue film in profile.
    if (Math.min(rear[i+2],rear[i+8],rear[i+14])<0) {
      const edge = [i,i+6,i+12].filter(j => rear[j+2]>=0);
      if (edge.length===2) {
        const [a,b] = edge.map(j => [rearMesh[j],rearMesh[j+1],rearMesh[j+2]]);
        quad(a,b,raisedEdge(b),raisedEdge(a),[.43,.66,.81]);
      }
      continue;
    }
    const red=rear[i+3], blue=rear[i+5];
    // The original palette distinguishes the raised disk from the outer ramps
    // and stores the light shading in each triangle's color.
    const raised=red>blue;
    const shade=red/(raised ? .906 : .761);
    const ar=raised ? [.53,.77,.91] : [.73,.88,.96];
    for (let j=i;j<i+18;j+=6) {
      rearMesh[j+2]+=arOffset;
      rearMesh[j+3]=ar[0]*shade; rearMesh[j+4]=ar[1]*shade; rearMesh[j+5]=ar[2]*shade;
    }
  }
  const mesh = new Float32Array(rearMesh.length+addedFaces.length);
  mesh.set(rearMesh);
  mesh.set(addedFaces,rearMesh.length);
  return mesh;
}
