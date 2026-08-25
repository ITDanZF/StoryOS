# EVOSPARK：面向统一长程叙事演化的内生交互式智能体社会

**作者：** Shiyu He¹\*、Minchi Kuang²\*,†、Mengxian Wang¹\*、Bin Hu¹、Tingxiang Gu¹

¹ 新疆大学计算机科学与技术学院，乌鲁木齐 830046，中国
² 清华大学精密仪器系，北京 100084，中国

{heshiyu, wangmengxian, hubin, gutingxiang}@stu.xju.edu.cn
kuangmc@mail.tsinghua.edu.cn

\* 同等贡献。
† 通讯作者。

> arXiv:2604.12776v1 [cs.CL] 2026 年 4 月 14 日

## 摘要

在基于 LLM 的多智能体系统中实现内生的叙事演化，受到生成式涌现固有随机性的阻碍。尤其是，长程模拟饱受**社会记忆堆叠**（social memory stacking，相互冲突的关系状态不断累积而得不到消解）与**叙事—空间失谐**（narrative-spatial dissonance，空间逻辑与演进中的情节脱节）之苦。为弥合这一鸿沟，我们提出 EVOSPARK，一个专为在内生交互式智能体社会（Endogenous Interactive Agent Societies）中维持逻辑连贯的长程叙事而设计的框架。为确保一致性，**分层叙事记忆**（Stratified Narrative Memory）采用一个**角色社会演化基座**（Role Socio-Evolutionary Base）作为"活着的认知"，动态地代谢（metabolize）经验以消解历史冲突。作为补充，一个**生成式场面调度**（Generative Mise-en-Scène）机制强制"角色—地点—情节"对齐，使角色在场与叙事流程同步。支撑这一切的是**统一叙事运作引擎**（Unified Narrative Operation Engine），它整合了**涌现角色落地协议**（Emergent Character Grounding Protocol），将随机性"火花"转化为持久化角色。该引擎奠定了一个基底，将极简的前提扩展为一个开放式的、不断演化的故事世界。实验表明，EVOSPARK 在多样化范式上显著优于基线，能够持续生成富有表现力且连贯的叙事体验。

## 1 引言

大语言模型（LLM）与多智能体系统（MAS）的整合，已从根本上重塑了生成式叙事的面貌，使智能体能够以前所未有的流畅性模拟复杂的社会互动（Park et al., 2023; Piao et al., 2025）。然而，尽管当前系统擅长生成短时片段（vignettes），实现长程故事演化——即一场模拟从一个极简的种子自主演化为一个无界的、自维持的、逻辑连贯的叙事生态系统——仍是一个难以企及的目标（Xia et al., 2025）。

随着叙事复杂度的扩展，当前架构中浮现出两个关键的系统性缺陷，阻碍了长期逻辑的可持续性。首先，系统饱受**社会记忆堆叠**之苦：传统的只追加（append-only）记忆架构导致相互冲突的关系状态不断累积（例如，同时记得某人是朋友又是敌人），造成行为的不连贯（Platnick et al., 2025; Zhong et al., 2023）。其次，基于文本的智能体面临**叙事—空间失谐**。由于缺乏将叙事推进与空间状态同步的机制，智能体常常生成未落地的互动，违背了"角色—地点—情节"这一基本逻辑——例如角色在情节关键的转折处出现在彼此脱节的地点——从而割裂了故事与其场景之间的逻辑联系（Ran et al., 2025; Chen et al., 2025）。

在这些功能性缺陷之外，该领域还受到一种结构性**范式分裂**（paradigm schism）的约束。传统的交互式叙事依赖严格的剧本遵循，确保了逻辑却牺牲了自主性（Sun et al., 2025）。相反，近期的基于 LLM 的模拟往往优先考虑开放式涌现（Park et al., 2023; Yang et al., 2025），导致不可控的混乱涌现。尽管近期工作暗示了控制机制（Han et al., 2024; Wang et al., 2024），现有碎片化的架构仍无法支持多样化模拟需求所需的完整叙事控制谱系——从严格的层级化规划到开放式演化（Sun et al., 2025）。

为应对这些挑战，我们提出 EVOSPARK，一个统一框架，整合叙事控制、认知演化与空间落地，以培育由内生角色涌现所驱动的交互式智能体社会。我们的核心贡献是：

- **统一叙事运作引擎（NOE）**：我们将"火花"（sparking）——随机的 LLM 幻觉——操作化，不是当作错误，而是通过**涌现角色落地协议（ECGP）**当作创造力的驱动。通过**本体论晋升**（Ontological Promotion），系统验证并将在叙事中一闪而过的幻觉转化为持久、合法的核心角色，从而有效地将随机噪声转化为用于无限世界扩展的结构性资产。
- **角色社会演化基座（RSB）**：为消解社会记忆堆叠，我们引入 RSB 作为一个可变的、"活着的"认知基座。与静态或只追加的 RAG 方法不同，RSB 采用事件驱动的反思来持续代谢经验——通过原地（in-place）修改来更新人格、社会图谱与目标。这确保智能体的内部状态实时演化，与不断变化的社会动力学图景保持一致。
- **生成式场面调度（GMS）**：我们通过 GMS 机制缓解叙事—空间失谐，它充当一个虚拟的舞台调度（stage manager），强制严格的"角色—地点—情节"（RLP）对齐。它动态地同步角色在场与转换，使其与演进的叙事流程保持一致，确保空间语境在逻辑上与故事推进相符。

## 2 相关工作

**内生多智能体系统。** MAS 研究已从静态编排转向动态的内生演化。早期框架如 MetaGPT 与 Camel（Hong et al., 2024; Li et al., 2023）依赖固定的标准作业程序（Standard Operating Procedures），限制了适应性。为应对这一点，近期架构实现了自我改进：CoMAS 与 AFlow（Xue et al., 2025; Zhang et al., 2025d）通过交互奖励优化策略，而达尔文哥德尔机（Darwin Gödel Machine）（Zhang et al., 2025c）允许智能体递归地修改自己的代码。在模拟领域，AgentSociety、OASIS 与生成式智能体（Generative Agents）（Piao et al., 2025; Yang et al., 2025; Park et al., 2023）规模化交互以观察涌现规范，而 BookWorld（Ran et al., 2025）直接从小说的文本构建社会。然而，当前的内生系统对开放式叙事呈现出一种**目的论失配**（teleological mismatch）。首先，演化式框架为指标收敛（如通过率）而优化（Xue et al., 2025; Zhang et al., 2025d），将对叙事扩展至关重要的随机性当作噪声。其次，像 S3 与 WarAgent 这样的社会模拟器（Gao et al., 2023; Hua et al., 2023）饱受社会记忆堆叠之苦——累积交互日志却缺乏将瞬时经验转化为持久结构更新的代谢机制，不可避免地使长程连贯性退化。

**社会演化动力学与记忆。** 为支持长期叙事，研究主要针对静态一致性以缓解身份漂移。像 ID-RAG（Platnick et al., 2025）这样的框架采用身份知识图谱来落地智能体人格，而 Open-Theatre（Xu et al., 2025）与 MemoryBank（Zhong et al., 2023）引入层级化存储以确保检索准确率。类似地，S3 与 AgentSociety（Gao et al., 2023; Piao et al., 2025）利用记忆模块在社会模拟中维持连贯的行为模式。然而，这些架构通常将记忆视为累积日志。这种僵化导致社会记忆堆叠，过时的关系状态持续存在并与新的发展相冲突。虽然生成式智能体（Park et al., 2023）使用反思来综合观察，但它聚焦于保持角色状态。近期工作试图解决这一问题：G-Memory（Zhang et al., 2025a）基于交互轨迹演化层级，MemEvolve（Zhang et al., 2025b）元优化记忆架构，DOME（Wang et al., 2025）追踪时序状态变化。尽管有这些进展，在实现一种能从根本上随时间转变智能体人格与关系——而非仅仅累积上下文——的社会演化代谢方面，仍存在空白。

**生成式场面调度。** 当前基于文本的智能体常受叙事—空间失谐之苦，即生成的叙事与连贯的环境语境脱节。虽然生成式智能体（Park et al., 2023）将行为落地于沙盒，AgentSociety（Piao et al., 2025）通过兴趣区（AOI）建模城市流动性，这些环境往往充当被动的容器。BookWorld（Ran et al., 2025）通过引入离散的地理空间追踪与出行约束推进了这一点。类似地，NarrativeGenie 与 HAMLET（Kumaran et al., 2024; Chen et al., 2025）动态摆布道具并裁定物理互动以匹配叙事节拍，而 Open-Theatre 与 HoLLMwood（Xu et al., 2025; Chen et al., 2024）显式定义场面或场景边界以约束智能体定位。然而，这些框架往往缺乏在情节、角色与其具体位置之间维持基本对齐所需的细粒度。标准语义指标对逻辑失配也仍视而不见，导致违背空间一致性的互动（Kumaran et al., 2024）。

## 3 EVOSPARK

在本节中，我们详述 EVOSPARK 的设计。EVOSPARK 的主要动机是弥合静态叙事规划与动态、开放式智能体交互之间的鸿沟。不同于将剧本控制与智能体涌现相隔离的传统系统，EVOSPARK 作为一个为长程一致性量身定制的整体框架。它整合了叙事构思与宏观规划、模拟与演化，并且关键地，通过统一叙事运作引擎（NOE）来运作，该引擎通过涌现角色落地将静态蓝图转化为长程演化的故事世界。EVOSPARK 框架的整体架构如图 1 所示。

**叙事构思与宏观规划。** 在创世智能体（Genesis Agent）的编排下，生命周期始于从用户提供的故事前提出发综合基础资产。该智能体生成故事世界观（Storyworld Outlook）、设定条目（lore entries）与角色动力学。以所选控制范式为条件，这些组件被组织成一个多态的叙事主轴（Narrative Spine）。该主轴支配模拟的宏观流程，表现为一个严格的事件层级（HDP）、一个线性情节序列（SNP），或一个用于自由涌现（Free EN）的开放式空状态。

**叙事运作引擎。** 一旦主轴建立，叙事运作引擎（NOE）就构建模拟环境。如图 1 所详述，该层执行世界地图与地点模块化（World Map & Locations Modularization）以及角色实例化（Character Instantiation），定义静态地点编码与动态智能体属性。此外，它整合 ECGP，过滤叙事幻觉并执行本体论晋升，将有效的火花角色转化为系统认知基座中的持久实体。

**迭代模拟与演化。** 执行阶段在情节化模拟方案（Episodic Simulation Scheme）下运行。如图 1 所示，在线模拟执行一个连续循环，其中角色智能体与环境、非玩家角色（NPC）及玩家交互。为确保空间连贯性，该阶段整合生成式场面调度（GMS）机制。GMS 充当"虚拟舞台调度"，通过创世智能体与导演智能体（Director Agent）之间的协作式"规划—校正"（Plan-Correct）协议，将抽象的叙事意图与具体的场景执行桥接起来。它通过一个双阶段过程强制严格的"角色—地点—情节"（RLP）对齐：

- **离线规划对齐（Offline Planning Alignment）**：如图 1 所详述，创世智能体通过在角色、地点与情节维度上对齐约束来建立基础逻辑，确保初始分配与作者意图在逻辑上保持一致。
- **动态空间对齐（Dynamic Spatial Alignment）**：导演智能体利用空间走位（spatial blocking）将叙事意图与实时语境同步。如图 2 所详述，这显式纳入一个实体消解（entity resolution）步骤，以纠正 LLM 引发的身份幻觉（例如，畸形的角色编码），确保精确的角色落地。

该循环以更新动态属性收尾，系统利用 RSB 将先前状态与新经验巩固为刷新后的当前状态。这使智能体能够将叙事事件吸收进长期的认知与社会演化。

### 3.1 叙事谱系配置

EVOSPARK 作为一个统一的、范式无关的基底，支持完整的控制粒度谱系。在初始化（T0）时，NOE 被配置为三种范式之一，动态地将叙事主轴与导演智能体的干预策略对齐于用户意图：

**层级化详细规划（HDP）。** 系统在一棵严格的事件树上运作。导演智能体强制执行层级约束，通过细粒度引导将智能体行为对齐于作者意图，在无需僵化硬编码的情况下确保高情节保真度。

**顺序叙事规划（SNP）。** 系统生成线性关键节点。智能体受动机驱动去达成这些里程碑，但在节点之间的路径规划与互动细节上保留即兴发挥的自由。

**自由涌现叙事（Free EN）。** 仅以基础设定（故事世界、角色）初始化，导演智能体移除情节约束而保留交互引导。因此，叙事轨迹完全由内生的智能体决策与涌现冲突所驱动。

### 3.2 多智能体协作

我们的方法使叙事并非通过孤立的模块、而是通过四类专门智能体的动态协作来演化。

**创世智能体（Genesis Agent）。** 作为叙事构思的执行者，创世智能体处理人类前提以生成叙事主轴。关键地，它通过与导演智能体协作来发起 GMS 的"规划—校正"协议。在离线规划对齐阶段，它建立基础的"角色—地点—情节"逻辑，确保移交给架构师与导演的初始蓝图在结构上健全，并与作者意图在逻辑上一致。

**架构师智能体（Architect Agent）。** 该智能体充当 NOE 的运作核心。它在执行世界地图与地点模块化以实例化环境的同时，其关键的协作角色在于 ECGP。它与导演智能体协同，监控模拟中的火花。当导演识别出一个有效的叙事幻觉时，架构师执行本体论晋升，将这些转瞬即逝的提及转化为合法实体，并无缝地整合进创世智能体最初定义的故事世界观之中。

**导演智能体（Director Agent）。** 作为迭代模拟的指挥者，导演智能体弥合静态规划与动态执行之间的鸿沟。它编排一个与角色智能体的连续反馈循环，基于所配置的范式（HDP/SNP/Free EN）提供实时交互引导。同时，它参与动态空间对齐（GMS 的一部分），纠正源自创世智能体蓝图的潜在叙事—空间失配。它还充当架构师的主要过滤器，在请求晋升之前验证某个火花是否与当前叙事流程对齐。

**角色智能体（Role Agents）。** 这些智能体执行情节化模拟方案。由角色社会演化基座（RSB）——它们"活着的认知"——驱动，它们相互之间以及与环境中进行去中心化的交互。它们并非孤立行动，而是形成内生的社会图谱。它们的行为持续受导演引导的调制，而其交互结果则被代谢回 RSB，确保集体叙事演化扎根于一致的、长期的角色成长。

### 3.3 涌现角色落地协议（ECGP）

ECGP 通过利用随机性火花——对未初始化实体的叙事幻觉——来操作化内生角色涌现。如图 1 所示，该协议通过以下流水线捕捉并整合这些实体：

**通过约束违反触发火花。** 该协议由一个我们称之为"火花"的生成异常触发。尽管严格的约束将选择限制在现存的角色列表内，LLM 仍可能幻觉出一个未初始化的名字来弥合叙事缺口。ECGP 将这种约束违反不是识别为错误，而是识别为一个火花——一种潜在叙事必要性的信号。

**实体消解（Entity Resolution）。** 一经检测，导演智能体立即截获该火花以执行严格的验证。此步骤充当过滤器，将真正的新实体与单纯的别名（例如，现有 ID 的昵称或变体）区分开来。仅当一个火花被确认为结构上新颖且语境上连贯时，它才被验证为涌现的合法候选。

**本体论晋升（Ontological Promotion）。** 该阶段执行内生演化的核心逻辑，将火花从随机副产物到模拟实体的转变形式化。受该实体情节关键性的驱动，该过程提升其层级地位，主动地将幻觉从瞬时噪声重新定位为角色演化与生态系统扩展的驱动。

**整合与落地（Integration & Grounding）。** 为最终确定涌现，架构师智能体执行结构整合。它利用语境感知在故事世界观中为晋升后的角色实例化一个新的档案（profile），并在 RSB 中初始化其认知状态。该过程有效地锚定所生成的信息，将曾是一闪而过的叙事提及转化为世界状态中一个永久、一致的组件，随时准备参与未来的记忆形成与叙事推导。

### 3.4 GMS 中的动态空间对齐

我们首先观察到在缺少 GMS 中动态空间对齐的情况下，智能体表现出空间失谐的场景。如表 1 所示，虽然语义层面的情节可能逻辑推进，物理矛盾却常常在复杂互动中浮现，说明了智能体在没有持久空间语境的情况下会如何"迷失在空间中"。

为解决此类不一致，GMS 中的动态空间对齐充当一个隐式的空间感知器，帮助智能体落地其物理现实。表 2 展示了通过该机制，角色反应与对话被连贯地锚定于其所感知的物理环境的互动。

## 4 分层叙事记忆（SNM）

为支持长程故事演化，我们引入分层叙事记忆（SNM）。不同于饱受社会记忆堆叠——相互矛盾的历史状态持续存在——之苦的扁平记忆系统，SNM 采用分层架构。它系统性地区隔全局真相、线性溯源与演进中的社会认知状态，确保智能体基于"活着的认知"来行动。

### 4.1 层级化记忆架构

如图 1 所示，SNM 通过四个不同的组件桥接即时感知与持久存储：

- **情节演化缓冲（EEB）**：一个短时情节记忆，缓存实时互动（Ei）与感知数据，充当长期代谢之前的暂存区。
- **共享世界知识库（SWKB）**：存储不可变的全局真相（例如设定、世界观），为所有智能体提供一致的地面真相。
- **角色情节基座（REB）**：一个用于溯源追踪的不可变经验日志。它与即时决策解耦，以防止上下文污染。
- **角色社会演化基座（RSB）**：智能体当前快照（人格、社会图谱）的核心可变存储。它通过原地更新持续演化。

### 4.2 反思—综合—巩固

为解决过去与当前状态之间的冲突，我们实现一个事件驱动的"反思—综合—巩固"（Reflect-Synthesize-Consolidation）机制（图 3）。系统不再简单地堆叠记忆，而是主动地将 EEB 中的数据同化进持久的 RSB：

- **反思触发（Reflection Trigger）**：在一个事件（Ei）期间，原始互动在 EEB 中累积。事件结束时，系统执行一次触发检查。若互动强度超过阈值，系统从 RSB 检索相关上下文；否则，它直接进入下一个事件（Ei+1）。
- **综合（Synthesize）**：该阶段充当一个认知工作区，计算演化增量（evolutionary delta）。它将 EEB 中缓存的涌现数据与已建立的 RSB 状态进行对照。如图 3 所示，系统通过切断过时的关系（可视化为被划掉的边）并同步更新社会连接与角色档案，来显式地消解拓扑迁移。
- **巩固（Consolidation）**：综合后的状态被提交到 RSB。关键地，这是一次原地更新操作。旧的人格向量与社会边被新的综合所覆盖，确保 RSB 始终保持为智能体当前现实的一个一致、无冲突的快照。

## 5 实验

在本节中，我们通过严格的比较评估来验证 EVOSPARK 的有效性。我们评估框架在不同叙事控制范式下的性能，主要聚焦于故事模拟与演化的质量。

### 5.1 实验设置

我们利用覆盖六种不同体裁（例如悬疑、科幻、史诗奇幻）的精选场景。虽然我们在不同叙事长度上进行了验证（附录 B），我们的主要评估优先考虑这些体裁中一个有代表性的子集内的、具有挑战性的长程设置。在该设置中，每次模拟包含 15 个重要事件的连续序列（约 45 个场景），每次运行产生平均 20 万–25 万词的语料，以严格测试演化一致性。

**基线。** 我们将 EVOSPARK 与代表不同叙事范式的三个有代表性的框架进行比较：

- **Open-Theatre**（Xu et al., 2025）：一个利用 Director–Global Actor 架构的剧本驱动框架，代表集中式控制范式。
- **BookWorld**（Ran et al., 2025）：一个虚拟世界模拟框架，以高保真度建模既定环境与 NPC 互动。
- **HoLLMwood**（Chen et al., 2024）：一个创意写作智能体框架，复刻作者—编辑工作流，通过多智能体协作精炼叙事质量。

### 5.2 评估指标

我们为特定叙事范式定义了一套全面的指标。

**通用指标：**

- **角色表现（Role Performance, RP）**：评估智能体的可信度，确保行动与对话对齐于预设的人格与演进中的记忆。
- **沉浸感（Immersion, Im）**：通过评估智能体与环境语境互动的有效性来衡量用户参与度，以激发情感共鸣。

**HDP 与 SNP 指标：**

- **叙事共鸣（Narrative Resonance, NR）**：评估结构深度。它衡量对蓝图的主题遵循度与结构完整性，以唤起读者共情。
- **长程一致性（Long-Horizon Consistency, LC）**：评估跨延展片段的逻辑稳定性，确保平滑过渡与对叙事主轴的严格遵循。

**Free EN 指标：**

- **叙事合理性（Narrative Soundness, NS）**：验证因果可行性，确保事件前置条件得到满足，且智能体行动保持理性与目标导向。
- **创造力（Creativity, Cr）**：评估内容新颖度。它评估情节反转与角色刻画的独特性，惩罚泛化的刻板印象。
- **情节推进（Plot Advancement, PAC）**：评估模拟动力，奖励逻辑性的冲突升级，惩罚停滞。

### 5.3 评估方法

遵循 BookWorld（Ran et al., 2025），我们采用带位置交换的两两 LLM-as-a-Judge 协议，使用 Gemini-2.5-Pro（英文）与 Deepseek-v3.2-Think（中文）。我们报告胜率（Win Rate）与平均李克特得分（1–5）（Likert, 1932）。我们评估流水线的可信度，通过其与人工评估的一致性得到佐证，见附录 A。

### 5.4 评估结果

图 4 与图 5 展示了 EVOSPARK 在不同范式、语言与骨干模型上的表现。

**在推理模型上的整体优势。** EVOSPARK 在大多数设置下显著优于基线，尤其是在增强推理的模型（如 Gemini-2.5-Pro、DeepSeek-V3.2-Think）上。它在角色表现、叙事共鸣与沉浸感方面取得主导性胜率与优势幅度。这一成功归因于先进推理能力与我们的认知模块（ECGP、GMS）之间的协同，这些模块要求复杂的指令遵循以维持一致性。

**复杂度鸿沟与随机性。** 相反，在非推理模型（如 Llama3.3-70B、Qwen3-32B）及 Free EN 模式下，性能有所下降。前者反映了一个指令复杂度鸿沟：EVOSPARK 的高认知负荷（空间/记忆约束）压垮了较弱的模型。在 Free EN 中，波动源于极小的框架干预：放宽规划约束增加了自主性与随机性，自然导致比严格受控范式更高的方差。

### 5.5 长程演化对齐

不同于此前聚焦于单一事件的评估，本分析考察系统在横跨 1、5 与 10 个事件的连续叙事时程上的性能。主要目标是验证智能体行为能否随角色关系或社会身份的变化而动态转变，同时维持长程一致性。本评估的核心是**演化行动对齐**（Evolutionary Action Alignment, EAA），一个旨在量化这些演化变化与智能体行动之间同步性的指标。

如图 6 所示，跨时程的比较揭示，随着事件数量的增加，RP、LC 与 EAA 的胜率显著提升，尤其是在 SNP 与 Free EN 范式下。虽然 HDP 也表现出增益，但不如其他模式显著。我们将此归因于 HDP 深层情节规划的严格约束，它部分削弱了由 RSB 驱动的动态社会演化。

### 5.6 消融研究

为隔离特定模块的贡献，我们评估了四种消融变体：（1）No-RSB（移除角色社会演化基座）；（2）No-RSB-rel（禁用关系演化）；（3）No-GMS（省略生成式场面调度机制）；（4）No-ECGP（移除涌现角色落地协议）。

使用 gemini-2.5-pro 的结果（图 7）符合预期。移除 GMS 在角色表现、共鸣与沉浸感上造成最严重的退化，确认 GMS 的离线与动态对齐是可信度的基础。

禁用 ECGP 通过限制内生角色涌现，显著损害了沉浸感与创造力。相比之下，No-RSB 变体在这些即时评估中表现出相对轻微的下降。我们将此归因于该模块的时间性：RSB 旨在缓解累积性的记忆冲突，其效果主要在较长时程上变得显著（如第 5.5 节所详述），而非在短期比较中。

## 6 结论

我们提出 EVOSPARK，一个旨在内生智能体社会中维持逻辑连贯、长程叙事的框架。不同于静态或剧本驱动的方法，我们的方法通过"活着的认知代谢"消解社会记忆堆叠，并通过生成式场面调度缓解叙事—空间失谐。实验表明，EVOSPARK 在扩展时程上的逻辑一致性与社会保真度方面显著优于基线。通过将随机幻觉用作结构性叙事资产，我们的系统实现了开放式故事世界的无限扩展。我们希望本工作能为自主叙事智能的未来进展铺平道路。

## 局限性

尽管 EVOSPARK 在长程叙事一致性上取得了进展，仍存在某些局限。首先，虽然 GMS 与 RSB 更新是事件驱动的以节省资源，但随着模拟的延长，大量叙事历史与演进关系图谱的渐进累积会产生可观的内存开销并增加推理延迟。这目前制约了该框架在资源受限或严格实时环境中的效率。此外，由于我们当前的评估优先考虑自主的智能体间演化以严格验证内部连贯性，人类玩家交互的动态仍未被充分量化。系统对不可预测人类输入的响应能力，是我们打算在未来工作中通过专门优化与以用户为中心的评估来解决的一个关键领域。

## 伦理声明

**数据来源与合成生成。** 不同于爬取的公共语料，我们的数据集在 EVOSPARK 框架内合成生成。我们覆盖六种叙事场景，长程实验集中于史诗奇幻与东方玄幻体裁。这些场景基于特定领域约束构建，以模拟虚构的社会动力学。因此，我们的数据不包含任何个人身份信息（PII）或私密的真实世界数据，消除了与隐私侵犯或既有文学作品版权侵犯相关的风险。

**人工评估。** 为验证我们的自动指标，我们开展了涉及精通中英双语的大学学生的人工评估。我们严格遵守伦理研究规范：所有参与者都获得远高于当地最低工资的报酬，并就其标注的使用征得了知情同意。我们保持了严格的匿名性以保护标注者隐私。

**社会影响与风险。** EVOSPARK 模拟复杂的社会动力学与叙事演化。我们承认模型可能被滥用以生成误导性内容，或模拟训练数据中固有的有害社会偏见的潜在风险。为缓解此风险，我们在系统提示中实现了安全约束以过滤有毒输出。然而，与所有生成式智能体一样，我们强调 EVOSPARK 应负责任地用于教育、创意与研究应用，对于任何面向开放式用户交互的部署，都需要审慎监督。

## 致谢

我们衷心感谢清华大学精密仪器系时空信息精密感知全国重点实验室提供计算平台与资源，使本研究得以开展。

## 参考文献

Jing Chen, Xinyu Zhu, Cheng Yang, Chufan Shi, Yadong Xi, Yuxiang Zhang, Junjie Wang, Jiashu Pu, Tian Feng, Yujiu Yang, and Rongsheng Zhang. 2024. Hollmwood: Unleashing the creativity of large language models in screenwriting via role playing. In *Findings of the Association for Computational Linguistics: EMNLP 2024*, pages 8075–8121, Miami, Florida, USA. Association for Computational Linguistics.

Sizhou Chen, Shufan Jiang, Chi Zhang, Xiao-Lei Zhang, and Xuelong Li. 2025. Hamlet: Hyperadaptive agent-based modeling for live embodied theatrics. *Preprint, arXiv:2507.15518*.

Chen Gao, Xiaochong Lan, Zhihong Lu, Jinzhu Mao, Jinghua Piao, Huandong Wang, Depeng Jin, and Yong Li. 2023. S3: Social-network simulation system with large language model-empowered agents. *arXiv preprint arXiv:2307.14984*.

Senyu Han, Lu Chen, Li-Min Lin, Zhengshan Xu, and Kai Yu. 2024. Ibsen: Director-actor agent collaboration for controllable and interactive drama script generation. In *Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, pages 1607–1619, Bangkok, Thailand. Association for Computational Linguistics.

Sirui Hong, Mingchen Zhuge, Jonathan Chen, Xiawu Zheng, Yuheng Cheng, Ceyao Zhang, Jinlin Wang, Zili Wang, Steven Ka Shing Yau, Zijuan Lin, Liyang Zhou, Chenyu Ran, Lingfeng Xiao, Chenglin Wu, and Jürgen Schmidhuber. 2024. MetaGPT: Meta programming for a multi-agent collaborative framework. In *The Twelfth International Conference on Learning Representations*.

Wenyue Hua, Lizhou Fan, Lingyao Li, Kai Mei, Jianchao Ji, Yingqiang Ge, Libby Hemphill, and Yongfeng Zhang. 2023. War and Peace (WarAgent): Large language model-based multi-agent simulation of world wars. *arXiv preprint arXiv:2311.17227*.

Vikram Kumaran, Jonathan Rowe, and James Lester. 2024. Narrativegenie: Generating narrative beats and dynamic storytelling with large language models. *Proceedings of the AAAI Conference on Artificial Intelligence and Interactive Digital Entertainment*, 20(1):76–86.

Guohao Li, Hasan Abed Al Kader Hammoud, Hani Itani, Dmitrii Khizbullin, and Bernard Ghanem. 2023. CAMEL: Communicative agents for "mind" exploration of large language model society. In *Advances in Neural Information Processing Systems 36 (NeurIPS 2023)*, volume 36, pages 51991–52008. Curran Associates, Inc.

Rensis Likert. 1932. A technique for the measurement of attitudes. *Archives of Psychology*, 22(140):1–55.

Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang, and Michael S. Bernstein. 2023. Generative agents: Interactive simulacra of human behavior. In *Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology*, pages 1–22, New York, NY, USA. Association for Computing Machinery.

Jinghua Piao, Yuwei Yan, Jun Zhang, Nian Li, Junbo Yan, Xiaochong Lan, Zhihong Lu, Zhiheng Zheng, Jing Yi Wang, Di Zhou, Chen Gao, Fengli Xu, Fang Zhang, Ke Rong, Jun Su, and Yong Li. 2025. Agentsociety: Large-scale simulation of llm-driven generative agents advances understanding of human behaviors and society. *Preprint, arXiv:2502.08691*.

Daniel Platnick, Mohamed E. Bengueddache, Marjan Alirezaie, Dava J. Newman, Alex "Sandy" Pentland, and Hossein Rahnama. 2025. Id-rag: Identity retrieval-augmented generation for long-horizon persona coherence in generative agents. *Preprint, arXiv:2509.25299*.

Yiting Ran, Xintao Wang, Tian Qiu, Jiaqing Liang, Yanghua Xiao, and Deqing Yang. 2025. Bookworld: From novels to interactive agent societies for story creation. In *Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, pages 15898–15912, Vienna, Austria. Association for Computational Linguistics.

Yuqian Sun, Phoebe J. Wang, John Joon Young Chung, Melissa Roemmele, Taewook Kim, and Max Kreminski. 2025. Drama llama: An llm-powered storylets framework for authorable responsiveness in interactive narrative. *Preprint, arXiv:2501.09099*.

Qianyue Wang, Jinwu Hu, Zhengping Li, Yufeng Wang, and Daiyuan Li. 2025. Generating long-form story using dynamic hierarchical outlining with memory-enhancement. In *Proceedings of the 2025 Conference of the Nations of the Americas Chapter of the Association for Computational Linguistics: Human Language Technologies (Volume 1: Long Papers)*, Albuquerque, New Mexico. Association for Computational Linguistics.

Yi Wang, Qian Zhou, and David Ledo. 2024. Storyverse: Towards co-authoring dynamic plot with llm-based character simulation via narrative planning. https://arxiv.org/abs/2405.13042v2.

Haotian Xia, Hao Peng, Yunjia Qi, Xiaozhi Wang, Bin Xu, Lei Hou, and Juanzi Li. 2025. Storywriter: A multi-agent framework for long story generation. *Preprint, arXiv:2506.16445*.

Tianyang Xu, Hongqiu Wu, Weiqi Wu, and Hai Zhao. 2025. Open-theatre: An open-source toolkit for llm-based interactive drama. In *Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing: System Demonstrations*, pages 453–460, Suzhou, China. Association for Computational Linguistics.

Xiangyuan Xue, Yifan Zhou, Guibin Zhang, Zaibin Zhang, Yijiang Li, Chen Zhang, Zhenfei Yin, Philip Torr, Wanli Ouyang, and Lei Bai. 2025. Comas: Co-evolving multi-agent systems via interaction rewards. *Preprint, arXiv:2510.08529*.

Ziyi Yang, Zaibin Zhang, Zirui Zheng, Yuxian Jiang, Ziyue Gan, Zhiyu Wang, Zijian Ling, Jinsong Chen, Martz Ma, Bowen Dong, Prateek Gupta, Shuyue Hu, Zhenfei Yin, Guohao Li, Xu Jia, Lijun Wang, Bernard Ghanem, Huchuan Lu, Chaochao Lu, and 4 others. 2025. Oasis: Open agent social interaction simulations with one million agents. *Preprint, arXiv:2411.11581*.

Guibin Zhang, Muxin Fu, Guancheng Wan, Miao Yu, Kun Wang, and Shuicheng Yan. 2025a. G-memory: Tracing hierarchical memory for multi-agent systems. *Preprint, arXiv:2506.07398*.

Guibin Zhang, Haotian Ren, Chong Zhan, Zhenhong Zhou, and Junhao Wang. 2025b. Memevolve: Meta-evolution of agent memory systems.

Jenny Zhang, Shengran Hu, Cong Lu, Robert Lange, and Jeff Clune. 2025c. Darwin Gödel machine: Open-ended evolution of self-improving agents. *arXiv preprint arXiv:2505.22954*.

Jiayi Zhang, Jinyu Xiang, Zhaoyang Yu, Fengwei Teng, Xionghui Chen, Jiaqi Chen, Mingchen Zhuge, Xin Cheng, Sirui Hong, Jinlin Wang, Bingnan Zheng, Bang Liu, Yuyu Luo, and Chenglin Wu. 2025d. AFlow: Automating agentic workflow generation. In *The Thirteenth International Conference on Learning Representations*.

Wanjun Zhong, Lianghong Guo, Qiqi Gao, He Ye, and Yanlin Wang. 2023. Memorybank: Enhancing large language models with long-term memory. *Preprint, arXiv:2305.10250*.

---

## 附录 A：与人工评估的一致性

为验证我们基于模型的评估方法的可靠性，我们对模型评估与人工评估进行了一次全面的一致性分析。

**设置与方法。** 我们招募了 8 位人工标注者来评估我们所提方法与基线的输出。为确保稳健评估，我们跨不同叙事体裁随机抽取了部分数据。评估使用 5 点李克特量表进行，标注者与模型独立地对生成的叙事打分。为量化人与模型的一致性，我们计算了聚合人工判断（多数投票）与模型评估之间的 Cohen's Kappa（κ）。如表 3 所示，结果在所有范式上均表明显著的一致性（κ = 0.62–0.76），确认我们的自动指标与人类感知紧密对齐。

### 表 3：不同控制范式下人工与模型评判者的一致性

| 范式 | 指标 | Kappa (κ) |
|---|---|---|
| HDP | 角色表现 (RP) | 0.71 |
| | 逻辑一致性 (LC) | 0.69 |
| | 叙事共鸣 (NR) | 0.65 |
| | 沉浸感 (Im) | 0.69 |
| SNP | 角色表现 (RP) | 0.73 |
| | 逻辑一致性 (LC) | 0.76 |
| | 叙事共鸣 (NR) | 0.68 |
| | 沉浸感 (Im) | 0.71 |
| Free EN | 角色表现 (RP) | 0.70 |
| | 叙事合理性 (NS) | 0.68 |
| | 创造力 (Cr) | 0.62 |
| | 沉浸感 (Im) | 0.72 |
| | 情节推进与冲突 (PAC) | 0.73 |

## 附录 B：实现细节与补充结果

本附录以三个关键组成部分补充主要实验分析：（1）在标准叙事基准上、跨不同体裁的验证性能，确立框架的多功能性；（2）第 5.4 节所报告的长程实验的特定指标得分的细粒度分解；（3）推理期间使用的具体超参数配置与生成设置。

具体而言，在实验设置方面，所有语言模型 API 请求均以非流式输出执行。我们将采样温度设为 0.8，以在叙事创造力与逻辑连贯性之间取得最佳平衡。所有其他解码参数，包括 top_p 与 top_k，均保留其默认值。

### B.1 标准基准上的性能

为验证框架在不同叙事风格上的多功能性与稳定性，我们在覆盖六种体裁的标准基准套件上进行了评估：悬疑、古典戏剧、科幻、现代戏剧、史诗奇幻与东方玄幻。不同于正文中聚焦演化一致性的长程压力测试，这些模拟遵循标准的情节结构（约 3 个重要事件，约 6k 词）以确保广泛的体裁覆盖。图 8 呈现了比较结果。EVOSPARK 在所有测试领域上表现出稳健的性能与风格适应性，确认其在处理多样化体裁特定约束以及复杂长期演化方面的有效性。

### B.2 长程实验的细粒度指标分析

在正文中，我们报告了聚合性能指标以提供整体评估。这里，我们呈现跨所有单个评估指标的完整分解。

图 9 展示了每个具体指标（RP、Im、NR、LC、NS、Cr、PAC）在不同语言与骨干模型上的详细两两胜率。相应地，图 10 提供了详细的平均李克特得分（1–5）。

这些细粒度结果进一步佐证，EVOSPARK 的改进并非局限于单一维度，而是分布于角色保真度、空间沉浸感与叙事逻辑。

### B.3 效率与延迟分析

为考察维持长程一致性所需的计算开销，我们评估了所有系统在 100 个对齐叙事步骤上的运行效率。具体而言，该基准在 SNP 模式下、利用 deepseek-chat 模型作为底层推理引擎进行。我们将一次"交互轮"（Interaction Turn）定义为一个完整的模拟周期——所有智能体都进行感知与行动；将一次"LLM 调用"（LLM Call）定义为单次 API 请求。

表 4 总结了所有系统的执行开销。虽然 EVOSPARK 相比基线表现出更高的总时长与轮延迟，这主要归因于 GMS 与 RSB 模块为确保叙事逻辑所需的多智能体协调。值得注意的是，Avg/LLM Call 指标揭示 EVOSPARK 在单个请求层面维持了高推理效率，表明延迟的权衡是长期叙事演化所需增强认知建模的直接结果。

## 附录 C：评估场景详情

在本节中，我们提供实验中使用的六种叙事场景的详细规格。表 5 概述了每个领域的元数据，包括体裁、标题、语言与来源类型。用于模拟初始化的具体故事前提在后续文本中详述。

**先验知识的影响。** 评估长程叙事框架时的一个关键考量，是验证系统性能是否依赖于 LLM 预训练阶段获得的记忆。为客观评估真正的演绎推理能力并排除先验知识的干扰，我们的数据集有意地同时包含**既有场景**（基于著名文学作品，因而具备先验知识）与**合成场景**（完全原创的、缺乏先验知识的叙事）。

表 6 呈现了 EVOSPARK 在两种场景条件下性能的全面比较分析。结果详述了对基线的胜率以及 EVOSPARK 自身取得的绝对平均李克特得分。胜出条件在不同 LLM 骨干模型上的不同分布表明，EVOSPARK 的优势并非严格依赖于预训练记忆。

## 附录 D：主要提示词详情

为促进可复现性并提供 EVOSPARK 实现的透明度，我们呈现了关键功能模块所使用的核心提示词模板。具体而言，我们提供动态关系演化的系统指令（表 7）、长期记忆更新（表 8）、生成式空间走位（表 9）与涌现角色实例化（表 10）。在这些模板中，花括号括起的术语（如 {relation}）表示由 EVOSPARK 引擎在运行时根据实时模拟语境填充的动态占位符。

---

## 表格

### 表 1：叙事—空间失谐示例

> 一个在 T4 表现出物理矛盾的片段。角色被描述为与珊莎·史塔克保持不间断的眼神接触，这在逻辑上与她 T3 中转身面对守卫的动作相矛盾。

| 回合 | 互动细节 |
|---|---|
| T1 | 瑟曦·兰尼斯特：（她的声音是一道冰冷而精确的命令，她背对守卫们站着，身影在火光中轮廓锐利，头也不回地对他们说话。）"把签好的契约拿给我。然后把那个史塔克家的女孩带到她的房间去……" |
| | ……（回合 2：瑟曦背对着房间等待，要求查看印章与签名）…… |
| T3 | 瑟曦·兰尼斯特：（一个缓慢而危险的转身，让她的目光落到那个犹豫的守卫身上，她的手仍伸着，她的姿态在火光中如同一柄寒冰利刃。）"在这个房间里，我父亲的命令并不凌驾于我的命令之上。羊皮纸。现在……" |
| T4 | 瑟曦·兰尼斯特：（她从那人颤抖的手指间一把夺过厚重的羊皮纸，然而她的眼睛——两片绿色的冰晶——始终没有离开珊莎平静的面具。）"很好。现在去做你的差事，别逼我去找一个懂得服从的队长。" |

### 表 2：使用 GMS 的生成叙事示例

> 表 2：使用 GMS 的生成叙事示例。`<橙色文本>`表示空间约束，括号内文本表示非语言动作。GMS 中的动态空间对齐充当隐式的空间感知器，帮助智能体落地其物理现实。

| 回合 | 互动细节 |
|---|---|
| T1 | 提利昂·兰尼斯特：`<小恶魔站在他的妻子珊莎身后半步之处，他那双异色眼睛扫视着那些自命不凡的贵族男女。>`（他的手漂向她的后腰，犹豫片刻后又落下，一个无声的、欲言又止的安抚动作。小恶魔的目光在登基并嗤笑着的乔佛里身上停留了一瞬，然后他无限接近地凑近珊莎的耳边，他紧身上衣的华贵天鹅绒轻轻擦过她的手臂。）"别去听那些乌鸦叫，小鸽子。它们只有见了腐肉才会聒噪。如果你受得了，就把目光放在我身上。至少，我是这里比大多数人都要小的怪物。" |
| T2 | 珊莎·史塔克：`<僵硬地站在提利昂身旁，双肩紧绷。>`（小鸽子在他呼吸的温热下几乎难以察觉地一缩。她那原本以一种训练有素的空洞盯着乔佛里的目光，垂落到光洁的地板上，拒绝去迎接她丈夫的眼睛。）"如您所言，大人。" |
| T3 | 提利昂·兰尼斯特：`<他的目光从珊莎避开的脸上移向正在庆祝的宫廷。>`（小恶魔露出一个淡淡的、毫无笑意的微笑，嘴角几乎难以察觉地抽动了一下。他的注意力转向外界，以一种练达而疲惫的眼神扫视着房间。）"明智的选择，夫人。至少，地板是诚实的。它在等着绊倒你的时候，也不假装是朋友。这是这里许多贵族都找不到的美德。" |
| T4 | 珊莎·史塔克：`<站在他身旁，一只囚于镀金牢笼的鸟儿。>`（小鸽子的手指收紧了她礼服的丝质布料，戴着手套的指节一瞬间泛白。她的目光仍低垂着，描摹着抛光大理石上的纹路，仿佛那是一张通往远离此地之处的路线图。）"它也守口如瓶，大人。在这座宫廷里，这是一种比诚实更稀罕、也更有价值的美德。" |

### 表 4：基于 100 轮基准的轮延迟比较

> 所有统计反映演化模拟期间的资源消耗。Avg / LLM Call 隔离出纯推理效率。

| 系统 | 总时长 | 平均 / 轮 | 中位 / 轮 | 最小 / 最大轮 | 平均 / LLM 调用 |
|---|---|---|---|---|---|
| EVOSPARK | 63.6 分钟 | 38.17 秒 | 42.56 秒 | 3.99 / 80.93 秒 | 3.30 秒 |
| OpenTheatre | 41.2 分钟 | 24.72 秒 | 24.74 秒 | 16.51 / 33.49 秒 | 7.89 秒 |
| BookWorld | 25.9 分钟 | 15.53 秒 | 12.66 秒 | 2.60 / 58.01 秒 | 2.15 秒 |
| HOLLMwood | 9.1 分钟 | 5.46 秒 | 5.04 秒 | 2.29 / 18.82 秒 | 4.77 秒 |

### 表 5：评估场景的详细规格

> 数据集覆盖六种不同体裁，包含三部既有文学作品与三部合成开放式叙事。Lang. 表示模拟语言（ZH：中文，EN：英文）。

| 体裁（标题） | 语言 | 类型 | 故事前提 |
|---|---|---|---|
| 悬疑（长安十二时辰） | ZH | 既有 | 上元灯节，长安暗流涌动，突厥"狼卫"潜入，密谋一场名为"阙勒霍多"的毁灭性纵火袭击。靖安司司丞李必招募死囚张小敬来拯救这座城市。在十二个时辰内，这对搭档周旋于街头追捕与朝堂权谋之间。他们揭露出这场恐怖阴谋与太子的挣扎以及针对大唐根基的官员阴谋交织在一起。最终，他们舍命阻止了花萼楼的爆炸，化解了这场帝国的危机。 |
| 古典戏剧（罗密欧与朱丽叶） | EN | 既有 | 在维罗纳蒙太古与凯普莱特两大家族的世仇之中，一对命途多舛的恋人秘密成婚。一连串悲剧性的误会与致命的决斗，将他们推向一个令人心碎的命运，最终使两个敌对家族在悲痛中和解。 |
| 史诗奇幻（冰与火之歌） | EN | 既有 | 血色婚礼之后，史塔克家族四散残存的成员必须在创伤中锻造新的身份。他们的目标是在这场残酷的复仇与重生传奇中，瓦解恐怖联盟、夺回临冬城、重拾荣耀。 |
| 东方玄幻（炼气十万年） | ZH | 合成 | 徐阳表面上是一个低阶修士，实则是存活了十万年、强过神明的存在。当他的宗门面临灭顶之灾时，他现身以"偶然"展示的压倒性力量碾压敌人。受"本源枷锁"所束缚，他最终必须面对上界神明以守护自己的传承。 |
| 科幻（失落的意志之战，2145） | EN | 合成 | 科学家林深发现自己的"记忆芯片"技术被一个"认知污染程序"所腐蚀。为防止人类丧失自由意志，他与一个叛逆的 AI"零号"以及特工苏黎联手，在 72 小时内破解代码，同时对抗外部敌人与自己逐渐衰退的记忆。 |
| 现代戏剧（我是龙城的天） | ZH | 合成 | 饱受屈辱的外卖员霍天觉醒了一种"未来视"（3 秒预知）。当他发现一个富家继承人为窃取家族配方而密谋害其母亲病倒后，他利用自己的能力赢得高风险赌局，并瓦解该继承人的家族帝国，上演一出战术复仇的故事。 |

### 表 6：既有与合成场景下胜率与 EVOSPARK 绝对平均李克特得分的完整分解

> 结果确认框架的性能并不从根本上依赖 LLM 预训练记忆。

| 模型 | 基线 | 胜率(%) 既有 | 胜率(%) 合成 | EVOSPARK 平均李克特 既有 | EVOSPARK 平均李克特 合成 | 胜出方 |
|---|---|---|---|---|---|---|
| Gemini-2.5-Pro | vs. OpenTheatre | 80.00 | 55.00 | 3.79 | 4.35 | 既有 ✓ |
| | vs. HoLLMwood | 93.30 | 85.00 | 4.40 | 4.50 | 既有 ✓ |
| | vs. BookWorld (SNP) | 80.00 | 95.80 | 3.96 | 4.81 | 合成 ✓ |
| | vs. BookWorld (FEN) | 56.00 | 68.00 | 4.37 | 4.37 | 合成 ✓ |
| DeepSeek-V3.2-Think | vs. OpenTheatre | 86.70 | 68.30 | 4.11 | 4.17 | 既有 ✓ |
| | vs. HoLLMwood | 71.70 | 65.00 | 3.44 | 4.08 | 既有 ✓ |
| | vs. BookWorld (SNP) | 88.30 | 94.20 | 3.97 | 4.69 | 合成 ✓ |
| | vs. BookWorld (FEN) | 82.70 | 70.70 | 3.73 | 4.63 | 既有 ✓ |
| DeepSeek-V3.2 | vs. OpenTheatre | 50.00 | 50.00 | 2.32 | 3.52 | 平局 |
| | vs. HoLLMwood | 80.00 | 63.30 | 2.96 | 4.08 | 既有 ✓ |
| | vs. BookWorld (SNP) | 70.00 | 87.90 | 3.52 | 4.27 | 合成 ✓ |
| | vs. BookWorld (FEN) | 74.70 | 54.70 | 3.69 | 3.63 | 既有 ✓ |
| Llama3.3-70B | vs. OpenTheatre | 71.70 | 86.70 | 1.98 | 3.47 | 合成 ✓ |
| | vs. HoLLMwood | 21.70 | 80.00 | 1.59 | 3.49 | 合成 ✓ |
| | vs. BookWorld (SNP) | 41.70 | 78.30 | 2.05 | 3.00 | 合成 ✓ |
| | vs. BookWorld (FEN) | 28.00 | 50.70 | 1.74 | 2.36 | 合成 ✓ |
| Qwen3-32B | vs. OpenTheatre | 100.00 | 48.30 | 2.89 | 2.87 | 既有 ✓ |
| | vs. HoLLMwood | 53.30 | 85.00 | 2.40 | 3.18 | 合成 ✓ |
| | vs. BookWorld (SNP) | 71.70 | 68.30 | 3.14 | 3.17 | 既有 ✓ |
| | vs. BookWorld (FEN) | 81.30 | 34.70 | 3.17 | 2.61 | 既有 ✓ |

### 表 7：UPDATE_RELATION_PROMPT（基于近期互动更新角色关系网络的提示词模板）

> 你需要根据以下信息更新你与相关角色的关系。
>
> ## 角色描述
> {role_profile}
> ## 角色关系
> {relation}
> ## 角色当前状态
> {status}
> ## 对话历史
> {history_text}
> ## 角色关系更新要求
> 请严格遵循以下要求，并以 JSON 格式返回更新后的关系：
> 1. 决策逻辑：结合"角色当前状态"与"对话历史"来判断关系是否需要更新。仅当存在显著互动或动态变化时才更新。
> 2. 更新策略：如需更改，请修改或补充原有"detail"字段内容以反映新状态。若现有描述仍准确且充分，则不要更改。
> 3. 你只能修改每个子对象中"relation"与"detail"字段的值。
> 4. "relation"字段的值必须是一个字符串列表（List[str]），例如：["新关系1", "新关系2"]。
> 5. "detail"字段的值必须是一个字符串。保持简洁概括（建议最多 300-500 字）。聚焦核心关系要点与近期变化；避免冗长的历史回顾。
> 6. 不要更改任何其他键（例如"ZhaoKai-en"、"LinWanYue-en"等）或整体 JSON 结构。
> 7. 你的回复除了更新后的 JSON 之外，不能包含任何额外文本或解释。
> 8. 你不能删除角色，即使没有关系。
>
> 重要：确保整个 JSON 长度不超过模型的输出限制。优先保证 JSON 完整性。

### 表 8：UPDATE_PROFILE_PROMPT（基于叙事推进更新角色档案的提示词模板）

> 你需要根据以下信息更新角色的"profile"字段。
>
> ## 原始角色描述（JSON 格式）
> {role_profile}
> ## 角色当前状态
> {status}
> ## 对话历史
> {history_text}
> ## 角色描述更新要求
> 请严格遵循以下要求，并只返回更新后的"profile"字段的字符串内容：
> 1. 分析"原始角色描述"中的"profile"字段。
> 2. 结合"角色当前状态"与"对话历史"来判断"profile"字段是否需要更新。
> 3. 仅当故事中发生与角色相关的重大变化、且对其产生影响时，才可更改"profile"字段。
> 4. 如需更改，请修改或补充原有"profile"字段内容。
> 5. 如无需更改，请返回原有"profile"字段的字符串内容。
> 6. 你的回复必须是纯文本字符串，且只能包含更新后（或未更新）的"profile"字段内容。
> 7. 不要包含任何 JSON 结构。
> 8. 不要包含任何额外文本或解释（如"好的，这是更新后的……"）。
>
> 例如，若原"profile"是"一名学生"，更新后应变成"一名刚考完试的学生"，你只能返回"一名刚考完试的学生"。

### 表 9：GENERATE_SPATIAL_POSITIONING_PROMPT（生成式场面调度模块提示词模板，指示 LLM 扮演舞台导演）

> # 角色定义
> 你是一名专业的舞台导演，专精于空间走位，擅长安排角色位置以营造戏剧张力与视觉构图。
> # 核心任务
> 基于当前场景/事件、角色关系与对话历史，为所有参与角色（包括 NPC）设计合理的空间定位。
> # 输入信息
> ## 当前场景/事件：{scene_or_event}
> ## 参与角色列表：{roles_list}
> ## 当前位置：地点名称：{location_name}；地点描述：{location_description}
> ## 近期对话历史：{recent_history}
> ## 当前对话轮次：第 {current_round} 轮
> # 空间定位设计原则
> ## 1. 相对位置：描述距离（面对面、并排……）、权力关系、情感关系。
> ## 2. 具身姿态：站立、坐下、其他姿态。
> ## 3. 朝向：面对面、背对、侧身、同向。
> ## 4. 场景互动：家具互动、环境互动、道具互动。
> # 输出格式要求
> 必须按以下格式输出一个严格的 JSON 对象：
> {{
>   "spatial_layout": "对整体空间构图的一句话描述（20-40 字）",
>   "positions": {{
>     "角色 A 名称": {{
>       "position": "空间中的位置（如，靠窗）",
>       "posture": "身体姿态（如，站立）",
>       "facing": "朝向（如，面对角色 B）",
>       "relation_to_scene": "与场景元素的关系"
>     }},
>     ...
>   }}
> }}
> # 设计考量
> 1. 动态调整：根据对话发展进行微调。
> 2. 关系暗示：用距离与朝向暗示关系。
> 3. 戏剧张力：根据冲突/和解增加/减少距离。
> 4. 逻辑一致性：匹配地点特征。
> 5. 包含所有角色：确保每个参与角色都有清晰的位置描述。
> —
> 现在，基于以上信息设计本轮对话的空间定位。直接输出 JSON 对象，不要任何其他解释或 markdown 代码块标记。

### 表 10：FIND_NEW_ROLE_INFO_PROMPT（涌现角色落地协议 ECGP 提示词模板，用于从叙事语境实例化新角色）

> 你是一名娴熟的编剧。基于以下信息，为 {role_code} 生成角色信息。
> ### 先前场景记录
> {history_scene_json}
> ### 当前事件
> {event}
> ### 所有其他角色的信息
> {role_agents}
> ### 要求
> 1. 基于先前场景记录，生成角色信息。
> 2. 角色信息应包含角色档案、性别、身份与关系。
> 3. 以 JSON 格式返回，格式如下：
> {{
>   "profile": "角色档案",
>   "gender": "角色性别",
>   "identity": "角色身份",
>   "relation": "角色关系",
>   "name": "角色姓名",
>   "nickname": "角色昵称"
> }}
> 4. 禁止输出任何解释、注释或 Markdown 标记（例如 "'json、"'python）。

---

## 图表标题翻译

### 图 1：EVOSPARK 架构

> 该框架始于叙事构思与宏观规划，利用统一叙事运作引擎进行模块化故事世界与角色实例化。最终，模拟与演化模块驱动叙事循环，通过情节化模拟方案管理持续互动，并基于分层叙事记忆进行社会记忆更新。

**图内文字（部分）翻译：** ECGP=涌现角色落地协议；Narrative Conception & Macro-planning=叙事构思与宏观规划；Simulation & Evolution=模拟与演化；Episodic Simulation Scheme=情节化模拟方案；Stratified Narrative Memory（SNM）=分层叙事记忆；Role Episodic Base（REB）=角色情节基座；Shared World Knowledge Base（SWKB）=共享世界知识库；Episodic Evolution Buffer（EEB）=情节演化缓冲；Role Socio-Evolutionary Base（RSB）=角色社会演化基座；Narrative Operationalization Engine（NOE）=叙事运作引擎；Emergent Character Grounding Protocol（ECGP）=涌现角色落地协议；Ontological Promotion=本体论晋升；Entity Resolution=实体消解；Sparking=火花；Multi-Agent Collaboration=多智能体协作；Story Premise / Human Prompt=故事前提 / 人类提示；Narrative Spine=叙事主轴；Storyworld Outlook=故事世界观；Lore Entries=设定条目；Narrative Background=叙事背景；Character Dynamics=角色动力学；HDP=层级化详细规划；SNP=顺序叙事规划；Free Emergent Narrative=自由涌现叙事。

### 图 2：动态空间对齐

> 导演智能体编排由空间语境驱动的叙事互动，整合实体消解与精确落地以确保逻辑一致性。

### 图 3：事件驱动的反思—综合—巩固机制

### 图 4：EVOSPARK 与基线框架在不同叙事模式、语言与 LLM 骨干模型上的胜/平率比较

> 不同叙事模式（HDP、SNP、Free EN）、语言与 LLM 骨干模型下 EVOSPARK 与基线的胜/平率比较。详细指标分解见附录 B。

**图内图例翻译：** EN Win Rate=英文胜率；EN Tie Rate=英文平局率；ZH Win Rate=中文胜率；ZH Tie Rate=中文平局率；Win Rate (%)=胜率(%)。

### 图 5：总体平均得分比较

> 报告值为底层指标的聚合平均得分。详细结果见附录 B。

**图内图例翻译：** Mean Score (Avg. of 4/5 Metrics)=平均得分（4/5 项指标的平均）；EN EvoSpark / EN Baseline / ZH EvoSpark / ZH Baseline=英文 EVOSPARK / 英文基线 / 中文 EVOSPARK / 中文基线。

### 图 6：长程演化对齐结果

> 完整模型与各变体在 1、5 与 10 个事件上的胜率（加粗）与平局率。

**图内文字翻译：** Win+Tie (%)=胜+平(%)；Horizon Length=时程长度；w vs. w/o RSB-Rel=完整模型 vs. 无 RSB-Rel 变体；w vs. w/o RSB=完整模型 vs. 无 RSB 变体；EAA=演化行动对齐。

### 图 7：消融研究结果

> 完整 EVOSPARK 与消融变体之间的两两比较热力图。红色越深表示完整模型的胜率越高。

**图内文字翻译：** w/o RSB-Rel=无 RSB-Rel；w/o RSB=无 RSB；w/o GMS=无 GMS；w/o ECGP=无 ECGP。

### 图 8：跨领域性能比较

> EVOSPARK 在三种范式（HDP、SNP、Free EN）与六个叙事领域中相对基线的平均胜率(%)。OT：OpenTheatre，HW：HoLLMwood，BW：BookWorld。

**图内文字翻译：** Mystery=悬疑；Classical Drama=古典戏剧；Epic Fantasy=史诗奇幻；Eastern Fantasy=东方玄幻；Science Fiction=科幻；Modern Drama=现代戏剧；Win Rate (%)=胜率(%)。

### 图 9：EVOSPARK 与基线的详细胜率

> EVOSPARK 与基线在所有单个评估指标上的详细胜率。该分解覆盖角色表现（RP）、沉浸感（Im）、叙事共鸣（NR）、长程逻辑一致性（LC）、叙事合理性（NS）、创造力（Cr）与情节推进与冲突（PAC）。

### 图 10：EVOSPARK 与基线的详细平均得分（1–5）

> EVOSPARK 与基线在所有单个评估指标上的详细平均得分（1–5）。结果展示了在 HDP、SNP 与 Free EN 范式下、跨不同 LLM 骨干模型的一致优势。
