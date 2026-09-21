# 参与 StoryOS

感谢你愿意一起改进这个本地写作工作台。代码、缺陷报告和产品建议都欢迎。

## 开始之前

- 阅读 [README](README.md) 了解产品边界和开发命令。
- 仓库级约定见 [AGENTS.md](AGENTS.md)；只改 `src/renderer/` 时同时看 [src/renderer/AGENTS.md](src/renderer/AGENTS.md)。
- `src/main/agent/` 是通用 Agent 引擎，不要把书籍、章节、项目或桌面 IPC 放进去。
- `skills/` 是应用运行时 Skill；`.agents/skills/` 是开发用 Agent Skills。不要混用两套格式。

## 开发环境

- Windows 10/11
- Node.js 与 npm
- 可选：OpenAI 兼容模型服务（只在验证 AI 功能时需要）

```bash
git clone https://github.com/ITDanZF/StoryOS.git
cd StoryOS
npm install
npm start
```

`npm start` 会为 Electron 重建 `better-sqlite3`。单元测试走 Node ABI，桌面运行走 Electron ABI，不要手工覆盖原生产物。

## 建议流程

1. Fork 仓库，从最新 `main` 拉出功能分支。
2. 只改完成该请求所需的范围；不要顺手重构相邻模块。
3. 提交说明使用简体中文，写清**为什么**改，而不是文件清单。
4. 推送前运行与改动匹配的最窄检查：

| 改动范围 | 命令 |
| --- | --- |
| Agent 引擎 | `npm run check:agent`，必要时 `npm run test:agent` |
| 主进程 / preload / shared | `npm run check:backend` |
| 渲染进程 | `npm run lint:frontend`，以及相关测试或 `npm run typecheck` |
| 跨层或不确定 | `npm run check` |

5. 打开 Pull Request，说明动机、实现和验证结果。请使用仓库提供的 PR 模板。

## 问题反馈

- 缺陷与需求：[Issues](https://github.com/ITDanZF/StoryOS/issues)
- 安全漏洞：见 [SECURITY.md](SECURITY.md)，不要发到公开 Issue

## 行为准则

参与本仓库即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
