const PARENTS = {
  E5: { name: "二十年互救", fill: "#f8f1e4" },
  E2: { name: "交出铜哨", fill: "#f8eadf" },
  E1: { name: "北坡遇伏", fill: "#e7eef8" },
  E3: { name: "山脊揭穿", fill: "#f1edff" },
  E4: { name: "拖出包围", fill: "#e7f4ec" },
};

const FN = { action: "动作", dialogue: "对话", exposition: "说明", relationship: "关系", mystery: "悬念", transition: "过渡", mixed: "混合" };
const ROLE = { setup: "铺垫", turning_point: "转折", crisis: "危机", rising_action: "上升", falling_action: "下降", resolution: "结局", climax: "高潮", custom: "高层" };
const SUBS = [
  { id: "5.1", parent: "E5", name: "挡白刃", story: 0, narrative: 3, chapter: "第 2 章", shape: "process", fn: "action", role: "setup", timeText: "从军第一年冬", locationText: "河谷窄路", people: "沈衡、梁秋", goal: "挡住砍向梁秋的刀", conflict: "敌军已贴到身侧", outcome: "沈衡受伤，梁秋活下来", summary: "沈衡为梁秋挡过一次白刃" },
  { id: "5.2", parent: "E5", name: "拽上岸", story: 1, narrative: 4, chapter: "第 2 章", shape: "process", fn: "action", role: "setup", timeText: "从军第三年夏", locationText: "渡口下游", people: "梁秋、沈衡", goal: "把落水的沈衡拉上来", conflict: "水流和装备往下拖", outcome: "沈衡被拽上岸", summary: "梁秋把沈衡从河里拽上来" },
  { id: "2.1", parent: "E2", name: "撕下西坡", story: 2, narrative: 5, chapter: "第 2 章", shape: "data", fn: "exposition", role: "turning_point", timeText: "伏击前夜", locationText: "营地灯下", people: "梁秋", goal: "拆走西坡路线", conflict: "地图是两人共用的", outcome: "西坡那一页离开地图", summary: "西坡页被撕下" },
  { id: "2.2", parent: "E2", name: "交出铜哨", story: 3, narrative: 6, chapter: "第 2 章", shape: "data", fn: "action", role: "turning_point", timeText: "伏击前夜稍后", locationText: "营地外", people: "梁秋、接头人", goal: "交出铜哨和口令", conflict: "口令一旦交出，西侧就有接应", outcome: "铜哨离手", summary: "铜哨和口令交给接头人" },
  { id: "1.1", parent: "E1", name: "西侧枪声", story: 4, narrative: 0, chapter: "第 1 章", shape: "process", fn: "action", role: "crisis", timeText: "入夜后", locationText: "北坡密林", people: "沈衡、梁秋、敌军", goal: "活过第一轮射击", conflict: "枪从西侧来", outcome: "两人尚未倒下", summary: "第一轮射击来自西侧" },
  { id: "1.2", parent: "E1", name: "按进壕沟", story: 5, narrative: 1, chapter: "第 1 章", shape: "process", fn: "relationship", role: "crisis", timeText: "同一夜", locationText: "北坡密林壕沟", people: "沈衡、梁秋", goal: "把梁秋按进掩护", conflict: "沈衡仍把他当战友", outcome: "梁秋被护住", summary: "沈衡仍按战友来保护他" },
  { id: "1.3", parent: "E1", name: "慢半步", story: 6, narrative: 9, chapter: "第 3 章", shape: "prepare", fn: "mystery", role: "turning_point", timeText: "换弹的间隙", locationText: "壕沟内", people: "梁秋、沈衡", goal: "让西侧射击落到预定处", conflict: "梁秋知道枪声会来", outcome: "慢了半步，人还活着", summary: "这一拍先藏住，第 3 章才补上" },
  { id: "3.1", parent: "E3", name: "发现缺页", story: 7, narrative: 7, chapter: "第 3 章", shape: "data", fn: "exposition", role: "rising_action", timeText: "次日黄昏", locationText: "偏僻山脊", people: "沈衡", goal: "核对撤退地图", conflict: "西坡那一页不在", outcome: "缺页被看见", summary: "缺页对上被撕下的西坡", participants: [{ name: "沈衡", role: "焦点", before: "刚上山脊", after: "看见地图缺页" }] },
  { id: "3.0", parent: "E3", name: "空弹夹落地", story: 8, narrative: 2, chapter: "第 1 章", shape: "note", fn: "mystery", role: "rising_action", timeText: "次日黄昏", locationText: "偏僻山脊", people: "无主动参与者", goal: "先把空弹夹送进画面", conflict: "此时还对不上枪声和铜哨", outcome: "物件出现，原因留到对上口令", summary: "第 1 章读到的是这一叶子，不是残缺的对上口令", participants: [] },
  { id: "3.2", parent: "E3", name: "对上口令", story: 9, narrative: 8, chapter: "第 3 章", shape: "display", fn: "mystery", role: "climax", timeText: "次日黄昏", locationText: "偏僻山脊", people: "沈衡、梁秋", goal: "确认铜哨和口令是同一件事", conflict: "空弹夹、铜哨、西侧枪声要对上", outcome: "背叛被证明", summary: "兑现空弹夹那条承诺", participants: [{ name: "沈衡", role: "焦点", before: "已看见缺页和空弹夹", after: "确认是梁秋交出的口令" }, { name: "梁秋", role: "主动", before: "铜哨已不在身上", after: "被当场对上" }] },
  { id: "3.3", parent: "E3", name: "问他走不走", story: 10, narrative: 10, chapter: "第 3 章", shape: "display", fn: "dialogue", role: "climax", timeText: "揭穿之后", locationText: "山脊", people: "沈衡、梁秋", goal: "把走或不走交给梁秋", conflict: "揭穿已完成，人还在", outcome: "选择权交到下一拍", summary: "对话，后面仍只有一条故事序", participants: [{ name: "沈衡", role: "焦点", before: "已经揭穿", after: "把选择说出口" }, { name: "梁秋", role: "主动", before: "被对上口令", after: "听到要不要自己走" }] },
  { id: "4.1", parent: "E4", name: "拖下坡", story: 11, narrative: 11, chapter: "第 3 章", shape: "process", fn: "action", role: "falling_action", timeText: "揭穿之后", locationText: "山脊向下的坡道", people: "沈衡、梁秋", goal: "把人带出包围", conflict: "救助还在，战友关系已经分开", outcome: "人被拖着离开", summary: "动作是救助", participants: [{ name: "沈衡", role: "焦点", before: "问完走不走", after: "抓住腕子下坡" }, { name: "梁秋", role: "主动", before: "受伤留在山脊", after: "被拖离包围" }] },
  { id: "4.2", parent: "E4", name: "只叫名字", story: 12, narrative: 12, chapter: "第 3 章", shape: "terminator", fn: "relationship", role: "resolution", timeText: "下坡途中", locationText: "坡道", people: "沈衡、梁秋", goal: "取消战友称呼", conflict: "人还在手里，称呼不能回去", outcome: "只剩名字，关系终止", summary: "与按进壕沟对照", participants: [{ name: "沈衡", role: "焦点", before: "仍可能叫战友", after: "只叫梁秋" }, { name: "梁秋", role: "主动", before: "被拖着", after: "不再被称作战友" }] },
];
const SHAPES = {
  terminator: { w: 168, h: 92 },
  process: { w: 168, h: 96 },
  decision: { w: 188, h: 118 },
  data: { w: 180, h: 96 },
  prepare: { w: 184, h: 100 },
  display: { w: 176, h: 100 },
  note: { w: 160, h: 108 },
  subroutine: { w: 200, h: 110 },
};
const STEP = 214;
const RELATIONS = [
  { from: "2.2", to: "1.1", type: "causes", label: "因果：交出的口令导致西侧枪声" },
  { from: "2.1", to: "1.3", type: "causes", label: "因果：撕页导致知道西侧会开枪" },
  { from: "5.1", to: "4.1", type: "causes", label: "因果：挡刀仍是拖人的原因" },
  { from: "2.2", to: "3.2", type: "requires", label: "前置：对口令之前铜哨必须已经交出" },
  { from: "2.1", to: "3.1", type: "reveals", label: "揭示：缺页对上被撕下的西坡" },
  { from: "3.0", to: "3.2", type: "foreshadows", label: "伏笔：空弹夹在对口令时兑现" },
  { from: "1.2", to: "4.2", type: "contrasts", label: "对照：当时仍当战友，此刻只叫名字" },
];
const PROMISE = { name: "空弹夹", seed: "3.0", trigger: "3.1", payoff: "3.2", setup: "第 1 章只让物件出现", triggerText: "黄昏核对地图时它还没被解释", payoffText: "口令、铜哨和西侧枪声收成一件事", status: "已铺设" };
const RELATION_NAME = { causes: "因果", requires: "前置", reveals: "揭示", foreshadows: "伏笔", contrasts: "对照", contains: "包含" };

function shapeOf(node) {
  return SHAPES[node.shape] || SHAPES.process;
}

const state = {
  nln: true,
  handoff: "all",
  layers: { contains: true, narrative: true, causes: false, requires: false, reveals: false, foreshadows: true, contrasts: false },
  selected: "3.0",
  x: 48,
  y: 36,
  scale: 0.9,
  fitted: false,
};

const dragged = {};
let current = null;
let dragNode = null;

const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const edgesSvg = document.getElementById("edges");
const nodesEl = document.getElementById("nodes");

function subById(id) {
  return SUBS.find((node) => node.id === id);
}

function place(node, x, y) {
  const moved = dragged[node.id];
  node.homeX = x;
  node.homeY = y;
  node.x = moved ? moved.x : x;
  node.y = moved ? moved.y : y;
}

function readingOrder(node) {
  return state.nln ? node.narrative : node.story;
}

function build() {
  const leaves = SUBS.map((node) => ({ ...node, kind: "leaf", status: "已确认", participants: node.participants || [] }));
  const baseline = 520;
  leaves.forEach((node) => {
    const box = shapeOf(node);
    node.w = box.w;
    node.h = box.h;
    place(node, 48 + node.story * STEP, baseline - box.h / 2);
  });
  const parentFacts = {
    E5: { timeText: "从军至今", locationText: "多处战场", goal: "彼此活下来", conflict: "多次险死", outcome: "两人还在" },
    E2: { timeText: "伏击前夜", locationText: "营地外", goal: "把西坡路线交出去", conflict: "路线交出后西侧会开枪", outcome: "铜哨和缺页成为证据" },
    E1: { timeText: "入夜后", locationText: "北坡密林", goal: "活过这一夜", conflict: "伏击来自事先交出的方向", outcome: "两人幸存" },
    E3: { timeText: "次日黄昏", locationText: "偏僻山脊", goal: "确认谁交出了路线", conflict: "证据必须指回泄密", outcome: "背叛被揭穿" },
    E4: { timeText: "揭穿之后", locationText: "坡道", goal: "离开包围圈", conflict: "人被带走，称呼取消", outcome: "救助完成，关系终止" },
  };
  const parents = Object.keys(PARENTS).map((id) => {
    const children = leaves.filter((leaf) => leaf.parent === id);
    const box = SHAPES.subroutine;
    const x = children.reduce((sum, leaf) => sum + leaf.homeX, 0) / children.length;
    const node = { id, parent: id, name: PARENTS[id].name, kind: "arc", shape: "subroutine", chapter: "故事弧", fn: "mixed", role: "custom", people: "沈衡、梁秋", summary: "祖先约束，不单独写成正文", status: "已确认", w: box.w, h: box.h, ...parentFacts[id] };
    place(node, x, 24);
    return node;
  });
  const contains = leaves.map((leaf) => ({ from: leaf.parent, to: leaf.id, type: "contains", kind: "contains", label: "包含" }));
  const relations = RELATIONS.map((edge) => ({ ...edge, kind: edge.type, storySpan: Math.abs(subById(edge.from).story - subById(edge.to).story) }));
  const ordered = leaves.slice().sort((a, b) => a.story - b.story);
  const storyEdges = ordered.slice(1).map((node, index) => ({ from: ordered[index].id, to: node.id, kind: "story", label: "故事序" }));
  const narrative = leaves.slice().sort((a, b) => readingOrder(a) - readingOrder(b));
  const narrativeEdges = state.nln ? narrative.slice(1).map((node, index) => {
    const from = narrative[index];
    const jump = node.story - from.story;
    return { from: from.id, to: node.id, kind: "narrative", label: jump < 0 ? "倒叙" : jump > 1 ? "预叙" : "叙事序", storySpan: Math.abs(jump) };
  }) : [];
  const focus = handoffIds(leaves, narrative);
  [...parents, ...leaves].forEach((node) => {
    node.dim = focus ? !focus.has(node.id) : false;
    node.transition = focus ? node.id === focus.transition : false;
  });
  return { nodes: parents.concat(leaves), leaves, contains, relations, storyEdges, narrativeEdges, width: 80 + 12 * STEP + 80, height: 860, focus };
}

function handoffIds(leaves, narrative) {
  if (state.handoff === "all") return null;
  const chapter = `第 ${state.handoff} 章`;
  const mine = narrative.filter((node) => node.chapter === chapter);
  const last = mine[mine.length - 1];
  const next = narrative[narrative.indexOf(last) + 1];
  const ids = new Set(mine.map((node) => node.id));
  mine.forEach((node) => ids.add(node.parent));
  if (next) ids.add(next.id);
  const focus = ids;
  focus.transition = next ? next.id : "";
  return focus;
}

function centerOf(node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function shapeSvg(node) {
  const w = node.w;
  const h = node.h;
  const stroke = node.rejected ? 'stroke-dasharray="5 4"' : "";
  const common = `fill="var(--fill)" stroke="currentColor" stroke-width="1.6" ${stroke}`;
  if (node.shape === "terminator") return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${(h - 2) / 2}" ${common}/>`;
  if (node.shape === "decision") return `<polygon points="${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}" ${common}/>`;
  if (node.shape === "data") return `<polygon points="24,2 ${w - 2},2 ${w - 26},${h - 2} 2,${h - 2}" ${common}/>`;
  if (node.shape === "prepare") return `<polygon points="22,2 ${w - 22},2 ${w - 2},${h / 2} ${w - 22},${h - 2} 22,${h - 2} 2,${h / 2}" ${common}/>`;
  if (node.shape === "display") return `<path d="M18 3 H${w - 16} Q${w - 2} 3 ${w - 2} 16 V${h - 16} Q${w - 2} ${h - 3} ${w - 16} ${h - 3} H18 Q4 ${h / 2} 18 3 Z" ${common}/>`;
  if (node.shape === "note") return `<path d="M2 2 H${w - 28} L${w - 2} 28 V${h - 2} H2 Z M${w - 28} 2 V28 H${w - 2}" fill="var(--fill)" stroke="currentColor" stroke-width="1.6"/>`;
  if (node.shape === "subroutine") return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" ${common}/><path d="M16 1 V${h - 1} M${w - 16} 1 V${h - 1}" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
  return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" ${common}/>`;
}

function assignLanes(edges, byId) {
  const ranked = edges.map((edge) => {
    const a = byId[edge.from].story;
    const b = byId[edge.to].story;
    return { ...edge, lo: Math.min(a, b), hi: Math.max(a, b) };
  }).sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo);
  const lanes = { narrative: [], cause: [] };
  ranked.forEach((edge) => {
    const bucket = lanes[edge.kind] || lanes.cause;
    let lane = 0;
    while (bucket[lane]?.some((other) => !(edge.hi <= other.lo || edge.lo >= other.hi))) lane += 1;
    bucket[lane] = bucket[lane] || [];
    bucket[lane].push(edge);
    edge.lane = lane;
  });
  return ranked;
}

function arcPath(a, b, edge) {
  const sign = edge.kind === "narrative" ? -1 : 1;
  const height = 34 + edge.lane * 32 + Math.min(edge.storySpan, 6) * 8;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    d: `M ${a.x} ${a.y} Q ${mx + (-dy / len) * height * sign} ${my + (dx / len) * height * sign} ${b.x} ${b.y}`,
    labelX: mx + (-dy / len) * height * sign * 0.55,
    labelY: my + (dx / len) * height * sign * 0.55,
  };
}

function renderTools() {
  const layer = (key, name, swatch) => `<label><input type="checkbox" data-action="layer" data-layer="${key}" ${state.layers[key] ? "checked" : ""}><i class="swatch ${swatch}"></i>${name}</label>`;
  document.getElementById("tools").innerHTML = `
    <div class="seg" role="group" aria-label="交接范围">
      ${["all", "1", "2", "3"].map((id) => `<button type="button" data-action="handoff" data-handoff="${id}" class="${state.handoff === id ? "is-active" : ""}">${id === "all" ? "全图" : `第${id}章`}</button>`).join("")}
    </div>
    <div class="seg" role="group" aria-label="叙事路径">
      <button type="button" data-action="nln" data-nln="1" class="${state.nln ? "is-active" : ""}">非线性</button>
      <button type="button" data-action="nln" data-nln="0" class="${state.nln ? "" : "is-active"}">路径重合</button>
    </div>
    <div class="layers">
      ${layer("contains", "包含", "story")}
      ${layer("narrative", "叙事序", "narrative")}
      ${layer("causes", "因果", "cause")}
      ${layer("requires", "前置", "requires")}
      ${layer("reveals", "揭示", "reveals")}
      ${layer("foreshadows", "伏笔", "narrative")}
      ${layer("contrasts", "对照", "contrasts")}
    </div>
    <button class="fit" type="button" data-action="reset">排回故事序</button>
    <button class="fit" type="button" data-action="fit">适应画布</button>`;
}

function render() {
  current = build();
  renderTools();
  world.style.width = `${current.width}px`;
  world.style.height = `${current.height}px`;
  edgesSvg.setAttribute("width", current.width);
  edgesSvg.setAttribute("height", current.height);
  nodesEl.innerHTML = current.nodes.map((node) => {
    const box = shapeOf(node);
    const fill = node.rejected ? "#fff7f6" : PARENTS[node.parent].fill;
    const meta = node.kind === "arc" ? "故事弧" : `${FN[node.fn] || "高层"} · ${node.chapter}`;
    const detail = node.goal ? `<em>${node.timeText} · ${node.locationText}</em><em>${node.people}</em><em>${node.goal}</em>` : `<em>${node.timeText || ""}</em><em>${node.locationText || ""}</em>`;
    const mark = node.transition ? " · 只过渡" : node.kind === "arc" ? "" : " · 已确认";
    return `<button class="node shape-${node.shape} ${state.selected === node.id ? "is-selected" : ""} ${node.dim ? "is-dim" : ""} ${node.transition ? "is-transition" : ""}" type="button" data-id="${node.id}" style="left:${node.x}px;top:${node.y}px;width:${box.w}px;height:${box.h}px;--fill:${fill}">
      <svg viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true">${shapeSvg(node)}</svg>
      <span class="label"><small>${meta}${mark}</small><b>${node.name}</b>${detail}</span>
    </button>`;
  }).join("");
  paintEdges();
  document.getElementById("inspector").innerHTML = inspect();
  applyTransform();
  if (!state.fitted) {
    state.fitted = true;
    requestAnimationFrame(fit);
  }
}

function edgeOn(edge) {
  if (edge.kind === "contains") return state.layers.contains;
  if (edge.kind === "narrative") return state.layers.narrative;
  return state.layers[edge.kind];
}

function paintEdges() {
  const byId = Object.fromEntries(current.nodes.map((node) => [node.id, node]));
  const shown = (edge) => edgeOn(edge) && (!current.focus || (current.focus.has(edge.from) && current.focus.has(edge.to)));
  const spine = current.storyEdges.filter(() => !current.focus);
  const spinePath = spine.length ? `M ${centerOf(byId[spine[0].from]).x} ${centerOf(byId[spine[0].from]).y} ${spine.map((edge) => { const p = centerOf(byId[edge.to]); return `L ${p.x} ${p.y}`; }).join(" ")}` : "";
  const colors = { narrative: "#6c4ae0", causes: "#a96620", requires: "#5c6b7a", reveals: "#2f6f9f", foreshadows: "#6c4ae0", contrasts: "#9f3b32", contains: "#c8c8c2" };
  const extra = current.contains.concat(current.relations, current.narrativeEdges).filter(shown);
  const arcs = assignLanes(extra.filter((edge) => edge.kind !== "contains"), byId).map((edge) => {
    const path = arcPath(centerOf(byId[edge.from]), centerOf(byId[edge.to]), edge);
    const selected = state.selected === edge.from || state.selected === edge.to;
    const color = edge.label === "倒叙" ? "#a96620" : colors[edge.kind];
    const text = selected ? `<text x="${path.labelX}" y="${path.labelY}" text-anchor="middle" fill="${color}" font-size="11">${edge.label}</text>` : "";
    return `<path d="${path.d}" fill="none" stroke="${color}" stroke-width="${selected ? 2.2 : 1.5}" stroke-dasharray="${edge.kind === "foreshadows" ? "6 4" : ""}" opacity="${state.selected && !selected ? 0.25 : 0.95}" marker-end="url(#arrow)"/>${text}`;
  }).join("");
  const contains = extra.filter((edge) => edge.kind === "contains").map((edge) => {
    const a = centerOf(byId[edge.from]);
    const b = centerOf(byId[edge.to]);
    return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="#d5d5d0" stroke-width="1.2"/>`;
  }).join("");
  edgesSvg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8a84"/></marker></defs><path d="${spinePath}" fill="none" stroke="#ddd" stroke-width="2"/>${contains}${arcs}`;
}

function paintNodes() {
  current.nodes.forEach((node) => {
    const button = nodesEl.querySelector(`[data-id="${node.id}"]`);
    if (!button) return;
    button.style.left = `${node.x}px`;
    button.style.top = `${node.y}px`;
    button.classList.toggle("is-selected", state.selected === node.id);
  });
}

function inspect() {
  const node = current.nodes.find((item) => item.id === state.selected);
  const lead = state.handoff === "all"
    ? "底线按 storyOrder 连接叶子，不是一种关系类型。上方折线是完整叙事序。关系按因果、前置、揭示、伏笔、对照分开。被退回的顶点不在这张图里。"
    : `第 ${state.handoff} 章交接只保留本章已确认叶子、紧邻的下一叶子，以及两端都落在这些顶点上的关系。下一叶子只用于过渡。`;
  if (!node) return `<p class="eyebrow">Graph</p><h2>叙事图</h2><p class="formula">${lead}</p>`;
  const arcs = current.contains.concat(current.relations, current.narrativeEdges).filter((edge) => edge.from === node.id || edge.to === node.id);
  const tuple = node.goal ? `
      <div><b>时间</b><span>${node.timeText}</span></div>
      <div><b>地点</b><span>${node.locationText}</span></div>
      <div><b>人物</b><span>${(node.participants || []).map((item) => `${item.name}（${item.role}：${item.before} → ${item.after}）`).join("；") || node.people}</span></div>
      <div><b>目标</b><span>${node.goal}</span></div>
      <div><b>冲突</b><span>${node.conflict}</span></div>
      <div><b>结果</b><span>${node.outcome}</span></div>
      <div><b>叙事功能</b><span>${FN[node.fn]} · 结构角色 ${ROLE[node.role] || ""}</span></div>
      <div><b>摘要</b><span>${node.summary}</span></div>` : `
      <div><b>时间</b><span>${node.timeText || "高层事件不单写一拍"}</span></div>
      <div><b>地点</b><span>${node.locationText || "见子事件"}</span></div>`;
  return `<p class="eyebrow">Vertex</p><h2>${node.id} ${node.name}</h2><p class="formula">${lead}</p>
    <div class="kv">
      ${tuple}
      <div><b>故事序 / 叙事序</b><span>故事序 ${node.story == null ? "故事弧" : node.story + 1} · 叙事序 ${node.narrative == null ? "不单排" : readingOrder(node) + 1} · ${node.chapter}${node.transition ? "。这一叶子只过渡，不得展开" : ""}</span></div>
      <div><b>承诺</b><span>${[PROMISE.seed, PROMISE.trigger, PROMISE.payoff].includes(node.id) ? `${PROMISE.name}：${PROMISE.status}。铺设 ${PROMISE.setup}。触发 ${PROMISE.triggerText}。兑现 ${PROMISE.payoffText}` : "这一顶点不在空弹夹承诺上"}</span></div>
      <div><b>关系</b><ul class="edge-list">${arcs.map((edge) => `<li>${edge.from} → ${edge.to} · ${edge.label}</li>`).join("") || "<li>没有连到这一顶点的关系</li>"}</ul></div>
    </div>`;
}

function applyTransform() {
  world.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function fit() {
  const rect = viewport.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 80) return;
  const fitScale = Math.min((rect.width - 32) / current.width, (rect.height - 32) / current.height, 1);
  state.scale = Math.max(fitScale, 0.72);
  state.x = state.scale > fitScale ? 20 : (rect.width - current.width * state.scale) / 2;
  state.y = Math.max(16, (rect.height - current.height * state.scale) / 2);
  applyTransform();
}

new ResizeObserver(() => fit()).observe(viewport);

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "handoff") {
    state.handoff = target.dataset.handoff;
    state.fitted = false;
  }
  if (target.dataset.action === "nln") {
    state.nln = target.dataset.nln === "1";
    Object.keys(dragged).forEach((id) => delete dragged[id]);
    state.fitted = false;
  }
  if (target.dataset.action === "reset") {
    Object.keys(dragged).forEach((id) => delete dragged[id]);
    state.fitted = false;
  }
  if (target.dataset.action === "fit") {
    fit();
    return;
  }
  render();
});

document.body.addEventListener("change", (event) => {
  const input = event.target.closest("[data-action='layer']");
  if (!input) return;
  state.layers[input.dataset.layer] = input.checked;
  render();
});

nodesEl.addEventListener("pointerdown", (event) => {
  const button = event.target.closest(".node");
  if (!button) return;
  event.stopPropagation();
  const node = current.nodes.find((item) => item.id === button.dataset.id);
  state.selected = node.id;
  dragNode = { id: node.id, x: event.clientX, y: event.clientY, ox: node.x, oy: node.y };
  button.classList.add("is-dragging");
  paintNodes();
  paintEdges();
  document.getElementById("inspector").innerHTML = inspect();
  button.setPointerCapture(event.pointerId);
});

nodesEl.addEventListener("pointermove", (event) => {
  if (!dragNode) return;
  const node = current.nodes.find((item) => item.id === dragNode.id);
  node.x = dragNode.ox + (event.clientX - dragNode.x) / state.scale;
  node.y = dragNode.oy + (event.clientY - dragNode.y) / state.scale;
  dragged[node.id] = { x: node.x, y: node.y };
  paintNodes();
  paintEdges();
});

nodesEl.addEventListener("pointerup", () => {
  dragNode = null;
  nodesEl.querySelectorAll(".is-dragging").forEach((button) => button.classList.remove("is-dragging"));
});

let pan = null;
viewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".node")) return;
  pan = { x: event.clientX, y: event.clientY, ox: state.x, oy: state.y };
  viewport.classList.add("is-drag");
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("pointermove", (event) => {
  if (!pan) return;
  state.x = pan.ox + event.clientX - pan.x;
  state.y = pan.oy + event.clientY - pan.y;
  applyTransform();
});
viewport.addEventListener("pointerup", () => {
  pan = null;
  viewport.classList.remove("is-drag");
});
viewport.addEventListener("dblclick", (event) => {
  if (event.target.closest(".node")) return;
  fit();
});
viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const next = Math.min(1.6, Math.max(0.35, state.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
  const rect = viewport.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  state.x = px - ((px - state.x) * next) / state.scale;
  state.y = py - ((py - state.y) * next) / state.scale;
  state.scale = next;
  applyTransform();
}, { passive: false });

render();
