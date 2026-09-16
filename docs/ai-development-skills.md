# StoryOS AI 开发技能

本仓库将可复用的 AI 开发工作流集中在 `.agents/skills/`。这些文件遵循 Agent Skills 的 `SKILL.md` 结构，和 StoryOS 应用自身 `skills/` 目录中的运行时 Skill 是两套独立机制。

## 继承来源与取舍

本次审查了当前 Codex 环境中的开发相关技能：

| 系统技能 | 项目落地 | 处理方式 |
| --- | --- | --- |
| `coding` | `storyos-code-change` | 保留分级分析、严格契约、聚焦修改和定向验证；移除强制生成临时报告、打开 VS Code、所有简单改动都等待确认等个人工作流。 |
| `feature-development` + `modular-feature-development` | `storyos-feature-development` | 合并重复入口，加入 StoryOS 的 agent/story/shared/renderer 边界。 |
| `frontend-prototype-rebuild` | `storyos-frontend-rebuild` | 加入 StoryOS theme、motion、renderer 目录约定和视觉验证。 |
| `gitee-issue-frontend-analysis` | `storyos-issue-analysis` | 从 Gitee 前端单一场景泛化到 GitHub、Gitee 或完整 bug 描述，并覆盖桌面、业务、引擎和存储边界。 |
| `review-agent` | `storyos-code-review` | 保留只读、defect-first、按优先级输出的审查契约，加入 StoryOS 高风险边界。 |
| `pre-change-collaboration-check` | 合入 `storyos-code-change` | 保留工作区重叠保护和必要时的历史检查，不把历史作者误当实时所有者。 |
| `skill-creator` | `storyos-skill-authoring` | 增加开发工具 Agent Skills 与 StoryOS 运行时 Skill 的分流规则。 |

没有直接继承 `plugin-creator`、`skill-installer`、OpenAI 产品文档或图片生成等系统能力，因为它们不是 StoryOS 日常开发约定，且通常由对应宿主提供。它们需要时仍可由支持的工具单独调用。

## 跨工具加载

| 工具 | 加载方式 |
| --- | --- |
| Codex | 原生扫描仓库 `.agents/skills/`，根 `AGENTS.md` 提供长期项目约定。 |
| Cursor | 原生扫描 `.agents/skills/`，同时可读取根 `AGENTS.md`。 |
| Claude Code | 根 `CLAUDE.md` 导入 `AGENTS.md`；匹配任务时按目录中的 Skill 清单读取 `.agents/skills/.../SKILL.md`。 |
| 其他工具 | 支持 Agent Skills 或 `AGENTS.md` 时可直接使用；否则将根说明和目标 `SKILL.md` 作为项目上下文加载。 |

没有复制一套 `.claude/skills/`：Cursor 会同时扫描 `.agents/skills/` 与 `.claude/skills/`，重复副本会带来同名发现和长期漂移；Windows 下提交符号链接也会增加克隆环境要求。

## 目录

```text
AGENTS.md
CLAUDE.md
.agents/
  skills/
    storyos-code-change/
    storyos-feature-development/
    storyos-frontend-rebuild/
    storyos-issue-analysis/
    storyos-code-review/
    storyos-skill-authoring/
skills/
  create-skill/           # StoryOS 应用运行时 Skill，不属于开发工具配置
```

新增开发工作流时使用 `storyos-skill-authoring`，并更新根 `AGENTS.md` 的 Skill 清单。只有确有实时外部数据、认证或受控操作需求时，才为工作流增加 MCP 或插件依赖。
