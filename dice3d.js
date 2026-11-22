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
  { id: "lavender", name: "Lavender", css: "#9b8ac4", hex: 0x9b8ac4, girly: true }
];
const DIE_COLORS = [
  { id: "cream", name: "Cream", css: "#ece5d3", hex: 0xece5d3, girly: false },
  { id: "gold", name: "Gold", css: "#c9a227", hex: 0xc9a227, girly: false },
  { id: "bloodred", name: "Blood Red", css: "#7a1f1f", hex: 0x7a1f1f, girly: false },
  { id: "rosepink", name: "Rose Pink", css: "#e8a0b4", hex: 0xe8a0b4, girly: true },
  { id: "lavender", name: "Lavender", css: "#b8a0d8", hex: 0xb8a0d8, girly: true }
];
const FELT_DESIGNS = [
  { id: "plain", name: "Plain", girly: false },
  { id: "mottled", name: "Mottled", girly: false },
  { id: "leather", name: "Leather", girly: false },
  { id: "roses", name: "Roses", girly: true },
  { id: "starlight", name: "Starlight", girly: true }
];
const DIE_DESIGNS = [
  { id: "classic", name: "Classic", girly: false },
  { id: "marble", name: "Marble", girly: false },
  { id: "metal", name: "Metal", girly: false },
  { id: "glitter", name: "Glitter", girly: true },
  { id: "pearl", name: "Pearl", girly: true }
];

const DEFAULT_STYLE = { feltColor: "charcoal", feltDesign: "plain", dieColor: "cream", dieDesign: "classic" };

function findById(list, id, fallback) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return fallback;
}

// ---------- style persistence (per device, like the roller pick) ----------
function loadStyle() {
  var s = { feltColor: DEFAULT_STYLE.feltColor, feltDesign: DEFAULT_STYLE.feltDesign, dieColor: DEFAULT_STYLE.dieColor, dieDesign: DEFAULT_STYLE.dieDesign };
  try {
    var raw = window.localStorage.getItem("hub-dice3d-style");
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved.feltColor) s.feltColor = saved.feltColor;
      if (saved.feltDesign) s.feltDesign = saved.feltDesign;
      if (saved.dieColor) s.dieColor = saved.dieColor;
      if (saved.dieDesign) s.dieDesign = saved.dieDesign;
    }
  } catch (e) {}
  return s;
}
function saveStyle(s) {
  try { window.localStorage.setItem("hub-dice3d-style", JSON.stringify(s)); } catch (e) {}
}
var style = loadStyle();

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
  if (die.id === "bloodred") return "#e8c96a";
  if (die.id === "gold") return "#171410";
  return "#171410";
}

// ---------- canvas textures ----------
function canvasTexture(size, draw) {
  var c = document.createElement("canvas");
  c.width = size; c.height = size;
  var ctx = c.getContext("2d");
  draw(ctx, size);
  var tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Felt texture for the tray floor. 512px, repeats across the tray.
function makeFeltTexture() {
  var felt = findById(FELT_COLORS, style.feltColor, FELT_COLORS[0]);
  var base = felt.css;
  var tex = canvasTexture(512, function (ctx, s) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    if (style.feltDesign === "mottled") {
      // Subtle mottled noise, like the Dice Drop felt.
      for (var i = 0; i < 2600; i++) {
        var x = randRange(0, s), y = randRange(0, s), r = randRange(1, 7);
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (style.feltDesign === "leather") {
      // Pebbled leather grain.
      for (var j = 0; j < 900; j++) {
        var lx = randRange(0, s), ly = randRange(0, s), lr = randRange(3, 9);
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.08)";
        ctx.beginPath(); ctx.ellipse(lx, ly, lr, lr * 0.7, randRange(0, Math.PI), 0, Math.PI * 2); ctx.fill();
      }
    } else if (style.feltDesign === "roses") {
      // Big tattoo-art roses, dyed into the felt: deep muted rose
      // reds, bold dark outlines, dark green leaves, a few large
      // blooms linked by stems. A wash of the felt colour and fresh
      // grain over the top so they read as part of the fabric, not
      // stickers on it.
      var outline = "#241016";
      var petal = "#8e2f42";
      var petalDark = "#6d2233";
      var petalLight = "#a84a5c";
      var leaf = "#33502e";
      var leafDark = "#22331e";
      var leafVein = "#54703f";
      function leafShape(x, y, len, wid, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.4, -wid, len, 0);
        ctx.quadraticCurveTo(len * 0.4, wid, 0, 0);
        ctx.closePath();
        ctx.fillStyle = leaf;
        ctx.fill();
        ctx.lineWidth = Math.max(2, len * 0.05);
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(len * 0.1, 0);
        ctx.lineTo(len * 0.9, 0);
        ctx.lineWidth = Math.max(1.5, len * 0.03);
        ctx.strokeStyle = leafVein;
        ctx.stroke();
        ctx.restore();
      }
      function rose(x, y, r) {
        leafShape(x - r * 0.55, y + r * 0.35, r * 0.85, r * 0.28, Math.PI * 0.78);
        leafShape(x + r * 0.55, y + r * 0.3, r * 0.8, r * 0.26, Math.PI * 0.22);
        leafShape(x, y - r * 0.7, r * 0.75, r * 0.24, -Math.PI * 0.5);
        ctx.lineWidth = Math.max(3, r * 0.055);
        ctx.strokeStyle = outline;
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2 + 0.3;
          var px = x + Math.cos(a) * r * 0.48;
          var py = y + Math.sin(a) * r * 0.48;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(a + Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.34, r * 0.52, 0, 0, Math.PI * 2);
          ctx.fillStyle = petal;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        for (var j = 0; j < 5; j++) {
          var b = (j / 5) * Math.PI * 2 + 0.3 + Math.PI / 5;
          var qx = x + Math.cos(b) * r * 0.26;
          var qy = y + Math.sin(b) * r * 0.26;
          ctx.save();
          ctx.translate(qx, qy);
          ctx.rotate(b + Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.22, r * 0.34, 0, 0, Math.PI * 2);
          ctx.fillStyle = petalDark;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = petalLight;
        ctx.fill();
        ctx.lineWidth = Math.max(2.5, r * 0.04);
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.beginPath();
        var turns = 1.6;
        for (var t = 0; t <= turns * Math.PI * 2; t += 0.15) {
          var rr = (t / (turns * Math.PI * 2)) * r * 0.16;
          var sx = x + Math.cos(t) * rr;
          var sy = y + Math.sin(t) * rr;
          if (t === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.lineWidth = Math.max(2, r * 0.03);
        ctx.strokeStyle = petalDark;
        ctx.stroke();
      }
      function stem(x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 30, x2, y2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = leafDark;
        ctx.stroke();
      }
      stem(170, 180, 360, 340);
      stem(360, 340, 420, 110);
      rose(170, 180, 110);
      rose(360, 340, 120);
      rose(420, 110, 45);
      // wash the felt colour over the top so the roses sit IN the
      // fabric, then re-grain so the cloth texture covers them too.
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      ctx.globalAlpha = 1;
      for (var n = 0; n < 500; n++) {
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    } else if (style.feltDesign === "starlight") {
      // Tiny four-point stars and dots.
      for (var m = 0; m < 90; m++) {
        var sx = randRange(10, s - 10), sy = randRange(10, s - 10), sr = randRange(2, 6);
        ctx.fillStyle = Math.random() < 0.6 ? "rgba(255, 240, 200, 0.85)" : "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.moveTo(sx, sy - sr); ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + sr); ctx.quadraticCurveTo(sx, sy, sx - sr, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - sr); ctx.fill();
      }
      for (var n = 0; n < 160; n++) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath(); ctx.arc(randRange(0, s), randRange(0, s), randRange(0.5, 1.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    // Soft dark vignette at the corners, like a real tray.
    var grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1.4);
  return tex;
}

// Die body material, from the die color and design.
function makeDieMaterial() {
  var die = findById(DIE_COLORS, style.dieColor, DIE_COLORS[0]);
  if (style.dieDesign === "metal") {
    return new THREE.MeshStandardMaterial({ color: die.hex, metalness: 0.9, roughness: 0.32 });
  }
  if (style.dieDesign === "pearl") {
    return new THREE.MeshPhysicalMaterial({
      color: 0xf5efe2, metalness: 0.1, roughness: 0.25,
      iridescence: 0.7, iridescenceIOR: 1.3, clearcoat: 0.6, clearcoatRoughness: 0.3
    });
  }
  if (style.dieDesign === "marble") {
    var marbleTex = canvasTexture(256, function (ctx, s) {
      ctx.fillStyle = die.css;
      ctx.fillRect(0, 0, s, s);
      // Swirled second color, Baron of Dice style.
      var second = die.id === "cream" ? "rgba(150, 40, 50, 0.55)" :
        die.id === "bloodred" ? "rgba(230, 220, 200, 0.5)" :
        die.id === "gold" ? "rgba(120, 30, 30, 0.5)" :
        die.id === "rosepink" ? "rgba(150, 60, 110, 0.5)" : "rgba(60, 40, 120, 0.5)";
      for (var i = 0; i < 26; i++) {
        ctx.strokeStyle = second;
        ctx.lineWidth = randRange(3, 12);
        ctx.beginPath();
        var x = randRange(0, s), y = randRange(0, s);
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + randRange(-90, 90), y + randRange(-90, 90), x + randRange(-90, 90), y + randRange(-90, 90), x + randRange(-90, 90), y + randRange(-90, 90));
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (var j = 0; j < 300; j++) { ctx.fillRect(randRange(0, s), randRange(0, s), 2, 2); }
    });
    return new THREE.MeshStandardMaterial({ map: marbleTex, metalness: 0.08, roughness: 0.3 });
  }
  if (style.dieDesign === "glitter") {
    var glitterTex = canvasTexture(256, function (ctx, s) {
      ctx.fillStyle = die.css;
      ctx.fillRect(0, 0, s, s);
      var cols = ["rgba(255,255,255,0.9)", "rgba(255,215,130,0.9)", "rgba(255,150,200,0.9)", "rgba(180,220,255,0.9)"];
      for (var i = 0; i < 420; i++) {
        ctx.fillStyle = cols[Math.floor(randRange(0, cols.length))];
        var gx = randRange(0, s), gy = randRange(0, s), gr = randRange(0.8, 2.6);
        ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
      }
    });
    return new THREE.MeshStandardMaterial({ map: glitterTex, metalness: 0.25, roughness: 0.3 });
  }
  return new THREE.MeshStandardMaterial({ color: die.hex, metalness: 0.05, roughness: 0.35 });
}

// Face texture: a number, or pips for a d6. Transparent background.
function makeFaceTexture(value, sides) {
  var ink = faceInkColor();
  return canvasTexture(256, function (ctx, s) {
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
var TRAY_W = 9, TRAY_D = 6, WALL_H = 0.9, WALL_T = 0.45;
var renderer = null, scene = null, camera = null, world = null;
var trayFloor = null, containerEl = null, initialized = false, rolling = false;
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
  var floorMat = new THREE.MeshStandardMaterial({ map: makeFeltTexture(), roughness: 0.95, metalness: 0 });
  trayFloor = new THREE.Mesh(floorGeo, floorMat);
  trayFloor.rotation.x = -Math.PI / 2;
  trayFloor.receiveShadow = true;
  scene.add(trayFloor);
  // Gold rim: four raised boxes around the felt.
  var rimMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.65, roughness: 0.38 });
  function rim(w, d, x, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), rimMat);
    m.position.set(x, WALL_H / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
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
  function wall(w, d, x, z) {
    var b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(w / 2, WALL_H, d / 2)) });
    b.position.set(x, WALL_H / 2, z);
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
// Re-apply the felt texture to the tray floor.
function applyFelt() {
  if (!trayFloor) return;
  var old = trayFloor.material.map;
  trayFloor.material.map = makeFeltTexture();
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
  saveStyle(style);
  applyFelt();
  applyDieStyle();
  syncPickers();
}

// ---------- pickers ----------
// The Design section is a collapsed <details> with four dropdowns.
function buildPickers() {
  function buildOne(selectId, list, key) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    list.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.name + (opt.girly ? " (girly)" : "");
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
  buildOne("die-color-select", DIE_COLORS, "dieColor");
  buildOne("die-design-select", DIE_DESIGNS, "dieDesign");
  syncPickers();
}

function syncPickers() {
  function setVal(id, value) {
    var sel = document.getElementById(id);
    if (sel) sel.value = value;
  }
  setVal("felt-color-select", style.feltColor);
  setVal("felt-design-select", style.feltDesign);
  setVal("die-color-select", style.dieColor);
  setVal("die-design-select", style.dieDesign);
}

// ---------- public API ----------
window.HubDice3D = {
  loaded: true,
  get ready() { return initialized; },
  init: init,
  roll: rollDice,
  setStyle: setStyle,
  buildPickers: buildPickers,
  getStyle: function () { return { feltColor: style.feltColor, feltDesign: style.feltDesign, dieColor: style.dieColor, dieDesign: style.dieDesign }; },
  FELT_COLORS: FELT_COLORS,
  DIE_COLORS: DIE_COLORS,
  FELT_DESIGNS: FELT_DESIGNS,
  DIE_DESIGNS: DIE_DESIGNS
};
