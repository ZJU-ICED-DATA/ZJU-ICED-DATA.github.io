/* =========================================================================
   reactions.js — 反应子库定义
   -------------------------------------------------------------------------
   左侧栏的每个子库对应这里的一个条目。新增子库只要在数组里加一项，
   并把数据的 reaction 字段写成相同的字符串即可。
   ========================================================================= */
window.REACTIONS = [
  {
    id: 'ch4-combustion',
    name: '甲烷燃烧',
    en: 'CH4 Combustion',
    icon: '🔥',
    accent: '#e8710a',
    reaction: 'Methane Combustion',
    summary: '甲烷低温完全氧化，目标产物为 CO₂ 与 H₂O。评价核心是起燃温度、CO₂ 选择性与高温水热稳定性。',
    conditions: [
      { label: '反应气组成', value: '1–2% CH₄ / 4–20% O₂ / 平衡 N₂' },
      { label: '空速 GHSV', value: '20 000–60 000 h⁻¹' },
      { label: '评价温区', value: '200–700 °C' }
    ],
    metrics: [
      { key: 'T10', label: 'T10', unit: '°C', desc: '甲烷转化率达 10% 的温度' },
      { key: 'T50', label: 'T50', unit: '°C', desc: '起燃温度，转化率达 50% 的温度' },
      { key: 'T90', label: 'T90', unit: '°C', desc: '完全转化温度，转化率达 90% 的温度' },
      { key: 'co2Sel', label: 'CO₂ 选择性', unit: '%', desc: '产物中 CO₂ 占比，接近 100% 表示完全氧化' }
    ],
    notes: [
      'Pd、Pt 活性最高，Pd 对 CH₄ 的 C–H 活化更具优势，是文献中最常用的体系。',
      '负载型 Ni、Co 成本低，但高温下易烧结与积碳，需要关注水热稳定性。',
      'CeO₂、ZrO₂ 等载体通过氧空位与金属–载体相互作用显著影响低温活性。'
    ]
  },
  {
    id: 'c2h6-combustion',
    name: '乙烷燃烧',
    en: 'C2H6 Combustion',
    icon: '🔥',
    accent: '#d64550',
    reaction: 'Ethane Combustion',
    summary: '乙烷完全氧化，动力学上比甲烷更易活化，但存在乙烯等不完全氧化副产物，需要同时关注 CO₂ 选择性与烯烃副产。',
    conditions: [
      { label: '反应气组成', value: '0.5–2% C₂H₆ / 5–20% O₂ / 平衡 N₂' },
      { label: '空速 GHSV', value: '20 000–60 000 h⁻¹' },
      { label: '评价温区', value: '180–600 °C' }
    ],
    metrics: [
      { key: 'T50', label: 'T50', unit: '°C', desc: '起燃温度，乙烷转化率达 50% 的温度' },
      { key: 'T90', label: 'T90', unit: '°C', desc: '转化率达 90% 的温度' },
      { key: 'co2Sel', label: 'CO₂ 选择性', unit: '%', desc: '完全氧化为 CO₂ 的比例' },
      { key: 'c2h4Sel', label: 'C₂H₄ 选择性', unit: '%', desc: '不完全氧化生成乙烯的比例，脱氢路径的副产物' }
    ],
    notes: [
      '乙烷 C–C 键键能较低，低温即可活化，因此起燃温度普遍低于甲烷。',
      'Ni 基与 V 基体系在乙烷氧化脱氢（ODH）方向研究较多，需区分燃烧与 ODH 两种评价条件。',
      '高温下乙烯会进一步深度氧化，选择性随温度升高快速下降。'
    ]
  }
];
