/* =========================================================================
   xyz-parser.js — 解析 .xyz 结构文件
   -------------------------------------------------------------------------
   支持两种写法：

   ① 标准 XYZ（原子数 / 注释 / 元素 x y z）
        5
        water molecule
        O   0.000000   0.000000   0.000000
        H   0.758000   0.586000   0.000000
        ...

   ② 扩展 XYZ（注释行里带晶胞）
        2
        Lattice="4.10 0 0 0 4.10 0 0 0 4.10" Properties=species:S:1:pos:R:3
        Ag  0.0 0.0 0.0
        Ag  1.0 1.0 1.0

      Lattice 支持 6 个值（a b c α β γ）或 9 个值（三行晶格矢量，Å）。

   返回结构与 cif-parser / poscar-parser 保持一致：
     { ok, formula, elements, atomCounts, totalAtoms, cell, spaceGroup, z,
       coord:'cart', atoms:[{symbol,x,y,z}], comment, warnings }
   ========================================================================= */
window.XYZParser = (function () {
  'use strict';

  var SYMBOLS = null;

  function symbolSet() {
    if (SYMBOLS) return SYMBOLS;
    SYMBOLS = {};
    var list = Array.isArray(window.ELEMENTS) ? window.ELEMENTS : [];
    list.forEach(function (e) {
      if (e && e.s) SYMBOLS[e.s.toLowerCase()] = e.s;
      if (e && e.z) SYMBOLS[String(e.z)] = e.s;
    });
    /* 兜底：即使 periodic.js 没加载，也认得常见元素 */
    ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si',
      'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni',
      'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb',
      'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
      'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho',
      'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
      'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'].forEach(function (s) {
      if (!SYMBOLS[s.toLowerCase()]) SYMBOLS[s.toLowerCase()] = s;
    });
    return SYMBOLS;
  }

  /* O / O1 / OW / ow / 8 -> 标准元素符号 */
  function normalizeElement(tok) {
    var t = String(tok || '').trim();
    if (!t) return '';
    if (/^\d+$/.test(t)) return symbolSet()[t] || '';
    var letters = t.replace(/[^A-Za-z]/g, '');
    if (!letters) return '';
    var set = symbolSet();
    /* 先整体匹配（Two-letter），再逐段尝试 */
    var two = letters.slice(0, 2);
    if (letters.length >= 2 && set[two.toLowerCase()]) return set[two.toLowerCase()];
    var one = letters.charAt(0);
    if (set[one.toLowerCase()]) return set[one.toLowerCase()];
    /* 常见变体：C1 -> C，Ow -> O（已覆盖），HW -> H */
    var m = letters.match(/^([A-Za-z]{1,2})/);
    if (m && set[m[1].toLowerCase()]) return set[m[1].toLowerCase()];
    return '';
  }

  function num(s) {
    var v = parseFloat(s);
    return isFinite(v) ? v : NaN;
  }

  function pad(n, w) {
    var s = String(n);
    while (s.length < (w || 2)) s = '0' + s;
    return s;
  }

  /* 生成化学式：
     · 含 C/H 的（有机、分子）用 Hill 记法：C → H → 其余按字母
     · 纯无机/金属间化合物按出现顺序（与文件名习惯一致，如 ZnPd2） */
  function formulaOf(counts, order) {
    var seq = order || [];
    if (counts.C || counts.H) {
      seq = [];
      if (counts.C) seq.push('C');
      if (counts.H) seq.push('H');
      Object.keys(counts).filter(function (el) {
        return el !== 'C' && el !== 'H';
      }).sort().forEach(function (el) { seq.push(el); });
    }
    return seq.map(function (el) {
      var n = counts[el] || 0;
      if (!n) return '';
      return el + (n > 1 ? String(n) : '');
    }).join('');
  }

  function isZero(x) { return Math.abs(x) < 1e-8; }

  /* 由三个晶格矢量求 a b c α β γ */
  function cellFromVectors(ax, ay, az, bx, by, bz, cx, cy, cz) {
    function len(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
    var a = len(ax, ay, az), b = len(bx, by, bz), c = len(cx, cy, cz);
    if (!(a > 0 && b > 0 && c > 0)) return {};
    function ang(u, v) {
      var d = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) /
              (len(u[0], u[1], u[2]) * len(v[0], v[1], v[2]));
      d = Math.max(-1, Math.min(1, d));
      return Math.acos(d) * 180 / Math.PI;
    }
    return {
      a: a, b: b, c: c,
      alpha: ang([bx, by, bz], [cx, cy, cz]),
      beta: ang([ax, ay, az], [cx, cy, cz]),
      gamma: ang([ax, ay, az], [bx, by, bz])
    };
  }

  /* 从注释行里取晶胞 */
  function parseLattice(comment) {
    var m = String(comment || '').match(/Lattice\s*=\s*"([^"]+)"/i);
    if (!m) return {};
    var v = m[1].trim().split(/\s+/).map(Number).filter(function (x) { return isFinite(x); });
    if (v.length >= 9) {
      return cellFromVectors(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]);
    }
    if (v.length >= 6) {
      if (!(v[0] > 0 && v[1] > 0 && v[2] > 0)) return {};
      return {
        a: v[0], b: v[1], c: v[2],
        alpha: v[3] > 0 ? v[3] : 90,
        beta: v[4] > 0 ? v[4] : 90,
        gamma: v[5] > 0 ? v[5] : 90
      };
    }
    return {};
  }

  function parse(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var warnings = [];

    var i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) return { ok: false, error: '文件是空的' };

    var n = parseInt(lines[i].trim(), 10);
    if (!isFinite(n) || n <= 0) {
      return { ok: false, error: '第 ' + (i + 1) + ' 行不是原子数，可能不是 XYZ 格式' };
    }
    if (n > 200000) return { ok: false, error: '原子数异常（' + n + '）' };
    i++;

    var comment = i < lines.length ? lines[i].trim() : '';
    i++;

    var atoms = [], counts = {}, order = [], bad = 0;

    for (; i < lines.length && atoms.length < n; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') continue;
      var parts = line.split(/\s+/);
      if (parts.length < 4) { bad++; continue; }

      var sym = normalizeElement(parts[0]);
      var x = num(parts[1]), y = num(parts[2]), z = num(parts[3]);
      if (!sym || !isFinite(x) || !isFinite(y) || !isFinite(z)) { bad++; continue; }

      atoms.push({ symbol: sym, x: x, y: y, z: z });
      if (!counts[sym]) { counts[sym] = 0; order.push(sym); }
      counts[sym]++;
    }

    if (bad) warnings.push(bad + ' 行无法识别，已跳过');
    if (!atoms.length) return { ok: false, error: '没有解析到任何原子' };
    if (atoms.length !== n) {
      warnings.push('文件声明 ' + n + ' 个原子，实际读到 ' + atoms.length + ' 个');
    }

    var cell = parseLattice(comment);

    return {
      ok: true,
      formula: formulaOf(counts, order),
      elements: order.slice(),
      atomCounts: counts,
      totalAtoms: atoms.length,
      cell: cell,
      spaceGroup: '',
      z: 1,
      coord: 'cart',
      comment: comment,
      atoms: atoms,
      warnings: warnings
    };
  }

  /* 供 3D 渲染用：把解析结果还原成标准 XYZ 文本 */
  function toXyz(info) {
    if (!info || !info.atoms) return '';
    var out = [String(info.atoms.length), info.formula || info.comment || 'structure'];
    info.atoms.forEach(function (a) {
      out.push(a.symbol + ' ' + a.x + ' ' + a.y + ' ' + a.z);
    });
    return out.join('\n') + '\n';
  }

  return {
    parse: parse,
    toXyz: toXyz,
    normalizeElement: normalizeElement
  };
})();
