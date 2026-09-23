# 写作时对照本书已写内容

> 2026-09-23 · 设计建议，不含实现  
> 前置：小说正文向量库已经落地，见 `docs/architecture/database-vnext/05-novel-vector-store.md`。  
> 主题只有一件事：续写和改写之前，Agent 能按意思找回这本书已经写成的片段，用来减少脱节、重复和前后矛盾。

## 1. 要提高的质量

Agent 今天写一章时，专用写作器只收到一条不超过 4000 字的指令，并读取该章当前修订。对话里的模型若要看其他章，只能调用 `get_book_outline`、`read_book_chapter` 或 `search_book_chapters`。字面搜索要求查询词已经出现在正文里。人物换了称呼、物件隔了几十章、同一场戏换了措辞，都找不回来。

结果是后文容易和前文脱节，同一件事写成两个版本，或者把已经写过的段落再写一遍。向量库保存的是当前修订的片段。这一步让写作用上这些片段，不另建一套正文。

## 2. 已经落地的事实

这些行为以当前代码为准。实现时不要改成另一套。

- 索引对象是一本书里尚未删除章节的当前修订纯文本。草稿、历史修订、书名和卷摘要不进入向量。
- 查询入口是 `searchNovelFragments` 和 `searchSimilarFragments`。两者都把输入嵌成当前空间的一条向量，按已发布的章和修订做余弦召回，再用 `book.sqlite` 丢掉已删除或修订已变的命中。`limit` 由调用方传入。命中带 `bookId`、`chapterId`、`revisionId`、半开区间偏移、`content` 和 `contentHash`。
- 索引不存在时抛出 `Novel vector index does not exist.`。状态为 `failed` 时抛出 `Novel vector index is unavailable.`。正在重建、空间、代际或分块版本不一致时抛出 `Novel vector index is rebuilding.`。空数组表示没有通过核对的命中，不表示索引不可用。
- 查询没有章节范围参数，也不会在丢掉过期命中后自动补足 `limit`。
- 编辑器正式保存会在 `BookWorkspaceApplication.saveBookChapterContent` 提交后把 `bookId` 入队。打开可用的书时也会追赶。草稿保存不入队。
- `NovelApplication.saveRevision` 是编辑器保存、`replace_book_chapter_text`、`rewrite_book_chapter_text`、`generate_book_chapter_content` 和恢复修订的共同提交点。后四条路径提交后没有入队。因此 Agent 刚写完的章要等下次打开这本书才会进入索引。
- `generate_book_chapter_content` 内部的写作调用 `maxTurns` 为 1，不能再调用工具。找回前文必须由外层对话完成，再写进交给写作器的指令。

## 3. 建议做成的功能

功能名称：写作时对照本书已写内容。

外层 Agent 在续写、改写或检查前后文之前，先从当前书的已发布向量里取回有限片段，需要整章时再调用 `read_book_chapter`。专用写作器仍只负责按指令生成并保存一版修订。向量文本不写回章节表，也不自动塞进每一轮系统提示。

这样做是因为长篇的相关旧文只占全书的一小部分。每轮都带上全书，会挤掉当前任务和正在写的章。由模型在任务依赖前文时主动检索，条数仍由调用方决定。

## 4. 两个工具

两个工具都是只读，权限与 `search_book_chapters` 相同：`book.read`，上下文 `book-editor`，审批 `allow`，风险 `low`。书籍编号取当前项目的书，不接受模型传入的任意 `bookId` 或本机路径。

### 4.1 `search_novel_passages`

动笔前按意思找回旧文。例如这个人上次出现时的状态、这件东西在谁手里、这个约定有没有说过。

| 参数 | 规则 |
|---|---|
| `query` | 必填。一段问题或描述。空白输入沿用查询端口的错误，不返回空列表。 |
| `limit` | 必填正整数，工具层设置上界。端口不替调用方决定召回条数。建议上界与 `search_book_chapters` 一致，为 100。 |
| `upToChapterId` | 可选。给出时，只保留该书中位置不晚于该章的章节，并且在截断 `limit` 之前过滤。不给出时搜索整本已发布正文。不要默认成当前编辑器章节。 |

返回每一条的章节标识、章节标题、修订标识、起止偏移和片段正文。标题从 `book.sqlite` 读取，不放进向量。

### 4.2 `find_similar_passages`

拿即将写下或刚写下的一段正文，找书中相近段落，用来发现重复和同一场景的另一份写法。

| 参数 | 规则 |
|---|---|
| `text` | 必填。一段正文。空白输入同样报错。 |
| `limit` | 与上一工具相同。 |
| `excludeChapterId` | 可选。检查某一章的新稿时传入该章，避免最近命中就是这段自己。不传入时不排除。 |

返回字段与 `search_novel_passages` 相同。

两个工具都调用已经写好的查询函数。索引抛出的三类错误原样返回给模型，并说明应改用 `search_book_chapters`。不要把错误吞成空列表。

## 5. 和现有工具怎么配合

| 工具 | 职责 |
|---|---|
| `get_book_outline` | 目录、章序和标题。决定 `upToChapterId` 时用它。 |
| `search_book_chapters` | 已知原词时的字面搜索，也是向量索引不可用时的退路。 |
| `search_novel_passages` | 按意思找已写内容。 |
| `find_similar_passages` | 按正文找相近段落。 |
| `read_book_chapter` | 命中之后回读整章。片段本身不是改写单位。 |
| `generate_book_chapter_content` | 根据已经写好的指令生成并保存。它不自己检索。 |
| `replace_book_chapter_text` / `rewrite_book_chapter_text` | 局部或整章修改已有正文。 |

建议在现有系统提示里补一句：任务依赖其他章的人物、物件、约定或已有写法时，先用 `search_novel_passages` 或 `find_similar_passages`；索引报错时再用 `search_book_chapters`。这句放在今天提示 `get_book_outline`、`search_book_chapters` 和 `read_book_chapter` 的同一处。

续写一条长章时，外层对话可以分几步：用大纲确定写到哪一章为止，用片段检索取出相关旧文，用相似度检索检查指令里的新段落是否撞车，把短证据写进 4000 字指令，再调用 `generate_book_chapter_content`。证据放不下时，指令里保留章节和偏移，写作器需要细节时由外层先读章再补指令。不要把向量检索做进 `maxTurns = 1` 的写作器内部。

## 6. 索引必须先跟上正式保存

工具上线前，先让每次成功写出新当前修订的保存都入队。建议落在 `NovelApplication.saveRevision` 返回新修订之后。内容哈希未变、函数提前返回旧修订时不入队。

这样会覆盖：

- 编辑器正式保存
- `replace_book_chapter_text`
- `rewrite_book_chapter_text`
- `generate_book_chapter_content`
- 恢复修订

`BookWorkspaceApplication` 里已有的入队可以保留。同一本书的索引队列是串行的，多排一次只会在游标之后空跑。草稿保存仍不入队。没有 embedding 客户端时，现有协调器会在创建 `vectors/` 之前返回。

导入若也经过 `NovelApplication.saveRevision`，会一并入队。若导入走的是另一条存储写入，则仍靠打开书时的追赶，不在这个工具里补导入器。

## 7. 建议的实施顺序

1. 在 `NovelApplication.saveRevision` 成功提交新修订后入队，并补测试：Agent 保存和章节生成入队，草稿不入队，内容未变不入队。
2. 增加两个只读工具和清单。测试使用假的 embedding 客户端和临时目录，不访问网络。覆盖：命中返回位置和正文、墓碑与过期修订不出现、`excludeChapterId` 生效、`upToChapterId` 在截断前生效、三类索引错误不被当成空结果。
3. 在书籍编辑上下文的系统提示里写明何时调用，以及索引失败时改用字面搜索。
4. 用一本已有索引的书做一次手工验收：续写前能找回换了说法的旧情节；相似度检查能看见近重复；Agent 刚保存的章在同一次打开中可被下一轮检索看见。

`upToChapterId` 要用 `book.sqlite` 的章节位置，在调用 LanceDB 之前收窄已发布章节集合。当前查询函数还没有这个参数，应加在工具所调用的查询边界上，不要在工具里先取满 `limit` 再丢掉后面的章。

## 8. 这一步不做

- 不建专业资料库，不把外部写法资料和正文证据混在同一次召回里。
- 不做关键词与向量的混合排序，不改 `search_book_chapters` 的字面匹配。
- 不把命中写入会话或 `project.sqlite`，也不新增界面。
- 不改专用写作器的单轮限制，不让它在生成过程中自己调用这两个工具。
- 不建 ANN 索引。查询保持现有的精确余弦检索。

这些留到正文对照被实际用于续写之后再设计。更大范围的资料库和检索追溯仍见 `docs/architecture/database-vnext/02-vector-rag.md`。
