# DOC：通过详细大纲控制提升长故事连贯性

**Kevin Yang¹　Dan Klein¹　Nanyun Peng²　Yuandong Tian³**

¹ 加州大学伯克利分校（UC Berkeley），² 加州大学洛杉矶分校（UCLA），³ Meta AI

{yangk,klein}@berkeley.edu，violetpeng@cs.ucla.edu，yuandong@meta.com

## 摘要

我们提出了**详细大纲控制（Detailed Outline Control，DOC）**框架，用于在自动生成数千词长度的故事时提升长程情节连贯性。DOC 由两个互补的组件构成：**详细大纲生成器（detailed outliner）**与**详细控制器（detailed controller）**。详细大纲生成器会创建一份更详细、层级化的大纲，将创作负担从主体起草流程转移到规划阶段。详细控制器则通过控制故事段落使其与大纲细节对齐，确保在生成过程中这份更详细的大纲仍然被遵循。在对自动生成故事的人工评估中，DOC 在情节连贯性（绝对提升 22.5%）、大纲相关性（28.2%）以及趣味性（20.7%）上大幅超越了强基线 Re3（Yang et al., 2022）。在交互式生成场景中，人类也认为 DOC 的可控性要高得多。

## 1　引言

自然语言生成系统的最新进展，引发了人们对长篇文本生成日益增长的兴趣——在这类任务中，文本可能长达数千词甚至更多。与输出较短的任务相比，长篇生成涉及本质不同的挑战：维持整体的连贯性、甚至保持与初始前提或计划的基本相关性，都并非易事。即便是迄今最先进的语言模型，如 GPT-4（OpenAI, 2023），也仍将长上下文列为进一步改进的重要方向，并需要结构化规划才能生成超过几百词的文本。

在本工作中，我们聚焦于长篇故事生成，它集中体现了长文本生成的主要困难。直到最近，先前的工作才尝试生成与人类创作的“短篇小说”篇幅相当的故事（Re3，Yang et al. (2022)）。与人类相比，像 Re3 这样的最先进故事生成系统在诸多方面仍显不足：常见的失败模式包括高层次规划不足（导致局部流畅而全局不连贯），或即便存在规划也会偏离该规划。

为弥补这一差距，我们提出了**详细大纲控制（DOC）**框架。DOC 复用了 Re3 的“高层次规划—起草—修订”结构，同时通过两种互补的方法来提升长程情节连贯性。

首先，我们的**详细大纲生成器**将简短的初始大纲精炼为一份更详细、层级化的大纲（图 1 左）。其动机在于：人类作者在起草长文档之前，往往也会迭代地精炼和扩展一份简短的初始大纲，用大纲来引导连贯的情节，而非在创作过程中临时拼凑情节点。相应地，我们的详细大纲生成器采用一种结构化提示流程，创建一份详细大纲，其长度可根据期望的生成范围进行扩展。每个大纲条目都与场景设定和角色相关联，并在上下文中经过相关性、连贯性方面的仔细过滤。

其次，我们的**详细控制器**通过基于相应大纲条目来控制段落生成，从而保持对详细大纲的忠实度（图 1 右）。由于我们的详细大纲施加了许多相互重叠的软约束，详细控制器必须施加足够的控制强度来执行这些约束。详细控制器还必须能够适应灵活的自然语言输入，并且在使用最先进的大语言模型生成时保持计算效率。我们按照 FUDGE（Yang and Klein, 2021）将详细控制器实现为一个基于 OPT-350m 的控制器，并设计了一种对比训练流程，使摘要与段落前缀对齐。特别地，我们构造了流畅的**难负样本**，以促使较长的输出不仅在一开始切题，而且自始至终保持相关。

与先前的长故事生成最先进方法 Re3 相比，使用 DOC 在成对人工评估中取得了显著更高的情节连贯性（绝对提升 22.5%）、大纲相关性（28.2%），甚至趣味性（20.7%）（第 4 节）。我们的消融实验表明，详细大纲生成器和详细控制器都至关重要（第 5.1 节）。我们还证明 DOC 可以与人类协作生成故事，在高层规划阶段进行交互，而非像许多先前工作（Coenen et al., 2021; Lee et al., 2022）那样逐段交互，并且在这一场景下，DOC 以压倒性优势优于原始 Re3（第 4.1 节）。¹

> ¹ 所有代码与模型见 https://github.com/yangkevin2/doc-story-generation。

## 2　相关工作

尽管我们生成的故事比大多数先前工作（Wang and Wan, 2019; Yao et al., 2019; Qin et al., 2019; Xu et al., 2020; Wang et al., 2022）长一个数量级，下面我们重点介绍若干采用相关思想的工作。

**层级生成。** DOC 的一个关键组件是详细大纲生成器，它以层级方式生成大纲。长篇生成中的层级结构可以作为模型架构本身的一部分来实现（Yang et al., 2016; Miculicich et al., 2018; Guo et al., 2021），也可以体现为自然语言大纲或结构化模式（Fan et al., 2018; Yao et al., 2019; Goldfarb-Tarrant et al., 2020; Rashkin et al., 2020; Zhao et al., 2020; Narayan et al., 2021; Tian and Peng, 2022; Mirowski et al., 2022; Yang et al., 2022）。DOC 的详细大纲生成器同样构建自然语言大纲，但可以轻松提高细节层次，以匹配最终故事期望的规模。

**受控生成。** DOC 的第二个关键组件是详细控制器，它增强了对详细大纲的忠实度。先前的工作，如 Hu et al. (2019)，使用受限解码来保证基于规则的约束，而 Dathathri et al. (2019); Krause et al. (2020); Yang and Klein (2021) 则提出基于辅助模型的模块化控制方案，以针对某个期望属性进行控制。然而，这类方法通常无法处理自然语言指令。

相比之下，提示（prompting）（Brown et al., 2020; Zhong et al., 2021; Sanh et al., 2021; Wu et al., 2022; Kojima et al., 2022; Ouyang et al., 2022）提供了一种轻量、灵活的替代方案。然而，虽然提示是提供上下文的有效方式，但由于控制强度有限，提示可能不足以强制执行约束，而且其控制强度不像我们的详细控制器那样易于调节。

**人在回路的故事生成。** 一些先前的工作在人类参与的情况下生成较长的故事（Goldfarb-Tarrant et al., 2019; Coenen et al., 2021; Lee et al., 2022; Chung et al., 2022; Ippolito et al., 2022; Mirowski et al., 2022）。我们要强调，DOC 旨在无需人工干预地生成故事。尽管如此，由于是在自然语言空间中进行规划，DOC 原则上具有很高的人类可控性。与那些逐段与人类交互的方法（Coenen et al., 2021; Lee et al., 2022）不同，DOC 还可以在更高层的规划阶段进行交互，如第 4.1 节所探索的那样。

## 3　详细大纲控制

我们引入**详细大纲控制（DOC）**框架，旨在提升自动生成的长故事的长程情节连贯性。

### 3.1　背景与动机

我们工作的一个主要灵感来源是 Re3（Yang et al., 2022），它通过将写作过程分解为规划、起草、重写和编辑步骤，生成超过 2000 词的、情节连贯的长篇故事。其高层次计划包含场景设定、角色清单，以及简短的三个要点式大纲（例如图 1 中的“Outline”）。特别地，在起草每个后续故事段落时，它通过结构化提示注入来自高层次计划和先前已生成故事的相关上下文（图 2）。最后，它使用针对大纲相关性和段落连贯性的重排器对可能的续写进行重排，并编辑以保证一致性。DOC 沿用了 Yang et al. (2022) 提出的高层次写作流程和基于结构化提示的段落生成方式，不过我们移除了耗时的编辑步骤——他们发现该步骤对最终故事质量没有显著影响。

然而，Yang et al. (2022) 指出，尽管 Re3 大幅优于简单的滚动窗口基线，它在长程连贯性方面仍然频繁出错：有些故事仍包含似乎与周围上下文不符的长段落，或者严重偏离初始大纲。DOC 旨在通过两大创新来解决这些不足：通过详细大纲生成器进行更详细的规划，以及通过详细控制器在起草过程中进行相应更细粒度的控制。

**详细大纲生成器的动机。** 虽然 Re3 的大纲是合理的，但它们不够具体，并且无法扩展到更长的故事。人类作者不会仅凭三句话式的开头、中间和结尾就去写一部小说。更详细的大纲不仅在经验上能够带来更好的情节连贯性（第 4 节），而且还能在人类交互中实现更强的控制（第 4.1 节）。因此，DOC 构建了一份详细大纲（例如图 1 的“Detailed Outline”），其深度可根据最终故事期望的长度进行调整。详细大纲把创作负担从起草转移到规划上，减少了在起草过程中临时拼凑情节点的需要。

**详细控制器的动机。** 大纲中更高的细节程度使得保持对大纲的忠实变得更加困难。为了在起草过程中与 GPT3-175B 等大语言模型协作，像 Re3 这样的先前工作依赖巧妙的提示，配合拒绝采样或重排。然而，提示和重排方法能够对模型分布施加的控制强度是有限的，这对于 Re3 这类依赖结构化提示中复杂约束和长上下文的系统尤其成问题。事实上，Yang et al. (2022) 观察到，Re3 的许多故事已经遗漏了其简短的三要点式大纲中的部分内容——而 DOC 的大纲将施加远更详细的约束。因此，我们设计了 DOC 的详细控制器，以更强制地执行由大纲设定的复杂自然语言约束。我们的详细控制器是对 FUDGE（Yang and Klein, 2021）的一种改造，它将在整个生成过程中逐 token 地运作，而非仅仅依赖初始提示或事后拒绝采样。

**图 1：** DOC 的高层概览。我们的详细大纲生成器将简短的初始大纲扩展为更详细的大纲。随后，详细控制器在起草主体故事时保持对这份更详细大纲的忠实度。（图中左侧为一个从“1. Sue flies to Italy.”逐步细化为“a./i./ii.”等子条目的“Detailed Outline”，右侧为对应的“Generated Story”，中间用“Detailed Outliner”与“Detailed Controller”示意流程。）

### 3.2　详细大纲生成器

我们的详细大纲生成器以任意粒度递归地生成一份层级化的详细大纲。图 3 总结了各组成部分。

**广度优先扩展。** 将大纲视为一棵树 T，初始只有一个根节点 r，我们按照广度优先扩展的顺序生成子节点。从初始顶层大纲的条目（第 1 层）开始，先生成它们的所有子节点（第 2 层），再生成所有子节点的子节点（第 3 层），依此类推。对于每个父节点 p，我们逐个生成子节点，当某个子节点 c 的事件描述以文末 token 结尾时停止。如果子节点过少或过多，我们会针对给定 p 重启并重新采样，不过经验上该流程几乎总是产生两到三个子节点。我们在达到预设深度后终止大纲生成。

**图 3：** 详细大纲中新条目创建的示意图。我们的详细大纲生成器以广度优先顺序递归扩展大纲条目。为创建每个新条目，它先提出候选事件，再通过过滤与重排选出最佳者，然后检测场景设定和相关角色。

#### 3.2.1　事件候选生成

为了给新的子节点 c 生成可能的事件描述（图 3 左下），我们采用结构化提示方法。为保持与既有节点的一致性，提示中包含 c 的所有祖先节点的上下文，连同它们各自的子节点；这样我们提供的相关上下文长度随深度线性增长。后缀上下文通过 GPT3 插入 API（Insertion API），使用 InstructGPT3-175B（text-davinci-002）注入——那是我们实验当时最先进的 GPT 模型。示例提示见附录 B.1。

**过滤与重排。** 为每个 c 生成若干事件候选后，我们通过过滤与重排选出最佳者。具体来说，我们删除格式错误的候选，或与 c 的祖先节点之外的节点高度重复的候选²——这由词重叠和一个蕴含模型（Laurer et al., 2022）共同判定。对于每个父节点的第一个子节点，我们通过句子相似度（Reimers and Gurevych, 2019）选出与父节点最相关的剩余候选。对于其他子节点，为了避免重复并提升情节连贯性，我们通过一个**排序模型**来选择，该模型预测某个事件相对于邻近上下文是否出现在正确位置。排序模型通过微调 roberta-large（Liu et al., 2019）来训练，用于检测短小大纲式故事中顺序错乱的事件。过滤与重排流程的完整细节见附录 A。

> ² 不过，由于 c 是其祖先节点的子事件，重复祖先文本的部分内容是允许的。如果过滤后没有候选剩余，我们就把 p 接受为一个已经足够具体、无需进一步扩展的叶节点。

#### 3.2.2　场景与角色检测

我们进一步通过为每个大纲条目显式地表示场景设定和角色来增强大纲（图 3 右下），从而将额外的创作工作从起草转移到规划上。我们的场景与角色列表通过提示 InstructGPT3-175B 获得（附录 B.2）。角色会与一份类似于 Re3 的初始角色清单进行匹配，不过由于我们的大纲更详细，我们会生成更多角色。

#### 3.2.3　基于详细大纲的起草

在构建好详细大纲之后，故事起草大体沿用 Re3 的结构化提示流程，即注入来自计划和先前故事的上下文（图 2；附录 B.4）。然而，与 Re3 为每个顶层大纲条目生成固定长度段落不同，我们为树结构大纲 T 的每个叶节点生成变长段落（图 2 橙色文字），因为不同叶节点可能包含具体程度不同的事件。具体来说，我们复用 Re3 重写阶段的大纲相关性和文本连贯性重排器，来检测当前大纲条目的起草何时完成，基于分数阈值实现**提前停止（early stopping）**。我们还比 Re3 生成更少的 token 就重建结构化提示，以实现更细粒度的控制。

在提示中，我们额外高亮当前的场景设定（图 2 底部紫色文字），尤其是场景的切换。角色（图 2 顶部紫色文字）也从大纲中检索。相比之下，Re3 在起草过程中即时为每个段落选择相关角色，并且不跟踪场景设定信息，这可能导致故事场景发生意外的变化。

**角色随时间的成长。** 利用详细大纲，我们探索了一种简单的方法，让 DOC 感知角色随时间的成长——这是 Re3 难以处理的。具体来说，每当某角色出现在大纲中时，我们尝试为其推断一个新事实（附录 B.3），并过滤掉那些已被更早大纲条目所推断事实蕴含的事实。在起草与给定大纲条目对应的故事段落时，提示上下文中检索到的角色描述包含截至该大纲条目为止所推断出的所有事实（图 2 红色文字）。

### 3.3　详细控制器

接下来，我们的详细控制器增强生成器保持与详细大纲相关性的能力。我们将详细控制器实现为一个 FUDGE（Yang and Klein, 2021）控制器，根据给定的摘要来引导段落生成。不过，我们会修改 FUDGE 的训练流程，以改善在较长输出上的表现。

**轻量、可调强度、自然语言控制。** FUDGE 是一种轻量、模块化的控制方案，它在生成的每个 token 处，基于一个面向未来的、针对期望属性的判别器来增加 logits。可以通过放大所增加的 logits 来提高控制强度，但处理自然语言指令却并非易事。

我们对 FUDGE 进行改造，使其能够处理自然语言指令，以完成“根据简短描述引导段落生成”这一具体任务。我们通过提示 InstructGPT3-13B 对 WritingPrompts 数据集（Fan et al., 2018）中的故事段落进行摘要，收集了一个“段落—摘要”对数据集；这些摘要随后可被视为与原段落对应的大纲事件。我们通过微调 OPT-350m，对比式地训练 FUDGE 判别器，使其预测一个段落前缀是否与给定摘要匹配。特别地，我们通过将段落与同一故事中其他位置的摘要配对来构造难负样本。

其结果是得到一个计算上轻量的详细控制器，它可以根据简短的描述、以可调的控制强度引导段落生成。

**训练以保持相关性。** 在我们的训练数据中，段落对于给定摘要要么完全正确、要么完全错误——即使对于来自同一故事的“难”负样本也是如此——因此判别器在测试时学会对任何大致对齐的段落预测高概率。由此得到的控制器允许较长段落在开始时切题之后迅速跑题。

因此，我们构造更难训练的负样本。给定一个正“段落—摘要”对，我们在一个句子边界处将段落分割，并把该句子边界之后的文本替换为同一故事中另一段落的文本（从某个句子边界开始）。这样我们便得到语法上流畅但被破坏的段落：它们对于给定摘要开头正确，但最终跑题。训练时，可把这些段落在句子边界之后结束的前缀标记为负标签。于是我们的详细控制器学会了保持与输入描述的高度相关。使用同样的方法，我们还通过将负前缀与正补全混合来构造“更难正样本”，从而提升控制器在走偏时重回正轨的能力。

#### 3.3.1　基于详细控制的起草

在起草过程中，我们通过根据详细大纲施加的三类不同约束来控制段落，从而展示详细控制器的灵活性，具体如下：

1. **事件（Event）。** 我们将事件描述（图 2 橙色文字）逐字喂给控制器。
2. **场景（Setting）。** 如果场景相对于上一个大纲条目发生了变化，我们构造一个输入“摘要”，说明角色移动到新场景，使用比事件描述更低的控制强度。
3. **角色（Character）。** 如果出现了在上一个大纲条目中未出现的角色，我们构造一个输入“摘要”说明这一点，同样使用更低的控制强度。

**控制强度。** 在实践中，我们必须权衡控制强度：强度过低有偏离约束的风险，强度过高则可能导致生成内容过于狭窄、重复，牺牲创造性。我们旨在起草过程中动态地达成这种平衡：对每个大纲条目初始使用 0 的控制强度，随着每个后续起草步骤递增，直到满足转向下一个大纲条目的提前停止标准，再重置回 0。

**生成中的未来上下文。** 来自大纲未来部分的上下文可以帮助生成段落更好地过渡到后续故事事件。然而，在提示中包含未来情节点，有在缺乏适当控制时过早生成未来事件的风险——我们在尝试把这类上下文纳入 Re3 时就观察到了这一点。我们的详细控制器通过更强地控制向当前大纲条目靠拢，在一定程度上弥补了这一问题。因此，在为给定大纲条目起草时，我们在提示中把下一个大纲条目作为未来上下文纳入（图 2 绿色文字）。

**图 2：** 风格化示例，展示 Re3 与 DOC 中用于起草新故事段落的结构化提示的主要组成部分。利用我们的详细大纲和详细控制器，DOC 提示的新增元素包括：角色随时间的成长（红色）、基于大纲叶节点的更详细事件（橙色）、未来上下文（绿色），以及改进的场景与角色信息（紫色）。

## 4　评估

**实验设置。** 我们的设置与 Yang et al. (2022) 类似。输入只是一个简短的（英文）前提，通常 30–60 词，从 InstructGPT3-175B 采样得到。输出是一个完整的故事。我们不施加进一步的基于规则的约束，因为如何定义“一个故事”、更不用说“一个好故事”尚不清楚。相反，质量将通过人工标注的指标来判断。

**指标。** 为了降低噪声，我们比较与同一顶层大纲条目对应的 1000 至 1500 词的段落，而非完整故事。我们使用三个主要指标，与 Yang et al. (2022)（附录 C）类似，但经过调整以比较段落而非完整故事：

1. **连贯（Coherent）。** 被人类标注者判定为情节连贯的段落百分比。
2. **相关（Relevant）。** 被判定为忠实于相应大纲条目的百分比。
3. **趣味（Interesting）。** 被判定为有趣的百分比。

标注者会并排看到两个段落（附录 K.1）；对于每个指标，我们请他们标注哪个段落更好，或两者都行、或两者都不行。因此，所有数值只有相对于被比较的方法才有意义。每个成对比较由三位标注者标注。我们使用 Surge AI 进行标注，因为观察到其结果质量高于 Amazon Mechanical Turk。我们发现与 Yang et al. (2022) 相比，一致性更高（附录 I），这很可能归功于 Surge AI 以及我们更聚焦的标注任务。

**方法实例化。** 下文中我们把 DOC 框架的具体实例称为 DOC。特别地，我们将大纲深度设为 3，并将分支因子限制在 2 到 5 之间，由此生成的故事平均长度约为 3500 词。我们与 Yang et al. (2022) 一样将模型上下文窗口限制为 1024 token，因此最终故事比任何一步可见的上下文都要长得多。起草时使用的基础生成器是 OPT-175B（Zhang et al., 2022），原因在于一个实际问题：我们需要比 GPT3 API 所提供的更深的模型访问权限（具体来说，需要高效的 token 级 logits 访问）。进一步讨论见附录 D，完整超参数见附录 E。

**基线。** 我们运行两个基线。

1. **RE3：** 我们的主要基线基于 Re3（Yang et al., 2022），据我们所知，它是唯一一个能够自动生成篇幅相当故事的先前系统。为了公平比较，我们修改 Re3，使其在起草时也使用 OPT-175B。超参数设为其论文中的值，唯一例外是每个大纲条目的生成步数，我们略微增加以使平均故事长度与 DOC 匹配。我们为 RE3 复用来自 DOC 的场景设定、角色和顶层大纲，因为到此为止两者的规划仅略有不同（DOC 只是使用更多角色，并逐条生成大纲条目，而非一次性生成）。
2. **ROLLING-OPT：** 使用 OPT-175B、并采用与 DOC 和 RE3 相同上下文窗口的一个健全性检查（sanity check）基线。提示中包含前提和顶层大纲条目（附录 F），随后是提示中能够容纳的、对先前已生成故事的滚动窗口。ROLLING-OPT 为每个大纲条目生成的文本长度与 RE3 相同。

**结果。** 如表 1 所示，与 RE3 相比，DOC 段落被判定为情节连贯性和大纲相关性显著更高，更不用说与较弱的 ROLLING-OPT 相比了。结果证实了我们的直觉：将创作工作从规划转移到起草，再配合改进的控制，应当有益于情节连贯性和大纲相关性。也许令人意外的是，标注者还判定 DOC 的段落显著更有趣，消融实验表明这源于我们更详细（且事件更丰富）的大纲（第 5.1 节）。

当然，定性检查也揭示了改进空间。虽然 DOC 通常不会像 RE3 那样严重偏离顶层大纲——RE3 有时几乎完全跑题——但 DOC 经常无法遵循详细大纲中较低层级的部分（第 5.2 节）。长程事实一致性在 DOC 和 RE3 中仍然都是问题。详细大纲中的偶发错误尤其有害，会在起草过程中引发级联错误。此外，DOC 的大纲叶节点在细节程度上往往不一致：有些仍然过于模糊，另一些则显得过度扩展。而且，检测出的场景和角色有时看起来不正确或不完整。

表 3 展示了 DOC 根据表 2 中（同样经过大幅删减的）详细大纲写出的一篇大幅删减的故事。DOC 计划与故事的完整独立同分布（i.i.d.）示例见附录 M。

**表 1：** DOC 与基线在 20 个故事的顶层大纲条目对应段落上的成对比较。加粗表示 p < 0.05 的显著性。与 RE3 和 ROLLING-OPT 相比，DOC 的故事被评为情节连贯性、大纲相关性和趣味性都显著更高。（注：表中两行 DOC 分别对应 DOC 与 RE3、DOC 与 ROLLING-OPT 的两次成对比较。）

| 方法 | 连贯 | 相关 | 趣味 |
|---|---|---|---|
| RE3 | 45.1 | 37.1 | 39.4 |
| DOC | 67.6 | 65.3 | 60.1 |
| ROLLING-OPT | 38.0 | 25.4 | 25.4 |
| DOC | 80.8 | 78.9 | 69.5 |

**表 2：** 一个前提与大幅删减的 DOC 大纲示例（省略了场景、角色和第 3 层条目；完整计划见附录 M 表 28）。

> **前提：** 一位年轻女子决意终身不嫁、独自生活，但当她遇到一个似乎对她而言堪称完美的男人时，她开始重新考虑自己的决定。
>
> **生成的大纲：**
> 1. Jenna Adams 遇见 Brian Johnson，并立刻被他吸引。
>    a. Jenna Adams 遇见 Brian Johnson，并对他产生了一种即时的牵绊。
>    b. 两人开始约会，Jenna Adams 渐渐爱上了 Brian Johnson。
> 2. 当 Brian Johnson 看起来就是她的完美男人时，Jenna Adams 开始觉得结婚也许没那么糟。
>    a. 当 Brian Johnson 看起来就是她的完美男人时，Jenna Adams 开始觉得结婚也许没那么糟。
>    b. 经过一番深刻的自省，Jenna Adams 决定她想嫁给 Brian Johnson。
> 3. 然而，当 Brian Johnson 的前女友出现并试图把他赢回去时，Jenna Adams 意识到婚姻终究不适合她，与其和一个并非真心爱你的人在一起，不如独自一人。
>    a. Jenna Adams 无意中听到 Brian Johnson 与其前女友 Teresa Campbell 的一段对话。
>    b. Jenna Adams 就这段对话质问 Brian Johnson，Brian Johnson 承认自己对 Teresa Campbell 仍有感情。
>    c. Jenna Adams 与 Brian Johnson 分手。
>    d. Jenna Adams 认定，与其和一个并非真心爱你的人在一起，不如独自一人。

**表 3：** 一篇由 DOC 根据表 2 所示大纲生成的大幅删减的故事（完整故事见附录 M 表 29）。尽管仍存在一些问题，但故事拥有一个连贯、且遵循大纲的整体情节。

> **生成的故事：**
> …[省略 85 词]…
> 第一次见到他时，Jenna 在书架间过道的正中央猛地停住脚步，抬头望向他，心跳加速。
> …[省略 331 词]…
> Jenna Adams 希望他们的关系能更进一步。…[省略 106 词]…
> 也许结婚终究没那么糟。…[省略 419 词]…
> 【Jenna：】我爱你，Brian Johnson。我想永远和你在一起。我希望你给我戒指，向我求婚。…[省略 811 词]…
> 【Jenna：】我仍然爱你，但我已经无法再相信你的承诺了。…[省略 222 词]…
> 【Jenna：】我听到了你和 Teresa Campbell 的那些对话……[省略 122 词]…
> 【Brian：】我希望你永远留在我生命里。但我对自己对你、以及 Teresa Campbell 的感情感到困惑。…[省略 285 词]…
> 随后，Jenna Adams 把戒指扔进了他们家后院的火坑里。她留下 Brian Johnson 呆立当场，震惊不已。…[省略 244 词]…

### 4.1　人机交互式故事生成

我们还在交互式场景下评估了 DOC 与 RE3 的对比，重点关注人类可控性。与先前那些逐段运作的人在回路方法（Coenen et al., 2021; Lee et al., 2022）不同，我们探索在更高层的规划阶段进行交互，尽管原则上 DOC 也支持段落级交互。

**实验设置。** 人类先写出一个故事前提，我们据此生成一份只有顶层（第 1 层）大纲的初始计划。随后人类最多编辑 5 分钟。得到的中间计划 P 同时用于 DOC 和 RE3，两者随后分道扬镳。对于 DOC，我们为 P 扩展出第 2 层、再第 3 层大纲条目，每生成一层后再给人类最多 5 分钟编辑时间。对于 RE3，人类只需再编辑 P 最多 10 分钟。因此两种方法总共各分配到 15 分钟的编辑时间。然后我们根据最终编辑好的计划生成故事。

**指标。** 我们请标注者对以下针对交互体验的指标进行标注：

1. **意图（Intent）。** 哪个系统的段落更忠实地遵循了他们作为作者的原意。
2. **控制（Control）。** 哪个系统的工作流让他们感觉拥有更多控制。
3. **直觉（Intuition）。** 哪个系统用起来更有帮助、更直观。
4. **质量（Quality）。** 若以质量为优先，他们会选择用哪个系统来写另一个故事。

意图指标是段落级的，其余指标都作用于完整故事层面。标注者针对每个指标标注哪个系统更好，或无偏好（附录 K.2）。

**结果。** 如表 4 所示，在我们全部四个交互式指标上，人类以压倒性优势偏好 DOC 的交互范式而非 RE3：每个指标上至少有四分之三的人认为 DOC 更优。在可选的自发评论（附录 J）中，对整体故事质量的反应从失望到满意各不相同，但都清楚地表明 DOC 的故事更忠实于情节大纲和作者的原意。这些结果证实：DOC 更详细的大纲以及在起草过程中改进的控制，使人类认为 DOC 更具可控性、也更忠于作者意图。

**表 4：** DOC 与 RE3 在 20 次人机交互式故事生成上的成对比较。人类对作者意图的忠实度、对生成的控制、系统的直观性和故事质量进行了判断。数值表示偏向各系统的回答百分比，省略了“无偏好”的回答。加粗表示 p < 0.05 的显著性。在所有指标上 DOC 都以大幅优势被偏好。

| 方法 | 意图 | 控制 | 直觉 | 质量 |
|---|---|---|---|---|
| RE3 | 17.3 | 5.0 | 5.0 | 15.0 |
| DOC | 80.0 | 80.0 | 80.0 | 75.0 |

## 5　分析

### 5.1　消融研究

**被消融的组件。** 为了消融 DOC 的两个主要组件，我们对 DOC 作如下修改：

1. **DOC-NOOUTLINE**，只根据顶层大纲而非完整详细大纲进行生成，对每个大纲条目使用固定段落长度（而非提前停止），并使用固定强度的详细控制器。
2. **DOC-NOCONTROL**，与 DOC 完全相同，只是关闭了详细控制器。

我们复用表 1 中的连贯性、相关性和趣味性指标。

**结果。** 如表 5 所示，与两个消融版本相比，DOC 对顶层大纲条目的相关性都显著更高。因此，详细大纲生成器和详细控制器都对我们方法遵循高层次大纲的能力做出了有意义的贡献。虽然情节连贯性和趣味性的差距在统计上不显著，但消融实验表明，DOC 相对先前工作在趣味性上的提升主要归功于更详细的大纲；如果说详细控制器有什么影响，那它可能略微损害了趣味性。事实上——也许并不意外——我们定性观察到，进一步提高控制强度会以牺牲创造性为代价，产生越来越狭窄、重复的输出。

**表 5：** DOC 分别与“无详细大纲生成器”“无详细控制器”的消融版本，在 10 个故事的段落上的成对比较。加粗表示 p < 0.05 的显著性。虽然情节连贯性和趣味性上的结果不具决定性，但详细大纲生成器和详细控制器对大纲相关性都很重要。（注：表中两行 DOC 分别对应与两个消融版本的两次成对比较。）

| 方法 | 连贯 | 相关 | 趣味 |
|---|---|---|---|
| DOC-NOOUTLINE | 61.8 | 41.2 | 57.8 |
| DOC | 73.5 | 64.7 | 66.7 |
| DOC-NOCONTROL | 62.7 | 52.0 | 58.8 |
| DOC | 70.6 | 73.5 | 50.0 |

### 5.2　详细相关性评估

我们现在考察 DOC 在叶节点（而非顶层）层面忠实于大纲的情况。对于每个叶节点大纲条目，我们请一位标注者判断该叶节点指定的事件是否出现在相应段落中，或出现在紧邻的前后段落中（附录 K.3）。我们对 DOC-NOCONTROL 也做同样的处理。

**结果。** 表 6 证实，详细控制器大幅提升了 DOC 在起草过程中遵循低层级大纲细节的能力。然而，总体数字仍然偏低，这指向两个问题。其一，大纲叶节点本身可能有问题：它可能在上下文中显得突兀，或过于模糊。其二，若不再进一步提高控制强度（这可能会牺牲流畅性），详细控制器可能无法充分引导生成。因此，虽然 DOC 相对基线已经大幅更忠实于大纲，但仍存在相当大的改进空间。

**表 6：** 忠实于相应大纲叶节点的短段落百分比，对详细控制器做消融。加粗表示 p < 0.05 的显著性。详细控制器极大提升了对叶节点的相关性。

| 方法 | 详细相关 |
|---|---|
| DOC-NOCONTROL | 37.8 |
| DOC | 58.5 |

## 6　讨论

我们提出了 DOC 框架，用于提升长篇故事生成中的长程连贯性。DOC 使用详细大纲生成器将创作工作从起草转移到规划，并使用详细控制器在起草过程中保持对详细大纲的忠实度。与先前的先进方法 Re3 相比，根据人类标注者的判断，DOC 显著提升了生成故事的情节连贯性、大纲相关性乃至趣味性。尽管如此，仍有许多有趣的未来方向。

**其他文本领域。** 本工作聚焦于创意故事，但我们相信我们的许多高层思想可以适用于其他长篇文本生成场景，例如维基百科条目或电影剧本。在这类场景中的生成，或许能从“通过大纲进行详细规划，配合额外的控制以保持对初始计划的忠实”中受益。当然，我们的许多具体提示都需要大幅修改才能适配新领域。

**改进的人类交互。** 在第 4.1 节中，我们在人机交互式场景下试验了 DOC，让人类能够在高层的规划阶段与 DOC 交互，这与先前在起草层面运作的工作（Coenen et al., 2021; Lee et al., 2022）形成对比。随着自动生成能力不断提升，我们期待继续探索新的人机交互形式。

**扩展到更长文本。** 虽然我们的故事（平均超过 3500 词）按神经文本生成的标准已经算长，但按人类作者的标准仍相对较短。我们希望最终能开发出可扩展到整部长篇小说的系统。我们相信，DOC 通过生成粒度可随故事长度扩展的大纲、同时提供更好的控制机制以在起草过程中保持对大纲的忠实，为这一宏大目标做出了重要贡献。然而，高质量地生成更长文本仍存在重大障碍，下面描述其中两个。

**评估。** 虽然最近一些工作为更长生成提出了指标（Castricato et al., 2021; Matiana et al., 2021），但在本工作中，由于被评估段落篇幅之长以及我们指标的复杂性，我们的指标目前仍没有人类判断的替代品。例如，目前尚不清楚如何自动衡量整体的情节连贯性，尤其是趣味性。不过，相关性的自动指标可能更易处理，尤其是将其应用于我们对较短段落的低层级大纲条目的更细粒度实验（第 5.2 节）时。为促进这类工作，我们已在公开 GitHub 仓库中开源了实验期间收集的所有标注，希望它们有助于为长篇生成开发更好的指标。

**长程一致性。** 第二个主要问题是长段落中的内部一致性，其中一个主要组成部分是事实一致性。虽然更详细的大纲在这方面可能有所帮助，但我们在本工作中大体上并未聚焦于事实一致性。DOC 的故事偶尔会出现明显的错误，例如名字或性别不一致，而且错误有时甚至在大纲生成阶段就出现，导致起草过程中产生级联错误。此外，除了整体的情节连贯性之外，我们尚未提及长程一致性的非事实性方面。这些方面包括保持一致的故事节奏，或诸如伏笔之类的文学手法，它们本身也是值得探索的方向。

## 局限性

与先前关于长篇文本生成的工作一样，若不借助昂贵的人工标注，很难评估我们故事输出的质量。虽然我们已经消融了 DOC 的主要组件，但评估的困难限制了我们对子组件进行更细粒度的消融，而这或许能帮助我们更好地精简当前包含许多相互关联部分的框架。

此外，我们的系统高度专用于英文故事生成。虽然我们相信我们的高层思想——详细大纲与详细控制——具有广泛的适用性，但适配不同的文本领域或语言需要大幅修改提示。

## 伦理考量

强大的自然语言生成自动化系统具有潜在危害，例如生成有毒或不真实的文本。在本工作中，我们聚焦于创意故事，从而限制了滥用的可能性。虽然我们并未明确尝试降低本工作中产生有害文本的可能性，但 DOC 在构建上是相对我们所依赖的基础语言模型模块化的，因此这些系统的进步原则上也能迁移到 DOC 中。此外，受控生成方案可用于降低输出的毒性，正如我们在本工作中用 FUDGE 控制大纲相关性那样。

DOC 目前仅针对英文设计；迁移到其他语言需要调整我们的提示。在低资源语言中，性能可能会下降，因为我们严重依赖可能在此类语言上表现较差的大型预训练语言模型。

## 致谢

我们感谢 Berkeley NLP 团队、我们在 Meta AI 的同事以及匿名审稿人富有帮助的讨论与反馈。本工作由 Berkeley AI Research、Meta AI、Open Philanthropy、DARPA（SemaFor 项目，HR00112020054）、Machine Common Sense（MCS）项目（合作协议 N66001-19-2-4032）以及 NSF（通过授予第一作者的奖学金）支持。内容不一定反映政府的立场或政策，也不应被推断为官方背书。

## 参考文献

1. Tom Brown, Benjamin Mann, Nick Ryder, Melanie Subbiah, Jared D Kaplan, Prafulla Dhariwal, Arvind Neelakantan, Pranav Shyam, Girish Sastry, Amanda Askell, et al. 2020. Language models are few-shot learners. *Advances in neural information processing systems*, 33:1877–1901.

2. Louis Castricato, Stella Biderman, David Thue, and Rogelio Cardona-Rivera. 2021. Towards a model-theoretic view of narratives. In *Proceedings of the Third Workshop on Narrative Understanding*, pages 95–104.

3. John Joon Young Chung, Wooseok Kim, Kang Min Yoo, Hwaran Lee, Eytan Adar, and Minsuk Chang. 2022. Talebrush: Sketching stories with generative pretrained language models. In *CHI Conference on Human Factors in Computing Systems*, pages 1–19.

4. Andy Coenen, Luke Davis, Daphne Ippolito, Emily Reif, and Ann Yuan. 2021. Wordcraft: a human-ai collaborative editor for story writing. *arXiv preprint arXiv:2107.07430*.

5. Chiara Coetzee. 2023. Generating a full-length work of fiction with gpt-4.

6. Sumanth Dathathri, Andrea Madotto, Janice Lan, Jane Hung, Eric Frank, Piero Molino, Jason Yosinski, and Rosanne Liu. 2019. Plug and play language models: A simple approach to controlled text generation. *arXiv preprint arXiv:1912.02164*.

7. Angela Fan, Mike Lewis, and Yann Dauphin. 2018. Hierarchical neural story generation. *arXiv preprint arXiv:1805.04833*.

8. Seraphina Goldfarb-Tarrant, Tuhin Chakrabarty, Ralph Weischedel, and Nanyun Peng. 2020. Content planning for neural story generation with aristotelian rescoring. *arXiv preprint arXiv:2009.09870*.

9. Seraphina Goldfarb-Tarrant, Haining Feng, and Nanyun Peng. 2019. Plan, write, and revise: an interactive system for open-domain story generation. *arXiv preprint arXiv:1904.02357*.

10. Mandy Guo, Joshua Ainslie, David Uthus, Santiago Ontanon, Jianmo Ni, Yun-Hsuan Sung, and Yinfei Yang. 2021. Longt5: Efficient text-to-text transformer for long sequences. *arXiv preprint arXiv:2112.07916*.

11. J Edward Hu, Huda Khayrallah, Ryan Culkin, Patrick Xia, Tongfei Chen, Matt Post, and Benjamin Van Durme. 2019. Improved lexically constrained decoding for translation and monolingual rewriting. In *Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies*, Volume 1 (Long and Short Papers), pages 839–850.

12. Daphne Ippolito, Ann Yuan, Andy Coenen, and Sehmon Burnam. 2022. Creative writing with an ai-powered writing assistant: Perspectives from professional writers. *arXiv preprint arXiv:2211.05030*.

13. Srinivasan Iyer, Xi Victoria Lin, Ramakanth Pasunuru, Todor Mihaylov, Dániel Simig, Ping Yu, Kurt Shuster, Tianlu Wang, Qing Liu, Punit Singh Koura, et al. 2022. Opt-iml: Scaling language model instruction meta learning through the lens of generalization. *arXiv preprint arXiv:2212.12017*.

14. Takeshi Kojima, Shixiang Shane Gu, Machel Reid, Yutaka Matsuo, and Yusuke Iwasawa. 2022. Large language models are zero-shot reasoners. *arXiv preprint arXiv:2205.11916*.

15. Ben Krause, Akhilesh Deepak Gotmare, Bryan McCann, Nitish Shirish Keskar, Shafiq Joty, Richard Socher, and Nazneen Fatema Rajani. 2020. Gedi: Generative discriminator guided sequence generation. *arXiv preprint arXiv:2009.06367*.

16. Moritz Laurer, W v Atteveldt, Andreu Casas, and Kasper Welbers. 2022. Less annotating, more classifying–addressing the data scarcity issue of supervised machine learning with deep transfer learning and bert-nli.

17. Mina Lee, Percy Liang, and Qian Yang. 2022. Coauthor: Designing a human-ai collaborative writing dataset for exploring language model capabilities. *arXiv preprint arXiv:2201.06796*.

18. Yinhan Liu, Myle Ott, Naman Goyal, Jingfei Du, Mandar Joshi, Danqi Chen, Omer Levy, Mike Lewis, Luke Zettlemoyer, and Veselin Stoyanov. 2019. Roberta: A robustly optimized bert pretraining approach. *arXiv preprint arXiv:1907.11692*.

19. Shahbuland Matiana, JR Smith, Ryan Teehan, Louis Castricato, Stella Biderman, Leo Gao, and Spencer Frazier. 2021. Cut the carp: Fishing for zero-shot story evaluation. *arXiv preprint arXiv:2110.03111*.

20. Lesly Miculicich, Dhananjay Ram, Nikolaos Pappas, and James Henderson. 2018. Document-level neural machine translation with hierarchical attention networks. *arXiv preprint arXiv:1809.01576*.

21. Piotr Mirowski, Kory W Mathewson, Jaylen Pittman, and Richard Evans. 2022. Co-writing screenplays and theatre scripts with language models: An evaluation by industry professionals. *arXiv preprint arXiv:2209.14958*.

22. Shashi Narayan, Yao Zhao, Joshua Maynez, Gonçalo Simões, Vitaly Nikolaev, and Ryan McDonald. 2021. Planning with learned entity prompts for abstractive summarization. *Transactions of the Association for Computational Linguistics*, 9:1475–1492.

23. OpenAI. 2023. Gpt-4.

24. Long Ouyang, Jeff Wu, Xu Jiang, Diogo Almeida, Carroll L Wainwright, Pamela Mishkin, Chong Zhang, Sandhini Agarwal, Katarina Slama, Alex Ray, et al. 2022. Training language models to follow instructions with human feedback. *arXiv preprint arXiv:2203.02155*.

25. Lianhui Qin, Antoine Bosselut, Ari Holtzman, Chandra Bhagavatula, Elizabeth Clark, and Yejin Choi. 2019. Counterfactual story reasoning and generation. *arXiv preprint arXiv:1909.04076*.

26. Hannah Rashkin, Asli Celikyilmaz, Yejin Choi, and Jianfeng Gao. 2020. Plotmachines: Outline-conditioned generation with dynamic plot state tracking. *arXiv preprint arXiv:2004.14967*.

27. Nils Reimers and Iryna Gurevych. 2019. Sentence-bert: Sentence embeddings using siamese bert-networks. *arXiv preprint arXiv:1908.10084*.

28. Victor Sanh, Albert Webson, Colin Raffel, Stephen H Bach, Lintang Sutawika, Zaid Alyafeai, Antoine Chaffin, Arnaud Stiegler, Teven Le Scao, Arun Raja, et al. 2021. Multitask prompted training enables zero-shot task generalization. *arXiv preprint arXiv:2110.08207*.

29. Yufei Tian and Nanyun Peng. 2022. Zero-shot sonnet generation with discourse-level planning and aesthetics features. In *2022 Annual Conference of the North American Chapter of the Association for Computational Linguistics (NAACL)*.

30. Hugo Touvron, Thibaut Lavril, Gautier Izacard, Xavier Martinet, Marie-Anne Lachaux, Timothée Lacroix, Baptiste Rozière, Naman Goyal, Eric Hambro, Faisal Azhar, et al. 2023. Llama: Open and efficient foundation language models. *arXiv preprint arXiv:2302.13971*.

31. Rose E Wang, Esin Durmus, Noah Goodman, and Tatsunori Hashimoto. 2022. Language modeling via stochastic processes. *arXiv preprint arXiv:2203.11370*.

32. Tianming Wang and Xiaojun Wan. 2019. T-cvae: Transformer-based conditioned variational autoencoder for story completion. In *IJCAI*, pages 5233–5239.

33. Thomas Wolf, Lysandre Debut, Victor Sanh, Julien Chaumond, Clement Delangue, Anthony Moi, Pierric Cistac, Tim Rault, Rémi Louf, Morgan Funtowicz, et al. 2020. Transformers: State-of-the-art natural language processing. In *Proceedings of the 2020 conference on empirical methods in natural language processing: system demonstrations*, pages 38–45.

34. Yuhuai Wu, Albert Q Jiang, Wenda Li, Markus N Rabe, Charles Staats, Mateja Jamnik, and Christian Szegedy. 2022. Autoformalization with large language models. *arXiv preprint arXiv:2205.12615*.

35. Peng Xu, Mostofa Patwary, Mohammad Shoeybi, Raul Puri, Pascale Fung, Anima Anandkumar, and Bryan Catanzaro. 2020. Megatron-cntrl: Controllable story generation with external knowledge using large-scale language models. *arXiv preprint arXiv:2010.00840*.

36. Kevin Yang and Dan Klein. 2021. Fudge: Controlled text generation with future discriminators. *arXiv preprint arXiv:2104.05218*.

37. Kevin Yang, Nanyun Peng, Yuandong Tian, and Dan Klein. 2022. Re3: Generating longer stories with recursive reprompting and revision. *arXiv preprint arXiv:2210.06774*.

38. Zichao Yang, Diyi Yang, Chris Dyer, Xiaodong He, Alex Smola, and Eduard Hovy. 2016. Hierarchical attention networks for document classification. In *Proceedings of the 2016 conference of the North American chapter of the association for computational linguistics: human language technologies*, pages 1480–1489.

39. Lili Yao, Nanyun Peng, Ralph Weischedel, Kevin Knight, Dongyan Zhao, and Rui Yan. 2019. Plan-and-write: Towards better automatic storytelling. In *Proceedings of the AAAI Conference on Artificial Intelligence*, volume 33, pages 7378–7385.

40. Susan Zhang, Stephen Roller, Naman Goyal, Mikel Artetxe, Moya Chen, Shuohui Chen, Christopher Dewan, Mona Diab, Xian Li, Xi Victoria Lin, et al. 2022. Opt: Open pre-trained transformer language models. *arXiv preprint arXiv:2205.01068*.

41. Chao Zhao, Marilyn Walker, and Snigdha Chaturvedi. 2020. Bridging the structural gap between encoding and decoding for data-to-text generation. In *Proceedings of the 58th Annual Meeting of the Association for Computational Linguistics*, pages 2481–2491, Online. Association for Computational Linguistics.

42. Lianmin Zheng, Zhuohan Li, Hao Zhang, Yonghao Zhuang, Zhifeng Chen, Yanping Huang, Yida Wang, Yuanzhong Xu, Danyang Zhuo, Joseph E Gonzalez, et al. 2022. Alpa: Automating inter-and intra-operator parallelism for distributed deep learning. *arXiv preprint arXiv:2201.12023*.

43. Ruiqi Zhong, Kristy Lee, Zheng Zhang, and Dan Klein. 2021. Adapting language models for zero-shot learning by meta-tuning on dataset and prompt collections. *arXiv preprint arXiv:2104.04670*.

## 附录 A：过滤与重排细节

为过滤候选大纲事件，我们要求大纲事件应为陈述句，开头使用规范的大写，不包含非常见的标点符号（例如“<”），基于编辑距离和 Laurer et al. (2022) 的蕴含模型，相对于大纲中已有的事件（当前事件的直接祖先除外）不过度重复，且长度介于 3 到 50 个 token 之间。

重排所用的句子相似度使用 https://huggingface.co/sentence-transformers/all-mpnet-base-v2 提供的模型。

为训练排序模型，我们收集了一个由 InstructGPT3-175B（text-davinci-002）撰写的、共 1000 篇、每篇两到三段的极短故事数据集，因为我们观察到 InstructGPT3-175B 生成的故事恰好以类似于高层次大纲的风格写成——本质上是在“讲述”而非“展示”。我们基于 roberta-large（Liu et al., 2019）训练了一个模型，该模型通过对比训练来预测某故事中的给定句子是否以正确的顺序出现，负样本通过将该给定句子随机移动到故事中的其他位置来构造。

## 附录 B：结构化提示示例

我们展示一些用于我们的详细大纲生成器以及起草过程中的结构化提示的真实示例。

### B.1 事件描述

表 7 展示了在第 3 层生成接近结束时，用于生成一个大纲条目的事件描述的提示。

### B.2 场景与角色检测

**场景设定。** 出于实践中的实现便利，由于详细大纲的其他部分不依赖于场景设定，场景是在大纲的其余部分完成后，按深度优先顺序为每个叶节点生成的。为给定大纲条目生成场景的提示与用于事件的提示类似，但还包含先前生成的场景。表 8 展示了一个示例提示。

```
前缀：
故事前提：在失去父亲之后，Shannon 决心追随他的脚步，成为一名成功的记者。然而，当她接下第一份重大任务时，她很快发现城市生活的丑陋现实与她所想象的梦想相去甚远。在新朋友——一个熟悉街头生存之道的少年——的帮助下，Shannon 逐渐理解了内城严酷的现实，并懂得了有时真相远不止是一个故事。
场景设定：故事发生在一个大都市区的内城。
角色：
Shannon Doyle 是一位二十出头的年轻女性。
Gary Saunders 是一个生活在内城的少年。
Mike Doyle 是 Shannon 的父亲，也是一位成功的记者。
Lena Saunders 是 Gary 的母亲，也是当地的一位企业主。
Eddie Saunders 是 Gary 的哥哥，也是帮派成员。
Dexter Brown 是当地的毒贩。
News Director 是 Shannon 在电视台的上司。
Jamal Walker 是 Eddie 帮派中的一名少年成员。
Ernesto Jimenez 是一名警探，正在调查内城的一系列谋杀案。
Luis Chavez 是一名与 Shannon 在电视台共事的记者。
大纲：
1. Shannon 的父亲 Mike 意外去世，让她决心追随他的脚步，成为一名成功的记者。
a. Shannon 的父亲 Mike 意外去世。
b. Shannon 决定追随父亲的脚步，成为一名成功的记者。
2. Shannon 接下她的第一份重大任务——一篇关于内城的专题报道，但很快发现城市生活的丑陋现实与她所想象的梦想相去甚远。
a. Shannon 接下她的第一份重大任务，一篇关于内城的专题报道。
从开头开始，列出该标题下发生的主要事件。
i.
后缀：
ii. Shannon 很快发现城市生活的丑陋现实与她所想象的梦想相去甚远。
c. 在新朋友 Gary 的帮助下，Shannon 逐渐理解了内城严酷的现实，并懂得了有时真相远不止是一个故事。
i. Shannon 遇到了 Gary。
ii. Gary 向 Shannon 介绍内城。
iii. Shannon 懂得了真相远不止是一个故事。
```

**表 7：**展示用于生成第 3 层大纲条目的确切前缀与后缀的示例提示。注意，后缀仅在提示用途上进行了深度平移，使其从我们正在生成的当前大纲条目相同的深度开始（即此处所示的后缀对应于表 24 中完整大纲的 2b、3、3a-c）。我们观察到这种深度平移能提升连贯性，尽管未来随着语言模型的改进，这可能不再必要。前缀与后缀共同包含了当前大纲条目所有先前生成的祖先节点，以及这些祖先各自的孩子，从而在提供相关上下文的同时保持了对更高深度的可扩展性。

```
前缀：
故事前提：Sherry 曾拥有完美的生活——三个健康的孩子、一位深爱她的妻子，以及一份足以养家的工作；直到她发现就发生在她眼前的事情。Sherry 的妻子自他们在一起以来，一直与她的兄弟有染，而她一直盲目到视而不见。随之而来的是一场痛苦的离婚，Sherry 只能独自抚养孩子。心碎不已的 Sherry 发誓彻底不再恋爱……直到她遇到一个人，让她开始质疑自己自以为知道的一切。
故事发生在美国的一个小镇，时间是现在。
Sherry Jackson 是一位中年女性，正艰难地从离婚中走出来。
Melissa Jackson 是 Sherry 的前妻，她与自己的兄弟有染，背叛了 Sherry。
Brad Jackson 是 Sherry 前夫的兄弟，也是她的旧情人。
Lena Edwards 是 Sherry 离婚后遇到的一位女性，帮助她疗伤并向前看。
Abigail Jackson 是 Sherry 三个孩子之一。
Caleb Jackson 是 Sherry 三个孩子之一。
Sophia Jackson 是 Sherry 三个孩子之一。
Luke Edwards 是 Lena 的儿子，与 Sherry 的孩子们成了朋友。
Steven Warner 是 Sherry 的上司，她在离婚后开始与他约会。
大纲：
Sherry 的生活分崩离析——她的妻子与她的兄弟有染，而她离了婚。
a. Sherry 的妻子与她的兄弟有染。
i. Sherry 的妻子与她的兄弟有染。这一场景发生在
后缀：
ii. Sherry 发现了这段婚外情。
iii. Sherry 就婚外情质问她的妻子。
b. Sherry 离了婚。
i. Sherry 与她的妻子离婚了。
ii. Sherry 获得了三个孩子的监护权。
iii. Sherry 的前妻与她的兄弟搬走了。
Lena 帮助 Sherry 疗伤，并从离婚中走出来。
a. Lena 帮助 Sherry 从离婚中疗伤。
b. Lena 与 Sherry 成为朋友。
Sherry 开始与她的上司 Steven Warner 约会。
a. Sherry 开始与她的上司约会。
b. Steven 与 Sherry 结婚了。
```

**表 8：**在详细大纲的非场景部分完成之后，为给定大纲条目检测场景的示例提示。

**角色。** 角色检测与每个大纲条目的事件生成流程协同进行，其过程更为复杂。在为给定大纲条目生成事件之后，我们首先提示生成一份可能未命名的角色列表（表 9），并允许模型在最近生成的名称包含列表中的下一个编号时继续生成该列表（即，若模型针对表 9 中的提示生成“Shannon 2. ...”，我们将“Shannon”保存为检测到的第一个角色，并把字符串“2.”的出现视为应继续检测更多角色的信号）。按名字提及的角色会基于词重叠直接与我们的角色清单进行匹配。

对于剩余未命名的角色字符串，我们首先检测它们指代的是单个角色还是一组角色。例如，若我们想匹配表 9 所示大纲条目中的“她的父亲”，我们会先用表 10 所示的提示检测该字符串指代的是单个角色还是群体，然后检查 token“ single”与“ group”哪一个具有更高的下一 token 概率。

若该角色是单个角色，我们随后将角色清单与一些先前的大纲节点（若存在）一起作为上下文提供，以消解潜在的共指关系，如表 11 所示，然后解析输出以得到与角色清单匹配的名字。清单中的角色按预测相关性的逆序给出（相关性最低者在前），相关性基于其描述与上下文的相似度，由一个句子相似度模型（Reimers and Gurevych, 2019）计算。请注意，当我们提供角色清单时，我们会利用随时间更新的角色描述来改善匹配；表 11 中 Angie Wang 的描述下方可见一例。对于表示角色群体的字符串，提示几乎完全相同，只是我们允许模型以列表形式一次生成最多两个角色，与最初生成多个未命名角色字符串的方式类似。（尽管在某些情况下为群体生成两个以上角色可能是可取的，但我们观察到，若不强制最多两个角色，模型会频繁地幻觉出额外角色，而不是适当地停止。）

我们允许每个大纲条目最多检测 5 个角色。

### B.3 角色随时间的发展

每当我们检测到某个角色出现在给定大纲条目中时，我们会尝试用一个新的字符串更新该角色的描述；在之后处理任何更晚的大纲条目时，再次查询该角色时都会出现这个新字符串（但对更早的大纲条目不会）。

新的描述基于新的大纲条目与既有的角色描述生成，如示例提示表 12 中的前缀与后缀所示。仅当新生成的描述尚未被某一既有描述所蕴含时，才会将其添加到描述中；此外，若新描述蕴含某一既有描述，则每当新描述被使用时（即当前大纲条目或之后），该既有描述都会被移除。

```
Shannon 决定追随父亲的脚步，成为一名成功的记者。
列出这句话中提到的所有角色。
1.
```

**表 9：**用于检测大纲条目中（可能未命名的）角色的初始提示。

```
Shannon 决定追随父亲的脚步，成为一名成功的记者。
在这段话中，她的父亲是单个角色还是一组角色？
她的父亲是一个
1.
```

**表 10：**用于检测未命名角色字符串（“她的父亲”）指代的是单个角色还是一组角色的提示。

```
全名：Calvin Klein Calvin Klein 是一位知名时装设计师。
全名：Rachel Wu Rachel Wu 是一名记者，为一家流行时尚杂志报道时装周。
全名：Mia Zhang Mia Zhang 是一名超模，在时装周期间身穿 Angie 设计的礼服。
全名：Lily Li Lily Li 是 Angie 的母亲。
全名：Andrew Wang Andrew Wang 是 Angie 的父亲。
全名：Viktor Kaminsky Viktor Kaminsky 是一位俄罗斯寡头，有意收购 Angie 所在的时装设计公司。
全名：Dmitri Gregorovich Dmitri Gregorovich 是 Viktor Kaminsky 的得力助手。他供职于一家顶级时装设计公司。
全名：Owen Shaw Owen Shaw 是 Angie 实习所在时装设计公司的上司。
全名：Angie Wang Angie Wang 是一位二十二岁的华裔美国女性。Angie Wang 是一名设计师。她是一名实习生。Angie 在一家时装设计公司工作。她是 Jen Chen 的好友兼室友。
全名：Jen Chen Jen Chen 是 Angie 的好友兼室友。
——————————
以下上下文中的角色包括：Angie Wang、Dmitri Gregorovich。
先前上下文：Angie 在一家顶级时装设计公司实习了一年。Angie 在一家顶级时装设计公司实习了一年。
当前段落：她遇到了她的好友兼室友 Jen Chen。
好友的全名：
```

**表 11：**用于确定与一个已被预测为对应单个角色的角色字符串（“好友”）相对应的角色名字的提示。

```
前缀：
Angie 的设计作品登上了纽约时装周的 T 台。
这段上下文告诉我们关于 Angie Wang 的以下信息：
1.
后缀：
此外，我们从其他地方得知，Angie Wang 是一位二十二岁的华裔美国女性。Angie Wang 是一名设计师。她是一名实习生。Angie 在一家时装设计公司工作。她是 Jen Chen 的好友兼室友。她正在设计服装。
```

**表 12：**用于为角色描述添加更多信息的提示。

### B.4 起草过程中的示例提示

最后，在表 13 中，我们展示了一个在起草过程中生成下一故事段落的提示示例。

```
故事前提：Mayberry 镇的居民团结起来支持 Daisy，帮助她度过治疗。Daisy 的治疗十分艰难，居民们继续支持她。
本书由一位知名小说家撰写，并获得了评论家的热烈好评，评论家们称赞了角色之间有趣的对话与互动。
相关上下文：
Daisy Mayberry 是一位五十岁出头、心地善良的女性，深受她所在小镇所有人的喜爱。
Daisy Mayberry 患有癌症。Elizabeth 和 Bill Simpson 分别是 Daisy 的女儿和丈夫。
Daisy Mayberry 经营着一家五金店。她有一个名叫 Lisa 的女儿。
Charles Grayson 是 Andrea 的丈夫，也是镇上的财务顾问。
先前故事摘要：Daisy Mayberry 被诊断出癌症，她的家人和朋友团结起来支持她。Daisy 的女儿 Lisa 成为她的主要照护者，并不懈努力寻找能挽救母亲生命的治疗方法。Daisy 开始接受治疗，居民们团结在她身边。居民们帮助 Daisy 治疗并提供支持。Daisy 的治疗十分艰难，居民们提供支持。
紧接后续段落之前的事件：Lisa 最近经历了很多，这对她来说并不容易。Daisy 是她的母亲，知道如何照顾她，即便在 Lisa 身体不适时也是如此。Daisy 问 Lisa 今晚能否和她待在一起，以便聊聊 Lisa 办公室里发生的事。周围一直有很多活动，似乎每个人都很忙。
当前场景中的角色是 Lisa Chambers、Daisy Mayberry、Evelyn Chambers、Maggie Simpson。
在接下来的段落中，Daisy 的治疗十分艰难，居民们提供支持。居民们帮助 Daisy 度过治疗，她最终战胜了癌症。Daisy 最终战胜了癌症，她的故事给她的社区带来了希望。
故事的这一部分最初发生在医院。随后角色们转移到 Daisy 的家中。
以下为全文：
——————————
然而，当他们走进走廊，看也不看旁人一眼地从旁走过时，这场喧闹突然结束了。
在安静的走廊里，他们一路走到 Lisa 的办公室，在她的沙发上面对面坐下。“好吧，把你所知道的关于这次试验的一切都告诉我。”Lisa 一边说，一边拿起笔记本电脑并打开它。
Daisy 重重地叹了口气，靠在双人沙发里，把脚蜷到身下。她沮丧地用双手捋过头发，然后开口说：“其实我了解得不多，只知道医生说这是一种实验性疗法，针对我得的这种特定类型的肺癌。他告诉我，他要把我送到圣路易斯的 Memorial Hospital 进行评估，之后我才能加入试验。他说医院的一个研究委员会联系过他，他们会来接我并对我进行评估。我应该在明天中午离开。”她说着向后靠去，用手遮住了眼睛。
Lisa 坐在办公桌后面，双手交叠放在身前。
```

**表 13：**起草进行到一半时的故事段落提示。“故事前提”包含来自当前叶节点祖先的上下文。“相关上下文”包含关于预测会出现在后续段落中的角色的信息，以及截至当前时间点所推断的事实。“先前故事摘要”是包含先前大纲条目的远期摘要，其中先前的部分在可能时被折叠为较低深度的条目。“紧接后续段落之前的事件”是对前几段的近期摘要。“当前场景中的角色”是来自上一段的角色。“在接下来的段落中”描述了先前、当前和后续的大纲条目以提供上下文，尽管详细控制器只会应用于当前大纲条目（“居民们帮助 Daisy 度过治疗，她最终战胜了癌症”）。最后还有场景设定描述，包括（如适用）场景变化的描述，之后是逐字复制的紧邻的前一段故事段落。

## 附录 C：补充指标讨论

Yang et al. (2022) 使用了两个额外的指标，我们在实验中予以省略。他们的“其他写作问题”指标（突兀的叙述/风格、前后不一致、令人困惑的行文、语法不流畅、重复）衡量的是一个与我们的主要贡献正交的维度，我们并不预期 DOC 相比原始 RE3 会有太大变化（表 14）。他们的“人类相似度”指标因标注者群体不同而差异很大：在初步实验中，我们发现 Amazon Mechanical Turk 上的工人预测 70-80% 的故事为人类所写，而在 Surge AI 上这一比例仅为 30%。因此，我们在正文中聚焦于连贯性、相关性和趣味性指标，并将其改为在段落而非完整故事上运作，以减少噪声。

| 方法 | 其他写作问题↓ |
|---|---|
| RE3 | 1.17 |
| DOC | 1.00 |

**表 14：**由 Yang et al. (2022) 所定义的写作问题在我们主要实验的 20 个故事中由标注者指出的平均数量（越少越好）。尽管我们并不预期有多大差异——因为这些写作问题衡量的是与我们的主要贡献正交的方向——DOC 在该指标上的表现与 RE3 持平或更好。

## 附录 D：GPT3 与 OPT 基础生成器对比

从技术上讲，我们的方法兼容公开的 GPT3 API，但由于该 API 支持的功能有限，在计算上并不实际：对于每个 token，要在修改输出 logits 后继续生成，我们需要重新查询 API 并重新处理整个先前的提示。因此，在起草过程中，我们使用由 Alpa 项目（Zheng et al., 2022）提供的 OPT-175B，它支持从先前已处理提示的缓存键值重新开始生成；这种缓存是我们唯一需要的额外功能。随着语言模型不断改进，或许也有可能使用更小的模型来获得更高的计算效率，例如 LLAMA（Touvron et al., 2023）。

尽管已观察到 OPT 在许多任务上的表现略逊于 GPT3（Iyer et al., 2022），但在我们的实验中，作为故事段落生成器，经人工检查，我们发现 OPT 写出了质量相当的输出。使用 ROLLING-GPT（与 ROLLING-OPT 完全相同的基线，只是用 GPT3 代替 OPT）进行的正式比较表明，两者相比 DOC 仍都差得多（表 15）。如果说有什么不同的话，或许 ROLLING-GPT 只是比 ROLLING-OPT 稍微更有趣一些。

| 方法 | 连贯 | 相关 | 趣味 |
|---|---|---|---|
| RE3 | 45.1 | 37.1 | 39.4 |
| DOC | 67.6 | 65.3 | 60.1 |
| ROLLING-OPT | 38.0 | 25.4 | 25.4 |
| DOC | 80.8 | 78.9 | 69.5 |
| ROLLING-GPT | 44.1 | 25.8 | 42.7 |
| DOC | 81.7 | 83.1 | 70.0 |

**表 15：**表 1 的一个版本，额外加入了 ROLLING-GPT 基线。加粗表示 p < 0.05 的显著性。

我们注意到，与常见基准测试套件中使用的任务相比，我们的设置使用了长得多的提示以及相当长的输出，即我们的任务在某种意义上可被视为相对常见 NLP 基准的“域外”任务。尤其是，正如 Yang et al. (2022) 先前所观察到的，诸如 InstructGPT（text-davinci-002）之类的指令微调模型作为故事段落生成器，实际上可能比非指令微调模型（davinci）表现更差，这仅仅是因为它们针对的是与故事生成所需不同的分布（即常见的人类交互）。

我们还测试了新发布的 text-davinci-003，发现它能生成更高质量的输出。然而，在初步实验中，我们难以生成超过 600-700 字的故事，并观察到一种退回到更高层次“摘要式”风格的倾向，这种风格适合比我们在本工作中所追求的短得多的故事。GPT-4 似乎带来了进一步的改进，但并非质变。结构化规划方法对于生成数千字量级的长文本仍是必要的，例如 Coetzee (2023) 使用 GPT-4 并在极少的人工指导下生成了一部相对简单的小说。无论如何，语言建模的进展与我们的贡献是正交的，我们期待在未来长篇故事生成系统中探索更先进语言模型的应用。

## 附录 E：DOC 补充实现细节与超参数

**长度与提前停止。** 关于长度，我们允许大纲的最大深度为 3。我们允许每个大纲条目最多生成 8 个连续的 64-token 段落，即每个大纲条目生成的最大 token 数为 512。每当我们生成一个 64-token 的段落时，如果我们刚进入一个新段落的开头不到 10 个 token，就会截断最后一个不完整的段落。

对于提前停止，如果相关性和连贯性重排器的合并对数概率得分超过 -0.5 且得分不再进一步提高，我们就转移到下一个大纲条目。也就是说，如果在任一步骤中我们看到，根据我们的重排器，前一段落的合并相关性与连贯性对数概率超过 -0.5，而当前段落没有进一步提高得分，我们就在前一段落结束时停止，并进入下一个大纲条目。此外，在极少数情况下，当所有候选段落扩展根据简单启发式规则（例如高度重复）都有问题时，我们会跳过当前段落并直接进入下一个大纲条目。

在任何给定步骤对故事段落进行重排时，我们一次生成 8 个候选。

**详细大纲生成器。** 在起草大纲之前，我们尝试为初始角色清单生成最多 10 个角色，尽管由于 RE3 针对有效名字的过滤启发式规则，我们并不总能达到完整的 10 个。在详细大纲生成之后，我们会移除在大纲中未被检测到出现于任何地方的角色。在过滤与重排时，我们为每个大纲节点生成 10 个可能的事件候选。在为每个父节点生成子节点时，如果子节点少于 2 个或多于 5 个，我们会重新开始并重新采样。

**详细控制器。** 对于事件描述的控制强度，我们在单个大纲条目内的每个段落生成子步骤中，将 FUDGE 控制强度递增 3，从 0 开始，上限为 10。新场景（即相对前一大纲条目发生变化的场景）的控制强度设为事件描述控制强度的 0.5 倍，新角色（即未出现在前一大纲条目中的角色）的控制强度设为 0.2 倍。FUDGE 根据基础生成器考虑前 100 个 token，因此我们近似地在运行 k = 100 的 top-k 采样。

**基础生成器。** 使用 OPT-175B 时，我们采用频率惩罚 1。与 GPT3 API 不同的是，该惩罚还额外包含了完整的提示。这样做的原因是提示中存在大量脚手架文本，我们发现将提示纳入惩罚能减少生成中的重复性；此外，我们观察到，在较小的惩罚下，OPT-175B 往往更容易重复。然而，同样与 GPT3 API 不同的是，我们的惩罚以每个 token 0.98 的速率指数衰减，以避免在较长生成过程中过度惩罚诸如停用词之类的内容。

生成主体故事时，OPT 生成器的温度设为 0.8。在生成初始角色名字和详细大纲事件时，为了增加多样性，InstructGPT3 的温度设为 1.2；此外，在详细大纲生成过程中，当某个给定父节点的大纲扩展失败时，我们每次将温度递增 0.1，最多再尝试两次。

在适用的情况下，RE3 和 ROLLING-OPT 基线实现使用相同的 OPT-175B 超参数。

## 附录 F：ROLLING-OPT 与 ROLLING-GPT 的提示词

ROLLING-OPT 与 ROLLING-GPT 使用相同的提示词。对于生成的最初一段 256 token 的段落，示例提示词如**表 16** 所示；后续提示词则遵循**表 17** 中的模式。

```
前提：在失去父亲之后，Shannon 决心追随父亲的脚步，成为一名成功的记者。然而，当她接到第一份重要任务时，她很快发现城市生活的丑陋现实与她想象中的梦想相去甚远。在一位新朋友——一个深谙街头世故的少年的帮助下，Shannon 逐渐理解内城生活的残酷现实，并明白有时真相远不止是一个故事。
当前故事大纲：Shannon 的父亲 Mike 意外去世，这使她决心追随父亲的脚步，成为一名成功的记者。
根据该前提写一个故事，从当前大纲开始。
————————–
第 1 章
```

**表 16：**ROLLING-OPT 与 ROLLING-GPT 生成第一段落的示例提示词。

```
前提：在失去父亲之后，Shannon 决心追随父亲的脚步，成为一名成功的记者。然而，当她接到第一份重要任务时，她很快发现城市生活的丑陋现实与她想象中的梦想相去甚远。在一位新朋友——一个深谙街头世故的少年的帮助下，Shannon 逐渐理解内城生活的残酷现实，并明白有时真相远不止是一个故事。
当前故事大纲：在新朋友 Gary 的帮助下，Shannon 逐渐理解内城生活的残酷现实，并明白有时真相远不止是一个故事。
根据该前提写一个故事，从当前大纲继续。
————————–
……我认为他可能并非出于自愿而消失。”她不确定这样说听起来是否合适，但这是当时自然而然冒出来的话，所以 Shannon 决定不去为此担心！“我明白了，”那女子在长长的停顿之后缓缓说道。显然，两年来没有人打过电话告诉他们，说他们认为自己的亲人并非凭空消失……这一定是他们不习惯听到的事情。“听到你认为你的父亲可能是谋杀案的受害者，我很抱歉。”
“谢谢你的理解；不过，我这样认为是有理由的，”Shannon 解释道，希望自己的声音听起来别太颤抖。她确信两年来没有人打过电话说他们认为自己的亲人根本没有消失！“首先，他当时正在写一篇关于内城和警方的重要报道。”
“真的吗？”那女子问道，声音里带着困惑。Shannon 点了点头，说不出话来，因为她知道，如果她试图告诉他们两年前也有人打过这样一个电话，没有人会相信她！但她打算把一切都告诉这位女士，然后看看他们是否会帮助她查明真相……或者至少在她自己查明之前，设法找到杀害 Mike 的凶手！
“很抱歉，听起来你认为你父亲的失踪可能与他的工作有关……而且很抱歉，这一点我帮不了你，”她满怀歉意地对 Shannon 说。“如果他是可疑失踪，你可以向部门报告，我们会重新调查，但我们只会在怀疑存在谋杀的情况下才会调查，”她继续说道。“否则，此案即视为结案。”
“我不明白，”Shannon 慢慢解释道。“你刚才没听见我说的话吗？我是打电话来报告可疑情况的。”
“哦，这和发生在你父亲身上的事无关，”那女子摇着头说，仿佛 Shannon 在犯傻。“我可以告诉你，根据我从档案中读到的内容，他的失踪没有任何可疑之处，也没有任何谋杀的证据……这不是谋杀或诸如此类的事。”
“我不明白，”Shannon 慢慢重复道。“打电话的人不是我……这正是我想打电话的原因！”她再次抿紧嘴唇，试图弄清楚自己到底哪里搞砸了；她确信没有人告诉过她 Michael 的案子已经正式结案！没错，他之所以没有被报失踪，是因为人们相信他是自己离开的……但这并不意味着他不是受害者！这只意味着他没有任何朋友或家人会关心到第一时间报案说失踪的程度！而在两年后 Shannon 自己开始寻找答案之前，也没有任何其他人能查明真相！
“听着，我所能做的就是告诉……
```

**表 17：**ROLLING-OPT 与 ROLLING-GPT 生成后续段落的示例提示词。

## 附录 G：实验成本

在本项工作的整个过程中，我们估计在 GPT3 API 上花费了 3000–4000 美元，在 Surge AI 标注上花费了约 4000 美元，其中既包括开发/预实验成本，也包括最终实验成本。我们估计所有实验在 80GB NVIDIA A100 GPU 上使用了约 2000 个 GPU 小时，此外在早期实验中还在较小的 GPU 上使用了较少量的 GPU 小时。

与 RE3 相比，DOC 生成故事所需的时间是其两到三倍（RE3 又比 Yang et al.（2022）基于 GPT3-175B 的版本更慢；我们假设公开的 GPT3-175B API 在性能上经过了高度优化）。速度变慢似乎主要源于我们的 FUDGE 实现，它需要在由 Alpa 提供服务的 OPT-175B 上进行 token 级别的缓存与重启，而我们并未对其做重度优化。原则上，应该可以让 DOC 仅比 RE3 或 Yang et al.（2022）的原始实现略慢一点。

## 附录 H：平均故事长度

我们展示了不同方法的平均故事长度。表 1 主对比中的故事长度如**表 18** 所示，而表 5 中的消融实验如**表 19** 所示。除了消融实验中的 DOC-NOCONTROL 平均长度略长（由于相关性较弱，提前停止启发式触发的频率较低）之外，不同方法的平均长度相当接近。

| 方法 | 平均故事词数 |
|---|---|
| RE3 | 3810 |
| ROLLING-OPT | 3437 |
| ROLLING-GPT | 3831 |
| DOC | 3875 |

**表 18：**表 1 主对比中每种方法 20 个故事的平均词数。

| 方法 | 平均故事词数 |
|---|---|
| DOC-NOOUTLINE | 3547 |
| DOC-NOCONTROL | 4190 |
| DOC | 3527 |

**表 19：**表 5 消融实验中每种方法 10 个故事的平均词数。

## 附录 I：标注者一致性

在**表 20** 中，我们展示了表 1 主对比中标注一致性的 Fleiss' kappa。尽管由于指标的主观性，标注者一致性仍然相当低，但与 Yang et al.（2022）相比，我们的一致性明显更好——后者观察到的 Fleiss' kappa 值大多低于 0.1，甚至在部分情况下为负值。

| 对比 | 连贯性一致性 | 相关性一致性 | 趣味性一致性 |
|---|---|---|---|
| RE3 vs DOC | 0.19 | 0.24 | 0.15 |
| ROLLING-OPT vs DOC | 0.22 | 0.33 | 0.35 |
| ROLLING-GPT vs DOC | 0.21 | 0.42 | 0.20 |

**表 20：**表 1 实验中 DOC 与 RE3、ROLLING-OPT、ROLLING-GPT 对比的各指标 Fleiss' kappa。

## 附录 J：人工交互实验的可选自由评论

在**表 21** 中，我们展示了标注者在人工交互实验（第 4.1 节）之后撰写的全部可选评论（省略了空白评论）。RE3 为系统 A，DOC 为系统 B。对整体故事质量的看法各不相同，但标注者明显更偏好 DOC 的可控性。本实验的完整计划与故事可在 https://github.com/yangkevin2/doc-story-generation 获取。

**表 21：**标注者在人工交互实验（第 4.1 节）之后撰写的可选评论。虽然对整体故事质量的评价褒贬不一——有些人失望，另一些人满意——但他们绝大多数都认为 DOC（系统 B）更忠实于情节以及他们最初的创作意图。

- AI 对我最初三句话的故事前提处理得相当值得称赞。这里那里存在一些（优秀的）人类作家不会犯的错误——最刺眼的是某个部分中多个段落以完全相同的方式开头。但我很满意。希望未来能有更多这样的实验——谢谢。
- 两个故事都让我想读下去。但系统 B 输出的风格更接近我最初设想的。
- 我的意思是，结果与我想要的东西相差甚远。我可以想象一个系统有一个模板来填写各种情节节点、角色、时间线等等。我喜欢生成一些基础故事构思和场景的想法，但大纲似乎很少被遵循或融入故事。这真是一个大杂烩。我理解你们可能需要经过多次迭代，但我宁愿要更少、但更切题、更贴合大纲的文字，而不是把人物、城市、地点、基础素材在总体上搞得如此混乱的东西。
- 这个故事只是隐约触及了我所设想故事的一些片段。
- 这是一个有趣的练习，尽管也令人沮丧。除了第一次之外，我在所有情况下都更喜欢系统 B 的结果；在第一次中，它把我虚构的国家 Liberius 和 Liberia 搞混了。
- 我的两个故事都相当荒谬且不连贯。虽然我觉得系统 B 让内容更贴近所描述的大纲，但我认为系统 A 的自相矛盾比 B 稍少一些，可能讲出了一个更好的故事。
- 简要要点：
  1. 时间对齐的能力一团糟。例如，在第一个故事中，孩子们刚刚搬出去，比预期更早。顺着故事往下看，“Nadine 不确定她的女儿是否还想再见她，或是在这么多年之后还想再和她说话。”非常令人困惑。这种情况在两个版本中都反复出现，形式各异且大量存在。
  2. 故事中的角色描述与大纲中呈现的不符。这是两个故事版本在故事线和清晰度方面的一个主要问题。例如，Lillian 是她最好的朋友，Nadine 刚刚出版了她的书，但在故事的第二版中，Lillian 却是第一次出现在 Nadine 的生活中。
- 系统 A 似乎更容易跑偏，卷入与整体情节无直接关系的情节节点。
- 两个系统之间的差异相当大。
- 系统 A 似乎根本没有紧扣重要的情节节点（让已故角色毫无解释地复活、一个“失踪的父亲”的剧情线、凭空捏造的老师、错误的地点等等）。而系统 B 对故事的处理方式非常生硬，介于滑稽与冒犯之间（而这并非故事的本意）。话虽如此，B 确实完整地紧扣了情节节点，比 A 合理得多。
- 首先，让 AI 根据我们给出的提示写一个故事，这让我印象深刻，而且两个故事都算是连贯的。但是，它们都没有真正命中我通过提示想要表达的确切内容，而且都存在一些缺陷。系统 B 有时似乎在对话中陷入“循环”，比如当它们谈论谁更快时。它很快就变得重复，让我脱离了故事。出于某种原因，它还大量聚焦于一台 iPod，这也让我出戏。系统 A 的写作和叙事更令人愉快、更易读，但系统 B 的故事线似乎更符合我的想法，所以很难在这两者之间做出选择。如果我在使用这个系统，无论是哪个结果我都会非常满意，因为它们都是故事的出色草稿。
- 我觉得无论使用哪个系统，我都没有太多控制权，而且最终生成的段落似乎与大纲不太匹配，也不是特别连贯。有很多重复的时刻和片段，它们在故事语境中简直不可能，或者根本没有任何意义。
- 我认为系统 B 中更详细的大纲确实帮助故事塑造成更接近我所设想的样子。两段文字都有一些不一致之处，质量显得有所欠缺，但段落 A 在这方面更糟。例如，段落 A 中一个主要的问题是，它描述了 Daniel 和他的妻子没有孩子，但大纲中的角色列表显示他们有两个女儿。然而，段落 A 确实有一个整体上更令人兴奋的故事，包含更多细节和对话。在某种程度上，它读起来更像一个传统的小说故事，但它与大纲不一致。我仍然会更偏好系统 B，因为我能控制的细节程度更高，而且它更忠实于大纲。
- 我不知道系统 A 是用什么训练的，但它确实存在问题。除了不知道什么内容恰当或相关之外，它还有很多不合逻辑的推论和关于角色的自相矛盾的事实。B 的质量要高得多。
- 似乎能提供的细节越多，故事就会越好——没有系统 A 中的细节子层级，我的故事看起来要缺乏连贯性/合理性得多。而在写故事时，我绝对希望尽可能多地控制细节/不让它过于笼统，以至于把情节的很大一部分留给偶然，因此我喜欢系统 B。
- 令我感到有趣的是，系统 A 虽然依据的大纲不那么复杂，却生成了更长的段落……系统 A 的故事也许更悬疑/有趣，但有时说不通，而且忽略了我的大纲，因此系统 B 在几乎所有情况下都更符合我的构想。话虽如此，如果我只是单纯根据娱乐价值来评价这两个故事，而不考虑我的大纲和意图是什么，我可能会觉得它（系统 A）更有娱乐性（尽管它似乎确实比系统 B 更聚焦的故事稍微更散乱一些）。

## 附录 K：标注任务细节

Surge AI 将其平台的标注人员群体描述为“技能娴熟、受过良好教育的母语使用者”；我们没有进一步施加筛选。我们的数据收集被认定免于伦理审查委员会的审查。下面我们展示向 Surge AI 标注人员展示的各实验标注模板。

### K.1 主实验标注模板

**图 4** 展示了我们表 1 主对比所使用的标注模板示例。我们为每条标注向标注人员支付 1.20 美元，根据我们对平均任务时长的估计，目标是支付约每小时 20 美元。

**图 4：**表 1 主对比的 Surge AI 标注示例。此处为简洁起见，故事被截断。（本图为截图，图片内文字不在文本抽取范围内）

### K.2 人工交互实验标注模板

我们通过 Surge AI 的托管服务（Managed Service）运行了人工交互实验，因此任务由 Surge AI 根据我们的指示构建。任务由 5 个阶段组成，每次都有同样的 20 名标注者返回参与。系统 A 为 RE3，系统 B 为 DOC。5 个阶段的模板分别如**图 5、6、7、8 和 9** 所示。我们为此实验向 Surge AI 支付了 1000 美元，其中包括 20 名标注者的报酬，我们预计他们在实验的五个阶段中总共花费 30–45 分钟。

**图 5：**人工交互实验第 1 阶段的 Surge AI 标注示例。（本图为截图，图片内文字不在文本抽取范围内）

**图 6：**人工交互实验第 2 阶段的 Surge AI 标注示例。计划被删节。第 2 阶段第 2 部分的输出是 RE3（系统 A）的最终计划。（本图为截图，图片内文字不在文本抽取范围内）

**图 7：**人工交互实验第 3 阶段的 Surge AI 标注示例。计划被删节。（本图为截图，图片内文字不在文本抽取范围内）

**图 8：**人工交互实验第 4 阶段的 Surge AI 标注示例。计划被删节。第 4 阶段的输出是用于 DOC（系统 B）的最终计划。（本图为截图，图片内文字不在文本抽取范围内）

**图 9：**人工交互实验第 5 阶段的 Surge AI 标注示例。计划与故事段落被删节。关于作者原始意图的问题（Intent 指标）会针对每一对顶层大纲条目及其对应段落各询问一次，尽管这里只展示了一处实例。其余问题只在底部询问一次。（本图为截图，图片内文字不在文本抽取范围内）

### K.3 详细大纲相关性实验标注模板

**图 10** 展示了我们的标注模板示例，用于衡量给定段落是否包含低层大纲条目所描述的事件，对应于表 6 中的结果。我们为每条标注向标注人员支付 0.50 美元，根据我们对平均任务时长的估计，目标是支付约每小时 20 美元。

**图 10：**表 6 实验中详细相关性的 Surge AI 标注示例。（本图为截图，图片内文字不在文本抽取范围内）

## 附录 L：无过滤/重排的示例大纲

在**表 22** 和**表 23** 中，我们展示了在为详细大纲选择大纲条目时关闭过滤与重排基础设施后生成的前两个示例大纲。它们都明显存在问题，表现为重复的文本以及许多看似顺序错乱的事件。在这种无过滤无重排的设置下，我们在后续生成中也观察到了类似问题，这证明了我们的过滤与重排方案的必要性。

```
低质量详细大纲（过滤/重排消融）
1. Sarah Jensen 发现自己出身于一个女巫世家，必须接受自己的新现实。
a. Sarah 在力量开始显现时发现了自己的真实身份。
i. Sarah 的力量开始显现，她开始经历身边发生的怪事。
ii. Sarah 的父母告诉了她关于她的血统，以及她如何出身于一个女巫世家。
b. Sarah 最好的朋友 Jenna Howard 帮助她接受自己的新身份。
i. Jenna 帮助 Sarah 接受她的新身份，并带她进入巫术的世界。
ii. Jenna 帮助 Sarah 向她的男友 Aaron 坦白自己是女巫。
2. Sarah 在 Silas Baxter 的帮助下学习如何使用自己的力量，Silas 是一个将她收为徒弟的女巫。
a. Sarah 学习如何控制自己的力量并用它行善。
i. Sarah 学习如何施法并用她的力量行善。
ii. Sarah 必须阻止一个邪恶的女巫占领她的小镇。
b. Sarah 必须拯救被下了诅咒的父亲。
i. Sarah 的父亲被诅咒，变成了一只青蛙。
ii. Sarah 必须找到破解诅咒的方法来拯救她的父亲。
3. Sarah 必须用她的力量拯救她的小镇，免受一个想摧毁它的邪恶女巫的侵害。
a. Sarah 直面邪恶女巫并击败了她。
i. Sarah 在力量开始显现时发现了自己的真实身份。
ii. Sarah 学习如何控制自己的力量并用它行善。
b. Sarah 意识到她的力量伴随着重大的责任，必须明智地使用它们。
i. Sarah 学习如何使用她的力量。
ii. Sarah 从邪恶女巫手中拯救了她的小镇。
```

**表 22：**关闭大纲条目的过滤与重排后的第一个大纲示例。若干事件——尤其是大纲后半部分——显得顺序错乱或重复。

```
低质量详细大纲（过滤/重排消融）
1. 失去工作后，Jennifer Walters 在最好的朋友 Elise Miller 的帮助下开了自己的面包店。
a. Jennifer 被解雇，并决定在最好的朋友 Elise 的帮助下开一家面包店。
i. Jennifer Walters 被解雇了
ii. Elise Miller 决定辞去工作，帮助 Jennifer 开面包店。
b. 两人首先将一栋旧楼翻新成漂亮的面包店和厨房。
i. Jennifer 和 Elise 将一栋旧楼翻新成漂亮的面包店。
ii. 面包店很快获得成功，这要归功于主厨 Harry Miller 的美味食谱以及 Jennifer 及其团队提供的出色客户服务。
2. 面包店很快获得成功，这要归功于主厨 Harry Miller 的美味食谱以及 Jennifer 及其团队提供的出色客户服务。
a. Jennifer 和 Elise 倾尽全力让面包店获得成功。
i. Jennifer 和 Elise 首先将一栋旧楼翻新成漂亮的面包店和厨房。
ii. 面包店很快变得受欢迎，这要归功于主厨 Harry 的美味食谱以及 Jennifer 及其团队提供的出色客户服务。
b. 面包店很快变得受欢迎，这要归功于主厨 Harry 的美味食谱以及 Jennifer 及其团队提供的出色客户服务。
i. Jennifer 和 Elise 倾尽全力让面包店获得成功。
ii. 面包店很快变得受欢迎，这要归功于主厨 Harry 的美味食谱以及 Jennifer 及其团队提供的出色客户服务。
3. 随着业务增长，Jennifer 和她的家人面临新的挑战，但在社区的支持下，他们克服了所有挑战。
a. 随着业务增长，Jennifer 和她的家人面临新的挑战。
i. 随着业务增长，Jennifer 和她的家人面临新的挑战。
ii. 随着业务增长，Jennifer 和她的家人面临新的挑战，但在社区的支持下，
b. 在社区的支持下，他们克服了所有挑战。
i. Jennifer 克服了对失败的恐惧，决定开面包店。
ii. 所发生的支持性社区事件帮助这个家庭克服了他们的挑战。
```

**表 23：**关闭大纲条目的过滤与重排后的第二个大纲示例。与表 22 中的前一个示例类似，若干事件似乎顺序错乱或重复。

## 附录 M：主实验故事示例

最后，我们展示 DOC 在我们的主实验中生成的前五个完整的计划与故事示例，也就是说，这些示例并非经过刻意挑选。对于前两个故事前提，我们还额外展示了 RE3 和 ROLLING-OPT 生成的故事。我们在各题注中对每个示例分别作了简要分析。

总体而言，除了正文中所展示的强劲定量表现之外，从整体情节的角度乍看之下，DOC 的计划和故事也大体上显得合理。相比之下，RE3 和 ROLLING-OPT 在遵循高层计划、维持整体连贯性方面通常要差得多；ROLLING-OPT 的失败尤其严重。

当然，尽管与基线相比，DOC 暴露出的重大缺陷较少，但仍存在一些问题。例如，在 DOC 的大纲中，一个问题是某些大纲叶节点可能含糊不清，从而把大量创作性工作留给了起草阶段。此外，某些场景设定存在问题（例如，并不真的是地点），而且有时角色清单并不完整。

DOC 的故事通常相当好地遵循高层计划。然而，正如正文中所指出的，某些较低层次的细节常常被遗漏。偶尔，故事会因为连续遗漏若干低层细节而略微偏离轨道，不过它通常会在之后恢复过来。由于我们的提前停止（早停）标准，DOC 未能遵循大纲的那些段落不幸地也往往是最长的。毫不意外地，还存在事实一致性的错误，因为处理这类错误并非 DOC 框架的主要关注点。最后，还有一些次要的风格问题，例如倾向于反复使用角色的全名。

我们所有实验中其余的计划和故事，连同用于生成新故事的代码和模型检查点，都可以在 https://github.com/yangkevin2/doc-story-generation 找到。

### DOC 计划 1

**前提：** 在失去父亲之后，Shannon 决心追随他的脚步，成为一名成功的记者。然而，当她接下自己的第一个重大任务时，她很快发现，城市中丑陋的现实生活与她想象中的梦想相去甚远。

在新朋友——一个深谙街头生存之道的少年——的帮助下，Shannon 逐渐理解了内城严酷的生活现实，并明白有时候真相远不止是一个故事。

**场景设定：** 故事发生在一个大都市的内城。

**角色：**

1. **全名：** Shannon Doyle
   **角色画像：** Shannon Doyle 是一个二十出头的年轻女性。
2. **全名：** Gary Saunders
   **角色画像：** Gary Saunders 是一个住在内城的少年。
3. **全名：** Mike Doyle
   **角色画像：** Mike Doyle 是 Shannon 的父亲，也是一位成功的记者。
4. **全名：** Lena Saunders
   **角色画像：** Lena Saunders 是 Gary 的母亲，也是一位当地的企业主。

**大纲：**

1. Shannon 的父亲 Mike 意外去世，令她决心追随他的脚步，成为一名成功的记者。场景：角色：Shannon Doyle、Mike Doyle
   a. Shannon 的父亲 Mike 意外去世。场景：角色：Shannon Doyle、Mike Doyle
      i. Shannon 的父亲 Mike 意外去世。场景：Shannon 的家。角色：Shannon Doyle、Mike Doyle
      ii. Shannon 继承了父亲的遗产。场景：Shannon 的家。角色：Shannon Doyle、Mike Doyle
      iii. Shannon 搬到了城市。场景：Shannon 的家。角色：Shannon Doyle
   b. Shannon 决定追随父亲的脚步，成为一名成功的记者。场景：角色：Shannon Doyle、Mike Doyle
      i. Shannon 向当地一家新闻台申请了一份工作。场景：Shannon 的家。角色：Shannon Doyle
      ii. Shannon 的上司——新闻总监——派她去负责内城的报道。场景：Shannon 的家。角色：Shannon Doyle
2. Shannon 接下了她的第一个重大任务——一篇关于内城的专题报道，但她很快发现，城市中丑陋的现实生活与她想象中的梦想相去甚远。场景：角色：Shannon Doyle、Lena Saunders
   a. Shannon 接下了她的第一个重大任务——一篇关于内城的专题报道。场景：角色：Shannon Doyle、Lena Saunders
      i. Shannon 接下了她的第一个重大任务。场景：当地一家报社的新闻编辑室。角色：Shannon Doyle
      ii. Shannon 前往内城开始她的任务。场景：内城。角色：Shannon Doyle
   b. Shannon 很快发现，城市中丑陋的现实生活与她想象中的梦想相去甚远。场景：内城。角色：Shannon Doyle
3. 在新朋友 Gary 的帮助下，Shannon 逐渐理解了内城严酷的生活现实，并明白有时候真相远不止是一个故事。场景：角色：Gary Saunders、Shannon Doyle
   a. Shannon 遇见了 Gary。场景：角色：Gary Saunders、Shannon Doyle
      i. Shannon 遇见了 Gary。场景：内城。角色：Gary Saunders、Shannon Doyle
      ii. Shannon 和 Gary 成了朋友。场景：内城。角色：Gary Saunders、Shannon Doyle
   b. Gary 向 Shannon 讲述内城的情况。场景：内城。角色：Gary Saunders、Shannon Doyle
   c. Shannon 明白真相远不止是一个故事。场景：角色：Shannon Doyle
      i. Shannon Doyle 遇见了 Gary Saunders。场景：内城。角色：Gary Saunders、Shannon Doyle
      ii. Shannon 从 Gary 那里了解到内城的生活现实。场景：内城。角色：Gary Saunders、Shannon Doyle
      iii. Shannon 逐渐明白真相远不止是一个故事。场景：内城。角色：Shannon Doyle

**表 24：** DOC 在我们的主实验中生成的第一个计划。颜色标示了用于指导生成的叶节点。前提、场景设定和角色清单都是合理的，尽管“新闻总监”是继承自 RE3 的名称选择系统的一次失误。大纲大体上也是合理的，尽管最后一部分有时仍然含糊。

### DOC 针对计划 1 生成的故事

【警告：含有粗俗语言】

[Shannon 的父亲 Mike 意外去世。场景：Shannon 的家。角色：Shannon Doyle、Mike Doyle] 在父亲告诉 Shannon 他的计划之后，Shannon 第一次与父亲说话，是在那天晚上父亲打来电话说自己在医院里的时候。医生们注意到他的健康状况迅速恶化，便紧急把他送进了医院。Shannon 知道他身体有些不对劲，但她完全不知道情况有多严重。Mike 已经五十多岁，却仍然饮食健康、坚持定期锻炼。他看起来像是那种可以长生不老、不会承受任何后果的人。

Mike 去世时，Shannon 震惊不已。她哭了好几个小时，以为一切都会好起来。她以为父亲的生活会恢复正常。但随后她不得不面对这样一个事实：他永远地离开了。

父亲去世后，Shannon 哭了好几天。他走了以后，她感到无比孤独，多么希望能再和他最后说一次话。一天夜里，Mike 意外地回来了。他已经去世好几天了，却以鬼魂的形态回来了。Shannon 察觉到他的存在时震惊不已，起初既困惑又害怕。Mike 解释说，他回来缠着她，是因为不想再让她如此悲伤和孤独。他想让她再次感受到他的[Shannon 继承了父亲的遗产。场景：Shannon 的家。角色：Shannon Doyle、Mike Doyle]爱与关怀，尽管她知道他已经死了。

Mike 解释说，由于他意外去世，他其实没有为葬礼或其他事情存下多少钱。因此，Shannon 将继承他的一些资产，以及他为自己投保的一份人寿保险所赔付的一大笔钱。Shannon 得知自己将从 Mike 那里继承一栋房子、一辆汽车，还有一些现金，感到十分震惊。她简直不敢相信自己是如此幸运，尽管父亲已经去世，她仍能得到这么大一笔遗产。

[Shannon 搬到了城市。场景：Shannon 的家。角色：Shannon Doyle] Shannon 决定继续住在那栋她度过大部分童年的房子里。但在遗产到账之前，她需要工作来养活自己，于是她搬到了城市，那里有很多工作机会。Shannon 申请了许多工作，最终在当地一家报社谋得了一个文字编辑的职位。Shannon 并不后悔离开自己从小长大的小镇，因为那里除了关于父亲的回忆，什么也没有。她知道搬到城市会为她带来许多新的经历和机会。

[Shannon 向当地一家新闻台申请了一份工作。场景：Shannon 的家。角色：Shannon Doyle] Shannon 在那家报社只工作了几个星期，就被派去报道该市不断上升的犯罪率。起初她不确定该如何着手这项任务，但随后她想到，如果父亲遇到这种情况会怎么做。如果他还活着，他大概会亲自去负责城市的报道，因为他是一位经验如此丰富的记者。Shannon 决定自己也该采取同样的做法，于是她开始为第二天的报道做计划。

Shannon 决定从当地警察局开始她的调查，因为那里是获取犯罪统计数据最[Shannon 的上司——新闻总监——派她去负责内城的报道。场景：Shannon 的家。角色：Shannon Doyle]合理的地方。第二天一早，她来到警察局，一位开朗的年轻男子迎接了她，自我介绍是 Jack 警官。Shannon 告诉 Jack 警官，她是来报道该市不断上升的犯罪情况的，并问他能否提供一些统计数据。Jack 警官很乐意帮忙，于是他回到自己的办公桌前，拿出一份满是统计数据的报告。Shannon 惊讶于这座城市的犯罪数量如此之多，但也意识到自己的任务比想象中容易。Shannon 确信自己的报道会成为当晚六点新闻的头条。

离开警察局后，Shannon 买了些早餐，然后前往内城。她认为那里是开始调查的好地方，因为内城属于新闻采访线的范围。当 Shannon 看到第一个内城居民时，她吃了一惊，因为那是一个穿着破衣烂衫、看起来好几个星期没洗过澡的女人。她浑身脏兮兮的，散发着一股臭味，拎着一个装满瓶瓶罐罐的购物袋。她的头发沾满污垢、打结成块，还不停地吐口水[Shannon 接下了她的第一个重大任务。场景：当地一家报社的新闻编辑室。角色：Shannon Doyle]。Shannon 觉得这个女人或许是个不错的采访对象。

Shannon 作了自我介绍，问那个女人是否愿意跟她谈谈，那个女人却粗鲁地回应说，她没有时间接受采访，因为她必须在中午之前把啤酒瓶灌满，好去睡觉。

Shannon 对这个女人谈及犯罪问题时轻描淡写的态度感到惊讶，于是决定再多问几个问题。她告诉那个女人，自己是当地报社的记者，想了解内城的人们都在谈论些什么。她问对方，新闻里有没有什么特别想聊的话题。那个女人回答说：“这里什么都没发生，除了一帮蠢货和骗子。这里除了犯罪、愚昧和愚蠢，什么也没有。”

Shannon 又问那个女人想讨论哪些新闻报道。那个女人说没有，因为报纸上根本没有新闻报道，因为记者们并不关心内城的人们。

这时 Shannon 换了个话题，问她有没有什么值得报道的故事。那个女人回答说：“上新闻？你在跟我开玩笑吗？关于黑人如何被坑害的新闻？关于我们如何不得不喝喷泉里的尿水的新闻？关于在找不到公共厕所时我们如何不得不用双手当马桶的新闻？关于我们在地方和国家政府里如何没有发言权的新闻？新闻里的新闻？你觉得某个白人记者会告诉黑人他们自己的生活里正在发生什么吗？你觉得如果你告诉我们白人想要对我们做什么，我们会因为你告诉了我们[Shannon 前往内城开始她的任务。场景：内城。角色：Shannon Doyle]而感到高兴吗？新闻里的新闻？”

那个女人继续说道：“你说得对。我们没什么可聊的，因为这里什么都没发生。一切都停滞不前，没人在乎。内城里似乎没有人关心任何事情，你又怎么能指望记者来写我们呢？所以，不，我没有什么可以给你的。”这个年轻女人说的话很刺耳。

Shannon 专心地听完，然后感谢她抽出时间。她并没有被这个女人充满敌意的语气吓退。Shannon 继续去进行下一个采访。

“我想谈谈你们社区的高犯罪率。”Shannon 轻声对那个留着短茬胡须、头发蓬乱的中年男子说。“什么高犯罪率？”他既惊讶又不服气地回应道。

Shannon 环顾四周。很明显，周围的居民对这个问题的回答一点也不觉得惊讶。她知道，自己在这里发现的一切都会与她想象的不同，但这远远超出了她的预期。

“这个社区里有帮派斗殴吗？”Shannon 继续问道。“只有别的社区的人跑过来时才会有，不过那种事不常发生。那只是偶尔发生一次。那不是高犯罪率，那只是再普通不过的下流斗殴。当市政府任由别的社区的人在这个社区里横行霸道、为所欲为时，那不算高犯罪。那根本不是什么高犯罪率。那只是普普通通的丑陋和龌龊。这里没人在乎那个，因为根本没人在乎我们，连我们自己人都不在乎。他们嘴上说人人平等[Shannon 遇见了 Gary。场景：内城。角色：Gary Saunders、Shannon Doyle]，但没有人是平等的。我可没见过有色人种像在这里这样跑到别的社区去横行霸道，而且当他们来到这里、冲着我们来的时候，甚至没人试图阻止他们。”

Shannon 从小就被教导说，种族主义是过去的事了，但这个男人的回答改变了她的看法。她从未想过，有色人种在美国可能会感到自己受到歧视。他一定搞错了，她心想。如今不可能还有人那样想。

“Gary，你的腿怎么了？”Shannon 一边说，一边看着 Gary 裹着 Ace 绷带的左腿。“哦，Shannon。你真的不是这附近的人，对吧？你根本不是这附近的人。你从没下来过这里，什么都不了解吗？从没下来见过我和我其他几个兄弟？我们昨天还在聊你呢。Gary 说你是个漂亮的小姐，但我们得看看是不是真的。让你那漂亮的白人身子过来，见见 Gary 的其他兄弟。我们要看看你是不是真像 Gary 说的那么漂亮。”

Shannon 听到一个成年男人说出这种话，感到十分震惊；她这辈子从没听过这样的话。Gary 的反应，以及 Gary 的行为方式，也让她感到惊讶。

Shannon 一动不动地站着，被刚刚听到的话惊呆了。Gary 示意 Shannon 跟着他，他朝房间外走去。“跟我来，”Gary 语气急促地说，领着她沿着走廊走。“见见我和 Gary 的兄弟们。见见 Gary。见见几个真正的男人！那种拼命操、想要什么就拿什么的真男人！那种操年轻白人女人的真男人！见见那些真男人，他们不怕在漂亮的年轻白人女人招惹他们、坏他们的事时揍她！见见那些真正的男人[Shannon 和 Gary 成为朋友。场景：内城。角色：Gary Saunders、Shannon Doyle]，Shannon。看看他们都是些什么人！”

Gary 一边继续说着，Shannon 一边跟紧他的步伐。她跟着他走到街上，然后走上台阶，来到一栋两层楼房一侧的门廊上。“怎么回事？”Shannon 环顾门廊，问 Gary。门廊上站着六七个年轻男子；Shannon 以前见过他们中的许多人，却从没注意到他们有多英俊。Gary 正把她介绍给他们。“见见我的兄弟们，Shannon，”Gary 语气中带着自豪地说。Shannon 和每个年轻男子都握了手。

他们都对她非常友好，和她聊天、开玩笑。随后，Gary 又把她介绍给几个来自社区另一片的年轻男子，Shannon 也和他们握手，并友好地互致问候。随着她[Gary 向 Shannon 讲述内城的情况。场景：内城。角色：Gary Saunders、Shannon Doyle]对这些男人有了更多了解，她变得越来越自在；与此同时，Gary 正忙着把她介绍给更多聚集在外面的年轻男子。

Shannon 发现自己被一个接一个地介绍给年轻男子，他们每个人都十分友好、彬彬有礼。大多数人穿着牛仔裤和防风夹克或皮夹克；有些人戴着棒球帽或软呢帽。Shannon 也见到了几位年轻女子，并和她们一一握手。她注意到这些年轻男子大多是黑人，不过至少有一个是白人。

Shannon 了解到，内城里有两种男人：“真”汉子和“小”家伙。Gary 是个真汉子——他进过监狱，甚至还开枪打过人。Shannon 了解到，Gary 的一个最好的朋友曾在他和女友同床时被女友杀死。Gary 告诉她，这个朋友“坏到了骨子里”，还说如果她能了解住在内城的是些什么样的人，这个世界会变得更好。Gary 说他目前没有工作，但想找一份。Shannon 了解到，门廊上的大多数人都有工作，但没有一个人每小时挣超过 9 美元。[Shannon Doyle 遇见 Gary Saunders。场景：内城。角色：Gary Saunders、Shannon Doyle] Gary 说，她先前见过的大多数帮派成员很可能没有工作。

就在 Shannon 和 Gary 坐着聊天时，这群人中一个身材较高大的男子，绰号“Big Mike”，手里拿着一瓶啤酒朝他们走来。Gary 站起来，把 Shannon 介绍给 Big Mike。Shannon 和他握了手。“我是 Shannon Doyle，”她说，“我在《论坛报》工作。我今天来这里，是想了解你们的世界。Gary Saunders 告诉我应该来见见你们大家。”Shannon 把 Gary 作为自己的朋友作了介绍，Gary 点了点头。

Gary 把 Shannon 介绍给在场的其余人，包括一个绰号“Little Mike”的少年。Little Mike 是白人，身高约 5 英尺 8 英寸。他看起来更像 14 岁，而不是 18 [Shannon 从 Gary 那里了解到内城的生活现实。场景：内城。角色：Gary Saunders、Shannon Doyle] 岁。Gary 伸出手要和 Shannon 握手，Shannon 也向 Little Mike 伸出手，但他只是张着嘴呆呆地盯着她。Big Mike 递给 Shannon 和 Gary 每人一瓶啤酒，但只有 Shannon 接了过去。Gary 根本不喝酒。

Shannon 问 Gary 在内城住了多久。

“很久了，”Gary 说，“我出生在这里。我的父母是来自爱尔兰的移民，他们也在这里住了很久，后来在我 10 岁还是 11 岁时搬回了爱尔兰。”Shannon 了解到，Gary 今年 18 岁，这辈子从没被雇佣过。他 8 岁时父母就去世了，抚养他的责任落到了一个姑姑身上。两年前他高中辍学，因为他在[Shannon 逐渐明白真相远不止是一个故事。场景：内城。角色：Shannon Doyle]学校因为穿着和不喜欢体育而被欺负。

“我不想穿学校里人人都穿的那种最新款运动鞋和帽子，我也一点都不关心谁赢了足球或冰球比赛。我就是不合群，Shannon。”

“你从没把被欺负的事告诉过父母吗？”“绝对没有，Shannon！我不打算向父母承认我在学校被欺负了。他们肯定会想亲自到这儿来，和校长、那些欺负我的人当面谈，设法找出解决办法。而且那样做也毫无帮助。我当时根本没意识到，把发生的一切都告诉父母才是正确的做法。”Shannon 注意到，Gary 的声音渐渐低了下去，陷入了沉默。

“再给我讲讲你自己吧，Gary，这一次请告诉我真相。为什么对我说真相对你如此重要？你为什么要诚实？你知道我想成为一名记者。真相远不只是一个词。它是你周围的一切，是你接受为真实的一切。一切真实的东西都很重要，而且一直都很重要。就连故事里也包含着某些真相，或者基于过去或现在某些真实的东西。但故事不是真实的，它们只是别人对真相的认知。真相是实际发生过的事，或者是正在发生的事。有时候人们不愿意相信真相，因为真相太难让人接受。我想知道关于你、关于这个地方的真相，Gary。请你告诉我真相。”Shannon 用恳求的眼神看着 Gary。

Gary 深吸一口气，开始说道：“我想对你诚实，是因为我觉得你能帮助我，也是因为我觉得你和所有来过这里的其他人都不一样。每个人总是问同样的问题，却从不真正去听答案。我看得出你不一样，Shannon。你看起来是真心在乎的。”

Shannon 理解地点了点头。“我确实在乎，Gary。只要我能做到，我想帮助你。”

**表 25：** DOC 为表 24 中所示计划生成的故事。方括号中的彩色文字标示了其后文本所对应的大纲条目。尽管并非每个段落都与其所依据的低层大纲条目完全对应，但整体情节是连贯的，并且总体而言相当忠实于大纲。

### RE3 针对计划 1 生成的故事

**表 26：**RE3 针对表 24 所示计划生成的故事。它在一定程度上遵循了高层计划，但不如 DOC 遵循得好。

阳光透过 Shannon Doyle 公寓的窗户明亮地洒进来。才刚过早上七点，她就已经醒了好几个小时。今天对 Shannon 来说是重要的一天。她刚刚拿到第一份重要任务，迫不及待地想要开始写作。她前一天晚上没睡好，花了很长时间思考自己想写些什么。

从新闻学院毕业并在主流报纸找到第一份工作，是 Shannon 迄今为止最大的成就。从小时候起，Shannon 就梦想成为一名像父亲那样成功的记者。她会花上好几个小时盯着父亲装裱起来的文凭，读他写过的文章。她想要成为他那样的人。

她的父亲 Mike Doyle 曾是一位出色的作家和记者。多年来，他因在全国各地报纸和杂志上发表的作品获得了许多奖项。他从一家小镇报纸起步，随后转到更大的城市，最终在《华盛顿邮报》（The Washington Post）谋得了一份记者工作。Mike 在业内备受尊敬，经常飞往世界各地采访报道。他写过南非、俄罗斯、埃及等国家。他曾采访过 Nelson Mandela、Mikhail Gorbachev 和 Hosni Mubarak 总统等名人。许多人都会认同，他是业内最优秀的记者之一。

成年后，Shannon 追随父亲的脚步，进入马里兰大学新闻学院就读。她确信自己毕业后很快就能找到一份好工作。Shannon 一直认为自己非常勤奋，她知道自己的付出从长远来看会有回报。虽然没能立刻找到工作，Shannon 依然保持耐心，坚信梦想终会实现。终于，在投递简历、申请了无数职位数月之后，她接到了《华盛顿邮报》的电话，对方为她提供了报社的实习职位。

今天是 Shannon 作为《华盛顿邮报》全职实习生的第一天，她急于开始报道自己的第一项任务。她迅速穿好衣服，下楼到厨房给自己泡了一杯茶。她知道这对牙齿不好，但一天不先来一杯热伯爵红茶，她就无法开始新的一天。Shannon 出生在马里兰州 Rockville 的一个中产家庭。她的母亲 Lena 经营着自己的生意；她擅长室内设计，在这一领域多年事业有成。他们夫妻二人和两个孩子 Gary、Shannon 一起住在市郊一栋简朴的房子里。她父母的婚姻并不幸福，但他们一直维持到父亲三年前去世。Mike Doyle 在 49 岁时被诊断出结肠癌，仅三个月后便去世了。

从马里兰大学毕业后，Shannon 搬进了她在 College Park 的第一间公寓。她很快习惯了独居生活，许多夜晚都和朋友们在当地酒吧度过。虽然她在一个多少有些宗教色彩的家庭中长大，Shannon 还是认定自己不再相信上帝或来世，并且变得非常放荡。她在大学第一年就与二十多个不同的男人发生过关系，甚至在开始《华盛顿邮报》的实习后仍继续与人乱搞。

当 Shannon 端着茶在餐桌旁坐下时，她环顾四周，看着墙上挂着的家人照片。她想给编辑留下好印象，希望他看到她和世界各国领导人、前总统及其他重要人物合影的照片时能留下深刻印象。

Shannon 的父母都已去世，但她和父亲尤为亲近。她一直钦佩父亲对生活的热情，以及凡事都要做出一番成就的强烈抱负。虽然父亲去世时只有 49 岁，Shannon 知道他在新闻界才华横溢、备受尊敬。他在《邮报》当了 23 年记者，最后死于癌症。

Shannon 的工作竞争极为激烈，她知道必须非常努力才能成功。她最大的恐惧是无法达到别人对她的期望，也担心新编辑会对她的工作感到失望。Shannon 最不希望的就是让任何人失望。她热爱当记者；这一直是她梦想的职业，她努力磨练自己的技艺。喝完茶，最后看了一眼墙上装裱的照片，Shannon 从台面上抓起包，走出门去。当她走进《华盛顿邮报》所在的办公大楼时，Shannon 环顾四周，打量着周围的环境。她注意到一切都那么漂亮；这与她想象中的样子大不相同。走进大楼后，她的第一个念头是自己完全不知道会发生什么。她不确定会见到多少人，也不确定自己的工位会是什么样子。她只知道希望别人高看她，这意味着要有出色的想法、写得一手好文章，好让编辑对她的工作印象深刻。

走到新闻编辑室大约花了 10 分钟。进去之后，Shannon 才意识到这座大楼有多大。这里有无数条走廊，一扇扇门通向数不清的办公室，Shannon 很难找到自己的那间。走过几条走廊、拐过几个弯后，她终于找到了自己藏在编辑室一角的工位。Shannon 花了一些时间整理，才开始着手自己的任务。她感觉每次一转身，就会有别人制造出某种需要她去解决的麻烦。其他实习生似乎都准备好了自己的任务，但没有人看起来遇到任何麻烦；他们个个都像经验丰富的专业人士，早已学会轻松地完成工作。Shannon 意识到自己有点过于夸张了。她知道该怎么干活，只是难以开头。

整理完工位后，Shannon 戴上耳机，开始写她的稿子。起初，她觉得只要从一本关于城市生活话题的书里摘一段出来，用作稿子的参考就行了。她盘算着，在动笔之前，至少应该对自己要讲的内容有个基本了解。

Shannon 走进另一个房间，拿起三本书，打算在动笔前先通读一遍。她想写的主题是城市生活，于是拿了两本相关主题的书，又挑了第三本作为可能的参考。前两本书看起来主题相近，但 Shannon 惊讶地发现它们的内容其实完全相反：一本强调城市生活的消极面，另一本则强调其积极面。

Shannon 很快意识到，这两本书与其说讲别的，不如说更多是在讲社会学。这些书最终不过是大量信息的汇编，根本不能用作文章参考，更别说稿子了！

此时 Shannon 不知道该怎么办。如果她不得不在对话题缺乏真正了解的情况下写稿，那就只能把故事建立在别人的观点之上。然而她知道，过度依赖观点可能相当危险，尤其是在谈论城市生活这样有争议的话题时。

Shannon 想回到图书馆，再借一两本更偏文学性的书，好帮助她更好地理解这个主题。不过她知道，如果要在动笔前再读完一本书，时间会很紧。尽管如此，Shannon 觉得如果那晚不出去、留在家里写稿，或许还来得及。

犹豫片刻后，Shannon 决定留在家里写稿。她真的很想把第一项任务做好，她知道留在家里写稿是实现这一点的唯一途径。

Shannon 迅速整理完桌上所有的文件，这让她能更专注地处理手头的任务。她走回房间，抓起三张纸，开始写下她认为需要解答的所有问题。

写着写着，Shannon 意识到每一个问题又引出了更多问题。其中有些是简单的问题，打个电话或花几分钟查资料就能解答，另一些则可能需要花上几个小时去翻公开的法庭记录和旧报纸文章。

Shannon 还意识到，她提出的每一个问题，其他记者在最近也提出过。事实上，单看她的笔记，Shannon 就找到了四位不同作者写的四篇文章，每一篇都几乎回答了她向自己提出的所有问题。每篇文章都涉及城市生活的不同方面，而且都是近十年内写成的。

Shannon 决定在写剩余稿子时把这些信息记在心里。她知道不想抄袭任何作者的作品，但对她来说，充分了解别人此前对这一话题的论述很重要。通过尽可能多地收集信息，Shannon 就能对这个主题形成自己的观点，然后基于这些观点写出一篇原创的稿子。她也知道，面对这么多解读各异的文章，很难找到一个能涵盖她对该主题全部想法的答案。

她决定先从最简单的问题入手。她拿起电话，拨通了一位全国城市联盟（National Urban League）人士的号码，问他能否提供一些关于华盛顿特区的基本人口统计数据。

寒暄了几分钟后，Shannon 提出了自己的问题，并惊喜地得到了电话那头那位男士的详细回答。

“该区人口约为 615,000 人，其中超过 51% 的居民是非裔美国人。大多数居民年龄在 25 至 64 岁之间，但该地区也生活着大量儿童。这里还有庞大的同性恋群体，不过人数自九十年代初的峰值以来一直在下降。”

Shannon 感谢他抽出时间，也感谢他提供了如此详细的回答。他告诉 Shannon，如果她对这个话题还有更多问题，可以随时致电城市联盟，他们很乐意提供帮助。

这么快就得到答复让 Shannon 依然兴奋不已，她调出《华盛顿邮报》的头版，开始浏览文章。她读了大约一个小时后，报社编辑把她叫进了办公室。

她一到，编辑就递给 Shannon 一个信封，里面装着她第一项任务的一些背景资料，并告诉她两周内交稿。

编辑是一个叫 Gary Saunders 的男人，今年六十五岁，灰白头发日渐稀疏，身材魁梧。他走路有些跛，但还能在编辑室里自如走动。Gary 的办公室很小，但很舒适，布置得体，桌上摆着家人的照片，还有他多年来在编辑室其他职位上获得的各种奖项。Lena Saunders 是 Gary 的母亲，是一位本地企业主。她的嗓音低沉，但为人善良睿智。

她谢过编辑，回到自己的办公桌前继续为稿子做研究。大约一小时后电话响了。她拿起听筒，一个嗓音低沉的女人问能否与 Shannon Doyle 通话。她点头，告诉对方她在一号线上。那女人自我介绍说是 Lena Saunders，Gary 的母亲，也是马里兰州 Rockville 当地报纸的出版人。

Saunders 夫人问 Shannon 是否有兴趣为他们给当地报纸撰写的一篇关于本地企业主的文章，写一篇关于 Mike Doyle 的人物特写。Shannon 欣然同意，Saunders 夫人把 Gary 的电话号码和地址给了她。道谢之后，Shannon 把所有信息记在一个黄色小本子上，然后坐下来继续做研究。

前一天她没能和 Mike 说上话，但就在那天早上八点，她和 Mike 有个约。她从桌旁起身，退出电脑，把笔记锁在办公室里，然后走出大楼，朝地铁站走去，准备乘车进城。

Shannon 和几位同事一起乘地铁进城，他们当晚要去参加办公室聚会。Shannon 也受到了邀请，但她那晚已经和 Gary 有约，不想临时爽约。她确信一切都会顺利，也能和 Mike 及其家人把事情处理好。

Shannon 走进 Doyle 家餐厅所在的办公楼，把驾照递给前台的保安。幸运的是，里面不用等位，Shannon 走进去时，Mike 热情地和她打招呼。她和他一起在卡座里坐下，一边啜饮咖啡，一边讨论她的写作任务。Shannon 的脑子里飞快地闪过关于 Mike 和他家人的问题。她想了解他的一切，但又不想显得咄咄逼人，毕竟他们才刚刚认识。

Mike 解释说，他在 Rockville 创业是因为想让家人搬离城市。他不喜欢让妻子和两个儿子每天去巴尔的摩最糟糕的一些社区上班。他开餐厅时，起初生意清淡，但不到六个月，周边大多数餐馆纷纷关门，改头换面成了 Doyle 家连锁店。他的餐厅是 Rockville 最受欢迎的用餐地，在 Zagat 网站上也是评分最高的餐厅之一。Doyle 先生似乎为自己的成功感到自豪，那天早上也非常乐意和 Shannon 聊上几个小时他的家庭。

虽然已经和他待了三个小时，Mike 的故事对 Shannon 来说仍有大片谜团。她想进一步了解他和他的家人，但他似乎不太愿意继续谈论他们。

他岔开话题，开始谈论他的妻子 Elizabeth 和他们的两个儿子。Shannon 不想失礼，于是顺着他的话，任由 Mike 絮絮叨叨地讲 Liz 和孩子们。他告诉她，一家人非常亲密，经常一起说走就走地出游。

Shannon 问 Mike 他的儿子们多大了，他自豪地宣称大儿子 Edward 十四岁，是个优秀的学生。当他提到 Edward 在数学上有天赋、打算高中毕业后上约翰斯·霍普金斯大学（Johns Hopkins University）时，Shannon 笑了。

Shannon 难以置信地看着 Mike，心沉了下去。她知道在大多数社区，上大学都很难，更不用说从全国最好的大学之一毕业了。

Mike 继续谈论他的大儿子。他告诉她，Edward 在当地的社区中心做志愿者，最近还被乔治城大学（Georgetown University）一个很有声望的暑期项目录取了。Shannon 真想冲他大喊：“那你小儿子呢？难道他哥哥有机会去乔治城，而他就在内城区过着凄惨孤独的日子吗？”但她知道，除非直接问，Mike 绝不会主动透露这些。

Mike 又喋喋不休地讲起他的小儿子 Gary。Shannon 还没来得及忍住，就听到他说 Gary 只有十岁，顿时惊得张大了嘴。十岁。她一下子明白了 Mike 为什么难以谈论自己的家庭：他在撒谎，好让自己显得比房间里其他人更了不起。

Shannon 起身离开餐桌，冲进女洗手间，把自己锁在一个隔间里，掏出手机打给 Gary。那晚早些时候她在采访 Mike 时见过 Gary，但他们只是随便聊过几句。电话响了四声才被接起。

“喂？”电话那头传来一个尖细的声音。

这熟悉的声音让 Shannon 很困惑，因为她刚刚才意识到，自己一直想打给的是 Mike，而不是 Gary。她立刻为这个错误道歉，解释说自己想联系的是 Mike，不是 Gary；但转念一想，这也完全说得通，因为无论是她与 Mike 的采访，还是这通尴尬的电话，都像一场噩梦一样令人费解。

Gary 一定是察觉到了 Shannon 声音里的紧张，或者听到了她自言自语，因为他告诉她一切都好。Shannon 松了一口气，因为 Gary 如此平静，但她纳闷，他父亲刚被她撞见说谎，他怎么一点都不在意。这通电话只持续了几秒钟，Shannon 就挂断了。她不知道自己为什么要打给 Gary，但和他聊过之后至少感觉好了一些。她很快回到餐桌旁，Gary 和他母亲正耐心地等她回来。没人提起那通电话，Mike 讲完自己最爱的度假胜地和最近去夏威夷的经历后，大家似乎都享用起了晚餐。

Mike 又讲了大约二十分钟，Shannon 再也受不了他没完没了的絮叨。Mike 自认为圆滑又有魅力，但其他人都觉得他无趣。Shannon 一感到不舒服，就再次借故离开，上楼回到了酒店大堂。

说她被刚才发生的一切弄得一头雾水，都算是轻描淡写了。她根本不认识 Mike，也没兴趣进一步了解他，因为他的回答太不切实际。她知道他从不离开 Rockville 去度假或去任何别的地方，那他怎么可能对夏威夷了如指掌？她需要睡一觉，然后再下楼，努力装作一切如常。

### ROLLING-OPT 针对计划 1 生成的故事

**表 27：**ROLLING-OPT 针对表 24 所示计划生成的故事。ROLLING-OPT 在维持整体情节连贯性方面挣扎得很厉害，叙述中出现了一些突兀的变化。

Shannon 在父亲那间破旧的公寓里来回踱步。空气中弥漫着新油漆的气味，墙壁是一种暗淡、毫无生气的棕褐色。这地方有一种说不清的奇异的宁静。也许是因为这里找不到她父亲的任何痕迹，连他那无处不在的雪茄味都一丝不剩。

再过短短几个小时，她就要站在一个曾是她整个世界的男人的墓前，而这一切来得太快，她根本来不及消化。如果他能以任何别的方式离世，她都会好受些。唯独不该以这种方式。这一切太突然了，毫无道理可言。

她的目光落在厨房的桌子上，随后看到了它——那个盒子，就放在他叠得整整齐齐的账单上面。

她从桌上拿起盒子打开，满心以为会看到一套新的高尔夫球杆或一个昂贵的渔线轮。

结果里面装满了七十年代和八十年代的旧报纸。她随手抽出一份，手指拂过那沙沙作响、已经泛黄的纸张。一帧几十个孩子围着火堆、往火里扔石头的照片占据了页面上半部分。照片里有些孩子年龄只有她的一半。

“这些东西不能留在这里，”她自言自语道，“要是着火了怎么办？”当她转身要把盒子拿到垃圾桶边时，目光又落在旁边另一摞报纸上。

“天哪，”她低声说。

她的父亲曾是一名记者，一名真正的记者。他曾在一家叫《每日报》（The Daily）的报社工作，毕生致力于把真相公之于众。如果他还在这里，看到她要扔掉他的作品，一定会大为震惊。他大概会从她手里夺过来，自己去把它们埋了。

她踉跄着回到桌边，从盒子里抽出一沓报纸，用手指飞快地翻着。她不知道这些报纸都写了什么，但她能看出它们很重要。这些是举足轻重的报道，是人们关心的报道。

她把报纸塞回盒子里，把盒子推进行李袋，然后开始继续翻找。把所有这些都翻一遍太痛苦了，但她决心要做完。

“你在干什么？”身后传来一个声音。“我见过你几次经过我家门口。你看着面熟，但我记不起在哪见过你了。”

Shannon 转过身，看见一个漂亮的女孩站在她身后，留着一头长长的卷发，穿着旧牛仔裤和一件旧背心。“抱歉，”Shannon 说，眼睛仍盯着那些报纸，“我不是有意失礼。我只是想把我爸爸的东西从这里弄出去。”

她转身面向女孩，但目光却被女孩身后什么东西吸引住了。街正对面那间公寓的窗户里有一张新照片。很难看清照片里发生了什么，但她能看出像是一群少年围着一个老人，老人瑟缩地站着，他们正朝他扔石头。

“我以前见过那张照片，”女孩说，“你知道那是你爸爸拍的吗？他老是随身带着相机。”

Shannon 不知道该说什么。她的眼睛仍紧盯着那张照片。

“顺便说一下，我叫 Lisa，”女孩指了指自己说。

Shannon 看着她点点头，但没有说话。

女孩走近了些。“你不必把它们扔掉。如果你愿意，我可以利用它们。我在和你爸爸不同的报社工作，但也许我们可以互相帮助。你爸爸和我是朋友。”

Shannon 不敢直视女孩的眼睛。她从包里拿出盒子，塞进 Lisa 怀里。“我叫 Shannon，”她轻声说，“谢谢你的好意，但我不能收下它们。我必须把它们处理掉。”

她转身要跑开，Lisa 却轻轻抓住她的胳膊拦住了她。

“我理解。我只是想帮忙，”Lisa 温柔地说，“我知道失去所爱之人是什么滋味，但一切都会好起来的。”

她话里的真诚穿透了 Shannon 的痛苦，Shannon 望向 Lisa 的眼睛，想从中寻找真相。她在那双眼睛里看到一种与自己相似的痛苦，但同时也看到一种一切都会好起来的笃定。

“谢谢你，Lisa。我想我需要的正是听到这句话。”

Shannon 转身走开，走下台阶，来到街上。她不知道自己要去哪里，但她终于准备好离开这间可怕的公寓了。

她走了好几个小时，探索着这座她一直梦想居住的城市。

她走进一家小餐馆，点了一份汉堡配薯条和一杯可乐，但几乎没怎么动。她胃里翻腾，也说不清为什么。她觉得有什么不对劲，或是缺了什么，却不明白那是什么。

她漫步在城市街头，试图理清自己的情绪。她已经把装着父亲作品的盒子扔进了垃圾桶，却觉得比之前更加空虚。她没有在那些照片里找到任何平静，她知道 Lisa 说得对：它们只是让她的失去更加痛苦。

她走在街头的人群中，看着汽车飞驰而过。仿佛别人都过着有奔头的生活，而她却只是站在那里，看着这一切发生。

就在这时，她看到了他。那个照片里的男孩，和那位在地铁上捡到盒子的老教授在一起。他们沿着街道走着，一路上有说有笑。她走近时，他们似乎没注意到她；但当她走到离他们只有几步远时，她听到他们在说话，便停下了脚步。

“我跟你说过我不会那么做的，”男孩说。

“你前几次也这么说，可你还是做了。这次有什么不一样？”

“因为我就是这么说的！”他笑着说，跑到老教授前面，开始追他。

老人开始在街上跑起来，想拉开自己和那个年轻追赶者之间的距离。男孩跑到汽车前面，在人群中闪转腾挪，又推开其他人，一心想抓住他。

男孩奔跑时，Shannon 从另一个角度看到了他。她越过那身脏衣服和乱蓬蓬的头发，看清了他的脸，看到的是一个充满活力与欢笑的男孩。她看到一个总是面带微笑、总爱和别人开玩笑的男孩，但显然那并不是因为他不在乎，而是因为他太在乎了，他害怕失去他所爱的人。

男孩追上了老人，老人此刻正沿着街道快步走着。男孩跑到他身边，抓住他的胳膊，把他拉停下来。

“我听到你说的话了，但那不重要。不管我做多少次都不重要，只要我不再做了就行。而且我不会再做了。”

男孩对男人笑了笑，两人便一起沿着街道走了。

望着他们离去，Shannon 感到一阵释然涌遍全身，她终于明白了自己生活中缺失的是什么。她转身离开街道，回到城里，去开始书写自己的故事。

Shannon 回到家，决定先小睡一觉，再开始创作她的故事。

她需要休息，但没有关灯。她透过公寓的大窗户，看着楼下街道上匆匆赶路的人们。他们似乎行色匆匆，但每个人都有要去的地方，都有想见到的人。她坐在沙发上，拿出那盒照片，一边重新翻看，一边思考着人们如何度过自己的一生。

Shannon 一直对报纸和新闻节目里呈现的故事着迷。小时候，她就想成为一名记者，好亲自讲述那些故事。她喜爱这些故事对人们的影响力，喜爱它们如何改变人生、如何让人们睁开眼睛看清周围的世界。人们或许不会相信看到的每一个字，但至少它们有能力让这个世界有所不同。她也能有所作为。她想看到别人看不到的东西。

她翻着相册，停下来看一张照片：两个男孩坐在门前的台阶上，对着镜头微笑。那天阳光明媚，其中一个男孩搂着另一个，仿佛在给他取暖。这张照片让 Shannon 心里暖暖的，她微笑着想，没有人能说他们没有未来——有这样一张照片，就不会。

Shannon 合上照片，拿出笔记本电脑，开始写她的故事。她想捕捉内城区人们的生活与精神，但首先她需要去了解他们。她需要和他们交谈，赢得他们的信任，好让他们愿意向她敞开心扉。这是她独自一人做不到的。

她开始打字时，Shannon 想到为了完成这次采访，她得去和多少人交谈。她需要和收容所里的人谈，孩子们就住在那里。她需要和社区里认识她的采访对象、了解他们故事的人谈。她需要和教过他们的老师、爱着他们的父母谈……而对其中一些人来说，是失去了他们的父母。

“妈？妈！”Shannon 的妈妈跑进客厅。“你得来看看这个！门口停着一辆新闻采访车。”

Shannon 站起身，从思绪中抽离出来。“真的吗？你觉得会是关于我的吗？”

她母亲摇了摇头。“大概不是。但我想你该知道，万一他们想采访你呢。”

“我会的，”Shannon 同意道。她跳下沙发，跟着母亲来到公寓的前窗边。

她能看到一辆小型新闻采访车停在街上，她看着周围的人跑到自家门口，想看看发生了什么事。

“不过，我觉得他们不会是为了我来的，”Shannon 说。

“大概只是某个名人或者什么吧。”

她母亲点点头。“但谁也说不准，”她说，“可能是关于收容所里那些孩子的报道之类的——那对他们会是很好的宣传。”

Shannon 回想着自己的相册和那张两个男孩在内城区一起长大的照片。她希望，如果她能讲述他们的故事，就能帮助别人用新的眼光看待他们和他们的未来。

2012 年 11 月 23 日，星期五

本周的提示（prompt）如下：

写一个故事，其中一个人物必须做出选择；选项是：a) 继续走他们现在走的路，直到其自然结局（无论那会是什么）；b) 做出重大的人生改变；c) 回到过去改变一些事情。

我的故事前提（premise）如下：

一个女人毕生都在探索奇异而危险的事物，无论在工作中还是个人生活里皆是如此，如今她面临着一个可能危及她辛苦奋斗所获得的一切的新挑战。

当前故事大纲：

那只是一场梦——仅仅是一场梦。她知道她必须相信这一点，因为如果那是别的什么，她的双手就不会颤抖，心脏也不会狂跳。它们一定只是对一天的压力做出的反应；怎么可能不是呢？有太多变数，太多可能出错的事情。她必须记住这一点。

她正在和团队开会，为公司追逐多年的一个重要合同做准备。而现在，到了这么晚的时候，他们终于有了拿下这笔生意的机会。这对他们来说是件大事，对她来说也是件大事。这本应是她事业的巅峰——朝着她一直瞄准的高级副总裁职位迈出的重要一步。

她整晚都在做演示文稿，一遍又一遍地核对数字。她不得不亲自动手，因为团队成员都拒绝了，说不想在开会前熬一整夜。他们让她自己去弄；她自己能行，他们早上会尽力帮忙。

但她不想成为犯错的那个人，她想确保在向客户演示之前一切都安排妥当。

可现在，她就站在他们面前，语无伦次地讲着市场份额的变化、市场增长和客户反馈，而她真正想做的，只是把这堆烂摊子推给别人，然后尖叫着冲出房间。

她确信每个人都能察觉到她的情绪，他们一定在纳闷她到底怎么了。她仿佛既说不出话也动弹不得，只能拼命克制自己不冲出房间。

“Martin 小姐？”团队里一个较年轻的成员终于开口，“也许你该休息一下？你熬了一整夜了。”

她望着他的眼睛，有那么一瞬间，她觉得他也许是对的。但她不能那么做；那对公司是灾难，对她也是灾难。不，她只能硬撑下去，把会开完。等她忙完，就能完成演示文稿，然后去睡一觉。她不太确定自己该怎么办，但她知道，如果在付出了这么多时间和努力之后，此刻崩溃，那将是她能做的最糟糕的事。

“好吧，”她说，“我们继续开会。”

会议继续着，她继续讲着她准备了好几天的一切。尽管正处于演示当中，她还是一再地看表，倒数着会议结束的时间。

她以为快结束了，这时传来了敲门声。

“请进，”她说，甚至懒得去看进来的是谁。

她听到门开了又关上，便继续讲着，尽管听起来好像有人开始穿过房间。当她终于抬起头，看清是谁进了房间时，她的心停跳了一秒。

是她的父亲。

他站在门口，微笑着看着她——那是她小时候记得的那种微笑之一。

“嗨，”他说，而她终于意识到那并不是真正的他，因为他太高太瘦了。这个男人的肩膀宽阔，身形瘦削，头发灰白。

“你吓到我了，”Shannon 说，但站在她面前的男人仍继续微笑着。

“对不起。我差点没来，”他说。他开始朝她走来，她注意到他身旁站着一个女人。那女人看着很陌生，Shannon 想，她一定是他昨晚在一起的那个人。

“Shannon？”她父亲说，她终于意识到那就是他。“是我，你爸爸。”

她简直不敢相信；他就站在她面前。自从母亲自杀后，他们就再没说过话，而她在被送走与姨妈同住之后，他也从未来看过她一次。但在经历了这一切之后，在离开姨妈家、回到这座城市之后，她想见到他。她需要见到他。她不确定自己是想拥抱他还是扇他一巴掌，但她想见到他。

“嗨，爸爸，”她说。

她不知道该说什么，也不知道该做什么；看着他站在那里，感觉太奇怪了。最后，他向前迈了一步，张开了双臂。

“Shannon，我们需要谈谈你的……”（原文在此处中断。）

### DOC 计划 2

**表 28：**DOC 在我们主要实验中生成的第二个计划。颜色表示用于引导生成的叶节点。这份大纲的整体情节相当合理。在场景检测方面存在一些失误，即有些场景指的是情节点而非地点。

**前提：**一个年轻女子决心永不结婚、独自生活，但当她遇到一个对她而言似乎完美无缺的男人时，她开始重新考虑自己的决定。

**场景设定：**故事发生在美国的一个小镇。

**角色：**

1. **姓名：**Jenna Adams
　　**角色画像：**Jenna Adams 是一个二十出头的年轻女子。

2. **姓名：**Brian Johnson
　　**角色画像：**Brian Johnson 是一个三十出头的男人。

3. **姓名：**Mary Smith
　　**角色画像：**Mary Smith 是 Brian Johnson 的母亲。

4. **姓名：**Teresa Campbell
　　**角色画像：**Teresa Campbell 是 Brian Johnson 的前女友。

**大纲：**

1. Jenna Adams 遇见 Brian Johnson，立刻被他吸引。场景：角色：Jenna Adams、Brian Johnson
　　a. Jenna Adams 遇见 Brian Johnson，对他产生了一种即时的联结感。场景：角色：Jenna Adams、Brian Johnson
　　　　i. Jenna Adams 第一次遇见 Brian Johnson。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson
　　　　ii. Jenna Adams 和 Brian Johnson 开始交谈，很快成为朋友。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson
　　b. 两人开始约会，Jenna Adams 开始爱上 Brian Johnson。场景：角色：Jenna Adams、Brian Johnson
　　　　i. 两人开始约会，Jenna Adams 对 Brian Johnson 的爱与日俱增。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson
　　　　ii. 然而，Brian Johnson 的母亲 Mary Smith 不赞成 Jenna Adams，并想尽一切办法拆散他们。场景：美国的一个小镇。角色：Jenna Adams、Mary Smith、Brian Johnson
　　　　iii. 尽管如此，Jenna Adams 和 Brian Johnson 的感情继续日益深厚。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson
2. 当 Brian Johnson 看起来像是 Jenna Adams 理想中的完美男人时，她开始觉得也许婚姻并没有那么糟。场景：角色：Jenna Adams、Brian Johnson
　　a. 当 Brian Johnson 看起来像是 Jenna Adams 理想中的完美男人时，她开始觉得也许婚姻并没有那么糟。场景：角色：Jenna Adams、Brian Johnson
　　　　i. 当 Brian Johnson 看起来像是 Jenna Adams 理想中的完美男人时，Jenna Adams 开始觉得也许婚姻并没有那么糟。场景：Brian Johnson 开车送 Jenna Adams 约会后回家途中的车里。角色：Jenna Adams、Brian Johnson
　　　　ii. Brian Johnson 向 Jenna Adams 求婚，Jenna Adams 开始考虑这件事。场景：Brian Johnson 开车送 Jenna Adams 约会后回家途中的车里。角色：Jenna Adams、Brian Johnson
　　b. 经过一番深入的内心挣扎，Jenna Adams 决定她想嫁给 Brian Johnson。场景：角色：Jenna Adams、Brian Johnson
　　　　i. 经过一番深入的内心挣扎，Jenna Adams 认定婚姻其实并没有那么糟，Brian Johnson 就是她理想中的完美男人。场景：Jenna Adams 的卧室，她正在收拾行李准备搬去与 Brian Johnson 同住。角色：Jenna Adams、Brian Johnson
　　　　ii. Jenna Adams 和 Brian Johnson 结婚。场景：Jenna Adams 与 Brian Johnson 的新家。角色：Jenna Adams、Brian Johnson
3. 然而，当 Brian Johnson 的前女友出现并试图把他赢回去时，Jenna Adams 意识到婚姻终究不适合她，与其和一个并非真心爱你的人在一起，不如独自一人。场景：角色：Jenna Adams、Brian Johnson、Teresa Campbell
　　a. Jenna Adams 无意中听到 Brian Johnson 和他的前女友 Teresa Campbell 的一段对话。场景：角色：Jenna Adams、Teresa Campbell、Brian Johnson
　　　　i. Jenna Adams 无意中听到 Brian Johnson 和他的前女友 Teresa Campbell 的一段对话，Brian Johnson 在对话中说自己仍然爱着她。场景：故事的开头。角色：Jenna Adams、Teresa Campbell、Brian Johnson
　　　　ii. Jenna Adams 听到这一切后心碎不已。场景：故事的中段。角色：Jenna Adams
　　b. Jenna Adams 就这段对话质问 Brian Johnson，Brian Johnson 承认自己对 Teresa Campbell 仍有感情。场景：角色：Jenna Adams、Teresa Campbell、Brian Johnson
　　　　i. Jenna Adams 就这段对话质问 Brian Johnson，Brian Johnson 承认自己仍然爱着 Teresa Campbell。场景：故事的中段。角色：Jenna Adams、Teresa Campbell、Brian Johnson
　　　　ii. Brian Johnson 告诉 Jenna Adams，Teresa Campbell 想和他复合，但他不知道该怎么做。场景：故事的中段。角色：Jenna Adams、Teresa Campbell、Brian Johnson
　　c. Jenna Adams 与 Brian Johnson 分手。场景：角色：Jenna Adams、Brian Johnson
　　　　i. Jenna Adams 与 Brian Johnson 分手。场景：故事的结尾。角色：Jenna Adams、Brian Johnson
　　　　ii. Brian Johnson 恳求 Jenna Adams 重新接纳他，并告诉她他爱她，但 Jenna Adams 不相信他。场景：故事的结尾。角色：Jenna Adams、Brian Johnson
　　d. Jenna Adams 认定，与其和一个并非真心爱你的人在一起，不如独自一人。场景：角色：Jenna Adams、Teresa Campbell
　　　　i. Jenna Adams 认定，与其和一个并非真心爱你的人在一起，不如独自一人。场景：故事的结尾。角色：Jenna Adams
　　　　ii. Jenna Adams 扔掉她的订婚戒指，搬出她与 Brian Johnson 同住的房子。场景：故事的结尾。角色：Jenna Adams、Brian Johnson
　　　　iii. Jenna Adams 独自开始新生活。场景：故事的结尾。角色：Jenna Adams

### DOC 针对计划 2 生成的故事

**表 29：**DOC 针对表 28 所示计划生成的故事。方括号中的彩色文字表示后续文本所对应的大纲条目。故事大体上遵循了顶层大纲条目的整体情节，也在一定程度上遵循了大多数低层大纲细节，尽管许多情况下并非完美，且有一两处事件可能略显失序。

[Jenna Adams 第一次遇见 Brian Johnson。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson] 当 Jenna Adams 在停车场看到 Brian Johnson 时，她感到一阵短暂而强烈的慌乱。她已经在当地图书馆工作了两年，本以为早该在那里见过他。他比她大三岁，三十出头，带着一种男孩般的魅力。他身材高大清瘦，看起来就像刚从《GQ》杂志封面上走下来。她心想，他这辈子是否曾当过模特。

第一次见到他时，Jenna 在书架之间的过道中央骤然停下脚步，抬头望向他，心跳加速。Brian Johnson 正站在窗前望着外面的停车场，但她能看出他还没看到她。

Jenna Adams 在 Brian Johnson 身旁停下，睁大眼睛望着他。

Brian Johnson 转过身，对她微微一笑，朝 Jenna Adams 露出满口洁白整齐的牙齿。

那之后，Jenna Adams 又见过 Brian Johnson 好几次，却发现自己渴望他能邀请她共进午餐，或只是两人一起喝杯咖啡。她想更了解他，但他们不过是泛泛之交。他们是在 [Jenna Adams 和 Brian Johnson 开始交谈，很快成为朋友。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson] 这样一次偶然的相遇中相识的，以至于 Jenna Adams 不知该如何开口约他一起出去。

她休息时，他们确实会在图书馆一起待上一段时间，因为他也在公立图书馆做兼职。他们谈论书籍和电影，有一次还聊起了各自的家庭。[两人开始约会，Jenna Adams 对 Brian Johnson 的爱与日俱增。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson]

但 Jenna Adams 不允许自己在与 Brian Johnson 的感情中陷得太深，因为她不想抱太大希望。Jenna Adams 以前爱过很多次，无论她怎样努力告诫自己不要过早交出自己的心，那种不可避免的事每次都还是会发生。Jenna Adams 会疯狂地爱上每一个约会对象，但他们全都在第一个月结束前就和她分手了。

Brian Johnson 和她认识的其他男人都不一样。

他似乎真的对她感兴趣。但 Jenna Adams 很小心，不让 [然而，Brian Johnson 的母亲 Mary Smith 不赞成 Jenna Adams，并想尽一切办法拆散他们。场景：美国的一个小镇。角色：Jenna Adams、Mary Smith、Brian Johnson] 自己抱太大希望。只要 Mary Smith 在场，她也会避免与 Brian Johnson 来往，因为她很清楚，一旦把他们介绍给彼此认识，这段恋情就完了。

尽管 Jenna Adams 努力与 Brian Johnson 保持一种随意的关系，只在 Mary Smith 不在时才和他相处，她还是发现自己想要 [尽管如此，Jenna Adams 和 Brian Johnson 的感情继续日益深厚。场景：美国的一个小镇。角色：Jenna Adams、Brian Johnson] 更多。他们相处的时间越长，Jenna Adams 就越希望这段感情能有所进展。

尤其是在周五和周六，当她看到 Brian Johnson 走在街上或出现在其他公共场所时，她会激动得几乎跑着追上去。

Jenna Adams 觉得他们两人之间有种非常特别的东西，她对他们的未来也越来越抱有希望。她喜欢 Brian Johnson，觉得他们有很多共同点，不过话说回来，她对自己的历任前男友也这么觉得。Jenna Adams 越来越迷恋 Brian Johnson，她想也许这就是真爱的感觉。也许婚姻并没有那么糟。

然而，Brian Johnson 的母亲 Mary Smith 不赞成 Jenna Adams，并想尽一切办法拆散他们 [Jenna Adams 开始觉得，当 Brian Johnson 看起来像是她理想中的完美男人时，也许婚姻并没有那么糟。场景：Brian Johnson 开车送 Jenna Adams 约会后回家途中的车里。角色：Jenna Adams、Brian Johnson]。

“她就是不喜欢我，”一天晚上，Brian Johnson 顺路到他们公寓取最新一期《时代》（Time）杂志时，对室友说，“我不知道为什么，但她讨厌我。我想这也许和她把 Jenna Adams 看作竞争对手之类的有关。不管怎样，我似乎都没法讨好她。”

Brian Johnson 把杂志放在室友的茶几上，站在那里沉思了片刻。“Brian Johnson，”室友说，“你现在最不需要的就是生活中多一个女人！”

Brian Johnson 紧张地笑了笑，但还是点头表示同意。他看了看朋友壁炉架上的钟，发现时间不早了，便朝门口走去。

他的朋友走过来，抓住 Brian Johnson 的胳膊。“听着，Brian Johnson，你还没准备好做出任何认真的承诺。听我的——你还不想这么快结婚。你得先出去多和几个女孩约会！”

Brian Johnson 笑了，尽管他暗自琢磨朋友的话也许有道理。他知道 Jenna Adams 已经准备好接纳他了。他们约会时，她好几次都这么对他说过。现在他们住在一起了，她甚至不止一次提过结婚。Brian Johnson 不知道该怎么做——尤其是他本来就不确定 Jenna Adams 是否真的适合他。

Brian Johnson 打开门，朝外面的车走去，留下朋友一脸好笑的表情。Brian Johnson 坐进副驾驶座，打开收音机，但此刻他似乎找不到任何不让自己心情低落的音乐。他本想把收音机关掉，却反而调高了音量，希望很快能听到别的什么。[Brian Johnson 向 Jenna Adams 求婚，Jenna Adams 开始考虑这件事。场景：Brian Johnson 开车送 Jenna Adams 约会后回家途中的车里。角色：Jenna Adams、Brian Johnson]

Jenna Adams 从餐厅出来，钻进车里，随手关上了门。她飞快地吻了 Brian Johnson 一下，说：“是什么让你改变了主意？”

Brian Johnson 干笑了一声，才答道：“我不知道你想嫁给我。你以前从没提过。”他停顿了一下，才问：“这对你为什么重要？”

Jenna Adams 对他笑了笑，然后移开了目光。“因为我爱你，Brian Johnson。我想永远和你在一起。我想让你给我一枚戒指，向我求婚。你是我这辈子遇到的最好的事，我想永远属于你。”

Brian Johnson 仔细斟酌了她的话，然后说：“Jenna Adams，我需要你想想这个决定。慎重考虑一下。”

Jenna Adams 摇了摇头，抬头对他微笑，作为回应：“我已经想了很久了，Brian Johnson。你在说什么呀？”

Brian Johnson 仔细斟酌了她的回答，然后说：“你已经想 [经过一番深入的内心挣扎，Jenna Adams 认定婚姻其实并没有那么糟，Brian Johnson 就是她理想中的完美男人。场景：Jenna Adams 的卧室，她正在收拾行李准备搬去与 Brian Johnson 同住。角色：Jenna Adams、Brian Johnson] 这件事想了很久？你第一次想到要嫁给我是什么时候？”

Jenna Adams 低下头叹了口气，然后重新抬头看他：“当我发现前男友背着我跟我最好的朋友上床的时候。”

Brian Johnson 感到怒火上涌，但他强压下去，平静地说：“为什么会这样？你最好的朋友有什么让你如此着迷？她做了什么让你想和她在一起？”

Jenna Adams 把头转向一侧，望着窗外片刻，才重新看向 Brian Johnson。她把包放在床边她的衣服旁，抬头看着 Brian Johnson。“哦，拜托，Brian Johnson。你很清楚她做了什么。我需要她的时候，她总在我身边，从不离我而去。她从来不会只顾自己，让任何人插到我们之间。”Jenna Adams 开始把衣服装进行李箱，继续说道：“我无法忍受没有她的日子，所以我决定，也许我 [Jenna Adams 和 Brian Johnson 结婚。场景：Jenna Adams 与 Brian Johnson 的新家。角色：Jenna Adams、Brian Johnson] 应该向你求婚。那样也许我们就能永远在一起了。”

Brian Johnson 摇了摇头，叹了口气，在她身边坐下。他深吸一口气，才问：“是什么让你改变了主意？”

Jenna Adams 走到 Brian Johnson 面前，把他的手握在自己手里。她笑着说：“嗯，我发现你要搬走了，而我得独自留在这里。”

Brian Johnson 把手从 Jenna Adams 手中抽开。他双手捂住脸，大声叹了口气。“哦，Jenna Adams。”

Jenna Adams 把手从 Brian Johnson 手上移开，坐在自己的行李箱上。她看着他说：“让我猜猜。你在犹豫要不要娶我，是因为不想把我抛下？”[Jenna Adams 无意中听到 Brian Johnson 和他的前女友 Teresa Campbell 的一段对话，Brian Johnson 在对话中说自己仍然爱着她。场景：故事的开头。角色：Jenna Adams、Teresa Campbell、Brian Johnson]

Brian Johnson 抬头看着 Jenna Adams，说：“我没有改变想娶你的想法。我从来没机会告诉你，但我仍然爱着 Teresa Campbell。”

Jenna Adams 站起身，面对着 Brian Johnson，开始哭起来。她说：“你从来就不该爱我。我本该是你翻篇过去的那个女孩。你和我本只是朋友，约会的时间足够长，好让我们的父母不会强迫我们分手。”

Brian Johnson 开始摇头，说：“那不是真的。我从来没有把你当作 Teresa Campbell 的替代品。在我们交往之初，我只是顺其自然，因为朋友和家人告诉我，好男友就该这么做。但 [Jenna Adams 听到这一切后心碎不已。场景：故事的中段。角色：Jenna Adams] 我越了解你，就越意识到我是真的爱你。”

Jenna Adams 摇着头说：“你不爱我。你只是从 Teresa Campbell 那里翻篇，转向另一个人，而总有一天你会意识到，你爱她胜过爱我。”

Jenna Adams 继续哭得泪流满面。Brian Johnson 接着说：“对不起，我之前没有早点告诉你我对你的感觉。在遇见你之前，我从来不知道人可以这样深地爱一个人。”

Jenna Adams 说：“你伤了我的心。我绝不可能为了一个这么轻易就对我翻篇的男人，搬到纽约去，抛下我的家人和朋友。我今晚就回芝加哥的家，明早就搬回去住。”[Jenna Adams 就这段对话质问 Brian Johnson，Brian Johnson 承认自己仍然爱着 Teresa Campbell。场景：故事的中段。角色：Jenna Adams、Teresa Campbell、Brian Johnson]

她随后起身要走，但 Brian Johnson 说：“别就这样离开。和我谈谈，看看我们能不能想出办法。”他抓住她的胳膊说：“我还爱你。我想永远和你在一起。”

Jenna Adams 看着他说：“你不知道自己在说什么。你不知道被你以为是今生挚爱的男人伤透了心是什么滋味。你在 Teresa Campbell 身上赌一把，我不怪你。我还爱你，但我已经无法再相信你的承诺了。”

Brian Johnson 说：“我不知道还能做什么来证明我有多爱你。我只知道，这些关于我爱 Teresa Campbell 的话让我觉得不对劲。Teresa Campbell 承认，她和我上床只是因为喝得太醉，而且那时你我已经不再说话了。她告诉我那是个错误，她还爱着她的另一个男友 Jeff。她向我坦白，她是在试图利用我来忘掉 Jeff，但她仍然爱着他。”

Jenna Adams 随后答道：“那你们俩关于我的那些对话呢？那些对话又算什么？Teresa Campbell 向你承认她对我有感觉，然后又说想重新和你在一起。”Jenna Adams 随后扑到 Brian Johnson 身上。她紧紧抱住他说：“告诉我你还爱我，我们的婚姻还没有结束。告诉我我们还能在一起！”Brian Johnson 一言不发。他回抱住她说：“我不 [Brian Johnson 告诉 Jenna Adams，Teresa Campbell 想和他复合，但他不知道该怎么办。场景：故事的中段。角色：Jenna Adams、Teresa Campbell、Brian Johnson] 知道该怎么办。对我们之间以及和 Teresa Campbell 之间发生的一切，我一片混乱。”

Jenna Adams 随后说：“你还爱着她！你不得不承认！我无意中听到了你和 Teresa Campbell 的对话，你总是在说我们之间的事有多复杂，说她是那个被你错过的人。”Jenna Adams 又说：“我受够了听到这两个人谈论我。我受够了这段感情，我想从这整件事里抽身。我现在就要抽身！”Jenna Adams 接着说：“Brian Johnson，我要离婚。”Jenna Adams 随后崩溃痛哭。她和 Brian Johnson 之间发生的事让她心碎欲绝。她想让他把自己追回来，但她知道他不会那么做，她必须继续过自己的 [Jenna Adams 与 Brian Johnson 分手。场景：故事的结尾。角色：Jenna Adams、Brian Johnson] 生活。

Brian Johnson 看着她说：“哦，Jenna Adams，我爱你。我想让你永远在我生命里。但我对你和 Teresa Campbell 的感情感到困惑。你是我这辈子唯一对我有意义的女人，而 Teresa Campbell 是唯一伤过我心的女人。我想告诉她，我永远不会再和她说话了，但我不知道她会不会接受。我不知道我们之间会如何发展。我很抱歉事情会变成这样，对你、对我都是 [Brian Johnson 恳求 Jenna Adams 重新接纳他，并告诉她他爱她，但 Jenna Adams 不相信他。场景：故事的结尾。角色：Jenna Adams、Brian Johnson]。你一直是我生命中很重要的一部分，我无法想象没有你的日子。求你了，Jenna Adams，原谅我，重新接纳我吧。”Brian Johnson 随后紧紧抱住 Jenna Adams，靠在她肩上哭泣。[Jenna Adams 认定，与其和一个并非真心爱你的人在一起，不如独自一人。场景：故事的结尾。角色：Jenna Adams] 她需要知道他说的到底是不是真话。

Jenna Adams 从他怀里挣开，说：“Brian Johnson，我不相信你。如果你真像你说的那样爱我，那你又怎么能背着我跟前女友出轨？这难道还不足以证明你不爱我吗？你说你对她还有感情，可我才是本该在你生命里的那个女人。如果你真的想永远和我在一起，你从一开始就该选我。现在太晚了。如果我们决定各走各路、忘掉彼此，那对大家都好。独自一人总好过和一个并非真心爱你的人在一起，你不同意吗？”Jenna Adams 随后走到她丢下的订婚戒指旁，把它捡了起来。她说：“我不 [Jenna Adams 扔掉她的订婚戒指，搬出她与 Brian Johnson 同住的房子。场景：故事的结尾。角色：Jenna Adams、Brian Johnson] 想要这东西了，所以我要把它扔掉。”

Jenna Adams 随后把戒指扔进了他们家后院的火坑里。她留下 Brian Johnson 震惊地站在那里。当 Jenna Adams 在倾盆大雨中开车回家时，她感到一种巨大的解脱，因为她扔掉了订婚戒指，这意味着她再也不用见到 Brian Johnson 了。

Jenna Adams 把车开进自家的车道，下了车。她走进屋里，朝壁炉走去，她其余的物品都被扔在了那里。Jenna Adams 注意到壁炉已经点着了，烧得只剩一小堆灰烬。她扔掉旧相册、所有的首饰和香水，以及其他一切让她想起 Brian Johnson 的东西。她把它们也都扔进了火坑。家里剩下的 [Jenna Adams 独自开始新生活。场景：故事的结尾。角色：Jenna Adams] 所有东西随后都被扔进了壁炉。

第二天早上，Jenna Adams 走进卧室，看到的是前一晚她放的那把火在地板上留下的灰烬。她在床上坐下，看着曾属于她和 Brian Johnson 的生活里剩下的东西。Jenna Adams 打开一个抽屉，找到一个小笔记本和一本旧相册。她取出相册，想看看他现在在做什么。Jenna Adams 翻开相册，发现 Brian Johnson 已经继续过他自己的生活，不再想她了。

### RE3 针对计划 2 生成的故事

**表 30：**RE3 针对表 28 所示计划生成的故事。该故事大体上合理地遵循了高层计划，但时有重复。

Jenna Adams 并不是一个普通人，这一点千真万确。她的想法与别人不同，行事方式也让大多数人不解。

然而，她认为自己不是普通人的主要原因，是她永远不会结婚。这个决定是多年前她还是少女时做出的，当时她看到父母在一起过得痛苦不堪。她很快就认定自己不想经历那样的人生，因此宁愿永远独身，也不愿和一个会让她不快乐的人共度一生。

这个念头让 Jenna 暗自微笑。她一向乐于拥抱孤独，在自己的思绪中寻找慰藉。事实上，她有时觉得与人交谈是在浪费时间，因为别人常常听不懂她在说什么。Jenna 一辈子都住在这个小镇上，社区里的人早已对她的古怪行为习以为常，没人对此多想。镇上人人皆知她身边永远不会有什么亲近之人，而这一点丝毫不会让 Jenna 困扰。

Jenna 此刻正坐在城外不远处的一家咖啡店里。她点了一杯双奶双糖咖啡，正在读她最喜欢的作家之一 Ray Bradbury 的书。她的目光扫过书页，思绪却飘到了别处，其中一件就是她几分钟前见过的一个男人。他走进店里，在后面的一张桌子旁坐下。他大约六英尺高，留着脏金色头发，长着棕色眼睛。他的脸很迷人，却并非传统意义上的英俊，这正是让她如此着迷的原因。

他穿着牛仔裤和 T 恤——算不得最有魅力，但也无需如此，因为他举手投足间透着一股自信，令周围的人都对他心怀敬意。看着他啜饮咖啡、翻阅书本，Jenna 的目光再也无法从他身上移开。她好奇他是谁，过着怎样的生活。由于不认识他，只是坐在桌旁盯着他看而不自我介绍似乎不妥，于是她决定起身过去和他搭话。

Jenna 尽可能不引人注意地从桌旁站起，以免后面那张桌子的男人注意到她。她努力想出一句聪明或机智的话，待走到他桌边时好说出口，但她激动得什么也想不出来。走近时，她明显看出他早已看见她走进来独自坐下，显然只盼着能在有人找他攀谈之前把咖啡喝完。Jenna 走到他桌旁，在他对面坐下，第一次直视他的眼睛。

他那双棕色眼睛也回望着她，仿佛想弄清坐在自己对面的究竟是谁。Jenna 因此觉得他像一只被车灯照住的鹿：他不知所措，却又不愿失礼地打断她。这也是他如此吸引她的又一个原因——他举止优雅、从容自若，她知道他是一个值得仰慕的男人。

“嗨，我是 Jenna。”她有些紧张地说。男人从椅子上站起身，向她伸出手说：“嗨，我是 Brian。”他们握了握手，Jenna 感到一股愉悦的酥麻顺着手臂蔓延开来。

“我从没想过会有机会见到你。”她兴奋地说，“我是你的忠实粉丝。”Brian 愣了片刻，才恍然大悟——她认出自己了。他脸上挂着笑容问道：“你说的是我，还是乐队？”

Jenna 看得出来，Brian 早已习惯被各地女性认出并崇拜。当得知有人真的认识他、而不只是因为他的俊朗外表时，他显得几乎有些飘飘然。Jenna 因此愈发被他吸引；他身上有一种大多数人随着年岁增长而丧失的天真。她知道此情此景必须小心行事，因为他生命中已另有女人，但她从未对任何人有过如此强烈的感觉，她下定决心要赢得他的心。

“我当然是在说你啦，傻瓜，不过我同时也是你和兄弟们那支乐队的忠实粉丝。”她红着脸说。Brian 又笑了，Jenna 不禁注意到他有一口洁白整齐的牙齿。她喜欢他的笑容，那让她在他身边感到自在——几乎就像面对一位亲密的朋友。他看起来也真心想认识她。

“很高兴你喜欢我的音乐。如果你愿意，我很乐意找个时间好好给你讲讲。”他说，Jenna 发现自己还没细想就迫不及待地点头同意了。

接着他把手移到她的肩头，轻轻一握，继续说道：“不过现在，先让我自我介绍一下。我叫 Brian Johnson，很高兴认识你，Jenna。”

还没等他继续说下去，Jenna 就笑着打断道：“哦等等，我知道你是谁！你就是 AC/DC 那位了不起的吉他手，对吧？如果不介意的话，我想问你怎么会在这里？”

Brian 也笑了，他上前一步，握住了她的手。“其实我今晚来这儿，是为了见一个经共同朋友介绍认识的人。不过现在既然遇到了你，我觉得他们来不来都无所谓了。愿意跳支舞吗？”

Jenna 笑着回应，任由 Brian 领着她走向舞池。一路上，他轻轻捏了捏她的手，惹得她脸更红了。她庆幸那天早些时候穿上了自己最喜欢的牛仔裤和长袖碎花上衣，那晚她穿着它们感到既舒适又自信。

起舞时，他们的身体在流畅的动作中彼此贴近，让 Jenna 心底涌起一阵暖意。他们跳了仿佛很久，尽管两人整晚都在喝酒，却没有一个人觉得醉。他们只是享受彼此的陪伴，无需再做别的什么。

他们停下舞步歇了一会儿，Jenna 从吧台拿了一杯鸡尾酒，抿了一小口。她转过身时，Brian 正望着她，手里也端着酒杯，笑得灿烂。接着他看了看她握着酒杯的手，仿佛想看看她是否会察觉，但 Jenna 早已看到他的举动，赶紧把酒杯放回了吧台。她说不清为什么，但那晚她就是不想喝酒。

他们又聊了很久，谁都不愿结束这场谈话。Jenna 一度提起她几周前刚和男友分手，说她多么想念每天有个能说说话的人。Brian 则告诉她，常年在巡演路上生活是什么滋味，以及这些年他渐渐失去联系、却仍珍藏在心的人有多少。Jenna 注意到 Brian 从不说任何人的坏话，即便是那些亏待过他的人。她因此很敬佩他。

过了一会儿，他们决定就此结束这个夜晚。Jenna 把电话号码给了 Brian，说希望改天还能再和他约会。他朝她暖暖一笑，说一回城就会给她打电话。

他们走出俱乐部朝各自的车走去时，Jenna 在回家前最后回头看了 Brian 一眼，心想：“他就是我命中注定的那个人。”

她很庆幸那晚决定出门，否则她永远也不会遇见 Brian Johnson。

Jenna 正坐在家里看书，电话响了，她一看是 Brian 打来的。那让她心里小鹿乱撞，电话里他的声音让她浑身舒畅。聊完后，他们约好过几天再见一面，然后挂了电话。Jenna 随即想到，婚姻其实也没那么糟，因为 Brian 也许就是她的真命天子。

挂断电话重新拿起书后，她却无法把 Brian 从脑海中赶走，不禁遐想起结婚后从此幸福生活的样子。

她暗自微笑，翻过一页书，却又在还没读进一个字之前赶紧把书放下。她突然涌起一股冲动，想出去给 Brian 买一枚订婚戒指。

她知道这很傻，因为他们彼此几乎还不了解，但她控制不住自己，因为她从未对另一个男人有过如此强烈的感情。

Jenna 冲出门去买订婚戒指，当在商店橱窗里看到它时，她更加兴奋了。她买下戒指，又匆匆赶回家想把它送给 Brian。可她到家时他并不在——他晚上又出门去了。

她失望地叹了口气，对自己说本不该这么做，因为他们之间还没熟悉到可以为他买订婚戒指的地步。但她依然无法把戒指从脑海中放下。

Jenna 最终决定，最好先把订婚戒指收起来，等 Brian 回家再说。她重新拿起书读了起来，但思绪又一次飘散。她回想起一个多月前与 Brian 相识以来，他们之间发生的种种。

她记得，当他来到她在华盛顿的小公寓见她时，自己第一次对他动了心。他来之前他们已通过几次电话，但真正让她沦陷的，是见到他的面容。

那晚她无比幸福，因为她终于体会到了自己一直渴望对他人产生的感觉——吸引与爱。她看向一张年轻情侣相爱的照片。她想起 Brian 第一次约她出去时自己有多么兴奋又紧张，也正因如此她才那么快就答应了。

Jenna 还记得他们第一次约会去看电影《洛基恐怖秀》时有多开心。他风趣极了，两人整场电影都在开怀大笑。她以前第一次约会从未笑得这么开心过，于是想到他们一起玩乐竟是如此轻松。她开始琢磨，这个人会不会就是她将来要嫁的人。

接着她又想起 Brian 的朋友们对他的评价。他们说他是非常善良真诚的人，将来会是个好丈夫。他们还说他是位才华横溢的歌手，这让 Jenna 十分开心，因为她酷爱现场音乐。她开始遐想，有朝一日她和 Brian 若能同台演出，该多么有趣。

她的思绪不断回到那枚订婚戒指，以及第二次约会时 Brian 对她说的那些动听的话。那次他带她去弗吉尼亚州亚历山德里亚吃了一顿丰盛的晚餐。他对她说，如果他想娶谁，他会一遍又一遍地选择她，因为她就是他心目中理想女性的一切。这些话让 Jenna 有些不知所措，但同时也知道，他有着某种特别之处。

当她意识到，由于 Brian 过去与其他女人的感情纠葛，这段关系也许不会有结果时，她开始感到难过。两人在相识之前都刚结束一段长久的关系，这让 Jenna 对他们的关系有些缺乏安全感。

她知道自己对 Brian 仍有感情，却不确定他是否也这样看待自己。她知道自己爱他，并希望有一天他也会爱上自己。

一天夜里她上床睡觉，盼着能接到他的电话、听他表白至死不渝的爱意，可那时他早已离开小镇。

得知此事后 Jenna 很惊讶，因为她以为两人的关系正越走越近，但她也知道他不会做出任何伤害她的事。她努力让自己坚强，却最终在床上哭了一整夜，一边听着收音机里的 AC/DC。

第二天，她出门购物，买下一枚 Brian 会喜欢的漂亮订婚戒指。她想，如果有一天能亲眼看到他戴上它，也许就能更快地走出对他的思念。于是她计划等他回来时向他求婚；然而等他回来时，既没有戒指，也没有字条在等她。

Jenna 认为这意味着他终究不想娶她，因为他不想留下任何与她在一起的证据。她开始怀疑自己是否做对了。她决定对他买礼物的这件事只字不提，但心里依然痛苦万分。

让 Jenna 担忧的是，自那晚之后 Brian 再没给她打过电话，而就连他们是否还在交往，他似乎都拿不准，这一切都显得他并不感兴趣。他以前提过婚姻不适合他，但 Jenna 以为只要两人交往够久，也许他会改变想法。这一点她想错了。

几天后 Brian 飞回小镇，他们再次见面，一起去亚历山德里亚的 AC/DC 跳舞。她玩得很开心，以为两人之间终于没事了，可舞池上突然冒出另一个女孩，开始和他搭话。

那女人看起来和 Jenna 年纪相仿，穿着一身婚纱。她见到 Brian 显得很高兴，给了他一个大大的拥抱，然后和他的朋友们一起喝酒去了。Jenna 为此心碎，但她强撑着假装没注意到刚才发生的一切。她有种预感，从此再也见不到 Brian Johnson 了。

乐队登台后，开始演奏他们最受欢迎的几首歌。Brian 的朋友们朝 Jenna 挥手，让她当着他们的面挥手回应，仿佛她也是他们中的一员。Jenna 微笑着朝他们挥手，随后把注意力转回台上。

夜色尚早，Jenna 决定留下来再跳一会儿。她喝了杯啤酒，随着他们当晚演奏的所有歌曲起舞。某一刻，Brian 走到她身后，双臂环住她的腰，两人一起跳舞。他们紧紧相拥、随着音乐来回摇摆，看起来般配极了。那一刻，似乎什么都不重要了，除了把他拥在怀里。

那一刻她意识到，爱上他竟是如此容易，但她知道，经历了舞池上他与前女友的那一幕后，她无法再信任他。他曾非常明确地表明过对婚姻的态度，说 Jenna 永远不会是让他改变想法的那个女孩，但她本以为他早已忘了这些。然而，AC/DC 演唱会上发生的一切让她明白，无论她多么努力地想忘掉她和 Brian 过去关于婚姻的争执，那依然是他愿意为之坚持、据理力争的事。

Jenna 挣脱 Brian，走到吧台边又喝了一杯啤酒，一边看着他在台上表演。想到他若愿意娶她、两人本可以多么幸福，她的心开始碎裂成两半。她觉得自己蠢透了，几周前才为他买了订婚戒指，结果却在众人面前被原样退回。

她哭了起来，冲出俱乐部，跑进寒冷的夜色中。直到听见身后一辆汽车鸣笛、急打方向躲避她时，她才意识到自己已经跑到了公路上。

Jenna 擦去眼泪，抬头看是什么引起这番骚动。一看之下，她惊呆了——她认出了跟在她车后开车的人：Brian Johnson！

Brian 见她望向自己，便熄了火，从车里出来。他跑到她面前，站在她跟前，让她无法离开。

Jenna 被眼前的处境吓坏了，但当 Brian 把她揽入怀中时，她的恐惧渐渐消散。他轻吻她的唇，在她耳边低语“对不起”。

Jenna 挣脱开来，一脸困惑地望着他，问道：“我不明白，你为什么要说对不起？”

他后退一步，答道：“我为我说过不娶你的那些话道歉。Jenna，你才是我想娶的人。只是作为我，身上背着太多包袱。我知道只要我们再努力一点，就能非常幸福，而我们都知道，因为过去的感情，我还不够努力。”

Jenna 把头靠在他胸口，说：“没关系，Brian，真的没关系。我理解你的处境，我不想成为那个逼你做你不愿做的事的人。我想，尽管我们如此般配，我们终究注定无法在一起。”

Brian 紧紧抱住她，说：“我爱你，Jenna，我真的爱你。”她抬头望着他，说：“我知道，Brian。”

### ROLLING-OPT 针对计划 2 生成的故事

Jenna Adams 环顾着她称之为家的那间狭小昏暗的公寓，翻了个白眼，叹了口气。她太想离开这个地方了。

她第一百次问自己，怎么会困在这样一个鬼地方。她没什么钱，但一直在尽量存钱。运气好的话，再过几个月她就能负担得起一处新住所了。

她坐在沙发上读一本言情小说。她讨厌言情小说，但那些似乎是她唯一买得起的读物。住在同一栋楼里的人都觉得她很古怪。

他们这么看有各种各样的理由：她不怎么化妆，穿着朴素，也很少说话。她总是在看书，或者在电脑上忙活。

过去两个小时，Jenna 一直在电脑前忙碌。她想攒够钱，好租一套自己的公寓。她需要一份好工作，却没受过多少教育。她在一家杂货店上班，却几乎排不到班。这家店一周七天、每天二十四小时营业，却只需保证一定数量的员工到岗。一个月只有五个班次，Jenna 很难挣到足够的钱，于是她打算再找一份工作。此刻她正在写简历。

今晚，Jenna 决定在家安安静静地待着。她想读完那本书，再把简历写完。Jenna 的生活里从没发生过什么令人兴奋的事，至少很少发生。

Jenna 听见敲门声。她猛地起身跑过去，但等她赶到时已经晚了。那人已经离开，随手把门关上了。

Jenna 透过猫眼向外看。那是个深棕色头发、蓝眼睛的男人，模样十分英俊。Jenna 立刻被他吸引，却知道他不是自己喜欢的类型——他太帅了。

大约十分钟后，男人又敲了敲门。这一次，Jenna 立刻打开了门。“请问有什么事吗？”她问。

“抱歉打扰了，但我想我把手机落在你公寓里了。”他说。“我觉得这栋楼里没人有手机，所以我非常怀疑。”她答道。

“我挨家挨户问过了，他们都说没有，你是我最后问的一家。”他说。“我还是很怀疑，不过我可以帮你看看。”Jenna 说。

她走回公寓，看向桌上的电话。果然如她所料，电话不见了。她找到那个曾打电话给她的人留下的号码，拨了过去。

“喂。”一个女人接了电话。“你知道这部手机是谁的吗？”Jenna 问。沉默了几秒后，对方说：“是的，我知道。”

“这就是几分钟前刚和我通过话的那个人。他不小心把手机落在我公寓里了。”Jenna 说。“哦，你好，这里是医院。我本来是要打给你说检查结果的，但现在不必了，因为医生想让你明天下午去他的办公室见他。”那女人说。

Jenna 糊涂了。她原以为公寓里住的全是没受过教育的人，可她相当肯定那女人是在医院工作。“我不明白，你是怎么知道我的电话号码的？”Jenna 问。“是我给他的。”那女人答道。

“你为什么要把我的电话号码告诉他？”Jenna 说。“他需要联系到你，却找不到你的地址，所以我把你的电话号码给了他。”她说。

Jenna 彻底糊涂了。她转身朝公寓门口走去，那男人却一把抓住她的胳膊拦住了她。“先别走，我有话要对你说。”他说。

“我没时间听这些，但请你把要说的话说完，然后我就走。”Jenna 说。

男人朝她笑了笑，在沙发上坐下。“我叫 Brian Johnson，是一名医生。我想告诉你，你得了癌症，只剩几个月的生命了。我建议你放弃学业，把后事安排好。”

Jenna 又震惊又愤怒。她转身就要离开房间。“等等。”Brian 说。她转回身，等他开口。

“没事，我只是在逗你玩。我就想看看你会有什么反应。”他说。Jenna 松了口气。她当时没意识到自己一直在屏住呼吸。她简直不敢相信自己方才有多害怕。她在他旁边的沙发上坐下，两人聊了起来。

“那么，你有什么故事？”Brian 问。话题突然一转，Jenna 有点发愣，但她想也许他只是想更了解她。“我的故事？”她说。

“对，我是说，你至少得有二十一岁了吧，所以背后一定有一段故事。”Brian 答道。“哦。”Jenna 应了一声，不太确定他在问什么。

“你从来没有对谁认真过吗？”他问。“不，我有过。我和两个不同的男人认真交往过两段感情，但都结束了，现在我发誓这辈子再不结婚，打算一个人过完一生。”Jenna 说。

“那为什么都结束了？是因为你不想结婚吗？”Brian 问。Jenna 想了想，然后开始向他讲述自己的生活。

第二天下午，Jenna 走进 Brian Johnson 的办公室。他从办公桌上抬起头，朝她笑了笑，然后坐了下来。

“哪里不舒服吗？”他问。“我不知道你是否还记得我，昨天我在电话里和你谈过，你告诉我说我得了癌症、命不久矣。”她说。

Brian 朝她皱起眉头。“你没有得癌症？”他问。“对，我没有癌症。事实上，我完全健康。而且据我所知，我的家人也都很健康。”她说。

“你为什么要那样对我？接到那样一通电话，被告知自己只剩几个月可活，实在太可怕了。”Jenna 说。

“我非常抱歉。我只是想看看你会作何反应，既然现在我知道了，我会另找别人来完成我的测试流程。请原谅我。”他说。

“好吧，没事。其实这都不重要了，因为我本来就没打算来做检查。我只是想和你聊聊一些事情，比如我的生活之类的。”Jenna 说。

Brian 把椅子转向她，全神贯注地听她说话。“我能理解你不想来做检查，但我仍然很感兴趣你会作何反应，所以我们接着聊吧。”他说。

他友善的态度让 Jenna 立刻放松下来。她在办公桌对面的椅子上坐下，Brian 开始问了她更多问题。

然后他讲起自己的生活，以及发生在他身上的事。他说几个月前他出了一场车祸，受了重伤。他在医院住了很久，之后还得再做一段时间的物理治疗。

“哇。”Jenna 说，为自己之前的所作所为感到内疚，“那太可怕了。我很抱歉你遭遇了那样的事。”

“谢谢，不过我现在没事了。我找回了工作，又和父母住在一起，好慢慢恢复体力。不过这些不是你想听的内容，对吧？”Brian 问。

“呃，也不是，但我确实想稍微聊聊。我是说，这可是你第一次跟别人讲起你的那场车祸。”Jenna 说。

“我想你说得对。嗯，也许当面跟你讲比在电话里讲更好。”Brian 说。“你是什么意思？”Jenna 问。

接下来的半个小时里，Brian 向 Jenna 讲述了发生在他身上的一切。他说，那场车祸是另一个司机闯过停车标志没有停车造成的。两辆车都报废了，Brian 身受重伤。

他告诉她医生是如何为他治疗的，但他的伤势依然十分疼痛，康复之路还很漫长。他说话时，告诉了她许多她从未听过的事情，她意识到自己愈发喜欢他了。

这时，Brian 办公室的门毫无预兆地开了。Brian 从椅子上跳起来，跑到办公桌旁拿起电话。“你想干什么？”Brian 问。

Jenna 从听筒里听到一个女人的声音。“出什么事了吗？我进来时听见你在说话。”那女人说。

Brian 瞥了 Jenna 一眼，然后压低了声音说：“进来吧。”Jenna 不敢相信眼前发生的一切。Brian 是要放她鸽子吗？但他没有。几秒钟后，Jenna 听见脚步声，看到那女人走进了房间。

那女人又矮又瘦，一头卷曲的棕色头发，颜色几乎与她橄榄色的皮肤一样。她比 Jenna 年轻，眼睛周围有黑眼圈，看上去很久没睡好觉了。

“我是不是打扰到你们了？”那女人问，说话时眼睛看着 Brian。“没有，一点也没有。”Brian 说，“这是 Jenna，我刚才在跟她讲我几个月前的那场车祸。不过你不能待太久，我还有别的病人要谈。”

“哦，当然不会。我进来只是想告诉你，我要迟到了，明天一早还得去医院，所以我们明天可能没法去见那些潜在客户了。可以吗？”那女人问。“完全没问题。那我们就改到下周二见吧，反正也能让我有更多时间准备。”Brian 说。

“那好吧，我下周再见你们两位。我还有些工作要做，就不打扰你们谈话了。希望你们没有什么重要的事要告诉我。”他说着走出了房间。

“没有，没什么重要的事。”Jenna 微笑着说。那女人看着她，也笑了。“哦，太好了。我还担心你从他那儿听说了什么呢。我也叫 Jenna。”她说。

Jenna 也对她笑了笑，说：“别担心。等 Brian 有事要告诉你时，你马上就会知道。他这个人，让他保守秘密比登天还难。”

“真的吗？那我可得小心点，别把生活中的事都告诉他。”那女人笑着说，“祝你好运，Jenna。”然后她离开 Brian 的办公室，随手带上了门。

Jenna 在那儿坐了几分钟，回想刚才听到的一切。接着，她听见门又开了，便抬头看向 Brian。

“刚才抱歉了。我前女友有点神经质，想知道我这几天为什么没给她打电话。希望我没说什么让你不高兴的话。”Brian 说。

Jenna 笑着摇了摇头。“没有，你一点也没有让我不高兴。如果你愿意，可以晚点再跟我讲你前女友的事。眼下，我们开始吧？”她说。

“好主意。”Brian 说着坐回椅子上。然后他看了看桌上的文件，确保不会漏掉任何重要的事情。

Jenna 靠在椅背上，双手交叠放在身前，等着 Brian 开始。她知道她非常喜欢他，也很想知道今晚这场约会会如何收场。时间比他们预想的晚了许多，但 Jenna 不在乎。她知道，如果自己遇到的是对的人，她愿意彻夜不归。

——————————

**Jenna 的故事——回到约会开始之时：**

“好。我很期待。”她说着，和他一起朝前门走去。走到外面时她想，不知道他是否真能让我笑得那么开心。

走到车前，Brian 牵起她的手，带她走到那辆野马（Mustang）跑车旁边，替她打开了车门。“谢谢，不过我自己能开门。”她朝他微笑着说。然后她坐进车里，关上了车门。

Brian 看了她片刻，笑了。“我来开车可以吗？”他边问边坐进驾驶座。“当然，开吧。”她说。

他发动汽车，毫无阻碍地倒出停车位，右转驶向街道，然后开上了 295 号公路。“那么，你觉得你在办公室的那份工作怎么样？”Brian 扭头问她。

“我很喜欢。有时候挺无聊的，但我喜欢和我共事的那些人，尤其是 Brian Johnson。他是个很棒的老板。”她说着，又朝他笑了笑。

Brian 也对她笑了笑，低头看了一眼自己那侧的方向盘。“我一直希望你能和他相处融洽，也希望他会喜欢你。我觉得你俩会是天造地设的一对。”

Jenna 望向他，问：“你为什么这么说？”“因为你俩很像。你们都来自同一个小镇，也都爱笑。”他说。

“我想他确实很像我，但我不确定我会像他今早那样，把我们俩说成是一个模子里刻出来的。”Jenna 说。

接着，她看着 Brian 把车开出匝道，驶上通往查尔斯顿山（Mount Charleston）的公路。那条路她以前见过好几次，却从未走过。她看着 Brian，心想他们要去的那栋房子是谁的，随即想起他说过那是他的。

“我还是不敢相信这栋房子是你的。”Jenna 说。“我知道这有点难以置信。几年前我用存下的一笔钱把它买了下来。”他说。“这一整栋房子都是你的？”

“是的。只有两间卧室和一个客厅，但买得很便宜，所以我才买下它。”他解释道。“太棒了。”Jenna 说着，望向窗外路边的房屋和树木。

她心想，Brian 拥有这样一栋房子，我也不该太惊讶。他看起来确实挣得不少。至少他和我认识的大多数男人不一样。

她注意到他们离房子越来越近了，便说：“我很期待看看你的房子。”Brian 看着她，又笑了。“我想你会喜欢的。我不太确定厨房是什么样子”

**表 31：**ROLLING-OPT 针对表 28 所示计划生成的故事。随着故事推进，ROLLING-OPT 在保持与初始计划的相关性方面表现得非常吃力。

### DOC 计划 3

**前提：**一个偏远小镇的居民们齐心协力，帮助他们中的一员，因为她被诊断出患有癌症。

**场景设定：**故事发生在一个名叫 Mayberry 的小镇。

**角色：**

1. 全名：Daisy Mayberry
   角色画像：Daisy Mayberry 是一位心地善良、年过五十的女士，深受小镇上每个人的爱戴。
2. 全名：Bill Simpson
   角色画像：Bill Simpson 是 Daisy 的丈夫，也是当地五金店的老板。
3. 全名：Lisa Chambers
   角色画像：Lisa Chambers 是 Daisy 的女儿，也是镇上的医生。
4. 全名：Joe Swanson
   角色画像：Joe Swanson 是镇上的警长，也是 Daisy 的挚友。
5. 全名：Maggie Simpson
   角色画像：Maggie Simpson 是 Daisy 和 Bill 的孙女。
6. 全名：Andrea Grayson
   角色画像：Andrea Grayson 是镇长，也是 Daisy 的挚友。
7. 全名：Evelyn Chambers
   角色画像：Evelyn Chambers 是 Lisa 的母亲，也是 Daisy 的挚友。
8. 全名：Charles Grayson
   角色画像：Charles Grayson 是 Andrea 的丈夫，也是镇上的理财顾问。
9. 全名：Tanya Swanson
   角色画像：Tanya Swanson 是 Joe 的妻子，也是镇上的图书管理员。

**大纲：**

- 1. Daisy Mayberry 被诊断出患有癌症，她的家人和朋友聚集起来支持她。场景：角色：Daisy Mayberry、Charles Grayson、Tanya Swanson、Andrea Grayson
  - a. Daisy Mayberry 被确诊患有癌症，并得知预后不佳。场景：角色：Daisy Mayberry
    - i. Daisy Mayberry 被诊断出患有癌症，并得知预后不佳。场景：Daisy 的家。角色：Daisy Mayberry
    - ii. Elizabeth 和 Bill Simpson——分别是 Daisy 的女儿和丈夫——对她确诊的消息作出反应。场景：Simpson 的家。角色：Daisy Mayberry、Bill Simpson
  - b. Daisy 的家人和朋友聚集到她身边，给予支持。场景：角色：Daisy Mayberry、Bill Simpson、Tanya Swanson
    - i. Daisy 的家人和朋友聚集起来支持她。场景：Chambers 的家。角色：Daisy Mayberry、Tanya Swanson
    - ii. Daisy 的丈夫 Bill 在她接受治疗期间接手打理她的五金店。场景：Simpson 的家。角色：Daisy Mayberry、Bill Simpson
- 2. Daisy 的女儿 Lisa 成为她的主要看护人，并不懈努力寻找能挽救母亲生命的治疗方法。场景：角色：Daisy Mayberry、Lisa Chambers
  - a. Lisa Chambers 成为 Daisy 的主要看护人，并不懈努力寻找能挽救母亲生命的治疗方法。场景：角色：Daisy Mayberry、Lisa Chambers
    - i. Daisy 的确诊促使 Lisa 寻找能挽救母亲生命的治疗方法。场景：Lisa 的办公室。角色：Daisy Mayberry、Lisa Chambers
    - ii. Lisa 找到了一种有希望的治疗方法，但在获批方面面临挑战。场景：医院会议室。角色：Lisa Chambers
  - b. 在家人和朋友的支持下，Lisa 找到一种最终挽救了 Daisy 生命的治疗方法。场景：角色：Daisy Mayberry、Lisa Chambers、Charles Grayson、Tanya Swanson、Andrea Grayson
    - i. Daisy Chapel 被诊断出患有癌症，治疗随即开始。场景：Daisy 的家。角色：Daisy Mayberry、Lisa Chambers
    - ii. Lisa Chambers 找到一种有助于改善 Daisy 预后的治疗方法。场景：Lisa 的办公室。角色：Daisy Mayberry、Lisa Chambers
- 3. Mayberry 镇的居民聚集到 Daisy 身边，帮助她度过治疗期。场景：角色：Daisy Mayberry、Charles Grayson
  - a. Daisy 开始接受治疗，镇上居民聚集到她身边。场景：角色：Daisy Mayberry、Maggie Simpson、Evelyn Chambers
    - i. Daisy 开始接受治疗，镇上居民聚集到她身边。场景：医院。角色：Daisy Mayberry、Charles Grayson、Tanya Swanson
    - ii. 镇上居民帮助 Daisy 治疗，并给予支持。场景：医院候诊室。角色：Daisy Mayberry、Maggie Simpson
  - b. Daisy 的治疗过程艰难，镇上居民继续支持她。场景：角色：Daisy Mayberry、Charles Grayson
    - i. Daisy 的治疗过程艰难，镇上居民给予支持。场景：医院。角色：Daisy Mayberry、Evelyn Chambers、Maggie Simpson
    - ii. 镇上居民帮助 Daisy 度过治疗期，她最终战胜了癌症。场景：Daisy 的家。角色：Daisy Mayberry、Charles Grayson
- 4. Daisy 最终战胜癌症，她的故事在社区中激发了希望。场景：角色：Daisy Mayberry、Charles Grayson
  - a. Daisy 战胜癌症，她的故事在社区中激发了希望。场景：角色：Daisy Mayberry
    - i. Daisy 的癌症治疗过程艰难，但在亲友的支持下，她最终战胜了病魔。场景：医院。角色：Daisy Mayberry、Tanya Swanson、Evelyn Chambers
    - ii. 治疗结束后，Daisy 回顾自己的经历，以及这段经历如何改变了她。场景：她的家。角色：Daisy Mayberry
  - b. Daisy 的故事激励着其他在生活中面临困难的人。场景：角色：Daisy Mayberry、Tanya Swanson、Joe Swanson
    - i. Daisy 以自己的抗癌故事激励了他人。场景：Mayberry 镇广场。角色：Daisy Mayberry
    - ii. 人们在她讲述故事后对她敬佩有加。场景：镇广场。角色：Daisy Mayberry、Tanya Swanson

**表 32：**DOC 在我们主实验中生成的第三个计划。颜色标注的是用于引导生成的叶节点。其中的事件、场景和角色大体上都是合理的。

### DOC 针对计划 3 生成的故事

[Daisy Mayberry 被诊断出患有癌症，并得知预后不佳。场景：Daisy 的家。角色：Daisy Mayberry]

Daisy Mayberry 在屋子里走来走去，心里为即将到来的医生约诊做着准备。她梳了梳头发，化了一点妆。她望着镜中的自己，用手抚过脸庞，又抿了抿嘴唇。Daisy Mayberry 忽然想到，自己已不再是年轻的女人，但当她记起自己并非什么普通的中年妇人时，心里猛地一沉。她刚刚得知自己患了癌症，而医生对此已无能为力。

Daisy 是在几个小时前才得知这个消息的。预后并不乐观。医生告诉她，最好把余下的日子与亲人一起度过。

Daisy Mayberry 听到这些话，如坠冰窟。她明白自己将不久于人世，再也感受不到另一个活人肌肤的温暖。Daisy Mayberry 却有一种平静之感，仿佛她知道医生说的是真的，而且早已接受了这一切。然而事实并非如此。她只是得知了自己的病情、消化了这个信息，却还没有真正接受它。[Elizabeth 和 Bill Simpson——分别是 Daisy 的女儿和丈夫——对她确诊的消息作出反应。场景：Simpson 的家。角色：Daisy Mayberry、Bill Simpson] 一旦她真的接受了，她所感受到的所有痛苦与震惊都会变得真实，但她还无法直面那样的现实。

她刚收拾停当，就听见有人敲门。她惊讶地发现来人是 Bill Simpson，她结婚三十三年的丈夫。她没料到他这么早回家，毕竟他一个小时前才出门上班。Daisy 在他进门时握住他的手，亲了一下。

“你好，亲爱的。”

Daisy 对丈夫的语气感到惊讶。他听起来十分严肃。

“你好，Bill。出什么事了吗？”

两人走到沙发旁，沉默了片刻，Bill 才开口。

“我回家是想告诉你，今天我和你的医生谈过了。我想在别人告诉你之前，先让你知道我们谈了什么。”

Bill Simpson 是个温和的人，但这一晚他显得十分沉郁而凝重。Daisy 看着丈夫，先深吸了一口气才开口。Bill 又靠近了些，等妻子说话。他们的孩子多年前就搬出去，去了很远的地方，但 Simpson 一家依然关系亲密。

“医生说了什么？”

Simpson 坐到妻子身旁的沙发上，低头看着她，然后说：“医生说你得了晚期癌症。”

这番话渐渐渗入脑海，Daisy 一时语塞。Simpson 靠得更近，把妻子的手握在自己手中。“别担心，亲爱的，我们一家人会一起熬过去的。我们都会帮你战胜病魔，并确保在我走后，你和孩子们都有人照顾。Simpson 家的大门永远为你和孩子们敞开。”

Simpson 说着，把手移到 Daisy 的头上扶住她。泪水顺着 Daisy 的脸颊流下，但她始终没有松开丈夫的手，Simpson 也继续说着。说着说着，Simpson 的手从 Daisy 后脑移进她的发间。

“嘿，别这样！别老是动来动去！你比不肯洗澡的小孩子还难对付！[Daisy 的家人和朋友聚集起来支持她。场景：Chambers 的家。角色：Daisy Mayberry、Tanya Swanson]”

Daisy 还在哭，但当丈夫的手从她发间移到肩头时，她确实不再乱动了。Daisy 感到他把自己在沙发上拉得更近。他开始轻抚她的后背，帮她平静下来。

Daisy 一平静下来，Simpson 就停止轻抚她的后背，但仍把她拥在怀里。他注视着妻子的脸庞，笑了。

“亲爱的，我永远不会离开你。我会陪在你身边，直到我死去的那一天，等到我们的人生走到尽头，我们就一起离去。”

Daisy 努力不让自己再哭，但听到丈夫这番话，她还是忍不住了。她勉强挤出一个微笑，轻声回应他：“我知道你不会离开我，Bill。我现在只需要你抱着我。”

听了妻子的回答，Simpson 微笑着回应，然后托起她的脸转向自己。他正要亲吻她时，家里响起了敲门声。Daisy 吃了一惊，Simpson 也停下动作，起身去开门。

Simpson 打开门，看到图书管理员 Tanya Swanson 站在门口。她一副心烦意乱的样子，Simpson 知道，无论发生了什么，对他或他妻子来说都不是好消息。

“你好，Swanson 女士。出什么事了？图书馆那边有什么不对劲吗？”

Simpson 侧身让图书管理员进屋，随后关上门，回到妻子站着等他的地方。

“请进来吧，Swanson 女士。我不想让你在外面干等。”

Swanson 走进他们家的客厅，等 Simpson 关上门后才开口。

“我来是想告诉你们，你们的母亲住院了，他们说她需要你们尽快去看她。她现在就在那里。”

Swanson 的语气让 Simpson 意识到事情很严重，他快步走进厨房，从冰箱里拿了一瓶水。

他随后回到客厅，在 Swanson 身旁、他们家的[Daisy 的丈夫 Bill 在她接受治疗期间接手打理她的五金店。场景：Simpson 的家。角色：Daisy Mayberry、Bill Simpson]沙发上坐下。

“出什么事了？她还好吗？我父亲陪着她吗？”

Swanson 低头看着自己的手，搓了搓，然后看向 Daisy Mayberry 的女儿 Lisa，等她回答。

“我不确定发生了什么，但我猜她是生病了，医生让她住院了。我相信你父亲正陪着她。”

Simpson 站起身，走到能透过前窗向外望的位置。他开始来回踱步，低头看着路面，随后停下脚步，回头看向 Swanson 和 Lisa。Simpson 努力保持镇定，却开始感到心跳加速。

Simpson 从十几岁起就在家里的五金店工作。他与 Daisy Mayberry 结婚后，搬进了父母建造的房子。Simpson 爱他的女儿和妻子胜过世上的一切，但他知道，在他生命中，只有一样东西比什么都重要——家族五金店的成功。Simpson 知道，即使妻子和女儿相继离世，他也能继续生活下去，但他不确定，如果五金店关门，自己的心能否愈合。

Simpson 终于抬头看向 Swanson 和 Lisa：“我要去店里。”他说。Simpson 走出家门，坐进那辆蓝色福特皮卡。

开车去店里的路上，Simpson 从大衣口袋里掏出手机，打给五金店员工 Tom Simpson——他先前让这人今天提前打烊。Simpson 走进五金店，朝店面走去。

走近店面前的柜台时，Simpson 感到心跳开始加快。他走向柜台后面的一个小壁橱，那里放着他的备用钥匙。

Simpson 从口袋里掏出一把钥匙，打开小壁橱的门。他把钥匙插进锁孔，向右一转，然后又向左一拧，打开了一扇小门。Simpson 走下一小段楼梯，进入他的地下室公寓。

Simpson 锁上门，在沙发上坐下。他脱下大衣[Daisy 的确诊促使 Lisa 寻找能挽救母亲生命的治疗方法。场景：Lisa 的办公室。角色：Daisy Mayberry、Lisa Chambers]，扔在地上。

他瞥了一眼客厅里妻子的照片。

Daisy Mayberry 很美，因为她心地善良，总愿意在别人需要时伸出援手。她有一头金色长发，丈夫却总把它剪短，尽管她一再想说服他别这么做。她最喜欢的颜色是红色，也常穿红色的衣服。Lisa Chambers 深爱她的母亲，因为 Daisy 一直陪伴在 Lisa 身边，教会她许多人生的道理。

Lisa Chambers 今年 35 岁。她也遗传了父母白皙的肤色。Lisa 有一头及肩的浅棕色头发和一双绿色的眼睛。她在白色实验服下穿着一件白色长袖衬衫，配蓝色牛仔裤和运动鞋。

Lisa 走进浴室，关掉灯的开关。她打开洗手台上方的药柜，从最顶层取出一个镊子和一面小放大镜。

Lisa 把放大镜对准母亲左侧乳房，用镊子夹住从母亲胸口凸起的一个小肿块的边缘。她来回移动镊子，直到第十二次尝试时才拔出一根细小的棕色毛囊。

Lisa Chambers 在家乡做全科医生。她的办公室就在她度过童年的那栋楼里，紧挨着她母亲的五金店 Daisy's Place。Lisa 走到洗手池另一边，用肥皂和热水轻轻洗手。

她用之前放在洗手台上的一张纸巾擦干手，又照了照镜子，然后戴上一副橡胶手套。Lisa 走回母亲病床旁，拿起镊子和放大镜，又从 Daisy 的乳房上取下了四根毛囊。

随后，Lisa 去了位于大楼二层的办公室。她打开办公室的灯，启动电脑，拉开抽屉，把那四根毛囊和她从 Daisy 血样中收集的其他物品一起放进一个小塑料袋里。

她坐在办公椅上，移动鼠标点击 Microsoft Word 图标，打开一个空白文档[Lisa 找到了一种有希望的治疗方法，但在获批方面面临挑战。场景：医院会议室。角色：Lisa Chambers]。

Lisa 在 Word 文档的标题栏里打上“Treatment（治疗）”几个字，然后开始输入对 Daisy 病情的详细描述——那是她离开医院前凭记忆记下的。

Lisa 尽量保持镇定，一边记下医生们观察到的症状清单，以及他们的意见和可能的诊断。她描述了 Daisy 已接受过的各种化疗和放疗，包括它们的效果和副作用。

她移动鼠标，把一个此前在 Microsoft Excel 里做好的表格拖进 Word 文档。这张表分为三列。

第一列列出了 Lisa 在网上找到的临床试验名称。第二列记录了每项试验的入组患者人数，以及他们在生存率、肿瘤缩小和副作用减轻方面取得的进展。第三列则根据已完成的临床试验结果，计算出每种药物成功的概率。

Lisa 移动鼠标，把 Excel 表格中的一张图表拖进 Word 文档。她把所有成功临床试验的信息都写进图表的各栏里，还把正在开发中的临床试验及其预计启动日期也一并加了进去。

鼠标在屏幕上滑动一番后，Lisa 得以选中所有的 Excel 表格，并把它们移进 Word 文档。

Lisa 移动鼠标回到 Word 文档的第一页，在那里记录了一份详尽的医学治疗清单，以及关于最常见癌症类型临床试验的其他有用信息。

Lisa 再次移动鼠标选中 Word 文档的第一页，把它移到电脑屏幕上的一个空白页，随后在那上面填满了针对晚期乳腺癌的实验性治疗清单。

Lisa 移动鼠标选中 Excel 表格中的一个单元格，高亮了一组包含两类信息的单元格：患者的癌症类型以及发现时的分期。她从一个单元格移到下一个，把所有这些信息都移进 Word 文档。

Lisa 把鼠标移到电脑屏幕上的一个空白处，新建了一张表，记录下所有计划参加一种名为 ZX-71 的药物实验性治疗的患者。她把所有这些患者都移进 Word 文档。

[Daisy Chapel 被诊断出患有癌症，治疗随即开始。场景：Daisy 的家。角色：Daisy Mayberry、Lisa Chambers] 接着，她又把患者的年龄、体重和身高加到每条记录里，并把那些数据也移进 Word 文档。

Lisa 从图表中看出，其他药物对 Daisy 所患的那种乳腺癌效果不佳。她移动鼠标打开一个新的 Excel 窗口，记录下参与这些研究的患者们在病逝前存活了多少年。

如她所料，其中有一些离群值，但大多数人都在头两三年内去世。虽然她的图表里只收录了一小群患者，但数据表明，如果 Daisy 参加药物试验，她的存活几率最多也不过五五开。

Lisa 移动鼠标关掉 Excel 窗口，决定该用 Daisy 家里的电脑了。她知道 Daisy 在家行动困难，因为她既弯不下腰，连站都站不稳。Lisa 把鼠标移到任务栏上 Daisy 的账户头像图标上，打开 Daisy 的家用笔记本电脑，把它搬到厨房水槽旁的台面上。随后，她在 Daisy 的家用电脑上新建了一个 Word 文档，开始打字。

Daisy 现在已出院回家。她的化疗从今天开始，接下来几天她需要大量时间卧床。重要的是，她在化疗后恢复期间不能摔倒或受伤，因此 Daisy 的房子经过改造，对她来说更安全了。现在她前门和后门都各有一条轮椅坡道，前厅还装了座椅电梯，让她能轻松地在主楼层和楼上之间移动。Daisy 是去年七月搬进这栋房子的，但从那以后，她几乎再没真正出过这个家门。

Lisa 把光标向右移，打开新的一页，又开始打字。Daisy 之所以从没离开过家，是因为八月回到家时她身体太虚弱，之后病情先是迅速恶化，后来才稳定下来。Daisy 的房子是为满足她的需求而改造的，直到上周她还需要不间断的照护。她的家人和朋友一直轮流日夜照看她，每人每天值四个小时。幸运的是，在这段[Lisa Chambers 找到一种有助于改善 Daisy 预后的治疗方法。场景：Lisa 的办公室。角色：Daisy Mayberry、Lisa Chambers]急需帮助的时期里，大家都能抽出空来帮她，因为 Daisy 的情况十分严重。

而现在，Lisa 正坐在 Mayberry 医疗中心的办公桌前，把这些信息输入一个 Word 文档，希望这能帮助挽救 Daisy 的生命。

Lisa 惊讶于自己竟能如此轻松地把工程方面的技能迁移到医学上来。过去一个月，她一直在急诊科全职工作，忙得不可开交。但现在她正利用午休时间，坐在电脑前为一位同事做研究。做完之后，Lisa 打算回到岗位上，继续日常的工作。

过去五周，Lisa 一直在研究治疗 Daisy 癌症的方法，于是她决定暂停研究，趁还在上班时去看看母亲。昨晚，Lisa 在医院待了一整天后回到家，Daisy 的病情却意外恶化，Lisa 整个周一晚上都在照顾母亲。今天早上起床后，Lisa 找了件薄外套，在十月微凉的空气中出门上班。她不需要咖啡，也没吃早餐，径直走进办公室继续工作。

Lisa 正飞快地打字时，手机在另一个房间响了起来。她走到厨房，从台面上拿起手机。“嗨，妈妈。”Lisa 说。

“嗨，宝贝。”Daisy 说。她的声音沙哑，正如 Lisa 预料的那样。

Lisa 走进办公室，拉过一把椅子坐到桌旁。“我现在在上班，妈妈；下午回医院之前，我还有些文书工作要完成。”

Lisa 坐下来，把额头靠在桌沿上。她闭了一会儿眼睛，试图缓解肩头开始积聚的紧张。她给了自己一点时间平复情绪，才再次开口。

“我能为你做点什么？”Lisa 终于说道。

“嗯，有件事我想让你去做。我需要你去我的办公室，把那个小笔记本从我的抽屉里拿出来。里面有一些给你的重要嘱咐，还有一些我留给你孩子们的最后的智慧之言。[Daisy 开始接受治疗，镇上居民聚集到她身边。场景：医院。角色：Daisy Mayberry、Charles Grayson、Tanya Swanson] 在那之后，我只需要你现在专心好起来。”

这时 Lisa 站起身，走进另一个房间去拿 Daisy 的笔记本。她回到椅子上，翻开笔记本。

前几页写的是关于她不在之后，家里该如何料理事务的嘱咐；最后几页则是一些她想让子女们在她去世之初的震惊过去之后再读的智慧之言。

就在要开始读时，Lisa 停了下来，把笔记本举起片刻，斟酌着自己的措辞。

“你知道吗，也许我不该把笔记本里这部分念给他们听。”“哦？为什么不呢？”

“也许一次听这么多会受不了。也许一下子消化这么多，对他们来说太难了。”

Lisa 停下来想了想，然后抬头看向 Daisy：“我能不能现在只跟他们讲一部分，剩下的以后再读？”

“当然可以。你觉得怎样对你的孩子最好，就怎么做。但有些我写下的东西，我希望在我去世之前让他们听到。”

Lisa 点点头，坐回椅子里。“好，那么首先，他们应该知道，你写下了你为他们多么骄傲。既包括他们迄今为止面对这一切的方式，也包括我在医院陪你期间他们把家里的一切打理得井井有条。

“你写了很多，说你对他们做好这些事有多么有信心，即便我不在的时候也是如此。你说你觉得 Lisa 已经准备好应对几乎一切，还说如果有一天必须如此，她也已经准备好接手生意。

“你还为他们在学业上的刻苦努力感到非常骄傲。你说你对他们的未来走向有种很好的预感。”Lisa 说到这里停了一下，但从 Daisy 的眼神可以看出，她仍完全清醒，认真听着。

“不过，我不确定他们该在什么时候知道其余的部分。”她继续说，“你谈到了几件重要的事，等我走后会影响他们。有些事情，我们需要一家人一起谈。[镇上居民帮助 Daisy 治疗，并给予支持。场景：医院候诊室。角色：Daisy Mayberry、Maggie Simpson]”

这时，Daisy 的眼皮开始微微颤动，还倒抽了一口气。Lisa 看向办公桌旁的护士，做了几个手势，引起了她的注意。护士走过来检查了 Daisy 的生命体征，然后回头看 Lisa，点了点头。

“很可能只是这些注射剂的副作用。”她解释道，“她可能需要吸几分钟氧，但应该没事。让她休息一下，然后再试着说话。”

Lisa 点点头，用手背贴了贴 Daisy 的额头测体温。“我本该把你的帽子带来的。”她一边说，一边想着还有什么可能让 Daisy 不舒服。

“会没事吗？”Daisy 用迷迷糊糊的声音问，“一切发生时，你会陪在我身边吗？”

Lisa 强压着内心的紧张开口。“我当然会在。”她向 Daisy 保证，然后凑近听护士解释正在发生的情况。

“我觉得你可能是有点发烧。”她边说边给 Daisy 搭脉，“他们只需要给你吸点氧，我们很快就能继续了。你真是个勇敢的病人。”护士继续说，然后转向 Lisa 补充道：“你把她照顾得非常好。她有个了不起的家庭。我相信她会没事的。”

Lisa 努力控制呼吸，点头回应。“等他们一给你放行，我就去候诊室陪我妈妈。她已经把所有万一出事时要我知道的事情都告诉我了。”她抢在护士插话前说道。

Daisy 睁开眼睛，缓缓把头转向 Lisa。“谢谢你今天为我们所有人守在身边。”她说，“我知道这对你来说并不容易，但如果将来有什么我能报答你的，尽管告诉我。”

Lisa 伸出一只手，放到唇边作为回应。“我现在还不想谈[Daisy 的治疗过程艰难，镇上居民给予支持。场景：医院。角色：Daisy Mayberry、Evelyn Chambers、Maggie Simpson]这些。我只想熬过今天，看看明天一早情况如何。等明天我们和医生谈过之后，我就能更清楚你离开这里后我们该做什么了。”

当 Lisa 转回身看向 Daisy 时，她的眼里噙满了泪水。护士走到她们身旁，用纸巾擦了擦手，然后伸手碰了碰 Daisy 的胳膊。“Mayberry 夫人，我想您女儿累坏了，需要回家休息一下，晚上再过来。她今天帮了大忙，也着实鼓舞了许多其他病人。我知道她是个特别的人，但她今天展现出的坚强，让这里的每个人都备受振奋。”

护士说话时，Daisy 赞同地点点头。“我也觉得她该回家了。她每天起得很早，来照顾我，然后在天黑前赶回这里，去做我需要她做的各种事。如果你不介意，我想让她今晚留在这里陪我。我想在她回家前，我们俩好好聊一会儿。”

Lisa 瞥了她一眼，勉强笑了笑，但显然，这一整天的情绪压力已经开始显现。她们站起身朝门口走去时，Lisa 伸手握了握妈妈的手。“我知道你累了，但很高兴你今晚留在这里。我真的很想谈谈今天下午，以及在我办公室里发生的事。”

“我也是。”Daisy 说着，回握了她的手，“不过我想你应该先休息一下，因为我想趁记忆还新鲜，把事情原原本本讲给你听。”

两人相视而笑，走出房间，沿着走廊朝 Lisa 的办公室走去。四周突然一阵忙碌，护士和医生们拿着病历、推着药车、搬着设备和其他各式物品来回穿梭。然而，当她们走进走廊从旁经过时，这阵喧闹却戛然而止，没有一个人看她们一眼。

在走廊的寂静中，她们一路走到 Lisa 的办公室，在她办公室的沙发上面对面坐下。“好，[镇上居民帮助 Daisy 度过治疗期，她最终战胜了癌症。场景：Daisy 的家。角色：Daisy Mayberry、Charles Grayson]把你对这项试验了解的一切都告诉我。”Lisa 说着拿起笔记本电脑，开始开机。

Daisy 重重叹了口气，靠坐在双人沙发上，把脚蜷到身下。她烦躁地双手捋过头发，然后开始说：“我其实对它了解不多，只知道医生说，那是针对我这种特定类型肺癌的实验性治疗。他告诉我说，在我能加入这项试验之前，要先送我去圣路易斯的纪念医院（Memorial Hospital）做评估。他说医院的一个研究委员会联系过他，他们会见我会对我进行评估。我应该在明天中午出发。”她说着向后一靠，用手遮住眼睛。

Lisa 坐在办公桌后，双手交叠放在身前。“这是天大的好消息！能让你离开家，去一个我随时都能顺路探望的地方，真是让人松了一大口气。你最近越来越难伺候了。”她说，紧接着又补了一句，“我这话可不是在挖苦你。”

Daisy 看着 Lisa，笑了。“我知道你不是在挖苦我。我最近确实很难伺候，但也许现在我离开一阵子，能让你歇一歇，不再那么心力交瘁。也许这也能让 Bill 减轻一些他一直在承受的压力。”她说。

两人默默坐了一会儿，Daisy 又继续说：“我想这或许就是解决我们所有难题的答案。只要我能挺过来，我们就不必再为钱从哪里来而发愁。我们又能衣食无忧了。而且，就像我们上学时常说的……那就像是在彩虹尽头找到了那一罐金子。”

“我同意。”Lisa 说，接着又补了一句，“可是我呢？我怎么知道你能挺过来、能平安无事？万一没用，你还是会死呢？没有你，我怎么活下去？你是我的一切。谁来照顾我[Daisy 的癌症治疗过程艰难，但在亲友的支持下，她最终战胜了病魔。场景：医院。角色：Daisy Mayberry、Tanya Swanson、Evelyn Chambers]？”Lisa 这下真的哭了，而女儿滚落的泪水反而给了 Daisy 一丝安慰。

“那种事永远不会发生。”她说，“我对医生有信心，也对自己不放弃的决心有信心。我知道上帝不会让我失望，他一定对我另有安排。再说了，我还会在这里陪着你，我们能一起熬过去。”

“我知道你说得对。”Lisa 一边慢慢擦干眼泪一边回应，“现在只要你也能让镇上其他人相信这一点，一切都会好起来的。”

Daisy 轻声笑了，接着说：“我的朋友和邻居们都在尽力支持我。但他们似乎也都很难相信这一点。我只是希望他们能……”

Lisa 打断了她：“要是他们亲眼见过你所经历的一切呢？你的治疗有时痛苦到令人衰弱不堪，我甚至得让你趴在肚子上、拖着你穿过屋子，免得你摔倒。最糟糕的其中一天，是他们在你平躺了一整天后逼你站起来。我不得不抓着你的胳膊，把你拉起来。那一刻，我以为我们就要在医院病房里当场崩溃了。”

“我记得。”Daisy 轻声笑着回答，“但那些日子已经过去了，现在唯一真正让我担心的，是治疗结束后我还能不能回到店里工作。这些治疗太复杂、太苛刻，我自己也说不准。但只要我能照顾好我自己的……”

Daisy 停顿了片刻，然后抬起头，直视着 Lisa。“谢谢你陪在我身边，宝贝；没有你，我撑不到今天。你相信我能挺过来，这对我意义重大。我不知道你对 Evelyn Chambers 了解多少，但她是我能想到的、唯一另一个会对我抱有这样信心的人。她比你还要相信得多。你有空应该找她聊聊。她知道我[治疗结束后，Daisy 回顾自己的经历，以及这段经历如何改变了她。场景：她的家。角色：Daisy Mayberry]也一定会回来的。”

Lisa 什么也没说。母亲又变得异常安静，她慢慢站起身，在房间里踱了几步，然后坐到长沙发上。她拿起放在冰茶杯旁的遥控器，按下开关，看起了电视。

Lisa 在母亲身旁坐下，伸出手握住 Daisy 的手。这个年轻的女人惊讶地发现，那只手握在自己手里竟是那样滚烫。两人看着电视时，她说：“妈妈，我担心如果你回不来了会怎样。我会孤零零一个人。”

Daisy 温柔地看着她，握紧了 Lisa 的手。“我知道，宝贝——我病成这样，太为难你了。不过星期六我就会回家，你等着瞧。”

Lisa 动了动嘴，发出些声音，喉咙里却挤不出一个字。她什么也说不出来，连那些在心里反复排练了好几天的话也说不出口；此刻她就坐在母亲身边，却怎么也吐不出那些话来。

她把握着 Daisy 的手抽回来，放到自己脸上，隔着薄薄的棉 T 恤感受到皮肤的冰凉。她的眼睛红红的，在昏暗的光线下她勉强能看清。

她的手慢慢下移到脖颈侧面，然后触到了那条从锁骨一直延伸到耳下的长长伤疤。她没有立刻把手移开，只是用手指沿着疤痕的走向轻轻抚过。

她把手拿开，端详着那道疤，又把头微微转向一侧，再转向另一侧，好从左、右两边都看清楚它。

“它好大啊，亲爱的——看起来就像被蛇咬了一口。他们说过几个月这疤会消退，可现在都一年了，还是老样子。我想他们一定是搞错了，它大概永远都会是这副模样。”

她把头转回来，看着母亲，笑了。“但你知道吗，奇怪的是，我如今甚至都不会注意到它了。它已经和我身上[Daisy 以自己的抗癌故事激励了他人。场景：Mayberry 镇广场。角色：Daisy Mayberry]的其他一切融为一体了。”

母亲朝她微笑，然后又握住 Daisy 的手。她的皮肤柔软温暖，像一片玫瑰花瓣。Daisy 闭了一会儿眼睛，感到热气在体内升腾。

“你知道吗，”她继续说，“起初我害怕极了。但如今一年过去了——我已无癌一身轻——那份恐惧也完全消失了。既然我战胜了那个想置我于死地的病魔，地平线上便再也没有阴影。而这一切，没有你们所有人是不可能实现的。”

她环顾四周，Mayberry 社区里每一位曾为她祈祷、或以任何方式帮助过她的人都从座位上站起来欢呼。她也站起身，人们微笑着围拢到她身边。有人双手合十祈祷，还有人上前拥抱 Daisy，或与她握手。

“非常感谢大家。”当这场热烈的庆祝终于结束、大家都回到座位上后，她说，“你们真的不知道这对我意味着什么。Mayberry 给予我的所有支持，都让我惊叹不已。镇上的居民和此刻广场上的各位，以我从未想过可能的方式帮助了我，为此我由衷地感谢你们每一个人。而你们中还没有机会加入的人，现在仍然来得及，来加入 Mayberry 与癌症抗争的行列。5 月 12 日上午 11 点，欢迎大家来 Mayberry 广场，参加我们举办的‘步行马拉松’（Walk-a-Thon），这是为本地癌症患者筹款的活动。届时会有 T 恤和气球出售，所以一定要来支持 Mayberry。”

接下来的几天里，前来 Mayberry 广场探望 Daisy 的人络绎不绝。人们远道而来，只为与她握手，告诉她他们多么敬佩她。她愉快地与每个人交谈，像过去几天一直做的那样，给每个人送上鼓励的话语。

Mayberry 广场并非唯一挤满前来探望 Daisy 的访客的地方；她家里每天也都宾客盈门。在这些访客中，有许多人曾在她[人们在她讲述故事后对她敬佩有加。场景：镇广场。角色：Daisy Mayberry、Tanya Swanson]与癌症抗争期间为她祈祷，如今看到祈祷得到应验，都如释重负。有些访客是来致意的，另一些则是出于好奇，只想亲眼一睹 Daisy 的风采。

Daisy Mayberry 是一位真正的英雄，激励了数百万见证她抗癌历程的人们。多亏了互联网和电视，她的故事已经传遍全世界。虽然她不是社区里唯一一个罹患癌症的人，但她绝对是其中最广为人知的一个。

Daisy 战胜癌症几年后，日子一切如常。她为自己能活着而高兴，也为战胜病魔而深感自豪。她有许多关于如何帮助他人解决困难的想法，并决定是时候把这些想法付诸行动了。

她做的第一件事，就是开设了自己的网站，好让全国各地乃至世界各地的人都能联系到她。她时常收到癌症患者的来信，他们向她请教如何挺过癌症确诊以及随后的治疗。

随后，她成立了一个非营利组织，目标是向有需要的人提供帮助。起初，这个组织叫“Daisy's Daisy 基金会”，是为了纪念她已故的宠物狗。后来，它更名为“Mayberry 社区外展”（The Mayberry Community Outreach）。

这个非营利组织提供范围广泛的服务。她提供的帮助从经济援助，到心理辅导，再到精神引导，一应俱全。她还开设课程，教人们如何应对罹患癌症带来的压力，并提供关于如何预防这种疾病的教育资料。

渐渐地，世界各地的人都开始把她视为激励人心的榜样，尤其是那些被诊断出癌症的人。因为她的故事，他们从不曾失去希望，并下定决心战胜疾病。

尽管她无论如何也算不上医学专业人士，但她乐于分享自己的亲身经历，并尽己所能提供支持。她以亲身经历深知，独自面对癌症有多么艰难。她知道当抗癌之战看似无望时，万念俱灰、陷入抑郁是什么滋味。她也知道，她所在的社区里没有足够的资源来帮助那些需要帮助的人。

她还切身体会到，家人照顾一个身患漫长而令人衰弱的疾病的亲人有多么艰难。她下定决心，要尽自己所能，减轻那些苦苦挣扎的人的负担。Mayberry 社区能有 Daisy Mayberry 这样的邻居和朋友，实在是莫大的福气。

**表 33：**DOC 针对表 32 所示计划生成的故事。方括号中的彩色文字表示与后续文本相对应的大纲条目。同样地，整体情节是通顺的，尽管一些细枝末节可能没有得到很好的遵循；特别是，在故事大纲中 Lisa 本应为 Daisy 研制出治疗方法的几个部分，故事未能忠实呈现。

### DOC 计划 4

**表 34：**我们在主实验中由 DOC 生成的第四个计划。颜色表示用于引导生成的叶节点。大纲提出的情节大体合理，尽管有些角色定义模糊（“幸存者群体”、“敌人”），也不清楚他们最终如何或为何会与这个“敌人”战斗。最后，最后一节中一些被动语态的表述有些奇怪（或许可归因于大纲生成时使用的高温度）。

**前提：**在世界因一场灾难性事件终结之后，一群幸存者发现自己身处一个陌生的新世界，他们必须团结起来，才能在这个新世界中生存下去，抵御等待着他们的种种危险。

**场景设定：**故事发生在一个后末日世界，世界已在一场灾难性事件中终结。

**角色：**

1. **全名：**Johnathan Prescott
   - **角色画像：**Johnathan Prescott 是一位强壮英俊的年轻男子，是幸存者群体的领导者。
2. **全名：**Maria Martinez
   - **角色画像：**Maria Martinez 是一位美丽而坚韧的年轻女子，是幸存者群体的二把手。
3. **全名：**Jake Peters
   - **角色画像：**Jake Peters 是一只可爱忠诚的狗，是幸存者群体毛茸茸的朋友。
4. **全名：**Ratzinger Kugelman
   - **角色画像：**Ratzinger Kugelman 是一个令人毛骨悚然、神秘莫测的男人，是幸存者群体的敌人。

**大纲：**

```text
1. 世界在一场灾难性事件中终结。场景：角色：
  a. 世界在一场灾难性事件中终结。场景：角色：
    i. 世界在一场灾难性事件中终结。场景：城市。角色：
    ii. 天空变红，大地震颤。场景：城市。角色：
    iii. 人们开始恐慌，惊恐地四散奔逃。场景：城市。角色：Maria Martinez
  b. 太阳消失，世界陷入黑暗。场景：角色：
    i. 太阳消失，世界陷入黑暗。场景：城市。角色：
    ii. 地面开始崩塌，建筑坍塌。场景：城市。角色：
  c. 月亮消失，星星从天空中隐去。场景：角色：
    i. 月亮消失，星星从天空中隐去。场景：城市。角色：
    ii. 地面断裂并裂开，吞没人群与建筑。场景：城市。角色：
2. 一群幸存者发现自己身处一个陌生的新世界，他们必须团结起来，才能生存下去，抵御等待着他们的危险。场景：角色：
  a. 一群幸存者发现自己身处一个陌生的新世界，他们必须团结起来，才能生存下去，抵御等待着他们的危险。场景：角色：Maria Martinez
    i. 一群幸存者发现自己身处一个陌生的新世界。场景：一片森林。角色：Maria Martinez
    ii. 一群幸存者团结起来，抵御等待着他们的危险。场景：一片沙漠。角色：Maria Martinez
  b. 幸存者群体必须在这个新世界中寻找食物和庇护所。场景：角色：Maria Martinez
    i. 幸存者群体在这个新世界中寻找食物和庇护所。场景：一片森林。角色：Maria Martinez
    ii. 幸存者群体找到一个扎营的地方。场景：一片沙漠。角色：Jake Peters、Maria Martinez
    iii. 幸存者群体生火取暖。场景：一片沙漠。角色：Maria Martinez
    iv. 幸存者群体捕了一些鱼来吃。场景：一条河。角色：Maria Martinez
3. 幸存者群体必须直面敌人并击败他，才能在这个新世界中生存下去。场景：角色：Ratzinger Kugelman
  a. 幸存者群体必须直面敌人并击败他。场景：角色：Maria Martinez、Ratzinger Kugelman
    i. 幸存者群体直面敌人并击败了他。场景：竞技场。角色：Johnathan Prescott、Ratzinger Kugelman
    ii. 与敌人的战斗打响并取得胜利。场景：竞技场。角色：Ratzinger Kugelman
    iii. 对敌人的胜利受到庆祝。场景：竞技场。角色：Ratzinger Kugelman
  b. 敌人被击败，幸存者群体在新世界中存活下来。场景：角色：Ratzinger Kugelman、Johnathan Prescott
    i. 新世界中的生存因敌人的失败而成为可能。场景：竞技场。角色：Ratzinger Kugelman
    ii. 幸存者群体庆祝他们对敌人的胜利。场景：竞技场。角色：Maria Martinez、Ratzinger Kugelman
```

### DOC 针对计划 4 生成的故事

**表 35：**DOC 针对表 34 所示的计划生成的故事。方括号中的彩色文本表示后续文本所对应的大纲条目。高层大纲大体上得到了遵循，尽管这次生成中存在一些较大的错误。特别是，当主角本应在结尾与“敌人”战斗时，故事却变成了在竞技场里观看熊互相打斗。故事中间一些角色们最初学会在新世界中生存的段落，也不完全遵循低层大纲条目。最后，开头关于世界终结的部分段落有些重复。

[世界在一场灾难性事件中终结。场景：城市。角色：] 有一天，世界就这么终结了。

天空变红，大地震颤。所有人都知道，对他们所有人来说，这就是末日。灯光熄灭，电力消失，随之而去的是自来水以及所有人们习以为常的必需品。世界终结了。

然后一切又重新开始了。一道绿色闪光和一个炫目的白色声响充斥着天空，仿佛世界正被电击般地清除干净。然后它又发生了。一次又一次。

突然之间，世界又恢复如常，但比以前更加黑暗。有人说天堂降临人间，将世界清洗干净，从今往后一切都会好起来。但这并不能真正解释为什么之后会有那么多黑暗。为什么一切显得比以前更暗。为什么世界在某种程度上显得更小了，像是它自己的一个缩小版。为什么人们到处都能看到鬼魂、僵尸、恶魔，以及所有本应在刚刚那场灾难中死去的生物。

世界再次走向终结，但这一次是来真的。世界中的黑暗正在蔓延。很快，一切都将永远消失。这一次，世界末日是真的来临了。[天空变红，大地震颤。场景：城市。角色：]

太阳让位于黑暗，而在这一切的中心，有一个巨大的光环，从地球的四面八方耀眼地闪耀着。它凭空出现，对它完全没有任何解释。但每个人都知道它是什么。他们也知道，这意味着世界末日终于到来了。

随着天空越来越暗，然后又更暗下去，光环变成了一个似乎从他们脚下大地散发出来的光圈，黑暗最终笼罩了一切。

整个大自然陷入了沉寂。

鸟儿停止了歌唱，草停止了生长，花停止了绽放，树停止了发芽。河流与小溪干涸了。

然后天空变红了。

整片天空都变成了红色，像血的颜色。大地在他们脚下剧烈震颤，整个大自然被一股似乎从他们脚下升起的可怕热浪所吞噬。[人们开始恐慌，惊恐地四散奔逃。场景：城市。角色：Maria Martinez]

于是人们在恐惧中四散奔逃，每个人都试图尽可能远离彼此。每个人都以最快的速度为自己的性命奔逃，不知道接下来会发生什么，也不知道自己会逃向何处。他们只知道，必须在末日降临之前，尽可能快地远离他人。

人们陷入如此严重的恐慌与混乱之中，以至于当 Maria Martinez 试图问别人发生了什么时，没有人理会她。他们满脑子只想着逃离所有人、逃到某个安全的地方，因此全都无视了她。

Maria [太阳消失，世界陷入黑暗。场景：城市。角色：] 在原地转着圈跑了一会儿，试图弄清楚发生了什么、该往哪里去，但一切都是徒劳。

“我不知道该怎么办！我该怎么办？”她在广场上转着圈奔跑时，绝望地对着夜空喊道。太阳消失在一道火墙之后，那道火墙像一条燃烧的河流般横扫地平线，将世界投入黑暗之中。此刻四周漆黑一片，诡异的影子四处舞动，仿佛有什么来自异界的生物在对他们恶作剧。

Maria 吓得浑身止不住地发抖，但她 [地面开始崩塌，建筑坍塌。场景：城市。角色：] 没有太多时间思考，因为大地在他们脚下剧烈震颤，地面开始崩塌，建筑纷纷坍塌。每个人都开始尖叫，试图尽可能快地逃跑，不知道是什么导致了这一切，也不知道该往哪里去。[月亮消失，星星从天空中隐去。场景：城市。角色：] Maria 和其他所有人一样在街道上奔跑时，能听到玻璃破碎的声音，以及远处邻居们惊恐的尖叫。

Maria 抬头望向夜空，看到一道明亮的光从天上照射下来。它的光束像上百万盏微小的聚光灯一样洒向大地，照亮了眼前的一切。现在一切都看起来不一样了，仿佛被某种本不该出现在那里的怪异光线照亮。突然，天空再次暗了下来，似乎地球上裂开了一个洞，透过它能看到他们脚下的深处。月亮消失，星星从天空中隐去，世界陷入黑暗。接着地面断裂，一道巨大的裂缝从地平线蔓延到地平线，吞没了沿途的一切。

随着大火吞噬世界，天空褪成红色。最后，光线消退了，一切再次归于寂静。接着，一道令人目眩的白色火焰迸发而出，吞没了天空。地面崩塌裂开，不仅吞没了天空，也吞没了眼前的一切。树木、建筑、汽车，全都像暴雨中的尘土一样消失不见。

除了一栋孤零零的建筑之外的一切——它毫发无损地矗立在这场混乱的中心；它未被那 [地面断裂并裂开，吞没人群与建筑。场景：城市。角色：] 吞没了其他一切的混乱所触及。

汽车和尸体像风中的尘土一样在空中飞舞。落地时，它们像炸弹爆炸的种子一样散落在各处。那些曾在这里生活和工作的人们，被迫眼睁睁看着自己的家园、朋友和家人死去，就在他们被下方的大地吞没之前。

地面崩塌、裂开，仿佛它也正在死去。接着，伴随着一声巨响和雷鸣般的轰鸣，一切都停了下来。大地再次归于寂静，仿佛什么都没有发生过。在远处空间的虚空中，在地面碎裂的地方，一个黑暗的身影正站在一根石柱顶端。它举起巨大的黑色手臂，张开嘴，射出一道冲入天空的白色火焰。它的嘴张得更大了，吞下了整个世界……

……

什么都不剩了。[一群幸存者发现自己身处一个陌生的新世界。场景：一片森林。角色：Maria Martinez]

Maria Martinez 仍在奔跑。她能感觉到双腿火辣辣的灼热，但她继续向前。其他人都分散在她四周；有些人被混乱吞没，消失在了下方的大地里，另一些人则足够幸运，得以站稳脚跟、逃离那栋建筑；但所有人都以最快的速度朝相反方向奔跑。他们周围的空气弥漫着灰尘和烟雾，灼烧着他们的眼睛，让人呼吸困难。在他们身后，他们听到树木相互撞击的声音，那些树像枯叶一样从天空中坠落。

“快走！继续走！”她对他们喊道。“继续走！能多快就多快地走！”她继续奔跑，越跑越快，试图逃离危险区域，带领所有人到达安全之地。他们全都惊慌失措；目光四处乱瞟，试图瞥见追赶他们的危险。有些人跑得比其他人快，但最终所有幸存者都像一群飞翔的鸟一样，作为一个整体一起移动。

他们作为一个整体移动着，直到他们跑过某处时，地面裂开，将他们吞没。突然，所有的移动都停止了。所有的声音都消失了。森林死一般寂静。连树木也停了一瞬间，Maria 害怕它们也死了，害怕它们也像它们的其他同类一样刚从天上坠落。但随后树木又开始移动，抖落叶子上的灰尘和烟雾。然后他们又作为一个整体移动起来。

几个紧张的时刻过后，Maria 带领所有人来到森林中的一片空地，那里奇怪地没有泥土和石头，也没有断枝和枯叶。它看起来很怪异，就像地面 [一群幸存者团结起来，抵御等待着他们的危险。场景：一片沙漠。角色：Maria Martinez] 最近被打磨过一样，仿佛是被一把巨大的金属刮刀打磨过。

“大家停下！”Maria 说。“来吧，别跑那么快了。”幸存者群体停下脚步，看着她向他们走来。Maria 站在他们面前，脱下背包，取出里面的东西。

“哦，”一个穿着蓝色牛仔裤和黑色连帽衫的男孩说。

他大约十岁，棕色头发里夹杂着橙色的荧光条纹。他用双手紧紧抓着背包。

“怎么了？”Maria 说，低头看了看自己的背包，又看向那个男孩，脸上带着一丝得意的笑。

“没什么，”他说，不自在地挪了挪身子。

这时，一个穿着橄榄褐色飞行服的中年男子走到 Maria 和队伍其他人之间。

“女士们，先生们，”他说。“我叫 Colby，曾是美国军方的一员，我的职责是确保你们所有人都能安全地进入下一段旅程。”

那群人只是面无表情地看着他。

“继续前进，”Colby 说，手臂朝地面伸着，指了指自己。“现在，我们必须继续前进，找一个安全的地方过夜。”

Maria 的胳膊动了动，把身体重心从一只脚换到另一只脚。

“前进？”她说。“往哪前进？我们不知道自己在哪，也不知道发生了什么。去一个我们原本没打算去的地方，听起来真是个糟糕的主意。”

其他人尴尬地转动着脑袋，不知道该说什么或做什么。

“继续前进，”Colby 又说，“你们的右边是一片沙漠。你们的左边是一片茂密的丛林。走进沙漠，你们肯定会死于沙漠的酷热。走进丛林，你们毫无疑问会在某个错误的转弯处迷路，最终掉进深坑或流沙河。继续前进，我们可以缓慢而小心地沿一条直线行进，尽可能远离这个地方。然后我们可以扎营过夜，[幸存者群体在这个新世界中寻找食物和庇护所。场景：一片森林。角色：Maria Martinez] 再想想接下来该怎么办。”

那群人默默点头，开始沿着小路缓慢前行。没过多久，他们便穿过一片又黑又冷的森林。他们周围的树木高大、粗壮而美丽，但它们的形态中透着某种不祥的气息。它们自行移动着，仿佛正准备攻击这些新来的访客。

Maria 觉得这里太阴森了，宁可到丛林里去碰碰运气。她转身朝他们来时的方向折返，就在这时，她感到脖子上一阵刺痛。几秒钟后，森林里的所有动静都停了下来。

他们全都停下脚步，紧张地环顾四周，想找出导致这一切的原因。起初，他们以为也许附近有人正从树丛里盯着他们，但很快便明白，森林里没有任何东西在动。森林完全静止了。森林太大了，即使在有限的阳光下，他们也无法看清那里的一切。他们能听到灌木丛里有东西在移动，却什么也看不见。

森林开始让人感到越来越有威胁，Maria 觉得自己似乎会离其他人越来越远。她环顾四周，寻找某种保护，比如一棵大树或类似的、能给她一个藏身之处的东西。她低着头在树间缓慢移动，寻找任何可能像藏身之处的东西，这时她听到身后有动静。她转身朝其他人跑回去，但已经太迟了。

不知从哪里，有什么东西从她身后窜了上来，迅速把双臂搭在了 Maria 的肩膀上。等她反应过来，森林已经再次安静下来。她环顾四周，看到其他人正在移动，但非常缓慢。他们脸上带着惊恐的神情，移动的样子就像走在滚烫的炭火上。

她正要再次跑进森林，却停下了脚步，因为她的腿突然碰到了脚下某种黏糊糊、令人不适的东西。她低头一看，发现有什么 [幸存者群体找到一个扎营的地方。场景：一片沙漠。角色：Jake Peters、Maria Martinez] 像是蛛网的东西粘在了她的靴子上。

她伸手去抓它，但它撕了下来，粘在了她的头发里。当那东西开始缠绕她的头时，她尖叫起来，她感到它的腿隔着衣服内侧、贴着皮肤，开始刺痛发痒。她试图拉扯撕扯它，但它现在已经到处都是，盖住了她的嘴和鼻子、眼睛和耳朵。

这时，他们身后传来一阵声响，一种她从未听过的声音。那声音像低沉的咆哮或轰鸣，接着是尖锐的尖叫和嘶喊。不管那是什么，它听起来又大又饥饿。

她回头看向队伍里的其他人，发现他们都在疯狂地环顾四周，无法决定该往哪个方向跑。她抬起手，想指出他们身后的那个生物，但还没来得及说什么，它便进入了视野，它发出的尖叫是她从未听过的。

它有一个男人那么高，宽度却是其两倍，手臂长而肌肉发达。皮肤斑驳，呈棕色和灰色，身上大片地方长着片片毛发。但这个生物最引人注目的是，它的四条腿的末端各是一条又长又粗、像昆虫一样的尾巴。

蛛网让队伍的行动变得更加迟缓，他们花了好几分钟才挣脱出来。到那时，那个生物已经逼近了他们。他们试图逃跑，但一根锋利的毒刺击中了 Maria 的左大腿，她尖叫着瘫倒在地。

伴随着一声巨大的咆哮，那个生物用胳膊缠住她的头，把她举到空中。她听到 Jake 在吠叫，与那个生物搏斗，试图再次攻击它，但当她抬头望向天空时，她意识到唯一的光来自他们身后的一轮满月。尽管天气寒冷，他们此刻却身处某处沙漠之中。

这群人在恐慌中跑了似乎好几个小时，从一片沙地移动到另一片沙地。他们移动得很慢，不时被坠落的岩石和松散的沙子绊倒。插在 Maria 腿上的毒刺越来越痒，但他们移动得如此之慢，没人能帮她。

最后，他们到达了沙漠中央的一小片沙滩，全都精疲力竭地瘫倒在沙子上。[幸存者群体生火取暖。场景：一片沙漠。角色：Maria Martinez] Maria 抬头望去，看到一堵高高的悬崖在他们上方耸立，四周环绕着一条太宽而无法跳过的深谷。她再次昏倒前记得的最后一件事，是听到 Jake 在她身后某处吠叫。

第二天早上，Maria 睁开眼睛，发现自己和其他人一起躺在一条毯子上，裹在各自的睡袋里。阳光透过峡谷顶部的狭窄缝隙明亮地照进来，烘烤着他们临时的营地。

他们醒来后，都围在小小的火堆旁取暖，躲避仍吹过沙漠的寒风。他们吃了早餐，分享着 [幸存者群体捕了一些鱼来吃。场景：一条河。角色：Maria Martinez] 世界末日之前各自生活的故事，然后 Maria 领着他们下去查看，看下水捕鱼是否安全。

她往沙滩外多走了一点，用左腿跪下。她低头看着自己受伤的腿，叹了口气，不知它何时才能痊愈。

“Maria！”Jake 从河对岸喊道。“回这边来！现在下水很安全了！”

她转过身，看到他正游过浅水朝她而来。“你觉得我们能捕到鱼吗？”

“我们得试试，”Maria 说。“我不知道我们还能靠干果和坚果撑多久。话说我们到底在这里多久了？感觉像过了一辈子。”

他们走到河边，盯着对岸看了一会儿，才决定下水。他们蹚进水里，直到水没到腰部，然后开始用脚在浅水中慢慢画圈移动，等着肌肉适应河水冰冷的温度。

“你知道，”Jake 说，“如果我们真捕到了鱼，也许我们该离开这个地方了。我们不能永远待在这里。在找到别处可以生活的地方之前，我们的食物或水可能会耗尽。”

“离开？”Maria 说。“你疯了吗？我们当初就是因为离开才陷入这团麻烦的！我们甚至不知道自己在哪。我们怎么可能搬到一个新地方去？”

“我不知道，”Jake 说。“大概，搬到那边山坡上的大城市去吧。它看起来够大，里面应该有充足的水和食物。我们到底走不走？”

他们继续在水中前进，轻轻踢动双脚让自己保持漂浮。走了很久，他们才来到河边的一处沙洲。他们走上前，踏上了水边的干燥地面。[幸存者群体直面敌人并击败了他。场景：竞技场。角色：Johnathan Prescott、Ratzinger Kugelman]

Jake 环顾四周，看到河对岸有一片建筑。

“我们过去吧，”他说。“我们可以不弄湿脚就过河。”

他们走到河的另一边，这里的河只有大约六英尺宽。他们走上河岸，Jake 在一栋砖砌建筑前看到一块写着“River Arena”的牌子时，停下了脚步。

他盯着它看了一会儿，然后转向其他人。

“我们得进去，”他说。“我觉得那是个竞技场之类的。看起来他们曾在那里让野生动物打斗什么的。”

“哦，不！求你别让我进去！我害怕野生动物！”

Maria 用手捂住眼睛，又把手放在他的后脑勺上。他们还在往河岸上走，她正拦着不让他离开。

“我受不了看活生生的动物互相打斗。求你了，Jake，我们去别的地方吧。”

他转过身看着她。然后他把双手放在她的肩膀上。

“Maria，我觉得我们别无选择。看起来这是这边唯一的建筑，而我们今晚需要一个地方过夜。”

她叹了口气，停下脚步。然后她把他的手从自己手中抽出，放到自己的腰上，觉得那样更舒服。然后她抬头看着他，试图弄清楚他在想什么，他到底是什么样的人。

“看起来里面有个大房间，人们可以坐在那里看打斗。看起来还有某种楼梯通向下面的楼层。我不知道待在那个房间里是否安全，但我们至少可以在这里避避风雨。”

Maria 点点头，又开始往河岸上走，朝着 River Arena 的入口走去。

那是一栋老旧的两层砖砌建筑，一块很大的牌子悬挂在支撑屋顶的横梁上。牌子漆成黑色，红色的底色上 [与敌人的战斗打响并取得胜利。场景：竞技场。角色：Ratzinger Kugelman] 画着白色的字母。

牌子的第一个词写着“River”，第二个词写着“Arena”。然后还有一幅画，画的是波浪绕过两根柱子之间的岩石，两根柱子各在“Arena”一词的一侧。

Maria 向下看向竞技场，那里聚集了一大群人，观看两只大熊打斗。

在斗场的一角，一只老灰熊正在与一只年轻棕熊打斗。灰熊体型巨大，用四肢攻击对手，看起来非常强壮有力。两只熊用爪子、牙齿和拳头互相搏斗，战斗激烈而残酷。两只熊一直打到其中一只获胜为止。

这场打斗残酷而刺激。当一只熊击败另一只时，人群欢呼着表示赞许。[对敌人的胜利受到庆祝。场景：竞技场。角色：Ratzinger Kugelman]

Jake 说：“你没告诉我这里会有打斗！这太酷了！”

那只老灰熊累极了，瘫倒在斗场的地板上，任由棕熊爬到它身上。棕熊一遍又一遍地击打对手的肋骨，直到灰熊终于不再还击。然后棕熊咬进对手的脖子，撕下了一大块肉。获胜的熊浑身是血，跳到斗场中央的一堆干草上庆祝。[新世界中的生存因敌人的失败而成为可能。场景：竞技场。角色：Ratzinger Kugelman]

当棕熊撕碎老灰熊、吞食它的肉时，人群大声欢呼。当观众看到棕熊把一只眼球当作开始吃对手肠子之前的最后一口食物咀嚼时，他们惊恐地尖叫起来。

棕熊把灰熊被撕烂的尸体扔到一边，又跳回斗场庆祝胜利。老灰熊死了，人群兴奋不已。这是一场残酷血腥的打斗，但无论如何都是一场精彩的打斗。

那只被击败的灰熊如今成了新世界里最有名的棕熊。他克服一切不利条件取得了胜利，证明了即便是小个子也能击倒巨大的对手。在新世界里，事情总是这样。在这个新世界里，只有强者才能生存，任何 [幸存者群体庆祝他们对敌人的胜利。场景：竞技场。角色：Maria Martinez、Ratzinger Kugelman] 达不到这一标准的人都会死去。

Maria Martinez 从观众席的前排座位看完了整场打斗。她是 Ratzinger 最亲近的顾问之一，自他们到来以来，她见过各种各样的打斗。她曾看着 Ratzinger 撕碎幸存者群体并吞食他们的肉。但现在，局势已经扭转，如今掌权的是 Maria Martinez。

她面带微笑地从座位上站起来。“干得好，我的朋友！你做到了！”她对 Ratzinger 说。

Ratzinger Kugelman 正一口一口地吃着死灰熊的尸体来庆祝胜利。他浑身沾满打斗留下的血和泥土，血迹斑斑的脸上挂着巨大的笑容。他正在享用他最爱的食物之一：灰熊。

幸存者群体看到他们的领袖，欣喜地欢呼起来。他们都曾遭受敌人无情的攻击，如今终于得以歇一口气。他们喝熊血、吃尸体、为领袖欢呼，以此庆祝胜利。

### DOC 计划 5

**表 36：**我们在主实验中由 DOC 生成的第五个计划。颜色表示用于引导生成的叶节点。请注意，一些角色的名字已被替换，以避免与名人姓名重叠。由于我们用于生成的高温度，存在几处拼写错误；同样，名人姓名的出现也显得奇怪。除此之外，情节似乎合理。

**前提：**当一个连环杀手的下一个受害者在一个黑暗的地下室里醒来时，她必须运用自己的智慧，在成为杀手的下一个战利品之前逃出去。

**场景设定：**故事发生在一个阴暗潮湿的地下室里，四周是混凝土墙壁，地面是泥土地。

**角色：**

1. **全名：**Valerie Marx
   - **角色画像：**Valerie Marx 是一位二十出头的年轻女子。
2. **全名：**John Doe
   - **角色画像：**John Doe 是一位身材精瘦、体格健壮的中年男子。
3. **全名：**Male Celebrity A
   - **角色画像：**Male Celebrity A 是一位四十多岁的好莱坞演员。

**大纲：**

```text
1. Valerie Marx 在一个黑暗的地下室里醒来，被捆绑着、嘴被堵住。场景：角色：Valerie Marx
  a. Valerie 恢复了意识，发现自己身处一个黑暗的地下室。场景：角色：Valerie Marx
    i. Valerie 恢复了意识，发现自己身处一个黑暗的地下室。场景：一栋房子的地下室。角色：Valerie Marx
    ii. Valerie 试图挣脱自己，却意识到自己的手脚都被绑着。场景：一栋房子的地下室。角色：Valerie Marx
  b. Valerie 设法挣脱了自己，并开始探索地下室。场景：角色：Valerie Marx
    i. Valerie 设法挣脱了自己，并开始探索地下室。场景：一栋房子的地下室。角色：Valerie Marx
    ii. Valerie 发现了一扇门，但门锁着。场景：一栋房子的地下室。角色：Valerie Marx
    iii. Valerie 发现了一扇窗户，但窗户太高，她够不着。场景：一栋房子的地下室。角色：Valerie Marx
2. 连环杀手 John Doe 告诉 Valerie，她必须在黎明前逃出地下室，否则她将成为他的下一个战利品。场景：角色：John Doe、Valerie Marx
  a. 逃出来之后，Valerie 撞见了 John Doe。场景：角色：John Doe、Valerie Marx
    i. Valerie 在地下室里醒来，试图逃跑。场景：地下室。角色：Valerie Marx
    ii. Valerie 遇见了 John Doe。场景：地下室。角色：John Doe、Valerie Marx
  b. John Doe 告诉 Valerie，她必须在黎明前逃出地下室。场景：角色：John Doe、Valerie Marx
    i. John Doe 告诉 Valerie，如果她想活命，就必须在黎明前逃出地下室。场景：地下室。角色：John Doe、Valerie Marx
    ii. John Doe 让 Valerie 先跑一步，然后他再来追她。场景：地下室。角色：John Doe、Valerie Marx
    iii. Valerie 试图逃出地下室，却撞见了 John Doe。场景：地下室。角色：John Doe、Valerie Marx
    iv. John Doe 在地下室里追赶 Valerie。场景：地下室。角色：John Doe、Valerie Marx
3. Valerie 运用她的智慧逃出地下室，躲避 John Doe。场景：角色：John Doe、Valerie Marx
  a. Valerie 试图逃跑，但被 John Doe 抓住了。场景：角色：John Doe、Valerie Marx
    i. Valerie 试图逃跑，但被 John Doe 抓住了。场景：地下室。角色：John Doe、Valerie Marx
    ii. Valerie 设法说服 John Doe 放她走。场景：地下室。角色：John Doe、Valerie Marx
    iii. Valerie 找到一件锋利的物体，威胁说如果 John Doe 不放她走，她就自杀。场景：地下室。角色：John Doe、Valerie Marx
  b. Valerie 用她的演技骗过 John Doe，成功逃脱。场景：角色：John Doe、Valerie Marx
    i. Valerie 用她的演技让 John Doe 相信她已经逃走了。场景：地下室。角色：John Doe、Valerie Marx
    ii. John Doe 上了当，Valerie 成功逃脱。场景：地下室。角色：John Doe、Valerie Marx
4. Valerie 到达安全之地，警察抓住了 John Doe。场景：角色：John Doe、Valerie Marx
  a. 警察抓住了 John Doe，Valerie 安全了。场景：角色：John Doe、Valerie Marx
    i. Valerie 从 John Doe 那里逃出来后报了警。场景：Valerie 家旁。角色：John Doe、Valerie Marx
    ii. 警察赶到并逮捕了 John Doe。场景：警察局旁。角色：John Doe
  b. 在警察把 John Doe 带走时，Male Celebrity A 安慰 Valerie。场景：角色：Male Celebrity A、John Doe、Valerie Marx
    i. 在警察把 John Doe 带走时，Male Celebrity A 安慰 Valerie。场景：Valerie 家。角色：Male Celebrity A、John Doe、Valerie Marx
    ii. Male Celebrity A 告诉 Valerie，她做了一件勇敢的事。场景：Valerie 家。角色：Male Celebrity A、Valerie Marx
```

### DOC 针对计划 5 生成的故事

**表 37：**DOC 针对表 36 所示的计划生成的故事。方括号中的彩色文本表示后续文本所对应的大纲条目。大部分情况下，故事相当好地遵循了大纲。不过，最后几段显得有些奇怪，这也可能部分归咎于大纲本身（例如，由于那位名人的奇怪出场方式）。

[Valerie 恢复了意识，发现自己身处一个黑暗的地下室。场景：一栋房子的地下室。角色：Valerie Marx]

Valerie Marx 醒来，发现自己躺在阴冷潮湿地下室的混凝土地板上。

房间里散发着腐烂物和霉菌的臭味。她闻到尿液、粪便以及其他令人作呕的体液的气味。Valerie 翻了个身，想看看自己是怎么被绑的。她的手腕被一根脏兮兮的麻绳反绑在背后，脚踝和膝盖也被麻绳绑着，但她认不出那是什么材料。她试图移动，但捆绑太紧了。

Valerie 在一个又小又黑的房间里，没有可见的窗户，只有一道看起来像地下室门的狭长缝隙。她用力挣扎，想挣脱捆绑。

Valerie 感到左脚踝上方被轻轻碰了一下。这一碰让她浑身起鸡皮疙瘩。她的脚底有一个凸起，似乎正往 Valerie 的肉里钻。她厌恶地迅速把脚缩回来，眼前骤然一黑。

她翻过身仰面躺着，试图去够自己的右脚，但黑暗太浓了。Valerie 意识到自己是被某种东西蒙住了眼睛。除了视野边缘的一团黑色模糊，她什么也看不见。Valerie 开始感到头晕，意识到自己正逐渐失去意识。她用四肢撑起身子，下定决心绝不昏过去。

她发现自己开始喘不过气来；地下室散发着一种特别的刺鼻气味，让她的喉咙火辣辣的。[Valerie 试图挣脱自己，却意识到自己的手脚都被绑着。场景：一栋房子的地下室。角色：Valerie Marx]

她沿着墙摸索，但还没等她的手够到要找的东西，就撞上了一个硬邦邦的东西。传来一阵微弱的电流嗡嗡声，突然 Valerie 感到全身灼痛、针刺般疼痛。

她扯着嗓子尖叫，希望有人能听见她。

Valerie 沿着地面推着自己向前，试图逃离疼痛。她发现自己的手现在已经自由了，但双脚仍被绑在一起。

Valerie 尽可能快地沿着地面往后推着自己，用脚摸索着任何可能有用的东西。她撞上了一个坚硬但有弹性的东西。Valerie 意识到那是一扇门。她推开门，跌跌撞撞地走出了小房间，进入一个更大的、有着水泥墙的房间。她试图睁开眼睛，却意识到自己的手仍被绑着。

Valerie 疯狂地试图挣脱自己，却发现她无法挣断 [Valerie 设法挣脱了自己，并开始探索地下室。场景：一栋房子的地下室。角色：Valerie Marx] 捆绑，尽管她的手因为拼命挣扎而麻木了。

她听到一阵窸窣声，然后是楼上一声轻轻的咔嗒声。Valerie 惊慌起来，挣扎得更用力了，但有一瞬间她只能听到自己绝望呼吸的沉闷声音。接着，她又听到楼下传来窸窣声，然后是一声又响又沉的砰的一声，好像有什么很大的东西掉到了 Valerie 上方的地板上。她能听到那个人的脚步声跑下楼梯，她意识到那个人已经找到了她，正在地下室里追捕她。Valerie 开始惊慌失措，拼命想要挣脱捆绑。她开始踢地下室的墙壁，试图找到有用的东西。

Valerie 突然感到腿后侧一阵剧痛，意识到自己找到了有用的东西。她设法找到了一个工具箱，里面有一些钢丝钳。她开始剪断自己的捆绑。[Valerie 发现了一扇门，但门锁着。场景：一栋房子的地下室。角色：Valerie Marx]

在她挣扎着挣脱自己的时候，Valerie 听到身后一声轻响，便转过身来。她看到房间角落有两扇门，正当她盯着它们看时，两扇门都伴随着一声响亮的嘶声猛地关上了。Valerie 知道这个房间没有出路了。她决定砸碎一扇 [Valerie 发现了一扇窗户，但窗户太高，她够不着。场景：一栋房子的地下室。角色：Valerie Marx] 窗户，希望这样能让她逃出去。她伸手去拿最近的一块砖，用尽全力朝玻璃挥去，砸碎了一点，但还不够砸出一个洞。Valerie 丢下砖，环顾四周找另一块。

她看到一些煤渣砖靠着墙堆着，她抓起一块，然后把它砸在窗户上。窗户响亮地碎裂开来，Valerie 透过它看到了明亮的天空。接着她又听到身后传来脚步声，知道自己必须在杀手抓住她之前迅速逃走。

Valerie 跑到窗边，朝外面看了一眼。窗户太高，她够不着，别无选择，只能试试那几扇门。她走到其中一扇门前，试图打开它，但门锁着。Valerie 伸手去开另一扇门，却发现它也锁得死死的。她张开嘴想尖叫，却发现嘴里塞着一根长长的塞口物。Valerie 再次试图打开门，但门纹丝不动。她在上方的角落发现了一扇小窗户，透过它朝外看。它太小了，她钻不出去。

Valerie 在窗户附近发现了一个小通风口，正当有人开始 [Valerie 在地下室里醒来，试图逃跑。场景：地下室。角色：Valerie Marx] 下楼梯时，她把头伸了进去。她看到地下室里到处都是箱子，其中一个箱子的顶上放着一串钥匙，她便开始搜寻，直到找到一把钥匙，钥匙扣上用粗体字写着：John Doe。Valerie 迅速抓起钥匙，向前冲去，却发现面前又有一扇结实的门。

她再次试了试钥匙，却发现它也打不开这扇门。Valerie 滑坐到地下室的地板上，开始哭泣。她和一个疯狂的杀人犯一起被困在地下室里，完全不知道他接下来会对她做什么。她闭上眼睛，能听到脚步声正朝她走来。门打开时，她绷紧了身体，做好了准备。

杀手朝 Valerie 冲来，但她滚到一旁，躲开了他的抓扑。他一脚踢在她头的侧面，把她再次踢倒在地。他掐住她的脖子把她拎起来，猛地摔在附近的一张桌子上。Valerie 的身体瘫软下来，她挣扎着呼吸。

他走到地下室右侧，那里放着他安置的 Valerie 那毫无生气的身体。他把双手放在她的腹部，开始往下压 [Valerie 遇见了 John Doe。场景：地下室。角色：John Doe、Valerie Marx]，感觉到她的肋骨在他的按压下咔咔作响。

“你是谁？我不认识你，放开我！”Valerie 喊道，但 John Doe 不理她的哭喊，继续在她身上乱摸。[John Doe 告诉 Valerie，如果她想活命，就必须在黎明前逃出地下室。场景：地下室。角色：John Doe、Valerie Marx]

“你必须逃走，而且必须在黎明前做到。你知道的，对吧？这就是这个游戏的规则。你必须在黎明前逃出去，否则我就会开始一点一点地夺走你的生命。”John 说，声音低沉而充满不祥。

Valerie 感到自己的身体被侵犯，继续尖叫着。她咬紧牙关，扶着桌子强迫自己再次站起来。

John Doe 看着这个年轻女子，笑了。他正要说什么，却听到楼上传来一阵声响。他 [John Doe 让 Valerie 先跑一步，然后他再来追她。场景：地下室。角色：John Doe、Valerie Marx] 迅速站起来，掐住 Valerie 的喉咙，用双手勒她。

“你在干什么？放开我！”Valerie 尖叫道，但她只能发出微弱的咳嗽声。她试图剧烈扭动以挣脱他的抓握，但 John Doe 很强壮。他轻蔑地看着 Valerie，说：“我要跟你把话说清楚。你先跑一步，这是你活着离开这里的最大机会。但如果你不在黎明前逃出去，那么我会亲自来追你，并给你一个属于你自己的先机——先让你的脑袋滚到我的砧板上。”

John Doe 松开 Valerie 的喉咙，走到台阶旁。他转过身，在上楼前最后冷冷地看了这个年轻女子一眼。[Valerie 试图逃出地下室，却撞见了 John Doe。场景：地下室。角色：John Doe、Valerie Marx]

Valerie 朝地下室的台阶看了片刻，希望 John Doe 会下来结果了她。她看到地窖门开始打开，但已经太迟了；John Doe 把她独自留在了那里，太阳刚刚从地平线升起。

Valerie 颤抖着把手伸到身下，摸索门把手。她转身跑上台阶，急于逃离地下室，中途摔倒了。她跑进 John Doe 的客厅，客厅的墙上如今挂着血迹斑斑的床单，还有被熏黑的 [John Doe 在地下室里追赶 Valerie。场景：地下室。角色：John Doe、Valerie Marx] 照片——那些照片曾展示他幸福的家庭，然后她又跑进卧室，他的妻子和孩子们曾在那里睡觉，直到他们被他那双精神错乱的手夺走性命。

当 John Doe 回到屋里——他上楼去换下沾血的衣服——时，Valerie 看到了逃跑的机会，她冲过前门，门在她身后砰地关上。

John Doe 打开门，准备追赶 Valerie。当她跑下前廊的台阶、消失在拐角处时，他停了下来。她正径直冲向迎面而来的车流，但 John Doe 不在乎。他只在乎一件事 [Valerie 试图逃跑，但被 John Doe 抓住了。场景：地下室。角色：John Doe、Valerie Marx]，而 Valerie 知道她现在已无路可逃。

“Valerie Marx，”他朝她的方向挥舞着一把剁肉刀，自言自语道。“我想，该是你去死的时候了。”

Valerie 看到 John Doe 时停下了奔跑，她唯一的逃生之路被这个凶残的杀人犯堵死了。她试图朝最近的房子跑去，但 John Doe 开始缓慢而折磨人地朝她逼近。

John Doe 越来越近，直到站在 Valerie 正面前。Valerie 没有试图反抗 John Doe，因为她知道他轻易就能压制住她。她知道 John Doe 要用剁肉刀砍下她的头，就在他把刀朝她的脖子挥下时，她闭上眼睛，准备迎接死亡。[Valerie 设法说服 John Doe 放她走。场景：地下室。角色：John Doe、Valerie Marx]

当 Valerie 感到剁肉刀朝她的脖子挥下时，她睁开了眼睛，这意味着 John Doe 还没有杀她。他本打算这么做，但有什么东西让他停了下来，他把剁肉刀放到地上，而不是杀掉 Valerie。

Valerie 从地上爬起来，擦掉脖子上的血，脸上带着又怒又受伤的表情看着 John Doe。“你为什么放我走？”她愤怒地问。“我告诉过你我想结束自己的生命。你向我保证过，[Valerie 找到一件锋利的物体，威胁说如果 John Doe 不放她走，她就自杀。场景：地下室。角色：John Doe、Valerie Marx] 如果我在日出前逃出去，你就不会来追我。你为什么不遵守诺言？那个要让我平静死去的人在哪里？”

就在这时，Valerie 看到地板上有一把刀，她迅速捡起来，把它指向 [Valerie 用她的演技让 John Doe 相信她已经逃走了。场景：地下室。角色：John Doe、Valerie Marx] 自己的喉咙，试图吓唬 John Doe，让他相信她马上就要当场自杀。“他在哪？”她恶狠狠地问道。“我哪儿都看不到他！他一定死了！”

John Doe 惊慌了一瞬间，但随后他想起 Valerie Marx 只是个演员，他知道她不会真的自杀。相反，如果她真的那么做了，John Doe 就会亲手杀了她，然后他将在监狱里度过余生。Valerie Marx 正是用她的演技让他放她走。他知道她在假装成一个想自杀的人，因为他曾告诉她，如果她这么做，他会在日出前放她走。John Doe 知道 Valerie 是在虚张声势，因为他不认为她 [John Doe 上了当，Valerie 成功逃脱。场景：地下室。角色：John Doe、Valerie Marx] 真的会仅仅为了摆脱他就自杀。

John Doe 迅速试图夺下 Valerie 的刀，把手从她手中抢过来，但她已经把刀从脖子上移开，准备好攻击他了。有那么一瞬间，John Doe 想过把 Valerie 弄进一个锁头姿势，用腿控制住她。他曾对另外五个女人用过这一招，即便找不到武器，这一招也总是很管用。

不过，John Doe 已经来不及行动了，因为 Valerie Marx 已经开始朝门口跑去，她一 [Valerie 从 John Doe 那里逃出来后报了警。场景：Valerie 家旁。角色：John Doe、Valerie Marx] 到楼梯就向左急转。

John Doe 原以为在那之前他能从房子侧面看到 Valerie Marx，但他想错了。Valerie 从他身边跑开时，视野里空无一人。这对 Valerie 来说是个糟糕的处境，因为 John Doe 知道她陷入了麻烦。她活过今晚的几率微乎其微，而 John Doe 也根本不打算让她活着逃脱，因此他决定追她已经没有意义了。

Valerie Marx 已经成功地从 John Doe 手中逃脱，但她 [警察赶到并逮捕了 John Doe。场景：警察局旁。角色：John Doe] 还不安全，因为他随时都可能追上她。警察就在拐角处，她正朝他们走去，尽管她没有看到他们。由于警察局离她家只有一个街区，她只用几分钟就到了，但如果 John Doe 还能像之前那样快速移动，到那时他早就能轻易追上她，从而在足够近的距离内，在她到达警察局时杀掉她。

Valerie Marx 到达警察局时没有看到警察，因为他们在一个拐角处、一辆汽车后面。这对 John Doe 来说是好事，因为只要他一直朝警察局右侧移动，他被他们发现的机会就更小。这对他来说也是好事，因为这给了他更多时间思考接下来该做什么。

警察局对 Valerie 来说或许是安全的，但对 John Doe 来说却不是个安全的地方，因为如果他走进去，他们很容易就能看到他。他们也许还能从他在地下室留下的信息中查出他是谁。如果他们 [在警察把 John Doe 带走时，Male Celebrity A 安慰 Valerie。场景：Valerie 家。角色：Male Celebrity A、John Doe、Valerie Marx] 能做到这一点，那么他最终可能会受到比以前更大的怀疑。

由于这些原因，他现在最好继续逃跑，等到事情平息下来再去寻找下一个受害者。

如果 Valerie Marx 走进警察局，那么她暂时就不会受到 John Doe 的伤害，因为警察会围住她、保护她免受伤害。另一方面，Valerie 并不想进警察局，因为她还有更重要的地方要去。

当 Valerie Marx 到达警察局时，Male Celebrity A 并不在那里，因为他去了 Valerie 家以确保她安全。当 Valerie 到家时，Male Celebrity A 已经在那儿了。他把 Valerie 带进屋里，锁上门，这样 John Doe 就进不来了。Male Celebrity A 在屋里和 Valerie 交谈，在她经历刚刚发生的一切时安慰她。

Valerie 在 Male Celebrity A 到来时很高兴，因为在搬家、换工作之后，她开始感到孤独和害怕。她向 Male Celebrity A 解释了在地下室里发生的一切，包括她是怎么到那里的，以及她为什么要搬家。她告诉 Male Celebrity A 她当时有多害怕，以及她之所以搬家，既是因为 John Doe 的事情，也是因为她的旧公寓楼紧挨着一座旧墓地。Valerie 的状态很不好，因为那样的搬家会让任何人感到孤独，她需要有人在她经历这种磨难时支持她。[Male Celebrity A 告诉 Valerie，她做了一件勇敢的事。场景：Valerie 家。角色：Male Celebrity A、Valerie Marx]

Male Celebrity A 听了 Valerie 说的每一句话，很长时间没有开口。听完之后，他说 Valerie 走进地下室去面对 John Doe，是做了一件勇敢的事。

Male Celebrity A 听到 Valerie 所做的事后非常高兴。他并不认为在一个黑暗的地下室里拜访一个杀人犯是勇敢的，但 Male Celebrity A 知道 Valerie 想那么做，也很高兴她那么做了。

Male Celebrity A 告诉 Valerie，她非常勇敢，因为她在醒来时被绑着、不能动也不能说话的情况下，仍然勇敢地面对了那个杀手。他说这是件非常可怕的事，但她做到了，而且现在安全了。

Valerie Marx 听到 Male Celebrity A 的话很高兴。这让她对自己以及当前的处境感觉好多了。

## 附录 N：数据集与模型许可证

本工作中唯一使用的既有数据集是 WritingPrompts（Fan et al., 2018），这是一个采用 MIT 许可证的英文故事数据集。除 GPT3 之外，其他模型均通过 HuggingFace（Wolf et al., 2020）获取，后者采用 Apache License 2.0。我们在本工作中对数据集和模型的使用符合它们的预期用途。
