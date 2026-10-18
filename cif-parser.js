/* =========================================================================
   cif-parser.js — 纯前端 CIF 解析器
   -------------------------------------------------------------------------
   从 CIF 文本中提取：数据块名、化学式、元素种类、各元素原子数、总原子数、
   晶胞参数、空间群、原子坐标列表。

   不依赖任何外部库，也不做对称性展开：给出的原子数等于 CIF 中 _atom_site
   循环里实际列出的行数（通常是不对称单元 asymmetric unit 的原子）。

   用法：
     const info = CIFParser.parse(cifText);
     if (info.ok) { info.elements, info.atomCounts, info.totalAtoms, ... }
   ========================================================================= */
(function (global) {
  'use strict';

  /* 元素符号表，用于剔除 "Ni1" "O2-" 之类的噪声，保证只保留真实元素 */
  const SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd ' +
    'Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th ' +
    'Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');

  const SYMBOL_SET = new Set(SYMBOLS);
  const METALS = new Set(('Li Be Na Mg Al K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' '));

  /* ---------------- 词法 ---------------- */

  /** 把一行拆成 token，支持单双引号；引号内的空格不拆 */
  function tokenizeLine(line) {
    const out = [];
    let i = 0;
    const n = line.length;
    while (i < n) {
      while (i < n && /\s/.test(line[i])) i++;
      if (i >= n) break;
      const c = line[i];
      if (c === '"' || c === "'") {
        const quote = c;
        i++;
        let buf = '';
        while (i < n && line[i] !== quote) { buf += line[i]; i++; }
        i++; // 跳过结尾引号
        out.push(buf);
      } else {
        let buf = '';
        while (i < n && !/\s/.test(line[i])) { buf += line[i]; i++; }
        out.push(buf);
      }
    }
    return out;
  }

  /** 数字清洗："5.431(2)" -> 5.431；"0.1234" -> 0.1234；非法 -> NaN */
  function toNumber(value) {
    if (value === null || value === undefined) return NaN;
    const s = String(value).trim().replace(/\([^)]*\)/g, '').replace(/[,;]$/, '');
    if (!s || s === '.' || s === '?') return NaN;
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  /** 从 "Ni1" / "Ni2+" / "O2-" / "Fe3A" 中取元素符号 */
  function elementFromLabel(value) {
    if (!value) return '';
    const m = String(value).match(/^([A-Z][a-z]?)/);
    if (!m) return '';
    return SYMBOL_SET.has(m[1]) ? m[1] : '';
  }

  /* ---------------- 化学式解析 ---------------- */

  /** 把一段化学式切成 token 流 */
  function tokenizeFormula(seg) {
    const tokens = [];
    let i = 0;
    while (i < seg.length) {
      const c = seg[i];
      if (c === '(' || c === '[') { tokens.push({ type: 'lparen' }); i++; continue; }
      if (c === ')' || c === ']') { tokens.push({ type: 'rparen' }); i++; continue; }
      if (/[A-Z]/.test(c)) {
        let sym = c;
        i++;
        while (i < seg.length && /[a-z]/.test(seg[i])) { sym += seg[i]; i++; }
        if (SYMBOL_SET.has(sym)) tokens.push({ type: 'sym', sym: sym });
        continue;
      }
      if (/[0-9.]/.test(c)) {
        let num = '';
        while (i < seg.length && /[0-9.]/.test(seg[i])) { num += seg[i]; i++; }
        const v = parseFloat(num);
        if (isFinite(v)) tokens.push({ type: 'num', value: v });
        continue;
      }
      i++; /* 跳过 + - 等电荷符号 */
    }
    return tokens;
  }

  /** 用栈处理括号分组，返回 { 元素: 个数 } */
  function countsFromTokens(tokens, scale) {
    const root = {};
    const stack = [root];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'lparen') { stack.push({}); i++; continue; }
      if (t.type === 'rparen') {
        const group = stack.length > 1 ? stack.pop() : {};
        let mult = 1;
        if (tokens[i + 1] && tokens[i + 1].type === 'num') { mult = tokens[i + 1].value; i++; }
        const target = stack[stack.length - 1];
        for (const el in group) target[el] = (target[el] || 0) + group[el] * mult;
        i++;
        continue;
      }
      if (t.type === 'num') { i++; continue; }
      if (t.type === 'sym') {
        let mult = 1;
        if (tokens[i + 1] && tokens[i + 1].type === 'num') { mult = tokens[i + 1].value; i++; }
        const target = stack[stack.length - 1];
        target[t.sym] = (target[t.sym] || 0) + mult;
        i++;
        continue;
      }
      i++;
    }
    /* 未闭合括号的容错：把剩余分组并回根 */
    while (stack.length > 1) {
      const group = stack.pop();
      const target = stack[stack.length - 1];
      for (const el in group) target[el] = (target[el] || 0) + group[el];
    }
    if (scale && scale !== 1) {
      for (const el in root) root[el] = root[el] * scale;
    }
    return root;
  }

  /**
   * 解析化学式字符串为 { 元素: 个数 }。
   * 支持：Al2O3、Al2 O3、Ca3(PO4)2、[Cu(NH3)4]SO4、C6H6·H2O、2H2O
   */
  function parseFormula(text) {
    const out = {};
    if (!text) return out;
    const body = String(text).replace(/[\u00b7\u2022\u2219*]/g, ' ').trim();
    if (!body) return out;
    const segments = body.split(/\s+/).filter(Boolean);
    for (let k = 0; k < segments.length; k++) {
      let seg = segments[k];
      let mult = 1;
      const m = seg.match(/^([0-9]+(?:\.[0-9]+)?)/);
      if (m) { mult = parseFloat(m[1]); seg = seg.slice(m[1].length); }
      if (!seg) continue;
      const counts = countsFromTokens(tokenizeFormula(seg), mult);
      for (const el in counts) out[el] = (out[el] || 0) + counts[el];
    }
    return out;
  }

  /* ---------------- 主解析 ---------------- */

  function parse(text) {
    const result = {
      ok: false,
      error: '',
      warnings: [],
      dataBlock: '',
      formula: '',
      formulaCounts: {},
      elements: [],
      atomCounts: {},
      totalAtoms: 0,
      atoms: [],
      cell: {},
      volume: NaN,
      spaceGroup: '',
      z: NaN,
      tags: {}
    };

    if (typeof text !== 'string' || !text.trim()) {
      result.error = '文件内容为空或不是文本';
      return result;
    }

    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const tags = {};
    const loops = [];
    let i = 0;

    while (i < lines.length) {
      let line = lines[i];

      // 多行文本字段 ; ... ;
      if (line.charAt(0) === ';') {
        i++;
        while (i < lines.length && lines[i].charAt(0) !== ';') i++;
        i++;
        continue;
      }

      // 整行注释
      const trimmed = line.trim();
      if (!trimmed) { i++; continue; }
      if (trimmed.charAt(0) === '#') { i++; continue; }

      // 去掉行尾注释（CIF 中 # 之后为注释）
      const hashIdx = line.indexOf('#');
      if (hashIdx > 0) line = line.slice(0, hashIdx);
      const t = line.trim();
      if (!t) { i++; continue; }
      const lower = t.toLowerCase();

      if (lower.startsWith('data_')) {
        result.dataBlock = t.slice(5).trim();
        i++;
        continue;
      }

      if (lower === 'loop_') {
        i++;
        const headers = [];
        while (i < lines.length) {
          const h = lines[i].trim();
          if (h.charAt(0) === '_') { headers.push(h.split(/\s+/)[0]); i++; }
          else break;
        }
        const values = [];
        while (i < lines.length) {
          const vline = lines[i];
          const vtrim = vline.trim();
          if (!vtrim) { i++; continue; }
          if (vtrim.charAt(0) === ';') {
            i++;
            const buf = [];
            while (i < lines.length && lines[i].charAt(0) !== ';') { buf.push(lines[i]); i++; }
            i++;
            values.push(buf.join('\n'));
            continue;
          }
          const low2 = vtrim.toLowerCase();
          if (low2 === 'loop_' || low2.startsWith('data_') || vtrim.charAt(0) === '_') break;
          tokenizeLine(vtrim).forEach(function (tk) { values.push(tk); });
          i++;
        }
        if (headers.length) loops.push({ headers: headers, values: values });
        continue;
      }

      if (t.charAt(0) === '_') {
        const m = t.match(/^(\S+)\s*([\s\S]*)$/);
        const tag = m[1];
        let rest = m[2].trim();
        if (rest) {
          tags[tag] = tokenizeLine(rest).join(' ');
          i++;
        } else {
          // 值写在下一行
          i++;
          if (i < lines.length && lines[i].charAt(0) === ';') {
            i++;
            const buf = [];
            while (i < lines.length && lines[i].charAt(0) !== ';') { buf.push(lines[i]); i++; }
            i++;
            tags[tag] = buf.join('\n');
          } else if (i < lines.length && lines[i].trim()) {
            tags[tag] = tokenizeLine(lines[i].trim()).join(' ');
            i++;
          } else {
            tags[tag] = '';
          }
        }
        continue;
      }

      i++;
    }

    const pick = function () {
      for (let k = 0; k < arguments.length; k++) {
        const v = tags[arguments[k]];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };

    result.tags = tags;
    result.formula = pick('_chemical_formula_sum', '_chemical_formula_structural', '_chemical_formula_moiety');
    result.spaceGroup = pick('_symmetry_space_group_name_H-M', '_space_group_name_H-M_alt', '_space_group_name_Hall');

    const a = toNumber(pick('_cell_length_a'));
    const b = toNumber(pick('_cell_length_b'));
    const c = toNumber(pick('_cell_length_c'));
    const al = toNumber(pick('_cell_angle_alpha'));
    const be = toNumber(pick('_cell_angle_beta'));
    const ga = toNumber(pick('_cell_angle_gamma'));
    result.cell = { a: a, b: b, c: c, alpha: al, beta: be, gamma: ga };

    const vol = toNumber(pick('_cell_volume'));
    if (isFinite(vol)) {
      result.volume = vol;
    } else if ([a, b, c, al, be, ga].every(isFinite)) {
      const rad = Math.PI / 180;
      result.volume = a * b * c *
        Math.sqrt(1 - Math.cos(al * rad) ** 2 - Math.cos(be * rad) ** 2 - Math.cos(ga * rad) ** 2 +
          2 * Math.cos(al * rad) * Math.cos(be * rad) * Math.cos(ga * rad));
    }

    result.z = toNumber(pick('_cell_formula_units_Z'));

    /* ---- 原子坐标循环 ---- */
    let siteLoop = null;
    for (let k = 0; k < loops.length; k++) {
      if (loops[k].headers.some(function (h) { return h.indexOf('_atom_site_') === 0; })) {
        siteLoop = loops[k];
        break;
      }
    }

    if (siteLoop) {
      const headers = siteLoop.headers;
      const stride = headers.length;
      const indexOf = function (name) { return headers.indexOf(name); };
      const iType = indexOf('_atom_site_type_symbol');
      const iLabel = indexOf('_atom_site_label');
      const iFx = indexOf('_atom_site_fract_x');
      const iFy = indexOf('_atom_site_fract_y');
      const iFz = indexOf('_atom_site_fract_z');
      const iOcc = indexOf('_atom_site_occupancy');

      if (siteLoop.values.length % stride !== 0) {
        result.warnings.push('原子坐标行数与表头字段数不整除，可能存在缺失值');
      }

      const counts = {};
      const atoms = [];
      const partial = [];

      for (let k = 0; k + stride <= siteLoop.values.length; k += stride) {
        const row = siteLoop.values.slice(k, k + stride);
        let type = iType >= 0 ? row[iType] : '';
        let symbol = elementFromLabel(type);
        if (!symbol && iLabel >= 0) symbol = elementFromLabel(row[iLabel]);
        if (!symbol) {
          result.warnings.push('第 ' + (atoms.length + 1) + ' 行原子无法识别元素，已跳过');
          continue;
        }
        const occ = iOcc >= 0 ? toNumber(row[iOcc]) : 1;
        if (isFinite(occ) && occ < 0.999) partial.push(symbol + '(' + occ + ')');
        counts[symbol] = (counts[symbol] || 0) + 1;
        atoms.push({
          label: iLabel >= 0 ? row[iLabel] : symbol,
          symbol: symbol,
          x: iFx >= 0 ? toNumber(row[iFx]) : NaN,
          y: iFy >= 0 ? toNumber(row[iFy]) : NaN,
          z: iFz >= 0 ? toNumber(row[iFz]) : NaN,
          occupancy: isFinite(occ) ? occ : 1
        });
      }

      result.atoms = atoms;
      result.atomCounts = counts;
      result.totalAtoms = atoms.length;
      if (partial.length) {
        result.warnings.push('存在部分占据原子：' + partial.slice(0, 8).join('、') + (partial.length > 8 ? ' 等' : ''));
      }
    }

    /* ---- 化学式兜底 ---- */
    if (result.formula) {
      result.formulaCounts = parseFormula(result.formula);
    }

    if (!result.totalAtoms && Object.keys(result.formulaCounts).length) {
      result.atomCounts = result.formulaCounts;
      result.totalAtoms = Object.keys(result.atomCounts).reduce(function (s, k) { return s + result.atomCounts[k]; }, 0);
      result.warnings.push('未找到 _atom_site 原子坐标循环，原子数由化学式计算得出');
    }

    result.elements = Object.keys(result.atomCounts).sort(function (x, y) {
      return result.atomCounts[y] - result.atomCounts[x];
    });

    result.ok = result.totalAtoms > 0;
    if (!result.ok) {
      result.error = result.formula
        ? '已读到化学式但无法确定原子组成'
        : '未在文件中找到原子坐标或化学式信息，请确认这是标准的 CIF 文件';
    }
    return result;
  }

  /* ---------------- 辅助 ---------------- */

  /** 由元素组成推测常见载体 */
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
      const name = rules[k][1];
      if (Object.keys(pattern).every(function (el) { return has(el); })) return name;
    }
    if (has('C') && Object.keys(counts).length === 1) return 'C';
    return '';
  }

  /** 由元素组成推测活性金属（取丰度最高的金属元素） */
  function guessMetal(counts) {
    if (!counts) return '';
    const metals = Object.keys(counts).filter(function (el) { return METALS.has(el); });
    if (!metals.length) return '';
    metals.sort(function (x, y) { return counts[y] - counts[x]; });
    return metals[0];
  }

  global.CIFParser = {
    parse: parse,
    parseFormula: parseFormula,
    guessSupport: guessSupport,
    guessMetal: guessMetal,
    symbols: SYMBOLS
  };
})(typeof window !== 'undefined' ? window : globalThis);
