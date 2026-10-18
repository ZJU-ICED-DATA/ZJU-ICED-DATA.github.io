/* =========================================================================
   content.js — 站点文案（可在「内容管理」页面修改）
   -------------------------------------------------------------------------
   页面上的所有文字都来自这里。管理页面的修改会先存到浏览器本地，
   点「导出 content.js」拿到新文件覆盖本文件并提交，才会对所有访问者生效。

   结构说明：
     site        站点名称、副标题、页脚
     dashboard   数据总览页的标题、说明、KPI 标签、图表标题、空状态
     descriptors DFT 描述符定义（表格列名 / 子库指标说明）
     reactions   各反应体系的名称、说明、计算设置、要点
   ========================================================================= */
window.SITE_CONTENT = {
  site: {
    name: 'ZJU-ICED',
    short: 'ICED',
    subtitle: 'Catalyst DFT Database',
    footer: '© 2025 ZJU-ICED 课题组 · 全部数据来自 DFT 计算，仅供科研参考',
    navWorkspace: '工作区',
    navReactions: '反应体系',
    navAdmin: '内容管理'
  },

  dashboard: {
    title: '数据总览',
    desc: '按反应体系归集的 DFT 计算结果：每个体系收录催化剂模型、总能、活化能与结构信息，可逐条追溯 CIF 与 OUTCAR 来源。',
    badge: 'DFT 数据平台',
    kpi: {
      catalysts: { label: '催化剂体系', sub: '跨反应去重统计' },
      energies: { label: 'DFT 总能', sub: '来自 OUTCAR 解析' },
      structures: { label: '结构模型', sub: '来自 CIF 解析' },
      barriers: { label: '平均能垒', sub: '仅统计已填数值' }
    },
    charts: {
      coverage: '各反应催化剂覆盖',
      descriptors: 'DFT 描述符分布',
      structures: '结构模型分布',
      sources: '当前数据源'
    },
    sections: {
      workspace: '反应工作区',
      workspaceDesc: '已建立的反应体系按催化剂数量排列，点击进入对应子库查看明细。',
      table: '催化剂数据集'
    },
    sources: {
      cif: { tag: 'STRUCTURE', name: 'CIF 结构文件', desc: '解析元素种类、原子数与晶胞参数' },
      outcar: { tag: 'ENERGY', name: 'VASP OUTCAR', desc: '读取 free energy TOTEN 作为总能' },
      data: { tag: 'CURATED', name: 'data.js 正式数据', desc: '已提交到仓库的条目' },
      draft: { tag: 'LOCAL', name: '本地草稿', desc: '仅保存在当前浏览器' }
    },
    empty: {
      noData: '数据库还是空的：上传 CIF 与 OUTCAR，即可建立第一条 DFT 记录。',
      noMatch: '没有匹配的数据，试试调整搜索或筛选条件。'
    }
  },

  descriptors: {
    barrier: { label: '活化能 Ea', unit: 'eV', desc: '反应路径过渡态相对初始态的能量差，单位 eV。' },
    eads: { label: '吸附能 Eads', unit: 'eV', desc: '关键中间体在催化剂表面的吸附能，负值表示吸附越强。' },
    reactionEnergy: { label: '反应能 ΔE', unit: 'eV', desc: '产物与反应物的总能差，用于判断热力学可行性。' },
    dftEnergy: { label: '总能 E_total', unit: 'eV', desc: 'VASP OUTCAR 中的 free energy TOTEN，由上传的 OUTCAR 自动解析。' },
    evac: { label: '氧空位形成能 Evac', unit: 'eV', desc: '氧化物载体表面氧空位的形成能，用于描述载体的供氧能力。' }
  },

  reactions: {
    'ch4-combustion': {
      name: '甲烷燃烧',
      en: 'CH4 Combustion',
      summary: '甲烷低温完全氧化的 DFT 研究体系，关注 CH4 第一步 C–H 解离能垒与含氧中间体的吸附强度。',
      conditions: [
        { label: '泛函 / 色散', value: 'PBE + D3(BJ)' },
        { label: '截断能', value: '450 eV' },
        { label: 'k 点网格', value: '3×3×1' },
        { label: '收敛标准', value: 'EDIFF 1×10⁻⁵ eV，力 < 0.03 eV/Å' },
        { label: '真空层', value: '15 Å' }
      ],
      notes: [
        '以 Pd、Pt、Ni 等金属表面 slab 模型为主，重点考察 CH4 第一步 C–H 解离的过渡态能垒。',
        '常用描述符：CHx 吸附能、O 吸附能、过渡态相对能量。',
        '载体效应通过 CeO2、ZrO2 等氧化物 slab 或金属–载体界面模型体现。'
      ]
    },
    'c2h6-combustion': {
      name: '乙烷燃烧',
      en: 'C2H6 Combustion',
      summary: '乙烷完全氧化的 DFT 研究体系，C–C 与 C–H 键的解离竞争决定产物分布，需比较两条路径的能垒。',
      conditions: [
        { label: '泛函 / 色散', value: 'PBE + D3(BJ)' },
        { label: '截断能', value: '450 eV' },
        { label: 'k 点网格', value: '3×3×1' },
        { label: '收敛标准', value: 'EDIFF 1×10⁻⁵ eV，力 < 0.03 eV/Å' },
        { label: '真空层', value: '15 Å' }
      ],
      notes: [
        '乙烷 C–C 键键能较低，C–C 与 C–H 解离路径的能垒差决定生成 CO2 还是含氧副产物。',
        '常用描述符：C2H5 与 C2H4 的吸附能、过渡态能垒。',
        '高温下乙烯会进一步深度氧化，计算中需同时比较脱氢与氧化两条路径。'
      ]
    }
  },

  admin: {
    title: '内容管理',
    desc: '在这里修改页面上的文字。改动先保存在当前浏览器，点「导出 content.js」并提交到仓库后，才会对所有访问者生效。',
    localOnly: '当前修改仅在本浏览器生效，尚未提交到仓库。',
    saved: '已保存到本地，刷新页面后仍然有效。',
    reset: '已恢复为仓库中的版本。'
  },

  upload: {
    title: '上传计算数据',
    desc: 'CIF 结构文件为必填，OUTCAR 可选；两者都上传时会自动读取总能作为 DFT 数据。',
    cifLabel: '结构文件 CIF（必填）',
    outcarLabel: 'OUTCAR（可选，自动读取总能）'
  }
};
