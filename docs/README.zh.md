# dsh-jev-advisor

[English](../README.md) | 中文

**给你一份 Jev 第二意见，而不是给 agent 增加一个工具。**

`dsh-jev-advisor` 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 添加浮动建议卡片，
辅助你回答选择题、批准或拒绝工具执行，以及审查计划。建议由 [TypeSafe Jev](https://docs.typesafe.ai) 提供；
只有你点击**采纳**，才会向 DSH 提交决定。

![问题旁的建议卡片](https://raw.githubusercontent.com/gordan-code/dsh-jev-advisor/main/docs/demo.gif)

## 快速开始

```bash
dsh plugin --profile <your-profile> add github:gordan-code/dsh-jev-advisor
```

1. 打开**设置 → Jev**，填入 TypeSafe API Key 并保存。
2. 出现受支持的待答交互时，点击**询问 Jev**。
3. 查看建议后采纳，或继续使用 DSH 原有控件作答。

**默认按需询问**，升级时未明确开启自动模式的用户也适用。
如需自动请求，打开**设置 → Jev → 自动获取 Jev 建议**并保存。
同时开启**发送前要求确认**时，两种模式都先显示本地预览，只有点击**确认发送**才调用 Jev。

## 功能

| 交互类型 | 建议与操作 |
| --- | --- |
| 单选题 | 展示推荐、选项概率、置信度和分歧提示；可复制建议或一键采纳。 |
| 多选题 | 逐项评估，概率 ≥ `0.5` 的选项组成推荐集合。 |
| 工具审批 | 建议**允许本次执行**或**拒绝执行**，并展示风险评分：`0` 低、`1` 中、`2` 高。采纳只作用于本次调用。 |
| 计划审查 | 评估已有选项，展示计划完整度：`0` 需要修改、`1` 基本可行但有缺口、`2` 完备可行。仅含一道计划审查题时，若 Jev 选择“以上都不是”且 DSH 提供相应操作，可采纳为**要求修改计划**。 |

- **多视角取舍对比（可选）**：在同一次 Jev 请求中，附加 1–5 个视角进行比较。
  默认依据交互类型和题目关键词匹配，例如工具审批侧重安全与任务推进，计划审查侧重完备、少改和速度。
  可在卡片上增删或输入自定义视角，也可在设置中保存默认视角。视角对比适用于单选题，不扩展多选题的逐项评估。
- **临时决策偏好**：为当前交互填写“优先稳定”等要求。首次询问前保存不会调用 Jev；
  已开始评估后应用修改，会重新评估，确认模式下则重新生成本地预览。
- **限时提问保持**：宿主支持时，发起评估会请求暂停倒计时，聚焦卡片会保持问题；
  宿主报告倒计时运行中时，还可点击**暂停倒计时**。这是尽力保护，不保证问题一定不会过期。
- **查看与布局**：展开请求／响应 JSON，左右停靠、折叠或关闭卡片。停靠和折叠状态按 DSH profile 保存。
- **本地诊断**：查看版本与生效设置，复制脱敏诊断，不调用 Jev。

卡片不替换 DSH 原有交互界面，不修改 agent 提示词，也不强制执行权限策略。
概率和评分只是模型判断，不是安全保证；最终决定由你作出。

## 安装、更新与卸载

**只选择一种安装来源。** 重复挂载同一个包可能导致 loader entry 和路由冲突。

### 从 GitHub 安装

```bash
dsh plugin --profile <your-profile> add github:gordan-code/dsh-jev-advisor
```

仓库已包含构建产物 `lib/`，安装时无需本地构建。

### 从 npm 安装

```bash
dsh plugin --profile <your-profile> add dsh-jev-advisor
# 固定已发布版本：
dsh plugin --profile <your-profile> add dsh-jev-advisor@<published-version>
```

npm 安装的是已发布版本，可能与当前源码不同；仅凭包版本号不能确定 Git 修订。

### 从本地源码安装

```bash
node scripts/build.mjs
dsh plugin --profile <your-profile> add /absolute/path/to/dsh-jev-advisor
```

修改 `src/` 后需重新构建，本地链接不会自动构建。

### 更新或卸载

```bash
dsh plugin --profile <your-profile> remove dsh-jev-advisor
# 更新时，从选定来源重新安装：
dsh plugin --profile <your-profile> add github:gordan-code/dsh-jev-advisor
```

按 DSH 提示重新加载或重启，再刷新客户端。如果提示宿主桥接过期，需要**重启宿主并刷新页面**。
本地重建后建议强制刷新（`Ctrl+Shift+R`），避免浏览器继续使用 immutable 缓存中的旧包。

## 设置

入口：**设置 → Jev**。修改后需保存；API Key 输入框留空会保留已存密钥。

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| API Key | 空 | 来自 <https://console.typesafe.ai/keys>。以明文保存在 profile 的 Cordis patch 中，设置读取不会回传密钥。 |
| 接口地址 | `https://api.typesafe.ai/v1/systemone` | 评估端点。 |
| 模型 | `jev-latest` | Jev 模型或别名。 |
| 启用 Jev 建议 | 开 | 总开关。 |
| 自动获取 Jev 建议 | **关** | `autoAdvise=false`。开启后为受支持的交互自动发起建议流程，仍遵守确认设置；实际发送可能产生 API 用量。 |
| 把最近的对话作为 state 一起发送 | 开 | 附带会话记录尾部作为上下文。 |
| 发送前要求确认 | 关 | 先在本地预览待发送请求。 |
| 发送前遮盖常见凭证 | 开 | 尽力替换发送文本中的常见凭证模式。 |
| 默认开启单次请求「多视角取舍对比」 | 关 | 默认启用视角对比；卡片可单独调整当前交互。 |
| 默认对比视角 | 空 | 填写 1–5 个名称，以逗号分隔；留空按问题匹配。仅填写名称不会自动开启对比。 |
| 上下文消息条数 | `12` | 发送最近多少条会话消息。 |
| 超时（毫秒） | `30000` | 整次评估超时，包含响应读取与重试退避。 |

卡片上的视角修改和临时偏好只用于当前交互；设置页的默认值会持久保存。
仅编辑视角名称不会发送请求，需要按卡片提示保存或应用。

**测试连接**使用已保存的配置发送一次小型 Jev 评估，可能产生 API 用量。

**本地健康检查**不调用 Jev。展示插件与已安装 DSH 的版本、兼容声明、是否配置 Key，以及获取模式／隐私开关。
缺失信息显示**未知**；匹配声明不代表所有功能均已验证。
**复制脱敏诊断**只含白名单信息，不含密钥、端点、用户路径、题目文本或完整配置。

## 隐私、费用与采纳保护

- 宿主会向配置的端点发送题目、选项、可选会话上下文，以及显式偏好或已启用的对比视角。
  工具审批还会附带审批元数据，以及从会话中找到的工具参数。
  **关闭会话上下文不等于移除这些决策输入。**
- 凭证遮盖识别常见 token/password 赋值、Bearer token、`sk-…` 密钥、私钥块和 URL 凭证，
  **不能发现所有秘密或个人信息**。敏感内容请发送前预览。请求／响应 JSON 可能包含会话内容，
  不要把它当作脱敏诊断分享。
- 确认使用精确的本地请求快照，有效期两分钟；请求身份或评估设置变化后失效。准备预览本身不调用 Jev。
- 完整评估 JSON 上限为 **64 KiB UTF-8**。优先缩减上下文；决策输入本身超限时本地拒绝，不静默截断。
- 一次 HTTP 请求可包含多项评估。视角对比可能增加 API 用量，**一次请求不等于一道固定费用的题目**。
  卡片仅在 Jev 返回用量时展示实际 token 数据。
- 同一宿主中的相同并发评估共用上游调用。取消不能撤销已处理的工作，也不保证免单或退款。
  重开已完成结果会复用；按需模式重开已取消请求后，仍需点击**询问 Jev**。
- 答案绑定当前会话、交互与请求；异常、不完整或过期结果不能采纳，双击不会重复提交同一交互。
- 普通单选题选择“以上都不是”时需手动作答，前述计划审查的**要求修改计划**为例外。
  多题批次需每题都有有效答案才能整体采纳，不会替未回答问题补空答案。
- 宿主的四条路由（`status`、`test`、`prepare`、`advise`）要求回环连接与浏览器同源请求。
  这些检查不能隔离同一系统用户下的恶意进程；请使用可信 profile，并保护明文密钥文件。

## 兼容性与限制

- `engines.dsh` 声明支持 **0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，不默认兼容未来版本。
  各项功能还依赖宿主提供的公开交互 API。
- 优先跟随主会话的待答交互；主会话没有待答交互时，才回退到其他受支持交互。历史或已关闭交互不参与评估。
- 不支持纯自由文本题；包含不支持题目的混合批次，不能整体采纳。
- 卡片使用 `shell.overlay` 和 `settings.section`。避让侧栏需手动切换停靠位置或折叠。
- 上下文最多约 24,000 字符，还可能因字节预算继续缩减；仅对 `429`、`529` 响应最多重试两次。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 卡片不出现 | 确认存在受支持的待答交互、建议已启用，且客户端包与宿主路由已加载。 |
| 没有发起请求 | 按需模式需点击“询问 Jev”，确认模式还需点击“确认发送”。 |
| 未配置 Key／`401` | 在设置 → Jev 保存有效的 TypeSafe Key。 |
| `422` | 检查本地请求；报告错误码与字节数，不要分享密钥或会话正文。 |
| `429`／`529` | 限流或服务繁忙；两次自动重试结束后，可稍后手动重试。 |
| 宿主桥接过期／仍显示旧界面 | 重启宿主并强制刷新页面，核对已安装来源与版本。 |
| 返回其他请求的建议 | 重启并刷新；仍复现时仅提供比较标志，不提供请求内容。 |
| duplicate loader entry | 移除重复安装或重复 bundle 条目。 |

## 开发

```bash
npm ci
npm run build
npm test
npm run check:pack
npx playwright install chromium
npm run test:browser
npm run test:host
npm run test:install
npm run quality
npm pack --dry-run
```

`lib/` 随仓库提交。`npm test` 检查它与 `src/` 一致；
`check:pack` 检查发布入口、客户端包和 `cordis.patch.yml`。

宿主／安装测试需要固定版本的真实 DSH CLI。PowerShell 示例：

```powershell
$env:DSH_TEST_CLI = "<cli-directory>/node_modules/@deepseek-ai/dsh/lib/bin.js"
npm run quality
```

`quality` 依次执行构建、基础测试、Chromium、打包检查、隔离宿主和 tarball 安装测试。
缺少前置条件会失败，不会跳过。测试使用 mock 和临时 profile，不使用真实 Jev Key 或用户 profile。
Chromium fixture 不等同于完整 Desktop UI 测试。CI 还覆盖 Node 20/22/24 和固定的三个 DSH 运行时质量矩阵。

宿主通过 `ctx.sessions` 和回环 JSON 路由工作；浏览器使用公开 Cordis 服务
（`ctx.slots`、`ctx.locale`、`ctx.configForms`、`ctx.uiSession`），不导入其他插件私有实现。

## 许可

MIT。Jev 是 TypeSafe AI 的产品。本项目与 TypeSafe AI、DeepSeek 无隶属或背书关系。
