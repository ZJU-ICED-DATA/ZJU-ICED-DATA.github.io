/* =========================================================================
   ZJU-ICED Catalyst Database — DFT 数据文件
   -------------------------------------------------------------------------
   日常维护只需要改这个文件：在下面的 CATALYST_DATA 数组中追加条目。

   也可以在网页里「上传计算数据」（CIF + OUTCAR），保存为本地草稿后，
   用右上角「导出 → 导出 data.js」下载本文件并覆盖提交。

   字段说明（数值型不要加引号；没有数据的写 null）：

     id              唯一编号，建议 CAT-001 递增
     formula         化学式 / 催化剂名称，如 "Ni/Al2O3"
     metal           活性金属
     support         载体
     reaction        反应体系，需与 reactions.js 中的 reaction 一致才归入子库
     dftEnergy       总能 E_total (eV)，通常来自 OUTCAR 的 free energy TOTEN
     barrier         活化能 Ea (eV)
     eads            吸附能 Eads (eV)
     reactionEnergy  反应能 ΔE (eV)
     evac            氧空位形成能 (eV)，可选
     ref             数据来源（计算任务编号 / 文献）
     note            标注 / 备注
     structure       由 CIF 解析出的结构标注（见下）
     outcar          由 OUTCAR 解析出的能量信息（见下）

   structure 字段（上传 CIF 自动生成，也可手写）：

     structure: {
       file:       'Ni_Al2O3.cif',
       formula:    'Al2 O3',
       elements:   ['O','Al'],
       atomCounts: { O: 3, Al: 2 },
       totalAtoms: 5,
       cell:       { a: 4.7589, b: 4.7589, c: 12.991, alpha: 90, beta: 90, gamma: 120 },
       spaceGroup: 'R -3 c',
       z:          6
     }

   outcar 字段（上传 OUTCAR 自动生成）：

     outcar: {
       file:         'OUTCAR',
       totalEnergy:  -123.4567,
       energySigma0: -123.4580,
       fermi:         1.2345,
       nions:         64,
       volume:        254.8,
       ionicSteps:    37
     }

   填写注意：
     * reaction 请沿用统一写法，否则会与子库对不上。
     * 本数组为空时，页面显示「还没有数据」的空状态。

   可复制的条目模板：

     { id:'CAT-001', formula:'Ni/Al2O3', metal:'Ni', support:'Al2O3',
       reaction:'Methane Combustion',
       dftEnergy:-123.4567, barrier:0.87, eads:-1.24, reactionEnergy:-2.10, evac:null,
       ref:'VASP-2405-017', note:'Pd(111) 3×3 slab，4 层',
       structure:{ file:'Ni_Al2O3.cif', formula:'Al2 O3', elements:['O','Al'],
                   atomCounts:{O:3,Al:2}, totalAtoms:5,
                   cell:{a:4.7589,b:4.7589,c:12.991,alpha:90,beta:90,gamma:120},
                   spaceGroup:'R -3 c', z:6 },
       outcar:{ file:'OUTCAR', totalEnergy:-123.4567, energySigma0:-123.458,
                fermi:1.2345, nions:64, volume:254.8, ionicSteps:37 } },
   ========================================================================= */

window.CATALYST_DATA = [
  // ↓↓↓ 在这里逐条追加，每行一个对象，用英文逗号分隔 ↓↓↓

  // ↑↑↑ 上面的模板替换成真实数据后去掉行首的 // ↑↑↑
];
