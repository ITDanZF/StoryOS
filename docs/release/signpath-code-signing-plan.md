# StoryOS SignPath 代码签名与 1.0.0 发布实施文档

## 1. 文档信息

- 状态：待实施
- 决策：使用 SignPath Foundation 为 StoryOS Windows 发布产物提供免费开源代码签名
- 目标版本：`1.0.0`
- 目标平台：Windows x64
- 当前安装器：Electron Forge + Squirrel.Windows
- 文档日期：2026-09-14

## 2. 目标与非目标

### 2.1 目标

1. 保留当前 Squirrel.Windows 安装包形式。
2. 使发布产物来自可验证的 GitHub Actions 构建。
3. 通过 SignPath 对可执行文件及安装器进行 Authenticode 签名。
4. 建立可重复执行的检查、打包、签名、验证和 GitHub Release 发布链路。
5. 确保 `better-sqlite3` 使用 Electron 42 所需的原生模块 ABI，避免生成能安装但不能访问数据库的产物。

### 2.2 非目标

1. 本阶段不将安装器切换为 MSIX。
2. 本阶段不购买 StoryOS 自有 OV/EV 证书。
3. SignPath 不代替 GitHub Release 托管、版本管理、测试或恶意软件扫描。
4. SignPath Foundation 签名后，Windows 显示的签名主体将是 `SignPath Foundation`，而不是 StoryOS 或个人姓名。

## 3. 当前基线

### 3.1 已具备

- 公开 GitHub 仓库：`https://github.com/ITDanZF/StoryOS`
- `package.json` 版本：`1.0.0`
- README 已说明产品功能、数据保存方式和 AI 模型服务边界
- `package.json` 声明 MIT License
- Windows Squirrel 安装包可生成
- 类型检查、单元测试和前后端 lint 已通过
- 在显式执行 `npm run native:electron` 后，打包成品启动、资源和核心业务闭环测试已通过

### 3.2 待补齐

- [ ] 仓库根目录中的完整 `LICENSE` 文件
- [ ] `PRIVACY.md`
- [ ] `CODE_SIGNING_POLICY.md`
- [ ] `SECURITY.md`
- [ ] GitHub Actions Windows 发布工作流
- [ ] SignPath 申请所需的公开发布记录
- [ ] 稳定的 Electron 原生模块发布脚本
- [ ] 版本、Git 标签、安装包文件名和 Windows 文件元数据一致性检查
- [ ] SHA-256 校验文件
- [ ] GitHub Release 说明和已知问题模板

## 4. SignPath Foundation 准入条件

申请前应满足以下条件：

1. 项目使用 OSI 认可的开源许可证，不包含维护者提供的闭源专有组件。
2. 项目正在维护，有公开的功能文档和下载或发布页面。
3. 项目已经公开发布过与将来签名产物相同形式的软件。
4. 签名产物必须来自项目自身仓库的可验证构建。
5. 维护者的 GitHub 和 SignPath 账户必须启用 MFA。
6. 项目必须定义代码签名角色：
   - Committer / Author
   - Reviewer
   - Release Approver
7. 项目首页、下载页或发布页必须公开 Code signing policy。
8. 需声明以下 SignPath 归属文本：

   > Free code signing provided by SignPath.io, certificate by SignPath Foundation.

9. 每个正式签名请求应经过发布审批。

官方条件：<https://signpath.org/terms.html>

## 5. 实施阶段

### 5.1 阶段 A：仓库合规准备

#### A-1：补充许可证

在仓库根目录新增完整 MIT `LICENSE` 文件，版权归属需由项目维护者确认。

#### A-2：补充隐私政策

`PRIVACY.md` 至少应说明：

- 项目、书籍、章节、会话和运行记录默认保存在本地。
- 用户主动调用 AI 功能时，完成请求所需的内容会发送到用户自行配置的模型服务。
- StoryOS 不提供默认云端模型账户。
- API Key 的保存位置和保护边界。
- 应用日志保存的数据类型及日志是否可能包含用户内容。
- 与 OpenAI、DeepSeek、通义千问等第三方服务的责任边界。
- 用户如何删除本地数据。

#### A-3：增加代码签名政策

`CODE_SIGNING_POLICY.md` 至少包含：

- SignPath 归属文本。
- 项目仓库、下载页和正式发布页。
- Committer、Reviewer 和 Approver 的身份。
- 可签名产物范围。
- 只允许从 GitHub Actions 受信任构建中提交签名请求。
- 正式发布所需的人工审批。
- 证书泄露、错误签名或产物被篡改时的处理流程。

#### A-4：增加安全政策

`SECURITY.md` 应说明：

- 受支持版本。
- 安全漏洞的私密报告方式。
- 不应在公开 Issue 中发布的信息。
- 预期响应和修复流程。

#### A-5：更新 README

README 增加以下入口：

- License
- Privacy
- Security
- Code signing policy
- Releases / Downloads

### 5.2 阶段 B：可重复的 Windows 发布构建

#### B-1：固化原生模块编译顺序

发布命令必须按以下顺序执行：

```text
npm ci
  → 类型检查、测试、lint
  → npm run native:electron
  → electron-forge make
  → 打包资源检查
  → 成品启动检查
  → 成品核心业务闭环检查
```

原因：现有单元测试会调用 `native:node`，将 `better-sqlite3` 重编译为当前 Node.js ABI。打包前必须再次执行 `native:electron`，否则 Electron 42 使用数据库时可能因 ABI 不匹配而退出。

#### B-2：增加发布命令

建议在 `package.json` 中建立单一发布入口，例如：

```json
{
  "scripts": {
    "make:win": "npm run native:electron && electron-forge make --platform=win32 --arch=x64",
    "verify:release:win": "npm run test:packaged:resources && npm run test:packaged:smoke && npm run test:packaged:business"
  }
}
```

实施时应将类型检查、全量测试和前后端 lint 也纳入最终的 `release:win` 脚本。

#### B-3：发布元数据检查

建议增加一个只读验证脚本，检查：

- Git 工作区必须干净。
- 发布必须来自允许的分支或 `v*` 标签。
- `package.json` 版本与 Git 标签一致。
- 安装包文件名包含相同版本。
- Windows 文件元数据中的 ProductName 和 ProductVersion 正确。
- 发布产物包含 `Setup.exe`、`.nupkg` 和 `RELEASES`。

### 5.3 阶段 C：GitHub Actions 受信任构建

#### C-1：触发方式

建议使用两种触发：

- `workflow_dispatch`：人工构建候选版。
- `v*` 标签：构建正式版本。

正式签名只允许从 GitHub-hosted Windows Runner 发起。

#### C-2：工作流阶段

```text
checkout fixed commit
  → setup pinned Node.js version
  → npm ci
  → quality checks
  → rebuild better-sqlite3 for Electron
  → make Squirrel distributables
  → packaged resource/smoke/business tests
  → generate SHA-256 manifest
  → upload unsigned artifact to GitHub Actions
  → submit SignPath signing request
  → wait for approval and signing
  → download signed artifact
  → verify Authenticode signatures
  → publish GitHub draft release
```

#### C-3：GitHub 权限和 Secrets

在 SignPath 批准前，不应在仓库中预置任何真实凭据。批准后将以下值保存为 GitHub Actions Secrets 或变量：

- `SIGNPATH_API_TOKEN`
- SignPath Organization ID
- Project slug
- Signing policy slug
- Artifact configuration slug

`SIGNPATH_API_TOKEN` 必须是 Secret，不得出现在工作流文件、日志或发布产物中。

### 5.4 阶段 D：发布未签名候选版

SignPath Foundation 要求项目已经公开发布过将来要签名的软件形式。建议首先建立：

```text
v1.0.0-rc.1
```

构建候选版时应先将 `package.json` 版本设为 `1.0.0-rc.1`，使 Git 标签、应用元数据和安装包文件名保持一致。SignPath 获批并准备正式发布时，再将版本恢复为 `1.0.0` 并创建 `v1.0.0` 标签。

候选版发布内容：

- `StoryOS-1.0.0-rc.1 Setup.exe`
- 完整 `.nupkg`
- `RELEASES`
- `SHA256SUMS.txt`
- Release Notes
- 已知问题
- 未签名声明
- 重要稿件需要备份的提示

候选版必须使用与正式版一致的打包链路和产物结构。是否接受候选版作为“已发布”依据，最终由 SignPath Foundation 审核决定。

### 5.5 阶段 E：提交 SignPath Foundation 申请

申请入口：<https://signpath.org/apply>

申请材料应包含：

- GitHub 仓库 URL
- 项目首页和功能说明
- OSI 认可的开源许可证
- 候选版 Release URL
- 候选版下载和 SHA-256
- 隐私政策 URL
- Code signing policy URL
- Security policy URL
- Committer、Reviewer 和 Release Approver
- GitHub Actions 构建文件 URL
- 构建、测试和发布流程说明
- 申请签名的原因：验证官方构建来源、降低未签名 Windows 安装器的警告与误报
- 需要签名的产物结构和样本

申请不保证获批。SignPath Foundation 会评估项目的公开历史、维护状态、文档质量、产物安全性和构建可验证性。

### 5.6 阶段 F：SignPath 审批后的技术接入

#### F-1：安装 SignPath GitHub App

使用项目所属 GitHub 账户安装 SignPath GitHub App，仅授权 StoryOS 仓库。

SignPath 会验证：

- 构建是否由 GitHub Actions 实际执行。
- 仓库、分支、提交和工作流来源是否匹配。
- 是否使用 GitHub-hosted Runner。
- 产物是否先作为 GitHub Actions Artifact 上传。

官方 GitHub 集成文档：<https://docs.signpath.io/trusted-build-systems/github>

#### F-2：提交签名请求

工作流将使用：

```yaml
uses: signpath/github-action-submit-signing-request@v2
```

必需参数：

- API token
- Organization ID
- Project slug
- Signing policy slug
- GitHub artifact ID

建议对正式版设置 `wait-for-completion: true`，并将签名后产物下载到独立目录。

#### F-3：Squirrel 产物结构

需要提交给 SignPath 的逻辑产物结构为：

```text
StoryOS release artifact
├── StoryOS-<version> Setup.exe
├── storyos-<version>-full.nupkg
└── RELEASES
```

`.nupkg` 内部还包含：

```text
StoryOS.exe
*.dll
better_sqlite3.node
其他可执行或原生二进制文件
```

不能只签最外层 `Setup.exe`。SignPath Artifact Configuration 需要按正确顺序处理嵌套文件：

1. 解析构建产物。
2. 对可签名的内部 PE 和原生文件签名。
3. 重新封装 `.nupkg`。
4. 处理 Squirrel 发布元数据。
5. 对最终安装器签名。

实际 Artifact Configuration 必须根据 SignPath 审核后创建的项目配置和 StoryOS 样本产物确定，不应在申请前猜测其 slug 或嵌套规则。

### 5.7 阶段 G：签名验证与正式发布

#### G-1：Authenticode 验证

对安装器和解包后的主程序至少执行：

```powershell
Get-AuthenticodeSignature "StoryOS-<version> Setup.exe"
Get-AuthenticodeSignature "StoryOS.exe"
```

两者必须满足：

- `Status` 为 `Valid`。
- 签名主体为 SignPath Foundation 提供的可信主体。
- 签名包含有效时间戳。
- 文件在签名后未被修改。

如果安装包或应用内部任何必须签名的文件未签名，发布必须失败。

#### G-2：成品回归

签名完成后需重新执行：

- 安装器启动与安装验证。
- StoryOS 启动验证。
- 项目、书籍、分卷、章节、正文写入和重启恢复闭环。
- 导入、导出、备份和恢复。
- 卸载验证。
- Windows Defender 扫描。

#### G-3：GitHub Release

正式发布建议先生成 Draft Release，人工检查后再公开。

Release 必须包含：

- 已签名的 `Setup.exe`
- 已签名的 `.nupkg`
- `RELEASES`
- 重新计算的 `SHA256SUMS.txt`
- Release Notes
- 数据备份提示
- Code signing policy 链接
- Privacy policy 链接

SHA-256 必须在签名完成后计算，不能沿用未签名产物的哈希。

## 6. 人工操作边界

以下步骤必须由 StoryOS GitHub 账户所有者或获授权维护者完成：

1. 确认 MIT License 中的版权年份和版权人。
2. 确认隐私政策中的联系方式。
3. 开启 GitHub MFA。
4. 确定 Committer、Reviewer 和 Release Approver。
5. 创建候选版或批准发布候选版。
6. 通过 SignPath Foundation 页面提交申请。
7. 安装 SignPath GitHub App 并授权 StoryOS 仓库。
8. 在 GitHub 中保存 SignPath API Token。
9. 审批正式签名请求。
10. 将 GitHub Draft Release 转为正式发布。

其余仓库文件、构建脚本、测试和 GitHub Actions 工作流可以在本地提前实施。

## 7. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| SignPath 申请未通过 | 无法获得免费可信签名 | 保留 Microsoft Store MSIX 和自购 OV 证书两个备选方案 |
| 候选版不被认为有效发布 | 申请资料不足 | 询问 SignPath 审核方，必要时保留公开测试版一段时间后再申请 |
| GitHub Actions 构建与本地不一致 | 产物不可复现或无法签名 | 使用 `npm ci`、锁定 Node.js 版本、禁止本地构建直接成为正式产物 |
| `better-sqlite3` ABI 不匹配 | 应用进入数据库流程时退出 | 测试后、打包前强制 `native:electron`，并保留打包后业务闭环测试 |
| 只签了外层安装器 | 内部 PE 无法验证来源 | 使用 SignPath Artifact Configuration 处理 Squirrel 嵌套产物 |
| 签名后再修改文件 | Authenticode 失效 | 签名后仅允许读取、验证、计算哈希和上传 |
| 新签名仍触发 SmartScreen | 早期用户可能看到“不常下载” | 持续使用相同签名主体，保持发布清洁，逐步积累证书和文件信誉 |

## 8. 验收清单

### 8.1 申请前

- [ ] 仓库中有完整 MIT `LICENSE`
- [ ] 隐私政策与 StoryOS 实际数据流一致
- [ ] Code signing policy 包含 SignPath 归属文本和人员角色
- [ ] Security policy 提供私密漏洞报告途径
- [ ] GitHub MFA 已开启
- [ ] GitHub Actions 可从干净 checkout 成功生成安装包
- [ ] 全部质量检查和成品业务闭环通过
- [ ] 候选版可公开下载
- [ ] 候选版 SHA-256 已公布

### 8.2 接入后

- [ ] GitHub App 仅授权需要的仓库
- [ ] API Token 只存在 GitHub Secrets
- [ ] 正式签名策略限制到发布标签或允许的分支
- [ ] 签名请求需要人工批准
- [ ] `Setup.exe` 签名状态为 `Valid`
- [ ] `StoryOS.exe` 签名状态为 `Valid`
- [ ] 必须签名的内部 PE/原生文件均已按 Artifact Configuration 处理
- [ ] 签名后成品回归通过
- [ ] SHA-256 在签名后重新生成
- [ ] GitHub Draft Release 人工审核通过后才公开

## 9. 官方参考

- SignPath Foundation：<https://signpath.org/>
- 免费开源签名申请：<https://signpath.org/apply>
- SignPath Foundation 条件：<https://signpath.org/terms.html>
- SignPath GitHub 受信任构建集成：<https://docs.signpath.io/trusted-build-systems/github>
- SignPath 签名流程：<https://docs.signpath.io/signing-code>
- Microsoft Windows 代码签名方案：<https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options>
- Microsoft SmartScreen 信誉说明：<https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation>
- Electron Forge Windows 签名：<https://www.electronforge.io/guides/code-signing/code-signing-windows>

## 10. 下一步

按以下顺序实施：

1. 确认 MIT License 版权人、隐私联系方式和 SignPath 三类人员角。
2. 补齐 License、Privacy、Security 和 Code signing policy。
3. 修复并固化 Windows 发布脚本。
4. 建立 GitHub Actions 未签名发布构建。
5. 生成并公开 `v1.0.0-rc.1`。
6. 提交 SignPath Foundation 申请。
7. 获批后完成 Artifact Configuration 和 GitHub Action 签名接入。
8. 验证签名成品并发布 `v1.0.0`。
