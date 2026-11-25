// Labels report physical relief from the unpatterned datum on each face.
function makeHeightLabels(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  const {ramp,step,radius,recess} = maskShape;
  function element(type, parent) {
    const node = document.createElementNS(ns, type);
    parent.appendChild(node);
    return node;
  }
  const lines = element('g', svg), captions = element('g', svg);
  function landmark(name, r, degrees, height, zone) {
    const angle = degrees * Math.PI / 180;
    const leader = element('polyline', lines);
    const dot = element('circle', lines);
    dot.setAttribute('r', 3.5);
    const title = element('title', dot);
    title.textContent = name;
    const caption = element('g', captions);
    const number = element('text', caption), description = element('text', caption);
    number.textContent = (height * 1000).toLocaleString('en-US', {
      minimumFractionDigits: height ? 2 : 0, maximumFractionDigits: 2
    }) + ' nm';
    description.textContent = name;
    description.setAttribute('y', 18);
    description.classList.add('height-caption');
    const color = zone==='raised' ? 'blue' : zone==='front' ? 'pink' : 'slate';
    for (const node of [caption, leader, dot]) node.classList.add(color);
    return {x: r*Math.cos(angle), y: r*Math.sin(angle), z: height,
            zone, leader, dot, caption, title, name};
  }
  const marks = [
    landmark('Outer ramp base', 53, -120, 0, 'bare'),
    landmark('Outer ramp crest', 51, -180, ramp, 'bare'),
    landmark('Raised ramp base', radius, -120, step, 'raised'),
    landmark('Raised ramp crest', radius, 0, ramp + step, 'raised'),
    landmark('Front surface', 51, -145, 0, 'front'),
    landmark('Recess floor', 9, 8, -recess, 'front')
  ];

  // Compare each pin to the nearest triangle at its projected position. This
  // lets the annotation stay on one physical lip even when a ramp hides it.
  function checkVisibility(pins, mesh, view) {
    const {c,s,u,v,centerZ} = view;
    const px = new Float64Array(3), py = new Float64Array(3), pz = new Float64Array(3);
    for (let i = 0; i < mesh.length; i += 18) {
      for (let j=0; j<3; j++) {
        const k = i+6*j, x=mesh[k], y=mesh[k+1], z=mesh[k+2]-centerZ;
        const radial = c*x+s*y;
        px[j] = -s*x+c*y; py[j] = -u*radial+v*z; pz[j] = v*radial+u*z;
      }
      const bx=px[1]-px[0], by=py[1]-py[0], cx=px[2]-px[0], cy=py[2]-py[0];
      const det=bx*cy-by*cx;
      if (Math.abs(det)<1e-9) continue;
      const minX=Math.min(...px)-1e-6, maxX=Math.max(...px)+1e-6;
      const minY=Math.min(...py)-1e-6, maxY=Math.max(...py)+1e-6;
      for (const pin of pins) {
        if (pin.hidden || pin.px<minX || pin.px>maxX || pin.py<minY || pin.py>maxY) continue;
        const dx=pin.px-px[0], dy=pin.py-py[0];
        const a=(dx*cy-dy*cx)/det, b=(bx*dy-by*dx)/det;
        if (a < -1e-6 || b < -1e-6 || a+b > 1.000001) continue;
        const depth=pz[0]+a*(pz[1]-pz[0])+b*(pz[2]-pz[0]);
        if (depth>pin.depth+.03) pin.hidden=true;
      }
    }
  }

  return function drawLabels(view, mesh, frontView, hasProtrusion) {
    const {width,height,c,s,u,v,frontLift,rearLift,centerZ,scaleX,scaleY} = view;
    const pins = marks.filter(mark => frontView ? mark.zone==='front' :
      mark.zone==='bare' || (mark.zone==='raised' && hasProtrusion));
    for (const mark of marks) {
      for (const node of [mark.leader,mark.dot,mark.caption])
        node.style.display = pins.includes(mark) ? '' : 'none';
    }
    for (const pin of pins) {
      const elevation=frontView ? coatedFrontDatum(frontLift)-pin.z*frontLift
                                : rearCoatingOffset(frontLift)+pin.z*rearLift;
      const z=elevation-centerZ, radial=c*pin.x+s*pin.y;
      pin.px=-s*pin.x+c*pin.y; pin.py=-u*radial+v*z; pin.depth=v*radial+u*z;
      pin.screenX=width/2+pin.px*scaleX; pin.screenY=height/2-pin.py*scaleY;
      pin.hidden=false;
    }
    checkVisibility(pins,mesh,view);
    function place(pin,right,y,stacked) {
      const textX=right ? width-8 : 8;
      pin.caption.setAttribute('transform','translate('+textX+','+y+')');
      pin.caption.setAttribute('text-anchor',right?'end':'start');
      const endX=stacked ? (right?width-42:42) : textX+(right?-121:121);
      const endY=stacked ? (y < height/2 ? y+25 : y-17) : y+3;
      const bendX=stacked ? endX : endX+(right?-10:10);
      const bendY=stacked ? endY+(y<height/2?10:-10) : endY;
      pin.leader.setAttribute('points',[[pin.screenX,pin.screenY],[bendX,bendY],[endX,endY]].map(p=>p.join(',')).join(' '));
      pin.dot.setAttribute('cx',pin.screenX); pin.dot.setAttribute('cy',pin.screenY);
      pin.leader.classList.toggle('occluded',pin.hidden); pin.dot.classList.toggle('occluded',pin.hidden);
      pin.title.textContent=pin.name+(pin.hidden?' (behind the surface)':'');
    }
    const half=pins.length/2;
    if (width<670) {
      pins.sort((a,b)=>a.screenY-b.screenY);
      for(let i=0;i<2;i++) {
        const row=pins.slice(i*half,(i+1)*half).sort((a,b)=>a.screenX-b.screenX);
        row.forEach((p,j)=>place(p,row.length===1?p.screenX>width/2:j===1,i?height-25:20,true));
      }
    } else {
      pins.sort((a,b)=>a.screenX-b.screenX);
      for(let i=0;i<2;i++) {
        const side=pins.slice(i*half,(i+1)*half).sort((a,b)=>a.screenY-b.screenY);
        let last=0;
        side.forEach((pin,j)=>{
          const y=Math.min(height-25-(side.length-j-1)*52,Math.max(20,pin.screenY-8,last+52));
          place(pin,i===1,y,false); last=y;
        });
      }
    }
    return pins.some(p=>p.hidden);
  };
}
