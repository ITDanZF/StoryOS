---
name: storyos-issue-analysis
description: Diagnose one GitHub, Gitee, or supplied bug report against the StoryOS repository and produce an evidence-based Chinese report covering system responsibility, likely cause, change scope, risks, and verification. Use for read-only analysis, not for implementing the fix unless separately requested.
---

# StoryOS 单问题分析

以用户提供的一条 issue、bug 链接或完整问题描述为来源，结合当前仓库做只读诊断。默认不编辑代码、不评论或流转外部 issue。

## 取证

1. 读取标题、编号、状态、环境、前置条件、复现步骤、实际/预期结果、附件、评论澄清、关联提交和更新时间。需要登录但当前无法访问时，明确缺失证据及影响。
2. 检查适用的 `AGENTS.md` 和工作区状态。用可见文案、路由、接口、字段、组件、错误或堆栈作为搜索入口，追踪到数据源、IPC/API、状态、渲染、权限、验证和测试。
3. 需要复现时只做安全、只读或临时检查，记录命令和观察结果。不要为生成报告而改代码。
4. 证据不足时继续给出有限分析，但把结论标为“暂无法判定”或明确的假设，不根据标题补全事实。

## 判定

在前端、主进程/IPC、StoryOS 业务、通用 Agent 引擎、存储/数据、模型或第三方服务、配置/环境、产品需求、设计交互、共同责任、暂无法判定中选择主边界和协同边界。

- 用“问题要求或契约”与“代码/运行实际行为”的差异支持结论。
- 区分根因、触发条件和放大因素，不按人员归责。
- 给出高/中/低置信度，并列出会改变判断的缺失证据。
- 需求与契约冲突时标记为协同问题，不武断指定单方。

## 输出

使用中文，按以下结构给出可复查证据：

1. 问题摘要与证据完整度。
2. 复现链路或静态调用链。
3. 根因判断、责任边界、置信度与反证条件。
4. 最小闭环方案，分为“必须修改 / 建议优化 / 无需修改”。
5. 直接文件、受影响调用链、契约、状态、配置、测试和文档范围。
6. 回归、兼容、数据、时序、权限、安全、性能与回滚风险；不相关项不机械凑数。
7. 建议验证步骤。

将外部链接和本地文件/行号放在对应结论附近。不要伪造补丁；用户随后明确要求修复时，再使用开发类 Skill 实施。
