# StoryOS“我的书架”第二版实现方案

> 文档状态：第二版已实施
>
> 适用基线：2026-08-31 当前工作区
>
> 前置文档：`docs/todo/bookshelf-v1-implementation.md`
>
> 架构依据：`docs/todo/bookshelf-and-future-capabilities-design.md`
>
> 本版主题：书籍生命周期与项目恢复
>
> 实施结果：回收站稳定摘要、生命周期安全规则、回收站页面、永久删除强确认、项目归档摘要、恢复策略选择、目标目录选择、桌面 API 与预览环境均已接入。

## 1. 结论

第二版不应直接进入 3D 阅读、封面资源协议或大书库性能优化。当前最重要的缺口是：第一版已经可以创建、导入和打开书籍，但用户还不能在页面中安全地回收书籍，也不能使用已经落地的项目归档后端恢复被删除的写作项目。

V2 建议交付两个闭环：

1. **书籍生命周期闭环**：未关联项目的书籍可以移入回收站、从回收站恢复，并在严格确认后永久删除；
2. **项目恢复闭环**：用户可以查看与书籍相关的已删除项目归档，选择恢复删除时书籍快照或关联当前书籍，恢复完成后进入写作工作区。

选择该范围的原因：

- `BookLifecycleService`、`ProjectArchiveService` 和归档登记已经存在，本轮主要补齐稳定展示契约、桌面 API 与交互；
- 回收和恢复是书架成为“书籍资产中心”的必要能力，比封面和复杂筛选更基础；
- 项目删除已经强制创建归档，但目前没有用户恢复入口；
- 3D 阅读属于新的阅读体验模块，不应耦合到生命周期操作。

## 2. 版本边界整理

第一版文档把后续能力拆成 V1.1、V1.2 和 V2，但没有形成一个统一可验收的“第二版本”。从本方案开始调整为：

| 版本 | 主题 | 主要能力 |
| --- | --- | --- |
| V1 | 可用书架 | 真实列表、新建、打开、项目关联、导入导出 |
| V2 | 资产管理与恢复 | 书籍回收站、永久删除、项目归档查看与恢复 |
| V3 | 展示模型 | 封面资源、最近编辑章节、目录投影、排序与分组 |
| 后续独立版本 | 阅读体验 | 二维阅读模型、阅读进度、3D 阅读 |

原 V1.1 和 V1.2 合并进本 V2；原文档中的“V2：书籍展示模型”顺延为 V3。

## 3. 功能开发评估

### 3.1 任务分类

- 当前任务：文档与方案设计；
- 后续实施分类：现有功能增强；
- 用户可感知变化：书架从“只能增加和打开”扩展为“可以安全回收书籍，并恢复已删除项目”；
- 当前授权边界：本轮只完善实现文档，不修改业务代码。

### 3.2 模块拆分

需要按两个子域适度拆分：

```text
Bookshelf V2
├── Book lifecycle
│   ├── 移入回收站
│   ├── 回收站列表
│   ├── 恢复书籍
│   └── 永久删除
└── Project archive recovery
    ├── 归档摘要列表
    ├── 恢复策略选择
    ├── 目标目录选择
    └── 恢复并激活工作区
```

两部分可以共享页面反馈和桌面文件选择能力，但不能共用一套含糊的“删除/恢复”状态：

- 书籍恢复恢复的是 Book 资产；
- 项目恢复恢复的是写作环境、项目文件、对话及删除时书籍关系；
- 永久删除书籍是不可逆操作；
- “恢复项目快照”可能创建一本新的书，不能伪装成普通书籍恢复。

前端建议结构：

```text
src/renderer/pages/bookshelf/
├── BookshelfPage.tsx
├── useBookshelf.ts
├── trash/
│   ├── BookshelfTrashPage.tsx
│   ├── useBookshelfTrash.ts
│   └── PermanentDeleteBookDialog.tsx
└── archives/
    ├── BookArchivesDialog.tsx
    ├── RestoreProjectArchiveDialog.tsx
    └── useBookProjectArchives.ts
```

不为每个按钮建立组件，也不建立通用“资产管理框架”。上述拆分只隔离独立路由、异步状态、恢复表单和破坏性确认。

## 4. 当前实现基线

### 4.1 已有能力

| 能力 | 当前实现 | V2 缺口 |
| --- | --- | --- |
| 移入书籍回收站 | `BookLifecycleService.moveToTrash()` | 未暴露给页面 |
| 从回收站恢复 | `BookLifecycleService.restoreFromTrash()` | 未暴露给页面 |
| 永久删除 | `BookLifecycleService.permanentlyDelete()` | 需要收紧为仅允许删除回收站书籍 |
| 回收站列表 | `BookshelfApplication.listTrash()` | 只有 `bookId` 和时间，缺少可读标题 |
| 删除项目前归档 | `ProjectArchiveService.createForProjectDeletion()` | 已接入项目删除流程 |
| 归档校验与恢复 | `ProjectArchiveService.restore()` | 未暴露给渲染层 |
| 启动时归档协调 | `ProjectArchiveService.reconcile()` | 已有 |
| 恢复后激活项目 | `DesktopController.restoreProjectArchive()` | 已有 |

### 4.2 桌面边界缺口

`DesktopController` 已经有回收和归档方法，但共享 `AgentDesktopApi`、IPC 与 Preload 目前只暴露第一版的书架列表、新建、导入和导出。

V2 需要补齐：

- 获取回收站；
- 移入回收站；
- 从回收站恢复；
- 永久删除；
- 按 `bookId` 获取项目归档；
- 恢复项目归档。

渲染层不得直接读取归档目录、书籍目录或数据库路径。

### 4.3 数据契约缺口

`BookshelfTrashEntry` 当前只有 `bookId`、存储状态和时间，无法让用户确认自己正在恢复或永久删除哪一本书。项目归档 DTO 也只有登记信息，缺少项目名称、原路径和可用恢复策略。

V2 必须先补足稳定摘要，再开发 UI。

## 5. 产品范围

### 5.1 书籍卡片管理菜单

可用书籍卡片菜单增加：

- 导出书籍；
- 查看项目归档；
- 移入回收站。

规则：

- 已关联项目的书不能移入回收站；
- 不自动解绑项目；
- 被阻止时明确说明原因，并提供“进入写作项目”；
- V2 不提供“强制解绑并回收”，避免产生难以解释的无书项目；
- 不可用书籍先保持故障可诊断状态，不允许回收或永久删除。

### 5.2 回收站入口与路由

书架顶部增加“回收站”入口，并显示条目数量。使用独立子路由：

```text
/bookshelf
/bookshelf/trash
```

独立路由比页面内临时弹层更合适，因为回收站有独立加载、空状态、错误状态和确认流程，浏览器前进/后退语义也更明确。

V2 不做批量恢复、批量永久删除和自动清空策略。

### 5.3 回收站条目

每条至少展示：

- 书名；
- 移入回收站时间；
- `bookId`，默认缩略显示并提供复制；
- “恢复”操作；
- “永久删除”操作。

回收站不展示题材、类型、目标字数、进度或创作状态筛选。

### 5.4 恢复书籍

```text
点击恢复
  → restoreBookFromTrash(bookId)
  → 检查真实磁盘健康状态
  → available：回到主书架并提示成功
  → missing/corrupted：离开回收站，以故障卡片进入主书架
```

恢复只恢复 Book 资产可见性，不会自动创建写作项目。未关联书籍仍按第一版流程在用户打开时创建项目。

### 5.5 永久删除

永久删除只能从回收站发起，后端也必须验证 `state === "trashed"`，不能只依赖前端隐藏入口。

确认流程：

1. 提示将删除正文、章节版本和书籍资源；
2. 展示完整 `bookId` 并提供复制；
3. 用户输入完整 `bookId`；
4. 输入完全一致后才启用“永久删除”；
5. 删除成功后从回收站移除；
6. 删除清理失败时展示可诊断错误，不伪装为完整成功。

V2 不提供撤销永久删除。

### 5.6 项目归档入口

书籍卡片菜单增加“项目归档”，打开与当前 `bookId` 相关的归档列表。

归档条目至少展示：

- 删除前的项目名称；
- 删除前的项目路径；
- 归档创建时间；
- 状态：处理中、可恢复、已恢复、已损坏；
- 是否包含书籍快照；
- 恢复操作及不可恢复原因。

没有相关归档时展示说明，不把“没有归档”当作加载错误。

### 5.7 项目恢复策略

包含书籍快照的归档提供两种选择：

| 策略 | 行为 | 适用情况 |
| --- | --- | --- |
| 恢复删除时快照 | 从归档复制 BookDatabase，并生成新的 `bookId` | 需要回到删除时内容，或当前书已继续修改 |
| 关联当前书籍 | 不复制正文，恢复项目后关联书架中的当前书 | 希望继续使用书架最新内容 |

“关联当前书籍”只有在当前书满足以下条件时可选：

- 书籍存在且存储状态为 `available`；
- 当前没有关联其他可写项目；
- 数据库可以正常打开。

如果归档不包含书籍，则只恢复项目本身，不展示没有意义的策略差异。

### 5.8 恢复目标目录与成功导航

恢复弹窗默认使用归档项目名，并要求用户选择目标父目录。最终路径必须：

- 是绝对路径且父目录存在；
- 目标目录尚不存在；
- 不位于 StoryOS 的 library 或 archives 内部；
- 不与已登记项目冲突。

路径校验由主进程完成。渲染层可以提前提示，但不能成为唯一校验层。

```text
恢复归档
  → 校验并恢复项目/书籍
  → 登记项目和书籍关联
  → 激活恢复后的项目
  → 刷新工作区快照
  → navigate(/projects/:projectId/book)
```

## 6. 数据模型设计

### 6.1 回收站稳定摘要

不能在书籍进入 `trashed` 后再通过普通 `BookRuntimeManager.acquire()` 读取书名，因为运行时明确拒绝打开非 `available` 书籍。也不应为了展示标题绕过运行时状态校验直接打开 BookDatabase。

建议在 ApplicationDatabase 增加最小回收站摘要表：

```sql
CREATE TABLE book_trash_entries (
  book_id TEXT PRIMARY KEY
    REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trashed_at INTEGER NOT NULL
);

CREATE INDEX idx_book_trash_entries_trashed_at
  ON book_trash_entries(trashed_at DESC);
```

这不是完整书架目录投影，只保存回收站确认所需的稳定标题和时间。V2 不提前引入封面、简介、章节统计缓存或搜索索引。

状态转换：

- 移入回收站：先从健康书库读取标题，再在 ApplicationDatabase 事务中写入摘要并把 `books.state` 改为 `trashed`；
- 恢复：删除摘要，根据磁盘检查结果更新 `books.state`；
- 永久删除：删除 `books` 登记时通过外键级联删除摘要；
- 操作失败：不能留下 `state = trashed` 但没有摘要的正常记录；启动协调发现历史异常时返回可诊断占位条目。

### 6.2 回收站 DTO

```ts
type BookshelfTrashEntry = {
  readonly bookId: string;
  readonly title: string;
  readonly storageState: "trashed";
  readonly trashedAt: string;
};
```

标题只用于显示和确认，书籍身份仍然是 `bookId`。

### 6.3 项目归档摘要 DTO

不要把归档磁盘路径暴露给渲染层。新增页面摘要：

```ts
type ProjectArchiveSummary = {
  readonly archiveId: string;
  readonly sourceProjectId: string;
  readonly projectName: string | null;
  readonly originalProjectPath: string | null;
  readonly bookId: string | null;
  readonly state: "creating" | "available" | "corrupted" | "restored";
  readonly containsBookSnapshot: boolean;
  readonly availableBookStrategies: readonly ("snapshot" | "current")[];
  readonly createdAt: string;
  readonly restoredAt: string | null;
};
```

`availableBookStrategies` 由应用层根据归档 manifest、当前书籍健康状态和项目关联情况计算，渲染层不重复业务判断。`archivePath`、manifest 哈希和内部格式版本继续留在主进程内部。

## 7. 应用层与桌面 API

### 7.1 应用层用例

```ts
listTrash(): readonly BookshelfTrashEntry[];
moveBookToTrash(bookId: string): BookshelfTrashEntry;
restoreBookFromTrash(bookId: string): BookshelfBookCard;
permanentlyDeleteBook(input: {
  bookId: string;
  confirmationBookId: string;
}): void;
listProjectArchiveSummaries(bookId: string): readonly ProjectArchiveSummary[];
restoreProjectArchive(request: RestoreProjectArchiveRequest): RestoreProjectArchiveResult;
```

`BookLifecycleService` 负责状态转换和删除安全规则；`BookshelfApplication` 负责组合书籍摘要、归档摘要与页面 DTO。不要把 manifest 读取或 SQL 拼装放到 IPC handler。

### 7.2 AgentDesktopApi

建议增加：

```ts
getBookshelfTrash(): Promise<readonly BookshelfTrashEntry[]>;
moveBookshelfBookToTrash(bookId: string): Promise<BookshelfTrashEntry>;
restoreBookshelfBookFromTrash(bookId: string): Promise<BookshelfBookCard>;
permanentlyDeleteBookshelfBook(input: {
  bookId: string;
  confirmationBookId: string;
}): Promise<void>;
getBookProjectArchives(bookId: string): Promise<readonly ProjectArchiveSummary[]>;
restoreProjectArchive(request: RestoreProjectArchiveDesktopRequest): Promise<{
  result: RestoreProjectArchiveResult;
  workspace: WorkspaceSnapshot;
}>;
```

所有字符串输入在 IPC 层进行非空、长度和枚举校验。恢复策略只接受 `snapshot | current`。

### 7.3 Preview API

浏览器预览环境需要实现同形方法：

- 回收操作使用内存状态模拟；
- 项目归档可以返回空数组；
- 不使用 `undefined as unknown` 跳过新契约；
- 预览行为足以覆盖路由、空状态和确认弹窗，不模拟真实磁盘恢复。

## 8. 页面状态与错误处理

### 8.1 Hook 边界

`useBookshelf` 继续负责主书架目录、新建和导入导出。新增：

- `useBookshelfTrash`：回收站加载、恢复、永久删除；
- `useBookProjectArchives`：按书加载归档并执行恢复。

不要让一个全局 `pendingAction` 锁住所有互不相关区域。每个 hook 只防止本域重复提交，并用 `bookId` 或 `archiveId` 标识当前操作。

### 8.2 失败语义

| 情况 | 页面反馈 |
| --- | --- |
| 书籍仍有关联项目 | 提示不能回收，并提供进入项目入口 |
| 回收站加载失败 | 保留返回书架入口并允许重试 |
| 恢复后磁盘缺失/损坏 | 说明已退出回收站，但书籍需要修复 |
| 永久删除清理失败 | 显示可诊断错误，不重新制造已删除卡片 |
| 归档已恢复 | 禁用再次恢复并展示恢复时间 |
| 归档已损坏 | 展示损坏状态，不允许选择目标目录 |
| 当前书已关联项目 | 禁用 `current` 策略，仍允许 `snapshot` |
| 目标路径冲突 | 保留表单输入，要求重新选择，不覆盖目录 |
| 恢复执行失败 | 不切换当前工作区，允许修改选择后重试 |

## 9. 主要文件变化

### 9.1 主进程与存储

| 文件 | 变化 |
| --- | --- |
| `ApplicationDatabase.ts` | 增加回收站摘要迁移 |
| `bookRegistryPorts.ts` | 增加事务化回收站摘要端口 |
| `SqliteBookStore.ts` | 实现摘要写入、恢复清理和查询 |
| `BookLifecycleService.ts` | 收紧永久删除状态，协调摘要状态转换 |
| `bookshelfContracts.ts` | 扩充回收站 DTO |
| `projectArchiveContracts.ts` | 增加页面归档摘要契约 |
| `ProjectArchiveService.ts` | 读取 manifest 摘要并计算可用策略 |
| `BookshelfApplication.ts` | 对外编排 V2 用例 |
| `DesktopController.ts` | 暴露回收站和归档恢复入口 |

### 9.2 协议与渲染层

| 文件/目录 | 变化 |
| --- | --- |
| `src/shared/agent/contracts.ts` | 新增 DTO、频道和 API 方法 |
| `src/main/ipc/agent.ts` | 注册频道并校验输入 |
| `src/preload/agentApi.ts` | 暴露受控方法 |
| `previewAgentApi.ts` | 补齐浏览器预览实现 |
| `BookshelfPage.tsx` | 增加回收站和项目归档入口 |
| `BookshelfBookCard.tsx` | 扩展管理菜单和禁用说明 |
| `router/index.ts` | 增加 `/bookshelf/trash` |
| `bookshelf/trash/` | 回收站页面、状态 hook、删除确认 |
| `bookshelf/archives/` | 归档列表、恢复策略和目标目录表单 |

## 10. 实施顺序

### 阶段 1：契约与数据库迁移

1. 增加回收站稳定摘要表；
2. 扩充回收站 DTO；
3. 增加归档页面摘要 DTO；
4. 为已有 `trashed` 记录定义兼容占位策略；
5. 增加存储与迁移测试。

完成标准：主进程测试可以使用可读标题列出回收站，恢复和删除不会留下孤立摘要。

### 阶段 2：应用层安全规则

1. 移入回收站时捕获稳定标题；
2. 永久删除收紧为仅限 `trashed`；
3. 恢复后返回真实书架状态；
4. 归档服务提供页面摘要和可用策略；
5. 增加生命周期与归档行为测试。

完成标准：不经过 UI 也不能永久删除正常书架中的书。

### 阶段 3：桌面边界

1. 更新共享契约；
2. 注册 IPC；
3. 更新 Preload；
4. 更新 Preview API；
5. 增加非法输入和异常传播测试。

完成标准：渲染层只使用类型化 API，不接触任何存储路径。

### 阶段 4：书籍回收站 UI

1. 卡片增加回收入口；
2. 增加回收站路由；
3. 实现恢复；
4. 实现永久删除强确认；
5. 覆盖加载、空、失败和重复提交状态。

完成标准：用户可以完成“移入回收站 → 恢复”和“移入回收站 → 永久删除”。

### 阶段 5：项目归档恢复 UI

1. 加载书籍相关归档；
2. 展示项目名、原路径和归档状态；
3. 实现恢复策略选择；
4. 实现目标目录选择与冲突反馈；
5. 恢复成功后激活并进入工作区。

完成标准：用户删除项目后，可以从对应书籍入口恢复完整项目，并明确选择正文来源。

### 阶段 6：回归验证

1. 类型检查和 lint；
2. 生命周期、归档、IPC 和页面模型测试；
3. 打包验证 SQLite 迁移与 Electron 文件选择；
4. 手工验证 Windows 路径冲突、取消操作和恢复后导航；
5. 回归第一版的新建、打开、导入和导出。

## 11. 测试策略

### 11.1 存储与生命周期

- 回收未关联健康书籍时保存正确标题和时间；
- 已关联或导入中的书籍不能进入回收站；
- 恢复后摘要被删除，状态由真实健康检查决定；
- 正常书籍不能直接永久删除；
- 永久删除必须输入完整匹配的 `bookId`；
- 文件移动、登记删除和清理失败时状态可解释；
- 数据库从旧版本迁移后原书架不受影响。

### 11.2 项目归档

- 只返回目标 `bookId` 的相关归档；
- 摘要包含 manifest 中的项目名和原路径，但不暴露归档磁盘路径；
- 已损坏和已恢复归档不可再次恢复；
- 当前书健康且未关联时提供 `current`；
- 当前书已关联时只提供 `snapshot`；
- `snapshot` 生成新 `bookId`；
- `current` 关联原书且不复制正文；
- 目标路径冲突时不覆盖、不切换项目；
- 恢复失败时原工作区保持活动。

### 11.3 渲染层

- 回收站空状态和加载失败；
- 已关联书籍的回收操作被阻止并说明原因；
- 永久删除按钮只有确认值完全一致时可用；
- 归档策略选项按后端 capabilities 展示；
- 文件选择取消不发起恢复；
- 操作中防止重复提交；
- 恢复成功进入正确项目工作区；
- 主书架仍只有搜索与网格/列表切换，不重新加入状态筛选。

## 12. 验收标准

V2 完成必须同时满足：

- 未关联书籍可以移入回收站，已关联书籍不能回收；
- 回收站始终提供可读书名和准确回收时间；
- 恢复书籍不会自动创建项目；
- 永久删除只能从回收站发起，且必须输入完整 `bookId`；
- 用户可以查看与书籍关联的项目归档；
- 归档列表展示项目名、原路径、时间和健康状态；
- 用户可以明确选择“删除时快照”或“当前书籍”；
- 快照策略产生新的书籍身份，当前书策略不复制正文；
- 恢复目标路径冲突时绝不覆盖；
- 恢复失败不影响当前活动项目；
- 恢复成功后进入正确书籍工作区；
- 不重新引入题材/类型、目标字数、进度或状态筛选；
- 不实现 3D 阅读、封面资源和目录统计缓存；
- 类型检查、相关测试、打包和桌面手工验证通过。

## 13. 本版明确不做

- 3D 阅读及普通阅读器；
- 封面图片上传、裁剪和资源协议；
- 最近编辑章节定位；
- 大书架目录投影与增量统计缓存；
- 状态筛选、复杂排序、分组和标签；
- 批量回收、批量恢复、批量永久删除；
- 自动清空回收站；
- 强制解绑项目后回收书籍；
- 覆盖已有目录或已有书籍的恢复；
- 对外发布、分享和云同步。

## 14. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 回收站只有 ID，用户误删 | 在状态转换时保存稳定标题；永久删除仍确认完整 ID |
| 前端隐藏入口但后端仍可直接删正常书 | 后端强制 `state === trashed` |
| 生命周期与摘要不一致 | 摘要和注册状态都保存在 ApplicationDatabase 同一事务中 |
| 恢复项目时误覆盖目录 | 主进程拒绝任何已存在目标路径 |
| 用户混淆两种恢复 | UI 使用“恢复书籍”和“恢复写作项目”两个明确术语 |
| 当前书已继续写作，恢复覆盖内容 | 快照总是生成新书，不覆盖当前书 |
| 页面文件继续膨胀 | 回收站和归档分别使用独立路由、hook 和表单组件 |
| 为未来场景过度设计 | V2 只保存回收站最小摘要，不提前构建完整目录投影 |

## 15. 最终建议

V2 按“稳定摘要与安全规则 → 桌面契约 → 回收站 UI → 项目归档恢复 UI → 桌面回归验证”的顺序实施。

本版的价值不是增加更多书架展示字段，而是让用户对已经创建的书籍和已经删除的项目拥有可理解、可恢复、不会误覆盖的完整控制。待资产生命周期闭环稳定后，再进入 V3 的封面与展示模型；阅读与 3D 体验继续作为独立版本规划。
