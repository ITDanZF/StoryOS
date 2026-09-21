# 代码签名政策

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

本政策适用于 StoryOS 的 Windows 正式发布产物。仓库、下载与发布页：

- 仓库：<https://github.com/ITDanZF/StoryOS>
- 正式发布 / 下载：<https://github.com/ITDanZF/StoryOS/releases>

## 当前状态

截至本文件写入时，仓库尚未接通 GitHub Actions 发布工作流，也尚未发出带 SignPath 证书的安装包。公开 Releases 若存在，应视为未签名或仅供验证的构建，不以本政策中的签名主体为准。

启用 SignPath 之后，所有**正式签名请求**必须遵守下文规则。实施细节见 `docs/release/signpath-code-signing-plan.md`。

## 角色

当前为单维护者项目，下列角色均由 GitHub 用户 [ITDanZF](https://github.com/ITDanZF)（`package.json` 作者 jinyuhe）承担。增加协作者后应先更新本文件再扩大权限。

| 角色 | 职责 |
| --- | --- |
| Committer / Author | 编写发布提交、准备版本标签与构建说明 |
| Reviewer | 检查发布 diff、测试结果和产物清单 |
| Release Approver | 批准向 SignPath 提交签名请求，并批准 GitHub Release |

同一人兼任时，仍须完成「构建完成 → 审查记录 → 显式批准」三步，不得把本地手工文件直接送去签名。

## 可签名产物

仅签名由本仓库可验证构建生成的 Windows x64 产物，包括：

- Squirrel.Windows 安装包
- 安装包内的 StoryOS 可执行文件

不签名：开发机手工拷贝、改过的第三方安装器、来源不明的补丁、以及非本仓库工作流产出的文件。

## 构建与审批

1. 签名请求只能来自本仓库 GitHub Actions 中受信任的发布工作流，使用该次运行的产物。
2. 工作流必须在签名前完成类型检查、测试、`native:electron` 重建 `better-sqlite3`，以及打包资源与成品检查。
3. 每个正式签名请求都需要 Release Approver 的人工批准。
4. 签名完成后，GitHub Release 应附 SHA-256 校验和，并注明 SignPath 归属文本。

## 事故处理

| 情况 | 处理 |
| --- | --- |
| 证书或 SignPath 账户疑似泄露 | 立即停止新的签名请求，通知 SignPath，轮换相关凭据，并在仓库和 Release 页公告 |
| 错误版本被签名 | 撤回或标记对应 GitHub Release，说明不要安装该文件，重新走完整构建与审批 |
| 已发布产物被篡改或校验和不匹配 | 公告停止使用该文件，保留原始校验和记录，仅从本仓库 Releases 重新提供经审批的构建 |

用户应以 GitHub Releases 上的校验和核对待安装文件。Windows 上正式签名显示的主体将是 `SignPath Foundation`，而不是 StoryOS 或个人姓名。
