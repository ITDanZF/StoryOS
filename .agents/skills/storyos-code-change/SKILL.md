---
name: storyos-code-change
description: Implement, modify, debug, refactor, or test StoryOS code with project-aware scoping, strict contracts, preservation of existing work, and targeted verification. Use for ordinary code changes that are not solely read-only review or issue diagnosis.
---

# StoryOS Code Change

完成用户要求的代码变更，同时保持现有架构、数据契约和未提交工作完整。

## 开始前

1. 阅读根 `AGENTS.md`、目标目录下更具体的说明，以及最接近的实现和测试。
2. 运行 `git status --short`。若计划修改的现有文件已有变更，先查看相关 diff，区分用户改动与本次工作。
3. 确定最小可信修改面：直接文件、紧耦合契约、调用点和必要测试。只有当范围后来扩展时才补充检查。
4. 简单、局部、低风险任务直接实现。只有缺失信息会显著改变结果、数据契约或权限边界时才向用户提问。

## 实现

- 以附近同类代码为主要先例，复用现有类型、schema、存储、IPC、状态、组件和错误处理路径。
- 严格使用用户、共享契约、schema 或真实 payload 已确认的字段。不要增加未经要求的备用字段、默认值、重试、静默兼容、宽松 coercion 或吞错。
- 必填值缺失或格式错误时，让现有验证或错误状态暴露契约问题；可选 UI 文案、空列表展示等真实可选项才可使用明确默认值。
- 修改字段映射时替换相关错误来源，不把正确来源塞进旧 fallback 链。
- 保持变更聚焦。不要顺手清理无关代码、改策略或扩展测试范围。
- 新抽象必须对应清晰职责、第二个真实用例或现有项目惯例；否则保持局部。

## 协作保护

- 未提交变更与本次修改重叠时，逐块编辑并在完成后检查 diff，确保没有覆盖原工作。
- 共享仓库中涉及敏感或长期维护区域时，可用 `git log -- <path>` 和 `git blame -L <start>,<end> <path>` 了解相关历史。历史作者不是所有者，也不能证明谁正在实时编辑。
- 若无法在不覆盖现有改动的情况下继续，说明具体冲突并请求用户决定；历史重叠本身不阻止已授权修改。

## 验证与交付

1. 先运行最窄且能证明行为的检查：相关 Vitest、目标 lint/typecheck、现有验证脚本或 UI smoke/截图。
2. 只有跨层、构建配置、共享契约、打包或窄检查不足时才扩大到全量命令。
3. 检查最终 diff，确认没有未授权 fallback、调试残留、生成物或相邻改动。
4. 最终说明完成内容、关键文件、运行的验证和剩余风险。
