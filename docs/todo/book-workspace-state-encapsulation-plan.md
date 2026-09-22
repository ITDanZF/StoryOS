# 书籍工作区状态封装执行方案

> 文档状态：执行基准，实施前评审版
> 生成日期：2026-09-22
> 适用范围：`src/renderer/features/book-workspace/BookWorkspacePage.tsx` 及其直接拆出的路由内 hook
> 关联文档：
> - `docs/todo/performance/book-workspace-performance-execution-plan.md`（性能阶段，本方案不实施其中的 store 拆分）

## 1. 执行结论

`BookWorkspacePage.tsx` 里的 `useEffect` 没有造成输入或翻页时的持续性能问题。这次只提高可读性和状态封装，不改用户可见行为，不新建全局 store。

页面当前同时做了四件事：

1. 决定屏幕上显示哪一章（占位、加载、预取、切章刷盘、选中章失效时退回概览）。
2. 保管助手草稿和「引用本章」开关，再把 setter 传给对话 hook。
3. 用快捷键切换已经由布局 hook 持有的面板。
4. 离开设置页或开发者页前刷盘。

书的快照、选中的章、生成任务、项目会话已经各有所有者，保持不动。整理后页面只负责拼顶栏、目录、正文、助手，并处理要同时改书和刷新项目导航的操作。

## 2. 不改的部分

- `useBookWorkspace` 的加载、保存和快照合并。
- `useBookNavigation` 的选章、翻页和 `showBookOverview`。用户点击概览、删除当前章，仍由页面调用 `showBookOverview`。
- `generationStore`、工作区 outlet 里的项目会话、地址栏里的 `conversation`。
- `livePagination` 继续留在 `useBookNavigation`。不为分页测量新建 store。
- 换项目后，旧书快照会先留着，等新快照到达再替换。不要在 `useBookWorkspace` 里提前把 `workspace` 清成 `null`。
- 编辑器光标和 bridge 继续用 ref。`editorContextRef` 与 `editorBridgeRef` 仍由页面创建，再传给阅读会话、对话、工具处理和离开刷盘。

## 3. 文件

| 文件 | 动作 |
| --- | --- |
| `src/renderer/features/book-workspace/useChapterReadingSession.ts` | 新建。占位章、加载去重、预取、切章刷盘、选中章已不在快照里时退回概览 |
| `src/renderer/features/book-workspace/bookWorkspaceModel.ts` | 增加卷名纯函数，替换页面里算两遍的那段 |
| `src/renderer/features/book-workspace/bookWorkspaceModel.test.ts` | 为卷名纯函数补测试 |
| `src/renderer/features/book-workspace/useBookConversations.ts` | 自己持有 `assistantDraft` 和 `assistantContextEnabled` |
| `src/renderer/features/book-workspace/useBookWorkspaceLayout.ts` | 收进 Ctrl+B / Ctrl+J |
| `src/renderer/features/book-workspace/useFlushEditorOnLeave.ts` | 新建。去设置页或开发者页之前刷盘 |
| `src/renderer/features/book-workspace/BookWorkspacePage.tsx` | 删除对应 state 和 effect，改为调用上述 hook |

不新增目录，不把这些 hook 再包一层 context。

## 4. 步骤

### 4.1 阅读会话

新建 `useChapterReadingSession`，把页面上下列逻辑原样移入。effect 的书写顺序必须保持：

1. `projectId` 变化时清空占位章、已加载修订和预取集合。对应现在的 `heldChapterId`、`loadedContentRevision`、`prefetchStartedRef`。
2. `activeChapterId` 变化时，对上一章调用 `editorBridgeRef.current?.flushPending()`。失败吞掉，与现在一致。
3. 没有选中章时清空 `heldChapterId`。选中章的 `contentLoaded` 为真时，把 `heldChapterId` 设为该章 id。
4. 按章 id 和 `currentRevisionId` 调用 `loadChapter`。继续用 `chapterLoading` 和 `loadedContentRevision` 去重：同一章、同一修订已加载，或相同 load key 正在请求，就不再请求。请求结束后只清除仍匹配的 load key。
5. 用 `neighborChapterIds` 预取相邻章。已加载或已开始预取的跳过。`prefetchChapter` 失败时从预取集合删除，允许下次再试。
6. 工作区状态为 `uninitialized`，或选中章不在 `workspace.chapters` 里，且 `activeChapterId !== null` 时，调用 `showBookOverview`。

`displayedChapter` 继续用现有 `resolveDisplayedChapter(activeChapter, heldChapter)` 计算，不要再在页面上 `setHeldChapterId`。

建议入参：

- `projectId`
- `workspace`（`BookWorkspaceSnapshot | null`，含未就绪快照，步骤 6 要看 `uninitialized`）
- `activeChapterId`
- `chapterGroups`（或由 hook 内部用卷章列表自己分组；二选一，不要两处各算一遍分组）
- `loadChapter`、`prefetchChapter`
- `showBookOverview`
- `editorBridgeRef`

建议返回：

- `displayedChapter`
- 正在显示的章在目录中的位置（供编辑器卷名和章序使用）
- 正文是否还在加载：有选中章、但 `displayedChapter` 仍为空

`activeChapter` 仍从选中 id 和 `chapterGroups` 得出，给顶栏、目录、助手和工具处理使用。它和 `displayedChapter` 不是同一个值：正文未到时，编辑器显示上一章，目录高亮选中章。

### 4.2 卷名

在 `bookWorkspaceModel.ts` 增加纯函数。给定 `chapterGroups` 和某一章的 `BookChapterLocation`，返回现在页面上的文案：

- 没有分卷：`未分卷`
- 卷标题恰好是 `第N卷`：`第N卷`
- 否则：`第N卷 · ${volume.title}`

`N` 是该卷在 `kind === "volume"` 的分组中的序号，从 1 开始。这与 `formatChineseOrdinal` 无关，不要改成中文数字。

选中章和正在显示的章各调用一次。选中章与显示章是同一章时，编辑器直接复用选中章的卷名，保持现在的短路。

在 `bookWorkspaceModel.test.ts` 覆盖：未分卷、标题已是 `第N卷`、标题需要拼接、序号按分卷分组而不是按全部分组计算。

### 4.3 助手输入

把 `assistantDraft` 和 `assistantContextEnabled` 从页面移入 `useBookConversations`。初始值仍是空字符串和 `true`。

hook 返回草稿、开关，以及面板需要的修改函数。页面把返回值传给 `BookAssistantPanel`，不再把 `setAssistantDraft` / `setAssistantVisible` 作为入参传回这个 hook。面板可见性仍属于 `useBookWorkspaceLayout`：新建、切换会话时把它打开，由调用方传入 `setAssistantVisible`，或者让对话 hook 继续接收这一个布局 setter。不要为了这一个 setter 把整份布局状态搬进对话 hook。

保留现有行为：

- 新建、切换、删除会话时清空草稿。切换到当前会话则直接返回，不清草稿。
- `activeChapterId` 变化时把「引用本章」设为 `true`，并清空 `editorContextRef`。清空 ref 依赖页面传入的 ref，留在对话 hook 里即可，因为它已经持有该 ref。
- 发送消息时仍按 `assistantContextEnabled` 决定是否附带章节、页摘录和选区。

### 4.4 布局快捷键

把页面里依赖为 `[]` 的 `keydown` 监听移入 `useBookWorkspaceLayout`。条件保持不变：

- `defaultPrevented`、输入法组合、已有弹窗、`isEditableTarget` 时忽略。
- 还要忽略 `contenteditable`、`input`、`textarea`、`select`。这段与 `isEditableTarget` 重复，搬迁时不要顺手删掉。
- 仅响应 Ctrl 或 Meta。`b` 切换目录，`j` 切换助手并取消助手聚焦。

`setCatalogVisible`、`setAssistantVisible`、`setAssistantFocused` 已是该 hook 内的 state setter，空依赖可以继续成立。

### 4.5 离开页面刷盘

新建 `useFlushEditorOnLeave(editorBridgeRef)`，移入现在的 `useBlocker`：

- 仅当 bridge 存在，且下一地址是 `/settings` 或 `/developer` 时拦截。
- `state === "blocked"` 时 `flushPending()`，成功则 `proceed()`，失败则 `reset()`。
- 失败提示仍由章节保存逻辑负责。这个 hook 不另外 `setError`。

### 4.6 收回页面

完成后，`BookWorkspacePage` 的调用顺序为：

```tsx
const book = useBookWorkspace(projectId);
const navigation = useBookNavigation();
const layout = useBookWorkspaceLayout();
const reading = useChapterReadingSession({ /* 见 4.1 */ });
const assistant = useBookConversations({ /* 不再接收草稿 setter */ });
useFlushEditorOnLeave(editorBridgeRef);
```

hook 必须写在「项目不存在」「正在载入」这两个提前返回之前，与现在一样。

页面保留：

- `addVolume`、`addChapter`、`removeVolume`、`removeChapter`、`saveBookProfile`。
- 删除的章正好是选中章时调用 `showBookOverview`。
- `useBookGenerationEvents`、`useBookEditorToolHandler`、`useBookMutationSync` 的调用位置和参数。工具处理继续使用选中章，而不是占位中的上一章。

卷序、章序继续在渲染时用 `findBookChapterLocation` 和 `bookWorkspaceModel` 计算，不写入 state。

## 5. 行为核对

搬完后下列行为不能变：

- 切到未加载的章时，编辑器先留着上一章正文，新正文到了再换。上一章以只读显示。
- 没有可显示正文时，仍显示「正在载入章节正文…」或 `bookError`。
- 同一章、同一修订不重复请求。相邻章预取失败后可以再试。
- 切章时上一章的未保存修改会先刷盘。
- 当前章被删掉，或快照里已经没有这一章，回到书籍概览。工作区仍是 `uninitialized` 时，有选中章也会退回概览。
- 切章后「引用本章」重新开启。换会话时草稿清空。
- 在输入框、可编辑区域或弹窗里按 Ctrl+B / Ctrl+J 不会切换面板。
- 去设置页或开发者页时，有未保存内容会先写完再离开。写入失败则留在当前页。
- 换项目时不提前清掉旧快照，也不改变「旧选中章还在不在」的现有时序。

## 6. 验证

```text
npx vitest run src/renderer/features/book-workspace/bookWorkspaceModel.test.ts
npm run lint:frontend
```

阅读会话若把「是否该加载」「是否该退回概览」抽成纯函数，再为这些函数补 Vitest。不新开浏览器测试，也不为本次搬迁跑全量 `npm run check`。

没有现成的页面级测试。切章占位、预取失败重试、离开页刷盘，需要人工看一遍。这是整理之后仍在的缺口。

## 7. 明确不做

- 不把书籍快照、导航、布局、对话收成一个 Zustand store。
- 不实施性能方案里的目录、正文、分页 store 拆分。
- 不调整 `livePagination` 的存放位置，即使分页更新仍会重渲染整页。
- 不改 IPC、共享契约、主进程加载和保存。
- 不顺手删掉快捷键里重复的可编辑区域判断，不改卷名文案规则。
