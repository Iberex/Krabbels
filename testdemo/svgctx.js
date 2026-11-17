// =====================================================================
// A tiny stand-in for CanvasRenderingContext2D that records what the game
// draws as SVG. Only the drawing calls the testdemo uses are supported.
// Every filled or stroked path becomes its own <path>, text stays <text>,
// so the result can be recoloured shape by shape in Figma.
// =====================================================================

const TAU = Math.PI * 2;

function parseColor(c) {
  // -> { color, opacity }
  const m = /^rgba?\(([^)]+)\)$/.exec(String(c).trim());
  if (!m) return { color: c, opacity: 1 };
  const [r, g, b, a = 1] = m[1].split(",").map((v) => parseFloat(v));
  return { color: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`, opacity: a };
}

const n = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class SvgCtx {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.out = [];
    this.stack = [];
    this.st = {
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      globalAlpha: 1,
      font: "16px sans-serif",
      textAlign: "start",
      textBaseline: "alphabetic",
      dash: [],
      m: [1, 0, 0, 1, 0, 0],
    };
    this.d = [];
    this.cur = null;
  }

  // --- state -------------------------------------------------------------
  save() {
    this.stack.push({ ...this.st, dash: [...this.st.dash], m: [...this.st.m] });
  }
  restore() {
    if (this.stack.length) this.st = this.stack.pop();
  }
  setTransform(a, b, c, d, e, f) {
    this.st.m = [a, b, c, d, e, f];
  }
  transform(a, b, c, d, e, f) {
    const [A, B, C, D, E, F] = this.st.m;
    this.st.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(a) {
    this.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0);
  }
  setLineDash(d) {
    this.st.dash = d || [];
  }
  get scaleFactor() {
    const [a, b, c, d] = this.st.m;
    return Math.sqrt(Math.abs(a * d - b * c)) || 1;
  }
  pt(x, y) {
    const [a, b, c, d, e, f] = this.st.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  // property passthrough
  set fillStyle(v) { this.st.fillStyle = v; }
  get fillStyle() { return this.st.fillStyle; }
  set strokeStyle(v) { this.st.strokeStyle = v; }
  get strokeStyle() { return this.st.strokeStyle; }
  set lineWidth(v) { this.st.lineWidth = v; }
  get lineWidth() { return this.st.lineWidth; }
  set lineCap(v) { this.st.lineCap = v; }
  set lineJoin(v) { this.st.lineJoin = v; }
  set globalAlpha(v) { this.st.globalAlpha = v; }
  get globalAlpha() { return this.st.globalAlpha; }
  set font(v) { this.st.font = v; }
  set textAlign(v) { this.st.textAlign = v; }
  set textBaseline(v) { this.st.textBaseline = v; }

  // --- paths -------------------------------------------------------------
  beginPath() {
    this.d = [];
    this.cur = null;
  }
  moveTo(x, y) {
    const [X, Y] = this.pt(x, y);
    this.d.push(`M${n(X)} ${n(Y)}`);
    this.cur = [X, Y];
    this.start = [X, Y];
  }
  lineTo(x, y) {
    if (!this.cur) return this.moveTo(x, y);
    const [X, Y] = this.pt(x, y);
    this.d.push(`L${n(X)} ${n(Y)}`);
    this.cur = [X, Y];
  }
  closePath() {
    this.d.push("Z");
    if (this.start) this.cur = this.start;
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw = false) {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % TAU) + TAU;
    if (ccw && sweep > 0) sweep = (sweep % TAU) - TAU;
    if (Math.abs(a1 - a0) >= TAU) sweep = ccw ? -TAU : TAU;
    const steps = Math.max(8, Math.ceil((Math.abs(sweep) / TAU) * 72));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (sweep * i) / steps;
      const ex = rx * Math.cos(a), ey = ry * Math.sin(a);
      const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot);
      const y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
      if (i === 0 && !this.cur) this.moveTo(x, y);
      else this.lineTo(x, y);
    }
  }
  arc(cx, cy, r, a0, a1, ccw = false) {
    this.ellipse(cx, cy, r, r, 0, a0, a1, ccw);
  }
  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x, y, w, h, r = 0) {
    r = Math.min(typeof r === "number" ? r : r[0] || 0, w / 2, h / 2);
    this.cur = null;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    this.lineTo(x + w, y + h - r);
    this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    this.lineTo(x + r, y + h);
    this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    this.lineTo(x, y + r);
    this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    this.closePath();
  }

  // --- output ------------------------------------------------------------
  paint(kind) {
    if (!this.d.length) return;
    const style = kind === "fill" ? this.st.fillStyle : this.st.strokeStyle;
    const { color, opacity } = parseColor(style);
    const op = opacity * this.st.globalAlpha;
    let attrs = `d="${this.d.join(" ")}"`;
    if (kind === "fill") attrs += ` fill="${color}"`;
    else {
      attrs += ` fill="none" stroke="${color}" stroke-width="${n(this.st.lineWidth * this.scaleFactor)}"`;
      if (this.st.lineCap !== "butt") attrs += ` stroke-linecap="${this.st.lineCap}"`;
      if (this.st.lineJoin !== "miter") attrs += ` stroke-linejoin="${this.st.lineJoin}"`;
      if (this.st.dash.length) attrs += ` stroke-dasharray="${this.st.dash.map((v) => n(v * this.scaleFactor)).join(" ")}"`;
    }
    if (op < 1) attrs += ` opacity="${n(op)}"`;
    this.out.push(`<path ${attrs}/>`);
  }
  fill() {
    this.paint("fill");
  }
  stroke() {
    this.paint("stroke");
  }
  fillRect(x, y, w, h) {
    const keep = this.d;
    this.d = [];
    this.cur = null;
    this.rect(x, y, w, h);
    this.paint("fill");
    this.d = keep;
  }
  strokeRect(x, y, w, h) {
    const keep = this.d;
    this.d = [];
    this.cur = null;
    this.rect(x, y, w, h);
    this.paint("stroke");
    this.d = keep;
  }
  fillText(str, x, y) {
    const m = /(\d+)?\s*([\d.]+)px\s+(.*)$/.exec(this.st.font) || [];
    const weight = m[1] || 400, size = parseFloat(m[2] || 16) * this.scaleFactor;
    const [X, Y] = this.pt(x, y);
    const anchor = { left: "start", start: "start", center: "middle", right: "end", end: "end" }[this.st.textAlign] || "start";
    const base = { middle: "central", top: "hanging", bottom: "text-after-edge" }[this.st.textBaseline] || "alphabetic";
    const { color, opacity } = parseColor(this.st.fillStyle);
    const op = opacity * this.st.globalAlpha;
    this.out.push(
      `<text x="${n(X)}" y="${n(Y)}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${color}"${op < 1 ? ` opacity="${n(op)}"` : ""}>${esc(str)}</text>`
    );
  }
  // Named group with one opacity for everything inside (used for silhouettes).
  beginGroup(id, opacity = 1) {
    this.out.push(`<g id="${esc(id)}"${opacity < 1 ? ` opacity="${n(opacity)}"` : ""}>`);
  }
  endGroup() {
    this.out.push("</g>");
  }
  clearRect() {}
  drawImage() {} // the camera image is never exported
  measureText(s) {
    return { width: String(s).length * 8 };
  }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">\n${this.out.join("\n")}\n</svg>\n`;
  }
}
