# ZJU-ICED Catalyst Database

浙江大学 ICED 课题组的催化剂 **DFT 计算**数据库网站。

**在线访问：** <https://zju-iced-data.github.io/>

## 功能

**数据总览**

- 四张统计卡：催化剂体系数、DFT 总能记录数、结构模型数、平均能垒
- 各反应催化剂覆盖条形图、DFT 描述符分布堆叠图、结构模型分布环形图
- 当前数据源面板：CIF 结构、OUTCAR 能量、data.js 正式数据、本地草稿分别计数
- 反应工作区卡片：每个体系的催化剂数、结构数、DFT 数值数，点击进入子库
- 全量数据表：搜索、金属筛选、任意列排序、分页

**反应子库（左侧栏）**

- 目前收录三个体系：**催化甲烷燃烧**（Methane Combustion）、**催化乙烷燃烧**（Ethane Combustion）、**CO2 加氢**（CO2 Hydrogenation）
- 每个体系独立页面：计算设置、DFT 描述符定义、体系要点
- 专属 KPI（催化剂数、平均 Ea、平均 Eads、结构数）、Ea–Eads 散点图、金属分布
- 只收录该反应的条目

**上传与解析**

- CIF 结构文件（必填）：识别元素种类、各元素原子数、总原子数、化学式、晶胞参数、空间群，并提供三维结构预览（3Dmol）
- VASP OUTCAR（可选）：自动读取 `free energy TOTEN` 作为总能，同时解析 E-fermi、NIONS、体积、离子步数
- **化学式 / 催化剂名称默认取 CIF 文件名**（去掉扩展名），例如 `Ni_Al2O3.cif` → `Ni_Al2O3`，可随时改
- **支持一次上传多个结构**：多选或一次拖入多个 CIF，会逐条生成记录并进入批量编辑表格（化学式、金属、载体、Ea、Eads、总能都可逐行修改，反应体系/来源/备注统一应用）
- **支持上传文件夹**：点「选择文件夹」（或直接把文件夹拖进来）。里面放 `POSCAR`/`CONTCAR`（或 CIF）与 `OUTCAR`，**用文件夹名作为该条数据的名称**；选中包含多个计算目录的父目录时，每个子目录各成一条记录
- POSCAR 支持 VASP 5 及以上格式（元素符号行、Selective dynamics、Direct/Cartesian、负缩放系数按目标体积换算），会自动换算晶格常数并把坐标转成 XYZ 做三维预览；VASP 4 格式（无元素符号）会给出明确提示
- **OUTCAR 自动配对**：按文件名归一化匹配（`OUTCAR_Ni_Al2O3` ↔ `Ni_Al2O3.cif`）；文件夹上传时直接取同目录下的 OUTCAR；散选且只有一个结构和一个 OUTCAR 时即使名字不同也直接配对；未匹配的 OUTCAR 会明确提示且不写入记录
- 解析 + 人工补充后保存为本地草稿，条目立即进入表格与对应子库

**内容管理（`#/admin`）**

- 页面上所有文字都可在管理页直接修改：站点名称、总览页标题/说明/标签、KPI 名称、图表标题、空状态文案、各体系的名称/说明/计算设置/体系要点、描述符定义
- 计算设置可以增删行，例如把「泛函 / 色散」改成别的文字
- 修改先保存在浏览器本地；点「导出 content.js」下载后覆盖仓库同名文件并提交，才对所有访问者生效

**关于我们（`#/about`）**

- 课题组简介、研究方向卡片、联系方式（负责人 / 单位 / 邮箱 / 地址 / 个人主页）
- 课题组合影（`assets/group-photo.jpg`）
- 全部文字同样可在「内容管理」中修改，包括简介分段与研究方向增删

### 登录

内容管理页需要登录后才能编辑：

- 账户：`admin`
- 密码：见课题组内部记录。仓库里不保存明文，只保存加盐 SHA-256 哈希（`auth.js`）
- 登录状态存在 sessionStorage，只在当前标签页有效，关闭浏览器后需重新登录
- 连续输错 5 次锁定 30 秒

改密码：算出新哈希后替换 `auth.js` 的 `hash` 字段（盐值在 `salt` 字段）：

```bash
python -c "import hashlib;print(hashlib.sha256(b'iced-a3f7c9e1d2b4:新密码').hexdigest())"
```

> **安全边界**：这是纯静态站点，前端校验只能挡住随手点开的人——能看到源码的人都能绕过，也能直接改自己浏览器里的 localStorage。好消息是管理页的改动本来就只写进访问者自己的浏览器，不会影响别人看到的站点内容，所以这层门禁的定位是「防误操作」。若需要真正的权限控制（多人账号、操作审计），必须把鉴权放到后端（Cloudflare Worker 或 Supabase）。

## 目录结构

```
index.html        页面骨架
styles.css        样式
app.js            路由、视图、图表、上传、导出
content.js        全站文案（可在管理页编辑）
auth.js           内容管理页的登录门禁（盐 + 哈希）
reactions.js      反应体系结构定义（id / reaction / 配色）
data.js           DFT 数据
cif-parser.js     CIF 解析器（纯前端）
poscar-parser.js  POSCAR / CONTCAR 解析器（纯前端）
outcar-parser.js  OUTCAR 解析器（纯前端）
assets/           图片资源（课题组合影）
libs/             ECharts 与 3Dmol（本地化，不依赖 CDN）
```

## 数据字段

```js
window.CATALYST_DATA = [
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
];
```

| 字段 | 含义 | 单位 |
| --- | --- | --- |
| `id` | 唯一编号 | — |
| `catalyst` | **归属催化剂**（一个催化剂可含多个结构；统计"催化剂数"按它去重，缺省回落为结构名称） | — |
| `formula` | 结构名称（上传时默认取 CIF/POSCAR 文件名） | — |
| `structure.atoms` | 结构坐标 `[[元素, x, y, z], …]`，详情页据此重建 3D 模型 | Å / 分数坐标 |
| `structure.coord` | 坐标类型：`frac`（CIF 分数坐标）或 `cart`（POSCAR 笛卡尔坐标） | — |
| `metal` / `support` | 活性金属 / 载体 | — |
| `reaction` | 反应体系，须与 `reactions.js` 一致 | — |
| `dftEnergy` | 总能 E_total（来自 OUTCAR） | eV |
| `barrier` | 活化能 Ea | eV |
| `eads` | 吸附能 Eads | eV |
| `reactionEnergy` | 反应能 ΔE | eV |
| `evac` | 氧空位形成能（可选） | eV |
| `ref` / `note` | 数据来源 / 备注 | — |
| `structure` / `outcar` | 上传解析结果 | — |

### 小分子记录（`kind: "molecule"`）

小分子与催化剂共用同一个 `data.js`，靠 `kind` 区分；`id` 以 `MOL-` 开头，不计入催化剂的统计与表格。

| 字段 | 含义 |
| --- | --- |
| `kind` | 固定为 `molecule` |
| `name` | 分子名称，如 `CH4`、`CO2` |
| `structure` | 构型（坐标、晶胞、元素），同催化剂 |
| `outcar.totalEnergy` | 总能（free energy TOTEN） |
| `outcar.magnetization` | 总磁矩 μB（`number of electron … magnetization`） |
| `outcar.magPerAtom` | 逐原子磁矩数组 μB |

页面入口：`#/molecules`（侧边栏「小分子 → 小分子性质」）。点开分子后可查看三维构型，**点击任意化学键即显示键长**（按共价半径判定成键，用屏幕上点到键段的距离拾取）。

## 新增一个反应体系

1. `reactions.js` 加一项：`{ id:'co-oxidation', reaction:'CO Oxidation', icon:'🔥', accent:'#2b7ac4' }`
2. `content.js` 的 `reactions` 里加同名 id 的文字（名称、说明、计算设置、要点）——或直接在管理页里编辑
3. 数据的 `reaction` 写成 `CO Oxidation` 即归入该子库

## 本地预览

直接双击 `index.html`，或：

```bash
python -m http.server 8000
```

## 部署

GitHub Pages，`main` 分支根目录，推送后约 1 分钟生效。

- 仓库：<https://github.com/ZJU-ICED-DATA/ZJU-ICED-DATA.github.io>
- 站点：<https://zju-iced-data.github.io/>

## 数据流说明

这是纯静态站点，上传默认只写入当前浏览器的 localStorage（本地草稿）。要让所有人看到，有两条路：

### 方式一：手动（默认，无需任何服务）

上传 → 右上角「导出 → 导出 data.js」→ 用下载的文件覆盖仓库 `data.js` → 提交 → 约 1 分钟生效。

### 方式二：配置 Cloudflare Worker 后一键发布（推荐）

配置之后，上传界面会多出「保存并发布」按钮，点一下直接提交到仓库。GitHub 令牌只存在 Worker 服务端，网页端只有可随时更换的发布密钥。

**1. 生成 GitHub 令牌**

GitHub → Settings → Developer settings → Fine-grained tokens → 新建：
- Repository access：只选 `ZJU-ICED-DATA.github.io`
- Permissions → Repository permissions → **Contents: Read and write**
- 复制生成的令牌（`github_pat_...`）

**2. 创建 Worker**

<https://dash.cloudflare.com> → Workers & Pages → Create → Worker → 命名（如 `iced-publish`）→ Deploy，
然后用仓库中 [`worker/worker.js`](worker/worker.js) 的代码整段覆盖默认代码。

**3. 配置变量与密钥**

Worker → Settings → Variables and Secrets：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `GITHUB_TOKEN` | Secret | 第 1 步的令牌 |
| `PUBLISH_KEY` | Secret | 自定义长随机串（网页端填同一个） |
| `REPO` | Text | `ZJU-ICED-DATA/ZJU-ICED-DATA.github.io` |
| `BRANCH` | Text | `main` |
| `DATA_PATH` | Text | `data.js` |
| `ALLOWED_ORIGIN` | Text | `https://zju-iced-data.github.io` |

保存后重新 Deploy，记下 Worker 地址（形如 `https://iced-publish.xxx.workers.dev`）。

**4. 在网站上填写**

内容管理（需登录）→「发布设置」→ 填 Worker 地址与发布密钥 → 保存 → 「测试连接」确认。

之后上传任意结构，底部就会出现「保存并发布」。

**注意**

- 提交到仓库的记录会剥离 CIF 原文（只保留元素、原子数、晶胞等元信息），避免 `data.js` 过大；因此已发布条目没有 3D 预览，本地草稿才有
- 发布密钥只存在管理员自己的浏览器；怀疑泄露时在 Cloudflare 改 `PUBLISH_KEY` 即可全部作废
- Worker 免费额度为每天 10 万次请求，课题组用量完全够用

如需多人共享或保存 CIF 原文，可在这个 Worker 上继续接 D1/R2。
