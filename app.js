/* =========================================================================
   app.js — ZJU-ICED 催化剂数据库 前端应用
   -------------------------------------------------------------------------
   静态站点：数据来自 data.js + 浏览器本地草稿（localStorage），
   上传的 CIF 在浏览器内解析，不上传任何文件到服务器。
   ========================================================================= */
(function () {
  'use strict';

  /* ===================== 基础工具 ===================== */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function numText(v, digits) {
    if (!isNum(v)) return '—';
    return v.toFixed(digits === undefined ? 2 : digits);
  }

  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  function subscript(n) {
    return String(n).split('').map(function (c) { return SUB[c] || c; }).join('');
  }

  function fmtCount(n) {
    if (!isNum(n)) return '';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  /* ===================== 常量 ===================== */
  const DRAFT_KEY = 'iced-db:drafts:v1';
  const PAGE_SIZE = 10;
  const PALETTE = ['#2b7ac4', '#e8710a', '#31a354', '#7b5ea7', '#d64550', '#00a3b5', '#b5921a', '#8a5a44'];
  const HAS_ECHARTS = typeof echarts !== 'undefined';
  const HAS_3DMOL = typeof $3Dmol !== 'undefined';
  const REACTIONS = Array.isArray(window.REACTIONS) ? window.REACTIONS : [];
  const NUMERIC_KEYS = { barrier: 1, selectivity: 1, temp: 1, dftEnergy: 1, totalAtoms: 1 };

  /* ===================== 数据层 ===================== */
  function loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('读取本地草稿失败', e);
      return [];
    }
  }

  function saveDrafts(list) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      showToast('本地存储空间不足，草稿未能保存');
      console.warn('写入本地草稿失败', e);
      return false;
    }
  }

  function curated() {
    return Array.isArray(window.CATALYST_DATA) ? window.CATALYST_DATA : [];
  }

  function allRecords() {
    return loadDrafts().concat(curated());
  }

  function reactionById(id) {
    for (let i = 0; i < REACTIONS.length; i++) if (REACTIONS[i].id === id) return REACTIONS[i];
    return null;
  }

  function reactionByReaction(name) {
    for (let i = 0; i < REACTIONS.length; i++) if (REACTIONS[i].reaction === name) return REACTIONS[i];
    return null;
  }

  /* ===================== 状态 ===================== */
  const state = {
    view: 'dashboard',
    reactionId: null,
    search: '',
    metal: '',
    sortKey: 'id',
    sortDir: 'asc',
    page: 1
  };

  const chartRefs = { scatter: null, bar: null, pie: null };
  let currentViewer = null;

  /* ===================== 记录辅助 ===================== */
  function structureOf(d) { return d && d.structure ? d.structure : null; }
  function elementsOf(d) {
    const s = structureOf(d);
    return s && Array.isArray(s.elements) ? s.elements : [];
  }
  function totalAtomsOf(d) {
    const s = structureOf(d);
    return s && isNum(s.totalAtoms) ? s.totalAtoms : null;
  }

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

  /* ===================== 排序 / 筛选 ===================== */
  function sortValue(d, key) {
    if (key === 'totalAtoms') {
      const t = totalAtomsOf(d);
      return isNum(t) ? t : -Infinity;
    }
    if (NUMERIC_KEYS[key]) {
      const v = d[key];
      return isNum(v) ? v : -Infinity;
    }
    return String(d[key] === undefined || d[key] === null ? '' : d[key]);
  }

  function baseRows() {
    const all = allRecords();
    if (state.view === 'reaction' && state.reactionId) {
      const r = reactionById(state.reactionId);
      if (r) return all.filter(function (d) { return d.reaction === r.reaction; });
      return [];
    }
    return all;
  }

  function filteredRows() {
    const q = state.search.trim().toLowerCase();
    const rows = baseRows().filter(function (d) {
      if (state.metal && d.metal !== state.metal) return false;
      if (q) {
        const st = structureOf(d);
        const hay = [
          d.id, d.formula, d.metal, d.support, d.reaction, d.ref, d.note,
          st ? st.file : '', st ? st.formula : '', st ? (st.elements || []).join(' ') : ''
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

  /* ===================== 路由 ===================== */
  function parseHash() {
    const raw = (location.hash || '').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] === 'db' && parts[1]) {
      return { view: 'reaction', reactionId: parts[1] };
    }
    return { view: 'dashboard', reactionId: null };
  }

  function navigate(hash) {
    if (location.hash === hash) { render(); return; }
    location.hash = hash;
  }

  function applyRoute() {
    const route = parseHash();
    const changed = route.view !== state.view || route.reactionId !== state.reactionId;
    if (changed) {
      /* 切换视图时清空筛选，避免上一个子库的金属/搜索条件带到新视图 */
      state.page = 1;
      state.search = '';
      state.metal = '';
    }
    state.view = route.view;
    state.reactionId = route.reactionId;
  }

  /* ===================== 侧边栏 ===================== */
  function countForReaction(name) {
    return allRecords().filter(function (d) { return d.reaction === name; }).length;
  }

  function renderSidebar() {
    const nav = $('#sidebarNav');
    if (!nav) return;
    const total = allRecords().length;
    const parts = [];

    parts.push('<div class="nav-section">数据库</div>');
    parts.push(
      '<a class="nav-item' + (state.view === 'dashboard' ? ' active' : '') + '" href="#/">' +
      '<span class="ico">◧</span><span class="lbl">全部数据</span>' +
      '<span class="nav-count">' + total + '</span></a>'
    );

    if (REACTIONS.length) {
      parts.push('<div class="nav-section">反应子库</div>');
      REACTIONS.forEach(function (r) {
        const active = state.view === 'reaction' && state.reactionId === r.id;
        parts.push(
          '<a class="nav-item' + (active ? ' active' : '') + '" href="#/db/' + esc(r.id) + '">' +
          '<span class="ico">' + esc(r.icon || '◆') + '</span>' +
          '<span class="lbl">' + esc(r.name) + '</span>' +
          '<span class="nav-count">' + countForReaction(r.reaction) + '</span></a>'
        );
      });
    }

    nav.innerHTML = parts.join('');
  }

  /* ===================== 图表 ===================== */
  function disposeCharts() {
    ['scatter', 'bar', 'pie'].forEach(function (k) {
      if (chartRefs[k]) {
        try { chartRefs[k].dispose(); } catch (e) { /* 忽略 */ }
        chartRefs[k] = null;
      }
    });
  }

  function initCharts() {
    if (!HAS_ECHARTS) return;
    const s = $('#scatterChart');
    const b = $('#barChart');
    const p = $('#pieChart');
    if (s) chartRefs.scatter = echarts.init(s);
    if (b) chartRefs.bar = echarts.init(b);
    if (p) chartRefs.pie = echarts.init(p);
  }

  const AXIS_LABEL = { fontSize: 11, color: '#64748b' };

  function updateCharts(rows) {
    if (!HAS_ECHARTS) {
      ['scatterEmpty', 'barEmpty', 'pieEmpty'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('show');
      });
      return;
    }

    const isReaction = state.view === 'reaction';
    const groupKey = 'metal';
    const groups = {};
    rows.forEach(function (d) {
      const g = d[groupKey] || '未标注';
      if (!groups[g]) groups[g] = [];
      groups[g].push(d);
    });
    const names = Object.keys(groups).sort();

    const xKey = isReaction ? 'temp' : 'barrier';
    const xName = isReaction ? '温度 (°C)' : '活化能 (eV)';

    if (chartRefs.scatter) {
      chartRefs.scatter.setOption({
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
              '反应：' + esc(d.reaction || '—') + '<br/>' +
              '活化能：<b>' + numText(d.barrier) + ' eV</b><br/>' +
              '选择性：<b>' + numText(d.selectivity, 1) + '%</b><br/>' +
              '温度：' + (isNum(d.temp) ? d.temp + ' °C' : '—');
          }
        },
        legend: { type: 'scroll', bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11, color: '#64748b' } },
        grid: { left: 62, right: 24, top: 18, bottom: 52 },
        xAxis: {
          name: xName, nameLocation: 'middle', nameGap: 28,
          nameTextStyle: { fontSize: 11.5, color: '#64748b' },
          scale: true,
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisTick: { show: false },
          axisLabel: AXIS_LABEL,
          splitLine: { lineStyle: { color: '#eef2f7' } }
        },
        yAxis: {
          name: '选择性 (%)', nameLocation: 'middle', nameGap: 44, nameRotate: 90,
          nameTextStyle: { fontSize: 11.5, color: '#64748b' },
          scale: true,
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisTick: { show: false },
          axisLabel: AXIS_LABEL,
          splitLine: { lineStyle: { color: '#eef2f7' } }
        },
        series: names.map(function (n) {
          return {
            name: n,
            type: 'scatter',
            symbolSize: 11,
            itemStyle: { opacity: .85, borderColor: '#fff', borderWidth: 1 },
            emphasis: { scale: 1.5 },
            data: groups[n].filter(function (d) { return isNum(d[xKey]) && isNum(d.selectivity); })
              .map(function (d) { return { value: [d[xKey], d.selectivity], raw: d }; })
          };
        })
      }, true);
    }

    if (chartRefs.bar) {
      const counts = names.map(function (n) { return { name: n, value: groups[n].length }; })
        .sort(function (a, b) { return b.value - a.value; });
      chartRefs.bar.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (p) { return p[0].name + '：' + p[0].value + ' 条'; } },
        grid: { left: 42, right: 18, top: 12, bottom: 26 },
        xAxis: { type: 'category', data: counts.map(function (c) { return c.name; }), axisTick: { show: false }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: AXIS_LABEL },
        yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: '#eef2f7' } } },
        series: [{ type: 'bar', data: counts.map(function (c) { return c.value; }), barMaxWidth: 30, itemStyle: { borderRadius: [4, 4, 0, 0], color: '#2b7ac4' } }]
      }, true);
    }

    if (chartRefs.pie) {
      const dim = isReaction ? 'support' : 'reaction';
      const dist = {};
      rows.forEach(function (d) {
        const k = d[dim] || '未标注';
        dist[k] = (dist[k] || 0) + 1;
      });
      const pieData = Object.keys(dist).map(function (k) { return { name: k, value: dist[k] }; });
      chartRefs.pie.setOption({
        color: PALETTE,
        tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 条 ({d}%)' },
        legend: { type: 'scroll', bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10.5, color: '#64748b' } },
        series: [{
          type: 'pie', radius: ['38%', '60%'], center: ['50%', '40%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false }, labelLine: { show: false },
          data: pieData
        }]
      }, true);
    }

    ['scatterEmpty', 'barEmpty', 'pieEmpty'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('show', rows.length === 0);
    });
  }

  /* ===================== KPI ===================== */
  function avgOf(rows, getter) {
    let sum = 0, n = 0;
    rows.forEach(function (d) {
      const v = getter(d);
      if (isNum(v)) { sum += v; n++; }
    });
    return n ? sum / n : null;
  }

  function kpiHtml(items) {
    return items.map(function (it) {
      return '<div class="kpi" style="--kpi-color:' + (it.color || 'var(--primary)') + '">' +
        '<div class="kpi-value">' + it.value + '</div>' +
        '<div class="kpi-label">' + esc(it.label) + '</div>' +
        (it.sub ? '<div class="kpi-sub">' + esc(it.sub) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderKpis(rows) {
    const host = $('#dynKpi');
    if (!host) return;
    const metals = {}, supports = {}, structs = { n: 0 };
    rows.forEach(function (d) {
      if (d.metal) metals[d.metal] = 1;
      if (d.support) supports[d.support] = 1;
      if (structureOf(d)) structs.n++;
    });

    const items = [
      { label: '催化剂条目', value: rows.length },
      { label: '金属种类', value: Object.keys(metals).length },
      { label: '载体种类', value: Object.keys(supports).length },
      { label: '平均选择性', value: numText(avgOf(rows, function (d) { return d.selectivity; }), 1).replace('—', '—'), sub: '仅统计已填数值' },
      { label: '已解析结构', value: structs.n, color: '#31a354' }
    ];

    if (state.view === 'reaction' && state.reactionId) {
      const r = reactionById(state.reactionId);
      const m0 = r && r.metrics && r.metrics[0];
      if (m0) {
        const avg = avgOf(rows, function (d) { return d.props ? d.props[m0.key] : null; });
        items[3] = {
          label: '平均 ' + m0.label,
          value: isNum(avg) ? (m0.key === 'co2Sel' || m0.key === 'c2h4Sel' ? avg.toFixed(1) + '%' : Math.round(avg) + ' °C') : '—',
          sub: '基于 ' + rows.filter(function (d) { return d.props && isNum(d.props[m0.key]); }).length + ' 条有效数据'
        };
      }
    }

    host.innerHTML = kpiHtml(items);
  }

  /* ===================== 表格 ===================== */
  function columnsForView() {
    const cols = [
      { key: 'id', label: 'ID' },
      { key: 'formula', label: '化学式', cls: 'formula' },
      { key: 'metal', label: '金属', render: function (d) { return d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '<span class="muted">—</span>'; } },
      { key: 'support', label: '载体' },
      { key: 'reaction', label: '反应类型' },
      { key: 'structure', label: '元素组成', sortable: false, render: compositionHtml },
      { key: 'totalAtoms', label: '原子数', num: true, render: function (d) { return numText(totalAtomsOf(d), 0); } },
      { key: 'barrier', label: '活化能 (eV)', num: true, render: function (d) { return numText(d.barrier); } },
      { key: 'selectivity', label: '选择性 (%)', num: true, render: function (d) { return numText(d.selectivity, 1); } },
      { key: 'temp', label: '温度 (°C)', num: true, render: function (d) { return isNum(d.temp) ? String(d.temp) : '—'; } }
    ];

    if (state.view === 'reaction' && state.reactionId) {
      const r = reactionById(state.reactionId);
      if (r && r.metrics) {
        r.metrics.forEach(function (m) {
          cols.push({
            key: 'prop:' + m.key,
            label: m.label + ' (' + m.unit + ')',
            num: true,
            sortable: true,
            render: function (d) {
              const v = d.props ? d.props[m.key] : null;
              return isNum(v) ? numText(v, m.unit === '%' ? 1 : 0) : '—';
            }
          });
        });
      }
    }

    cols.push({ key: 'ref', label: '来源', render: function (d) { return d.ref ? esc(d.ref) : '<span class="muted">—</span>'; } });
    return cols;
  }

  function sortKeyOf(key) {
    return key.indexOf('prop:') === 0 ? key : key;
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
      return '<th class="' + (sortable ? 'sortable' : '') + '" data-key="' + esc(c.key) + '">' +
        esc(c.label) + arrow + '</th>';
    }).join('');

    let body;
    if (!pageRows.length) {
      const msg = allRecords().length === 0
        ? '<b>数据库还是空的</b>上传第一个 CIF 结构文件，即可自动识别元素与原子数并生成条目。'
        : '<b>没有匹配的数据</b>试试调整搜索关键词或筛选条件。';
      body = '<tr><td class="empty" colspan="' + cols.length + '">' + msg + '</td></tr>';
    } else {
      body = pageRows.map(function (d, idx) {
        const cells = cols.map(function (c) {
          let val;
          if (c.render) val = c.render(d);
          else val = esc(d[c.key] === undefined || d[c.key] === null ? '' : d[c.key]);
          if (c.key === 'formula') val = esc(d.formula || '—') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '');
          return '<td class="' + (c.num ? 'num' : '') + ' ' + (c.cls || '') + '">' + val + '</td>';
        }).join('');
        return '<tr data-row="' + (start + idx) + '">' + cells + '</tr>';
      }).join('');
    }

    host.innerHTML =
      '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';

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
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        refresh();
      });
    });

    $$('#tableHost tbody tr[data-row]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        const idx = parseInt(tr.getAttribute('data-row'), 10);
        openDrawer(rows[idx]);
      });
    });
  }

  /* ===================== 视图 ===================== */
  function filtersHtml() {
    return '<div class="filters">' +
      '<input id="searchInput" type="search" placeholder="搜索化学式、元素、金属、载体、来源或文件名…" value="' + esc(state.search) + '" />' +
      '<select id="metalFilter"><option value="">全部金属</option>' + metalOptions() + '</select>' +
      '<button class="btn" id="resetBtn">重置</button>' +
      '</div>';
  }

  function metalOptions() {
    const set = {};
    baseRows().forEach(function (d) { if (d.metal) set[d.metal] = 1; });
    return Object.keys(set).sort().map(function (m) {
      return '<option value="' + esc(m) + '"' + (state.metal === m ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  }

  function chartsHtml() {
    const isReaction = state.view === 'reaction';
    return '<div class="charts">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' +
      (isReaction ? '温度 vs. 选择性' : '活化能 vs. 选择性') +
      '</div></div><div class="panel-body"><div class="chart-box">' +
      '<div id="scatterChart" class="chart chart-lg"></div>' +
      '<div class="chart-empty" id="scatterEmpty"><span>📊</span>暂无数据</div>' +
      '</div></div></div>' +
      '<div class="charts-right">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">各金属条目数</div></div>' +
      '<div class="panel-body"><div class="chart-box"><div id="barChart" class="chart chart-sm"></div>' +
      '<div class="chart-empty" id="barEmpty"><span>📊</span>暂无数据</div></div></div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">' + (isReaction ? '载体分布' : '反应类型分布') + '</div></div>' +
      '<div class="panel-body"><div class="chart-box"><div id="pieChart" class="chart chart-sm"></div>' +
      '<div class="chart-empty" id="pieEmpty"><span>📊</span>暂无数据</div></div></div></div>' +
      '</div></div>';
  }

  function tableHtml() {
    return '<div class="panel">' +
      '<div class="panel-head"><div class="panel-title">催化剂数据集</div>' +
      '<span class="muted" id="resultInfo">共 0 条记录</span></div>' +
      filtersHtml() +
      '<div class="table-wrap" id="tableHost"></div>' +
      '<div class="pagination"><span class="muted" id="pageInfo"></span>' +
      '<div class="btns"><button class="page-btn" id="prevBtn">上一页</button>' +
      '<button class="page-btn" id="nextBtn">下一页</button></div></div>' +
      '</div>';
  }

  function renderDashboard() {
    const view = $('#view');
    view.innerHTML =
      '<div class="page-head">' +
      '<h1 class="page-title">全部数据</h1>' +
      '<p class="page-desc">课题组全部催化剂条目。上传 CIF 结构文件后会自动识别元素种类与原子个数，并作为结构标注写入条目。</p>' +
      '</div>' +
      '<div class="kpi-grid" id="dynKpi"></div>' +
      chartsHtml() +
      tableHtml();

    initCharts();
    bindFilterEvents();
    refresh();
  }

  function renderReaction(r) {
    const view = $('#view');
    const conds = (r.conditions || []).map(function (c) {
      return '<div class="cond-row"><span class="k">' + esc(c.label) + '</span><span class="v">' + esc(c.value) + '</span></div>';
    }).join('');
    const metrics = (r.metrics || []).map(function (m) {
      return '<div class="metric-item"><span class="mk">' + esc(m.label) + '</span>' +
        '<span class="mu">' + esc(m.unit) + '</span>' +
        '<div class="md">' + esc(m.desc) + '</div></div>';
    }).join('');
    const notes = (r.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    view.innerHTML =
      '<div class="page-head">' +
      '<h1 class="page-title">' + esc(r.icon || '◆') + ' ' + esc(r.name) +
      ' <span class="muted" style="font-size:13px;font-weight:400">' + esc(r.en) + '</span></h1>' +
      '<p class="page-desc">' + esc(r.summary) + '</p>' +
      '</div>' +
      '<div class="meta-grid">' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">评价条件与指标定义</div></div>' +
      '<div class="panel-body"><div class="cond-list">' + conds + '</div>' +
      '<div class="section-label" style="margin-top:14px">指标</div>' + metrics + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div class="panel-title">体系要点</div></div>' +
      '<div class="panel-body"><ul class="note-list">' + notes + '</ul></div></div>' +
      '</div>' +
      '<div class="kpi-grid" id="dynKpi"></div>' +
      chartsHtml() +
      tableHtml();

    initCharts();
    bindFilterEvents();
    refresh();
  }

  function bindFilterEvents() {
    const search = $('#searchInput');
    if (search) {
      search.addEventListener('input', function (e) {
        state.search = e.target.value;
        state.page = 1;
        refresh();
      });
    }
    const metal = $('#metalFilter');
    if (metal) {
      metal.addEventListener('change', function (e) {
        state.metal = e.target.value;
        state.page = 1;
        refresh();
      });
    }
    const reset = $('#resetBtn');
    if (reset) {
      reset.addEventListener('click', function () {
        state.search = '';
        state.metal = '';
        state.page = 1;
        const s = $('#searchInput'); if (s) s.value = '';
        const m = $('#metalFilter'); if (m) m.value = '';
        refresh();
      });
    }
    const prev = $('#prevBtn');
    if (prev) prev.addEventListener('click', function () { if (state.page > 1) { state.page--; refresh(); } });
    const next = $('#nextBtn');
    if (next) next.addEventListener('click', function () {
      const totalPages = Math.max(1, Math.ceil(filteredRows().length / PAGE_SIZE));
      if (state.page < totalPages) { state.page++; refresh(); }
    });
  }

  function refresh() {
    const rows = filteredRows();
    renderKpis(rows);
    updateCharts(rows);
    renderTable(rows);
  }

  /* ===================== 渲染入口 ===================== */
  function render() {
    applyRoute();
    renderSidebar();

    const crumb = $('#crumb');
    if (state.view === 'reaction') {
      const r = reactionById(state.reactionId);
      crumb.innerHTML = r ? '催化剂数据库 / <b>' + esc(r.name) + '</b>' : '催化剂数据库';
    } else {
      crumb.innerHTML = '催化剂数据库 / <b>全部数据</b>';
    }

    disposeCharts();
    if (state.view === 'reaction') {
      const r = reactionById(state.reactionId);
      if (r) renderReaction(r); else renderDashboard();
    } else {
      renderDashboard();
    }
  }

  /* ===================== 抽屉：详情 ===================== */
  function closeDrawer() {
    const drawer = $('#drawer');
    const overlay = $('#drawerOverlay');
    if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
    if (overlay) overlay.classList.remove('open');
    if (currentViewer) {
      try { currentViewer.clear(); } catch (e) { /* 忽略 */ }
      currentViewer = null;
    }
  }

  function fieldHtml(k, v) {
    return '<div class="field"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>';
  }

  function openDrawer(d) {
    if (!d) return;
    const drawer = $('#drawer');
    const overlay = $('#drawerOverlay');
    if (!drawer) return;

    const s = structureOf(d);
    const r = reactionByReaction(d.reaction);

    let elRows = '';
    if (s && s.atomCounts) {
      elRows = Object.keys(s.atomCounts).sort(function (a, b) { return s.atomCounts[b] - s.atomCounts[a]; })
        .map(function (el) {
          return '<tr><td>' + esc(el) + '</td><td>' + esc(fmtCount(s.atomCounts[el])) + '</td></tr>';
        }).join('');
    }

    const cell = s && s.cell
      ? ['a=' + (isNum(s.cell.a) ? s.cell.a : '–'),
         'b=' + (isNum(s.cell.b) ? s.cell.b : '–'),
         'c=' + (isNum(s.cell.c) ? s.cell.c : '–'),
         'α=' + (isNum(s.cell.alpha) ? s.cell.alpha + '°' : '–'),
         'β=' + (isNum(s.cell.beta) ? s.cell.beta + '°' : '–'),
         'γ=' + (isNum(s.cell.gamma) ? s.cell.gamma + '°' : '–')].join('  ')
      : '';

    const propRows = (r && r.metrics ? r.metrics : []).filter(function (m) {
      return d.props && isNum(d.props[m.key]);
    }).map(function (m) {
      return fieldHtml(m.label + ' (' + m.unit + ')', esc(numText(d.props[m.key], m.unit === '%' ? 1 : 0)));
    }).join('');

    drawer.innerHTML =
      '<div class="drawer-head">' +
      '<div><h3>' + esc(d.formula || '未命名') + (d.source === 'draft' ? '<span class="tag-draft">本地</span>' : '') + '</h3>' +
      '<div class="sub">' + esc(d.id || '') + ' · ' + esc(d.reaction || '未分类') + '</div></div>' +
      '<button class="close-btn" id="drawerClose">×</button>' +
      '</div>' +
      '<div class="drawer-body">' +
      '<div class="field-grid">' +
      fieldHtml('金属', d.metal ? '<span class="badge">' + esc(d.metal) + '</span>' : '—') +
      fieldHtml('载体', esc(d.support || '—')) +
      fieldHtml('活化能', numText(d.barrier) + ' eV') +
      fieldHtml('选择性', numText(d.selectivity, 1) + ' %') +
      fieldHtml('反应温度', isNum(d.temp) ? d.temp + ' °C' : '—') +
      fieldHtml('DFT 能量', isNum(d.dftEnergy) ? numText(d.dftEnergy) + ' eV' : '—') +
      fieldHtml('数据来源', esc(d.ref || '—')) +
      fieldHtml('录入时间', d.addedAt ? esc(String(d.addedAt).slice(0, 10)) : '—') +
      '</div>' +

      (propRows ? '<div class="section-label">反应指标</div><div class="field-grid">' + propRows + '</div>' : '') +

      '<div class="section-label">结构信息（来自 CIF）</div>' +
      (s
        ? '<div class="field-grid">' +
          fieldHtml('文件', esc(s.file || '—')) +
          fieldHtml('总原子数', esc(String(s.totalAtoms || 0))) +
          fieldHtml('元素种类', esc(String((s.elements || []).length))) +
          fieldHtml('化学式', esc(s.formula || '—')) +
          '</div>' +
          (cell ? '<div class="field" style="margin-bottom:10px"><div class="k">晶胞参数</div><div class="v" style="font-weight:500;font-size:12px">' + esc(cell) + '</div></div>' : '') +
          (s.spaceGroup ? '<div class="field" style="margin-bottom:10px"><div class="k">空间群</div><div class="v">' + esc(s.spaceGroup) + '</div></div>' : '') +
          '<table class="el-table"><tbody>' + elRows + '</tbody></table>' +
          '<div class="section-label">三维结构</div>' +
          '<div class="viewer3d" id="viewer3d"></div>'
        : '<p class="muted">此条目没有上传结构文件。</p>') +

      (d.note ? '<div class="section-label">标注 / 备注</div><p style="font-size:13px;color:#475569">' + esc(d.note) + '</p>' : '') +

      '<div style="display:flex;gap:8px;margin-top:22px">' +
      '<button class="btn" id="copyJson">复制该条 JSON</button>' +
      (d.source === 'draft' ? '<button class="btn btn-danger" id="deleteDraft">删除本地草稿</button>' : '') +
      '</div>' +
      '</div>';

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.classList.add('open');

    $('#drawerClose').addEventListener('click', closeDrawer);
    const cp = $('#copyJson');
    if (cp) cp.addEventListener('click', function () { copyText(JSON.stringify(d, null, 2), '已复制该条 JSON'); });
    const del = $('#deleteDraft');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('确定删除这条本地草稿？删除后无法恢复。')) return;
      const list = loadDrafts().filter(function (x) { return x.id !== d.id; });
      saveDrafts(list);
      closeDrawer();
      showToast('已删除本地草稿');
      render();
    });

    if (s && s.cif) render3D($('#viewer3d'), s.cif);
  }

  /* ===================== 3D 结构 ===================== */
  function render3D(container, cifText) {
    if (!container) return;
    if (!HAS_3DMOL) {
      container.innerHTML = '<div class="viewer-note">3D 预览不可用（3Dmol 未加载）</div>';
      return;
    }
    try {
      if (currentViewer) {
        try { currentViewer.clear(); } catch (e) { /* 忽略 */ }
        currentViewer = null;
      }
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

  /* ===================== 上传流程 ===================== */
  let uploadParsed = null;

  function openUpload() {
    const modal = $('#uploadModal');
    if (!modal) return;
    modal.classList.add('open');
    uploadStep1();
  }

  function closeUpload() {
    const modal = $('#uploadModal');
    if (modal) modal.classList.remove('open');
    uploadParsed = null;
    if (currentViewer) {
      try { currentViewer.clear(); } catch (e) { /* 忽略 */ }
      currentViewer = null;
    }
  }

  function uploadStep1() {
    const body = $('#uploadBody');
    const foot = $('#uploadFoot');
    if (!body) return;
    body.innerHTML =
      '<div class="dropzone" id="dropzone">' +
      '<div class="dz-icon">🧪</div>' +
      '<div class="dz-title">拖拽 CIF 文件到这里，或点击选择文件</div>' +
      '<div class="dz-sub">解析在浏览器本地完成，文件不会上传到任何服务器</div>' +
      '<div class="dz-formats">支持 .cif / .mcif / .txt，单个文件建议小于 5 MB</div>' +
      '<input type="file" id="fileInput" accept=".cif,.mcif,.txt" multiple hidden />' +
      '</div>';
    if (foot) {
      foot.innerHTML = '<span class="muted">上传后会识别元素种类与原子个数，并作为结构标注保存到本地草稿。</span>' +
        '<button class="btn" id="uploadCancel">取消</button>';
    }

    const dz = $('#dropzone');
    const input = $('#fileInput');
    if (dz && input) {
      dz.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        if (input.files && input.files[0]) handleFile(input.files[0]);
      });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
      });
      dz.addEventListener('drop', function (e) {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }
    const cancel = $('#uploadCancel');
    if (cancel) cancel.addEventListener('click', closeUpload);
  }

  function handleFile(file) {
    const name = file.name || 'structure.cif';
    if (file.size > 5 * 1024 * 1024) {
      showToast('文件超过 5 MB，请确认是否选错');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const text = String(reader.result || '');
      const info = window.CIFParser ? window.CIFParser.parse(text) : null;
      if (!info || !info.ok) {
        const msg = info && info.error ? info.error : '无法解析该文件';
        uploadError(name, msg);
        return;
      }
      uploadParsed = { file: name, text: text, info: info };
      uploadStep2();
    };
    reader.onerror = function () { uploadError(name, '文件读取失败'); };
    reader.readAsText(file, 'utf-8');
  }

  function uploadError(name, msg) {
    const body = $('#uploadBody');
    if (!body) return;
    body.innerHTML =
      '<div class="error-box">解析 <b>' + esc(name) + '</b> 失败：' + esc(msg) + '</div>' +
      '<div class="dropzone" id="dropzone"><div class="dz-icon">↺</div>' +
      '<div class="dz-title">重新选择文件</div>' +
      '<input type="file" id="fileInput" accept=".cif,.mcif,.txt" hidden /></div>';
    const dz = $('#dropzone');
    const input = $('#fileInput');
    if (dz && input) {
      dz.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () { if (input.files && input.files[0]) handleFile(input.files[0]); });
    }
  }

  function uploadStep2() {
    const p = uploadParsed;
    if (!p) return;
    const info = p.info;
    const body = $('#uploadBody');
    const foot = $('#uploadFoot');
    if (!body) return;

    const guessMetal = window.CIFParser && window.CIFParser.guessMetal ? window.CIFParser.guessMetal(info.atomCounts) : '';
    const guessSupport = window.CIFParser && window.CIFParser.guessSupport ? window.CIFParser.guessSupport(info.atomCounts) : '';
    const defaultReaction = state.view === 'reaction' && state.reactionId
      ? (reactionById(state.reactionId) || { reaction: '' }).reaction
      : (REACTIONS[0] ? REACTIONS[0].reaction : '');

    const elChips = info.elements.map(function (el) {
      return '<span class="chip">' + esc(el) + '<sub>' + esc(fmtCount(info.atomCounts[el])) + '</sub></span>';
    }).join('');

    const warnings = (info.warnings || []).map(function (w) { return '<div class="warn-box">' + esc(w) + '</div>'; }).join('');

    const reactionOptions = REACTIONS.map(function (r) {
      return '<option value="' + esc(r.reaction) + '"' + (r.reaction === defaultReaction ? ' selected' : '') + '>' + esc(r.name) + '（' + esc(r.en) + '）</option>';
    }).join('');

    const activeReaction = reactionByReaction(defaultReaction);
    const metricInputs = (activeReaction && activeReaction.metrics ? activeReaction.metrics : []).map(function (m) {
      return '<div class="form-row"><label>' + esc(m.label) + '（' + esc(m.unit) + '）</label>' +
        '<input type="number" step="any" data-metric="' + esc(m.key) + '" placeholder="可选" /></div>';
    }).join('');

    body.innerHTML =
      '<div class="upload-grid">' +
      '<div>' +
      '<div class="parse-summary">' +
      '<div class="parse-head"><span class="parse-title">✓ 已解析 ' + esc(p.file) + '</span>' +
      '<span class="muted">' + esc(info.dataBlock || '') + '</span></div>' +
      '<div class="parse-stats">' +
      '<div class="parse-stat"><b>' + info.elements.length + '</b>元素种类</div>' +
      '<div class="parse-stat"><b>' + info.totalAtoms + '</b>总原子数</div>' +
      '<div class="parse-stat"><b>' + esc(info.formula || '—') + '</b>化学式</div>' +
      '</div>' +
      '<div>' + elChips + '</div>' +
      '</div>' +
      warnings +
      '<div class="viewer3d" id="uploadViewer" style="height:300px"></div>' +
      '</div>' +

      '<div>' +
      '<div class="form-row"><label>化学式 / 催化剂名称 *</label>' +
      '<input id="fFormula" value="' + esc(info.formula || info.elements.join('') + '') + '" placeholder="如 Ni/Al2O3" /></div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>活性金属</label><input id="fMetal" value="' + esc(guessMetal) + '" placeholder="如 Ni" /></div>' +
      '<div class="form-row"><label>载体</label><input id="fSupport" value="' + esc(guessSupport) + '" placeholder="如 Al2O3" /></div>' +
      '</div>' +
      '<div class="form-row"><label>反应类型</label><select id="fReaction">' + reactionOptions + '</select></div>' +
      '<div class="form-row"><label>数据来源</label><input id="fRef" placeholder="文献 / 内部记录编号" /></div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>活化能 (eV)</label><input type="number" step="any" id="fBarrier" placeholder="可选" /></div>' +
      '<div class="form-row"><label>选择性 (%)</label><input type="number" step="any" id="fSelectivity" placeholder="可选" /></div>' +
      '</div>' +
      '<div class="form-grid2">' +
      '<div class="form-row"><label>反应温度 (°C)</label><input type="number" step="any" id="fTemp" placeholder="可选" /></div>' +
      '<div class="form-row"><label>DFT 能量 (eV)</label><input type="number" step="any" id="fDft" placeholder="可选" /></div>' +
      '</div>' +
      '<div id="metricInputs">' + metricInputs + '</div>' +
      '<div class="form-row"><label>标注 / 备注</label><textarea id="fNote" rows="2" placeholder="如：Pd 负载量 1 wt%，600 °C 焙烧"></textarea></div>' +
      '</div></div>';

    const footEl = $('#uploadFoot');
    if (footEl) {
      footEl.innerHTML = '<button class="btn" id="uploadBack">重新选择</button>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn" id="uploadAgain">保存并继续</button>' +
        '<button class="btn btn-primary" id="uploadSave">保存到本地草稿</button></div>';
    }

    if (info.cif !== undefined || p.text) {
      render3D($('#uploadViewer'), p.text);
    }

    const reactionSelect = $('#fReaction');
    if (reactionSelect) {
      reactionSelect.addEventListener('change', function () {
        const r = reactionByReaction(reactionSelect.value);
        const host = $('#metricInputs');
        if (!host) return;
        host.innerHTML = (r && r.metrics ? r.metrics : []).map(function (m) {
          return '<div class="form-row"><label>' + esc(m.label) + '（' + esc(m.unit) + '）</label>' +
            '<input type="number" step="any" data-metric="' + esc(m.key) + '" placeholder="可选" /></div>';
        }).join('');
      });
    }

    const back = $('#uploadBack');
    if (back) back.addEventListener('click', uploadStep1);
    const again = $('#uploadAgain');
    if (again) again.addEventListener('click', function () { if (saveUpload()) uploadStep1(); });
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

  function saveUpload() {
    const p = uploadParsed;
    if (!p) return false;
    const formulaEl = document.getElementById('fFormula');
    const formula = formulaEl ? String(formulaEl.value || '').trim() : '';
    if (!formula) {
      showToast('请填写化学式');
      if (formulaEl) formulaEl.focus();
      return false;
    }

    const info = p.info;
    const props = {};
    $$('#metricInputs input[data-metric]').forEach(function (inp) {
      const raw = String(inp.value || '').trim();
      if (!raw) return;
      const v = parseFloat(raw);
      if (isFinite(v)) props[inp.getAttribute('data-metric')] = v;
    });

    const drafts = loadDrafts();
    let maxNum = 0;
    drafts.concat(curated()).forEach(function (d) {
      const m = String(d.id || '').match(/(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });

    const record = {
      id: 'CAT-' + String(maxNum + 1).padStart(3, '0'),
      formula: formula,
      metal: valueOf('fMetal'),
      support: valueOf('fSupport'),
      reaction: valueOf('fReaction'),
      ref: valueOf('fRef'),
      note: valueOf('fNote'),
      barrier: readNum('fBarrier'),
      selectivity: readNum('fSelectivity'),
      temp: readNum('fTemp'),
      dftEnergy: readNum('fDft'),
      props: props,
      structure: {
        file: p.file,
        formula: info.formula || '',
        elements: info.elements.slice(),
        atomCounts: info.atomCounts,
        totalAtoms: info.totalAtoms,
        cell: info.cell,
        spaceGroup: info.spaceGroup || '',
        z: isNum(info.z) ? info.z : null,
        cif: p.text
      },
      source: 'draft',
      addedAt: new Date().toISOString()
    };

    drafts.push(record);
    if (!saveDrafts(drafts)) return false;
    showToast('已保存：' + record.formula + '（' + info.elements.length + ' 种元素 / ' + info.totalAtoms + ' 个原子）');
    uploadParsed = null;
    render();
    return true;
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  /* ===================== 导出 ===================== */
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
        Object.keys(d.structure).forEach(function (sk) {
          if (sk !== 'cif') s[sk] = d.structure[sk];
        });
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
    const body = drafts.map(function (d) {
      return '  ' + JSON.stringify(stripForExport(d));
    }).join(',\n');
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
    const head = ['id', 'formula', 'metal', 'support', 'reaction', 'elements', 'totalAtoms', 'barrier', 'selectivity', 'temp', 'dftEnergy', 'ref', 'note'];
    function q(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }
    const lines = [head.map(q).join(',')].concat(rows.map(function (d) {
      const s = structureOf(d);
      return [d.id, d.formula, d.metal, d.support, d.reaction,
        s ? (s.elements || []).join(' ') : '', s ? s.totalAtoms : '',
        d.barrier, d.selectivity, d.temp, d.dftEnergy, d.ref, d.note].map(q).join(',');
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
    } else {
      fallback();
      showToast(msg);
    }
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

  /* ===================== 提示 ===================== */
  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ===================== 启动 ===================== */
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
        ['scatter', 'bar', 'pie'].forEach(function (k) {
          if (chartRefs[k]) chartRefs[k].resize();
        });
      }, 120);
    });

    window.addEventListener('hashchange', render);

    if (!location.hash) {
      history.replaceState(null, '', '#/');
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
