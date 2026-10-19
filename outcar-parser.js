/* =========================================================================
   outcar-parser.js — 纯前端 VASP OUTCAR 解析器
   -------------------------------------------------------------------------
   只提取建库需要的量：最终总能（free energy TOTEN / energy(sigma->0)）、
   E-fermi、NIONS 与晶胞体积。

   OUTCAR 是迭代文件，每个离子步都会打印一次能量，因此取**最后一次**出现的
   值作为最终结果。

   用法：
     const info = OutcarParser.parse(text);
     if (info.ok) info.totalEnergy;   // eV
   ========================================================================= */
(function (global) {
  'use strict';

  function lastMatch(text, re) {
    let m;
    let last = null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) last = m;
    return last;
  }

  function toFloat(s) {
    if (s === undefined || s === null) return null;
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }

  /* 解析「magnetization (x)」块，返回每个原子的总磁矩（μB）。
     VASP 输出形如：
        magnetization (x)
        --------------------------------------
          1     0.0000  0.000  0.000 ...
         ...
     每行第一个整数是原子序号，紧随其后的浮点数是该原子的总磁矩。 */
  function parseMagPerAtom(text) {
    const idx = text.lastIndexOf('magnetization (x)');
    if (idx < 0) return [];

    const lines = text.slice(idx).split(/\r?\n/);
    const out = [];
    let started = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!started) {
        if (/^\s*-{5,}/.test(line)) started = true;
        continue;
      }
      if (/^\s*-{5,}/.test(line)) break;             // 下一个分块
      if (!line.trim()) { if (out.length) break; else continue; }

      const m = line.match(/^\s*\d+\s+(-?\d+(?:\.\d+)?(?:[EeDd][-+]?\d+)?)/);
      if (!m) { if (out.length) break; else continue; }
      out.push(toFloat(String(m[1]).replace(/[Dd]/, 'E')));
    }
    return out;
  }

  function parse(text) {
    const out = {
      ok: false,
      error: '',
      warnings: [],
      totalEnergy: null,      // free energy TOTEN (eV)
      energySigma0: null,     // energy(sigma->0) (eV)
      fermi: null,            // E-fermi (eV)
      nions: null,
      volume: null,           // 晶胞体积 (Å^3)
      nsw: null,
      ionicSteps: 0,
      isVasp: false,
      magnetization: null,    // 总磁矩 (μB)
      magPerAtom: []          // 每个原子的磁矩 (μB)
    };

    if (typeof text !== 'string' || !text.trim()) {
      out.error = '文件内容为空或不是文本';
      return out;
    }

    /* 粗略判断是不是 VASP 输出，避免误传其他文件 */
    out.isVasp = /VASP|POSCAR|INCAR|POTCAR|free\s+energy\s+TOTEN/i.test(text);

    /* 每个离子步一行：free  energy   TOTEN  =  -123.456789 eV */
    const totRe = /free\s+energy\s+TOTEN\s*=\s*(-?\d+(?:\.\d+)?)/g;
    const all = text.match(totRe);
    if (all) out.ionicSteps = all.length;
    const tot = lastMatch(text, totRe);
    if (tot) out.totalEnergy = toFloat(tot[1]);

    const sig = lastMatch(text, /energy\(sigma->0\)\s*=\s*(-?\d+(?:\.\d+)?)/g);
    if (sig) out.energySigma0 = toFloat(sig[1]);

    const fermi = lastMatch(text, /E-fermi\s*:\s*(-?\d+(?:\.\d+)?)/g);
    if (fermi) out.fermi = toFloat(fermi[1]);

    const nions = lastMatch(text, /NIONS\s*=\s*(\d+)/g);
    if (nions) out.nions = parseInt(nions[1], 10);

    const vol = lastMatch(text, /volume\s+of\s+cell\s*:\s*(-?\d+(?:\.\d+)?)/g);
    if (vol) out.volume = toFloat(vol[1]);

    const nsw = lastMatch(text, /NSW\s*=\s*(\d+)/g);
    if (nsw) out.nsw = parseInt(nsw[1], 10);

    /* 总磁矩：优先取 "number of electron ... magnetization X"，再退回 "total magnetization" */
    const mag = lastMatch(text, /number\s+of\s+electron\s+[-+]?\d+(?:\.\d+)?\s+magnetization\s+(-?\d+(?:\.\d+)?)/g);
    if (mag) out.magnetization = toFloat(mag[1]);
    if (out.magnetization === null) {
      const mag2 = lastMatch(text, /total\s+magnetization\s*=\s*(-?\d+(?:\.\d+)?)/g);
      if (mag2) out.magnetization = toFloat(mag2[1]);
    }

    out.magPerAtom = parseMagPerAtom(text);

    if (out.totalEnergy === null && out.energySigma0 !== null) {
      out.totalEnergy = out.energySigma0;
      out.warnings.push('未找到 free energy TOTEN，改用 energy(sigma->0)');
    }

    if (!out.isVasp) {
      out.warnings.push('文件内容不像标准 OUTCAR，请确认是否选错文件');
    }

    out.ok = out.totalEnergy !== null;
    if (!out.ok) {
      out.error = out.isVasp
        ? '未找到能量行（free energy TOTEN），可能计算未正常结束'
        : '未在文件中识别到 VASP 输出格式';
    }
    return out;
  }

  global.OutcarParser = { parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
