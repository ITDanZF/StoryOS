# StoryOS 文档导航

本文档只列仍应优先阅读的入口。代码契约与当前界面始终优先于早期方案中的字段和截图。

## 事件图与长篇写作

1. [后端双向联动详细设计](./architecture/event-graph-backend-integration-design.md)：正文反向补图、AI 局部规划、跨章映射与图上正文生成。新功能以此文为准。
2. [模块实施设计与顺序](./architecture/event-graph-modules/README.md)：分模块列出契约、存储、交接、Agent、补图、生成、前端接入和验收清单。
3. [产品与交互设计](./architecture/event-graph-long-novel-design.md)：首版主线、章节映射及书籍工作区交接；其中单节点单章和只在工作区启动正文生成的结论已被上文更新。
4. [节点与关系设计](./architecture/event-graph-theory-and-node-design.md)：单画布、阶段、叶子粒度、Markdown 文档及叙事理论依据。
5. [第一版执行与验收](./architecture/event-graph-v1-implementation.md)：首版实施记录与验收背景；不作为本次新契约的执行清单。

现行数据字段见 [`outlineContracts.ts`](../src/shared/contracts/outline/outlineContracts.ts)。[叙事事件模型](./architecture/narrative-event-model.md)和[后端架构](./architecture/narrative-event-backend.md)保留为研究与技术背景；它们不替代当前交互设计。

## 其他入口

- [未完成事项](./todo/open-items.md)
- [数据库与向量检索](./architecture/database-vnext/README.md)
- [前端动效约定](./frontend-motion.md)
- [论文原文与译稿](./pdf/)

早期多视图前端原型、最初的大纲模块方案和已完成的后端执行记录已移至 [历史资料](./archive/README.md)。这些文档用于追溯决策，不作为当前实施依据。
