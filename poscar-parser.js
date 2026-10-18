/* =========================================================================
   poscar-parser.js — 纯前端 VASP POSCAR / CONTCAR 解析器
   -------------------------------------------------------------------------
   提取：元素符号与各元素原子数、总原子数、晶格常数与晶胞角，并把坐标换算成
   笛卡尔坐标，便于生成 XYZ 做三维预览。

   支持：
     · VASP 5 及以上（第 6 行是元素符号）
     · Selective dynamics 行
     · Direct（分数坐标）与 Cartesian（笛卡尔坐标）
     · 缩放系数为单值或三分量
     · 缩放系数为负数时按目标体积换算

   不支持：VASP 4 格式（第 6 行直接是原子数，没有元素符号）——此时会给出
   明确错误，建议改用同目录下的 CIF，或手写元素符号。

   用法：
     const info = PoscarParser.parse(text);
     if (info.ok) info.atomCounts / info.totalAtoms / info.cell
     const xyz = PoscarParser.toXyz(info);
   ========================================================================= */
(function (global) {
  'use strict';

  const SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd ' +
    'Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th ' +
    'Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  const SYMBOL_SET = new Set(SYMBOLS);
  const METALS = new Set(('Li Be Na Mg Al K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' '));

  function isNumberToken(t) {
    return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t);
  }

  function normSymbol(tok) {
    const m = String(tok || '').match(/^([A-Za-z]{1,3})/);
    if (!m) return '';
    const raw = m[1];
    const sym = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return SYMBOL_SET.has(sym) ? sym : '';
  }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function angleDeg(u, v) {
    const c = dot(u, v) / (norm(u) * norm(v));
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }

  function parse(text) {
    const out = {
      ok: false, error: '', warnings: [],
      comment: '', scale: 1, elements: [], counts: [], atomCounts: {},
      totalAtoms: 0, atoms: [], cell: { a: NaN, b: NaN, c: NaN, alpha: NaN, beta: NaN, gamma: NaN },
      coordType: '', selective: false, formula: ''
    };

    if (typeof text !== 'string' || !text.trim()) {
      out.error = '文件内容为空';
      return out;
    }

    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    let i = 0;
    const take = function () {
      while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) return null;
      return lines[i++].trim();
    };

    out.comment = take() || '';
    if (out.comment === null) { out.error = '文件行数不足，不是有效的 POSCAR'; return out; }

    const scaleTokens = (take() || '').split(/\s+/).filter(Boolean);
    if (!scaleTokens.length) { out.error = '缺少缩放系数行'; return out; }
    const scaleNums = scaleTokens.map(parseFloat);
    if (scaleNums.some(function (x) { return !isFinite(x); })) {
      out.error = '第 2 行缩放系数无法解析';
      return out;
    }

    const vectors = [];
    for (let k = 0; k < 3; k++) {
      const line = take();
      if (line === null) { out.error = '缺少晶格矢量'; return out; }
      const parts = line.split(/\s+/).filter(Boolean).map(parseFloat);
      if (parts.length < 3 || parts.slice(0, 3).some(function (x) { return !isFinite(x); })) {
        out.error = '晶格矢量解析失败（第 ' + (k + 3) + ' 行）';
        return out;
      }
      vectors.push(parts.slice(0, 3));
    }

    /* ---- 缩放：单值 / 三分量 / 负值（目标体积） ---- */
    let svec = [1, 1, 1];
    if (scaleNums.length >= 3) {
      svec = [scaleNums[0], scaleNums[1], scaleNums[2]];
      out.scale = scaleNums[0];
    } else {
      const s = scaleNums[0];
      out.scale = s;
      if (s < 0) {
        const vol = Math.abs(dot(vectors[0], [vectors[1][1] * vectors[2][2] - vectors[1][2] * vectors[2][1],
          vectors[1][2] * vectors[2][0] - vectors[1][0] * vectors[2][2],
          vectors[1][0] * vectors[2][1] - vectors[1][1] * vectors[2][0]]));
        const f = vol > 0 ? Math.cbrt(Math.abs(s) / vol) : 1;
        svec = [f, f, f];
        out.warnings.push('缩放系数为负值，已按目标体积换算出缩放因子 ' + f.toFixed(6));
        out.scale = f;
      } else {
        svec = [s, s, s];
      }
    }

    const lat = vectors.map(function (v, idx) {
      return [v[0] * svec[idx], v[1] * svec[idx], v[2] * svec[idx]];
    });

    out.cell = {
      a: norm(lat[0]), b: norm(lat[1]), c: norm(lat[2]),
      alpha: angleDeg(lat[1], lat[2]),
      beta: angleDeg(lat[0], lat[2]),
      gamma: angleDeg(lat[0], lat[1])
    };

    /* ---- 元素符号行（VASP5）或直接是原子数（VASP4） ---- */
    const line6 = take();
    if (line6 === null) { out.error = '缺少元素与原子数信息'; return out; }
    const t6 = line6.split(/\s+/).filter(Boolean);

    let symbols = [];
    let countsLine = '';
    const allNumeric = t6.every(isNumberToken);

    if (allNumeric) {
      out.error = '这是 VASP 4 格式（缺少元素符号行），无法确定元素种类。请改用同目录的 CIF，或在 POSCAR 第 6 行补上元素符号。';
      return out;
    }

    symbols = t6.map(normSymbol);
    if (symbols.some(function (s) { return !s; })) {
      out.error = '第 6 行的元素符号无法识别：' + line6;
      return out;
    }
    countsLine = take() || '';

    const counts = countsLine.split(/\s+/).filter(Boolean).map(function (x) { return parseInt(x, 10); });
    if (!counts.length || counts.some(function (c) { return !isFinite(c) || c <= 0; })) {
      out.error = '原子数行无法解析：' + countsLine;
      return out;
    }
    if (counts.length !== symbols.length) {
      out.error = '元素符号个数（' + symbols.length + '）与原子数个数（' + counts.length + '）不一致';
      return out;
    }

    out.elements = symbols.slice();
    out.counts = counts.slice();
    symbols.forEach(function (s, idx) { out.atomCounts[s] = (out.atomCounts[s] || 0) + counts[idx]; });
    out.totalAtoms = counts.reduce(function (a, b) { return a + b; }, 0);

    /* ---- Selective dynamics / 坐标类型 ---- */
    let line = take();
    if (line && /^s/i.test(line)) { out.selective = true; line = take(); }
    if (!line || !/^[dck]/i.test(line)) {
      out.error = '缺少坐标类型行（Direct / Cartesian）';
      return out;
    }
    out.coordType = /^[d]/i.test(line) ? 'Direct' : 'Cartesian';

    /* ---- 坐标 ---- */
    const atoms = [];
    let symbolCursor = 0;
    let remaining = counts[symbolCursor];
    for (let k = 0; k < out.totalAtoms; k++) {
      const cl = take();
      if (cl === null) { out.error = '坐标行数少于原子总数（' + out.totalAtoms + '）'; return out; }
      const p = cl.split(/\s+/).filter(Boolean).map(parseFloat);
      if (p.length < 3 || p.slice(0, 3).some(function (x) { return !isFinite(x); })) {
        out.error = '第 ' + (k + 1) + ' 个原子的坐标无法解析';
        return out;
      }
      while (remaining === 0 && symbolCursor < counts.length - 1) {
        symbolCursor++;
        remaining = counts[symbolCursor];
      }
      const sym = symbols[symbolCursor];
      remaining--;

      let cart;
      if (out.coordType === 'Direct') {
        const f = [p[0], p[1], p[2]];
        cart = [
          f[0] * lat[0][0] + f[1] * lat[1][0] + f[2] * lat[2][0],
          f[0] * lat[0][1] + f[1] * lat[1][1] + f[2] * lat[2][1],
          f[0] * lat[0][2] + f[1] * lat[1][2] + f[2] * lat[2][2]
        ];
      } else {
        const sc = Array.isArray(svec) ? svec[0] : out.scale;
        cart = [p[0] * sc, p[1] * sc, p[2] * sc];
      }
      atoms.push({ symbol: sym, x: cart[0], y: cart[1], z: cart[2] });
    }

    out.atoms = atoms;
    out.formula = symbols.map(function (s, idx) {
      return s + (counts[idx] > 1 ? counts[idx] : '');
    }).join(' ');

    out.ok = out.totalAtoms > 0;
    if (!out.ok) out.error = '未读到任何原子';
    return out;
  }

  function toXyz(info) {
    if (!info || !info.ok || !info.atoms) return '';
    const lines = [String(info.atoms.length), info.comment || 'POSCAR'];
    info.atoms.forEach(function (a) {
      lines.push(a.symbol + ' ' + a.x.toFixed(6) + ' ' + a.y.toFixed(6) + ' ' + a.z.toFixed(6));
    });
    return lines.join('\n') + '\n';
  }

  function guessSupport(counts) {
    const has = function (el) { return counts && counts[el] > 0; };
    const rules = [
      [{ Al: 1, O: 1 }, 'Al2O3'], [{ Si: 1, O: 1 }, 'SiO2'],
      [{ Ti: 1, O: 1 }, 'TiO2'], [{ Ce: 1, O: 1 }, 'CeO2'],
      [{ Zr: 1, O: 1 }, 'ZrO2'], [{ Zn: 1, O: 1 }, 'ZnO'],
      [{ Mg: 1, O: 1 }, 'MgO'], [{ Sn: 1, O: 1 }, 'SnO2'],
      [{ Y: 1, O: 1 }, 'Y2O3'], [{ Fe: 1, O: 1 }, 'Fe2O3']
    ];
    for (let k = 0; k < rules.length; k++) {
      const pattern = rules[k][0];
      if (Object.keys(pattern).every(function (el) { return has(el); })) return rules[k][1];
    }
    if (has('C') && Object.keys(counts).length === 1) return 'C';
    return '';
  }

  function guessMetal(counts) {
    if (!counts) return '';
    const metals = Object.keys(counts).filter(function (el) { return METALS.has(el); });
    if (!metals.length) return '';
    metals.sort(function (x, y) { return counts[y] - counts[x]; });
    return metals[0];
  }

  global.PoscarParser = {
    parse: parse,
    toXyz: toXyz,
    guessSupport: guessSupport,
    guessMetal: guessMetal
  };
})(typeof window !== 'undefined' ? window : globalThis);
