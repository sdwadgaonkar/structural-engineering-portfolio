// beam-diagram.js — SVG rendering engine for multi-span beam analyzer
// Exported as window.BeamDiagram = { drawElevation, drawSFD, drawBMD, drawDeflection, bindHover }
// All SVGs use viewBox="0 0 700 220" to match StruxLab design system

window.BeamDiagram = (function () {
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB_W = 700, VB_H = 220;
const EL_VB_H = 270; // taller viewBox used only for beam elevation diagram
const PAD_L = 52, PAD_R = 28, PAD_T = 28, PAD_B = 36;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

// ── SVG Helpers ─────────────────────────────────────────────────────────────

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function svgText(x, y, text, attrs) {
  const el = svgEl('text', Object.assign({ x, y, 'font-family': 'Inter,sans-serif', 'font-size': '10' }, attrs));
  el.textContent = text;
  return el;
}

function worldToSvg(x, totalL) {
  return PAD_L + (x / totalL) * PLOT_W;
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function fmt(v, decimals) {
  return Math.abs(v) < 1e-9 ? '0' : v.toFixed(decimals === undefined ? 2 : decimals);
}

// ── Beam Elevation Diagram ───────────────────────────────────────────────────

function drawElevation(svg, userInput, results) {
  clearSvg(svg);
  const totalL = userInput.spans.reduce((s, sp) => s + sp.L, 0);
  const bY = EL_VB_H * 0.42; // beam centroid y — ~113px, leaves room above for loads and below for supports/labels
  const toX = x => worldToSvg(x, totalL);

  // Background — use EL_VB_H (270) for the taller elevation canvas
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: VB_W, height: EL_VB_H, fill: '#181818' }));

  // ── Distributed loads (drawn first, behind beam) ─────────────────────────
  const loads = userInput.loads || [];
  for (const ld of loads) {
    if (ld.type !== 'udl' && ld.type !== 'trap') continue;
    const xL = toX(ld.xStart), xR = toX(ld.xEnd);
    const loadH = 28;
    const wL = (ld.type === 'udl') ? ld.w : ld.w1;
    const wR = (ld.type === 'udl') ? ld.w : ld.w2;
    const signL = wL >= 0 ? 1 : -1; // positive w = downward load → arrows downward
    const signR = wR >= 0 ? 1 : -1;
    const hL = Math.max(4, Math.abs(wL) / Math.max(Math.abs(wL), Math.abs(wR), 1e-9) * loadH);
    const hR = Math.max(4, Math.abs(wR) / Math.max(Math.abs(wL), Math.abs(wR), 1e-9) * loadH);
    const topL = bY - signL * (hL + 6);
    const topR = bY - signR * (hR + 6);

    // Trapezoidal fill outline
    const pts = `${xL},${topL} ${xR},${topR} ${xR},${bY - signR * 6} ${xL},${bY - signL * 6}`;
    svg.appendChild(svgEl('polygon', { points: pts, fill: 'rgba(255,165,0,0.12)', stroke: '#e68a00', 'stroke-width': '1' }));

    // Arrow ticks
    const n = Math.max(2, Math.round((xR - xL) / 22));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const ax = xL + t * (xR - xL);
      const topY = topL + t * (topR - topL);
      const btmY = bY - (signL + t * (signR - signL)) * 6;
      const dir = (wL + t * (wR - wL)) >= 0 ? 1 : -1;
      svg.appendChild(svgEl('line', { x1: ax, y1: topY, x2: ax, y2: btmY - dir * 3,
        stroke: '#e68a00', 'stroke-width': '1' }));
      svg.appendChild(svgEl('polygon', {
        points: `${ax},${btmY} ${ax-3},${btmY - dir*6} ${ax+3},${btmY - dir*6}`,
        fill: '#e68a00' }));
    }

    // Label
    const midX = (xL + xR) / 2;
    const labelY = Math.min(topL, topR) - 5;
    const wLabel = (ld.type === 'udl') ? `${fmt(ld.w)} k/ft` : `${fmt(wL)}–${fmt(wR)} k/ft`;
    svg.appendChild(svgText(midX, labelY, wLabel, {
      fill: '#e68a00', 'font-size': '9', 'text-anchor': 'middle' }));
  }

  // ── Beam line ────────────────────────────────────────────────────────────
  svg.appendChild(svgEl('line', {
    x1: PAD_L, y1: bY, x2: PAD_L + PLOT_W, y2: bY,
    stroke: '#c8cdd4', 'stroke-width': '4', 'stroke-linecap': 'round' }));

  // ── Supports ─────────────────────────────────────────────────────────────
  const labels = 'ABCDEFGHIJ';
  for (let i = 0; i < userInput.supports.length; i++) {
    const sup = userInput.supports[i];
    const sx = toX(sup.xGlobal);
    const label = labels[i] || `${i + 1}`;
    drawSupport(svg, sx, bY, sup.type, label);
  }

  // ── Point loads ──────────────────────────────────────────────────────────
  for (const ld of loads) {
    if (ld.type === 'point') {
      const px = toX(ld.xGlobal);
      const dir = ld.P >= 0 ? 1 : -1; // P>0 = downward (dir=+1 → arrow points down in SVG)
      const arrowLen = 28;
      const tipY = bY - dir * 4;      // tip just above/below beam surface
      const tailY = tipY - dir * arrowLen; // tail extends away from beam
      svg.appendChild(svgEl('line', { x1: px, y1: tailY, x2: px, y2: tipY + dir * 5,
        stroke: '#5ba3f5', 'stroke-width': '2' }));
      svg.appendChild(svgEl('polygon', {
        points: `${px},${tipY} ${px-4},${tipY - dir*9} ${px+4},${tipY - dir*9}`,
        fill: '#5ba3f5' }));
      svg.appendChild(svgText(px, tailY - dir * 6, `${fmt(Math.abs(ld.P))} k`, {
        fill: '#5ba3f5', 'font-size': '9', 'text-anchor': 'middle' }));
    }
    if (ld.type === 'moment') {
      const px = toX(ld.xGlobal);
      const r = 12, dir = ld.M >= 0 ? 1 : -1;
      // Curved arrow arc (CCW positive)
      const arcPath = `M ${px - r} ${bY - 8} A ${r} ${r} 0 1 ${dir > 0 ? 1 : 0} ${px + r} ${bY - 8}`;
      svg.appendChild(svgEl('path', { d: arcPath, fill: 'none', stroke: '#c084fc', 'stroke-width': '1.5' }));
      const arrowX = px + r, arrowY = bY - 8;
      svg.appendChild(svgEl('polygon', {
        points: `${arrowX},${arrowY} ${arrowX - 5*dir},${arrowY + 4} ${arrowX - 5*dir},${arrowY - 4}`,
        fill: '#c084fc' }));
      svg.appendChild(svgText(px, bY - r - 14, `${fmt(Math.abs(ld.M))} k·ft`, {
        fill: '#c084fc', 'font-size': '9', 'text-anchor': 'middle' }));
    }
  }

  // ── Span length labels ────────────────────────────────────────────────────
  let cum = 0;
  for (const sp of userInput.spans) {
    const x1 = toX(cum), x2 = toX(cum + sp.L);
    const midX = (x1 + x2) / 2;
    svg.appendChild(svgText(midX, bY + 58, `L = ${fmt(sp.L, 0)} ft`, {
      fill: '#808898', 'font-size': '9', 'text-anchor': 'middle' }));
    // Span ticks — placed below support labels to avoid overlap
    svg.appendChild(svgEl('line', { x1: x1, y1: bY + 44, x2: x2, y2: bY + 44, stroke: '#444', 'stroke-width': '0.5' }));
    svg.appendChild(svgEl('line', { x1: x1, y1: bY + 41, x2: x1, y2: bY + 47, stroke: '#444', 'stroke-width': '0.5' }));
    svg.appendChild(svgEl('line', { x1: x2, y1: bY + 41, x2: x2, y2: bY + 47, stroke: '#444', 'stroke-width': '0.5' }));
    cum += sp.L;
  }

  // ── Reactions (if results available) ─────────────────────────────────────
  if (results) {
    for (const r of results.rxnTable) {
      const rx = toX(r.x);
      if (Math.abs(r.Fy) > 0.001) {
        // Reactions drawn below beam: upward Fy = arrow pointing up toward beam
        const upward = r.Fy >= 0;
        const aTop = bY + 26, aBot = bY + 56;
        svg.appendChild(svgEl('line', {
          x1: rx, y1: aTop, x2: rx, y2: aBot,
          stroke: '#4ade80', 'stroke-width': '1.5', 'stroke-dasharray': '4,2' }));
        if (upward) {
          // Arrowhead pointing up (apex at aTop, base below)
          svg.appendChild(svgEl('polygon', {
            points: `${rx},${aTop} ${rx-3},${aTop+7} ${rx+3},${aTop+7}`, fill: '#4ade80' }));
        } else {
          // Arrowhead pointing down (apex at aBot, base above)
          svg.appendChild(svgEl('polygon', {
            points: `${rx},${aBot} ${rx-3},${aBot-7} ${rx+3},${aBot-7}`, fill: '#4ade80' }));
        }
        svg.appendChild(svgText(rx, aBot + 12, `${fmt(Math.abs(r.Fy))} k`, {
          fill: '#4ade80', 'font-size': '8', 'text-anchor': 'middle' }));
      }
    }
  }
}

function drawSupport(svg, sx, bY, type, label) {
  const ts = 7; // triangle half-width
  if (type === 'fixed') {
    // Hatched box
    svg.appendChild(svgEl('rect', { x: sx - 4, y: bY, width: 8, height: 14, fill: '#555', stroke: '#888', 'stroke-width': '0.5' }));
    svg.appendChild(svgEl('line', { x1: sx - 8, y1: bY + 14, x2: sx + 8, y2: bY + 14, stroke: '#888', 'stroke-width': '1' }));
    for (let h = -6; h <= 6; h += 4) {
      svg.appendChild(svgEl('line', { x1: sx + h, y1: bY + 14, x2: sx + h - 4, y2: bY + 18, stroke: '#888', 'stroke-width': '0.7' }));
    }
  } else {
    // Triangle for pin / roller
    svg.appendChild(svgEl('polygon', {
      points: `${sx},${bY} ${sx - ts},${bY + 13} ${sx + ts},${bY + 13}`,
      fill: 'none', stroke: '#c8cdd4', 'stroke-width': '1.5' }));
    svg.appendChild(svgEl('line', {
      x1: sx - ts - 3, y1: bY + 15, x2: sx + ts + 3, y2: bY + 15,
      stroke: '#c8cdd4', 'stroke-width': '1' }));
    if (type === 'roller') {
      // Roller circles
      for (let c = -1; c <= 1; c++) {
        svg.appendChild(svgEl('circle', { cx: sx + c * 5, cy: bY + 18, r: 2.5, fill: 'none', stroke: '#c8cdd4', 'stroke-width': '1' }));
      }
    }
  }
  // Support label
  svg.appendChild(svgText(sx, bY + (type === 'roller' ? 34 : 28), label, {
    fill: '#c8cdd4', 'font-size': '10', 'text-anchor': 'middle', 'font-weight': '600' }));
}

// ── Generic Diagram Renderer (SFD / BMD / Deflection) ──────────────────────

function drawDiagram(svg, xArr, yArr, totalL, opts) {
  clearSvg(svg);
  const n = xArr.length;
  if (n < 2) return;

  const { label, unit, fillPos, fillNeg, strokeColor,
          yMin: userYmin, yMax: userYmax, invertPlot, gridLines } = opts;

  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: VB_W, height: VB_H, fill: '#181818' }));

  // Compute data range
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) { if (yArr[i] < ymin) ymin = yArr[i]; if (yArr[i] > ymax) ymax = yArr[i]; }
  if (userYmin !== undefined) ymin = userYmin;
  if (userYmax !== undefined) ymax = userYmax;
  const range = ymax - ymin;
  if (range < 1e-10) { ymin -= 1; ymax += 1; }
  const yRange = ymax - ymin;
  const padFrac = 0.12;
  const dispMin = ymin - yRange * padFrac;
  const dispMax = ymax + yRange * padFrac;
  const dispRange = dispMax - dispMin;

  function toSvgY(v) {
    // invertPlot: positive up in structural convention → maps to lower SVG y
    const norm = invertPlot ? (v - dispMin) / dispRange : (v - dispMin) / dispRange;
    return invertPlot
      ? PAD_T + (1 - norm) * PLOT_H
      : PAD_T + (1 - norm) * PLOT_H;
  }
  function toSvgX(x) { return worldToSvg(x, totalL); }

  // Zero-line y in SVG coordinates
  const zeroSvgY = toSvgY(0);

  // ── Grid lines ───────────────────────────────────────────────────────────
  if (gridLines) {
    for (const gv of gridLines) {
      const gy = toSvgY(gv);
      svg.appendChild(svgEl('line', { x1: PAD_L, y1: gy, x2: PAD_L + PLOT_W, y2: gy,
        stroke: '#2a2a2a', 'stroke-width': '0.5' }));
    }
  }

  // ── Axes ──────────────────────────────────────────────────────────────────
  svg.appendChild(svgEl('line', { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: PAD_T + PLOT_H,
    stroke: '#333', 'stroke-width': '0.5' }));
  svg.appendChild(svgEl('line', { x1: PAD_L, y1: PAD_T + PLOT_H, x2: PAD_L + PLOT_W, y2: PAD_T + PLOT_H,
    stroke: '#333', 'stroke-width': '0.5' }));

  // ── Filled areas (positive and negative separately) ───────────────────────
  function buildFilledPath(positive) {
    let d = '';
    let inSeg = false;
    let segStart = null;
    for (let i = 0; i < n; i++) {
      const val = yArr[i];
      const inRegion = positive ? val >= 0 : val <= 0;
      const sx = toSvgX(xArr[i]);
      const sy = toSvgY(val);
      if (inRegion) {
        if (!inSeg) {
          // Start new segment at zero crossing
          if (i > 0) {
            // Interpolate zero crossing
            const xPrev = xArr[i - 1], yPrev = yArr[i - 1];
            const t = yPrev / (yPrev - val);
            const zeroX = toSvgX(xPrev + t * (xArr[i] - xPrev));
            d += `M ${zeroX} ${zeroSvgY} L ${sx} ${sy} `;
            segStart = zeroX;
          } else {
            d += `M ${sx} ${zeroSvgY} L ${sx} ${sy} `;
            segStart = sx;
          }
          inSeg = true;
        } else {
          d += `L ${sx} ${sy} `;
        }
      } else {
        if (inSeg) {
          // End segment at zero crossing
          const xPrev = xArr[i - 1], yPrev = yArr[i - 1];
          const t = yPrev / (yPrev - val);
          const zeroX = toSvgX(xPrev + t * (xArr[i] - xPrev));
          d += `L ${zeroX} ${zeroSvgY} Z `;
          inSeg = false;
        }
      }
    }
    if (inSeg) {
      const lx = toSvgX(xArr[n - 1]);
      d += `L ${lx} ${zeroSvgY} Z `;
    }
    return d;
  }

  const posPath = buildFilledPath(true);
  const negPath = buildFilledPath(false);
  if (posPath) svg.appendChild(svgEl('path', { d: posPath, fill: fillPos, stroke: 'none' }));
  if (negPath) svg.appendChild(svgEl('path', { d: negPath, fill: fillNeg, stroke: 'none' }));

  // ── Diagram outline ───────────────────────────────────────────────────────
  let pathD = '';
  for (let i = 0; i < n; i++) {
    const sx = toSvgX(xArr[i]), sy = toSvgY(yArr[i]);
    pathD += (i === 0 ? `M ${sx} ${sy}` : ` L ${sx} ${sy}`);
  }
  svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: strokeColor, 'stroke-width': '1.5' }));

  // ── Zero line ─────────────────────────────────────────────────────────────
  svg.appendChild(svgEl('line', { x1: PAD_L, y1: zeroSvgY, x2: PAD_L + PLOT_W, y2: zeroSvgY,
    stroke: '#555', 'stroke-width': '0.8', 'stroke-dasharray': '3,3' }));

  // ── Y-axis labels ─────────────────────────────────────────────────────────
  const nTicks = 4;
  for (let t = 0; t <= nTicks; t++) {
    const v = dispMin + (t / nTicks) * dispRange;
    const ty = toSvgY(v);
    svg.appendChild(svgText(PAD_L - 4, ty + 3.5, fmt(v), {
      fill: '#808898', 'font-size': '8', 'text-anchor': 'end' }));
    svg.appendChild(svgEl('line', { x1: PAD_L - 2, y1: ty, x2: PAD_L, y2: ty, stroke: '#555', 'stroke-width': '0.5' }));
  }

  // ── X-axis labels (support positions) ────────────────────────────────────
  const labelPositions = new Set([0, totalL]);
  for (const s of (opts.supportXs || [])) labelPositions.add(s);
  for (const lx of labelPositions) {
    const sx = toSvgX(lx);
    svg.appendChild(svgEl('line', { x1: sx, y1: PAD_T + PLOT_H, x2: sx, y2: PAD_T + PLOT_H + 4, stroke: '#555', 'stroke-width': '0.5' }));
    svg.appendChild(svgText(sx, PAD_T + PLOT_H + 13, fmt(lx, 0), {
      fill: '#808898', 'font-size': '8', 'text-anchor': 'middle' }));
  }

  // ── Peak annotations ──────────────────────────────────────────────────────
  let peakPosIdx = -1, peakNegIdx = -1;
  for (let i = 0; i < n; i++) {
    if (peakPosIdx < 0 || yArr[i] > yArr[peakPosIdx]) peakPosIdx = i;
    if (peakNegIdx < 0 || yArr[i] < yArr[peakNegIdx]) peakNegIdx = i;
  }
  function annotatePeak(idx, clr) {
    const sx = toSvgX(xArr[idx]), sy = toSvgY(yArr[idx]);
    const v = yArr[idx];
    if (Math.abs(v) < 1e-9) return;
    svg.appendChild(svgEl('circle', { cx: sx, cy: sy, r: 2.5, fill: clr }));
    const above = sy > zeroSvgY;
    let ty = above ? sy - 10 : sy + 14;
    // Clamp so annotation never clips outside the plot area
    ty = Math.max(ty, PAD_T + 14);
    ty = Math.min(ty, PAD_T + PLOT_H - 4);
    svg.appendChild(svgText(sx, ty, `${fmt(v)} ${unit}`, {
      fill: clr, 'font-size': '8.5', 'text-anchor': 'middle', 'font-weight': '600' }));
  }
  if (peakPosIdx >= 0) annotatePeak(peakPosIdx, strokeColor);
  if (peakNegIdx >= 0 && peakNegIdx !== peakPosIdx) annotatePeak(peakNegIdx, strokeColor);

  // ── Diagram label ─────────────────────────────────────────────────────────
  svg.appendChild(svgText(PAD_L + 4, PAD_T + 12, label, {
    fill: '#808898', 'font-size': '9', 'font-weight': '600' }));
  svg.appendChild(svgText(PAD_L + 4, PAD_T + 22, unit, {
    fill: '#606878', 'font-size': '8' }));
}

// ── Public draw functions ────────────────────────────────────────────────────

function drawSFD(svg, results, userInput) {
  const totalL = userInput.spans.reduce((s, sp) => s + sp.L, 0);
  const supportXs = userInput.supports.map(s => s.xGlobal);
  drawDiagram(svg, results.xArr, results.VArr, totalL, {
    label: 'Shear Force',
    unit: 'kip',
    fillPos: 'rgba(251,146,60,0.25)',
    fillNeg: 'rgba(251,146,60,0.12)',
    strokeColor: '#fb923c',
    supportXs
  });
}

function drawBMD(svg, results, userInput) {
  const totalL = userInput.spans.reduce((s, sp) => s + sp.L, 0);
  const supportXs = userInput.supports.map(s => s.xGlobal);
  // Negate M array: positive sagging → plotted below zero line (down = positive by SE convention)
  const negM = new Float64Array(results.MArr.length);
  for (let i = 0; i < negM.length; i++) negM[i] = -results.MArr[i];
  drawDiagram(svg, results.xArr, negM, totalL, {
    label: 'Bending Moment  (+ sagging, plotted downward)',
    unit: 'kip·ft',
    fillPos: 'rgba(96,165,250,0.25)',
    fillNeg: 'rgba(96,165,250,0.12)',
    strokeColor: '#60a5fa',
    supportXs
  });
}

function drawDeflection(svg, results, userInput) {
  const totalL = userInput.spans.reduce((s, sp) => s + sp.L, 0);
  const supportXs = userInput.supports.map(s => s.xGlobal);
  drawDiagram(svg, results.xArr, results.dArr, totalL, {
    label: 'Deflection',
    unit: 'in',
    fillPos: 'rgba(74,222,128,0.25)',
    fillNeg: 'rgba(74,222,128,0.12)',
    strokeColor: '#4ade80',
    supportXs
  });
}

// ── Hover Interaction ────────────────────────────────────────────────────────
// Attaches mousemove to a diagram SVG and fires callback(x_world, V, M, delta)

function bindHover(svgEl, results, totalL, callback) {
  svgEl.addEventListener('mousemove', function (e) {
    const rect = svgEl.getBoundingClientRect();
    const svgW = rect.width;
    const scaleFactor = VB_W / svgW;
    const svgX = (e.clientX - rect.left) * scaleFactor;
    const xWorld = (svgX - PAD_L) / PLOT_W * totalL;
    if (xWorld < 0 || xWorld > totalL) { callback(null); return; }
    // Binary search for nearest index
    const xArr = results.xArr;
    let lo = 0, hi = xArr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xArr[mid] < xWorld) lo = mid + 1; else hi = mid;
    }
    const idx = lo;
    callback({
      x: xArr[idx],
      V: results.VArr[idx],
      M: results.MArr[idx],
      d: results.dArr[idx],
      svgX: svgX
    });
  });
  svgEl.addEventListener('mouseleave', () => callback(null));
}

return { drawElevation, drawSFD, drawBMD, drawDeflection, bindHover };
})();
