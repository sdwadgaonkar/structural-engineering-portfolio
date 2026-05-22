// beam-fem.js — Euler-Bernoulli FEM solver for multi-span continuous beams
// Exported as window.BeamFEM = { solve }
// Units: kip, ft throughout internally. EI = E(ksi)*I(in⁴)/144 → kip·ft²

window.BeamFEM = (function () {
'use strict';

// ── Validation ──────────────────────────────────────────────────────────────

function validate(inp) {
  const { spans, supports } = inp;
  if (!spans || spans.length < 1 || spans.length > 3)
    return 'Number of spans must be 1–3.';
  let totalL = 0;
  for (let i = 0; i < spans.length; i++) {
    if (!(spans[i].L > 0)) return `Span ${i+1}: length must be > 0.`;
    if (!(spans[i].E > 0)) return `Span ${i+1}: E must be > 0.`;
    if (!(spans[i].I > 0)) return `Span ${i+1}: I must be > 0.`;
    totalL += spans[i].L;
  }
  if (!supports || supports.length < 2)
    return 'At least 2 supports required.';
  let hasVertical = 0;
  for (const s of supports) {
    if (!['pin','roller','fixed'].includes(s.type))
      return `Unknown support type "${s.type}".`;
    if (s.xGlobal < -1e-9 || s.xGlobal > totalL + 1e-9)
      return `Support at x=${s.xGlobal.toFixed(2)} ft is outside beam.`;
    if (s.type === 'pin' || s.type === 'roller' || s.type === 'fixed') hasVertical++;
  }
  if (hasVertical < 2) return 'Beam must have at least 2 vertical supports.';
  const loads = inp.loads || [];
  for (const ld of loads) {
    if (ld.type === 'point' || ld.type === 'moment') {
      if (ld.xGlobal < -1e-9 || ld.xGlobal > totalL + 1e-9)
        return `Load at x=${ld.xGlobal.toFixed(2)} ft is outside beam.`;
    }
    if (ld.type === 'udl' || ld.type === 'trap') {
      if (ld.xStart < -1e-9 || ld.xEnd > totalL + 1e-9)
        return `Distributed load extends outside beam.`;
      if (ld.xStart >= ld.xEnd - 1e-9)
        return `Distributed load has zero or negative length.`;
    }
  }
  return null;
}

// ── Element Stiffness ───────────────────────────────────────────────────────
// DOF order: [v₁, θ₁, v₂, θ₂], upward-positive, CCW-positive

function elemStiffness(L, EI) {
  const c = EI / (L * L * L);
  const L2 = L * L;
  return [
     12*c,    6*L*c,  -12*c,    6*L*c,
     6*L*c,  4*L2*c,  -6*L*c,  2*L2*c,
    -12*c,  -6*L*c,   12*c,  -6*L*c,
     6*L*c,  2*L2*c,  -6*L*c,  4*L2*c
  ];
}

// ── Equivalent Nodal Load — Trapezoidal Distributed Load ────────────────────
// w1 at node i, w2 at node j — positive DOWNWARD in user convention.
// Returns upward-positive nodal forces consistent with DOF convention.

function elemLoad(L, w1, w2) {
  const L2 = L * L;
  return [
    -L  * (7*w1 + 3*w2) / 20,
    -L2 * (3*w1 + 2*w2) / 60,
    -L  * (3*w1 + 7*w2) / 20,
     L2 * (2*w1 + 3*w2) / 60
  ];
}

// ── Mesh Builder ────────────────────────────────────────────────────────────

function buildMesh(inp) {
  const nSub = (inp.options && inp.options.nSub) || 10;
  const loads = inp.loads || [];

  // Build span metadata with cumulative positions and EI in kip·ft²
  let cum = 0;
  const spanMeta = inp.spans.map(s => {
    const x0 = cum; cum += s.L;
    return { x0, x1: cum, EI: s.E * s.I / 144 };
  });
  const totalL = cum;

  // Collect all significant x-positions that must become mesh nodes
  const sigX = new Set([0, totalL]);
  for (const sm of spanMeta) sigX.add(sm.x1);
  for (const s of inp.supports) sigX.add(s.xGlobal);
  for (const ld of loads) {
    if (ld.type === 'point' || ld.type === 'moment') sigX.add(ld.xGlobal);
    else { sigX.add(ld.xStart); sigX.add(ld.xEnd); }
  }
  const segs = Array.from(sigX).sort((a, b) => a - b);

  // Node registry — deduplicates by x position
  const nodes = [];
  function getNode(x) {
    for (let i = 0; i < nodes.length; i++)
      if (Math.abs(nodes[i].x - x) < 1e-9) return i;
    nodes.push({ x });
    return nodes.length - 1;
  }

  function getEI(xMid) {
    for (const sm of spanMeta)
      if (xMid >= sm.x0 - 1e-9 && xMid <= sm.x1 + 1e-9) return sm.EI;
    return spanMeta[spanMeta.length - 1].EI;
  }

  function loadWAt(ld, x) {
    if (ld.type === 'udl') return ld.w;
    return ld.w1 + (ld.w2 - ld.w1) * (x - ld.xStart) / (ld.xEnd - ld.xStart);
  }

  // Build elements — subdivide each segment into nSub sub-elements
  const elements = [];
  for (let s = 0; s < segs.length - 1; s++) {
    const xA = segs[s], xB = segs[s + 1], segLen = xB - xA;
    for (let k = 0; k < nSub; k++) {
      const x0 = xA + segLen * k / nSub;
      const x1 = xA + segLen * (k + 1) / nSub;
      const ni = getNode(x0), nj = getNode(x1);
      const L = x1 - x0;
      const EI = getEI((x0 + x1) / 2);

      // Collect distributed loads that fully cover this element
      const dloads = [];
      for (const ld of loads) {
        if ((ld.type === 'udl' || ld.type === 'trap') &&
            ld.xStart <= x0 + 1e-9 && ld.xEnd >= x1 - 1e-9) {
          dloads.push({ w1: loadWAt(ld, x0), w2: loadWAt(ld, x1) });
        }
      }
      elements.push({ ni, nj, L, EI, dloads, x0, x1 });
    }
  }

  // Nodal load vector — point loads and applied moments placed directly at nodes
  const F_nodal = new Float64Array(nodes.length * 2);
  for (const ld of loads) {
    if (ld.type === 'point') {
      const ni = getNode(ld.xGlobal);
      F_nodal[2 * ni] -= ld.P; // P positive downward → negate for upward-positive F
    } else if (ld.type === 'moment') {
      const ni = getNode(ld.xGlobal);
      F_nodal[2 * ni + 1] += ld.M; // CCW positive
    }
  }

  // Boundary conditions
  const bcs = [];
  for (const s of inp.supports) {
    const ni = getNode(s.xGlobal);
    const sett = -((s.settlement || 0) / 12); // in → ft, upward positive (negate)
    if (s.type === 'pin' || s.type === 'roller') {
      bcs.push({ ni, dof: 0, val: sett });
    } else { // fixed
      bcs.push({ ni, dof: 0, val: sett });
      bcs.push({ ni, dof: 1, val: 0 });
    }
  }

  return { nodes, elements, bcs, F_nodal, totalL, spanMeta };
}

// ── Global Assembly ─────────────────────────────────────────────────────────

function assemble(mesh) {
  const N = mesh.nodes.length * 2;
  const K = new Float64Array(N * N);
  const F = new Float64Array(mesh.F_nodal);

  for (const el of mesh.elements) {
    const { ni, nj, L, EI, dloads } = el;
    const ke = elemStiffness(L, EI);
    const map = [2 * ni, 2 * ni + 1, 2 * nj, 2 * nj + 1];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        K[map[r] * N + map[c]] += ke[r * 4 + c];
    for (const dl of dloads) {
      const fe = elemLoad(L, dl.w1, dl.w2);
      for (let r = 0; r < 4; r++) F[map[r]] += fe[r];
    }
  }
  return { K, F, N };
}

// ── Boundary Condition Application — Elimination Method ────────────────────

function applyBCs(K, F, N, bcs) {
  const constSet = new Map();
  for (const bc of bcs) {
    const gd = 2 * bc.ni + bc.dof;
    if (!constSet.has(gd)) constSet.set(gd, bc.val);
  }
  const constDOFs = Array.from(constSet.keys());
  const constVals = constDOFs.map(d => constSet.get(d));
  const freeDOFs = [];
  for (let i = 0; i < N; i++) if (!constSet.has(i)) freeDOFs.push(i);
  const nF = freeDOFs.length;

  const K_ff = new Float64Array(nF * nF);
  const F_ff = new Float64Array(nF);
  for (let i = 0; i < nF; i++) {
    F_ff[i] = F[freeDOFs[i]];
    for (let j = 0; j < nF; j++)
      K_ff[i * nF + j] = K[freeDOFs[i] * N + freeDOFs[j]];
    for (let j = 0; j < constDOFs.length; j++)
      F_ff[i] -= K[freeDOFs[i] * N + constDOFs[j]] * constVals[j];
  }
  return { K_ff, F_ff, freeDOFs, constDOFs, constVals };
}

// ── Gaussian Elimination with Partial Pivoting ──────────────────────────────

function gaussElim(A_in, b_in, n) {
  const A = new Float64Array(A_in);
  const b = new Float64Array(b_in);
  for (let p = 0; p < n; p++) {
    let maxR = p, maxV = Math.abs(A[p * n + p]);
    for (let r = p + 1; r < n; r++) {
      const v = Math.abs(A[r * n + p]);
      if (v > maxV) { maxV = v; maxR = r; }
    }
    if (maxR !== p) {
      for (let j = 0; j < n; j++) {
        let t = A[p * n + j]; A[p * n + j] = A[maxR * n + j]; A[maxR * n + j] = t;
      }
      let t = b[p]; b[p] = b[maxR]; b[maxR] = t;
    }
    if (Math.abs(A[p * n + p]) < 1e-14)
      throw new Error('Singular stiffness matrix — check supports and constraints.');
    for (let r = p + 1; r < n; r++) {
      const fac = A[r * n + p] / A[p * n + p];
      for (let j = p; j < n; j++) A[r * n + j] -= fac * A[p * n + j];
      b[r] -= fac * b[p];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
    x[i] = s / A[i * n + i];
  }
  return x;
}

// ── Displacement Recovery ───────────────────────────────────────────────────

function recoverU(uFree, freeDOFs, constVals, constDOFs, N) {
  const u = new Float64Array(N);
  for (let i = 0; i < freeDOFs.length; i++) u[freeDOFs[i]] = uFree[i];
  for (let i = 0; i < constDOFs.length; i++) u[constDOFs[i]] = constVals[i];
  return u;
}

// ── Reaction Recovery ───────────────────────────────────────────────────────

function recoverRxns(K, F, u, N, mesh) {
  const { bcs, nodes } = mesh;
  const seen = new Set();
  const rxns = [];
  for (const bc of bcs) {
    const gd = 2 * bc.ni + bc.dof;
    if (seen.has(gd)) continue;
    seen.add(gd);
    let Ku = 0;
    for (let j = 0; j < N; j++) Ku += K[gd * N + j] * u[j];
    rxns.push({ nodeId: bc.ni, x: nodes[bc.ni].x, dof: bc.dof, value: Ku - F[gd] });
  }
  return rxns;
}

// ── Deflection via Hermite Shape Function Interpolation ─────────────────────

function interpDelta(x, mesh, u) {
  for (const el of mesh.elements) {
    if (x < el.x0 - 1e-9 || x > el.x1 + 1e-9) continue;
    const xi = (x - el.x0) / el.L;
    const L = el.L;
    const v1 = u[2 * el.ni], t1 = u[2 * el.ni + 1];
    const v2 = u[2 * el.nj], t2 = u[2 * el.nj + 1];
    const xi2 = xi * xi, xi3 = xi2 * xi;
    return (1 - 3*xi2 + 2*xi3)*v1 + L*(xi - 2*xi2 + xi3)*t1
         + (3*xi2 - 2*xi3)*v2   + L*(-xi2 + xi3)*t2;
  }
  return 0;
}

// ── Section Method: V and M by Equilibrium ─────────────────────────────────
// Reaction moments (dof=1, CCW+) contribute -R to M because the FEM reaction
// moment is the conjugate force to θ — it has opposite sign from the internal
// structural moment in the section method.
// Applied moments in inp.loads contribute +M (not negated).

function sectionVM(x, rxns, inp) {
  let V = 0, M = 0;
  const eps = 1e-9;
  for (const r of rxns) {
    if (r.x < x - eps) {
      if (r.dof === 0) { V += r.value; M += r.value * (x - r.x); }
      else              { M -= r.value; } // reaction moment: NEGATE
    }
  }
  const loads = inp.loads || [];
  for (const ld of loads) {
    if (ld.type === 'point' && ld.xGlobal < x - eps) {
      V -= ld.P; M -= ld.P * (x - ld.xGlobal);
    }
    if (ld.type === 'moment' && ld.xGlobal < x - eps) {
      M += ld.M; // applied moment: NOT negated
    }
    if ((ld.type === 'udl' || ld.type === 'trap') && ld.xStart < x - eps) {
      const xL = ld.xStart;
      const xR = Math.min(ld.xEnd, x - eps);
      if (xR <= xL) continue;
      const wL = (ld.type === 'udl') ? ld.w : ld.w1;
      const dx = xR - xL;
      const rateT = (ld.type === 'udl') ? 0 : (ld.w2 - ld.w1) / (ld.xEnd - ld.xStart);
      const wR = wL + rateT * dx;
      const Ftot = (wL + wR) * dx / 2;
      const xc = (Math.abs(wL + wR) < 1e-12) ? xL + dx / 2
                  : xL + dx * (wL + 2 * wR) / (3 * (wL + wR));
      V -= Ftot; M -= Ftot * (x - xc);
    }
  }
  return { V, M };
}

// ── Post-Processing ─────────────────────────────────────────────────────────

function postProcess(mesh, u, rxns, inp) {
  const totalL = mesh.totalL;
  const loads = inp.loads || [];
  const tiny = totalL * 1e-6;

  // Build sample x-array: 300 uniform + triple-points around discontinuities
  const xSet = new Set();
  for (let i = 0; i <= 300; i++) xSet.add((i / 300) * totalL);

  const discX = [0, totalL];
  for (const r of rxns) discX.push(r.x);
  for (const ld of loads) {
    if (ld.type === 'point' || ld.type === 'moment') discX.push(ld.xGlobal);
    else { discX.push(ld.xStart); discX.push(ld.xEnd); }
  }
  for (const dx of discX) {
    xSet.add(Math.max(0, dx));
    if (dx > tiny) xSet.add(dx - tiny);
    if (dx < totalL - tiny) xSet.add(dx + tiny);
  }

  const xArr = Float64Array.from(Array.from(xSet).sort((a, b) => a - b));
  const n = xArr.length;
  const VArr = new Float64Array(n);
  const MArr = new Float64Array(n);
  const dArr = new Float64Array(n);

  let Vmax = -Infinity, Vmin = Infinity;
  let Mmax = -Infinity, Mmin = Infinity;
  let dmax = -Infinity, dmin = Infinity;

  for (let i = 0; i < n; i++) {
    const x = xArr[i];
    const { V, M } = sectionVM(x, rxns, inp);
    const d = interpDelta(x, mesh, u) * 12; // ft → in
    VArr[i] = V; MArr[i] = M; dArr[i] = d;
    if (V > Vmax) Vmax = V; if (V < Vmin) Vmin = V;
    if (M > Mmax) Mmax = M; if (M < Mmin) Mmin = M;
    if (d > dmax) dmax = d; if (d < dmin) dmin = d;
  }

  // Reaction table aligned to user-defined supports
  const labels = 'ABCDEFGHIJ';
  const rxnTable = inp.supports.map((sup, i) => {
    const Fy_r = rxns.find(r => Math.abs(r.x - sup.xGlobal) < 1e-6 && r.dof === 0);
    const Mz_r = rxns.find(r => Math.abs(r.x - sup.xGlobal) < 1e-6 && r.dof === 1);
    return {
      label: labels[i] || `${i + 1}`,
      x: sup.xGlobal,
      type: sup.type,
      Fy: Fy_r ? Fy_r.value : 0,
      Mz: Mz_r ? Mz_r.value : null
    };
  });

  return { xArr, VArr, MArr, dArr, Vmax, Vmin, Mmax, Mmin, dmax, dmin, rxnTable, rxns };
}

// ── Main Entry Point ────────────────────────────────────────────────────────

function solve(inp) {
  try {
    const err = validate(inp);
    if (err) return { ok: false, error: err };
    const mesh = buildMesh(inp);
    const N = mesh.nodes.length * 2;
    const { K, F } = assemble(mesh);
    const bcData = applyBCs(K, F, N, mesh.bcs);
    if (bcData.freeDOFs.length === 0)
      return { ok: false, error: 'All DOFs constrained — over-constrained beam.' };
    const uFree = gaussElim(bcData.K_ff, bcData.F_ff, bcData.freeDOFs.length);
    const u = recoverU(uFree, bcData.freeDOFs, bcData.constVals, bcData.constDOFs, N);
    const rxns = recoverRxns(K, F, u, N, mesh);
    const results = postProcess(mesh, u, rxns, inp);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

return { solve };
})();
