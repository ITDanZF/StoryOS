---
name: storyos-skill-authoring
description: Create, migrate, or update StoryOS project skills while keeping developer Agent Skills separate from the application's runtime Skill format. Use when adding reusable AI workflows, editing SKILL.md files, or deciding which skill system a workflow belongs to.
---

# StoryOS Skill Authoring

StoryOS 有两套用途不同的 Skill。开始前先确认目标宿主，禁止混用 schema。

## 选择目标

- 开发工具工作流：放在 `.agents/skills/<skill-name>/SKILL.md`，遵循 Agent Skills 开放格式，由 Codex、Cursor 等开发代理读取。
- StoryOS 应用运行时能力：放在 `skills/` 及其安装位置，遵循现有 `skills/create-skill/SKILL.md`、`src/main/agent/skills/` 类型和加载器实现。

用户说“让 Codex/Claude/Cursor 开发本项目时使用”通常指第一类；用户说“让 StoryOS 内的 Agent 获得能力”通常指第二类。仍不清楚且选择会改变格式或运行时行为时再提问。

## 编写开发工具 Skill

1. 一个 Skill 聚焦一个可识别任务。目录名和 `name` 使用小写字母、数字、短横线，并保持一致。
2. frontmatter 默认只使用跨工具字段：

   ```yaml
   ---
   name: example-skill
   description: What the skill does and when it should be used.
   ---
   ```

3. `description` 前置主要触发场景并明确边界；正文写输入、关键决策、工作流、输出和真实约束。
4. 详细 schema、模板或模式放 `references/`，确定性重复处理放 `scripts/`，生成输出所需资源放 `assets/`。只有有明确用途时才创建。
5. 不使用 Claude 动态 shell 注入、Codex UI 元数据、Cursor 专属 paths 等宿主扩展，除非用户明确接受该 Skill 不再完全可移植。
6. 显式用户要求优先于 Skill 指南。Skill 不扩张授权，不要求普通安全改动重复确认，也不绕过权限边界。
7. 新增或重命名项目开发 Skill 后，同步更新根 `AGENTS.md` 的 Skill 目录；不要在 `.claude/skills/` 复制同名正文。

## 编写 StoryOS 运行时 Skill

先完整阅读 `skills/create-skill/SKILL.md` 以及加载、manifest、工具授权和 Agent 编译相关实现。保留该运行时要求的 `id`、`version`、`triggers`、`tools`、`agent` 和 `metadata` 语义，不用 Agent Skills 的最小 frontmatter 覆盖它。

## 校验

- 检查目录名、frontmatter、描述触发边界和相对链接。
- 用一个应触发、一个不应触发、一个缺少关键输入的真实请求做人工检查。
- 有脚本时实际运行；修改运行时格式时执行最相关的 Agent 测试和边界检查。
- 确认 `AGENTS.md`、`CLAUDE.md` 和 Skill 正文没有形成循环导入或矛盾规则。
