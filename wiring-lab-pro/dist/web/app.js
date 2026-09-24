'use strict';
/* =====================================================================
   מעבדת החיווט – קוד האפליקציה
   מודולים: Data · Util · Store · Safety · OrbitControls · Scene · UI · Learn · Wizard · Diagnostics · App
   ===================================================================== */

/* ===================== Data ===================== */
const DATA = JSON.parse(document.getElementById('lab-data').textContent);

/* ===================== Util ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// עוטף מספרים עם יחידות וטווחים (15–25A, ‏48–54.6V, ‏5.5×2.1) ב-<bdi> כדי שיוצגו נכון בתוך טקסט RTL
const BIDI_NUM = /\d(?:[\d.,]*\d)?(?:Wh|Ah|mm|V|A|W|S|P|Ω)?(?:\s?[–×-]\s?\d(?:[\d.,]*\d)?(?:Wh|Ah|mm|V|A|W|S|P|Ω)?)*/g;
const bidi = html => html.replace(BIDI_NUM, m => `<bdi>${m}</bdi>`);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const byVehicle = (v, veh) => (isObj(v) ? (v[veh] != null ? v[veh] : (v.ebike != null ? v.ebike : '')) : v);
const reducedMotion = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

const ICON = {
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2Zm0 5.5 7.6 12.5H4.4L12 7.5ZM11 11v4.5h2V11h-2Zm0 6v2h2v-2h-2Z"/></svg>',
  bolt: '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M11 10h2v7h-2zM11 7h2v2h-2z"/></svg>',
  ok: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m5 12 5 5 9-10"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m15 6-6 6 6 6"/></svg>',
  prev: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>',
  tech: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.7 19.3 13.6 10.2a5.5 5.5 0 0 0-7.1-7.1l3.3 3.3-2.1 2.1-3.3-3.3a5.5 5.5 0 0 0 7.1 7.1l9.1 9.1 2.1-2.1Z"/></svg>'
};

/* ===================== State ===================== */
const State = {
  model: DATA.defaultModel, // מזהה הדגם (DATA.models)
  vehicle: 'ebike',      // קטגוריה: ebike | scooter (נגזר מהדגם)
  mode: 'learn',         // learn | wizard | diag
  view: 'normal',        // normal | xray | explode
  flow: false,           // חלקיקי זרימת זרם
  circuit: 'all',        // מזהה מעגל או all
  selected: null,        // רכיב נבחר
  voltage: 48,
  ctrl: 'sine',
  variants: { throttle: 'thumb', motor: 'rear' },
  hazard: null
};

/** הדגם הנוכחי, הפריסה שלו, והחלפת דגם */
const M = () => DATA.models[State.model] || DATA.models[DATA.defaultModel];
const LAYOUT = () => DATA.layouts[M().layout];
function setModelState(id) {
  if (!DATA.models[id]) id = DATA.defaultModel;
  State.model = id; State.vehicle = DATA.models[id].cat;
}
setModelState(DATA.defaultModel);
function battRow(v) { return DATA.batteryTable.find(b => b.nominal === Number(v)) || DATA.batteryTable[1]; }
function ctrlType() { return DATA.wizard.controllerTypes.find(c => c.id === State.ctrl) || DATA.wizard.controllerTypes[0]; }
/** מחליף תבניות {V} {full} {empty} {ctrl} {ctrlNote} {vehicle} בטקסט */
function tpl(s) {
  if (s == null) return '';
  const b = battRow(State.voltage), ct = ctrlType();
  return String(s)
    .replace(/\{V\}/g, b.nominal).replace(/\{full\}/g, b.full.toFixed(1)).replace(/\{empty\}/g, b.empty.toFixed(1))
    .replace(/\{ctrl\}/g, ct.name).replace(/\{ctrlNote\}/g, ct.note).replace(/\{vehicle\}/g, M().name);
}
/** טקסט בטוח ל-HTML: תבניות + escape + bidi */
const T = s => bidi(esc(tpl(s)));
function compName(id) {
  const names = LAYOUT().names || {};
  if (names[id]) return names[id];
  const c = DATA.components[id]; return c ? byVehicle(c.name, State.vehicle) : id;
}
function vehicleComps() { const omit = M().omit || []; return LAYOUT().components.filter(c => !omit.includes(c)); }
function harness() { const comps = vehicleComps(); return DATA.harness[M().layout].filter(b => comps.includes(b.comp)); }
function bundleById(id) { return harness().find(b => b.id === id); }
function circuitById(id) { return DATA.circuits.find(c => c.id === id); }
function connName(c) { const d = DATA.connectors[c.type]; return d ? d.name : c.type; }

/* ===================== Store (localStorage, עטוף ב-try/catch) ===================== */
const Store = {
  KEY: 'wiring-lab.v1',
  load() {
    try { const raw = window.localStorage.getItem(this.KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  },
  save() {
    try {
      window.localStorage.setItem(this.KEY, JSON.stringify({
        model: State.model, vehicle: State.vehicle, mode: State.mode, view: State.view, flow: State.flow, circuit: State.circuit,
        voltage: State.voltage, ctrl: State.ctrl, variants: State.variants
      }));
    } catch (e) { /* אחסון לא זמין – ממשיכים בלי שמירה */ }
  },
  apply(saved) {
    if (!saved || typeof saved !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(DATA.models, saved.model)) setModelState(saved.model);
    else setModelState(saved.vehicle === 'scooter' ? 'oxo' : DATA.defaultModel);
    if (['learn', 'wizard', 'diag', 'tools'].includes(saved.mode)) State.mode = saved.mode;
    if (['normal', 'xray', 'explode'].includes(saved.view)) State.view = saved.view;
    State.flow = !!saved.flow;
    if (saved.circuit === 'all' || circuitById(saved.circuit)) State.circuit = saved.circuit;
    if (DATA.wizard.voltages.includes(Number(saved.voltage))) State.voltage = Number(saved.voltage);
    if (DATA.wizard.controllerTypes.some(c => c.id === saved.ctrl)) State.ctrl = saved.ctrl;
    if (isObj(saved.variants)) {
      if (['thumb', 'twist'].includes(saved.variants.throttle)) State.variants.throttle = saved.variants.throttle;
    }
  }
};

/* ===================== Safety ===================== */
const Safety = (() => {
  let lastFocus = null;

  function liveBadge() {
    return `<span class="live" role="img" aria-label="אזהרה: שלב שכולל עבודה עם מתח" title="שלב שכולל עבודה עם מתח">${ICON.warn} מתח</span>`;
  }
  function checksHTML(prefix) {
    return DATA.hazards.map(h =>
      `<label class="check" for="${prefix}-${h.id}"><input type="checkbox" id="${prefix}-${h.id}" data-hazard="${h.id}"><span>${esc(h.label)}</span></label>`
    ).join('');
  }
  function bindChecks(root) {
    root.addEventListener('change', e => {
      const t = e.target;
      if (t.matches && t.matches('input[data-hazard]') && t.checked) { t.checked = false; trigger(t.dataset.hazard); }
    });
  }
  function trigger(id) {
    const h = DATA.hazards.find(x => x.id === id) || DATA.hazards[0];
    State.hazard = h.id;
    $('#hazardModal').hidden = true;
    lastFocus = document.activeElement;
    $('#stopWhy').textContent = 'סומן: ' + h.label + '. ' + h.advice;
    $('#stopSteps').innerHTML = DATA.stopSteps.map(s => `<li>${esc(s)}</li>`).join('');
    $('#stopAck').checked = false;
    $('#stopClose').disabled = true;
    $('#stopScreen').hidden = false;
    $('#hazardChip').hidden = false;
    if (typeof Wizard !== 'undefined') Wizard.abort();
    if (typeof Diagnostics !== 'undefined') Diagnostics.abort();
    setTimeout(() => { const t = $('#stopTitle'); if (t) t.focus(); }, 40);
  }
  function closeStop() {
    $('#stopScreen').hidden = true;
    UI.toast('העבודה הופסקה. פנו לגורם מקצועי.');
    const f = lastFocus && document.body.contains(lastFocus) ? lastFocus : $('#hazardChip');
    if (f && f.focus) f.focus();
  }
  function openModal() {
    lastFocus = document.activeElement;
    $('#hazardModal').hidden = false;
    const first = $('#hazardChecksModal input');
    if (first) first.focus();
  }
  function closeModal() {
    $('#hazardModal').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function trapFocus(container, e) {
    const items = $$('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])', container).filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
  function init() {
    $('#disclaimerText').textContent = DATA.meta.disclaimer;
    $('#hazardChecksModal').innerHTML = checksHTML('hzm');
    bindChecks($('#hazardChecksModal'));
    $('#hazardOpen').addEventListener('click', openModal);
    $$('[data-close-hazard]').forEach(b => b.addEventListener('click', closeModal));
    $('#hazardModal').addEventListener('click', e => { if (e.target.id === 'hazardModal') closeModal(); });
    $('#stopAck').addEventListener('change', e => { $('#stopClose').disabled = !e.target.checked; });
    $('#stopClose').addEventListener('click', closeStop);
    $('#hazardChip').addEventListener('click', () => trigger(State.hazard || 'smell'));
    document.addEventListener('keydown', e => {
      if (!$('#stopScreen').hidden) { if (e.key === 'Tab') trapFocus($('#stopScreen'), e); if (e.key === 'Escape') e.preventDefault(); return; }
      if (!$('#hazardModal').hidden) { if (e.key === 'Escape') closeModal(); if (e.key === 'Tab') trapFocus($('#hazardModal'), e); }
    });
  }
  return { init, trigger, checksHTML, bindChecks, liveBadge };
})();

/* ===================== OrbitControls (מוטמע, API תואם ל-three/examples) ===================== */
class OrbitControls {
  constructor(camera, el) {
    this.camera = camera; this.el = el;
    this.target = new THREE.Vector3();
    this.enableDamping = true; this.dampingFactor = 0.12;
    this.rotateSpeed = 0.9; this.panSpeed = 1; this.zoomSpeed = 1;
    this.minDistance = 0.3; this.maxDistance = 7;
    this.minPolarAngle = 0.12; this.maxPolarAngle = Math.PI * 0.54;
    this.bounds = new THREE.Box3(new THREE.Vector3(-1.6, -0.1, -1.6), new THREE.Vector3(1.6, 1.8, 1.6));
    this.onStart = null;
    this._sph = new THREE.Spherical(); this._d = new THREE.Spherical(0, 0, 0);
    this._scale = 1; this._pan = new THREE.Vector3(); this._tmp = new THREE.Vector3();
    this._ptrs = new Map(); this._mode = null; this._pinch = 0; this._mid = null;
    el.addEventListener('pointerdown', e => this._down(e));
    el.addEventListener('pointermove', e => this._move(e));
    el.addEventListener('pointerup', e => this._up(e));
    el.addEventListener('pointercancel', e => this._up(e));
    el.addEventListener('lostpointercapture', e => this._up(e));
    el.addEventListener('wheel', e => this._wheel(e), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('keydown', e => this._key(e));
  }
  _start() { if (this.onStart) this.onStart(); }
  _down(e) {
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._ptrs.size === 1) this._mode = (e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey) ? 'pan' : 'rotate';
    else if (this._ptrs.size === 2) {
      this._mode = 'touch2';
      const [a, b] = [...this._ptrs.values()];
      this._pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this._mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    this._start();
  }
  _move(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const h = this.el.clientHeight || 1;
    if (this._mode === 'rotate') {
      this._d.theta -= 2 * Math.PI * dx / h * this.rotateSpeed;
      this._d.phi -= 2 * Math.PI * dy / h * this.rotateSpeed;
    } else if (this._mode === 'pan') {
      this._panBy(dx, dy);
    } else if (this._mode === 'touch2' && this._ptrs.size >= 2) {
      const [a, b] = [...this._ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinch > 0 && d > 0) this._scale *= this._pinch / d;
      this._pinch = d;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this._mid) this._panBy(m.x - this._mid.x, m.y - this._mid.y);
      this._mid = m;
    }
  }
  _up(e) {
    if (!this._ptrs.has(e.pointerId)) return;
    this._ptrs.delete(e.pointerId);
    if (this._ptrs.size === 1) this._mode = 'rotate';
    else if (this._ptrs.size === 0) this._mode = null;
  }
  _panBy(dx, dy) {
    const off = this._tmp.copy(this.camera.position).sub(this.target);
    const dist = off.length() * Math.tan((this.camera.fov / 2) * Math.PI / 180);
    const h = this.el.clientHeight || 1;
    const m = this.camera.matrix;
    const left = new THREE.Vector3().setFromMatrixColumn(m, 0).multiplyScalar(-2 * dx * dist / h * this.panSpeed);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1).multiplyScalar(2 * dy * dist / h * this.panSpeed);
    this._pan.add(left).add(up);
  }
  _wheel(e) {
    e.preventDefault();
    this._start();
    const dy = clamp(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY, -160, 160);
    this._scale *= Math.pow(1.0013, dy * this.zoomSpeed);
  }
  _key(e) {
    let used = true;
    switch (e.key) {
      case 'ArrowLeft': this._d.theta += 0.14; break;
      case 'ArrowRight': this._d.theta -= 0.14; break;
      case 'ArrowUp': this._d.phi -= 0.09; break;
      case 'ArrowDown': this._d.phi += 0.09; break;
      case '+': case '=': this._scale *= 0.85; break;
      case '-': case '_': this._scale *= 1.18; break;
      default: used = false;
    }
    if (used) { e.preventDefault(); this._start(); }
  }
  stop() { this._d.set(0, 0, 0); this._pan.set(0, 0, 0); this._scale = 1; }
  update() {
    const off = this._tmp.copy(this.camera.position).sub(this.target);
    this._sph.setFromVector3(off);
    const f = this.enableDamping ? this.dampingFactor : 1;
    this._sph.theta += this._d.theta * f;
    this._sph.phi = clamp(this._sph.phi + this._d.phi * f, this.minPolarAngle, this.maxPolarAngle);
    this._sph.makeSafe();
    this._sph.radius = clamp(this._sph.radius * this._scale, this.minDistance, this.maxDistance);
    this.target.addScaledVector(this._pan, f);
    this.target.clamp(this.bounds.min, this.bounds.max);
    off.setFromSpherical(this._sph);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    const moving = Math.abs(this._d.theta) > 1e-4 || Math.abs(this._d.phi) > 1e-4 || this._pan.lengthSq() > 1e-9 || this._scale !== 1;
    if (this.enableDamping) { this._d.theta *= 1 - f; this._d.phi *= 1 - f; this._pan.multiplyScalar(1 - f); }
    else { this._d.set(0, 0, 0); this._pan.set(0, 0, 0); }
    this._scale = 1;
    return moving;
  }
}

/* ===================== Scene ===================== */
// אם Three.js לא נטען (אין רשת), הממשק ממשיך לעבוד בלי המודל
const SceneStub = {
  init() {}, start() {}, build() {}, setView() {}, setExplodeInstant() {}, setFlow() {}, setCircuit() {}, select() {},
  highlightBundle() {}, focus() {}, resetCamera() {}, home() {}, setBottomInset() {}, hasComp: () => true, resize() {}
};
const Scene = Object.assign({}, SceneStub, { wake() {}, loaded: false });
function makeScene() { return (() => {
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();
  const ACCENT = col('#5aa2ff');
  const HOME = {
    ebike: { target: V3(0.0, 0.6, 0), dir: V3(0.38, 0.3, 1).normalize(), fitW: 1.85, fitH: 1.3 },
    scooter: { target: V3(0.0, 0.64, 0), dir: V3(0.42, 0.3, 1).normalize(), fitW: 1.35, fitH: 1.42 }
  };
  const SUFFIX_OFF = { '2': V3(0, 0.011, -0.011), '3': V3(0, -0.011, 0.011), 'b': V3(0.011, 0, 0.012), 'x': V3(-0.01, 0.006, -0.013), 'b2': V3(-0.011, -0.006, 0.013), 'L': V3(0, 0.008, 0.008) };
  const CONN_COLORS = { xt60: '#e8b923', xt90: '#e8b923', anderson: '#c0392b', bullet: '#c9a227', julet: '#2f353c', higo: '#2f353c', dc55: '#1d1d1d', xlr3: '#1d1d1d', gx16: '#8d99a6' };
  const MAXP = 2400;

  let renderer, scene, camera, controls, raycaster, canvas;
  let root = null, wiresGroup = null, particles = null, pGeo = null, shadowMesh = null;
  let comps = {}, anchors = {}, waypoints = {}, bundles = [], flowList = [], pickables = [];
  let explodeF = 0, explodeFrom = 0, explodeTo = 0, explodeT0 = 0;
  let tween = null, selectedId = null, hlBundle = null, hoverId = null;
  let viewOffY = 0, viewOffTarget = 0, lastT = 0, vehicle = 'ebike';
  let screenTex = null, spriteTex = null;
  let handlers = { onPick: null, onHover: null };
  let hoverPending = null, downInfo = null;
  const _box = new THREE.Box3(), _v = V3(), _ndc = new THREE.Vector2();

  /* ---------- מטריאלים וגאומטריות עזר ---------- */
  function mat(hex, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.55, metalness: 0.2, transparent: true, opacity: 1 }, o));
    m.color = col(hex);
    if (o.emissive) m.emissive = col(o.emissive);
    m.userData.base = { opacity: o.opacity != null ? o.opacity : 1, emissive: m.emissive.clone(), ei: m.emissiveIntensity };
    return m;
  }
  function lineMat(hex, opacity) {
    const m = new THREE.LineBasicMaterial({ color: col(hex), transparent: true, opacity });
    m.userData.base = { opacity };
    return m;
  }
  function mesh(geo, m) { const x = new THREE.Mesh(geo, m); return x; }
  function tube(a, b, r, m, seg = 12) {
    const d = V3().subVectors(b, a), len = d.length();
    const x = mesh(new THREE.CylinderGeometry(r, r, len, seg, 1), m);
    x.position.copy(a).addScaledVector(d, 0.5);
    x.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return x;
  }
  function box(w, h, d, m) { return mesh(new THREE.BoxGeometry(w, h, d), m); }
  function cylZ(r, h, m, seg = 24) { const x = mesh(new THREE.CylinderGeometry(r, r, h, seg), m); x.rotation.x = Math.PI / 2; return x; }
  function cylX(r, h, m, seg = 20) { const x = mesh(new THREE.CylinderGeometry(r, r, h, seg), m); x.rotation.z = Math.PI / 2; return x; }
  function rbox(w0, h0, d, r0, m) {
    const bev0 = Math.min(0.006, d * 0.15, w0 * 0.2, h0 * 0.2);
    const w = w0 - bev0 * 2, h = h0 - bev0 * 2, r = Math.min(r0, w / 2 - 1e-4, h / 2 - 1e-4);
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const bev = bev0;
    const g = new THREE.ExtrudeGeometry(s, { depth: d - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(d - bev * 2) / 2);
    return mesh(g, m);
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  function makeScreenTex(volt) {
    return canvasTex(256, 144, (g, w, h) => {
      g.fillStyle = '#04161a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7ff6ff'; g.font = 'bold 64px monospace'; g.textAlign = 'center'; g.fillText('25', w / 2 - 10, 92);
      g.font = 'bold 18px monospace'; g.fillText('km/h', w / 2 + 62, 92);
      g.fillStyle = '#3ddc84'; for (let i = 0; i < 5; i++) g.fillRect(18 + i * 16, 16, 12, 18);
      g.fillStyle = '#7ff6ff'; g.font = 'bold 20px monospace'; g.textAlign = 'right'; g.fillText((volt || 48) + 'V', w - 16, 33);
      g.textAlign = 'left'; g.fillText('PAS 2', 18, 128); g.textAlign = 'right'; g.fillText('ODO 1284', w - 16, 128);
    });
  }
  function makeSprite() {
    return canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
  }

  /* ---------- רישום רכיבים ועוגנים ---------- */
  function beginComp(id, opts = {}) {
    const g = new THREE.Group(); g.name = id; root.add(g);
    const c = { id, group: g, meshes: [], mats: new Set(), explode: opts.explode || V3(), internal: !!opts.internal, viewDir: opts.viewDir || null };
    comps[id] = c;
    return c;
  }
  function add(c, obj, parent) {
    (parent || c.group).add(obj);
    obj.traverse(o => {
      if (o.isMesh || o.isLine || o.isLineSegments) {
        o.userData.comp = c.id; c.meshes.push(o);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => c.mats.add(m));
      }
    });
    return obj;
  }
  function anc(name, comp, v) { anchors[name] = { comp, pos: v }; }
  function wp(name, v) { waypoints[name] = v; }
  function subGroup(c, pos, rotZ) { const g = new THREE.Group(); g.position.copy(pos); g.rotation.z = rotZ || 0; c.group.add(g); return g; }
  function localToVehicle(g, v) { root.updateMatrixWorld(true); g.updateMatrixWorld(true); return g.localToWorld(v.clone()).sub(root.position); }

  /* ---------- גלגל ---------- */
  function wheel(c, center, R, tubeR, opts = {}) {
    const rubber = mat('#15181c', { roughness: 0.9, metalness: 0 });
    const rimM = mat('#8e9aa6', { roughness: 0.3, metalness: 0.85 });
    const tire = add(c, mesh(new THREE.TorusGeometry(R - tubeR, tubeR, 10, 56), rubber)); tire.position.copy(center);
    const rim = add(c, mesh(new THREE.TorusGeometry(R - tubeR * 1.9, tubeR * 0.32, 6, 56), rimM)); rim.position.copy(center);
    if (opts.spokes) {
      const pts = [], n = 32, rr = R - tubeR * 1.9, hr = opts.hubR || 0.03;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, a2 = a + (i % 2 ? 0.25 : -0.25), side = i % 2 ? 1 : -1;
        pts.push(center.x + Math.cos(a2) * hr, center.y + Math.sin(a2) * hr, center.z + side * 0.028);
        pts.push(center.x + Math.cos(a) * rr, center.y + Math.sin(a) * rr, center.z);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      add(c, new THREE.LineSegments(g, lineMat('#8a96a1', 0.75)));
    }
    if (opts.mag) {
      const mm = mat('#2a2e33', { metalness: 0.65, roughness: 0.32 }), rr = R - tubeR * 1.9, hr = opts.hubR || 0.04;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(c, tube(V3(center.x + Math.cos(a) * hr, center.y + Math.sin(a) * hr, center.z), V3(center.x + Math.cos(a + 0.18) * rr, center.y + Math.sin(a + 0.18) * rr, center.z), 0.013, mm, 8));
      }
      const band = add(c, mesh(new THREE.CylinderGeometry(rr, rr, tubeR * 1.5, 48, 1, true), mm)); band.rotation.x = Math.PI / 2; band.position.copy(center);
    }
    if (opts.disc) {
      const d = add(c, cylZ(R - tubeR * 2, 0.03, mat('#5d6874', { metalness: 0.8, roughness: 0.35 }), 28)); d.position.copy(center);
    }
    if (opts.hub) {
      const h = add(c, cylZ(opts.hub, 0.07, mat('#aab4bf', { metalness: 0.9, roughness: 0.3 }), 16)); h.position.copy(center);
    }
  }

  /* ---------- עזרים: קפיץ, בולם, כנף ---------- */
  function helix(a, b, radius, turns, tubeR, m) {
    const d = V3().subVectors(b, a), len = d.length(), pts = [], N = turns * 14;
    for (let i = 0; i <= N; i++) { const t = i / N, ang = t * turns * Math.PI * 2; pts.push(V3(Math.cos(ang) * radius, t * len - len / 2, Math.sin(ang) * radius)); }
    const x = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, tubeR, 5, false), m);
    x.position.copy(a).addScaledVector(d, 0.5);
    x.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return x;
  }
  function shock(c, a, b, r, opts = {}) {
    const bodyM = mat(opts.body || '#1b2026', { metalness: 0.6, roughness: 0.35 });
    const shaftM = mat('#d3dae1', { metalness: 0.92, roughness: 0.18 });
    const d = V3().subVectors(b, a), mid = a.clone().addScaledVector(d, 0.52);
    add(c, tube(a, mid, r, bodyM, 14));
    add(c, tube(mid, b, r * 0.5, shaftM, 10));
    if (opts.air) add(c, tube(a.clone().addScaledVector(d, 0.08), a.clone().addScaledVector(d, 0.42), r * 1.3, mat(opts.air, { metalness: 0.5, roughness: 0.3 }), 16));
    if (opts.coil) add(c, helix(a.clone().addScaledVector(d, 0.12), a.clone().addScaledVector(d, 0.9), r * 1.45, 7, r * 0.26, mat(opts.coil, { metalness: 0.4, roughness: 0.4 })));
    [a, b].forEach(p => { const e = add(c, cylZ(r * 1.05, r * 2.4, bodyM, 12)); e.position.copy(p); });
  }
  function fenderArc(c, center, R, a0, arc, width, m) {
    const f = add(c, mesh(new THREE.TorusGeometry(R, 0.008, 5, 36, arc), m));
    f.position.copy(center); f.rotation.z = a0; f.scale.z = width / 0.016;
    return f;
  }
  const hasC = id => vehicleComps().includes(id);

  /* ---------- פריסה 1: אופני ביג פוט / מיני פאט עם שיכוך מלא ---------- */
  function buildFatFull(g) {
    const R = g.R || 0.28, tR = g.tireR || 0.042;
    root.position.y = R - 0.28;                              // גלגל גדול יותר מרים את כל השלדה
    const RA = V3(-0.56, 0.28, 0), FA = V3(0.57, 0.28, 0), BB = V3(-0.02, 0.33, 0);
    const B1 = V3(0.40, 0.79, 0), B2 = V3(0.02, 0.41, 0);
    const u = V3().subVectors(B1, B2).normalize(), beamAng = Math.atan2(u.y, u.x), beamLen = B1.distanceTo(B2);
    const beamC = V3().lerpVectors(B1, B2, 0.5);
    const crown = V3(0.415, 0.772, 0), fdir = V3().subVectors(FA, crown).normalize();
    const seatType = g.seat || 'sofa';

    const F = beginComp('frame');
    const frameM = mat(g.frame || '#9e1a1f', { metalness: g.metal != null ? g.metal : 0.3, roughness: g.rough != null ? g.rough : 0.6 });
    const dark = mat('#141619', { roughness: 0.88, metalness: 0.05 });
    const steel = mat('#9aa6b2', { metalness: 0.85, roughness: 0.3 });
    const blackM = mat('#1e2227', { metalness: 0.55, roughness: 0.4 });
    const accM = mat(g.accent || '#1e2227', { metalness: 0.5, roughness: 0.4 });
    const bg = subGroup(F, beamC, beamAng);
    add(F, rbox(beamLen + 0.07, 0.108, 0.09, 0.032, frameM), bg);
    if (g.fold) {
      const hinge = add(F, box(0.05, 0.125, 0.1, steel), bg); hinge.position.set(0.02, 0, 0);
      const lev = add(F, box(0.07, 0.012, 0.012, accM), bg); lev.position.set(0.02, -0.03, 0.056);
    }
    add(F, tube(V3(0.362, 1.0, 0), V3(0.416, 0.765, 0), 0.031, frameM));
    add(F, tube(V3(0.372, 0.93, 0), V3(-0.12, 0.745, 0), 0.02, frameM));
    add(F, tube(V3(-0.01, 0.37, 0), V3(-0.15, 0.845, 0), 0.028, frameM));
    const bbs = add(F, cylZ(0.029, 0.11, frameM, 16)); bbs.position.copy(BB);
    const housing = add(F, rbox(seatType === 'saddle' ? 0.22 : 0.31, 0.075, 0.12, 0.022, frameM));
    housing.position.set(seatType === 'saddle' ? -0.27 : -0.3, 0.8, 0);
    if (seatType === 'saddle') {
      add(F, tube(V3(-0.15, 0.845, 0), V3(-0.185, 0.94, 0), 0.014, steel));
      const sd = add(F, rbox(0.27, 0.055, 0.16, 0.025, mat('#111316', { roughness: 0.95 }))); sd.position.set(-0.2, 0.965, 0);
    } else {
      const L = seatType === 'long' ? 0.64 : 0.58;
      const seat = add(F, rbox(L, 0.075, 0.21, 0.035, mat('#111316', { roughness: 0.95 }))); seat.position.set(-0.27 - (L - 0.58) / 2, 0.878, 0);
      const trim = add(F, box(L - 0.02, 0.006, 0.212, accM)); trim.position.set(-0.27 - (L - 0.58) / 2, 0.842, 0);
      if (seatType === 'long') {
        [1, -1].forEach(s => add(F, tube(V3(-0.5, 0.92, 0.1 * s), V3(-0.62, 0.92, 0.1 * s), 0.009, steel)));
        add(F, tube(V3(-0.62, 0.92, -0.1), V3(-0.62, 0.92, 0.1), 0.009, steel));
      }
    }
    const piv = add(F, cylZ(0.022, 0.15, blackM, 14)); piv.position.set(-0.02, 0.43, 0);
    [1, -1].forEach(s => {
      add(F, tube(V3(-0.02, 0.43, 0.062 * s), V3(-0.56, 0.28, 0.078 * s), 0.018, frameM));
      add(F, tube(V3(-0.56, 0.28, 0.078 * s), V3(-0.3, 0.54, 0.05 * s), 0.013, frameM));
      const top = crown.clone().setZ(0.078 * s), midP = crown.clone().addScaledVector(fdir, 0.26).setZ(0.078 * s), foot = FA.clone().setZ(0.078 * s);
      add(F, tube(top, midP, 0.017, steel, 14));
      add(F, tube(midP, foot, 0.024, accM, 14));
      if (g.fork === 'dh') add(F, tube(V3(0.36, 1.02, 0.078 * s), top, 0.017, steel, 14));
      const grip = add(F, cylZ(0.019, 0.1, dark, 14)); grip.position.set(0.33, 1.13, 0.285 * s);
      const pedal = add(F, box(0.1, 0.02, 0.065, dark)); pedal.position.set(-0.02 + 0.13 * s, 0.33 - 0.12 * s, 0.135 * s);
      add(F, tube(V3(-0.02, 0.33, 0.1 * s), V3(-0.02 + 0.13 * s, 0.33 - 0.12 * s, 0.1 * s), 0.01, steel));
    });
    add(F, tube(V3(-0.3, 0.54, -0.05), V3(-0.3, 0.54, 0.05), 0.012, frameM));
    const crownBox = add(F, rbox(0.06, 0.04, 0.2, 0.015, accM)); crownBox.position.copy(crown).add(V3(0, 0.01, 0));
    if (g.fork === 'dh') { const up = add(F, rbox(0.06, 0.035, 0.2, 0.012, accM)); up.position.set(0.36, 1.02, 0); }
    shock(F, V3(-0.3, 0.54, 0), V3(-0.13, 0.7, 0), 0.02, g.shock === 'coil' ? { coil: g.shockColor || '#e0342b' } : { air: g.shockColor || '#e8e8e8' });
    add(F, tube(V3(0.362, 1.0, 0), V3(0.355, 1.06, 0), 0.02, blackM));
    const fold = add(F, box(0.05, 0.045, 0.05, steel)); fold.position.set(0.356, 1.06, 0);
    add(F, tube(V3(0.355, 1.08, 0), V3(0.335, 1.125, 0), 0.018, blackM));
    add(F, tube(V3(0.33, 1.13, -0.335), V3(0.33, 1.13, 0.335), 0.012, blackM));
    const ring = add(F, mesh(new THREE.TorusGeometry(0.09, 0.006, 6, 40), steel)); ring.position.set(-0.02, 0.33, 0.085);
    add(F, tube(V3(-0.02, 0.42, 0.085), V3(-0.56, 0.315, 0.085), 0.003, dark));
    add(F, tube(V3(-0.02, 0.24, 0.085), V3(-0.56, 0.245, 0.085), 0.003, dark));
    const cog = add(F, cylZ(g.gears ? 0.05 : 0.035, g.gears ? 0.035 : 0.02, steel, 18)); cog.position.set(-0.56, 0.28, 0.088);
    if (g.gears) {
      const der = add(F, box(0.03, 0.07, 0.02, blackM)); der.position.set(-0.575, 0.21, 0.1);
      const jockey = add(F, cylZ(0.012, 0.008, steel, 12)); jockey.position.set(-0.57, 0.18, 0.1);
    }
    [RA, FA].forEach(p => { const rt = add(F, mesh(new THREE.TorusGeometry(0.08, 0.008, 4, 32), steel)); rt.position.copy(p).setZ(-0.09); });
    fenderArc(F, RA, R + 0.035, 0.3, 2.3, tR * 2.8, blackM);
    fenderArc(F, FA, R + 0.035, 0.55, 1.75, tR * 2.8, blackM);
    add(F, tube(V3(-0.1, 0.36, -0.07), V3(-0.26, 0.005 - root.position.y, -0.15), 0.008, steel));
    const mag = g.wheels === 'mag';
    wheel(F, FA, R, tR, mag ? { mag: true, hubR: 0.035 } : { spokes: true, hub: 0.03, hubR: 0.03 });
    wheel(F, RA, R, tR, mag ? { mag: true, hubR: 0.1 } : { spokes: true, hubR: 0.1 });

    /* סוללה – בתוך הקורה הראשית */
    const B = beginComp('battery', { explode: V3(-0.12, 0.26, 0.45), internal: true, viewDir: V3(0.2, 0.5, 1) });
    const bb = subGroup(B, beamC, beamAng);
    add(B, rbox(0.42, 0.074, 0.062, 0.02, mat('#1d5d86', { roughness: 0.5, metalness: 0.15 })), bb).position.set(0.02, 0, 0);
    const lock = add(B, cylZ(0.009, 0.012, mat('#c9d1d9', { metalness: 0.9, roughness: 0.25 }), 12), bb); lock.position.set(0.14, 0.01, 0.047);
    anc('batOut', 'battery', localToVehicle(bb, V3(-0.2, -0.02, 0)));
    anc('batIn', 'battery', localToVehicle(bb, V3(-0.13, 0, 0.028)));

    const CP = beginComp('chargePort', { explode: V3(0.05, -0.05, 0.35), viewDir: V3(0.25, 0.25, 1) });
    const cpPos = localToVehicle(bb, V3(-0.1, -0.02, 0.047));
    const port = add(CP, cylZ(0.012, 0.012, mat('#111418'), 18)); port.position.copy(cpPos);
    const pr = add(CP, mesh(new THREE.TorusGeometry(0.012, 0.0028, 6, 20), mat('#3a2408', { emissive: '#ff9f1a', emissiveIntensity: 0.9 }))); pr.position.copy(cpPos).add(V3(0, 0, 0.007));
    anc('cpOut', 'chargePort', cpPos.clone().add(V3(0, 0, -0.014)));

    const cx = seatType === 'saddle' ? -0.24 : -0.25;
    const C = beginComp('controller', { explode: V3(0, 0.32, 0.42), internal: true, viewDir: V3(-0.2, 0.6, 1) });
    const alu = mat('#77838f', { metalness: 0.8, roughness: 0.35 });
    const cb = add(C, rbox(seatType === 'saddle' ? 0.12 : 0.15, 0.04, 0.07, 0.008, alu)); cb.position.set(cx, 0.8, 0);
    for (let i = 0; i < 4; i++) { const fin = add(C, box(0.004, 0.008, 0.068, alu)); fin.position.set(cx - 0.045 + i * 0.03, 0.824, 0); }
    anc('ctrlA', 'controller', V3(cx - 0.075, 0.8, 0));
    anc('ctrlB', 'controller', V3(cx + 0.075, 0.8, 0));
    if (hasC('alarm')) {
      const AL = beginComp('alarm', { explode: V3(-0.18, 0.3, 0.32), internal: true, viewDir: V3(-0.3, 0.6, 1) });
      const ab = add(AL, box(0.055, 0.028, 0.05, mat('#101418'))); ab.position.set(-0.39, 0.8, 0);
      const led = add(AL, box(0.008, 0.004, 0.008, mat('#300', { emissive: '#ff2a2a', emissiveIntensity: 1.2 }))); led.position.set(-0.39, 0.816, 0.012);
      anc('alarmOut', 'alarm', V3(-0.362, 0.8, 0));
    }

    const Mo = beginComp('motor', { explode: V3(0, 0, 0.45) });
    const shell = add(Mo, cylZ(0.1, 0.095, mat('#20272f', { metalness: 0.55, roughness: 0.4 }), 36)); shell.position.copy(RA);
    [1, -1].forEach(s => { const cv = add(Mo, cylZ(0.085, 0.006, mat('#aeb8c2', { metalness: 0.9, roughness: 0.28 }), 36)); cv.position.copy(RA).add(V3(0, 0, 0.05 * s)); });
    const axle = add(Mo, cylZ(0.009, 0.2, mat('#9aa6b2', { metalness: 0.85, roughness: 0.3 }), 10)); axle.position.copy(RA);
    anc('motorOut', 'motor', RA.clone().add(V3(0.015, -0.015, 0.068)));

    const D = beginComp('display', { explode: V3(0.05, 0.2, 0), viewDir: V3(-0.9, 0.7, 0.35) });
    const dg = subGroup(D, V3(0.36, 1.16, 0), -0.35);
    add(D, rbox(0.016, 0.065, 0.1, 0.007, mat('#101418', { roughness: 0.5 })), dg);
    const scr = add(D, mesh(new THREE.PlaneGeometry(0.086, 0.052), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 1 })), dg);
    scr.material.userData.base = { opacity: 1 }; scr.rotation.y = -Math.PI / 2; scr.position.set(-0.0085, 0, 0);
    anc('dispOut', 'display', V3(0.345, 1.13, 0));

    if (hasC('throttle')) {
      const T = beginComp('throttle', { explode: V3(0, 0.12, 0.2), viewDir: V3(-0.6, 0.6, 0.8) });
      const tm = mat('#1a1f25', { roughness: 0.6 });
      if (State.variants.throttle === 'twist') {
        const sl = add(T, cylZ(0.022, 0.08, tm, 20)); sl.position.set(0.33, 1.13, 0.28);
        const hs = add(T, cylZ(0.025, 0.02, mat('#23292f'), 16)); hs.position.set(0.33, 1.13, 0.232);
      } else {
        const bd = add(T, cylZ(0.018, 0.028, tm, 16)); bd.position.set(0.33, 1.13, 0.225);
        const lever = add(T, box(0.042, 0.028, 0.006, mat('#2a3038', { roughness: 0.5 }))); lever.position.set(0.3, 1.115, 0.24); lever.rotation.z = -0.35;
      }
      anc('thrOut', 'throttle', V3(0.33, 1.115, 0.21));
    }

    const Br = beginComp('brakes', { explode: V3(0.1, 0.16, 0), viewDir: V3(0.2, 0.75, 1) });
    const lm = mat('#b9c3cc', { metalness: 0.85, roughness: 0.3 });
    const resM = mat('#1c2127', { roughness: 0.5 });
    [1, -1].forEach(s => {
      const cl = add(Br, cylZ(0.02, 0.032, resM, 14)); cl.position.set(0.33, 1.13, 0.26 * s);
      const res = add(Br, box(0.035, 0.022, 0.03, resM)); res.position.set(0.345, 1.155, 0.26 * s);
      const blade = add(Br, box(0.014, 0.012, 0.12, lm)); blade.position.set(0.375, 1.125, 0.32 * s); blade.rotation.y = -0.18 * s;
      const sen = add(Br, box(0.012, 0.012, 0.018, mat('#0b3d45', { emissive: '#5aa2ff', emissiveIntensity: 0.25 }))); sen.position.set(0.36, 1.115, 0.243 * s);
      add(Br, tube(V3(0.34, 1.12, 0.26 * s), V3(0.36, 1.0, 0.1 * s), 0.004, mat('#111'), 6));
    });
    anc('brLOut', 'brakes', V3(0.348, 1.112, -0.24));
    anc('brROut', 'brakes', V3(0.348, 1.112, 0.24));

    if (hasC('pas')) {
      const P = beginComp('pas', { explode: V3(0, -0.12, -0.35), viewDir: V3(0.25, 0.2, -1) });
      const disc = add(P, cylZ(0.046, 0.006, mat('#1a1f25', { roughness: 0.6 }), 28)); disc.position.set(-0.02, 0.33, -0.072);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const mg = add(P, box(0.008, 0.008, 0.004, mat(i % 2 ? '#d84040' : '#e0e0e0', { roughness: 0.4 })));
        mg.position.set(-0.02 + Math.cos(a) * 0.036, 0.33 + Math.sin(a) * 0.036, -0.076);
      }
      const psen = add(P, box(0.03, 0.016, 0.012, mat('#0e1216'))); psen.position.set(0.0, 0.285, -0.062);
      anc('pasOut', 'pas', V3(0.01, 0.29, -0.058));
    }

    const LF = beginComp('lightFront', { explode: V3(0.28, 0, 0.1), viewDir: V3(1, 0.35, 0.6) });
    const lb = add(LF, cylX(0.03, 0.05, mat('#15191e', { metalness: 0.4 }), 18)); lb.position.set(0.475, 0.815, 0);
    const lens = add(LF, cylX(0.025, 0.004, mat('#fffbe8', { emissive: '#fff6d0', emissiveIntensity: 1.4 }), 18)); lens.position.set(0.502, 0.815, 0);
    const beam = add(LF, mesh(new THREE.ConeGeometry(0.17, 0.7, 24, 1, true), new THREE.MeshBasicMaterial({ color: col('#fff4c8'), transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    beam.material.userData.base = { opacity: 0.035 }; beam.userData.noPick = true;
    beam.rotation.z = Math.PI / 2; beam.position.set(0.855, 0.77, 0);
    anc('lfOut', 'lightFront', V3(0.455, 0.805, 0));

    const LR = beginComp('lightRear', { explode: V3(-0.25, 0.08, 0), viewDir: V3(-1, 0.4, 0.5) });
    if (seatType === 'saddle') {
      const rl = add(LR, box(0.006, 0.03, 0.08, mat('#5a0000', { emissive: '#ff2a2a', emissiveIntensity: 1.3 }))); rl.position.set(-0.335, 0.95, 0);
      anc('lrOut', 'lightRear', V3(-0.31, 0.93, 0.02));
    } else {
      const rx = seatType === 'long' ? -0.622 : -0.562;
      const rl = add(LR, box(0.006, 0.03, 0.15, mat('#5a0000', { emissive: '#ff2a2a', emissiveIntensity: 1.3 }))); rl.position.set(rx, 0.878, 0);
      anc('lrOut', 'lightRear', V3(rx + 0.02, 0.86, 0.02));
    }

    wp('axleR', V3(-0.5, 0.3, 0.092)); wp('swR', V3(-0.2, 0.385, 0.088)); wp('piv', V3(-0.03, 0.455, 0.07));
    wp('mastLow', V3(-0.06, 0.53, 0.036)); wp('mastHi', V3(-0.11, 0.72, 0.036));
    wp('bmEnd', V3(0.04, 0.445, 0.036));
    wp('barR', V3(0.335, 1.115, 0.13)); wp('barL', V3(0.335, 1.115, -0.13));
    wp('stemF', V3(0.385, 1.04, 0)); wp('htLow', V3(0.445, 0.8, 0));
    wp('bm1', localToVehicle(bg, V3(0.17, 0.035, 0))); waypoints.bm1.z = 0.036;
    wp('bm2', localToVehicle(bg, V3(-0.12, 0.035, 0))); waypoints.bm2.z = 0.036;
    wp('bbL', V3(-0.01, 0.4, -0.05)); wp('mastLowL', V3(-0.06, 0.53, -0.036)); wp('mastHiL', V3(-0.11, 0.72, -0.036));
    wp('seatUnder', seatType === 'saddle' ? V3(-0.3, 0.86, 0.03) : V3(-0.46, 0.8, 0.03));
  }

  /* ---------- פריסה 2: קורקינט הנעה כפולה (OXO / Thunder 3) ---------- */
  function buildDual(g) {
    const Rw = g.R || 0.128, tR = g.tireR || 0.034, dR = Rw - 0.128;
    root.position.y = dR;
    const RA = V3(-0.47 - dR, 0.128, 0), FA = V3(0.485 + dR, 0.128, 0);
    const F = beginComp('frame');
    const body = mat(g.body || '#2b3037', { metalness: 0.55, roughness: 0.42 });
    const dark = mat('#121417', { roughness: 0.88, metalness: 0.05 });
    const steel = mat('#a3adb7', { metalness: 0.85, roughness: 0.28 });
    const trim = mat(g.trim || '#3a4149', { metalness: 0.6, roughness: 0.35 });
    const deck = add(F, rbox(0.6, 0.075, 0.22, 0.035, body)); deck.position.set(-0.04, 0.172, 0);
    const grip = add(F, box(0.5, 0.004, 0.19, dark)); grip.position.set(-0.04, 0.2115, 0);
    const tail = add(F, rbox(0.075, 0.055, 0.21, 0.018, body)); tail.position.set(-0.352, 0.21, 0);
    if (g.deckLights) [1, -1].forEach(s => { const st = add(F, box(0.5, 0.008, 0.003, mat('#10202a', { emissive: '#3fd0ff', emissiveIntensity: 1.1 }))); st.position.set(-0.04, 0.16, 0.111 * s); });
    add(F, tube(V3(0.2, 0.18, 0), V3(0.36, 0.31, 0), 0.046, body, 18));
    if (g.stem === 'double') {
      [1, -1].forEach(s => add(F, tube(V3(0.365, 0.3, 0.028 * s), V3(0.31, 1.24, 0.028 * s), 0.019, body, 14)));
      [0.6, 0.95].forEach(t => { const y = 0.3 + t * 0.94, x = 0.365 - t * 0.055; add(F, tube(V3(x, y, -0.03), V3(x, y, 0.03), 0.012, trim)); });
    } else add(F, tube(V3(0.365, 0.3, 0), V3(0.31, 1.24, 0), 0.027, body, 16));
    const fold = add(F, rbox(0.075, 0.07, 0.085, 0.015, trim)); fold.position.set(0.36, 0.4, 0);
    const lever = add(F, box(0.012, 0.09, 0.02, steel)); lever.position.set(0.4, 0.4, 0.035);
    add(F, tube(V3(0.305, 1.26, -0.295), V3(0.305, 1.26, 0.295), 0.012, body));
    const hc = add(F, rbox(0.05, 0.045, 0.08, 0.012, trim)); hc.position.set(0.31, 1.255, 0);
    [1, -1].forEach(s => {
      const gg = add(F, cylZ(0.018, 0.08, dark, 14)); gg.position.set(0.305, 1.26, 0.255 * s);
      const fc = add(F, cylZ(0.017, 0.028, steel, 12)); fc.position.set(0.305, 1.26, 0.065 * s);
      add(F, tube(V3(0.335, 0.232, 0.056 * s), FA.clone().setZ(0.056 * s), 0.014, body));
      add(F, tube(V3(-0.29, 0.145, 0.056 * s), RA.clone().setZ(0.056 * s), 0.014, body));
      shock(F, V3(FA.x - 0.045, 0.152, 0.074 * s), V3(0.372, 0.3, 0.05 * s), 0.011, { air: g.can || '#c9772b' });
      shock(F, V3(RA.x + 0.065, 0.138, 0.074 * s), V3(-0.33, 0.2, 0.08 * s), 0.011, { air: g.can || '#c9772b' });
    });
    [RA, FA].forEach(p => { const rt = add(F, mesh(new THREE.TorusGeometry(Math.min(0.08, Rw * 0.5), 0.006, 4, 28), steel)); rt.position.copy(p).setZ(-0.047); });
    fenderArc(F, FA, Rw + 0.024, 0.35, 2.0, tR * 2.5, body);
    fenderArc(F, RA, Rw + 0.024, 0.95, 1.9, tR * 2.5, body);
    add(F, tube(V3(-0.1, 0.14, -0.1), V3(-0.2, 0.005 - dR, -0.17), 0.007, steel));
    wheel(F, FA, Rw, tR, {});
    wheel(F, RA, Rw, tR, {});

    const B = beginComp('battery', { explode: V3(0, 0.3, 0.34), internal: true, viewDir: V3(0.25, 1, 0.7) });
    const bat = add(B, rbox(0.32, 0.05, 0.17, 0.014, mat('#1d5d86', { roughness: 0.5, metalness: 0.15 }))); bat.position.set(-0.06, 0.172, 0);
    for (let i = 0; i < 5; i++) { const band = add(B, box(0.004, 0.052, 0.172, mat('#123b56'))); band.position.set(-0.19 + i * 0.065, 0.172, 0); }
    anc('batOut', 'battery', V3(0.1, 0.172, 0.02));
    anc('batOutR', 'battery', V3(-0.22, 0.172, 0.02));
    anc('batIn', 'battery', V3(0.1, 0.172, -0.05));

    const alu = mat('#77838f', { metalness: 0.8, roughness: 0.35 });
    const C = beginComp('controller', { explode: V3(0.14, 0.34, 0.3), internal: true, viewDir: V3(0.3, 1, 0.7) });
    const cb = add(C, rbox(0.09, 0.035, 0.08, 0.006, alu)); cb.position.set(0.165, 0.172, 0);
    for (let i = 0; i < 4; i++) { const fin = add(C, box(0.004, 0.008, 0.078, alu)); fin.position.set(0.133 + i * 0.022, 0.193, 0); }
    anc('ctrlA', 'controller', V3(0.118, 0.172, 0));
    anc('ctrlB', 'controller', V3(0.212, 0.172, 0));
    const CR = beginComp('controllerRear', { explode: V3(-0.14, 0.34, 0.3), internal: true, viewDir: V3(-0.2, 1, 0.7) });
    const crb = add(CR, rbox(0.08, 0.035, 0.08, 0.006, mat('#77838f', { metalness: 0.8, roughness: 0.35 }))); crb.position.set(-0.275, 0.172, 0);
    anc('crA', 'controllerRear', V3(-0.233, 0.172, 0));
    anc('crB', 'controllerRear', V3(-0.317, 0.172, 0));

    const CP = beginComp('chargePort', { explode: V3(0, 0.05, -0.3), viewDir: V3(0.2, 0.3, -1) });
    const port = add(CP, cylZ(0.012, 0.012, mat('#111418'), 18)); port.position.set(0.3, 0.25, -0.048);
    const cap = add(CP, mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 20), mat('#3a2408', { emissive: '#ff9f1a', emissiveIntensity: 0.9 }))); cap.position.set(0.3, 0.25, -0.055);
    anc('cpOut', 'chargePort', V3(0.3, 0.25, -0.036));

    const hubR = Math.min(0.09, Rw * 0.64);
    const hub = (id, center, ex) => {
      const Mo = beginComp(id, { explode: ex });
      const sh = add(Mo, cylZ(hubR, 0.072, mat('#20272f', { metalness: 0.55, roughness: 0.4 }), 32)); sh.position.copy(center);
      [1, -1].forEach(s => { const cv = add(Mo, cylZ(hubR * 0.85, 0.005, mat('#aeb8c2', { metalness: 0.9, roughness: 0.28 }), 32)); cv.position.copy(center).add(V3(0, 0, 0.038 * s)); });
      const ax = add(Mo, cylZ(0.008, 0.15, mat('#9aa6b2', { metalness: 0.85, roughness: 0.3 }), 10)); ax.position.copy(center);
    };
    hub('motor', RA, V3(0, 0, 0.35));
    hub('motorFront', FA, V3(0, 0, 0.35));
    comps.motorFront.viewDir = V3(0.6, 0.3, 1);
    anc('motorOut', 'motor', RA.clone().add(V3(0.012, 0.012, 0.05)));
    anc('motorFOut', 'motorFront', FA.clone().add(V3(-0.012, 0.012, 0.05)));

    const D = beginComp('display', { explode: V3(0, 0.16, 0), viewDir: V3(-0.8, 0.9, 0.35) });
    const dg = subGroup(D, V3(0.312, 1.285, 0), 0.3);
    add(D, rbox(0.065, 0.026, 0.115, 0.01, mat('#101418', { roughness: 0.5 })), dg);
    const scr = add(D, mesh(new THREE.PlaneGeometry(0.09, 0.048), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 1 })), dg);
    scr.material.userData.base = { opacity: 1 }; scr.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); scr.position.set(0, 0.0135, 0);
    anc('dispOut', 'display', V3(0.315, 1.265, 0));

    const T = beginComp('throttle', { explode: V3(0, 0.1, 0.22), viewDir: V3(-0.6, 0.6, 0.8) });
    const tb = add(T, cylZ(0.018, 0.028, mat('#1a1f25', { roughness: 0.6 }), 14)); tb.position.set(0.305, 1.26, 0.19);
    const tl = add(T, box(0.042, 0.028, 0.006, mat('#2a3038'))); tl.position.set(0.276, 1.245, 0.205); tl.rotation.z = -0.35;
    anc('thrOut', 'throttle', V3(0.305, 1.245, 0.17));

    const Br = beginComp('brakes', { explode: V3(0, 0.18, 0), viewDir: V3(0.2, 0.8, 1) });
    const lm = mat('#b9c3cc', { metalness: 0.85, roughness: 0.3 });
    const resM = mat('#1c2127', { roughness: 0.5 });
    [1, -1].forEach(s => {
      const cl = add(Br, cylZ(0.019, 0.03, resM, 12)); cl.position.set(0.305, 1.26, 0.225 * s);
      const res = add(Br, box(0.032, 0.02, 0.028, resM)); res.position.set(0.32, 1.283, 0.225 * s);
      const blade = add(Br, box(0.013, 0.011, 0.11, lm)); blade.position.set(0.345, 1.255, 0.275 * s); blade.rotation.y = -0.2 * s;
      const sen = add(Br, box(0.012, 0.012, 0.016, mat('#0b3d45', { emissive: '#5aa2ff', emissiveIntensity: 0.25 }))); sen.position.set(0.33, 1.247, 0.205 * s);
    });
    anc('brLOut', 'brakes', V3(0.318, 1.245, -0.2));
    anc('brROut', 'brakes', V3(0.318, 1.245, 0.215));

    const LF = beginComp('lightFront', { explode: V3(0.25, 0, 0.05), viewDir: V3(1, 0.35, 0.6) });
    const lb = add(LF, cylX(0.024, 0.04, mat('#15191e', { metalness: 0.4 }), 16)); lb.position.set(0.345, 1.12, 0);
    const lens = add(LF, cylX(0.02, 0.004, mat('#fffbe8', { emissive: '#fff6d0', emissiveIntensity: 1.4 }), 16)); lens.position.set(0.366, 1.12, 0);
    const beam = add(LF, mesh(new THREE.ConeGeometry(0.15, 0.65, 24, 1, true), new THREE.MeshBasicMaterial({ color: col('#fff4c8'), transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    beam.material.userData.base = { opacity: 0.035 }; beam.userData.noPick = true;
    beam.rotation.z = Math.PI / 2; beam.position.set(0.69, 1.07, 0);
    anc('lfOut', 'lightFront', V3(0.328, 1.115, 0));

    const LR = beginComp('lightRear', { explode: V3(-0.22, 0.05, 0), viewDir: V3(-1, 0.4, 0.5) });
    const rl = add(LR, box(0.005, 0.02, 0.16, mat('#5a0000', { emissive: '#ff2a2a', emissiveIntensity: 1.3 }))); rl.position.set(-0.392, 0.215, 0);
    anc('lrOut', 'lightRear', V3(-0.37, 0.2, 0.02));

    wp('stemTop', V3(0.312, 1.22, 0)); wp('stemMid', V3(0.338, 0.75, 0)); wp('stemBase', V3(0.36, 0.34, 0)); wp('neck', V3(0.29, 0.245, 0));
    wp('barR', V3(0.305, 1.255, 0.1)); wp('barL', V3(0.305, 1.255, -0.1));
    wp('armF', V3(FA.x - 0.085, 0.19, 0.06)); wp('armR', V3(RA.x + 0.09, 0.14, 0.06)); wp('deckRear', V3(-0.3, 0.165, 0.07));
    wp('deckMid', V3(-0.06, 0.2, 0.095));
    wp('neckL', V3(0.28, 0.23, -0.03)); wp('deckFL', V3(0.15, 0.172, -0.07));
    wp('deckRearL', V3(-0.3, 0.178, -0.085)); wp('deckMidL', V3(0.0, 0.178, -0.09));
  }

  /* ---------- פריסה 3: קורקינט עירוני – מנוע אחד (Ninebot, Xiaomi, Light 2) ---------- */
  function buildCommuter(g) {
    const R = g.R || 0.127, tR = g.tireR || 0.03;
    root.position.y = 0;
    const dl = g.deckLen || 0.62, dw = g.deckW || 0.18, dy = g.deckY || 0.12, dh = 0.062;
    const xr = -dl / 2 - 0.02, xf = dl / 2 - 0.02, xm = (xr + xf) / 2;
    const RA = V3(xr - R * 0.85, R, 0), FA = V3(xf + R + 0.07, R, 0);
    const head = V3(FA.x - 0.05, R + 0.14, 0);
    const top = V3(FA.x - 0.12, (g.stemTop || 1.02) - 0.02, 0);
    const hb = V3(top.x - 0.005, top.y + 0.015, 0);
    const stemR = g.stemR || 0.02;
    const onStem = t => V3().lerpVectors(head, top, t);
    const F = beginComp('frame');
    const bodyM = mat(g.body || '#2b3642', { metalness: 0.55, roughness: 0.4 });
    const accM = mat(g.accent || '#9aa6b2', { metalness: 0.5, roughness: 0.4 });
    const dark = mat('#14181d', { roughness: 0.85, metalness: 0.05 });
    const steel = mat('#9aa6b2', { metalness: 0.85, roughness: 0.3 });
    const deck = add(F, rbox(dl, dh, dw, 0.025, bodyM)); deck.position.set(xm, dy, 0);
    const grip = add(F, box(dl - 0.08, 0.004, dw - 0.03, dark)); grip.position.set(xm, dy + dh / 2 + 0.002, 0);
    [1, -1].forEach(s => {
      const strip = add(F, box(dl * 0.7, 0.006, 0.002, accM)); strip.position.set(xm, dy, (dw / 2 + 0.001) * s);
      add(F, tube(V3(xr + 0.03, dy - 0.01, 0.045 * s), RA.clone().setZ(0.045 * s), 0.011, bodyM));
      if (!g.susp) add(F, tube(head.clone().setZ(0.04 * s), FA.clone().setZ(0.04 * s), 0.011, bodyM));
      const gr = add(F, cylZ(0.017, 0.07, dark, 14)); gr.position.set(hb.x, hb.y, 0.205 * s);
    });
    add(F, tube(V3(xf - 0.03, dy + 0.01, 0), head, 0.022, bodyM));
    add(F, tube(head.clone().add(V3(0.006, -0.03, 0)), head.clone().add(V3(-0.006, 0.05, 0)), 0.026, bodyM));
    add(F, tube(head, top, stemR, bodyM, 16));
    const hinge = add(F, box(0.045, 0.04, 0.055, steel)); hinge.position.copy(onStem(0.06));
    add(F, tube(V3(hb.x, hb.y, -0.24), V3(hb.x, hb.y, 0.24), 0.011, bodyM));
    fenderArc(F, RA, R + 0.02, 0.6, 2.0, 0.075, bodyM);
    fenderArc(F, FA, R + 0.02, 0.5, 1.5, 0.065, bodyM);
    add(F, tube(V3(xr + 0.14, dy - 0.03, -dw / 2 + 0.005), V3(xr + 0.05, 0.003, -dw / 2 - 0.06), 0.006, steel));
    if (g.susp) {
      [1, -1].forEach(s => {
        shock(F, FA.clone().add(V3(0, 0.02, 0.04 * s)), head.clone().add(V3(0, -0.01, 0.04 * s)), 0.012, { coil: '#d0d4d8' });
        shock(F, V3(RA.x + 0.1, R + 0.035, 0.05 * s), V3(xr + 0.025, dy - 0.02, 0.05 * s), 0.009, { coil: '#e0e0e0' });
      });
    }
    const front = g.motor === 'front';
    wheel(F, FA, R, tR, front ? {} : { disc: true, hub: 0.02 });
    wheel(F, RA, R, tR, front ? { disc: true, hub: 0.02 } : {});
    if (g.brakeF === 'drum' && !front) { const dr = add(F, cylZ(R * 0.42, 0.036, steel, 20)); dr.position.copy(FA); }
    if (g.brakeR === 'disc') { const rt = add(F, mesh(new THREE.TorusGeometry(R * 0.55, 0.006, 4, 28), steel)); rt.position.copy(RA).setZ(-0.04); }

    /* סוללה: בפלטפורמה או בעמוד ההיגוי */
    const B = beginComp('battery', { explode: g.battery === 'stem' ? V3(0.28, 0.1, 0.3) : V3(0, 0.3, 0.34), internal: true, viewDir: V3(0.25, 1, 0.7) });
    const batM = mat('#1d5d86', { roughness: 0.5, metalness: 0.15 });
    if (g.battery === 'stem') {
      const b0 = onStem(0.16), b1 = onStem(0.62);
      add(B, tube(b0, b1, stemR * 0.78, batM, 14));
      anc('batOut', 'battery', b0.clone().add(V3(0, -0.01, 0.006)));
      anc('batIn', 'battery', b0.clone().add(V3(0, -0.01, -0.006)));
    } else {
      const bx0 = xr + 0.05, bx1 = xf - 0.17;
      const bat = add(B, rbox(bx1 - bx0, dh * 0.6, dw * 0.8, 0.01, batM)); bat.position.set((bx0 + bx1) / 2, dy, 0);
      for (let i = 1; i < 5; i++) { const band = add(B, box(0.004, dh * 0.62, dw * 0.81, mat('#123b56'))); band.position.set(bx0 + (bx1 - bx0) * i / 5, dy, 0); }
      anc('batOut', 'battery', V3(bx1, dy, 0));
      anc('batIn', 'battery', V3(bx0, dy, 0));
    }

    const C = beginComp('controller', { explode: V3(0.12, 0.34, 0.3), internal: true, viewDir: V3(0.3, 1, 0.7) });
    const alu = mat('#77838f', { metalness: 0.8, roughness: 0.35 });
    const cb = add(C, rbox(0.11, dh * 0.45, dw * 0.55, 0.006, alu)); cb.position.set(xf - 0.09, dy, 0);
    anc('ctrlA', 'controller', V3(xf - 0.145, dy, 0));
    anc('ctrlB', 'controller', V3(xf - 0.035, dy, 0));

    const CP = beginComp('chargePort', { explode: V3(0, 0.05, -0.3), viewDir: V3(0.15, 0.3, -1) });
    const port = add(CP, cylZ(0.011, 0.012, mat('#111418'), 18)); port.position.set(xr + 0.12, dy, -dw / 2 - 0.002);
    const cap = add(CP, mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 20), mat('#3a2408', { emissive: '#ff9f1a', emissiveIntensity: 0.9 }))); cap.position.set(xr + 0.12, dy, -dw / 2 - 0.009);
    anc('cpOut', 'chargePort', V3(xr + 0.12, dy, -dw / 2 + 0.01));

    const hubC = front ? FA : RA;
    const Mo = beginComp('motor', { explode: V3(0, 0, 0.35) });
    const sh = add(Mo, cylZ(R * 0.58, 0.06, mat('#20272f', { metalness: 0.55, roughness: 0.4 }), 32)); sh.position.copy(hubC);
    [1, -1].forEach(s => { const cv = add(Mo, cylZ(R * 0.48, 0.005, mat('#aeb8c2', { metalness: 0.9, roughness: 0.28 }), 32)); cv.position.copy(hubC).add(V3(0, 0, 0.032 * s)); });
    const ax = add(Mo, cylZ(0.007, 0.13, mat('#9aa6b2', { metalness: 0.85, roughness: 0.3 }), 10)); ax.position.copy(hubC);
    anc('motorOut', 'motor', hubC.clone().add(V3(0.01, 0.01, 0.045)));

    const D = beginComp('display', { explode: V3(0, 0.16, 0), viewDir: V3(-0.8, 0.9, 0.35) });
    const dg = subGroup(D, V3(hb.x + 0.008, hb.y + 0.023, 0), 0.3);
    add(D, rbox(0.06, 0.024, 0.1, 0.01, mat('#101418', { roughness: 0.5 })), dg);
    const scr = add(D, mesh(new THREE.PlaneGeometry(0.078, 0.042), new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 1 })), dg);
    scr.material.userData.base = { opacity: 1 }; scr.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); scr.position.set(0, 0.0125, 0);
    anc('dispOut', 'display', V3(hb.x + 0.01, hb.y + 0.005, 0));

    const T = beginComp('throttle', { explode: V3(0, 0.1, 0.22), viewDir: V3(-0.6, 0.6, 0.8) });
    const tb = add(T, cylZ(0.017, 0.026, mat('#1a1f25', { roughness: 0.6 }), 14)); tb.position.set(hb.x, hb.y, 0.135);
    const tl = add(T, box(0.04, 0.026, 0.006, mat('#2a3038'))); tl.position.set(hb.x - 0.028, hb.y - 0.015, 0.148); tl.rotation.z = -0.35;
    anc('thrOut', 'throttle', V3(hb.x, hb.y - 0.015, 0.12));

    const Br = beginComp('brakes', { explode: V3(0, 0.18, 0), viewDir: V3(0.2, 0.8, 1) });
    const lm = mat('#b9c3cc', { metalness: 0.85, roughness: 0.3 });
    [1, -1].forEach(s => {
      const cl = add(Br, cylZ(0.018, 0.026, lm, 12)); cl.position.set(hb.x, hb.y, 0.165 * s);
      const blade = add(Br, box(0.013, 0.011, 0.1, lm)); blade.position.set(hb.x + 0.037, hb.y - 0.005, 0.212 * s); blade.rotation.y = -0.2 * s;
      const sen = add(Br, box(0.012, 0.012, 0.016, mat('#0b3d45', { emissive: '#5aa2ff', emissiveIntensity: 0.25 }))); sen.position.set(hb.x + 0.017, hb.y - 0.015, 0.15 * s);
    });
    anc('brLOut', 'brakes', V3(hb.x + 0.012, hb.y - 0.017, -0.15));
    anc('brROut', 'brakes', V3(hb.x + 0.012, hb.y - 0.017, 0.15));

    const LF = beginComp('lightFront', { explode: V3(0.25, 0, 0.05), viewDir: V3(1, 0.35, 0.6) });
    const lp = onStem(0.86).add(V3(0.032, 0, 0));
    const lb = add(LF, cylX(0.02, 0.035, mat('#15191e', { metalness: 0.4 }), 16)); lb.position.copy(lp);
    const lens = add(LF, cylX(0.016, 0.004, mat('#fffbe8', { emissive: '#fff6d0', emissiveIntensity: 1.4 }), 16)); lens.position.copy(lp).add(V3(0.019, 0, 0));
    const beam = add(LF, mesh(new THREE.ConeGeometry(0.14, 0.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: col('#fff4c8'), transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    beam.material.userData.base = { opacity: 0.035 }; beam.userData.noPick = true;
    beam.rotation.z = Math.PI / 2; beam.position.copy(lp).add(V3(0.32, -0.05, 0));
    if (g.signals) [1, -1].forEach(s => { const sg = add(LF, box(0.02, 0.014, 0.014, mat('#402800', { emissive: '#ffae00', emissiveIntensity: 1.2 }))); sg.position.set(hb.x, hb.y, 0.25 * s); });
    anc('lfOut', 'lightFront', lp.clone().add(V3(-0.02, -0.005, 0)));

    const LR = beginComp('lightRear', { explode: V3(-0.22, 0.05, 0), viewDir: V3(-1, 0.4, 0.5) });
    const ra = 2.55, rp = V3(RA.x + Math.cos(ra) * (R + 0.02), R + Math.sin(ra) * (R + 0.02), 0);
    const rb = add(LR, box(0.02, 0.024, 0.05, mat('#15191e'))); rb.position.copy(rp);
    const rl = add(LR, box(0.004, 0.018, 0.042, mat('#5a0000', { emissive: '#ff2a2a', emissiveIntensity: 1.3 }))); rl.position.copy(rp).add(V3(-0.011, 0, 0));
    if (g.signals) [1, -1].forEach(s => { const sg = add(LR, box(0.012, 0.014, 0.014, mat('#402800', { emissive: '#ffae00', emissiveIntensity: 1.2 }))); sg.position.copy(rp).add(V3(0, 0, 0.034 * s)); });
    anc('lrOut', 'lightRear', rp.clone().add(V3(0.012, 0, 0.012)));

    wp('stemTop', onStem(0.93)); wp('stemMid', onStem(0.5)); wp('stemBase', onStem(0.08)); wp('neck', V3().lerpVectors(V3(xf - 0.03, dy + 0.01, 0), head, 0.5));
    wp('barR', V3(hb.x, hb.y - 0.005, 0.1)); wp('barL', V3(hb.x, hb.y - 0.005, -0.1));
    wp('axleR', RA.clone().add(V3(0.03, 0.005, 0.05))); wp('armR', V3((xr + RA.x) / 2 + 0.02, (dy + R) / 2 - 0.005, 0.05));
    wp('deckRear', V3(xr + 0.06, dy, dw / 2 - 0.015)); wp('deckMid', V3(xm + 0.08, dy, dw / 2 - 0.015));
    wp('axleF', FA.clone().add(V3(-0.02, 0.01, 0.045))); wp('forkR', V3().lerpVectors(FA, head, 0.5).setZ(0.045));
    wp('fender', RA.clone().add(V3(Math.cos(1.8) * (R + 0.012), Math.sin(1.8) * (R + 0.012), 0.02)));
    wp('cpIn', V3(xr + 0.09, dy, -dw / 2 + 0.03));
  }

  /* ---------- חיווט ---------- */
  function variantFor(d) {
    const g = M().geom || {}, key = d.vkey || d.comp;
    if (key === 'motor') return g.motor || 'rear';
    if (key === 'battery') return g.battery || 'deck';
    return State.variants.throttle;
  }
  function pickV(v, variant) { return isObj(v) ? v[variant] : v; }
  function resolve(dict, name) {
    if (dict[name]) return { v: dict[name], off: null };
    let base = name, suf = '';
    while (base.length > 1 && !dict[base]) { suf = base.slice(-1) + suf; base = base.slice(0, -1); }
    if (!dict[base]) return null;
    return { v: dict[base], off: SUFFIX_OFF[suf] || SUFFIX_OFF.x };
  }
  function anchorWorld(name) {
    const r = resolve(anchors, name);
    if (!r) return V3();
    const p = r.v.pos.clone();
    if (r.off) p.add(r.off);
    const c = comps[r.v.comp];
    if (c) p.addScaledVector(c.explode, explodeF);
    return p;
  }
  function waypointWorld(name) {
    const r = resolve(waypoints, name);
    if (!r) return null;
    const p = r.v.clone();
    if (r.off) p.add(r.off);
    return p;
  }
  function makeBundles() {
    bundles = [];
    const perTo = {};
    harness().forEach(d => {
      if (!comps[d.comp]) return;
      const variant = variantFor(d);
      const to = pickV(d.to, variant);
      const k = perTo[to] = (perTo[to] || 0) + 1;
      const jitter = V3(0, (Math.floor((k - 1) / 5) - 0.5) * 0.012, (((k - 1) % 5) - 2) * 0.011);
      const g = new THREE.Group(); g.name = 'bundle:' + d.id; wiresGroup.add(g);
      const wires = d.wires.map(w => {
        const cdef = DATA.colors[w.c] || { hex: '#888' };
        const m = new THREE.MeshStandardMaterial({ color: col(cdef.hex), roughness: 0.45, metalness: 0.1, transparent: true, opacity: 1 });
        m.emissive = col(cdef.hex).multiplyScalar(w.c === 'black' ? 0.25 : 0.06);
        m.userData.base = { opacity: 1, emissive: m.emissive.clone(), ei: 1 };
        const me = new THREE.Mesh(new THREE.BufferGeometry(), m); me.userData.bundle = d.id; me.raycast = () => {};
        g.add(me);
        return { data: w, mesh: me, mat: m, samples: [], len: 0 };
      });
      const hit = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.bundle = d.id; g.add(hit);
      const cm = new THREE.MeshStandardMaterial({ color: col(CONN_COLORS[d.connector && d.connector.type] || '#2f353c'), roughness: 0.4, metalness: 0.3, transparent: true, opacity: 1 });
      cm.userData.base = { opacity: 1, emissive: cm.emissive.clone(), ei: 1 };
      const conn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.034), cm); conn.userData.bundle = d.id; conn.raycast = () => {};
      g.add(conn);
      bundles.push({ data: d, group: g, wires, hit, conn, connMat: cm, variant, to, jitter, visible: true });
    });
  }
  function bundlePoints(b) {
    const d = b.data;
    const A = anchorWorld(pickV(d.from, b.variant));
    const Z = anchorWorld(b.to).add(b.jitter);
    const via = pickV(d.via, b.variant) || [];
    const pts = [A];
    via.forEach((nm, i) => {
      const w = waypointWorld(nm);
      if (!w) return;
      if (explodeF > 0) {
        const f = (i + 1) / (via.length + 1);
        const s = V3().lerpVectors(A, Z, f); s.y -= Math.sin(f * Math.PI) * 0.06;
        w.lerp(s, explodeF);
      }
      pts.push(w);
    });
    if (pts.length === 1) { const mid = V3().lerpVectors(A, Z, 0.5); mid.y -= 0.01; pts.push(mid); }
    pts.push(Z);
    return pts;
  }
  function rebuildWires() {
    bundles.forEach(b => {
      const pts = bundlePoints(b), n = b.wires.length, r = b.data.r || 0.003;
      const center = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const len = center.getLength();
      const segs = clamp(Math.round(len * 80), 12, 110);
      b.wires.forEach((w, i) => {
        const a = (i / n) * Math.PI * 2, s = n > 1 ? r * 1.25 : 0;
        const o = V3(Math.cos(a) * s * 0.7, Math.sin(a) * s, Math.cos(a) * s);
        const curve = new THREE.CatmullRomCurve3(pts.map(p => p.clone().add(o)), false, 'centripetal');
        w.mesh.geometry.dispose();
        w.mesh.geometry = new THREE.TubeGeometry(curve, segs, r, 5, false);
        w.len = len;
        w.samples = curve.getSpacedPoints(Math.max(20, Math.round(len * 50)));
      });
      b.hit.geometry.dispose();
      b.hit.geometry = new THREE.TubeGeometry(center, Math.max(8, Math.round(segs / 3)), 0.02, 4, false);
      const t = b.data.conn != null ? b.data.conn : 0.8;
      b.conn.position.copy(center.getPointAt(t));
      b.conn.quaternion.setFromUnitVectors(V3(0, 0, 1), center.getTangentAt(t).normalize());
      const sc = Math.max(0.7, Math.min(1.6, (r / 0.003)));
      b.conn.scale.set(sc, sc, 1);
    });
    buildFlowList();
  }

  /* ---------- זרימת זרם ---------- */
  function buildFlowList() {
    flowList = [];
    bundles.forEach(b => {
      if (!b.visible) return;
      b.wires.forEach(w => {
        const fl = w.data.flow;
        if (!fl) return;
        const k = DATA.flowKinds[w.data.kind] || DATA.flowKinds.sig;
        const c = col(k.color);
        if (w.data.kind === 'gnd') c.multiplyScalar(0.6);
        flowList.push({ samples: w.samples, dir: fl, speed: k.speed, len: Math.max(w.len, 0.05), color: c, count: Math.max(3, Math.round(w.len * (w.data.kind === 'phase' || w.data.kind === 'hv' ? 30 : 20))) });
      });
    });
  }
  function updateParticles(t) {
    if (!State.flow) { particles.visible = false; return; }
    particles.visible = true;
    const pos = pGeo.attributes.position.array, cl = pGeo.attributes.color.array;
    let i = 0;
    for (const f of flowList) {
      const S = f.samples, L = S.length - 1;
      if (L < 1) continue;
      for (let j = 0; j < f.count && i < MAXP; j++, i++) {
        let u = (t * f.speed / f.len + j / f.count) % 1;
        if (f.dir < 0) u = 1 - u;
        const x = u * L, k = Math.floor(x), fr = x - k, a = S[k], b = S[Math.min(k + 1, L)];
        pos[i * 3] = a.x + (b.x - a.x) * fr; pos[i * 3 + 1] = a.y + (b.y - a.y) * fr; pos[i * 3 + 2] = a.z + (b.z - a.z) * fr;
        const fade = 0.55 + 0.45 * Math.sin(u * Math.PI);
        cl[i * 3] = f.color.r * fade; cl[i * 3 + 1] = f.color.g * fade; cl[i * 3 + 2] = f.color.b * fade;
      }
    }
    pGeo.setDrawRange(0, i);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- מצבי תצוגה ---------- */
  function relevantComps() {
    if (State.circuit === 'all') return null;
    const set = new Set(['controller']);
    bundles.forEach(b => { if (b.data.circuit === State.circuit) { set.add(b.data.comp); set.add(b.data.ctrl || 'controller'); } });
    if (State.circuit === 'power') { set.add('battery'); set.add('chargePort'); }
    return set;
  }
  function applyVisual() {
    if (!root) return;
    const rel = relevantComps();
    pickables = [];
    Object.values(comps).forEach(c => {
      let op = 1, dw = true;
      const xrayFrame = c.id === 'frame' && State.view === 'xray';
      const filtered = rel && !rel.has(c.id);
      if (xrayFrame) { op = rel ? 0.06 : 0.11; dw = false; }
      else if (filtered) { op = c.id === 'frame' ? 0.08 : 0.13; dw = false; }
      c.ghost = xrayFrame || !!filtered;
      c.mats.forEach(m => { const b = m.userData.base || { opacity: 1 }; m.opacity = op * b.opacity; m.depthWrite = b.opacity < 1 ? false : dw; });
      if (!c.ghost) c.meshes.forEach(me => { if (!me.userData.noPick) pickables.push(me); });
    });
    bundles.forEach(b => {
      b.visible = !rel || b.data.circuit === State.circuit;
      b.group.visible = b.visible;
      b.wires.forEach(w => { w.mat.emissiveIntensity = State.view === 'xray' ? 2.2 : 1; });
      if (b.visible) pickables.push(b.hit);
    });
    if (shadowMesh) shadowMesh.visible = State.view !== 'xray';
    buildFlowList();
  }
  function positionComps() { Object.values(comps).forEach(c => c.group.position.copy(c.explode).multiplyScalar(explodeF)); }

  /* ---------- בנייה ---------- */
  function disposeRoot() {
    if (!root) return;
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    scene.remove(root);
  }
  function build() {
    disposeRoot();
    const m = M();
    vehicle = m.cat;
    comps = {}; anchors = {}; waypoints = {};
    root = new THREE.Group(); root.name = 'vehicle'; scene.add(root);
    if (screenTex) screenTex.dispose();
    screenTex = makeScreenTex(m.voltage);
    wiresGroup = new THREE.Group(); wiresGroup.name = 'wires'; root.add(wiresGroup);
    const g = m.geom || {};
    if (m.layout === 'fatFull') buildFatFull(g); else if (m.layout === 'scooterDual') buildDual(g); else buildCommuter(g);
    root.updateMatrixWorld(true);
    if (particles) particles.position.copy(root.position);
    makeBundles();
    positionComps();
    rebuildWires();
    applyVisual();
    if (shadowMesh) shadowMesh.scale.set(vehicle === 'scooter' ? 1.3 : 1.6, 1, vehicle === 'scooter' ? 0.45 : 0.42);
    if (selectedId && !comps[selectedId]) selectedId = null;
    if (hlBundle && hlBundle !== 'all' && !bundles.some(b => b.data.id === hlBundle)) hlBundle = null;
  }


  /* ---------- הדגשות (בכל פריים) ---------- */
  function updateHighlights(t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    Object.values(comps).forEach(c => {
      const sel = c.id === selectedId, hov = c.id === hoverId && !sel;
      if (!sel && !hov) {
        if (c._lit) { c.mats.forEach(m => { if (m.emissive && m.userData.base) { m.emissive.copy(m.userData.base.emissive); m.emissiveIntensity = m.userData.base.ei; } }); c._lit = false; }
        return;
      }
      c._lit = true;
      c.mats.forEach(m => {
        if (!m.emissive || !m.userData.base) return;
        const b = m.userData.base;
        m.emissive.copy(b.emissive).lerp(ACCENT, sel ? 0.22 + 0.33 * pulse : 0.16);
        m.emissiveIntensity = Math.max(b.ei, 1);
      });
    });
    bundles.forEach(b => {
      const on = hlBundle === 'all' || hlBundle === b.data.id;
      if (!on && !b._lit) return;
      b._lit = on;
      b.wires.forEach(w => {
        w.mat.emissive.copy(w.mat.userData.base.emissive);
        if (on) w.mat.emissive.copy(w.mat.color).multiplyScalar(0.3 + 0.5 * pulse);
      });
      b.connMat.emissive.setRGB(0, 0, 0);
      if (on) b.connMat.emissive.copy(ACCENT).multiplyScalar(0.35 + 0.65 * pulse);
      const s = on ? 1 + 0.25 * pulse : 1;
      b.conn.scale.z = s;
    });
  }

  /* ---------- מצלמה ---------- */
  function homeView() {
    const h = HOME[vehicle], g = M().geom || {};
    const fitW = g.fitW || h.fitW, fitH = g.fitH || h.fitH;
    const tanV = Math.tan((camera.fov / 2) * Math.PI / 180);
    const dH = fitH / 2 / tanV, dW = fitW / 2 / (tanV * Math.max(camera.aspect, 0.3));
    let d = Math.max(dH, dW) * 1.02;
    if (State.view === 'explode') d *= 1.22;
    d = clamp(d, 1.2, 6.4);
    return { pos: h.target.clone().addScaledVector(h.dir, d), target: h.target.clone() };
  }
  function flyTo(pos, target, dur = 900) {
    controls.stop();
    tween = { fromP: camera.position.clone(), toP: pos, fromT: controls.target.clone(), toT: target, t0: performance.now(), dur: reducedMotion ? 1 : dur };
  }
  function resetCamera() { const h = homeView(); flyTo(h.pos, h.target); }
  function focusComp(id) {
    const c = comps[id];
    if (!c) return;
    if (id === 'frame') { resetCamera(); return; }
    _box.makeEmpty();
    c.meshes.forEach(m => { if (!m.userData.noPick) _box.expandByObject(m); });
    if (_box.isEmpty()) return;
    const center = _box.getCenter(V3()), size = _box.getSize(V3()).length();
    let d = clamp(size * 2.3, 0.5, 2.3);
    if (camera.aspect < 0.8) d *= 1.4;
    const cur = V3().subVectors(camera.position, controls.target).normalize();
    const pref = (c.viewDir || HOME[vehicle].dir).clone().normalize();
    const dir = cur.lerp(pref, 0.7).normalize();
    if (dir.y < 0.15) { dir.y = 0.15; dir.normalize(); }
    flyTo(center.clone().addScaledVector(dir, d), center);
  }

  /* ---------- בחירה במגע ובעכבר ---------- */
  function raycastAt(x, y) {
    const r = canvas.getBoundingClientRect();
    _ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;
    const compHits = hits.filter(h => h.object.userData.comp);
    let first = hits[0];
    if (first.object.userData.bundle && compHits[0] && compHits[0].distance - first.distance < 0.06) first = compHits[0];
    if (first.object.userData.comp === 'frame') {
      const inner = compHits.find(h => comps[h.object.userData.comp] && comps[h.object.userData.comp].internal);
      const bh = hits.find(h => h.object.userData.bundle);
      if (inner) first = inner;
      else if (bh && bh.distance - first.distance < 0.05) first = bh;
    }
    if (first.object.userData.bundle) return { type: 'bundle', id: first.object.userData.bundle };
    return { type: 'comp', id: first.object.userData.comp };
  }
  function bindPointer() {
    const active = new Set();
    canvas.addEventListener('pointerdown', e => {
      active.add(e.pointerId);
      downInfo = active.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
      if (handlers.onHover && e.pointerType !== 'mouse') handlers.onHover(null);
    });
    canvas.addEventListener('pointerup', e => {
      if (downInfo && downInfo.id === e.pointerId) {
        const d = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
        if (d < 8 && performance.now() - downInfo.t < 550 && handlers.onPick) handlers.onPick(raycastAt(e.clientX, e.clientY), e.clientX, e.clientY, e.pointerType);
      }
      downInfo = null; active.delete(e.pointerId);
    });
    canvas.addEventListener('pointercancel', e => { downInfo = null; active.delete(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse' && e.buttons === 0) hoverPending = { x: e.clientX, y: e.clientY };
      else if (downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 8) downInfo = null;
    });
    canvas.addEventListener('pointerleave', () => { hoverPending = null; hoverId = null; canvas.style.cursor = ''; if (handlers.onHover) handlers.onHover(null); });
    canvas.addEventListener('keydown', e => { if (e.key === '0') { e.preventDefault(); resetCamera(); } });
  }
  function processHover() {
    const p = hoverPending; hoverPending = null;
    const r = raycastAt(p.x, p.y);
    hoverId = r && r.type === 'comp' ? r.id : null;
    canvas.style.cursor = r ? 'pointer' : 'grab';
    if (handlers.onHover) handlers.onHover(r, p.x, p.y);
  }

  /* ---------- לולאה וגודל ---------- */
  let sizeDirty = true, refocus = false;
  function applyViewOffset() {
    if (Math.abs(viewOffY) > 0.5) camera.setViewOffset(lastW, lastH, 0, viewOffY, lastW, lastH);
    else camera.clearViewOffset();
  }
  let lastW = 0, lastH = 0;
  function resize() {
    sizeDirty = false;
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyViewOffset();
  }
  let running = false;
  function frame(now) {
    if (!Perf.shouldRender()) { running = false; return; }
    requestAnimationFrame(frame);
    if (sizeDirty) resize();
    const t = now / 1000;
    if (explodeF !== explodeTo) {
      const k = clamp((now - explodeT0) / (reducedMotion ? 1 : 800), 0, 1);
      explodeF = explodeFrom + (explodeTo - explodeFrom) * easeInOut(k);
      if (k >= 1) { explodeF = explodeTo; if (refocus && selectedId) focusComp(selectedId); refocus = false; }
      positionComps(); rebuildWires();
    }
    if (tween) {
      const k = clamp((now - tween.t0) / tween.dur, 0, 1), e = easeInOut(k);
      camera.position.lerpVectors(tween.fromP, tween.toP, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      camera.lookAt(controls.target);
      if (k >= 1) tween = null;
    } else controls.update();
    if (viewOffY !== viewOffTarget) {
      viewOffY += (viewOffTarget - viewOffY) * 0.16;
      if (Math.abs(viewOffTarget - viewOffY) < 0.5) viewOffY = viewOffTarget;
      applyViewOffset();
    }
    if (hoverPending) processHover();
    updateHighlights(t);
    updateParticles(t);
    renderer.render(scene, camera);
    lastT = t;
  }

  /* ---------- אתחול ---------- */
  function init(cv, h) {
    canvas = cv; Object.assign(handlers, h || {});
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene();
    scene.background = col('#16191c');
    scene.fog = new THREE.Fog(col('#16191c'), 4.5, 11);
    camera = new THREE.PerspectiveCamera(40, 1, 0.02, 40);
    spriteTex = makeSprite();

    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x15181b, side: THREE.BackSide })));
    const panel = (c, p, w, hh) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.copy(p); m.lookAt(0, 0, 0); envScene.add(m); };
    panel(new THREE.Color(2.6, 2.6, 2.6), V3(0, 4.6, 0), 5, 5);
    panel(new THREE.Color(0, 1.4, 1.8), V3(-4.6, 1, -2), 3, 3);
    panel(new THREE.Color(1.8, 1.6, 1.4), V3(4.6, 1.5, 2), 3, 3);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    pm.dispose();

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0b0f14, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x5aa2ff, 0.5); rim.position.set(-3, 2, -2.5); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe2c0, 0.3); fill.position.set(-2, 1, 3); scene.add(fill);

    const floorTex = canvasTex(512, 512, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(24,38,50,1)'); r.addColorStop(0.55, 'rgba(15,24,32,.75)'); r.addColorStop(1, 'rgba(11,15,20,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const grid = new THREE.GridHelper(6, 30, 0x2f3740, 0x21262b);
    grid.material.transparent = true; grid.material.opacity = 0.42; grid.material.depthWrite = false; grid.position.y = 0.001; scene.add(grid);
    const shTex = canvasTex(128, 128, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,.75)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    shadowMesh.rotation.x = -Math.PI / 2; shadowMesh.position.y = 0.003; scene.add(shadowMesh);

    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    pGeo.setDrawRange(0, 0);
    particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.03, map: spriteTex, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    particles.frustumCulled = false; particles.renderOrder = 10; particles.visible = false;
    scene.add(particles);

    raycaster = new THREE.Raycaster();
    controls = new OrbitControls(camera, canvas);
    controls.onStart = () => { tween = null; };
    bindPointer();
    if (window.ResizeObserver) new ResizeObserver(() => { sizeDirty = true; }).observe(canvas.parentElement);
    window.addEventListener('resize', () => { sizeDirty = true; });
    resize();
  }
  function start() {
    const h = homeView();
    camera.position.copy(h.pos); controls.target.copy(h.target); camera.lookAt(h.target);
    running = true; requestAnimationFrame(frame);
  }

  /* ---------- API ---------- */
  return {
    init, start, build: () => build(),
    setView(v) {
      const target = v === 'explode' ? 1 : 0;
      refocus = target !== explodeF && !!selectedId;
      explodeFrom = explodeF; explodeTo = target; explodeT0 = performance.now();
      applyVisual();
      if (!selectedId) resetCamera();
    },
    setExplodeInstant(on) { explodeF = explodeTo = explodeFrom = on ? 1 : 0; positionComps(); rebuildWires(); },
    setFlow() { buildFlowList(); },
    setCircuit() { applyVisual(); },
    select(id, focus = true) { selectedId = id && comps[id] ? id : null; if (selectedId && focus) focusComp(selectedId); },
    highlightBundle(id) { hlBundle = id || null; },
    focus: focusComp,
    resetCamera,
    home() { const h = homeView(); camera.position.copy(h.pos); controls.target.copy(h.target); tween = null; },
    setBottomInset(px) { viewOffTarget = Math.round((px || 0) * 0.45); },
    hasComp: id => !!comps[id],
    resize() { sizeDirty = true; },
    wake() { if (!running) { running = true; requestAnimationFrame(frame); } },
    loaded: true
  };
})(); }

/* ===================== UI ===================== */
const UI = (() => {
  const actions = {};
  let sheetState = 'peek', tipTimer = null, hintHidden = false;
  const mq = (() => { try { return window.matchMedia('(max-width: 900px)'); } catch (e) { return { matches: false, addEventListener() {} }; } })();
  const isMobile = () => mq.matches;

  function on(name, fn) { actions[name] = fn; }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function hideHint() { if (hintHidden) return; hintHidden = true; const h = $('#stageHint'); if (h) h.style.opacity = '0'; }
  function colorHex(c) { const d = DATA.colors[c]; return d ? (d.ui || d.hex) : '#888'; }
  function swatch(c) { return `<span class="sw" data-sc="${colorHex(c)}" aria-hidden="true"></span>`; }

  /* ---------- Bottom Sheet (מובייל) ---------- */
  function sheetVisible(s) {
    const H = window.innerHeight;
    return s === 'peek' ? 138 : s === 'half' ? Math.round(H * 0.52) : Math.round(H * 0.8);
  }
  function setSheet(s) {
    sheetState = s;
    const p = $('#panel');
    p.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
    p.classList.add('sheet-' + s);
    p.style.transform = '';
    $('#sheetGrip').setAttribute('aria-expanded', String(s !== 'peek'));
    updateInset();
  }
  function openSheet(min = 'half') {
    if (!isMobile()) return;
    if (sheetState === 'peek' || (min === 'full' && sheetState !== 'full')) setSheet(min);
  }
  function updateInset() {
    if (!isMobile()) { Scene.setBottomInset(0); return; }
    const stage = $('#stage').getBoundingClientRect();
    const covered = Math.max(0, stage.bottom - (window.innerHeight - sheetVisible(sheetState)));
    Scene.setBottomInset(Math.min(covered, stage.height * 0.6));
  }
  function bindSheet() {
    const grip = $('#sheetGrip'), p = $('#panel');
    let drag = null;
    grip.addEventListener('pointerdown', e => {
      if (!isMobile()) return;
      drag = { y: e.clientY, startTop: p.getBoundingClientRect().top, moved: false };
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    grip.addEventListener('pointermove', e => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      p.classList.add('dragging');
      const H = p.offsetHeight, top = clamp(drag.startTop + dy, window.innerHeight - H, window.innerHeight - 90);
      p.style.transform = `translateY(${top - (window.innerHeight - H)}px)`;
    });
    const end = e => {
      if (!drag) return;
      p.classList.remove('dragging');
      if (drag.moved) {
        const visible = window.innerHeight - p.getBoundingClientRect().top;
        const opts = ['peek', 'half', 'full'].map(s => [s, Math.abs(sheetVisible(s) - visible)]).sort((a, b) => a[1] - b[1]);
        setSheet(opts[0][0]);
        justDragged = true;
      }
      drag = null;
    };
    let justDragged = false;
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('click', () => { if (justDragged) { justDragged = false; return; } cycleSheet(); });
    grip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleSheet(); } });
    $('#panelScroll').addEventListener('focusin', () => { if (isMobile() && sheetState === 'peek') setSheet('half'); });
    const onMq = () => { $('#panel').style.transform = ''; updateInset(); Scene.resize(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    window.addEventListener('resize', () => updateInset());
  }
  function cycleSheet() { setSheet(sheetState === 'peek' ? 'half' : sheetState === 'half' ? 'full' : 'peek'); }

  /* ---------- Tooltip ---------- */
  function bundleTip(id) {
    const b = bundleById(id); if (!b) return '';
    const circ = circuitById(b.circuit);
    return `<h4><span class="sw" data-sc="${circ.color}"></span>${esc(b.label)}</h4>
      <div class="conn">${esc(connName(b.connector))} · ${esc(b.connector.pins)} פינים${b.connector.alt ? ' · או ' + esc(b.connector.alt) : ''}</div>
      <ul>${b.wires.map(w => `<li>${swatch(w.c)}<b>${esc(DATA.colors[w.c].name)}</b> ${esc(w.n)} · <span class="num">${T(w.v)}</span></li>`).join('')}</ul>`;
  }
  function showTip(html, x, y, autoHide) {
    const tip = $('#tip'), st = $('#stage').getBoundingClientRect();
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x - st.left + 14, top = y - st.top + 14;
    if (left + w > st.width - 8) left = x - st.left - w - 14;
    if (top + h > st.height - 8) top = y - st.top - h - 14;
    tip.style.left = clamp(left, 8, Math.max(8, st.width - w - 8)) + 'px';
    tip.style.top = clamp(top, 8, Math.max(8, st.height - h - 8)) + 'px';
    clearTimeout(tipTimer);
    if (autoHide) tipTimer = setTimeout(hideTip, 4200);
  }
  function hideTip() { $('#tip').hidden = true; }
  function onHover(r, x, y) {
    if (!r) { hideTip(); return; }
    if (r.type === 'bundle') showTip(bundleTip(r.id), x, y);
    else showTip(`<h4>${esc(compName(r.id))}</h4><div class="conn">לחצו לפרטים מלאים</div>`, x, y);
  }
  function onPick(r, x, y, pointerType) {
    hideHint();
    if (!r) { hideTip(); return; }
    if (window.PickHook && r.type === 'comp' && window.PickHook(r.id)) { hideTip(); return; }
    if (r.type === 'bundle') { showTip(bundleTip(r.id), x, y, true); Scene.highlightBundle(r.id); return; }
    hideTip();
    if (pointerType !== 'mouse') { showTip(`<h4>${esc(compName(r.id))}</h4>`, x, y, true); }
    showComp(r.id);
  }

  /* ---------- פאנל רכיב ---------- */
  function compBundles(id) {
    const h = harness();
    if (id === 'controller' || id === 'controllerRear') return h.filter(b => (b.ctrl || 'controller') === id || b.comp === id);
    if (id === 'battery') return h.filter(b => b.comp === 'battery' || b.id === 'charge');
    return h.filter(b => b.comp === id);
  }
  function wireList(b) {
    return `<ul class="clean wire-list">${b.wires.map(w => `<li>${swatch(w.c)}<span><b>${esc(DATA.colors[w.c].name)}</b> – ${esc(w.n)}</span><span class="w-v">${T(w.v)}</span></li>`).join('')}</ul>`;
  }
  /** נתוני הרכיב בדגם הנוכחי – נבנים אוטומטית מנתוני הדגם */
  function modelCompRows(id) {
    const m = M(), b = battRow(m.voltage), rows = [];
    const ctrlTxt = m.controller.count > 1 ? `${m.controller.count} בקרים · ${m.controller.amps}` : m.controller.amps;
    switch (id) {
      case 'battery': rows.push(['מתח', `${m.voltage}V (${b.s}S) · מלאה ${b.full.toFixed(1)}V · ריקה ≈${b.empty.toFixed(1)}V`], ['קיבולת', `${m.ah}Ah`], ['אנרגיה', `כ-${m.wh}Wh`], ['טווח', m.range]); break;
      case 'motor': case 'motorFront': rows.push(['סוג', m.motor.type], ['הספק נומינלי', m.motor.nominal], ['הספק שיא', m.motor.peak], ['מהירות', m.speed]); break;
      case 'controller': case 'controllerRear': rows.push(['בקרים', ctrlTxt], ['מיקום', m.controller.loc], ['מתח עבודה', `${m.voltage}V`]); break;
      case 'chargePort': rows.push(['טעינה', m.charging], ['מתח מטען נכון', `${b.full.toFixed(1)}V`]); break;
      case 'display': rows.push(['צג', m.display]); break;
      case 'brakes': rows.push(['בלמים', m.brakes]); break;
      case 'lightFront': case 'lightRear': rows.push(['תאורה', m.lights]); break;
      case 'frame': rows.push(['צמיגים', m.tires], ['שיכוך', m.suspension], ['משקל', m.weight], ['תוספות', m.extras]); break;
      case 'throttle': case 'pas': rows.push(['מהירות', m.speed], ['מצערת', vehicleComps().includes('throttle') ? 'יש' : 'אין – רק עזר דיווש']); break;
      case 'alarm': rows.push(['תוספות', m.extras]); break;
    }
    return rows.filter(r => r[1]);
  }
  function modelCompHTML(id) {
    const m = M(), rows = modelCompRows(id), note = m.compNotes && m.compNotes[id];
    if (!rows.length && !note) return '';
    return `<div class="card stack model-card"><div class="spread"><h3>בדגם הזה</h3><span class="brand-chip"><bdi>${esc(m.short)}</bdi></span></div>
      ${rows.length ? `<dl class="specs">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${T(r[1])}</dd>`).join('')}</dl>` : ''}
      ${note ? `<p class="lead" data-sx="s0">${T(note)}</p>` : ''}</div>`;
  }
  function compHTML(id) {
    const c = DATA.components[id], veh = State.vehicle;
    const bs = compBundles(id);
    const variants = c.variants && c.variants[veh];
    const vKey = id === 'motor' ? 'motor' : 'throttle';
    const connTypes = new Set();
    bs.forEach(b => connTypes.add(b.connector.type));
    (c.connectors || []).forEach(x => connTypes.add(x.type));
    const compact = id === 'controller' && bs.length > 4;
    return `
      <div class="spread">
        <div><p class="eyebrow">רכיב · <bdi>${esc(M().short)}</bdi></p><h2 id="compTitle" tabindex="-1">${esc(compName(id))}</h2></div>
        <button type="button" class="close-x" data-action="close-comp" aria-label="סגירת פרטי הרכיב">${ICON.close}</button>
      </div>
      <p class="lead">${T(c.role)}</p>
      ${variants ? `<div class="variant"><span class="lbl" data-sx="s1">סוג במודל:</span><div class="seg" role="radiogroup" aria-label="סוג ${esc(compName(id))}">${variants.map(v => `<button type="button" role="radio" aria-checked="${State.variants[vKey] === v.id}" data-action="variant" data-key="${vKey}" data-val="${v.id}">${esc(v.label)}</button>`).join('')}</div></div>` : ''}
      ${c.safety ? `<div class="note danger">${ICON.warn}<span>${esc(c.safety)}</span></div>` : ''}
      <div class="card stack"><h3>מיקום התקנה</h3><p>${T(byVehicle(c.location, veh))}</p></div>
      ${modelCompHTML(id)}
      ${ProUI.compExtra(id)}
      <div class="card stack"><h3>מפרט אופייני</h3><dl class="specs">${byVehicle(c.specs, veh).map(s => `<dt>${esc(s[0])}</dt><dd>${T(s[1])}</dd>`).join('')}</dl></div>
      ${bs.length || (c.connectors || []).length ? `<div class="card stack"><h3>מחברים וצבעי חוטים</h3>
        ${bs.map(b => `<div><div class="bundle-h"><span>${esc(b.label)}</span><span class="conn-tag">${esc(connName(b.connector))} · ${esc(b.connector.pins)}P</span></div>
          ${compact ? `<div class="row" aria-label="צבעי חוטים">${b.wires.map(w => `<span title="${esc(DATA.colors[w.c].name + ' – ' + w.n)}">${swatch(w.c)}</span>`).join('')}<button type="button" class="linkbtn" data-action="show-circuit" data-circuit="${b.circuit}">הצג במודל</button></div>` : wireList(b) + `<div class="row" data-sx="s2"><button type="button" class="btn sm ghost" data-action="show-circuit" data-circuit="${b.circuit}">הצג מעגל ${esc(circuitById(b.circuit).name)}</button></div>`}
        </div>`).join('')}
        ${(c.connectors || []).length ? `<p class="foot">סוגי שקעים נפוצים: ${c.connectors.map(x => esc(connName(x))).join(' · ')}</p>` : ''}
        <details class="concept"><summary>מה ההבדל בין המחברים?</summary><div class="body">${[...connTypes].map(t => DATA.connectors[t] ? `<p><b data-sx="s3">${esc(DATA.connectors[t].name)}</b> (${esc(DATA.connectors[t].pins)} פינים): ${esc(DATA.connectors[t].desc)}</p>` : '').join('')}</div></details>
      </div>` : ''}
      <div class="note info">${ICON.info}<span>${esc(DATA.meta.wiringNote)}</span></div>
      <div class="card stack"><h3>תקלות נפוצות</h3><ul class="bul">${c.faults.map(f => `<li>${T(f)}</li>`).join('')}</ul></div>
      ${c.note ? `<p class="lead">${esc(c.note)}</p>` : ''}
      ${c.legal ? `<div class="note warn">${ICON.warn}<span>${esc(DATA.meta.legalNote)}</span></div>` : ''}
      <div class="row">
        <button type="button" class="btn sm" data-action="focus-comp" data-comp="${id}">מקד מצלמה</button>
        <button type="button" class="btn sm ghost" data-action="goto-diag">אבחון תקלה</button>
        <button type="button" class="btn sm ghost" data-action="close-comp">חזור</button>
      </div>`;
  }
  function showComp(id) {
    if (!DATA.components[id] || !vehicleComps().includes(id)) return;
    State.selected = id;
    Scene.select(id, true);
    Scene.highlightBundle(null);
    const cv = $('#compView');
    cv.innerHTML = compHTML(id);
    cv.hidden = false; $('#modeView').hidden = true;
    $('#panelScroll').scrollTop = 0;
    openSheet('half');
    const t = $('#compTitle'); if (t && !isMobile()) t.focus({ preventScroll: true });
  }
  function closeComp(restore = true) {
    if ($('#compView').hidden) return;
    State.selected = null;
    $('#compView').hidden = true; $('#compView').innerHTML = '';
    $('#modeView').hidden = false;
    Scene.select(null); Scene.highlightBundle(null);
    if (restore) { const m = Modes()[State.mode]; if (m && m.restore) m.restore(); }
  }

  /* ---------- סרגלי תצוגה ---------- */
  function renderCircuits() {
    const cs = DATA.circuits.filter(c => harness().some(b => b.circuit === c.id));
    if (State.circuit !== 'all' && !cs.some(c => c.id === State.circuit)) State.circuit = 'all';
    $('#circuitBar').innerHTML =
      `<button type="button" class="chip" data-circuit="all" data-sx="s4" aria-pressed="${State.circuit === 'all'}"><i></i>כל המעגלים</button>` +
      cs.map(c => `<button type="button" class="chip" data-circuit="${c.id}" data-sc="${c.color}" aria-pressed="${State.circuit === c.id}" title="${esc(c.hint)}"><i></i>${esc(c.name)}</button>`).join('');
  }
  function setCircuit(id) {
    State.circuit = id;
    $$('#circuitBar .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.circuit === id)));
    Scene.setCircuit();
    Store.save();
  }
  function renderLegend() {
    const kinds = ['hv', 'phase', 'v5', 'sig', 'lv', 'gnd'];
    $('#flowLegend').innerHTML = '<b>זרימת זרם</b>' + kinds.map(k => `<span><i data-sc="${DATA.flowKinds[k].color}"></i>${esc(DATA.flowKinds[k].name)}</span>`).join('');
  }
  function syncToolbar() {
    $$('#catSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.cat === State.vehicle)));
    $('#modelSelect').innerHTML = modelOptions();
    $$('#viewSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === State.view)));
    $('#flowToggle').setAttribute('aria-pressed', String(State.flow));
    $('#flowLegend').hidden = !State.flow;
    renderCircuits();
  }
  function setView(v) {
    State.view = v; syncToolbar(); Scene.setView(v); Store.save(); hideHint();
    toast(v === 'xray' ? 'שקיפות: השלדה שקופה, החיווט גלוי' : v === 'explode' ? 'תצוגה מפורקת: הרכיבים זזים החוצה' : 'תצוגה רגילה');
  }
  function setFlow(on) {
    State.flow = on; syncToolbar(); Scene.setFlow(on); Store.save();
    if (on) toast('זרימת זרם: סוללה ← בקר ← מנוע, ו-5V לחיישנים');
  }
  const lastByCat = {};
  function modelOptions(sel = State.model) {
    return Object.keys(DATA.categories).map(cat => `<optgroup label="${esc(DATA.categories[cat].name)}">` +
      Object.keys(DATA.models).filter(id => DATA.models[id].cat === cat).map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(DATA.models[id].short)}</option>`).join('') + '</optgroup>').join('');
  }
  function setModel(id) {
    if (!DATA.models[id] || id === State.model) return;
    if (!ModelData.ready(id)) { toast('טוען את נתוני הדגם…'); ModelData.ensure(id).then(() => setModel(id), () => toast('נתוני הדגם לא נטענו – בדקו חיבור')); return; }
    setModelState(id);
    lastByCat[State.vehicle] = id;
    State.voltage = M().voltage;
    closeComp(false);
    Scene.build();
    syncToolbar();
    Scene.setCircuit();
    Scene.resetCamera();
    Store.save();
    Object.values(Modes()).forEach(x => { if (x.onVehicle) x.onVehicle(); });
    const m = Modes()[State.mode];
    if (m) m.render();
    toast('נטען: ' + M().name);
  }
  function setCategory(cat) {
    if (cat === State.vehicle) return;
    setModel(lastByCat[cat] || Object.keys(DATA.models).find(k => DATA.models[k].cat === cat));
  }
  function setMode(m, initial) {
    State.mode = m;
    $$('#modeTabs [role=tab]').forEach(t => {
      const sel = t.dataset.mode === m;
      t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1;
    });
    $('#modeView').setAttribute('aria-labelledby', 'tab-' + m);
    closeComp(false);
    Scene.select(null); Scene.highlightBundle(null);
    Modes()[m].render();
    $('#panelScroll').scrollTop = 0;
    if (!initial) { Store.save(); openSheet('half'); }
  }
  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    const fs = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (!fs) {
        const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (r && r.catch) r.catch(() => toast('מסך מלא לא זמין כאן'));
      } else {
        const r = (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { toast('מסך מלא לא זמין כאן'); }
  }
  function Modes() { return { learn: Learn, wizard: Wizard, diag: Diagnostics, tools: Tools }; }

  /* ---------- אתחול ---------- */
  function init() {
    renderLegend();
    syncToolbar();
    lastByCat[State.vehicle] = State.model;
    $('#catSeg').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) setCategory(b.dataset.cat); });
    $('#modelSelect').addEventListener('change', e => setModel(e.target.value));
    $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
    $('#flowToggle').addEventListener('click', () => setFlow(!State.flow));
    $('#circuitBar').addEventListener('click', e => { const b = e.target.closest('[data-circuit]'); if (b) setCircuit(b.dataset.circuit === State.circuit && b.dataset.circuit !== 'all' ? 'all' : b.dataset.circuit); });
    $('#resetCam').addEventListener('click', () => { Scene.resetCamera(); hideHint(); });
    const fsOK = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!fsOK) $('#fullBtn').hidden = true;
    $('#fullBtn').addEventListener('click', toggleFullscreen);
    const fsChange = () => {
      const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      $('#fullBtn').setAttribute('aria-label', on ? 'יציאה ממסך מלא' : 'מסך מלא'); $('#fullBtn').title = on ? 'יציאה ממסך מלא' : 'מסך מלא';
      Scene.resize();
    };
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
    const tabs = $('#modeTabs');
    tabs.addEventListener('click', e => { const t = e.target.closest('[data-mode]'); if (t) setMode(t.dataset.mode); });
    tabs.addEventListener('keydown', e => {
      const list = $$('[role=tab]', tabs), i = list.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowLeft') j = (i + 1) % list.length;        // RTL: שמאלה = הבא
      else if (e.key === 'ArrowRight') j = (i - 1 + list.length) % list.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = list.length - 1;
      if (j >= 0) { e.preventDefault(); list[j].focus(); setMode(list[j].dataset.mode); }
    });
    $('#panel').addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el || !$('#panel').contains(el)) return;
      const fn = actions[el.dataset.action];
      if (fn) fn(el, e);
    });
    on('close-comp', () => closeComp(true));
    on('focus-comp', el => Scene.focus(el.dataset.comp));
    on('show-circuit', el => { setCircuit(el.dataset.circuit); toast('מוצג מעגל: ' + circuitById(el.dataset.circuit).name); });
    on('goto-diag', () => setMode('diag'));
    on('select-comp', el => showComp(el.dataset.comp));
    on('select-model', el => { setModel(el.dataset.model); $('#panelScroll').scrollTop = 0; });
    on('variant', el => {
      State.variants[el.dataset.key] = el.dataset.val;
      const id = State.selected;
      Scene.build(); Scene.setCircuit();
      Store.save();
      if (id) { showComp(id); }
      toast('המודל עודכן');
    });
    bindSheet();
    setSheet('peek');
    ['pointerdown', 'wheel', 'keydown'].forEach(ev => $('#scene').addEventListener(ev, hideHint, { once: true, passive: true }));
  }

  return { init, on, toast, showComp, closeComp, setMode, setModel, modelOptions, setCircuit, openSheet, onPick, onHover, swatch, colorHex, wireList, isMobile, syncToolbar, Modes };
})();

/* ===================== Learn (מצב לימוד) ===================== */
const Learn = (() => {
  let sub = 'model', step = -1;
  const SUBS = [['model', 'הדגם'], ['academy', 'אקדמיה'], ['compare', 'השוואה'], ['tour', 'סיור'], ['concepts', 'מושגים'], ['volts', 'מתחים'], ['comps', 'רכיבים'], ['glossary', 'מילון']];
  const steps = () => DATA.tour.filter(s => vehicleComps().includes(s.comp) && (!s.bundle || bundleById(s.bundle)));

  function subtabs() {
    return `<div class="subtabs" role="tablist" aria-label="נושאי לימוד">${SUBS.map(([id, n]) =>
      `<button type="button" role="tab" aria-selected="${sub === id}" data-action="learn-sub" data-sub="${id}">${n}</button>`).join('')}</div>`;
  }
  function tourHTML() {
    const S = steps();
    if (step < 0) {
      return `<div class="card stack">
        <h3>סיור לפי זרימת החשמל</h3>
        <p class="lead">${S.length} צעדים: מהשקע, דרך הסוללה והבקר, ועד המנוע, החיישנים והתאורה. בכל צעד הרכיב והכבל מודגשים במודל.</p>
        <button type="button" class="btn primary block" data-action="tour-go" data-i="0">התחל סיור</button>
      </div>
      <div class="note info">${ICON.info}<span>אפשר גם ללחוץ על כל רכיב במודל, או לרחף מעל כבל כדי לראות את צבעי החוטים.</span></div>`;
    }
    const s = S[step], b = s.bundle ? bundleById(s.bundle) : null, last = step === S.length - 1;
    return `<div class="stack">
      <div class="progress" role="progressbar" aria-label="התקדמות בסיור" aria-valuemin="1" aria-valuemax="${S.length}" aria-valuenow="${step + 1}"><i data-sw="${((step + 1) / S.length) * 100}"></i></div>
      <div class="dots" role="group" aria-label="קפיצה לצעד">${S.map((x, i) => `<button type="button" data-action="tour-go" data-i="${i}" aria-label="צעד ${i + 1}: ${esc(x.title)}" ${i === step ? 'aria-current="step"' : ''} class="${i < step ? 'done' : ''}">${i + 1}</button>`).join('')}</div>
    </div>
    <div class="card stack" aria-live="polite">
      <p class="eyebrow">צעד ${step + 1} מתוך ${S.length}</p>
      <h3 id="tourTitle" tabindex="-1">${esc(s.title)}</h3>
      <p>${T(s.text)}</p>
      ${b ? `<div><div class="bundle-h"><span>${esc(b.label)}</span><span class="conn-tag">${esc(connName(b.connector))} · ${esc(b.connector.pins)}P</span></div>${UI.wireList(b)}</div>` : ''}
      ${s.comp !== 'frame' ? `<button type="button" class="linkbtn" data-action="select-comp" data-comp="${s.comp}">כל הפרטים על ${esc(compName(s.comp))}</button>` : ''}
    </div>
    <div class="navrow">
      <button type="button" class="btn" data-action="tour-go" data-i="${step - 1}" ${step === 0 ? 'disabled' : ''}>${ICON.prev} הקודם</button>
      <button type="button" class="btn primary" data-action="${last ? 'tour-end' : 'tour-go'}" data-i="${step + 1}">${last ? 'סיום הסיור' : 'הבא'} ${last ? ICON.ok : ICON.next}</button>
    </div>`;
  }
  function conceptsHTML() {
    return DATA.concepts.map((c, i) => `<details class="concept" ${i === 0 ? 'open' : ''}><summary>${esc(c.title)}</summary><div class="body"><p>${T(c.body)}</p>
      ${c.calc ? calcHTML() : ''}${c.id === 'law' ? `<div class="note warn">${ICON.warn}<span>${esc(DATA.meta.batteryNote)}</span></div>` : ''}</div></details>`).join('');
  }
  function calcHTML() {
    return `<div class="card flat stack" data-sx="s5">
      <b data-sx="s3">מחשבון אנרגיה וטווח</b>
      <div class="calc">
        <div class="field"><label for="calcV">מתח (V)</label><select class="input" id="calcV">${DATA.wizard.voltages.map(v => `<option value="${v}" ${v === State.voltage ? 'selected' : ''}>${v}V</option>`).join('')}</select></div>
        <div class="field"><label for="calcAh">קיבולת (Ah)</label><input class="input num" id="calcAh" type="number" inputmode="decimal" min="1" max="60" step="0.5" value="14"></div>
        <div class="field"><label for="calcWhkm">צריכה (Wh/ק״מ)</label><input class="input num" id="calcWhkm" type="number" inputmode="decimal" min="5" max="40" step="1" value="15"></div>
      </div>
      <p class="calc-out" id="calcOut" aria-live="polite"></p>
    </div>`;
  }
  function updateCalc() {
    const V = Number($('#calcV').value) || 48, Ah = Number($('#calcAh').value) || 0, c = Math.max(1, Number($('#calcWhkm').value) || 15);
    const wh = V * Ah;
    $('#calcOut').textContent = `${V}V × ${Ah}Ah = ${Math.round(wh)}Wh · טווח משוער: כ-${Math.round(wh * 0.85 / c)} ק״מ (עם 15% מרווח)`;
  }
  function voltsHTML() {
    const rows = DATA.batteryTable.map(b => `<tr><td class="nom">${b.nominal}V</td><td>${b.s}S</td><td class="full">${b.full.toFixed(1)}V</td><td class="empty">≈${b.empty.toFixed(1)}V</td><td>${(b.full / b.s).toFixed(2)}V</td></tr>`).join('');
    return `<div class="tbl-wrap"><table class="volt"><caption class="sr-only">מתחי סוללה: נומינלי, מלאה וריקה</caption>
      <thead><tr><th scope="col">נומינלי</th><th scope="col">תאים</th><th scope="col">מלאה</th><th scope="col">ריקה (משוער)</th><th scope="col">לתא (מלא)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="foot">מתח ריקה משוער לפי כ-3.0V לתא. הבקר (LVC) וה-BMS מנתקים בערך הזה או מעט מעליו – זה משתנה בין יצרנים.</p>
      <div class="card stack">
        <h3>כמה נשאר בסוללה?</h3>
        <p class="lead">מדדו מתח אחרי לפחות שעה מנוחה (לא בזמן נסיעה או טעינה).</p>
        <div class="calc" data-sx="s6">
          <div class="field"><label for="socNom">סוללה</label><select class="input" id="socNom">${DATA.batteryTable.map(b => `<option value="${b.nominal}" ${b.nominal === State.voltage ? 'selected' : ''}>${b.nominal}V (${b.s}S)</option>`).join('')}</select></div>
          <div class="field"><label for="socMeas">מתח שנמדד (V)</label><input class="input num" id="socMeas" type="number" inputmode="decimal" step="0.1" value="${battRow(State.voltage).nominal + 2}"></div>
        </div>
        <div><div class="vbar" aria-hidden="true"><i id="socMark"></i></div></div>
        <p class="calc-out" id="socOut" aria-live="polite"></p>
      </div>`;
  }
  function updateSoc() {
    const b = battRow($('#socNom').value), v = Number($('#socMeas').value) || 0, cell = v / b.s;
    const C = DATA.socCurve;
    let pct;
    if (cell >= C[0][0]) pct = 100; else if (cell <= C[C.length - 1][0]) pct = 0;
    else for (let i = 0; i < C.length - 1; i++) { const [v1, p1] = C[i], [v2, p2] = C[i + 1]; if (cell <= v1 && cell >= v2) { pct = p2 + (p1 - p2) * (cell - v2) / (v1 - v2); break; } }
    pct = Math.round(pct);
    $('#socMark').style.insetInlineStart = `calc(${100 - pct}% - 1px)`;
    let msg = `${cell.toFixed(2)}V לתא · בערך ${pct}% (הערכה גסה)`;
    if (cell > 4.25) msg = `${cell.toFixed(2)}V לתא – גבוה מהמלא. ודאו שבחרתם את הסוללה הנכונה, ושהמטען מתאים.`;
    else if (cell < 2.9 && v > 0) msg = `${cell.toFixed(2)}V לתא – מתחת לריקה. טענו עם המטען המקורי; אם לא עולה – למעבדה.`;
    $('#socOut').textContent = msg;
  }
  function specRows(m) {
    const peak = m.motor.peak && m.motor.peak !== 'לא פורסם' ? ` (שיא ${m.motor.peak})` : '';
    const ctrl = m.controller.count > 1 ? `${m.controller.count} בקרים · ${m.controller.amps}` : m.controller.amps;
    return [['יצרן', m.brand], ['סוג', m.kind], ['סוללה', `${m.voltage}V · ${m.ah}Ah · כ-${m.wh}Wh`], ['מנוע', `${m.motor.type} · ${m.motor.nominal}${peak}`],
      ['בקר', ctrl], ['צמיגים', m.tires], ['בלמים', m.brakes], ['שיכוך', m.suspension], ['משקל', m.weight], ['טווח', m.range],
      ['מהירות', m.speed], ['טעינה', m.charging], ['צג', m.display], ['תאורה', m.lights], ['תוספות', m.extras]].filter(r => r[1]);
  }
  function modelHTML() {
    const m = M(), b = battRow(m.voltage);
    const li = arr => `<ul class="bul">${arr.map(x => `<li>${T(x)}</li>`).join('')}</ul>`;
    return `<div class="card stack">
        <div class="model-head"><div><p class="eyebrow">${esc(DATA.categories[m.cat].name)} · ${esc(LAYOUT().name)}</p><h3 data-sx="s7"><bdi>${esc(m.name)}</bdi></h3></div><span class="brand-chip"><bdi>${esc(m.brand)}</bdi></span></div>
        <p class="lead">${T(m.overview)}</p>
        <div class="kv-grid">
          <div class="kv"><span>מתח</span><b>${m.voltage}V</b></div>
          <div class="kv"><span>קיבולת</span><b>${m.ah}Ah</b></div>
          <div class="kv"><span>אנרגיה</span><b>${m.wh}Wh</b></div>
          <div class="kv"><span>מנועים</span><b>${m.motor.pos === 'dual' ? '2' : '1'}</b></div>
        </div>
      </div>
      <div class="card stack"><h3>מפרט מלא</h3><dl class="specs">${specRows(m).map(s => `<dt>${esc(s[0])}</dt><dd>${T(s[1])} ${Conf.badgeFor(m, s[0])}</dd>`).join('')}</dl>${Conf.modelExtraHTML(m)}${Legal.modelNote(m)}</div>
      <div class="card stack"><h3>מערכת החשמל בדגם הזה</h3><p>${T(m.electric)}</p>
        <div class="row" data-sx="s8">
          <span>מלאה <b class="num" data-sx="s9">${b.full.toFixed(1)}V</b></span>
          <span>ריקה ≈ <b class="num" data-sx="s10">${b.empty.toFixed(1)}V</b></span>
          <span>תאים <b class="num" data-sx="s3">${b.s}S</b></span>
          <span>מטען <b class="num" data-sx="s3">${b.full.toFixed(1)}V</b></span>
        </div>
        <p class="foot">רכיבים במודל: ${vehicleComps().map(id => esc(compName(id))).join(' · ')}</p>
      </div>
      <div class="card stack"><h3>נקודות חוזק</h3>${li(m.strengths)}</div>
      <div class="card stack"><h3>תקלות נפוצות ונקודות תורפה</h3>${li(m.faults)}</div>
      <div class="card stack"><h3>תחזוקה מומלצת</h3>${li(m.maintenance)}</div>
      <div class="note warn">${ICON.warn}<span>${T(m.legal || DATA.meta.legalNote)}</span></div>
      <div class="navrow"><button type="button" class="btn primary" data-action="tour-start">סיור ברכיבים ${ICON.next}</button><button type="button" class="btn" data-action="learn-sub" data-sub="comps">רשימת רכיבים</button></div>
      <p class="foot">מקורות: ${esc(m.sources)}</p>
      <div class="note info">${ICON.info}<span>${esc(DATA.meta.brandNote)}</span></div>`;
  }
  function compareHTML() {
    const ids = Object.keys(DATA.models);
    return `<p class="lead">כל ${ids.length} הדגמים במעבדה. בחרו דגם כדי לטעון אותו.</p>
      <div class="tbl-wrap"><table class="volt cmp"><caption class="sr-only">השוואת דגמים</caption>
      <thead><tr><th scope="col">דגם</th><th scope="col">סוללה</th><th scope="col">Wh</th><th scope="col">מנוע</th><th scope="col">משקל</th><th scope="col">בלמים</th></tr></thead>
      <tbody>${ids.map(id => { const m = DATA.models[id]; return `<tr ${id === State.model ? 'aria-current="true"' : ''}>
        <td><button type="button" class="linkbtn" data-action="select-model" data-model="${id}"><bdi>${esc(m.short)}</bdi></button><br><small data-sx="s11">${esc(DATA.categories[m.cat].short)}</small></td>
        <td class="nom">${m.voltage}V ${m.ah}Ah</td><td>${m.wh}</td><td data-sx="s12">${T(m.motor.nominal)}${m.motor.pos === 'dual' ? ' ×2 מנועים' : ''}</td><td>${T(m.weight)}</td><td data-sx="s13">${T(m.brakes)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="foot">״לא פורסם״ – נתון שלא מצאנו במקורות. ${esc(DATA.meta.brandNote)}</p>`;
  }
  function compsHTML() {
    return `<p class="lead">בחרו רכיב כדי לראות תפקיד, מיקום, מפרט, מחברים, צבעי חוטים ותקלות נפוצות.</p>
      <div class="comp-grid">${vehicleComps().map(id => `<button type="button" data-action="select-comp" data-comp="${id}"><i aria-hidden="true"></i>${esc(compName(id))}</button>`).join('')}</div>`;
  }
  function highlight(focus = true) {
    if (sub === 'academy') { Academy.highlight(focus); return; }
    if (sub === 'tour' && step >= 0) {
      const s = steps()[step];
      if (!s) return;
      if (s.comp === 'frame') { Scene.select(null); Scene.resetCamera(); }
      else Scene.select(s.comp, focus);
      Scene.highlightBundle(s.bundle || null);
    } else { Scene.select(null); Scene.highlightBundle(null); }
  }
  function render() {
    const body = sub === 'academy' ? Academy.html() : sub === 'glossary' ? Glossary.html() : sub === 'model' ? modelHTML() : sub === 'compare' ? compareHTML() : sub === 'tour' ? tourHTML() : sub === 'concepts' ? conceptsHTML() : sub === 'volts' ? voltsHTML() : compsHTML();
    $('#modeView').innerHTML = `
      <div><p class="eyebrow">${ICON.bolt} מצב לימוד · <bdi>${esc(M().short)}</bdi></p><h2>איך הכול מחובר?</h2></div>
      ${subtabs()}<div class="stack">${body}</div>
      <p class="foot">${esc(DATA.meta.wiringNote)}</p>`;
    if (sub === 'concepts') { ['calcV', 'calcAh', 'calcWhkm'].forEach(id => $('#' + id).addEventListener('input', updateCalc)); updateCalc(); }
    if (sub === 'volts') { ['socNom', 'socMeas'].forEach(id => $('#' + id).addEventListener('input', updateSoc)); updateSoc(); }
    if (sub === 'academy') Academy.bind();
    if (sub === 'glossary') Glossary.bind();
    highlight();
  }
  UI.on('learn-sub', el => { sub = el.dataset.sub; render(); });
  UI.on('tour-go', el => {
    const S = steps(); step = clamp(Number(el.dataset.i), 0, S.length - 1); render();
    const t = $('#tourTitle'); if (t && !UI.isMobile()) t.focus({ preventScroll: true });
    UI.openSheet('half');
  });
  UI.on('tour-start', () => { sub = 'tour'; step = 0; render(); UI.openSheet('half'); });
  UI.on('tour-end', () => { step = -1; Scene.resetCamera(); render(); UI.toast('הסיור הושלם. נסו את אשף ההתקנה!'); });
  return { render, restore: () => highlight(true), onVehicle() { step = -1; } };
})();

/* ===================== Wizard (אשף התקנה) ===================== */
const Wizard = (() => {
  let phase = 'setup', scenario = 'controller', idx = 0;
  const available = () => Object.keys(DATA.wizard.scenarios).filter(k => vehicleComps().includes(DATA.wizard.scenarios[k].comp));
  const steps = () => { const s = DATA.wizard.scenarios[scenario]; return [DATA.wizard.first].concat(s.steps, [DATA.wizard.last]); };

  function opt(name, value, label, checked, sub) {
    const id = `${name}-${value}`;
    return `<label class="opt" for="${id}"><input type="radio" name="${name}" id="${id}" value="${value}" ${checked ? 'checked' : ''}><span>${label}${sub ? `<br><small data-sx="s14">${sub}</small>` : ''}</span></label>`;
  }
  function setupHTML() {
    const av = available();
    if (!av.includes(scenario)) scenario = av[0];
    const hv = State.voltage >= 60;
    return `
      <div><p class="eyebrow">${ICON.bolt} אשף התקנה</p><h2>מה עושים היום?</h2><p class="lead">בחרו כלי, מתח, סוג בקר ורכיב. האשף ידריך אתכם שלב אחר שלב ויסמן במודל את הרכיב והמחבר.</p></div>
      <div class="field"><label for="wzModel">הדגם</label><select class="input" id="wzModel">${UI.modelOptions()}</select></div>
      <fieldset class="field" data-sx="s15"><legend class="lbl">מתח הסוללה</legend>
        <div class="opt-grid">${DATA.wizard.voltages.map(v => opt('wzV', v, `${v}V`, v === State.voltage, `מלאה ${battRow(v).full.toFixed(1)}V`)).join('')}</div></fieldset>
      ${hv ? `<div class="note warn">${ICON.warn}<span>מתח של ${State.voltage}V הוא מסוכן יותר במגע. עבדו רק כשהסוללה מנותקת, בכפפות ובלי תכשיטי מתכת.</span></div>` : ''}
      <fieldset class="field" data-sx="s15"><legend class="lbl">סוג הבקר</legend>
        <div class="opt-grid">${DATA.wizard.controllerTypes.map(c => opt('wzC', c.id, esc(c.name), c.id === State.ctrl)).join('')}</div>
        <p class="foot">${T(ctrlType().note)}</p></fieldset>
      <fieldset class="field" data-sx="s15"><legend class="lbl">רכיב להתקנה או להחלפה</legend>
        <div class="opt-grid">${av.map(k => opt('wzS', k, esc(DATA.wizard.scenarios[k].name), k === scenario)).join('')}</div>
        <p class="foot">${T(DATA.wizard.scenarios[scenario].desc)} · ${steps().length} שלבים</p></fieldset>
      ${WizardPlus.setupExtra(scenario)}
      <div class="card stack" data-sx="s16">
        <h3>בדיקת בטיחות לפני עבודה</h3>
        <p class="lead" data-sx="s0">סמנו אם אחד מאלה נכון עכשיו. סימון עוצר את העבודה.</p>
        <div class="checks" id="wzChecks">${Safety.checksHTML('wz')}</div>
      </div>
      <button type="button" class="btn primary block" data-action="wz-start">התחלת האשף ${ICON.next}</button>
      <p class="foot">${esc(DATA.meta.legalNote)}</p>`;
  }
  function stepHTML() {
    const S = steps(), s = S[idx], sc = DATA.wizard.scenarios[scenario], last = idx === S.length - 1;
    const b = s.bundle && s.bundle !== 'all' ? bundleById(s.bundle) : null;
    const vnote = s.vnote && s.vnote[State.vehicle];
    return `
      <div class="spread"><p class="eyebrow">${esc(sc.name)} · <bdi>${esc(M().short)}</bdi> · ${State.voltage}V</p><button type="button" class="linkbtn" data-action="wz-exit">צא מהאשף</button></div>
      <div class="stack">
        <div class="spread"><span data-sx="s17" class="num">שלב ${idx + 1} מתוך ${S.length}</span><span data-sx="s17" class="num">${Math.round(((idx + 1) / S.length) * 100)}%</span></div>
        <div class="progress" role="progressbar" aria-label="התקדמות באשף" aria-valuemin="1" aria-valuemax="${S.length}" aria-valuenow="${idx + 1}"><i data-sw="${((idx + 1) / S.length) * 100}"></i></div>
      </div>
      <div class="step-head"><div class="step-num" aria-hidden="true">${idx + 1}</div><div class="stack" data-sx="s18"><h2 id="wzTitle" tabindex="-1">${T(s.title)}</h2>${s.live ? Safety.liveBadge() : ''}</div></div>
      ${s.live ? `<div class="note warn">${ICON.warn}<span>שלב עם מתח: ידיים יבשות, בלי תכשיטי מתכת, חוד אחד בכל פעם, ואל תקצרו בין פינים.</span></div>` : ''}
      ${vnote ? `<div class="note info">${ICON.info}<span>${T(vnote)}</span></div>` : ''}
      <div class="sec"><h4>כלים נדרשים</h4><div class="tools">${s.tools.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
      <div class="sec"><h4>פעולה</h4><p>${T(s.action)}</p></div>
      <div class="sec" data-sx="s19"><h4>איך יודעים שזה נכון</h4><p class="verify">${T(s.verify)}</p></div>
      <div class="sec" data-sx="s20"><h4>טעות נפוצה</h4><p class="mistake">${T(s.mistake)}</p></div>
      ${s.legal ? `<div class="note warn">${ICON.warn}<span>${T(DATA.meta.legalNote)}</span></div>` : ''}
      <div class="card flat stack" data-sx="s21">
        <span data-sx="s17">מודגש במודל:</span>
        <div class="row"><button type="button" class="linkbtn" data-action="select-comp" data-comp="${s.comp}">${esc(compName(s.comp))}</button>
        ${b ? `<span class="conn-tag">${esc(b.label)} · ${esc(connName(b.connector))} ${esc(b.connector.pins)}P</span>` : s.bundle === 'all' ? '<span class="conn-tag">כל המחברים</span>' : ''}</div>
      </div>
      ${WizardPlus.stepExtra(scenario, idx, s)}
      <div class="navrow">
        <button type="button" class="btn" data-action="wz-go" data-i="${idx - 1}" ${idx === 0 ? 'disabled' : ''}>${ICON.prev} הקודם</button>
        <button type="button" class="btn primary" data-action="${last ? 'wz-done' : 'wz-go'}" data-i="${idx + 1}">${last ? 'סיום' : 'הבא'} ${last ? ICON.ok : ICON.next}</button>
      </div>`;
  }
  function doneHTML() {
    const sc = DATA.wizard.scenarios[scenario];
    return `
      <div><p class="eyebrow">${ICON.ok} סיום</p><h2>${esc(sc.name)} – הושלם</h2></div>
      <div class="note ok">${ICON.ok}<span>עברתם את כל ${steps().length} השלבים. לפני רכיבה ראשונה: נסיעה איטית במקום פתוח, ובדיקה חוזרת של הבלמים.</span></div>
      <div class="card stack"><h3>צ׳קליסט אחרון</h3><ul class="bul">
        <li>כל המחברים נעולים ומבודדים</li><li>הכבלים מסודרים ולא נמתחים בסיבוב הכידון</li>
        <li>שתי ידיות הבלם מנתקות את ההנעה</li><li>אין קוד שגיאה בצג, והבקר לא מתחמם בסרק</li></ul></div>
      <div class="note warn">${ICON.warn}<span>${T(DATA.meta.legalNote)}</span></div>
      <div class="navrow"><button type="button" class="btn" data-action="wz-exit">התקנה חדשה</button><button type="button" class="btn primary" data-action="goto-diag">עבור לאבחון</button></div>`;
  }
  function highlight(focus = true) {
    if (phase === 'steps') {
      const s = steps()[idx];
      Scene.select(s.comp, focus);
      Scene.highlightBundle(s.bundle || null);
    } else if (phase === 'setup') {
      Scene.select(DATA.wizard.scenarios[scenario] ? DATA.wizard.scenarios[scenario].comp : null, focus);
      Scene.highlightBundle(null);
    } else { Scene.select(null); Scene.highlightBundle(null); }
  }
  function bindSetup() {
    const mv = $('#modeView');
    mv.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => {
      if (r.name === 'wzV') State.voltage = Number(r.value);
      if (r.name === 'wzC') State.ctrl = r.value;
      if (r.name === 'wzS') scenario = r.value;
      Store.save();
      const id = r.id; render(); const again = document.getElementById(id); if (again) again.focus();
    }));
    Safety.bindChecks($('#wzChecks'));
    $('#wzModel').addEventListener('change', e => UI.setModel(e.target.value));
  }
  function render() {
    $('#modeView').innerHTML = phase === 'setup' ? setupHTML() : phase === 'steps' ? stepHTML() : doneHTML();
    if (phase === 'setup') bindSetup();
    if (phase === 'steps') WizardPlus.bindStep(scenario, idx, steps()[idx]);
    highlight();
  }
  UI.on('wz-start', () => { WizardPlus.reset(); phase = 'steps'; idx = 0; render(); $('#panelScroll').scrollTop = 0; UI.openSheet('half'); const t = $('#wzTitle'); if (t && !UI.isMobile()) t.focus({ preventScroll: true }); });
  UI.on('wz-go', el => { idx = clamp(Number(el.dataset.i), 0, steps().length - 1); render(); $('#panelScroll').scrollTop = 0; const t = $('#wzTitle'); if (t && !UI.isMobile()) t.focus({ preventScroll: true }); });
  UI.on('wz-done', () => { phase = 'done'; render(); $('#panelScroll').scrollTop = 0; Scene.resetCamera(); });
  UI.on('wz-exit', () => { phase = 'setup'; idx = 0; render(); $('#panelScroll').scrollTop = 0; });
  return {
    render, restore: () => highlight(true),
    onVehicle() { if (!available().includes(scenario)) scenario = available()[0]; if (phase !== 'setup') { phase = 'setup'; idx = 0; } },
    abort() { if (phase !== 'setup') { phase = 'setup'; idx = 0; if (State.mode === 'wizard') render(); } }
  };
})();

/* ===================== Diagnostics (אבחון תקלות) ===================== */
const Diagnostics = (() => {
  let sub = 'adv', symId = null, nodeId = null, leafId = null, trail = [], brand = 'all', query = '';
  const sym = () => DATA.diagnostics.symptoms.find(s => s.id === symId);

  function subtabs() {
    return DiagPro.subtabs(sub);
  }
  function voltSelect() {
    return `<div class="field"><label for="dgV">מתח הסוללה שלכם (לחישוב ערכים צפויים)</label>
      <select class="input" id="dgV">${DATA.batteryTable.map(b => `<option value="${b.nominal}" ${b.nominal === State.voltage ? 'selected' : ''}>${b.nominal}V · מלאה ${b.full.toFixed(1)}V · ריקה ≈${b.empty.toFixed(1)}V</option>`).join('')}</select></div>`;
  }
  function listHTML() {
    return `
      <div class="card stack" data-sx="s16">
        <h3>לפני הכול: יש סימן סכנה?</h3>
        <div class="checks" id="dgChecks">${Safety.checksHTML('dg')}</div>
      </div>
      ${voltSelect()}
      <div class="stack"><h3>מה הבעיה?</h3>
        <div class="sym-grid">${DATA.diagnostics.symptoms.filter(s => !s.requires || s.requires.every(c => vehicleComps().includes(c))).map(s => `<button type="button" class="sym" data-action="dg-start" data-sym="${s.id}"><span class="g" aria-hidden="true">${esc(s.glyph)}</span><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></button>`).join('')}</div>
      </div>
      <div class="note info">${ICON.info}<span>כל מדידה עם הסימן ${Safety.liveBadge()} נעשית כשהמערכת מחוברת לסוללה. חוד אחד בכל פעם, בלי לקצר בין פינים.</span></div>`;
  }
  function meterHTML(n) {
    return `<div class="meter" aria-label="הוראות מדידה במולטימטר">
      <div class="mhead"><span>מולטימטר – טווח</span><span class="mode">${esc(n.meter.mode)}</span></div>
      <div class="probe"><i class="r" aria-hidden="true"></i><span><b>חוד אדום:</b> ${esc(n.meter.red)}</span></div>
      <div class="probe"><i class="k" aria-hidden="true"></i><span><b>חוד שחור:</b> ${esc(n.meter.black)}</span></div>
      <div class="mhead"><span>ערך תקין צפוי</span></div>
      <div class="lcd num">${T(n.expect)}</div>
    </div>`;
  }
  function nodeHTML() {
    const s = sym(), n = s.nodes[nodeId];
    const compOK = vehicleComps().includes(n.comp);
    return `
      <div class="spread"><p class="eyebrow">${esc(s.glyph)} ${esc(s.name)}</p><span class="num" data-sx="s17">שאלה ${trail.length + 1}</span></div>
      <div class="card stack" aria-live="polite">
        <div class="row">${n.live ? Safety.liveBadge() : ''}</div>
        <h2 id="dgQ" tabindex="-1" data-sx="s22">${T(n.q)}</h2>
        <div class="sec"><h4>מה בודקים ואיפה</h4><p>${T(n.where)}${compOK ? ` · <button type="button" class="linkbtn" data-action="select-comp" data-comp="${n.comp}">${esc(compName(n.comp))}</button>` : ''}</p></div>
        ${n.meter ? meterHTML(n) : (n.expect && n.expect !== '—' ? `<div class="sec" data-sx="s19"><h4>מה אמורים לראות</h4><p class="verify">${T(n.expect)}</p></div>` : '')}
        ${n.hazardYes ? `<div class="note danger">${ICON.warn}<span>תשובה ״כן״ כאן עוצרת את העבודה מטעמי בטיחות.</span></div>` : ''}
      </div>
      <div class="answer">
        <button type="button" class="btn yes" data-action="dg-ans" data-a="yes">${esc(n.yesLabel || 'כן')}</button>
        <button type="button" class="btn no" data-action="dg-ans" data-a="no">${esc(n.noLabel || 'לא')}</button>
      </div>
      <div class="row"><button type="button" class="btn sm ghost" data-action="dg-back">${ICON.prev} צעד אחורה</button><button type="button" class="btn sm ghost" data-action="dg-reset">אבחון חדש</button></div>
      ${trailHTML()}`;
  }
  function trailHTML() {
    if (!trail.length) return '';
    return `<div class="card flat stack" data-sx="s21"><h4 data-sx="s17">המסלול עד כאן</h4>
      <ol class="trail" data-sx="s23">${trail.map(t => `<li><span>${T(t.q)} ← <b>${esc(t.a)}</b></span></li>`).join('')}</ol></div>`;
  }
  function leafHTML() {
    const s = sym(), L = s.leaves[leafId];
    const causes = L.causes.slice().sort((a, b) => b.p - a.p);
    const diffLbl = DATA.diagnostics.difficulty[String(L.diff)];
    const tech = L.tech || L.diff >= 3;
    const jump = L.jump && DATA.diagnostics.symptoms.find(x => x.id === L.jump);
    return `
      <div><p class="eyebrow">${ICON.ok} סיכום האבחון · ${esc(s.name)}</p><h2 id="dgQ" tabindex="-1">${esc(L.title)}</h2></div>
      <div class="note ${tech ? 'warn' : 'ok'}">${tech ? ICON.warn : ICON.ok}<span><b>המסקנה והפעולה:</b> ${T(L.text)}</span></div>
      <div class="card stack"><h3>סיבות אפשריות לפי סבירות</h3>
        ${causes.map(c => `<div class="cause"><div class="spread"><b data-sx="s24">${T(c.t)}</b><span>${c.p}%</span></div><div class="bar" role="img" aria-label="${c.p} אחוז"><i data-sw="${c.p}"></i></div></div>`).join('')}
      </div>
      <div class="card stack">
        <div class="spread"><h3>רמת קושי לתיקון</h3><div class="diff d${L.diff}" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= L.diff ? 'on' : ''}"></i>`).join('')}</div></div>
        <p>${T(diffLbl)}</p>
        <div class="spread"><h3>לפנות לטכנאי?</h3><span class="live${tech ? '' : ' live-ok'}">${tech ? ICON.tech + ' כן, מומלץ' : ICON.ok + ' לא חובה'}</span></div>
        <p class="lead" data-sx="s0">${tech ? 'התיקון דורש ציוד, ניסיון או פתיחת רכיב. טכנאי יחסוך זמן ויגן עליכם.' : 'אפשר לטפל לבד בזהירות, עם הסוללה מנותקת בזמן העבודה.'}</p>
      </div>
      ${L.codes ? `<button type="button" class="btn block" data-action="dg-sub" data-sub="codes">פתח מאגר קודים</button>` : ''}
      ${jump ? `<button type="button" class="btn block" data-action="dg-start" data-sym="${jump.id}">המשך לעץ: ${esc(jump.name)} ${ICON.next}</button>` : ''}
      ${trailHTML()}
      <div class="navrow"><button type="button" class="btn" data-action="dg-back">${ICON.prev} צעד אחורה</button><button type="button" class="btn primary" data-action="dg-reset">אבחון חדש</button></div>
      <p class="foot">${esc(DATA.meta.disclaimer)}</p>`;
  }
  function codesHTML() {
    return `${DiagPro.modelCodesCard()}
      <div class="field"><label for="codeSearch">חיפוש לפי קוד או תיאור</label>
        <input class="input" id="codeSearch" type="search" placeholder="למשל 24, Hall, בלם" value="${esc(query)}" autocomplete="off"></div>
      <div class="row" role="group" aria-label="סינון לפי יצרן">
        <button type="button" class="chip" data-sx="s4" data-action="dg-brand" data-b="all" aria-pressed="${brand === 'all'}"><i></i>הכול</button>
        ${DATA.errorCodes.brands.map(b => `<button type="button" class="chip" data-sx="s4" data-action="dg-brand" data-b="${b.id}" aria-pressed="${brand === b.id}"><i></i>${esc(b.name)}</button>`).join('')}
      </div>
      <div class="note warn">${ICON.warn}<span>${esc(DATA.errorCodes.note)}</span></div>
      <div class="stack" id="codeList" aria-live="polite"></div>`;
  }
  function renderCodeList() {
    const q = query.trim().toLowerCase();
    const list = DATA.errorCodes.codes.filter(c => (brand === 'all' || c.b === brand) &&
      (!q || c.c.includes(q) || c.c.replace(/^0/, '') === q.replace(/^0/, '') || (c.t + ' ' + c.d + ' ' + c.fix + ' ' + c.b).toLowerCase().includes(q)));
    $('#codeList').innerHTML = list.length ? list.map(c => `
      <div class="code-row">
        <span class="code">${esc(c.c)}</span>
        <span class="brand-tag">${esc((DATA.errorCodes.brands.find(b => b.id === c.b) || { name: c.b }).name)} ${DiagPro.codeConf(c)}</span>
        <b>${T(c.t)}</b>
        <p>${T(c.d)} <span data-sx="s3">${T(c.fix)}</span></p>
        ${vehicleComps().includes(c.comp) ? `<button type="button" class="linkbtn" data-action="select-comp" data-comp="${c.comp}" data-sx="s25">הצג: ${esc(compName(c.comp))}</button>` : ''}
      </div>`).join('') : `<p class="lead">לא נמצא קוד. נסו חיפוש אחר, או בדקו במדריך של הצג.</p>`;
  }
  function highlight(focus = true) {
    if (DiagPro.handles(sub)) { DiagPro.highlight(focus); return; }
    if (sub === 'sym' && symId) {
      const s = sym();
      const n = leafId ? (trail.length ? s.nodes[trail[trail.length - 1].id] : null) : s.nodes[nodeId];
      if (n && vehicleComps().includes(n.comp)) { Scene.select(n.comp, focus); Scene.highlightBundle(n.bundle || null); return; }
    }
    Scene.select(null); Scene.highlightBundle(null);
  }
  function render() {
    let body;
    if (DiagPro.handles(sub)) body = DiagPro.html(sub);
    else if (sub === 'codes') body = codesHTML();
    else if (!symId) body = listHTML();
    else if (leafId) body = leafHTML();
    else body = nodeHTML();
    $('#modeView').innerHTML = `
      ${(!symId || sub !== 'sym') ? `<div><p class="eyebrow">${ICON.bolt} אבחון תקלות · <bdi>${esc(M().short)}</bdi></p><h2>מה לא עובד?</h2></div>` : ''}
      ${subtabs()}<div class="stack">${body}</div>`;
    if (DiagPro.handles(sub)) { DiagPro.bind(sub); } else if (sub === 'codes') {
      const inp = $('#codeSearch');
      inp.addEventListener('input', () => { query = inp.value; renderCodeList(); });
      renderCodeList();
    } else if (!symId) {
      Safety.bindChecks($('#dgChecks'));
      $('#dgV').addEventListener('change', e => { State.voltage = Number(e.target.value); Store.save(); });
    }
    highlight();
  }
  function focusQ() { $('#panelScroll').scrollTop = 0; const q = $('#dgQ'); if (q && !UI.isMobile()) q.focus({ preventScroll: true }); }
  function reset() { symId = null; nodeId = null; leafId = null; trail = []; }
  UI.on('dg-sub', el => { sub = el.dataset.sub; if (sub === 'codes') { /* שומרים את מצב העץ */ } render(); });
  UI.on('dg-start', el => { reset(); sub = 'sym'; symId = el.dataset.sym; nodeId = sym().start; render(); focusQ(); UI.openSheet('half'); });
  UI.on('dg-ans', el => {
    const s = sym(), n = s.nodes[nodeId], yes = el.dataset.a === 'yes';
    const target = yes ? n.yes : n.no;
    if (target === 'HAZARD') { Safety.trigger(n.hazardYes || 'smell'); return; }
    trail.push({ id: nodeId, q: n.q, a: yes ? (n.yesLabel || 'כן') : (n.noLabel || 'לא') });
    if (s.leaves[target]) leafId = target; else nodeId = target;
    render(); focusQ();
  });
  UI.on('dg-back', () => {
    if (leafId) { leafId = null; const t = trail.pop(); if (t) nodeId = t.id; }
    else if (trail.length) { const t = trail.pop(); nodeId = t.id; }
    else reset();
    render(); focusQ();
  });
  UI.on('dg-reset', () => { reset(); render(); focusQ(); });
  UI.on('dg-brand', el => { brand = el.dataset.b; $$('[data-action="dg-brand"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.b === brand))); renderCodeList(); });
  return { render, restore: () => highlight(true), onVehicle() { reset(); DiagPro.reset(); }, abort() { if (symId) { reset(); if (State.mode === 'diag') render(); } } };
})();

/* ===================== App ===================== */
function bootBase() {
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';
  Store.apply(Store.load());
  Safety.init();
  UI.init();
  UI.setMode(State.mode, true);
  Perf.boot3D();
}
