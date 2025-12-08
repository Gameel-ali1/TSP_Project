document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('viewGraph');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const speedRange = document.getElementById('speedRange');
  const uniformBtn = document.getElementById('uniformLayoutBtn');

  if (!container) return;

  if (!ROUTE_DATA) {
    container.innerHTML = '<div style="padding:20px;color:#fff">No route data available. Open this page via the "Watch Graph" button after optimizing a route.</div>';
    return;
  }

  // Normalize points
  const points = (ROUTE_DATA.route_with_coords || ROUTE_DATA.coordinates || []).map((p) => {
    if (p.lat !== undefined && p.lng !== undefined) return {lat: +p.lat, lng: +p.lng, name: p.location || p.name || ''};
    if (p.latitude !== undefined && p.longitude !== undefined) return {lat: +p.latitude, lng: +p.longitude, name: p.name || ''};
    return null;
  }).filter(Boolean);

  if (points.length === 0) {
    container.innerHTML = '<div style="padding:20px;color:#fff">Route data had no coordinates to display.</div>';
    return;
  }

  // compute dims from viewport
  const width = Math.max(600, window.innerWidth);
  const height = Math.max(400, window.innerHeight);

  // Scales with padding to avoid clipping
  const pad = 40;
  const longitudes = points.map(p => p.lng);
  const latitudes = points.map(p => p.lat);
  // if all longitudes or latitudes equal, expand domain slightly to avoid collapsed scale
  let lonMin = d3.min(longitudes), lonMax = d3.max(longitudes);
  let latMin = d3.min(latitudes), latMax = d3.max(latitudes);
  if (Math.abs(lonMax - lonMin) < 1e-6) { lonMin -= 0.5; lonMax += 0.5; }
  if (Math.abs(latMax - latMin) < 1e-6) { latMin -= 0.5; latMax += 0.5; }

  // Compress geographic spread so long distances don't create huge visual gaps
  // compressionExp in (0,1] — lower compresses more (e.g., 0.5 = sqrt)
  const compressionExp = 0.6;
  const lonCenter = (lonMin + lonMax) / 2;
  const latCenter = (latMin + latMax) / 2;
  const lonTrans = longitudes.map(l => {
    const d = l - lonCenter;
    return Math.sign(d) * Math.pow(Math.abs(d), compressionExp) + lonCenter;
  });
  const latTrans = latitudes.map(lat => {
    const d = lat - latCenter;
    return Math.sign(d) * Math.pow(Math.abs(d), compressionExp) + latCenter;
  });

  let lonTMin = d3.min(lonTrans), lonTMax = d3.max(lonTrans);
  let latTMin = d3.min(latTrans), latTMax = d3.max(latTrans);
  if (Math.abs(lonTMax - lonTMin) < 1e-6) { lonTMin -= 0.5; lonTMax += 0.5; }
  if (Math.abs(latTMax - latTMin) < 1e-6) { latTMin -= 0.5; latTMax += 0.5; }

  const xScale = d3.scaleLinear().domain([lonTMin, lonTMax]).range([pad, width - pad]);
  const yScale = d3.scaleLinear().domain([latTMax, latTMin]).range([pad, height - pad]);

  // Clear and create svg that fills viewport
  container.innerHTML = '';
  const svg = d3.select(container).append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('display','block');

  // groups for edges and nodes
  const edgeLayer = svg.append('g').attr('class','edge-layer');
  const nodeLayer = svg.append('g').attr('class','node-layer');
  const nodePositions = [];

  // traveller marker
  const traveller = svg.append('circle').attr('r', 10).attr('fill','#ff6666').attr('stroke','#fff').attr('stroke-width',2).attr('opacity',0.95).style('pointer-events','none');

  // Precompute node positions and label sizes so we can resolve collisions before drawing
  function computeAllPositions(){
    const sizeScale = Math.max(8, Math.min(24, Math.round(600 / points.length) + 6));
    const fontSize = Math.max(10, Math.min(20, Math.round(sizeScale * 0.9)));
    for (let i=0;i<points.length;i++){
      const p = points[i];
      let label = p.name && p.name.length ? p.name : `${i+1}`;
      const maxLabelLen = 60;
      if (label.length > maxLabelLen) label = label.substring(0, maxLabelLen-3) + '...';
      // measure label width using temporary hidden text
      const tempText = svg.append('text').attr('font-size', fontSize).attr('font-weight', '600').attr('visibility', 'hidden').text(label);
      let bbox = { width: 0, height: 0 };
      try { bbox = tempText.node().getBBox(); } catch (e) { bbox.width = Math.min(width - 2*pad, label.length * Math.max(6, Math.round(fontSize * 0.6))); }
      tempText.remove();
      const labelWidth = Math.min(width - 2*pad, bbox.width);
      const labelHeight = bbox.height || (fontSize + 4);
      const rawX = xScale(p.lng), rawY = yScale(p.lat);
      const clampedX = Math.max(pad + labelWidth / 2, Math.min(width - pad - labelWidth / 2, rawX));
      const minY = pad + sizeScale;
      const maxY = height - pad - sizeScale - labelHeight - 4;
      const clampedY = Math.max(minY, Math.min(maxY, rawY));
      let labelY = sizeScale + Math.round(fontSize / 1.5);
      if (clampedY + labelY + 4 > height - pad) labelY = -Math.round(fontSize / 2) - 4;
      nodePositions[i] = { x: clampedX, y: clampedY, label, fontSize, sizeScale, labelY, labelWidth, labelHeight };
    }
  }

  // helper to draw a node (returns the created group)
  function drawNode(index){
    // If precomputed position exists, use it
    const pre = nodePositions[index];
    const p = points[index];
    if (pre && pre._drawn) {
      // already drawn (shouldn't happen normally)
      return { g: d3.select(nodeLayer.selectAll('g.node').nodes()[index]), x: pre.x, y: pre.y };
    }

    // Fallback: if positions precomputed, use them; otherwise compute simple placement
    const pos = pre || (() => {
      const x = xScale(p.lng), y = yScale(p.lat);
      const sizeScale = Math.max(8, Math.min(24, Math.round(600 / points.length) + 6));
      const fontSize = Math.max(10, Math.min(20, Math.round(sizeScale * 0.9)));
      let label = p.name && p.name.length ? p.name : `${index+1}`;
      if (label.length > 60) label = label.substring(0,57) + '...';
      const clampedX = Math.max(pad, Math.min(width-pad, x));
      const clampedY = Math.max(pad, Math.min(height-pad, y));
      return { x: clampedX, y: clampedY, label, fontSize, sizeScale };
    })();

    const g = nodeLayer.append('g').attr('class','node').attr('transform',`translate(${pos.x},${pos.y})`);
    g.append('circle').attr('r', pos.sizeScale).attr('fill','#ffffff').attr('stroke','#000').attr('stroke-width',Math.max(1, Math.round(pos.sizeScale/6)));
    // add node sequence number centered inside the circle
    const numFont = Math.max(10, Math.round(pos.sizeScale * 0.65));
    g.append('text').text(String(index+1)).attr('dy','0.35em').attr('text-anchor','middle').attr('fill','#000').attr('font-size', numFont).attr('font-weight','700');
    // position label based on precomputed labelY if available (city name)
    const labelY = (pos.labelY !== undefined) ? pos.labelY : (pos.sizeScale + Math.round((pos.fontSize||14)/1.5));
    g.append('text').text(pos.label).attr('y', labelY).attr('text-anchor','middle').attr('fill','#fff').attr('font-size',pos.fontSize||14).attr('font-weight','600');
    nodePositions[index] = Object.assign({}, pos, { _drawn: true });
    return { g, x: pos.x, y: pos.y };
  }
  // compute positions for all nodes, resolve collisions, then draw first node
  computeAllPositions();

  // draw first node (others will be drawn progressively during playback)
  const first = drawNode(0);
  traveller.attr('cx', first.x).attr('cy', first.y);

  // improved collision resolve: nudge nodes apart if too close, accounting for label widths and node radii
  (function resolveCollisions(){
    // helper: resolve near-collinearity where three nodes are almost on the same line
    function resolveCollinearity(){
      // enforce minimum angle between adjacent segments (45 degrees)
      const angleThreshold = 45 * Math.PI / 180; // 45 degrees
      let adjusted = false;
      for (let i=0;i<points.length;i++){
        for (let j=0;j<points.length;j++){
          for (let k=0;k<points.length;k++){
            if (i===j||j===k||i===k) continue;
            const a = nodePositions[i];
            const b = nodePositions[j];
            const c = nodePositions[k];
            if (!a || !b || !c) continue;
            const v1x = a.x - b.x, v1y = a.y - b.y;
            const v2x = c.x - b.x, v2y = c.y - b.y;
            const mag1 = Math.hypot(v1x, v1y), mag2 = Math.hypot(v2x, v2y);
            if (mag1 < 1e-6 || mag2 < 1e-6) continue;
            const dot = v1x * v2x + v1y * v2y;
            const ang = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
            // if angle below threshold or very close to 180 (i.e. near-collinear)
            if (ang < angleThreshold || Math.abs(Math.PI - ang) < angleThreshold) {
              // nudge b perpendicular to the line a-b (or b-c)
              const nx = v1x / mag1, ny = v1y / mag1;
              const px = -ny, py = nx; // perpendicular
              // nudge amount proportional to label sizes and node sizes
              const aSize = a.sizeScale || 12; const cSize = c.sizeScale || 12;
              // if either adjacent real-world distance is <1000km, increase nudge to avoid visual colocation
              let nudgeMultiplier = 1.0;
              try{
                const abKm = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
                const cbKm = haversineKm(points[k].lat, points[k].lng, points[j].lat, points[j].lng);
                if ((abKm && abKm < 1000) || (cbKm && cbKm < 1000)) nudgeMultiplier = 1.6;
              } catch(e){}
              const nudge = Math.max(10, (aSize + cSize) * 0.6 * nudgeMultiplier);
              const dir = ((j % 2) === 0) ? 1 : -1;
              b.x = Math.max(pad, Math.min(width - pad, b.x + px * nudge * dir));
              b.y = Math.max(pad, Math.min(height - pad, b.y + py * nudge * dir));
              adjusted = true;
            }
          }
        }
      }
      return adjusted;
    }
    const iterations = 25;
    for (let it=0; it<iterations; it++){
      let moved = false;
      for (let i=0;i<points.length;i++){
        for (let j=i+1;j<points.length;j++){
          const a = nodePositions[i];
          const b = nodePositions[j];
          if (!a || !b) continue;
          let dx = b.x - a.x; let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) { dx = (Math.random()-0.5)*1; dy = (Math.random()-0.5)*1; dist = Math.hypot(dx, dy); }
          // compute dynamic minimum separation: node radii + half label widths + padding
          // Increase separation if the real-world distance between these two cities is small (<1000 km)
          let proximityFactor = 1.0;
          try{
            const realKm = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
            if (realKm < 1000) proximityFactor = 1.6;
          } catch(e){ }
          const minSep = ((a.sizeScale + b.sizeScale) + Math.max(a.labelWidth || 0, b.labelWidth || 0)/2 + 8) * proximityFactor;
          if (dist < minSep){
            const overlap = (minSep - dist) / 2;
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            const axNew = Math.max(pad, Math.min(width-pad, a.x - nx*overlap));
            const ayNew = Math.max(pad, Math.min(height-pad, a.y - ny*overlap));
            const bxNew = Math.max(pad, Math.min(width-pad, b.x + nx*overlap));
            const byNew = Math.max(pad, Math.min(height-pad, b.y + ny*overlap));
            if (axNew !== a.x || ayNew !== a.y || bxNew !== b.x || byNew !== b.y) moved = true;
            nodePositions[i].x = axNew; nodePositions[i].y = ayNew;
            nodePositions[j].x = bxNew; nodePositions[j].y = byNew;
          }
        }
      }
      if (!moved) break;
    }
    // attempt to resolve collinearity for any remaining near-collinear triples
    for (let pass=0; pass<6; pass++){
      const changed = resolveCollinearity();
      if (!changed) break;
      // small local smoothing after collinearity adjustments
      nodeLayer.selectAll('g.node').each(function(d,i){
        const pos = nodePositions[i];
        if (pos) d3.select(this).attr('transform', `translate(${pos.x},${pos.y})`);
      });
    }
    // After nudging, update node group transforms so drawn nodes move to new positions
    nodeLayer.selectAll('g.node').each(function(d,i){
      const pos = nodePositions[i];
      if (pos) d3.select(this).attr('transform', `translate(${pos.x},${pos.y})`);
    });
    // move traveller to updated first node
    if (nodePositions[0]) traveller.attr('cx', nodePositions[0].x).attr('cy', nodePositions[0].y);
  })();

  // animation control state
  let playing = false;
  let speed = parseFloat(speedRange.value) || 1;
  let currentIndex = 0;
  let isUniform = false;
  let uniformSimulation = null;

  speedRange.addEventListener('input', ()=>{ speed = parseFloat(speedRange.value) || 1; });

  // animate moving from point i to i+1; returns a promise that resolves when movement is complete or rejects if stopped
  function animateTo(nextIndex){
    return new Promise((resolve) => {
      const a = points[nextIndex-1];
      const b = points[nextIndex];
      const apos = nodePositions[nextIndex-1] || {x: xScale(a.lng), y: yScale(a.lat)};
      const bpos = nodePositions[nextIndex] || {x: xScale(b.lng), y: yScale(b.lat)};
      const ax = apos.x, ay = apos.y;
      const bx = bpos.x, by = bpos.y;

      // draw edge (line) faded in as we move
      const line = edgeLayer.append('line')
        .attr('x1', ax).attr('y1', ay).attr('x2', ax).attr('y2', ay)
        .attr('stroke','rgba(255,255,255,0.4)').attr('stroke-width', Math.max(2, Math.round(Math.max(2, 14 - points.length/10)) )).attr('stroke-linecap','round');

      // distance label: display the actual Haversine distance (km)
      const realKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
      const distText = edgeLayer.append('text')
        .attr('x', ax).attr('y', ay)
        .attr('fill', 'rgba(255,255,255,0.9)')
        .attr('font-size', Math.max(10, Math.min(16, Math.round((600/points.length)+8))))
        .attr('font-weight', '600')
        .attr('text-anchor', 'middle')
        .text(realKm.toFixed(1) + ' km');

      const distance = Math.hypot(bx-ax, by-ay);
      // base duration scaled by distance and speed
      const baseMs = Math.max(400, Math.min(6000, distance*6));
      const duration = baseMs / speed;

      let start = null;
      function step(ts){
        if (!playing) { start = null; requestAnimationFrame(step); return; }
        if (!start) start = ts;
        const t = Math.min(1, (ts - start)/duration);
        const cx = ax + (bx-ax)*t;
        const cy = ay + (by-ay)*t;
        traveller.attr('cx', cx).attr('cy', cy);
        // extend line
        line.attr('x2', cx).attr('y2', cy);
        // update distance label to current midpoint
        const mx = (ax + cx) / 2; const my = (ay + cy) / 2;
        distText.attr('x', mx).attr('y', my - 6);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  // Haversine distance in km
  function haversineKm(lat1, lon1, lat2, lon2){
    const toRad = (d) => d * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async function playSequence(){
    if (currentIndex >= points.length-1) return;
    playing = true;
    while (playing && currentIndex < points.length-1){
      const next = currentIndex+1;
      // draw next node (so nodes appear one-by-one)
      drawNode(next);
      // animate traveller along the segment
      await animateTo(next);
      currentIndex = next;
      // small pause between nodes
      await new Promise(r => setTimeout(r, 250));
    }
    playing = false;
  }

  playBtn.addEventListener('click', ()=>{
    if (!playing){
      playSequence();
    }
  });
  pauseBtn.addEventListener('click', ()=>{ playing = false; });
  // (Linear layout removed) Uniform Links used instead.

  // Uniform Links: use a D3 force simulation to make every link length uniform (pixel length)
  function applyUniformLinkLayout(targetLength = 320){
    if (points.length <= 1) return;
    // prepare nodes and links for the force simulation
    const nodes = points.map((p,i) => {
      const pre = nodePositions[i] || {};
      return {
        id: i,
        x: pre.x || xScale(p.lng),
        y: pre.y || yScale(p.lat),
        sizeScale: pre.sizeScale || Math.max(8, Math.min(24, Math.round(600 / points.length) + 6)),
        labelWidth: pre.labelWidth || (String(p.name || i+1).length * 6),
        labelHeight: pre.labelHeight || 12,
        fontSize: pre.fontSize || 12
      };
    });
    const links = [];
    for (let i=0;i<points.length-1;i++) links.push({ source: i, target: i+1 });

    // stop any previous simulation
    if (uniformSimulation) {
      try { uniformSimulation.stop(); } catch (e){}
      uniformSimulation = null;
    }

    // Build simulation with link distance = targetLength and collision radius using label/node sizes
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).distance(targetLength).strength(1).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-40))
      .force('collision', d3.forceCollide().radius(d => (d.sizeScale + (d.labelWidth||0)/2 + 8)).strength(1))
      .force('center', d3.forceCenter(width/2, height/2))
      .stop();

    // run the simulation synchronously for enough ticks to converge
    const ticks = 300;
    for (let i=0;i<ticks;i++) sim.tick();

    // write back positions to nodePositions and update drawn nodes
    nodes.forEach(n => {
      nodePositions[n.id] = Object.assign({}, nodePositions[n.id] || {}, { x: Math.max(pad, Math.min(width-pad, n.x)), y: Math.max(pad, Math.min(height-pad, n.y)), sizeScale: n.sizeScale, labelWidth: n.labelWidth, labelHeight: n.labelHeight, fontSize: n.fontSize });
    });

    nodeLayer.selectAll('g.node').each(function(d,i){
      const pos = nodePositions[i];
      if (pos) d3.select(this).transition().duration(400).attr('transform', `translate(${pos.x},${pos.y})`);
    });
    if (nodePositions[0]) traveller.transition().duration(200).attr('cx', nodePositions[0].x).attr('cy', nodePositions[0].y);

    uniformSimulation = sim;
  }

    if (uniformBtn){
    uniformBtn.addEventListener('click', ()=>{
      isUniform = !isUniform;
      uniformBtn.textContent = isUniform ? 'Uniform: On' : 'Uniform Links';
      if (isUniform){
        applyUniformLinkLayout(320);
      } else {
        // revert to geographic precomputed positions and resolve collisions
        computeAllPositions();
        // re-run the collision/collinearity nudging
        (function(){
          // reuse existing collision resolution by re-invoking the IIFE above via a small trick: call resolve-like steps
          // We'll perform a lightweight relaxation similar to the original resolveCollisions logic
          const iterations = 20;
          for (let it=0; it<iterations; it++){
            let moved = false;
            for (let i=0;i<points.length;i++){
              for (let j=i+1;j<points.length;j++){
                const a = nodePositions[i]; const b = nodePositions[j];
                if (!a||!b) continue;
                let dx = b.x - a.x, dy = b.y - a.y; let dist = Math.hypot(dx,dy);
                if (dist === 0){ dx=(Math.random()-0.5); dy=(Math.random()-0.5); dist = Math.hypot(dx,dy); }
                const minSep = (a.sizeScale + b.sizeScale) + Math.max(a.labelWidth||0, b.labelWidth||0)/2 + 8;
                if (dist < minSep){
                  const overlap = (minSep - dist)/2; const nx = dx/(dist||1); const ny = dy/(dist||1);
                  nodePositions[i].x = Math.max(pad, Math.min(width-pad, a.x - nx*overlap));
                  nodePositions[i].y = Math.max(pad, Math.min(height-pad, a.y - ny*overlap));
                  nodePositions[j].x = Math.max(pad, Math.min(width-pad, b.x + nx*overlap));
                  nodePositions[j].y = Math.max(pad, Math.min(height-pad, b.y + ny*overlap));
                  moved = true;
                }
              }
            }
            if (!moved) break;
          }
        })();
        nodeLayer.selectAll('g.node').each(function(d,i){ const pos = nodePositions[i]; if (pos) d3.select(this).transition().duration(300).attr('transform', `translate(${pos.x},${pos.y})`); });
        if (nodePositions[0]) traveller.transition().duration(200).attr('cx', nodePositions[0].x).attr('cy', nodePositions[0].y);
      }
    });
  }

  // Enable Uniform Links by default on load
  try{
    if (uniformBtn){
      isUniform = true;
      uniformBtn.textContent = 'Uniform: On';
      // run after initial positions computed and first node drawn
      applyUniformLinkLayout(250);
    }
  } catch(e) { /* ignore */ }

  // ensure initial layout responds to resize
  window.addEventListener('resize', ()=>{
    // simple reload for layout recalculation
    location.reload();
  });

});