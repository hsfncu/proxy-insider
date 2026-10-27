// λ 敏感度與行為參數敏感度（論文 3.5 節 Prop. 7/8、4.7 節）。
// 輸入：stats_summary.json（各配置實測 π=ASR、U=UTIL）。輸出：sensitivity_summary.json。
// 模型：M(x) = π(x)·F(c*(x))，c* = [π b − q s (1−ν)]/(1−δ)，c ~ U[0, C̄]，b = 1。
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const S = JSON.parse(fs.readFileSync(path.join(dir, "stats_summary_v2.json"), "utf8"));
const NAMES = ["L1", "L2", "L3", "L4", "L5"];
const pi = [], U = [];
for (let m = 0; m < 32; m++) { pi.push(S.configs[m].asr); U.push(S.configs[m].util); }
const label = m => m === 0 ? "L0" : NAMES.filter((_, i) => (m >> i) & 1).join("+");
const hasCk = m => ((m >> 3) & 1) || ((m >> 4) & 1);

function misuse(p, { delta, nu, qs, Cbar }) {
  if (delta === null) return p;
  const cstar = (p * 1 - qs * (1 - nu)) / (1 - delta);
  const F = Math.min(1, Math.max(0, cstar / Cbar));
  return p * F;
}

function hull(M, Uv) {
  const EPS = 1e-12;
  let cur = 0;
  for (let m = 1; m < 32; m++)
    if (Uv[m] > Uv[cur] + EPS || (Math.abs(Uv[m] - Uv[cur]) <= EPS && M[m] < M[cur])) cur = m;
  const seq = [{ mask: cur, lambdaFrom: 0 }];
  for (;;) {
    let best = -1, bl = Infinity;
    for (let k = 0; k < 32; k++) {
      if (M[k] >= M[cur] - EPS) continue;
      const l = (Uv[cur] - Uv[k]) / (M[cur] - M[k]);
      if (l < bl - EPS || (Math.abs(l - bl) <= EPS && M[k] < M[best])) { bl = l; best = k; }
    }
    if (best < 0) break;
    seq.push({ mask: best, lambdaFrom: bl });
    cur = best;
  }
  return seq;
}
const nested = seq => seq.every((v, i) => i === 0 || (seq[i - 1].mask & ~v.mask) === 0);
const fmt = seq => seq.map(v => `${label(v.mask)}@λ≥${v.lambdaFrom.toFixed(3)}`).join(" → ");

const out = { note: "M = π·F(c*); b=1; W = U − λM; C(x)=0", baseline: {}, grid: {}, epsilon: {} };

const base = hull(pi, U);
out.baseline = { vertices: base.map(v => ({ config: label(v.mask), mask: v.mask, M: pi[v.mask], U: U[v.mask], lambda_from: v.lambdaFrom })),
                 nested: nested(base) };
console.log("基準（M=π）：", fmt(base), "｜集合巢狀：", nested(base));

const grid = [];
for (const delta of [0, 0.25, 0.5, 0.75])
  for (const nu of [0, 0.25, 0.5])
    for (const qs of [0, 0.05, 0.1, 0.2, 0.3])
      for (const Cbar of [1, 2]) grid.push({ delta, nu, qs, Cbar });
const vertexFreq = {}, seqFreq = {};
let ckEver = 0, nonNested = 0;
const lamToZero = [];
for (const g of grid) {
  const M = pi.map(p => misuse(p, g));
  const seq = hull(M, U);
  const key = fmt(seq.map(v => ({ ...v, lambdaFrom: 0 }))).replace(/@λ≥0\.000/g, "");
  seqFreq[key] = (seqFreq[key] || 0) + 1;
  for (const v of seq) vertexFreq[label(v.mask)] = (vertexFreq[label(v.mask)] || 0) + 1;
  if (seq.some(v => hasCk(v.mask))) ckEver++;
  if (!nested(seq)) nonNested++;
  const z = seq.find(v => M[v.mask] === 0);
  lamToZero.push(z ? z.lambdaFrom : null);
}
const lz = lamToZero.filter(x => x !== null).sort((a, b) => a - b);
out.grid = { n_points: grid.length, axes: { delta: [0, 0.25, 0.5, 0.75], nu: [0, 0.25, 0.5], qs: [0, 0.05, 0.1, 0.2, 0.3], Cbar: [1, 2] },
             vertex_frequency: vertexFreq, sequence_frequency: seqFreq,
             points_with_checkpoint_vertex: ckEver, points_non_nested: nonNested,
             lambda_to_zero_misuse: { min: lz[0], median: lz[Math.floor(lz.length / 2)], max: lz[lz.length - 1] } };
console.log(`\n格點 ${grid.length} 組；含檢查點的頂點出現於 ${ckEver} 組；非巢狀 ${nonNested} 組`);
console.log("頂點出現次數：", vertexFreq);
console.log("頂點序列：", seqFreq);
console.log("達到 M=0 所需 λ：", out.grid.lambda_to_zero_misuse);

function piEps(eps) {
  return pi.map((p, m) => p + eps * (pi[m & ~0b101] - p));
}
const epsRows = [];
let firstCk = null;
for (let i = 0; i <= 100; i++) {
  const eps = i / 100, pe = piEps(eps), seq = hull(pe, U);
  const ck = seq.filter(v => hasCk(v.mask));
  if (ck.length && firstCk === null) firstCk = { eps, seq: fmt(seq) };
  if (i % 10 === 0 || (ck.length && epsRows.length && !epsRows[epsRows.length - 1].ck)) {
    epsRows.push({ eps, ck: ck.length > 0, sequence: fmt(seq),
                   pi_L1L2L3: pe[7], lambda_to_checkpoint: ck.length ? ck[0].lambdaFrom : null });
  }
}
out.epsilon = { first_checkpoint_vertex: firstCk, rows: epsRows };
console.log("\n規則不完整度 ε：");
for (const r of epsRows) console.log(`  ε=${r.eps.toFixed(2)} π(L1+L2+L3)=${r.pi_L1L2L3.toFixed(3)} 檢查點上前緣=${r.ck}  ${r.sequence}`);
console.log("檢查點首次成為頂點：", firstCk);

out.epsilon.grid_share = {};
for (const eps of [0.1, 0.2, 0.5, 1.0]) {
  const pe = piEps(eps); let c = 0;
  for (const g of grid) if (hull(pe.map(p => misuse(p, g)), U).some(v => hasCk(v.mask))) c++;
  out.epsilon.grid_share[eps] = c / grid.length;
}
console.log("ε × 行為格點：檢查點成為頂點的比例", out.epsilon.grid_share);

fs.writeFileSync(path.join(dir, "sensitivity_summary_v2.json"), JSON.stringify(out, null, 2));
console.log("\n已寫出 sensitivity_summary_v2.json");

function piDrop(dropMask, eps, base = pi) {
  return base.map((p, m) => p + eps * (base[m & ~dropMask] - p));
}
const PM = 0b10001;
const permRows = [];
let firstNonL5 = null, firstL4 = null;
for (let i = 0; i <= 100; i++) {
  const eps = i / 100, pe = piDrop(PM, eps), seq = hull(pe, U);
  if (firstNonL5 === null && seq.some(v => !((v.mask >> 4) & 1))) firstNonL5 = { eps, seq: fmt(seq) };
  if (firstL4 === null && seq.some(v => (v.mask >> 3) & 1)) firstL4 = { eps, seq: fmt(seq) };
  if ([0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].includes(eps))
    permRows.push({ eps, sequence: fmt(seq), vertices: seq.map(v => ({ config: label(v.mask), pi: pe[v.mask], U: U[v.mask], lambda_from: v.lambdaFrom })) });
}
out.permission_error = { first_non_L5_vertex: firstNonL5, first_L4_vertex: firstL4, rows: permRows, grid_share_L4_vertex: {} };
console.log("\n權限模型錯誤 ε_p（L1、L5 同時失效）：");
for (const r of permRows) console.log(`  ε_p=${r.eps.toFixed(2)}  ${r.sequence}`);
console.log("首次出現不含 L5 的頂點：", firstNonL5, "\n首次出現含 L4 的頂點：", firstL4);
for (const eps of [0.05, 0.1, 0.2, 0.5, 1.0]) {
  const pe = piDrop(PM, eps); let c = 0;
  for (const g of grid) if (hull(pe.map(p => misuse(p, g)), U).some(v => (v.mask >> 3) & 1)) c++;
  out.permission_error.grid_share_L4_vertex[eps] = c / grid.length;
}
console.log("ε_p × 行為格點：含 L4 的頂點比例", out.permission_error.grid_share_L4_vertex);
fs.writeFileSync(path.join(dir, "sensitivity_summary_v2.json"), JSON.stringify(out, null, 2));
