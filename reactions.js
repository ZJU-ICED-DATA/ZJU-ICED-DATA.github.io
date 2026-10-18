/* =========================================================================
   reactions.js — 反应体系（结构定义）
   -------------------------------------------------------------------------
   这里只定义「有哪些体系」以及它们的 id、颜色与对应的 reaction 字段值；
   页面上的名称、说明、计算设置、要点等文字都在 content.js 中，可在
   「内容管理」页面直接修改。

   新增一个体系：
     1. 在数组里加一项 { id, reaction, icon, accent }
     2. 在 content.js 的 reactions 里加同名 id 的文字
     3. 数据的 reaction 字段写成这里的 reaction 值，即归入该体系
   ========================================================================= */
window.REACTIONS = [
  {
    id: 'ch4-combustion',
    reaction: 'Methane Combustion',
    icon: '🔥',
    accent: '#e8710a'
  },
  {
    id: 'c2h6-combustion',
    reaction: 'Ethane Combustion',
    icon: '🔥',
    accent: '#d64550'
  },
  {
    id: 'co2-hydrogenation',
    reaction: 'CO2 Hydrogenation',
    icon: '♻️',
    accent: '#31a354'
  }
];
