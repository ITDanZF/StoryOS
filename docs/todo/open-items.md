# 从已删除设计稿抽出的未完成项

已落地的书架、阅读器、实例、设置和模块化方案已从 `docs/` 移除。下面只保留那些方案里**还没有做完、也不能从现行代码直接读出**的事项。

仍在推进的设计继续看原文档，不在此重复：

- 书籍工作区性能阶段 2–5：`docs/todo/performance/`
- 大纲模块：`docs/todo/outline-module-design-analysis.md`
- 阿里云 Text Embedding 接入：`docs/todo/aliyun-text-embedding.md`
- 小说正文向量化：`docs/todo/novel-vectorization.md`
- 小说向量库落地架构与实现步骤：`docs/architecture/database-vnext/05-novel-vector-store.md`
- 向量 RAG、专业资料、人物/大纲表设计稿：`docs/architecture/database-vnext/`
- 代码签名发布：`docs/release/signpath-code-signing-plan.md`

## 书架展示模型

原能力补全设计把这些列为后续独立版本，当时没有做数据结构或页面：

- 封面文件与资源协议（当前封面仍是按 `bookId` 选取的装饰主题）
- 最近编辑章节入口
- 目录投影以外的统计、排序、筛选和分组

它们需要单独立项，不能把旧设计稿当成已确定的表结构。

## 阅读器质量验收

3D 阅读功能已落地。当时记录的功能测试通过，不等于下列验收已完成：

- 集显/独显，系统 125%/150%/200% 缩放，跨屏切换
- P95 帧时、显存峰值、长时间运行
- 100%/150%/200% DPI 下中文细笔画的人工字形对照
- 纹理预算只是应用侧估算，不是驱动器显存读数

实现约束见 `src/renderer/AGENTS.md`。
