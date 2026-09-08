# StoryOS 书架导入导出中心设计方案

> 日期：2026-09-02
>
> 任务状态：已实施并完成首轮工程验证
>
> 用户确认：已确认按新功能开发流程处理

> 实施结果：自定义文件浏览、原生备份、TXT、Markdown/ZIP、DOCX 双向转换，以及 EPUB、PDF 导出均已接入；PDF/EPUB 按规划不提供导入。

## 1. 结论

书架当前的导入导出不应继续以 Electron 系统文件选择器作为完整交互。系统选择器只能解决“找到一个文件或保存路径”，无法向用户说明 StoryOS 支持哪些格式、每种格式会保留什么、导入后会生成怎样的卷章结构，也无法承载预检、配置、进度和结果反馈。

本次建议新增独立的“书籍传输中心”，并在书架导入导出流程中完全使用 StoryOS 自己的文件浏览界面：

```text
书架
├── 导入书籍
│   └── StoryOS 导入中心
│       ├── 选择格式/拖入文件
│       ├── 自定义本地文件浏览
│       ├── 文件预检与卷章预览
│       ├── 导入选项
│       └── 执行、进度与结果
└── 书籍菜单 → 导出书籍
    └── StoryOS 导出中心
        ├── 选择格式
        ├── 导出能力说明
        ├── 内容与结构选项
        ├── 自定义保存位置浏览
        └── 执行、进度与结果
```

书架流程不再调用 `window.storyOSWindow.pickFile()` 和 `saveFile()`。现有系统选择器 API 暂时保留，供项目目录选择、归档恢复或回滚使用，不在本功能中删除。

## 2. 新功能开发评估

### 2.1 任务分类

- 分类：现有功能增强；
- 用户确认：已确认按新功能开发流程处理；
- 当前能力：只能通过系统窗口导入、导出 `.storyos-book`；
- 用户可感知变化：用户在 StoryOS 内即可了解格式、浏览文件、预览内容、配置导出并查看进度；
- 当前授权边界：本轮完善设计与实施规划，批准后再修改业务代码。

### 2.2 是否需要拆分

需要拆分，但不建立通用文件管理器或庞大的“资产平台”。本功能同时包含：

- 文件系统浏览；
- 格式能力声明；
- 导入预检会话；
- 格式解析与转换；
- 导出选项与目标校验；
- 长任务状态和错误恢复；
- 多步骤 UI。

这些职责如果继续放入 `useBookshelf.ts`、`BookshelfPage.tsx` 或现有 `BookTransferService.ts`，会把页面状态、文件访问、格式解析和数据库写入耦合在一起。应按“文件浏览”“传输应用服务”“格式适配器”“传输 UI”四个边界拆分。

### 2.3 备选结构

#### 方案 A：只做一个漂亮弹窗，仍直接调用系统窗口

优点是改动小；缺点是文件浏览体验仍会跳出 StoryOS，无法实现内置最近位置、右侧预览和一致的导入导出步骤。不能完整解决用户提出的问题。

#### 方案 B：自定义传输中心，但仅支持 `.storyos-book`

可以先改善体验，但格式卡片和复杂状态的投入只服务于一个格式，用户仍无法交换 Word、Markdown 和 TXT 稿件。适合作为第一个可交付阶段，不应是最终范围。

#### 方案 C：自定义传输中心、受控文件浏览、可扩展格式适配器

这是推荐方案。先复用现有 `.storyos-book` 闭环验证基础设施，再依次接入 TXT、Markdown 和 DOCX。后续 EPUB/PDF 只需增加导出适配器，不需要重写页面与文件浏览。

## 3. 当前实现基线

### 3.1 已有能力

| 能力 | 当前实现 |
| --- | --- |
| 书籍完整备份 | `.storyos-book` |
| 一致性快照 | `BookRuntimeManager.backupBook()` |
| 包内容 | `manifest.json`、`book.sqlite`、`checksums.json` |
| 完整性校验 | SHA-256、数据库类型、schema version、SQLite quick check |
| 导入安全 | 临时目录、生成新 `bookId`、原子发布、失败清理 |
| 导出安全 | SQLite backup、临时文件、写后校验、不覆盖已有文件 |
| 文件路径入口 | Electron `showOpenDialog` / `showSaveDialog` |

### 3.2 当前交互缺口

`useBookshelf.importBook()` 和 `exportBook()` 直接打开系统窗口，造成以下问题：

- 用户进入操作前看不到支持格式；
- 不知道 `.storyos-book` 会保留哪些内容；
- 没有卷章、字数、版本和警告预览；
- 没有导出范围、结构和附加内容选项；
- 文件选中后立即执行，无法在写入书架前确认；
- 只有一个全局 `pendingAction`，无法表达解析、预览、转换、写入和验证阶段；
- 成功反馈只显示“已导入/已导出”，没有目标位置和后续动作。

### 3.3 当前数据边界

BookDatabase 当前包含：

- 书名、简介和创作状态；
- 卷、卷摘要和排序；
- 章节、章节状态和排序；
- 全部章节修订、变更摘要、字符数和时间；
- 当前正文为带 schema version 的 Tiptap JSON。

书籍包不包含写作项目中的对话、Agent 运行记录、项目文件和项目配置。这些数据属于项目归档，不应混进“导出书籍”的格式能力说明。

## 4. 产品术语和入口

避免把所有行为都叫“导入/导出”，建议在界面中使用以下术语：

| 用户目标 | 界面名称 | 说明 |
| --- | --- | --- |
| 完整迁移 StoryOS 书籍 | 备份书籍 / 恢复备份 | 保留书籍内部结构和修订历史 |
| 从其他工具带入稿件 | 导入外部稿件 | Word、Markdown、TXT |
| 交给编辑或其他工具 | 导出可编辑稿件 | Word、Markdown、TXT |
| 阅读、打印或发布 | 导出阅读版本 | EPUB、PDF，后续版本 |

书架顶部保留“导入书籍”主入口。点击后打开导入中心，不直接打开磁盘窗口。

书籍卡片菜单保留“导出书籍”，点击后打开该书的导出中心。

空书架中的“导入书籍”使用同一个导入中心，不维护第二套逻辑。

## 5. 格式规划

### 5.1 能力矩阵

| 格式 | 导入 | 导出 | 正文格式 | 卷章 | 状态 | 修订历史 | 主要用途 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `.storyos-book` | 是 | 是 | 完整 | 完整 | 完整 | 完整 | 备份、迁移、恢复 |
| `.docx` | 是 | 是 | 常用格式 | 可识别 | 否 | 否 | 作者、编辑、出版社交换 |
| `.md` / Markdown ZIP | 是 | 是 | Markdown | 可识别 | 可选清单 | 否 | 开放格式、版本管理 |
| `.txt` | 是 | 是 | 纯文本 | 规则识别 | 否 | 否 | 最大兼容性 |
| `.epub` | 后续 | 是 | 阅读样式 | 是 | 否 | 否 | 电子书阅读与发布 |
| `.pdf` | 不做 | 后续 | 固定版式 | 目录展示 | 否 | 否 | 打印和定稿分享 |

PDF 不作为正式导入格式。PDF 文本顺序、分页、字体映射和扫描件识别不稳定，无法提供可靠的卷章还原。

EPUB 第一阶段只规划导出。导入 EPUB 会涉及目录、多 HTML 文档、CSS、图片和 DRM 边界，暂不与基础稿件导入一起实施。

### 5.2 格式上线顺序

#### 阶段 1：传输中心基础设施

- 自定义文件浏览；
- `.storyos-book` 导入预检、恢复和导出；
- 格式卡片、能力说明、状态机和结果页；
- 其他格式显示“即将支持”，不可点击执行。

#### 阶段 2：开放文本格式

- TXT 导入导出；
- 单文件 Markdown 导入导出；
- Markdown ZIP 多文件导入导出；
- 卷章识别、预览和用户调整。

#### 阶段 3：Word 稿件

- DOCX 导入；
- DOCX 导出；
- 标题样式映射、分页和目录选项；
- 转换丢失警告和测试样本库。

#### 阶段 4：阅读版本

- EPUB 导出；
- PDF 导出；
- 封面和插图资源协议成熟后再加入媒体资源。

## 6. 导入体验设计

### 6.1 步骤

```text
选择来源 → 浏览/拖入文件 → 正在分析 → 内容预览 → 确认导入 → 导入结果
```

### 6.2 第一步：选择来源

使用格式卡片展示：

- 格式名称与扩展名；
- “完整备份”“可编辑稿件”“纯文本”等用途；
- 会保留和不会保留的内容；
- 当前是否可用；
- 推荐标识。

默认推荐 `.storyos-book` 用于完整恢复，推荐 DOCX 用于外部稿件交换。未上线格式明确显示“即将支持”，不能让用户选择文件后才发现不支持。

### 6.3 第二步：浏览或拖入文件

自定义文件浏览器布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ 返回  前进  上一级   此电脑 > 文档 > 小说        搜索当前目录 │
├──────────────┬──────────────────────────┬────────────────────┤
│ 常用位置      │ 文件列表                  │ 文件详情            │
│ 最近使用      │ 名称 / 修改时间 / 大小     │ 格式与能力           │
│ 桌面          │                           │ 文件大小             │
│ 文档          │                           │ 最近修改             │
│ 下载          │                           │ [分析此文件]         │
│ 磁盘与位置    │                           │                     │
└──────────────┴──────────────────────────┴────────────────────┘
```

行为要求：

- 只展示当前导入格式允许的扩展名，可切换“显示全部文件”；
- 支持路径面包屑、返回、前进、上一级；
- 支持当前目录内搜索；
- 目录优先、文件其次，名称使用本地化排序；
- 支持拖入单个文件；
- 第一版一次只导入一本书，不做批量导入；
- 双击目录进入，双击有效文件开始分析；
- 无权限目录显示可理解错误并保留返回能力；
- 最近位置只记录用户主动访问的外部目录，不记录 StoryOS 内部书库路径。

### 6.4 第三步：预检

文件选定后不立即导入，先建立临时导入会话并显示：

- 文件名、格式、大小和指纹；
- 书名、简介和来源格式；
- 卷数、章节数、总字数；
- 是否含完整修订历史；
- 卷章树和每章字数；
- 格式转换警告；
- 不支持、跳过或降级的内容；
- 预计导入结果。

`.storyos-book` 预检还应展示：

- 包格式版本；
- 导出应用版本和导出时间；
- 数据库 schema version；
- 校验是否通过；
- 来源书籍 ID，仅用于诊断，不作为新书身份。

外部稿件预检应允许用户调整：

- 书名；
- 卷章识别规则；
- 将某个标题设为卷、章节或普通段落；
- 无卷章节放入“正文”还是自动创建默认卷；
- 文本编码，仅 TXT 需要；
- 是否保留空章节。

### 6.5 导入提交规则

- 所有导入默认创建新书；
- 不提供“覆盖已有书籍”；
- 不提供按标题自动合并；
- 每次导入生成新的 `bookId`、novel ID、volume ID、chapter ID 和 revision ID；
- 外部稿件每章只生成一个初始修订；
- `.storyos-book` 保留内部书籍数据和全部修订，但本地注册身份仍生成新的 `bookId`；
- 导入成功后刷新书架、定位新书并提供“为这本书创建写作项目”；
- 导入失败不留下注册记录、临时目录或半成品数据库。

## 7. 导出体验设计

### 7.1 步骤

```text
选择格式 → 配置内容 → 选择位置与文件名 → 确认 → 导出结果
```

### 7.2 格式选择

每个格式卡片必须展示：

- 扩展名；
- 适用场景；
- 是否保留卷章、常用格式、状态和修订；
- 是否可以重新导回 StoryOS；
- 预计是单文件还是目录/ZIP。

不能只展示扩展名。用户需要在选择前理解数据损失。

### 7.3 导出选项

通用选项：

- 导出全书或指定卷章；
- 是否包含书名页和简介；
- 是否包含卷摘要；
- 是否包含章节标题；
- 文件名预览。

格式专属选项：

| 格式 | 选项 |
| --- | --- |
| StoryOS | 当前只提供完整备份，不允许裁剪卷章 |
| DOCX | 目录、每章另起一页、页眉页脚、卷章编号 |
| Markdown | 单文件或 ZIP、YAML/JSON 清单、文件命名规则 |
| TXT | 单文件或按章拆分、卷章分隔模板、编码 |
| EPUB | 目录、封面、章节分页、作者信息 |
| PDF | 纸张、页边距、字体、页眉页脚、目录 |

### 7.4 保存位置

导出使用相同的自定义文件浏览能力，但切换为目录选择模式：

- 左侧显示常用位置和磁盘；
- 中间只展示目录；
- 底部输入文件名；
- 扩展名由格式自动追加且不可产生双扩展名；
- 实时展示完整目标路径；
- 文件名非法字符即时提示；
- 目标存在时默认推荐“生成新名称”，不静默覆盖；
- 导出成功提供“打开所在文件夹”和“复制路径”。

第一阶段继续保持后端“不覆盖已有文件”的安全规则。UI 可以自动建议 `书名 (1).storyos-book`，避免用户反复修改。

## 8. 自定义文件浏览器范围

### 8.1 应支持

- Windows 盘符；
- macOS `/`、用户目录与 `/Volumes`；
- Linux `/`、用户目录、`/mnt`、`/media`；
- Electron 提供的桌面、文档、下载、用户目录；
- 路径面包屑与历史导航；
- 文件扩展名过滤；
- 名称、修改时间、大小排序；
- 当前目录搜索；
- 目录分页加载；
- 无权限、丢失、断开和忙碌状态；
- 拖放文件路径解析；
- 最近导入/导出位置。

### 8.2 第一版不支持

- 文件复制、移动、删除、重命名；
- 新建任意文件；
- 压缩包通用浏览；
- 文件预览器；
- 系统右键菜单；
- 网络账号登录；
- 云盘 API 集成；
- 收藏夹管理；
- 多文件批量操作；
- 监视任意目录并实时刷新。

它是受限的“位置与文件选择器”，不是资源管理器替代品。

### 8.3 大目录策略

- 主进程按页返回目录条目，建议默认每页 200 条；
- 排序和扩展名过滤在主进程完成；
- 搜索只针对当前目录，不递归扫描磁盘；
- UI 使用增量列表，不一次渲染几万项；
- 读取目录超时或失败时返回稳定错误 DTO，不让 IPC Promise 永久悬挂。

## 9. 页面状态模型

不要继续使用多个松散 boolean。导入和导出分别使用判别联合状态。

```ts
type ImportFlowState =
  | { phase: "choose-format" }
  | { phase: "browse"; format: ImportFormat }
  | { phase: "inspecting"; format: ImportFormat; filePath: string }
  | { phase: "preview"; sessionId: string; preview: ImportPreview }
  | { phase: "importing"; sessionId: string; progress: TransferProgress }
  | { phase: "success"; result: ImportBookResult }
  | { phase: "error"; recoverTo: "browse" | "preview"; message: string };

type ExportFlowState =
  | { phase: "choose-format"; bookId: string }
  | { phase: "configure"; bookId: string; format: ExportFormat }
  | { phase: "destination"; draft: ExportDraft }
  | { phase: "exporting"; jobId: string; progress: TransferProgress }
  | { phase: "success"; outputPath: string }
  | { phase: "error"; recoverTo: "configure" | "destination"; message: string };
```

关闭规则：

- 选择和预览阶段可以直接关闭；
- 正在分析时允许取消并清理临时会话；
- 正在写入或原子发布时不立即强制关闭，先请求取消并等待安全点；
- 成功页关闭后刷新书架；
- 错误页保留用户已经选择的格式、文件和选项。

## 10. 应用层架构

### 10.1 总体数据流

```text
Renderer Transfer UI
  → typed Preload API
    → IPC validation
      ├── DesktopFileBrowserService
      │   └── local filesystem (read-only listing / target validation)
      └── BookTransferService
          ├── ImportSessionStore
          ├── BookFormatRegistry
          ├── Format Adapter
          ├── BookRuntimeManager / BookDatabase
          └── BookRegistry / atomic publish
```

渲染层不得使用 Node `fs`，不得直接打开 SQLite，也不得自行读取 `.storyos-book`、DOCX 或 ZIP。

### 10.2 统一中间模型

外部格式不能直接写 BookDatabase。所有解析器先生成受校验的中间模型：

```ts
type PortableBookDraft = {
  readonly title: string;
  readonly synopsis: string;
  readonly status: "planning" | "writing" | "completed" | "archived";
  readonly volumes: readonly PortableVolumeDraft[];
  readonly ungroupedChapters: readonly PortableChapterDraft[];
  readonly warnings: readonly TransferWarning[];
};

type PortableChapterDraft = {
  readonly title: string;
  readonly status: "outline" | "draft" | "revising" | "completed";
  readonly document: TiptapDocument;
};
```

导入提交阶段由一个公共 provisioning 流程生成数据库、ID、初始修订和注册记录。这样 TXT、Markdown 和 DOCX 共享相同的数据校验、原子发布和失败清理。

导出则使用只读 `BookExportSnapshot`，由格式适配器消费，不能让适配器自行租用 runtime 或拼 SQL。

### 10.3 格式适配器

```ts
interface BookImportAdapter {
  readonly format: ImportFormat;
  readonly extensions: readonly string[];
  inspect(input: PreparedImportFile): Promise<PortableBookDraft>;
}

interface BookExportAdapter {
  readonly format: ExportFormat;
  validateOptions(options: unknown): ExportOptions;
  render(snapshot: BookExportSnapshot, options: ExportOptions): Promise<Buffer>;
}
```

格式注册表是能力的唯一事实来源，主进程契约和渲染层文案都从稳定 DTO 获取，不在 JSX 中重复维护一份扩展名列表。

### 10.4 导入预检会话

预检不能只返回原路径然后在确认时重新读取，因为源文件可能在两步之间被替换。建议：

1. `prepareBookImport()` 将源文件复制到 StoryOS `.importing` 临时区；
2. 计算 SHA-256、识别格式并解析；
3. 返回 `sessionId` 和预览 DTO；
4. 用户调整结构时只修改会话中的规范化草稿；
5. `commitBookImport(sessionId, options)` 使用临时副本导入；
6. 成功、取消、过期或应用启动协调时清理会话。

会话应设置过期时间，例如 30 分钟；重启应用不恢复未提交会话。

## 11. 桌面 API 草案

### 11.1 文件浏览 API

```ts
type FileBrowserEntry = {
  readonly name: string;
  readonly absolutePath: string;
  readonly kind: "directory" | "file" | "symbolic-link";
  readonly size: number | null;
  readonly modifiedAt: string | null;
  readonly extension: string | null;
  readonly accessible: boolean;
};

type FileBrowserLocation = {
  readonly id: string;
  readonly label: string;
  readonly absolutePath: string;
  readonly kind: "home" | "desktop" | "documents" | "downloads" | "volume" | "recent";
};

getFileBrowserLocations(): Promise<readonly FileBrowserLocation[]>;
listFileBrowserDirectory(request: {
  directoryPath: string;
  extensions?: readonly string[];
  query?: string;
  sortBy?: "name" | "modifiedAt" | "size";
  sortDirection?: "asc" | "desc";
  cursor?: string;
}): Promise<FileBrowserPage>;
resolveDroppedFile(file: File): string;
rememberTransferLocation(directoryPath: string): Promise<void>;
revealTransferOutput(outputPath: string): Promise<void>;
```

`resolveDroppedFile` 应在 Preload 中使用 Electron 提供的文件路径解析能力，不能信任网页构造的字符串路径。

### 11.2 导入 API

```ts
getBookTransferFormats(): Promise<BookTransferCapabilities>;
prepareBookImport(request: {
  readonly filePath: string;
  readonly expectedFormat?: ImportFormat;
}): Promise<ImportPreview>;
updateBookImportDraft(request: ImportDraftUpdate): Promise<ImportPreview>;
commitBookImport(request: {
  readonly sessionId: string;
}): Promise<ImportBookResult>;
cancelBookImport(sessionId: string): Promise<void>;
```

### 11.3 导出 API

```ts
prepareBookExport(request: {
  readonly bookId: string;
  readonly format: ExportFormat;
  readonly options: unknown;
}): Promise<ExportPreview>;
exportBookshelfBook(request: {
  readonly exportId: string;
  readonly outputPath: string;
}): Promise<ExportBookResult>;
cancelBookExport(exportId: string): Promise<void>;
```

进度可以通过专用 `book-transfer-progress` 事件推送：

```ts
type TransferProgress = {
  readonly operationId: string;
  readonly phase: "validating" | "reading" | "converting" | "writing" | "verifying";
  readonly completed: number;
  readonly total: number | null;
  readonly message: string;
};
```

## 12. 安全与一致性

### 12.1 文件浏览安全

- 渲染层只调用受控、只读的目录枚举 API；
- 所有路径在主进程执行 `path.resolve()` 和绝对路径校验；
- 文件浏览 API 不提供删除、移动、写入和通用读文件；
- 不读取或返回文件正文；
- 符号链接单独标识，用户进入时解析真实目标；
- 单层目录枚举避免递归链接循环；
- 无权限目录转换为稳定错误，不泄露堆栈；
- StoryOS 内部 `library`、`.importing`、`.exporting` 和归档目录不加入最近位置；
- IPC 对扩展名、分页、查询长度和排序枚举做白名单校验。

### 12.2 导入安全

- 保留 512 MiB 包大小上限，并为 DOCX、Markdown ZIP、TXT 分别定义上限；
- ZIP 先检查条目数、展开后总大小和压缩比，防止 Zip Bomb；
- ZIP 条目路径禁止绝对路径、`..` 和目录逃逸；
- DOCX/HTML 转换后清理脚本、外部对象、危险链接和非允许样式；
- TXT 明确处理 UTF-8、UTF-16 和 GB18030，不静默用错误编码导入；
- 所有正文进入 `requireTiptapDocument()` 和内容长度校验；
- 导入会话使用源文件副本和哈希，避免预检后文件变化；
- 任何失败都不得注册半成品书籍。

### 12.3 导出安全

- 导出路径必须是绝对路径且父目录存在；
- 文件名不得为 `.`、`..`、Windows 保留名或含非法字符；
- 扩展名必须与已选择格式一致；
- 先写同目录临时文件，验证成功后原子发布；
- 第一阶段不覆盖现有文件，UI 自动建议新名称；
- 导出不得暴露 BookDatabase 原始路径；
- `.storyos-book` 继续使用 SQLite backup，不复制活跃 WAL 文件。

## 13. 前端模块结构

推荐结构：

```text
src/renderer/features/file-browser/
├── FileBrowser.tsx
├── FileBrowserSidebar.tsx
├── FileBrowserBreadcrumbs.tsx
├── FileBrowserList.tsx
├── FileBrowserDestinationBar.tsx
├── fileBrowserModel.ts
└── useFileBrowser.ts

src/renderer/pages/bookshelf/transfer/
├── ImportBookDialog.tsx
├── ExportBookDialog.tsx
├── TransferFormatGrid.tsx
├── TransferFormatCard.tsx
├── ImportPreview.tsx
├── ImportStructureTree.tsx
├── ExportOptions.tsx
├── TransferProgressView.tsx
├── TransferResultView.tsx
├── transferModel.ts
├── useBookImportFlow.ts
└── useBookExportFlow.ts
```

拆分理由：

- 文件浏览未来可复用于项目归档恢复，但不能依赖书架业务；
- 导入和导出状态不同，分别使用 hook，避免一个 hook 中出现大量无效字段；
- 格式卡片和进度视图可以共用；
- 小型按钮和一次性文案留在父组件，不为每一步机械创建组件。

`BookshelfPage.tsx` 只维护导入弹窗是否打开和当前导出书籍。`useBookshelf.ts` 回归列表、新建和刷新职责，不再包含路径选择与格式流程。

## 14. 主进程模块结构

推荐在保持现有入口兼容的前提下扩展：

```text
src/main/agent/application/
├── BookTransferService.ts                 # 对外用例门面
├── bookTransferContracts.ts               # 应用层稳定契约
├── StoryOSBookPackage.ts                  # 现有原生包
└── book-transfer/
    ├── BookTransferFormatRegistry.ts
    ├── BookImportSessionStore.ts
    ├── PortableBook.ts
    ├── BookExportSnapshotReader.ts
    ├── BookImportProvisioner.ts
    ├── transferValidation.ts
    └── formats/
        ├── StoryOSBookAdapter.ts
        ├── TextBookAdapter.ts
        ├── MarkdownBookAdapter.ts
        └── DocxBookAdapter.ts

src/main/desktop/file-browser/
├── DesktopFileBrowserService.ts
├── FileBrowserLocations.ts
├── FileBrowserDirectoryReader.ts
└── fileBrowserContracts.ts
```

不建议一次移动现有 `BookTransferService.ts` 和 `StoryOSBookPackage.ts`，以减少第一阶段无关重构。待适配器稳定后再判断是否迁移入口文件。

## 15. 预计修改文件

### 15.1 现有文件

| 文件 | 变化 |
| --- | --- |
| `BookshelfPage.tsx` | 打开导入/导出中心，移除直接文件选择调用 |
| `BookshelfBookCard.tsx` | 导出菜单改为打开配置面板 |
| `useBookshelf.ts` | 移除文件对话框和传输状态，保留列表、新建、刷新 |
| `BookshelfApplication.ts` | 暴露预检、提交、取消和多格式导出用例 |
| `BookTransferService.ts` | 改为传输门面和会话编排 |
| `bookTransferContracts.ts` | 增加格式、预览、选项、进度和结果契约 |
| `DesktopController.ts` | 增加文件浏览和传输用例入口 |
| `src/shared/agent/contracts.ts` | 增加 IPC 频道、DTO 和 API |
| `src/main/ipc/agent.ts` | 注册传输频道并执行输入校验 |
| `src/preload/agentApi.ts` | 暴露受控传输和文件浏览 API |
| `previewAgentApi.ts` | 提供同形模拟数据和状态 |
| `src/preload/windowApi.ts` | 增加安全的拖放文件路径解析，若最终放在窗口 API |
| `src/shared/window/contracts.ts` | 增加拖放解析契约；保留现有系统对话框契约 |

### 15.2 新增文件

新增文件以第 13、14 节结构为准。实施时如果某个展示组件不足约 40 行且没有独立状态或复用价值，应合并回父组件，不机械拆分。

### 15.3 依赖变化

当前项目没有 DOCX 和 ZIP 读写依赖。进入对应阶段前需要单独评估并锁定：

- DOCX 解析库；
- DOCX 生成库；
- ZIP 读写库；
- GB18030 解码是否使用 Node 内建能力或轻量依赖。

依赖选择要求：

- Electron/Node 环境可用；
- 无需执行外部二进制；
- 能限制 ZIP 展开大小；
- 可在主进程运行；
- 许可证兼容；
- 有稳定 TypeScript 类型；
- 不把不可信文档渲染为可执行 HTML。

## 16. 实施顺序

### 阶段 A：契约与原生格式预检

1. 定义格式能力、预览、进度和错误 DTO；
2. 为 `.storyos-book` 增加只读 inspect 用例；
3. 建立导入临时会话和清理策略；
4. 把现有导入拆为 prepare/commit；
5. 保持现有包格式版本和兼容性；
6. 增加应用层测试。

完成标准：不经过页面即可预检包、确认导入、取消并清理。

### 阶段 B：自定义文件浏览边界

1. 实现常用位置和磁盘发现；
2. 实现单层目录分页、过滤、排序和搜索；
3. 增加路径、扩展名和分页输入校验；
4. 暴露 IPC 与 Preload；
5. 实现拖放路径解析；
6. 增加 Windows 路径和无权限目录测试。

完成标准：渲染层不使用 `fs`，可以在 StoryOS 内完成文件和目标目录选择。

### 阶段 C：导入导出中心 UI

1. 实现格式卡片与能力说明；
2. 实现自定义文件浏览组件；
3. 实现 `.storyos-book` 导入预览；
4. 实现导入状态机、取消和结果页；
5. 实现 `.storyos-book` 导出配置和保存位置；
6. 从书架移除系统选择器调用；
7. 覆盖键盘、焦点、窄屏和错误状态。

完成标准：用户不离开 StoryOS 即可完成完整备份的导入导出，并明确知道格式能力。

### 阶段 D：TXT 与 Markdown

1. 建立 `PortableBookDraft` 和统一 provisioning；
2. 实现纯文本编码与卷章识别；
3. 实现 Markdown 单文件解析；
4. 实现 Markdown ZIP 清单与多文件结构；
5. 实现结构调整预览；
6. 实现 TXT/Markdown 导出选项；
7. 增加转换快照和往返测试。

完成标准：用户可以与常见文本写作工具进行可解释的稿件交换。

### 阶段 E：DOCX

1. 选定并接入 DOCX 解析与生成依赖；
2. 将 Heading 1/2 和中文卷章标题映射到结构；
3. 将允许的段落、粗体、斜体、下划线、引用和对齐映射到 Tiptap；
4. 对图片、批注、修订跟踪、文本框等不支持内容产生警告；
5. 实现 DOCX 目录、分页和卷章编号选项；
6. 建立多来源 DOCX 测试样本。

完成标准：Word 稿件导入不会静默丢失结构，导出可以交给编辑继续修改。

### 阶段 F：阅读格式与收口

1. 在封面和资源协议稳定后实现 EPUB；
2. 实现 PDF 版式输出；
3. 增加大书籍性能测试；
4. 评估是否升级 `.storyos-book` 为 ZIP 容器版本 2；
5. 保持版本 1 导入兼容。

## 17. 测试计划

### 17.1 文件浏览

- Windows 多盘符、桌面、下载和文档位置；
- 空目录、大目录和超长文件名；
- 无权限目录和突然断开的磁盘；
- 符号链接、目录链接和无效链接；
- 扩展名大小写；
- 搜索、排序和分页稳定性；
- 最近位置不记录 StoryOS 内部目录；
- 渲染层不能通过 IPC 请求任意读文件或写文件。

### 17.2 原生包

- 正常包预检展示正确标题、卷章数、字数和版本；
- manifest、checksum、SQLite 类型或 schema 不合法时阻止进入确认页；
- 预检后修改源文件不影响临时会话；
- 取消、超时和重启清理临时文件；
- 导入生成新本地 `bookId`；
- 导出快照与当前书籍一致；
- 目标存在时不覆盖并提供新名称；
- 大于上限的包在复制前拒绝。

### 17.3 文本和 Markdown

- UTF-8、UTF-16、GB18030；
- CRLF、LF 和混合换行；
- “第1章”“第一章”“Chapter 1”等规则；
- 无标题、重复标题、空章节和超长章节；
- 单文件和 ZIP 多文件排序；
- ZIP 路径逃逸、Zip Bomb 和异常条目；
- Markdown 常用格式映射与不支持节点警告；
- 导出后重新导入的卷章顺序一致。

### 17.4 DOCX

- Word、WPS 和 LibreOffice 生成的 DOCX；
- Heading 1/2、手工加粗标题和中文卷章标题；
- 列表、引用、分页符、表格、脚注、图片和批注；
- 不支持内容有明确警告；
- 外部链接和嵌入对象不会执行；
- 大型文稿转换期间页面有进度且可安全取消。

### 17.5 页面交互

- 格式卡片正确显示可用与即将支持；
- 键盘导航、焦点陷阱、Escape 和返回上一步；
- 拖放错误类型时给出格式说明；
- 分析失败后可以重新选择文件；
- 导入失败保留预览和选项；
- 导出失败保留目标目录和文件名；
- 成功后可以打开文件夹、复制路径或创建写作项目；
- 操作中防止重复提交；
- 关闭对话框不会留下孤立传输会话。

### 17.6 工程验证

```bash
npm run typecheck
npm test
npm run lint
npm run package
npm run test:packaged:smoke
npm run test:packaged:business
```

## 18. 验收标准

第一阶段基础闭环完成必须满足：

- 书架导入和导出不再打开系统文件选择器；
- 用户操作前能够看到所有已支持格式和能力说明；
- 未上线格式明确标记，不接受无效选择；
- StoryOS 内置文件浏览可访问常用位置和本地磁盘；
- 文件浏览没有删除、移动或通用文件读取能力；
- `.storyos-book` 导入前展示标题、版本、卷章、字数和校验结果；
- 导入确认前不登记书籍；
- 导入成功后生成新的本地书籍身份并定位到新书；
- 导出前明确说明其为完整书籍备份，不包含项目对话；
- 导出目标存在时不覆盖；
- 导入导出过程有可理解的阶段和错误恢复；
- 取消、失败和重启不会留下临时文件或半成品书籍；
- 页面、Preload 和主进程之间只使用类型化 API；
- 类型检查、相关测试、打包和桌面验证通过。

完整多格式版本还必须满足：

- TXT、Markdown 和 DOCX 均可在导入前预览卷章结构；
- 外部稿件不会被描述为完整备份；
- 不支持或降级的格式内容不会静默丢失；
- 所有外部格式通过统一中间模型进入 BookDatabase；
- 各格式导出选项只展示真实支持的能力；
- StoryOS 原生包继续兼容旧版本。

## 19. 本版明确不做

- 覆盖或合并现有书籍；
- 批量导入多本书；
- 批量导出整个书架；
- 通用资源管理器能力；
- 云盘、邮箱或第三方账号连接；
- PDF 正式导入；
- EPUB 导入；
- OCR；
- 导入受 DRM 保护的文档；
- 把项目对话、Agent 运行和项目文件塞入书籍包；
- 在渲染进程开放 Node 文件系统；
- 为未来格式提前修改 BookDatabase 表结构。

## 20. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 自定义选择器变成资源管理器项目 | 明确只做选择、过滤、导航和目标校验，不做文件管理 |
| 跨平台磁盘位置行为不一致 | 文件位置发现封装在主进程平台适配层，按平台测试 |
| 大目录阻塞主进程和页面 | 分页、非递归搜索、稳定超时和增量渲染 |
| 外部文件预检后被替换 | 预检时复制临时副本并计算哈希，提交只使用会话副本 |
| 多格式直接写库导致规则分叉 | 统一 `PortableBookDraft` 和 provisioning |
| DOCX 内容静默丢失 | 明确能力矩阵、预检警告和样本测试 |
| ZIP 恶意文件 | 条目数、展开大小、压缩比和路径安全校验 |
| 页面和 hook 再次膨胀 | 文件浏览、导入、导出按职责拆分，书架页只组合入口 |
| 格式文案与后端能力不一致 | 主进程格式注册表返回能力 DTO，页面不硬编码支持状态 |
| 导出误覆盖用户文件 | 第一阶段拒绝覆盖并自动建议新文件名 |
| 原生包升级破坏旧备份 | 版本化容器，始终保留 v1 读取兼容测试 |

## 21. 最终实施建议

按“原生包预检契约 → 受控文件浏览 → 传输中心 UI → TXT/Markdown → DOCX → EPUB/PDF”的顺序实施。

最重要的第一步不是一次支持所有格式，而是建立正确的产品与架构骨架：用户先理解格式，再选择文件，确认预检结果后提交；所有格式共用安全的文件边界、中间书籍模型、进度语义和失败清理。

建议批准阶段 A、B、C 作为第一个开发批次。该批次完成后即可在不使用系统文件选择器的前提下，以 `.storyos-book` 交付完整、流畅、可解释的导入导出体验。TXT、Markdown 和 DOCX 随后按独立适配器增量接入，不再重做页面和 IPC。
