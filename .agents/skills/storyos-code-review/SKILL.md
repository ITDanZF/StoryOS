---
name: storyos-code-review
description: Perform a read-only, defect-first review of StoryOS uncommitted changes, a commit, or a branch diff and report every concrete actionable regression with severity and precise locations. Use when the user asks for code review rather than implementation.
---

# StoryOS Code Review

直接检查指定变更，优先找作者知道后会修复的具体缺陷。保持只读：不改文件、不提交、不推送、不发布评论。

## 审查

1. 阅读适用的 `AGENTS.md`，确认用户指定的 target。检查完整 diff 和理解各变更所需的上下文、调用点、契约与测试。
2. 分支审查应比较实际会合并的内容：解析 comparison ref，使用 `git merge-base HEAD <ref>` 后审查从 merge-base 到 HEAD 的 diff。
3. 继续审完整个 diff，不在发现第一项后停止。用现有测试、调用链或运行证据确认问题真实存在。
4. 只报告同时满足以下条件的问题：由本次变更新增；影响正确性、安全、性能或有意义的可维护性；场景可从代码证明；离散且可操作；作者大概率会修复。
5. 不报告纯风格偏好、无证据猜测、既有问题、明确的预期行为变化，或不影响理解的细枝末节。

重点检查 StoryOS 的架构边界、IPC/窗口归属、工具授权、文件路径保护、SQLite 事务与恢复、共享契约、Node/Electron ABI、renderer 状态一致性和 reduced-motion 行为，但只在 diff 实际触及时评估。

## 输出

先列 findings，按严重度排序，每项格式：

`[P1] 命令式标题 — path/to/file.ts:line`

随后用一小段说明触发场景、错误结果及为何由该变更引入。行范围尽量小并与 diff 重叠。

- `P0`：普遍发生的发布阻断或关键故障。
- `P1`：应优先修复的紧急缺陷。
- `P2`：应修复的普通缺陷。
- `P3`：影响较低但仍值得修复。

没有符合条件的问题时明确写“未发现问题”，不要为了填充结果制造 finding。最后给出简短整体评估、实际检查内容、测试缺口和残余风险。
