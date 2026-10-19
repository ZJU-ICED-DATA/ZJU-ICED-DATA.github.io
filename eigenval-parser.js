/* =========================================================================
   eigenval-parser.js — 纯前端 VASP EIGENVAL 解析器
   -------------------------------------------------------------------------
   从 EIGENVAL 里取出电子数、能带数与 **HOMO / LUMO / HOMO–LUMO gap**。
   对小分子来说，gap 是最能反映电子结构的一行数字。

   VASP 的 EIGENVAL 结构：
     第 1 行   4 个整数（历史遗留）
     第 2 行   POTCAR 参数
     第 3 行   EDIFF
     第 4 行   CAR
     第 5 行   SYSTEM 名
     第 6 行   NELECT  NKPTS  NBANDS      ← 真正的头
     之后每个 k 点：
       一行 4 个 k 坐标/权重
       NBANDS 行： 自旋非极化  "序号 能量 占据"
                   自旋极化    "序号 E_up E_down occ_up occ_down"

   用法：
     const info = EigenvalParser.parse(text);
     if (info.ok) info.gap;   // eV
   ========================================================================= */
(function (global) {
  'use strict';

  function parse(text) {
    const out = {
      ok: false,
      error: '',
      nelect: null,
      nkpts: null,
      nbands: null,
      ispin: 1,
      homo: null,
      lumo: null,
      gap: null
    };

    if (typeof text !== 'string' || !text.trim()) {
      out.error = '文件内容为空或不是文本';
      return out;
    }

    const lines = text.split(/\r?\n/);

    /* 找真正的头：前 12 行里第一行「三个整数」 */
    let hi = -1;
    let hdr = null;
    for (let i = 3; i < Math.min(lines.length, 14); i++) {
      const m = lines[i].trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
      if (m) {
        hi = i;
        hdr = { nelect: parseInt(m[1], 10), nkpts: parseInt(m[2], 10), nbands: parseInt(m[3], 10) };
        break;
      }
    }
    if (!hdr) {
      out.error = '未找到 EIGENVAL 头信息（NELECT / NKPTS / NBANDS）';
      return out;
    }
    if (!(hdr.nkpts > 0) || !(hdr.nbands > 0)) {
      out.error = 'EIGENVAL 头信息异常';
      return out;
    }

    out.nelect = hdr.nelect;
    out.nkpts = hdr.nkpts;
    out.nbands = hdr.nbands;

    let homo = -Infinity;
    let lumo = Infinity;
    let spin = 1;

    let i = hi + 1;
    for (let k = 0; k < hdr.nkpts; k++) {
      /* 跳到 k 点坐标行 */
      while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) break;
      i++;                                   /* 跳过 k 点行 */

      let band = 0;
      while (band < hdr.nbands && i < lines.length) {
        const raw = lines[i].trim();
        if (!raw) { i++; continue; }
        if (/^\*+$/.test(raw)) { i++; continue; }

        const parts = raw.split(/\s+/);
        if (parts.length < 3 || !/^\d+$/.test(parts[0])) { i++; continue; }

        if (parts.length >= 5) {
          spin = 2;
          const e1 = parseFloat(parts[1]);
          const e2 = parseFloat(parts[2]);
          const o1 = parseFloat(parts[3]);
          const o2 = parseFloat(parts[4]);
          if (isFinite(e1) && isFinite(o1)) {
            if (o1 > 0.5) homo = Math.max(homo, e1); else lumo = Math.min(lumo, e1);
          }
          if (isFinite(e2) && isFinite(o2)) {
            if (o2 > 0.5) homo = Math.max(homo, e2); else lumo = Math.min(lumo, e2);
          }
        } else {
          const e = parseFloat(parts[1]);
          const o = parseFloat(parts[2]);
          if (isFinite(e) && isFinite(o)) {
            if (o > 0.5) homo = Math.max(homo, e); else lumo = Math.min(lumo, e);
          }
        }
        band++;
        i++;
      }
    }

    out.ispin = spin;
    out.homo = isFinite(homo) ? homo : null;
    out.lumo = isFinite(lumo) ? lumo : null;
    if (out.homo !== null && out.lumo !== null && out.lumo > out.homo) {
      out.gap = out.lumo - out.homo;
    }

    out.ok = out.homo !== null || out.lumo !== null;
    if (!out.ok) out.error = '未解析到能级数据（可能文件被截断）';
    return out;
  }

  global.EigenvalParser = { parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
