const CX = 560;
const CY = 500;
const RADIUS = 248;
const VERTEX = 80;

const LEAVES = [
  { id: "5.1", parent: "E5", name: "挡白刃", story: 0, narrative: 3, chapter: "第 2 章", timeText: "从军第一年冬", locationText: "河谷窄路", people: "沈衡、梁秋", goal: "挡住砍向梁秋的刀", conflict: "敌军已贴到身侧", outcome: "沈衡受伤，梁秋活下来" },
  { id: "5.2", parent: "E5", name: "拽上岸", story: 1, narrative: 4, chapter: "第 2 章", timeText: "从军第三年夏", locationText: "渡口下游", people: "梁秋、沈衡", goal: "把落水的沈衡拉上来", conflict: "水流和装备往下拖", outcome: "沈衡被拽上岸" },
  { id: "2.1", parent: "E2", name: "撕下西坡", story: 2, narrative: 5, chapter: "第 2 章", timeText: "伏击前夜", locationText: "营地灯下", people: "梁秋", goal: "拆走西坡路线", conflict: "地图是两人共用的", outcome: "西坡那一页离开地图" },
  { id: "2.2", parent: "E2", name: "交出铜哨", story: 3, narrative: 6, chapter: "第 2 章", timeText: "伏击前夜稍后", locationText: "营地外", people: "梁秋、接头人", goal: "交出铜哨和口令", conflict: "口令一旦交出，西侧就有接应", outcome: "铜哨离手" },
  { id: "1.1", parent: "E1", name: "西侧枪声", story: 4, narrative: 0, chapter: "第 1 章", timeText: "入夜后", locationText: "北坡密林", people: "沈衡、梁秋、敌军", goal: "活过第一轮射击", conflict: "枪从西侧来", outcome: "两人尚未倒下" },
  { id: "1.2", parent: "E1", name: "按进壕沟", story: 5, narrative: 1, chapter: "第 1 章", timeText: "同一夜", locationText: "北坡密林壕沟", people: "沈衡、梁秋", goal: "把梁秋按进掩护", conflict: "沈衡仍把他当战友", outcome: "梁秋被护住" },
  { id: "1.3", parent: "E1", name: "慢半步", story: 6, narrative: 9, chapter: "第 3 章", timeText: "换弹的间隙", locationText: "壕沟内", people: "梁秋、沈衡", goal: "让西侧射击落到预定处", conflict: "梁秋知道枪声会来", outcome: "慢了半步，人还活着" },
  { id: "3.1", parent: "E3", name: "发现缺页", story: 7, narrative: 7, chapter: "第 3 章", timeText: "次日黄昏", locationText: "偏僻山脊", people: "沈衡", goal: "核对撤退地图", conflict: "西坡那一页不在", outcome: "缺页被看见" },
  { id: "3.0", parent: "E3", name: "空弹夹落地", story: 8, narrative: 2, chapter: "第 1 章", timeText: "次日黄昏", locationText: "偏僻山脊", people: "无主动参与者", goal: "先把空弹夹送进画面", conflict: "此时还对不上枪声和铜哨", outcome: "物件出现，原因留到对上口令" },
  { id: "3.2", parent: "E3", name: "对上口令", story: 9, narrative: 8, chapter: "第 3 章", timeText: "次日黄昏", locationText: "偏僻山脊", people: "沈衡、梁秋", goal: "确认铜哨和口令是同一件事", conflict: "空弹夹、铜哨、西侧枪声要对上", outcome: "背叛被证明" },
  { id: "3.3", parent: "E3", name: "问他走不走", story: 10, narrative: 10, chapter: "第 3 章", timeText: "揭穿之后", locationText: "山脊", people: "沈衡、梁秋", goal: "把走或不走交给梁秋", conflict: "揭穿已完成，人还在", outcome: "选择权交到下一拍" },
  { id: "4.1", parent: "E4", name: "拖下坡", story: 11, narrative: 11, chapter: "第 3 章", timeText: "揭穿之后", locationText: "山脊向下的坡道", people: "沈衡、梁秋", goal: "把人带出包围", conflict: "救助还在，战友关系已经分开", outcome: "人被拖着离开" },
  { id: "4.2", parent: "E4", name: "只叫名字", story: 12, narrative: 12, chapter: "第 3 章", timeText: "下坡途中", locationText: "坡道", people: "沈衡、梁秋", goal: "取消战友称呼", conflict: "人还在手里，称呼不能回去", outcome: "只剩名字，关系终止" },
];

const ARCS = [
  { id: "E5", name: "二十年互救", timeText: "从军至今", locationText: "多处战场", people: "沈衡、梁秋", goal: "彼此活下来", conflict: "多次险死", outcome: "两人还在" },
  { id: "E2", name: "交出铜哨", timeText: "伏击前夜", locationText: "营地外", people: "沈衡、梁秋", goal: "把西坡路线交出去", conflict: "路线交出后西侧会开枪", outcome: "铜哨和缺页成为证据" },
  { id: "E1", name: "北坡遇伏", timeText: "入夜后", locationText: "北坡密林", people: "沈衡、梁秋", goal: "活过这一夜", conflict: "伏击来自事先交出的方向", outcome: "两人幸存" },
  { id: "E3", name: "山脊揭穿", timeText: "次日黄昏", locationText: "偏僻山脊", people: "沈衡、梁秋", goal: "确认谁交出了路线", conflict: "证据必须指回泄密", outcome: "背叛被揭穿" },
  { id: "E4", name: "拖出包围", timeText: "揭穿之后", locationText: "坡道", people: "沈衡、梁秋", goal: "离开包围圈", conflict: "人被带走，称呼取消", outcome: "救助完成，关系终止" },
];

const RELATION_EDGES = [
  { from: "2.2", to: "1.1", type: "causes", detail: "交出的口令导致西侧枪声" },
  { from: "2.1", to: "1.3", type: "causes", detail: "撕页导致知道西侧会开枪" },
  { from: "5.1", to: "4.1", type: "causes", detail: "挡刀仍是拖人的原因" },
  { from: "2.2", to: "3.2", type: "requires", detail: "对口令之前铜哨必须已经交出" },
  { from: "2.1", to: "3.1", type: "reveals", detail: "缺页对上被撕下的西坡" },
  { from: "3.0", to: "3.2", type: "foreshadows", detail: "空弹夹在对口令时兑现" },
  { from: "1.2", to: "4.2", type: "contrasts", detail: "当时仍当战友，此刻只叫名字" },
];

const TYPE_NAME = { contains: "包含", story: "故事序", narrative: "叙事序", causes: "因果", requires: "前置", reveals: "揭示", foreshadows: "伏笔", contrasts: "对照" };
const TYPE_COLOR = { contains: "#c5c5bf", story: "#7d8b99", narrative: "#6c4ae0", causes: "#a96620", requires: "#5c6b7a", reveals: "#2f6f9f", foreshadows: "#6c4ae0", contrasts: "#9f3b32" };
const VIEWS = [
  ["arc", "故事弧"],
  ["story", "故事序"],
  ["narrative", "叙事序"],
  ["plot", "情节关系"],
];

const state = {
  chapter: "all",
  view: "arc",
  selected: null,
  x: 24,
  y: 24,
  scale: 1,
  moved: false,
};

const dragged = {};
let current = null;
let dragNode = null;

const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const edgesSvg = document.getElementById("edges");
const verticesEl = document.getElementById("vertices");

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function familyOf(edge) {
  return edge.type === "contains" || edge.type === "story" || edge.type === "narrative" ? edge.type : "relations";
}

function buildGraph() {
  const leaves = LEAVES.map((leaf) => ({ ...leaf, kind: "leaf", w: VERTEX, h: VERTEX }));
  const ordered = leaves.slice().sort((a, b) => a.story - b.story);
  ordered.forEach((vertex, index) => {
    const angle = -Math.PI / 2 + (index / ordered.length) * Math.PI * 2;
    const homeX = CX + RADIUS * Math.cos(angle) - VERTEX / 2;
    const homeY = CY + RADIUS * Math.sin(angle) - VERTEX / 2;
    const moved = dragged[vertex.id];
    vertex.angle = angle;
    vertex.x = moved ? moved.x : homeX;
    vertex.y = moved ? moved.y : homeY;
  });
  const arcs = ARCS.map((arc) => {
    const kids = leaves.filter((leaf) => leaf.parent === arc.id);
    const mid = kids.reduce((sum, leaf) => sum + leaf.angle, 0) / kids.length;
    const homeX = CX + (RADIUS + 118) * Math.cos(mid) - VERTEX / 2;
    const homeY = CY + (RADIUS + 118) * Math.sin(mid) - VERTEX / 2;
    const moved = dragged[arc.id];
    return { ...arc, kind: "arc", w: VERTEX, h: VERTEX, angle: mid, x: moved ? moved.x : homeX, y: moved ? moved.y : homeY };
  });
  const vertices = arcs.concat(leaves);
  const edges = [];
  leaves.forEach((leaf) => {
    edges.push({ id: `contains:${leaf.parent}:${leaf.id}`, from: leaf.parent, to: leaf.id, type: "contains", label: "包含" });
  });
  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1];
    const to = ordered[index];
    edges.push({ id: `story:${from.id}:${to.id}`, from: from.id, to: to.id, type: "story", label: "故事序" });
  }
  const arcOrder = ["E5", "E2", "E1", "E3", "E4"];
  for (let index = 1; index < arcOrder.length; index += 1) {
    const from = arcOrder[index - 1];
    const to = arcOrder[index];
    edges.push({ id: `story:${from}:${to}`, from, to, type: "story", label: "故事序" });
  }
  const reading = leaves.slice().sort((a, b) => a.narrative - b.narrative);
  for (let index = 1; index < reading.length; index += 1) {
    const from = reading[index - 1];
    const to = reading[index];
    const jump = to.story - from.story;
    edges.push({
      id: `narrative:${from.id}:${to.id}`,
      from: from.id,
      to: to.id,
      type: "narrative",
      label: jump < 0 ? "倒叙" : jump > 1 ? "预叙" : "叙事序",
    });
  }
  RELATION_EDGES.forEach((edge) => {
    edges.push({ id: `${edge.type}:${edge.from}:${edge.to}`, ...edge, label: TYPE_NAME[edge.type] });
  });
  applyFocus(vertices, reading);
  const bounds = vertices.reduce((box, vertex) => ({
    minX: Math.min(box.minX, vertex.x),
    minY: Math.min(box.minY, vertex.y),
    maxX: Math.max(box.maxX, vertex.x + vertex.w),
    maxY: Math.max(box.maxY, vertex.y + vertex.h),
  }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
  return {
    vertices,
    edges,
    width: bounds.maxX + 120,
    height: bounds.maxY + 140,
  };
}

function applyFocus(vertices, reading) {
  if (state.chapter === "all") {
    vertices.forEach((vertex) => {
      vertex.dim = false;
      vertex.transition = false;
    });
    return;
  }
  const mine = reading.filter((vertex) => vertex.chapter === `第 ${state.chapter} 章`);
  const last = mine[mine.length - 1];
  const next = reading[reading.indexOf(last) + 1];
  const ids = new Set(mine.map((vertex) => vertex.id));
  mine.forEach((vertex) => ids.add(vertex.parent));
  if (next) ids.add(next.id);
  vertices.forEach((vertex) => {
    vertex.dim = !ids.has(vertex.id);
    vertex.transition = Boolean(next && vertex.id === next.id);
  });
}

function byIdMap() {
  return Object.fromEntries(current.vertices.map((vertex) => [vertex.id, vertex]));
}

function nameOf(id) {
  return current.vertices.find((vertex) => vertex.id === id)?.name || id;
}

function isArc(id) {
  return /^E\d+$/.test(id);
}

function inViewEdge(edge) {
  if (state.view === "arc") return edge.type === "story" && isArc(edge.from) && isArc(edge.to);
  if (state.view === "story") return edge.type === "story" && !isArc(edge.from);
  if (state.view === "narrative") return edge.type === "narrative" || edge.type === "causes";
  return familyOf(edge) === "relations";
}

function selectedIds() {
  if (!state.selected || !current) return new Set();
  if (state.selected.kind === "edge") {
    const edge = current.edges.find((item) => item.id === state.selected.id);
    return new Set(edge ? [edge.from, edge.to] : []);
  }
  const ids = new Set([state.selected.id]);
  current.edges.forEach((edge) => {
    if (edge.from === state.selected.id) ids.add(edge.to);
    if (edge.to === state.selected.id) ids.add(edge.from);
  });
  return ids;
}

function isMainVertex(vertex) {
  if (vertex.dim && state.chapter !== "all") return false;
  return state.view === "arc" ? vertex.kind === "arc" : vertex.kind === "leaf";
}

function vertexEmphasis(vertex) {
  if (selectedIds().has(vertex.id)) return "focus";
  if (state.selected) return "ghost";
  return isMainVertex(vertex) ? "main" : "ghost";
}

function edgeEmphasis(edge) {
  const incident = state.selected?.kind === "vertex" && (edge.from === state.selected.id || edge.to === state.selected.id);
  const chosen = state.selected?.kind === "edge" && edge.id === state.selected.id;
  if (incident || chosen) return "focus";
  if (state.selected) return "ghost";
  if (state.chapter !== "all") {
    const from = current.vertices.find((vertex) => vertex.id === edge.from);
    const to = current.vertices.find((vertex) => vertex.id === edge.to);
    if (!from || !to || from.dim || to.dim) return "ghost";
  }
  return inViewEdge(edge) ? "main" : "ghost";
}

function renderTools() {
  const chapter = (id, label) => `<button type="button" data-action="chapter" data-chapter="${id}" class="${state.chapter === id ? "is-active" : ""}">${label}</button>`;
  const view = ([id, label]) => `<button type="button" data-action="view" data-view="${id}" class="${state.view === id ? "is-active" : ""}">${label}</button>`;
  document.getElementById("tools").innerHTML = `
    <div class="seg" role="group" aria-label="层级">${VIEWS.map(view).join("")}</div>
    <div class="seg" role="group" aria-label="章节">${chapter("all", "全书")}${chapter("1", "第1章")}${chapter("2", "第2章")}${chapter("3", "第3章")}</div>
    <button class="fit" type="button" data-action="reset">复位布局</button>
    <button class="fit" type="button" data-action="fit">适应画布</button>`;
  document.getElementById("piece").textContent = `G = (V, E)  |V| ${current.vertices.length}  |E| ${current.edges.length}`;
}

function renderLegend() {
  const items = {
    arc: [[TYPE_COLOR.story, "故事序", ""]],
    story: [[TYPE_COLOR.story, "故事序", ""]],
    narrative: [[TYPE_COLOR.narrative, "叙事序", ""], [TYPE_COLOR.causes, "因果", ""]],
    plot: [
      [TYPE_COLOR.causes, "因果", ""],
      [TYPE_COLOR.requires, "前置", ""],
      [TYPE_COLOR.reveals, "揭示", ""],
      [TYPE_COLOR.foreshadows, "伏笔", "dashed"],
      [TYPE_COLOR.contrasts, "对照", ""],
    ],
  }[state.view];
  document.getElementById("legend").innerHTML = items.map(([color, label, style]) => `<span><i class="${style}" style="border-top-color:${color}"></i>${label}</span>`).join("");
}

function renderVertices() {
  const ordered = current.vertices.slice().sort((a, b) => (vertexEmphasis(a) === "ghost" ? 0 : 1) - (vertexEmphasis(b) === "ghost" ? 0 : 1));
  verticesEl.innerHTML = ordered.map((vertex) => {
    const emphasis = vertexEmphasis(vertex);
    const selected = state.selected?.kind === "vertex" && state.selected.id === vertex.id;
    const endpoint = emphasis === "focus" && state.selected?.kind === "edge";
    const mark = vertex.kind === "arc" ? "弧" : vertex.id;
    return `<button class="vertex is-${emphasis}${vertex.kind === "arc" ? " is-arc" : ""}${vertex.transition ? " is-transition" : ""}${selected ? " is-selected" : ""}${endpoint ? " is-endpoint" : ""}" type="button" data-id="${vertex.id}" style="left:${vertex.x}px;top:${vertex.y}px" title="${esc(vertex.goal || "")}"><small>${vertex.transition ? "过渡" : mark}</small><b>${esc(vertex.name)}</b></button>`;
  }).join("");
}

function center(vertex) {
  return { x: vertex.x + vertex.w / 2, y: vertex.y + vertex.h / 2 };
}

function ports(a, b, offset) {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ox = nx * offset;
  const oy = ny * offset;
  const r1 = a.w / 2 + 2;
  const r2 = b.w / 2 + 9;
  return {
    x1: ca.x + (dx / len) * r1 + ox,
    y1: ca.y + (dy / len) * r1 + oy,
    x2: cb.x - (dx / len) * r2 + ox,
    y2: cb.y - (dy / len) * r2 + oy,
  };
}

function edgeGeometry(edge, vertices) {
  const a = vertices[edge.from];
  const b = vertices[edge.to];
  const neighbor = edge.type === "narrative" && Math.abs(a.story - b.story) === 1;
  if (edge.type === "contains" || edge.type === "story" || neighbor) {
    const line = ports(a, b, neighbor ? 12 : 0);
    return { d: `M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`, lx: (line.x1 + line.x2) / 2, ly: (line.y1 + line.y2) / 2 };
  }
  const line = ports(a, b, 0);
  const mx = (line.x1 + line.x2) / 2;
  const my = (line.y1 + line.y2) / 2;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy) || 1;
  const span = Math.abs((a.story ?? 0) - (b.story ?? 0));
  const amount = 56 + Math.min(span, 8) * 12;
  const c1 = { x: mx + (-dy / len) * amount, y: my + (dx / len) * amount };
  const c2 = { x: mx - (-dy / len) * amount, y: my - (dx / len) * amount };
  const outside = Math.hypot(c1.x - CX, c1.y - CY) >= Math.hypot(c2.x - CX, c2.y - CY) ? c1 : c2;
  return {
    d: `M ${line.x1} ${line.y1} Q ${outside.x} ${outside.y} ${line.x2} ${line.y2}`,
    lx: 0.25 * line.x1 + 0.5 * outside.x + 0.25 * line.x2,
    ly: 0.25 * line.y1 + 0.5 * outside.y + 0.25 * line.y2,
  };
}

function clearOfVertices(x, y, vertices) {
  const nearest = Object.values(vertices).reduce((best, vertex) => {
    const point = center(vertex);
    const distance = Math.hypot(x - point.x, y - point.y);
    return distance < best.distance ? { distance, point } : best;
  }, { distance: Infinity, point: { x, y } });
  if (nearest.distance >= 58) return { x, y };
  const length = nearest.distance || 1;
  const push = 64 - nearest.distance;
  return {
    x: x + ((x - nearest.point.x) / length) * push,
    y: y + ((y - nearest.point.y) / length) * push,
  };
}

function pill(x, y, text, color) {
  const width = [...text].length * 12 + 14;
  return `<g><rect x="${x - width / 2}" y="${y - 9}" width="${width}" height="18" rx="9" fill="#fbfbfa" stroke="${color}" stroke-width="1"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="${color}" font-size="11" font-family="Inter, 'Microsoft YaHei', sans-serif">${esc(text)}</text></g>`;
}

function paintEdges() {
  const vertices = byIdMap();
  const ordered = current.edges.slice().sort((a, b) => (edgeEmphasis(a) === "ghost" ? 0 : 1) - (edgeEmphasis(b) === "ghost" ? 0 : 1));
  const markup = ordered.map((edge) => {
    const path = edgeGeometry(edge, vertices);
    const labelAt = clearOfVertices(path.lx, path.ly, vertices);
    const color = edge.label === "倒叙" ? "#a96620" : TYPE_COLOR[edge.type];
    const emphasis = edgeEmphasis(edge);
    const dash = edge.type === "foreshadows" ? 'stroke-dasharray="5 4"' : "";
    const named = emphasis === "focus"
      ? edge.type !== "contains" && edge.label !== "叙事序"
      : emphasis === "main" && (edge.label === "倒叙" || edge.label === "预叙" || familyOf(edge) === "relations" || (state.view === "arc" && edge.type === "story"));
    const label = named ? pill(labelAt.x, labelAt.y, edge.label, color) : "";
    const opacity = emphasis === "ghost" ? 0.08 : 1;
    const width = emphasis === "focus" ? 2.25 : 1.45;
    return `<g data-edge="${edge.id}" opacity="${opacity}"><path class="hit" d="${path.d}" fill="none" stroke="transparent" stroke-width="14"/><path d="${path.d}" fill="none" stroke="${color}" stroke-width="${width}" ${dash} marker-end="url(#arrow)"/>${label}</g>`;
  }).join("");
  edgesSvg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 1.4 L 9 5 L 0 8.6 Z" fill="context-stroke"/></marker></defs>${markup}`;
  world.style.width = `${current.width}px`;
  world.style.height = `${current.height}px`;
  edgesSvg.setAttribute("width", current.width);
  edgesSvg.setAttribute("height", current.height);
}

function edgeButton(edge, on) {
  return `<button type="button" data-edge="${edge.id}" class="${on ? "is-on" : ""}"><b>${esc(nameOf(edge.from))}</b><i>${esc(edge.label)}</i><b>${esc(nameOf(edge.to))}</b></button>`;
}

function inspect() {
  const head = `<div class="graph-id"><p class="eyebrow">有向图</p><h2>G = (V, E)</h2><p class="counts"><span>|V| = ${current.vertices.length}</span><span>|E| = ${current.edges.length}</span></p></div>`;
  if (state.selected?.kind === "edge") {
    const edge = current.edges.find((item) => item.id === state.selected.id);
    if (!edge) return head;
    return `${head}<p class="eyebrow">边</p><h2>${esc(edge.label)}</h2><div class="adj">${edgeButton(edge, true)}</div><div class="kv"><div><b>类型</b><span>${esc(TYPE_NAME[edge.type])}</span></div><div><b>说明</b><span>${esc(edge.detail || "这条边只记录方向和类型")}</span></div></div><p><button class="linkish" type="button" data-action="clear">回到这一层</button></p>`;
  }
  if (state.selected?.kind === "vertex") {
    const vertex = current.vertices.find((item) => item.id === state.selected.id);
    if (!vertex) return head;
    const outs = current.edges.filter((edge) => edge.from === vertex.id);
    const ins = current.edges.filter((edge) => edge.to === vertex.id);
    const row = (edge) => edgeButton(edge, false);
    return `${head}<p class="eyebrow">${vertex.kind === "arc" ? "顶点 · 故事弧" : `顶点 · ${vertex.chapter}`}</p><h2>${esc(vertex.name)}</h2><div class="degree"><div><b>${outs.length}</b><span>出度</span></div><div><b>${ins.length}</b><span>入度</span></div></div><p class="formula">相关的点和边已聚焦，其余仍以淡色留在图上。</p><h3>出边</h3><div class="adj">${outs.map(row).join("") || "<span>没有出边</span>"}</div><h3>入边</h3><div class="adj">${ins.map(row).join("") || "<span>没有入边</span>"}</div><h3>属性</h3><div class="kv"><div><b>时间</b><span>${esc(vertex.timeText)}</span></div><div><b>地点</b><span>${esc(vertex.locationText)}</span></div><div><b>人物</b><span>${esc(vertex.people)}</span></div><div><b>目标</b><span>${esc(vertex.goal)}</span></div><div><b>冲突</b><span>${esc(vertex.conflict)}</span></div><div><b>结果</b><span>${esc(vertex.outcome)}</span></div></div><p><button class="linkish" type="button" data-action="clear">回到这一层</button></p>`;
  }
  const groups = ["contains", "story", "narrative", "causes", "requires", "reveals", "foreshadows", "contrasts"].map((type) => {
    const rows = current.edges.filter((edge) => edge.type === type && inViewEdge(edge));
    if (!rows.length) return "";
    return `<h3>${TYPE_NAME[type]} · ${rows.length}</h3><div class="catalog">${rows.map((edge) => edgeButton(edge, false)).join("")}</div>`;
  }).join("");
  const viewName = VIEWS.find(([id]) => id === state.view)?.[1] || "";
  return `${head}<p class="eyebrow">${viewName} · 主边</p><p class="formula">这一层的点和边正常显示，其余更淡。点一个顶点，会聚焦它相关的点和边。</p>${groups}`;
}

function paintVertices() {
  current.vertices.forEach((vertex) => {
    const button = verticesEl.querySelector(`[data-id="${vertex.id}"]`);
    if (!button) return;
    button.style.left = `${vertex.x}px`;
    button.style.top = `${vertex.y}px`;
    const selected = state.selected?.kind === "vertex" && state.selected.id === vertex.id;
    const endpoint = state.selected?.kind === "edge" && current.edges.some((edge) => edge.id === state.selected.id && (edge.from === vertex.id || edge.to === vertex.id));
    button.classList.toggle("is-selected", selected);
    button.classList.toggle("is-endpoint", endpoint);
  });
}

function render() {
  current = buildGraph();
  renderTools();
  renderLegend();
  renderVertices();
  paintEdges();
  document.getElementById("inspector").innerHTML = inspect();
  applyTransform();
  if (!state.moved) requestAnimationFrame(present);
}

function applyTransform() {
  world.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function present() {
  const rect = viewport.getBoundingClientRect();
  const visible = current?.vertices || [];
  if (!current || visible.length === 0 || rect.width < 80 || rect.height < 80) return;
  const minX = Math.min(...visible.map((vertex) => vertex.x)) - 36;
  const minY = Math.min(...visible.map((vertex) => vertex.y)) - 36;
  const maxX = Math.max(...visible.map((vertex) => vertex.x + vertex.w)) + 36;
  const maxY = Math.max(...visible.map((vertex) => vertex.y + vertex.h)) + 36;
  const scale = Math.min((rect.width - 28) / (maxX - minX), (rect.height - 28) / (maxY - minY), 1.15);
  state.scale = Math.max(scale, 0.45);
  state.x = (rect.width - (maxX - minX) * state.scale) / 2 - minX * state.scale;
  state.y = (rect.height - (maxY - minY) * state.scale) / 2 - minY * state.scale;
  applyTransform();
}

function fit() {
  state.moved = true;
  present();
  state.moved = true;
}

document.body.addEventListener("click", (event) => {
  const edgeButton = event.target.closest("[data-edge]");
  if (edgeButton && edgeButton.closest(".inspector, #edges")) {
    state.selected = { kind: "edge", id: edgeButton.dataset.edge };
    render();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "view") {
    state.view = action.dataset.view;
    state.selected = null;
    state.moved = false;
  }
  if (action.dataset.action === "chapter") {
    state.chapter = action.dataset.chapter;
    state.selected = null;
    state.moved = false;
  }
  if (action.dataset.action === "reset") {
    Object.keys(dragged).forEach((id) => delete dragged[id]);
    state.moved = false;
  }
  if (action.dataset.action === "clear") {
    state.selected = null;
  }
  if (action.dataset.action === "fit") {
    fit();
    return;
  }
  render();
});

verticesEl.addEventListener("pointerdown", (event) => {
  const button = event.target.closest(".vertex");
  if (!button) return;
  event.stopPropagation();
  const vertex = current.vertices.find((item) => item.id === button.dataset.id);
  state.selected = { kind: "vertex", id: vertex.id };
  dragNode = { id: vertex.id, x: event.clientX, y: event.clientY, ox: vertex.x, oy: vertex.y };
  renderVertices();
  paintEdges();
  document.getElementById("inspector").innerHTML = inspect();
  const again = verticesEl.querySelector(`[data-id="${vertex.id}"]`);
  again.classList.add("is-dragging");
  again.setPointerCapture(event.pointerId);
});

verticesEl.addEventListener("pointermove", (event) => {
  if (!dragNode) return;
  const vertex = current.vertices.find((item) => item.id === dragNode.id);
  vertex.x = dragNode.ox + (event.clientX - dragNode.x) / state.scale;
  vertex.y = dragNode.oy + (event.clientY - dragNode.y) / state.scale;
  dragged[vertex.id] = { x: vertex.x, y: vertex.y };
  paintVertices();
  paintEdges();
});

verticesEl.addEventListener("pointerup", () => {
  dragNode = null;
  verticesEl.querySelectorAll(".is-dragging").forEach((button) => button.classList.remove("is-dragging"));
});

let pan = null;
viewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".vertex") || event.target.closest("[data-edge]")) return;
  pan = { x: event.clientX, y: event.clientY, ox: state.x, oy: state.y, moved: false };
  viewport.classList.add("is-drag");
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("pointermove", (event) => {
  if (!pan) return;
  state.x = pan.ox + event.clientX - pan.x;
  state.y = pan.oy + event.clientY - pan.y;
  if (Math.hypot(state.x - pan.ox, state.y - pan.oy) > 3) {
    pan.moved = true;
    state.moved = true;
  }
  applyTransform();
});
viewport.addEventListener("pointerup", () => {
  const clear = pan && !pan.moved;
  pan = null;
  viewport.classList.remove("is-drag");
  if (clear && state.selected) {
    state.selected = null;
    render();
  }
});
viewport.addEventListener("dblclick", (event) => {
  if (event.target.closest(".vertex")) return;
  fit();
});
viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const next = Math.min(1.8, Math.max(0.35, state.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
  const rect = viewport.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  state.x = px - ((px - state.x) * next) / state.scale;
  state.y = py - ((py - state.y) * next) / state.scale;
  state.scale = next;
  state.moved = true;
  applyTransform();
}, { passive: false });

edgesSvg.addEventListener("click", (event) => {
  const path = event.target.closest("[data-edge]");
  if (!path) return;
  event.stopPropagation();
  state.selected = { kind: "edge", id: path.dataset.edge };
  render();
});

new ResizeObserver(() => {
  if (current && !state.moved) present();
}).observe(viewport);

render();
