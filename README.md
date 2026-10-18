# ZJU-ICED Catalyst Database

浙江大学 ICED 课题组的催化剂性能数据库网站。

**在线访问：** <https://njustzhangmj.github.io/ZJU-ICED-DATA.github.io/>

## 功能

**数据浏览**

- 左侧栏按反应分设子库：全部数据、甲烷燃烧、乙烷燃烧（可在 `reactions.js` 中继续增删）
- 每个子库有独立的评价条件、指标定义与体系要点说明，并只显示该反应的条目
- 关键词搜索、金属筛选、任意列排序、分页
- 三张交互式图表：活化能–选择性散点图（子库内为温度–选择性）、金属分布柱状图、反应/载体分布环形图
- 点击任意行打开详情抽屉，查看完整字段、结构信息与三维结构

**CIF 结构上传与解析**

- 拖拽或点选 `.cif` 文件，浏览器本地解析，**文件不会上传到任何服务器**
- 自动识别：元素种类与各元素原子数、总原子数、化学式、晶胞参数（a/b/c/α/β/γ）、空间群
- 自动推测活性金属与载体（如 Al + O → Al₂O₃）
- 三维结构预览（3Dmol.js），可旋转缩放
- 解析结果与人工补充的字段一起保存为该条数据的「结构标注」，用 `data.js` 导出后即可固化为正式数据

## 目录结构

```
index.html      页面骨架与侧边栏
styles.css      样式
app.js          路由、视图、图表、上传、导出
cif-parser.js   CIF 解析器（纯前端，无依赖）
reactions.js    反应子库定义（名称、条件、指标、要点）
data.js         催化剂数据
libs/           ECharts 与 3Dmol（本地化，不依赖 CDN）
```

## 添加数据

### 方式一：网页上传（推荐）

1. 点左侧栏底部「＋ 上传 CIF 结构」，选择本地 CIF 文件
2. 核对自动识别的元素、原子数、三维结构，补充化学式、金属、载体、反应类型、指标等
3. 「保存到本地草稿」——条目立刻出现在表格和对应子库中
4. 右上角「导出 → 导出 data.js」，用下载的文件覆盖仓库里的 `data.js` 并提交

> 上传的条目保存在**本浏览器**的 localStorage 中，不会自动同步给别人；导出 `data.js` 提交后才成为站点正式数据。

### 方式二：直接编辑 data.js

```js
window.CATALYST_DATA = [
  { id:'CAT-001', formula:'Ni/Al2O3', metal:'Ni', support:'Al2O3',
    reaction:'Methane Combustion', dftEnergy:-12.34, barrier:0.87,
    selectivity:92.5, temp:350, ref:'Zhang et al., ACS Catal. 2024',
    note:'Pd 负载量 1 wt%', props:{ T50:380, T90:430, co2Sel:99.1 },
    structure:{ file:'Ni_Al2O3.cif', formula:'Al2 O3', elements:['O','Al'],
                atomCounts:{O:3,Al:2}, totalAtoms:5,
                cell:{a:4.7589,b:4.7589,c:12.991,alpha:90,beta:90,gamma:120},
                spaceGroup:'R -3 c', z:6 } },
];
```

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `id` | 唯一编号 | `CAT-001` |
| `formula` | 化学式 / 催化剂名称 | `Ni/Al2O3` |
| `metal` | 活性金属 | `Ni` |
| `support` | 载体 | `Al2O3` |
| `reaction` | 反应类型，须与子库定义一致 | `Methane Combustion` |
| `dftEnergy` | DFT 计算能量 (eV)，可空 | `-12.34` |
| `barrier` | 活化能 (eV)，可空 | `0.87` |
| `selectivity` | 选择性 (%)，可空 | `92.5` |
| `temp` | 反应温度 (°C)，可空 | `350` |
| `ref` | 数据来源 | `Zhang et al. 2024` |
| `note` | 标注 / 备注 | `1 wt% Pd` |
| `props` | 反应专属指标 | `{ T50:380, co2Sel:99.1 }` |
| `structure` | CIF 解析出的结构标注 | 见上例 |

## 新增一个反应子库

编辑 `reactions.js`，追加一项：

```js
{
  id: 'co-oxidation',            // 网址 #/db/co-oxidation
  name: 'CO 氧化', en: 'CO Oxidation', icon: '🔥',
  reaction: 'CO Oxidation',      // 与数据的 reaction 字段一致
  summary: '...', conditions: [...], metrics: [...], notes: [...]
}
```

`metrics` 里的 `key` 就是 `props` 的键名，会自动成为该子库表格的专属列。

## 本地预览

直接双击 `index.html` 即可（脚本均为相对路径）。或：

```bash
python -m http.server 8000
# 访问 http://localhost:8000
```

## 部署

GitHub Pages，来源 `main` 分支根目录，推送后约 1 分钟自动构建。

- 仓库：<https://github.com/njustzhangmj/ZJU-ICED-DATA.github.io>
- 站点：<https://njustzhangmj.github.io/ZJU-ICED-DATA.github.io/>

## 关于后端

当前是纯静态站点，所以上传的数据只存在访问者自己的浏览器里。若需要**多人共享、服务端持久化**的上传（谁都能传、所有人立即看到），需要加一层后端，可选：

- Cloudflare Worker + R2/KV（免费额度够课题组用，需 Cloudflare 账号）
- Supabase / Firebase（提供现成的鉴权和数据库）

前端已经把数据访问集中在少数几个函数里，接入时改动量不大。

## 数据状态

当前为**框架版本**：页面、子库、CIF 解析与上传流程全部就绪，`data.js` 中尚未录入正式条目。
