# 安全政策

## 受支持版本

StoryOS 仍在早期开发。安全修复默认只针对 GitHub 仓库 `main` 的当前提交，以及（如已发布）最新的正式 GitHub Release。

不再维护旧安装包的长期补丁分支。发现问题后，请更新到包含修复的最新源码或发布包。

## 如何报告漏洞

请**不要**在公开 Issue、讨论区或 Pull Request 中描述可利用的安全问题。

优先使用 GitHub 私密咨询：

<https://github.com/ITDanZF/StoryOS/security/advisories/new>

若无法使用该入口，可发送至维护者邮箱 `1144565385@qq.com`，标题请包含 `StoryOS security`。

报告请尽量包含：

- 受影响的提交、版本或安装包
- 复现步骤与实际影响
- 是否涉及本地文件读取、密钥泄露、未授权工具执行或安装包完整性

## 请勿公开贴出的内容

- API Key、会话 Cookie、本机绝对路径中的私人目录
- 未公开的稿件、对话记录或数据库导出
- 可直接利用的攻击细节（在维护者确认前）

功能缺陷、崩溃和产品建议请继续使用 [Issues](https://github.com/ITDanZF/StoryOS/issues)。

## 响应

维护者为个人项目，无法承诺 SLA。目标是：

1. 确认收到报告
2. 评估影响范围并准备修复
3. 在 `main` 发布修复后，通过 Security Advisory 或 Release 说明公开摘要

请给维护者留出私下修复的时间，不要在修复前公开完整利用方式。
