# ZJU-ICED Catalyst Database

浙江大学 ICED 课题组的催化剂性能数据库网站。

**在线访问地址：** <https://njustzhangmj.github.io/ZJU-ICED-DATA.github.io/>

## 功能

- 关键词搜索（化学式、金属、载体、反应类型、来源）
- 按金属 / 反应类型筛选，一键重置
- 表格按任意列排序，分页浏览
- 三张交互式图表：活化能–选择性散点图（按金属分组）、各金属条目数柱状图、反应类型分布环形图
- 实时统计卡片：条目数、金属种类、载体种类、平均选择性

## 目录结构

```
index.html   页面结构与交互逻辑（通常不需要修改）
data.js      催化剂数据（日常维护只改这一个文件）
```

## 添加 / 修改数据

编辑 `data.js`，在 `CATALYST_DATA` 数组中追加对象即可，页面所有统计和图表都会自动重算：

```js
window.CATALYST_DATA = [
  { id:'CAT-001', formula:'Ni/Al2O3', metal:'Ni', support:'Al2O3',
    reaction:'CO2 Hydrogenation', dftEnergy:-12.34, barrier:0.87,
    selectivity:92.5, temp:350, ref:'Zhang et al., ACS Catal. 2024' },
  { id:'CAT-002', formula:'Cu/ZnO', metal:'Cu', support:'ZnO',
    reaction:'CO2 Hydrogenation', dftEnergy:-9.12, barrier:0.55,
    selectivity:78.9, temp:260, ref:'Li et al., J. Catal. 2023' },
];
```

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `id` | 唯一编号，建议递增 | `CAT-001` |
| `formula` | 化学式 / 催化剂名称 | `Ni/Al2O3` |
| `metal` | 活性金属，决定筛选分组与配色 | `Ni` |
| `support` | 载体 | `Al2O3` |
| `reaction` | 反应类型 | `CO2 Hydrogenation` |
| `dftEnergy` | DFT 计算能量，单位 eV | `-12.34` |
| `barrier` | 活化能，单位 eV | `0.87` |
| `selectivity` | 目标产物选择性，单位 % | `92.5` |
| `temp` | 反应温度，单位 °C | `350` |
| `ref` | 数据来源（文献 / 内部记录编号） | `ZJU-ICED 2025` |

注意事项：

- 所有字段都要填写，缺字段会让该行数值显示为 `NaN`。
- `reaction` 与 `metal` 请保持写法统一。例如同一反应若同时写成 `CO2 Hydrogenation` 和 `CO₂ 加氢`，筛选框里会拆成两个选项。
- 数值型字段不要加引号（写 `350` 而不是 `'350'`）。
- 数组为空时，页面会自动显示“数据整理中”的空状态提示。

## 本地预览

直接双击 `index.html` 即可打开。如需通过本地服务器预览：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 部署方式

站点通过 **GitHub Pages** 发布，来源为 `main` 分支根目录。向 `main` 分支推送后会自动构建，通常 1 分钟内生效。

- 仓库：<https://github.com/njustzhangmj/ZJU-ICED-DATA.github.io>
- 站点：<https://njustzhangmj.github.io/ZJU-ICED-DATA.github.io/>

## 数据状态

当前为**框架版本**：页面结构、筛选、图表与排序功能全部就绪，催化剂条目尚未录入，`data.js` 中为示例模板。
