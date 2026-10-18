/* =========================================================================
   app.js — ZJU-ICED 催化剂 DFT 数据库 前端应用
   -------------------------------------------------------------------------
   · 数据：data.js 正式条目 + 浏览器本地草稿（上传产生）
   · 文案：content.js，可在「内容管理」页面修改并导出
   · 计算：上传的 CIF 在本地解析结构，OUTCAR 在本地解析总能
   ========================================================================= */
(function () {
  'use strict';

  /* ============================ 基础工具 ============================ */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numText(v, digits) { return isNum(v) ? v.toFixed(digits === undefined ? 2 : digits) : '—'; }
  function fmtCount(n) { return isNum(n) ? String(n) : ''; }

  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  function subscript(n) { return String(n).split('').map(function (c) { return SUB[c] || c; }).join(''); }

  function deepClone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }

  function deepMerge(base, over) {
    if (!over || typeof over !== 'object') return base;
    Object.keys(over).forEach(function (k) {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        base[k] = deepMerge(base[k], v);
      } else {
        base[k] = v;
      }
    });
    return base;
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /* ============================ 常量 ============================ */
  const DRAFT_KEY = 'iced-db:drafts:v1';
  const CONTENT_KEY = 'iced-db:content:v1';
  const PAGE_SIZE = 10;
  const PALETTE = ['#2b7ac4', '#e8710a', '#31a354', '#7b5ea7', '#d64550', '#00a3b5', '#b5921a', '#8a5a44'];
  const HAS_ECHARTS = typeof echarts !== 'undefined';
  const HAS_3DMOL = typeof $3Dmol !== 'undefined';
  const REACTIONS = Array.isArray(window.REACTIONS) ? window.REACTIONS : [];
  const DFT_KEYS = ['barrier', 'eads', 'reactionEnergy', 'dftEnergy', 'evac'];
  const NUMERIC_KEYS = { barrier: 1, eads: 1, reactionEnergy: 1, dftEnergy: 1, evac: 1, totalAtoms: 1 };

  /* ============================ 内容层 ============================ */
  const BASE_CONTENT = (window.SITE_CONTENT && typeof window.SITE_CONTENT === 'object') ? window.SITE_CONTENT : {};

  let C = deepClone(BASE_CONTENT);

  function loadContentOverlay() {
    try {
      const raw = localStorage.getItem(CONTENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function effectiveContent() {
    return deepMerge(deepClone(BASE_CONTENT), loadContentOverlay() || {});
  }

  function saveContent(next) {
    try {
      localStorage.setItem(CONTENT_KEY, JSON.stringify(next));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，内容未能保存');
      return false;
    }
  }

  function clearContent() {
    try { localStorage.removeItem(CONTENT_KEY); } catch (e) { /* 忽略 */ }
  }

  function hasLocalContent() {
    try { return !!localStorage.getItem(CONTENT_KEY); } catch (e) { return false; }
  }

  function cget(path, fallback) {
    const parts = String(path).split('.');
    let cur = C;
    for (let i = 0; i < parts.length; i++) {
      if (cur === undefined || cur === null) return fallback;
      cur = cur[parts[i]];
    }
    return cur === undefined || cur === null ? fallback : cur;
  }

  function reactionText(r) {
    const all = C.reactions || {};
    return all[r.id] || {};
  }

  function descriptor(key) {
    const all = C.descriptors || {};
    return all[key] || { label: key, unit: '', desc: '' };
  }

  /* ============================ 数据层 ============================ */
  function loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveDrafts(list) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，草稿未能保存');
      return false;
    }
  }

  function curated() { return Array.isArray(window.CATALYST_DATA) ? window.CATALYST_DATA : []; }
  function allRecords() { return loadDrafts().concat(curated()); }

  function reactionById(id) {
    for (let i = 0; i < REACTIONS.length; i++) if (REACTIONS[i].id === id) return REACTIONS[i];
    return null;
  }

  function structureOf(d) { return d && d.structure ? d.structure : null; }
  function outcarOf(d) { return d && d.outcar ? d.outcar : null; }
  function totalAtomsOf(d) { const s = structureOf(d); return s && isNum(s.totalAtoms) ? s.totalAtoms : null; }

  function compositionHtml(d) {
    const s = structureOf(d);
    if (!s || !s.atomCounts) return '<span class="muted">—</span>';
    const els = Object.keys(s.atomCounts);
    if (!els.length) return '<span class="muted">—</span>';
    const shown = els.slice(0, 5).map(function (el) {
      return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(s.atomCounts[el])) + '</sub></span>';
    });
    if (els.length > 5) shown.push('<span class="chip">+' + (els.length - 5) + '</span>');
    return shown.join('');
  }

  /* ============================ 统计 ============================ */
  function avgOf(rows, key) {
    let sum = 0, n = 0;
    rows.forEach(function (d) { if (isNum(d[key])) { sum += d[key]; n++; } });
    return n ? { avg: sum / n, n: n } : { avg: null, n: 0 };
  }

  function countByReaction(rows) {
    const m = {};
    REACTIONS.forEach(function (r) { m[r.id] = 0; });
    rows.forEach(function (d) {
      for (let i = 0; i < REACTIONS.length; i++) {
        if (REACTIONS[i].reaction === d.reaction) { m[REACTIONS[i].id]++; return; }
      }
    });
    return m;
  }

  function overallStats(rows) {
    const formulas = {};
    let energies = 0, structures = 0, outcars = 0;
    rows.forEach(function (d) {
      if (d.formula) formulas[d.formula] = 1;
      if (isNum(d.dftEnergy)) energies++;
      if (structureOf(d)) structures++;
      if (outcarOf(d)) outcars++;
    });
    return {
      total: rows.length,
      uniqueFormulas: Object.keys(formulas).length,
      energies: energies,
      structures: structures,
      outcars: outcars,
      barrier: avgOf(rows, 'barrier')
    };
  }

  /* ============================ 状态 / 路由 ============================ */
  const state = {
    view: 'dashboard',
    reactionId: null,
    search: '',
    metal: '',
    sortKey: 'id',
    sortDir: 'asc',
    page: 1
  };

  const chartRefs = {};
  let currentViewer = null;

  function parseHash() {
    const raw = (location.hash || '').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] === 'db' && parts[1]) return { view: 'reaction', reactionId: parts[1] };
    if (parts[0] === 'admin') return { view: 'admin', reactionId: null };
    return { view: 'dashboard', reactionId: null };
  }

  function applyRoute() {
    const route = parseHash();
    const changed = route.view !== state.view || route.reactionId !== state.reactionId;
    if (changed) {
      state.page = 1;
      state.search = '';
      state.metal = '';
      state.sortKey = 'id';
      state.sortDir = 'asc';
    }
    state.view = route.view;
    state.reactionId = route.reactionId;
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ============================ 侧边栏 ============================ */
  function renderSidebar() {
    const nav = $('#sidebarNav');
    if (!nav) return;
    const rows = allRecords();
    const counts = countByReaction(rows);
    const drafts = loadDrafts();
    const parts = [];

    parts.push('<div class="nav-section">' + esc(cget('site.navWorkspace', '工作区')) + '</div>');
    parts.push(navItem('#/', '◧', cget('dashboard.title', '数据总览'), rows.length, state.view === 'dashboard'));
    parts.push(navItem('#/admin', '⚙', cget('site.navAdmin', '内容管理'), null, state.view === 'admin'));

    parts.push('<div class="nav-section">' + esc(cget('site.navReactions', '反应体系')) + '</div>');
    REACTIONS.forEach(function (r) {
      const t = reactionText(r);
      const name = t.name || r.id;
      const active = state.view === 'reaction' && state.reactionId === r.id;
      parts.push(
        '<a class="nav-item' + (active ? ' active' : '') + '" href="#/db/' + esc(r.id) + '">' +
        '<span class="ico">' + esc(r.icon || '◆') + '</span>' +
        '<span class="lbl">' + esc(name) + '</span>' +
        '<span class="nav-count">' + (counts[r.id] || 0) + '</span></a>'
      );
    });

    nav.innerHTML = parts.join('');

    const status = $('#sidebarStatus');
    if (status) {
      status.innerHTML =
        '<div class="status-row"><span>本地草稿</span><b>' + drafts.length + '</b></div>' +
        '<div class="status-row"><span>数据来源</span><b>' + (hasLocalContent() ? '本地内容' : '静态站点') + '</b></div>';
    }
  }

  function navItem(href, icon, label, count, active) {
    return '<a class="nav-item' + (active ? ' active' : '') + '" href="' + href + '">' +
      '<span class="ico">' + esc(icon) + '</span>' +
      '<span class="lbl">' + esc(label) + '</span>' +
      (count === null ? '' : '<span class="nav-count">' + count + '</span>') + '</a>';
  }

  /* ============================ 图表 ============================ */
  function disposeCharts() {
    Object.keys(chartRefs).forEach(function (k) {
      if (chartRefs[k]) { try { chartRefs[k].dispose(); } catch (e) { /* 忽略 */ } }
      delete chartRefs[k];
    });
  }

  function initCharts() {
    disposeCharts();
    if (!HAS_ECHARTS) {
      $$('.chart-empty').forEach(function (el) { el.classList.add('show'); });
      return;
    }
    $$('.chart[data-chart]').forEach(function (el) {
      try { chartRefs[el.id] = echarts.init(el); } catch (e) { console.warn('图表初始化失败', el.id, e); }
    });
  }

  function toggleEmpty(id, isEmpty) {
    const el = document.getElementById(id + 'Empty');
    if (el) el.classList.toggle('show', !!isEmpty);
  }

  const AXIS_LABEL = { fontSize: 11, color: '#64748b' };
  const AXIS_NAME = { fontSize: 11.5, color: '#64748b' };

  function chartFrame(id, cls, label) {
    return '<div class="chart-box">' +
      '<div id="' + id + '" class="chart ' + cls + '" data-chart="1"></div>' +
      '<div class="chart-empty" id="' + id + 'Empty"><span>📊</span>' + esc(label || '暂无数据') + '</div>' +
      '</div>';
  }

  function dashboardCharts(rows) {
    const counts = countByReaction(rows);
    const named = REACTIONS.map(function (r) {
      const t = reactionText(r);
      return { id: r.id, name: t.name || r.id, value: counts[r.id] || 0, accent: r.accent };
    });

    /* 覆盖率：横向条形 */
    if (chartRefs.chartCoverage) {
      const sorted = named.slice().sort(function (a, b) { return a.value - b.value; });
      chartRefs.chartCoverage.setOption({
        grid: { left: 120, right: 60, top: 14, bottom: 24 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (p) { return p[0].name + '：' + p[0].value + ' 个体系'; } },
        xAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        yAxis: { type: 'category', data: sorted.map(function (x) { return x.name; }), axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: AXIS_LABEL },
        series: [{
          type: 'bar',
          data: sorted.map(function (x) { return { value: x.value, itemStyle: { color: x.accent || '#2b7ac4' } }; }),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', fontSize: 11, color: '#475569', formatter: '{c}' }
        }]
      }, true);
    }

    /* 描述符分布：按反应堆叠 */
    if (chartRefs.chartDesc) {
      const keys = DFT_KEYS;
      const byReaction = {};
      REACTIONS.forEach(function (r) { byReaction[r.reaction] = {}; keys.forEach(function (k) { byReaction[r.reaction][k] = 0; }); });
      rows.forEach(function (d) {
        if (!byReaction[d.reaction]) return;
        keys.forEach(function (k) { if (isNum(d[k])) byReaction[d.reaction][k]++; });
      });
      const series = REACTIONS.map(function (r, idx) {
        return {
          name: reactionText(r).name || r.id,
          type: 'bar',
          stack: 'total',
          barMaxWidth: 34,
          itemStyle: { color: PALETTE[idx % PALETTE.length] },
          data: keys.map(function (k) { return byReaction[r.reaction][k]; })
        };
      });
      chartRefs.chartDesc.setOption({
        color: PALETTE,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, itemWidth: 11, itemHeight: 11, textStyle: { fontSize: 11, color: '#64748b' } },
        grid: { left: 52, right: 20, top: 16, bottom: 46 },
        xAxis: { type: 'category', data: keys.map(function (k) { return descriptor(k).label; }), axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { fontSize: 10.5, color: '#64748b', interval: 0, rotate: 12 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: series
      }, true);
    }

    /* 结构模型分布：环形 */
    if (chartRefs.chartStruct) {
      const data = named.map(function (x) {
        const n = rows.filter(function (d) { return reactionById(x.id) && d.reaction === reactionById(x.id).reaction && structureOf(d); }).length;
        return { name: x.name, value: n };
      }).filter(function (x) { return x.value > 0; });
      chartRefs.chartStruct.setOption({
        color: PALETTE,
        tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 个 ({d}%)' },
        legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10.5, color: '#64748b' } },
        series: [{
          type: 'pie', radius: ['42%', '64%'], center: ['50%', '42%'],
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false }, labelLine: { show: false },
          data: data
        }]
      }, true);
    }

    toggleEmpty('chartCoverage', rows.length === 0);
    toggleEmpty('chartDesc', rows.length === 0);
    toggleEmpty('chartStruct', rows.filter(function (d) { return structureOf(d); }).length === 0);
  }

  function reactionCharts(rows) {
    /* Ea vs Eads，按金属分组 */
    if (chartRefs.chartScatter) {
      const groups = {};
      rows.forEach(function (d) {
        if (!isNum(d.barrier) || !isNum(d.eads)) return;
        const g = d.metal || '未标注';
        (groups[g] = groups[g] || []).push({ value: [d.barrier, d.eads], raw: d });
      });
      const names = Object.keys(groups).sort();
      chartRefs.chartScatter.setOption({
        color: PALETTE,
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(255,255,255,.97)',
          borderColor: '#e2e8f0',
          textStyle: { color: '#1f2933', fontSize: 12.5 },
          formatter: function (p) {
            const d = p.data.raw;
            return '<b>' + esc(d.formula) + '</b><br/>' +
              '金属：' + esc(d.metal || '—') + ' · 载体：' + esc(d.support || '—') + '<br/>' +
              'Ea：<b>' + numText(d.barrier) + ' eV</b><br/>' +
              'Eads：<b>' + numText(d.eads) + ' eV</b><br/>' +
              '总能：' + (isNum(d.dftEnergy) ? numText(d.dftEnergy, 3) + ' eV' : '—');
          }
        },
        legend: { type: 'scroll', bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11, color: '#64748b' } },
        grid: { left: 62, right: 24, top: 20, bottom: 52 },
        xAxis: { name: '活化能 Ea (eV)', nameLocation: 'middle', nameGap: 28, nameTextStyle: AXIS_NAME, scale: true, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisTick: { show: false }, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        yAxis: { name: '吸附能 Eads (eV)', nameLocation: 'middle', nameGap: 44, nameRotate: 90, nameTextStyle: AXIS_NAME, scale: true, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisTick: { show: false }, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: names.map(function (n) {
          return { name: n, type: 'scatter', symbolSize: 11, itemStyle: { opacity: .85, borderColor: '#fff', borderWidth: 1 }, emphasis: { scale: 1.5 }, data: groups[n] };
        })
      }, true);
    }

    if (chartRefs.chartMetal) {
      const counts = {};
      rows.forEach(function (d) { const k = d.metal || '未标注'; counts[k] = (counts[k] || 0) + 1; });
      const list = Object.keys(counts).map(function (k) { return { name: k, value: counts[k] }; }).sort(function (a, b) { return b.value - a.value; });
      chartRefs.chartMetal.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (p) { return p[0].name + '：' + p[0].value + ' 个'; } },
        grid: { left: 42, right: 18, top: 14, bottom: 26 },
        xAxis: { type: 'category', data: list.map(function (x) { return x.name; }), axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: AXIS_LABEL },
        yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: [{ type: 'bar', data: list.map(function (x) { return x.value; }), barMaxWidth: 30, itemStyle: { borderRadius: [4, 4, 0, 0], color: '#2b7ac4' } }]
      }, true);
    }

    toggleEmpty('chartScatter', rows.filter(function (d) { return isNum(d.barrier) && isNum(d.eads); }).length === 0);
    toggleEmpty('chartMetal', rows.length === 0);
  }

  /* ============================ 表格 ============================ */
  function columnsForView() {
    return [
      { key: 'id', label: 'ID' },
      { key: 'formula', label: '化学式', cls: 'formula' },
      { key: 'metal', label: '金属', render: function (d) { return d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '<span class="muted">—</span>'; } },
      { key: 'support', label: '载体' },
      { key: 'reaction', label: '反应体系', render: function (d) {
        for (let i = 0; i < REACTIONS.length; i++) {
          if (REACTIONS[i].reaction === d.reaction) return esc(reactionText(REACTIONS[i]).name || REACTIONS[i].id);
        }
        return d.reaction ? esc(d.reaction) : '<span class="muted">—</span>';
      } },
      { key: 'structure', label: '元素组成', sortable: false, render: compositionHtml },
      { key: 'totalAtoms', label: '原子数', num: true, render: function (d) { return numText(totalAtomsOf(d), 0); } },
      { key: 'barrier', label: 'Ea (eV)', num: true, render: function (d) { return numText(d.barrier); } },
      { key: 'eads', label: 'Eads (eV)', num: true, render: function (d) { return numText(d.eads); } },
      { key: 'reactionEnergy', label: 'ΔE (eV)', num: true, render: function (d) { return numText(d.reactionEnergy); } },
      { key: 'dftEnergy', label: '总能 (eV)', num: true, render: function (d) { return isNum(d.dftEnergy) ? d.dftEnergy.toFixed(3) : '—'; } },
      { key: 'ref', label: '来源', render: function (d) { return d.ref ? esc(d.ref) : '<span class="muted">—</span>'; } }
    ];
  }

  function sortValue(d, key) {
    if (key === 'totalAtoms') { const t = totalAtomsOf(d); return isNum(t) ? t : -Infinity; }
    if (NUMERIC_KEYS[key]) return isNum(d[key]) ? d[key] : -Infinity;
    return String(d[key] === undefined || d[key] === null ? '' : d[key]);
  }

  function baseRows() {
    const all = allRecords();
    if (state.view === 'reaction' && state.reactionId) {
      const r = reactionById(state.reactionId);
      if (!r) return [];
      return all.filter(function (d) { return d.reaction === r.reaction; });
    }
    return all;
  }

  function filteredRows() {
    const q = state.search.trim().toLowerCase();
    const rows = baseRows().filter(function (d) {
      if (state.metal && d.metal !== state.metal) return false;
      if (q) {
        const s = structureOf(d);
        const hay = [
          d.id, d.formula, d.metal, d.support, d.reaction, d.ref, d.note,
          s ? s.file : '', s ? s.formula : '', s ? (s.elements || []).join(' ') : ''
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    const key = state.sortKey;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  function renderTable(rows) {
    const host = $('#tableHost');
    if (!host) return;
    const cols = columnsForView();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    const head = cols.map(function (c) {
      const sortable = c.sortable !== false;
      const active = state.sortKey === c.key;
      const arrow = active ? '<span class="arrow">' + (state.sortDir === 'asc' ? '▲' : '▼') + '</span>' : '';
      return '<th class="' + (sortable ? 'sortable' : '') + '" data-key="' + esc(c.key) + '">' + esc(c.label) + arrow + '</th>';
    }).join('');

    let body;
    if (!pageRows.length) {
      const msg = allRecords().length === 0
        ? '<b>还没有数据</b>' + esc(cget('dashboard.empty.noData', '上传 CIF 与 OUTCAR，建立第一条记录。'))
        : '<b>没有匹配的数据</b>' + esc(cget('dashboard.empty.noMatch', '试试调整搜索或筛选条件。'));
      body = '<tr><td class="empty" colspan="' + cols.length + '">' + msg + '</td></tr>';
    } else {
      body = pageRows.map(function (d, idx) {
        const cells = cols.map(function (c) {
          let val;
          if (c.key === 'formula') {
            val = esc(d.formula || '—') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '');
          } else if (c.render) {
            val = c.render(d);
          } else {
            val = esc(d[c.key] === undefined || d[c.key] === null ? '' : d[c.key]);
          }
          return '<td class="' + (c.num ? 'num' : '') + ' ' + (c.cls || '') + '">' + val + '</td>';
        }).join('');
        return '<tr data-row="' + (start + idx) + '">' + cells + '</tr>';
      }).join('');
    }

    host.innerHTML = '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';

    const info = $('#resultInfo');
    if (info) info.textContent = '共 ' + total + ' 条记录';
    const pageInfo = $('#pageInfo');
    if (pageInfo) pageInfo.textContent = '第 ' + state.page + ' / ' + totalPages + ' 页';
    const prev = $('#prevBtn');
    const next = $('#nextBtn');
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;

    $$('#tableHost th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.getAttribute('data-key');
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'asc'; }
        refreshTable();
      });
    });

    $$('#tableHost tbody tr[data-row]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        const idx = parseInt(tr.getAttribute('data-row'), 10);
        openDrawer(rows[idx]);
      });
    });
  }

  function filtersHtml() {
    const set = {};
    baseRows().forEach(function (d) { if (d.metal) set[d.metal] = 1; });
    const opts = Object.keys(set).sort().map(function (m) {
      return '<option value="' + esc(m) + '"' + (state.metal === m ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
    return '<div class="filters">' +
      '<input id="searchInput" type="search" placeholder="搜索化学式、元素、金属、载体、来源…" value="' + esc(state.search) + '" />' +
      '<select id="metalFilter"><option value="">全部金属</option>' + opts + '</select>' +
      '<button class="btn" id="resetBtn">重置</button>' +
      '</div>';
  }

  function tablePanel() {
    return '<div class="panel">' +
      '<div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.sections.table', '催化剂数据集')) + '</div>' +
      '<span class="muted" id="resultInfo">共 0 条记录</span></div>' +
      filtersHtml() +
      '<div class="table-wrap" id="tableHost"></div>' +
      '<div class="pagination"><span class="muted" id="pageInfo"></span>' +
      '<div class="btns"><button class="page-btn" id="prevBtn">上一页</button>' +
      '<button class="page-btn" id="nextBtn">下一页</button></div></div></div>';
  }

  function bindTableEvents() {
    const search = $('#searchInput');
    if (search) search.addEventListener('input', function (e) { state.search = e.target.value; state.page = 1; refreshTable(); });
    const metal = $('#metalFilter');
    if (metal) metal.addEventListener('change', function (e) { state.metal = e.target.value; state.page = 1; refreshTable(); });
    const reset = $('#resetBtn');
    if (reset) reset.addEventListener('click', function () {
      state.search = ''; state.metal = ''; state.page = 1;
      const s = $('#searchInput'); if (s) s.value = '';
      const m = $('#metalFilter'); if (m) m.value = '';
      refreshTable();
    });
    const prev = $('#prevBtn');
    if (prev) prev.addEventListener('click', function () { if (state.page > 1) { state.page--; refreshTable(); } });
    const next = $('#nextBtn');
    if (next) next.addEventListener('click', function () {
      const totalPages = Math.max(1, Math.ceil(filteredRows().length / PAGE_SIZE));
      if (state.page < totalPages) { state.page++; refreshTable(); }
    });
  }

  function refreshTable() { renderTable(filteredRows()); }

  /* ============================ 视图：数据总览 ============================ */
  function kpiCard(value, label, sub, color, icon) {
    return '<div class="kpi" style="--kpi-color:' + (color || 'var(--primary)') + '">' +
      (icon ? '<div class="kpi-ico">' + icon + '</div>' : '') +
      '<div class="kpi-value">' + value + '</div>' +
      '<div class="kpi-label">' + esc(label) + '</div>' +
      (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderDashboard() {
    const rows = allRecords();
    const s = overallStats(rows);
    const kpi = cget('dashboard.kpi', {}) || {};

    const kpiHtml = '<div class="kpi-grid four">' +
      kpiCard(s.uniqueFormulas, (kpi.catalysts || {}).label || '催化剂体系', (kpi.catalysts || {}).sub || '', '#2b7ac4', '🧪') +
      kpiCard(s.energies, (kpi.energies || {}).label || 'DFT 总能', (kpi.energies || {}).sub || '', '#7b5ea7', '⚡') +
      kpiCard(s.structures, (kpi.structures || {}).label || '结构模型', (kpi.structures || {}).sub || '', '#31a354', '🧬') +
      kpiCard(isNum(s.barrier.avg) ? s.barrier.avg.toFixed(2) + ' eV' : '—', (kpi.barriers || {}).label || '平均能垒', (kpi.barriers || {}).sub ? (kpi.barriers || {}).sub + '（' + s.barrier.n + ' 条）' : '', '#e8710a', '📈') +
      '</div>';

    const src = cget('dashboard.sources', {}) || {};
    const sourcesHtml =
      '<div class="source-row"><span class="source-tag">' + esc((src.cif || {}).tag || 'STRUCTURE') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.cif || {}).name || 'CIF 结构文件') + '</div>' +
      '<div class="source-desc">' + esc((src.cif || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + s.structures + '</span></div>' +
      '<div class="source-row"><span class="source-tag">' + esc((src.outcar || {}).tag || 'ENERGY') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.outcar || {}).name || 'VASP OUTCAR') + '</div>' +
      '<div class="source-desc">' + esc((src.outcar || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + s.outcars + '</span></div>' +
      '<div class="source-row"><span class="source-tag">' + esc((src.data || {}).tag || 'CURATED') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.data || {}).name || 'data.js') + '</div>' +
      '<div class="source-desc">' + esc((src.data || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + curated().length + '</span></div>' +
      '<div class="source-row"><span class="source-tag">' + esc((src.draft || {}).tag || 'LOCAL') + '</span>' +
      '<div class="source-main"><div class="source-name">' + esc((src.draft || {}).name || '本地草稿') + '</div>' +
      '<div class="source-desc">' + esc((src.draft || {}).desc || '') + '</div></div>' +
      '<span class="source-count">' + loadDrafts().length + '</span></div>';

    const counts = countByReaction(rows);
    const cards = REACTIONS.map(function (r) {
      const t = reactionText(r);
      const list = rows.filter(function (d) { return d.reaction === r.reaction; });
      const vals = list.filter(function (d) {
        return DFT_KEYS.some(function (k) { return isNum(d[k]); });
      }).length;
      const structs = list.filter(function (d) { return structureOf(d); }).length;
      return '<div class="ws-card" data-go="#/db/' + esc(r.id) + '">' +
        '<div class="ws-name"><span>' + esc(r.icon || '◆') + ' ' + esc(t.name || r.id) + '</span>' +
        '<span class="pill ' + (counts[r.id] ? 'pill-ok' : 'pill-idle') + '">' + (counts[r.id] ? '已入库' : '待录入') + '</span></div>' +
        '<div class="ws-en">' + esc(t.en || '') + '</div>' +
        '<div class="ws-stat"><span><b>' + (counts[r.id] || 0) + '</b> 催化剂</span>' +
        '<span><b>' + structs + '</b> 结构</span>' +
        '<span><b>' + vals + '</b> DFT 数值</span></div>' +
        '</div>';
    }).join('');

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(cget('dashboard.title', '数据总览')) + '</h1>' +
      '<span class="pill pill-ok">✓ ' + esc(cget('dashboard.badge', 'DFT 数据平台')) + '</span></div>' +
      '<p class="page-desc">' + esc(cget('dashboard.desc', '')) + '</p></div>' +
      kpiHtml +
      '<div class="charts-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.coverage', '各反应催化剂覆盖')) + '</div></div>' +
      '<div class="panel-body">' + chartFrame('chartCoverage', 'chart-md') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.descriptors', 'DFT 描述符分布')) + '</div></div>' +
      '<div class="panel-body">' + chartFrame('chartDesc', 'chart-md') + '</div></div>' +
      '</div>' +
      '<div class="charts-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.structures', '结构模型分布')) + '</div></div>' +
      '<div class="panel-body">' + chartFrame('chartStruct', 'chart-sm2') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.charts.sources', '当前数据源')) + '</div></div>' +
      '<div class="panel-body"><div class="source-list">' + sourcesHtml + '</div></div></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + esc(cget('dashboard.sections.workspace', '反应工作区')) + '</div>' +
      '<span class="muted">' + esc(cget('dashboard.sections.workspaceDesc', '')) + '</span></div>' +
      '<div class="panel-body"><div class="ws-grid">' + cards + '</div></div></div>' +
      tablePanel();

    initCharts();
    dashboardCharts(rows);
    bindTableEvents();
    $$('.ws-card').forEach(function (card) {
      card.addEventListener('click', function () { navigate(card.getAttribute('data-go')); });
    });
    refreshTable();
  }

  /* ============================ 视图：反应子库 ============================ */
  function renderReactionView(r) {
    const t = reactionText(r);
    const rows = allRecords().filter(function (d) { return d.reaction === r.reaction; });
    const ea = avgOf(rows, 'barrier');
    const eads = avgOf(rows, 'eads');
    const structs = rows.filter(function (d) { return structureOf(d); }).length;

    const conds = (t.conditions || []).map(function (c) {
      return '<div class="cond-row"><span class="k">' + esc(c.label) + '</span><span class="v">' + esc(c.value) + '</span></div>';
    }).join('') || '<p class="muted">尚未填写计算设置。</p>';

    const descRows = DFT_KEYS.map(function (k) {
      const d = descriptor(k);
      return '<div class="metric-item"><span class="mk">' + esc(d.label) + '</span>' +
        '<span class="mu">' + esc(d.unit) + '</span><div class="md">' + esc(d.desc) + '</div></div>';
    }).join('');

    const notes = (t.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') || '<li class="muted">尚未填写要点。</li>';

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(r.icon || '◆') + ' ' + esc(t.name || r.id) +
      ' <span class="en-tag">' + esc(t.en || '') + '</span></h1>' +
      '<span class="pill ' + (rows.length ? 'pill-ok' : 'pill-idle') + '">' + (rows.length ? '已入库 ' + rows.length + ' 条' : '待录入') + '</span></div>' +
      '<p class="page-desc">' + esc(t.summary || '') + '</p></div>' +

      '<div class="kpi-grid four">' +
      kpiCard(rows.length, '催化剂体系', r.reaction, '#2b7ac4', '🧪') +
      kpiCard(isNum(ea.avg) ? ea.avg.toFixed(2) + ' eV' : '—', '平均活化能 Ea', ea.n + ' 条有效数据', '#e8710a', '📈') +
      kpiCard(isNum(eads.avg) ? eads.avg.toFixed(2) + ' eV' : '—', '平均吸附能 Eads', eads.n + ' 条有效数据', '#7b5ea7', '🧲') +
      kpiCard(structs, '结构模型', 'CIF 已解析', '#31a354', '🧬') +
      '</div>' +

      '<div class="meta-grid">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">计算设置</div></div>' +
      '<div class="panel-body"><div class="cond-list">' + conds + '</div></div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">DFT 描述符</div></div>' +
      '<div class="panel-body">' + descRows + '</div></div>' +
      '</div>' +

      '<div class="charts-2">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">活化能 vs. 吸附能</div></div>' +
      '<div class="panel-body">' + chartFrame('chartScatter', 'chart-md') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">金属分布</div></div>' +
      '<div class="panel-body">' + chartFrame('chartMetal', 'chart-sm2') + '</div></div>' +
      '</div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">体系要点</div></div>' +
      '<div class="panel-body"><ul class="note-list">' + notes + '</ul></div></div>' +

      tablePanel();

    initCharts();
    reactionCharts(rows);
    bindTableEvents();
    refreshTable();
  }

  /* ============================ 视图：内容管理 ============================ */
  function fieldInput(path, label, opts) {
    opts = opts || {};
    const value = cget(path, '');
    return '<div class="form-row"><label>' + esc(label) + '</label>' +
      '<input data-path="' + esc(path) + '" value="' + esc(value) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + ' />' +
      '</div>';
  }

  function fieldArea(path, label, rows) {
    return '<div class="form-row"><label>' + esc(label) + '</label>' +
      '<textarea data-path="' + esc(path) + '" rows="' + (rows || 2) + '">' + esc(cget(path, '')) + '</textarea></div>';
  }

  function reactionEditor(r) {
    const t = reactionText(r);
    const conds = (t.conditions || []).map(function (c) {
      return '<div class="cond-edit-row">' +
        '<input class="cond-label" value="' + esc(c.label) + '" placeholder="名称" />' +
        '<input class="cond-value" value="' + esc(c.value) + '" placeholder="内容" />' +
        '<button type="button" class="icon-btn" data-remove-cond>×</button></div>';
    }).join('');
    const notes = (t.notes || []).join('\n');

    return '<div class="panel" data-reaction="' + esc(r.id) + '">' +
      '<div class="panel-head"><div class="panel-title">' + esc(r.icon || '◆') + ' ' + esc(t.name || r.id) +
      '<span class="muted" style="font-weight:400;margin-left:8px">' + esc(r.reaction) + '</span></div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' +
      fieldInput('reactions.' + r.id + '.name', '显示名称') +
      fieldInput('reactions.' + r.id + '.en', '英文名') +
      '</div>' +
      fieldArea('reactions.' + r.id + '.summary', '一句话说明', 2) +
      '<div class="section-label">计算设置 / 条件（可增删行）</div>' +
      '<div class="cond-edit-list" data-cond-list>' + conds + '</div>' +
      '<button type="button" class="btn btn-mini" data-add-cond>+ 添加一行</button>' +
      '<div class="section-label">体系要点（每行一条）</div>' +
      '<div class="form-row"><textarea data-notes rows="4" placeholder="每行一条要点">' + esc(notes) + '</textarea></div>' +
      '</div></div>';
  }

  function renderAdmin() {
    const reactionPanels = REACTIONS.map(reactionEditor).join('');
    const descPanels = DFT_KEYS.map(function (k) {
      return '<div class="form-grid3">' +
        fieldInput('descriptors.' + k + '.label', '名称') +
        fieldInput('descriptors.' + k + '.unit', '单位') +
        fieldInput('descriptors.' + k + '.desc', '说明') +
        '</div>';
    }).join('');

    const localNote = hasLocalContent()
      ? '<div class="warn-box">' + esc(cget('admin.localOnly', '当前修改仅在本浏览器生效。')) + '</div>'
      : '';

    $('#view').innerHTML =
      '<div class="page-head">' +
      '<div class="page-head-row"><h1 class="page-title">' + esc(cget('admin.title', '内容管理')) + '</h1>' +
      '<span class="pill ' + (hasLocalContent() ? 'pill-warn' : 'pill-idle') + '">' + (hasLocalContent() ? '有本地修改' : '与仓库一致') + '</span></div>' +
      '<p class="page-desc">' + esc(cget('admin.desc', '')) + '</p></div>' +
      localNote +
      '<form id="adminForm">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">站点信息</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('site.name', '站点名称') + fieldInput('site.subtitle', '副标题') + '</div>' +
      fieldInput('site.footer', '页脚文字') +
      '</div></div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">数据总览页文案</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('dashboard.title', '页面标题') + fieldInput('dashboard.badge', '右上角标签') + '</div>' +
      fieldArea('dashboard.desc', '页面说明', 2) +
      '<div class="section-label">KPI 卡片</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.catalysts.label', '卡片 1 名称') + fieldInput('dashboard.kpi.catalysts.sub', '卡片 1 说明') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.energies.label', '卡片 2 名称') + fieldInput('dashboard.kpi.energies.sub', '卡片 2 说明') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.structures.label', '卡片 3 名称') + fieldInput('dashboard.kpi.structures.sub', '卡片 3 说明') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.kpi.barriers.label', '卡片 4 名称') + fieldInput('dashboard.kpi.barriers.sub', '卡片 4 说明') + '</div>' +
      '<div class="section-label">图表与分区标题</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.charts.coverage', '图 1 标题') + fieldInput('dashboard.charts.descriptors', '图 2 标题') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.charts.structures', '图 3 标题') + fieldInput('dashboard.charts.sources', '数据源分区标题') + '</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.sections.workspace', '反应工作区标题') + fieldInput('dashboard.sections.table', '表格标题') + '</div>' +
      fieldArea('dashboard.sections.workspaceDesc', '反应工作区说明', 1) +
      '<div class="section-label">空状态文案</div>' +
      '<div class="form-grid2">' + fieldInput('dashboard.empty.noData', '无数据时') + fieldInput('dashboard.empty.noMatch', '筛选无结果时') + '</div>' +
      '</div></div>' +

      '<div class="panel"><div class="panel-head"><div class="panel-title">DFT 描述符</div></div>' +
      '<div class="panel-body admin-body">' + descPanels + '</div></div>' +

      reactionPanels +

      '<div class="panel"><div class="panel-head"><div class="panel-title">上传页与管理页文案</div></div>' +
      '<div class="panel-body admin-body">' +
      '<div class="form-grid2">' + fieldInput('upload.title', '上传弹窗标题') + fieldInput('upload.cifLabel', 'CIF 标签') + '</div>' +
      fieldArea('upload.desc', '上传说明', 1) +
      fieldInput('upload.outcarLabel', 'OUTCAR 标签') +
      '<div class="form-grid2">' + fieldInput('admin.title', '管理页标题') + fieldInput('admin.desc', '管理页说明') + '</div>' +
      '</div></div>' +
      '</form>' +

      '<div class="admin-actions">' +
      '<button class="btn btn-primary" id="adminSave">保存到本地</button>' +
      '<button class="btn" id="adminExport">导出 content.js</button>' +
      '<button class="btn btn-danger" id="adminReset">恢复仓库版本</button>' +
      '</div>';

    bindAdmin();
  }

  function bindAdmin() {
    $$('[data-add-cond]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const panel = btn.closest('[data-reaction]');
        const list = $('[data-cond-list]', panel);
        const row = document.createElement('div');
        row.className = 'cond-edit-row';
        row.innerHTML = '<input class="cond-label" placeholder="名称" /><input class="cond-value" placeholder="内容" />' +
          '<button type="button" class="icon-btn" data-remove-cond>×</button>';
        list.appendChild(row);
        bindRemoveCond(row);
      });
    });
    $$('[data-remove-cond]').forEach(bindRemoveCond);

    const save = $('#adminSave');
    if (save) save.addEventListener('click', function () {
      const next = collectAdmin();
      if (!saveContent(next)) return;
      C = effectiveContent();
      showToast(cget('admin.saved', '已保存到本地'));
      render();
    });

    const reset = $('#adminReset');
    if (reset) reset.addEventListener('click', function () {
      if (!window.confirm('确定恢复为仓库中的版本？本地修改将丢失。')) return;
      clearContent();
      C = effectiveContent();
      showToast(cget('admin.reset', '已恢复为仓库中的版本'));
      render();
    });

    const exp = $('#adminExport');
    if (exp) exp.addEventListener('click', function () {
      const next = collectAdmin();
      if (!saveContent(next)) return;
      C = effectiveContent();
      const text = '/* 由「内容管理」页面导出，' + new Date().toISOString().slice(0, 10) + ' */\n' +
        'window.SITE_CONTENT = ' + JSON.stringify(next, null, 2) + ';\n';
      download('content.js', text, 'text/javascript;charset=utf-8');
      showToast('已导出 content.js，覆盖仓库同名文件即可生效');
    });
  }

  function bindRemoveCond(btn) {
    btn.addEventListener('click', function () {
      const row = btn.closest('.cond-edit-row');
      if (row) row.remove();
    });
  }

  function collectAdmin() {
    const next = deepClone(C);
    $$('#adminForm [data-path]').forEach(function (el) {
      setPath(next, el.getAttribute('data-path'), el.value);
    });
    REACTIONS.forEach(function (r) {
      const panel = document.querySelector('[data-reaction="' + r.id + '"]');
      if (!panel) return;
      const conds = $$('.cond-edit-row', panel).map(function (row) {
        const l = $('.cond-label', row);
        const v = $('.cond-value', row);
        return { label: l ? l.value : '', value: v ? v.value : '' };
      }).filter(function (c) { return c.label.trim() || c.value.trim(); });
      const notesEl = panel.querySelector('[data-notes]');
      const notes = notesEl
        ? notesEl.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
        : [];
      if (!next.reactions) next.reactions = {};
      if (!next.reactions[r.id]) next.reactions[r.id] = {};
      next.reactions[r.id].conditions = conds;
      next.reactions[r.id].notes = notes;
    });
    return next;
  }

  /* ============================ 抽屉 ============================ */
  let currentRecord = null;

  function closeDrawer() {
    const drawer = $('#drawer');
    const overlay = $('#drawerOverlay');
    if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
    if (overlay) overlay.classList.remove('open');
    if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
    currentRecord = null;
  }

  function fieldHtml(k, v) {
    return '<div class="field"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>';
  }

  function openDrawer(d) {
    if (!d) return;
    currentRecord = d;
    const drawer = $('#drawer');
    const overlay = $('#drawerOverlay');
    if (!drawer) return;

    const s = structureOf(d);
    const oc = outcarOf(d);
    const r = REACTIONS.filter(function (x) { return x.reaction === d.reaction; })[0];
    const rname = r ? (reactionText(r).name || r.id) : (d.reaction || '未分类');

    let elRows = '';
    if (s && s.atomCounts) {
      elRows = Object.keys(s.atomCounts).sort(function (a, b) { return s.atomCounts[b] - s.atomCounts[a]; })
        .map(function (el) { return '<tr><td>' + esc(el) + '</td><td>' + esc(fmtCount(s.atomCounts[el])) + '</td></tr>'; }).join('');
    }

    const cell = s && s.cell
      ? ['a=' + (isNum(s.cell.a) ? s.cell.a : '–'), 'b=' + (isNum(s.cell.b) ? s.cell.b : '–'), 'c=' + (isNum(s.cell.c) ? s.cell.c : '–'),
         'α=' + (isNum(s.cell.alpha) ? s.cell.alpha + '°' : '–'), 'β=' + (isNum(s.cell.beta) ? s.cell.beta + '°' : '–'),
         'γ=' + (isNum(s.cell.gamma) ? s.cell.gamma + '°' : '–')].join('  ')
      : '';

    const ed = (k) => descriptor(k).label + ' (' + descriptor(k).unit + ')';

    drawer.innerHTML =
      '<div class="drawer-head">' +
      '<div><h3>' + esc(d.formula || '未命名') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '') + '</h3>' +
      '<div class="sub">' + esc(d.id || '') + ' · ' + esc(rname) + '</div></div>' +
      '<button class="close-btn" id="drawerClose">×</button></div>' +
      '<div class="drawer-body">' +
      '<div class="field-grid">' +
      fieldHtml('金属', d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '—') +
      fieldHtml('载体', esc(d.support || '—')) +
      fieldHtml(ed('barrier'), numText(d.barrier) + ' eV') +
      fieldHtml(ed('eads'), numText(d.eads) + ' eV') +
      fieldHtml(ed('reactionEnergy'), numText(d.reactionEnergy) + ' eV') +
      fieldHtml(ed('evac'), numText(d.evac) + ' eV') +
      fieldHtml(ed('dftEnergy'), isNum(d.dftEnergy) ? d.dftEnergy.toFixed(4) + ' eV' : '—') +
      fieldHtml('数据来源', esc(d.ref || '—')) +
      '</div>' +

      (oc ? '<div class="section-label">OUTCAR 解析结果</div><div class="field-grid">' +
        fieldHtml('文件', esc(oc.file || '—')) +
        fieldHtml('离子步', esc(String(oc.ionicSteps || '—'))) +
        fieldHtml('E-fermi', isNum(oc.fermi) ? oc.fermi.toFixed(4) + ' eV' : '—') +
        fieldHtml('NIONS', isNum(oc.nions) ? String(oc.nions) : '—') +
        '</div>' : '') +

      '<div class="section-label">结构信息（来自 CIF）</div>' +
      (s ? '<div class="field-grid">' +
        fieldHtml('文件', esc(s.file || '—')) +
        fieldHtml('总原子数', esc(String(s.totalAtoms || 0))) +
        fieldHtml('元素种类', esc(String((s.elements || []).length))) +
        fieldHtml('化学式', esc(s.formula || '—')) + '</div>' +
        (cell ? '<div class="field" style="margin-bottom:10px"><div class="k">晶胞参数</div><div class="v" style="font-weight:500;font-size:12px">' + esc(cell) + '</div></div>' : '') +
        (s.spaceGroup ? '<div class="field" style="margin-bottom:10px"><div class="k">空间群</div><div class="v">' + esc(s.spaceGroup) + '</div></div>' : '') +
        '<table class="el-table"><tbody>' + elRows + '</tbody></table>' +
        '<div class="section-label">三维结构</div><div class="viewer3d" id="viewer3d"></div>'
        : '<p class="muted">此条目没有结构文件。</p>') +

      (d.note ? '<div class="section-label">标注 / 备注</div><p style="font-size:13px;color:#475569">' + esc(d.note) + '</p>' : '') +

      '<div style="display:flex;gap:8px;margin-top:22px">' +
      '<button class="btn" id="copyJson">复制该条 JSON</button>' +
      (d.source === 'draft' ? '<button class="btn btn-danger" id="deleteDraft">删除本地草稿</button>' : '') +
      '</div></div>';

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.classList.add('open');

    $('#drawerClose').addEventListener('click', closeDrawer);
    const cp = $('#copyJson');
    if (cp) cp.addEventListener('click', function () { copyText(JSON.stringify(d, null, 2), '已复制该条 JSON'); });
    const del = $('#deleteDraft');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('确定删除这条本地草稿？删除后无法恢复。')) return;
      saveDrafts(loadDrafts().filter(function (x) { return x.id !== d.id; }));
      closeDrawer();
      showToast('已删除本地草稿');
      render();
    });

    if (s && s.cif) render3D($('#viewer3d'), s.cif);
  }

  function render3D(container, cifText) {
    if (!container) return;
    if (!HAS_3DMOL) { container.innerHTML = '<div class="viewer-note">3D 预览不可用（3Dmol 未加载）</div>'; return; }
    try {
      if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
      container.innerHTML = '';
      const viewer = $3Dmol.createViewer(container, { backgroundColor: 'white' });
      if (!viewer) throw new Error('viewer 创建失败');
      viewer.addModel(cifText, 'cif');
      viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.26 } });
      viewer.zoomTo();
      viewer.render();
      currentViewer = viewer;
    } catch (e) {
      console.warn('3D 渲染失败', e);
      container.innerHTML = '<div class="viewer-note">3D 渲染失败，可能是浏览器不支持 WebGL</div>';
    }
  }

  /* ============================ 上传 ============================ */
  let uploadState = { cif: null, outcar: null };

  function openUpload() {
    const modal = $('#uploadModal');
    if (!modal) return;
    uploadState = { cif: null, outcar: null };
    modal.classList.add('open');
    uploadStep1();
  }

  function closeUpload() {
    const modal = $('#uploadModal');
    if (modal) modal.classList.remove('open');
    uploadState = { cif: null, outcar: null };
    if (currentViewer) { try { currentViewer.clear(); } catch (e) { /* 忽略 */ } currentViewer = null; }
  }

  function uploadStep1() {
    const body = $('#uploadBody');
    const foot = $('#uploadFoot');
    if (!body) return;
    body.innerHTML =
      '<div class="dropzone" id="dropzone">' +
      '<div class="dz-icon">🧪</div>' +
      '<div class="dz-title">拖拽 CIF 结构文件到这里，或点击选择</div>' +
      '<div class="dz-sub">同一位置也可以放入 VASP 的 OUTCAR 文件，会自动读取总能（可选）</div>' +
      '<div class="dz-formats">CIF：.cif / .mcif　·　OUTCAR：文件名含 OUTCAR 或 .out　·　全部在浏览器本地解析</div>' +
      '<input type="file" id="fileInput" accept=".cif,.mcif,.out,.txt,OUTCAR" multiple hidden />' +
      '</div>';
    if (foot) {
      foot.innerHTML = '<span class="muted">' + esc(cget('upload.desc', '')) + '</span>' +
        '<button class="btn" id="uploadCancel">取消</button>';
    }

    const dz = $('#dropzone');
    const input = $('#fileInput');
    if (dz && input) {
      dz.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        if (input.files && input.files.length) handleFiles(input.files);
      });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
      });
      dz.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      });
    }
    const cancel = $('#uploadCancel');
    if (cancel) cancel.addEventListener('click', closeUpload);
  }

  function readText(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(fr.error || new Error('读取失败')); };
      fr.readAsText(file, 'utf-8');
    });
  }

  function isOutcarName(name) {
    return /outcar/i.test(name) || /\.out$/i.test(name);
  }
  function isCifName(name) {
    return /\.(cif|mcif)$/i.test(name);
  }

  async function handleFiles(fileList) {
    const files = Array.prototype.slice.call(fileList);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = f.name || 'file';
      try {
        if (isOutcarName(name)) {
          if (f.size > 60 * 1024 * 1024) { showToast('OUTCAR 超过 60 MB，已跳过'); continue; }
          const text = await readText(f);
          const info = window.OutcarParser ? window.OutcarParser.parse(text) : null;
          if (!info || !info.ok) { uploadError(name, (info && info.error) || 'OUTCAR 解析失败'); return; }
          uploadState.outcar = { file: name, text: text, info: info };
        } else if (isCifName(name) || f.size < 8 * 1024 * 1024) {
          if (f.size > 8 * 1024 * 1024) { showToast('CIF 超过 8 MB，已跳过'); continue; }
          const text = await readText(f);
          const info = window.CIFParser ? window.CIFParser.parse(text) : null;
          if (!info || !info.ok) { uploadError(name, (info && info.error) || 'CIF 解析失败'); return; }
          uploadState.cif = { file: name, text: text, info: info };
        }
      } catch (err) {
        uploadError(name, '文件读取失败');
        return;
      }
    }
    if (!uploadState.cif && !uploadState.outcar) { showToast('没有识别到可解析的文件'); return; }
    uploadStep2();
  }

  function uploadError(name, msg) {
    const body = $('#uploadBody');
    if (!body) return;
    body.innerHTML =
      '<div class="error-box">解析 <b>' + esc(name) + '</b> 失败：' + esc(msg) + '</div>' +
      '<div class="dropzone" id="dropzone"><div class="dz-icon">↺</div><div class="dz-title">重新选择文件</div>' +
      '<input type="file" id="fileInput" multiple hidden /></div>';
    const dz = $('#dropzone');
    const input = $('#fileInput');
    if (dz && input) {
      dz.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () { if (input.files && input.files.length) handleFiles(input.files); });
    }
  }

  function uploadStep2() {
    const body = $('#uploadBody');
    if (!body) return;
    const cif = uploadState.cif;
    const oc = uploadState.outcar;
    const cinfo = cif ? cif.info : null;
    const oinfo = oc ? oc.info : null;

    const guessMetal = cinfo && window.CIFParser ? window.CIFParser.guessMetal(cinfo.atomCounts) : '';
    const guessSupport = cinfo && window.CIFParser ? window.CIFParser.guessSupport(cinfo.atomCounts) : '';
    const defaultReaction = state.view === 'reaction' && state.reactionId
      ? (reactionById(state.reactionId) || { reaction: '' }).reaction
      : (REACTIONS[0] ? REACTIONS[0].reaction : '');

    const reactionOptions = REACTIONS.map(function (r) {
      const t = reactionText(r);
      return '<option value="' + esc(r.reaction) + '"' + (r.reaction === defaultReaction ? ' selected' : '') + '>' +
        esc(t.name || r.id) + '（' + esc(r.en || '') + '）</option>';
    }).join('');

    const cifCard = cinfo
      ? '<div class="parse-summary"><div class="parse-head"><span class="parse-title">✓ ' + esc(cif.file) + '</span>' +
        '<span class="muted">' + esc(cinfo.dataBlock || '') + '</span></div>' +
        '<div class="parse-stats"><div class="parse-stat"><b>' + cinfo.elements.length + '</b>元素种类</div>' +
        '<div class="parse-stat"><b>' + cinfo.totalAtoms + '</b>总原子数</div>' +
        '<div class="parse-stat"><b>' + esc(cinfo.formula || '—') + '</b>化学式</div></div>' +
        '<div>' + cinfo.elements.map(function (el) {
          return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(cinfo.atomCounts[el])) + '</sub></span>';
        }).join('') + '</div></div>'
      : '<div class="warn-box">未提供 CIF 结构文件，本条记录将只有能量数据。</div>';

    const outcarCard = oinfo
      ? '<div class="parse-summary"><div class="parse-head"><span class="parse-title">✓ ' + esc(oc.file) + '</span>' +
        '<span class="muted">OUTCAR</span></div>' +
        '<div class="parse-stats"><div class="parse-stat"><b>' + numText(oinfo.totalEnergy, 4) + '</b>总能 (eV)</div>' +
        '<div class="parse-stat"><b>' + esc(String(oinfo.ionicSteps || '—')) + '</b>离子步</div>' +
        '<div class="parse-stat"><b>' + (isNum(oinfo.fermi) ? oinfo.fermi.toFixed(3) : '—') + '</b>E-fermi (eV)</div></div>' +
        ((oinfo.warnings || []).map(function (w) { return '<div class="warn-box">' + esc(w) + '</div>'; }).join('')) +
        '</div>'
      : '<div class="parse-summary muted-card"><div class="parse-head"><span class="parse-title">未提供 OUTCAR</span></div>' +
        '<div class="parse-desc">可稍后手动填写总能，或重新上传 OUTCAR 自动解析。</div></div>';

    body.innerHTML =
      '<div class="upload-grid">' +
      '<div>' + cifCard + outcarCard +
      (cinfo ? '<div class="viewer3d" id="uploadViewer" style="height:280px"></div>' : '') +
      '</div>' +
      '<div>' +
      '<div class="form-row"><label>化学式 / 催化剂名称 *</label>' +
      '<input id="fFormula" value="' + esc(cinfo ? (cinfo.formula || '') : '') + '" placeholder="如 Ni/Al2O3" /></div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>活性金属</label><input id="fMetal" value="' + esc(guessMetal) + '" /></div>' +
      '<div class="form-row"><label>载体</label><input id="fSupport" value="' + esc(guessSupport) + '" /></div>' +
      '</div>' +
      '<div class="form-row"><label>反应体系</label><select id="fReaction">' + reactionOptions + '</select></div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>' + esc(descriptor('dftEnergy').label) + ' (eV)</label>' +
      '<input type="number" step="any" id="fEnergy" value="' + (oinfo && isNum(oinfo.totalEnergy) ? oinfo.totalEnergy : '') + '" placeholder="来自 OUTCAR" /></div>' +
      '<div class="form-row"><label>' + esc(descriptor('barrier').label) + ' (eV)</label><input type="number" step="any" id="fBarrier" placeholder="可选" /></div>' +
      '</div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>' + esc(descriptor('eads').label) + ' (eV)</label><input type="number" step="any" id="fEads" placeholder="可选" /></div>' +
      '<div class="form-row"><label>' + esc(descriptor('reactionEnergy').label) + ' (eV)</label><input type="number" step="any" id="fRxn" placeholder="可选" /></div>' +
      '</div>' +
      '<div class="form-row"><label>数据来源</label><input id="fRef" placeholder="计算任务编号 / 文献" /></div>' +
      '<div class="form-row"><label>标注 / 备注</label><textarea id="fNote" rows="2" placeholder="如：Pd(111) 3×3 slab，4 层"></textarea></div>' +
      '</div></div>';

    const footEl = $('#uploadFoot');
    if (footEl) {
      footEl.innerHTML = '<button class="btn" id="uploadBack">重新选择</button>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn" id="uploadAgain">保存并继续</button>' +
        '<button class="btn btn-primary" id="uploadSave">保存到本地草稿</button></div>';
    }

    if (cinfo) render3D($('#uploadViewer'), cif.text);

    const back = $('#uploadBack');
    if (back) back.addEventListener('click', function () { uploadState = { cif: null, outcar: null }; uploadStep1(); });
    const again = $('#uploadAgain');
    if (again) again.addEventListener('click', function () { if (saveUpload()) { uploadState = { cif: null, outcar: null }; uploadStep1(); } });
    const save = $('#uploadSave');
    if (save) save.addEventListener('click', function () { if (saveUpload()) closeUpload(); });
  }

  function readNum(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = String(el.value || '').trim();
    if (!raw) return null;
    const v = parseFloat(raw);
    return isFinite(v) ? v : null;
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function nextId() {
    let maxNum = 0;
    loadDrafts().concat(curated()).forEach(function (d) {
      const m = String(d.id || '').match(/(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    return 'CAT-' + String(maxNum + 1).padStart(3, '0');
  }

  function saveUpload() {
    const cif = uploadState.cif;
    const oc = uploadState.outcar;
    if (!cif && !oc) { showToast('请先选择文件'); return false; }

    const formulaEl = document.getElementById('fFormula');
    const formula = formulaEl ? String(formulaEl.value || '').trim() : '';
    if (!formula) {
      showToast('请填写化学式');
      if (formulaEl) formulaEl.focus();
      return false;
    }

    const cinfo = cif ? cif.info : null;
    const oinfo = oc ? oc.info : null;
    const energyFromFile = oinfo && isNum(oinfo.totalEnergy) ? oinfo.totalEnergy : null;
    const typedEnergy = readNum('fEnergy');

    const record = {
      id: nextId(),
      formula: formula,
      metal: valueOf('fMetal'),
      support: valueOf('fSupport'),
      reaction: valueOf('fReaction'),
      ref: valueOf('fRef'),
      note: valueOf('fNote'),
      dftEnergy: isNum(typedEnergy) ? typedEnergy : energyFromFile,
      barrier: readNum('fBarrier'),
      eads: readNum('fEads'),
      reactionEnergy: readNum('fRxn'),
      evac: null,
      structure: cinfo ? {
        file: cif.file,
        formula: cinfo.formula || '',
        elements: cinfo.elements.slice(),
        atomCounts: cinfo.atomCounts,
        totalAtoms: cinfo.totalAtoms,
        cell: cinfo.cell,
        spaceGroup: cinfo.spaceGroup || '',
        z: isNum(cinfo.z) ? cinfo.z : null,
        cif: cif.text
      } : null,
      outcar: oinfo ? {
        file: oc.file,
        totalEnergy: oinfo.totalEnergy,
        energySigma0: oinfo.energySigma0,
        fermi: oinfo.fermi,
        nions: oinfo.nions,
        volume: oinfo.volume,
        ionicSteps: oinfo.ionicSteps
      } : null,
      source: 'draft',
      addedAt: new Date().toISOString()
    };

    const drafts = loadDrafts();
    drafts.push(record);
    if (!saveDrafts(drafts)) return false;

    showToast('已保存：' + record.formula +
      (record.dftEnergy !== null ? ' · 总能 ' + record.dftEnergy.toFixed(4) + ' eV' : '') +
      (record.structure ? ' · ' + record.structure.elements.length + ' 种元素' : ''));

    render();
    return true;
  }

  /* ============================ 导出 ============================ */
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function stripForExport(d) {
    const copy = {};
    Object.keys(d).forEach(function (k) {
      if (k === 'source') return;
      if (k === 'structure' && d.structure) {
        const s = {};
        Object.keys(d.structure).forEach(function (sk) { if (sk !== 'cif') s[sk] = d.structure[sk]; });
        copy.structure = s;
        return;
      }
      copy[k] = d[k];
    });
    return copy;
  }

  function exportDataJs() {
    const drafts = loadDrafts();
    if (!drafts.length) { showToast('本地还没有草稿可导出'); return; }
    const body = drafts.map(function (d) { return '  ' + JSON.stringify(stripForExport(d)); }).join(',\n');
    const content = '/* 由页面「导出 data.js」生成，' + new Date().toISOString().slice(0, 10) + ' */\n' +
      'window.CATALYST_DATA = [\n' + body + '\n];\n';
    download('data.js', content, 'text/javascript;charset=utf-8');
    showToast('已导出 ' + drafts.length + ' 条草稿为 data.js');
  }

  function exportJson() {
    const rows = allRecords();
    download('catalyst-db.json', JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
    showToast('已导出 JSON（' + rows.length + ' 条）');
  }

  function exportCsv() {
    const rows = allRecords();
    if (!rows.length) { showToast('暂无数据可导出'); return; }
    const head = ['id', 'formula', 'metal', 'support', 'reaction', 'elements', 'totalAtoms',
      'barrier_eV', 'eads_eV', 'reactionEnergy_eV', 'dftEnergy_eV', 'outcar', 'ref', 'note'];
    function q(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }
    const lines = [head.map(q).join(',')].concat(rows.map(function (d) {
      const s = structureOf(d);
      return [d.id, d.formula, d.metal, d.support, d.reaction,
        s ? (s.elements || []).join(' ') : '', s ? s.totalAtoms : '',
        d.barrier, d.eads, d.reactionEnergy, d.dftEnergy,
        d.outcar ? d.outcar.file : '', d.ref, d.note].map(q).join(',');
    }));
    download('catalyst-db.csv', '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
    showToast('已导出 CSV（' + rows.length + ' 条）');
  }

  function copyText(text, msg) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast(msg); }, function () { fallback(); showToast(msg); });
    } else { fallback(); showToast(msg); }
  }

  function toggleExportMenu(anchor) {
    let menu = $('#exportMenu');
    if (menu) { menu.remove(); return; }
    menu = document.createElement('div');
    menu.id = 'exportMenu';
    menu.className = 'popover open';
    menu.innerHTML =
      '<button data-act="js">导出 data.js（本地草稿）</button>' +
      '<button data-act="json">导出全部 JSON</button>' +
      '<button data-act="csv">导出 CSV</button>';
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = Math.max(10, rect.right - 210) + 'px';
    menu.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      menu.remove();
      const act = btn.getAttribute('data-act');
      if (act === 'js') exportDataJs();
      else if (act === 'json') exportJson();
      else if (act === 'csv') exportCsv();
    });
    setTimeout(function () {
      document.addEventListener('click', function hide(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', hide); }
      });
    }, 0);
  }

  /* ============================ 提示 / 渲染入口 ============================ */
  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function render() {
    applyRoute();
    C = effectiveContent();

    const brand = $('#brandName');
    if (brand) brand.textContent = cget('site.name', 'ZJU-ICED');
    const sub = $('#brandSub');
    if (sub) sub.textContent = cget('site.subtitle', 'Catalyst DFT Database');
    const foot = $('#footerNote');
    if (foot) foot.textContent = cget('site.footer', '');

    renderSidebar();

    const crumb = $('#crumb');
    if (state.view === 'reaction') {
      const r = reactionById(state.reactionId);
      crumb.innerHTML = r
        ? esc(cget('dashboard.title', '数据总览')) + ' / <b>' + esc(reactionText(r).name || r.id) + '</b>'
        : esc(cget('dashboard.title', '数据总览'));
    } else if (state.view === 'admin') {
      crumb.innerHTML = esc(cget('dashboard.title', '数据总览')) + ' / <b>' + esc(cget('admin.title', '内容管理')) + '</b>';
    } else {
      crumb.innerHTML = '<b>' + esc(cget('dashboard.title', '数据总览')) + '</b>';
    }

    disposeCharts();

    if (state.view === 'admin') {
      renderAdmin();
    } else if (state.view === 'reaction') {
      const r = reactionById(state.reactionId);
      if (r) renderReactionView(r);
      else renderDashboard();
    } else {
      renderDashboard();
    }
  }

  /* ============================ 启动 ============================ */
  function boot() {
    const uploadBtn = $('#uploadBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', openUpload);

    const modal = $('#uploadModal');
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeUpload(); });
    const modalClose = $('#modalClose');
    if (modalClose) modalClose.addEventListener('click', closeUpload);

    const overlay = $('#drawerOverlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);

    const exportBtn = $('#exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleExportMenu(exportBtn); });

    const menuBtn = $('#menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        const sb = $('#sidebar');
        if (sb) sb.classList.toggle('open');
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeUpload();
        closeDrawer();
        const m = $('#exportMenu');
        if (m) m.remove();
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', function () {
      if (!HAS_ECHARTS) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        Object.keys(chartRefs).forEach(function (k) {
          if (chartRefs[k]) { try { chartRefs[k].resize(); } catch (e) { /* 忽略 */ } }
        });
      }, 120);
    });

    window.addEventListener('hashchange', render);

    if (!location.hash) history.replaceState(null, '', '#/');
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
