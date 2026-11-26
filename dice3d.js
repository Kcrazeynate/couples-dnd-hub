// dice3d.js — 3D physics dice roller for the D&D hub.
// Full physics build: real Three.js dice tumble in a tray with cannon-es
// physics, and the result is whatever face lands up. The roll log still
// works the same way: app.js saves the result after the dice settle.
// Dice and tray styles are picked here (5 colors and 5 designs for the
// felt and for the die, 2 girly in each group) and remembered per device.
// Loaded as an ES module via the import map in index.html. The vendor
// files live in vendor/ so the hub does not depend on a CDN at roll time.
// If this module fails to load, app.js falls back to the 2D roller.

import * as THREE from "three";
import * as CANNON from "cannon-es";

// ---------- option sets ----------
// Defaults match the site: charcoal felt, cream die, gold rim.
const FELT_COLORS = [
  { id: "charcoal", name: "Charcoal", css: "#241f18", hex: 0x241f18, girly: false },
  { id: "forest", name: "Forest Green", css: "#1a3d2e", hex: 0x1a3d2e, girly: false },
  { id: "burgundy", name: "Burgundy", css: "#5a1f24", hex: 0x5a1f24, girly: false },
  { id: "rose", name: "Rose Pink", css: "#c96f8a", hex: 0xc96f8a, girly: true },
  { id: "lavender", name: "Lavender", css: "#9b8ac4", hex: 0x9b8ac4, girly: true },
  { id: "navy", name: "Navy", css: "#1e2a4a", hex: 0x1e2a4a, girly: false },
  { id: "teal", name: "Teal", css: "#14524a", hex: 0x14524a, girly: false },
  { id: "royal", name: "Royal Purple", css: "#4a2a6a", hex: 0x4a2a6a, girly: false },
  { id: "chocolate", name: "Chocolate", css: "#4a3220", hex: 0x4a3220, girly: false },
  { id: "slate", name: "Slate", css: "#3a3f44", hex: 0x3a3f44, girly: false },
  { id: "crimson", name: "Crimson", css: "#6a1a1a", hex: 0x6a1a1a, girly: false },
  { id: "midnight", name: "Midnight Blue", css: "#16233d", hex: 0x16233d, girly: false },
  { id: "emerald", name: "Emerald", css: "#0f3d2a", hex: 0x0f3d2a, girly: false }
];
const DIE_COLORS = [
  { id: "cream", name: "Cream", css: "#ece5d3", hex: 0xece5d3, girly: false },
  { id: "gold", name: "Gold", css: "#c9a227", hex: 0xc9a227, girly: false },
  { id: "bloodred", name: "Blood Red", css: "#7a1f1f", hex: 0x7a1f1f, girly: false, dark: true },
  { id: "rosepink", name: "Rose Pink", css: "#e8a0b4", hex: 0xe8a0b4, girly: true },
  { id: "lavender", name: "Lavender", css: "#b8a0d8", hex: 0xb8a0d8, girly: true },
  { id: "silver", name: "Silver", css: "#c0c0c0", hex: 0xc0c0c0, girly: false },
  { id: "copper", name: "Copper", css: "#b87333", hex: 0xb87333, girly: false },
  { id: "emerald", name: "Emerald", css: "#1a6a3a", hex: 0x1a6a3a, girly: false, dark: true },
  { id: "sapphire", name: "Sapphire", css: "#1a3a8a", hex: 0x1a3a8a, girly: false, dark: true },
  { id: "onyx", name: "Onyx", css: "#1a1a1a", hex: 0x1a1a1a, girly: false, dark: true },
  { id: "amethyst", name: "Amethyst", css: "#7a4a9a", hex: 0x7a4a9a, girly: false, dark: true },
  { id: "jade", name: "Jade", css: "#2a7a5a", hex: 0x2a7a5a, girly: false, dark: true },
  { id: "topaz", name: "Topaz", css: "#d98a2a", hex: 0xd98a2a, girly: false }
];
const FELT_DESIGNS = [
  { id: "plain", name: "Plain", girly: false },
  { id: "mottled", name: "Mottled", girly: false },
  { id: "leather", name: "Leather", girly: false },
  { id: "roses", name: "Roses", girly: true },
  { id: "starlight", name: "Starlight", girly: true },
  { id: "d20", name: "D20 Outline", girly: false },
  { id: "moon", name: "Crescent Moon", girly: false },
  { id: "fairy", name: "Fairy", girly: true },
  { id: "dagger", name: "Dagger & Skull", girly: false },
  { id: "heraldic", name: "Heraldic Beasts", girly: false },
  { id: "demon", name: "Demon", girly: false },
  { id: "panda", name: "Panda Warrior", girly: false },
  { id: "wizard", name: "Wizard", girly: false },
  { id: "gnome", name: "Gnome", girly: true },
  { id: "custom", name: "My Design", girly: false }
];
const DIE_DESIGNS = [
  { id: "classic", name: "Classic", girly: false },
  { id: "marble", name: "Marble", girly: false },
  { id: "metal", name: "Metal", girly: false },
  { id: "glitter", name: "Glitter", girly: true },
  { id: "pearl", name: "Pearl", girly: true }
];
// The colour of a printed felt design: the d20 and moon line work,
// and the line-art prints (fairy, dagger, and the rest). The art
// images are white masks; this tints them at draw time.
const DESIGN_COLORS = [
  { id: "gold", name: "Gold", css: "#f0dcaa", rgb: "240,220,170" },
  { id: "silver", name: "Silver", css: "#d8d8d8", rgb: "216,216,216" },
  { id: "cream", name: "Cream", css: "#ece5d3", rgb: "236,229,211" },
  { id: "copper", name: "Copper", css: "#d98a5a", rgb: "217,138,90" },
  { id: "crimson", name: "Crimson", css: "#c94a4a", rgb: "201,74,74" },
  { id: "emerald", name: "Emerald", css: "#5ac98a", rgb: "90,201,138" },
  { id: "sapphire", name: "Sapphire", css: "#6a8ad8", rgb: "106,138,216" },
  { id: "rose", name: "Rose", css: "#e8a0b4", rgb: "232,160,180" },
  { id: "black", name: "Black", css: "#1a1a1a", rgb: "26,26,26" },
  { id: "oxblood", name: "Oxblood", css: "#5a1a1a", rgb: "90,26,26" },
  { id: "midnight", name: "Midnight", css: "#1a2a4a", rgb: "26,42,74" },
  { id: "forest", name: "Forest", css: "#1a3a2a", rgb: "26,58,42" },
  { id: "plum", name: "Plum", css: "#3a1a4a", rgb: "58,26,74" }
];
// The tray rim: gold by default, or a wood grain like a real tray.
const TRAY_MATERIALS = [
  { id: "gold", name: "Gold", girly: false },
  { id: "walnut", name: "Walnut", girly: false },
  { id: "oak", name: "Oak", girly: false },
  { id: "ebony", name: "Ebony", girly: false },
  { id: "cherry", name: "Cherry", girly: false },
  { id: "maple", name: "Maple", girly: false },
  { id: "mahogany", name: "Mahogany", girly: false }
];
// Wood tones: base, dark grain, light grain.
const WOOD_TONES = {
  walnut: { base: "#4a2c17", dark: "rgba(30,15,5,0.55)", light: "rgba(190,130,70,0.35)" },
  oak: { base: "#8a5a28", dark: "rgba(70,40,10,0.5)", light: "rgba(230,180,110,0.35)" },
  ebony: { base: "#241a14", dark: "rgba(5,3,2,0.6)", light: "rgba(120,90,60,0.3)" },
  cherry: { base: "#6a2a1a", dark: "rgba(40,12,5,0.55)", light: "rgba(220,140,90,0.35)" },
  maple: { base: "#c8a06a", dark: "rgba(120,80,30,0.5)", light: "rgba(245,220,170,0.4)" },
  mahogany: { base: "#4a1a12", dark: "rgba(20,5,2,0.6)", light: "rgba(170,90,50,0.35)" }
};

const DEFAULT_STYLE = { feltColor: "charcoal", feltDesign: "plain", dieColor: "cream", dieDesign: "classic", tray: "gold", designColor: "gold", designZoom: 1 };

// Wood grain for the tray rim: long wavy grain lines running along
// the length, a few darker streaks, and a few knots. Drawn on a
// wide high-res canvas (1024x256) so the grain runs along the rim,
// not across it, and stays sharp up close.
function makeWoodTexture(tone) {
  var W = 1024, H = 256;
  var c = document.createElement("canvas");
  c.width = W; c.height = H;
  var ctx = c.getContext("2d");
  ctx.fillStyle = tone.base;
  ctx.fillRect(0, 0, W, H);
  // soft broad colour bands, so the wood is not one flat tone
  for (var b = 0; b < 8; b++) {
    var by = randRange(0, H), br = randRange(40, 110);
    var bg = ctx.createRadialGradient(W / 2, by, 0, W / 2, by, br * 2);
    bg.addColorStop(0, Math.random() < 0.5 ? tone.light : tone.dark);
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  // long grain lines, gently wavy
  for (var i = 0; i < 140; i++) {
    var y = randRange(0, H);
    var dark = Math.random() < 0.65;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    var segs = 6;
    for (var k = 1; k <= segs; k++) {
      ctx.lineTo((k / segs) * (W + 20) - 10, y + randRange(-8, 8));
    }
    ctx.strokeStyle = dark ? tone.dark : tone.light;
    ctx.lineWidth = randRange(0.7, 2.2);
    ctx.stroke();
  }
  // fine grain: many hairline lines for a close-up read
  for (var f = 0; f < 220; f++) {
    var fy = randRange(0, H);
    ctx.beginPath();
    ctx.moveTo(-10, fy);
    for (var k2 = 1; k2 <= 4; k2++) {
      ctx.lineTo((k2 / 4) * (W + 20) - 10, fy + randRange(-3, 3));
    }
    ctx.strokeStyle = Math.random() < 0.6 ? tone.dark : tone.light;
    ctx.globalAlpha = randRange(0.25, 0.6);
    ctx.lineWidth = randRange(0.4, 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // a few darker streaks
  for (var j = 0; j < 20; j++) {
    var y2 = randRange(0, H);
    ctx.beginPath();
    ctx.moveTo(-10, y2);
    for (var k3 = 1; k3 <= 5; k3++) {
      ctx.lineTo((k3 / 5) * (W + 20) - 10, y2 + randRange(-5, 5));
    }
    ctx.strokeStyle = tone.dark;
    ctx.lineWidth = randRange(2.5, 5);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // knots
  for (var n = 0; n < 3; n++) {
    var kx = randRange(120, W - 120), ky = randRange(40, H - 40);
    for (var r = 22; r > 0; r -= 4) {
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * 1.8, r, 0, 0, Math.PI * 2);
      ctx.strokeStyle = tone.dark;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  // fine pore speckle
  for (var p = 0; p < 1800; p++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.06)";
    ctx.fillRect(randRange(0, W), randRange(0, H), randRange(1, 2), randRange(1, 2));
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The tray rim material: gold metal, or a wood grain.
function makeRimMaterial() {
  if (style.tray === "gold") {
    return new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.65, roughness: 0.38 });
  }
  var tone = WOOD_TONES[style.tray] || WOOD_TONES.walnut;
  return new THREE.MeshStandardMaterial({ map: makeWoodTexture(tone), metalness: 0, roughness: 0.5 });
}

function findById(list, id, fallback) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return fallback;
}

// The ink colour for a printed felt design, at the given opacity.
function designInk(alpha) {
  var dc = findById(DESIGN_COLORS, style.designColor, DESIGN_COLORS[0]);
  return "rgba(" + dc.rgb + "," + alpha + ")";
}

// How each line-art print sits on the felt: focusY is where the face
// sits as a fraction of the image height (0 top, 1 bottom), so the
// face lands at the felt centre instead of the image centre.
var FELT_ART_FIT = {
  fairy: { focusY: 0.28 },
  dagger: { focusY: 0.30 },
  heraldic: { focusY: 0.5 },
  demon: { focusY: 0.32 },
  panda: { focusY: 0.35 },
  wizard: { focusY: 0.35 },
  gnome: { focusY: 0.45 }
};

// ---------- style persistence (per device, like the roller pick) ----------
function loadStyle() {
  var s = { feltColor: DEFAULT_STYLE.feltColor, feltDesign: DEFAULT_STYLE.feltDesign, dieColor: DEFAULT_STYLE.dieColor, dieDesign: DEFAULT_STYLE.dieDesign, tray: DEFAULT_STYLE.tray, designColor: DEFAULT_STYLE.designColor, designZoom: DEFAULT_STYLE.designZoom };
  try {
    var raw = window.localStorage.getItem("hub-dice3d-style");
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved.feltColor) s.feltColor = saved.feltColor;
      if (saved.feltDesign) s.feltDesign = saved.feltDesign;
      if (saved.dieColor) s.dieColor = saved.dieColor;
      if (saved.dieDesign) s.dieDesign = saved.dieDesign;
      if (saved.tray) s.tray = saved.tray;
      if (saved.designColor) s.designColor = saved.designColor;
      if (typeof saved.designZoom === "number" && saved.designZoom >= 0.5 && saved.designZoom <= 2) s.designZoom = saved.designZoom;
    }
  } catch (e) {}
  return s;
}
function saveStyle(s) {
  try { window.localStorage.setItem("hub-dice3d-style", JSON.stringify(s)); } catch (e) {}
}
var style = loadStyle();

// The Roses felt is a real rose photograph, composited over the
// chosen felt colour. Preload it at module load so it is ready
// when the Dice tab opens; when it finishes loading, redraw the
// felt if Roses is the current design.
var roseImg = null, roseImgReady = false;
try {
  roseImg = new Image();
  roseImg.onload = function () {
    roseImgReady = true;
    try {
      if (trayFloor && style.feltDesign === "roses") applyFelt();
    } catch (e) {}
  };
  roseImg.src = "assets/felt-rose.png";
} catch (e) { roseImg = null; }

// The line-art felt designs are transparent PNGs with gold line work,
// made from Nathan's reference images. Preload them at module load so
// they are ready when the Dice tab opens; when one finishes loading,
// redraw the felt if it is the current design.
var FELT_ART_IDS = ["fairy", "dagger", "heraldic", "demon", "panda", "wizard", "gnome"];
var feltArt = {}, feltArtReady = {};
FELT_ART_IDS.forEach(function (id) {
  try {
    var img = new Image();
    img.onload = function () {
      feltArtReady[id] = true;
      try {
        if (trayFloor && style.feltDesign === id) applyFelt();
      } catch (e) {}
    };
    img.src = "assets/felt-" + id + ".png";
    feltArt[id] = img;
  } catch (e) {}
});

// A design the player uploads themself: black line art on white.
// It is turned into a white mask on this device and saved in
// localStorage, so it stays on this device only.
var CUSTOM_DESIGN_KEY = "hub-dice3d-custom-design";
var customArt = null, customArtReady = false;

function loadCustomDesign() {
  try {
    var raw = window.localStorage.getItem(CUSTOM_DESIGN_KEY);
    if (!raw) return;
    var img = new Image();
    img.onload = function () {
      customArt = img;
      customArtReady = true;
      try { if (trayFloor && style.feltDesign === "custom") applyFelt(); } catch (e) {}
    };
    img.src = raw;
  } catch (e) {}
}

function processCustomDesign(img, done) {
  // Downscale to max 900 long side, then turn black-on-white into a
  // white mask: darkness becomes opacity, paper becomes transparent.
  var iw = img.naturalWidth, ih = img.naturalHeight;
  var sc = Math.min(1, 900 / Math.max(iw, ih));
  var w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
  var c = document.createElement("canvas");
  c.width = w; c.height = h;
  var ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  var data = ctx.getImageData(0, 0, w, h);
  var d = data.data;
  function lumAt(x, y) {
    var i = (y * w + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
  }
  var corners = [lumAt(2, 2), lumAt(w - 3, 2), lumAt(2, h - 3), lumAt(w - 3, h - 3)].sort(function (a, b) { return a - b; });
  var bg = corners[1];
  var cutoff = Math.max(120, bg - 8);
  for (var i = 0; i < d.length; i += 4) {
    var lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    lum = Math.max(0, Math.min(255, (lum - 128) * 1.3 + 128));
    var a = 0;
    if (lum < cutoff) a = Math.round(255 * (1 - lum / cutoff));
    if (a < 25) a = 0;
    d[i] = 255; d[i+1] = 255; d[i+2] = 255; d[i+3] = a;
  }
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) d[(y * w + x) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  done(c.toDataURL("image/png"));
}

function saveCustomDesign(dataUrl) {
  try {
    window.localStorage.setItem(CUSTOM_DESIGN_KEY, dataUrl);
    return true;
  } catch (e) {
    return false;
  }
}

function removeCustomDesign() {
  try { window.localStorage.removeItem(CUSTOM_DESIGN_KEY); } catch (e) {}
  customArt = null; customArtReady = false;
}

function updateCustomDesignUI() {
  var rm = document.getElementById("design-remove");
  if (!rm) return;
  var has = false;
  try { has = !!window.localStorage.getItem(CUSTOM_DESIGN_KEY); } catch (e) {}
  rm.classList.toggle("hidden", !has);
}

loadCustomDesign();

// ---------- crypto random ----------
function randRange(min, max) {
  if (window.crypto && window.crypto.getRandomValues) {
    var arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return min + (arr[0] / 4294967296) * (max - min);
  }
  return min + Math.random() * (max - min);
}

// Number ink: dark on light dice, gold on dark dice and on metal.
function faceInkColor() {
  var die = findById(DIE_COLORS, style.dieColor, DIE_COLORS[0]);
  if (style.dieDesign === "metal") return "#e8c96a";
  if (die.dark) return "#e8c96a";
  return "#171410";
}

// ---------- canvas textures ----------
function canvasTexture(size, draw) {
  var c = document.createElement("canvas");
  c.width = size; c.height = size;
  var ctx = c.getContext("2d");
  draw(ctx, size);
  var tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A small studio-like cubemap so metals have something to reflect.
// Without an environment map, a high-metalness die only catches the
// scene lights and reads as nearly black. Bright warm top, dark floor.
function makeEnvironment() {
  function face(top, mid, bottom) {
    var c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    var g = c.getContext("2d");
    var grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, top);
    grad.addColorStop(0.5, mid);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  var tex = new THREE.CubeTexture([
    face("#fff2d0", "#c9a227", "#171410"),
    face("#fff2d0", "#8a7a4a", "#171410"),
    face("#ffffff", "#fff2d0", "#c9a227"),
    face("#3a2f22", "#171410", "#0a0806"),
    face("#fff2d0", "#b8a05a", "#171410"),
    face("#fff2d0", "#8a7a4a", "#171410")
  ]);
  tex.needsUpdate = true;
  return tex;
}

// Felt texture for the tray floor. One single image across the whole
// tray, no tiling: the canvas is 1200x800, the same 3:2 aspect as the
// 9x6 tray floor, and the texture is clamped, never repeated. Each
// design is one composition across that whole image.
function makeFeltTexture() {
  var felt = findById(FELT_COLORS, style.feltColor, FELT_COLORS[0]);
  var base = felt.css;
  var W = 1200, H = 800;
  var c = document.createElement("canvas");
  c.width = W; c.height = H;
  var ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // Fine woven cloth grain over the whole felt, so it reads as fabric
  // and not flat paint, under every design.
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  for (var wx = 0; wx < W; wx += 4) {
    ctx.beginPath(); ctx.moveTo(wx, 0); ctx.lineTo(wx, H); ctx.stroke();
  }
  for (var wy = 0; wy < H; wy += 4) {
    ctx.beginPath(); ctx.moveTo(0, wy); ctx.lineTo(W, wy); ctx.stroke();
  }
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  for (var wx2 = 2; wx2 < W; wx2 += 4) {
    ctx.beginPath(); ctx.moveTo(wx2, 0); ctx.lineTo(wx2, H); ctx.stroke();
  }
  for (var wy2 = 2; wy2 < H; wy2 += 4) {
    ctx.beginPath(); ctx.moveTo(0, wy2); ctx.lineTo(W, wy2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (style.feltDesign === "mottled") {
    // Mottled like the reference wallpaper, as one composition
    // across the whole tray: big irregular patches with torn edges
    // and real contrast, in lighter and darker felt plus warm gold
    // and cool blue-grey tints. No tiling, so no seam to hide.
    function patch(cx, cy, r, fill) {
      var pts = [];
      for (var k = 0; k < 12; k++) {
        var ang = (k / 12) * Math.PI * 2;
        var rr = r * randRange(0.55, 1.05);
        pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
      }
      ctx.beginPath();
      for (var k2 = 0; k2 <= 12; k2++) {
        var p = pts[k2 % 12];
        var px = cx + p[0];
        var py = cy + p[1];
        if (k2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    for (var i = 0; i < 22; i++) {
      var px = randRange(0, W), py = randRange(0, H), pr = randRange(130, 260);
      var roll = Math.random();
      var fill;
      if (roll < 0.35) fill = "rgba(255,255,255,0.16)";
      else if (roll < 0.65) fill = "rgba(0,0,0,0.20)";
      else if (roll < 0.82) fill = "rgba(180,150,80,0.16)";
      else fill = "rgba(90,110,140,0.16)";
      patch(px, py, pr, fill);
    }
    for (var i2 = 0; i2 < 28; i2++) {
      var qx = randRange(0, W), qy = randRange(0, H), qr = randRange(55, 120);
      var roll2 = Math.random();
      var fill2;
      if (roll2 < 0.4) fill2 = "rgba(255,255,255,0.14)";
      else if (roll2 < 0.7) fill2 = "rgba(0,0,0,0.18)";
      else if (roll2 < 0.85) fill2 = "rgba(180,150,80,0.14)";
      else fill2 = "rgba(90,110,140,0.14)";
      patch(qx, qy, qr, fill2);
    }
    for (var g = 0; g < 2500; g++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
      ctx.beginPath(); ctx.arc(randRange(0, W), randRange(0, H), randRange(1, 4), 0, Math.PI * 2); ctx.fill();
    }
  } else if (style.feltDesign === "leather") {
    // Real hide, as one piece across the whole tray: a network of
    // fine irregular creases, not round pebbles, over soft patches
    // of lighter and darker brown. Warm reddish-brown tint so it
    // reads as leather, and the gloss (low roughness) sells the sheen.
    for (var i = 0; i < 20; i++) {
      var bx = randRange(0, W), by = randRange(0, H), br = randRange(110, 240);
      var warm = Math.random() < 0.5;
      var bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, warm ? "rgba(200,120,60,0.14)" : "rgba(60,25,10,0.16)");
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
    // fine crease network: short dark strokes with a slight bend
    for (var j = 0; j < 2000; j++) {
      var cx = randRange(0, W), cy = randRange(0, H);
      var ang = randRange(0, Math.PI * 2);
      var len = randRange(6, 22);
      var bend = randRange(-0.6, 0.6);
      var mx = cx + Math.cos(ang + bend) * len * 0.5;
      var my = cy + Math.sin(ang + bend) * len * 0.5;
      var ex = cx + Math.cos(ang) * len;
      var ey = cy + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.strokeStyle = Math.random() < 0.7 ? "rgba(40,15,5,0.16)" : "rgba(255,190,130,0.10)";
      ctx.lineWidth = randRange(0.6, 1.6);
      ctx.stroke();
    }
    // a few deeper creases
    for (var k = 0; k < 220; k++) {
      var dx = randRange(0, W), dy = randRange(0, H);
      var dang = randRange(0, Math.PI * 2);
      var dlen = randRange(20, 55);
      var dmx = dx + Math.cos(dang + 0.4) * dlen * 0.5;
      var dmy = dy + Math.sin(dang + 0.4) * dlen * 0.5;
      var dex = dx + Math.cos(dang) * dlen;
      var dey = dy + Math.sin(dang) * dlen;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.quadraticCurveTo(dmx, dmy, dex, dey);
      ctx.strokeStyle = "rgba(35,12,4,0.22)";
      ctx.lineWidth = randRange(1, 2);
      ctx.stroke();
    }
  } else if (style.feltDesign === "roses") {
    // One real rose photograph, composited over the chosen felt
    // colour, as a single image across the whole tray, no tiling.
    // The photograph is a transparent PNG (the black background was
    // keyed out), so the felt colour shows through around the bloom.
    if (roseImgReady && roseImg) {
      var rs = 720;
      ctx.drawImage(roseImg, (W - rs) / 2, (H - rs) / 2, rs, rs);
    }
    // wash the felt colour over the top so the rose sits IN the
    // fabric, then re-grain so the cloth texture covers it too.
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    for (var n = 0; n < 1200; n++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
  } else if (style.feltDesign === "starlight") {
    // One nebula across the whole tray, like the reference: dense
    // orange clouds on the right, teal and blue in the center and
    // left, violet through it, a bright star cluster, and a very
    // dense star field. No tiling.
    ctx.fillStyle = "rgba(8,10,24,0.55)";
    ctx.fillRect(0, 0, W, H);
    function cloud(x, y, r, rc, gc, bc, alpha) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(" + rc + "," + gc + "," + bc + "," + alpha + ")");
      g.addColorStop(1, "rgba(" + rc + "," + gc + "," + bc + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // orange clouds, right side and lower right
    cloud(950, 280, 260, 200, 110, 50, 0.55);
    cloud(1050, 420, 230, 180, 90, 40, 0.5);
    cloud(880, 540, 210, 220, 140, 70, 0.45);
    cloud(1080, 660, 210, 150, 80, 50, 0.45);
    cloud(760, 660, 200, 190, 110, 60, 0.4);
    // teal and blue clouds, center and left
    cloud(350, 320, 240, 60, 140, 150, 0.5);
    cloud(500, 480, 230, 50, 110, 140, 0.45);
    cloud(300, 540, 200, 70, 130, 130, 0.4);
    cloud(550, 240, 200, 70, 150, 160, 0.4);
    cloud(220, 150, 180, 40, 60, 110, 0.4);
    // violet clouds through the middle
    cloud(650, 380, 210, 120, 70, 150, 0.4);
    cloud(750, 220, 180, 90, 60, 130, 0.35);
    cloud(450, 660, 180, 100, 60, 140, 0.35);
    cloud(1020, 130, 160, 140, 80, 120, 0.3);
    // bright star cluster core, center-left
    var core = ctx.createRadialGradient(520, 430, 0, 520, 430, 150);
    core.addColorStop(0, "rgba(220,240,255,0.5)");
    core.addColorStop(0.5, "rgba(160,210,240,0.25)");
    core.addColorStop(1, "rgba(160,210,240,0)");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(520, 430, 150, 0, Math.PI * 2); ctx.fill();
    // dense tiny star field
    for (var n = 0; n < 1400; n++) {
      var starA = randRange(0.35, 1);
      var warm = Math.random() < 0.3;
      ctx.fillStyle = warm ? "rgba(255,220,180," + starA + ")" : "rgba(230,240,255," + starA + ")";
      ctx.beginPath(); ctx.arc(randRange(0, W), randRange(0, H), randRange(0.6, 2), 0, Math.PI * 2); ctx.fill();
    }
    // more medium stars with a small glow
    for (var m2 = 0; m2 < 120; m2++) {
      var mx = randRange(10, W - 10), my = randRange(10, H - 10), mr = randRange(2, 3.5);
      var mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3);
      mg.addColorStop(0, "rgba(255,255,255,0.5)");
      mg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    }
    // a handful of bright four-point stars with a glow
    for (var m3 = 0; m3 < 20; m3++) {
      var sx = randRange(20, W - 20), sy = randRange(20, H - 20), sr = randRange(8, 16);
      var hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.5);
      hg.addColorStop(0, "rgba(255,240,200,0.4)");
      hg.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(sx, sy, sr * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,246,220,0.95)";
      ctx.beginPath();
      ctx.moveTo(sx, sy - sr); ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + sr); ctx.quadraticCurveTo(sx, sy, sx - sr, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - sr); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath(); ctx.arc(sx, sy, sr * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  } else if (style.feltDesign === "d20") {
    // A wireframe d20 outline in the center, like the printed trays:
    // outer hexagon, inner triangle, and the spokes between them,
    // with a 20 in the middle. Light gold line over the felt.
    var cx = W / 2, cy = H / 2, R = 280;
    var ink = designInk(0.85);
    function pt(ang, r) {
      var a = ang * Math.PI / 180;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(240,220,170,0.5)";
    ctx.shadowBlur = 12;
    // outer hexagon, pointy top
    var hex = [-90, -30, 30, 90, 150, 210].map(function (a) { return pt(a, R); });
    ctx.beginPath();
    hex.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.stroke();
    // inner triangle, the top face
    var tri = [pt(-90, R * 0.45), pt(30, R * 0.45), pt(150, R * 0.45)];
    ctx.beginPath();
    tri.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.stroke();
    // spokes from each inner vertex to the nearest outer vertices
    ctx.beginPath();
    ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(hex[0][0], hex[0][1]);
    ctx.moveTo(tri[1][0], tri[1][1]); ctx.lineTo(hex[2][0], hex[2][1]);
    ctx.moveTo(tri[1][0], tri[1][1]); ctx.lineTo(hex[3][0], hex[3][1]);
    ctx.moveTo(tri[2][0], tri[2][1]); ctx.lineTo(hex[4][0], hex[4][1]);
    ctx.moveTo(tri[2][0], tri[2][1]); ctx.lineTo(hex[3][0], hex[3][1]);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = ink;
    ctx.font = "800 110px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("20", cx, cy + 6);
  } else if (style.feltDesign === "moon") {
    // A crescent moon in the center, cream gold over the felt, with
    // a scatter of small stars around it.
    var mx = W / 2, my = H / 2, mr = 260;
    ctx.fillStyle = designInk(0.9);
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    // cut the crescent with a felt-coloured disc, offset up and right
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.arc(mx + 110, my - 50, mr * 0.92, 0, Math.PI * 2); ctx.fill();
    // small stars around the moon
    for (var st = 0; st < 40; st++) {
      var sx2 = randRange(60, W - 60), sy2 = randRange(60, H - 60);
      var ddx = sx2 - mx, ddy = sy2 - my;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < mr + 60) continue;
      var sr2 = randRange(2, 6);
      ctx.fillStyle = designInk(randRange(0.5, 0.95));
      ctx.beginPath(); ctx.arc(sx2, sy2, sr2, 0, Math.PI * 2); ctx.fill();
    }
    for (var st2 = 0; st2 < 8; st2++) {
      var fx = randRange(80, W - 80), fy = randRange(80, H - 80);
      var fdx = fx - mx, fdy = fy - my;
      if (Math.sqrt(fdx * fdx + fdy * fdy) < mr + 80) continue;
      var fr = randRange(10, 18);
      ctx.fillStyle = designInk(0.95);
      ctx.beginPath();
      ctx.moveTo(fx, fy - fr); ctx.quadraticCurveTo(fx, fy, fx + fr, fy);
      ctx.quadraticCurveTo(fx, fy, fx, fy + fr); ctx.quadraticCurveTo(fx, fy, fx - fr, fy);
      ctx.quadraticCurveTo(fx, fy, fx, fy - fr); ctx.fill();
    }
  } else if (FELT_ART_IDS.indexOf(style.feltDesign) !== -1 || style.feltDesign === "custom") {
    // One of the line-art designs, or the player's own upload: the
    // image is a white mask, tinted to the chosen design colour,
    // fitted to the felt and shifted so the face lands at the centre.
    var isCustom = style.feltDesign === "custom";
    var art = isCustom ? customArt : feltArt[style.feltDesign];
    var artReady = isCustom ? customArtReady : feltArtReady[style.feltDesign];
    if (artReady && art) {
      var dc = findById(DESIGN_COLORS, style.designColor, DESIGN_COLORS[0]);
      var tint = document.createElement("canvas");
      tint.width = art.naturalWidth; tint.height = art.naturalHeight;
      var tctx = tint.getContext("2d");
      tctx.drawImage(art, 0, 0);
      tctx.globalCompositeOperation = "source-in";
      tctx.fillStyle = dc.css;
      tctx.fillRect(0, 0, tint.width, tint.height);
      var maxW = 1150, maxH = 760;
      var iw = art.naturalWidth, ih = art.naturalHeight;
      var sc = Math.min(maxW / iw, maxH / ih, 1) * (style.designZoom || 1);
      var dw = iw * sc, dh = ih * sc;
      var dx = (W - dw) / 2;
      var dy = (H - dh) / 2;
      var fit = isCustom ? { focusY: 0.5 } : (FELT_ART_FIT[style.feltDesign] || { focusY: 0.5 });
      dy += (0.5 - fit.focusY) * dh;
      // Only clamp when the design fits the felt; when zoomed in, let
      // it crop around the face instead of sliding away.
      if (dw <= W && dh <= H) {
        dx = Math.max(0, Math.min(W - dw, dx));
        dy = Math.max(0, Math.min(H - dh, dy));
      }
      ctx.drawImage(tint, dx, dy, dw, dh);
    }
    // wash the felt colour over the top so the art sits IN the
    // fabric, then re-grain so the cloth texture covers it too.
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    for (var n = 0; n < 1200; n++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
  }
  // Soft dark vignette at the corners, like a real tray.
  var grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Die body material, from the die color and design.
function makeDieMaterial() {
  var die = findById(DIE_COLORS, style.dieColor, DIE_COLORS[0]);
  if (style.dieDesign === "metal") {
    // Brushed metal: fine horizontal streaks over the base color, plus
    // a soft vertical sheen.
    var brushedTex = canvasTexture(1024, function (ctx, s) {
      ctx.fillStyle = die.css;
      ctx.fillRect(0, 0, s, s);
      for (var i = 0; i < 900; i++) {
        var y = randRange(0, s);
        var light = Math.random() < 0.5;
        ctx.strokeStyle = light ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
        ctx.lineWidth = randRange(0.5, 2);
        ctx.beginPath();
        ctx.moveTo(randRange(-40, s * 0.4), y);
        ctx.lineTo(randRange(s * 0.6, s + 40), y + randRange(-4, 4));
        ctx.stroke();
      }
      var grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, "rgba(255,255,255,0.12)");
      grad.addColorStop(0.5, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.12)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    });
    return new THREE.MeshStandardMaterial({ map: brushedTex, metalness: 0.9, roughness: 0.3 });
  }
  if (style.dieDesign === "pearl") {
    return new THREE.MeshPhysicalMaterial({
      color: 0xf5efe2, metalness: 0.1, roughness: 0.25,
      iridescence: 0.7, iridescenceIOR: 1.3, clearcoat: 0.6, clearcoatRoughness: 0.3
    });
  }
  if (style.dieDesign === "marble") {
    var marbleTex = canvasTexture(1024, function (ctx, s) {
      ctx.fillStyle = die.css;
      ctx.fillRect(0, 0, s, s);
      var second = die.id === "cream" ? "rgba(150, 40, 50, 0.55)" :
        die.id === "bloodred" ? "rgba(230, 220, 200, 0.5)" :
        die.id === "gold" ? "rgba(120, 30, 30, 0.5)" :
        die.id === "rosepink" ? "rgba(150, 60, 110, 0.5)" :
        die.dark ? "rgba(230, 220, 200, 0.5)" : "rgba(60, 40, 120, 0.5)";
      // Broad swirling bands, layered for depth.
      for (var i = 0; i < 60; i++) {
        ctx.strokeStyle = second;
        ctx.globalAlpha = randRange(0.25, 0.7);
        ctx.lineWidth = randRange(3, 14);
        ctx.beginPath();
        var x = randRange(0, s), y = randRange(0, s);
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + randRange(-160, 160), y + randRange(-160, 160), x + randRange(-160, 160), y + randRange(-160, 160), x + randRange(-160, 160), y + randRange(-160, 160));
        ctx.stroke();
      }
      // Fine pale veining.
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      for (var v = 0; v < 24; v++) {
        ctx.lineWidth = randRange(0.8, 2);
        ctx.beginPath();
        var vx = randRange(0, s), vy = randRange(0, s);
        ctx.moveTo(vx, vy);
        ctx.bezierCurveTo(vx + randRange(-120, 120), vy + randRange(-120, 120), vx + randRange(-120, 120), vy + randRange(-120, 120), vx + randRange(-120, 120), vy + randRange(-120, 120));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (var j = 0; j < 500; j++) { ctx.fillRect(randRange(0, s), randRange(0, s), 2, 2); }
    });
    return new THREE.MeshPhysicalMaterial({ map: marbleTex, metalness: 0.08, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  }
  if (style.dieDesign === "glitter") {
    var glitterTex = canvasTexture(1024, function (ctx, s) {
      ctx.fillStyle = die.css;
      ctx.fillRect(0, 0, s, s);
      var cols = ["rgba(255,255,255,0.9)", "rgba(255,215,130,0.9)", "rgba(255,150,200,0.9)", "rgba(180,220,255,0.9)"];
      for (var i = 0; i < 900; i++) {
        ctx.fillStyle = cols[Math.floor(randRange(0, cols.length))];
        var gx = randRange(0, s), gy = randRange(0, s), gr = randRange(0.8, 3.2);
        ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
      }
      // A few larger four-point star sparkles.
      for (var k = 0; k < 28; k++) {
        var sx = randRange(0, s), sy = randRange(0, s), sr = randRange(5, 11);
        ctx.fillStyle = cols[Math.floor(randRange(0, cols.length))];
        ctx.beginPath();
        ctx.moveTo(sx, sy - sr);
        ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + sr);
        ctx.quadraticCurveTo(sx, sy, sx - sr, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - sr);
        ctx.fill();
      }
    });
    return new THREE.MeshPhysicalMaterial({ map: glitterTex, metalness: 0.25, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  }
  // Classic: a subtle speckle over the base color, polished like resin.
  var classicTex = canvasTexture(1024, function (ctx, s) {
    ctx.fillStyle = die.css;
    ctx.fillRect(0, 0, s, s);
    for (var i = 0; i < 1400; i++) {
      var light = Math.random() < 0.5;
      ctx.fillStyle = light ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(randRange(0, s), randRange(0, s), randRange(1, 2.5), randRange(1, 2.5));
    }
    var grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.7);
    grad.addColorStop(0, "rgba(255,255,255,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  });
  return new THREE.MeshPhysicalMaterial({ map: classicTex, metalness: 0.05, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.22 });
}

// Face texture: a number, or pips for a d6. Transparent background.
function makeFaceTexture(value, sides) {
  var ink = faceInkColor();
  return canvasTexture(1024, function (ctx, s) {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    if (sides === 6) {
      // Pips, in the standard layout.
      var pos = {
        1: [[0.5, 0.5]],
        2: [[0.3, 0.3], [0.7, 0.7]],
        3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
        4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
        5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
        6: [[0.3, 0.27], [0.7, 0.27], [0.3, 0.5], [0.7, 0.5], [0.3, 0.73], [0.7, 0.73]]
      }[value] || [[0.5, 0.5]];
      var r = s * 0.11;
      pos.forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, r, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      // Bigger, bolder number with a contrasting outline so it reads
      // clearly on the die face, even on a busy finish.
      var stroke = ink === "#e8c96a" ? "#171410" : "#ece5d3";
      ctx.font = "800 " + Math.floor(s * 0.6) + "px Georgia, 'Times New Roman', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(4, s * 0.045);
      ctx.strokeStyle = stroke;
      ctx.strokeText(String(value), s / 2, s / 2 + s * 0.02);
      ctx.fillText(String(value), s / 2, s / 2 + s * 0.02);
    }
  });
}

// ---------- polyhedron faces ----------
// Extract the flat faces of a non-indexed triangle geometry. Triangles
// sharing a normal belong to the same face (a d12 pentagon is 3 triangles).
function extractFaces(geometry) {
  var pos = geometry.attributes.position;
  var tris = [];
  for (var i = 0; i + 2 < pos.count; i += 3) {
    var a = new THREE.Vector3().fromBufferAttribute(pos, i);
    var b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    var c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    var ab = new THREE.Vector3().subVectors(b, a);
    var ac = new THREE.Vector3().subVectors(c, a);
    var n = new THREE.Vector3().crossVectors(ab, ac);
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    var centroid = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
    if (n.dot(centroid) < 0) n.negate();
    tris.push({ a: a, b: b, c: c, normal: n });
  }
  var groups = [];
  tris.forEach(function (t) {
    var found = null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].normal.dot(t.normal) > 0.9999) { found = groups[i]; break; }
    }
    if (!found) { found = { normal: t.normal.clone(), tris: [] }; groups.push(found); }
    found.tris.push(t);
  });
  var faces = [];
  groups.forEach(function (g) {
    var verts = [];
    var seen = {};
    g.tris.forEach(function (t) {
      [t.a, t.b, t.c].forEach(function (v) {
        var vk = v.x.toFixed(4) + "," + v.y.toFixed(4) + "," + v.z.toFixed(4);
        if (!seen[vk]) { seen[vk] = true; verts.push(v.clone()); }
      });
    });
    var centroid = new THREE.Vector3();
    verts.forEach(function (v) { centroid.add(v); });
    centroid.multiplyScalar(1 / verts.length);
    faces.push({ normal: g.normal.clone(), centroid: centroid, verts: verts });
  });
  return faces;
}

// Order a face's vertices around its centroid, so edges are consecutive.
function orderFaceVerts(face) {
  var n = face.normal;
  var up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  var u = new THREE.Vector3().crossVectors(n, up).normalize();
  var v = new THREE.Vector3().crossVectors(n, u).normalize();
  var c = face.centroid;
  var withAngle = face.verts.map(function (p) {
    var d = new THREE.Vector3().subVectors(p, c);
    return { p: p, angle: Math.atan2(d.dot(v), d.dot(u)) };
  });
  withAngle.sort(function (a, b) { return a.angle - b.angle; });
  return withAngle.map(function (w) { return w.p; });
}

// Inradius: distance from the face centroid to its nearest edge.
function faceInradius(face) {
  var ordered = orderFaceVerts(face);
  var c = face.centroid;
  var best = Infinity;
  for (var i = 0; i < ordered.length; i++) {
    var p1 = ordered[i], p2 = ordered[(i + 1) % ordered.length];
    var edge = new THREE.Vector3().subVectors(p2, p1);
    var toC = new THREE.Vector3().subVectors(c, p1);
    var cross = new THREE.Vector3().crossVectors(edge, toC);
    var d = cross.length() / edge.length();
    if (d < best) best = d;
  }
  return best === Infinity ? 0.2 : best;
}

// Pair opposite faces so they sum to sides+1, like a real die.
function assignFaceValues(faces, sides) {
  var values = new Array(faces.length).fill(0);
  var used = new Array(faces.length).fill(false);
  var next = 1;
  for (var i = 0; i < faces.length; i++) {
    if (used[i]) continue;
    var opp = -1;
    for (var j = 0; j < faces.length; j++) {
      if (j === i || used[j]) continue;
      if (faces[i].normal.dot(faces[j].normal) < -0.99) { opp = j; break; }
    }
    if (opp >= 0) {
      values[i] = next;
      values[opp] = sides + 1 - next;
      used[i] = true; used[opp] = true;
      next++;
    } else {
      values[i] = next;
      used[i] = true;
      next++;
    }
  }
  return values;
}

// ---------- d10: pentagonal trapezohedron ----------
// Built as the polar dual of a uniform pentagonal antiprism, so every kite
// face is exactly flat. Returns a non-indexed triangle BufferGeometry.
function buildTrapezohedronGeometry(radius) {
  var r = 1, h = 0.5; // uniform antiprism: height is half the radius
  var top = [], bottom = [];
  for (var k = 0; k < 5; k++) {
    var aT = (90 + 72 * k) * Math.PI / 180;
    top.push(new THREE.Vector3(r * Math.cos(aT), h, r * Math.sin(aT)));
    var aB = (90 + 36 + 72 * k) * Math.PI / 180;
    bottom.push(new THREE.Vector3(r * Math.cos(aB), -h, r * Math.sin(aB)));
  }
  // Dual vertex of a face = pole of its plane (normal / distance).
  function faceDual(verts) {
    var a = verts[0], b = verts[1], c = verts[2];
    var ab = new THREE.Vector3().subVectors(b, a);
    var ac = new THREE.Vector3().subVectors(c, a);
    var n = new THREE.Vector3().crossVectors(ab, ac).normalize();
    var centroid = new THREE.Vector3();
    verts.forEach(function (v) { centroid.add(v); });
    centroid.multiplyScalar(1 / verts.length);
    if (n.dot(centroid) < 0) n.negate();
    var d = n.dot(centroid);
    return n.clone().multiplyScalar(1 / d);
  }
  var capTopDual = faceDual(top);
  var capBottomDual = faceDual(bottom);
  var upDual = [], downDual = [];
  for (var j = 0; j < 5; j++) {
    upDual.push(faceDual([top[j], top[(j + 1) % 5], bottom[j]]));
    downDual.push(faceDual([bottom[j], top[(j + 1) % 5], bottom[(j + 1) % 5]]));
  }
  // Each kite is the dual vertices of the faces meeting at one antiprism
  // vertex; its outward normal points along that vertex.
  var kites = [];
  for (var m = 0; m < 5; m++) {
    kites.push({ verts: [capTopDual, upDual[m], downDual[(m + 4) % 5], upDual[(m + 4) % 5]], dir: top[m] });
    kites.push({ verts: [capBottomDual, upDual[m], downDual[m], downDual[(m + 4) % 5]], dir: bottom[m] });
  }
  // Triangulate each kite (ordered by angle around its centroid) into 2
  // triangles, wound so the normal points outward.
  var positions = [];
  kites.forEach(function (kite) {
    var n = kite.dir.clone().normalize();
    var centroid = new THREE.Vector3();
    kite.verts.forEach(function (v) { centroid.add(v); });
    centroid.multiplyScalar(1 / kite.verts.length);
    var up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    var u = new THREE.Vector3().crossVectors(n, up).normalize();
    var v = new THREE.Vector3().crossVectors(n, u).normalize();
    var ordered = kite.verts.map(function (p) {
      var d = new THREE.Vector3().subVectors(p, centroid);
      return { p: p, angle: Math.atan2(d.dot(v), d.dot(u)) };
    }).sort(function (a, b) { return a.angle - b.angle; }).map(function (w) { return w.p; });
    var tris = [[ordered[0], ordered[1], ordered[2]], [ordered[0], ordered[2], ordered[3]]];
    tris.forEach(function (t) {
      var ab = new THREE.Vector3().subVectors(t[1], t[0]);
      var ac = new THREE.Vector3().subVectors(t[2], t[0]);
      var tn = new THREE.Vector3().crossVectors(ab, ac);
      var tc = new THREE.Vector3().addVectors(t[0], t[1]).add(t[2]).multiplyScalar(1 / 3);
      if (tn.dot(tc) < 0) { var tmp = t[1]; t[1] = t[2]; t[2] = tmp; }
      t.forEach(function (p) { positions.push(p.x, p.y, p.z); });
    });
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  // Scale so the circumradius matches the other dice.
  var maxR = 0;
  for (var i = 0; i < positions.length; i += 3) {
    var len = Math.sqrt(positions[i] * positions[i] + positions[i + 1] * positions[i + 1] + positions[i + 2] * positions[i + 2]);
    if (len > maxR) maxR = len;
  }
  if (maxR > 0) geo.scale(radius / maxR, radius / maxR, radius / maxR);
  return geo;
}

// Base geometry per die type, non-indexed triangles.
function dieGeometry(sides) {
  var g;
  if (sides === 4) g = new THREE.TetrahedronGeometry(0.85);
  else if (sides === 6) g = new THREE.BoxGeometry(0.9, 0.9, 0.9).toNonIndexed();
  else if (sides === 8) g = new THREE.OctahedronGeometry(0.75);
  else if (sides === 10) g = buildTrapezohedronGeometry(0.75);
  else if (sides === 12) g = new THREE.DodecahedronGeometry(0.75);
  else g = new THREE.IcosahedronGeometry(0.75);
  if (g.index) g = g.toNonIndexed();
  return g;
}

// Cannon convex shape from a non-indexed triangle geometry. Vertices are
// deduplicated; each triangle becomes one face of the convex polyhedron.
function cannonShapeFromGeometry(geometry) {
  var pos = geometry.attributes.position;
  var verts = [];
  var indexMap = {};
  var faces = [];
  function getIndex(x, y, z) {
    var key = x.toFixed(4) + "," + y.toFixed(4) + "," + z.toFixed(4);
    if (indexMap[key] === undefined) {
      indexMap[key] = verts.length;
      verts.push(new CANNON.Vec3(x, y, z));
    }
    return indexMap[key];
  }
  for (var i = 0; i + 2 < pos.count; i += 3) {
    faces.push([
      getIndex(pos.getX(i), pos.getY(i), pos.getZ(i)),
      getIndex(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)),
      getIndex(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2))
    ]);
  }
  return new CANNON.ConvexPolyhedron({ vertices: verts, faces: faces });
}

// ---------- die factory ----------
// Builds one die: a solid polyhedron body plus a number (or pip) plane on
// every face, and the matching cannon body. Returns:
// { group, body, sides, faces: [{normal, value}], readDown }
function buildDie(sides) {
  var geo = dieGeometry(sides);
  var faces = extractFaces(geo);
  var values = assignFaceValues(faces, sides);
  var group = new THREE.Group();
  var bodyMesh = new THREE.Mesh(geo, makeDieMaterial());
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  var facePlanes = [];
  faces.forEach(function (face, fi) {
    var inr = faceInradius(face);
    var side = Math.max(0.16, 1.8 * inr);
    var tex = makeFaceTexture(values[fi], sides);
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat);
    var offset = face.normal.clone().multiplyScalar(0.006);
    plane.position.copy(face.centroid).add(offset);
    plane.lookAt(face.centroid.clone().add(face.normal).multiplyScalar(2));
    group.add(plane);
    facePlanes.push(plane);
  });
  var shape = cannonShapeFromGeometry(geo);
  var body = new CANNON.Body({
    mass: 1,
    shape: shape,
    allowSleep: true,
    sleepSpeedLimit: 0.35,
    sleepTimeLimit: 0.35
  });
  body.linearDamping = 0.07;
  body.angularDamping = 0.07;
  // A d4 rests on a face, so its result is the face pointing down.
  return {
    group: group,
    body: body,
    bodyMesh: bodyMesh,
    facePlanes: facePlanes,
    sides: sides,
    faces: faces.map(function (f, fi) { return { normal: f.normal.clone(), value: values[fi] }; }),
    readDown: sides === 4
  };
}

// Read the value a die shows. Returns { value, cocked }.
function readDieValue(die) {
  var q = die.body.quaternion;
  var best = null, bestScore = -Infinity;
  die.faces.forEach(function (f) {
    var w = new CANNON.Vec3(f.normal.x, f.normal.y, f.normal.z);
    var rw = q.vmult(w);
    var score = die.readDown ? -rw.y : rw.y;
    if (score > bestScore) { bestScore = score; best = f; }
  });
  // A settled die has its reading face nearly flat; a lean means cocked.
  var cocked = bestScore < 0.85;
  return { value: best ? best.value : 1, cocked: cocked };
}

// ---------- scene ----------
// Tray inner size 9 x 6. Dice are about 1 unit across.
var TRAY_W = 9, TRAY_D = 6, WALL_H = 0.9, WALL_T = 0.45, WALL_PHYS_H = 6;
var renderer = null, scene = null, camera = null, world = null;
var trayFloor = null, containerEl = null, initialized = false, rolling = false;
var rimMeshes = []; // the four tray rim boxes, so the tray style can change them
var dice = []; // live dice: {group, body, sides, faces, readDown, bodyMesh, facePlanes}
var rollState = null; // {resolve, reject, dice, deadline, stillFrames, nudges}
var dieContactMat = null;

function init(container) {
  if (initialized) return true;
  containerEl = container;
  if (!containerEl) return false;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  containerEl.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171410);
  scene.environment = makeEnvironment();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 8.2, 6.8);
  camera.lookAt(0, 0, 0.2);
  // Lights: warm ambient, a key light with shadows, a soft fill.
  scene.add(new THREE.AmbientLight(0xfff2d0, 0.55));
  var key = new THREE.DirectionalLight(0xffe9b0, 1.6);
  key.position.set(4, 9, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.camera.far = 25;
  scene.add(key);
  var fill = new THREE.PointLight(0xc9a227, 12, 20);
  fill.position.set(-4, 3, 3);
  scene.add(fill);
  // Felt floor.
  var floorGeo = new THREE.PlaneGeometry(TRAY_W, TRAY_D);
  var floorMat = new THREE.MeshStandardMaterial({ map: makeFeltTexture(), roughness: style.feltDesign === "leather" ? 0.35 : 0.95, metalness: 0 });
  trayFloor = new THREE.Mesh(floorGeo, floorMat);
  trayFloor.rotation.x = -Math.PI / 2;
  trayFloor.receiveShadow = true;
  scene.add(trayFloor);
  // Tray rim: four raised boxes around the felt. Gold by default,
  // or a wood grain (walnut, oak, ebony) like a real dice tray.
  function rim(w, d, x, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), makeRimMaterial());
    m.position.set(x, WALL_H / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    rimMeshes.push(m);
  }
  rim(TRAY_W + WALL_T * 2, WALL_T, 0, -(TRAY_D / 2 + WALL_T / 2));
  rim(TRAY_W + WALL_T * 2, WALL_T, 0, TRAY_D / 2 + WALL_T / 2);
  rim(WALL_T, TRAY_D, -(TRAY_W / 2 + WALL_T / 2), 0);
  rim(WALL_T, TRAY_D, TRAY_W / 2 + WALL_T / 2, 0);
  // Physics world.
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.25;
  world.defaultContactMaterial.restitution = 0.5;
  var ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  // Physics walls are much taller than the visible rim (which is only
  // WALL_H high) so a bouncy die can never hop over the edge and out
  // of the tray. The extra height is invisible.
  function wall(w, d, x, z) {
    var b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(w / 2, WALL_PHYS_H / 2, d / 2)) });
    b.position.set(x, WALL_PHYS_H / 2, z);
    world.addBody(b);
  }
  wall(TRAY_W + WALL_T * 2, WALL_T, 0, -(TRAY_D / 2 + WALL_T / 2));
  wall(TRAY_W + WALL_T * 2, WALL_T, 0, TRAY_D / 2 + WALL_T / 2);
  wall(WALL_T, TRAY_D, -(TRAY_W / 2 + WALL_T / 2), 0);
  wall(WALL_T, TRAY_D, TRAY_W / 2 + WALL_T / 2, 0);
  resize();
  if (window.ResizeObserver) {
    new ResizeObserver(function () { resize(); }).observe(containerEl);
  } else {
    window.addEventListener("resize", resize);
  }
  initialized = true;
  animate();
  return true;
}

function resize() {
  if (!renderer || !containerEl || !camera) return;
  var w = containerEl.clientWidth || 320;
  var h = containerEl.clientHeight || 300;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

var lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  var now = time || 0;
  var dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 60;
  lastTime = now;
  if (world) world.step(1 / 60, dt, 3);
  // Sync meshes to physics bodies, and catch any die that escaped.
  dice.forEach(function (d) {
    d.group.position.copy(d.body.position);
    d.group.quaternion.copy(d.body.quaternion);
    var p = d.body.position;
    if (p.y < -1 || Math.abs(p.x) > 7 || Math.abs(p.z) > 5) {
      d.body.position.set(randRange(-2, 2), randRange(3.5, 5), randRange(-1.5, 1.5));
      d.body.velocity.set(randRange(-1, 1), randRange(-2, -0.5), randRange(-1, 1));
      d.body.angularVelocity.set(randRange(-6, 6), randRange(-6, 6), randRange(-6, 6));
      d.body.wakeUp();
    }
  });
  if (rollState) checkRollSettled();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function allDiceStill() {
  return rollState.dice.every(function (d) {
    var b = d.body;
    if (b.sleepState === CANNON.Body.SLEEPING) return true;
    return b.velocity.length() < 0.12 && b.angularVelocity.length() < 0.12;
  });
}

function checkRollSettled() {
  if (!rollState) return;
  if (Date.now() > rollState.deadline) { finishRoll(true); return; }
  if (allDiceStill()) {
    rollState.stillFrames++;
    if (rollState.stillFrames >= 10) finishRoll(false);
  } else {
    rollState.stillFrames = 0;
  }
}

function finishRoll(forced) {
  var rs = rollState;
  if (!rs) return;
  var reads = rs.dice.map(function (d) { return readDieValue(d); });
  var cockedIdx = [];
  reads.forEach(function (r, i) { if (r.cocked) cockedIdx.push(i); });
  if (cockedIdx.length && !forced && rs.nudges < 3) {
    // Nudge each cocked die with a fresh toss and keep waiting.
    rs.nudges++;
    rs.stillFrames = 0;
    rs.deadline = Date.now() + 6000;
    cockedIdx.forEach(function (i) {
      var b = rs.dice[i].body;
      b.velocity.set(randRange(-2.5, 2.5), randRange(1.5, 3.5), randRange(-2.5, 2.5));
      b.angularVelocity.set(randRange(-9, 9), randRange(-9, 9), randRange(-9, 9));
      b.wakeUp();
    });
    return;
  }
  rollState = null;
  rolling = false;
  rs.resolve(reads.map(function (r) { return r.value; }));
}

// ---------- rolling ----------
// Spawn one die with random position, orientation, velocity and spin.
function spawnDie(sides) {
  var die = buildDie(sides);
  die.body.position.set(randRange(-2.2, 2.2), randRange(3.5, 5), randRange(-1.6, 1.6));
  var e = new CANNON.Vec3(randRange(0, Math.PI * 2), randRange(0, Math.PI * 2), randRange(0, Math.PI * 2));
  die.body.quaternion.setFromEuler(e.x, e.y, e.z);
  die.body.velocity.set(randRange(-2.5, 2.5), randRange(-3.5, -1), randRange(-2.5, 2.5));
  die.body.angularVelocity.set(randRange(-12, 12), randRange(-12, 12), randRange(-12, 12));
  die.body.wakeUp();
  scene.add(die.group);
  world.addBody(die.body);
  dice.push(die);
  return die;
}

function clearDice() {
  dice.forEach(function (d) {
    scene.remove(d.group);
    world.removeBody(d.body);
    d.group.traverse(function (o) {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      if (o.geometry) o.geometry.dispose();
    });
  });
  dice = [];
}

// Roll `count` dice of `sides` with real physics. Resolves to the face
// values, one per die, in spawn order.
function rollDice(sides, count) {
  if (!initialized) return Promise.reject(new Error("3D dice not ready"));
  if (rolling) return Promise.reject(new Error("already rolling"));
  rolling = true;
  clearDice();
  var spawned = [];
  for (var i = 0; i < count; i++) spawned.push(spawnDie(sides));
  return new Promise(function (resolve, reject) {
    rollState = { resolve: resolve, reject: reject, dice: spawned, deadline: Date.now() + 8000, stillFrames: 0, nudges: 0 };
  });
}

// ---------- styles ----------
// Re-apply the tray rim material (gold or wood).
function applyTray() {
  if (!rimMeshes.length) return;
  rimMeshes.forEach(function (m) {
    var old = m.material;
    m.material = makeRimMaterial();
    if (old) {
      if (old.map) old.map.dispose();
      old.dispose();
    }
  });
}

// Re-apply the felt texture to the tray floor.
function applyFelt() {
  if (!trayFloor) return;
  var old = trayFloor.material.map;
  trayFloor.material.map = makeFeltTexture();
  // Leather is polished and glossy; the other felts are matte cloth.
  trayFloor.material.roughness = style.feltDesign === "leather" ? 0.35 : 0.95;
  trayFloor.material.needsUpdate = true;
  if (old) old.dispose();
}

// Re-apply the die material and face ink to dice already sitting in the tray.
function applyDieStyle() {
  dice.forEach(function (d) {
    var oldMat = d.bodyMesh.material;
    d.bodyMesh.material = makeDieMaterial();
    if (oldMat) oldMat.dispose();
    d.facePlanes.forEach(function (plane, fi) {
      var oldTex = plane.material.map;
      plane.material.map = makeFaceTexture(d.faces[fi].value, d.sides);
      plane.material.needsUpdate = true;
      if (oldTex) oldTex.dispose();
    });
  });
}

function setStyle(patch) {
  if (patch.feltColor) style.feltColor = patch.feltColor;
  if (patch.feltDesign) style.feltDesign = patch.feltDesign;
  if (patch.dieColor) style.dieColor = patch.dieColor;
  if (patch.dieDesign) style.dieDesign = patch.dieDesign;
  if (patch.tray) style.tray = patch.tray;
  if (patch.designColor) style.designColor = patch.designColor;
  if (typeof patch.designZoom === "number") style.designZoom = Math.max(0.5, Math.min(2, patch.designZoom));
  saveStyle(style);
  applyFelt();
  applyDieStyle();
  applyTray();
  syncPickers();
}

// ---------- pickers ----------
// The Design section is a collapsed <details> with six dropdowns.
function buildPickers() {
  function buildOne(selectId, list, key) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    list.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.name;
      sel.appendChild(o);
    });
    sel.value = style[key];
    sel.addEventListener("change", function () {
      var patch = {};
      patch[key] = sel.value;
      setStyle(patch);
    });
  }
  buildOne("felt-color-select", FELT_COLORS, "feltColor");
  buildOne("felt-design-select", FELT_DESIGNS, "feltDesign");
  buildOne("design-color-select", DESIGN_COLORS, "designColor");
  buildOne("die-color-select", DIE_COLORS, "dieColor");
  buildOne("die-design-select", DIE_DESIGNS, "dieDesign");
  buildOne("tray-select", TRAY_MATERIALS, "tray");
  // Picking "My Design" with nothing uploaded opens the file picker.
  var fd = document.getElementById("felt-design-select");
  if (fd) {
    fd.addEventListener("change", function () {
      if (fd.value === "custom" && !customArtReady) {
        var up2 = document.getElementById("design-upload");
        if (up2) up2.click();
      }
    });
  }
  // Custom design upload: a black-on-white image becomes a design.
  var up = document.getElementById("design-upload");
  if (up) {
    up.addEventListener("change", function () {
      var file = up.files && up.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          processCustomDesign(img, function (dataUrl) {
            if (!saveCustomDesign(dataUrl)) {
              alert("That image is too large to save on this device. Try a smaller one.");
              return;
            }
            var m = new Image();
            m.onload = function () {
              customArt = m;
              customArtReady = true;
              setStyle({ feltDesign: "custom" });
              updateCustomDesignUI();
            };
            m.src = dataUrl;
          });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      up.value = "";
    });
  }
  var rm = document.getElementById("design-remove");
  if (rm) {
    rm.addEventListener("click", function () {
      removeCustomDesign();
      setStyle({ feltDesign: "plain" });
      updateCustomDesignUI();
    });
  }
  updateCustomDesignUI();
  // Design zoom: bigger or smaller print on the felt.
  var zin = document.getElementById("design-zoom-in");
  if (zin) zin.addEventListener("click", function () {
    setStyle({ designZoom: Math.min(2, (style.designZoom || 1) + 0.25) });
  });
  var zout = document.getElementById("design-zoom-out");
  if (zout) zout.addEventListener("click", function () {
    setStyle({ designZoom: Math.max(0.5, (style.designZoom || 1) - 0.25) });
  });
  var zreset = document.getElementById("design-zoom-reset");
  if (zreset) zreset.addEventListener("click", function () {
    setStyle({ designZoom: 1 });
  });
  syncPickers();
}

function syncPickers() {
  function setVal(id, value) {
    var sel = document.getElementById(id);
    if (sel) sel.value = value;
  }
  setVal("felt-color-select", style.feltColor);
  setVal("felt-design-select", style.feltDesign);
  setVal("design-color-select", style.designColor);
  setVal("die-color-select", style.dieColor);
  setVal("die-design-select", style.dieDesign);
  setVal("tray-select", style.tray);
  var zl = document.getElementById("design-zoom-label");
  if (zl) zl.textContent = Math.round((style.designZoom || 1) * 100) + "%";
}

// ---------- public API ----------
window.HubDice3D = {
  loaded: true,
  get ready() { return initialized; },
  init: init,
  roll: rollDice,
  setStyle: setStyle,
  buildPickers: buildPickers,
  getStyle: function () { return { feltColor: style.feltColor, feltDesign: style.feltDesign, dieColor: style.dieColor, dieDesign: style.dieDesign, tray: style.tray, designColor: style.designColor, designZoom: style.designZoom }; },
  FELT_COLORS: FELT_COLORS,
  DIE_COLORS: DIE_COLORS,
  FELT_DESIGNS: FELT_DESIGNS,
  DIE_DESIGNS: DIE_DESIGNS,
  TRAY_MATERIALS: TRAY_MATERIALS
};


