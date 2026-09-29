export type StoryLeaf = {
  readonly id: string;
  readonly parent: string;
  readonly name: string;
  readonly story: number;
  readonly narrative: number;
  readonly chapter: string;
  readonly timeText: string;
  readonly locationText: string;
  readonly people: string;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
};

export type StoryArc = {
  readonly id: string;
  readonly name: string;
  readonly timeText: string;
  readonly locationText: string;
  readonly people: string;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
};

export type StoryRelation = {
  readonly from: string;
  readonly to: string;
  readonly type: "causes" | "requires" | "reveals" | "foreshadows" | "contrasts";
  readonly detail: string;
};

export const STORY_LEAVES: readonly StoryLeaf[] = [
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

export const STORY_ARCS: readonly StoryArc[] = [
  { id: "E5", name: "二十年互救", timeText: "从军至今", locationText: "多处战场", people: "沈衡、梁秋", goal: "彼此活下来", conflict: "多次险死", outcome: "两人还在" },
  { id: "E2", name: "交出铜哨", timeText: "伏击前夜", locationText: "营地外", people: "沈衡、梁秋", goal: "把西坡路线交出去", conflict: "路线交出后西侧会开枪", outcome: "铜哨和缺页成为证据" },
  { id: "E1", name: "北坡遇伏", timeText: "入夜后", locationText: "北坡密林", people: "沈衡、梁秋", goal: "活过这一夜", conflict: "伏击来自事先交出的方向", outcome: "两人幸存" },
  { id: "E3", name: "山脊揭穿", timeText: "次日黄昏", locationText: "偏僻山脊", people: "沈衡、梁秋", goal: "确认谁交出了路线", conflict: "证据必须指回泄密", outcome: "背叛被揭穿" },
  { id: "E4", name: "拖出包围", timeText: "揭穿之后", locationText: "坡道", people: "沈衡、梁秋", goal: "离开包围圈", conflict: "人被带走，称呼取消", outcome: "救助完成，关系终止" },
];

export const STORY_RELATIONS: readonly StoryRelation[] = [
  { from: "2.2", to: "1.1", type: "causes", detail: "交出的口令导致西侧枪声" },
  { from: "2.1", to: "1.3", type: "causes", detail: "撕页导致知道西侧会开枪" },
  { from: "5.1", to: "4.1", type: "causes", detail: "挡刀仍是拖人的原因" },
  { from: "2.2", to: "3.2", type: "requires", detail: "对口令之前铜哨必须已经交出" },
  { from: "2.1", to: "3.1", type: "reveals", detail: "缺页对上被撕下的西坡" },
  { from: "3.0", to: "3.2", type: "foreshadows", detail: "空弹夹在对口令时兑现" },
  { from: "1.2", to: "4.2", type: "contrasts", detail: "当时仍当战友，此刻只叫名字" },
];
