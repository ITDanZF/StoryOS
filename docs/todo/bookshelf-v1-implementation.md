# StoryOS“我的书架”第一版实现方案

> 文档状态：第一版已实施
>
> 适用基线：2026-08-31 当前工作区
>
> 前置设计：`docs/todo/bookshelf-and-future-capabilities-design.md`

> 实施结果：真实书架列表、独立新书、项目关联打开、导入导出、异常书籍隔离、搜索、网格/列表切换、最近写作和桌面文件对话框均已接入；回收站及项目归档恢复 UI 继续按后续版本边界处理。
> 本轮目标：把现有书架静态原型接入已经完成的书籍后端，形成可实际使用的第一版闭环

## 1. 结论

“我的书架”第一版不需要重做 Application、Project、Book 三库架构，也不需要新增数据库表。当前代码已经具备书籍注册、按 `bookId` 读取、项目关联、导入导出、生命周期和项目归档等后端基础，主要缺口在桌面 API 与页面接入。

第一版建议交付以下能力：

1. 展示真实书籍，替换 `BookshelfPage.tsx` 中的三本模拟书；
2. 支持搜索、网格/列表切换和空状态；
3. 用真实的最近打开记录展示“最近写作”；
4. 已关联项目的书可以直接进入现有书籍工作区；
5. 未关联项目的书可以创建写作项目并建立关联，之后进入书籍工作区；
6. 可以新建独立书籍资产，新书不依赖项目目录存在；
7. 可以导入和导出 `.storyos-book`；
8. 单本书丢失或损坏时只降级该卡片，不拖垮整个书架；
9. 提供完整的加载、失败、重复提交和操作反馈状态。

第一版明确不做回收站与永久删除 UI、项目归档恢复 UI、封面文件、最近章节定位、多项目同时编辑一本书，以及脱离项目直接编辑书籍。

题材/类型、目标字数/章节数和创作进度从当前产品模型与页面中直接移除，暂不设计字段、DTO、占位展示或后续排期。

## 2. 新功能开发评估

### 2.1 任务分类

- 分类：新功能开发；
- 用户确认：已确认按新功能开发流程处理；
- 用户可感知变化：书架从静态展示页变为真实书籍入口，并能完成新建、打开、关联、导入和导出。

### 2.2 是否需要拆分

需要适度拆分。

当前 `BookshelfPage.tsx` 已有约 328 行，内部同时包含模拟数据、封面绘制、卡片、特色区域、搜索和页面布局。接入真实数据后还会增加异步加载、打开/关联、新建、导入导出、错误反馈和弹窗状态。如果继续全部放在页面文件中，会把展示、业务编排、桌面 API 和错误处理混在一起。

不建议按每个小视觉元素拆文件。第一版只拆出以下稳定责任：

```text
BookshelfPage
├── useBookshelf              数据加载与业务动作
├── bookshelfModel           过滤、排序、文案和格式化纯函数
├── BookshelfToolbar         搜索、视图切换
├── BookshelfBookCard        卡片、封面和不可用状态
├── FeaturedBook             最近写作入口
└── BookProjectDialog        为书籍创建并关联项目
```

过度集中会使页面难测试、错误状态互相影响；过度拆分则会产生大量只有几行样式的组件。本方案保持页面编排清晰，同时保留封面装饰等局部实现的内聚性。

## 3. 当前实现基线

### 3.1 已经完成

| 能力 | 当前实现 |
| --- | --- |
| 书籍注册与项目关联 | `SqliteBookStore`、`project_books` |
| 按 `bookId` 打开书库 | `BookRuntimeManager` |
| 读取书名和统计 | `BookCatalogReader` |
| 书架统一应用入口 | `BookshelfApplication` |
| 关联已有书籍 | `ProjectBookBindingService` |
| `.storyos-book` 导入导出 | `BookTransferService` |
| 丢失/损坏检测 | `BookStorageHealthInspector`、`BookRegistryReconciler` |
| 书籍回收与永久删除 | `BookLifecycleService`，第一版暂不接 UI |
| 项目删除归档与恢复 | `ProjectArchiveService`，第一版暂不接 UI |
| 书架路由和视觉骨架 | `/bookshelf`、`BookshelfPage.tsx`、`bookshelfThemes.ts` |

### 3.2 当前缺口

| 缺口 | 影响 |
| --- | --- |
| `AgentDesktopApi` 没有书架方法 | 渲染层无法调用已有 `DesktopController` 书架能力 |
| IPC 未注册书架频道 | 主进程能力不能通过受控边界暴露 |
| Window API 只有目录选择器 | 无法选择导入文件或导出目标文件 |
| 页面使用硬编码 `bookshelfBooks` | 真实书籍不会显示 |
| 卡片 DTO 缺少简介、更新时间和关联项目 ID | 原型主要信息和“打开书籍”流程无法实现 |
| 新建书籍仍只存在于项目工作区 | 书架不能先创建独立书籍资产 |
| 书架读取会触发 `touchOpened` | 仅浏览书架就会篡改“最近写作”顺序 |
| 页面无统一异步状态 | 导入、导出、关联容易重复提交或静默失败 |

### 3.3 必须先修正的时间语义

当前 `BookRuntimeManager.acquire()` 在每次打开数据库时都会调用 `BookRegistry.touchOpened()`。`BookCatalogReader` 为了生成卡片也会 `acquire()` 每本书，所以打开书架页面会把所有书都标记为“刚刚打开”，使排序和“最近写作”失真。

第一版必须把数据库访问和用户打开行为分开：

- `BookRuntimeManager.acquire()` 只负责资源租约，不再更新 `lastOpenedAt`；
- 只有用户进入项目书籍工作区时更新 `lastOpenedAt`；
- 后台卡片读取、健康检查、导入校验、归档和导航摘要不得更新时间；
- 新建并进入工作区的书在注册时已经有首次打开时间，无需重复触发。

建议把触发点放在 `ProjectBookNovelStore` 装配活动项目书籍的位置，或更上层的工作区激活用例中。不要把它继续藏在通用数据库租约中。

## 4. 第一版产品范围

### 4.1 页面区域

#### 顶部栏

- 标题与说明沿用当前视觉；
- “导入书籍”打开 `.storyos-book` 文件选择器；
- “新建书籍”打开新书弹窗；
- 操作进行中禁用对应按钮，避免重复提交。

#### 最近写作

- 候选条件：`availability === "ready"`、已经关联项目、`lastOpenedAt !== null`；
- 从候选中选择 `lastOpenedAt` 最新的一本；
- 点击“继续写作”切换到关联项目并进入 `/projects/:projectId/book`；
- 没有候选时不渲染虚假的特色书，改为简洁的新建/导入引导；

#### 全部作品

- 展示真实总书数、总章节数和总字数；
- 搜索范围：可用书的书名、简介；不可用书的 `bookId` 和故障原因；
- 保留网格/列表切换；
- 当前视图只保存在页面状态，不在第一版增加持久化设置。

#### 卡片

可用书展示：

- 书名；
- 简介，为空时显示“这个故事还没有简介”；
- 创作状态；
- 章节数和字数；
- 内容最近更新时间；
- 是否已关联写作项目；
- 基于 `bookId` 的确定性主题封面。

不可用书展示：

- 统一标题“无法读取的书籍”；
- `bookId`；
- `missing`、`corrupted` 或 `importing` 的中文状态；
- 简短、可复制的错误原因；
- 打开和导出按钮禁用；
- 该书不进入章节数、字数和最近写作统计。

### 4.2 不增加没有事实来源的展示字段

当前 BookDatabase 没有封面资源字段。第一版不得为了视觉原型临时扩数据库。当前原型中的题材/类型、目标值和进度相关展示直接删除，不做替代文案或数据预留。

| 原型字段 | 第一版处理 |
| --- | --- |
| `coverTheme` | 由 `selectDefaultBookshelfTheme(bookId)` 确定 |
| `coverNumber` | 按当前可见列表序号生成，仅为装饰 |
| `coverKicker` | 根据创作状态映射固定文案 |
| `description` | 使用真实 `novel.synopsis` |
| `updatedAt` | 使用真实内容更新时间并在渲染层格式化 |

## 5. 核心用户流程

### 5.1 打开已关联书籍

```text
点击书籍卡片
  → 校验卡片可用且存在 linkedProjectId
  → 从当前 ProjectSnapshot 找到项目
  → switchProject(project.path)
  → navigate(/projects/:projectId/book)
```

如果卡片记录的项目 ID 在当前项目快照中不存在，先重新加载工作区快照；仍不存在时提示“关联项目已不存在，请重新关联”，不得猜测项目路径。

### 5.2 打开未关联书籍

```text
点击未关联书籍
  → 打开“创建写作项目”弹窗
  → 默认项目名使用书名
  → 用户选择项目父目录
  → createProject({ name, parentPath, bookId })
  → 主进程创建项目并通过现有服务关联书籍
  → 成功后进入项目书籍工作区
```

关联仍遵守当前“一本书同一时间只绑定一个可写项目”的约束，不复制正文。

### 5.3 新建书籍

第一版建议真正创建独立书籍资产，而不是先制造一个空项目来冒充新书。

```text
点击“新建书籍”
  → 输入书名和可选简介
  → createBookshelfBook({ title, synopsis, status: "planning" })
  → 在 BookDatabase 创建 novel
  → 在全局 books 注册，但不写 project_books
  → 刷新书架并定位新卡片
  → 提示“创建写作项目”
```

用户可以立即为新书创建项目，也可以稍后从卡片进入关联流程。这样即使项目创建失败，书籍仍是有效、可恢复的独立资产。

实现上扩展 `BookProvisioningService`，复用现有临时目录、原子发布和失败清理逻辑，新增 `createStandalone()`，不要复制一套建库流程。

### 5.4 导入书籍

```text
点击“导入书籍”
  → 系统文件选择器仅显示 .storyos-book
  → importBookshelfBook({ packagePath })
  → BookTransferService 完成校验、迁移、注册和原子发布
  → 刷新列表并突出显示导入书籍
  → 用户可继续创建写作项目
```

取消文件选择不显示错误。导入失败保留当前列表并显示明确原因。

### 5.5 导出书籍

```text
卡片菜单 → 导出书籍
  → 系统保存文件选择器
  → 默认名为安全化后的“书名.storyos-book”
  → exportBookshelfBook({ bookId, outputPath })
  → 成功后提示实际输出位置
```

第一版继续沿用后端“不覆盖已有文件”的安全策略。目标文件已存在时提示用户换名，不自动删除或覆盖。

## 6. 共享契约设计

### 6.1 书架卡片 DTO

扩展现有 `bookshelfContracts.ts`，保持可用/不可用判别联合类型：

```ts
type AvailableBookshelfBookCard = {
  readonly availability: "ready";
  readonly bookId: string;
  readonly title: string;
  readonly synopsis: string;
  readonly status: "planning" | "writing" | "completed" | "archived";
  readonly storageState: "available";
  readonly volumeCount: number;
  readonly chapterCount: number;
  readonly characterCount: number;
  readonly linkedProjectId: string | null;
  readonly linkedProjectCount: number;
  readonly updatedAt: string;
  readonly lastOpenedAt: string | null;
};

type UnavailableBookshelfBookCard = {
  readonly availability: "unavailable";
  readonly bookId: string;
  readonly storageState: "missing" | "importing" | "corrupted";
  readonly linkedProjectId: string | null;
  readonly linkedProjectCount: number;
  readonly lastOpenedAt: string | null;
  readonly reason: string;
};
```

说明：

- `linkedProjectId` 是第一版打开书籍所需的最小导航信息；
- `linkedProjectCount` 保留后端事实和未来策略兼容性；
- `updatedAt` 取 `novel.updatedAt`、章节更新时间和当前修订创建时间的最大值；
- 所有日期跨 IPC 使用 ISO 字符串；
- DTO 不暴露 `storagePath` 或数据库路径。

### 6.2 新建书籍契约

```ts
type CreateBookshelfBookRequest = {
  readonly title: string;
  readonly synopsis: string;
};

type CreateBookshelfBookResult = {
  readonly bookId: string;
  readonly book: AvailableBookshelfBookCard;
};
```

IPC 层执行：

- `title.trim()` 后必填，最大 200 字符；
- `synopsis` 必须是字符串，最大长度建议 20,000 字符；
- 状态固定为 `planning`，不信任渲染层传入创作状态；
- 领域 `novelId` 和注册 `bookId` 继续独立生成。

### 6.3 Agent Desktop API

第一版新增以下频道和方法：

```ts
getBookshelfBooks(): Promise<readonly BookshelfBookCard[]>;
createBookshelfBook(
  request: CreateBookshelfBookRequest,
): Promise<CreateBookshelfBookResult>;
importBookshelfBook(
  request: { readonly packagePath: string },
): Promise<ImportBookResult>;
exportBookshelfBook(
  request: { readonly bookId: string; readonly outputPath: string },
): Promise<void>;
```

项目关联不增加重复接口，继续通过已经支持 `bookId` 的 `createProject()` 完成。`DesktopController` 已有 `getBookshelfBooks`、`importBookshelfBook` 和 `exportBookshelfBook`，主要工作是补共享契约、IPC 注册、Preload 暴露和输入校验。

### 6.4 Window Desktop API

新增受控文件对话框：

```ts
type FileDialogFilter = {
  readonly name: string;
  readonly extensions: readonly string[];
};

pickFile(request: {
  readonly title: string;
  readonly filters?: readonly FileDialogFilter[];
}): Promise<string | null>;

saveFile(request: {
  readonly title: string;
  readonly defaultPath?: string;
  readonly filters?: readonly FileDialogFilter[];
}): Promise<string | null>;
```

主进程必须规范化标题、默认路径和扩展名过滤器。业务服务仍要再次校验绝对路径与 `.storyos-book` 扩展名，不能把文件对话框当成安全校验的替代品。

## 7. 后端实现调整

### 7.1 `BookProvisioningService`

把现有 `createForProject()` 的建库流程提取为私有共享流程，并增加：

```ts
createStandalone(
  input: Omit<NovelRecord, "createdAt" | "updatedAt">,
): ProvisionedStandaloneBook;
```

共同阶段仍为：

```text
preparing → database_created → published → registered
```

项目模式在注册时同时写 `books` 和 `project_books`；独立模式只写 `books`。任何失败都沿用现有临时目录清理和 `BookProvisioningError` 状态，不允许页面自行拼接数据库或书库路径。

### 7.2 `BookRegistry`

增加语义明确的方法：

```ts
registerStandaloneBook(input: {
  readonly id: string;
  readonly storagePath: string;
}): BookRecord;
```

它直接注册为 `available`，区别于导入流程使用的 `registerImportedBook()`；后者在文件原子发布前必须保持 `importing`。两者不能复用一个含糊的状态参数接口。

该调整只增加存储方法，不改变表结构。

### 7.3 `BookCatalogReader`

调整为接收项目 ID 列表或包含关联信息的输入，返回扩展 DTO：

- 返回真实 `synopsis`；
- 返回单写约束下的 `linkedProjectId`；
- 计算真实内容更新时间；
- 返回注册记录中的 `lastOpenedAt`；
- 继续用 `try/finally` 释放书库租约；
- 单书异常转换为不可用卡片。

### 7.4 `BookshelfApplication`

新增 `createBook()`，内部只编排 `BookProvisioningService` 和 `BookCatalogReader`。它不直接执行 SQL，不接收存储路径。

`listBooks()` 继续排除 `trashed`；第一版页面不消费 `listTrash()`。

### 7.5 `DesktopController`、IPC 与 Preload

- 保留 Controller 作为桌面用例入口；
- IPC 对 `bookId`、书名、简介、包路径和输出路径分别校验；
- Preload 只暴露明确方法，不暴露通用 `invoke`；
- 更新预览 API，使其满足扩展后的 `AgentDesktopApi`；
- 错误继续通过 Electron `invoke` 拒绝传回渲染层，由页面转为中文操作反馈。

## 8. 前端实现结构

建议目录：

```text
src/renderer/pages/bookshelf/
├── BookshelfPage.tsx
├── bookshelfModel.ts
├── bookshelfThemes.ts
├── useBookshelf.ts
└── components/
    ├── BookshelfBookCard.tsx
    ├── BookshelfToolbar.tsx
    ├── FeaturedBook.tsx
    ├── NewBookDialog.tsx
    └── BookProjectDialog.tsx
```

项目创建表单已经被侧栏和书架共同需要。建议把当前 `layouts/workspace/components/CreateProjectDialog.tsx` 的表单主体移动到：

```text
src/renderer/features/project/components/CreateProjectDialog.tsx
```

通过标题、说明、确认文案和默认项目名参数适配“空白项目”和“为书籍创建写作项目”两种入口，避免复制目录选择和校验逻辑。

### 8.1 `useBookshelf`

状态建议：

```ts
type BookshelfState = {
  readonly phase: "loading" | "ready" | "error";
  readonly books: readonly BookshelfBookCard[];
  readonly loadError: string | null;
  readonly pendingAction:
    | { kind: "create" }
    | { kind: "import" }
    | { kind: "export"; bookId: string }
    | { kind: "link"; bookId: string }
    | null;
  readonly actionError: string | null;
};
```

职责：

- 初次加载与显式刷新；
- 新建、导入、导出；
- 创建项目并关联未绑定书籍；
- 在动作成功后刷新列表；
- 防止同一动作重复提交；
- 页面卸载后忽略过期异步结果；
- 不吞掉失败，向页面提供可操作错误。

### 8.2 `bookshelfModel`

只放纯函数：

- `filterBooks()`；
- `selectFeaturedBook()`；
- `calculateBookshelfTotals()`；
- `formatCharacterCount()`；
- `formatRelativeTime()`；
- 状态中文映射；
- 安全导出文件名生成。

纯函数使用单元测试覆盖，不把筛选和时间文案散落在 JSX 中。

### 8.3 页面状态

| 状态 | 页面行为 |
| --- | --- |
| 初次加载 | 展示固定尺寸骨架，避免布局跳动 |
| 加载成功且无书 | 展示新建和导入两个主入口 |
| 加载失败 | 展示错误与“重新加载”，不显示模拟数据 |
| 搜索无结果 | 保留工具栏，展示清除搜索入口 |
| 单本不可用 | 仅该卡片降级，其余书正常可用 |
| 新建/导入/关联中 | 对应按钮和目标卡片禁用并显示进行中状态 |
| 操作失败 | 弹窗保留输入；页面显示错误，可重试 |
| 操作成功 | 关闭弹窗、刷新列表、显示短反馈 |

### 8.4 键盘与可访问性

- `/bookshelf` 页面内 `Ctrl/Cmd + F` 聚焦书架搜索框并阻止浏览器默认查找；
- `Escape` 关闭当前非忙碌弹窗；
- 卡片主按钮、菜单按钮和导出按钮使用独立可聚焦元素；
- 网格/列表切换继续使用 `aria-pressed`；
- 加载和操作结果通过 `aria-live="polite"` 通知；
- 不可用原因不只依赖颜色表达。

## 9. 数据流

```text
BookshelfPage
  → useBookshelf
    → window.storyOSAgent
      → preload/agentApi
        → agent IPC
          → DesktopController
            → BookshelfApplication
              → BookRegistry
              → BookProvisioningService
              → BookCatalogReader
                → BookRuntimeManager
                  → BookDatabase
```

打开或关联书籍时：

```text
BookshelfPage
  → useAgentWorkspace.createProject({ bookId }) / switchProject()
    → DesktopController
      → ProjectApplication
      → ProjectBookBindingService
      → WorkspaceRuntimeManager
  → /projects/:projectId/book
```

页面不得绕过应用服务读取 SQLite，也不得根据 `bookId` 自行推导本地路径。

## 10. 文件级改动清单

### 10.1 预计修改

| 文件 | 修改内容 |
| --- | --- |
| `src/main/agent/application/bookshelfContracts.ts` | 扩展卡片 DTO、新建书籍请求/结果 |
| `src/main/agent/application/BookCatalogReader.ts` | 简介、关联项目、更新时间和最近打开时间 |
| `src/main/agent/application/BookshelfApplication.ts` | 注入 provisioning，新增独立新建书籍用例 |
| `src/main/agent/application/BookProvisioningService.ts` | 抽共享流程，新增 `createStandalone()` |
| `src/main/agent/application/bookRegistryPorts.ts` | 新增 `registerStandaloneBook()` |
| `src/main/agent/storage/global/SqliteBookStore.ts` | 实现独立书籍注册，不改表结构 |
| `src/main/agent/runtime/BookRuntimeManager.ts` | 移除通用租约中的打开时间副作用 |
| `src/main/agent/storage/book/ProjectBookNovelStore.ts` | 在真实工作区打开边界更新时间 |
| `src/main/agent/electron/DesktopController.ts` | 增加创建书架书籍入口 |
| `src/main/agent/StoryAgentService.ts` | 向 `BookshelfApplication` 注入 provisioning |
| `src/shared/agent/contracts.ts` | 新增频道、API 方法和类型导出 |
| `src/main/ipc/agent.ts` | 注册书架 IPC 和输入校验 |
| `src/preload/agentApi.ts` | 暴露书架 API |
| `src/renderer/features/agent/api/previewAgentApi.ts` | 补齐预览实现和模拟返回 |
| `src/shared/window/contracts.ts` | 增加打开/保存文件对话框契约 |
| `src/main/ipc/window.ts` | 实现 Electron 文件对话框 |
| `src/preload/windowApi.ts` | 暴露文件对话框 API |
| `src/renderer/pages/bookshelf/BookshelfPage.tsx` | 移除模拟数据，改为页面编排 |
| `src/renderer/features/agent/hooks/useAgentWorkspace.ts` | 让 `createProject` 返回创建后的快照/项目 ID |
| `src/renderer/layouts/workspace/components/WorkspaceSidebar.tsx` | 使用共享项目创建弹窗的新位置与参数 |

### 10.2 预计新增

```text
src/renderer/pages/bookshelf/useBookshelf.ts
src/renderer/pages/bookshelf/bookshelfModel.ts
src/renderer/pages/bookshelf/components/BookshelfBookCard.tsx
src/renderer/pages/bookshelf/components/BookshelfToolbar.tsx
src/renderer/pages/bookshelf/components/FeaturedBook.tsx
src/renderer/pages/bookshelf/components/NewBookDialog.tsx
src/renderer/pages/bookshelf/components/BookProjectDialog.tsx
src/renderer/features/project/components/CreateProjectDialog.tsx
```

若实施时某个组件不足约 40 行且没有独立状态或测试价值，应留在父组件中，不机械追求上述文件数量。

### 10.3 不需要修改

- ApplicationDatabase、ProjectDatabase、BookDatabase 的表结构和 schema version；
- `/projects/:projectId/book` 路由；
- 章节编辑器、分页引擎和 Agent 工具；
- `.storyos-book` 包格式版本。

## 11. 安全与一致性要求

1. 所有书籍业务以 `bookId` 工作，不向渲染层发送书库真实路径；
2. 新建书籍继续使用临时目录、原子移动和失败清理；
3. 导入包仍执行大小、格式版本、哈希、数据库类型和完整性检查；
4. 导出使用 SQLite backup，不直接复制活跃 WAL 文件；
5. 导出不覆盖现有文件；
6. 关联失败必须由现有 `ProjectBookBindingService` 补偿，不在前端手工解绑；
7. 卡片读取不得修改 `lastOpenedAt`；
8. 一本损坏书的异常必须被限制在该卡片；
9. 页面不根据错误消息自动执行删除、修复或覆盖；
10. 第一版保持一本书最多一个可写项目的数据库唯一约束。

## 12. 实施顺序

### 阶段 A：契约和时间语义

1. 扩展卡片 DTO；
2. 修正 `lastOpenedAt` 触发边界；
3. 增加独立书籍注册与 provisioning；
4. 更新 `BookshelfApplication` 和 Controller；
5. 更新现有后端测试。

完成标准：无需渲染层即可测试真实列表、新建独立书籍，以及书架读取不改变最近打开时间。

### 阶段 B：桌面边界

1. 增加书架 IPC 频道；
2. 增加输入校验；
3. 更新 Preload 和共享类型；
4. 增加打开/保存文件选择器；
5. 更新预览 API。

完成标准：渲染层可通过类型安全 API 完成列表、新建、导入、导出，不接触 Node 或数据库路径。

### 阶段 C：页面数据闭环

1. 实现 `useBookshelf`；
2. 用真实 DTO 替换模拟书；
3. 完成加载、空、错误和不可用状态；
4. 接入搜索和视图切换；
5. 接入最近写作。

完成标准：工作区创建的书返回书架后可立即看到，统计准确。

### 阶段 D：动作闭环

1. 新建独立书籍；
2. 打开已关联书籍；
3. 为未关联书籍创建并关联项目；
4. 导入与导出；
5. 操作反馈、重复提交保护和键盘行为。

完成标准：用户可以从空书架开始，完成“新建书 → 建立项目 → 进入工作区”，也可以完成“导入书 → 建立项目 → 进入工作区”。

### 阶段 E：验证和收口

1. 运行类型检查、单元测试和 ESLint；
2. 手工验证 Electron 文件对话框；
3. 验证窄屏、普通桌面和大屏布局；
4. 验证重启后的列表、关联和最近写作顺序；
5. 删除模拟数据和无效原型字段。

## 13. 测试方案

### 13.1 后端单元/行为测试

- 空书架返回空数组；
- 项目中创建的书显示真实标题、简介、章节数和字数；
- 独立新建书成功注册，但没有项目关联；
- 独立书创建失败不留下半成品目录或注册；
- 未关联书也能生成可用卡片；
- `linkedProjectId` 与 `project_books` 一致；
- 内容更新时间取 novel、chapter、revision 的最大值；
- 调用 `listBooks()` 不改变任何 `lastOpenedAt`；
- 激活真实书籍工作区会更新对应 `lastOpenedAt`；
- 一本书缺失不影响其他卡片；
- 错误数据库类型返回 `corrupted`；
- 导入后获得新的本地 `bookId`；
- 导出内容与当前书籍一致；
- 关联失败不留下新项目—书籍关系。

### 13.2 纯前端模型测试

- 搜索忽略首尾空格并支持中文；
- 不可用书不会计入章节和字数；
- 最近写作只选择已关联且可用的书；
- 相同时间使用稳定 `bookId` 排序；
- 字数和相对时间格式边界正确；
- 导出文件名移除 Windows 非法字符。

### 13.3 页面/手工验证

- 空书架、新建一本、多本书、搜索无结果；
- 网格与列表视图；
- 已关联书直接打开；
- 未关联书创建项目后打开；
- 取消项目创建不改变书籍；
- 取消导入/导出不报错；
- 重复点击只发起一次操作；
- 损坏书与正常书同时存在；
- 导出目标已存在时不覆盖；
- `Ctrl/Cmd + F` 只在书架聚焦搜索；
- 重新启动应用后书籍和关联仍存在。

### 13.4 工程验证命令

```bash
npm run typecheck
npm test
npm run lint
```

如果完整 lint 暴露历史遗留问题，应单独记录；本次新增和修改文件不得产生新的 lint 错误。

## 14. 验收标准

第一版完成必须同时满足：

- 页面不再包含硬编码的三本模拟书；
- 工作区创建书籍后返回书架可见，无正文复制；
- 新建书籍可以先形成独立书籍资产；
- 可用卡片标题、简介、章节数和字数与 BookDatabase 一致；
- 已关联书可以一键进入正确项目工作区；
- 未关联书可以创建项目、建立关联并进入工作区；
- 导入和导出真实可用，取消操作无副作用；
- 丢失或损坏书籍不会导致整页失败；
- 打开书架本身不改变最近写作顺序；
- 页面不再出现题材/类型、目标值或进度字段，更新时间必须来自真实数据；
- 不新增数据库表，不把书籍正文写回 ProjectDatabase；
- 类型检查和相关测试通过。

## 15. 后续版本边界

以下能力使用现有后端继续迭代，但不混入第一版：

### V2：生命周期与项目归档恢复 UI（已实施）

- 书架回收站；
- 移入回收站与恢复；
- 关联项目检查；
- 永久删除的强确认流程；
- 为回收站提供可读书名的稳定展示方案。
- 展示书籍相关项目归档；
- 选择“恢复删除时快照”或“关联当前书籍”；
- 目标目录冲突与校验结果展示。

详细方案见 `docs/todo/bookshelf-v2-implementation.md`。

### V3：书籍展示模型

- 封面资源协议；
- 最近编辑章节；
- 大书架目录投影和增量统计缓存；
- 更丰富的排序、分组和筛选。

## 16. 主要风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 书架查询同步扫描大量章节，主进程短暂停顿 | 第一版沿用直读；保持 DTO 最小；大规模书库出现前再引入可重建投影 |
| 新建书流程复制现有 provisioning 逻辑 | 只扩展共享服务，不新增第二套建库实现 |
| 页面凭关联 ID 猜测路径 | 只从 ProjectSnapshot 取项目并调用现有 `switchProject` |
| 书架读取污染最近打开时间 | 从通用 runtime 租约移除 `touchOpened` 副作用，并增加回归测试 |
| 预览 API 未同步导致类型检查失败 | 与共享契约、Preload 同一个阶段更新 |
| 导出覆盖用户文件 | 第一版继续拒绝覆盖，要求重新选择文件名 |
| 第一版被删除/归档交互拖大 | 明确推迟到 V2，不因为后端已有就一次性全部暴露 |

## 17. 最终建议

按“契约与时间语义 → 桌面边界 → 真实列表 → 新建/打开/关联 → 导入导出 → 验证”的顺序实施。第一版的关键不是增加更多书籍元数据，而是让现有独立 Book 资产通过安全、类型化的桌面边界进入真实页面，并可靠地抵达当前项目书籍工作区。

在批准本方案后即可进入代码实施；无需先做数据库迁移或新的底层架构重构。
