// 產生論文圖（靜態 SVG，供期刊印刷）。資料直接讀實驗輸出，確保圖與內文數字一致。
// 用法：node make_figures.js（輸出至 analysis/figures/）
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "figures");
fs.mkdirSync(OUT, { recursive: true });
const S = JSON.parse(fs.readFileSync(path.join(__dirname, "stats_summary_v2.json"), "utf8"));

const C = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a",
  ink: "#0b0b0b", ink2: "#52514e", muted: "#8a8984", grid: "#e4e3df", surface: "#ffffff" };
const FONT = "Arial, Helvetica, sans-serif";
const NAMES = ["L1", "L2", "L3", "L4", "L5"];
const label = m => m === 0 ? "L0 (none)" : m === 31 ? "All five" : NAMES.filter((_, i) => (m >> i) & 1).join("+");
const pi = [], U = [];
for (let m = 0; m < 32; m++) { pi.push(S.configs[m].asr); U.push(S.configs[m].util); }

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size || 11}" fill="${o.fill || C.ink2}"` +
  `${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.weight ? ` font-weight="${o.weight}"` : ""}` +
  `${o.rotate ? ` transform="rotate(${o.rotate} ${x} ${y})"` : ""}>${esc(s)}</text>`;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="${C.surface}"/>${body.replace(/ε_p/g, 'ε<tspan baseline-shift="sub" font-size="8">p</tspan>')}</svg>\n`;
function marker(shape, x, y, color, r = 5) {
  const ring = `stroke="${C.surface}" stroke-width="2"`;
  if (shape === "circle") return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${ring}/>`;
  if (shape === "square") return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1" fill="${color}" ${ring}/>`;
  const h = r * 1.15;
  return `<path d="M${x},${y - h} L${x + h},${y + h * 0.8} L${x - h},${y + h * 0.8} Z" fill="${color}" ${ring}/>`;
}

{
  const W = 680, H = 460, L = 70, R = 190, T = 30, B = 60;
  const pw = W - L - R, ph = H - T - B;
  const xs = v => L + (v / 1.0) * pw;
  const y0 = 0.50, y1 = 0.80, ys = v => T + (1 - (v - y0) / (y1 - y0)) * ph;
  let b = "";
  for (let v = 0; v <= 1.0001; v += 0.2) {
    b += `<line x1="${xs(v)}" y1="${T}" x2="${xs(v)}" y2="${T + ph}" stroke="${C.grid}"/>`;
    b += text(xs(v), T + ph + 18, v.toFixed(1), { anchor: "middle" });
  }
  for (let v = 0.5; v <= 0.801; v += 0.05) {
    b += `<line x1="${L}" y1="${ys(v)}" x2="${L + pw}" y2="${ys(v)}" stroke="${C.grid}"/>`;
    b += text(L - 8, ys(v) + 4, v.toFixed(2), { anchor: "end" });
  }
  b += `<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${C.ink2}"/>`;
  b += text(L + pw / 2, H - 18, "Misuse success probability π (out-of-scope requests)", { anchor: "middle", fill: C.ink });
  b += text(18, T + ph / 2, "Utility U (legitimate tasks completed)", { anchor: "middle", fill: C.ink, rotate: -90 });
  const fr = S.frontier_point;
  b += `<circle cx="${xs(pi[fr[0]])}" cy="${ys(U[fr[0]])}" r="11" fill="none" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="3 2"/>`;
  const group = m => (m >> 4) & 1 ? "L5" : (m >> 3) & 1 ? "L4" : "none";
  const sty = { none: ["circle", C.blue], L4: ["triangle", C.orange], L5: ["square", C.aqua] };
  const order = [...Array(32).keys()].sort((a, b) => (group(a) === "none") - (group(b) === "none"));
  for (const m of order) {
    const [sh, col] = sty[group(m)];
    const ci = S.configs[m].util_ci;
    b += `<line x1="${xs(pi[m])}" y1="${ys(ci[0])}" x2="${xs(pi[m])}" y2="${ys(ci[1])}" stroke="${col}" stroke-opacity="0.35" stroke-width="1.5"/>`;
    b += marker(sh, xs(pi[m]), ys(U[m]), col);
  }
  const lab = { 0: [-10, 4, "end"], 1: [8, 4, "start"], 2: [8, 4, "start"], 4: [8, 4, "start"], 3: [8, 14, "start"], 8: [10, -8, "start"], 5: [10, 4, "start"], 15: [10, 16, "start"] };
  b += text(xs(0) + 12, ys(U[31]) - 8, "All five", { fill: C.ink, size: 10.5 });
  b += text(xs(0) + 12, ys(U[7]) + 12, "L1+L2+L3", { fill: C.ink, size: 10.5 });
  for (const [m, [dx, dy, a]] of Object.entries(lab))
    b += text(xs(pi[m]) + dx, ys(U[m]) + dy, label(+m), { anchor: a, fill: C.ink, size: 10.5 });
  b += text(xs(pi[fr[0]]) + 16, ys(U[fr[0]]) - 6, "frontier: L2+L5 (= with L1 and/or L3)", { fill: C.ink, size: 10.5 });
  b += text(xs(pi[16]) + 16, ys(U[16]) + 12, "L5 alone", { fill: C.ink, size: 10.5 });
  const lx = L + pw + 22; let ly = T + 10;
  b += text(lx, ly, "Configuration contains", { fill: C.ink, weight: "bold" }); ly += 22;
  for (const [k, t] of [["none", "no checkpoint"], ["L4", "intent checkpoint L4 (no L5)"], ["L5", "tool-call checkpoint L5"]]) {
    b += marker(sty[k][0], lx + 6, ly - 4, sty[k][1]); b += text(lx + 18, ly, t, { fill: C.ink }); ly += 22;
  }
  ly += 8;
  b += text(lx, ly, "Vertical lines: 95% CI of U", { size: 10 }); ly += 15;
  b += text(lx, ly, "(task-clustered bootstrap).", { size: 10 }); ly += 15;
  b += text(lx, ly, "n = 2,520 out-of-scope and", { size: 10 }); ly += 15;
  b += text(lx, ly, "720 legitimate runs per point.", { size: 10 });
  fs.writeFileSync(path.join(OUT, "fig3_frontier.svg"), svg(W, H, b));
}

{
  const W = 680, H = 300, L = 200, R = 70, T = 30, B = 50;
  const pw = W - L - R, ph = H - T - B;
  const rows = [["L5_tool", "L5 tool-call checkpoint", "res"], ["L4_intent", "L4 intent checkpoint", "int"],
    ["L1_iso", "L1 execution isolation", "res"], ["L2_beh", "L2 behavioral instruction", "int"], ["L3_egr", "L3 network-egress control", "res"]];
  const xmax = 0.3, xs = v => L + (v / xmax) * pw, bh = 26, gap = (ph - rows.length * bh) / rows.length;
  let b = "";
  for (let v = 0; v <= xmax + 1e-9; v += 0.05) {
    b += `<line x1="${xs(v)}" y1="${T}" x2="${xs(v)}" y2="${T + ph}" stroke="${C.grid}"/>`;
    b += text(xs(v), T + ph + 18, v.toFixed(2), { anchor: "middle" });
  }
  rows.forEach(([k, name, type], i) => {
    const y = T + gap / 2 + i * (bh + gap), sh = S.shapley[k], col = type === "res" ? C.blue : C.orange;
    const x0 = xs(0), x1 = xs(sh.phi);
    b += `<path d="M${x0},${y} H${x1 - 4} Q${x1},${y} ${x1},${y + 4} V${y + bh - 4} Q${x1},${y + bh} ${x1 - 4},${y + bh} H${x0} Z" fill="${col}"/>`;
    const [c0, c1] = sh.ci.map(xs), ym = y + bh / 2;
    b += `<line x1="${c0}" y1="${ym}" x2="${c1}" y2="${ym}" stroke="${C.ink}" stroke-width="1.5"/>`;
    b += `<line x1="${c0}" y1="${ym - 5}" x2="${c0}" y2="${ym + 5}" stroke="${C.ink}" stroke-width="1.5"/>`;
    b += `<line x1="${c1}" y1="${ym - 5}" x2="${c1}" y2="${ym + 5}" stroke="${C.ink}" stroke-width="1.5"/>`;
    b += text(L - 10, ym + 4, name, { anchor: "end", fill: C.ink });
    b += text(c1 + 8, ym + 4, sh.phi.toFixed(3), { fill: C.ink });
  });
  b += `<line x1="${xs(0)}" y1="${T}" x2="${xs(0)}" y2="${T + ph}" stroke="${C.ink2}"/>`;
  b += text(L + pw / 2, H - 12, `Shapley value: share of the reduction in π from ${S.configs[0].asr.toFixed(3)} (no governance) to 0`, { anchor: "middle", fill: C.ink });
  const lx = L + pw - 150;
  b += `<rect x="${lx}" y="${T + ph - 44}" width="12" height="12" rx="2" fill="${C.blue}"/>` + text(lx + 18, T + ph - 34, "resource-based layer", { fill: C.ink });
  b += `<rect x="${lx}" y="${T + ph - 24}" width="12" height="12" rx="2" fill="${C.orange}"/>` + text(lx + 18, T + ph - 14, "intent-based layer", { fill: C.ink });
  fs.writeFileSync(path.join(OUT, "fig2_shapley.svg"), svg(W, H, b));
}

{
  function hull(M, Uv) {
    const EPS = 1e-12; let cur = 0;
    for (let m = 1; m < 32; m++) if (Uv[m] > Uv[cur] + EPS || (Math.abs(Uv[m] - Uv[cur]) <= EPS && M[m] < M[cur])) cur = m;
    const seq = [{ mask: cur, lam: 0 }];
    for (;;) {
      let best = -1, bl = Infinity;
      for (let k = 0; k < 32; k++) {
        if (M[k] >= M[cur] - EPS) continue;
        const l = (Uv[cur] - Uv[k]) / (M[cur] - M[k]);
        if (l < bl - EPS || (Math.abs(l - bl) <= EPS && M[k] < M[best])) { bl = l; best = k; }
      }
      if (best < 0) break; seq.push({ mask: best, lam: bl }); cur = best;
    }
    return seq;
  }
  const s31 = [];
  for (let i = 1; i <= 100; i++) {
    const e = i / 100, pe = pi.map((p, m) => p + e * (pi[m & ~0b10001] - p)), seq = hull(pe, U);
    const a = seq.find(v => (v.mask >> 3) & 1);
    if (a) s31.push([e, a.lam, a.mask]);
  }
  const W = 680, H = 400, L = 70, R = 170, T = 30, B = 60, pw = W - L - R, ph = H - T - B;
  const xs = v => L + v * pw, lo = Math.log10(0.3), hi = Math.log10(300), ys = v => T + (1 - (Math.log10(v) - lo) / (hi - lo)) * ph;
  let b = "";
  for (const v of [0.3, 1, 3, 10, 30, 100, 300]) {
    b += `<line x1="${L}" y1="${ys(v)}" x2="${L + pw}" y2="${ys(v)}" stroke="${C.grid}"/>`;
    b += text(L - 8, ys(v) + 4, String(v), { anchor: "end" });
  }
  for (let v = 0; v <= 1.0001; v += 0.2) b += text(xs(v), T + ph + 18, v.toFixed(1), { anchor: "middle" });
  b += `<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${C.ink2}"/>`;
  b += text(L + pw / 2, H - 18, "Permission-model error ε_p (share of targets wrongly marked as permitted)", { anchor: "middle", fill: C.ink });
  b += text(18, T + ph / 2, "Risk weight λ at which the configuration becomes optimal", { anchor: "middle", fill: C.ink, rotate: -90, size: 10.5 });
  const line = (pts, col) => `<polyline points="${pts.filter(([, l]) => l <= 300).map(([e, l]) => `${xs(e)},${ys(l)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2"/>`;
  b += line(s31, C.orange);
  const end31 = s31[s31.length - 1];
  b += marker("triangle", xs(end31[0]), ys(end31[1]), C.orange);
  b += text(xs(1) + 12, ys(end31[1]) - 4, "full stack (adds L4", { fill: C.ink });
  b += text(xs(1) + 12, ys(end31[1]) + 10, "and L1 to L2+L3+L5)", { fill: C.ink });
  for (const e of [0.1, 0.5]) {
    const q = s31.find(([x]) => Math.abs(x - e) < 1e-9);
    b += `<circle cx="${xs(e)}" cy="${ys(q[1])}" r="3" fill="none" stroke="${C.orange}" stroke-width="1.5"/>`;
  }
  const measured = [[0.064, 4.67], [0.271, 1.71]];
  for (const [e, l] of measured) {
    b += `<path d="M ${xs(e) - 5},${ys(l) - 5} L ${xs(e) + 5},${ys(l) + 5} M ${xs(e) - 5},${ys(l) + 5} L ${xs(e) + 5},${ys(l) - 5}" stroke="${C.ink}" stroke-width="2.2"/>`;
    b += text(xs(e) + 9, ys(l) - 7, `measured ${l.toFixed(2)}`, { fill: C.ink, size: 10 });
  }
  b += text(L + 6, T + 14, "Below the curve L2+L3+L5 is optimal; above it the full stack, which adds the intent checkpoint L4.", { size: 10 });
  b += text(L + 6, T + 28, "Line: counterfactual prediction (Section 5.8); crosses: measured by injection (Section 5.9).", { size: 10 });
  fs.writeFileSync(path.join(OUT, "fig4_permission_error.svg"), svg(W, H, b));
}

{
  const W = 720, H = 330;
  const box = (x, y, w, h, t, sub, o = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${o.fill || "#f4f3f0"}" stroke="${o.stroke || C.ink2}" stroke-width="${o.sw || 1.2}"/>` +
    text(x + w / 2, y + (sub ? h / 2 - 3 : h / 2 + 4), t, { anchor: "middle", fill: C.ink, weight: "bold", size: 11.5 }) +
    (sub ? text(x + w / 2, y + h / 2 + 13, sub, { anchor: "middle", size: 10 }) : "");
  const arrow = (x1, y1, x2, y2, o = {}) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c || C.ink2}" stroke-width="1.6" marker-end="url(#ah)"${o.dash ? ' stroke-dasharray="4 3"' : ""}/>`;
  let b = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.ink2}"/></marker></defs>`;
  b += box(20, 120, 110, 56, "Employee", "authorized user");
  b += box(240, 120, 130, 56, "Shared agent", "plans and acts");
  b += box(540, 30, 140, 56, "LLM", "planning model");
  b += box(540, 210, 140, 76, "Tools & resources", "files · shell · network");
  b += box(400, 40, 104, 40, "L4", "intent checkpoint", { fill: "#fdeee6", stroke: C.orange, sw: 2 });
  b += box(400, 225, 104, 40, "L5", "tool-call checkpoint", { fill: "#e3f5ee", stroke: C.aqua, sw: 2 });
  b += box(400, 128, 104, 44, "Shared RBAC", "permission model", { fill: "#eaf1fb", stroke: C.blue, sw: 1.5 });
  b += arrow(130, 148, 238, 148);
  b += text(184, 140, "request", { anchor: "middle", size: 10 });
  b += arrow(305, 120, 398, 68) + arrow(504, 60, 538, 58);
  b += arrow(305, 176, 398, 238) + arrow(504, 245, 538, 248);
  b += arrow(452, 172, 452, 222, { dash: true });
  b += text(140, 210, "L2 behavioral instruction", { size: 10 });
  b += text(140, 224, "(system prompt of the agent)", { size: 10 });
  b += text(540, 305, "L1 isolation · L3 egress control", { size: 10 });
  b += text(540, 319, "(restrict what the tools can reach)", { size: 10 });
  b += text(452, 22, "Model interface: screen what is asked", { fill: C.ink, size: 10.5, anchor: "middle" });
  b += text(452, 287, "Tool interface: check what is done", { fill: C.ink, size: 10.5, anchor: "middle" });
  fs.writeFileSync(path.join(OUT, "fig1_architecture.svg"), svg(W, H, b));
}
console.log("已輸出：", fs.readdirSync(OUT).join(", "));
