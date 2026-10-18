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

已在 npm 提供安装。省略版本时安装注册表当前版本，不一定是本地源码版本；需要精确版本时使用
`dsh-jev-advisor@<已发布版本>`。0.1.6 需正式发布后才能从 npm 安装该精确版本。

```bash
dsh plugin --profile <你的 profile> add dsh-jev-advisor
```

然后打开**设置 → Jev** 填入 API Key。如果 DSH 提示需要重启，或插件没有出现，请重启宿主并刷新页面。

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
| API Key | *空* | TypeSafe 密钥，来自 <https://console.typesafe.ai/keys>。`role('secret')` 会从设置读取结果中移除它，不会回传给浏览器；但 profile 的 Cordis patch 仍以明文保存，不是加密存储。 |
| 接口地址 | `https://api.typesafe.ai/v1/systemone` | 评测端点。 |
| 模型 | `jev-latest` | Jev 模型或别名（`jev-1.13.0`、`jev-preview` 等）。 |
| 启用 Jev 建议 | 开 | 总开关。 |
| 把最近的对话作为 state 一起发送 | 开 | 是否把会话记录尾部挂到 `state.context`。 |
| 发送前预览并确认 | 关 | 可选的本地预览模式；默认保留自动建议。 |
| 发送前遮盖常见凭证 | 开 | 对发送的题目、选项和上下文做常见凭证模式替换，不是完整隐私过滤器。 |
| 上下文消息条数 | `12` | 取最近多少条消息。 |
| 超时（毫秒） | `30000` | 整次评估总超时，包含读取响应及重试退避。 |

**测试连接**会发一个极简的 `noul` 问题并回报作答的模型，方便你在真正遇到问题之前验证刚粘贴的 Key。

同样的字段也可以由 cordis 行的 `config` 预置（见 `cordis.patch.yml`）；用户设置层解析在它之上。
组合配置提供的是部署默认值，不是不可覆盖的强制策略。

## 工作原理

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js` | `Config`（兼作设置 schema）、读取会话记录、对外发起 TypeSafe 调用、四条仅限回环的 JSON 路由。 |
| Browser | `lib/client.js` | 浮动建议卡片与「设置 → Jev」面板。 |

两半之间用同源 `fetch` 走宿主自己的 webserver：

| 路由 | 用途 |
| --- | --- |
| `POST /dsh-jev-advisor/api/status` | `{ enabled, hasKey, endpoint, model, … }`——不含密钥的连接事实。 |
| `POST /dsh-jev-advisor/api/test` | 一次极简评测，供「测试连接」按钮使用。 |
| `POST /dsh-jev-advisor/api/prepare` | 本地准备精确请求快照及短期确认令牌，不调用 Jev。 |
| `POST /dsh-jev-advisor/api/advise` | 为待答问题批次组装结构化请求、调用 Jev、把答案映射回选项标签。 |

四条路由均要求真实 TCP 对端和目标主机均为回环地址，不能仅靠伪造 `Host` 通过检查；当 Connection
服务挂载时，还会经过 `ctx.connection.requestRejection`。
浏览器提供的 `Origin` 必须与实际请求的协议、主机名和端口全部一致；Fetch Metadata 中的跨站及
「同站但不同源」请求会被拒绝。无 `Origin` 的本地诊断客户端仍受支持。所有 POST 都要求
`Content-Type: application/json`，仅 `/status` 额外允许 GET；GET 不会触发付费评估。

### 为什么用浮动卡片，而不是改造问题卡片？

`conversation.composer` 是 **chain** 槽位：它只选举一个 entry，而内置的问题卡片对任何待答问题都会
抢先当选。要接管它就得把整套问题 UI 重新实现一遍，并且会弄坏本插件没有建模的所有问题形态。
`shell.overlay` 是官方文档指定的、用于「覆盖整个框架的浮层」的加法式座位，所以建议卡片渲染在内置
问题卡片**旁边**，通过 `useSessionStatus` 读取待答交互。该槽位属于根作用域，因此还会单独订阅
公开的 `uiSession.adapter.current`，跟随主视图会话。

## 几个值得知道的设计决定

**多选题**会扇出成「每个选项一个 `noul` 问题」（「这个选项该被选中吗？」），因为 Jev 没有多标签
原语。概率 ≥ `0.5` 的选项构成推荐选择。

**单选题永远会多给 Jev 一个「以上都不是」选项。** 如果它选了这个，卡片会明说，并且禁用采纳按钮——
你得自己写答案，因为 Jev 告诉你的是「选项列表不对」，而不是「哪个选项对」。

**采纳是全有或全无。** 提交一个答案批次等于回答批次里的**每一道**问题。只要其中一道 Jev 没有给出
明确答案——或者某道问题本身没有选项——按钮就保持禁用并在卡片上说明原因，而不是悄悄给其余问题提交
空答案。

### 正确性保护（0.1.5）

- 评估键按题目生成（`decision_0`、`decision_1_opt_0` 等），与原始问题 ID 分离，多道多选题
  不会互相覆盖；提交答案仍使用原始问题 ID 和选项标签。
- 缺失答案、答案类型错误、未知选项、概率分布不完整，或概率及显式提供的置信度超出 `[0, 1]`，
  都会阻止采纳。缺失的多选答案不会被当作反对票；所有选项均低于 `0.5` 时，不会强行推荐一个选项。
- 单选概率总和允许与 1 相差不超过 `0.01`（舍入容差），概率为零的推荐不能采纳。
  嵌套建议结构会在进入渲染前校验。
- 建议绑定会话、交互 key 和完整问题内容。交互变更后立即隐藏旧建议，忽略迟到响应，并拒绝过期
  提交事件；双击不会重复提交同一交互，失败后可以重试。
- 每次浏览器评估携带新的请求 ID，宿主将它与会话、交互 key、问题内容一起回显；浏览器拒绝
  身份不匹配或重放的响应内容。
- 重复问题 ID 和有歧义的选项标签会被拒绝。错误请求正文返回 `400`，正文超限返回 `413`，
  不支持的正文类型返回 `415`，不允许的 HTTP 方法返回 `405`。

### 宿主接线与设置保存（0.1.5）

- 主视图会话的待答交互优先，不再取集合中的第一项；仅当主会话没有待答交互时，才回退到第一个
  带选项的问题。当前会话正在等待批准时，保留原有批准界面，不叠加后台会话的建议。
- 保存前先验证整个草稿，再携带已读取的修订号调用一次 `ConfigFormController.mutate`。
  宿主拒绝写入时保留草稿并显示错误，不会误报「已保存」。加载中、不可用及只读表单不能保存或
  清除密钥；保存期间新输入的值也不会被旧提交清空。留空 Key 输入框不等于清除已存 Key。
- 请求身份不匹配时仅记录比较标志，不再保存问题正文或全局会话诊断轨迹；请求 ID、会话和交互
  key 仍保持严格校验。

### 体验、隐私与成本控制（0.1.5）

- 默认保留自动建议。开启「发送前预览并确认」后，可先查看精确的发送 JSON，再点「确认发送」。
  准备阶段仅在本地宿主执行；确认使用该快照，不会重新读取更新后的会话。预览有效两分钟，修改设置
  或请求身份后失效，内存中最多保留 32 份预览。
- 默认遮盖常见凭证，作用于发送的题目、选项及上下文。规则识别常见 password/token 赋值、Bearer
  token、`sk-…` 密钥、私钥块及 URL 凭证。**不能识别所有秘密或个人信息。** 敏感会话请关闭上下文
  发送或启用确认模式。采纳时提交给 DSH 的原始选项标签不会被替换。
- 完整评估 JSON 使用本地 **64 KiB UTF-8 字节预算**，优先缩减上下文；题目或选项自身超限时返回
  `413`，不会调用 Jev，也不静默截断。这不是 token 估算，也不保证满足上游所有限制。
- 同一宿主实例内的相同并发评估共用一次上游调用，仍分别回显各自请求 ID。宿主不缓存已完成结果，
  显式重试仍可取得新结果。关闭或切换活动请求会取消该订阅；最后一个等待者离开后中止上游。
  取消不能撤销上游已处理的工作，也不保证免单或退款。
- 卡片展示 Jev 实际返回的 token 用量，不猜测货币价格。默认靠左，可切换左右以避让侧栏，支持
  折叠、关闭后重开。重开已完成卡片不会再次评估；重开已取消的加载会重新请求。

### 决策辅助功能（0.1.5）

- **推荐分歧提示**：单选推荐与最强其他选项（包含「以上都不是」）的概率差不超过 10 个百分点时，
  提示概率接近；多选题接近 `0.5` 阈值的选项提示为临界选择。这只是 Jev 已报告分数的观察，
  不承诺真实正确率，也不会自动提交或额外禁止采纳。
  如果其他选项概率高于推荐项，会单独提醒，不把它呈现为明确胜出。
- **复制建议而不采纳**：将完整、有效的建议批次复制为可读文本，保留原始题目和选项措辞。
  复制不提交答案，也不触发评估；缺失、异常或「以上都不是」的批次不能冒充完整答案复制。
- **位置记忆（0.1.6 更新）**：左右停靠和折叠状态以 `cardDock`、`cardCollapsed` 保存到插件当前
  DSH profile，跨端口及浏览器恢复，同一 profile 的窗口共享，不同 profile 相互独立。布局保存
  只写这两个字段，不包含临时偏好、题目或响应。尚无 profile 布局时迁移同源旧版浏览器记忆；
  无法跨域读取已不可访问的旧端口存储。宿主只读或拒绝保存时保留本次挂载内的布局并提示失败，
  再次调整可重试。本卡片已确认的布局写入不重新评估 Jev，也不使已有预览失效；其他窗口来源
  不明的修订仍保守视为配置变更，因为同一原子写入可能同时轮换不可见的 API Key。
- **临时决策偏好**：输入「优先稳定」「尽快完成」「尽量少改代码」等要求，再点「应用并重新评估」。
  仅输入不会产生调用；上限为 500 个 UTF-16 编码单位（部分 emoji 占两个单位），只用于当前交互，
  切换问题即清空。应用或清除已生效偏好会触发新评估，确认模式下则重新准备本地预览。
  不修改 agent 提示词，也不写入 DSH 设置；关闭会话上下文时，仍会发送用户显式填写的偏好。
  偏好同样经过凭证遮盖和完整请求预算检查，修改后旧预览及建议身份失效。

此前暂存的正确性、宿主接线及隐私改进统一并入从 0.1.4 升级的 **0.1.5**；中间开发版本标记不作为发布版本。

### DSH 兼容性补丁（0.1.6）

- `engines.dsh` 仅声明 `0.2.0-rc.2` 与 `0.2.1-rc.2`，不推定未来版本兼容；验证后再扩大声明。
- 订阅公开问题卡片快照：`waterfall` 与继续后的 `rpc` 通道支持回答；已关闭、历史回看及暂时没有
  回答通道的卡片不请求建议，旧采纳事件也不能继续提交。
  根浮层自行订阅主会话绑定，即使 Session 状态 Map 没有变化也能切换；浏览器夹具不再代为订阅。
- 补浮层重挂载、请求取消、旧预览替换、布局排队写入、异步设置保存与清除 Key 的回归。
  已交给宿主的写入无法因卸载撤回；尚未发出的布局写入不会在卸载后继续发送。
- DSH 0.2.1-rc.2 开启热重载时可直接应用可替换插件变更，否则按宿主提示重启。如果卡片提示
  host bridge 过旧，需同时重启宿主并刷新浏览器，单独刷新页面不能替换宿主代码。
  安装后核对 DSH 显示的实际版本；发布冷却策略可能选中旧 npm 版本，可指定精确版本安装。
- 上游消息中的凭证遮盖只是显示效果，不能代替本插件发送前的脱敏。仍保持回环限定，不增加
  远程访问或带路径前缀的反向代理支持。

## 开发

设置页的保存、清除 Key 与连接测试使用同步互斥锁。清除 Key 也通过带修订号的原子写入，
不会覆盖外部更新，等待期间新输入的 Key 草稿会保留。卸载时中止状态读取与连接测试，
忽略迟到的界面更新和后续请求；已交给宿主的配置写入无法撤回。
仅有空白 Key 的草稿不会显示“已保存”，而会明确提示使用“清除 Key”。

```bash
npm ci                           # 安装开发测试依赖，无需真实 API Key
node scripts/build.mjs           # src/*.js -> lib/*.js（含类型声明）
node scripts/build.mjs --check   # lib/ 与 src/ 不一致就失败
npm test                         # 构建新鲜度、请求映射、路由、生命周期、设置契约
npm run check:pack               # DSH 发布包入口与文件检查
npm pack --dry-run               # 确认发布文件清单
npx playwright install chromium
npm run test:browser              # 真实 Chromium + React DOM，隔离服务夹具
npm run test:host                 # 真实 DSH CLI，隔离临时 home（见下文）
npm run test:install              # 真实 .tgz 离线安装 + 隔离宿主加载
npm run quality                   # 构建 → 基础 → 浏览器 → 打包 → 宿主 → 安装
```

`npm test` 还覆盖异常响应映射、路由拒绝路径、确定性的 hook/effect 生命周期测试，以及真实回环
HTTP 桥到替身评估端点的往返。这些测试不需要真实 API Key，也不会在仓库中产生请求转储文件；

`test:browser` 使用仅用于开发测试的 Playwright 1.59.1、真实 Chromium 和 React DOM，宿主服务由
隔离夹具提供。覆盖主会话切换、迟到响应、关闭／重试、采纳，以及原子／异步设置保存、
拒绝写入、清除 Key 和设置页卸载取消。
这不是完整 DSH Desktop 界面的自动化测试。

`test:host` 启动真实 DSH CLI，使用随机临时 `DSH_HOME`、临时 profile、随机回环端口及内存记录的
TypeSafe 替身。验证实际挂载的路由、请求绑定、正确／错误／缺失 Key、HTTP 拒绝路径、官方设置
Remote 写入及真实进程重启后的布局恢复。另验证应用 effect 的路由／评估／预览清理及启动失败回收，
不冒充完整 Desktop 热重载 UI 验证。完成后关闭进程并清理临时 profile，不使用真实 Jev Key 或用户
profile。通过 `DSH_TEST_CLI` 指定固定
版本的 CLI 入口（也可安装到模块解析可找到的位置），不会回退到 PATH 中的任意 `dsh`。PowerShell 示例：

```powershell
$env:DSH_TEST_CLI = "<临时 CLI 目录>/node_modules/@deepseek-ai/dsh/lib/bin.js"
npm run test:host
npm run quality
```

`test:install` 在临时目录生成真实 npm `.tgz`，再在全新临时 profile 中执行
`npm install --offline --ignore-scripts`，使用空 npm 缓存和不可达的注册表地址。
Peer 及其必需依赖闭包从 `npm ci` 已安装的依赖本地打包，并核对 `package-lock.json` 版本，
与插件一起以真实 tarball 安装。npm 仍校验 peer 范围，不使用 `--legacy-peer-deps`，
不联网补装、不回退源码链接，也不依赖注册表元数据缓存。此测试验证锁定依赖下的打包和加载，
不验证实时注册表可用性。测试通过 profile 的 bundle 栈加载压缩包内的
`cordis.patch.yml`，验证实际建议请求、DSH 客户端启动图及宿主提供的客户端模块；
同时断言插件目录是实际安装文件而非 junction。结束后清理所属进程、压缩包和临时 profile，
不使用真实 Key 或用户 profile。

`quality` 任一步失败立即停止，缺少 Chromium 或真实 CLI 时失败而非跳过验证。
它忽略开发专用的 `DSH_CLIENT_SOURCE` 开关，始终验证 `lib/`，不发布、不提交。
`npm ci`、安装 Chromium 及准备固定版本 CLI 是运行前的环境准备，不会由闸门自动修改用户 profile。

CI 在 runner 临时目录分别安装固定 DSH `0.2.0-rc.2`、`0.2.1-rc.2`。基础测试及发布包检查覆盖
Node 20／22／24，两个 Node 24 作业分别执行完整质量闸门（浏览器、隔离宿主和真实压缩包安装）。
本机验证同样只用隔离临时 profile；GitHub CI 仍需在推送后实际运行。

手动验证**已运行且配置为本地替身端点的临时宿主**时，可通过 `DSH_E2E_BASE` 或
`node test/e2e.mjs <带 token 的启动 URL>` 指定目标。`node test/mock-typesafe.mjs 0` 会分配空闲端口，
默认仅在内存记录请求。可选 `DSH_E2E_DUMP` 读取明确指定的转储文件，`DSH_E2E_BADKEY_BASE` 指向另一个
配置错误 Key 的临时宿主；未提供后者时会明确跳过错误 Key 检查，不再误报通过。自动宿主测试始终验证该路径。

插件是纯 JavaScript：宿主半边是 Node ESM，浏览器半边已经写成 DSH 客户端模块系统要求的
`__ModuleLoader__.load({ id, factory })` 惰性 CJS 形式。没有需要转译的东西，所以 `lib/` 就是
`src/` 的直拷贝——而且它**是提交进仓库的**，因为 git 安装不会触发任何构建。

浏览器半边只能 `require` 平台种子模块（`react`、`react/jsx-runtime`、`react-dom`、
`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）。跨插件协作一律走
cordis 服务（`ctx.slots`、`ctx.locale`、`ctx.configForms`、`ctx.uiSession`）或宿主 HTTP 桥，绝不 import 别的插件内部。

## 排障

| 现象 | 原因 |
| --- | --- |
| 卡片从不出现 | 没有待答问题、Jev 建议被关闭，或宿主路由不可达。先确认 `/dsh-jev-advisor/api/status` 返回 `{"ok":true,...}`。 |
| `no Jev API key is configured` | 去「设置 → Jev」保存 Key。 |
| `Jev responded 401` | Key 无效或已吊销。 |
| `Jev responded 422` | 先在本地检查请求 JSON。反馈时优先提供错误码和请求字节数，不要分享密钥或会话正文。 |
| `Jev responded 429 / 529` | 触发限流或服务过载；插件会退避重试两次后放弃。 |
| `host bridge is out of date` | 浏览器加载了新客户端，但宿主仍在运行旧代码。先重启 DSH 宿主进程，再刷新浏览器；仅重试或刷新页面不会重新加载宿主代码。 |
| `returned advice for a different request` | 回显的请求身份或问题内容不一致。对象字段顺序不影响判断，但题目及选项顺序必须一致。重启宿主并刷新后仍失败时，仅提供 `reqIdMatch`、`sessionMatch`、`keyMatch`、`questionsMatch` 四个诊断标志，不要提供密钥或会话正文。 |
| 设置里没有 Jev 分区 | 客户端 bundle 没加载。确认 `node_modules/dsh-jev-advisor/package.json` 里有 `dsh.client`，且 `lib/client.js` 已随包发布。 |
| 启动报 `duplicate loader entry id` | 包被挂了两次——装了两份，或某个聚合包又挂了一次。删掉一份。 |

## 已知限制

- **支持 DSH 0.2.0-rc.2 与 0.2.1-rc.2。** 依赖 Config 表单、`ConfigForm.mutate`、
  `uiSession.adapter.current` 及公开问题卡片快照，不提供旧 `settingsScope` 回退。
  完整宿主测试固定两个运行时，不会悄悄使用 PATH 中的任意 `dsh`。
- 侧栏避让通过手动左右停靠实现，不探测宿主私有 DOM；很宽的宿主面板仍可能重叠，可切换位置或折叠／关闭。
  窄屏溢出已纳入 Chromium 回归，但尚未自动化完整 DSH Desktop 的视觉验收。
- 同时有多个会话挂着待答问题时，卡片优先跟随主会话；仅当主会话没有待答交互时，才回退到第一个带选项的待答交互。
- 计划评审（plan-review）问题会和其它带选项的问题一样获得建议；卡片不会取代批准/拒绝按钮。
- API Key 会传到宿主进程（HTTPS 调用在宿主发起）。它不会回传浏览器，但会以明文保存在 profile 的
  Cordis patch 里——请像对待任何凭证一样保护该文件。
- 回环限制不隔离以同一系统用户身份运行的恶意本地进程，请使用可信的 DSH profile。
  请求绑定用于防止旧响应误用，不是按会话划分的授权机制。
- 每次请求的会话记录上限约 24k 字符，完整请求的字节预算还可能进一步缩减它。用量按评估计，
  不要把共享结果重复累计成多次收费。
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
