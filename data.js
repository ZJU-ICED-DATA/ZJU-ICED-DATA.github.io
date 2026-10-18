/* =========================================================================
   ZJU-ICED Catalyst Database — 数据文件
   -------------------------------------------------------------------------
   日常维护只需要改这个文件：在下面的 CATALYST_DATA 数组中追加条目，
   页面的统计卡片、图表、筛选、排序、子库与分页都会自动更新。

   也可以直接在网页左侧点「上传 CIF 结构」，解析完成后保存为本地草稿，
   再用右上角「导出 → 导出 data.js」下载本文件，覆盖提交即可。

   每条记录的字段（字段名不可改，数值型不要加引号）：

     id          唯一编号，建议 CAT-001 递增
     formula     化学式 / 催化剂名称，如 "Ni/Al2O3"
     metal       活性金属（决定筛选分组与图表配色）
     support     载体
     reaction    反应类型，需与 reactions.js 中的 reaction 字段一致才能归入子库
     dftEnergy   DFT 计算能量 (eV)      可选，没有就写 null
     barrier     活化能 (eV)            可选
     selectivity 目标产物选择性 (%)      可选
     temp        反应温度 (°C)          可选
     ref         数据来源（文献 / 内部记录编号）
     note        标注 / 备注             可选
     props       反应专属指标（见下方说明）  可选

   结构标注字段（由 CIF 上传自动生成，也可以手写）：

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

   props 的键取自 reactions.js 中对应子库的 metrics：
     甲烷燃烧：T10 / T50 / T90 / co2Sel
     乙烷燃烧：T50 / T90 / co2Sel / c2h4Sel

   填写注意：
     * reaction 请沿用统一写法，避免同一反应出现多种写法导致筛选拆成两类。
     * 全部字段都要有，缺字段会导致该行数值显示 NaN（可选字段写 null 即可）。
     * 本数组为空时，页面会显示“数据库还是空的”的空状态。

   可复制的条目模板：

     { id:'CAT-001', formula:'Ni/Al2O3', metal:'Ni', support:'Al2O3',
       reaction:'Methane Combustion', dftEnergy:-12.34, barrier:0.87,
       selectivity:92.5, temp:350, ref:'Zhang et al., ACS Catal. 2024',
       note:'Pd 负载量 1 wt%', props:{ T50:380, T90:430, co2Sel:99.1 },
       structure:{ file:'Ni_Al2O3.cif', formula:'Al2 O3', elements:['O','Al'],
                   atomCounts:{O:3,Al:2}, totalAtoms:5,
                   cell:{a:4.7589,b:4.7589,c:12.991,alpha:90,beta:90,gamma:120},
                   spaceGroup:'R -3 c', z:6 } },
   ========================================================================= */

window.CATALYST_DATA = [
  // ↓↓↓ 在这里逐条追加，每行一个对象，用英文逗号分隔 ↓↓↓

  // ↑↑↑ 上面的模板替换成真实数据后去掉行首的 // ↑↑↑
];
