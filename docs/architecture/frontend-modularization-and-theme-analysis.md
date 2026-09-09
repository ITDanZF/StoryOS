# StoryOS 前端公共组件、模块化与主题体系分析

> 分析日期：2026-09-09
>
> 代码基线：`835f938`，分析开始时工作区无未提交修改。
>
> 范围：`src/renderer/`，必要时参考共享类型、构建配置和现有验证脚本。
>
> 本文保留基线时的现状分析与重构建议。后续已依据本文执行重构，实际完成项、当前目录和验证记录见[实施记录](./frontend-modularization-implementation.md)。基线描述不代表当前实现。

## 1. 核心判断

当前前端已经具备模块化基础：存在独立的业务 Hook、书架子流程、编辑器扩展、分页引擎、阅读器缓存、对话展示模型和公共动效。问题主要是这些边界没有贯穿整个项目，页面持续承担编排、交互、数据调用和样式定义，公共层也未形成完整的基础控件与主题契约。

建议采用“先统一基础能力，再收敛业务边界，最后处理高风险编辑器逻辑”的渐进路线。第一轮收益最高的工作是：

1. 建立语义化样式变量，统一 Button、IconButton、表单控件和反馈提示。
2. 复用现有 `AnimatedDialog`，统一弹窗关闭、焦点、忙碌状态及层级，补齐菜单与弹出层基础能力。
3. 拆分写作工作区的导航、面板尺寸和页面视图，保留编辑器实例及保存链路的稳定性。
4. 将共享封面与排版底层从页面目录下移，消除公共层反向依赖页面的问题。
5. 将应用主题、封面皮肤、阅读纸张和正文格式分开管理，再通过明确的适配层协作。

不建议第一轮引入一整套新 UI 框架、通用 CRUD 框架、全局表单引擎或万能业务 Store。当前依赖已经足够支持小步重构。

### 1.1 本轮明确不涉及

- Agent 编排、工具执行、RAG、向量检索、提示词与模型能力设计。
- 主进程业务协议、数据库结构和书籍存储格式的重做。
- 将现有前端布局重新设计成另一套视觉产品。

文中涉及 `features/agent`、`window.storyOSAgent` 的内容，仅用于说明前端状态依赖、组件复用和桌面接口边界。对话输入框复用属于后续可选工作，不作为首批重构前置条件。

## 2. 现状与证据

### 2.1 技术基础

根据 [package.json](../../package.json)、[渲染器配置](../../vite.renderer.config.ts) 和 [入口](../../src/renderer/index.tsx)：

- Electron + Vite + React + TypeScript，使用 Hash Router。
- Tailwind CSS 4，通过 Vite 插件接入；同时使用业务 CSS 文件与内联样式。
- 已有 `clsx`、`tailwind-merge`、`class-variance-authority`；`cn()` 已在多处使用，本次检索未发现 renderer 中使用 `cva()`。
- 编辑器使用 Tiptap / ProseMirror；阅读器使用 Three.js 与 React Three Fiber。
- 已使用 Zustand 承载对话数据，不代表所有业务状态都应搬入 Zustand。
- TypeScript 和 Vite 均配置了 `@/` 指向 `src/`，可直接用于后续整理引用路径。

### 2.2 静态规模

统计口径：使用 `rg --files src/renderer` 筛选 `.ts/.tsx/.css`；生产文件排除 `.test.` 文件，仍包含声明文件与浏览器预览实现。行数包含空行与注释，标签按源码出现次数统计，并非运行时组件数量。

| 指标 | 当前值 | 含义 |
| --- | ---: | --- |
| TS / TSX / CSS 文件总数 | 180 | 包含 18 个共置测试文件 |
| 非测试文件 | 162 | 合计 18,678 行 |
| 非测试 TSX 文件 | 79 | 多数界面仍直接使用原生标签 |
| CSS 文件 | 10 | 部分 CSS 多条规则压在一行，不能只按行数判断复杂度 |
| 原生 `<button>` | 232 | 是抽样寻找重复的线索，不应机械要求全部替换 |
| `<input>` / `<select>` / `<textarea>` | 23 / 7 / 5 | 表单结构、尺寸、焦点与错误样式可统一 |
| `<AnimatedDialog>` 调用 | 2 | 导出书籍、重命名项目 |
| 原生 `<dialog>` | 3 | 设置离开确认、开发者确认、记录编辑器 |
| `role="dialog"` | 9 | 包含 AnimatedDialog 自身及旧配置弹窗，不等于 9 个活跃业务弹窗 |

补充：`DeleteBookItemDialog` 使用 `role="alertdialog"`，不在上表 `role="dialog"` 数量中。`ConfigurationDialog` 只有定义及同文件导出，本次全 renderer 检索未发现外部使用，需按遗留候选处理，不应计为正在使用的设置入口。

### 2.3 需要优先审视的文件

| 文件 | 行数 | 分析结论 |
| --- | ---: | --- |
| `pages/book/BookWorkspacePage.tsx` | 914 | 页面编排、导航、上下文、尺寸控制与 JSX 混合，优先拆分 |
| `pages/book/editor/ChapterRichTextEditor.tsx` | 665 | 保存、草稿、外部内容同步、分页指令、桥接与视图混合，价值高但风险也高 |
| `pages/book/components/BookCatalogPanel.tsx` | 475 | 尺寸、持久化、筛选、展开、删除和目录视图可分离 |
| `pages/book/editor/ChapterEditorToolbar.tsx` | 412 | 内置 ToolbarButton、ToolbarMenu，与编辑器命令耦合 |
| `pages/book/useBookWorkspace.ts` | 404 | 同时管理快照、正文缓存、草稿版本及写入队列，不能简单套通用请求 Hook |
| `features/project/components/CreateProjectDialog.tsx` | 293 | 可以复用弹窗和表单基础层，业务流程继续留在项目模块 |
| `pages/bookshelf/BookshelfPage.tsx` | 292 | 返回阅读位置、弹窗目标、项目打开流程与展示混合 |
| `layouts/workspace/components/ProjectConversationTree.tsx` | 284 | 展开与行交互可复用，但不宜直接抽象万能树 |

`previewAgentApi.ts` 为 1,106 行，`useAgentWorkspace.ts` 为 753 行。它们是前端预览和状态边界问题的证据，本轮不展开 Agent 内部功能重构。也不应把“超过某个行数”直接等同于设计缺陷；分页算法的长文件与页面堆积具有不同性质。

### 2.4 已经做对、应当保留的部分

| 已有能力 | 保留理由 |
| --- | --- |
| `components/motion` | 已统一动画、关闭生命周期与焦点；优先扩展接入范围 |
| `features/file-browser` | 已形成组件 + Hook + 预览接口的独立功能单元 |
| `bookshelf/transfer`、`archives`、`trash` | 已按业务流程分组，无需重新合并到大页面 |
| `chapterContentExtensions` 与分页引擎 | 已存在跨编辑器 / 阅读器共享的实际调用关系 |
| `editor/commands`、`formatting`、`search`、`clipboard` | 已有清晰的编辑能力边界 |
| 阅读器的章节缓存、纹理缓存、翻页模型 | 是专用领域能力，不适合搬进通用 UI Hook |
| `ConversationViewport` | 对话页及书籍助手已经复用，无需另造消息列表 |
| `bookshelfModel.ts` 等纯函数 | 派生数据已部分脱离 JSX，可沿用这种拆法 |

## 3. 公共组件抽取清单

公共组件的判断标准是：多个真实调用方共享稳定的行为和语义，而不是代码外观相似。只有一个消费者时，可以先做模块内部组件，等第二个实际消费者出现后再提升。

### 3.1 基础控件：第一批建设

| 建议组件 | 当前重复位置 | 应封装内容 | 业务方保留内容 | 优先级 |
| --- | --- | --- | --- | --- |
| `Button` | 设置、书架、新建书籍、开发者页 | variant、尺寸、loading、disabled、focus-visible、默认 type | 点击业务、权限条件、文案 | P0 |
| `IconButton` | 页头、侧栏、编辑工具栏、关闭按钮 | 图标尺寸、可访问名称、pressed、交互反馈 | 图标选择、操作含义 | P0 |
| `Input` / `Textarea` / `NativeSelect` | 配置表单、新建书籍、项目创建、数据库筛选 | 控件外观、错误与禁用状态、ref 与原生属性透传 | 值、转换规则、校验逻辑 | P0 |
| `FormField` | 配置字段、书名简介、项目名称与路径 | label、description、error、自动 ID 关联 | 布局特例和字段业务约束 | P0 |
| `InlineNotice` | 配置保存结果、数据库提示、表单错误 | status / alert 语义、图标、正文与操作区域 | 错误恢复动作与消息归属 | P0 |
| `StatusBadge` | 已连接、保存状态、数量标识 | tone、size、dot 等稳定视觉差异 | 状态判断与文案映射 | P1 |

建议 Button 第一版只有 `primary / secondary / ghost / danger` 和少量尺寸。使用现有 `cva` 管理样式变体，`cn()` 合并调用方类名。不要创建 `bookshelfButton`、`settingsButton` 等业务名称变体。

边界要求：

- Button 默认 `type="button"`；表单提交处明确指定 `submit`。
- `loading` 表示交互进行中，可配合 `aria-busy`；业务是否禁止重复提交仍由调用方负责，不能把按钮禁用当作并发控制。
- IconButton 必须有可访问名称；保留原生 button 的键盘点击语义。
- FormField 负责 `htmlFor`、`aria-describedby`、`aria-invalid` 的连接；错误出现时仍由表单决定焦点移向哪里。
- 先包装原生 select。只有确实需要搜索、自定义选项或特殊弹出行为时才使用自定义 Select。
- 公共 Textarea 只封装基础外观。自动增高可以是独立 Hook；普通简介输入框不必继承聊天输入框行为。

### 3.2 弹窗：统一已有能力，避免再造一套

证据见 [AnimatedDialog](../../src/renderer/components/motion/AnimatedDialog.tsx)、[动效约定](../frontend-motion.md)、[新建书籍](../../src/renderer/features/bookshelf/components/NewBookDialog.tsx)、[删除目录项](../../src/renderer/features/book-workspace/components/DeleteBookItemDialog.tsx)。

建议分成三层：

| 层级 | 建议职责 |
| --- | --- |
| 现有 `AnimatedDialog` | portal、进入退出、busy、焦点、Escape、遮罩、stage |
| `DialogHeader / DialogBody / DialogFooter` | 标题说明、关闭按钮、滚动区、操作区和宽度规范 |
| 业务弹窗 | 字段、验证、导入导出流程、删除规则、错误恢复 |

普通确认可以增加 `ConfirmDialog`；强提示删除可在现有容器上增加明确的 `alertdialog` 语义。不要让每个确认弹窗维护不同计时器和焦点逻辑。

具体迁移顺序：

1. `NewBookDialog`、`CreateProjectDialog`：统一容器和基础表单。新建成功后的连续弹窗切换，应等退出生命周期完成再打开下一层。
2. `DeleteBookItemDialog`：移除 `setTimeout(onClose, 160)` 及重复焦点实现，保留针对卷、章、页的不同删除描述与约束。
3. `ImportBookDialog`：沿用业务状态机，对齐导出弹窗的公共容器；新增拖放内容包装区，或为容器提供经过约束的拖放事件接口。当前 AnimatedDialog 并没有任意 overlay 事件透传，不能机械替换后丢失拖放。
4. 归档、恢复、永久删除：纳入同一关闭和焦点策略，再移除 `useBookshelfDialogFocus` 的重复职责。
5. 设置离开确认与开发者弹窗：最后处理原生 dialog 的 top layer、后台 inert 和嵌套行为差异。

必须保留的语义：

- 按钮、取消、完成均调用 AnimatedDialog 提供的 `close`；父级 `onClose` 最终卸载。
- `beforeClose` 当前使用 `Promise.allSettled`，清理失败也会关闭。它只能承担尽力清理，不能承担“保存成功后才允许离开”之类的业务前置条件。
- `stage` 驱动尺寸与内容过渡，不作为业务子树 React key。
- 现有自定义焦点实现主要基于 DOM 中最后一个 `[role="dialog"]` 判断顶层。未来支持 alertdialog、嵌套菜单和原生 dialog 时，应显式管理浮层归属，不能只复制这个查询。
- 归档列表打开恢复弹窗时，只有顶层响应 Escape；关闭后回到正确触发按钮，底层不能同时抢焦点。
- 当前配置弹窗疑似无调用，应先确认后删除或作为兼容入口迁移，不应继续强化一个闲置实现。

### 3.3 菜单、Select 与 Popover：共享机制，保留不同语义

现有至少四套值得对照的实现：

- [BookActionMenu](../../src/renderer/features/bookshelf/components/BookActionMenu.tsx)：实测尺寸定位、ResizeObserver、portal、方向键、焦点恢复、进入退出动画。
- [ProjectActionMenu](../../src/renderer/layouts/workspace/components/ProjectActionMenu.tsx)：固定菜单宽高、portal、外部点击与 Escape，键盘支持与书架版本不一致。
- [ReaderSelect](../../src/renderer/features/reader/ReaderSelect.tsx)：combobox / listbox、选中项焦点、窗口变化关闭。
- [ChapterEditorToolbar](../../src/renderer/features/book-workspace/editor/ChapterEditorToolbar.tsx)：内部 ToolbarMenu，用阻止鼠标默认行为维持编辑器选区。

建议抽取关系：

```text
浮层基础：定位、碰撞处理、外部交互关闭、层级、焦点恢复
  ├─ ActionMenu：命令列表、分隔线、危险项、禁用原因
  ├─ Select：值选择、选中项、键盘移动
  └─ Popover：一般内容承载

EditorToolbarMenu：Select / Popover 的编辑器适配层
```

不要把 ActionMenu 的动作和 Select 的 value 混为一个泛型菜单。书架和项目操作可以共享 ActionMenu，阅读设置保持 Select 语义，编辑器适配层负责选区保存、恢复与命令执行。

通用层需要覆盖：内容变化后的重新定位、滚动与缩放、视口边缘、Tab 离开、Escape 优先级、关闭期间 inert、禁用项策略、触发器卸载后的焦点恢复。

书架菜单可以提供迁移素材，但不能原样提升为基础库：其动画时长仍在组件内，且当前布局偏向书卡旁侧展开。应把定位策略与动画令牌参数化，再接入项目菜单验证。

### 3.4 页面框架与布局能力

| 建议能力 | 来源 | 合理抽取边界 |
| --- | --- | --- |
| `PageSurface` | 书架、写作工作区等外层 section | 边框、圆角、min-width/min-height、表面背景；不管理路由 |
| `PageHeader` | 书架、设置、工作区页头 | title、description、leading、actions 插槽；允许不同高度和密度 |
| `PanelHeader` | 目录、助手、开发者分栏 | 面板级标题与操作槽，保持与页面级标题区分 |
| `ResizableHandle` + `useResizablePanel` | 目录宽度、助手宽度 | pointer capture、键盘步进、min/max、清理、完成回调 |
| `Collapsible` | Workspace 的 AnimatedCollapse | 复用现有 grid 展开模式与 inert，并改用公共动效令牌 |
| `EmptyState / ErrorState / LoadingState` | 书架、工作区、开发者页 | 图标、说明、动作槽；骨架布局继续由业务提供 |
| `SearchInput / SegmentedControl` | 书架搜索、目录模式、数据库页签 | 公共输入与选择交互，筛选规则留在业务 |

无需让阅读器强行套用普通工作区 PageHeader；沉浸式布局具有独立需求。也不建议现在创建一个能任意拖动、停靠、持久化所有分栏的工作台框架。

布局方面已有一个值得修正的模型分歧：BookWorkspacePage 用 `getCatalogPanelWidth()` 估算助手可用空间，而 BookCatalogPanel 自己持久化实际目录宽度。后续应将实际尺寸汇总到同一个页面布局控制器，使用容器宽度与实际可见面板宽度计算约束，避免双份宽度模型。

### 3.5 提示与反馈

WorkspaceLayout、BookshelfPage、BookWorkspacePage、DeveloperPage 均自行展示错误或成功提示，样式、位置和层级不同。

建议区分：

- **字段错误**：靠近字段，不自动消失。
- **InlineNotice**：当前面板或流程的错误、警告、状态，可带恢复动作。
- **Toast**：非阻塞成功提示或全局操作结果，统一堆叠、关闭和去重。
- **ErrorState**：整块内容无法加载，明确提供重试。

错误归属由触发业务决定，基础 Toast 不捕获所有 Promise。当前新建书籍等流程可能同时把错误保存在 Hook 和弹窗内，迁移时要明确由谁展示，避免同一失败被通知两次。持续加载失败、草稿冲突不应只用短暂 Toast 展示。

### 3.6 领域组件与可选抽取

| 候选 | 推荐处理 |
| --- | --- |
| `BookCoverArtwork` + `bookshelfThemes` | 移入共享书籍领域展示模块；公共组件不再依赖页面 |
| 书卡、精选书籍、列表书行 | 共享封面、元数据和动作接口；保留不同布局，避免几十个布局开关 |
| `SaveIndicator` | BookProfilePanel 和 ChapterEditorPanel 可共享视觉层；保存状态映射由各自流程负责 |
| 项目会话树、书籍目录树、数据库目录 | 优先共享折叠、行容器、空态；排序、加载、选择和操作各不相同，暂不做万能 Tree |
| 导入 / 导出 | 保留独立状态机；复用 FormatGrid、步骤条、状态面板和弹窗结构 |
| 对话输入框 | 可共享自动增高、发送锁、输入法处理及基础容器；项目上下文和正文关联保留适配层，低优先级 |
| DatabaseTable / RecordEditor | 暂留开发者领域，不能仅因“都有列表和表单”就抽全局 CRUD |

## 4. 模块化方案

### 4.1 依赖方向

建议统一为：

```text
应用启动与路由
  → 页面组合 / 工作区布局
    → 业务功能模块
      → 共享领域能力、基础 UI、桌面接口适配
        → React / 浏览器能力 / src/shared 协议
```

约束：

- `components/ui` 不读取 Router、workspace context、桌面 API 或业务 Store。
- 业务模块通过明确的公共入口对外提供组件、Hook 和类型。
- `pages` 负责路由参数、页面组合与少量跨模块协调；其他模块不反向引用 `pages`。
- 不把整个桌面 API 对象传遍组件树；用实际需要的能力或领域适配器。
- `src/shared` 保持跨进程契约与纯数据能力，不放 React、DOM 测量和浏览器专用主题状态。

### 4.2 建议目录

这是目标归属图，并非要求立即创建所有目录。仅迁移已经需要复用或正在修改的单元。

```text
src/renderer/
  app/
    bootstrap/                 # 桌面 / 显式预览启动选择
    theme/                     # 应用主题定义、解析、持久化、DOM 应用
  components/
    ui/                        # Button、Field、Menu、Notice、Dialog 结构
    layout/                    # PageSurface、PageHeader、ResizableHandle
    motion/                    # 保留已有入口
  features/
    book-presentation/         # 封面组件与皮肤注册表
    book-content/              # 共享正文 schema / 渲染扩展与排版底层
    book-workspace/
      model/                   # 导航、布局、快照协调
      components/              # 工作区页头、目录、书籍概览
      editor/                  # 编辑器、保存会话、命令及工具栏
      pagination/              # 编辑器专有分页适配
    bookshelf/
      model/                   # 筛选、总计、返回阅读位置
      components/
      transfer/
      archives/
      trash/
    reader/                    # 阅读会话、纸张主题、分页适配、3D 场景
    project/                   # 保留并逐步收敛项目相关前端能力
    file-browser/              # 保留
    agent/                     # 本轮保留已有功能
  platform/
    desktop/                   # window.storyOS* 的薄适配层
    preview/                   # 开发预览实现与场景数据
  lib/                         # 小型跨领域纯函数
  pages/                       # 各路由入口和页面组合
  layouts/                     # WorkspaceLayout 等路由布局
```

不新增与现有 `src/shared` 重名的 renderer/shared 大杂烩。`src/lib/utils.ts` 的 cn 已可复用，不必仅为目录整齐重复实现。

### 4.3 写作工作区拆分

以 [BookWorkspacePage](../../src/renderer/features/book-workspace/BookWorkspacePage.tsx) 为主要对象，按状态生命周期拆分：

| 建议单元 | 从现有页面迁出的职责 | 对外提供 |
| --- | --- | --- |
| `useBookNavigation` | 当前章节、页目标、requestId、select/append/move/delete 导航 | 当前导航状态与明确动作 |
| `useBookWorkspaceLayout` | 目录 / 助手显隐、聚焦模式、实际宽度、断点约束 | 布局状态、尺寸与快捷操作 |
| `BookWorkspaceHeader` | 项目 / 书籍路径、连接状态、面板开关 | 纯 props 视图 |
| `BookWorkspaceContent` | 初始化概览、载入正文、章节编辑、书籍概览的展示分支 | 接收明确内容状态 |
| 模块内部的会话适配 Hook | URL conversation 参数与会话切换、发送前 flush 的协调 | 当前既有接口的封装，不改 Agent 行为 |

不要创建一个 900 行 `useBookWorkspacePage()`，仅把所有逻辑从 TSX 搬到 Hook 不会降低耦合。

导航状态宜使用联合类型或局部 reducer，减少“activeChapterId 已变但 pageTarget 仍属于旧章节”的组合状态。相互独立的布局开关可继续 useState，无需把所有变量塞进一个 reducer。

页面目标可参考 200～300 行，但这只是审查提示，验收应看职责和依赖是否清晰，而非行数是否达标。

### 4.4 编辑器拆分：独立实施

[ChapterRichTextEditor](../../src/renderer/features/book-workspace/editor/ChapterRichTextEditor.tsx) 目前包含：

- 草稿冲突与恢复；300ms 草稿保存、5s 正式保存。
- 串行 Promise 保存链和当前 revision 引用。
- flush、失焦保存、外部内容差异同步。
- Tiptap 实例、分页控制器、页导航请求。
- 字数与选区上下文发布、命令桥接、查找替换视图。

建议先分离三个生命周期相对完整的单元：

1. `useChapterPersistence`：pending、草稿定时器、正式保存队列、revision、flush、保存状态。其输入仍带章节身份与 revision，不封装成任意数据的 `useAutosave<T>`。
2. `useChapterPageCommands`：导航 requestId 去重与追加、移动、删除页指令；继续调用现有分页命令模块。
3. 编辑器上下文 / bridge 适配：向现有调用方发布选区与文档信息，保留协议不变。

Tiptap 实例与文档会话生命周期仍由编辑器入口明确拥有。不能因为拆 Hook 而制造多套 pendingContent 或 revision 引用。

特别注意：

- 当前 `ChapterEditorPanel` 使用 `key={chapter.id}` 表达章节身份切换；不要把它和“为动画加 key”混淆。
- 主题、面板宽度、工具栏状态不得成为编辑器 key，避免选择、撤销栈与未保存内容重置。
- 外部内容更新使用 transaction metadata 排除再次持久化；抽取时保留该策略。
- `useBookWorkspace` 的每章节写入队列与草稿版本管理不可被通用请求封装抹平。
- 外部刷新、快速换章、失焦、离开路由以及已有内容同步必须验证；这部分不能只做截图验收。

### 4.5 正文与分页公共层

[readerPagination.ts](../../src/renderer/features/reader/readerPagination.ts) 已经直接依赖写作页中的 `createChapterContentExtensions`、`measurePaginationFragments`、`paginateFragments`。

建议将真实共享的能力移入 `features/book-content`：

- 正文渲染 schema 与必要扩展。
- 纯分页模型 / 引擎及其直接依赖闭包。
- DOM 测量器，以及明确的测量环境输入。

保留两端适配：

- 编辑器：transaction、选择、可编辑页导航、局部重排。
- 阅读器：只读净化、阅读字号行高、章节分页缓存、锚点与跨页编排。

不能把编辑器和阅读器合成同一个“通用分页组件”。两者共享底层度量和分割能力，但状态、布局与交互语义不同。迁移应先保持 API 不变，通过薄重导出过渡，再清理旧导入。

### 4.6 书架与设置

书架建议优先处理三件事：

- 将模块级 `readerReturn` 对象封装为书架返回位置状态，明确查询、视图、滚动、焦点标识的生命周期。不要把 DOM 元素引用持久化。
- 用 `useBookshelfActions` 收敛打开项目、为书籍创建项目、回收等跨模块动作，列表筛选继续使用纯函数。
- 当前页面存在多个 boolean / nullable target 控制弹窗；如果业务要求同一时刻只有一个管理弹窗，可使用联合类型表达目标。归档 → 恢复属于合法嵌套，不应被简单互斥状态破坏。

设置建议保留 `ConfigurationPanel` 的配置职责。添加外观设置时使用独立 `AppearanceSettingsSection`，不要把主题状态放进模型配置请求；主题即刻预览和模型配置保存的 dirty / saving 语义应分别管理。

## 5. 通用且可扩展的主题体系

### 5.1 当前主题能力的真实边界

| 现状 | 位置 | 局限 |
| --- | --- | --- |
| 基础语义色已定义 | `index.css` 的 `@theme` | 当前是固定浅色值，没有完整的运行时应用主题切换 |
| 大量页面直接指定 neutral / white / violet / 色值 | 工作区、书架、目录、表单等 | 只改背景和 foreground 无法完成整套主题 |
| 10 个书籍皮肤 | `bookshelfThemes.ts` | 实际是封面视觉，类型包含 Tailwind className，不是应用主题 |
| 阅读器自身 UI 变量 | `reader.css` 的 `--reader-*` | 已部分独立，但仍混有字面颜色与特例 |
| 纸张颜色由偏好决定 | `PageContentLayer.tsx:14` 附近 | 用 dark/paper 三元表达式决定 paper / ink |
| DOM 绘制成书页纹理 | `renderPageCanvas.ts` | 主题变更还影响纹理缓存，不能只修改 CSS |

### 5.2 四个维度独立建模

1. **应用界面主题**：工作区背景、面板、文字、边框、操作、状态色。
2. **书籍封面皮肤**：封面渐变、装饰、文字、书脊。默认按 bookId 稳定选择的现有行为可以保留。
3. **阅读主题**：阅读器控件外观与 paper / ink / 页码 / 阴影等读物表面参数，可在同一注册表下区分 ui 与 paper 槽位。
4. **正文排版与内容格式**：字号、行高、字体、缩进、文档显式颜色等；这是内容或阅读偏好，不应被全局主题覆盖。

应用夜间主题不必强制将所有书籍封面和纸张变黑。封面本身就是视觉作品，暖白纸张配暗色阅读控件也是合理组合。

### 5.3 令牌分层

| 层 | 示例 | 维护方式 |
| --- | --- | --- |
| 基础值 | 色阶、间距、圆角、阴影尺度 | 主题实现或基础样式内部使用 |
| 语义令牌 | surface、text、border、action、status | 页面和组件优先消费，作为稳定契约 |
| 组件令牌 | control-height、dialog-radius、panel-padding | 仅在多个组件确实共享时建立 |
| 领域令牌 | cover-spine、reader-paper、editor-canvas | 留在领域模块，必要时引用语义令牌 |

建议先覆盖这些语义，而非把每个颜色值都变成变量：

| 类别 | 建议语义 |
| --- | --- |
| 表面 | app、panel、subtle、raised、overlay |
| 文字 | primary、secondary、muted、inverse、disabled |
| 边框 | default、strong、subtle、focus |
| 操作 | primary、primary-hover、selected、selected-foreground |
| 反馈 | success / warning / danger / info 的背景、文字、边框 |
| 几何 | 控件 sm / md 高度、control / panel / dialog 圆角 |
| 层级 | 普通内容、sticky、popover、modal、notification 的命名令牌 |
| 动效 | 继续使用已有 `--motion-*`，不平行建立另一套时长 |

现有 `background / foreground / card / primary / muted / border / ring` 可以保留为兼容映射。逐步完善它们，避免第一轮同时改完所有类名。

注意 z-index 令牌只能统一普通层叠上下文，不能让普通 portal 越过原生 dialog 的 top layer。原生弹窗内的菜单应拥有正确容器，或随着整个弹窗迁移再统一浮层管理。

### 5.4 主题定义与解析

建议使用“类型约束的主题注册表 + 小型解析器 + CSS 变量输出”，无需做插件市场或任意脚本主题。

以下仅展示契约形状，省略具体 token 键和实现：

```ts
type ThemePreference = {
  version: 1;
  appearance: "light" | "dark" | "system";
  paletteId: string;
};

type ThemeDefinition = {
  id: string;
  label: string;
  schemes: {
    light: AppSemanticTokens;
    dark: AppSemanticTokens;
  };
};

// resolveTheme 校验已存偏好，解析 system，返回完整 token 集合。
// applyTheme 只把解析结果写入主题根节点，业务组件不做模式判断。
```

第一阶段只注册默认一组 light / dark 配色，`paletteId` 用于后续扩展。每个模式必须满足完整 token 契约；需要继承时在注册阶段补齐并校验，不在每个组件里散落 fallback。

建议运行过程：

1. 启动时从本地偏好读出经过验证的版本、模式和配色 ID。
2. 用户偏好为 system 时监听 `prefers-color-scheme`；手动指定时不被系统变化覆盖。
3. 解析完整语义变量，应用到 `document.documentElement` 并同步 `color-scheme`。
4. 首次 React 渲染前完成必要初始化，避免首次浅色闪烁。
5. 用户切换后更新变量与偏好；清理系统监听器，兼容 StrictMode 重放。

首次使用、旧版本或非法主题 ID 可以在偏好入口迁移到默认主题，并写明迁移规则；业务对象缺失不能用主题 fallback 掩盖。仅保存 UI 偏好，不复制正文、草稿或其他业务数据。

本轮可以使用 renderer 本地持久化能力；若未来要求跨窗口、跨设备同步，再明确接口。不要为了主题先修改 Agent 配置协议。

### 5.5 Portal 和局部主题是关键细节

AnimatedDialog、BookActionMenu、ProjectActionMenu、ReaderSelect、阅读器纹理捕获层均存在 portal 到 `document.body` 的情况。

- 全局主题写到 html，可让 body 下浮层自然继承。
- 局部阅读器变量定义在 `.reader-shell`，portal 到 body 后不会自动继承这棵 DOM 子树的 CSS 变量。
- React Context 会随 portal 保留，但 CSS 继承按真实 DOM 进行，两者不能混淆。
- 可以由统一 OverlayHost 明确传递局部主题属性 / CSS 变量，或选择合适 portal 容器；同时验证 overflow 裁剪与 z-index。
- 纹理捕获 DOM 也必须获得完整纸张、正文与领域样式，不能只给屏幕上的书页切换主题。

### 5.6 阅读器的缓存与颜色扩展

当前 `ReaderStage.tsx:50` 的 surfaceKey 已包含 theme、字号、行高、页面尺寸、页侧和绘制倍率；当前 dark/paper 切换已有对应缓存区分。不能把它描述成“完全没有主题缓存处理”。

扩展主题后需要增加规则：

- 如果同一个 theme ID 可更新内容，纹理 key 应增加主题版本或解析后外观签名。
- 页面纹理实际消费的封面皮肤变化，也必须触发对应封面纹理失效。
- 只有纸张颜色改变时，无需重做正文几何分页；重新生成视觉纹理即可。
- 字体、字号、行高、可用宽高改变时，需要更新测量 key 并恢复阅读锚点。
- 当前章节测量缓存 key 已包含 snapshot、chapter、字号、行高与页面尺寸，后续增加自定义字体时应补充字体身份及其就绪状态。
- 不对大量书页同时做颜色过渡或批量预生成纹理；保留现有纹理预算、pin 和 dispose 机制。

正文中已有显式文字色 / 背景色时，暗色纸张上的可读性是独立问题。建议定义阅读显示策略并评估实际内容，不能通过全局 `!important` 覆盖正文，也不能因为切主题修改保存的文档。

### 5.7 样式迁移规则

| 当前写法 | 推荐归属 |
| --- | --- |
| `bg-white text-neutral-900 border-neutral-200` | 表面、文字、边框语义 token |
| `hover:bg-neutral-100` | 控件 / 行项目 hover token |
| `bg-violet-50 text-violet-700` | selected 或强调语义；先确认业务含义 |
| 红 / 绿 / 黄提示组合 | danger / success / warning token |
| `#f5f5f2`、`#f6f6f4`、`#f7f7f5` | 对比实际视觉用途后归并为少量表面角色，不按相近色值盲目合并 |
| 封面渐变和装饰颜色 | 封面皮肤注册表，允许合法保留字面值 |
| 页尺寸、页边距、动态面板宽度 | 布局变量或排版模型，不能一概替换为全局主题 |
| ProseMirror 正文属性 | 内容格式，保留 |

保留 Tailwind 做布局、响应式和少量状态组合；共享控件由组件变体统一视觉；书架装饰、编辑器正文和 3D 阅读器仍可以使用领域 CSS。必要时将多规则压在一行的 CSS 格式化并按职责拆段，单独提交，减少和语义改造混合的 diff。

当前 `.reader-shell button` 等宽泛选择器可能覆盖未来公共 Button。接入阅读器时应限定到 reader 专有控件类，或提供主题化适配，避免 specificity 竞赛。

## 6. 状态、接口与横切逻辑

### 6.1 状态所有权

| 状态 | 建议所有者 |
| --- | --- |
| 当前路由、projectId、conversation 查询参数 | 路由入口 / 页面协调层 |
| 菜单开关、局部表单输入 | 组件本地状态 |
| 目录宽度、助手显隐 | 工作区布局 Hook；需要时持久化 |
| 应用主题 | 小型主题 Provider / Store，独立于 Agent 状态 |
| 书架数据、回收站数据、操作结果 | 对应领域 Hook / 数据层 |
| 文档实例、未保存正文、revision、保存队列 | 编辑器会话与书籍领域数据层 |
| 阅读锚点、页缓存、纹理缓存 | 阅读器模块 |

`WorkspaceOutletContext = ReturnType<typeof useAgentWorkspace>` 使页面消费完整 workspace 返回对象。短期可增加窄的访问接口，逐步分离布局、项目导航、配置等职责；高频数据是否造成额外渲染需要 React Profiler 验证。单纯拆 Context 但不稳定 value 或订阅粒度，并不保证性能改善。

### 6.2 桌面接口的薄适配

当前多个 Hook 和弹窗直接访问 `window.storyOSAgent` / `storyOSWindow` / `storyOSDeveloper`。建议由 `platform/desktop` 负责能力检查和跨进程错误归一化，业务模块定义薄的领域接口，例如 books、reader、files。初期不改变 preload 的现有方法名和协议。

不要把一个总 API 简单重新包装成另一个总 API。适配层的价值是：调用方只依赖需要的能力；浏览器预览可以替换；缺失能力有明确错误；基础组件无需知道 Electron。

`previewAgentApi` 和 `previewWindowApi` 已有 DEV + preview 开关，不能说它们会无条件在生产模拟成功。问题在于启动副作用挂在 WorkspaceLayout import 上，且预览数据集中。可逐步迁入显式 bootstrap，并按书架、阅读器、文件浏览等场景拆开，以支持前端组件和主题验收。

### 6.3 异步行为：共享最小机制

已有相似模式：loading / error / notice、requestId、disposed、busy。应先统一行为约定，再决定是否提取 Hook：

- `getErrorMessage` 可合并为小型工具；导出流程当前还去除 IPC 错误前缀，适合迁到桌面错误适配层统一处理。
- 列表读取遵循 latest-result-wins，可复用请求代次管理；窗口 IPC 没有取消能力时，应明确是忽略旧结果，而不是声称终止主进程请求。
- 修改操作分别决定串行、拒绝重复或按对象并发。不能用一个全局 busy 锁住所有业务。
- 加载已有数据时区分首次 loading 与 refreshing，避免后台刷新清空可读内容。
- 失败是返回结果还是抛出异常应在同一模块统一，不要让公共 Hook 同时“吞异常 + 返回 null + 展示 Toast”。

可复现性待验证的风险：`useFileBrowser.readDirectory` 请求返回后直接写状态，没有看到与目录请求绑定的版本校验。快速搜索 / 换目录时存在旧结果覆盖新结果的可能；应以延迟不同的请求场景验证后修复。此处是静态风险判断，不是已经运行复现的故障。

### 6.4 快捷键

WorkspaceLayout、书架、写作工作区、编辑器和阅读器分别注册快捷键。工作区的 Ctrl+K 与书架 Ctrl+F 没有统一的弹窗 / 输入目标仲裁；写作页 Ctrl+B / Ctrl+J 已检查可编辑元素。

建议先建立共享 `isEditableTarget` 和明确的 scope 规则：顶层弹窗优先、编辑器命令归编辑器、页面命令仅在对应页面激活。以后多处需要再提供轻量 `useHotkey`。不要首轮建立复杂命令总线，也不要用全局快捷键截断输入法组合输入。

## 7. 需要防止的过度抽象

| 不建议做法 | 更合适的处理 |
| --- | --- |
| 把所有 JSX 搬到一个巨大 Hook | 按导航、布局、保存会话等独立生命周期拆分 |
| 给 Button 加页面名称变体 | 以语义 variant + size + 插槽表达 |
| 通用组件接收整个 workspace | 接收所需字段与动作 |
| 所有状态搬到全局 Store | 根据生命周期和实际消费者决定 |
| 用通用 useAsync 替换编辑器保存 | 保留 revision、队列、草稿与冲突语义 |
| 合并阅读器与编辑器的分页状态 | 只共享 schema、测量与纯引擎 |
| 一个万能树 / CRUD / 多步骤表单引擎 | 先共享叶子控件与真实重复行为 |
| 一次性消灭所有硬编码颜色 | 先迁移应用 UI；封面与正文保留领域含义 |
| 每个目录都强制 components/hooks/store/service | 有实际职责时才创建，避免无意义转发文件 |
| 为主题切换重挂载页面 / 编辑器 | 修改主题变量与必要缓存，不修改身份 key |
| 通过全面 memo 获得性能 | 先测量渲染来源、订阅粒度与长列表开销 |

## 8. 分阶段实施建议

优先级含义：P0 是先建立的基础；P1 是紧随其后的主线；P2 可延后。相对工作量 S / M / L 仅用于比较，包含相应回归，不是工期承诺。

| 阶段 | 改动包 | 收益 | 风险 / 工作量 | 验收结果 |
| --- | --- | --- | --- | --- |
| 0 | 建立当前页面截图、交互与类型检查基线；清点活跃弹窗 | 为等价重构提供证据 | 低 / S | 区分既有问题和重构回归 |
| 1，P0 | 默认浅色语义 token、Button / IconButton / Field / Notice；设置 + 新建书籍试点 | 立即降低重复，验证 API | 低至中 / M | 两个不同模块能复用，当前外观基本保持 |
| 2，P0 | 弹窗结构与生命周期迁移；菜单底层 + 项目 / 书架接入 | 统一交互和可访问性 | 中 / M～L | 关闭、焦点、busy、嵌套及键盘流程一致 |
| 3，P1 | PageSurface / Header、resize；拆 BookWorkspacePage 和书架页面编排 | 页面职责可读、布局规则单一 | 中 / M～L | 页面只协调模块；宽度计算来源一致 |
| 4，P1 | 共享封面和正文底层下移；薄接口与预览边界整理 | 消除跨页面引用，便于独立开发 | 中 / M | 共享层不再依赖页面；协议不变 |
| 5，P1 | 全局 light / dark / system、其余 UI token 迁移、阅读与 portal 适配 | 新主题可通过定义扩展 | 中至高 / L | 所有活跃页面、浮层、3D 纹理正确适配 |
| 6，P2 | 编辑器保存会话与分页指令拆分；必要的性能优化 | 降低复杂逻辑维护成本 | 高 / L | 正文、草稿、撤销与阅读锚点回归通过 |

阶段 1 先建立完整 token 契约并保持当前浅色；阶段 5 才对用户开放全局主题切换，避免“设置页深色、书架与弹窗仍浅色”的半成品。主题方案验证可以提前在开发预览中进行。

### 8.1 推荐的首个落地改动包

将第一轮控制在以下边界：

- 新增小型基础控件目录和语义变量兼容映射。
- 以 ConfigurationPanel 与 NewBookDialog 验证 Button / Field / Notice 的跨模块复用。
- NewBookDialog 接入现有 AnimatedDialog，处理创建成功到下一弹窗的退出顺序。
- 保持现有浅色视觉、路由和桌面 API 行为。

这批工作完成后，再确定后续公共组件接口。它能快速揭示“抽象是否真的减少调用方代码”，同时避开编辑器保存链路。

### 8.2 拆分提交的原则

目录搬迁、控件替换、主题行为、业务状态机改造分别提交。一个改动包有明确的试点与回归范围；先迁移两个真实消费者，再扩大接入，避免一次性加入大量无人使用的公共组件。

## 9. 验证与完成标准

### 9.1 工程检查

- 小范围 UI 重构先运行 `npm run typecheck` 和相关文件 ESLint。
- 后续可以增加 renderer 的 lint 脚本与路径边界规则，禁止公共层引用 pages。现有 `npm run check` 最后执行的是 `lint:agent`，并不覆盖 renderer lint。
- 现有 tsconfig 未启用完整 strict；不要将启用全部严格选项混入首批控件重构。需要时对新模块逐步收紧。
- 目录搬迁核对动态 import、测试路径与业务 CSS 引入，尤其是阅读器和编辑器的 lazy 边界。
- 不为纯样式映射编写机械快照测试；交互组件、主题解析和异步一致性需要能验证真实行为的测试。

### 9.2 场景矩阵

| 范围 | 必测场景 |
| --- | --- |
| Button / Field | 键盘激活、form submit、disabled、loading、防重复提交、label 与错误描述 |
| Dialog | 打开 / 关闭 / 快速重开、Esc、遮罩、busy、失败后重试、初始焦点、恢复焦点、嵌套 |
| Menu / Select | 四角定位、长文案、滚动、缩放、方向键、Home / End、Tab、禁用项、触发器消失 |
| Layout | 窄窗口、常用桌面宽度、高 DPI；拖动、键盘调宽、改变窗口尺寸、隐藏后重新显示 |
| Theme | light / dark / system、重启恢复、非法偏好、系统切换、portal、原生 dialog、空态与错误态 |
| Book workspace | 换项目、换章、页导航、目录增删、路由离开；主题切换不重建编辑器 |
| Editor | 连续输入、中文输入法、选区格式、撤销重做、粘贴、保存失败、草稿冲突、外部内容同步 |
| Reader | plain / 3D、paper / dark、字号行高、纹理刷新、锚点恢复、图形失败回退 |
| Motion | prefers-reduced-motion、快速关闭、退出期间输入、监听器与动画清理 |
| Data hooks | 请求乱序、组件卸载、重复点击、后台刷新保留数据、每个错误只在负责位置出现 |

### 9.3 利用已有验证资产

仓库已有下列脚本，可在实际实施时读取其启动条件，按改动范围选择：

- [共享动效验证](../../scripts/verify-shared-motion.mjs)
- [导出弹窗动效验证](../../scripts/verify-export-dialog-motion.mjs)
- [书架操作验证](../../scripts/verify-bookshelf-actions.mjs)
- [分页端到端验证](../../scripts/verify-pagination-e2e.mjs)
- [阅读器 V2 验证](../../scripts/verify-reader-v2.mjs)
- [阅读器模型验证](../../scripts/verify-reader-v2-model.mjs)
- [阅读器打包验证](../../scripts/verify-reader-packaged.mjs)

这些文件的存在不代表覆盖了本文所有建议，也不代表本次已经执行。涉及原生 Electron dialog / 文件选择 / 打包行为时，应在对应桌面环境回归，不能仅依赖浏览器 preview。

### 9.4 可度量的完成条件

1. UI 基础层没有 router、desktop API 或 pages 依赖；封面与共享排版底层不再反向依赖页面。
2. 迁移范围内的弹窗使用同一生命周期机制；旧焦点 Hook 与计时器实现不再和新容器重复运行。
3. 新增应用配色主要修改主题定义；基础控件不增加 `if (theme === ...)` 分支。
4. 迁移过的应用 UI 不再新增未解释的字面颜色；封面、纹理、正文等合法例外有明确归属。
5. 写作工作区的导航与布局可独立理解；编辑器保存仅有一套状态所有权。
6. 主题 / 布局切换不丢内容、不重置撤销历史；阅读器不会显示旧主题纹理。
7. 关键场景矩阵通过，实际性能收益由测量证明，不预设缩短多少毫秒或减少多少百分比代码。

## 10. 关键源码索引

行号对应分析基线，可用 `git show 835f938:<原路径>` 复核。下列链接已随迁移指向当前文件；删除的遗留实现以原路径文字保留。

| 证据 | 文件与基线位置 |
| --- | --- |
| 固定语义主题变量 | [index.css](../../src/renderer/index.css)，3 行起 |
| 全 workspace outlet 与全局反馈 | [WorkspaceLayout.tsx](../../src/renderer/layouts/workspace/WorkspaceLayout.tsx)，组件主体及 Outlet |
| Context 类型绑定完整 Hook 返回值 | [context.ts](../../src/renderer/layouts/workspace/context.ts)，4 行起 |
| 公共弹窗关闭与 portal | [AnimatedDialog.tsx](../../src/renderer/components/motion/AnimatedDialog.tsx)，21 行起 |
| 顶层对话框查询与焦点保持 | [useDialogFocus.ts](../../src/renderer/components/motion/useDialogFocus.ts)，14 行起 |
| 旧删除弹窗关闭计时器 | [DeleteBookItemDialog.tsx](../../src/renderer/features/book-workspace/components/DeleteBookItemDialog.tsx)，67 行 |
| 书架重复焦点实现 | `useBookshelfDialogFocus.ts`（已移除，参见基线），4 行起 |
| 书架操作菜单 | [BookActionMenu.tsx](../../src/renderer/features/bookshelf/components/BookActionMenu.tsx)，整个组件 |
| 项目操作菜单 | [ProjectActionMenu.tsx](../../src/renderer/layouts/workspace/components/ProjectActionMenu.tsx)，定位与事件 effect |
| 编辑器 ToolbarButton / ToolbarMenu | [ChapterEditorToolbar.tsx](../../src/renderer/features/book-workspace/editor/ChapterEditorToolbar.tsx)，123 / 151 行起 |
| 封面反向依赖页面主题 | [BookCoverArtwork.tsx](../../src/renderer/features/book-presentation/BookCoverArtwork.tsx)，1 行 |
| 10 个封面皮肤与默认分配 | [bookshelfThemes.ts](../../src/renderer/features/book-presentation/coverThemes.ts)，1 行起 |
| 阅读器引用编辑器分页底层 | [readerPagination.ts](../../src/renderer/features/reader/readerPagination.ts)，4–6 行 |
| 纸张颜色与字体变量 | [PageContentLayer.tsx](../../src/renderer/features/reader/PageContentLayer.tsx)，14 行起 |
| 纹理主题 key | [ReaderStage.tsx](../../src/renderer/features/reader/ReaderStage.tsx)，50 行 |
| 纹理来自计算后的 DOM 样式 | [renderPageCanvas.ts](../../src/renderer/features/reader/scene/renderPageCanvas.ts)，函数主体 |
| 章节测量缓存 key | [useBookReader.ts](../../src/renderer/features/reader/useBookReader.ts)，44 行附近 |
| 工作区多职责编排 | [BookWorkspacePage.tsx](../../src/renderer/features/book-workspace/BookWorkspacePage.tsx)，整个组件 |
| 目录宽度状态与持久化 | [BookCatalogPanel.tsx](../../src/renderer/features/book-workspace/components/BookCatalogPanel.tsx)，尺寸处理函数 |
| 保存队列、flush、草稿与内容更新 | [ChapterRichTextEditor.tsx](../../src/renderer/features/book-workspace/editor/ChapterRichTextEditor.tsx)，195 行起及 onUpdate |
| 书籍写入队列与草稿版本 | [useBookWorkspace.ts](../../src/renderer/features/book-workspace/useBookWorkspace.ts)，28 行起 |
| 书架返回阅读位置与弹窗目标 | [BookshelfPage.tsx](../../src/renderer/features/bookshelf/BookshelfPage.tsx)，readerReturn 与组件状态 |
| 目录请求的状态回写 | [useFileBrowser.ts](../../src/renderer/features/file-browser/useFileBrowser.ts)，19 行起 |
| 设置字段基础类与表单行为 | [ConfigurationPanel.tsx](../../src/renderer/pages/settings/components/ConfigurationPanel.tsx)，26 行起 |
| 工程检查覆盖范围 | [package.json](../../package.json) scripts、[tsconfig.json](../../tsconfig.json)、[ESLint 配置](../../.eslintrc.json) |

本轮最合理的投入方向，是先让基础控件、弹窗交互和主题语义形成稳定公共层，再围绕写作、书架和阅读的实际依赖收敛模块。编辑器的内容一致性与阅读器的排版 / 纹理链路应作为独立高风险阶段处理。
