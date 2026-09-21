# Changelog

本文件记录面向用户和贡献者的可见变化。版本号与 `package.json` 对齐。尚未打 Git 标签的变更列在 Unreleased。

## [Unreleased]

当前 `main` 与 GitHub 仓库同步，尚无独立 GitHub Release 安装包。

### Added

- 按实例隔离配置、数据和 embedding 设置；首次启动需新建实例
- 章节生成改为页级预览，普通对话在完成后一次呈现完整回复
- 书籍工作区章节切换预取与生成任务独立状态
- 仓库开源合规文件：许可证、隐私、安全、贡献指南与代码签名政策

### Changed

- 书籍工具搜索与统计改为读取章节纯文本和摘要，不再逐章解析文档 JSON

### Removed

- 已落地设计稿从 `docs/todo/` 清理，未完成项见 `docs/todo/open-items.md`

## [1.0.0] - 2026-09-16

`package.json` 版本号。此前 `main` 包含本地书架、分页编辑器、阅读器、导入导出和 Agent 对话的开发基线。
