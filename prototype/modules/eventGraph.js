import { closeDialog, openDialog } from "./dialogs.js";

const KINDS = [["arc", "故事弧"], ["beat", "情节点"], ["scene", "场面"], ["event", "事件"]];
const ROLES = [["setup", "开端"], ["inciting_incident", "激励"], ["rising_action", "上升"], ["turning_point", "转折"], ["crisis", "危机"], ["climax", "高潮"], ["falling_action", "下降"], ["resolution", "结局"], ["custom", "自定义"]];
const FUNCTIONS = [["action", "动作"], ["dialogue", "对话"], ["exposition", "说明"], ["worldbuilding", "世界构建"], ["relationship", "关系"], ["mystery", "悬念"], ["transition", "过渡"], ["mixed", "混合"]];
const STATUSES = [["draft", "草拟"], ["confirmed", "已确认"], ["writing", "写作中"], ["covered", "已覆盖"], ["needs_revision", "需修订"]];
const RELATIONS = [["causes", "因果"], ["requires", "前置"], ["reveals", "揭示"], ["foreshadows", "伏笔"], ["contrasts", "对照"]];
const PROMISES = [["planned", "计划"], ["seeded", "已铺设"], ["eligible", "可兑现"], ["paid_off", "已兑现"], ["abandoned", "放弃"]];
const PEOPLE = [["focus", "焦点"], ["active", "主动"], ["supporting", "配角"], ["mentioned", "提及"]];
const COVERAGE = [["planned", "计划"], ["drafted", "已起草"], ["verified", "已核验"], ["deviated", "已偏离"]];
const WAIVED_TEXT = ["本次没有事件主线。", "作者已选择放弃事件图，仍然写作。", "正文不得声称情节来自事件图。"].join("\n");

const graphs = new Map();
const views = new Map();
const semantics = new Map();
const waivers = new Map();
let session = null;
let queue = null;
let renderLock = false;
let sequence = 0;

const label = (table, value) => table.find(([key]) => key === value)?.[1] ?? value;

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function uid(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function textLength(value) {
  return Array.from(value).length;
}

function node(partial) {
  return {
    summary: "",
    structuralRole: "setup",
    narrativeFunction: "mixed",
    goal: "",
    conflict: "",
    outcome: "",
    locationText: "",
    timeText: "",
    status: "draft",
    notes: "",
    revision: 1,
    ...partial,
    storyOrder: partial.storyOrder ?? partial.narrativeOrder,
  };
}

function demo() {
  return {
    outline: {
      id: "outline-night",
      title: "长夜",
      premise: "一场持续二十年的雨，和一封不该准时送达的信。",
      theme: "准时本身不可信",
      coreConflict: "林默想弄清巷中的人是谁，而每一个准时出现的线索都在改写他的记忆。",
      climaxSummary: "废弃车站的广播念出他的名字，日期是三天以后。",
      endingIntent: "他在破晓前决定不再赴约。",
      status: "active",
      revision: 6,
    },
    nodes: [
      node({ id: "n-root", parentId: null, kind: "arc", title: "全书", summary: "雨、信，和总是准时出现的人。", narrativeOrder: 0, status: "confirmed" }),
      node({ id: "n-arc-1", parentId: "n-root", kind: "arc", title: "城市之夜", summary: "旧城区的一夜，从早到的脚步开始。", structuralRole: "setup", narrativeOrder: 1000, status: "confirmed" }),
      node({ id: "n-rain", parentId: "n-arc-1", kind: "event", title: "雨夜巷口", summary: "林默在钟点之前听见多出来的脚步。", structuralRole: "inciting_incident", narrativeFunction: "mystery", goal: "确认巷中是否真的有人", conflict: "脚步声比约定更早，巷子却是空的", outcome: "他走进巷子，第二声脚步更近", locationText: "旧城巷口钟表店", timeText: "雨夜十一点四十七分", narrativeOrder: 2000, status: "confirmed" }),
      node({ id: "n-guest", parentId: "n-arc-1", kind: "event", title: "清晨来客", summary: "门外的人先开口，点破他看见了人。", structuralRole: "rising_action", narrativeFunction: "dialogue", goal: "弄清门外的人是否看见了昨夜的身影", conflict: "对方先开口，他反而不知道该问什么", outcome: "信封仍未拆开", locationText: "林默的客厅", timeText: "清晨六点", narrativeOrder: 3000, status: "confirmed" }),
      node({ id: "n-photo", parentId: "n-arc-1", kind: "event", title: "旧照片", summary: "二十年前的合影背面写着废弃车站。", structuralRole: "turning_point", narrativeFunction: "mystery", goal: "辨认合影里的第二个人", conflict: "那个人和昨夜的身影很像", outcome: "背面写着车站地址，以及不要相信准时出现的人", locationText: "林默的客厅", timeText: "清晨之后", narrativeOrder: 4000, status: "draft" }),
      node({ id: "n-arc-2", parentId: "n-root", kind: "arc", title: "黎明之前", summary: "广播会在他抵达之前念出他的名字。", structuralRole: "rising_action", narrativeOrder: 5000, status: "confirmed" }),
      node({ id: "n-echo", parentId: "n-arc-2", kind: "event", title: "车站回声", summary: "广播念出他的名字，日期是三天以后。", structuralRole: "crisis", narrativeFunction: "mystery", goal: "核对广播里的失踪通告", conflict: "通告上的日期还没有到来", outcome: "他还没有决定要不要赴约", locationText: "废弃车站", timeText: "尚未入章", narrativeOrder: 6000, status: "confirmed" }),
      node({ id: "n-dawn", parentId: "n-arc-2", kind: "event", title: "破晓", summary: "", structuralRole: "resolution", narrativeFunction: "action", narrativeOrder: 7000, status: "draft" }),
    ],
    relations: [
      { id: "rel-1", sourceNodeId: "n-rain", targetNodeId: "n-guest", type: "causes", description: "巷中的脚步让清晨的来客有了开口的理由", orderException: false },
      { id: "rel-2", sourceNodeId: "n-photo", targetNodeId: "n-echo", type: "foreshadows", description: "照片背面的车站地址指向后文", orderException: false },
    ],
    mappings: [
      { chapterId: "chapter-1", nodeId: "n-rain", sortOrder: 1000, coverageStatus: "drafted" },
      { chapterId: "chapter-2", nodeId: "n-guest", sortOrder: 1000, coverageStatus: "drafted" },
      { chapterId: "chapter-3", nodeId: "n-photo", sortOrder: 1000, coverageStatus: "planned" },
    ],
    participants: [
      { nodeId: "n-rain", participantName: "林默", role: "focus", stateBefore: "准时赴约", stateAfter: "开始怀疑约定本身" },
      { nodeId: "n-guest", participantName: "林默", role: "focus", stateBefore: "一夜未睡", stateAfter: "仍未拆信" },
      { nodeId: "n-guest", participantName: "门外的女人", role: "active", stateBefore: "", stateAfter: "点破他看见了人" },
      { nodeId: "n-photo", participantName: "林默", role: "focus", stateBefore: "握着未拆的信封", stateAfter: "知道车站地址" },
    ],
    promises: [
      {
        id: "promise-1",
        title: "不要相信准时出现的人",
        setup: "照片背面写下这句话",
        triggerCondition: "有人又在约定的钟点出现",
        payoffRequirement: "林默拒绝这次赴约，并说出原因",
        status: "seeded",
        setupNodeId: "n-photo",
        triggerNodeId: "n-echo",
        payoffNodeId: null,
        notes: "",
        statusReason: "",
      },
    ],
  };
}

function ensure(projectId) {
  if (!graphs.has(projectId)) graphs.set(projectId, projectId === "myStory" ? demo() : null);
  if (!views.has(projectId)) {
    views.set(projectId, {
      mode: "structure",
      selectedId: projectId === "myStory" ? "n-rain" : null,
      filtersOpen: false,
      filters: { unmapped: false, alert: false, draft: false },
    });
  }
  if (!semantics.has(projectId)) semantics.set(projectId, []);
}

function snapshotOf(projectId) {
  ensure(projectId);
  return graphs.get(projectId);
}

function viewOf(projectId) {
  ensure(projectId);
  return views.get(projectId);
}

function byOrder(left, right) {
  return left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id);
}

function isLeaf(snapshot, nodeId) {
  return !snapshot.nodes.some((node) => node.parentId === nodeId);
}

function findNode(snapshot, nodeId) {
  return snapshot.nodes.find((node) => node.id === nodeId) ?? null;
}

function childrenOf(snapshot, parentId) {
  return snapshot.nodes.filter((node) => node.parentId === parentId).sort(byOrder);
}

function flatten(snapshot, parentId = null, depth = 0, acc = []) {
  for (const node of childrenOf(snapshot, parentId)) {
    acc.push({ node, depth });
    flatten(snapshot, node.id, depth + 1, acc);
  }
  return acc;
}

function descendantIds(snapshot, nodeId) {
  return [nodeId, ...childrenOf(snapshot, nodeId).flatMap((node) => descendantIds(snapshot, node.id))];
}

function defaultParentId(snapshot) {
  const roots = snapshot.nodes.filter((node) => node.parentId === null);
  return roots.length === 1 ? roots[0].id : null;
}

function bump(outline) {
  return { ...outline, revision: outline.revision + 1 };
}

function updateBadge(projectId, snapshot) {
  const small = document.querySelector(`.project-event[data-project="${CSS.escape(projectId)}"] small`);
  if (small) small.textContent = snapshot ? `修订 ${snapshot.outline.revision}` : "未建";
}

function publish(projectId, snapshot) {
  graphs.set(projectId, snapshot);
  updateBadge(projectId, snapshot);
  if (session?.projectId === projectId && session.root.isConnected) session.render();
}

function collectIssues(snapshot) {
  if (!snapshot) return [];
  const issues = [];
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const push = (ruleCode, severity, nodeId, message) => {
    issues.push({ id: `${ruleCode}:${nodeId ?? "none"}`, ruleCode, severity, source: "rule", nodeId, message });
  };
  for (const relation of snapshot.relations) {
    const source = findNode(snapshot, relation.sourceNodeId);
    const target = findNode(snapshot, relation.targetNodeId);
    if (source && target && (relation.type === "requires" || relation.type === "causes") && !relation.orderException && source.narrativeOrder > target.narrativeOrder) {
      push("relation.order", "warning", source.id, "因果或前置在叙述顺序上颠倒，且未标记倒叙例外");
    }
  }
  for (const promise of snapshot.promises) {
    const setup = findNode(snapshot, promise.setupNodeId);
    const payoff = findNode(snapshot, promise.payoffNodeId);
    if (setup && payoff && payoff.narrativeOrder < setup.narrativeOrder) push("promise.payoff_before_setup", "warning", payoff.id, "兑现节点早于铺设节点");
    if (promise.status === "seeded" && promise.payoffNodeId === null) push("promise.seeded_without_payoff", "info", promise.setupNodeId, "已铺设承诺没有兑现节点");
  }
  const ordered = [...snapshot.nodes].sort(byOrder);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.locationText.trim() && current.locationText.trim() && previous.locationText !== current.locationText && current.narrativeFunction !== "transition" && current.notes.trim() === "") {
      push("participant.location_jump", "warning", current.id, "地点变化但没有过渡或说明");
    }
  }
  for (const node of snapshot.nodes) {
    const leaf = isLeaf(snapshot, node.id);
    if (leaf && node.status === "confirmed" && node.goal.trim() === "" && node.conflict.trim() === "") push("node.confirmed_empty", "warning", node.id, "已确认叶子没有目标也没有冲突");
    if (leaf && node.status === "confirmed" && !snapshot.mappings.some((mapping) => mapping.nodeId === node.id)) push("node.unmapped_leaf", "info", node.id, "已确认叶子未映射");
    for (const participant of snapshot.participants) {
      if (participant.nodeId !== node.id || (participant.role !== "focus" && participant.role !== "active")) continue;
      if (participant.stateBefore.trim() === "") push("participant.missing_state", "warning", node.id, "主动参与者缺少事件前状态");
    }
  }
  return issues.filter((issue) => issue.nodeId === null || nodeIds.has(issue.nodeId));
}

function activeSemantic(projectId, snapshot) {
  if (!snapshot) return [];
  return (semantics.get(projectId) ?? []).filter((issue) => {
    if (!issue.nodeId) return issue.checkedRevision === snapshot.outline.revision;
    const node = findNode(snapshot, issue.nodeId);
    return node && node.revision === issue.checkedRevision;
  });
}

function staleSemantic(projectId, snapshot) {
  const active = new Set(activeSemantic(projectId, snapshot).map((issue) => issue.id));
  return (semantics.get(projectId) ?? []).filter((issue) => !active.has(issue.id));
}

function issuesFor(projectId, snapshot, nodeId) {
  return [...collectIssues(snapshot), ...activeSemantic(projectId, snapshot)].filter((issue) => issue.nodeId === nodeId);
}

function chapterName(ctx, chapterId) {
  const chapter = ctx.chapters[chapterId];
  return chapter ? `第 ${chapter.number} 章 · ${chapter.title}` : "未知章节";
}

function readingChapters(ctx) {
  return (ctx.project.chapterIds ?? []).flatMap((id) => {
    const chapter = ctx.chapters[id];
    return chapter ? [{ id, title: chapter.title, number: chapter.number, volume: chapter.volume }] : [];
  });
}

function leaves(snapshot) {
  return snapshot.nodes.filter((node) => isLeaf(snapshot, node.id)).sort(byOrder);
}

function acceptedLeaves(snapshot, chapterId) {
  const mapped = new Set(snapshot.mappings.filter((mapping) => mapping.chapterId === chapterId).map((mapping) => mapping.nodeId));
  return leaves(snapshot).filter((node) => node.status === "confirmed" && mapped.has(node.id));
}

function hardConstraints(snapshot, chosen) {
  const lines = ["硬约束", `主题：${snapshot.outline.theme}`, `核心冲突：${snapshot.outline.coreConflict}`, `结局意图：${snapshot.outline.endingIntent}`];
  for (const node of chosen) {
    const participants = snapshot.participants.filter((participant) => participant.nodeId === node.id);
    lines.push([
      `事件：${node.title}`,
      `目标：${node.goal}`,
      `冲突：${node.conflict}`,
      `结果：${node.outcome}`,
      `地点：${node.locationText}`,
      `时间：${node.timeText}`,
      `参与者：${participants.map((participant) => `${participant.participantName}（${participant.role}；事件前：${participant.stateBefore}；事件后：${participant.stateAfter}）`).join("、")}`,
    ].join("\n"));
  }
  return lines.join("\n");
}

function instructionFor(snapshot, chapterId, chosen, reading) {
  const sections = [hardConstraints(snapshot, chosen)];
  const ancestors = [];
  const seen = new Set();
  for (const node of chosen) {
    const chain = [];
    let parentId = node.parentId;
    while (parentId) {
      const parent = findNode(snapshot, parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      chain.push(parent);
      parentId = parent.parentId;
    }
    for (const ancestor of chain.reverse()) ancestors.push(`${ancestor.title}：${ancestor.summary}`);
  }
  if (ancestors.length) sections.push(["祖先", ...ancestors].join("\n"));
  const allLeaves = leaves(snapshot);
  const first = chosen[0];
  const last = chosen[chosen.length - 1];
  const firstIndex = allLeaves.findIndex((node) => node.id === first?.id);
  const lastIndex = allLeaves.findIndex((node) => node.id === last?.id);
  const neighbor = ["相邻事件"];
  const previous = firstIndex > 0 ? allLeaves[firstIndex - 1] : null;
  if (previous) neighbor.push(`前一叶子：${previous.title}：${previous.summary}`);
  const chosenIds = new Set(chosen.map((node) => node.id));
  for (const relation of snapshot.relations) {
    if ((relation.type !== "requires" && relation.type !== "causes") || !chosenIds.has(relation.targetNodeId) || chosenIds.has(relation.sourceNodeId)) continue;
    const source = findNode(snapshot, relation.sourceNodeId);
    if (source) neighbor.push(`因果前置：${source.title}：${source.summary}`);
  }
  const next = lastIndex >= 0 ? allLeaves[lastIndex + 1] : null;
  if (next) neighbor.push(`下一叶子（只用于过渡，不得展开）：${next.title}：${next.summary}`);
  if (neighbor.length > 1) sections.push(neighbor.join("\n"));
  const others = leaves(snapshot).filter((node) => snapshot.mappings.some((mapping) => mapping.nodeId === node.id && mapping.chapterId === chapterId) && !chosenIds.has(node.id));
  if (others.length) sections.push(["本章其他叶子", ...others.map((node) => `${node.title}：${node.status}`)].join("\n"));
  const states = [];
  for (const node of chosen) {
    for (const participant of snapshot.participants.filter((item) => item.nodeId === node.id)) {
      const prior = snapshot.nodes
        .filter((item) => item.narrativeOrder < node.narrativeOrder)
        .filter((item) => snapshot.participants.some((candidate) => candidate.nodeId === item.id && candidate.participantName === participant.participantName))
        .sort((left, right) => right.narrativeOrder - left.narrativeOrder)[0];
      const state = prior && snapshot.participants.find((candidate) => candidate.nodeId === prior.id && candidate.participantName === participant.participantName);
      if (state?.stateAfter.trim()) states.push(`${participant.participantName} 在「${prior.title}」之后：${state.stateAfter}`);
    }
  }
  if (states.length) sections.push(["参与者状态", ...states].join("\n"));
  const current = reading.find((chapter) => chapter.id === chapterId);
  const included = [];
  if (current) {
    for (const promise of snapshot.promises) {
      if (promise.status !== "eligible" || !promise.triggerNodeId) continue;
      const mapping = snapshot.mappings.find((item) => item.nodeId === promise.triggerNodeId);
      const trigger = mapping && reading.find((chapter) => chapter.id === mapping.chapterId);
      if (trigger && trigger.number <= current.number) included.push(promise);
    }
  }
  if (included.length) sections.push(["可兑现承诺", ...included.map((promise) => `${promise.title}：${promise.payoffRequirement}`)].join("\n"));
  sections.push("检索证据\n没有命中");
  return { text: sections.join("\n\n"), next, included };
}

function handoffModel(ctx, chapterId, selectedIds) {
  const snapshot = snapshotOf(ctx.projectId);
  const revision = snapshot?.outline.revision ?? null;
  if (waivers.get(`${ctx.projectId}:${chapterId}`) === revision) {
    return { status: "waived", chapterId, instruction: WAIVED_TEXT };
  }
  if (!snapshot) return { status: "missing", reason: "no-outline", chapterId };
  const accepted = acceptedLeaves(snapshot, chapterId);
  const chosen = accepted.filter((node) => selectedIds.has(node.id));
  const mappedDrafts = leaves(snapshot).filter((node) => node.status !== "confirmed" && snapshot.mappings.some((mapping) => mapping.nodeId === node.id && mapping.chapterId === chapterId));
  if (accepted.length === 0) return { status: "missing", reason: "no-accepted-leaf", chapterId, mappedDrafts };
  if (chosen.length === 0) return { status: "missing", reason: "none-checked", chapterId, mappedDrafts };
  const hard = hardConstraints(snapshot, chosen);
  if (textLength(hard) > 4000) return { status: "too-large", chapterId };
  const built = instructionFor(snapshot, chapterId, chosen, readingChapters(ctx));
  const excluded = snapshot.promises.filter((promise) => !built.included.includes(promise)).map((promise) => ({
    promise,
    reason: promise.status === "paid_off" ? "已经兑现" : promise.status === "abandoned" ? "已放弃" : promise.status === "eligible" ? "触发不在本章或更早章节" : promise.status === "seeded" ? "尚未到可兑现" : "仍是计划",
  }));
  return {
    status: "ready",
    chapterId,
    revision: snapshot.outline.revision,
    chosen,
    mappedDrafts,
    next: built.next,
    excluded,
    instruction: built.text,
    used: textLength(built.text),
  };
}

function visibleSet(projectId, snapshot) {
  const view = viewOf(projectId);
  const filters = view.filters;
  if (!filters.unmapped && !filters.alert && !filters.draft) return null;
  const matched = new Set();
  for (const node of snapshot.nodes) {
    const leaf = isLeaf(snapshot, node.id);
    const mapped = snapshot.mappings.some((mapping) => mapping.nodeId === node.id);
    const alert = issuesFor(projectId, snapshot, node.id).length > 0;
    if ((filters.unmapped && leaf && !mapped) || (filters.alert && alert) || (filters.draft && node.status === "draft")) matched.add(node.id);
  }
  for (const id of [...matched]) {
    let parentId = findNode(snapshot, id)?.parentId ?? null;
    while (parentId) {
      matched.add(parentId);
      parentId = findNode(snapshot, parentId)?.parentId ?? null;
    }
  }
  return matched;
}

function arcTitle(snapshot, node) {
  let current = node;
  while (current) {
    if (current.kind === "arc" && current.parentId !== null) return current.title;
    current = findNode(snapshot, current.parentId);
  }
  return "未分组";
}

function options(table, current) {
  return table.map(([value, text]) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(text)}</option>`).join("");
}

function pill(status) {
  return `<span class="eg-pill status-${esc(status)}">${esc(label(STATUSES, status))}</span>`;
}

function pageHtml() {
  const { projectId, ctx, root } = session;
  const snapshot = snapshotOf(projectId);
  const view = viewOf(projectId);
  const issueCount = snapshot ? collectIssues(snapshot).length + activeSemantic(projectId, snapshot).length : 0;
  return `
    <header class="eg-header">
      <div>
        <p class="eg-kicker">${snapshot ? `使用中 · 修订 ${snapshot.outline.revision}` : "尚未建立"}</p>
        <h1>${esc(snapshot?.outline.title || ctx.project.bookTitle)}</h1>
      </div>
      <div class="eg-toolbar">
        <button class="eg-pane-toggle for-tree" type="button" data-eg="toggle-tree" aria-expanded="${root.classList.contains("tree-open") ? "true" : "false"}">事件树</button>
        <button class="eg-pane-toggle for-inspector" type="button" data-eg="toggle-inspector" aria-expanded="${root.classList.contains("inspector-open") ? "true" : "false"}">详情</button>
        ${snapshot ? `<div class="eg-segment" role="group" aria-label="视图"><button type="button" data-eg="set-view" data-view="structure" aria-pressed="${view.mode === "structure" ? "true" : "false"}">结构</button><button type="button" data-eg="set-view" data-view="timeline" aria-pressed="${view.mode === "timeline" ? "true" : "false"}">时间线</button></div><button type="button" data-eg="toggle-filters" aria-pressed="${view.filtersOpen ? "true" : "false"}">筛选</button><button type="button" data-eg="check">检查${issueCount ? ` · ${issueCount}` : ""}</button><button type="button" data-eg="expand">展开一层</button><button class="eg-primary" type="button" data-eg="propose">生成候选</button>` : ""}
      </div>
    </header>
    ${snapshot && view.filtersOpen ? `<div class="eg-filters">${[["unmapped", "未映射"], ["alert", "有告警"], ["draft", "草拟"]].map(([key, text]) => `<button type="button" data-eg="filter" data-filter="${key}" aria-pressed="${view.filters[key] ? "true" : "false"}">${text}</button>`).join("")}</div>` : ""}
    ${snapshot ? bodyHtml(projectId, snapshot, view) : emptyHtml()}
  `;
}

function emptyHtml() {
  return `<div class="eg-empty"><h2>这本书还没有事件图</h2><p>目录只记录卷和章。事件图记录故事弧、叶子事件、因果关系和承诺。写作前从这里读取已经确认的主线。</p><div class="eg-empty-actions"><button class="eg-secondary" type="button" data-eg="create">手动建立</button><button class="eg-primary" type="button" data-eg="propose">按简介生成</button></div></div>`;
}

function bodyHtml(projectId, snapshot, view) {
  const visible = visibleSet(projectId, snapshot);
  const rows = flatten(snapshot).filter((row) => !visible || visible.has(row.node.id));
  return `<div class="eg-body"><aside class="eg-tree" aria-label="事件树">${rows.length ? rows.map(({ node, depth }) => treeRow(node, depth, view.selectedId)).join("") : `<p class="eg-muted">没有符合筛选的事件。</p>`}</aside><main class="eg-stage">${profileStrip(snapshot)}${view.mode === "timeline" ? timelineHtml(projectId, snapshot, view, visible) : structureHtml(projectId, snapshot, view, rows)}</main>${inspectorHtml(projectId, snapshot, view)}</div>`;
}

function treeRow(node, depth, selectedId) {
  return `<button class="eg-tree-row" type="button" data-eg="select" data-node="${esc(node.id)}" style="--depth:${depth}" ${node.id === selectedId ? 'aria-current="true"' : ""}><i class="eg-kind ${esc(node.kind)}"></i><span>${esc(node.title)}</span><small>${esc(label(STATUSES, node.status))}</small></button>`;
}

function profileStrip(snapshot) {
  return `<button class="eg-profile" type="button" data-eg="profile"><span>主题</span><strong>${esc(snapshot.outline.theme || "未写主题")}</strong><span>核心冲突</span><strong>${esc(snapshot.outline.coreConflict || "未写核心冲突")}</strong></button>`;
}

function structureHtml(projectId, snapshot, view, rows) {
  if (rows.length === 0) return `<p class="eg-muted">没有符合筛选的事件。</p>`;
  return rows.map(({ node, depth }, index) => cardHtml(projectId, snapshot, node, depth, index + 1, node.id === view.selectedId)).join("");
}

function timelineHtml(projectId, snapshot, view, visible) {
  const groups = new Map();
  for (const node of leaves(snapshot)) {
    if (visible && !visible.has(node.id)) continue;
    const key = arcTitle(snapshot, node);
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }
  if (groups.size === 0) return `<p class="eg-muted">没有可排列的叶子。</p>`;
  let index = 0;
  return [...groups].map(([title, nodes]) => `<h3 class="eg-arc-label">${esc(title)}</h3>${nodes.map((node) => { index += 1; return cardHtml(projectId, snapshot, node, 0, index, node.id === view.selectedId); }).join("")}`).join("");
}

function cardHtml(projectId, snapshot, node, depth, index, selected) {
  const mapping = snapshot.mappings.find((item) => item.nodeId === node.id);
  const alerts = issuesFor(projectId, snapshot, node.id).length;
  const summary = node.summary.trim() ? esc(node.summary) : `<span class="muted">未写摘要</span>`;
  return `<div class="eg-card-wrap" style="--depth:${depth}"><button class="eg-card${selected ? " selected" : ""}${node.kind === "arc" ? " is-arc" : ""}" type="button" data-eg="select" data-node="${esc(node.id)}"><span class="eg-card-top"><span class="eg-order">${String(index).padStart(2, "0")}</span><strong>${esc(node.title)}</strong>${pill(node.status)}</span><p>${summary}</p><span class="eg-meta"><span>${esc(label(ROLES, node.structuralRole))}</span><span>${mapping ? esc(chapterName(session.ctx, mapping.chapterId)) : "未入章"}</span>${alerts ? `<span class="eg-alert">${alerts} 条告警</span>` : ""}</span></button></div>`;
}

function inspectorHtml(projectId, snapshot, view) {
  const node = findNode(snapshot, view.selectedId) ?? snapshot.nodes[0] ?? null;
  if (!node) return `<aside class="eg-inspector"><p class="eg-muted">还没有节点。</p></aside>`;
  if (view.selectedId !== node.id) view.selectedId = node.id;
  const mapping = snapshot.mappings.find((item) => item.nodeId === node.id);
  const leaf = isLeaf(snapshot, node.id);
  const alerts = issuesFor(projectId, snapshot, node.id);
  const participants = snapshot.participants.filter((item) => item.nodeId === node.id);
  const relations = snapshot.relations.filter((item) => item.sourceNodeId === node.id || item.targetNodeId === node.id);
  const promises = snapshot.promises.filter((item) => item.setupNodeId === node.id || item.triggerNodeId === node.id || item.payoffNodeId === node.id);
  const sameChapter = mapping ? snapshot.mappings.filter((item) => item.chapterId === mapping.chapterId).sort((left, right) => left.sortOrder - right.sortOrder) : [];
  return `<aside class="eg-inspector" aria-label="节点详情"><div class="eg-inspector-scroll"><p class="eg-kicker">${esc(label(KINDS, node.kind))}</p><h2>${esc(node.title)}</h2>${alerts.length ? `<ul class="eg-inline-issues">${alerts.map((issue) => `<li>${esc(issue.message)}</li>`).join("")}</ul>` : ""}<details class="eg-group" open><summary>摘要</summary><label>标题<input data-field="title" value="${esc(node.title)}"></label><label>摘要<textarea data-field="summary" rows="3">${esc(node.summary)}</textarea></label><label>种类<select data-field="kind">${options(KINDS, node.kind)}</select></label><label>状态<select data-field="status">${options(STATUSES, node.status)}</select></label></details><details class="eg-group" open><summary>写作约束</summary><label>目标<textarea data-field="goal" rows="2">${esc(node.goal)}</textarea></label><label>冲突<textarea data-field="conflict" rows="2">${esc(node.conflict)}</textarea></label><label>结果<textarea data-field="outcome" rows="2">${esc(node.outcome)}</textarea></label></details><details class="eg-group"><summary>场面</summary><label>地点<input data-field="locationText" value="${esc(node.locationText)}"></label><label>时间<input data-field="timeText" value="${esc(node.timeText)}"></label><label>叙事功能<select data-field="narrativeFunction">${options(FUNCTIONS, node.narrativeFunction)}</select></label></details><details class="eg-group"><summary>人物</summary>${participants.map((participant, index) => `<div class="eg-person"><strong>${esc(participant.participantName)}</strong><small>${esc(label(PEOPLE, participant.role))}</small><button type="button" data-eg="remove-participant" data-index="${index}">移除</button><label>事件前<input data-field="stateBefore" data-pindex="${index}" value="${esc(participant.stateBefore)}"></label><label>事件后<input data-field="stateAfter" data-pindex="${index}" value="${esc(participant.stateAfter)}"></label></div>`).join("") || `<p class="eg-muted">还没有人物。</p>`}<button class="eg-text-button" type="button" data-eg="add-participant">添加人物</button></details><details class="eg-group"><summary>结构</summary><label>结构角色<select data-field="structuralRole">${options(ROLES, node.structuralRole)}</select></label><label>故事顺序<input data-field="storyOrder" inputmode="numeric" value="${node.storyOrder}"></label><p class="eg-muted">叙述顺序 ${node.narrativeOrder}。倒叙时让故事顺序和叙述顺序不同。</p></details><details class="eg-group"><summary>关系</summary>${relations.map((relation) => relationRow(snapshot, node, relation)).join("") || `<p class="eg-muted">还没有关系。</p>`}<button class="eg-text-button" type="button" data-eg="add-relation">添加关系</button></details><details class="eg-group"><summary>承诺</summary>${promises.map((promise) => promiseBlock(promise)).join("") || `<p class="eg-muted">还没有挂在这个节点上的承诺。</p>`}<button class="eg-text-button" type="button" data-eg="add-promise">添加承诺</button></details><details class="eg-group" open><summary>章节</summary>${mapping ? `<p>${esc(chapterName(session.ctx, mapping.chapterId))}</p><p class="eg-muted">覆盖：${esc(label(COVERAGE, mapping.coverageStatus))}。映射不改章节标题。</p>${sameChapter.length > 1 ? `<div class="eg-inline-actions"><button type="button" data-eg="sort" data-dir="-1">本章上移</button><button type="button" data-eg="sort" data-dir="1">本章下移</button></div>` : ""}` : `<p class="eg-muted">${leaf ? "未入章" : "只有叶子可以放入章节"}</p>`}</details></div><footer class="eg-inspector-actions"><button type="button" data-eg="move" data-dir="-1">上移</button><button type="button" data-eg="move" data-dir="1">下移</button><button type="button" data-eg="map" ${leaf ? "" : "disabled"}>${mapping ? "章节映射" : "放入章节"}</button><button type="button" data-eg="handoff" ${mapping ? "" : "disabled"}>查看本章主线</button><button type="button" data-eg="coverage" ${mapping ? "" : "disabled"}>检查覆盖</button><button class="eg-danger" type="button" data-eg="delete">删除</button></footer></aside>`;
}

function relationRow(snapshot, node, relation) {
  const outbound = relation.sourceNodeId === node.id;
  const other = findNode(snapshot, outbound ? relation.targetNodeId : relation.sourceNodeId);
  return `<div class="eg-relation"><span>${outbound ? "指向" : "来自"} ${esc(other?.title ?? "缺失节点")} · ${esc(label(RELATIONS, relation.type))}</span><small>${esc(relation.description)}</small><button type="button" data-eg="remove-relation" data-id="${esc(relation.id)}">移除</button></div>`;
}

function promiseBlock(promise) {
  return `<article class="eg-promise"><strong>${esc(promise.title)}</strong><p>${esc(promise.setup || "未写铺设")}</p><div class="eg-segment promise">${PROMISES.map(([value, text]) => `<button type="button" data-eg="promise" data-id="${esc(promise.id)}" data-status="${value}" aria-pressed="${promise.status === value ? "true" : "false"}">${text}</button>`).join("")}</div>${promise.statusReason ? `<p class="eg-muted">理由：${esc(promise.statusReason)}</p>` : ""}</article>`;
}

function render() {
  if (!session?.root.isConnected || renderLock) return;
  renderLock = true;
  const root = session.root;
  const scrolls = ["eg-tree", "eg-stage", "eg-inspector-scroll"].map((name) => root.querySelector(`.${name}`)?.scrollTop ?? 0);
  root.innerHTML = pageHtml();
  ["eg-tree", "eg-stage", "eg-inspector-scroll"].forEach((name, index) => {
    const element = root.querySelector(`.${name}`);
    if (element) element.scrollTop = scrolls[index];
  });
  renderLock = false;
}

function toast(message) {
  session?.ctx.onToast?.(message);
}

function mutate(projectId, recipe) {
  const current = snapshotOf(projectId);
  if (!current) return null;
  const next = recipe(current);
  if (!next) return null;
  publish(projectId, next);
  return next;
}

function saveField(input) {
  if (renderLock || !session) return;
  const projectId = session.projectId;
  const snapshot = snapshotOf(projectId);
  const view = viewOf(projectId);
  const node = snapshot && findNode(snapshot, view.selectedId);
  if (!node) return;
  const field = input.dataset.field;
  if (input.dataset.pindex != null) {
    const participants = snapshot.participants.filter((item) => item.nodeId === node.id);
    const participant = participants[Number(input.dataset.pindex)];
    if (!participant || participant[field] === input.value) return;
    mutate(projectId, (current) => ({
      ...current,
      outline: bump(current.outline),
      participants: current.participants.map((item) => item === participant ? { ...item, [field]: input.value } : item),
      nodes: current.nodes.map((item) => item.id === node.id ? { ...item, revision: item.revision + 1 } : item),
    }));
    return;
  }
  let value = input.value;
  if (field === "storyOrder") {
    if (!/^-?\d+$/.test(value.trim())) {
      toast("故事顺序要是整数");
      render();
      return;
    }
    value = Number(value);
  }
  if (field === "title" && String(value).trim() === "") {
    toast("标题不能为空");
    render();
    return;
  }
  if (node[field] === value) return;
  mutate(projectId, (current) => ({
    ...current,
    outline: bump(current.outline),
    nodes: current.nodes.map((item) => item.id === node.id ? { ...item, [field]: value, revision: item.revision + 1 } : item),
  }));
}

function openShell({ title, description = "", wide = false }) {
  closeDialog();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay eg-overlay";
  overlay.innerHTML = `<section class="prototype-dialog eg-dialog${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="eg-dialog-title"><header><div><h2 id="eg-dialog-title">${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ""}</div><button type="button" data-eg="close" aria-label="关闭">×</button></header><div class="eg-dialog-body"></div><footer class="eg-dialog-footer"></footer></section>`;
  document.querySelector("#modal-root").append(overlay);
  const handlers = { close: () => closeDialog() };
  overlay.addEventListener("pointerdown", (event) => { if (event.target === overlay) closeDialog(); });
  overlay.addEventListener("click", (event) => {
    const button = event.target.closest("[data-eg]");
    if (!button || !overlay.contains(button)) return;
    event.stopPropagation();
    handlers[button.dataset.eg]?.(button);
  });
  return {
    overlay,
    handlers,
    body: overlay.querySelector(".eg-dialog-body"),
    footer: overlay.querySelector(".eg-dialog-footer"),
    setTitle: (value) => { overlay.querySelector("h2").textContent = value; },
  };
}

function proposalPack(mode, expand) {
  if (expand) {
    return {
      summary: "只在选中节点下新增一层。",
      nodes: [
        { tempId: "e1", parentTempId: null, kind: "event", title: "多出来的一拍", summary: "紧接上一事件，只多写一个变化。", structuralRole: "rising_action", narrativeFunction: "action", goal: "让这一拍产生一个新的阻碍", conflict: "人物没法沿用上一事件的做法", outcome: "局面和进来时不一样", narrativeOrder: 100 },
        { tempId: "e2", parentTempId: null, kind: "event", title: "没人接的那句话", summary: "有信息被说出来，但没有人回应。", structuralRole: "turning_point", narrativeFunction: "dialogue", goal: "把没落地的信息说清楚", conflict: "对方不肯把话说完", outcome: "这句话被留到后面", narrativeOrder: 200 },
      ],
    };
  }
  if (mode === "climax-first") {
    return {
      summary: "先给出高潮叶子，再补上升和下降。仍然只有一层。",
      nodes: [
        { tempId: "arc", parentTempId: null, kind: "arc", title: "广播之后", summary: "高潮先落地，前后的过程后补。", structuralRole: "climax", narrativeFunction: "mixed", goal: "", conflict: "", outcome: "", narrativeOrder: 100 },
        { tempId: "rise", parentTempId: "arc", kind: "event", title: "有人准时出现", summary: "上升动作，用来把人物送到高潮。", structuralRole: "rising_action", narrativeFunction: "action", goal: "弄清这个人为什么准时", conflict: "他比主角更熟悉约定", outcome: "主角决定去看广播", narrativeOrder: 200 },
        { tempId: "climax", parentTempId: "arc", kind: "event", title: "名字被当众念出", summary: "高潮叶子。日期来得太早。", structuralRole: "climax", narrativeFunction: "mystery", goal: "听清广播里的日期", conflict: "日期是三天以后", outcome: "他没法假装没听见", narrativeOrder: 300 },
        { tempId: "fall", parentTempId: "arc", kind: "event", title: "破晓前的空站台", summary: "下降。他没有赴约。", structuralRole: "falling_action", narrativeFunction: "action", goal: "离开车站", conflict: "走掉就会失去唯一的解释", outcome: "站台在天亮时是空的", narrativeOrder: 400 },
      ],
    };
  }
  return {
    summary: "按叙述顺序先放一条故事弧，弧下两个叶子。",
    nodes: [
      { tempId: "arc", parentTempId: null, kind: "arc", title: "雨还没停", summary: "约定的钟点一次次被提前。", structuralRole: "setup", narrativeFunction: "mixed", goal: "", conflict: "", outcome: "", narrativeOrder: 100 },
      { tempId: "e1", parentTempId: "arc", kind: "event", title: "门再次被敲响", summary: "来的人比约定更早。", structuralRole: "inciting_incident", narrativeFunction: "dialogue", goal: "看清门外是谁", conflict: "对方不肯报上名字", outcome: "门开了一条缝", narrativeOrder: 200 },
      { tempId: "e2", parentTempId: "arc", kind: "event", title: "信还是没拆", summary: "线索换了主人，信仍在桌上。", structuralRole: "rising_action", narrativeFunction: "mystery", goal: "决定要不要拆信", conflict: "拆开就会按信上的地址走", outcome: "他把信塞回抽屉", narrativeOrder: 300 },
    ],
  };
}

function openPropose(options = {}) {
  if (!session) return;
  const projectId = session.projectId;
  const snapshot = snapshotOf(projectId);
  const expand = Boolean(options.expand);
  if (expand && !options.parentId) {
    toast("先选中要展开的节点");
    return;
  }
  const parent = expand ? findNode(snapshot, options.parentId) : null;
  const shell = openShell({
    title: expand ? `展开「${parent?.title ?? ""}」` : "生成候选",
    description: "原型不调用模型。下一屏是一份 proposeOutline 会返回的 patch，可以逐条留下。",
    wide: true,
  });
  const showBrief = () => {
    shell.setTitle(expand ? `展开「${parent.title}」` : "生成候选");
    shell.body.innerHTML = `<div class="eg-choice"><label><input type="radio" name="mode" value="sequential" checked>顺序。按叙述顺序安排这一层。</label><label><input type="radio" name="mode" value="climax-first" ${options.mode === "climax-first" ? "checked" : ""}>高潮优先。先给高潮叶子，不运行搜索。</label></div>${snapshot ? "" : `<label class="eg-field">标题<input name="outline-title" value="${esc(session.ctx.project.bookTitle || "")}" required></label><p class="eg-muted">前提会使用书籍简介。主题、冲突、高潮和结局可以稍后在设定里补。</p>`}`;
    shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="close">取消</button><button class="dialog-primary" type="button" data-eg="build">生成候选</button>`;
  };
  const showCandidates = (mode, createTitle) => {
    const pack = proposalPack(mode, expand);
    if (pack.nodes.length > 8) {
      shell.body.innerHTML = `<p>这次候选有 ${pack.nodes.length} 条，超过 8 条。需要重新生成，不会只展示前面几条。</p>`;
      shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="close">关闭</button>`;
      return;
    }
    const rank = (item) => (item.kind === "event" && item.structuralRole === "climax" ? 0 : item.kind === "event" ? 1 : 2);
    const display = mode === "climax-first" ? [...pack.nodes].sort((left, right) => rank(left) - rank(right)) : pack.nodes;
    const leafNote = parent && isLeaf(snapshot, parent.id) ? "新增子节点后，当前节点不再是叶子，写作主线只读取叶子。" : "不会修改已有事件。";
    shell.setTitle(expand ? `展开「${parent.title}」· 只新增一层` : "候选 patch");
    shell.body.innerHTML = `<p class="eg-summary">${esc(pack.summary)} 基线修订 ${snapshot?.outline.revision ?? 0}。</p><div class="eg-candidate-tools"><span>将新增 ${pack.nodes.length} 项</span><button type="button" data-eg="keep-all">全部留下</button><button type="button" data-eg="drop-all">全部放弃</button></div>${display.map((item) => `<div class="eg-candidate" data-temp="${esc(item.tempId)}" data-parent-temp="${esc(item.parentTempId ?? "")}" data-kind="${esc(item.kind)}" data-role="${esc(item.structuralRole)}" data-fn="${esc(item.narrativeFunction)}" data-order="${item.narrativeOrder}" data-summary="${esc(item.summary)}" data-goal="${esc(item.goal)}" data-conflict="${esc(item.conflict)}" data-outcome="${esc(item.outcome)}"><input type="checkbox" checked aria-label="留下"><div><span class="eg-plus">＋</span><input class="eg-candidate-title" value="${esc(item.title)}" aria-label="标题"><p>${esc(item.summary)}</p><small>${esc(label(KINDS, item.kind))} · ${esc(label(ROLES, item.structuralRole))}${item.goal ? ` · 目标：${esc(item.goal)}` : ""}</small></div></div>`).join("")}<p class="eg-muted">${leafNote}</p>`;
    shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="close">取消</button><button class="dialog-primary" type="button" data-eg="apply">提交留下的项</button>`;
    shell.handlers["keep-all"] = () => shell.overlay.querySelectorAll(".eg-candidate input[type=checkbox]").forEach((box) => { box.checked = true; });
    shell.handlers["drop-all"] = () => shell.overlay.querySelectorAll(".eg-candidate input[type=checkbox]").forEach((box) => { box.checked = false; });
    shell.handlers.apply = () => applyProposal(projectId, snapshot, shell, createTitle, expand ? options.parentId : null);
  };
  shell.handlers.build = () => {
    const mode = shell.overlay.querySelector("input[name=mode]:checked")?.value || "sequential";
    const createTitle = snapshot ? null : shell.overlay.querySelector("[name=outline-title]")?.value.trim() ?? "";
    if (!snapshot && !createTitle) {
      toast("标题不能为空");
      return;
    }
    showCandidates(mode, createTitle);
  };
  const briefTitle = session.ctx.project.bookTitle?.trim() ?? "";
  if (options.skipBrief && options.mode && (snapshot || briefTitle)) showCandidates(options.mode, snapshot ? null : briefTitle);
  else showBrief();
}

function applyProposal(projectId, snapshot, shell, createTitle, explicitParent) {
  const rows = [...shell.overlay.querySelectorAll(".eg-candidate")].filter((row) => row.querySelector("input[type=checkbox]").checked);
  if (rows.length === 0) {
    toast("没有留下的项");
    return;
  }
  const drafted = rows.map((row) => ({
    tempId: row.dataset.temp,
    parentTempId: row.dataset.parentTemp || null,
    kind: row.dataset.kind,
    title: row.querySelector(".eg-candidate-title").value.trim(),
    summary: row.dataset.summary,
    structuralRole: row.dataset.role,
    narrativeFunction: row.dataset.fn,
    goal: row.dataset.goal,
    conflict: row.dataset.conflict,
    outcome: row.dataset.outcome,
    narrativeOrder: Number(row.dataset.order),
  }));
  if (drafted.some((item) => item.title === "")) {
    toast("留下的项需要标题");
    return;
  }
  let base = snapshot;
  if (!base) {
    const rootId = uid("node");
    base = {
      outline: {
        id: uid("outline"),
        title: createTitle,
        premise: session.ctx.project.description || "",
        theme: "",
        coreConflict: "",
        climaxSummary: "",
        endingIntent: "",
        status: "active",
        revision: 1,
      },
      nodes: [node({ id: rootId, parentId: null, kind: "arc", title: "全书", narrativeOrder: 1000, status: "draft" })],
      relations: [],
      mappings: [],
      participants: [],
      promises: [],
    };
  }
  const fallback = explicitParent || defaultParentId(base);
  const idMap = new Map();
  const maxOrder = base.nodes.reduce((max, item) => Math.max(max, item.narrativeOrder), 0);
  const byTemp = new Map(drafted.map((item) => [item.tempId, item]));
  const ordered = [];
  const seen = new Set();
  const visit = (item) => {
    if (!item || seen.has(item.tempId)) return;
    if (item.parentTempId && byTemp.has(item.parentTempId)) visit(byTemp.get(item.parentTempId));
    seen.add(item.tempId);
    ordered.push(item);
  };
  drafted.forEach(visit);
  const created = [];
  for (const item of ordered) {
    const id = uid("node");
    idMap.set(item.tempId, id);
    const parentId = item.parentTempId && idMap.get(item.parentTempId) ? idMap.get(item.parentTempId) : fallback;
    created.push(node({
      id,
      parentId,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      structuralRole: item.structuralRole,
      narrativeFunction: item.narrativeFunction,
      goal: item.goal,
      conflict: item.conflict,
      outcome: item.outcome,
      narrativeOrder: maxOrder + item.narrativeOrder,
      status: "draft",
    }));
  }
  const next = { ...base, outline: bump(base.outline), nodes: [...base.nodes, ...created] };
  if (!snapshot) next.outline.revision = 1;
  viewOf(projectId).selectedId = created.at(-1)?.id ?? viewOf(projectId).selectedId;
  publish(projectId, next);
  closeDialog();
  toast(snapshot ? "留下的候选已写入事件图" : "已建立事件图，并写入留下的候选");
}

function openCheck() {
  const projectId = session.projectId;
  const snapshot = snapshotOf(projectId);
  if (!snapshot) return;
  const shell = openShell({ title: "检查事件图", description: "先显示确定性结果。语义检查默认不跑。", wide: true });
  const paint = () => {
    const rules = collectIssues(snapshotOf(projectId));
    const suggestions = activeSemantic(projectId, snapshotOf(projectId));
    const stale = staleSemantic(projectId, snapshotOf(projectId));
    const blocks = [
      ["error", "错误", rules.filter((issue) => issue.severity === "error")],
      ["warning", "警告", rules.filter((issue) => issue.severity === "warning")],
      ["info", "提示", rules.filter((issue) => issue.severity === "info")],
    ];
    shell.body.innerHTML = `${blocks.map(([key, title, items]) => `<section class="eg-check-block"><h3>${title}${items.length ? ` · ${items.length}` : ""}</h3>${items.length ? items.map((issue) => issueLine(issue, false)).join("") : `<p class="eg-muted">无</p>`}</section>`).join("")}<section class="eg-check-block"><h3>建议</h3>${suggestions.length ? suggestions.map((issue) => issueLine(issue, true)).join("") : `<p class="eg-muted">还没有跑语义检查。</p>`}${stale.length ? `<p class="eg-muted">已过期 ${stale.length} 条。节点改过之后，这些建议不再当作当前事实。</p>` : ""}</section>`;
  };
  const issueLine = (issue, suggestion) => `<article class="eg-issue"><b class="sev-${issue.severity}">${suggestion ? "建议" : label([["error", "错误"], ["warning", "警告"], ["info", "提示"]], issue.severity)}</b><p>${esc(issue.message)}</p>${issue.nodeId ? `<button type="button" data-eg="locate" data-node="${esc(issue.nodeId)}">定位</button>` : ""}</article>`;
  shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="semantic">语义检查</button><button class="dialog-primary" type="button" data-eg="close">关闭</button>`;
  shell.handlers.semantic = () => {
    const current = snapshotOf(projectId);
    const target = findNode(current, "n-echo") ?? current.nodes.find((item) => isLeaf(current, item.id));
    const issue = {
      id: uid("semantic"),
      nodeId: target?.id ?? null,
      severity: "info",
      source: "ai",
      message: "旧照片和后文的关联偏间接，读者可能看不出铺设指向哪里。这不是结构错误。",
      checkedRevision: target?.revision ?? current.outline.revision,
    };
    semantics.set(projectId, [...(semantics.get(projectId) ?? []).filter((item) => item.source !== "ai" || item.message !== issue.message), issue]);
    paint();
    session.render();
    toast("语义结果已单独列出，不会写成结构损坏");
  };
  shell.handlers.locate = (button) => {
    closeDialog();
    viewOf(projectId).selectedId = button.dataset.node;
    session.root.classList.add("inspector-open");
    session.render();
  };
  paint();
}

function openDelete(nodeId) {
  const projectId = session.projectId;
  const snapshot = snapshotOf(projectId);
  const node = findNode(snapshot, nodeId);
  if (!node) return;
  const ids = new Set(descendantIds(snapshot, nodeId));
  const children = snapshot.nodes.filter((item) => ids.has(item.id) && item.id !== nodeId);
  const relations = snapshot.relations.filter((item) => ids.has(item.sourceNodeId) || ids.has(item.targetNodeId));
  const mappings = snapshot.mappings.filter((item) => ids.has(item.nodeId));
  const promises = snapshot.promises.filter((item) => [item.setupNodeId, item.triggerNodeId, item.payoffNodeId].some((id) => id && ids.has(id)));
  const shell = openShell({ title: `删除「${node.title}」？`, description: "章节正文会保留。", wide: true });
  const list = (title, values) => `<section><h3>${title}</h3>${values.length ? `<ul>${values.map((value) => `<li>${esc(value)}</li>`).join("")}</ul>` : `<p class="eg-muted">无</p>`}</section>`;
  shell.body.innerHTML = `<div class="eg-delete-grid">${list(`子节点 ${children.length}`, children.map((item) => item.title))}${list(`关系 ${relations.length}`, relations.map((item) => item.description || label(RELATIONS, item.type)))}${list(`章节映射 ${mappings.length}`, mappings.map((item) => `${findNode(snapshot, item.nodeId)?.title ?? ""} → ${chapterName(session.ctx, item.chapterId)}`))}${list(`承诺 ${promises.length}`, promises.map((item) => item.title))}</div>`;
  shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="close">取消</button><button class="dialog-primary danger" type="button" data-eg="confirm-delete">删除节点</button>`;
  shell.handlers["confirm-delete"] = () => {
    const view = viewOf(projectId);
    if (ids.has(view.selectedId)) view.selectedId = node.parentId && !ids.has(node.parentId) ? node.parentId : snapshot.nodes.find((item) => !ids.has(item.id))?.id ?? null;
    mutate(projectId, (current) => ({
      ...current,
      outline: bump(current.outline),
      nodes: current.nodes.filter((item) => !ids.has(item.id)),
      relations: current.relations.filter((item) => !ids.has(item.sourceNodeId) && !ids.has(item.targetNodeId)),
      mappings: current.mappings.filter((item) => !ids.has(item.nodeId)),
      participants: current.participants.filter((item) => !ids.has(item.nodeId)),
      promises: current.promises.map((item) => ({
        ...item,
        setupNodeId: ids.has(item.setupNodeId) ? null : item.setupNodeId,
        triggerNodeId: ids.has(item.triggerNodeId) ? null : item.triggerNodeId,
        payoffNodeId: ids.has(item.payoffNodeId) ? null : item.payoffNodeId,
      })),
    }));
    closeDialog();
    toast("节点已删除，章节正文仍在");
  };
}

function openMap(nodeId) {
  const projectId = session.projectId;
  const snapshot = snapshotOf(projectId);
  const node = findNode(snapshot, nodeId);
  if (!node || !isLeaf(snapshot, node.id)) {
    toast("只有叶子可以放入章节");
    return;
  }
  const chapters = readingChapters(session.ctx);
  const mapping = snapshot.mappings.find((item) => item.nodeId === node.id);
  const shell = openShell({ title: "放入章节", description: "只建立映射，不改章节标题。" });
  if (chapters.length === 0) {
    shell.body.innerHTML = `<p>这本书还没有章节。先到书籍工作区新建一章。</p>`;
    shell.footer.innerHTML = `<button class="dialog-primary" type="button" data-eg="close">关闭</button>`;
    return;
  }
  const groups = new Map();
  for (const chapter of chapters) groups.set(chapter.volume, [...(groups.get(chapter.volume) ?? []), chapter]);
  shell.body.innerHTML = `${mapping ? `<p>当前在${esc(chapterName(session.ctx, mapping.chapterId))}。换到其他章之前，要先解除映射。</p>` : `<p>选择要放入的章节。</p>`}${[...groups].map(([volume, items]) => `<section class="eg-volume-map"><h3>${esc(volume)}</h3>${items.map((chapter) => `<button type="button" data-eg="map-to" data-chapter-id="${esc(chapter.id)}" ${mapping && mapping.chapterId !== chapter.id ? "disabled" : ""}>${esc(`第 ${chapter.number} 章 · ${chapter.title}`)}</button>`).join("")}</section>`).join("")}`;
  shell.footer.innerHTML = `${mapping ? `<button class="dialog-secondary" type="button" data-eg="unmap">解除映射</button>` : ""}<button class="dialog-primary" type="button" data-eg="close">关闭</button>`;
  shell.handlers["map-to"] = (button) => {
    const chapterId = button.dataset.chapterId;
    const existing = snapshot.mappings.find((item) => item.nodeId === node.id);
    if (existing?.chapterId === chapterId) {
      closeDialog();
      return;
    }
    if (existing) {
      toast("叶子重复映射");
      return;
    }
    mutate(projectId, (current) => ({
      ...current,
      outline: bump(current.outline),
      mappings: [...current.mappings, { chapterId, nodeId: node.id, sortOrder: current.mappings.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1000, coverageStatus: "planned" }],
    }));
    closeDialog();
    toast(`已映射到${chapterName(session.ctx, chapterId)}，章节标题未改`);
  };
  shell.handlers.unmap = () => {
    mutate(projectId, (current) => ({ ...current, outline: bump(current.outline), mappings: current.mappings.filter((item) => item.nodeId !== node.id) }));
    closeDialog();
    toast("已解除映射，章节仍在");
  };
}

function openHandoff(ctx, chapterId, initialSelection) {
  const chapter = ctx.chapters[chapterId];
  if (!chapter) {
    ctx.onToast?.("先打开一章，再读取事件图主线");
    return;
  }
  const shell = openShell({ title: `第 ${chapter.number} 章的写作主线`, description: chapter.title, wide: true });
  const accepted = snapshotOf(ctx.projectId) ? acceptedLeaves(snapshotOf(ctx.projectId), chapterId) : [];
  const selected = new Set(initialSelection ?? accepted.map((node) => node.id));
  let mode = "append";
  const paint = () => {
    const model = handoffModel(ctx, chapterId, selected);
    const leafBoxes = accepted.map((node) => `<label class="eg-check-leaf"><input type="checkbox" data-leaf="${esc(node.id)}" ${selected.has(node.id) ? "checked" : ""}>${esc(node.title)}<small>已确认</small></label>`).join("");
    if (model.status === "waived") {
      shell.body.innerHTML = `<pre class="eg-instruction">${esc(model.instruction)}</pre><label class="eg-field">写作方式<select name="write-mode"><option value="append" ${mode === "append" ? "selected" : ""}>续写</option><option value="rewrite" ${mode === "rewrite" ? "selected" : ""}>重写</option></select></label>`;
      shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="close">关闭</button><button class="dialog-primary" type="button" data-eg="write">启用写作</button>`;
      return;
    }
    if (model.status === "too-large") {
      shell.body.innerHTML = `<p>硬约束超过 4000 字，写不进指令。缩短主题、冲突、结局或叶子上的目标之后再试。</p>`;
      shell.footer.innerHTML = `<button class="dialog-primary" type="button" data-eg="close">关闭</button>`;
      return;
    }
    if (model.status === "missing") {
      const copy = model.reason === "no-outline" ? "这本书还没有事件图。" : model.reason === "none-checked" ? "你取消了全部已确认叶子。" : "这一章还没有已确认、并且映射到本章的叶子。";
      const drafts = (model.mappedDrafts ?? []).map((node) => `「${node.title}」仍是${label(STATUSES, node.status)}，不会进入主线。`).join("");
      shell.body.innerHTML = `<p>${esc(copy)}</p>${model.reason === "none-checked" ? leafBoxes : ""}${drafts ? `<p class="eg-muted">${esc(drafts)}</p>` : ""}<p class="eg-muted">先生成事件图会打开一份候选，接受之前不会写作。仍然写作会标明这次没有主线。</p>`;
      shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="generate">先生成事件图</button><button class="dialog-primary" type="button" data-eg="waive">仍然写作</button>`;
      return;
    }
    shell.body.innerHTML = `<p class="eg-kicker">来自事件图 · 修订 ${model.revision}</p><section><h3>将写的叶子</h3>${leafBoxes}${(model.mappedDrafts ?? []).map((node) => `<p class="eg-check-leaf is-disabled">${esc(node.title)}<small>${esc(label(STATUSES, node.status))}，默认不写</small></p>`).join("")}</section>${model.next ? `<section><h3>下一叶子</h3><p>${esc(model.next.title)} · 只用于过渡，不得展开</p></section>` : ""}<section><h3>未纳入本次写作</h3>${model.excluded.length ? model.excluded.map((item) => `<p>${esc(item.promise.title)} · ${esc(item.reason)}</p>`).join("") : `<p class="eg-muted">无</p>`}</section><p class="eg-muted">检索证据：没有命中。主线 ${model.used} / 4000 字。</p><details class="eg-raw"><summary>交给写作的主线文本</summary><pre class="eg-instruction">${esc(model.instruction)}</pre></details><label class="eg-field">写作方式<select name="write-mode"><option value="append" ${mode === "append" ? "selected" : ""}>续写</option><option value="rewrite" ${mode === "rewrite" ? "selected" : ""}>重写</option></select></label><p class="eg-muted">启用写作会把这份文本交给章节写作。原型不生成正文，也不提前把叶子改成写作中。</p>`;
    shell.footer.innerHTML = `<button class="dialog-secondary" type="button" data-eg="close">关闭</button><button class="dialog-primary" type="button" data-eg="write">启用写作</button>`;
  };
  shell.overlay.addEventListener("change", (event) => {
    if (event.target.dataset.leaf) {
      if (event.target.checked) selected.add(event.target.dataset.leaf);
      else selected.delete(event.target.dataset.leaf);
      paint();
    }
    if (event.target.name === "write-mode") mode = event.target.value;
  });
  shell.handlers.generate = () => {
    closeDialog();
    ctx.onGenerate?.();
  };
  shell.handlers.waive = () => {
    const snapshot = snapshotOf(ctx.projectId);
    waivers.set(`${ctx.projectId}:${chapterId}`, snapshot?.outline.revision ?? null);
    paint();
    ctx.onToast?.("本章改为没有事件主线。大纲修订变化后需要重新选择。");
  };
  shell.handlers.write = () => {
    const model = handoffModel(ctx, chapterId, selected);
    closeDialog();
    if (model.status === "waived") ctx.onToast?.(`已按放弃主线准备${mode === "rewrite" ? "重写" : "续写"}。原型不生成正文。`);
    else ctx.onToast?.(`主线已准备好${mode === "rewrite" ? "重写" : "续写"}。原型不生成正文，叶子仍保持现在的状态。`);
  };
  paint();
}

function openProfile() {
  const snapshot = snapshotOf(session.projectId);
  if (!snapshot) return;
  const outline = snapshot.outline;
  openDialog({
    title: "事件图设定",
    description: "这些内容会进入写作主线的硬约束。标题必填。",
    fields: [
      { name: "title", label: "标题", value: outline.title },
      { name: "premise", label: "前提", value: outline.premise, required: false },
      { name: "theme", label: "主题", value: outline.theme, required: false },
      { name: "coreConflict", label: "核心冲突", value: outline.coreConflict, required: false },
      { name: "climaxSummary", label: "高潮", value: outline.climaxSummary, required: false },
      { name: "endingIntent", label: "结局", value: outline.endingIntent, required: false },
    ],
    confirmLabel: "保存设定",
    onConfirm: (values) => {
      if (!values.title.trim()) return false;
      mutate(session.projectId, (current) => ({ ...current, outline: { ...bump(current.outline), ...values, title: values.title.trim() } }));
      toast("事件图设定已保存");
    },
  });
}

function openCreate() {
  openDialog({
    title: "手动建立事件图",
    description: "必填只有标题。保存后出现根节点「全书」。",
    fields: [
      { name: "title", label: "标题", value: session.ctx.project.bookTitle || "" },
      { name: "premise", label: "前提", value: session.ctx.project.description || "", required: false },
    ],
    confirmLabel: "建立",
    onConfirm: (values) => {
      const title = values.title.trim();
      if (!title) return false;
      const rootId = uid("node");
      const snapshot = {
        outline: { id: uid("outline"), title, premise: values.premise.trim(), theme: "", coreConflict: "", climaxSummary: "", endingIntent: "", status: "active", revision: 1 },
        nodes: [node({ id: rootId, parentId: null, kind: "arc", title: "全书", narrativeOrder: 1000, status: "draft" })],
        relations: [],
        mappings: [],
        participants: [],
        promises: [],
      };
      viewOf(session.projectId).selectedId = rootId;
      publish(session.projectId, snapshot);
      toast("已建立事件图");
    },
  });
}

function nodeOption(snapshot, item) {
  const duplicated = snapshot.nodes.filter((node) => node.title === item.title).length > 1;
  return duplicated ? `${item.title}（${item.id}）` : item.title;
}

function moveNode(dir) {
  const projectId = session.projectId;
  const view = viewOf(projectId);
  mutate(projectId, (current) => {
    const node = findNode(current, view.selectedId);
    if (!node) return null;
    const siblings = childrenOf(current, node.parentId);
    const index = siblings.findIndex((item) => item.id === node.id);
    const target = index + dir;
    if (target < 0 || target >= siblings.length) return null;
    const next = siblings.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    const orders = new Map(next.map((entry, entryIndex) => [entry.id, (entryIndex + 1) * 1000]));
    return { ...current, outline: bump(current.outline), nodes: current.nodes.map((entry) => orders.has(entry.id) ? { ...entry, narrativeOrder: orders.get(entry.id), revision: entry.revision + 1 } : entry) };
  });
}

function shiftSort(dir) {
  const projectId = session.projectId;
  const nodeId = viewOf(projectId).selectedId;
  mutate(projectId, (current) => {
    const mapping = current.mappings.find((item) => item.nodeId === nodeId);
    if (!mapping) return null;
    const group = current.mappings.filter((item) => item.chapterId === mapping.chapterId).sort((left, right) => left.sortOrder - right.sortOrder);
    const index = group.findIndex((item) => item.nodeId === nodeId);
    const target = index + dir;
    if (target < 0 || target >= group.length) return null;
    const next = group.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    const orders = new Map(next.map((entry, entryIndex) => [entry.nodeId, (entryIndex + 1) * 1000]));
    return { ...current, outline: bump(current.outline), mappings: current.mappings.map((entry) => orders.has(entry.nodeId) ? { ...entry, sortOrder: orders.get(entry.nodeId) } : entry) };
  });
}

function onClick(event) {
  const button = event.target.closest("[data-eg]");
  if (!button || !session.root.contains(button)) return;
  event.stopPropagation();
  const projectId = session.projectId;
  const view = viewOf(projectId);
  const action = button.dataset.eg;
  if (action === "select") {
    view.selectedId = button.dataset.node;
    if (window.matchMedia("(max-width: 1180px)").matches) session.root.classList.add("inspector-open");
    if (window.matchMedia("(max-width: 860px)").matches) session.root.classList.remove("tree-open");
    render();
  }
  if (action === "set-view") {
    view.mode = button.dataset.view;
    render();
  }
  if (action === "toggle-filters") {
    view.filtersOpen = !view.filtersOpen;
    render();
  }
  if (action === "filter") {
    view.filters[button.dataset.filter] = !view.filters[button.dataset.filter];
    render();
  }
  if (action === "toggle-tree") {
    session.root.classList.toggle("tree-open");
    render();
  }
  if (action === "toggle-inspector") {
    session.root.classList.toggle("inspector-open");
    render();
  }
  if (action === "check") openCheck();
  if (action === "expand") openPropose({ expand: true, parentId: view.selectedId });
  if (action === "propose") openPropose();
  if (action === "create") openCreate();
  if (action === "profile") openProfile();
  if (action === "move") moveNode(Number(button.dataset.dir));
  if (action === "sort") shiftSort(Number(button.dataset.dir));
  if (action === "map") openMap(view.selectedId);
  if (action === "handoff") {
    const mapping = snapshotOf(projectId)?.mappings.find((item) => item.nodeId === view.selectedId);
    if (mapping) openHandoff(session.ctx, mapping.chapterId);
  }
  if (action === "coverage") {
    const snapshot = snapshotOf(projectId);
    const node = findNode(snapshot, view.selectedId);
    if (!node) return;
    semantics.set(projectId, [...(semantics.get(projectId) ?? []), {
      id: uid("coverage"),
      nodeId: node.id,
      severity: "info",
      source: "ai",
      message: `建议：写到「${node.title}」。这不是结构错误，也不会把节点标成已覆盖。`,
      checkedRevision: node.revision,
    }]);
    render();
    toast("覆盖检查只添加建议，节点状态没有变");
  }
  if (action === "delete") openDelete(view.selectedId);
  if (action === "promise") setPromiseStatus(button.dataset.id, button.dataset.status);
  if (action === "add-promise") addPromise();
  if (action === "add-participant") addParticipant();
  if (action === "remove-participant") removeParticipant(Number(button.dataset.index));
  if (action === "add-relation") addRelation();
  if (action === "remove-relation") {
    mutate(projectId, (current) => ({ ...current, outline: bump(current.outline), relations: current.relations.filter((item) => item.id !== button.dataset.id) }));
  }
}

function setPromiseStatus(promiseId, status) {
  const apply = (reason) => mutate(session.projectId, (current) => ({
    ...current,
    outline: bump(current.outline),
    promises: current.promises.map((promise) => promise.id === promiseId ? { ...promise, status, statusReason: reason } : promise),
  }));
  if (status === "eligible" || status === "paid_off") {
    openDialog({
      title: status === "paid_off" ? "标成已兑现" : "标成可兑现",
      description: "需要一句理由。理由记在状态说明里，不会改铺设说明。",
      fields: [{ name: "reason", label: "理由" }],
      confirmLabel: "保存状态",
      onConfirm: ({ reason }) => {
        if (!reason.trim()) return false;
        apply(reason.trim());
        toast("承诺状态已更新");
      },
    });
    return;
  }
  const current = snapshotOf(session.projectId)?.promises.find((promise) => promise.id === promiseId);
  apply(current?.statusReason ?? "");
}

function addPromise() {
  const nodeId = viewOf(session.projectId).selectedId;
  openDialog({
    title: "添加承诺",
    description: "新承诺从「计划」开始，铺设节点是当前事件。",
    fields: [
      { name: "title", label: "标题" },
      { name: "setup", label: "铺设", required: false },
      { name: "triggerCondition", label: "触发条件", required: false },
      { name: "payoffRequirement", label: "兑现要求", required: false },
    ],
    confirmLabel: "添加",
    onConfirm: (values) => {
      if (!values.title.trim()) return false;
      mutate(session.projectId, (current) => ({
        ...current,
        outline: bump(current.outline),
        promises: [...current.promises, { id: uid("promise"), title: values.title.trim(), setup: values.setup.trim(), triggerCondition: values.triggerCondition.trim(), payoffRequirement: values.payoffRequirement.trim(), status: "planned", setupNodeId: nodeId, triggerNodeId: null, payoffNodeId: null, notes: "", statusReason: "" }],
      }));
    },
  });
}

function addParticipant() {
  const nodeId = viewOf(session.projectId).selectedId;
  openDialog({
    title: "添加人物",
    description: "名字不能为空。这里只记录名字和状态。",
    fields: [
      { name: "name", label: "名字" },
      { name: "role", label: "角色", type: "select", options: PEOPLE.map(([, text]) => text) },
      { name: "before", label: "事件前状态", required: false },
      { name: "after", label: "事件后变化", required: false },
    ],
    confirmLabel: "加入",
    onConfirm: (values) => {
      const name = values.name.trim();
      if (!name) return false;
      const role = PEOPLE.find(([, text]) => text === values.role)?.[0] ?? "mentioned";
      mutate(session.projectId, (current) => ({
        ...current,
        outline: bump(current.outline),
        nodes: current.nodes.map((item) => item.id === nodeId ? { ...item, revision: item.revision + 1 } : item),
        participants: [...current.participants, { nodeId, participantName: name, role, stateBefore: values.before.trim(), stateAfter: values.after.trim() }],
      }));
    },
  });
}

function removeParticipant(index) {
  const nodeId = viewOf(session.projectId).selectedId;
  mutate(session.projectId, (current) => {
    const own = current.participants.filter((item) => item.nodeId === nodeId);
    const target = own[index];
    if (!target) return null;
    return {
      ...current,
      outline: bump(current.outline),
      nodes: current.nodes.map((item) => item.id === nodeId ? { ...item, revision: item.revision + 1 } : item),
      participants: current.participants.filter((item) => item !== target),
    };
  });
}

function addRelation() {
  const snapshot = snapshotOf(session.projectId);
  const sourceId = viewOf(session.projectId).selectedId;
  const choices = snapshot.nodes.filter((item) => item.id !== sourceId);
  if (choices.length === 0) {
    toast("没有其他节点可关联");
    return;
  }
  openDialog({
    title: "添加关系",
    description: "不能指向自己。倒叙例外会放过顺序颠倒的警告。",
    fields: [
      { name: "target", label: "目标节点", type: "select", options: choices.map((item) => nodeOption(snapshot, item)) },
      { name: "type", label: "关系", type: "select", options: RELATIONS.map(([, text]) => text) },
      { name: "description", label: "一句说明", required: false },
      { name: "exception", label: "叙述顺序例外", type: "select", options: ["否", "是"] },
    ],
    confirmLabel: "添加",
    onConfirm: (values) => {
      const target = choices.find((item) => nodeOption(snapshot, item) === values.target);
      if (!target || target.id === sourceId) return false;
      const type = RELATIONS.find(([, text]) => text === values.type)?.[0] ?? "causes";
      mutate(session.projectId, (current) => ({
        ...current,
        outline: bump(current.outline),
        relations: [...current.relations, { id: uid("rel"), sourceNodeId: sourceId, targetNodeId: target.id, type, description: values.description.trim(), orderException: values.exception === "是" }],
      }));
    },
  });
}

function onFocusOut(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !input.dataset.field) return;
  saveField(input);
}

function onChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLSelectElement) || !input.dataset.field) return;
  saveField(input);
}

function onKey(event) {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const rows = [...session.root.querySelectorAll(".eg-tree-row")];
  const ids = rows.map((row) => row.dataset.node);
  const view = viewOf(session.projectId);
  const index = ids.indexOf(view.selectedId);
  const next = ids[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  view.selectedId = next;
  render();
}

export function queueEventGraphAction(action) {
  queue = action;
}

export function mountEventGraph(root, ctx) {
  ensure(ctx.projectId);
  session = { root, ctx, projectId: ctx.projectId, render };
  root.addEventListener("click", onClick);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("change", onChange);
  root.addEventListener("keydown", onKey);
  render();
  const pending = queue;
  queue = null;
  if (pending?.type === "propose") openPropose({ mode: pending.mode, parentId: pending.parentId, skipBrief: pending.skipBrief });
}

export function openChapterHandoff(ctx) {
  ensure(ctx.projectId);
  openHandoff(ctx, ctx.chapterId);
}
