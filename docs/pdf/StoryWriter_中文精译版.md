# STORYWRITER：面向长故事生成的多智能体框架

> **论文原文标题**：StoryWriter: A Multi-Agent Framework for Long Story Generation
>
> **原文编号**：arXiv:2506.16445v1 [cs.CL] · 2025 年 6 月 19 日
>
> **作者**：夏浩天（Haotian Xia）\* · 彭浩（Hao Peng）\* · 齐韵佳（Yunjia Qi） · 王晓智（Xiaozhi Wang） · 徐斌（Bin Xu） · 侯磊（Lei Hou） · 李涓子（Juanzi Li）
>
> **单位**：清华大学计算机科学与技术系，北京信息科学与技术国家研究中心（BNRist）
>
> **邮箱**：{xiaht24, peng-h24}@mails.tsinghua.edu.cn
>
> **项目主页**：<https://github.com/THU-KEG/StoryWriter>
>
> \* 表示同等贡献。

---

## 目录

- [摘要](#摘要)
- [1 引言](#1-引言)
- [2 STORYWRITER](#2-storywriter)
  - [2.1 智能体网络](#21-智能体网络)
  - [2.2 大纲智能体](#22-大纲智能体)
  - [2.3 规划智能体](#23-规划智能体)
  - [2.4 写作智能体](#24-写作智能体)
- [3 实验](#3-实验)
  - [3.1 实验设置](#31-实验设置)
  - [3.2 实验结果](#32-实验结果)
  - [3.3 摘要上下文分析](#33-摘要上下文分析)
- [4 构建 LONGSTORY](#4-构建-longstory)
- [5 结论](#5-结论)
- [局限性](#局限性)
- [伦理考量](#伦理考量)
- [附录 A：图 2 图解内容](#附录-a图-2-图解内容)
- [附录 B：术语对照表](#附录-b术语对照表)
- [参考文献](#参考文献)

---

## 摘要

长故事生成对现有的大语言模型（LLM）而言仍是一项挑战，这主要源于两个因素：

1. **语篇连贯性（discourse coherence）**：要求长篇生成具备情节一致性、逻辑连贯性和完整性；
2. **叙事复杂性（narrative complexity）**：要求交织且引人入胜的叙事。

为应对这些挑战，我们提出了 **STORYWRITER**——一个多智能体故事生成框架，它由三个主要模块组成：

1. **大纲智能体（outline agent）**：生成基于事件的大纲，其中包含丰富的事件情节、人物以及事件间的关系；
2. **规划智能体（planning agent）**：进一步细化事件，并规划哪些事件应写入每一章，以保持交织且引人入胜的故事；
3. **写作智能体（writing agent）**：根据当前事件动态压缩故事历史，以生成并反思新的情节，确保生成故事的连贯性。

我们进行了人工评估和自动评估，结果表明 **STORYWRITER 在故事质量和长度上都显著优于现有的故事生成基线**。此外，我们使用 STORYWRITER 生成了一个数据集，包含约 6,000 个高质量长故事，平均长度为 8,000 词。我们在 LONGSTORY 上使用监督微调训练了 Llama3.1-8B 和 GLM4-9B 模型，并开发出 STORYWRITER<sub>LLAMA</sub> 和 STORYWRITER<sub>GLM</sub>，它们在长故事生成方面表现出先进性能。所有代码、模型和数据均已公开，以鼓励可复现性和进一步发展。

---

## 1 引言

故事生成旨在自动生成连贯、有条理且引人入胜的叙事（Wang et al., 2023c）。通常，故事生成以一段**前提（premise）**——往往是简短的起始片段或主题——作为输入，来创作一篇完整的叙事（Alhussain and Azmi, 2021）。自大语言模型（LLM；Ouyang et al., 2022）问世以来，使用 LLM 生成故事的质量稳步提升（Xie and Riedl, 2024）。然而，生成长故事——尤其是超过 1,000 词的故事——对 LLM 而言仍是一个重大挑战（Migal et al., 2024）。

长故事生成的主要挑战来自两个方面：

**（1）语篇连贯性**：要求长篇生成具备情节一致性、逻辑连贯性和完整性。现有 LLM 在生成流畅的长文本方面仍面临困难（Liu et al., 2024b）。在长故事生成中，LLM 需要保留长距离的关键信息，例如事件、人物及其关系，以确保整个叙事中的情节一致性。

**（2）叙事复杂性**：要求交织、引人入胜且多样化的故事内容。虽然人类写就的故事通常具备这些特征，但 LLM 生成的叙事往往同质化，缺乏多样性和情节发展（Tian et al., 2024; Wang et al., 2024）。

为应对上述挑战，我们提出了 **STORYWRITER**——一个面向长故事生成的多智能体框架，它由三个主要模块组成：

**（1）大纲智能体（outline agent）**：生成基于事件的大纲。生成大纲是故事生成中的典型流程，以往研究采用 LLM 直接生成大纲（Wang et al., 2023b; Yang et al., 2023a; Wang et al., 2024），这可能不够具体且缺乏多样性。受传统事件知识（Wang et al., 2023a）的启发，我们采用一个智能体来生成详细的**事件图（event graph）**，其中每个节点表示一个事件，边表示事件之间的关系，例如因果关系（Wang et al., 2022）。每个事件关联若干人物（Wang et al., 2023a）。随后，我们采用一个智能体来验证每个事件的一致性，并生成最终大纲。

**（2）规划智能体（planning agent）**：生成详细的子事件，并从全局上规划哪些事件应出现在每一章中，以保持交织且引人入胜的故事。具体而言，我们首先使用 LLM 为每个事件生成子事件，以提供更丰富的事件信息。人类写作是非线性的，事件和人物常以多样化的方式在不同章节间相互关联（Oller Jr, 1983; Alkaaf and Al-Bulushi, 2017）。我们还采用一个 LLM 从全局上规划每个章节应出现哪些事件和人物，确保一致性，并使关键元素能够在不同章节间再现。这有助于缓解同质化问题，促进交织内容的生成。

**（3）写作智能体（writing agent）**：基于历史上下文生成并精炼具体的故事内容。长故事生成涉及长距离依赖，直接将整个历史输入 LLM 可能会导致关键信息丢失（Liu et al., 2024a）。为此，我们采用一个名为 **协调者（Coordinator）** 的智能体，根据当前事件动态压缩先前的写作历史。压缩的目标是仅保留相关的事件和人物，创建一个紧凑而有效的写作历史，以生成更连贯的故事。随后，我们将这段历史连同需要展开的事件一起输入最终的**写作者（FinalWriter）**来生成子故事，再使用协调者对其进行精炼。

我们进行了大量实验来验证 STORYWRITER 的有效性。我们采用 GPT-4o-mini（OpenAI, 2024a）作为实现 STORYWRITER 的主干模型，在广泛使用的 MoPS 数据集（Ma et al., 2024）上进行评估，并研究了若干强基线，包括 DOC（Yang et al., 2023b）、Agents' Room（Huot et al., 2024）和 GPT-4o-mini（OpenAI, 2024a）。我们采用了人工评估和基于 GPT-4o 的自动评估，涵盖 6 个常用维度（Chhun et al., 2024）：**相关性（relevance）、连贯性（coherence）、共情（empathy）、意外性（surprise）、创造性（creativity）和复杂性（complexity）**。STORYWRITER 显著优于其他模型，证明了其有效性。

此外，我们对不同模块进行了消融研究，发现移除任一模块都会导致性能的显著下降，这进一步证明了每个模块的重要性和有效性。最后，我们采用 STORYWRITER 生成训练数据集 **LONGSTORY**，其中包含约 6,000 个故事，平均长度为 15,000 词。我们使用监督微调在 LONGSTORY 上微调了 Llama3.1-8B Instruct 模型（Dubey et al., 2024），开发出 STORYWRITER<sub>LLAMA</sub>。我们使用 LongWriter-Ruler 和 LongBench-Write（Bai et al., 2024b）对训练后的模型进行评估，发现 STORYWRITER<sub>LLAMA</sub> 在超过 2,000 词的故事上显著优于 Llama3.1-8B Instruct，甚至超越了 GPT-4o（OpenAI, 2024b）。这证明了 LONGSTORY 的有效性。

综上所述，我们的贡献主要有三点：

1. 我们提出了 **STORYWRITER**，一个用于生成高质量长故事的多智能体框架。
2. 我们构建了一个高质量的长故事数据集 **LONGSTORY**，可用于故事生成领域的评估和训练。
3. 我们进行了大量实验来证明 STORYWRITER 的有效性，并据此开发出面向长故事生成的先进 LLM——STORYWRITER<sub>LLAMA</sub> 和 STORYWRITER<sub>GLM</sub>。

> 📊 **图 1 说明**：在不同要求故事长度下 MoPS（Ma et al., 2024）上的结果。详见第 4 节。

---

## 2 STORYWRITER

### 2.1 智能体网络

STORYWRITER 的所有组件均在 **AutoGen** 框架（Wu et al., 2023）内实现。该智能体网络由三个主要模块组成：**大纲智能体**、**规划智能体**和**写作智能体**。大纲智能体负责生成初始的基于事件的大纲；规划智能体将大纲精炼并扩展为详细的子事件和叙事结构；写作智能体则合成最终的叙事文本。通过编排多个各司其职的专用智能体，我们建立了一种协作式多智能体写作范式（如图 2 所示）。

### 2.2 大纲智能体

对于以事件为中心的大纲生成，我们的框架采用了两个专用智能体：**EventSeed** 和 **EventValidator**。

- **EventSeed 智能体**：根据给定的前提按顺序生成事件，通过为每个事件提供时间、地点和关系等必要信息，逐步构建故事大纲。
- **EventValidator 智能体**：持续监控并评估生成的大纲，提供反馈以确保每个事件既合理又在叙事上连贯，并引导后续事件的生成。

与生成描述性句子的传统大纲生成方法不同，我们的方法将大纲构建为一系列**事件元组（event tuples）**，从而增强了可控性和逻辑一致性。

### 2.3 规划智能体

增强自动叙事生成的灵活性和吸引力仍是一项重大挑战。为此，我们提出了一种新颖的**非线性叙事（Non-Linear Narration, NLN）**策略，将事件分解为子事件，并将其策略性地分配到各个章节中。

基于热奈特（Genette）的叙事顺序理论（Genette, 1972）——该理论区分了"故事顺序"与"叙事顺序"——我们的方法利用**倒叙（analepsis）**和**预叙（prolepsis）**等技巧来实现复杂的非线性结构。事件结构与情节组织理论进一步强调，叙事连贯性依赖于保持事件之间的因果和逻辑关系（Herman, 2002, 2017）。只要这些联系得以保持，读者就能够重建事件链条，从而即使子事件以乱序呈现，也能确保一致性。此外，瑞安（Ryan）的"叙事可能世界"框架（Genette, 1980）凸显了非线性叙事在创造多样且交互式的故事路径方面的潜力。

基于这些理论基础，我们的 NLN 方法在分解和重组的过程中系统地保持了事件的逻辑和因果完整性：

- **SubTasker 模块**：负责通过将高层事件分解为更细粒度的叙事单元来生成子事件。
- **Weaver 模块**：将这些子事件分配到不同章节中，确保整体叙事结构保持连贯，同时实现非线性呈现。

这种分工既能实现细致的事件建模，又能进行灵活的叙事组织，这两者对于实现 NLN 策略至关重要。即使子事件被有意以非时间顺序跨章节呈现，整体叙事连贯性仍得以保持。这不仅避免了叙事中断或逻辑不一致，还赋予故事更强的结构灵活性和表现力，克服了线性叙事的单调性，并增强了叙事多样性和读者参与度。

### 2.4 写作智能体

在最后的生成阶段，**协调者（Coordinator）**与**最终写作者（FinalWriter）**智能体之间的协作互动，对于生成结构连贯、风格一致的叙事至关重要。

- **Coordinator 智能体**：负责监督全局叙事架构，参与从大纲制定、子事件规划到最终文本生成的各个阶段。
- **FinalWriter 智能体**：主要致力于合成最终叙事，尤其强调确保风格统一和高文本质量。

这种分工确保了宏观层面的结构连贯性和微观层面的叙事流畅性都能得以实现。

尽管有上述协作努力，近期研究（Yao et al., 2024）和我们的初步实验都发现了长故事生成中的一个关键挑战：大语言模型在处理超长输入序列时会表现出显著的**上下文碎片化**和**注意力衰减**。具体而言，当输入长度超过约 10,000 个字符时，模型保持叙事焦点和回忆早期情节发展的能力会大幅下降，常常导致偏题或不连贯的输出。这一局限对生成长篇且连贯的叙事构成了重大障碍。

为解决这一问题，我们在写作智能体中提出了**"重写输入与输出"（Re-write Input and Output, ReIO）**机制：

- **输入处理阶段**：协调者动态总结并压缩历史叙事上下文，有选择地仅保留与当前子事件相关的信息。这一策略在保留关键上下文信息的同时有效缩短了输入长度，生成的摘要会被缓存以便在后续阶段高效复用。
- **输出处理阶段**：协调者评估生成的文本，并在必要时对其进行重写，以确保与预期的叙事结构和风格要求保持一致。修订后的输出会替换原始内容，这一迭代式重写过程会根据需要重复进行，以同时保持叙事连贯性和风格一致性。

通过将 ReIO 机制整合进协调者与 FinalWriter 智能体的协作工作流中，我们的框架有效缓解了 LLM 在长上下文处理方面面临的挑战，从而能够生成结构稳健且叙事引人入胜的长篇叙事。关于不同历史压缩策略的详细分析，请参阅第 3.3 节。

> 📊 **图 2 说明**：三阶段故事生成框架概览。该过程（从左到右）包括：(1) 由大纲智能体进行的基于事件的大纲生成；(2) 由规划智能体通过非线性叙事（NLN）进行的章节构建；(3) 由写作智能体通过 ReIO（重写输入与输出）进行的最终故事合成。每个阶段都采用不同的方法，将叙事从高层结构逐步精炼为细致、连贯的故事文本。图中各文字标签的中文对照见[附录 A](#附录-a图-2-图解内容)。

---

## 3 实验

### 3.1 实验设置

**评估数据集**：我们使用数据集 **MoPS**（Ma et al., 2024）。该工作提供了 MoPS 代码套件，以及 7.6k 条生成的前提和 1,000 篇扩展故事。与传统方法生成的前提以及从文学论坛（如 WRITINGPROMPTS，Fan et al., 2019）收集的前提相比，MoPS 生成的故事质量更高、信息密度更大。

**评估设置**：我们采用了 **HANNA**（Chhun et al., 2022）提出的评估框架——一个用于故事评估的基准——并对其中的某些维度定义做了轻微调整。该框架规定了六个正交的评价标准——相关性、连贯性、共情、意外性、创造性和复杂性——每个标准都以社会科学文献为基础。为全面评估生成的故事，我们同时采用了人工评估和自动评估：

- **人工评估**：匿名的输出被分发给英语专业的研究生（所有学生的托福成绩均在 108 分及以上），他们在这六个维度上以五点李克特量表（Likert scale）对故事进行评分。
- **自动评估**：使用 GPT-4o（OpenAI, 2024b），为每个维度打 1 到 5 的整数分。

这一双重评估协议确保了叙事质量评估的稳健性和多面性。

**基线**：我们将两种方法生成的故事与 STORYWRITER 进行比较——DOC（Yang et al., 2023b）和 Agents' Room（Huot et al., 2024）：

1. **DOC**：一种旨在通过生成更全面的大纲来提升文本质量的方法。为公平比较，我们使用 GPT-4o-mini 作为其基础模型，实现了最新版本的 DOC 方法。我们没有采用其自动前提生成方法，而是直接使用 Ma et al.（2024）中提供的前提。此外，由于诸如 API 配置随时间变化等因素，我们在保留 DOC 核心逻辑的前提下对其底层代码做了轻微修改。
2. **Agents' Room**：一个用于故事生成的多智能体框架。该方法引入了一个编排器（orchestrator），负责决定何时调用写作者智能体和规划者智能体，从而确保各智能体之间的协调执行。然而，原工作中的实验结果表明，在给定的实验设置下，最有效的策略是一个按预定义顺序依次调用各智能体的确定性编排器。因此，为保持一致性和可比性，我们在实验中也采用了这一确定性编排器。
3. **GPT-4o mini**：我们将前提直接输入 GPT-4o-mini 来生成故事。

### 3.2 实验结果

#### 主要结果

所有实验结果见表 1。我们观察到以下几点：

1. 总体而言，我们的故事生成框架 STORYWRITER 在人工评估和自动评估中都显著优于基线，证明了其有效性。
2. STORYWRITER 在长度上显著超越以往的基线，同时保持了较高的生成质量，表明其在生成更长故事方面的有效性。
3. 在不同的具体评估维度上，我们的方法在相关性和连贯性上优于 DOC 和 GPT-4o-mini，但略逊于 Agents' Room。这可能是因为 STORYWRITER 生成的故事更长，而连贯性不可避免地会随长度增加而下降（Bai et al., 2024b）。然而，在内容多样性和创造性方面，我们的模型显著优于所有基线，验证了我们方法的有效性，并表明它能够生成更高质量、更具创造性的内容，而这正是故事生成的最终目标。

> 📋 **表 1**：人工评分与自动评分（1 到 5 分制）的实验结果。RE、CH、EM、SU、CR、CX 分别代表相关性（relevance）、连贯性（coherence）、共情（empathy）、意外性（surprise）、创造性（creativity）和复杂性（complexity）。**加粗**表示按人工评估得出的最佳结果，<u>下划线</u>表示按自动评估得出的最佳结果。

| 模型 | 评估方式 | 平均分 | RE | CH | EM | SU | CR | CX | 平均长度 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| DOC | 人工评估 | 3.7 | 4.2 | 4.3 | 3.2 | 3.4 | 3.7 | 3.2 | 2,373 |
| DOC | 自动评估 | 3.9 | 4.1 | 4.3 | 4.0 | 3.5 | 3.8 | 3.5 | — |
| Agents' Room | 人工评估 | 3.8 | 4.5 | 4.4 | 3.3 | 3.2 | 3.7 | 4.0 | 3,134 |
| Agents' Room | 自动评估 | 3.9 | 3.5 | 4.5 | 4.0 | 3.7 | 3.9 | 3.7 | — |
| GPT-4o mini | 人工评估 | 3.6 | 4.0 | 3.8 | 3.3 | 3.4 | 3.6 | 3.7 | 1,078 |
| GPT-4o mini | 自动评估 | 3.9 | 4.0 | 4.7 | 4.1 | 3.5 | 3.7 | 3.4 | — |
| **STORYWRITER** | 人工评估 | **4.2** | 4.4 | 4.3 | **3.8** | **3.6** | **4.3** | **4.8** | 8,081 |
| **STORYWRITER** | 自动评估 | <u>4.2</u> | <u>4.1</u> | 4.4 | <u>4.4</u> | 3.7 | <u>4.2</u> | <u>4.6</u> | — |

#### 消融研究

消融实验结果见表 2。我们分析了从 STORYWRITER 中移除关键组件的影响：

- **(-)Events-Outline**：移除基于事件的大纲生成，将故事大纲简化为若干没有详细事件描述的泛化句子。此时故事大纲缺乏深度和结构，对生成故事的质量产生负面影响。结果六个评估指标都出现显著下降，凸显了结构化基于事件大纲的重要性。
- **(-)Planning**：移除规划智能体中的非线性叙事（NLN）策略，导致子事件被严格按时间顺序排列。结果复杂性得分显著下降，降幅仅次于 (-)Events-Outline 场景。这符合预期，因为规划智能体模块通过在保持事件关系的同时将子事件分配到不同章节来增强叙事多样性。
- **(-)ReIO-Input**：移除写作智能体的 ReIO 输入机制，意味着输入和输出都没有得到有效调控。结果智能体的输入长度大幅增加，导致计算成本升高、整体性能下降。
- **(-)ReIO-Output**：移除写作智能体中的 ReIO 输出重写机制。此时生成文本的相关性得分显著下降。之所以出现这种下降，是因为 ReIO 输出模块在通过重写偏离原始大纲的段落来维持结构连贯性方面发挥着关键作用。

> 📋 **表 2**：消融实验。"(-)ReIO-Output" 移除写作智能体的输出重写机制；"(-)Planning" 移除规划智能体的非线性叙事（NLN）策略；"(-)ReIO-Input" 移除写作智能体的 ReIO 输入重写机制；"(-)Events-Outline" 移除大纲智能体基于事件的大纲生成。**加粗**表示按自动评估得出的最佳结果。

| 模型 | 平均分 | RE | CH | EM | SU | CR | CX |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **STORYWRITER** | **4.3** | 4.1 | 4.4 | 4.4 | 3.7 | 4.2 | 4.6 |
| (-)Events-Outlines | 2.5 | 2.2 | 3.2 | 2.9 | 2.2 | 3.3 | 1.1 |
| (-)Planning | 3.9 | 4.0 | 4.6 | 4.0 | 3.1 | 3.9 | 3.8 |
| (-)ReIO-Input | 3.9 | 4.1 | 4.6 | 3.9 | 3.2 | 3.9 | 3.9 |
| (-)ReIO-Output | 4.0 | 3.7 | 4.2 | 4.6 | 4.0 | 3.7 | 3.9 |

### 3.3 摘要上下文分析

随着生成文本长度的增加，LLM 容易出现**重复、幻觉和主题漂移**等不良现象（Liu et al., 2024a）。这些问题通常表现为冗余的事件叙述、主人公行为偏离已建立的叙事轨迹，以及故事逻辑进展相对于先前内容的断裂。我们的分析揭示了这些问题与前置上下文的长度之间存在强相关性。

为缓解这些影响，我们引入了一个**摘要智能体（summary agent）**，它在保留关键信息的同时压缩输入上下文。具体而言，我们实现了一种**滑动窗口机制**：随着事件按顺序生成，窗口向前推进，其范围内的内容被系统性地简化。

该方法的一个关键方面是确定一种能在缩短输入长度与保持叙事连贯性之间取得最优平衡的策略。通过对各种窗口长度的实证评估，我们观察到，对于 15,000 token 以下的文本，覆盖 **[2, k-1]** 区间的滑动窗口始终能取得最优结果，这表明**简化上下文的中间部分最为有效**。

为进一步证实我们的发现，我们进行了一项对照实验，比较了五种滑动窗口配置：`[k-10, k-8]`、`[k-12, k-6]`、`[k-14, k-4]`、基线 `[2, k-1]` 以及空集。人工评估者对生成故事的叙事质量进行评判，结果如图 3 所示。我们的发现表明，对先前内容进行最大程度的简化能够带来更优的叙事效果，这体现在所有情况下的最佳平均性能（图 3 中以星号标注）。

> 📊 **图 3 说明**：不同窗口长度的结果。星号（⋆）表示在所有情况下平均性能最佳的方法。

---

## 4 构建 LONGSTORY

在本节中，我们使用 STORYWRITER 生成了一个高质量的长故事数据集 **LONGSTORY**。我们在 LONGSTORY 上使用监督微调训练了 Llama3.1-8B 和 GLM4-9B 模型，并开发出先进的故事讲述 LLM——STORYWRITER<sub>LLAMA</sub> 和 STORYWRITER<sub>GLM</sub>。我们的数据集在多个下游模型上做监督微调（SFT）时显示出显著的改进。

#### LONGSTORY 的构建

我们使用 STORYWRITER 构建了一个包含 5,500 篇长故事的高质量数据集 LONGSTORY。具体而言，我们首先从 MoPS（Ma et al., 2024）的训练集中收集 6,000 条故事前提，并使用 STORYWRITER 为每条前提生成一篇长故事。然后我们进行细致的数据清洗，去除过短、不符合格式要求或质量低下的故事。具体来说，我们将故事的多个章节合并，以降低 SFT 训练过程中对特定文本结构过拟合的风险。最终，我们整理出一个包含 5,500 篇长故事的数据集 LONGSTORY，平均长度约为 8,000 词。

#### 实验设置

我们采用与第 3.1 节相同的评估数据集 MoPS。由于人工评估成本高昂，我们仅采用自动评估，这在以往工作中也被广泛使用（Bai et al., 2024b; Gu et al., 2024）。除了从第 3.1 节提到的 6 个维度评估内容质量外，我们还报告了 LongBench-Write 评估方法（Bai et al., 2024b）所用的**长度得分（length score）**。该方法通过设置不同的输出长度约束来控制 LLM 生成文本的长度，这既评估了模型生成长文本的能力，也评估了其对字数约束的遵循程度。长度得分衡量实际响应长度与指令中要求长度之间的对齐程度，其计算方式如下：

$$
S_l =
\begin{cases}
100 \cdot \max\left(0, \; 1 - \left(\dfrac{l'}{l} - 1\right)^{3}\right), & \text{若 } l' > l, \\[1.4em]
100 \cdot \max\left(0, \; 1 - \left(\dfrac{l}{l'} - 1\right)^{2}\right), & \text{若 } l' \le l.
\end{cases}
\tag{1}
$$

其中 $l'$ 表示实际响应长度，$l$ 表示要求长度。具体而言，我们采用与 LongBench-Write 相同的评估设置：对于 MoPS 测试集中的每条指令，我们从 {500, 1,000, 2,000, 4,000, 10,000} 中添加一个输出长度约束，然后针对每个长度约束生成响应并计算最终得分。我们根据长度对结果进行分桶（bucketing），并报告每个桶内以下指标的平均值：

- **$S_q$**：内容质量得分，即第 3.1 节中 6 个维度得分的平均值；
- **$S_l$**：长度得分；
- **$\bar{S}$**：总得分，等于 $(S_q + 20 \times S_l)/2$。

我们还报告所有长度上的平均总得分。

#### SFT 训练

我们采用 Llama 3.1-8B 模型和 GLM-4-9B 模型作为 SFT 训练的基础模型。我们使用 **LongAlign**（Bai et al., 2024a）提出的训练代码，因为它是专为带有既有长上下文适配的长上下文训练而设计的。我们使用 LONGSTORY 中每个实例的前提作为输入、故事作为输出进行监督微调，得到 STORYWRITER<sub>LLAMA</sub> 和 STORYWRITER<sub>GLM</sub>。对于这两个模型，我们均设置批大小为 1、学习率为 2 × 10⁻⁵、训练 4 个 epoch。

#### 实验结果

在 LONGSTORY 上训练的 STORYWRITER<sub>LLAMA</sub> 和 STORYWRITER<sub>GLM</sub>，以及其他基线的实验结果见表 3。我们可以观察到：

1. **就生成故事的质量（$S_q$）而言**，STORYWRITER<sub>GLM</sub> 显著优于其主干模型，尤其是在生成超过 4,000 词的故事方面。这表明 STORYWRITER<sub>GLM</sub> 在生成更长内容的同时能够保持高质量。
2. **就生成故事的长度得分（$S_l$）而言**，我们的模型也远优于 Llama3.1-8B-Instruct 和 GPT-4o。这表明我们的模型在故事生成中能更好地遵循长度约束，尽管训练过程并未涉及对遵循长度约束能力的显式增强。这表明使用更长的响应进行训练可以增强模型遵循长度约束的能力。

总之，STORYWRITER<sub>LLAMA</sub> 和 STORYWRITER<sub>GLM</sub> 在生成更长故事和遵循长度约束方面表现更好，证明了我们的数据构建方法 STORYWRITER 和 LONGSTORY 的有效性。由于我们的方法可以扩展到更广泛的创意内容生成领域，我们鼓励社区利用它来生成更多高质量数据。

> 📋 **表 3**：STORYWRITER<sub>LLAMA</sub>、STORYWRITER<sub>GLM</sub> 及基线的实验结果（%）。$S_q$ 表示第 3.1 节中所述 6 个维度的平均得分；$S_l$ 是长度得分，按公式 (1) 计算；$\bar{S}$ 按 $(S_q + 20 \times S_l)/2$ 计算，沿用 Bai et al.（2024b）的方法。**加粗**为该列最优值。

| 模型 | 总体 $\bar{S}$ | 总体 $S_l$ | 总体 $S_q$ | [0,1k) $S_l$ | [0,1k) $S_q$ | [1k,2k) $S_l$ | [1k,2k) $S_q$ | [2k,4k) $S_l$ | [2k,4k) $S_q$ | [4k,10k) $S_l$ | [4k,10k) $S_q$ | [10k,20k) $S_l$ | [10k,20k) $S_q$ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Llama3.1-8B-Instruct | 46.6 | 34.5 | 2.9 | 89.0 | 4.0 | 83.7 | 3.9 | 0.0 | 3.5 | 0.0 | 2.2 | 0.0 | 1.0 |
| GLM4-9B | 47.3 | 36.6 | 2.9 | 93.7 | 4.2 | 89.6 | 4.0 | 0.0 | 3.3 | 0.0 | 2.0 | 0.0 | 1.0 |
| LongWriter-GLM4-9B | 76.3 | 83.0 | 3.5 | 86.9 | 3.1 | 93.1 | 3.2 | 91.6 | 4.0 | 86.9 | 3.6 | 56.7 | 3.4 |
| LongWriter-Llama3.1-8B | 77.9 | 83.6 | 3.6 | 96.9 | 3.9 | 96.1 | 3.5 | 93.2 | 4.1 | 81.9 | 3.5 | 51.3 | 3.2 |
| Deepseek-Llama-8B | 70.0 | 73.6 | 3.3 | 92.3 | 3.1 | 91.9 | 3.2 | 88.2 | 3.6 | 83.2 | 3.4 | 12.3 | 3.3 |
| Deepseek-Llama-70B | 74.3 | 79.0 | 3.5 | 93.2 | 3.3 | 94.5 | 3.4 | 87.2 | 4.0 | 81.0 | 3.5 | 44.1 | 3.2 |
| GPT-4o | 67.4 | 52.8 | 4.1 | 92.3 | 4.7 | 91.7 | 4.5 | 62.0 | 4.3 | 15.3 | 3.7 | 2.7 | 3.3 |
| STORYWRITER<sub>LLAMA</sub> | 73.4 | 75.3 | 3.5 | 90.8 | 3.9 | 94.1 | 3.8 | 77.3 | 3.5 | 77.0 | 3.4 | 27.7 | 3.4 |
| **STORYWRITER<sub>GLM</sub>** | **83.7** | **88.5** | **3.9** | **99.5** | **4.4** | **99.3** | **4.1** | **98.0** | **4.0** | **88.7** | 3.5 | **57.3** | **3.6** |

---

## 5 结论

本文提出了 **STORYWRITER**——一种多智能体方法，能够自动生成大纲和足够长的故事。利用 STORYWRITER，我们生成了大量多样化且高质量的故事。人工评估和自动评估都表明，STORYWRITER 优于多个基线。同样，我们使用 STORYWRITER 创建了高质量数据集 LONGSTORY，并基于 LONGSTORY 进行监督微调，提供了基于 Llama3.1-8B 的 STORYWRITER<sub>LLAMA</sub> 和基于 GLM4-9B 的 STORYWRITER<sub>GLM</sub>。我们相信，STORYWRITER 将有助于 LLM 的长故事生成任务，且未来的自动故事生成（Auto Story Generation, ASG）任务可以在这些数据和 STORYWRITER<sub>LLAMA</sub> 的基础上进行探索。我们希望进一步探索 LLM 生成长篇连载小说，这要求 LLM 具备更强大的长故事生成和理解能力。

---

## 局限性

本工作的局限性主要有三点：

1. 有一些比 GPT-4o-mini 更强大的模型可供选择，但考虑到有限的经济成本，我们仅使用 GPT-4o-mini 作为生成模型，并使用生成的数据蒸馏出一个 8B 的轻量级模型。这显然是可以优化的地方。
2. 本研究仅专注于英语数据。在未来的研究中，我们计划将方法扩展到支持多种语言，以提升其在不同语言环境中的适用性。
3. 我们的研究主要集中在类小说的故事生成上，对多样化艺术风格的探索有限。未来的工作可以研究其他叙事形式，如剧本、诗歌和散文，以拓宽生成内容的风格多样性。

---

## 伦理考量

我们在此讨论伦理考量：

1. **知识产权**：我们严格遵守所有使用到的制品（包括数据集、模型和代码仓库）的许可证。我们将在 MIT 许可证²下开源代码、LONGSTORY、STORYWRITER<sub>GLM</sub> 和 STORYWRITER<sub>LLAMA</sub>。

2. **预期用途与潜在风险控制**：我们提出了 STORYWRITER，一个旨在生成连贯且复杂故事的多智能体故事生成框架。此外，我们基于 MoPS 构建了 LONGSTORY 数据集，以增强模型生成长故事的能力。我们相信原始发布者已对数据集进行了适当的匿名化和清洗处理。此外，STORYWRITER 生成的是带有艺术修饰的虚构故事，而非真实故事，因此不会引入额外的伦理问题。

3. **AI 辅助**：我们使用了 ChatGPT 来润色部分句子。

² <https://opensource.org/license/mit>

---

## 附录 A：图 2 图解内容

> 原图 2 为三阶段框架示意图，图内包含事件示例、各智能体模块标签及对话气泡。为完整呈现原文信息，此处将图中文字逐条译为中文。

**故事前提（Premise）输入示例：**

> 生成一个关于一位身经百战的老兵和他忠诚战友的 10,000 词故事……

**大纲智能体（Outline Agent）阶段：**

- 事件 1：**伏击（The Ambush）**
  - *（EventValidator 反馈）*"很好，继续。"
- 事件 2：**背叛揭露（The Betrayal Revealed）**
  - 场景：黄昏时一处偏僻的山脊。……
  - *（EventValidator 反馈）*"不好，我建议……"
- ……
- 事件 N：……

- 模块：**EventSeed**（事件生成）→ **EventValidator**（事件校验）

**规划智能体（Planning Agent）阶段：**

- 事件 1、事件 2、……（经分解）
- 子事件 1.1、子事件 1.2、子事件 1.3、……（SubTasker 分解）
- 第 1 章（含子事件 1.1、1.2、2.1……）、第 2 章（含子事件 1.3、2.2……）、……
- 模块：**SubTasker**（子任务分解）→ **Weaver**（章节编织，非线性叙事 NLN）

**写作智能体（Writing Agent）阶段：**

- *（FinalWriter）*"请根据……生成下一段故事："
- 故事 1.1：雾气如裹尸布般缠绕着树木，一种不自然的寂静……
- *（Coordinator）*"写得不好；让我重写：……"
- 故事 1.2：伏击的混乱如潮水般爆发，以无情的狂怒席卷他们。
- 最终故事（Final Story）
- 模块：**Coordinator**（协调者）→ **FinalWriter**（最终写作者），采用 **Re-IO**（重写输入与输出）机制

**事件要素示例（左下角）：**

- 时间：夜晚（Night）
- 地点：森林（Forest）
- 人物：老兵（Veteran）
- 目标：生存（Survive）

**其余标签对照：** 历史对话（History dialogue）· 前提（Premise）· 大纲（Outline）· 章节（Chapter）· 故事（Story）· 下一章（Next Chapter）· NLN（非线性叙事）· Re-IO（重写输入与输出）。

---

## 附录 B：术语对照表

| 英文术语 | 中文译名 |
| :--- | :--- |
| discourse coherence | 语篇连贯性 |
| narrative complexity | 叙事复杂性 |
| outline agent | 大纲智能体 |
| planning agent | 规划智能体 |
| writing agent | 写作智能体 |
| EventSeed | 事件种子生成（智能体） |
| EventValidator | 事件校验（智能体） |
| SubTasker | 子任务分解（模块） |
| Weaver | 章节编织（模块） |
| Coordinator | 协调者（智能体） |
| FinalWriter | 最终写作者（智能体） |
| Non-Linear Narration (NLN) | 非线性叙事 |
| Re-write Input and Output (ReIO) | 重写输入与输出 |
| event graph | 事件图 |
| event tuple | 事件元组 |
| premise | 前提 |
| analepsis | 倒叙 |
| prolepsis | 预叙 |
| sliding window | 滑动窗口 |
| supervised fine-tuning (SFT) | 监督微调 |
| length score | 长度得分 |
| ablation study | 消融研究 |
| Likert scale | 李克特量表 |

---

## 参考文献

> 以下为原文参考文献列表，为保证可引用性与准确性，保持英文原文未作翻译。

1. Arwa I Alhussain and Aqil M Azmi. 2021. Automatic story generation: A survey of approaches. *ACM Computing Surveys (CSUR)*, 54(5):1–38.
2. Fatma Alkaaf and Ali Al-Bulushi. 2017. Tell and write, the effect of storytelling strategy for developing story writing skills among grade seven learners. *Open Journal of Modern Linguistics*, 7(2):119–141.
3. Yushi Bai, Xin Lv, Jiajie Zhang, Yuze He, Ji Qi, Lei Hou, Jie Tang, Yuxiao Dong, and Juanzi Li. 2024a. Longalign: A recipe for long context alignment of large language models. *arXiv preprint* arXiv:2401.18058.
4. Yushi Bai, Jiajie Zhang, Xin Lv, Linzhi Zheng, Siqi Zhu, Lei Hou, Yuxiao Dong, Jie Tang, and Juanzi Li. 2024b. Longwriter: Unleashing 10,000+ word generation from long context llms. *Preprint*, arXiv:2408.07055.
5. Cyril Chhun, Pierre Colombo, Fabian M. Suchanek, and Chloé Clavel. 2022. Of human criteria and automatic metrics: A benchmark of the evaluation of story generation. In *Proceedings of the 29th International Conference on Computational Linguistics*, pages 5794–5836, Gyeongju, Republic of Korea. International Committee on Computational Linguistics.
6. Cyril Chhun, Fabian M. Suchanek, and Chloé Clavel. 2024. Do language models enjoy their own stories? prompting large language models for automatic story evaluation. *Preprint*, arXiv:2405.13769.
7. Abhimanyu Dubey, Abhinav Jauhri, Abhinav Pandey, Abhishek Kadian, Ahmad Al-Dahle, Aiesha Letman, Akhil Mathur, Alan Schelten, Amy Yang, Angela Fan, et al. 2024. The llama 3 herd of models. *arXiv preprint* arXiv:2407.21783.
8. Angela Fan, Mike Lewis, and Yann Dauphin. 2019. Strategies for structuring story generation. In *Proceedings of the 57th Annual Meeting of the Association for Computational Linguistics*, pages 2650–2660, Florence, Italy. Association for Computational Linguistics.
9. Gérard Genette. 1972. *Narrative Discourse: An Essay in Method*. Cornell University Press, Ithaca, NY. Translated by Jane E. Lewin.
10. Gérard Genette. 1980. *Narrative Discourse: An Essay in Method*. Cornell University Press, Ithaca.
11. Jiawei Gu, Xuhui Jiang, Zhichao Shi, Hexiang Tan, Xuehao Zhai, Chengjin Xu, Wei Li, Yinghan Shen, Shengjie Ma, Honghao Liu, et al. 2024. A survey on llm-as-a-judge. *arXiv preprint* arXiv:2411.15594.
12. David Herman. 2002. *Story Logic: Problems and Possibilities of Narrative*. University of Wisconsin Press, Madison, WI.
13. David Herman. 2017. Narratology's union with cognitive science—a review of david herman's narrative theory and the cognitive science. *World Literature Studies*, 5(3):13–24.
14. Fantine Huot, Reinald Kim Amplayo, Jennimaria Palomaki, Alice Shoshana Jakobovits, Elizabeth Clark, and Mirella Lapata. 2024. Agents' room: Narrative generation through multi-step collaboration. *Preprint*, arXiv:2410.02603.
15. Nelson F Liu, Kevin Lin, John Hewitt, Ashwin Paranjape, Michele Bevilacqua, Fabio Petroni, and Percy Liang. 2024a. Lost in the middle: How language models use long contexts. *Transactions of the Association for Computational Linguistics*, 12:157–173.
16. Xiang Liu, Peijie Dong, Xuming Hu, and Xiaowen Chu. 2024b. Longgenbench: Long-context generation benchmark. In *Findings of the Association for Computational Linguistics: EMNLP 2024*, pages 865–883.
17. Yan Ma, Yu Qiao, and Pengfei Liu. 2024. Mops: Modular story premise synthesis for open-ended automatic story generation. *Preprint*, arXiv:2406.05690.
18. Aleksandr Migal, Daria Seredina, Ludmila Telnina, Nikita Nazarov, Anastasia Kolmogorova, and Nikolay Mikhaylovskiy. 2024. Overview of long story generation challenge (lsgc) at inlg 2024. In *Proceedings of the 17th International Natural Language Generation Conference: Generation Challenges*, pages 47–53.
19. John W Oller Jr. 1983. Story writing principles and esl teaching. *Tesol Quarterly*, 17(1):39–53.
20. OpenAI. 2024a. Gpt-4o mini: Advancing cost-efficient intelligence. Accessed: 2025-02-04.
21. OpenAI. 2024b. Hello gpt-4o. Accessed: 2025-02-04.
22. Long Ouyang, Jeffrey Wu, Xu Jiang, Diogo Almeida, Carroll Wainwright, Pamela Mishkin, Chong Zhang, Sandhini Agarwal, Katarina Slama, Alex Ray, et al. 2022. Training language models to follow instructions with human feedback. *Advances in neural information processing systems*, 35:27730–27744.
23. Yufei Tian, Tenghao Huang, Miri Liu, Derek Jiang, Alexander Spangher, Muhao Chen, Jonathan May, and Nanyun Peng. 2024. Are large language models capable of generating human-level narratives? In *Proceedings of the 2024 Conference on Empirical Methods in Natural Language Processing*, pages 17659–17681.
24. Qianyue Wang, Jinwu Hu, Zhengping Li, Yufeng Wang, Yu Hu, Mingkui Tan, et al. 2024. Generating long-form story using dynamic hierarchical outlining with memory-enhancement. *arXiv preprint* arXiv:2412.13575.
25. Xiaozhi Wang, Yulin Chen, Ning Ding, Hao Peng, Zimu Wang, Yankai Lin, Xu Han, Lei Hou, Juanzi Li, Zhiyuan Liu, et al. 2022. Maven-ere: A unified large-scale dataset for event coreference, temporal, causal, and subevent relation extraction. In *Proceedings of the 2022 Conference on Empirical Methods in Natural Language Processing*, pages 926–941.
26. Xiaozhi Wang, Hao Peng, Yong Guan, Kaisheng Zeng, Jianhui Chen, Lei Hou, Xu Han, Yankai Lin, Zhiyuan Liu, Ruobing Xie, et al. 2023a. Maven-arg: Completing the puzzle of all-in-one event understanding dataset with event argument annotation. *arXiv preprint* arXiv:2311.09105.
27. Yichen Wang, Kevin Yang, Xiaoming Liu, and Dan Klein. 2023b. Improving pacing in long-form story planning. In *Findings of the Association for Computational Linguistics: EMNLP 2023*, pages 10788–10845.
28. Yuxin Wang, Jieru Lin, Zhiwei Yu, Wei Hu, and Börje F Karlsson. 2023c. Open-world story generation with structured knowledge enhancement: A comprehensive survey. *Neurocomputing*, page 126792.
29. Qingyun Wu, Gagan Bansal, Jieyu Zhang, Yiran Wu, Beibin Li, Erkang Zhu, Li Jiang, Xiaoyun Zhang, Shaokun Zhang, Jiale Liu, Ahmed Hassan Awadallah, Ryen W White, Doug Burger, and Chi Wang. 2023. Autogen: Enabling next-gen llm applications via multi-agent conversation. *Preprint*, arXiv:2308.08155.
30. Kaige Xie and Mark Riedl. 2024. Creating suspenseful stories: Iterative planning with large language models. In *Proceedings of the 18th Conference of the European Chapter of the Association for Computational Linguistics (Volume 1: Long Papers)*, pages 2391–2407.
31. Kevin Yang, Dan Klein, Nanyun Peng, and Yuandong Tian. 2023a. Doc: Improving long story coherence with detailed outline control. In *Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, pages 3378–3465.
32. Kevin Yang, Dan Klein, Nanyun Peng, and Yuandong Tian. 2023b. Doc: Improving long story coherence with detailed outline control. *Preprint*, arXiv:2212.10077.
33. Yao Yao, Zuchao Li, and Hai Zhao. 2024. Sirllm: Streaming infinite retentive llm. *Preprint*, arXiv:2405.12528.

---

## 翻译与排版说明

- 本译文为基于 PDF 原文的**全文逐段精译**，覆盖正文、表格、图注、公式、局限性与伦理考量；图 2 内部文字标签已补充翻译于[附录 A](#附录-a图-2-图解内容)。
- **专有名词处理**：模型名（STORYWRITER、STORYWRITER<sub>LLAMA</sub>/<sub>GLM</sub>、DOC、GPT-4o 等）、数据集名（MoPS、LONGSTORY）与模块名（EventSeed、EventValidator、SubTasker、Weaver、Coordinator、FinalWriter）保留英文，首次出现处附中文释义；术语对照见[附录 B](#附录-b术语对照表)。
- **参考文献**保留英文原文，以保证可引用性与准确性。
- **译者注（关于原文内部数据不一致）**：原论文摘要称数据集"约 6,000 篇 / 平均 8,000 词"，引言称"约 6,000 篇 / 平均 15,000 词"，而第 4 节实际写为"5,500 篇 / 平均 8,000 词"。上述差异为原文自身的不一致，本译文已忠实保留，未作改动。
