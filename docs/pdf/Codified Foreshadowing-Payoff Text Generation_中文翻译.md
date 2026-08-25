# 编码化伏笔—兑现文本生成（Codified Foreshadowing-Payoff Text Generation）

**作者：** Longfei Yun、Kun Zhou、Yupeng Hou、Letian Peng\*、Jingbo Shang

加州大学圣迭戈分校（University of California, San Diego）

{loyun, kuzhou, yphou, lepeng, jshang}@ucsd.edu

\* 通讯作者。

¹ 代码：https://github.com/LongfeiYun17/CFPG

> arXiv:2601.07033v1 [cs.CL] 2026 年 1 月 11 日

## 摘要

伏笔与兑现是无处不在的叙事手法，作者借此在故事早期引入承诺（commitment），并通过具体、可观察的结局来兑现它们。然而，尽管故事生成已取得进展，大语言模型（LLM）仍频繁无法衔接这些长程叙事依赖，常常让"契诃夫之枪"悬而未发，即便必要的上下文已经具备。现有的评估在很大程度上忽视了这种结构性的失败，聚焦于表面层面的连贯性，而非叙事铺垫的逻辑性落实。在本文中，我们提出编码化伏笔—兑现生成（Codified Foreshadowing-Payoff Generation, CFPG），一个从"兑现实现"视角重新审视叙事质量的新框架。鉴于 LLM 难以凭直觉把握伏笔事件的"触发机制"，CFPG 将叙事连续性转化为一组可执行的因果谓词（causal predicates）。通过从 BookSum 语料库中挖掘并编码"伏笔—触发—兑现"三元组，我们提供了结构化的监督信号，确保被引入的伏笔承诺不仅被提及，而且能在时间上与逻辑上得到兑现。实验表明，CFPG 在兑现准确率与叙事对齐度上显著优于标准提示基线。我们的发现表明，显式地编码叙事机制，对于推动 LLM 从表面层面的流畅性走向真正的叙事能力至关重要。

## 1 引言

> "如果在第一幕里墙上挂了一支手枪，那么在接下来的幕里，它就应该被开火。"
> ——安东·契诃夫（Anton Chekhov）

人类所著的叙事通常依赖伏笔与兑现，在故事进程中建立连贯性（Riedl and Young, 2010; Prince, 2003）。作者通过在早期显式地引入物品、意图或条件，创造出预期在稍后被具体兑现的叙事承诺（Todorov and Weinstein, 1969）。这些承诺的成功实现——而非仅仅句子层面的流畅——是合格故事叙述的一个决定性属性（Forster, 1956）。

尽管故事生成近来取得了进展（OpenAI, 2025a; Deepmind, 2025），语言模型仍频繁无法正确实现这类伏笔承诺。虽然生成的文本可能保持语法流畅与局部连贯，模型却常常忽略先前引入的铺垫、与已确立的条件相矛盾，或以不当的方式予以兑现（See et al., 2019; Guan et al., 2021）。现有的故事生成基准，如 ROCStories（Mostafazadeh et al., 2016）与 WritingPrompts（Fan et al., 2018），主要强调短程连贯性，评估每个句子是否自然承接其前文（Rashkin et al., 2020）。它们并不显式测试叙事铺垫是否在后文得到兑现，从而使叙事能力的一个核心方面未获充分考察（Sun et al., 2021）。

这一局限并未被开放式故事生成与创意写作系统的先前工作所解决。许多方法聚焦于维持角色一致性（Shanahan et al., 2023）、对话连贯性（Shuster et al., 2022）或风格对齐（Liu et al., 2023），通常通过人格条件化（persona conditioning）（Peng and Shang, 2025）或基于记忆的机制（Wang et al., 2025）。关键在于，这些方法主要建模的是持续性属性，而非那些其实现可以被因果验证的离散叙事事件。虽然这类技术有助于保持表面层面的连续性，但它们并未提供显式机制来表示、追踪或验证伏笔叙事条件是否最终得到兑现（Yang et al., 2023）。结果，模型可能看似连贯，却在悄然违背故事早先引入的叙事承诺。

为填补这一空白，我们提出编码化伏笔—兑现生成（CFPG），一个以显式因果实现来重新表述叙事连贯性的框架。CFPG 不再把连续性视为文本的隐式属性，而是将每个伏笔表示为一个结构化的谓词，指定一个伏笔、一个触发条件与一个预期的兑现。这种表示使得叙事生成与评估能够基于"每个被引入的承诺在故事展开时是被实现、被推迟，还是被违背"这一事实来落地。

通过将伏笔—兑现关系编码为可执行的符号规则，CFPG 实现了精确的、在时间上有所落地的兑现实现检测，而这仅凭提示或上下文增强技术是无法可靠达成的。此外，这一形式化提供了一个可控的接口，用于以"承诺兑现"而非表面流畅性所定义的叙事能力来评估语言模型。

使用长篇文学摘要语料 BOOKSUM，我们自动挖掘了结构化、可解释的伏笔—兑现对。该数据集支持跨不同体裁与故事结构的叙事承诺实现的系统性分析。

我们的贡献有三方面：

1. 我们提出一个新框架，通过伏笔—兑现实现来显式建模叙事连贯性，将故事叙述能力形式化为承诺兑现。
2. 我们构建了一个源自 BOOKSUM 的大规模数据集，从长篇叙事中自动抽取与其叙事位置对齐的显式伏笔—兑现对。
3. 通过受控实验，我们证明：与标准提示基线相比，将叙事承诺编码为"伏笔—触发—兑现"谓词，能显著提升兑现实现准确率与叙事对齐度。

## 2 相关工作

### 2.1 创意写作

先前关于使用语言模型进行故事写作的工作，主要聚焦于生成流畅且连贯的叙事，往往强调局部合理性与风格一致性（Mostafazadeh et al., 2016; Fan et al., 2018）。结果是，模型能够产出局部连贯的文本，却忽略或违背先前引入的叙事元素。为改进全局连贯性，若干方法纳入了规划机制，用高层情节结构或事件序列来引导生成（Riedl and Young, 2010; Yang et al., 2023; Wang et al., 2025）。虽然这些方法改进了结构一致性，但它们并未显式表示叙事承诺：伏笔事件仍是隐式的，兑现实现既未得到强制，也无法被因果验证。更近的基于 LLM 的系统采用多智能体协作或基于反馈的精炼来引导故事发展（Patel et al., 2024; Bae and Kim, 2024; Venkatraman et al., 2025）。这些框架增强了创造力与吸引力，但叙事推进仍由定性反馈支配，而非由连接铺垫与结局的显式因果条件支配。

相比之下，我们的工作直接针对这一空白，将伏笔—兑现关系编码为显式、可执行的叙事约束，从而实现对长程叙事承诺的有根据的检测与受控实现。

### 2.2 可控文本生成

可控文本生成（Controllable Text Generation, CTG）研究如何在生成过程中引导语言模型满足显式的控制条件。早期工作通过条件语言模型与控制码（control codes）来形式化控制，实现了以主题、风格或领域为条件的生成（Hu et al., 2017）。后续方法通过解耦潜变量（Keskar et al., 2019）、解码时引导（Dathathri et al., 2019），以及基于分类器或能量的干预（Holtzman et al., 2018; Krause et al., 2021）扩展了这一思想。近期工作将这些方法统一于内容级与属性级控制之下，覆盖情感、主题、风格与安全等维度（Zhou et al., 2023; Lambert et al., 2024; Liang et al., 2024; Yun et al.）。

尽管取得了成功，大多数 CTG 形式化都将控制信号视为静态的、非事件性的属性，在整个生成过程中被统一地施加。它们调节的是文本"如何表达"，却不建模早先引入的叙事承诺"应在何时被兑现"。因此，模型可能满足所有已声明的控制条件，却仍违背长程叙事逻辑。

## 3 方法

### 3.1 叙事承诺的结构化表示

为将直觉性的叙事结构转化为机器可执行的逻辑，我们将伏笔与其兑现之间的关系形式化为一个显式的因果承诺系统。我们认为，一个完整的叙事依赖不仅由一个初始铺垫与一个最终兑现构成，还包含一个支配其发生时机的特定逻辑"闸门"。因此，我们提出将每个承诺表示为一个结构化的"伏笔—触发—兑现"（F–T–P）三元组：

- **伏笔（Foreshadow, F）**：确立"因果债务"的初始铺垫或叙事反常现象，意味着未来需要给出解释或兑现。
- **触发（Trigger, T）**：使潜在伏笔变得可付诸行动的、必须发生的特定叙事条件或先决事件。
- **兑现（Payoff, P）**：逻辑上兑现并了结由 F 引入、由 T 激活的承诺的收尾事件。

这种 F–T–P 分解对于建模时间恰当性至关重要。在《巴斯克维尔的猎犬》（图 1）中，失踪的靴子（F）制造了悬念，但一直处于潜伏状态，直到斯塔普尔顿（Stapleton）的追踪手段被揭示（T）。只有到那时，对靴子用途的解释（P）才在叙事上得到正当化。通过显式建模触发条件，我们的框架区分了过早兑现（破坏悬念）与缺失兑现（逻辑不一致）。

### 3.2 编码化伏笔—兑现生成

CFPG 框架将叙事因果性从模型隐式的注意力权重中外化到一个编码化的有限状态抽象之中。这使得能够以纯粹提示所无法达到的精度，对叙事债务进行符号化追踪。

#### 3.2.1 因果状态与伏笔池

在整个生成过程中，CFPG 维护一个动态的伏笔池 C = {(F_i, T_i, P_i)}ⁿᵢ₌₁。该池充当一个全局状态，表示所有未兑现的叙事承诺。与将历史压缩进隐向量的标准自回归模型不同，CFPG 将叙事状态表示为一组显式的、可兑现的谓词。

#### 3.2.2 编码化循环：选择、生成与更新

如图 2 所示，CFPG 通过一个迭代式的"选择—生成—更新"循环运行：

**基于编码的资格选择（Eligibility Selection via Codification）。** 在每一步 t，对于伏笔池 C_t 中的每个待决承诺，CFPG 调用编码函数（codify function）。该函数充当一个逻辑闸门，将当前叙事上下文 X_t 与触发条件 T 进行比对。只有那些触发条件得到满足的伏笔，才被提升到活跃子集 S_t = {f ∈ C_t | codify(X_t, f) = True}。

**受引导的续写（Guided Continuation）。** 给定合格子集 S_t，语言模型的任务是生成下一个场景 y。与朴素生成不同，CFPG 将与 S_t 关联的相应兑现作为显式的叙事要求注入模型的上下文。因此生成被形式化为：

y ∼ p_θ(y | X_t, S_t)

这确保了向下一个场景的过渡并非仅仅是概率性的续写，而是在显式叙事约束下对活跃叙事债务的受引导兑现。

**状态转移与落地（State Transition and Grounding）。** 在生成之后，CFPG 执行一次状态更新。一个验证模块识别 S_t 中哪些承诺在文本 y 中被成功实现，并将其从 C_t 中移除。与此同时，它抽取 y 中引入的新叙事铺垫，将其编码为新的 F–T–P 三元组，加入 C_{t+1}。这确保了随着故事的展开，因果状态表示在时间上始终有所落地。

## 4 数据集

由于叙事噪声与极端的上下文长度，从整本长篇小说中大规模抽取伏笔—兑现依赖是一项重大挑战。我们通过利用 BOOKSUM（Kryściński et al., 2021）来解决此问题——这是一个人工撰写的、层级式摘要式总结语料库，将长程情节点提炼为话语显著的（discourse-salient）事件。我们通过一个三阶段流水线构建了一个句子级的伏笔—兑现数据集，该流水线旨在以最小的主题噪声来识别、验证与过滤长程叙事依赖。

给定一个被切分为句子的叙事文本 X = (s₁, …, s_T)，我们的目标是恢复配对 (s_tf, s_tp)，使得 s_tf 引入一个具体的叙事条件，而 s_tp 后来通过一个显式的事件、决定或揭示来兑现它。

**阶段 1：句子级候选识别。** 我们使用 GPT-4.1（OpenAI, 2025b）扫描摘要式总结，并抽取候选的伏笔—兑现对。每个候选都被要求锚定到两个特定句子上，从而得到临时索引 (tf, tp)。该阶段优先保证召回率，并允许弱噪声候选进入。

**阶段 2：兑现对齐验证。** 为消除主题性呼应与非因果关联，我们应用一个符号化验证闸门来过滤这些候选。一个验证器模型评估：以所提议的兑现点 s_tp 为中心的叙事上下文窗口，是否构成对以铺垫点 s_tf 为中心的铺垫上下文窗口的真正的因果或叙事兑现，并拒绝那些其关联是隐喻性的、预兆性的、或缺乏可观察文本证据支持的配对。

**阶段 3：基于评分细则的过滤。** 通过阶段 2 的配对将进一步接受一个基于评分细则的过滤阶段，旨在强制严格的伏笔有效性。两个独立的验证器模型沿四个维度评估每个候选配对：

（i）铺垫有效性：铺垫引入一个具体的叙事元素（如物品、行动、规则或决定），在其被引入时并未得到充分解释或兑现；

（ii）兑现有效性：兑现提供新的叙事信息，兑现、了结或回溯性地重新诠释铺垫，而非仅仅复述或琐碎地延伸铺垫；

（iii）时间分离性：铺垫与兑现发生在不同的句子中，且被一个非平凡的叙事间隔所分隔，排除即时或局部解决的因果关系；

（iv）伏笔正当性：只有在观察到兑现之后，铺垫才能被合理地回溯解读为一种有意的叙事伏笔；否则，铺垫在叙事上应保持欠规定（under-specified）。

仅当两个验证器模型在全部四个标准上都接受该配对时，该伏笔—兑现对才会被保留在最终数据集中。

**所得数据集。** 所得数据集由从完整叙事摘要中抽取的、以句子为锚点的伏笔—兑现实例组成。对于每个伏笔，我们提供：（i）完整的摘要文本；（ii）标记伏笔铺垫引入位置的句子级索引 tf；（iii）标识其已验证兑现位置的句子级索引 tp；（iv）对伏笔—兑现关系的简洁自然语言描述；以及（v）一个分类式的伏笔类型（例如，物品、事件、规则）。图 3 展示了使用我们的流水线抽取的一个示例。更多统计信息见附录 A。

## 5 实验

我们提出以下研究问题，以评估 CFPG 对叙事推理的影响：

1. **在预言式时机下的兑现激活：** 当兑现时机由外部指定时，CFPG 能否可靠地激活并实现合格的伏笔？（§5.1）
2. **有根据的兑现决策：** 在增量式揭示的叙事上下文中，CFPG 能否实现对伏笔兑现的有根据的检测与实现？（§5.2）
3. **错误归因：** 有根据的兑现决策在哪里失败，CFPG 如何在叙事推进过程中改变潜在的错误模式？（§5.3）

### 5.1 截断场景中的条件式兑现激活

我们首先考察一个基本问题：当兑现时机由外部指定时，CFPG 能否可靠地激活并实现合格的伏笔？标准提示往往产出局部流畅、却未能"了结"既有叙事债务的续写。为诊断这一点，我们构建了一个受控实验，在已知兑现点（即"预言式时机"，Oracle Timing）之前将叙事截断，隔离模型从铺垫过渡到兑现的能力。

**通过叙事蕴含的行为对齐。** 我们使用一个三分类的叙事蕴含方案（Peng and Shang, 2024）来评估模型续写。给定一个截断的场景、一个生成的句子 ŷ 与金标兑现 y，一个 LLM 评判器判断 ŷ 是否蕴含（1.0）、中性于（0.5）或违背（0.0）预期的叙事轨迹。

如表 1 所示，标准提示频繁产出"兑现无关"的续写——即忽略待决伏笔的、看似合理的句子。相比之下，CFPG 实现了接近天花板的"应兑现率"（> 0.96）以及显著更高的对齐得分。通过利用触发状态，CFPG 引导模型主动了结先前引入的叙事债务，确保续写不仅流畅，而且在逻辑上扎根于具体的伏笔铺垫。

**机制性证据：因果显著性追踪。** 为理解 CFPG 为何优于标准提示，我们分析了模型的内部注意力模式。我们比较了在生成兑现句子的过程中，分配给铺垫（Setup）token 的注意力权重。

如图 4 所示，我们观察到了因果显著性的显著转变。在基线（左）中，对远处铺垫的注意力是弥散且稀疏的。这表明模型可能未能认识到伏笔兑现的必要性，转而优先考虑局部上下文以维持表面层面的流畅性，牺牲了长程叙事一致性。相反，CFPG（右）展示出一个密集的"注意力尖峰"，精确聚焦于伏笔锚点。与基线相比，对铺垫区域的平均注意力权重在 CFPG 下出现了显著的激增，确认我们的状态编码引导有效地将模型"重新锚定"于叙事的过去。

综合来看，这些结果表明，将兑现资格与表面生成显式分离，能够实现对伏笔兑现的可靠的、模型无关的控制，确保叙事"钩子"不仅被引入，而且被有意义地了结。

### 5.2 有根据的兑现追踪：从感知到行动

我们通过将兑现追踪框定为在线感知（online sensing）问题，评估 CFPG 是否促进了叙事兑现的有根据的识别。该设置模拟一个增量式的阅读过程，模型逐句接触叙事。在每一步，模型必须执行"因果感知"，在不访问未来 token 的前提下，判断所观察到的前缀是否已满足某个兑现的触发条件。

为提供对模型行为的细粒度诊断，我们分析因果感知的三个互补维度：

1. **激活时机：** 抑制"因果幻觉"（过早触发）直到因果条件得到满足的能力；
2. **定位准确率：** 精确定位兑现发生之具体叙事锚点的精度；
3. **生成保真度：** 将一次成功的检测转化为轨迹一致的续写的能力。

**基线。** 我们将 CFPG 与两个在叙事伏笔信息纳入方式上不同的、基于提示的基线进行对比。（1）伏笔感知提示（Foreshadow-Aware Prompting, FAP）通过以自然语言显式提供未兑现的叙事承诺来增强标准提示，但不强制可执行的触发条件，也不维护持久化的叙事状态。（2）伏笔相似度上下文刷新（Foreshadow-Similarity Context Refresh, FSCR）用一个滑动上下文窗口动态地增强生成，该窗口通过其与伏笔的词汇相似度来选取早先的句子，但没有显式状态追踪或触发强制。

**时机精度与因果闸门。** 首先，我们考察模型能否区分真正的兑现与单纯的语义邻近。如表 2 所总结的，提示方法频繁遭受因果幻觉，在相关角色或关键词被提及、却未满足逻辑先决条件时过早触发兑现（GPT-4.1-mini 中出现 235 次早触发）。CFPG 充当逻辑守门人，将这些早触发减少了 29.3%。这种对误报的抑制提供了证据，表明 CFPG 使模型能够"等待"因果触发，而非基于局部启发式地冲动猜测。

**感知—行动鸿沟。** 接下来，我们探究一旦检测到兑现，其实现的保真度如何。一个关键发现是，基线模型在检测与实现之间存在持续的鸿沟：即便基线正确识别了兑现窗口，其续写得分仍不成比例地偏低（GPT-4.1-mini 为 0.453）。这种脱钩表明，被动的识别并不等于主动的承诺。相比之下，CFPG 通过将生成锚定于编码化的 F–T–P 状态，弥合了这一鸿沟，在轨迹对齐上取得了 43% 的提升。这确认了显式状态充当了一座功能性桥梁，将一次成功的"感知"事件转化为"一致的行动"。

**有根据兑现检测的决策动力学。** 为进一步理解 CFPG 为何在静态准确率增益之外改进了有根据的兑现追踪，我们在严格增量式观察的设置下分析了兑现检测的决策动力学。我们不把检测当作点估计，而是探究模型的内部置信度如何随叙事上下文逼近金标兑现位置而演变。

具体而言，我们在以金标兑现索引为中心的连续句子前缀上，测量模型对二元决策"兑现现在应该发生吗？"的激活置信度。这得到一条时间置信度轨迹，揭示兑现识别是作为一个离散的因果决策出现，还是作为渐进的语义漂移出现。

图 5 揭示了 FAP 提示与 CFPG 在叙事时间上分配兑现激活方式的鲜明对比。在真正的兑现点之前，基线展示出持续更高的激活概率。这种兑现点之前抬升的置信度，反映的是过早的因果承诺，而非有根据的识别。

在金标兑现边界附近，两种方法都显示出激活的急剧上升；然而，CFPG 展示出明显更陡峭、更局部的决策跳跃（+0.22），表明一旦因果先决条件得到满足，就从"未兑现"到"已兑现"发生了一次离散的转变。关键的是，在兑现点之后，CFPG 在一个延展窗口内维持着高激活水平，而基线则迅速衰减。这种兑现后的持久性表明，CFPG 一旦实现了兑现，就维持着一个稳定的因果状态。

综合来看，这些动力学表明，CFPG 并非仅仅改进了兑现时机的准确率，而是从根本上重塑了决策过程：在兑现前抑制过早激活，在兑现时强制一次急剧的因果切换，并在其后保持承诺。

### 5.3 有根据兑现追踪中的错误归因

为更好地理解有根据兑现追踪的失败模式，我们对所有错误的端到端预测进行了一次系统性的错误归因分析。该分析聚焦于模型在增量式叙事处理过程中表现出的决策级行为——具体而言，在给定部分上下文的情况下，与兑现相关的决策是如何被做出、被推迟或被过早触发的。

**分析流程。** 对于每个失败案例，我们首先抽取一个简洁的、以文本为依据的理据（rationale），解释模型为何在可用上下文下做出了错误的兑现决策。解释通过一个受限提示生成，该提示强制要求显式引用可观察的叙事证据，并禁止对未来事件或替代情节发展进行推测。这确保了所有理据反映的是具体的落地失败，而非事后的解释。

随后，我们以数据驱动的方式归纳一个错误分类体系，将这些理据聚类为少量重复出现的失败模式。该过程产出一个紧凑的分类体系，捕捉有根据兑现失败的不同机制，而不依赖预定义标签。最后，每个失败实例被归入其主导类别，从而能够对各方法的错误分布进行聚合分析。

**错误分类体系。** 归纳得到的分类体系包含六种重复出现的错误类型（表 3）：（1）过早兑现触发，即兑现决策在具体实现之前基于表面线索或预兆信号做出；（2）兑现推迟—尚不可观察（Deferred Payoff Not Yet Observable），即模型在漫长的叙事间隔中丢失了对待决状态的追踪，过早假定已兑现；（3）主题或事件级混淆，即相关但不同的事件或母题被误认为真正的兑现；（4）叙事状态追踪失败，即因果承诺未能随时间的推移被一致地维护或更新；（5）过度保守触发，即由于过高的证据要求而推迟兑现检测；（6）间接或回溯式兑现关联失败，即兑现以隐式或回溯方式表达，却未能被关联回原始铺垫。

**发现。** 如图 6 所示，失败案例的分布凸显出过早触发是两种模型的主导错误模式。CFPG 通过将过早触发案例减少 31%，显著优于提示基线，证明了其过滤语义幻觉的稳健能力。

在高层叙事推理方面，CFPG 在维持逻辑一致性与捕捉复杂关联上表现出显著改进。具体而言，主题混淆的减少（从 34 例降至 26 例）与间接失败案例的近乎减半（从 7 例降至 3 例）表明，即便在错综复杂的叙事结构中，模型也能成功地将隐式或非线性的兑现关联回其原始铺垫。

## 6 结论

我们提出了编码化伏笔—兑现生成（CFPG），一个将叙事连贯性建模为因果承诺之显式实现的框架。通过将伏笔表示为可执行的"伏笔—触发—兑现"谓词，并将其作为编码化状态进行追踪，CFPG 实现了在增量式上下文下对有根据的兑现检测与受控实现。实验表明，在兑现时机、定位与叙事对齐方面，CFPG 相对基于提示的基线取得了一致的改进。

## 局限性

CFPG 主要针对显式的、有文本依据的伏笔兑现关系，并不旨在建模高度抽象或纯粹象征性的叙事手法。我们的实验在摘要级叙事上进行，这为评估长程因果依赖提供了受控的设置，但可能无法捕捉全文中的所有风格或话语层面的现象。此外，CFPG 依赖自动抽取的"伏笔—触发—兑现"结构，抽取错误或遗漏可能在某些情况下限制其覆盖面。

## 参考文献

Minwook Bae and Hyounghun Kim. 2024. Collective critics for creative story generation. *arXiv preprint arXiv:2410.02428*.

Sumanth Dathathri, Andrea Madotto, Janice Lan, Jane Hung, Eric Frank, Piero Molino, Jason Yosinski, and Rosanne Liu. 2019. Plug and play language models: A simple approach to controlled text generation. *arXiv preprint arXiv:1912.02164*.

Google Deepmind. 2025. https://blog.google/products/gemini/gemini-3/. https://deepmind.google/models/gemini/. Accessed: 2026-01-03.

Angela Fan, Mike Lewis, and Yann Dauphin. 2018. Hierarchical neural story generation. In *Proceedings of the 56th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, pages 889–898, Melbourne, Australia. Association for Computational Linguistics.

Edward Morgan Forster. 1956. *Aspects of the Novel*. Mariner Books, New York. Reprint of the 1927 edition; often cited as a Harvest Book edition.

Jian Guan, Xiaoxi Mao, Changjie Fan, Zitao Liu, Wenbiao Ding, and Minlie Huang. 2021. Long text generation by modeling sentence-level and discourse-level coherence. *arXiv preprint arXiv:2105.08963*.

Ari Holtzman, Jan Buys, Maxwell Forbes, Antoine Bosselut, David Golub, and Yejin Choi. 2018. Learning to write with cooperative discriminators. *arXiv preprint arXiv:1805.06087*.

Zhiting Hu, Zichao Yang, Xiaodan Liang, Ruslan Salakhutdinov, and Eric P Xing. 2017. Toward controlled generation of text. In *International conference on machine learning*, pages 1587–1596. PMLR.

Nitish Shirish Keskar, Bryan McCann, Lav R Varshney, Caiming Xiong, and Richard Socher. 2019. Ctrl: A conditional transformer language model for controllable generation. *arXiv preprint arXiv:1909.05858*.

Ben Krause, Akhilesh Deepak Gotmare, Bryan McCann, Nitish Shirish Keskar, Shafiq Joty, Richard Socher, and Nazneen Fatema Rajani. 2021. Gedi: Generative discriminator guided sequence generation. In *Findings of the Association for Computational Linguistics: EMNLP 2021*, pages 4929–4952.

Wojciech Kryściński, Nazneen Rajani, Divyansh Agarwal, Caiming Xiong, and Dragomir Radev. 2021. Booksum: A collection of datasets for long-form narrative summarization. *arXiv preprint arXiv:2105.08209*.

Nathan Lambert, Jacob Morrison, Valentina Pyatkin, Shengyi Huang, Hamish Ivison, Faeze Brahman, Lester James V Miranda, Alisa Liu, Nouha Dziri, Shane Lyu, et al. 2024. Tulu 3: Pushing frontiers in open language model post-training. *arXiv preprint arXiv:2411.15124*.

Xun Liang, Hanyu Wang, Yezhaohui Wang, Shichao Song, Jiawei Yang, Simin Niu, Jie Hu, Dan Liu, Shunyu Yao, Feiyu Xiong, et al. 2024. Controllable text generation for large language models: A survey. *arXiv preprint arXiv:2408.12599*.

Sheng Liu, Haotian Ye, Lei Xing, and James Zou. 2023. In-context vectors: Making in context learning more effective and controllable through latent space steering. *arXiv preprint arXiv:2311.06668*.

Nasrin Mostafazadeh, Nathanael Chambers, Xiaodong He, Devi Parikh, Dhruv Batra, Lucy Vanderwende, Pushmeet Kohli, and James Allen. 2016. A corpus and evaluation framework for deeper understanding of commonsense stories. *arXiv preprint arXiv:1604.01696*.

OpenAI. 2025a. Gpt-5 system card. https://openai.com/index/gpt-5-system-card/.

OpenAI. 2025b. Introducing gpt-4.1 in the api. https://openai.com/index/gpt-4-1/. Accessed: 2025-09-14.

Zeeshan Patel, Karim El-Refai, Jonathan Pei, and Tianle Li. 2024. Swag: Storytelling with action guidance. *arXiv preprint arXiv:2402.03483*.

Letian Peng and Jingbo Shang. 2024. Quantifying and optimizing global faithfulness in persona-driven role-playing. *Advances in Neural Information Processing Systems*, 37:27556–27583.

Letian Peng and Jingbo Shang. 2025. Codifying character logic in role-playing. *arXiv preprint arXiv:2505.07705*.

Gerald Prince. 2003. *A dictionary of narratology*. U of Nebraska P.

Hannah Rashkin, Asli Celikyilmaz, Yejin Choi, and Jianfeng Gao. 2020. Plotmachines: Outline-conditioned generation with dynamic plot state tracking. *arXiv preprint arXiv:2004.14967*.

Mark O Riedl and Robert Michael Young. 2010. Narrative planning: Balancing plot and character. *Journal of Artificial Intelligence Research*, 39:217–268.

Abigail See, Aneesh Pappu, Rohun Saxena, Akhila Yerukola, and Christopher D Manning. 2019. Do massively pretrained language models make better storytellers? *arXiv preprint arXiv:1909.10705*.

Murray Shanahan, Kyle McDonell, and Laria Reynolds. 2023. Role play with large language models. *Nature*, 623(7987):493–498.

Kurt Shuster, Jing Xu, Mojtaba Komeili, Da Ju, Eric Michael Smith, Stephen Roller, Megan Ung, Moya Chen, Kushal Arora, Joshua Lane, et al. 2022. Blenderbot 3: a deployed conversational agent that continually learns to responsibly engage. *arXiv preprint arXiv:2208.03188*.

Simeng Sun, Kalpesh Krishna, Andrew Mattarella-Micke, and Mohit Iyyer. 2021. Do long-range language models actually use long-range context? *arXiv preprint arXiv:2109.09115*.

Tzvetan Todorov and Arnold A. Weinstein. 1969. Structural analysis of narrative. *Novel: A Forum on Fiction*, 3:70.

Saranya Venkatraman, Nafis Irtiza Tripto, and Dongwon Lee. 2025. Collabstory: Multi-llm collaborative story generation and authorship analysis. In *Findings of the Association for Computational Linguistics: NAACL 2025*, pages 3665–3679.

Qianyue Wang, Jinwu Hu, Zhengping Li, Yufeng Wang, Daiyuan Li, Yu Hu, and Mingkui Tan. 2025. Generating long-form story using dynamic hierarchical outlining with memory-enhancement. In *Proceedings of the 2025 Conference of the Nations of the Americas Chapter of the Association for Computational Linguistics: Human Language Technologies (Volume 1: Long Papers)*, pages 1352–1391.

Kevin Yang, Dan Klein, Nanyun Peng, and Yuandong Tian. 2023. Doc: Improving long story coherence with detailed outline control. In *Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, pages 3378–3465.

Longfei Yun, Letian Peng, and Jingbo Shang. Ultrabench: Benchmarking llms under extreme fine-grained text generation.

Jeffrey Zhou, Tianjian Lu, Swaroop Mishra, Siddhartha Brahma, Sujoy Basu, Yi Luan, Denny Zhou, and Le Hou. 2023. Instruction-following evaluation for large language models. *arXiv preprint arXiv:2311.07911*.

---

## 附录 A：数据集

### A.1 统计信息

所得数据集由从 148 本书中抽取的 629 个经验证的伏笔—兑现对组成（表 4）。

### A.2 质量检查与可靠性分析

为评估标注可靠性，我们对随机抽取的 100 个伏笔—兑现对进行了质量检查。两位标注者从不同角度独立评估每个样本，同时评估整体有效性与组件级正确性。

如表 5 所示，标注者在配对层面就 88% 的样本达成一致。组件层面的一致性更高，铺垫准确率的一致率为 95%，兑现准确率则完全一致。对连接有效性的判断显示出略低的一致率（88%），这反映了与识别显式文本证据相比，评估长程叙事再诠释涉及更大的主观性。

总体而言，这些结果表明，数据集在识别具体铺垫与兑现方面达到了高精度，剩余的分歧主要来自因果相关性的边界案例，而非事实性不一致。

## 附录 B：有根据兑现追踪的指标定义

我们在增量式叙事设置下评估有根据的兑现追踪：模型逐句处理故事，且不允许修改过去的决策。

**正确检测率（Correct Detection Rate, Correct Det. %）。** 正确检测率衡量在增量式处理过程中，模型正确识别出兑现发生的叙事所占的比例。若模型在标注金标兑现位置周围一个固定容差窗口（±3 句）内的某个句子索引处触发兑现决策，则该预测被视为正确。该指标反映部分上下文下端到端的兑现检测准确率。

**早触发（Early Triggers）。** 早触发统计模型在叙事中任何金标兑现变得可观察之前就预测兑现的案例数。这类错误对应过早的兑现触发，通常由先于实际实现的表面线索或预兆信号所导致。数值越低，表示对过早因果推断的抵抗能力越强。

**晚触发（Late Triggers）。** 晚触发统计模型在金标兑现点已经发生之后才触发兑现的案例数。这些错误反映延迟的识别或过度保守的决策——即在承诺兑现决策之前要求过多的证据。数值越低，表示与叙事兑现的时间对齐越好。

**定位误差（Localization Error, Loc. Error）。** 定位误差衡量模型预测的兑现触发点与标注金标兑现位置之间按句子数计的绝对距离，在所有被触发的案例上取平均。该指标评估在线叙事感知中兑现定位的时间精度。数值越低，表示与真实兑现位置的对齐越准确。

**续写得分（Continuation Score, Cont. Score）。** 续写得分评估一旦检测到兑现后，兑现实现在生成中的质量。对于模型在容差窗口内触发兑现的案例，我们提示模型以可用上下文为条件生成一个单句续写。生成的续写随后使用一个基于轨迹的评估器与金标续写进行比较，该评估器评估叙事一致性、因果推进与结局对齐。该得分反映被判定为与金标遵循相同叙事轨迹的续写所占的比例。

**指标小结。** 综合来看，这些指标沿三个互补维度评估有根据的兑现追踪：（i）决策时机（正确检测率、早/晚触发）；（ii）时间定位精度（定位误差）；（iii）检测后的生成保真度（续写得分），从而在增量式叙事上下文下对检测与实现提供全面的评估。

## 附录 C：LLM 使用声明

大语言模型（LLM）仅被用于润色措辞与改进语法正确性，以提高可读性。它们未被用于生成、改动或影响本文的技术内容、概念性贡献、方法或实验发现。最终手稿及其准确性的责任完全由作者承担。

---

## 表格

### 表 1：预言式时机下 BookSum 数据集上的性能比较

> CFPG 在多种模型架构上始终优于基于提示的基线，实现近乎完美的兑现激活，并显著改进叙事对齐。

| 基础模型 | 方法 | 应兑现率（Should-Payoff Rate） | 平均得分 ↑ |
|---|---|---|---|
| GPT-4.1-mini | Prompt | — | 0.569 |
| | CFPG | 1.000 | 0.911 |
| Claude-Haiku-4.5 | Prompt | — | 0.657 |
| | CFPG | 0.965 | 0.940 |
| Qwen2.5-3B | Prompt | — | 0.481 |
| | CFPG | 0.998 | 0.781 |
| Qwen2.5-7B | Prompt | — | 0.517 |
| | CFPG | 1.000 | 0.797 |
| Qwen2.5-14B | Prompt | — | 0.583 |
| | CFPG | 1.000 | 0.898 |
| Llama-3.1-8B | Prompt | — | 0.530 |
| | CFPG | 1.000 | 0.802 |

> 注：所有模型均指其相应的 "Instruct" 变体。

### 表 2：主要结果：有根据的兑现追踪

> 我们评估模型在增量式上下文下识别兑现的能力。CFPG（我们的方法）在所有骨干模型上始终取得更优性能。各指标定义见附录 B。彩色数值表示 CFPG 与 FAP 的差值。

| 模型 | 方法 | 检测率 (%) ↑ | 早触发 ↓ | 晚触发 ↓ | 定位误差 ↓ | 保真度 ↑ |
|---|---|---|---|---|---|---|
| GPT-4.1-mini | Foreshadow-Aware Prompt | 58.0 | 235 | 17 | 8.85 | 0.453 |
| | Context Refresh (Sim.) | 48.6 | 306 | 7 | 13.05 | 0.382 |
| | **CFPG (Ours)** | 69.8 (+11.8) | 166 (−69) | 11 (−6) | 5.76 (−3.09) | 0.647 (+0.221) |
| Qwen2.5 3B-Inst. | Foreshadow-Aware Prompt | 4.5 | 601 | 0 | 34.67 | 0.022 |
| | Context Refresh (Sim.) | 6.7 | 587 | 0 | 32.81 | 0.039 |
| | **CFPG (Ours)** | 10.8 (+6.3) | 550 (−51) | 5 (+5) | 31.63 (−3.04) | 0.080 (+0.058) |
| Qwen2.5 7B-Inst. | Foreshadow-Aware Prompt | 15.6 | 522 | 2 | 27.00 | 0.114 |
| | Context Refresh (Sim.) | 19.6 | 493 | 7 | 23.79 | 0.177 |
| | **CFPG (Ours)** | 19.6 (+4.0) | 490 (−32) | 5 (+3) | 26.23 (−0.77) | 0.184 (+0.070) |
| Llama3.1 8B-Inst. | Foreshadow-Aware Prompt | 25.8 | 451 | 5 | 20.04 | 0.182 |
| | Context Refresh (Sim.) | 22.1 | 482 | 3 | 23.72 | 0.160 |
| | **CFPG (Ours)** | 27.3 (+1.5) | 439 (−12) | 8 (+3) | 19.91 (−0.13) | 0.226 (+0.044) |

### 表 3：有根据兑现追踪失败的分类体系

| 类别 | 决策 | 模型的内部逻辑 | 金标（叙事状态） |
|---|---|---|---|
| 主动错误（误触发） | 过早 | "意图或准备已经足够了。" | 仅有铺垫/意图；因果链尚未闭合。 |
| 混淆 | 虚假 | "这个事件看起来像是兑现点。" | 主题相似；并非目标事件。 |
| 被动错误（状态崩溃） | 推迟—尚不可观察 | "我猜它在这段间隔里已经兑现了。" | 因果状态必须保持为待决（Pending）。 |
| 状态失败 | 失序 | "我丢失了对初始状态变化的追踪。" | 环境/角色状态已经发生转变。 |
| 反应式错误（检测缺口） | 保守 | "太隐晦了；我要等明确的确认。" | 兑现已发生；模型阈值过高。 |
| 间接失败 | 遗漏 | "这两个事件之间没有关联。" | 间接或回溯式的因果关联。 |

### 表 4：抽取的伏笔—兑现对的数据集统计信息

| 统计项 | 数值 |
|---|---|
| 书籍数（# Books） | 148 |
| 伏笔数（# Foreshadows） | 629 |
| 平均兑现距离（句子数） | 20.9 |
| 兑现距离中位数 | 13.0 |
| 第 75 百分位距离 | 29.0 |
| 第 90 百分位距离 | 45.0 |
| 最大兑现距离 | 230 |
| 物品类伏笔 | 48.2% |
| 事件类伏笔 | 35.3% |
| 言语行为类伏笔 | 9.7% |
| 规则类伏笔 | 5.1% |
| 象征类伏笔 | 1.7% |
| 平均抽取置信度 | 0.98 |

### 表 5：对随机抽取的 100 个伏笔—兑现对的质量检查结果

> 两位标注者独立评估整体有效性与组件级正确性。一致率（Agree.）表示获得相同判断的样本比例。

| 方面 | A | B | 一致率 |
|---|---|---|---|
| 配对有效性 | 0.89 | 0.96 | 0.87 |
| 铺垫准确率 | 0.97 | 0.98 | 0.95 |
| 兑现准确率 | 1.00 | 1.00 | 1.00 |
| 连接有效性 | 0.90 | 0.96 | 0.88 |

---

## 图表标题翻译

### 图 1：使用《巴斯克维尔的猎犬》中叙事示例说明"伏笔—触发—兑现"分解

> 靴子的失踪引入一个未解决的因果承诺，该承诺保持潜伏，直到一个触发性的叙事条件激活其兑现。

### 图 2：CFPG 框架概览

> CFPG 以伏笔池 C_t 的形式维护一个编码化的因果状态，其中每个元素都是一个结构化的 (F, T, P) 三元组。在每一步 t，资格选择模块基于编码化的触发约束，确定性地选择子集 S_t ⊆ C_t，该子集条件化语言模型以生成下一个续写 y。生成的文本通过编码化状态转移更新叙事前缀 X_{t+1} 与伏笔池 C_{t+1}——了结已满足的承诺并引入新的伏笔。右栏以伪代码展示简化的 CFPG 循环。

**图内文字翻译：**

- 「Codified Causal State: Foreshadow Pool」→ 编码化因果状态：伏笔池
- 「C_t = {(F_i, T_i, P_i)}」→ C_t = {(F_i, T_i, P_i)}
- 「Eligibility Selection (check Trigger T_i against X_t): S_t ⊂ C_t」→ 资格选择（将触发条件 T_i 与 X_t 比对）：S_t ⊂ C_t
- 「Conditional Generation (LM): y ~ p_θ(·|X_t, S_t)」→ 条件化生成（LM）：y ~ p_θ(·|X_t, S_t)
- 「Story Prefix X_t」→ 故事前缀 X_t
- 「State Update (Codify→Update): C_{t+1}, X_{t+1}」→ 状态更新（编码→更新）：C_{t+1}, X_{t+1}
  - 「- resolve: remove satisfied commitments」→ - 兑现：移除已满足的承诺
  - 「- add: codify new foreshadows from y」→ - 添加：从 y 中编码新伏笔
- 「codified decision」→ 编码化决策
- 「Generated Continuation y」→ 生成的续写 y
- 「codified state transition」→ 编码化状态转移
- 「Simplified CFPG Loop (Codified)」→ 简化的 CFPG 循环（编码化）

伪代码：

```
- selected_payoffs: check Foreshadow and Trigger
- update_pool: remove resolved foreshadows; add new (F, T, P)
for t = 1 ... T:
    St = select_payoffs(Ct, Xt)     # codified eligibility（编码化资格选择）
    y = LM_generate(Xt, St)         # conditional generation（条件化生成）
    Xt+1 = Xt + y
    Ct+1 = update_pool(Ct, y)       # resolve + add foreshadows（兑现 + 添加伏笔）
```

### 图 3：从 BOOKSUM 语料库抽取的代表性 F-T-P 三元组

> 我们将每个元素锚定到具体的叙事片段，确保潜在的因果关联可被验证，且兑现的时间是正当的。

**图内文字翻译：**

- 故事上下文（节选）：在《巴斯克维尔的猎犬》中，亨利·巴斯克维尔爵士抵达伦敦继承庄园。不久之后，一只靴子从他的旅馆房间神秘失踪，随后是第二只。这一阶段未给出任何解释，使该事件成为叙事流程中一个怪异而令人不安的反常现象。
- 伏笔元数据：
  - 状态（Status）：未兑现（Unresolved）
  - 类型（Type）：实物（Physical Object）
  - 间隔（Gap）：长程延迟（Long-range delay）
  - 逻辑（Logic）：非平凡关联（Non-trivial link）
- 抽取的伏笔—触发—兑现三元组：
  - 伏笔（F）：亨利爵士的一只靴子在没有任何即时解释或功能性原因的情况下失踪了。
  - 触发（T）：调查揭示了猎犬的存在，以及斯塔普尔顿需要一种基于气味的追踪工具。
  - 兑现（P）：真相被揭示——靴子是被偷去用于训练猎犬，以专门凭借亨利爵士的气味来猎捕他。

### 图 4：兑现生成过程中的注意力模式可视化

> 热力图（左与中）比较了在朴素提示基线与 CFPG 下，分配给伏笔铺垫 token 的注意力权重。折线图（右）量化了相对于基线的因果显著性增益（Causal Saliency Gain），显示 CFPG 在整个生成过程中始终对铺垫区域维持显著更高的平均注意力。每一行对应一个不同的叙事实例。

### 图 5：Qwen-2.5-7B-Instruct 的兑现检测时序决策动力学

> 与基线相比，CFPG 展示出减少的过早激活、在金标兑现处的急剧决策转变，以及兑现后持续的置信度。

**图内文字翻译：**

- 「Sentence Distance from Gold Payoff」→ 距金标兑现的句子距离
- 「Detection Confidence P(Resolved)」→ 检测置信度 P(已兑现)
- 「Sharp Decision Jump (+0.22)」→ 急剧决策跳跃（+0.22）
- 「Hallucination Suppression」→ 幻觉抑制
- 「Decision Dynamics: Qwen2.5-7B-Instruct」→ 决策动力学：Qwen2.5-7B-Instruct
- 「Baseline (Implicit)」→ 基线（隐式）
- 「CFPG (Structured Causal)」→ CFPG（结构化因果）
- 横轴刻度：T-10、T-5、T-2、Payoff (T)、T+2、T+5、T+10

### 图 6：有根据兑现追踪错误的分布

> 基于提示的方法与基于 CFPG 的方法的有根据兑现追踪错误分布。与基线提示相比，CFPG 显著减弱了过早兑现触发。

**图内文字翻译：**

- 「Frequency of Failure Cases」→ 失败案例频数
- 图例类别：Premature（过早）、Confusion（混淆）、Conservative（保守）、Deferred NYO（推迟—尚不可观察）、Indirect Failure（间接失败）、State Failure（状态失败）
- Prompt：过早 194、混淆 34、保守 16、推迟 9、间接 7、状态 6
- CFPG：过早 134、混淆 26、保守 13、推迟 10、间接 3、状态 4

### 图 7：抽取的伏笔—兑现语料库的数据集统计

> （左）铺垫与兑现之间按句子计量的兑现距离的概率密度。该分布呈现明显的重尾特征，中位距离为 13 句，均值为 20.9 句。值得注意的是，25% 的兑现发生在超过 29 句的距离上，10% 超过 45 句，最长的依赖跨越 200 句以上。（右）伏笔类型的分布。基于物品（48.2%）与基于事件（35.3%）的伏笔合计占数据集的 80% 以上。
