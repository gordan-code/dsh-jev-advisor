# dsh-jev-advisor

[English](../README.md) | 中文

**Jev 给的是*你*的第二意见——不是模型的。**

DeepSeek Harness 上现有的 Jev 插件，几乎都是把 Jev 交给 agent。这一个把它交给人。
当模型向你抛出一道选择题时，`dsh-jev-advisor` 把它转成结构化的
[TypeSafe](https://docs.typesafe.ai) 请求，在选项旁浮出推荐——完整概率分布、Jev 的置信度、
真正在网络上往返的那段 JSON，以及一键采纳。

![建议卡片浮现在问题旁边](https://raw.githubusercontent.com/gordan-code/dsh-jev-advisor/main/docs/demo.gif)

| | |
| --- | --- |
| **安装** | `dsh plugin --profile <p> add github:gordan-code/dsh-jev-advisor` |
| **配置** | 在**设置 → Jev** 粘贴 API Key。这就是全部配置。 |
| **接入面** | `shell.overlay` + `settings.section`——不替换内置问题卡片 |
| **模型改动** | 无：不改提示词，不要求模型记得调用某个工具 |
| **测试** | 请求组装 · 客户端接线 · 对替身端点的真实往返 |
| **许可** | MIT |

## 这是什么，不是什么

**是：** 在编码 agent 真正向你索要输入的那一刻，给人的决策辅助。

**不是：** agent loop 的闸门。如果你想用 Jev 限制可见工具、在调用执行前评估它、或在模型之间路由，
请用 [@buberlo/dsh-jev](https://github.com/buberlo/dsh-jev)——它做得很彻底，有 shadow/enforce
模式和 benchmark，本插件刻意不与它竞争。同一张桌子，不同的一侧。

这个取舍是有意的。agent loop 闸门必须被配置——provider、阈值、工具分类、失败规则——而且要调好才有收益。
本插件只有一个需要你提供的东西（一个 API Key），并且在**你被问到的第一个问题**上就开始有用。
这就是全部卖点。

## 你实际会看到什么

你让 agent 做一件事。它停下来，请你选。与其猜，你得到的是：

- **推荐选项**，带角标，以及 Jev 给它分配的概率；
- **其余概率分布**，让你看出这是 80/20 还是 51/49；
- **Jev 对自己的置信度**；
- **幕后的完整请求与响应**，收在可展开的 JSON 块里——推荐没有任何隐藏；
- **一个按钮**，把 Jev 的选择当作你点了那个选项提交。

不会自动应用任何东西。如果你不同意，忽略卡片照常作答即可——内置问题卡片原样未动，行为与从前完全一致。

## 安装

**不必须发布到 npm**——`dsh plugin` 只是 pnpm 的转发器，pnpm 能装的 spec 都能用。任选一种，
**不要混用**：同一个包装两次会把 loader entry 和 API 路由各挂一遍，整个插件树会加载失败。

### 直接从仓库

```bash
dsh plugin --profile <你的 profile> add github:gordan-code/dsh-jev-advisor
# 或完整写法：
dsh plugin --profile <你的 profile> add git+https://github.com/gordan-code/dsh-jev-advisor.git
```

你本机**不需要任何构建步骤**，因为仓库把 `lib/` 一起提交了。pnpm 只对 git 依赖执行 `prepare`
脚本，而且在该包被写进 profile 的 `pnpm-workspace.yaml` allowlist 之前会一直拦着它——直接带上
构建产物就完全绕开了这一步。`npm test` 会跑 `scripts/build.mjs --check`，`lib/` 与 `src/`
不一致时直接失败。

### 从本地目录

```bash
dsh plugin --profile <你的 profile> add /绝对路径/dsh-jev-advisor
```

`link:` 安装同样不构建——改完 `src/` 记得跑一次 `node scripts/build.mjs`。

### 从 npm

尚未发布，名字已确认可用。

```bash
dsh plugin --profile <你的 profile> add dsh-jev-advisor
```

然后重启宿主，打开**设置 → Jev** 填入 API Key。

### 更新 / 卸载

```bash
dsh plugin --profile <你的 profile> remove dsh-jev-advisor
dsh plugin --profile <你的 profile> add github:gordan-code/dsh-jev-advisor
```

git 安装跟踪的是你当时给的那个 ref，所以更新 = 重跑一次 `add`（或在 profile 目录里 `pnpm update`）。
除非写成 `github:gordan-code/dsh-jev-advisor#semver:^0.1.0`，否则没有 semver 区间。

## 配置

**设置 → Jev**

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| API Key | *空* | TypeSafe 密钥，来自 <https://console.typesafe.ai/keys>。在 `Config` 里声明为 `role('secret')`：以脱敏秘密的形式写进 profile 的 Cordis patch，且永远不会回传给浏览器。 |
| 接口地址 | `https://api.typesafe.ai/v1/systemone` | 评测端点。 |
| 模型 | `jev-latest` | Jev 模型或别名（`jev-1.13.0`、`jev-preview` 等）。 |
| 启用 Jev 建议 | 开 | 总开关。 |
| 把最近的对话作为 state 一起发送 | 开 | 是否把会话记录尾部挂到 `state.context`。 |
| 上下文消息条数 | `12` | 取最近多少条消息。 |
| 超时（毫秒） | `30000` | 单次请求超时。 |

**测试连接**会发一个极简的 `noul` 问题并回报作答的模型，方便你在真正遇到问题之前验证刚粘贴的 Key。

同样的字段也可以由 cordis 行的 `config` 预置（见 `cordis.patch.yml`）；用户设置层永远解析在它之上，
所以组合配置只适合放「部署必须钉死」的值——例如无头 profile 里的接口地址。

## 工作原理

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js` | `Config`（兼作设置 schema）、读取会话记录、对外发起 TypeSafe 调用、三条仅限回环的 JSON 路由。 |
| Browser | `lib/client.js` | 浮动建议卡片与「设置 → Jev」面板。 |

两半之间用同源 `fetch` 走宿主自己的 webserver：

| 路由 | 用途 |
| --- | --- |
| `POST /dsh-jev-advisor/api/status` | `{ enabled, hasKey, endpoint, model, … }`——不含密钥的连接事实。 |
| `POST /dsh-jev-advisor/api/test` | 一次极简评测，供「测试连接」按钮使用。 |
| `POST /dsh-jev-advisor/api/advise` | 为待答问题批次组装结构化请求、调用 Jev、把答案映射回选项标签。 |

三条路由都会拒绝任何非「同源 + 回环地址」的请求；当 Connection 服务挂载时，还会先经过
`ctx.connection.requestRejection`。

### 为什么用浮动卡片，而不是改造问题卡片？

`conversation.composer` 是 **chain** 槽位：它只选举一个 entry，而内置的问题卡片对任何待答问题都会
抢先当选。要接管它就得把整套问题 UI 重新实现一遍，并且会弄坏本插件没有建模的所有问题形态。
`shell.overlay` 是官方文档指定的、用于「覆盖整个框架的浮层」的加法式座位，所以建议卡片渲染在内置
问题卡片**旁边**，并从同一个 `useSessionPendingInteraction` 读取待答交互。

## 几个值得知道的设计决定

**多选题**会扇出成「每个选项一个 `noul` 问题」（「这个选项该被选中吗？」），因为 Jev 没有多标签
原语。概率 ≥ `0.5` 的选项构成推荐选择。

**单选题永远会多给 Jev 一个「以上都不是」选项。** 如果它选了这个，卡片会明说，并且不给采纳按钮——
你得自己写答案，因为 Jev 告诉你的是「选项列表不对」，而不是「哪个选项对」。

**采纳是全有或全无。** 提交一个答案批次等于回答批次里的**每一道**问题。只要其中一道 Jev 没有给出
明确答案——或者某道问题本身没有选项——按钮就保持禁用并在卡片上说明原因，而不是悄悄给其余问题提交
空答案。

## 开发

```bash
node scripts/build.mjs           # src/*.js -> lib/*.js（含类型声明）
node scripts/build.mjs --check   # lib/ 与 src/ 不一致就失败
npm test                         # 上面那条检查 + 请求组装 + 客户端接线两套断言
npm pack --dry-run               # 确认发布文件清单
```

`test/e2e.mjs` 会驱动一个真实运行的宿主去访问 `test/mock-typesafe.mjs`（替身 TypeSafe 端点），
这样无需真实 Key 就能验证对外调用这一环：

```bash
node test/mock-typesafe.mjs 43221 &            # 替身评测端点
dsh --profile <临时 profile> --port 43219 --no-open   # 装好本插件的宿主
node test/e2e.mjs <启动 token>                 # status + test + advise 全链路
```

插件是纯 JavaScript：宿主半边是 Node ESM，浏览器半边已经写成 DSH 客户端模块系统要求的
`__ModuleLoader__.load({ id, factory })` 惰性 CJS 形式。没有需要转译的东西，所以 `lib/` 就是
`src/` 的直拷贝——而且它**是提交进仓库的**，因为 git 安装不会触发任何构建。

浏览器半边只能 `require` 平台种子模块（`react`、`react/jsx-runtime`、`react-dom`、
`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）。跨插件协作一律走
cordis 服务（`ctx.slots`、`ctx.locale`、`ctx.settingsScope`）或宿主 HTTP 桥，绝不 import 别的插件内部。

## 排障

| 现象 | 原因 |
| --- | --- |
| 卡片从不出现 | 没有待答问题、Jev 建议被关闭，或宿主路由不可达。先确认 `/dsh-jev-advisor/api/status` 返回 `{"ok":true,...}`。 |
| `no Jev API key is configured` | 去「设置 → Jev」保存 Key。 |
| `Jev responded 401` | Key 无效或已吊销。 |
| `Jev responded 422` | 请求格式不对——请带上卡片里显示的 JSON 反馈。 |
| `Jev responded 429 / 529` | 触发限流或服务过载；插件会退避重试两次后放弃。 |
| 设置里没有 Jev 分区 | 客户端 bundle 没加载。确认 `node_modules/dsh-jev-advisor/package.json` 里有 `dsh.client`，且 `lib/client.js` 已随包发布。 |
| 启动报 `duplicate loader entry id` | 包被挂了两次——装了两份，或某个聚合包又挂了一次。删掉一份。 |

## 已知限制

- **需要设置服务会把 `Config` 投影成表单的 DSH（0.1.7-rc.1 或更新）。** 本插件最初是照 `settings.register` /
  设置命名空间那套 API 写的，DSH 已经把它连同客户端的 `settingsScope` 一起删掉。在 0.1.5-rc.2 及更早版本上，
  宿主半边会调用一个已不存在的方法，浏览器半边也永远解析不到 `configForms`，插件根本不会加载。
  没有做双 API 兼容——DSH 是迭代很快的开发者预览版。
- 卡片浮在右上角，右栏很宽时可能重叠；点 `✕` 关闭。
- 同时有多个会话挂着待答问题时，卡片跟随当前会话，否则回退到第一个待答交互。
- 计划评审（plan-review）问题会和其它带选项的问题一样获得建议；卡片不会取代批准/拒绝按钮。
- API Key 会传到宿主进程（HTTPS 调用在宿主发起）。它不会回传浏览器，但会以明文保存在 profile 的
  Cordis patch 里——请像对待任何凭证一样保护该文件。
- Jev 按输入 token 计费。每次请求的会话记录上限约 24k 字符。
- 除文档化的两个过载码（`429`、`529`）外不做重试。

## 前作，以及为什么这个包不叫 `dsh-jev`

`dsh-jev` 在 npm 上已被占用（`zhangxaochen/dsh-jev`，v0.2.0），GitHub 上至少还有五个同名仓库，
所以本包命名为 `dsh-jev-advisor`——它拥有的每一个标识（设置 entry id、API 路由前缀、locale 命名空间、
loader entry id）都加了同样的命名空间。因此它可以和那些插件共存，不会撞 entry 导致启动失败。

已经存在的 Jev 插件值得你去看：

| 项目 | 做什么 |
| --- | --- |
| [Devin-AXIS/jev-dsh-decision](https://github.com/Devin-AXIS/jev-dsh-decision) | 面向 agent harness 的结构化决策引擎；DSH 原生，并通过 iPolloWork 支持 OpenCode/Codex |
| [buberlo/dsh-jev](https://github.com/buberlo/dsh-jev) | 把 Jev 绑进 agent loop：工具预选、逐次调用评估、模型与 Skill 路由 |
| [noetion/dsh-jev](https://github.com/noetion/dsh-jev) | 一个 `jev_ask` 工具，支持 noul / choice / score |

它们把 Jev 放进 agent 的决策过程；这一个放进你的。想两个都用也不冲突——上面那套命名空间就是为此准备的。

Jev 是 TypeSafe AI 的产品。本项目与 TypeSafe AI、DeepSeek 及上述任何项目均无隶属或背书关系。

## 许可

MIT
