# GraphStory：通过基于事件的叙事编辑实现协作式故事写作

**作者：** Xuan-Vu Le\*（胡志明市自然科学大学，越南国立大学，越南胡志明市）、Minh-Loi Nguyen\*（胡志明市自然科学大学，越南国立大学，越南胡志明市）、Khanh-Duy Le（胡志明市自然科学大学，越南国立大学，越南胡志明市）、Minh-Triet Tran（胡志明市自然科学大学，越南国立大学，越南胡志明市）、Trung-Nghia Le†（胡志明市自然科学大学，越南国立大学，越南胡志明市）

\* 两位作者对本文的贡献同等重要。

† 通讯作者。邮箱：ltnghia@fit.hcmus.edu.vn

> 允许免费制作本作品全部或部分的数字或纸质副本，供个人或课堂使用，但前提是：此类副本不得用于营利或商业目的，且副本须在首页载明本声明及完整引用信息。本作品中归属于作者以外其他方的组成部分，其版权必须得到尊重。允许附注引用的摘要。除此之外的复制、再发布、上传至服务器或分发至列表，均须事先获得特定许可和/或支付费用。许可申请请发送至 permissions@acm.org。
>
> Conference'17, Washington, DC, USA
>
> © 2026 版权归所有者/作者所有。出版权授权给 ACM。
>
> ACM ISBN 978-x-xxxx-xxxx-x/YYYY/MM
>
> https://doi.org/10.1145/nnnnnnn.nnnnnnn
>
> arXiv:2606.16102v1 [cs.HC] 2026 年 6 月 15 日

## 摘要

故事写作是一项广受欢迎却又复杂的创作活动，需要组织想法并进行迭代式探索，尤其是在早期构思阶段。虽然已有许多基于人工智能的写作辅助工具被开发出来，但现有方法主要聚焦于生成长篇连贯文本，以及提升用户在文本产出过程中的可控性，对头脑风暴、连接想法和验证替代性叙事流程所提供的支持却十分有限。我们提出了 GraphStory，一个交互式写作支持系统，它借助基于图的表示来提供叙事结构的全面视图并促进构思。该系统使用户能够组织和连接情节点、探索替代分支，并通过集成式的故事生成工作流来验证不断演进的叙事。它进一步提供了一个结构化界面，以支持在多个故事路径上高效迭代。一项面向专业与半专业写作者的用户研究结果表明，与常规的基于 AI 的写作工作流相比，GraphStory 降低了组织叙事结构所需的精力，并更好地支持了创造力与探索。

## CCS 概念

- 计算方法学 → 计算机视觉；自然语言处理；
- 以人为中心的计算 → 信息可视化；交互系统与工具。

## 关键词

AI 辅助创作；人机协同创作交互；基于图的叙事；交互式叙事编辑；基于事件的故事建模

## ACM 引用格式

Xuan-Vu Le, Minh-Loi Nguyen, Khanh-Duy Le, Minh-Triet Tran, and Trung-Nghia Le. 2026. GraphStory: Collaborative Story Writing through Event-Based Narrative Editing. In . ACM, New York, NY, USA, 12 pages. https://doi.org/10.1145/nnnnnnn.nnnnnnn

## 1 引言

故事写作是横跨众多领域的常见活动，包括文学、编剧、新闻、营销，以及游戏等交互式媒体 [11, 49, 60]。在这些情境中，写作者必须通过组织事件、塑造角色和维持连贯的叙事结构来构建引人入胜的故事 [1, 17]。由于故事写作具有创造性且认知负担沉重 [15, 29]，它吸引了大量研究者的关注，他们致力于设计交互式应用来支持这一过程 [5, 31, 54]。特别是，人工智能（尤其是大语言模型 LLM）的近期进展 [24, 35]，催生了一批新系统，它们通过生成文本、提供建议 [7, 8, 27, 32, 57]，以及支持写作工作流的不同阶段 [30, 39, 47, 58, 59]，来辅助写作者。

近期工作聚焦于利用广泛的输入形式来生成长篇、连贯的叙事 [7, 39, 57]。这些系统可以根据前缀或后缀来约束生成，也可以根据主题、风格、主题和语气等更高层次的规范来约束生成 [9, 13, 30]。更先进的方法进一步纳入了多模态或结构化输入，包括图像、草图、大纲、世界观设定和角色描述 [7, 23, 47, 58, 59]。通过支持多样化的输入形式，这些方法使写作者能够更好地控制生成内容，确保其与自身意图保持一致，同时维持流畅性、连贯性和吸引力 [54]。然而，这些方法主要支持文本产出与控制，而对初始叙事流程的构建所提供的辅助十分有限。在这一阶段，写作者必须将零散的想法连接成连贯的结构，推理事件之间的关系，并迭代式地探索替代性的故事走向。现有系统往往要求写作者依赖顺序式提示或手动改写，这使得将不断演进的叙事外化、组织和精炼变得困难。因此，写作者经常难以将彼此迥异的想法连接起来，也难以高效地在不同的叙事方向上迭代。

基于图的表示已被广泛应用于各个领域，用以建模复杂且结构化的信息，为用户提供一种直观的方式来组织和探索元素之间的关系 [21]。先前的工作已经表明，图在支持意义建构、规划与知识组织方面十分有效，因为它们能将连接关系外化，并提供对相互关联组件的清晰概览 [36, 42, 45]。用户常常反映，在处理复杂关系时，图结构比线性格式更为直观，因为它们允许灵活的导航以及对单个元素的直接操控 [3]。这些特性使图特别适合表示叙事结构——在叙事结构中，事件与情节点天然地相互关联，并常常以非线性方式演进。通过显式地捕捉这些关系并支持分支，图表示提供了一种自然的媒介，用于发展和精炼叙事流程。

在本文中，我们提出了 GraphStory，一个写作支持系统，它利用基于图的表示作为用户交互与 LLM 输入之间的中间层。GraphStory 使写作者能够通过交互式图界面来组织、连接并迭代式地将想法发展为连贯的叙事结构（图 1）。该图充当 LLM 的结构化上下文，使系统能够生成植根于不断演进叙事的即时输出，并提供改进情节点之间连接的建议。为支持迭代式发展，GraphStory 允许用户探索和比较替代性故事分支，从而促进对不同叙事流程的验证与精炼。

我们通过一项面向专业与半专业写作者的用户研究来评估 GraphStory。我们的结果表明，与传统的基于 LLM 的写作辅助工具相比，GraphStory 通过降低组织叙事结构所需的精力、更好地支持创造力、探索与控制，改善了写作体验。

总而言之，我们的贡献如下：

- 我们提出了一种基于图的、面向故事写作的交互范式，它利用结构化表示来支持叙事流程的发展与组织，同时在用户交互与 LLM 推理之间架起桥梁。
- 我们设计并实现了 GraphStory，一个交互式系统，使写作者能够连接想法、探索替代性故事分支，并在有依据（grounded）的 LLM 辅助下迭代式地精炼叙事。
- 我们呈现了来自用户研究的发现，证明与传统基于 LLM 的写作工作流相比，GraphStory 降低了组织叙事的精力，并更好地支持了创造力、探索与控制。

## 2 相关工作

### 2.1 基于 LLM 的叙事写作

大语言模型（LLM）的近期进展已展现出在生成流畅、连贯且上下文相关长篇文本方面的强大能力 [7, 39, 57]。研究者与实践者都已认识到它们在叙事写作任务（包括故事生成、改写和风格化改编）上的潜力 [14, 54]。除了通过聊天式界面的随意使用之外，先前的工作还探索了更为结构化和交互式的系统，将 LLM 集成到写作工作流中，旨在提供更强的控制与可用性。

这些系统旨在通过对故事生成施加更强控制，允许用户指定广泛的输入形式来引导输出 [48]。早期方法依赖文本条件化，例如前缀或后缀，由模型对给定文本片段进行续写或补全。更近的工作通过纳入主题、体裁、风格、主题和语气等更高层属性对此加以扩展，使写作者不仅能塑造"写了什么"，还能塑造"如何表达" [9, 13, 30]。此外，一些系统引入了结构化输入，如大纲、世界观设定和角色描述，帮助将生成锚定在预定义的叙事上下文中 [47, 58, 59]。在文本之外，图像、草图或视频等多模态输入也被探索，用以激发或约束故事创作 [23]。通过组合这些多样化的输入形式，这些系统使写作者能够对生成内容施加更细粒度的控制，产出与其意图更加一致的叙事，同时保持连贯性、流畅性与吸引力。

此外，这些系统通过重新思考写作者提供输入的方式、超越不受限制的自然语言提示，来改善故事创作的用户体验 [2]。许多界面不再依赖单一的自由形式提示，而是引入了更加结构化和交互式的机制，例如可编辑表单、滑块、模板和模块化输入字段 [10, 18, 40, 46]。这些方法使写作者能够逐步指定角色、场景和情节点等元素，同时让他们的选择所产生的效果更易于解读与修订 [47, 59]。一些系统进一步支持分步式工作流，引导用户经历规划、起草和精炼等阶段，从而以更有组织、更具迭代性的方式提供输入 [39, 58]。通过让输入过程更加明确和受引导，这些设计降低了歧义性，减轻了提示工程（prompt engineering）的负担，并为写作者提供了对生成叙事更清晰的控制感。

现有的可控文本生成方法主要聚焦于改进输出质量 [54]，但对叙事想法的发展与结构化提供的支持十分有限。由于大多数系统依赖线性文本和顺序式提示，对演进结构的组织几乎不提供支持，写作者往往难以将零散的想法连接成连贯的流程、探索替代性走向以及评估改动带来的影响。为填补这一空白，我们的工作将重心转向交互设计，引入一个界面，使写作者能够在生成之前对想法进行结构化、组织与连接，并接收植根于这一结构化表示的输出。

### 2.2 基于图的交互

基于图的表示被广泛用于建模复杂、结构化的信息，为用户提供一种直观的方式来组织和探索相互关联元素之间的关系。先前的研究已经证明了它们在意义建构、规划与知识管理等任务中的有效性——在这些任务中，将关系显式化有助于用户构建和精炼其理解 [36, 42]。与线性表示相比，图支持灵活的导航与直接操作，使用户能够在保持对整体结构感知的同时，专注于各个组件 [3, 22, 41]。

这些特性使图特别适合表示叙事结构。故事本质上由相互关联的元素构成，包括事件、角色和因果关系，它们常常以非线性方式演进 [38, 43]。现有的叙事建模工作探索了各种类图结构，例如事件网络与情节图，用以表示时间序列、因果依赖与角色互动 [33, 50, 53, 56]。在交互式叙事与游戏设计等领域，分支结构通常被用来建模替代性故事路径，使作者能够设计多种可能的发展与结局 [43, 44]。

图表示实现了一种纯文本难以企及的抽象层次，使写作者能够将高层次的故事组件建模为节点，并逐步精炼它们，从而同时支持概览式与面向细节的编辑。这有助于重组叙事、探索替代性配置，以及通过分支、重组和迭代精炼来在复杂故事线中维持连贯性。基于这一思想，我们的系统对先前工作进行了扩展：将图不仅仅视为一种可视化或规划辅助工具，而是作为叙事写作的核心交互媒介。在 GraphStory 中，图既充当组织和探索故事元素的界面，也充当 LLM 的结构化输入，将用户定义的结构与模型生成的内容紧密整合，从而支持对叙事流程更具交互性和灵活性的发展与验证。

## 3 形成性研究

为了给我们的系统设计提供依据，我们开展了一项形成性研究，以更好地理解写作者在叙事发展过程中的需求。我们特别聚焦于将初始想法扩展为连贯故事这一阶段——该过程涉及组织概念、建立事件之间的连接，以及在替代性叙事方向上迭代。我们还试图探索基于图的表示如何支持这一过程，以及何种交互机制对写作者而言最为直观和有效。基于这项研究，我们旨在回答以下研究问题：

- **RQ1：** 写作者在将初始想法发展为连贯的叙事结构时会遇到哪些挑战？
- **RQ2：** 写作者期望如何与基于图的表示进行交互，以支持叙事的发展与探索？

### 3.1 参与者

我们招募了五名参与者（年龄 18–22 岁；2 名男性、3 名女性），均为写作相关专业的学生，包括编剧、文学和文案写作。我们在全文中将他们称为 FP1–FP5。所有参与者都具备写作经验，并且此前有使用 LLM 辅助工作的经验。参与者均提供了知情同意，并因参与获得 5 美元补偿。

### 3.2 研究设计与流程

我们开展了一项由两部分组成的形成性研究，以考察写作者在叙事发展过程中的实践与挑战。首先，我们进行了半结构化访谈，以了解参与者如何将初始想法转化为完整故事，重点关注他们的工作流、组织想法的策略，以及在连接事件和在叙事方向上迭代时的困难。

在第二部分中，我们开发了一个简单的原型，将故事表示为一幅图，其中节点对应叙事元素，边表示推进与分支。参与者与该界面交互，对一则熟悉的故事进行修改和重组，并且可以将其编辑提交给一个大语言模型（LLM），以生成反映这些改动的更新版本。他们在执行这些任务时遵循出声思考（think-aloud）协议 [12]，使我们能够观察他们如何与图交互以及如何利用 LLM 反馈。

每次会话都在一个私密房间中进行。参与者首先被告知研究目标，然后完成初始访谈，随后在研究者支持下进行 30 分钟的原型交互。最后，他们参加了一次后续访谈，就系统的可用性与有用性提供反馈。

### 3.3 分析

我们对所收集的数据（包括初始访谈、交互会话和后续访谈）进行了主题分析（thematic analysis）[4]。我们采用归纳式方法来识别与参与者写作实践、挑战以及与基于图的原型的交互相关的重复模式。分析过程涉及迭代式编码与精炼，并经过多轮审阅与作者间的讨论以整合主题。通过这一迭代过程和多阶段审阅，主观性得到了缓解。

### 3.4 叙事流程发展的挑战

**迭代式过程。** 参与者一致将叙事发展描述为一个高度迭代的过程。他们并不遵循固定的顺序，而是经常探索多个可能的方向、修订先前的想法，并随着时间的推移精炼故事元素，其中涉及频繁的回溯，以及在评估不同情节发展可能如何影响整体故事时对替代方案进行比较。然而，参与者指出，现有工具对这种迭代提供的支持十分有限，往往要求他们手动追踪或改写不同版本。例如，FP1 表示她"在使用 ChatGPT 这类工具时，常常难以回溯旧想法"，使得重温先前的思路变得困难；而 FP3（一名编剧专业学生）解释说，他"通常会准备多条故事流程，以便比较并呈交给老师"，这凸显了管理并行叙事路径的需求。这使得高效地探索和管理多条叙事轨迹变得困难。

**叙事元素之间的连贯连接。** 维持跨叙事元素的连贯性成为一项关键挑战。参与者报告说，在事件之间建立清晰的关系存在困难，尤其是在将新想法整合进现有结构时，往往需要推理因果、时间与主题上的连接。例如，FP2 解释说，他们"常常先想到一些关键事件，然后再尝试将它们连接起来"，这凸显了有意义地串联故事组件所需付出的努力；而 FP5 指出，"初始想法往往并不连贯"，需要进一步精炼才能实现一致性。因此，确保故事在不同部分之间逻辑流畅、衔接紧密，需要消耗大量的认知精力。

**内容篇幅的保证。** 参与者强调，需要根据故事的预期形式（如短篇小说、剧本或更长的叙事）来确保故事包含适当数量的内容。这往往需要添加、扩展或压缩事件，以满足节奏与完整性的预期，因为写作者需要调整叙事元素的数量，以确保故事在不过于稀疏也不冗长多余的前提下显得足够充实。然而，把握这种平衡可能颇具挑战性，因为它既需要对整体结构的感知，也需要对单个事件贡献的把握。例如，FP5 指出，他们"即使当前情节感觉已经完整，可能仍需要添加更多细节以确保内容范围"，这可能导致在不打乱现有结构的情况下引入新事件，或在某些情况下需要改动整体流程。

### 3.5 基于图的交互

**带多层级细节的全面概览。** 参与者反映，与线性文本相比，图表示提供了对叙事更全面的视图。通过将故事元素组织为节点和连接，图使写作者能够同时感知整体结构并检视各个组件，从而既支持高层次理解，也支持局部化编辑。例如，FP2 解释说，"完整故事的图视图帮助我知道在哪里添加更多事件，并追踪它会产生什么影响"，这凸显了该表示如何支持对结构性影响的推理。与基于段落的格式相比，这种双重视角使参与者能够在抽象故事流程与具体叙事元素之间更有效地切换。

**对叙事流程的灵活探索。** 参与者发现，利用图结构可以轻松地探索和测试不同的叙事流程。特别是，通过修改边来改变推进或分支，使他们能够快速重组故事并评估替代方向。与改写文本相比，这种交互被认为更加高效和直观，因为它使用户能够专注于结构改动，而无需改动整个叙事。例如，FP1 强调，调整节点之间的连接使她更容易尝试不同的故事路径；而 FP4 指出，"调整图并查看 AI 的输出，启发了自己如何写故事"，这强调了快速反馈如何支持创作性探索。因此，图表示支持快速实验，并帮助写作者系统地探索和比较不同的故事发展。

## 4 GraphStory

### 4.1 系统概览

基于我们形成性研究的洞察，我们提出了 GraphStory，一个有理有据（grounded）的系统，旨在通过结构化而灵活的探索，支持写作者发展和精炼其想法。该系统包含三个核心组件：事件图构建器（Event-Graph Constructor）、故事生成器（Story Generator）和多层级流程管理（Multi-level Flow Management）模块。事件图构建器将用户输入转化为节点序列，提供一种全面的表示，以促进叙事想法的组织与渐进式发展。在此结构的基础上，故事生成器充当一个人机协同（human-in-the-loop）模块，产出临时性的叙事输出，为写作者提供参考点，以验证正在成形的故事线、比较替代流程、改进连贯性并管理内容范围。作为这些组件的补充，多层级流程管理模块支持在不同组织层级之间迭代，使用户能够探索、比较和精炼叙事流程，以识别最符合其意图的流程。

### 4.2 事件图构建器

事件图构建器是一个核心模块，旨在将用户提供的内容转化为表示叙事流程的结构化事件图（图 3）。它接收三种形式的输入：抽象想法、结构化大纲和完整故事，每种输入都可以通过文本提示或上传文档（如 PDF 或 Word 文件）提供。用户显式选择输入类型，使该模块能够调整其处理策略，以最好地适配所提供的材料。输出是一个节点序列，捕捉关键叙事事件并以层级化格式组织它们，使写作者能够有效地可视化和精炼故事结构。

为处理抽象想法，系统通过一个两阶段流程从用户输入构建细粒度大纲。它首先生成一份初步大纲，将想法组织为高层次章节——称为块（chunk），代表主要的叙事单元。随后，它通过为每个块生成相应的事件列表来细化各块，这些事件捕捉关键情节点并实例化叙事内容，从而将初始概念转化为支持早期探索与发展的结构化序列。

对于结构化大纲，系统遵循类似流程，将输入转化为更详细的表示。它依据大纲固有的结构，将其划分为高层次章节（称为块），然后为每个块生成植根于其内容的相应事件列表。这在保留原始组织意图的同时，将大纲扩展为关键叙事点的连贯序列。

对于完整故事，系统首先将文本切分为段落，并确定合适的分组规模，将连续段落组合成块，形成保持连贯性的更高层叙事单元。随后解析每个块以识别其主要事件，从而得到故事叙事流程的结构化、详细表示。

在所有输入类型中，所得的节点序列都充当当前流程上事件图的初始化。界面提供多分辨率编辑范式，以同时管理总体情节与具体叙事元素（图 2）。在宏观层级，图提供结构的概览（图 2B）：节点（代表块）显示简洁的摘要标题，并通过描绘故事推进的结构性箭头连接。写作者可以通过连接节点或延伸路径来组织情节，以在头脑风暴期间展示分支式故事线。在微观层级，写作者可以利用语义缩放（semantic zooming）展开某个节点并检视其编号的事件列表。通过交互特定节点，用户打开一个专用的事件编辑器（图 2C）。在这里，他们可以利用直接操控来拖放、重排、编辑、删除或手动添加单个事件，且严格限定在特定块的边界之内。这些交互共同实现了对叙事的灵活、迭代式操作，既支持高层次重组，也支持细粒度编辑。

### 4.3 故事生成器

故事生成器模块旨在从用户选定的块中产出精炼的叙事，支持对选定故事线的验证，同时就改进连贯性与管理内容范围提供指导。要为特定叙事分支启动生成，用户通过右键点击一个起始节点来锚定路径，从而进入选择模式，随后依次左键点击后续节点来定义精确的叙事链（图 4，步骤 1）。节点被选中时会被点亮，并由蓝色箭头连接，在视觉上将活跃的生成队列与底层的结构图区分开来。如果用户希望改变顺序或取消选择，只需点击空白图区域的任意位置即可重置路径。此外，用户指定目标内容长度，并可选择性地配置写作风格、语气或主题等属性，这些属性会引导后续生成，而不会约束手动编辑。

生成流程通过两个阶段并结合人机协同确认来构建新的事件序列。在第一阶段，系统在块内（intra-chunk）层级运作，向每个选定的块添加新事件，以改进局部连贯性，并在必要时更好地对齐期望的内容范围，同时不修改现有事件，从而保留用户的原始意图。在第二阶段，系统在全局层级考虑块的序列，修改已添加的事件，并插入新事件以改进块之间的过渡与整体流程。这些添加旨在提供支持性建议，而非强制正确性，将精炼或修改叙事的控制权留给用户。

在这两阶段生成之后，系统将原始事件与 AI 新增事件新混合而成的序列呈现为一幅精炼的图，采用与基线流程完全相同的可视化界面（图 4，步骤 2）。为确保清晰的视觉溯源并维持用户主导权，所有 AI 生成的事件都以一种独特的颜色高亮显示，与写作者的原始想法即刻区分开来。这种视觉与交互上的一致性大幅降低了用户的认知负荷；用户可以看到 AI 的块间与块内建议被直接整合进他们熟悉的"节点—事件列表"结构之中。重要的是，交互并不仅限于 AI 生成的内容。使用标准事件编辑器，用户可以轻松地检查、修改或拒绝这些以颜色编码的建议，同时保留无缝编辑所有块中任何原始事件的能力。这种全面的控制使作者能够通过直接操控迭代式地调整整个结构，将叙事流程打磨得完全符合其偏好。一旦用户对这幅精炼图感到满意并提供确认，系统便将最终确定的结构输入底层 LLM（具体为 GPT-4o [26]），并纳入用户指定的配置（如风格与主题），以生成完整的叙事文本（图 4，步骤 3）。为了支持用户评估与可解释性，界面采用了一种映射机制，将块与其对应的生成文本片段相链接。所得输出提供了流畅自然的阅读体验，使写作者能够直观地感受故事流程，同时轻松追溯 LLM 如何将事件转化为散文。

### 4.4 多层级流程管理

多层级流程管理模块（图 2A）为故事开发提供结构化的组织与版本控制，支持多层次的叙事探索。它围绕三个层级设计：故事（story）、流程（flow）和版本（version）。当用户通过向事件图构建器提供输入来开始工作时，会创建一个新的故事级单元。该单元充当总体容器，囊括写作者生成的事件图与故事迭代的所有变体。

在一个故事单元内，每条流程代表叙事的一种独特推进。当写作者希望探索完全不同的故事方向，或当现有图因块与事件数量过多而变得过于复杂时，流程尤其有用。每条流程捕捉某一特定变体的结构与序列，使写作者能够在实验时不丢失先前的工作。

每当从一组选定的块生成一则故事时，就会创建一个版本，它捕捉在故事生成阶段产生的精炼事件序列以及相应的叙事文本。每个版本并非仅存储原始块，而是将这一增强后的事件结构保存为已发展故事线的具体表示。写作者可以通过用某个版本所关联的图来初始化一条新流程，从而复用该版本，将精炼后的事件序列作为进一步探索与修改的起点。这种横跨故事、流程与版本的组织方式，为创作过程提供了灵活的控制，支持迭代式发展、替代方案的探索，以及对先前生成结构的高效复用。

## 5 用户研究

我们开展了一项研究，从功能性、可用性及其对降低写作者认知负荷的影响等方面来评估我们的系统。该研究旨在理解系统在支持写作者管理复杂叙事、生成连贯故事以及迭代式精炼想法方面的有效性。通过考察这些方面，我们试图评估该系统在促进故事写作中创造性层面与认知层面的整体有效性。

### 5.1 参与者

我们招募了 16 名学生（年龄 18 至 22 岁，8 男 8 女）参与研究。我们在全文中将他们称为 UP1–UP16。所有参与者均为写作相关专业，并具备娴熟的写作技能。所有参与者均未参加过涉及本系统的任何先前研究。所有参与者都表示熟悉基于 AI 的写作工具。每位参与者均获得知情同意，并按每小时 5 美元的费率获得参与补偿。

### 5.2 研究设计与流程

每位参与者都在一个私密房间中单独参与研究，一位作者在场，根据需要提供指导与支持。每次会话持续约一小时。参与者被要求使用一组提供的想法完成一项单一的故事写作任务。

参与者首先使用 ChatGPT 写一则故事，然后使用我们的系统完成同一任务。他们被指示在整个过程中遵循出声思考（think-out-loud）协议，在与工具交互的同时将他们的想法、策略和推理用语言表达出来。整个会话被录制下来，以同时捕捉屏幕活动与言语表达，从而能够对参与者创作过程中的交互与认知过程进行详细分析。

在会话期间，随着参与者完成任务，我们收集了额外的反馈，提供了对其体验的即时洞察。在完成两项任务后，参与者填写了基于预定义指标、采用李克特量表（Likert-scale）格式的评估表。此外，他们完成了 NASA 任务负荷指数（NASA-TLX）问卷 [20]，以评估跨多个维度的感知工作负荷。最后，我们进行了半结构化访谈，以收集关于其体验、偏好以及对该系统（与 ChatGPT 相比）看法的更详细定性反馈。这一流程使得能够在受控且一致的环境中，对可用性、功能性与认知支持进行全面评估。

### 5.3 定量结果

在统计分析方面，我们使用 Wilcoxon 符号秩检验 [55] 来分析数据。所有分析均以 p < 0.05 作为统计显著性标准。

#### 5.3.1 交互体验与生成内容评估

我们使用一份采用 7 点李克特量表 [28] 的问卷（如图 5 所示）来评估本系统在该任务中相较于 ChatGPT 的可用性。虽然聊天式交互在易用性上略高于我们的图界面（Q1，p = 0.26），但我们的系统更好地实现了其作为工具的目标——帮助写作者组织、头脑风暴并迭代式发展叙事想法。它在迭代便利性（Q2，p < 0.001）、任务效率（Q4，p < 0.01）和用户舒适度（Q5，p < 0.001）方面均优于 ChatGPT。两系统所生成情节点的用户评分略有提升（Q3，p < 0.05），这表明故事生成模块的表现优于仅依赖 ChatGPT。

#### 5.3.2 任务负荷

NASA-TLX 结果（图 6）表明，GraphStory 在多个维度上降低了感知工作负荷。参与者报告了更低的精神需求、体力需求和时间需求，同时与基线条件相比，他们对自身表现的评价也更为正面。此外，挫败感水平始终更低，表明交互体验更为舒适、更易驾驭。

这些发现意味着，基于图的表示与多层级流程管理机制共同帮助用户更好地组织和导航叙事元素。通过提供更清晰的结构概览并支持增量式探索，系统降低了故事发展过程中的认知精力与时间压力。因此，用户可以更专注于创造性决策，而非管理复杂性，从而带来更高效、压力更小的写作过程。

#### 5.3.3 功能性评估

我们使用一份采用 7 点李克特量表 [28] 的问卷（图 7）来评估 GraphStory 的关键功能，包括节点序列生成（Q1）、图表示与交互引擎（Q2–Q3）、生成的故事（Q4），以及多层级管理系统（Q5）。结果显示，大多数问题都获得了持续的高评分，表明参与者认为该系统有效且易用。总体而言，这些发现表明 GraphStory 为结构化和灵活的叙事发展提供了强有力的支持。

### 5.4 定性结果

**全面的图表示。** 参与者一致强调，事件图提供了对其叙事的清晰且结构良好的视图。通过将故事元素从高层次概念一直组织到具体事件，该表示使关系和推进在多个抽象层级上更加透明。这种层级化结构使写作者能够在保持对复杂故事线概览的同时，识别出缺口或不一致之处。若干参与者强调了导航的便利性，指出他们可以快速定位并编辑故事的特定部分，而无需重读大段文本。另一些参与者指出，图支持早期构思，使他们能够捕捉和组织涌现的想法，而无需投入撰写完整散文。

**迭代过程的加速。** 该系统被广泛认为加速了迭代式写作过程。参与者描述了即时输出（如更新后的图或草稿文本）如何使他们能够快速测试叙事变体并精炼故事结构。这减少了通常追踪和修订相互关联故事元素所需的精力，使人们能够更专注于创造性决策。在确定某一方向之前探索多条叙事路径的能力尤其受到重视。此外，与传统基于文本的工具相比，该系统管理修订的结构化方法使参与者更容易回访和修改先前的想法，而不会丢失对改动的追踪。

**故事想法的生成。** 故事生成模块通过引入新的情节点与连接，在支持创造力方面发挥了关键作用。参与者发现，生成的内容常常浮现出他们最初未曾考虑过的可能性，帮助他们扩展和丰富叙事。通过展示不同故事组件可以如何被连接，系统鼓励对替代方向的探索，同时保留作者控制感。一些参与者指出，更长的生成输出对发掘额外的叙事机会尤其有用，因为它们提供了更详细、更多样的建议。

**与 AI 生成内容相关的挑战。** 尽管有这些益处，参与者也报告了在与 AI 生成建议交互时的困难。特别是，新引入事件过多有时会导致混乱并扰乱预期的叙事流程。决定采纳哪些建议可能变得具有挑战性，尤其是当输出与原始故事线显著偏离时。参与者还观察到，不同的生成版本虽然共享相似的高层情节，但在细节上可能差异很大，使得在多次迭代间维持连贯性变得更加困难。这些问题表明，虽然生成式支持增强了创造力，但在未得到仔细平衡时，也可能增加认知负荷。

## 6 讨论

**结构化图表示架起用户意图与 AI 生成之间的桥梁。** GraphStory 设计的一个核心方面，是将结构化事件图用作用户意图与 LLM 生成之间的一个透明、可编辑的中间层。与聊天式界面中将提示视为不透明、一次性输入的做法不同 [39]，这种表示通过使从意图到输出的映射在多个粒度层级上可检查、可修订，从而契合以人为中心的 AI 原则 [2]。在宏观（块）与微观（事件）两个层级都支持编辑，镜像了发散—收敛的创作过程 [7, 16, 51]；将写作者限制在单一抽象层级的系统会扰乱这种自然的往复振荡，而 GraphStory 的双层模型则明确地同时容纳开放式的结构构建与细粒度的精炼。我们的定量结果支持这一点：GraphStory 在迭代便利性、任务效率与用户舒适度方面明显优于 ChatGPT。此外，功能性评估显示，参与者高度评价图表示所提供的全面概览及其编辑的便利性。GraphStory 的三层级组织（故事、流程、版本）进一步应对了同时追踪发散叙事方向的挑战——这是线性聊天界面从根本上无法支持的 [52]。参与者在定性反馈中证实了这一点，指出系统管理修订的结构化方法使他们更容易回访和修改先前的想法而不会丢失对改动的追踪，并且在版本与流程之间迭代十分直接。

**视觉溯源建立对 AI 生成内容的信任。** 将 AI 建议的事件以独特颜色高亮，并将其直接映射到生成的散文，使参与者获得了更大的信心与编辑控制力。在定性反馈中，参与者一致强调，原始内容与 AI 生成内容之间的视觉区分使他们能够快速评估、接受或拒绝建议，而不会丢失对自己贡献的追踪。这些观察与可解释 AI 研究中的发现一致 [2, 34, 37]，即让 AI 贡献可被辨认的溯源机制，对于在协同创作工作流中维持作者主导权至关重要 [32]。我们的功能性评估进一步支持了这一点，参与者对生成故事与所选节点之间的一致性给予了正面评价，表明带视觉溯源的两阶段生成过程对 AI 输出提供了有意义的可控程度。

**平衡 AI 主导权与写作者控制。** GraphStory 中一个反复出现的张力，在于校准 AI 贡献与写作者自主性之间的边界 [6]。当故事生成器提出块间事件时，它不可避免地引入了写作者本无意采用的叙事方向。我们的定性发现证实了这种双重性：参与者珍视创造性建议，并反映生成内容浮现出他们最初未曾考虑过的可能性；但他们也指出，过多的 AI 新增事件有时具有破坏性，并可能增加认知负荷。这种张力与关于过度依赖生成式系统的更广泛关切一致 [6, 39, 59]，并反映了一个根本性的协同创作设计挑战——贡献过少的系统提供的脚手架不足，而贡献过多的系统则侵蚀作者身份 [32]。值得注意的是，虽然调查回应表明聊天式交互最初被认为略为易用，但这并未转化为更好的创作成果。这表明，基于图交互适度的学习曲线被其结构上的优势成功地抵消了。未来的系统应探索自适应机制，根据写作者偏好与当前创作阶段来调节 AI 的贡献。

**更广泛的适用性与伦理考量。** 虽然 GraphStory 面向中短篇叙事写作，但其将结构化图用作可编辑中间层的底层范式，可扩展到编剧 [39]、游戏对话树 [49] 与交互式小说 [31]。近期由 LLM 驱动的创作工具证实了结构化表示在架起用户意图与系统执行之间桥梁方面的更广泛价值 [19, 25]。当这一范式被更广泛地应用时，也会产生伦理考量：当 AI 实质性地塑造叙事内容时，署名归属变得具有争议性 [39]；而在大型虚构语料库上训练的模型，可能会在故事原型或角色人口统计学特征中编码文化偏见 [54]，写作者可能在无意识中吸收这些偏见。

## 7 局限性与未来工作

尽管 GraphStory 展现出已证实的益处，仍有若干局限性指向具体的未来方向。

**生成中的非确定性。** AI 生成的内容是随机的：相同的输入在多次运行中可能产生截然不同的事件序列。虽然变异性可以引入新颖的想法 [7, 59]，但它使写作者难以分离出细小编辑的精确效果，从而扰乱迭代式工作流 [39]。未来的工作应探索具备温度感知的生成控制，让写作者能够根据自身所处的创作阶段，在变异性与一致性之间进行显式权衡。

**图—叙事对齐。** 生成的散文并不总能忠实地反映事件图——文本可能合并块、遗漏事件，或引入超出指定结构的内容。这在部分程度上是当前 LLM 所固有的 [54, 57]，它们难以在长输出中维持结构保真度。虽然 GraphStory 的两阶段生成缓解了这一问题，但未来的方法应探索约束解码策略，以更可靠地将叙事输出锚定在指定的事件序列上。

**参与者群体。** 我们的研究招募了 16 名年龄在 18–22 岁、写作相关专业的学生，这限制了向专业写作者（如小说家或编剧）的推广性——他们可能拥有不同的工作流与评估标准 [39]。我们当前的度量指标也可能无法充分捕捉风格化语感或叙事连贯性等优先事项。未来工作应在真实的创作环境中对专业人士开展纵向研究。

**基线与评估范围。** 使用 ChatGPT 作为唯一基线虽然代表了常见实践，但并未将基于图的结构化的贡献与专用大纲工具 [47, 58] 或结构化协同创作系统 [32, 59] 隔离开来。此外，GraphStory 在中等复杂度的故事上进行了测试；在大规模场景下——拥有数十个节点或众多并行流程时——画布可能在视觉上变得杂乱，图概览的认知收益也可能减弱 [3]。未来的工作应纳入针对无图基线的消融对比，并研究带有渐进式披露机制的自适应布局算法，以支持大规模叙事图。

## 8 结论

我们提出了 GraphStory，一个交互式写作支持系统，旨在通过基于图的叙事元素表示来促进创意故事写作。通过提供清晰的故事结构概览，并支持事件的组织与连接，GraphStory 使写作者能够探索替代性叙事路径、验证不断演进的故事线，并在多个故事流程上高效迭代。评估结果表明，该系统降低了管理复杂叙事所需的认知精力，加速了迭代式写作过程，并通过提供新的故事想法来支持创造力，同时保持用户对叙事发展的控制。

这些发现凸显了在创意写作工作流中将可视化、结构化表示与 AI 辅助生成相结合所带来的益处。虽然仍存在局限（如 AI 生成内容的变异性，以及与较长叙事之间偶尔的对齐偏差），但 GraphStory 展示了基于图的工具在同时增强故事创作中创造性层面与认知层面的潜力。

在未来的工作中，我们旨在改进生成内容的一致性，并进一步加强图与故事输出之间的连接，持续支持写作者探索、精炼并实现复杂的叙事。

## 参考文献

[1] H Porter Abbott. 2021. *The Cambridge introduction to narrative*. Cambridge University Press.

[2] Saleema Amershi, Dan Weld, Mihaela Vorvoreanu, Adam Fourney, Besmira Nushi, Penny Collisson, Jina Suh, Shamsi Iqbal, Paul N Bennett, Kori Inkpen, et al. 2019. Guidelines for human-AI interaction. In *Proceedings of the 2019 chi conference on human factors in computing systems*. 1–13.

[3] Christopher Andrews, Alex Endert, and Chris North. 2010. Space to think: large high-resolution displays for sensemaking. In *Proceedings of the SIGCHI conference on human factors in computing systems*. 55–64.

[4] Virginia Braun and Victoria Clarke. 2021. *Thematic analysis: A practical guide*. (2021).

[5] Tom Brown, Benjamin Mann, Nick Ryder, Melanie Subbiah, Jared D Kaplan, Prafulla Dhariwal, Arvind Neelakantan, Pranav Shyam, Girish Sastry, Amanda Askell, et al. 2020. Language models are few-shot learners. *Advances in neural information processing systems* 33 (2020), 1877–1901.

[6] Zana Buçinca, Maja Barbara Malaya, and Krzysztof Z Gajos. 2021. To trust or to think: cognitive forcing functions can reduce overreliance on AI in AI-assisted decision-making. *Proceedings of the ACM on Human-computer Interaction* 5, CSCW1 (2021), 1–21.

[7] John Joon Young Chung, Wooseok Kim, Kang Min Yoo, Hwaran Lee, Eytan Adar, and Minsuk Chang. 2022. TaleBrush: Sketching stories with generative pretrained language models. In *Proceedings of the 2022 CHI conference on human factors in computing systems*. 1–19.

[8] Elizabeth Clark, Anne Spencer Ross, Chenhao Tan, Yangfeng Ji, and Noah A Smith. 2018. Creative writing with a machine in the loop: Case studies on slogans and stories. In *Proceedings of the 23rd International Conference on Intelligent User Interfaces*. 329–340.

[9] Sumanth Dathathri, Andrea Madotto, Janice Lan, Jane Hung, Eric Frank, Piero Molino, Jason Yosinski, and Rosanne Liu. 2019. Plug and play language models: A simple approach to controlled text generation. *arXiv preprint arXiv:1912.02164* (2019).

[10] Paramveer S Dhillon, Somayeh Molaei, Jiaqi Li, Maximilian Golub, Shaochun Zheng, and Lionel Peter Robert. 2024. Shaping human-AI collaboration: Varied scaffolding levels in co-writing with language models. In *Proceedings of the 2024 CHI conference on human factors in computing systems*. 1–18.

[11] Tom Dowd. 2015. *Storytelling across worlds: Transmedia for creatives and producers*. Routledge.

[12] K Anders Ericsson. 2017. Protocol analysis. *A companion to cognitive science* (2017), 425–432.

[13] Angela Fan, Mike Lewis, and Yann Dauphin. 2018. Hierarchical neural story generation. In *Proceedings of the 56th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*. 889–898.

[14] Angela Fan, Mike Lewis, and Yann Dauphin. 2019. Strategies for structuring story generation. In *Proceedings of the 57th Annual Meeting of the Association for Computational Linguistics*. 2650–2660.

[15] Linda Flower and John R Hayes. 1981. A cognitive process theory of writing. *College Composition & Communication* 32, 4 (1981), 365–387.

[16] Jonas Frich, Lindsay MacDonald Vermeulen, Christian Remy, Michael Mose Biskjaer, and Peter Dalsgaard. 2019. Mapping the landscape of creativity support tools in HCI. In *Proceedings of the 2019 CHI conference on human factors in computing systems*. 1–18.

[17] Gérard Genette. 1980. *Narrative discourse: An essay in method*. Vol. 3. Cornell University Press.

[18] Parsa Ghaffari and Chris Hokamp. 2025. Narrative studio: Visual narrative exploration using llms and monte carlo tree search. In *Proceedings of the The 7th Workshop on Narrative Understanding*. 83–96.

[19] Aditya Gunturu, Ben Pearman, Keiichi Ihara, Morteza Faraji, Bryan Wang, Rubaiat Habib Kazi, and Ryo Suzuki. 2025. MapStory: Prototyping Editable Map Animations with LLM Agents. In *Proceedings of the 38th Annual ACM Symposium on User Interface Software and Technology*. 1–20.

[20] Sandra G Hart and Lowell E Staveland. 1988. Development of NASA-TLX (Task Load Index): Results of empirical and theoretical research. In *Advances in psychology*. Vol. 52. Elsevier, 139–183.

[21] Ivan Herman, Guy Melançon, and M Scott Marshall. 2002. Graph visualization and navigation in information visualization: A survey. *IEEE Transactions on visualization and computer graphics* 6, 1 (2002), 24–43.

[22] Antonio Hernando, Jesús Bobadilla, Fernando Ortega, and Abraham Gutiérrez. 2018. Method to interactively visualize and navigate related information. *Expert Systems with Applications* 111 (2018), 61–75.

[23] Ting-Hao Huang, Francis Ferraro, Nasrin Mostafazadeh, Ishan Misra, Aishwarya Agrawal, Jacob Devlin, Ross Girshick, Xiaodong He, Pushmeet Kohli, Dhruv Batra, et al. 2016. Visual storytelling. In *Proceedings of the 2016 conference of the North American chapter of the association for computational linguistics: Human language technologies*. 1233–1239.

[24] Yunpeng Huang, Jingwei Xu, Junyu Lai, Zixu Jiang, Taolue Chen, Zenan Li, Yuan Yao, Xiaoxing Ma, Lijuan Yang, Hao Chen, et al. 2023. Advancing transformer architecture in long-context large language models: A comprehensive survey. *arXiv preprint arXiv:2311.12351* (2023).

[25] Zeyuan Huang, Cangjun Gao, Yaxian Shan, Haoxiang Hu, Qingkun Li, Xiaoming Deng, Cuixia Ma, Yu-Kun Lai, Yong-Jin Liu, Feng Tian, et al. 2025. SketchGPT: A sketch-based multimodal interface for application-agnostic LLM interaction. In *Proceedings of the 38th Annual ACM Symposium on User Interface Software and Technology*. 1–18.

[26] Aaron Hurst, Adam Lerer, Adam P Goucher, Adam Perelman, Aditya Ramesh, Aidan Clark, AJ Ostrow, Akila Welihinda, Alan Hayes, Alec Radford, et al. 2024. Gpt-4o system card. *arXiv preprint arXiv:2410.21276* (2024).

[27] Daphne Ippolito, Ann Yuan, Andy Coenen, and Sehmon Burnam. 2022. Creative writing with an ai-powered writing assistant: Perspectives from professional writers. *arXiv preprint arXiv:2211.05030* (2022).

[28] Ankur Joshi, Saket Kale, Satish Chandel, and D Kumar Pal. 2015. Likert scale: Explored and explained. *British journal of applied science & technology* 7, 4 (2015), 396–403.

[29] Ronald T Kellogg. 2008. Training writing skills: A cognitive developmental perspective. *Journal of writing research* 1, 1 (2008), 1–26.

[30] Nitish Shirish Keskar, Bryan McCann, Lav R Varshney, Caiming Xiong, and Richard Socher. 2019. Ctrl: A conditional transformer language model for controllable generation. *arXiv preprint arXiv:1909.05858* (2019).

[31] Ben Kybartas and Rafael Bidarra. 2016. A survey on story generation techniques for authoring computational narratives. *IEEE Transactions on Computational Intelligence and AI in Games* 9, 3 (2016), 239–253.

[32] Mina Lee, Percy Liang, and Qian Yang. 2022. Coauthor: Designing a human-ai collaborative writing dataset for exploring language model capabilities. In *Proceedings of the 2022 CHI conference on human factors in computing systems*. 1–19.

[33] Zhongyang Li, Xiao Ding, and Ting Liu. 2018. Constructing narrative event evolutionary graph for script event prediction. *arXiv preprint arXiv:1805.05081* (2018).

[34] Q Vera Liao, Daniel Gruen, and Sarah Miller. 2020. Questioning the AI: informing design practices for explainable AI user experiences. In *Proceedings of the 2020 CHI conference on human factors in computing systems*. 1–15.

[35] Nelson F Liu, Kevin Lin, John Hewitt, Ashwin Paranjape, Michele Bevilacqua, Fabio Petroni, and Percy Liang. 2024. Lost in the middle: How language models use long contexts. *Transactions of the association for computational linguistics* 12 (2024), 157–173.

[36] Zhicheng Liu, Nancy Nersessian, and John Stasko. 2008. Distributed cognition as a theoretical framework for information visualization. *IEEE Transactions on Visualization & Computer Graphics* 14, 06 (2008), 1173–1180.

[37] Tim Miller. 2019. Explanation in artificial intelligence: Insights from the social sciences. *Artificial intelligence* 267 (2019), 1–38.

[38] Semi Min and Juyong Park. 2019. Modeling narrative structure and dynamics with networks, sentiment analysis, and topic modeling. *PloS one* 14, 12 (2019), e0226025.

[39] Piotr Mirowski, Kory W Mathewson, Jaylen Pittman, and Richard Evans. 2023. Co-writing screenplays and theatre scripts with language models: Evaluation by industry professionals. In *Proceedings of the 2023 CHI conference on human factors in computing systems*. 1–34.

[40] Nick Montfort. 2006. Natural language generation and narrative variation in interactive fiction. In *Proceedings of the AAAI Workshop on Computational Aesthetics*.

[41] Tamara Munzner. 2025. Visualization analysis and design. In *Proceedings of the Special Interest Group on Computer Graphics and Interactive Techniques Conference Courses*. 1–2.

[42] Joseph D Novak and Alberto J Cañas. 2008. The theory underlying concept maps and how to construct and use them. (2008).

[43] Kalpesh Padia, Kaveen Herath Bandara, and Christopher G Healey. 2019. A system for generating storyline visualizations using hierarchical task network planning. *Computers & Graphics* 78 (2019), 64–75.

[44] Barbara Page. 1999. Hamlet on the Holodeck: The future of narrative in cyberspace. *MFS Modern Fiction Studies* 45, 2 (1999), 553–556.

[45] Peter Pirolli and Stuart Card. 2005. The sensemaking process and leverage points for analyst technology as identified through cognitive task analysis. In *Proceedings of international conference on intelligence analysis*, Vol. 5. McLean, VA, USA, 2–4.

[46] Ahmed Y Radwan, Khaled M Alasmari, Omar A Abdulbagi, and Emad A Alghamdi. 2024. SARD: A human-AI collaborative story generation. In *International Conference on Human-Computer Interaction*. Springer, 94–105.

[47] Hannah Rashkin, Asli Celikyilmaz, Yejin Choi, and Jianfeng Gao. 2020. PlotMachines: Outline-conditioned generation with dynamic plot state tracking. In *Proceedings of the 2020 Conference on Empirical Methods in Natural Language Processing (EMNLP)*. 4274–4295.

[48] Melissa Roemmele and Andrew S Gordon. 2015. Creative help: A story writing assistant. In *International Conference on Interactive Digital Storytelling*. Springer, 81–92.

[49] Marie-Laure Ryan, James Ruppert, and John W Bernet. 2004. *Narrative across media: The languages of storytelling*. U of Nebraska Press.

[50] Edward Segel and Jeffrey Heer. 2010. Narrative visualization: Telling stories with data. *IEEE transactions on visualization and computer graphics* 16, 6 (2010), 1139–1148.

[51] Ben Shneiderman. 2007. Creativity support tools: accelerating discovery and innovation. *Commun. ACM* 50, 12 (2007), 20–32.

[52] Sarah Sterman, Molly Jane Nicholas, and Eric Paulos. 2022. Towards Creative Version Control. *Proceedings of the ACM on human-computer interaction* 6, CSCW2 (2022), 1–25.

[53] Yuzuru Tanahashi and Kwan-Liu Ma. 2012. Design considerations for optimizing storyline visualizations. *IEEE Transactions on Visualization and Computer Graphics* 18, 12 (2012), 2679–2688.

[54] Maria Teleki, Vedangi Bengali, Xiangjue Dong, Sai Tejas Janjur, Haoran Liu, Tian Liu, Cong Wang, Ting Liu, Yin Zhang, Frank Shipman, et al. 2025. A Survey on LLMs for Story Generation. In *Findings of the Association for Computational Linguistics: EMNLP 2025*. 13954–13966.

[55] Robert F Woolson. 2007. Wilcoxon signed-rank test. *Wiley encyclopedia of clinical trials* (2007), 1–3.

[56] Zhihua Yan and Xijin Tang. 2023. Narrative graph: Telling evolving stories based on event-centric temporal knowledge graph. *Journal of Systems Science and Systems Engineering* 32, 2 (2023), 206–221.

[57] Kevin Yang, Yuandong Tian, Nanyun Peng, and Dan Klein. 2022. Re3: Generating longer stories with recursive reprompting and revision. In *Proceedings of the 2022 Conference on Empirical Methods in Natural Language Processing*. 4393–4479.

[58] Lili Yao, Nanyun Peng, Ralph Weischedel, Kevin Knight, Dongyan Zhao, and Rui Yan. 2019. Plan-and-write: Towards better automatic storytelling. In *Proceedings of the AAAI Conference on Artificial Intelligence*, Vol. 33. 7378–7385.

[59] Ann Yuan, Andy Coenen, Emily Reif, and Daphne Ippolito. 2022. Wordcraft: story writing with large language models. In *Proceedings of the 27th International Conference on Intelligent User Interfaces*. 841–852.

[60] Xi Zhang and T Ramayah. 2024. Solving the mystery of storytelling in destination marketing: A systematic review. *Journal of Hospitality and Tourism Management* 59 (2024), 222–237.

---

## 附录：图表标题与图内文字翻译

### 图 1：GraphStory 概念与核心工作流

> （左）标准的线性文本界面常常在写作者试图管理和改写分支想法时导致认知过载。（中）GraphStory 引入一个结构化事件图，以支持显式分支与多层级编辑，让用户能够高效地组织其意图。（右）结构化图直接转化为连贯的叙事，并通过清晰的视觉溯源将文本回溯连接到图节点。

**图内文字翻译：**

- **左栏标题**「LINEAR TEXT LIMITATION」→ 线性文本的局限
- 「Chatbot Interface」→ 聊天机器人界面
- 用户输入示例：
  > "不，等等，如果他们不跟守卫打斗，而是悄悄溜过去呢？从第 3 段重写，但保留关于逃跑的部分。"
- 生成文本示例：
  > 小酒馆人声嘈杂，弥漫着陈腐麦酒的气味。埃拉拉和凯尔坐在角落里，注视着后门的守卫。他们没有拔出武器，而是等守卫转过身去。当守卫走过去查看一只掉落的酒壶时，他们悄无声息地从他身边溜过，脚步在木地板上没有一丝声响。他们来到门前，但门是锁着的。凯尔笨手笨脚地摆弄着他的开锁工具。
- 「Cognitive Overload: Tangled Branches」→ 认知过载：纠缠的分支
- 续写示例：
  > 突然，一位顾客指着他们大喊起来。守卫猛地转身，抽出刀刃。"有贼！"他喊道。凯尔咒骂一声，放弃了开锁。现在他们只能杀出一条血路。
- **中栏标题**「STRUCTURED EVENT-GRAPH」→ 结构化事件图
  - 「The Setup」→ 设定
  - 「2A. Stealth」→ 2A. 潜行
  - 「2B. Combat」→ 2B. 战斗
  - 「The Escape」→ 逃脱
  - 叙事文本：
    > 小酒馆人声嘈杂，弥漫着陈腐麦酒的气味，顾客们对角落里的紧张气氛视而不见。埃拉拉和凯尔注视着后门的守卫，知道时间所剩无几。
    >
    > 警报响起，凯尔拔出剑，与守卫交锋，迸溅出一片火花。一记迅捷而娴熟的打击之后，守卫被缴了械，向后跌撞在木桌上。
    >
    > 他们抓住时机，冲出后门，在援兵赶到之前消失在寒冷的夜色中。

### 图 2：GraphStory 主界面

> （A）多层级流程管理面板按"故事、流程、版本"组织各变体。（B）宏观层画布提供叙事结构的全面概览，让用户利用相互连接的节点（块）构建并分支故事线。（C）微观编辑器支持对选定块内单个事件进行细粒度、拖放式操作。

**图内文字翻译：**

- （A）「MULTI-LEVEL FLOW MANAGEMENT」→ 多层级流程管理
  - 「Story: The Lost Artifact」→ 故事：失落的圣物
  - 「Flow 1: Stealth Approach」→ 流程 1：潜行路线
  - 「Flow 2: Direct Confrontation」→ 流程 2：正面冲突
  - 「v1 (Initial Draft)」→ v1（初稿）
  - 「v2 (Expanded)」→ v2（扩展版）
- （B）「MACRO-LEVEL CANVAS」→ 宏观层画布
  - 「1. Tavern / 3 Events」→ 1. 酒馆 / 3 个事件
  - 「2A. Bribe Guard / 4 Events」→ 2A. 贿赂守卫 / 4 个事件
  - 「2B. Fight Guard / 5 Events」→ 2B. 与守卫打斗 / 5 个事件
  - 「3. Escape / 2 Events」→ 3. 逃脱 / 2 个事件
  - 「100%」→ 100%
- （C）「Editing: 2B. Fight the Guard」→ 编辑：2B. 与守卫打斗
  - 「Micro Editor」→ 微观编辑器
  - 「1. Kael draws his sword.」→ 1. 凯尔拔出他的剑。
  - 「2. The guard sounds the alarm.」→ 2. 守卫拉响警报。
  - 「4. Kael strikes the guard.」→ 4. 凯尔击中守卫。
  - 「5. The guard falls unconscious.」→ 5. 守卫昏迷倒地。

### 图 3：事件图构建器流水线

> 事件图构建器流水线。输入路由器通过专门的工作流处理三种不同形式的输入（抽象想法、结构化大纲和完整故事）。每条路径都在宏观层将输入转化为结构化块，并在微观层转化为不同的叙事事件，从而构建事件图。

**图内文字翻译：**

- 「Abstract Ideas」→ 抽象想法
- 「Structured Outline」→ 结构化大纲
- 「Complete Story」→ 完整故事
- 「Input Router」→ 输入路由器
- 「LLM」→ LLM
- 「Event-Graph Constructor」→ 事件图构建器
- 「Event 1 / Event 2 / Event 3」→ 事件 1 / 事件 2 / 事件 3
- 「Elaborate Ideas」→ 细化想法
- 「Generating a list of events」→ 生成事件列表
- 「Splitting outline into structural chunks」→ 将大纲拆分为结构化块
- 「Grounding chunks to distinct events」→ 将块锚定到不同事件
- 「Parse Structure」→ 解析结构
- 「Dividing into logical chunks」→ 划分为逻辑块
- 「Extract main events」→ 提取主要事件
- 「Segment Text」→ 切分文本
- 「Grouping to chunks」→ 分组为块
- 「Multi-Resolution Event Graph」→ 多分辨率事件图
- 「Macro Level」→ 宏观层
- 「Chunk」→ 块
- 「Chunk Summary Title」→ 块摘要标题
- 「Micro Level」→ 微观层
- 「Events」→ 事件
- 「Event Description 1 / 2 / 3 …」→ 事件描述 1 / 2 / 3 …

### 图 4：交互式故事生成工作流

> （步骤 1）用户选择一个起始节点与路径来配置生成队列。（步骤 2）系统执行两阶段生成，产出一幅精炼的图，其中原始事件被保留，AI 建议的块内事件以黄色高亮，供人机协同审阅。（步骤 3）经用户确认后，系统生成最终连贯叙事，并通过视觉溯源将文本与 AI 建议的事件相对应。（注："生成输出"面板中的黄色文字高亮仅为本文可视化目的，用于演示特定 AI 建议事件如何转化为最终散文。）

**图内文字翻译：**

- 步骤 1 标题「SELECTION & CONFIGURATION」→ 选择与配置
  - 「2A. Bribe Guard / 4 Events」→ 2A. 贿赂守卫 / 4 个事件
  - 「1. Tavern / 3 Events」→ 1. 酒馆 / 3 个事件
  - 「3. Escape / 2 Events」→ 3. 逃脱 / 2 个事件
  - 「2B. Fight Guard / 5 Events」→ 2B. 与守卫打斗 / 5 个事件
  - 「Generation Settings」→ 生成设置
  - 「Length: Medium」→ 长度：中等
  - 「Style: Fiction」→ 风格：小说
  - 「Tone: Formal」→ 语气：正式
  - 「Theme: None」→ 主题：无
  - 「Generate」→ 生成
- 步骤 2 标题「REVIEWING THE REFINED GRAPH」→ 审阅精炼后的图
  - 「2B. Fight Guard」→ 2B. 与守卫打斗
  - 「1. Kael draws his sword.」→ 1. 凯尔拔出他的剑。
  - 「AI SUGGESTED」→ AI 建议
  - 「2. The guard sounds the alarm, alerting the others.」→ 2. 守卫拉响警报，惊动了其他人。
  - 「A flurry of sparks flies.」→ 迸溅出一片火花。
  - 「4. Kael kicks the guard's legs out from under him.」→ 4. 凯尔一脚踢开守卫的双腿，使他失去平衡。
  - 「1. Tavern」→ 1. 酒馆
  - 「Confirm Graph for Generation」→ 确认图以供生成
  - 「3. Escape」→ 3. 逃脱
- 步骤 3 标题「THE FINAL NARRATIVE」→ 最终叙事
  - 「Generated Output」→ 生成输出
  - 生成文本：
    > 小酒馆人声嘈杂，弥漫着陈腐麦酒的气味，顾客们对角落里的紧张气氛视而不见。
    >
    > 凯尔拔出剑，钢刃出鞘时发出一声清鸣。守卫立刻拉响了警报，一声尖锐的哨响惊动了后屋里其他人。他们的刀剑相击，迸溅出一片火花。凯尔迅捷地一脚踢开守卫的双腿，使他失去平衡。守卫重重倒地，武器滑脱开去，人已被缴了械。
    >
    > 他们冲出后门，在援兵赶到之前消失在夜色中。

### 图 5：问卷结果

> 用户研究中使用 7 点李克特量表（从"非常不同意"到"非常同意"）的问卷结果，用以比较 GraphStory（GS）与 ChatGPT（GPT）。x 轴表示不同问题，涵盖系统可用性与交互体验等多个方面。y 轴显示参与者对两个系统给出的李克特量表评分。

### 图 6：任务负荷结果

> 用户研究中 NASA-TLX 的任务负荷结果（越低越好）。y 轴显示六个 NASA-TLX 子量表。x 轴显示相应得分。（\* 表示 p < .05，\*\* 表示 p < .01）

### 图 7：问卷结果

> 用户研究中采用 7 点李克特量表的问卷结果，用以评估 GraphStory 所提出的功能。评分在"非常不同意"到"非常同意"的范围内收集。
