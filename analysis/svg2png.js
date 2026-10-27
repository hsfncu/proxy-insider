// SVG → 4 倍 PNG。用法：NODE_PATH=<含 @resvg/resvg-js 的 node_modules> node svg2png.js
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const DIR = path.join(__dirname, "figures");
const SCALE = 4;

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith(".svg"))) {
  const svg = fs.readFileSync(path.join(DIR, f), "utf8");
  const w = Number((svg.match(/width="(\d+(?:\.\d+)?)"/) || [])[1]);
  if (!w) { console.error("讀不到寬度，略過：" + f); continue; }
  const png = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(w * SCALE) } })
    .render().asPng();
  const out = path.join(DIR, f.replace(/\.svg$/, ".png"));
  fs.writeFileSync(out, png);
  console.log(`${f} → ${path.basename(out)}  ${Math.round(w * SCALE)}px 寬，${(png.length / 1024).toFixed(0)} KB`);
}
