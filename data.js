/* =========================================================================
   ZJU-ICED Catalyst Database — 数据文件
   -------------------------------------------------------------------------
   日常维护只需要改这个文件：在下面的 CATALYST_DATA 数组中追加条目，
   页面的统计卡片、图表、筛选、排序、分页都会自动更新，无需改动 index.html。
   改完提交到 GitHub 即可，网站约 1 分钟后自动生效。

   每条记录的字段（字段名不可改，数值型不要加引号）：

     id          唯一编号，建议 CAT-001 递增
     formula     化学式 / 催化剂名称
     metal       活性金属（决定筛选分组与图表配色）
     support     载体
     reaction    反应类型
     dftEnergy   DFT 计算能量 (eV)     例：-12.34
     barrier     活化能 (eV)           例：0.87
     selectivity 目标产物选择性 (%)     例：92.5
     temp        反应温度 (°C)         例：350
     ref         数据来源（文献 / 内部记录编号）

   填写注意：
     * reaction 请沿用统一写法，避免同一反应出现多种写法
       （例如 "CO2 Hydrogenation" 与 "CO₂ 加氢" 混用，筛选框里会变成两类）。
     * 全部字段都要有，缺字段会导致该行数值显示 NaN。
     * 本数组为空时，页面会自动显示“数据整理中”的空状态。

   可复制的条目模板：

     { id:'CAT-001', formula:'Ni/Al2O3', metal:'Ni', support:'Al2O3',
       reaction:'CO2 Hydrogenation', dftEnergy:-12.34, barrier:0.87,
       selectivity:92.5, temp:350, ref:'Zhang et al., ACS Catal. 2024' },
   ========================================================================= */

window.CATALYST_DATA = [
  // ↓↓↓ 在这里逐条追加，每行一个对象，用英文逗号分隔 ↓↓↓

  // { id:'CAT-001', formula:'Ni/Al2O3', metal:'Ni', support:'Al2O3', reaction:'CO2 Hydrogenation', dftEnergy:-12.34, barrier:0.87, selectivity:92.5, temp:350, ref:'ZJU-ICED 2025' },

  // ↑↑↑ 以上为示例，替换成真实数据后去掉行首的 // ↑↑↑
];
