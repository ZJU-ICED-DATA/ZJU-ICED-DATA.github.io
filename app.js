/* =========================================================================
   app.js — ZJU-ICED 催化剂 DFT 数据库 前端应用
   -------------------------------------------------------------------------
   · 数据：data.js 正式条目 + 浏览器本地草稿（上传产生）
   · 文案：content.js，可在「内容管理」页面修改并导出
   · 计算：上传的 CIF 在本地解析结构，OUTCAR 在本地解析总能
   ========================================================================= */
(function () {
  'use strict';

  /* ============================ 基础工具 ============================ */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numText(v, digits) { return isNum(v) ? v.toFixed(digits === undefined ? 2 : digits) : '—'; }
  function fmtCount(n) { return isNum(n) ? String(n) : ''; }

  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  function subscript(n) { return String(n).split('').map(function (c) { return SUB[c] || c; }).join(''); }

  function deepClone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }

  function deepMerge(base, over) {
    if (!over || typeof over !== 'object') return base;
    Object.keys(over).forEach(function (k) {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        base[k] = deepMerge(base[k], v);
      } else {
        base[k] = v;
      }
    });
    return base;
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /* ============================ 口令校验 ============================ */
  const AUTH = window.SITE_AUTH || {};
  const AUTH_KEY = 'iced-db:auth:v1';
  const MAX_FAILS = AUTH.maxFails || 5;
  const LOCK_MS = AUTH.lockMs || 30000;

  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      } else if (code >= 0xd800 && code < 0xdc00 && i + 1 < str.length) {
        const next = str.charCodeAt(++i);
        const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      }
    }
    return out;
  }

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256Hex(str) {
    const bytes = utf8Bytes(String(str));
    const bitLen = bytes.length * 8;
    const buf = bytes.slice();
    buf.push(0x80);
    while (buf.length % 64 !== 56) buf.push(0);
    const hi = Math.floor(bitLen / 4294967296);
    const lo = bitLen >>> 0;
    buf.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    buf.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Array(64);

    for (let i = 0; i < buf.length; i += 64) {
      for (let j = 0; j < 16; j++) {
        w[j] = ((buf[i + j * 4] << 24) | (buf[i + j * 4 + 1] << 16) | (buf[i + j * 4 + 2] << 8) | buf[i + j * 4 + 3]) | 0;
      }
      for (let j = 16; j < 64; j++) {
        const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
      for (let j = 0; j < 64; j++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + SHA256_K[j] + w[j]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + hh) | 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(function (x) {
      return ('00000000' + (x >>> 0).toString(16)).slice(-8);
    }).join('');
  }

  function authHash(input) {
    return sha256Hex(String(AUTH.salt || '') + ':' + String(input || ''));
  }

  function isAuthed() {
    try { return sessionStorage.getItem(AUTH_KEY) === 'ok'; } catch (e) { return false; }
  }
  function setAuthed() {
    try { sessionStorage.setItem(AUTH_KEY, 'ok'); } catch (e) { /* 忽略 */ }
  }
  function clearAuth() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* 忽略 */ }
  }

  let loginFails = 0;
  let loginLockUntil = 0;

  /* ============================ 上传权限 ============================ */
  /* 默认账号在 auth.js 的 SITE_AUTH.upload；在「内容管理 → 上传权限」改过后，
     覆盖值存 localStorage，优先于默认。 */
  const UPLOAD_AUTH_KEY = 'iced-db:uploadauth:v1';
  const UPLOAD_OK_KEY = 'iced-db:upload-ok:v1';

  function defaultUploadAuth() {
    return (AUTH && AUTH.upload) || { username: 'Admin', salt: '', hash: '' };
  }

  function getUploadAuth() {
    const base = defaultUploadAuth();
    try {
      const raw = localStorage.getItem(UPLOAD_AUTH_KEY);
      const o = raw ? JSON.parse(raw) : null;
      if (o && o.user && o.hash) {
        return { username: o.user, salt: o.salt, hash: o.hash, maxFails: base.maxFails || 5, lockMs: base.lockMs || 30000, custom: true };
      }
    } catch (e) { /* 忽略 */ }
    return { username: base.username, salt: base.salt, hash: base.hash, maxFails: base.maxFails || 5, lockMs: base.lockMs || 30000, custom: false };
  }

  function saveUploadAuth(user, pass) {
    const cur = getUploadAuth();
    const salt = pass ? ('u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)) : cur.salt;
    const hash = pass ? sha256Hex(salt + ':' + pass) : cur.hash;
    try {
      localStorage.setItem(UPLOAD_AUTH_KEY, JSON.stringify({ user: user, salt: salt, hash: hash }));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，设置未保存');
      return false;
    }
  }

  function resetUploadAuth() {
    try { localStorage.removeItem(UPLOAD_AUTH_KEY); } catch (e) { /* 忽略 */ }
  }

  function isUploadAuthed() {
    try { return sessionStorage.getItem(UPLOAD_OK_KEY) === 'ok'; } catch (e) { return false; }
  }
  function setUploadAuthed() {
    try { sessionStorage.setItem(UPLOAD_OK_KEY, 'ok'); } catch (e) { /* 忽略 */ }
  }
  function clearUploadAuthed() {
    try { sessionStorage.removeItem(UPLOAD_OK_KEY); } catch (e) { /* 忽略 */ }
  }

  let uploadFails = 0;
  let uploadLockUntil = 0;

  /* ============================ 发布配置 ============================ */
  /* Worker 地址与发布密钥只存在本机浏览器；GitHub 令牌保存在 Worker 服务端 */
  const PUBLISH_STORE = 'iced-db:publish:v1';

  function loadPublish() {
    try {
      const raw = localStorage.getItem(PUBLISH_STORE);
      const cfg = raw ? JSON.parse(raw) : null;
      return cfg && cfg.url && cfg.key ? cfg : null;
    } catch (e) { return null; }
  }

  function savePublish(cfg) {
    try {
      localStorage.setItem(PUBLISH_STORE, JSON.stringify(cfg));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，发布设置未保存');
      return false;
    }
  }

  function publishBase(cfg) {
    return String(cfg.url || '').replace(/\/+$/, '');
  }

  async function publishHealth(cfg) {
    const res = await fetch(publishBase(cfg) + '/api/health', {
      headers: { 'Authorization': 'Bearer ' + cfg.key }
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  async function publishRecords(records, message) {
    const cfg = loadPublish();
    if (!cfg) throw new Error('未配置发布地址');
    const res = await fetch(publishBase(cfg) + '/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify({ records: records, message: message })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  /* 提交到仓库；成功后把记录并入内存数据，当前页面立刻可见 */
  async function publishFromUpload(records) {
    if (!records || !records.length) return false;
    try {
      showToast('正在提交到仓库…');
      const payload = records.map(stripForExport);
      const res = await publishRecords(payload, '新增 ' + records.length + ' 条催化剂记录（网页上传）');
      if (Array.isArray(window.CATALYST_DATA)) {
        window.CATALYST_DATA = window.CATALYST_DATA.concat(records);
      }
      const added = (res && res.added) || records.length;
      const skipped = (res && res.skipped) || 0;
      showToast('已提交 ' + added + ' 条' + (skipped ? '（跳过已存在 ' + skipped + ' 条）' : '') +
        '；GitHub Pages 重建约需 1 分钟，之后刷新即可全站可见');
      render();
      return true;
    } catch (e) {
      showToast('发布失败：' + e.message);
      return false;
    }
  }

  /* ============================ 常量 ============================ */
  const DRAFT_KEY = 'iced-db:drafts:v1';
  const CONTENT_KEY = 'iced-db:content:v1';
  const PAGE_SIZE = 10;
  const PALETTE = ['#2b7ac4', '#e8710a', '#31a354', '#7b5ea7', '#d64550', '#00a3b5', '#b5921a', '#8a5a44'];
  const HAS_ECHARTS = typeof echarts !== 'undefined';
  const HAS_3DMOL = typeof $3Dmol !== 'undefined';
  const REACTIONS = Array.isArray(window.REACTIONS) ? window.REACTIONS : [];
  const DFT_KEYS = ['barrier', 'eads', 'reactionEnergy', 'dftEnergy', 'evac'];
  const NUMERIC_KEYS = { barrier: 1, eads: 1, reactionEnergy: 1, dftEnergy: 1, evac: 1, totalAtoms: 1 };

  /* ============================ 内容层 ============================ */
  const BASE_CONTENT = (window.SITE_CONTENT && typeof window.SITE_CONTENT === 'object') ? window.SITE_CONTENT : {};

  let C = deepClone(BASE_CONTENT);

  function loadContentOverlay() {
    try {
      const raw = localStorage.getItem(CONTENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function effectiveContent() {
    return deepMerge(deepClone(BASE_CONTENT), loadContentOverlay() || {});
  }

  function saveContent(next) {
    try {
      localStorage.setItem(CONTENT_KEY, JSON.stringify(next));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，内容未能保存');
      return false;
    }
  }

  function clearContent() {
    try { localStorage.removeItem(CONTENT_KEY); } catch (e) { /* 忽略 */ }
  }

  function hasLocalContent() {
    try { return !!localStorage.getItem(CONTENT_KEY); } catch (e) { return false; }
  }

  function cget(path, fallback) {
    const parts = String(path).split('.');
    let cur = C;
    for (let i = 0; i < parts.length; i++) {
      if (cur === undefined || cur === null) return fallback;
      cur = cur[parts[i]];
    }
    return cur === undefined || cur === null ? fallback : cur;
  }

  function reactionText(r) {
    const all = C.reactions || {};
    return all[r.id] || {};
  }

  function descriptor(key) {
    const all = C.descriptors || {};
    return all[key] || { label: key, unit: '', desc: '' };
  }

  /* ============================ 数据层 ============================ */
  function loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveDrafts(list) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，草稿未能保存');
      return false;
    }
  }

  function curated() { return Array.isArray(window.CATALYST_DATA) ? window.CATALYST_DATA : []; }
  function allRecords() { return loadDrafts().concat(curated()); }

  /* 「小分子」与「催化剂」共用同一个数据文件，用 kind 区分 */
  function isMolecule(d) { return !!d && d.kind === 'molecule'; }
  function moleculeRows() { return allRecords().filter(isMolecule); }
  function catalystRecords() { return allRecords().filter(function (d) { return !isMolecule(d); }); }

  /* GitHub Pages 给 data.js 设了 10 分钟缓存，普通刷新可能拿到旧数据。
     这里绕过缓存重新拉一次，只有内容真的变了才重渲染。 */
  async function refreshDataFromNetwork(options) {
    const opts = options || {};
    try {
      const res = await fetch('data.js?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return false;
      const text = await res.text();
      if (text.indexOf('CATALYST_DATA') < 0) return false;

      let parsed;
      try {
        parsed = new Function('window', text + '\nreturn window.CATALYST_DATA;')({});
      } catch (e) {
        return false;
      }
      if (!Array.isArray(parsed)) return false;

      const before = JSON.stringify(window.CATALYST_DATA || []);
      if (JSON.stringify(parsed) === before) return false;

      window.CATALYST_DATA = parsed;
      if (opts.rerender !== false) render();
      return true;
    } catch (e) {
      return false;
    }
  }

  function reactionById(id) {
    for (let i = 0; i < REACTIONS.length; i++) if (REACTIONS[i].id === id) return REACTIONS[i];
    return null;
  }

  function structureOf(d) { return d && d.structure ? d.structure : null; }

  /* 一条记录归属于某个「催化剂」，一个催化剂可以包含多个结构。
     老数据没有 catalyst 字段时，退回用结构名称（formula）当催化剂名。 */
  function catalystOf(d) {
    if (!d) return '未命名';
    return d.catalyst || d.formula || ('未命名结构');
  }

  function catalystNames() {
    const set = {};
    allRecords().forEach(function (d) {
      const c = catalystOf(d);
      if (c && c !== '未命名结构') set[c] = 1;
    });
    return Object.keys(set).sort();
  }

  function catalystDatalist(id) {
    return '<datalist id="' + esc(id) + '">' + catalystNames().map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    }).join('') + '</datalist>';
  }

  function distinctCatalystCount(rows) {
    const set = {};
    rows.forEach(function (d) { set[catalystOf(d)] = 1; });
    return Object.keys(set).length;
  }

  /* ---------- 结构坐标 ----------
     发布时只保留坐标数组（比分整份 CIF 小很多），详情页用它现场重建 3D。 */
  function round4(v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : v; }

  function compactStructure(st) {
    const info = (st && st.info) || {};
    const raw = info.atoms || [];
    const coord = st && st.kind === 'poscar' ? 'cart' : 'frac';
    const atoms = [];
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i];
      const x = round4(a.x), y = round4(a.y), z = round4(a.z);
      if (!a.symbol || !isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      atoms.push([a.symbol, x, y, z]);
    }
    return { atoms: atoms, coord: coord };
  }

  /* 把记录里的结构还原成 3Dmol 能读的文本（保留晶胞参数，便于画出晶胞盒） */
  function cifFromAtoms(atoms, s) {
    const c = s.cell || {};
    const g = function (v, d) { return isFinite(v) && v ? v : d; };
    const out = [
      'data_' + String(s.file || 'structure').replace(/[^A-Za-z0-9_]+/g, '_'),
      '_cell_length_a    ' + g(c.a, 1),
      '_cell_length_b    ' + g(c.b, 1),
      '_cell_length_c    ' + g(c.c, 1),
      '_cell_angle_alpha ' + g(c.alpha, 90),
      '_cell_angle_beta  ' + g(c.beta, 90),
      '_cell_angle_gamma ' + g(c.gamma, 90),
      "_symmetry_space_group_name_H-M   'P 1'",
      'loop_',
      '_atom_site_label',
      '_atom_site_type_symbol',
      '_atom_site_fract_x',
      '_atom_site_fract_y',
      '_atom_site_fract_z'
    ];
    const seen = {};
    atoms.forEach(function (a) {
      seen[a[0]] = (seen[a[0]] || 0) + 1;
      out.push(a[0] + seen[a[0]] + ' ' + a[0] + ' ' + a[1] + ' ' + a[2] + ' ' + a[3]);
    });
    return out.join('\n') + '\n';
  }

  /* 晶胞参数 → 分数坐标基矢矩阵（行向量 a/b/c，与 VASP 约定一致） */
  function cellMatrix(cell) {
    if (!cell) return null;
    const a = cell.a, b = cell.b, c = cell.c;
    if (![a, b, c].every(function (v) { return isFinite(v) && v > 0; })) return null;

    const d2r = Math.PI / 180;
    const al = (isFinite(cell.alpha) ? cell.alpha : 90) * d2r;
    const be = (isFinite(cell.beta) ? cell.beta : 90) * d2r;
    const ga = (isFinite(cell.gamma) ? cell.gamma : 90) * d2r;
    const cosG = Math.cos(ga), sinG = Math.sin(ga), cosB = Math.cos(be), cosA = Math.cos(al);
    if (!isFinite(sinG) || Math.abs(sinG) < 1e-8) return null;

    const cx = c * cosB;
    const cy = c * (cosA - cosB * cosG) / sinG;
    const cz2 = c * c - cx * cx - cy * cy;
    if (!(cz2 > 0)) return null;

    return [[a, 0, 0], [b * cosG, b * sinG, 0], [cx, cy, Math.sqrt(cz2)]];
  }

  /* 笛卡尔坐标 → 分数坐标（上三角方程组直接回代） */
  function cartToFrac(atoms, cell) {
    const m = cellMatrix(cell);
    if (!m || !atoms || !atoms.length) return null;
    const a = m[0][0], bx = m[1][0], by = m[1][1], cx = m[2][0], cy = m[2][1], cz = m[2][2];

    return atoms.map(function (row) {
      const fz = row[3] / cz;
      const fy = (row[2] - fz * cy) / by;
      const fx = (row[1] - fy * bx - fz * cx) / a;
      return [row[0], round4(fx), round4(fy), round4(fz)];
    });
  }

  function structureToText(s) {
    if (!s) return null;
    const atoms = s.atoms || [];

    if (atoms.length) {
      if (s.coord === 'cart') {
        const frac = cartToFrac(atoms, s.cell);
        if (frac) return { text: cifFromAtoms(frac, s), format: 'cif' };
        const lines = [String(atoms.length), String(s.formula || s.file || 'structure')];
        atoms.forEach(function (a) { lines.push(a[0] + ' ' + a[1] + ' ' + a[2] + ' ' + a[3]); });
        return { text: lines.join('\n') + '\n', format: 'xyz' };
      }
      return { text: cifFromAtoms(atoms, s), format: 'cif' };
    }

    if (s.cif) return { text: s.cif, format: s.format === 'poscar' ? 'poscar' : 'cif' };
    return null;
  }
  function outcarOf(d) { return d && d.outcar ? d.outcar : null; }
  function totalAtomsOf(d) { const s = structureOf(d); return s && isNum(s.totalAtoms) ? s.totalAtoms : null; }

  function compositionHtml(d) {
    const s = structureOf(d);
    if (!s || !s.atomCounts) return '<span class="muted">—</span>';
    const els = Object.keys(s.atomCounts);
    if (!els.length) return '<span class="muted">—</span>';
    const shown = els.slice(0, 5).map(function (el) {
      return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(s.atomCounts[el])) + '</sub></span>';
    });
    if (els.length > 5) shown.push('<span class="chip">+' + (els.length - 5) + '</span>');
    return shown.join('');
  }

  /* ============================ 统计 ============================ */
  function avgOf(rows, key) {
    let sum = 0, n = 0;
    rows.forEach(function (d) { if (isNum(d[key])) { sum += d[key]; n++; } });
    return n ? { avg: sum / n, n: n } : { avg: null, n: 0 };
  }

  function countByReaction(rows) {
    const m = {};
    REACTIONS.forEach(function (r) { m[r.id] = 0; });
    rows.forEach(function (d) {
      for (let i = 0; i < REACTIONS.length; i++) {
        if (REACTIONS[i].reaction === d.reaction) { m[REACTIONS[i].id]++; return; }
      }
    });
    return m;
  }

  function overallStats(rows) {
    const formulas = {};
    const catalysts = {};
    let energies = 0, structures = 0, outcars = 0;
    rows.forEach(function (d) {
      if (d.formula) formulas[d.formula] = 1;
      catalysts[catalystOf(d)] = 1;
      if (isNum(d.dftEnergy)) energies++;
      if (structureOf(d)) structures++;
      if (outcarOf(d)) outcars++;
    });
    return {
      total: rows.length,
      uniqueFormulas: Object.keys(formulas).length,
      catalysts: Object.keys(catalysts).length,
      energies: energies,
      structures: structures,
      outcars: outcars,
      barrier: avgOf(rows, 'barrier')
    };
  }

  /* ============================ 状态 / 路由 ============================ */
  const state = {
    view: 'dashboard',
    reactionId: null,
    search: '',
    metal: '',
    elements: [],
    elementMode: 'all',
    sortKey: 'id',
    sortDir: 'asc',
    page: 1
  };

  const chartRefs = {};
  let currentViewer = null;

  function parseHash() {
    const raw = (location.hash || '').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] === 'db' && parts[1]) return { view: 'reaction', reactionId: parts[1] };
    if (parts[0] === 'admin') {
      if (parts[1] === 'data') return { view: 'adminData', reactionId: null };
      return { view: 'admin', reactionId: null };
    }
    if (parts[0] === 'about') return { view: 'about', reactionId: null };
    if (parts[0] === 'whatwedo') return { view: 'whatWeDo', reactionId: null };
    if (parts[0] === 'molecules') return { view: 'molecules', reactionId: null };
    return { view: 'dashboard', reactionId: null };
  }

  function applyRoute() {
    const route = parseHash();
    const changed = route.view !== state.view || route.reactionId !== state.reactionId;
    if (changed) {
      state.page = 1;
      state.search = '';
      state.metal = '';
      state.sortKey = 'id';
      state.sortDir = 'asc';
    }
    state.view = route.view;
    state.reactionId = route.reactionId;
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ============================ 侧边栏 ============================ */
  function renderSidebar() {
    const nav = $('#sidebarNav');
    if (!nav) return;
    const rows = catalystRecords();
    const counts = countByReaction(rows);
    const drafts = loadDrafts();
    const parts = [];

    parts.push('<div class="nav-section">' + esc(cget('site.navWorkspace', '工作区')) + '</div>');
    parts.push(navItem('#/', '◧', cget('dashboard.title', '数据总览'), rows.length, state.view === 'dashboard'));
    parts.push(navItem('#/whatwedo', '◈', cget('whatWeDo.title', '我们做什么'), null, state.view === 'whatWeDo'));

    parts.push('<div class="nav-section">' + esc(cget('site.navReactions', '反应体系')) + '</div>');
    REACTIONS.forEach(function (r) {
      const t = reactionText(r);
      const name = t.name || r.id;
      const active = state.view === 'reaction' && state.reactionId === r.id;
      parts.push(
        '<a class="nav-item' + (active ? ' active' : '') + '" href="#/db/' + esc(r.id) + '">' +
        '<span class="ico">' + esc(r.icon || '◆') + '</span>' +
        '<span class="lbl">' + esc(name) + '</span>' +
        '<span class="nav-count">' + (counts[r.id] || 0) + '</span></a>'
      );
    });

    parts.push('<div class="nav-section">' + esc(cget('site.navMolecules', '小分子')) + '</div>');
    parts.push(navItem('#/molecules', '⬢', cget('molecules.title', '小分子性质'), moleculeRows().length, state.view === 'molecules'));

    nav.innerHTML = parts.join('');

    const status = $('#sidebarStatus');
    if (status) {
      status.innerHTML =
        '<div class="status-row"><span>本地草稿</span><b>' + drafts.length + '</b></div>' +
        '<div class="status-row"><span>数据来源</span><b>' + (hasLocalContent() ? '本地内容' : '静态站点') + '</b></div>';
    }

    /* 管理入口固定在左下角，与常规导航区分开 */
    const adminBox = $('#sidebarAdmin');
    if (adminBox) {
      const inAdmin = state.view === 'admin' || state.view === 'adminData';
      adminBox.innerHTML =
        '<a class="admin-link' + (state.view === 'about' ? ' active' : '') + '" href="#/about">' +
        '<span class="admin-ico">◉</span>' + esc(cget('site.navAbout', '关于我们')) + '</a>' +
        '<a class="admin-link' + (inAdmin ? ' active' : '') + '" href="#/admin">' +
        '<span class="admin-ico">⚙</span>' + esc(cget('site.navAdmin', '内容管理')) + '</a>';
    }
  }

  function navItem(href, icon, label, count, active) {
    return '<a class="nav-item' + (active ? ' active' : '') + '" href="' + href + '">' +
      '<span class="ico">' + esc(icon) + '</span>' +
      '<span class="lbl">' + esc(label) + '</span>' +
      (count === null ? '' : '<span class="nav-count">' + count + '</span>') + '</a>';
  }

  /* ============================ 图表 ============================ */
  function disposeCharts() {
    Object.keys(chartRefs).forEach(function (k) {
      if (chartRefs[k]) { try { chartRefs[k].dispose(); } catch (e) { /* 忽略 */ } }
      delete chartRefs[k];
    });
  }

  function initCharts() {
    disposeCharts();
    if (!HAS_ECHARTS) {
      $$('.chart-empty').forEach(function (el) { el.classList.add('show'); });
      return;
    }
    $$('.chart[data-chart]').forEach(function (el) {
      try { chartRefs[el.id] = echarts.init(el); } catch (e) { console.warn('图表初始化失败', el.id, e); }
    });
  }

  function toggleEmpty(id, isEmpty) {
    const el = document.getElementById(id + 'Empty');
    if (el) el.classList.toggle('show', !!isEmpty);
  }

  const AXIS_LABEL = { fontSize: 11, color: '#64748b' };
  const AXIS_NAME = { fontSize: 11.5, color: '#64748b' };

  function chartFrame(id, cls, label) {
    return '<div class="chart-box">' +
      '<div id="' + id + '" class="chart ' + cls + '" data-chart="1"></div>' +
      '<div class="chart-empty" id="' + id + 'Empty"><span>📊</span>' + esc(label || '暂无数据') + '</div>' +
      '</div>';
  }

  function dashboardCharts(rows) {
    const counts = countByReaction(rows);
    const named = REACTIONS.map(function (r) {
      const t = reactionText(r);
      return { id: r.id, name: t.name || r.id, value: counts[r.id] || 0, accent: r.accent };
    });

    /* 覆盖率：横向条形 */
    if (chartRefs.chartCoverage) {
      const sorted = named.slice().sort(function (a, b) { return a.value - b.value; });
      chartRefs.chartCoverage.setOption({
        grid: { left: 120, right: 60, top: 14, bottom: 24 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (p) { return p[0].name + '：' + p[0].value + ' 个体系'; } },
        xAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        yAxis: { type: 'category', data: sorted.map(function (x) { return x.name; }), axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: AXIS_LABEL },
        series: [{
          type: 'bar',
          data: sorted.map(function (x) { return { value: x.value, itemStyle: { color: x.accent || '#2b7ac4' } }; }),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', fontSize: 11, color: '#475569', formatter: '{c}' }
        }]
      }, true);
    }

    /* 描述符分布：按反应堆叠 */
    if (chartRefs.chartDesc) {
      const keys = DFT_KEYS;
      const byReaction = {};
      REACTIONS.forEach(function (r) { byReaction[r.reaction] = {}; keys.forEach(function (k) { byReaction[r.reaction][k] = 0; }); });
      rows.forEach(function (d) {
        if (!byReaction[d.reaction]) return;
        keys.forEach(function (k) { if (isNum(d[k])) byReaction[d.reaction][k]++; });
      });
      const series = REACTIONS.map(function (r, idx) {
        return {
          name: reactionText(r).name || r.id,
          type: 'bar',
          stack: 'total',
          barMaxWidth: 34,
          itemStyle: { color: PALETTE[idx % PALETTE.length] },
          data: keys.map(function (k) { return byReaction[r.reaction][k]; })
        };
      });
      chartRefs.chartDesc.setOption({
        color: PALETTE,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, itemWidth: 11, itemHeight: 11, textStyle: { fontSize: 11, color: '#64748b' } },
        grid: { left: 52, right: 20, top: 16, bottom: 46 },
        xAxis: { type: 'category', data: keys.map(function (k) { return descriptor(k).label; }), axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { fontSize: 10.5, color: '#64748b', interval: 0, rotate: 12 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: series
      }, true);
    }

    /* 结构模型分布：环形 */
    if (chartRefs.chartStruct) {
      const data = named.map(function (x) {
        const n = rows.filter(function (d) { return reactionById(x.id) && d.reaction === reactionById(x.id).reaction && structureOf(d); }).length;
        return { name: x.name, value: n };
      }).filter(function (x) { return x.value > 0; });
      chartRefs.chartStruct.setOption({
        color: PALETTE,
        tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 个 ({d}%)' },
        legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10.5, color: '#64748b' } },
        series: [{
          type: 'pie', radius: ['42%', '64%'], center: ['50%', '42%'],
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false }, labelLine: { show: false },
          data: data
        }]
      }, true);
    }

    toggleEmpty('chartCoverage', rows.length === 0);
    toggleEmpty('chartDesc', rows.length === 0);
    toggleEmpty('chartStruct', rows.filter(function (d) { return structureOf(d); }).length === 0);
  }

  function reactionCharts(rows) {
    const withStruct = rows.filter(function (d) { return structureOf(d); });

    /* 元素组成分布：包含该元素的结构数 */
    if (chartRefs.chartElements) {
      const freq = {};
      withStruct.forEach(function (d) {
        const s = structureOf(d);
        (s.elements || []).forEach(function (el) { freq[el] = (freq[el] || 0) + 1; });
      });
      const list = Object.keys(freq).map(function (k) { return { name: k, value: freq[k] }; })
        .sort(function (a, b) { return b.value - a.value; })
        .slice(0, 12);

      chartRefs.chartElements.setOption({
        tooltip: {
          trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: function (p) { return p[0].name + '：' + p[0].value + ' 个结构'; }
        },
        grid: { left: 48, right: 18, top: 20, bottom: 30 },
        xAxis: {
          type: 'category', data: list.map(function (x) { return x.name; }),
          axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: AXIS_LABEL
        },
        yAxis: {
          type: 'value', minInterval: 1,
          axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } }
        },
        series: [{
          type: 'bar',
          data: list.map(function (x) { return x.value; }),
          barMaxWidth: 26,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: '#2b7ac4' },
          label: { show: true, position: 'top', fontSize: 10, color: '#64748b' }
        }]
      }, true);
    }

    /* 结构规模分布：按原子数分箱 */
    if (chartRefs.chartAtoms) {
      const bins = [
        { label: '≤10', min: 0, max: 10 },
        { label: '11–20', min: 11, max: 20 },
        { label: '21–40', min: 21, max: 40 },
        { label: '41–80', min: 41, max: 80 },
        { label: '81–150', min: 81, max: 150 },
        { label: '151–300', min: 151, max: 300 },
        { label: '>300', min: 301, max: Infinity }
      ];
      const counts = bins.map(function () { return 0; });
      withStruct.forEach(function (d) {
        const n = totalAtomsOf(d);
        if (!isNum(n)) return;
        for (let i = 0; i < bins.length; i++) {
          if (n >= bins[i].min && n <= bins[i].max) { counts[i]++; break; }
        }
      });

      chartRefs.chartAtoms.setOption({
        tooltip: {
          trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: function (p) { return '原子数 ' + p[0].name + '：' + p[0].value + ' 个结构'; }
        },
        grid: { left: 48, right: 18, top: 20, bottom: 44 },
        xAxis: {
          type: 'category', data: bins.map(function (b) { return b.label; }),
          name: '每个结构的原子数', nameLocation: 'middle', nameGap: 26, nameTextStyle: AXIS_NAME,
          axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: AXIS_LABEL
        },
        yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: [{
          type: 'bar', data: counts, barMaxWidth: 34,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: '#31a354' }
        }]
      }, true);
    }

    toggleEmpty('chartElements', withStruct.length === 0);
    toggleEmpty('chartAtoms', withStruct.length === 0);
  }

  /* 结构概览卡片：直观展示"这个体系收录了多少结构" */
  function structureCardsHtml(rows, limit) {
    const withSt = rows.filter(function (d) { return structureOf(d); });
    if (!withSt.length) return '<div class="empty" style="padding:24px 0">该体系还没有解析出结构，上传 CIF 后会自动出现在这里。</div>';

    const shown = withSt.slice(0, limit || 18);
    const cards = shown.map(function (d) {
      const s = structureOf(d);
      const chips = (s.elements || []).slice(0, 6).map(function (el) {
        return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(s.atomCounts[el])) + '</sub></span>';
      }).join('');
      return '<div class="st-card" data-row-id="' + esc(d.id) + '">' +
        '<div class="st-name">' + esc(d.formula || '结构') + '</div>' +
        '<div class="st-cat">' + esc(catalystOf(d)) + '</div>' +
        '<div class="st-chips">' + chips + '</div>' +
        '<div class="st-meta"><span>' + (isNum(s.totalAtoms) ? s.totalAtoms : '—') + ' 原子</span>' +
        '<span>' + esc(d.metal || '—') + '</span></div>' +
        '</div>';
    }).join('');

    return '<div class="st-grid">' + cards + '</div>' +
      (withSt.length > shown.length
        ? '<div class="muted" style="text-align:center;font-size:12px;margin-top:10px">仅显示前 ' + shown.length +
          ' 个，共 ' + withSt.length + ' 个结构</div>'
        : '');
  }

  /* ============================ 表格 ============================ */
  function columnsForView() {
    return [
      { key: 'id', label: 'ID' },
      { key: 'catalyst', label: '催化剂', cls: 'formula', render: function (d) { return esc(catalystOf(d)); } },
      { key: 'formula', label: '结构', render: function (d) { return esc(d.formula || '—'); } },
      { key: 'metal', label: '金属', render: function (d) { return d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '<span class="muted">—</span>'; } },
      { key: 'support', label: '载体' },
      { key: 'reaction', label: '反应体系', render: function (d) {
        for (let i = 0; i < REACTIONS.length; i++) {
          if (REACTIONS[i].reaction === d.reaction) return esc(reactionText(REACTIONS[i]).name || REACTIONS[i].id);
        }
        return d.reaction ? esc(d.reaction) : '<span class="muted">—</span>';
      } },
      { key: 'structure', label: '元素组成', sortable: false, render: compositionHtml },
      { key: 'totalAtoms', label: '原子数', num: true, render: function (d) { return numText(totalAtomsOf(d), 0); } },
      { key: 'barrier', label: 'Ea (eV)', num: true, render: function (d) { return numText(d.barrier); } },
      { key: 'eads', label: 'Eads (eV)', num: true, render: function (d) { return numText(d.eads); } },
      { key: 'reactionEnergy', label: 'ΔE (eV)', num: true, render: function (d) { return numText(d.reactionEnergy); } },
      { key: 'dftEnergy', label: '总能 (eV)', num: true, render: function (d) { return isNum(d.dftEnergy) ? d.dftEnergy.toFixed(3) : '—'; } },
      { key: 'ref', label: '来源', render: function (d) { return d.ref ? esc(d.ref) : '<span class="muted">—</span>'; } }
    ];
  }

  function sortValue(d, key) {
    if (key === 'totalAtoms') { const t = totalAtomsOf(d); return isNum(t) ? t : -Infinity; }
    if (key === 'catalyst') return catalystOf(d);
    if (NUMERIC_KEYS[key]) return isNum(d[key]) ? d[key] : -Infinity;
    return String(d[key] === undefined || d[key] === null ? '' : d[key]);
  }

  function baseRows() {
    const all = allRecords().filter(function (d) { return !isMolecule(d); });
    if (state.view === 'reaction' && state.reactionId) {
      const r = reactionById(state.reactionId);
      if (!r) return [];
      return all.filter(function (d) { return d.reaction === r.reaction; });
    }
    return all;
  }

  function filteredRows() {
    const q = state.search.trim().toLowerCase();
    const rows = baseRows().filter(function (d) {
      if (state.metal && d.metal !== state.metal) return false;

      /* 元素组合筛选：默认要求包含全部所选元素 */
      if (state.elements.length) {
        const st = structureOf(d);
        const els = (st && Array.isArray(st.elements)) ? st.elements : [];
        const hit = state.elementMode === 'any'
          ? state.elements.some(function (x) { return els.indexOf(x) >= 0; })
          : state.elements.every(function (x) { return els.indexOf(x) >= 0; });
        if (!hit) return false;
      }

      if (q) {
        const s = structureOf(d);
        const hay = [
          d.id, d.formula, d.metal, d.support, d.reaction, d.ref, d.note,
          s ? s.file : '', s ? s.formula : '', s ? (s.elements || []).join(' ') : ''
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    const key = state.sortKey;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  function renderTable(rows) {
    const host = $('#tableHost');
    if (!host) return;
    const cols = columnsForView();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    const head = cols.map(function (c) {
      const sortable = c.sortable !== false;
      const active = state.sortKey === c.key;
      const arrow = active ? '<span class="arrow">' + (state.sortDir === 'asc' ? '▲' : '▼') + '</span>' : '';
      return '<th class="' + (sortable ? 'sortable' : '') + '" data-key="' + esc(c.key) + '">' + esc(c.label) + arrow + '</th>';
    }).join('');

    let body;
    if (!pageRows.length) {
      const msg = allRecords().length === 0
        ? '<b>还没有数据</b>' + esc(cget('dashboard.empty.noData', '上传 CIF 与 OUTCAR，建立第一条记录。'))
        : '<b>没有匹配的数据</b>' + esc(cget('dashboard.empty.noMatch', '试试调整搜索或筛选条件。'));
      body = '<tr><td class="empty" colspan="' + cols.length + '">' + msg + '</td></tr>';
    } else {
      body = pageRows.map(function (d, idx) {
        const cells = cols.map(function (c) {
          let val;
          if (c.key === 'formula') {
            val = esc(d.formula || '—') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '');
          } else if (c.render) {
            val = c.render(d);
          } else {
            val = esc(d[c.key] === undefined || d[c.key] === null ? '' : d[c.key]);
          }
          return '<td class="' + (c.num ? 'num' : '') + ' ' + (c.cls || '') + '">' + val + '</td>';
        }).join('');
        return '<tr data-row="' + (start + idx) + '">' + cells + '</tr>';
      }).join('');
    }

    host.innerHTML = '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';

    const info = $('#resultInfo');
    if (info) info.textContent = '共 ' + total + ' 条记录';
    const pageInfo = $('#pageInfo');
    if (pageInfo) pageInfo.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页';
    const prev = $('#prevBtn');
    const next = $('#nextBtn');
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;

    $$('#tableHost th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.getAttribute('data-key');
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'asc'; }
        refreshTable();
      });
    });

    $$('#tableHost tbody tr[data-row]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        const idx = parseInt(tr.getAttribute('data-row'), 10);
        openDrawer(rows[idx]);
      });
    });
  }

  function elementPickerHtml() {
    const n = state.elements.length;
    return '<div class="el-picker">' +
      '<button type="button" class="btn el-btn' + (n ? ' active' : '') + '" id="elBtn">元素' +
      (n ? ' · ' + n : '') + ' ▾</button>' +
      '<div class="el-pop" id="elPop" hidden>' +
      '<div class="el-pop-head">' +
      '<span class="el-pop-title">按元素筛选（可多选组合）</span>' +
      '<div class="el-mode">' +
      '<button type="button" data-emode="all" class="' + (state.elementMode === 'all' ? 'on' : '') + '">包含全部</button>' +
      '<button type="button" data-emode="any" class="' + (state.elementMode === 'any' ? 'on' : '') + '">包含任一</button>' +
      '</div>' +
      '<button type="button" class="btn btn-mini" id="elClear">清空</button>' +
      '</div>' +
      '<div class="ptable" id="ptable"></div>' +
      '<div class="el-pop-foot"><span id="elSummary" class="muted"></span></div>' +
      '</div></div>';
  }

  function renderPeriodicTable() {
    const host = $('#ptable');
    if (!host) return;
    const list = Array.isArray(window.ELEMENTS) ? window.ELEMENTS : [];
    const sel = {};
    state.elements.forEach(function (s) { sel[s] = true; });

    let html = list.map(function (el) {
      return '<button type="button" class="el" data-el="' + esc(el.s) + '"' +
        ' style="grid-row:' + el.p + ';grid-column:' + el.g + '"' +
        ' title="' + esc(el.s) + '"' +
        (sel[el.s] ? ' data-on="1"' : '') + '>' + esc(el.s) + '</button>';
    }).join('');

    /* 镧系 / 锕系的占位格 */
    html += '<div class="el-ph" style="grid-row:6;grid-column:3">57-71</div>';
    html += '<div class="el-ph" style="grid-row:7;grid-column:3">89-103</div>';

    host.innerHTML = html;

    const sum = $('#elSummary');
    if (sum) {
      sum.textContent = state.elements.length
        ? ('已选：' + state.elements.join(' + ') + '（' + (state.elementMode === 'all' ? '需全部包含' : '任一即可') + '）')
        : '未选择元素';
    }
  }

  function updateElButton() {
    const btn = $('#elBtn');
    if (!btn) return;
    const n = state.elements.length;
    btn.textContent = '元素' + (n ? ' · ' + n : '') + ' ▾';
    btn.classList.toggle('active', n > 0);
  }

  function bindElementPicker() {
    const btn = $('#elBtn');
    const pop = $('#elPop');
    if (!btn || !pop) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) renderPeriodicTable();
    });

    document.addEventListener('click', function closeEl(ev) {
      if (pop.hidden) return;
      if (pop.contains(ev.target) || ev.target === btn) return;
      pop.hidden = true;
      document.removeEventListener('click', closeEl);
    });

    const table = $('#ptable');
    if (table) {
      table.addEventListener('click', function (e) {
        const cell = e.target.closest('.el');
        if (!cell) return;
        const s = cell.getAttribute('data-el');
        const i = state.elements.indexOf(s);
        if (i >= 0) { state.elements.splice(i, 1); cell.removeAttribute('data-on'); }
        else { state.elements.push(s); cell.setAttribute('data-on', '1'); }
        state.page = 1;
        updateElButton();
        const sum = $('#elSummary');
        if (sum) {
          sum.textContent = state.elements.length
            ? ('已选：' + state.elements.join(' + ') + '（' + (state.elementMode === 'all' ? '需全部包含' : '任一即可') + '）')
            : '未选择元素';
        }
        refreshTable();
      });
    }

    $$('.el-mode [data-emode]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.elementMode = b.getAttribute('data-emode');
        $$('.el-mode [data-emode]').forEach(function (x) { x.classList.toggle('on', x === b); });
        state.page = 1;
        if (!pop.hidden) renderPeriodicTable();
        refreshTable();
      });
    });

    const clr = $('#elClear');
    if (clr) clr.addEventListener('click', function () {
      state.elements = [];
      state.page = 1;
      renderPeriodicTable();
      updateElButton();
      refreshTable();
    });

    renderPeriodicTable();
  }

  function filtersHtml() {
    const set = {};
    baseRows().forEach(function (d) { if (d.metal) set[d.metal] = 1; });
    const opts = Object.keys(set).sort().map(function (m) {
      return '<option value="' + esc(m) + '"' + (state.metal === m ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
    return '<div class="filters">' +
      '<input id="searchInput" type="search" placeholder="搜索化学式、元素、金属、载体、来源…" value="' + esc(state.search) + '" />' +
      elementPickerHtml() +
      '<select id="metalFilter"><option value="">全部金属</option>' + opts + '</select>' +
      '<button class="btn" id="resetBtn">重置</button>' +
      '</div>';
  }

  function tablePanel() {
    return '<div class="panel">' +
      '<div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.sections.table', '催化剂数据集')) + '</div>' +
      '<span class="muted" id="resultInfo">共 0 条记录</span></div>' +
      filtersHtml() +
      '<div class="table-wrap" id="tableHost"></div>' +
      '<div class="pagination"><span class="muted" id="pageInfo"></span>' +
      '<div class="btns"><button class="page-btn" id="prevBtn">上一页</button>' +
      '<button class="page-btn" id="nextBtn">下一页</button></div></div></div>';
  }

  function bindTableEvents() {
    const search = $('#searchInput');
    if (search) search.addEventListener('input', function (e) { state.search = e.target.value; state.page = 1; refreshTable(); });
    const metal = $('#metalFilter');
    if (metal) metal.addEventListener('change', function (e) { state.metal = e.target.value; state.page = 1; refreshTable(); });
    const reset = $('#resetBtn');
    if (reset) reset.addEventListener('click', function () {
      state.search = ''; state.metal = ''; state.elements = []; state.page = 1;
      const s = $('#searchInput'); if (s) s.value = '';
      const m = $('#metalFilter'); if (m) m.value = '';
      updateElButton();
      renderPeriodicTable();
      refreshTable();
    });
    const prev = $('#prevBtn');
    if (prev) prev.addEventListener('click', function () { if (state.page > 1) { state.page--; refreshTable(); } });
    const next = $('#nextBtn');
    if (next) next.addEventListener('click', function () {
      const totalPages = Math.max(1, Math.ceil(filteredRows().length / PAGE_SIZE));
      if (state.page < totalPages) { state.page++; refreshTable(); }
    });

    bindElementPicker();
  }

  function refreshTable() { renderTable(filteredRows()); }

  /* ============================ 视图：数据总览 ============================ */
  function kpiCard(value, label, sub, color, icon) {
    /* 防御：误传数组时取长度，避免界面出现 [object Object] */
    const v = Array.isArray(value) ? value.length : value;
    return '<div class="kpi" style="--kpi-color:' + (color || 'var(--primary)') + '">' +
      (icon ? '<div class="kpi-ico">' + icon + '</div>' : '') +
      '<div class="kpi-value">' + v + '</div>' +
      '<div class="kpi-label">' + esc(label) + '</div>' +
      (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderDashboard() {
    const rows = catalystRecords();
    const s = overallStats(rows);
    const kpi = cget('dashboard.kpi', {}) || {};

    const kpiHtml = '<div class="kpi-grid four">' +
      kpiCard(s.catalysts, (kpi.catalysts || {}).label || '催化剂体系', (kpi.catalysts || {}).sub || '', '#2b7ac4', '🧪') +
      kpiCard(s.energies, (kpi.energies || {}).label || 'DFT 总能', (kpi.energies || {}).sub || '', '#7b5ea7', '⚡') +
      kpiCard(s.structures, (kpi.structures || {}).label || '结构模型', (kpi.structures || {}).sub || '', '#31a354', '🧬') +
      kpiCard(isNum(s.barrier.avg) ? s.barrier.avg.toFixed(2) + ' eV' : '—', (kpi.barriers || {}).label || '平均能垒', (kpi.barriers || {}).sub ? (kpi.barriers || {}).sub + '（' + s.barrier.n + ' 条）' : '', '#e8710a', '📈') +
      '</div>';

    const src = cget('dashboard.sources', {}) || {};
    const sourcesHtml =
      '<div class="source-row"><span class="source-tag">' + esc((src.cif || {}).tag || 'STRUCTURE') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.cif || {}).name || 'CIF 结构文件') + '</div>' +
      '<div class="source-desc">' + esc((src.cif || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + s.structures + '</span></div>' +
      '<div class="source-row"><span class="source-tag">' + esc((src.outcar || {}).tag || 'ENERGY') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.outcar || {}).name || 'VASP OUTCAR') + '</div>' +
      '<div class="source-desc">' + esc((src.outcar || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + s.outcars + '</span></div>' +
      '<div class="source-row"><span class="source-tag">' + esc((src.data || {}).tag || 'CURATED') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.data || {}).name || 'data.js') + '</div>' +
      '<div class="source-desc">' + esc((src.data || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + curated().length + '</span></div>' +
      '<div class="source-row"><span class="source-tag">' + esc((src.draft || {}).tag || 'LOCAL') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.draft || {}).name || '本地草稿') + '</div>' +
      '<div class="source-desc">' + esc((src.draft || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + loadDrafts().length + '</span></div>';

    const counts = countByReaction(rows);
    const cards = REACTIONS.map(function (r) {
      const t = reactionText(r);
      const list = rows.filter(function (d) { return d.reaction === r.reaction; });
      const vals = list.filter(function (d) {
        return DFT_KEYS.some(function (k) { return isNum(d[k]); });
      }).length;
      const cats = distinctCatalystCount(list);
      return '<div class="ws-card" data-go="#/db/' + esc(r.id) + '">' +
        '<div class="ws-name"><span>' + esc(r.icon || '◆') + ' ' + esc(t.name || r.id) + '</span>' +
        '<span class="pill ' + (counts[r.id] ? 'pill-ok' : 'pill-idle') + '">' + (counts[r.id] ? '已入库' : '待录入') + '</span></div>' +
        '<div class="ws-en">' + esc(t.en || '') + '</div>' +
        '<div class="ws-stat"><span><b>' + cats + '</b> 催化剂</span>' +
        '<span><b>' + list.length + '</b> 结构</span>' +
        '<span><b>' + vals + '</b> DFT 数值</span></div>' +
        '</div>';
    }).join('');

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(cget('dashboard.title', '数据总览')) + '</h1>' +
      '<span class="pill pill-brand">' + esc(cget('dashboard.databaseName', 'C1 小分子活化数据库')) + '</span>' +
      '<span class="pill pill-ok">✓ ' + esc(cget('dashboard.badge', 'DFT 数据平台')) + '</span></div>' +
      '<p class="page-desc">' + esc(cget('dashboard.desc', '')) + '</p></div>' +
      kpiHtml +
      '<div class="charts-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.coverage', '各反应催化剂覆盖')) + '</div></div>' +
      '<div class="panel-body">' + chartFrame('chartCoverage', 'chart-md') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.descriptors', 'DFT 描述符分布')) + '</div></div>' +
      '<div class="panel-body">' + chartFrame('chartDesc', 'chart-md') + '</div></div>' +
      '</div>' +
      '<div class="charts-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.structures', '结构模型分布')) + '</div></div>' +
      '<div class="panel-body">' + chartFrame('chartStruct', 'chart-sm2') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.sources', '当前数据源')) + '</div></div>' +
      '<div class="panel-body"><div class="source-list">' + sourcesHtml + '</div></div></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.sections.workspace', '反应工作区')) + '</div>' +
      '<span class="muted">' + esc(cget('dashboard.sections.workspaceDesc', '')) + '</span></div>' +
      '<div class="panel-body"><div class="ws-grid">' + cards + '</div></div></div>' +
      '<div id="detailArea" class="detail-area"></div>' +
      tablePanel();

    initCharts();
    dashboardCharts(rows);
    bindTableEvents();
    $$('.ws-card').forEach(function (card) {
      card.addEventListener('click', function () { navigate(card.getAttribute('data-go')); });
    });
    refreshTable();
  }

  /* ============================ 视图：反应子库 ============================ */
  function renderReactionView(r) {
    const t = reactionText(r);
    const rows = allRecords().filter(function (d) { return d.reaction === r.reaction; });
    const withStruct = rows.filter(function (d) { return structureOf(d); });

    const elSet = {};
    withStruct.forEach(function (d) {
      (structureOf(d).elements || []).forEach(function (el) { elSet[el] = 1; });
    });
    const atomNums = withStruct.map(function (d) { return totalAtomsOf(d); }).filter(isNum);
    const avgAtoms = atomNums.length
      ? Math.round(atomNums.reduce(function (a, b) { return a + b; }, 0) / atomNums.length)
      : null;

    const conds = (t.conditions || []).map(function (c) {
      return '<div class="cond-row"><span class="k">' + esc(c.label) + '</span><span class="v">' + esc(c.value) + '</span></div>';
    }).join('') || '<p class="muted">尚未填写计算设置。</p>';

    const descRows = DFT_KEYS.map(function (k) {
      const d = descriptor(k);
      return '<div class="metric-item"><span class="mk">' + esc(d.label) + '</span>' +
        '<span class="mu">' + esc(d.unit) + '</span><div class="md">' + esc(d.desc) + '</div></div>';
    }).join('');

    const notes = (t.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') || '<li class="muted">尚未填写要点。</li>';

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(r.icon || '◆') + ' ' + esc(t.name || r.id) +
      ' <span class="en-tag">' + esc(t.en || '') + '</span></h1>' +
      '<span class="pill ' + (rows.length ? 'pill-ok' : 'pill-idle') + '">' + (rows.length ? '已入库 ' + rows.length + ' 个结构' : '待录入') + '</span></div>' +
      '<p class="page-desc">' + esc(t.summary || '') + '</p></div>' +

      '<div class="kpi-grid four">' +
      kpiCard(distinctCatalystCount(rows), '催化剂', '按催化剂去重', '#2b7ac4', '🧪') +
      kpiCard(rows.length, '结构总数', withStruct.length + ' 个已解析 CIF', '#31a354', '🧬') +
      kpiCard(Object.keys(elSet).length, '涉及元素', '全部结构去重', '#7b5ea7', '⚗️') +
      kpiCard(isNum(avgAtoms) ? avgAtoms : '—', '平均原子数', '每个结构', '#e8710a', '🔬') +
      '</div>' +

      '<div class="charts-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">元素组成分布</div>' +
      '<span class="muted">含该元素的结构数</span></div>' +
      '<div class="panel-body">' + chartFrame('chartElements', 'chart-md') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">结构规模分布</div>' +
      '<span class="muted">按原子数分箱</span></div>' +
      '<div class="panel-body">' + chartFrame('chartAtoms', 'chart-md') + '</div></div>' +
      '</div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">结构概览</div>' +
      '<span class="muted">共 ' + rows.length + ' 个结构 · ' + distinctCatalystCount(rows) + ' 个催化剂 · ' +
      Object.keys(elSet).length + ' 种元素</span></div>' +
      '<div class="panel-body">' + structureCardsHtml(rows) + '</div></div>' +

      '<div id="detailArea" class="detail-area"></div>' +

      '<div class="meta-grid">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">计算设置</div></div>' +
      '<div class="panel-body"><div class="cond-list">' + conds + '</div></div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">DFT 描述符</div></div>' +
      '<div class="panel-body">' + descRows + '</div></div>' +
      '</div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">体系要点</div></div>' +
      '<div class="panel-body"><ul class="note-list">' + notes + '</ul></div></div>' +

      tablePanel();

    initCharts();
    reactionCharts(rows);
    bindTableEvents();
    refreshTable();

    const byId = {};
    rows.forEach(function (d) { byId[d.id] = d; });
    $$('.st-card').forEach(function (el) {
      el.addEventListener('click', function () {
        const rec = byId[el.getAttribute('data-row-id')];
        if (rec) openDrawer(rec);
      });
    });
  }

  /* ============================ 视图：我们做什么 ============================ */
  function renderWhatWeDo() {
    const c = C.whatWeDo || {};
    const cols = c.columns || [];
    const flows = c.flows || [];
    const colorAt = function (i) { return (cols[i] && cols[i].color) || '#2b7ac4'; };

    function nodeHtml(n, color) {
      if (!n) return '<div class="flow-node empty"></div>';
      const items = (n.items || []).map(function (x) {
        return '<span class="fn-item">' + esc(x) + '</span>';
      }).join('');
      return '<div class="flow-node" style="--pc:' + esc(color) + '">' +
        '<div class="fn-title">' + esc(n.title) + '</div>' +
        (n.en ? '<div class="fn-en">' + esc(n.en) + '</div>' : '') +
        (items ? '<div class="fn-items">' + items + '</div>' : '') +
        '</div>';
    }

    function arrowHtml(label) {
      return '<div class="flow-arrow">' +
        '<span class="fa-label">' + esc(label || '') + '</span>' +
        '<span class="fa-line"></span></div>';
    }

    /* 表头行：三栏对齐到 1 / 3 / 5 列 */
    const headCells = [];
    cols.forEach(function (col, i) {
      if (i > 0) headCells.push('<div></div>');
      headCells.push('<div class="flow-head" style="--pc:' + esc(col.color || '#2b7ac4') + '">' +
        '<span class="fh-name">' + esc(col.name) + '</span>' +
        '<span class="fh-en">' + esc(col.en) + '</span></div>');
    });

    /* 每条转化链一行：来源 →（C1 原料）→ 反应 →（产物）→ 应用 */
    const rows = flows.map(function (f) {
      return '<div class="flow-row">' +
        '<div class="flow-cell">' + nodeHtml(f.source, colorAt(0)) + '</div>' +
        '<div class="flow-cell arrow">' + arrowHtml(f.link) + '</div>' +
        '<div class="flow-cell">' + nodeHtml(f.mid, colorAt(1)) + '</div>' +
        '<div class="flow-cell arrow">' + arrowHtml(f.link2) + '</div>' +
        '<div class="flow-cell">' + nodeHtml(f.end, colorAt(2)) + '</div>' +
        '</div>';
    }).join('');

    const plat = c.platform || {};
    const platChips = (plat.items || []).map(function (x) {
      return '<span class="plat-chip">' + esc(x) + '</span>';
    }).join('');

    const kt = c.keyTech || {};
    const ktChips = (kt.items || []).map(function (x) {
      return '<span class="kt-chip">' + esc(x) + '</span>';
    }).join('');

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(c.title || '我们做什么') + '</h1></div>' +
      '<p class="page-desc">' + esc(c.lead || '') + '</p></div>' +

      '<div class="flow-diagram">' +
      '<div class="fd-title">' + esc(c.diagramTitle || '') + '</div>' +
      '<div class="flow-head-row">' + headCells.join('') + '</div>' +
      rows +
      (platChips
        ? '<div class="platform-band"><span class="pb-label">' + esc(plat.title || '平台化学品') +
          (plat.en ? '<i>' + esc(plat.en) + '</i>' : '') + '</span>' +
          '<div class="pb-chips">' + platChips + '</div></div>'
        : '') +
      (ktChips ? '<div class="keytech"><span class="kt-label">' + esc(kt.title || '关键技术') + '</span>' +
        '<div class="kt-chips">' + ktChips + '</div></div>' : '') +
      '</div>';
  }

  /* ============================ 视图：小分子性质 ============================ */
  function moleculeEnergy(d) {
    return (d && d.outcar && isNum(d.outcar.totalEnergy)) ? d.outcar.totalEnergy : null;
  }
  function moleculeMag(d) {
    return (d && d.outcar && isNum(d.outcar.magnetization)) ? d.outcar.magnetization : null;
  }
  function moleculeGap(d) {
    return (d && d.eigen && isNum(d.eigen.gap)) ? d.eigen.gap : null;
  }

  function moleculeCardHtml(d) {
    const s = structureOf(d);
    const e = moleculeEnergy(d);
    const m = moleculeMag(d);
    const chips = s ? (s.elements || []).slice(0, 6).map(function (el) {
      return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(s.atomCounts[el])) + '</sub></span>';
    }).join('') : '';
    return '<div class="mol-card" data-mol-id="' + esc(d.id) + '">' +
      '<div class="mol-name">' + esc(d.name || d.formula || '未命名') + '</div>' +
      '<div class="mol-sub">' + esc(s ? (s.formula || d.formula || '') : (d.formula || '')) +
      (s && isNum(s.totalAtoms) ? ' · ' + s.totalAtoms + ' 原子' : '') + '</div>' +
      (chips ? '<div class="mol-chips">' + chips + '</div>' : '') +
      '<div class="mol-meta">' +
      '<span><i>E</i> ' + (isNum(e) ? e.toFixed(4) : '—') + '</span>' +
      '<span><i>Gap</i> ' + (isNum(moleculeGap(d)) ? moleculeGap(d).toFixed(2) : '—') + '</span>' +
      '<span><i>M</i> ' + (isNum(m) ? m.toFixed(2) + ' μB' : '—') + '</span>' +
      '</div></div>';
  }

  function renderMolecules() {
    const rows = moleculeRows();
    const withStruct = rows.filter(function (d) { return structureOf(d); });
    const withEnergy = rows.filter(function (d) { return isNum(moleculeEnergy(d)); });
    const mags = rows.map(moleculeMag).filter(isNum);
    const avgMag = mags.length ? mags.reduce(function (a, b) { return a + b; }, 0) / mags.length : null;
    const totalAtoms = withStruct.reduce(function (n, d) {
      const s = structureOf(d);
      return n + (isNum(s.totalAtoms) ? s.totalAtoms : 0);
    }, 0);

    const grid = rows.length
      ? '<div class="mol-grid">' + rows.map(moleculeCardHtml).join('') + '</div>'
      : '<div class="empty" style="padding:30px 0">还没有小分子数据。点右上角「上传小分子」把 VASP 的 CONTCAR/POSCAR 或 CIF 和同名 OUTCAR 一起传上来。</div>';

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(cget('molecules.title', '小分子性质')) + '</h1>' +
      '<button class="btn btn-primary btn-mini" id="molUploadBtn" style="margin-left:auto">＋ 上传小分子</button></div>' +
      '<p class="page-desc">' + esc(cget('molecules.desc', '收录小分子的 VASP 计算结果：构型、总能、磁矩。点开任意分子可查看三维构型，点击化学键即可读出键长。')) + '</p></div>' +

      '<div class="kpi-grid four">' +
      kpiCard(rows.length, '小分子', '去重分子数', '#2b7ac4', '⬢') +
      kpiCard(withStruct.length, '构型', totalAtoms + ' 个原子', '#31a354', '🧬') +
      kpiCard(withEnergy.length, '有总能', 'OUTCAR 已识别', '#e8710a', '📉') +
      kpiCard(isNum(avgMag) ? avgMag.toFixed(2) : '—', '平均磁矩', mags.length + ' 条有数据', '#7b5ea7', '🧲') +
      '</div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">分子列表</div>' +
      '<span class="muted">共 ' + rows.length + ' 个小分子</span></div>' +
      '<div class="panel-body">' + grid + '</div></div>' +

      '<div id="detailArea" class="detail-area"></div>';

    const up = $('#molUploadBtn');
    if (up) up.addEventListener('click', openMoleculeUpload);

    const byId = {};
    rows.forEach(function (d) { byId[d.id] = d; });
    $$('.mol-card').forEach(function (el) {
      el.addEventListener('click', function () {
        const rec = byId[el.getAttribute('data-mol-id')];
        if (rec) openMoleculeDetail(rec);
      });
    });
  }

  /* ---------- 键长计算 ---------- */
  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  }

  function openMoleculeDetail(d) {
    const host = $('#detailArea');
    if (!host) return;
    if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }

    const s = structureOf(d);
    const oc = d.outcar || null;
    const model3d = structureToText(s);
    const e = moleculeEnergy(d);
    const m = moleculeMag(d);
    const mags = (oc && Array.isArray(oc.magPerAtom)) ? oc.magPerAtom : [];

    const eg = d.eigen || null;
    const gap = (eg && isNum(eg.gap)) ? eg.gap : null;
    const homo = (eg && isNum(eg.homo)) ? eg.homo : null;
    const lumo = (eg && isNum(eg.lumo)) ? eg.lumo : null;
    const nelect = (eg && isNum(eg.nelect)) ? eg.nelect : (oc && isNum(oc.nelect) ? oc.nelect : null);
    const nb = (eg && isNum(eg.nbands)) ? eg.nbands : (oc && isNum(oc.nbands) ? oc.nbands : null);
    const nk = (eg && isNum(eg.nkpts)) ? eg.nkpts : null;
    const conv = (oc && typeof oc.converged === 'boolean') ? oc.converged : null;
    const s2 = s && s.cell ? ['a=' + (isNum(s.cell.a) ? s.cell.a : '–'), 'b=' + (isNum(s.cell.b) ? s.cell.b : '–'),
      'c=' + (isNum(s.cell.c) ? s.cell.c : '–'), 'α=' + (isNum(s.cell.alpha) ? s.cell.alpha + '°' : '–'),
      'β=' + (isNum(s.cell.beta) ? s.cell.beta + '°' : '–'), 'γ=' + (isNum(s.cell.gamma) ? s.cell.gamma + '°' : '–')].join('  ') : '';

    let magRows = '';
    if (mags.length) {
      magRows = mags.map(function (v, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="num">' + (isNum(v) ? v.toFixed(3) : '—') + '</td></tr>';
      }).join('');
    }

    host.innerHTML =
      '<div class="detail-card">' +
      '<div class="detail-head">' +
      '<div><h3>' + esc(d.name || d.formula || '小分子') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '') + '</h3>' +
      '<div class="sub">' + esc(d.id || '') + (s ? ' · ' + esc(s.file || '') : '') + '</div></div>' +
      '<button class="btn btn-mini" id="detailClose">收起</button></div>' +

      '<div class="detail-body">' +
      '<div>' +
      '<div class="section-label">电子结构</div>' +
      '<div class="field-grid">' +
      fieldHtml('总能 E (eV)', isNum(e) ? e.toFixed(6) : '—') +
      fieldHtml('磁矩 (μB)', isNum(m) ? m.toFixed(3) : '—') +
      fieldHtml('HOMO–LUMO gap (eV)', gap !== null ? gap.toFixed(3) : '—') +
      fieldHtml('电子数 NELECT', nelect !== null ? esc(String(nelect)) : '—') +
      fieldHtml('HOMO (eV)', homo !== null ? homo.toFixed(3) : '—') +
      fieldHtml('LUMO (eV)', lumo !== null ? lumo.toFixed(3) : '—') +
      '</div>' +

      '<div class="section-label">计算设置</div>' +
      '<div class="field-grid">' +
      fieldHtml('收敛状态', conv === true
        ? '<span class="ok-tag">已收敛</span>'
        : (conv === false ? '<span class="warn-tag">未收敛</span>' : '—')) +
      fieldHtml('截断能 ENCUT (eV)', oc && isNum(oc.encut) ? oc.encut : '—') +
      fieldHtml('自旋极化 ISPIN', oc && isNum(oc.ispin) ? esc(String(oc.ispin)) : '—') +
      fieldHtml('能带数 NBANDS', nb !== null ? esc(String(nb)) : '—') +
      fieldHtml('k 点数 NKPTS', nk !== null ? esc(String(nk)) : '—') +
      fieldHtml('离子步', oc && isNum(oc.ionicSteps) ? esc(String(oc.ionicSteps)) : '—') +
      '</div>' +
      '<p class="form-hint" style="margin:-4px 0 10px">能量取 free energy TOTEN；gap 取 EIGENVAL 中占据态最高与空态最低之差。</p>' +

      (s ? '<div class="section-label">构型信息</div>' +
        '<div class="field-grid">' +
        fieldHtml('元素组成', esc(s.elements.join(' ') || '—')) +
        fieldHtml('原子数', esc(String(s.totalAtoms || 0))) +
        fieldHtml('化学式', esc(s.formula || '—')) +
        fieldHtml('坐标类型', esc(s.coord === 'cart' ? '笛卡尔' : '分数')) +
        '</div>' +
        (s2 ? '<div class="field" style="margin-bottom:10px"><div class="k">晶胞参数</div>' +
          '<div class="v" style="font-weight:500;font-size:12px">' + esc(s2) + '</div></div>' : '') : '') +

      (magRows ? '<div class="section-label">逐原子磁矩 (μB)</div>' +
        '<div class="mag-wrap"><table class="el-table"><thead><tr><th>#</th><th>M</th></tr></thead>' +
        '<tbody>' + magRows + '</tbody></table></div>' : '') +

      (d.note ? '<div class="section-label">备注</div><p style="font-size:13px;color:#475569">' + esc(d.note) + '</p>' : '') +
      '</div>' +

      '<div>' +
      (model3d
        ? '<div class="section-label">构型查看</div>' +
          '<div class="viewer3d" id="molViewer" style="height:340px"></div>' +
          '<div class="bond-info" id="bondInfo">点击任意化学键，显示键长</div>'
        : '<div class="section-label">构型查看</div>' +
          '<div class="viewer3d"><div class="viewer-note">这条记录没有坐标数据。</div></div>') +
      '</div>' +
      '</div></div>';

    host.classList.add('open');

    const closeBtn = $('#detailClose');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    $$('.mol-card').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-mol-id') === d.id);
    });

    if (model3d) renderMolecule3D($('#molViewer'), model3d, $('#bondInfo'));
  }

  /* 分子 3D：点键显示键长 */
  function renderMolecule3D(container, model, infoEl) {
    if (!container) return;
    if (!HAS_3DMOL) { container.innerHTML = '<div class="viewer-note">3D 预览不可用（3Dmol 未加载）</div>'; return; }

    try {
      if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
      container.innerHTML = '';
      const viewer = $3Dmol.createViewer(container, { backgroundColor: 'white' });
      if (!viewer) throw new Error('viewer 创建失败');

      const m = viewer.addModel(model.text, model.format === 'xyz' ? 'xyz' : 'cif');
      viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.28 } });
      viewer.zoomTo();
      viewer.render();

      const atoms = m.selectedAtoms ? m.selectedAtoms({}) : [];
      const bonds = bondsFromAtoms(atoms);
      currentViewer = viewer;

      const symOf = function (a) { return a.elem || a.element || '?'; };

      container.onclick = function (ev) {
        if (!atoms.length) return;
        const cx = ev.clientX, cy = ev.clientY;
        let best = null, bestDist = 14;

        for (let k = 0; k < bonds.length; k++) {
          const b = bonds[k];
          const a1 = atoms[b.i], a2 = atoms[b.j];
          if (!a1 || !a2) continue;
          const p1 = viewer.modelToScreen({ x: a1.x, y: a1.y, z: a1.z });
          const p2 = viewer.modelToScreen({ x: a2.x, y: a2.y, z: a2.z });
          if (!p1 || !p2) continue;
          const dist = segDist(cx, cy, p1.x, p1.y, p2.x, p2.y);
          if (dist < bestDist) { bestDist = dist; best = b; }
        }

        if (!best) return;
        const a1 = atoms[best.i], a2 = atoms[best.j];
        const dx = a1.x - a2.x, dy = a1.y - a2.y, dz = a1.z - a2.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const label = symOf(a1) + (best.i + 1) + ' — ' + symOf(a2) + (best.j + 1);

        if (infoEl) {
          infoEl.innerHTML = '<b>' + esc(label) + '</b>　键长 <b class="bond-len">' + len.toFixed(3) + ' Å</b>' +
            '<span class="muted">　（' + len.toFixed(4) + ' Å）</span>';
        }

        try {
          viewer.removeAllShapes();
          viewer.removeAllLabels();
          viewer.addCylinder({
            start: { x: a1.x, y: a1.y, z: a1.z },
            end: { x: a2.x, y: a2.y, z: a2.z },
            radius: 0.11, color: '#e8710a', fromCap: 1, toCap: 1
          });
          viewer.addLabel(len.toFixed(3) + ' Å', {
            position: { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2, z: (a1.z + a2.z) / 2 },
            backgroundColor: '#ffffff', backgroundOpacity: 0.9,
            fontColor: '#e8710a', fontSize: 12,
            borderThickness: 1, borderColor: '#e8710a', inFront: true
          });
          viewer.render();
        } catch (e) { /* 高亮失败不影响读数 */ }
      };
    } catch (e) {
      console.warn('分子 3D 渲染失败', e);
      container.innerHTML = '<div class="viewer-note">3D 渲染失败，可能是浏览器不支持 WebGL</div>';
    }
  }

  /* 共价半径（Å），用于按距离判定成键 */
  const COV_RADII = {
    H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
    Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
    K: 2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24,
    Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Kr: 1.16,
    Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39,
    Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.40,
    Cs: 2.44, Ba: 2.15, La: 2.07, Ce: 2.04, Hf: 1.75, Ta: 1.70, W: 1.62, Re: 1.51, Os: 1.44, Ir: 1.41,
    Pt: 1.36, Au: 1.36, Hg: 1.32, Tl: 1.45, Pb: 1.46, Bi: 1.48, Po: 1.40, At: 1.50, Rn: 1.50
  };

  function covRadius(sym) { return COV_RADII[sym] || 0.77; }

  /* 优先用 3Dmol 解析出的键，没有就按共价半径 + 距离自己算 */
  function bondsFromAtoms(atoms) {
    if (!atoms || !atoms.length) return [];

    const fromModel = [];
    atoms.forEach(function (a, i) {
      if (!a.bonds || !a.bonds.length) return;
      a.bonds.forEach(function (j) {
        if (typeof j === 'number' && j > i && j < atoms.length) fromModel.push({ i: i, j: j });
      });
    });
    if (fromModel.length) return fromModel;

    const out = [];
    if (atoms.length > 400) return out;
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const a = atoms[i], b = atoms[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const symA = a.elem || a.element || '?';
        const symB = b.elem || b.element || '?';
        const lim = (covRadius(symA) + covRadius(symB)) * 1.25 + 0.1;
        if (d > 0.4 && d <= lim) out.push({ i: i, j: j });
      }
    }
    return out;
  }

  /* ============================ 视图：关于我们 ============================ */
  function renderAbout() {
    const a = C.about || {};
    const intro = (a.intro || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('')
      || '<p class="muted">尚未填写课题组简介，可在「内容管理」中补充。</p>';

    const dirs = (a.directions || []).map(function (d) {
      return '<div class="dir-card"><div class="dn">' + esc(d.name) + '</div>' +
        '<div class="dd">' + esc(d.desc) + '</div></div>';
    }).join('');

    const c = a.contact || {};
    const row = function (k, v, href) {
      if (!v) return '';
      const val = href
        ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(v) + '</a>'
        : esc(v);
      return '<div class="contact-row"><span class="ck">' + esc(k) + '</span><span class="cv">' + val + '</span></div>';
    };

    const p = a.portrait || {};
    const portraitHtml = p.image
      ? '<div class="panel about-portrait"><div class="panel-body">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name || '课题组负责人') + '" loading="lazy" />' +
        (p.name ? '<div class="p-name">' + esc(p.name) + '</div>' : '') +
        (p.title ? '<div class="p-title">' + esc(p.title) + '</div>' : '') +
        '</div></div>'
      : '';

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(a.title || '关于我们') + '</h1></div>' +
      '<p class="page-desc">' + esc(a.lead || '') + '</p></div>' +

      '<div class="about-grid' + (portraitHtml ? ' with-portrait' : '') + '">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">课题组简介</div></div>' +
      '<div class="panel-body"><div class="about-text">' + intro + '</div></div></div>' +
      portraitHtml +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(a.contactTitle || '联系方式') + '</div></div>' +
      '<div class="panel-body"><div class="contact-list">' +
      row('负责人', c.leader) +
      row('单位', c.affiliation) +
      row('邮箱', c.email, c.email ? 'mailto:' + c.email : '') +
      row('地址', c.address) +
      row('主页', c.homepage, c.homepage) +
      '</div></div></div>' +
      '</div>' +

      (dirs
        ? '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(a.directionsTitle || '研究方向') + '</div></div>' +
          '<div class="panel-body"><div class="dir-grid">' + dirs + '</div></div></div>'
        : '') +

      '<div class="panel"><div class="panel-head"><div class="panel-title">课题组合影</div></div>' +
      '<div class="panel-body">' +
      '<img class="about-photo" src="' + esc(a.photo || 'assets/group-photo.jpg') + '" alt="' + esc(a.photoCaption || '课题组合影') + '" loading="lazy" />' +
      (a.photoCaption ? '<div class="photo-cap">' + esc(a.photoCaption) + '</div>' : '') +
      '</div></div>' +

      (a.sourceNote ? '<p class="about-note">' + esc(a.sourceNote) + '</p>' : '');
  }

  /* ============================ 视图：内容管理 ============================ */
  function fieldInput(path, label, opts) {
    opts = opts || {};
    const value = cget(path, '');
    return '<div class="form-row"><label>' + esc(label) + '</label>' +
      '<input data-path="' + esc(path) + '" value="' + esc(value) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + ' />' +
      '</div>';
  }

  function fieldArea(path, label, rows) {
    return '<div class="form-row"><label>' + esc(label) + '</label>' +
      '<textarea data-path="' + esc(path) + '" rows="' + (rows || 2) + '">' + esc(cget(path, '')) + '</textarea></div>';
  }

  function reactionEditor(r) {
    const t = reactionText(r);
    const conds = (t.conditions || []).map(function (c) {
      return '<div class="cond-edit-row">' +
        '<input class="cond-label" value="' + esc(c.label) + '" placeholder="名称" />' +
        '<input class="cond-value" value="' + esc(c.value) + '" placeholder="内容" />' +
        '<button type="button" class="icon-btn" data-remove-cond>×</button></div>';
    }).join('');
    const notes = (t.notes || []).join('\n');

    return '<div class="panel" data-reaction="' + esc(r.id) + '">' +
      '<div class="panel-head"><div class="panel-title">' + esc(r.icon || '◆') + ' ' + esc(t.name || r.id) +
      '<span class="muted" style="font-weight:400;margin-left:8px">' + esc(r.reaction) + '</span></div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' +
      fieldInput('reactions.' + r.id + '.name', '显示名称') +
      fieldInput('reactions.' + r.id + '.en', '英文名') +
      '</div>' +
      fieldArea('reactions.' + r.id + '.summary', '一句话说明', 2) +
      '<div class="section-label">计算设置 / 条件（可增删行）</div>' +
      '<div class="cond-edit-list" data-cond-list>' + conds + '</div>' +
      '<button type="button" class="btn btn-mini" data-add-cond>+ 添加一行</button>' +
      '<div class="section-label">体系要点（每行一条）</div>' +
      '<div class="form-row"><textarea data-notes rows="4" placeholder="每行一条要点">' + esc(notes) + '</textarea></div>' +
      '</div></div>';
  }

  function renderLogin() {
    const now = Date.now();
    const locked = now < loginLockUntil;
    const lockLeft = locked ? Math.ceil((loginLockUntil - now) / 1000) : 0;

    $('#view').innerHTML =
      '<div class="login-wrap"><div class="login-card">' +
      '<div class="login-head"><div class="logo-mark">ICED</div>' +
      '<h2>' + esc(cget('admin.title', '内容管理')) + '</h2>' +
      '<p>请输入管理账号后继续</p></div>' +
      '<form id="loginForm">' +
      '<div class="form-row"><label>账户</label><input id="loginUser" autocomplete="username"' + (locked ? ' disabled' : '') + ' /></div>' +
      '<div class="form-row"><label>密码</label><input id="loginPass" type="password" autocomplete="current-password"' + (locked ? ' disabled' : '') + ' /></div>' +
      '<div class="login-error" id="loginError">' + (locked ? '尝试次数过多，请 ' + lockLeft + ' 秒后再试' : '') + '</div>' +
      '<button class="btn btn-primary login-submit" type="submit"' + (locked ? ' disabled' : '') + '>登录</button>' +
      '</form>' +
      '<p class="login-note">登录状态仅在当前标签页有效，关闭后需重新登录。<br />内容修改只保存在本浏览器。</p>' +
      '</div></div>';

    const form = $('#loginForm');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); doLogin(); });
    const pass = $('#loginPass');
    if (pass && !locked) pass.focus();
  }

  function doLogin() {
    const errEl = $('#loginError');
    const now = Date.now();
    if (now < loginLockUntil) {
      if (errEl) errEl.textContent = '尝试次数过多，请 ' + Math.ceil((loginLockUntil - now) / 1000) + ' 秒后再试';
      return;
    }

    const user = valueOf('loginUser').trim();
    const pass = valueOf('loginPass');
    const okUser = user === String(AUTH.username || 'admin');
    const okPass = !!AUTH.hash && authHash(pass) === AUTH.hash;

    if (okUser && okPass) {
      loginFails = 0;
      setAuthed();
      showToast('登录成功');
      render();
      return;
    }

    loginFails++;
    const left = MAX_FAILS - loginFails;
    if (left <= 0) {
      loginLockUntil = Date.now() + LOCK_MS;
      loginFails = 0;
      if (errEl) errEl.textContent = '尝试次数过多，请 ' + Math.ceil(LOCK_MS / 1000) + ' 秒后再试';
      const btn = $('#loginForm .login-submit');
      if (btn) btn.disabled = true;
      setTimeout(function () {
        if (state.view === 'admin' && !isAuthed()) render();
      }, LOCK_MS + 200);
      return;
    }
    if (errEl) errEl.textContent = '账户或密码不正确（还可尝试 ' + left + ' 次）';
  }

  function uploadAuthPanelHtml() {
    const cfg = getUploadAuth();
    return '<div class="panel"><div class="panel-head"><div class="panel-title">上传权限</div>' +
      '<span class="pill ' + (cfg.custom ? 'pill-ok' : 'pill-idle') + '">' + (cfg.custom ? '已自定义' : '默认账号') + '</span></div>' +
      '<div class="panel-body admin-body">' +
      '<p class="muted" style="margin-bottom:10px">上传计算数据时需要验证这里的账号密码。修改后立即生效；已通过验证的标签页需重新验证。</p>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>上传账号</label><input id="upUser" value="' + esc(cfg.username) + '" /></div>' +
      '<div class="form-row"><label>新密码（留空表示不修改）</label><input id="upPass" type="password" placeholder="••••••" /></div>' +
      '</div>' +
      '<div class="form-row"><label>确认新密码</label><input id="upPass2" type="password" /></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' +
      '<button type="button" class="btn btn-primary" id="upSave">保存上传账号</button>' +
      '<button type="button" class="btn btn-danger" id="upReset">恢复默认</button>' +
      '<span class="muted" id="upStatus" style="align-self:center">当前账号：' + esc(cfg.username) +
      (cfg.custom ? '（自定义）' : '（默认）') + '</span>' +
      '</div></div></div>';
  }

  function publishPanelHtml() {
    const cfg = loadPublish() || { url: '', key: '' };
    return '<div class="panel"><div class="panel-head"><div class="panel-title">发布设置（Cloudflare Worker）</div>' +
      '<span class="pill ' + (loadPublish() ? 'pill-ok' : 'pill-idle') + '">' + (loadPublish() ? '已配置' : '未配置') + '</span></div>' +
      '<div class="panel-body admin-body">' +
      '<p class="muted" style="margin-bottom:10px">配置后，上传的记录可以直接提交到仓库，无需手动导出 data.js。GitHub 令牌保存在 Worker 服务端，这里只填 Worker 地址与发布密钥。</p>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>Worker 地址</label><input id="pubUrl" value="' + esc(cfg.url || '') + '" placeholder="https://xxx.workers.dev" /></div>' +
      '<div class="form-row"><label>发布密钥</label><input id="pubKey" type="password" value="' + esc(cfg.key || '') + '" placeholder="PUBLISH_KEY" /></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:4px">' +
      '<button type="button" class="btn btn-primary" id="pubSave">保存设置</button>' +
      '<button type="button" class="btn" id="pubTest">测试连接</button>' +
      '<span class="muted" id="pubStatus">' + (loadPublish() ? '已配置' : '尚未配置') + '</span>' +
      '</div>' +
      '<p class="muted" style="margin-top:8px;font-size:11.5px">密钥只保存在本浏览器；若怀疑泄露，在 Cloudflare 控制台改 PUBLISH_KEY 即可作废。</p>' +
      '</div></div>';
  }

  function aboutEditor() {
    const a = C.about || {};
    const intro = (a.intro || []).join('\n\n');
    const dirs = (a.directions || []).map(function (d) {
      return '<div class="cond-edit-row dir-edit-row">' +
        '<input class="dir-name" value="' + esc(d.name) + '" placeholder="方向名称" />' +
        '<input class="dir-desc" value="' + esc(d.desc) + '" placeholder="一句话说明" />' +
        '<button type="button" class="icon-btn" data-remove-dir>×</button></div>';
    }).join('');

    return '<div class="panel" data-about>' +
      '<div class="panel-head"><div class="panel-title">关于我们</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('about.title', '页面标题') + fieldInput('about.lead', '副标题') + '</div>' +
      '<div class="form-grid2">' + fieldInput('about.photo', '合影图片路径') + fieldInput('about.photoCaption', '合影说明') + '</div>' +
      '<div class="section-label">负责人照片（放在简介与联系方式之间）</div>' +
      '<div class="form-grid2">' + fieldInput('about.portrait.image', '照片路径') + fieldInput('about.portrait.name', '姓名') + '</div>' +
      fieldInput('about.portrait.title', '职称 / 头衔') +
      '<div class="section-label">课题组简介（空行分段）</div>' +
      '<div class="form-row"><textarea data-about-intro rows="8" placeholder="每段之间空一行">' + esc(intro) + '</textarea></div>' +
      '<div class="section-label">研究方向（可增删行）</div>' +
      '<div class="cond-edit-list" data-dir-list>' + dirs + '</div>' +
      '<button type="button" class="btn btn-mini" data-add-dir>+ 添加方向</button>' +
      '<div class="section-label">联系方式</div>' +
      '<div class="form-grid2">' + fieldInput('about.contact.leader', '负责人') + fieldInput('about.contact.affiliation', '单位') + '</div>' +
      '<div class="form-grid2">' + fieldInput('about.contact.email', '邮箱') + fieldInput('about.contact.address', '地址') + '</div>' +
      fieldInput('about.contact.homepage', '个人主页') +
      '<div class="form-grid2">' + fieldInput('about.directionsTitle', '研究方向标题') + fieldInput('about.contactTitle', '联系方式标题') + '</div>' +
      fieldInput('about.sourceNote', '底部来源说明') +
      '</div></div>';
  }

  function renderAdmin() {
    const reactionPanels = REACTIONS.map(reactionEditor).join('');
    const descPanels = DFT_KEYS.map(function (k) {
      return '<div class="form-grid3">' +
        fieldInput('descriptors.' + k + '.label', '名称') +
        fieldInput('descriptors.' + k + '.unit', '单位') +
        fieldInput('descriptors.' + k + '.desc', '说明') +
        '</div>';
    }).join('');

    const localNote = hasLocalContent()
      ? '<div class="warn-box">' + esc(cget('admin.localOnly', '当前修改仅在本浏览器生效。')) + '</div>'
      : '';

    $('#view').innerHTML =
      adminTabs('content') +
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(cget('admin.title', '内容管理')) + '</h1>' +
      '<span class="pill ' + (hasLocalContent() ? 'pill-warn' : 'pill-idle') + '">' + (hasLocalContent() ? '有本地修改' : '与仓库一致') + '</span>' +
      '<div class="head-actions"><button class="btn" id="adminLogout">退出登录</button></div></div>' +
      '<p class="page-desc">' + esc(cget('admin.desc', '')) + '</p></div>' +
      localNote +
      '<form id="adminForm">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">站点信息</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('site.name', '站点名称') + fieldInput('site.subtitle', '副标题') + '</div>' +
      fieldInput('site.footer', '页脚文字') +
      '</div></div>' +

      publishPanelHtml() +
      uploadAuthPanelHtml() +
      aboutEditor() +

      '<div class="panel"><div class="panel-head"><div class="panel-title">数据总览页文案</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('dashboard.title', '页面标题') + fieldInput('dashboard.badge', '右上角标签') + '</div>' +
      fieldInput('dashboard.databaseName', '数据库名称（显示在标题旁）') +
      fieldArea('dashboard.desc', '页面说明', 2) +
      '<div class="section-label">KPI 卡片</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.catalysts.label', '卡片 1 名称') + fieldInput('dashboard.kpi.catalysts.sub', '卡片 1 说明') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.energies.label', '卡片 2 名称') + fieldInput('dashboard.kpi.energies.sub', '卡片 2 说明') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.structures.label', '卡片 3 名称') + fieldInput('dashboard.kpi.structures.sub', '卡片 3 说明') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.barriers.label', '卡片 4 名称') + fieldInput('dashboard.kpi.barriers.sub', '卡片 4 说明') + '</div>' +
      '<div class="section-label">图表与分区标题</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.charts.coverage', '图 1 标题') + fieldInput('dashboard.charts.descriptors', '图 2 标题') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.charts.structures', '图 3 标题') + fieldInput('dashboard.charts.sources', '数据源分区标题') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.sections.workspace', '反应工作区标题') + fieldInput('dashboard.sections.table', '表格标题') + '</div>' +
      fieldArea('dashboard.sections.workspaceDesc', '反应工作区说明', 1) +
      '<div class="section-label">空状态文案</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.empty.noData', '无数据时') + fieldInput('dashboard.empty.noMatch', '筛选无结果时') + '</div>' +
      '</div></div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">DFT 描述符</div></div>' +
      '<div class="panel-body admin-body">' + descPanels + '</div></div>' +

      reactionPanels +

      '<div class="panel"><div class="panel-head"><div class="panel-title">上传页与管理页文案</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('upload.title', '上传弹窗标题') + fieldInput('upload.cifLabel', 'CIF 标签') + '</div>' +
      fieldArea('upload.desc', '上传说明', 1) +
      fieldInput('upload.outcarLabel', 'OUTCAR 标签') +
      '<div class="form-grid2">' + fieldInput('admin.title', '管理页标题') + fieldInput('admin.desc', '管理页说明') + '</div>' +
      '</div></div>' +
      '</form>' +

      '<div class="admin-actions">' +
      '<button class="btn btn-primary" id="adminSave">保存到本地</button>' +
      '<button class="btn" id="adminExport">导出 content.js</button>' +
      '<button class="btn btn-danger" id="adminReset">恢复仓库版本</button>' +
      '</div>';

    bindAdmin();
  }

  function bindAdmin() {
    $$('[data-add-cond]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const panel = btn.closest('[data-reaction]');
        const list = $('[data-cond-list]', panel);
        const row = document.createElement('div');
        row.className = 'cond-edit-row';
        row.innerHTML = '<input class="cond-label" placeholder="名称" /><input class="cond-value" placeholder="内容" />' +
          '<button type="button" class="icon-btn" data-remove-cond>×</button>';
        list.appendChild(row);
        bindRemoveCond(row);
      });
    });
    $$('[data-remove-cond]').forEach(bindRemoveCond);

    const addDir = $('[data-add-dir]');
    if (addDir) addDir.addEventListener('click', function () {
      const list = $('[data-dir-list]');
      if (!list) return;
      const row = document.createElement('div');
      row.className = 'cond-edit-row dir-edit-row';
      row.innerHTML = '<input class="dir-name" placeholder="方向名称" />' +
        '<input class="dir-desc" placeholder="一句话说明" />' +
        '<button type="button" class="icon-btn" data-remove-dir>×</button>';
      list.appendChild(row);
      bindRemoveDir(row.querySelector('[data-remove-dir]'));
    });
    $$('[data-remove-dir]').forEach(bindRemoveDir);

    const logout = $('#adminLogout');
    if (logout) logout.addEventListener('click', function () {
      clearAuth();
      showToast('已退出登录');
      render();
    });

    const pubSave = $('#pubSave');
    if (pubSave) pubSave.addEventListener('click', function () {
      const url = valueOf('pubUrl').trim();
      const key = valueOf('pubKey').trim();
      if (!url || !key) { showToast('请填写 Worker 地址与发布密钥'); return; }
      if (!/^https?:\/\//i.test(url)) { showToast('Worker 地址需要以 https:// 开头'); return; }
      if (savePublish({ url: url, key: key })) {
        showToast('发布设置已保存，上传时会多出「保存并发布」');
        render();
      }
    });

    const upSave = $('#upSave');
    if (upSave) upSave.addEventListener('click', function () {
      const u = valueOf('upUser').trim();
      const p1 = valueOf('upPass');
      const p2 = valueOf('upPass2');
      if (!u) { showToast('请填写上传账号'); return; }
      if (p1 || p2) {
        if (p1 !== p2) { showToast('两次输入的密码不一致'); return; }
        if (p1.length < 4) { showToast('密码至少 4 位'); return; }
      }
      if (!saveUploadAuth(u, p1 || null)) return;
      clearUploadAuthed();
      showToast('上传账号已更新：' + u);
      render();
    });

    const upReset = $('#upReset');
    if (upReset) upReset.addEventListener('click', function () {
      if (!window.confirm('恢复为默认上传账号（Admin / zjusce985）？')) return;
      resetUploadAuth();
      clearUploadAuthed();
      showToast('已恢复默认上传账号');
      render();
    });

    const pubTest = $('#pubTest');
    if (pubTest) pubTest.addEventListener('click', async function () {
      const url = valueOf('pubUrl').trim();
      const key = valueOf('pubKey').trim();
      const st = $('#pubStatus');
      if (!url || !key) { showToast('请先填写地址与密钥'); return; }
      if (st) st.textContent = '正在测试…';
      try {
        const info = await publishHealth({ url: url, key: key });
        if (st) st.textContent = '连接正常：' + (info.repo || '') + ' @ ' + (info.branch || '');
        showToast('连接正常');
      } catch (e) {
        if (st) st.textContent = '连接失败：' + e.message;
        showToast('连接失败：' + e.message);
      }
    });

    const save = $('#adminSave');
    if (save) save.addEventListener('click', function () {
      const next = collectAdmin();
      if (!saveContent(next)) return;
      C = effectiveContent();
      showToast(cget('admin.saved', '已保存到本地'));
      render();
    });

    const reset = $('#adminReset');
    if (reset) reset.addEventListener('click', function () {
      if (!window.confirm('确定恢复为仓库中的版本？本地修改将丢失。')) return;
      clearContent();
      C = effectiveContent();
      showToast(cget('admin.reset', '已恢复为仓库中的版本'));
      render();
    });

    const exp = $('#adminExport');
    if (exp) exp.addEventListener('click', function () {
      const next = collectAdmin();
      if (!saveContent(next)) return;
      C = effectiveContent();
      const text = '/* 由「内容管理」页面导出，' + new Date().toISOString().slice(0, 10) + ' */\n' +
        'window.SITE_CONTENT = ' + JSON.stringify(next, null, 2) + ';\n';
      download('content.js', text, 'text/javascript;charset=utf-8');
      showToast('已导出 content.js，覆盖仓库同名文件即可生效');
    });
  }

  function bindRemoveCond(btn) {
    btn.addEventListener('click', function () {
      const row = btn.closest('.cond-edit-row');
      if (row) row.remove();
    });
  }

  function bindRemoveDir(btn) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      const row = btn.closest('.dir-edit-row');
      if (row) row.remove();
    });
  }

  function collectAdmin() {
    const next = deepClone(C);
    $$('#adminForm [data-path]').forEach(function (el) {
      setPath(next, el.getAttribute('data-path'), el.value);
    });
    REACTIONS.forEach(function (r) {
      const panel = document.querySelector('[data-reaction="' + r.id + '"]');
      if (!panel) return;
      const conds = $$('.cond-edit-row', panel).map(function (row) {
        const l = $('.cond-label', row);
        const v = $('.cond-value', row);
        return { label: l ? l.value : '', value: v ? v.value : '' };
      }).filter(function (c) { return c.label.trim() || c.value.trim(); });
      const notesEl = panel.querySelector('[data-notes]');
      const notes = notesEl
        ? notesEl.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
        : [];
      if (!next.reactions) next.reactions = {};
      if (!next.reactions[r.id]) next.reactions[r.id] = {};
      next.reactions[r.id].conditions = conds;
      next.reactions[r.id].notes = notes;
    });

    const aboutPanel = document.querySelector('[data-about]');
    if (aboutPanel) {
      if (!next.about) next.about = {};
      const introEl = aboutPanel.querySelector('[data-about-intro]');
      next.about.intro = introEl
        ? introEl.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean)
        : [];
      next.about.directions = $$('.dir-edit-row', aboutPanel).map(function (row) {
        const n = row.querySelector('.dir-name');
        const d = row.querySelector('.dir-desc');
        return { name: n ? n.value : '', desc: d ? d.value : '' };
      }).filter(function (x) { return x.name.trim() || x.desc.trim(); });
    }

    return next;
  }

  /* ============================ 视图：数据管理 ============================ */
  const manage = { cloudSel: {}, draftSel: {} };

  function adminTabs(active) {
    return '<div class="admin-tabs">' +
      '<a class="admin-tab' + (active === 'content' ? ' active' : '') + '" href="#/admin">内容管理</a>' +
      '<a class="admin-tab' + (active === 'data' ? ' active' : '') + '" href="#/admin/data">数据管理</a>' +
      '</div>';
  }

  function reactionNameOf(name) {
    for (let i = 0; i < REACTIONS.length; i++) {
      if (REACTIONS[i].reaction === name) return reactionText(REACTIONS[i]).name || REACTIONS[i].id;
    }
    return name || '—';
  }

  function selOf(source) {
    return source === 'cloud' ? manage.cloudSel : manage.draftSel;
  }

  function selectedIds(source) {
    const sel = selOf(source);
    return Object.keys(sel).filter(function (k) { return sel[k]; });
  }

  function pruneSelection(sel, records) {
    const alive = {};
    records.forEach(function (d) { alive[d.id] = true; });
    Object.keys(sel).forEach(function (k) { if (!alive[k]) delete sel[k]; });
  }

  function manageRows(records, source) {
    const sel = selOf(source);
    return records.map(function (d) {
      const st = structureOf(d);
      const checked = sel[d.id] ? ' checked' : '';
      return '<tr data-id="' + esc(d.id) + '">' +
        '<td class="sel-cell"><input type="checkbox" class="row-check" data-src="' + source + '" data-id="' + esc(d.id) + '"' + checked + ' /></td>' +
        '<td>' + esc(d.id) + '</td>' +
        '<td class="formula">' + esc(catalystOf(d)) + '</td>' +
        '<td>' + esc(d.formula || '—') + '</td>' +
        '<td>' + (d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td>' + esc(d.support || '—') + '</td>' +
        '<td>' + esc(reactionNameOf(d.reaction)) + '</td>' +
        '<td class="num">' + (st ? st.elements.length + ' 种' : '—') + '</td>' +
        '<td class="num">' + (st && isNum(st.totalAtoms) ? st.totalAtoms : '—') + '</td>' +
        '<td class="num">' + (isNum(d.dftEnergy) ? d.dftEnergy.toFixed(3) : '—') + '</td>' +
        '<td>' + esc(d.ref || '—') + '</td>' +
        '<td class="ops">' +
        '<button class="btn btn-mini" data-edit="' + esc(d.id) + '" data-src="' + source + '">修改</button> ' +
        '<button class="btn btn-mini btn-danger" data-del="' + esc(d.id) + '" data-src="' + source + '">删除</button>' +
        '</td></tr>';
    }).join('');
  }

  function managePanel(source, records) {
    const isCloud = source === 'cloud';
    const selCount = selectedIds(source).length;
    const canCloud = !!loadPublish();
    const selDis = selCount ? '' : ' disabled';

    return '<div class="panel" data-manage="' + source + '">' +
      '<div class="panel-head"><div class="panel-title">' +
      (isCloud ? '云端数据（已提交到服务器）' : '本地草稿（仅当前浏览器）') + '</div>' +
      '<span class="pill ' + (isCloud ? 'pill-ok' : 'pill-idle') + '">' + records.length + ' 条</span></div>' +
      '<div class="manage-toolbar">' +
      '<label class="sel-all"><input type="checkbox" data-all="' + source + '"' +
      (records.length && selCount === records.length ? ' checked' : '') + (records.length ? '' : ' disabled') + ' /> 全选</label>' +
      '<span class="muted" data-selinfo="' + source + '">' + (selCount ? '已选 ' + selCount + ' 条' : '未选择') + '</span>' +
      '<button class="btn btn-mini" data-batch="' + source + '"' + selDis + '>批量修改</button>' +
      '<button class="btn btn-mini btn-danger" data-batchdel="' + source + '"' + selDis + '>删除选中</button>' +
      '<button class="btn btn-mini btn-danger" data-clear="' + source + '"' +
      (records.length ? '' : ' disabled') + '>' + (isCloud ? '清空云端' : '清空本地草稿') + '</button>' +
      (isCloud && !canCloud ? '<span class="muted" style="font-size:11.5px">云端改动需要先在内容管理里配置发布地址</span>' : '') +
      '</div>' +
      (records.length
        ? '<div class="table-wrap"><table class="manage-table"><thead><tr>' +
          '<th class="sel-cell"></th><th>ID</th><th>催化剂</th><th>结构</th><th>金属</th><th>载体</th><th>反应体系</th>' +
          '<th>元素</th><th>原子数</th><th>总能 (eV)</th><th>来源</th><th></th>' +
          '</tr></thead><tbody>' + manageRows(records, source) + '</tbody></table></div>'
        : '<div class="empty" style="padding:26px 0">暂无数据</div>') +
      '</div>';
  }

  function renderAdminData() {
    if (!isAuthed()) { renderLogin(); return; }
    const cloud = curated();
    const drafts = loadDrafts();
    pruneSelection(manage.cloudSel, cloud);
    pruneSelection(manage.draftSel, drafts);

    $('#view').innerHTML =
      adminTabs('data') +
      '<div class="page-head"><div class="page-head-row">' +
      '<h1 class="page-title">数据管理</h1>' +
      '<span class="pill pill-ok">云端 ' + cloud.length + ' 条</span>' +
      '<span class="pill pill-idle">本地 ' + drafts.length + ' 条</span>' +
      '<button class="btn btn-mini" id="manageBackfill">补传结构</button>' +
      '<button class="btn btn-mini" id="manageRefresh" style="margin-left:auto">从仓库重新拉取</button>' +
      '</div><p class="page-desc">云端数据来自仓库 data.js，修改与删除会提交到仓库，约 1 分钟后全站生效；本地草稿只存在当前浏览器，可随时清空。</p></div>' +
      managePanel('cloud', cloud) +
      managePanel('draft', drafts);

    bindManage();
  }

  /* 补传结构：选一批 CIF/POSCAR，按文件名匹配到已有记录，只补坐标、不新建记录 */
  function openBackfill() {
    const cloud = curated();
    if (!cloud.length) { showToast('云端还没有数据'); return; }

    const input = document.createElement('input');
    input.id = 'backfillInput';
    input.type = 'file';
    input.multiple = true;
    input.accept = '.cif,.mcif,POSCAR,CONTCAR';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async function () {
      const files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      showToast('正在解析 ' + files.length + ' 个文件…');

      const byKey = {};
      cloud.forEach(function (d) {
        const s = structureOf(d);
        [matchKey(s && s.file), matchKey(d.formula), matchKey(d.id)].forEach(function (k) {
          if (!k) return;
          (byKey[k] = byKey[k] || []).push(d);
        });
      });

      const picked = {};
      const missed = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const text = await readText(f);
        const kind = STRUCT_NAMES.test(f.name) ? 'poscar' : 'cif';
        const parsed = parseStructureFile(kind, text, f.name);
        if (parsed.error) { missed.push(f.name); continue; }

        const bucket = byKey[matchKey(f.name)];
        if (!bucket || !bucket.length) { missed.push(f.name); continue; }

        const rec = bucket.shift();
        picked[rec.id] = parsed.structure;
      }

      const ids = Object.keys(picked);
      if (!ids.length) { showToast('没有文件名能对上现有记录'); return; }

      const updated = cloud.map(function (d) {
        const st = picked[d.id];
        if (!st) return d;
        const cs = compactStructure(st);
        const c = JSON.parse(JSON.stringify(d));
        c.structure = Object.assign({}, c.structure || {}, {
          file: st.file,
          format: st.kind,
          formula: st.info.formula || (c.structure && c.structure.formula) || '',
          elements: st.info.elements.slice(),
          atomCounts: st.info.atomCounts,
          totalAtoms: st.info.totalAtoms,
          cell: st.info.cell,
          spaceGroup: st.info.spaceGroup || '',
          atoms: cs.atoms,
          coord: cs.coord
        });
        c.updatedAt = new Date().toISOString();
        return c;
      });

      await applyCloud(updated, '补传 ' + ids.length + ' 条结构坐标');
      showToast('已补传 ' + ids.length + ' 条' + (missed.length ? '，' + missed.length + ' 个文件未匹配' : ''));
      render();
      input.remove();
    });

    input.click();
  }

  function bindManage() {
    const bf = $('#manageBackfill');
    if (bf) bf.addEventListener('click', openBackfill);

    const rf = $('#manageRefresh');
    if (rf) rf.addEventListener('click', async function () {
      rf.disabled = true;
      rf.textContent = '拉取中…';
      const changed = await refreshDataFromNetwork({ rerender: false });
      rf.disabled = false;
      rf.textContent = '从仓库重新拉取';
      if (changed) { showToast('已拉取到最新数据'); render(); }
      else showToast('没有新数据（刚发布的话，GitHub Pages 重建约需 1 分钟）');
    });

    $$('[data-all]').forEach(function (box) {
      box.addEventListener('change', function () {
        const source = box.getAttribute('data-all');
        const sel = selOf(source);
        const rows = source === 'cloud' ? curated() : loadDrafts();
        Object.keys(sel).forEach(function (k) { delete sel[k]; });
        if (box.checked) rows.forEach(function (d) { sel[d.id] = true; });
        render();
      });
    });

    $$('.row-check').forEach(function (box) {
      box.addEventListener('change', function () {
        const source = box.getAttribute('data-src');
        const id = box.getAttribute('data-id');
        const sel = selOf(source);
        if (box.checked) sel[id] = true; else delete sel[id];
        render();
      });
    });

    $$('[data-batch]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const source = btn.getAttribute('data-batch');
        const ids = selectedIds(source);
        if (!ids.length) return;
        openBatchEditor(source, ids);
      });
    });

    $$('[data-batchdel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const source = btn.getAttribute('data-batchdel');
        const ids = selectedIds(source);
        if (!ids.length) return;
        confirmDelete(source, ids);
      });
    });

    $$('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const source = btn.getAttribute('data-clear');
        const rows = source === 'cloud' ? curated() : loadDrafts();
        if (!rows.length) return;
        const label = source === 'cloud' ? '云端全部数据（' + rows.length + ' 条，将提交到仓库）' : '全部本地草稿（' + rows.length + ' 条）';
        if (!window.confirm('确定清空' + label + '？此操作不可撤销（云端可从 git 历史恢复）。')) return;
        if (source === 'cloud') {
          applyCloud([], '清空云端数据');
        } else {
          saveDrafts([]);
          manage.draftSel = {};
          showToast('已清空本地草稿');
          render();
        }
      });
    });

    $$('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openBatchEditor(btn.getAttribute('data-src'), [btn.getAttribute('data-edit')]);
      });
    });

    $$('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        confirmDelete(btn.getAttribute('data-src'), [btn.getAttribute('data-del')]);
      });
    });
  }

  function confirmDelete(source, ids) {
    const isCloud = source === 'cloud';
    const rows = isCloud ? curated() : loadDrafts();
    const targets = rows.filter(function (d) { return ids.indexOf(d.id) >= 0; });
    if (!targets.length) return;
    const names = targets.slice(0, 3).map(function (d) { return d.formula || d.id; }).join('、');
    const more = targets.length > 3 ? ' 等' : '';
    if (!window.confirm('确定删除 ' + targets.length + ' 条' + (isCloud ? '云端数据（将提交到仓库）' : '本地草稿') + '？\n' + names + more)) return;

    if (isCloud) {
      const remain = rows.filter(function (d) { return ids.indexOf(d.id) < 0; });
      ids.forEach(function (id) { delete manage.cloudSel[id]; });
      applyCloud(remain, '删除 ' + targets.length + ' 条记录');
    } else {
      const remain = rows.filter(function (d) { return ids.indexOf(d.id) < 0; });
      ids.forEach(function (id) { delete manage.draftSel[id]; });
      saveDrafts(remain);
      showToast('已删除 ' + targets.length + ' 条本地草稿');
      render();
    }
  }

  async function applyCloud(records, message) {
    try {
      showToast('正在提交到仓库…');
      const res = await syncCloud(records, message);
      window.CATALYST_DATA = records;
      const n = (res && res.count !== undefined) ? res.count : records.length;
      showToast('已同步（当前 ' + n + ' 条），约 1 分钟后全站生效');
      render();
      return true;
    } catch (e) {
      showToast('同步失败：' + e.message);
      return false;
    }
  }

  async function syncCloud(records, message) {
    const cfg = loadPublish();
    if (!cfg) throw new Error('未配置发布地址，请到内容管理 → 发布设置里填写');
    const res = await fetch(publishBase(cfg) + '/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify({ records: records.map(stripForExport), message: message })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  /* ---------- 批量修改对话框 ---------- */
  function openBatchEditor(source, ids) {
    const isCloud = source === 'cloud';
    const modal = $('#genericModal');
    if (!modal) return;

    $('#genericTitle').textContent = '批量修改 ' + ids.length + ' 条' + (isCloud ? '云端' : '本地') + '记录';
    $('#genericBody').innerHTML =
      '<p class="muted" style="margin-bottom:12px">留空的字段保持不变。</p>' +
      '<div class="form-row"><label>反应体系</label><select id="bReaction"><option value="">— 不修改 —</option>' +
      REACTIONS.map(function (r) {
        return '<option value="' + esc(r.reaction) + '">' + esc(reactionText(r).name || r.id) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-row"><label>归属催化剂（改这一项可把多条结构归到同一催化剂）</label>' +
      '<input id="bCatalyst" list="catalystOptions" placeholder="不修改" />' + catalystDatalist('catalystOptions') + '</div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>活性金属</label><input id="bMetal" placeholder="不修改" /></div>' +
      '<div class="form-row"><label>载体</label><input id="bSupport" placeholder="不修改" /></div>' +
      '</div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>数据来源</label><input id="bRef" placeholder="不修改" /></div>' +
      '<div class="form-row"><label>总能 (eV)</label><input type="number" step="any" id="bEnergy" placeholder="不修改" /></div>' +
      '</div>' +
      '<div class="form-row"><label>备注（覆盖）</label><input id="bNote" placeholder="不修改" /></div>';

    $('#genericFoot').innerHTML =
      '<span class="muted">' + ids.length + ' 条记录</span>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn" id="bCancel">取消</button>' +
      '<button class="btn btn-primary" id="bApply">应用修改</button></div>';

    modal.classList.add('open');

    const close = function () { modal.classList.remove('open'); };
    $('#genericClose').onclick = close;
    $('#bCancel').onclick = close;

    $('#bApply').onclick = async function () {
      const patch = {
        catalyst: valueOf('bCatalyst'),
        reaction: valueOf('bReaction'),
        metal: valueOf('bMetal'),
        support: valueOf('bSupport'),
        ref: valueOf('bRef'),
        note: valueOf('bNote'),
        energy: readNum('bEnergy')
      };
      const changed = patch.catalyst || patch.reaction || patch.metal || patch.support ||
        patch.ref || patch.note || isNum(patch.energy);
      if (!changed) { showToast('没有填写要修改的内容'); return; }

      const rows = isCloud ? curated() : loadDrafts();
      const updated = rows.map(function (d) {
        if (ids.indexOf(d.id) < 0) return d;
        const c = JSON.parse(JSON.stringify(d));
        if (patch.catalyst) c.catalyst = patch.catalyst;
        if (patch.reaction) c.reaction = patch.reaction;
        if (patch.metal) c.metal = patch.metal;
        if (patch.support) c.support = patch.support;
        if (patch.ref) c.ref = patch.ref;
        if (patch.note) c.note = patch.note;
        if (isNum(patch.energy)) c.dftEnergy = patch.energy;
        c.updatedAt = new Date().toISOString();
        return c;
      });

      close();
      if (isCloud) {
        await applyCloud(updated, '批量修改 ' + ids.length + ' 条记录');
      } else {
        saveDrafts(updated);
        showToast('已修改 ' + ids.length + ' 条本地草稿');
        render();
      }
    };
  }

  /* ============================ 结构详情（页内区域，不用弹窗） ============================ */
  let currentRecord = null;

  function closeDrawer() {
    const host = $('#detailArea');
    if (host) {
      host.innerHTML = '';
      host.classList.remove('open');
    }
    if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
    currentRecord = null;
    $$('.st-card.active').forEach(function (el) { el.classList.remove('active'); });
  }

  function fieldHtml(k, v) {
    return '<div class="field"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>';
  }

  function openDrawer(d) {
    if (!d) return;
    const host = $('#detailArea');
    if (!host) return;

    currentRecord = d;
    if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }

    const s = structureOf(d);
    const model3d = structureToText(s);
    const oc = outcarOf(d);
    const r = REACTIONS.filter(function (x) { return x.reaction === d.reaction; })[0];
    const rname = r ? (reactionText(r).name || r.id) : (d.reaction || '未分类');

    let elRows = '';
    if (s && s.atomCounts) {
      elRows = Object.keys(s.atomCounts).sort(function (a, b) { return s.atomCounts[b] - s.atomCounts[a]; })
        .map(function (el) { return '<tr><td>' + esc(el) + '</td><td>' + esc(fmtCount(s.atomCounts[el])) + '</td></tr>'; }).join('');
    }

    const cell = s && s.cell
      ? ['a=' + (isNum(s.cell.a) ? s.cell.a : '–'), 'b=' + (isNum(s.cell.b) ? s.cell.b : '–'), 'c=' + (isNum(s.cell.c) ? s.cell.c : '–'),
         'α=' + (isNum(s.cell.alpha) ? s.cell.alpha + '°' : '–'), 'β=' + (isNum(s.cell.beta) ? s.cell.beta + '°' : '–'),
         'γ=' + (isNum(s.cell.gamma) ? s.cell.gamma + '°' : '–')].join('  ')
      : '';

    /* 晶胞体积：V = abc·√(1 − cos²α − cos²β − cos²γ + 2cosαcosβcosγ) */
    let cellVolume = null;
    if (s && s.cell) {
      const m = cellMatrix(s.cell);
      if (m) {
        const v = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
                  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
                  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        if (isFinite(v) && v > 0) cellVolume = v;
      }
    }

    const ed = (k) => descriptor(k).label + ' (' + descriptor(k).unit + ')';

    host.innerHTML =
      '<div class="detail-card">' +
      '<div class="detail-head">' +
      '<div><h3>' + esc(d.formula || '未命名') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '') + '</h3>' +
      '<div class="sub">' + esc(d.id || '') + ' · ' + esc(catalystOf(d)) + ' · ' + esc(rname) + '</div></div>' +
      '<button class="btn btn-mini" id="detailClose">收起</button>' +
      '</div>' +

      '<div class="detail-body">' +
      '<div>' +
      '<div class="section-label">DFT 数据</div>' +
      '<div class="field-grid">' +
      fieldHtml('催化剂', esc(catalystOf(d))) +
      fieldHtml('结构', esc(d.formula || '—')) +
      fieldHtml('金属', d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '—') +
      fieldHtml('载体', esc(d.support || '—')) +
      fieldHtml(ed('barrier'), numText(d.barrier) + ' eV') +
      fieldHtml(ed('eads'), numText(d.eads) + ' eV') +
      fieldHtml(ed('reactionEnergy'), numText(d.reactionEnergy) + ' eV') +
      fieldHtml(ed('evac'), numText(d.evac) + ' eV') +
      fieldHtml(ed('dftEnergy'), isNum(d.dftEnergy) ? d.dftEnergy.toFixed(4) + ' eV' : '—') +
      fieldHtml('数据来源', esc(d.ref || '—')) +
      '</div>' +

      (oc ? '<div class="section-label">OUTCAR 解析结果</div><div class="field-grid">' +
        fieldHtml('文件', esc(oc.file || '—')) +
        fieldHtml('离子步', esc(String(oc.ionicSteps || '—'))) +
        fieldHtml('E-fermi', isNum(oc.fermi) ? oc.fermi.toFixed(4) + ' eV' : '—') +
        fieldHtml('NIONS', isNum(oc.nions) ? String(oc.nions) : '—') +
        '</div>' : '') +

      (d.note ? '<div class="section-label">标注 / 备注</div><p style="font-size:13px;color:#475569">' + esc(d.note) + '</p>' : '') +

      '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">' +
      '<button class="btn btn-mini" id="copyJson">复制该条 JSON</button>' +
      (d.source === 'draft' ? '<button class="btn btn-mini btn-danger" id="deleteDraft">删除本地草稿</button>' : '') +
      '</div></div>' +

      '<div>' +
      (s
        ? '<div class="section-label">结构信息（来自 CIF）</div>' +
          '<div class="field-grid">' +
          fieldHtml('文件', esc(s.file || '—')) +
          fieldHtml('总原子数', esc(String(s.totalAtoms || 0))) +
          fieldHtml('元素种类', esc(String((s.elements || []).length))) +
          fieldHtml('化学式', esc(s.formula || '—')) +
          '</div>' +
          (cell ? '<div class="field" style="margin-bottom:8px"><div class="k">晶胞参数</div>' +
            '<div class="v" style="font-weight:500;font-size:12px">' + esc(cell) + '</div></div>' : '') +
          (cellVolume ? '<div class="field" style="margin-bottom:8px"><div class="k">晶胞体积</div>' +
            '<div class="v">' + cellVolume.toFixed(2) + ' Å³</div></div>' : '') +
          (s.spaceGroup ? '<div class="field" style="margin-bottom:8px"><div class="k">空间群</div>' +
            '<div class="v">' + esc(s.spaceGroup) + '</div></div>' : '') +
          '<table class="el-table"><tbody>' + elRows + '</tbody></table>' +
          '<div class="section-label">三维结构</div>' +
          (model3d
            ? '<div class="viewer3d" id="viewer3d"></div>'
            : '<div class="viewer3d"><div class="viewer-note">该记录没有坐标数据（早期上传的记录未保存坐标）。<br />可在「内容管理 → 数据管理 → 补传结构」重新挂上 CIF。</div></div>')
        : '<p class="muted">此条目没有结构文件。</p>') +
      '</div>' +
      '</div></div>';

    host.classList.add('open');

    const closeBtn = $('#detailClose');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    const cp = $('#copyJson');
    if (cp) cp.addEventListener('click', function () { copyText(JSON.stringify(d, null, 2), '已复制该条 JSON'); });

    const del = $('#deleteDraft');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('确定删除这条本地草稿？删除后无法恢复。')) return;
      saveDrafts(loadDrafts().filter(function (x) { return x.id !== d.id; }));
      closeDrawer();
      showToast('已删除本地草稿');
      render();
    });

    $$('.st-card').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-row-id') === d.id);
    });

    if (s && model3d) {
      const hasCell = !!(s.cell && isFinite(s.cell.a) && s.cell.a > 0);
      render3D($('#viewer3d'), model3d.text, model3d.format, hasCell);
    }

    try { host.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* 忽略 */ }
  }

  function render3D(container, text, format, withCell) {
    if (!container) return;
    if (!HAS_3DMOL) { container.innerHTML = '<div class="viewer-note">3D 预览不可用（3Dmol 未加载）</div>'; return; }

    /* POSCAR 先转成 XYZ 再交给 3Dmol */
    let modelText = text;
    let modelFormat = format === 'xyz' ? 'xyz' : 'cif';
    if (format === 'poscar') {
      const parsed = window.PoscarParser ? window.PoscarParser.parse(text) : null;
      if (!parsed || !parsed.ok) {
        container.innerHTML = '<div class="viewer-note">POSCAR 无法转换为 3D 模型</div>';
        return;
      }
      modelText = window.PoscarParser.toXyz(parsed);
      modelFormat = 'xyz';
    }

    try {
      if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
      container.innerHTML = '';
      const viewer = $3Dmol.createViewer(container, { backgroundColor: 'white' });
      if (!viewer) throw new Error('viewer 创建失败');
      const model = viewer.addModel(modelText, modelFormat);
      viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.26 } });

      /* 画出晶胞盒子（需要模型带晶胞信息，即 CIF 格式） */
      if (withCell && modelFormat === 'cif') {
        try {
          viewer.addUnitCell(model, { box: { color: '#94a3b8' }, astyle: { linewidth: 0.8 } });
        } catch (e) { /* 老版本 3Dmol 可能不支持，忽略 */ }
      }

      viewer.zoomTo();
      viewer.render();
      currentViewer = viewer;
    } catch (e) {
      console.warn('3D 渲染失败', e);
      container.innerHTML = '<div class="viewer-note">3D 渲染失败，可能是浏览器不支持 WebGL</div>';
    }
  }

  /* ============================ 上传 ============================ */
  /* 支持三种输入：
       · 单个/多个 CIF 文件（散选，可选配同名 OUTCAR）
       · 单个文件夹（含 POSCAR/CIF + OUTCAR）
       · 多个文件夹（一次选中包含多个计算目录的父目录）
     文件夹上传时，用文件夹名作为记录名称。 */
  let uploadState = { items: [], unmatched: [], skipped: [] };

  const STRUCT_NAMES = /^(poscar|contcar)/i;

  function openUpload() {
    const modal = $('#uploadModal');
    if (!modal) return;
    uploadState = { items: [], unmatched: [], skipped: [] };
    modal.classList.add('open');
    if (!isUploadAuthed()) renderUploadLogin();
    else uploadStep1();
  }

  function renderUploadLogin() {
    const body = $('#uploadBody');
    const foot = $('#uploadFoot');
    if (!body) return;

    const now = Date.now();
    const locked = now < uploadLockUntil;
    const lockLeft = locked ? Math.ceil((uploadLockUntil - now) / 1000) : 0;

    body.innerHTML =
      '<div class="upload-login">' +
      '<div class="login-head"><div class="logo-mark">ICED</div>' +
      '<h2>上传计算数据</h2><p>请输入上传账号后继续</p></div>' +
      '<form id="uploadLoginForm">' +
      '<div class="form-row"><label>账号</label><input id="ulUser" autocomplete="username"' + (locked ? ' disabled' : '') + ' /></div>' +
      '<div class="form-row"><label>密码</label><input id="ulPass" type="password" autocomplete="current-password"' + (locked ? ' disabled' : '') + ' /></div>' +
      '<div class="login-error" id="ulError">' + (locked ? '尝试次数过多，请 ' + lockLeft + ' 秒后再试' : '') + '</div>' +
      '<button class="btn btn-primary login-submit" type="submit"' + (locked ? ' disabled' : '') + '>验证并继续</button>' +
      '</form>' +
      '<p class="login-note">上传账号可在「内容管理 → 上传权限」中修改。<br />验证后本标签页内无需重复输入。</p>' +
      '</div>';

    if (foot) {
      foot.innerHTML = '<span class="muted">上传计算数据需要验证账号</span>' +
        '<button class="btn" id="uploadCancel">取消</button>';
    }

    const form = $('#uploadLoginForm');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); doUploadLogin(); });
    const userEl = $('#ulUser');
    if (userEl && !locked) userEl.focus();
    const cancel = $('#uploadCancel');
    if (cancel) cancel.addEventListener('click', closeUpload);
  }

  function doUploadLogin() {
    const errEl = $('#ulError');
    const now = Date.now();
    if (now < uploadLockUntil) {
      if (errEl) errEl.textContent = '尝试次数过多，请 ' + Math.ceil((uploadLockUntil - now) / 1000) + ' 秒后再试';
      return;
    }

    const cfg = getUploadAuth();
    const user = valueOf('ulUser').trim();
    const pass = valueOf('ulPass');
    const okUser = user === String(cfg.username || '');
    const okPass = !!cfg.hash && sha256Hex(String(cfg.salt || '') + ':' + pass) === cfg.hash;

    if (okUser && okPass) {
      uploadFails = 0;
      setUploadAuthed();
      showToast('验证通过，可以上传了');
      uploadStep1();
      return;
    }

    uploadFails++;
    const left = (cfg.maxFails || 5) - uploadFails;
    if (left <= 0) {
      uploadLockUntil = Date.now() + (cfg.lockMs || 30000);
      uploadFails = 0;
      if (errEl) errEl.textContent = '尝试次数过多，请 ' + Math.ceil((cfg.lockMs || 30000) / 1000) + ' 秒后再试';
      const btn = $('#uploadLoginForm .login-submit');
      if (btn) btn.disabled = true;
      setTimeout(function () { if (!isUploadAuthed()) renderUploadLogin(); }, (cfg.lockMs || 30000) + 200);
      return;
    }
    if (errEl) errEl.textContent = '账号或密码不正确（还可尝试 ' + left + ' 次）';
  }

  function closeUpload() {
    const modal = $('#uploadModal');
    if (modal) modal.classList.remove('open');
    uploadState = { items: [], unmatched: [], skipped: [] };
    if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
  }

  function baseName(path) {
    const s = String(path || '');
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function stripExt(name) {
    return baseName(name).replace(/\.[^.\\/]+$/, '');
  }

  function matchKey(name) {
    return stripExt(name).toLowerCase().replace(/outcar/g, '').replace(/[^a-z0-9]/g, '');
  }

  function isOutcarName(name) {
    const b = baseName(name).toLowerCase();
    return /outcar/.test(b) || /\.out$/.test(b);
  }
  function isCifName(name) {
    return /\.(cif|mcif)$/i.test(baseName(name));
  }

  /* ---------------- 第一步：选择 ---------------- */
  function uploadStep1() {
    const body = $('#uploadBody');
    const foot = $('#uploadFoot');
    if (!body) return;

    body.innerHTML =
      '<div class="dropzone" id="dropzone">' +
      '<div class="dz-icon">🧪</div>' +
      '<div class="dz-title">拖拽文件或文件夹到这里</div>' +
      '<div class="dz-sub">文件夹里放 POSCAR / CIF 与 OUTCAR，会按文件夹名逐条建立记录</div>' +
      '<div class="dz-formats">CIF：.cif / .mcif　·　结构：POSCAR / CONTCAR　·　能量：OUTCAR　·　全部在浏览器本地解析</div>' +
      '</div>' +
      '<div class="upload-choices">' +
      '<button type="button" class="btn" id="pickFiles">选择文件</button>' +
      '<button type="button" class="btn" id="pickFolder">选择文件夹</button>' +
      '<span class="muted">可多选；选文件夹时里面的子目录会各自成为一条记录</span>' +
      '</div>' +
      '<input type="file" id="fileInput" accept=".cif,.mcif,.out,.txt,POSCAR,CONTCAR,OUTCAR,EIGENVAL" multiple hidden />' +
      '<input type="file" id="dirInput" webkitdirectory directory multiple hidden />';

    if (foot) {
      foot.innerHTML = '<span class="muted">' + esc(cget('upload.desc', '')) + '</span>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-mini" id="uploadLogout">退出上传</button>' +
        '<button class="btn" id="uploadCancel">取消</button></div>';
    }

    const dz = $('#dropzone');
    const fileInput = $('#fileInput');
    const dirInput = $('#dirInput');

    if (dz && fileInput) {
      dz.addEventListener('click', function () { fileInput.click(); });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
      });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        handleDrop(e.dataTransfer);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length) handleInputs(normalizeFiles(fileInput.files));
      });
    }

    if (dirInput) {
      dirInput.setAttribute('webkitdirectory', '');
      dirInput.setAttribute('directory', '');
      dirInput.addEventListener('change', function () {
        if (dirInput.files && dirInput.files.length) handleInputs(normalizeFiles(dirInput.files));
      });
    }

    const pf = $('#pickFiles');
    if (pf) pf.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
    const pd = $('#pickFolder');
    if (pd) pd.addEventListener('click', function (e) { e.stopPropagation(); dirInput.click(); });

    const cancel = $('#uploadCancel');
    if (cancel) cancel.addEventListener('click', closeUpload);

    const logout = $('#uploadLogout');
    if (logout) logout.addEventListener('click', function () {
      clearUploadAuthed();
      uploadState = { items: [], unmatched: [], skipped: [] };
      showToast('已退出上传权限');
      renderUploadLogin();
    });
  }

  function normalizeFiles(list) {
    return Array.prototype.slice.call(list).map(function (f) {
      return { file: f, path: f.webkitRelativePath || f.name || 'file' };
    });
  }

  /* ---------------- 拖拽（含文件夹） ---------------- */
  function handleDrop(dt) {
    if (!dt) return;

    const entries = [];
    if (dt.items && dt.items.length) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function') {
          const entry = item.webkitGetAsEntry();
          if (entry) entries.push(entry);
        }
      }
    }

    if (entries.length) {
      collectEntries(entries).then(function (inputs) {
        if (inputs.length) handleInputs(inputs);
        else showToast('没有读到可用文件');
      }, function () {
        showToast('读取文件夹失败，请改用「选择文件夹」');
      });
      return;
    }

    if (dt.files && dt.files.length) handleInputs(normalizeFiles(dt.files));
  }

  function readEntriesBatch(reader) {
    return new Promise(function (resolve, reject) {
      reader.readEntries(function (batch) { resolve(batch); }, reject);
    });
  }

  function walkEntry(entry, prefix, out) {
    return new Promise(function (resolve) {
      if (entry.isFile) {
        entry.file(function (file) {
          out.push({ file: file, path: prefix + entry.name });
          resolve();
        }, function () { resolve(); });
        return;
      }
      if (!entry.isDirectory) { resolve(); return; }
      const reader = entry.createReader();
      const step = function () {
        readEntriesBatch(reader).then(function (batch) {
          if (!batch.length) { resolve(); return; }
          let chain = Promise.resolve();
          batch.forEach(function (child) {
            chain = chain.then(function () { return walkEntry(child, prefix + entry.name + '/', out); });
          });
          chain.then(step);
        }, function () { resolve(); });
      };
      step();
    });
  }

  function collectEntries(entries) {
    const out = [];
    let chain = Promise.resolve();
    entries.forEach(function (e) { chain = chain.then(function () { return walkEntry(e, '', out); }); });
    return chain.then(function () { return out; });
  }

  /* ---------------- 第二步：解析与分组 ---------------- */
  function readText(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(fr.error || new Error('读取失败')); };
      fr.readAsText(file, 'utf-8');
    });
  }

  function pickStructure(files) {
    for (let i = 0; i < files.length; i++) {
      if (isCifName(files[i].path)) return { kind: 'cif', file: files[i].file, path: files[i].path };
    }
    for (let i = 0; i < files.length; i++) {
      if (STRUCT_NAMES.test(baseName(files[i].path))) return { kind: 'poscar', file: files[i].file, path: files[i].path };
    }
    return null;
  }

  function pickOutcar(files) {
    for (let i = 0; i < files.length; i++) {
      if (isOutcarName(files[i].path)) return { kind: 'outcar', file: files[i].file, path: files[i].path };
    }
    return null;
  }

  function isEigenvalName(name) { return /eigenval/i.test(baseName(name)); }

  function pickEigenval(files) {
    for (let i = 0; i < files.length; i++) {
      if (isEigenvalName(files[i].path)) return { kind: 'eigenval', file: files[i].file, path: files[i].path };
    }
    return null;
  }

  function parseStructureFile(kind, text, file) {
    if (kind === 'cif') {
      const info = window.CIFParser ? window.CIFParser.parse(text) : null;
      if (!info || !info.ok) return { error: (info && info.error) || 'CIF 解析失败' };
      return { structure: { kind: 'cif', file: baseName(file), text: text, info: info } };
    }
    const info = window.PoscarParser ? window.PoscarParser.parse(text) : null;
    if (!info || !info.ok) return { error: (info && info.error) || 'POSCAR 解析失败' };
    return { structure: { kind: 'poscar', file: baseName(file), text: text, info: info } };
  }

  function guessFrom(structure) {
    const counts = structure.info.atomCounts || {};
    const ci = window.CIFParser;
    const pi = window.PoscarParser;
    return {
      metal: (ci && ci.guessMetal ? ci.guessMetal(counts) : '') || (pi && pi.guessMetal ? pi.guessMetal(counts) : ''),
      support: (ci && ci.guessSupport ? ci.guessSupport(counts) : '') || (pi && pi.guessSupport ? pi.guessSupport(counts) : '')
    };
  }

  function makeItem(name, structure, outcar, dir, eigen) {
    const g = structure ? guessFrom(structure) : { metal: '', support: '' };
    return {
      name: name,
      catalyst: '',
      dir: dir || '',
      structure: structure,
      outcar: outcar,
      eigenval: eigen || null,
      metal: g.metal,
      support: g.support,
      energy: outcar && isNum(outcar.info.totalEnergy) ? outcar.info.totalEnergy : null
    };
  }

  async function handleInputs(inputs) {
    if (!inputs || !inputs.length) return;

    /* 按所在目录分组：每个目录 = 一条记录 */
    const groups = new Map();
    const flat = [];
    inputs.forEach(function (inp) {
      const idx = inp.path.lastIndexOf('/');
      if (idx < 0) { flat.push(inp); return; }
      const dir = inp.path.slice(0, idx);
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(inp);
    });

    const items = [];
    const skipped = [];
    const unmatched = [];

    /* ---- 文件夹 ---- */
    const dirs = Array.from(groups.keys());
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const files = groups.get(dir);
      const name = dir.split('/').pop();
      const picked = pickStructure(files);
      if (!picked) { skipped.push(name); continue; }
      try {
        const text = await readText(picked.file);
        const parsed = parseStructureFile(picked.kind, text, picked.path);
        if (parsed.error) { uploadError(baseName(picked.path), parsed.error); return; }

        let outcar = null;
        const oc = pickOutcar(files);
        if (oc) {
          const otext = await readText(oc.file);
          const oinfo = window.OutcarParser ? window.OutcarParser.parse(otext) : null;
          if (oinfo && oinfo.ok) outcar = { file: baseName(oc.path), text: otext, info: oinfo };
          else unmatched.push(baseName(oc.path));
        }

        let eigen = null;
        const ev = pickEigenval(files);
        if (ev) {
          const etext = await readText(ev.file);
          const einfo = window.EigenvalParser ? window.EigenvalParser.parse(etext) : null;
          if (einfo && einfo.ok) eigen = { file: baseName(ev.path), text: etext, info: einfo };
          else if (einfo) unmatched.push(baseName(ev.path));
        }

        items.push(makeItem(name, parsed.structure, outcar, dir, eigen));
      } catch (e) {
        uploadError(name, '文件读取失败');
        return;
      }
    }

    /* ---- 散选文件 ---- */
    if (flat.length) {
      const cifs = [];
      const outcars = [];
      for (let i = 0; i < flat.length; i++) {
        const inp = flat[i];
        const nm = inp.path;
        try {
          if (isOutcarName(nm)) {
            if (inp.file.size > 60 * 1024 * 1024) { showToast('OUTCAR 超过 60 MB，已跳过：' + nm); continue; }
            const text = await readText(inp.file);
            const info = window.OutcarParser ? window.OutcarParser.parse(text) : null;
            if (!info || !info.ok) { uploadError(nm, (info && info.error) || 'OUTCAR 解析失败'); return; }
            outcars.push({ file: nm, text: text, info: info });
          } else {
            if (inp.file.size > 8 * 1024 * 1024) { showToast('文件超过 8 MB，已跳过：' + nm); continue; }
            const text = await readText(inp.file);
            const parsed = parseStructureFile(isCifName(nm) ? 'cif' : 'poscar', text, nm);
            if (parsed.error) {
              if (isCifName(nm) || STRUCT_NAMES.test(baseName(nm))) { uploadError(nm, parsed.error); return; }
              continue;
            }
            cifs.push({ file: nm, text: text, info: parsed.structure.info });
          }
        } catch (e) {
          uploadError(nm, '文件读取失败');
          return;
        }
      }
      const paired = pairOutcars(cifs, outcars);
      paired.items.forEach(function (it) { items.push(it); });
      paired.unmatched.forEach(function (n) { unmatched.push(n); });
    }

    if (!items.length) {
      showToast(skipped.length ? '没有在文件夹里找到 POSCAR 或 CIF 结构文件' : '没有识别到可解析的文件');
      return;
    }

    uploadState.items = items;
    uploadState.unmatched = unmatched;
    uploadState.skipped = skipped;
    uploadStep2();
  }

  /* 散选文件时：CIF 按文件名配对 OUTCAR */
  function pairOutcars(cifs, outcars) {
    const items = cifs.map(function (c) {
      const base = baseName(c.file);
      const st = { kind: 'cif', file: base, text: c.text, info: c.info };
      return makeItem(stripExt(base), st, null, '');
    });
    const used = items.map(function () { return false; });
    const leftovers = [];

    outcars.forEach(function (o) {
      const key = matchKey(o.file);
      let hit = -1;
      if (key) {
        for (let i = 0; i < items.length; i++) {
          if (!used[i] && matchKey(items[i].structure.file) === key) { hit = i; break; }
        }
      }
      if (hit >= 0) {
        used[hit] = true;
        items[hit].outcar = o;
        items[hit].energy = isNum(o.info.totalEnergy) ? o.info.totalEnergy : null;
      } else {
        leftovers.push(o);
      }
    });

    const free = [];
    for (let i = 0; i < items.length; i++) if (!used[i]) free.push(i);
    while (leftovers.length === 1 && free.length === 1) {
      const idx = free.shift();
      const o = leftovers.shift();
      items[idx].outcar = o;
      items[idx].energy = isNum(o.info.totalEnergy) ? o.info.totalEnergy : null;
    }

    const unmatched = leftovers.map(function (o) { return o.file; });

    if (!items.length && outcars.length) {
      items.push(makeItem('', null, outcars[0], ''));
      for (let i = 1; i < outcars.length; i++) unmatched.push(outcars[i].file);
    }
    return { items: items, unmatched: unmatched };
  }

  function uploadError(name, msg) {
    const body = $('#uploadBody');
    if (!body) return;
    body.innerHTML =
      '<div class="error-box">解析 <b>' + esc(name) + '</b> 失败：' + esc(msg) + '</div>' +
      '<div class="dropzone" id="dropzone"><div class="dz-icon">↺</div><div class="dz-title">重新选择文件或文件夹</div></div>' +
      '<div class="upload-choices">' +
      '<button type="button" class="btn" id="retryFiles">选择文件</button>' +
      '<button type="button" class="btn" id="retryFolder">选择文件夹</button></div>' +
      '<input type="file" id="fileInput" multiple hidden />' +
      '<input type="file" id="dirInput" webkitdirectory directory multiple hidden />';

    const fi = $('#fileInput');
    const di = $('#dirInput');
    if (di) { di.setAttribute('webkitdirectory', ''); di.setAttribute('directory', ''); }
    if (fi) {
      fi.addEventListener('change', function () { if (fi.files && fi.files.length) handleInputs(normalizeFiles(fi.files)); });
      const dz = $('#dropzone');
      if (dz) dz.addEventListener('click', function () { fi.click(); });
    }
    if (di) di.addEventListener('change', function () { if (di.files && di.files.length) handleInputs(normalizeFiles(di.files)); });
    const rf = $('#retryFiles');
    if (rf) rf.addEventListener('click', function () { if (fi) fi.click(); });
    const rd = $('#retryFolder');
    if (rd) rd.addEventListener('click', function () { if (di) di.click(); });
  }

  /* ---------------- 第三步：预览与保存 ---------------- */
  function reactionOptionsHtml(selected) {
    const def = selected !== undefined ? selected : (state.view === 'reaction' && state.reactionId
      ? (reactionById(state.reactionId) || { reaction: '' }).reaction
      : (REACTIONS[0] ? REACTIONS[0].reaction : ''));
    return REACTIONS.map(function (r) {
      const t = reactionText(r);
      return '<option value="' + esc(r.reaction) + '"' + (r.reaction === def ? ' selected' : '') + '>' +
        esc(t.name || r.id) + '（' + esc(t.en || '') + '）</option>';
    }).join('');
  }

  function structureCardHtml(st) {
    if (!st) return '<div class="warn-box">未提供结构文件，本条记录将只有能量数据。</div>';
    const info = st.info;
    return '<div class="parse-summary"><div class="parse-head">' +
      '<span class="parse-title">✓ ' + esc(st.file) + '</span>' +
      '<span class="muted">' + esc(st.kind === 'cif' ? (info.dataBlock || 'CIF') : 'POSCAR') + '</span></div>' +
      '<div class="parse-stats"><div class="parse-stat"><b>' + info.elements.length + '</b>元素种类</div>' +
      '<div class="parse-stat"><b>' + info.totalAtoms + '</b>总原子数</div>' +
      '<div class="parse-stat"><b>' + esc(info.formula || '—') + '</b>化学式</div></div>' +
      '<div>' + info.elements.map(function (el) {
        return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(info.atomCounts[el])) + '</sub></span>';
      }).join('') + '</div></div>';
  }

  function outcarCardHtml(o) {
    if (!o) {
      return '<div class="parse-summary muted-card"><div class="parse-head"><span class="parse-title">未提供 OUTCAR</span></div>' +
        '<div class="parse-desc">可稍后手动填写总能，或重新上传 OUTCAR 自动解析。</div></div>';
    }
    const info = o.info;
    return '<div class="parse-summary"><div class="parse-head"><span class="parse-title">✓ ' + esc(o.file) + '</span>' +
      '<span class="muted">OUTCAR</span></div>' +
      '<div class="parse-stats"><div class="parse-stat"><b>' + numText(info.totalEnergy, 4) + '</b>总能 (eV)</div>' +
      '<div class="parse-stat"><b>' + esc(String(info.ionicSteps || '—')) + '</b>离子步</div>' +
      '<div class="parse-stat"><b>' + (isNum(info.fermi) ? info.fermi.toFixed(3) : '—') + '</b>E-fermi (eV)</div></div>' +
      (info.warnings || []).map(function (w) { return '<div class="warn-box">' + esc(w) + '</div>'; }).join('') +
      '</div>';
  }

  function noticesHtml() {
    let html = '';
    if (uploadState.skipped.length) {
      html += '<div class="warn-box">以下文件夹里没有找到 POSCAR 或 CIF，已跳过：' +
        esc(uploadState.skipped.join('、')) + '</div>';
    }
    if (uploadState.unmatched.length) {
      html += '<div class="warn-box">以下 OUTCAR 没能匹配到结构，未写入记录：' +
        esc(uploadState.unmatched.join('、')) + '</div>';
    }
    return html;
  }

  function uploadStep2() {
    if (!uploadState.items.length) { uploadStep1(); return; }
    if (uploadState.mode === 'molecule') {
      if (uploadState.items.length === 1) renderMolSingle(uploadState.items[0]);
      else renderMolBatch();
      return;
    }
    if (uploadState.items.length === 1) renderSingle(uploadState.items[0]);
    else renderBatch();
  }

  function renderSingle(it) {
    const st = it.structure;

    $('#uploadBody').innerHTML =
      '<div class="upload-grid">' +
      '<div>' +
      structureCardHtml(st) +
      outcarCardHtml(it.outcar) +
      noticesHtml() +
      (st ? '<div class="viewer3d" id="uploadViewer" style="height:280px"></div>' : '') +
      '</div>' +
      '<div>' +
      '<div class="form-row"><label>归属催化剂 *</label>' +
      '<input id="fCatalyst" list="catalystOptions" value="' + esc(it.catalyst || '') + '" placeholder="选择已有催化剂，或直接输入新建（如 Co3O4）" />' +
      catalystDatalist('catalystOptions') +
      '<div class="form-hint">一个催化剂可以包含多个结构；留空则用下面的结构名称</div></div>' +
      '<div class="form-row"><label>结构名称 *</label>' +
      '<input id="fFormula" value="' + esc(it.name) + '" placeholder="默认取文件名或文件夹名" /></div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>活性金属</label><input id="fMetal" value="' + esc(it.metal) + '" /></div>' +
      '<div class="form-row"><label>载体</label><input id="fSupport" value="' + esc(it.support) + '" placeholder="如 Co3O4" /></div>' +
      '</div>' +
      '<div class="form-row"><label>反应体系</label><select id="fReaction">' + reactionOptionsHtml() + '</select></div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>' + esc(descriptor('dftEnergy').label) + ' (eV)</label>' +
      '<input type="number" step="any" id="fEnergy" value="' + (isNum(it.energy) ? it.energy : '') + '" placeholder="来自 OUTCAR" /></div>' +
      '<div class="form-row"><label>' + esc(descriptor('barrier').label) + ' (eV)</label><input type="number" step="any" id="fBarrier" placeholder="可选" /></div>' +
      '</div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>' + esc(descriptor('eads').label) + ' (eV)</label><input type="number" step="any" id="fEads" placeholder="可选" /></div>' +
      '<div class="form-row"><label>' + esc(descriptor('reactionEnergy').label) + ' (eV)</label><input type="number" step="any" id="fRxn" placeholder="可选" /></div>' +
      '</div>' +
      '<div class="form-row"><label>数据来源</label><input id="fRef" placeholder="计算任务编号 / 文献" /></div>' +
      '<div class="form-row"><label>标注 / 备注</label><textarea id="fNote" rows="2" placeholder="如：Pd(111) 3×3 slab，4 层"></textarea></div>' +
      '</div></div>';

    const footEl = $('#uploadFoot');
    const canPublish = !!loadPublish();
    if (footEl) {
      footEl.innerHTML = '<button class="btn" id="uploadBack">重新选择</button>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        (canPublish ? '' : '<span class="muted" style="font-size:11.5px">想让所有人看到？先在内容管理里配置发布地址</span>') +
        '<button class="btn" id="uploadAgain">保存并继续</button>' +
        '<button class="btn" id="uploadSave">存入本地草稿</button>' +
        (canPublish ? '<button class="btn btn-primary" id="uploadPublish">保存并发布</button>' : '') +
        '</div>';
    }

    if (st) render3D($('#uploadViewer'), st.text, st.kind, true);

    const back = $('#uploadBack');
    if (back) back.addEventListener('click', function () { uploadState = { items: [], unmatched: [], skipped: [] }; uploadStep1(); });
    const again = $('#uploadAgain');
    if (again) again.addEventListener('click', function () { if (saveUpload()) { uploadState = { items: [], unmatched: [], skipped: [] }; uploadStep1(); } });
    const save = $('#uploadSave');
    if (save) save.addEventListener('click', function () { if (saveUpload()) closeUpload(); });
    const pub = $('#uploadPublish');
    if (pub) pub.addEventListener('click', function () { publishSingle(it).then(function (ok) { if (ok) closeUpload(); }); });
  }

  function renderBatch() {
    const items = uploadState.items;
    const withStruct = items.filter(function (x) { return x.structure; }).length;
    const withEnergy = items.filter(function (x) { return isNum(x.energy); }).length;

    const rows = items.map(function (it, idx) {
      const info = it.structure ? it.structure.info : null;
      return '<tr data-item="' + idx + '">' +
        '<td class="fname" title="' + esc(it.dir || (it.structure ? it.structure.file : '')) + '">' +
        (it.dir ? '📁 ' : '') + esc(it.name || (it.structure ? it.structure.file : '—')) + '</td>' +
        '<td><input class="cell-in" data-field="formula" value="' + esc(it.name) + '" placeholder="必填" /></td>' +
        '<td><input class="cell-in" data-field="metal" value="' + esc(it.metal) + '" /></td>' +
        '<td><input class="cell-in" data-field="support" value="' + esc(it.support) + '" /></td>' +
        '<td><input class="cell-in" type="number" step="any" data-field="barrier" placeholder="—" /></td>' +
        '<td><input class="cell-in" type="number" step="any" data-field="eads" placeholder="—" /></td>' +
        '<td><input class="cell-in" type="number" step="any" data-field="energy" value="' + (isNum(it.energy) ? it.energy : '') + '" placeholder="—" /></td>' +
        '<td class="num">' + (info ? info.elements.length + ' 种' : '—') + '</td>' +
        '<td class="num">' + (info ? info.totalAtoms : '—') + '</td>' +
        '<td><button type="button" class="icon-btn" data-remove-item>×</button></td>' +
        '</tr>';
    }).join('');

    $('#uploadBody').innerHTML =
      noticesHtml() +
      '<div class="batch-summary">' +
      '<span>共 <b>' + items.length + '</b> 条结构</span>' +
      '<span>已解析 <b>' + withStruct + '</b> 个</span>' +
      '<span>已匹配 OUTCAR <b>' + withEnergy + '</b> 个</span>' +
      '<span class="muted">名称默认取文件名或文件夹名，可直接在表格里改</span>' +
      '</div>' +
      '<div class="batch-wrap"><table class="batch-table">' +
      '<thead><tr><th>名称 / 文件夹</th><th>结构名称 *</th><th>金属</th><th>载体</th>' +
      '<th>Ea (eV)</th><th>Eads (eV)</th><th>总能 (eV)</th><th>元素</th><th>原子</th><th></th></tr></thead>' +
      '<tbody id="batchBody">' + rows + '</tbody></table></div>' +
      '<div class="form-grid3" style="margin-top:16px">' +
      '<div class="form-row"><label>归属催化剂（应用到全部）</label>' +
      '<input id="batchCatalyst" list="catalystOptions" placeholder="如 Co3O4；也可新建" />' + catalystDatalist('catalystOptions') + '</div>' +
      '<div class="form-row"><label>载体（一键填写到全部）</label>' +
      '<input id="batchSupport" placeholder="如 Co3O4；留空保留每行值" /></div>' +
      '<div class="form-row"><label>活性金属（应用到全部）</label>' +
      '<input id="batchMetal" placeholder="留空保留自动推测值" /></div>' +
      '</div>' +
      '<div class="form-grid3">' +
      '<div class="form-row"><label>反应体系（应用到全部）</label><select id="batchReaction">' + reactionOptionsHtml() + '</select></div>' +
      '<div class="form-row"><label>数据来源</label><input id="batchRef" placeholder="计算任务编号 / 文献" /></div>' +
      '<div class="form-row"><label>备注</label><input id="batchNote" placeholder="可选，应用到全部" /></div>' +
      '</div>';

    const footEl = $('#uploadFoot');
    const canPublish = !!loadPublish();
    if (footEl) {
      footEl.innerHTML = '<button class="btn" id="uploadBack">重新选择</button>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<span class="muted" style="align-self:center">将保存 ' + items.length + ' 条记录</span>' +
        '<button class="btn" id="uploadSaveAll">存入本地草稿</button>' +
        (canPublish ? '<button class="btn btn-primary" id="uploadPublishAll">全部保存并发布</button>' : '') +
        '</div>';
    }

    $$('#batchBody [data-remove-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tr = btn.closest('tr');
        const idx = parseInt(tr.getAttribute('data-item'), 10);
        uploadState.items.splice(idx, 1);
        if (!uploadState.items.length) { uploadStep1(); return; }
        renderBatch();
      });
    });

    const back = $('#uploadBack');
    if (back) back.addEventListener('click', function () { uploadState = { items: [], unmatched: [], skipped: [] }; uploadStep1(); });
    const saveAll = $('#uploadSaveAll');
    if (saveAll) saveAll.addEventListener('click', function () { if (saveBatch()) closeUpload(); });
    const pubAll = $('#uploadPublishAll');
    if (pubAll) pubAll.addEventListener('click', function () { publishBatch().then(function (ok) { if (ok) closeUpload(); }); });
  }

  function readNum(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = String(el.value || '').trim();
    if (!raw) return null;
    const v = parseFloat(raw);
    return isFinite(v) ? v : null;
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function maxIdNumber() {
    let maxNum = 0;
    loadDrafts().concat(curated()).forEach(function (d) {
      if (isMolecule(d)) return;
      const m = String(d.id || '').match(/(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    return maxNum;
  }

  function maxMolNumber() {
    let maxNum = 0;
    loadDrafts().concat(curated()).forEach(function (d) {
      if (!isMolecule(d)) return;
      const m = String(d.id || '').match(/(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    return maxNum;
  }

  function makeRecord(it, f) {
    const st = it.structure;
    const cs = st ? compactStructure(st) : null;
    return {
      id: f.id,
      catalyst: f.catalyst || f.formula,
      formula: f.formula,
      metal: f.metal,
      support: f.support,
      reaction: f.reaction,
      ref: f.ref,
      note: f.note,
      dftEnergy: isNum(f.energy) ? f.energy : null,
      barrier: isNum(f.barrier) ? f.barrier : null,
      eads: isNum(f.eads) ? f.eads : null,
      reactionEnergy: isNum(f.reactionEnergy) ? f.reactionEnergy : null,
      evac: null,
      structure: st ? {
        file: st.file,
        format: st.kind,
        formula: st.info.formula || '',
        elements: st.info.elements.slice(),
        atomCounts: st.info.atomCounts,
        totalAtoms: st.info.totalAtoms,
        cell: st.info.cell,
        spaceGroup: st.info.spaceGroup || '',
        z: isNum(st.info.z) ? st.info.z : null,
        cif: st.text,
        atoms: cs.atoms,
        coord: cs.coord
      } : null,
      outcar: it.outcar ? {
        file: it.outcar.file,
        totalEnergy: it.outcar.info.totalEnergy,
        energySigma0: it.outcar.info.energySigma0,
        fermi: it.outcar.info.fermi,
        nions: it.outcar.info.nions,
        volume: it.outcar.info.volume,
        ionicSteps: it.outcar.info.ionicSteps
      } : null,
      source: 'draft',
      addedAt: new Date().toISOString()
    };
  }

  function saveUpload() {
    return uploadState.items.length === 1 ? saveSingle(uploadState.items[0]) : saveBatch();
  }

  function saveSingle(it) {
    const record = buildSingleRecord(it);
    if (!record) return false;

    const drafts = loadDrafts();
    drafts.push(record);
    if (!saveDrafts(drafts)) return false;

    showToast('已保存到本地草稿：' + record.formula +
      (isNum(record.dftEnergy) ? ' · 总能 ' + record.dftEnergy.toFixed(4) + ' eV' : '') +
      (record.structure ? ' · ' + record.structure.elements.length + ' 种元素' : ''));
    render();
    return true;
  }

  function buildSingleRecord(it) {
    const formulaEl = document.getElementById('fFormula');
    const formula = formulaEl ? String(formulaEl.value || '').trim() : '';
    if (!formula) {
      showToast('请填写结构名称');
      if (formulaEl) formulaEl.focus();
      return null;
    }
    const catalyst = valueOf('fCatalyst');
    return makeRecord(it, {
      id: 'CAT-' + String(maxIdNumber() + 1).padStart(3, '0'),
      catalyst: catalyst || formula,
      formula: formula,
      metal: valueOf('fMetal'),
      support: valueOf('fSupport'),
      reaction: valueOf('fReaction'),
      ref: valueOf('fRef'),
      note: valueOf('fNote'),
      energy: readNum('fEnergy'),
      barrier: readNum('fBarrier'),
      eads: readNum('fEads'),
      reactionEnergy: readNum('fRxn')
    });
  }

  async function publishSingle(it) {
    const record = buildSingleRecord(it);
    if (!record) return false;
    return publishFromUpload([record]);
  }

  function buildBatchRecords() {
    const rows = $$('#batchBody tr[data-item]');
    if (!rows.length) return { records: [], firstBad: null, empty: true };

    const reaction = valueOf('batchReaction');
    const ref = valueOf('batchRef');
    const note = valueOf('batchNote');
    /* 一键填写：留空则保留每行自己的值 */
    const sharedCatalyst = valueOf('batchCatalyst');
    const sharedSupport = valueOf('batchSupport');
    const sharedMetal = valueOf('batchMetal');

    const records = [];
    let startId = maxIdNumber();
    let firstBad = null;

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const idx = parseInt(tr.getAttribute('data-item'), 10);
      const it = uploadState.items[idx];
      if (!it) continue;
      const get = function (field) {
        const el = tr.querySelector('[data-field="' + field + '"]');
        return el ? String(el.value || '').trim() : '';
      };
      const num = function (field) {
        const v = get(field);
        if (!v) return null;
        const n = parseFloat(v);
        return isFinite(n) ? n : null;
      };
      const formula = get('formula');
      if (!formula) { firstBad = tr; break; }

      startId++;
      records.push(makeRecord(it, {
        id: 'CAT-' + String(startId).padStart(3, '0'),
        catalyst: sharedCatalyst || formula,
        formula: formula,
        metal: sharedMetal || get('metal'),
        support: sharedSupport || get('support'),
        reaction: reaction,
        ref: ref,
        note: note,
        energy: num('energy'),
        barrier: num('barrier'),
        eads: num('eads'),
        reactionEnergy: null
      }));
    }

    return { records: records, firstBad: firstBad, empty: false };
  }

  function saveBatch() {
    const built = buildBatchRecords();
    if (built.empty) { showToast('没有可保存的结构'); return false; }
    if (built.firstBad) {
      showToast('有行未填写化学式，请补全后再保存');
      const input = built.firstBad.querySelector('[data-field="formula"]');
      if (input) input.focus();
      return false;
    }
    if (!built.records.length) { showToast('没有可保存的结构'); return false; }

    const drafts = loadDrafts();
    built.records.forEach(function (r) { drafts.push(r); });
    if (!saveDrafts(drafts)) return false;

    showToast('已保存 ' + built.records.length + ' 条到本地草稿');
    render();
    return true;
  }

  async function publishBatch() {
    const built = buildBatchRecords();
    if (built.empty) { showToast('没有可发布的结构'); return false; }
    if (built.firstBad) {
      showToast('有行未填写化学式，请补全后再发布');
      const input = built.firstBad.querySelector('[data-field="formula"]');
      if (input) input.focus();
      return false;
    }
    if (!built.records.length) { showToast('没有可发布的结构'); return false; }
    return publishFromUpload(built.records);
  }

  /* ============================ 小分子上传 ============================ */
  function openMoleculeUpload() {
    const modal = $('#uploadModal');
    if (!modal) return;
    uploadState = { items: [], unmatched: [], skipped: [], mode: 'molecule' };
    modal.classList.add('open');
    if (!isUploadAuthed()) renderUploadLogin();
    else uploadStep1();
  }

  function molResultText(it) {
    const info = it.outcar && it.outcar.info ? it.outcar.info : null;
    if (!info) return '<span class="muted">未匹配到 OUTCAR</span>';
    return '总能 <b>' + (isNum(info.totalEnergy) ? info.totalEnergy.toFixed(4) : '—') + '</b> eV' +
      '　·　磁矩 <b>' + (isNum(info.magnetization) ? info.magnetization.toFixed(3) : '—') + '</b> μB';
  }

  function buildMoleculeRecord(it, f) {
    const st = it.structure;
    const cs = st ? compactStructure(st) : null;
    const info = (it.outcar && it.outcar.info) ? it.outcar.info : null;

    return {
      id: 'MOL-' + String(f.seq).padStart(3, '0'),
      kind: 'molecule',
      name: f.name,
      formula: f.name,
      ref: f.ref || '',
      note: f.note || '',
      structure: st ? {
        file: st.file,
        format: st.kind,
        formula: st.info.formula || '',
        elements: st.info.elements.slice(),
        atomCounts: st.info.atomCounts,
        totalAtoms: st.info.totalAtoms,
        cell: st.info.cell,
        spaceGroup: st.info.spaceGroup || '',
        z: isNum(st.info.z) ? st.info.z : null,
        cif: st.text,
        atoms: cs.atoms,
        coord: cs.coord
      } : null,
      outcar: info ? {
        file: it.outcar.file,
        totalEnergy: info.totalEnergy,
        energySigma0: info.energySigma0,
        fermi: info.fermi,
        nions: info.nions,
        volume: info.volume,
        ionicSteps: info.ionicSteps,
        magnetization: info.magnetization,
        magPerAtom: Array.isArray(info.magPerAtom) ? info.magPerAtom : [],
        nelect: info.nelect,
        nbands: info.nbands,
        encut: info.encut,
        ispin: info.ispin,
        converged: info.converged
      } : null,
      eigen: (it.eigenval && it.eigenval.info) ? {
        file: it.eigenval.file,
        nelect: it.eigenval.info.nelect,
        nkpts: it.eigenval.info.nkpts,
        nbands: it.eigenval.info.nbands,
        ispin: it.eigenval.info.ispin,
        homo: it.eigenval.info.homo,
        lumo: it.eigenval.info.lumo,
        gap: it.eigenval.info.gap
      } : null,
      addedAt: new Date().toISOString()
    };
  }

  function renderMolSingle(it) {
    const st = it.structure;

    $('#uploadBody').innerHTML =
      '<div class="upload-grid">' +
      '<div>' +
      structureCardHtml(st) +
      outcarCardHtml(it.outcar) +
      noticesHtml() +
      (st ? '<div class="viewer3d" id="uploadViewer" style="height:280px"></div>' : '') +
      '</div>' +
      '<div>' +
      '<div class="form-row"><label>分子名称 *</label>' +
      '<input id="mName" value="' + esc(it.name) + '" placeholder="如 CH4、CO2、C2H6" /></div>' +
      '<div class="form-row"><label>计算结果（自动识别）</label>' +
      '<div class="mol-result">' + molResultText(it) + '</div></div>' +
      '<div class="form-row"><label>数据来源</label><input id="mRef" placeholder="计算任务编号 / 文献" /></div>' +
      '<div class="form-row"><label>备注</label><textarea id="mNote" rows="2" placeholder="如：PBE/def2-TZVP，三重态"></textarea></div>' +
      '<p class="form-hint">能量取 OUTCAR 的 free energy TOTEN，磁矩取 number of electron … magnetization。</p>' +
      '</div></div>';

    const footEl = $('#uploadFoot');
    const canPublish = !!loadPublish();
    if (footEl) {
      footEl.innerHTML = '<button class="btn" id="uploadBack">重新选择</button>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<button class="btn" id="uploadSave">存入本地草稿</button>' +
        (canPublish ? '<button class="btn btn-primary" id="uploadPublish">保存并发布</button>' : '') +
        '</div>';
    }

    if (st) render3D($('#uploadViewer'), st.text, st.kind, true);

    const back = $('#uploadBack');
    if (back) back.addEventListener('click', function () { uploadState = { items: [], unmatched: [], skipped: [], mode: 'molecule' }; uploadStep1(); });
    const save = $('#uploadSave');
    if (save) save.addEventListener('click', function () { if (saveMolSingle(it)) closeUpload(); });
    const pub = $('#uploadPublish');
    if (pub) pub.addEventListener('click', function () {
      const rec = buildMolFromSingle(it);
      if (rec) publishFromUpload([rec]).then(function (ok) { if (ok) closeUpload(); });
    });
  }

  function renderMolBatch() {
    const items = uploadState.items;

    const rows = items.map(function (it, idx) {
      const info = it.structure ? it.structure.info : null;
      const oc = it.outcar && it.outcar.info ? it.outcar.info : null;
      return '<tr data-item="' + idx + '">' +
        '<td class="fname" title="' + esc(it.dir || (it.structure ? it.structure.file : '')) + '">' +
        (it.dir ? '📁 ' : '') + esc(it.name || (it.structure ? it.structure.file : '—')) + '</td>' +
        '<td><input class="cell-in" data-field="name" value="' + esc(it.name) + '" placeholder="必填" /></td>' +
        '<td class="num">' + (info ? info.elements.join(' ') : '—') + '</td>' +
        '<td class="num">' + (info ? info.totalAtoms : '—') + '</td>' +
        '<td class="num">' + (oc && isNum(oc.totalEnergy) ? oc.totalEnergy.toFixed(4) : '—') + '</td>' +
        '<td class="num">' + (oc && isNum(oc.magnetization) ? oc.magnetization.toFixed(3) : '—') + '</td>' +
        '<td><button type="button" class="icon-btn" data-remove-item>×</button></td>' +
        '</tr>';
    }).join('');

    $('#uploadBody').innerHTML =
      noticesHtml() +
      '<div class="batch-summary">' +
      '<span>共 <b>' + items.length + '</b> 个小分子</span>' +
      '<span>已匹配 OUTCAR <b>' + items.filter(function (x) { return x.outcar; }).length + '</b> 个</span>' +
      '<span class="muted">名称默认取文件名，可直接在表格里改</span>' +
      '</div>' +
      '<div class="batch-wrap"><table class="batch-table">' +
      '<thead><tr><th>文件</th><th>分子名称 *</th><th>元素</th><th>原子</th><th>总能 (eV)</th><th>磁矩 (μB)</th><th></th></tr></thead>' +
      '<tbody id="batchBody">' + rows + '</tbody></table></div>' +
      '<div class="form-grid2" style="margin-top:16px">' +
      '<div class="form-row"><label>数据来源</label><input id="mRef" placeholder="计算任务编号 / 文献" /></div>' +
      '<div class="form-row"><label>备注</label><input id="mNote" placeholder="可选，应用到全部" /></div>' +
      '</div>';

    const footEl = $('#uploadFoot');
    const canPublish = !!loadPublish();
    if (footEl) {
      footEl.innerHTML = '<button class="btn" id="uploadBack">重新选择</button>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<span class="muted" style="align-self:center">将保存 ' + items.length + ' 条</span>' +
        '<button class="btn" id="uploadSaveAll">存入本地草稿</button>' +
        (canPublish ? '<button class="btn btn-primary" id="uploadPublishAll">全部保存并发布</button>' : '') +
        '</div>';
    }

    $$('#batchBody [data-remove-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tr = btn.closest('tr');
        const idx = parseInt(tr.getAttribute('data-item'), 10);
        uploadState.items.splice(idx, 1);
        if (!uploadState.items.length) { uploadStep1(); return; }
        renderMolBatch();
      });
    });

    const back = $('#uploadBack');
    if (back) back.addEventListener('click', function () { uploadState = { items: [], unmatched: [], skipped: [], mode: 'molecule' }; uploadStep1(); });
    const saveAll = $('#uploadSaveAll');
    if (saveAll) saveAll.addEventListener('click', function () { if (saveMolBatch()) closeUpload(); });
    const pubAll = $('#uploadPublishAll');
    if (pubAll) pubAll.addEventListener('click', function () {
      const recs = buildMolRecords();
      if (recs.length) publishFromUpload(recs).then(function (ok) { if (ok) closeUpload(); });
    });
  }

  function buildMolFromSingle(it) {
    const name = (valueOf('mName') || it.name || '').trim();
    if (!name) { showToast('请填写分子名称'); return null; }
    return buildMoleculeRecord(it, {
      seq: maxMolNumber() + 1,
      name: name,
      ref: valueOf('mRef'),
      note: valueOf('mNote')
    });
  }

  function buildMolRecords() {
    const rows = $$('#batchBody tr[data-item]');
    const ref = valueOf('mRef');
    const note = valueOf('mNote');
    const out = [];
    let seq = maxMolNumber();

    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const idx = parseInt(tr.getAttribute('data-item'), 10);
      const it = uploadState.items[idx];
      if (!it) continue;
      const nameEl = tr.querySelector('[data-field="name"]');
      const name = nameEl ? String(nameEl.value || '').trim() : '';
      if (!name) { showToast('有行未填写分子名称'); if (nameEl) nameEl.focus(); return []; }
      seq++;
      out.push(buildMoleculeRecord(it, { seq: seq, name: name, ref: ref, note: note }));
    }
    return out;
  }

  function saveMolSingle(it) {
    const rec = buildMolFromSingle(it);
    if (!rec) return false;
    const drafts = loadDrafts();
    drafts.push(rec);
    if (!saveDrafts(drafts)) return false;
    showToast('已保存到本地草稿：' + rec.name);
    render();
    return true;
  }

  function saveMolBatch() {
    const recs = buildMolRecords();
    if (!recs.length) return false;
    const drafts = loadDrafts();
    recs.forEach(function (r) { drafts.push(r); });
    if (!saveDrafts(drafts)) return false;
    showToast('已保存 ' + recs.length + ' 个小分子到本地草稿');
    render();
    return true;
  }

  /* ============================ 导出 ============================ */
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* 发布用：去掉整份 CIF 原文，但完整保留结构信息——
     atoms（坐标）、coord、cell（a/b/c/α/β/γ）、spaceGroup、z、formula、
     elements、atomCounts、totalAtoms、file、format 全部照原样带走。 */
  function stripForExport(d) {
    const copy = {};
    Object.keys(d).forEach(function (k) {
      if (k === 'source') return;
      if (k === 'structure' && d.structure) {
        const s = {};
        Object.keys(d.structure).forEach(function (sk) { if (sk !== 'cif') s[sk] = d.structure[sk]; });
        copy.structure = s;
        return;
      }
      copy[k] = d[k];
    });
    return copy;
  }

  function exportDataJs() {
    const drafts = loadDrafts();
    if (!drafts.length) { showToast('本地还没有草稿可导出'); return; }
    const body = drafts.map(function (d) { return '  ' + JSON.stringify(stripForExport(d)); }).join(',\n');
    const content = '/* 由页面「导出 data.js」生成，' + new Date().toISOString().slice(0, 10) + ' */\n' +
      'window.CATALYST_DATA = [\n' + body + '\n];\n';
    download('data.js', content, 'text/javascript;charset=utf-8');
    showToast('已导出 ' + drafts.length + ' 条草稿为 data.js');
  }

  function exportJson() {
    const rows = allRecords();
    download('catalyst-db.json', JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
    showToast('已导出 JSON（' + rows.length + ' 条）');
  }

  function exportCsv() {
    const rows = allRecords();
    if (!rows.length) { showToast('暂无数据可导出'); return; }
    const head = ['id', 'catalyst', 'formula', 'metal', 'support', 'reaction', 'elements', 'totalAtoms',
      'barrier_eV', 'eads_eV', 'reactionEnergy_eV', 'dftEnergy_eV', 'outcar', 'ref', 'note'];
    function q(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }
    const lines = [head.map(q).join(',')].concat(rows.map(function (d) {
      const s = structureOf(d);
      return [d.id, catalystOf(d), d.formula, d.metal, d.support, d.reaction,
        s ? (s.elements || []).join(' ') : '', s ? s.totalAtoms : '',
        d.barrier, d.eads, d.reactionEnergy, d.dftEnergy,
        d.outcar ? d.outcar.file : '', d.ref, d.note].map(q).join(',');
    }));
    download('catalyst-db.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
    showToast('已导出 CSV（' + rows.length + ' 条）');
  }

  function copyText(text, msg) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast(msg); }, function () { fallback(); showToast(msg); });
    } else { fallback(); showToast(msg); }
  }

  function toggleExportMenu(anchor) {
    let menu = $('#exportMenu');
    if (menu) { menu.remove(); return; }
    menu = document.createElement('div');
    menu.id = 'exportMenu';
    menu.className = 'popover open';
    menu.innerHTML =
      '<button data-act="js">导出 data.js（本地草稿）</button>' +
      '<button data-act="json">导出全部 JSON</button>' +
      '<button data-act="csv">导出 CSV</button>';
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = Math.max(10, rect.right - 210) + 'px';
    menu.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      menu.remove();
      const act = btn.getAttribute('data-act');
      if (act === 'js') exportDataJs();
      else if (act === 'json') exportJson();
      else if (act === 'csv') exportCsv();
    });
    setTimeout(function () {
      document.addEventListener('click', function hide(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', hide); }
      });
    }, 0);
  }

  /* ============================ 提示 / 渲染入口 ============================ */
  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function render() {
    applyRoute();
    C = effectiveContent();

    const brand = $('#brandName');
    if (brand) brand.textContent = cget('site.name', 'ZJU-ICED');
    const sub = $('#brandSub');
    if (sub) sub.textContent = cget('site.subtitle', 'Catalyst DFT Database');
    const foot = $('#footerNote');
    if (foot) foot.textContent = cget('site.footer', '');

    renderSidebar();

    const crumb = $('#crumb');
    if (state.view === 'reaction') {
      const r = reactionById(state.reactionId);
      crumb.innerHTML = r
        ? esc(cget('dashboard.title', '数据总览')) + ' / <b>' + esc(reactionText(r).name || r.id) + '</b>'
        : esc(cget('dashboard.title', '数据总览'));
    } else if (state.view === 'admin') {
      crumb.innerHTML = esc(cget('dashboard.title', '数据总览')) + ' / <b>' + esc(cget('admin.title', '内容管理')) + '</b>';
    } else if (state.view === 'adminData') {
      crumb.innerHTML = esc(cget('dashboard.title', '数据总览')) + ' / ' + esc(cget('admin.title', '内容管理')) + ' / <b>数据管理</b>';
    } else if (state.view === 'about') {
      crumb.innerHTML = '<b>' + esc(cget('about.title', '关于我们')) + '</b>';
    } else if (state.view === 'whatWeDo') {
      crumb.innerHTML = '<b>' + esc(cget('whatWeDo.title', '我们做什么')) + '</b>';
    } else if (state.view === 'molecules') {
      crumb.innerHTML = '<b>' + esc(cget('molecules.title', '小分子性质')) + '</b>';
    } else {
      crumb.innerHTML = '<b>' + esc(cget('dashboard.title', '数据总览')) + '</b>';
    }

    disposeCharts();

    if (state.view === 'admin') {
      if (isAuthed()) renderAdmin();
      else renderLogin();
    } else if (state.view === 'adminData') {
      if (isAuthed()) renderAdminData();
      else renderLogin();
    } else if (state.view === 'reaction') {
      const r = reactionById(state.reactionId);
      if (r) renderReactionView(r);
      else renderDashboard();
    } else if (state.view === 'about') {
      renderAbout();
    } else if (state.view === 'whatWeDo') {
      renderWhatWeDo();
    } else if (state.view === 'molecules') {
      renderMolecules();
    } else {
      renderDashboard();
    }
  }

  /* ============================ 启动 ============================ */
  function boot() {
    const uploadBtn = $('#uploadBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', openUpload);

    const modal = $('#uploadModal');
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeUpload(); });
    const modalClose = $('#modalClose');
    if (modalClose) modalClose.addEventListener('click', closeUpload);

    const overlay = $('#drawerOverlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);

    const exportBtn = $('#exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleExportMenu(exportBtn); });

    const menuBtn = $('#menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        const sb = $('#sidebar');
        if (sb) sb.classList.toggle('open');
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeUpload();
        closeDrawer();
        const gm = $('#genericModal');
        if (gm) gm.classList.remove('open');
        const m = $('#exportMenu');
        if (m) m.remove();
      }
    });

    const genericModal = $('#genericModal');
    if (genericModal) {
      genericModal.addEventListener('click', function (e) {
        if (e.target === genericModal) genericModal.classList.remove('open');
      });
    }

    let resizeTimer = null;
    window.addEventListener('resize', function () {
      if (!HAS_ECHARTS) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        Object.keys(chartRefs).forEach(function (k) {
          if (chartRefs[k]) { try { chartRefs[k].resize(); } catch (e) { /* 忽略 */ } }
        });
      }, 120);
    });

    window.addEventListener('hashchange', render);

    if (!location.hash) history.replaceState(null, '', '#/');
    render();

    /* 后台再校验一次最新数据，绕过 GitHub Pages 对 data.js 的 10 分钟缓存 */
    setTimeout(function () { refreshDataFromNetwork(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
