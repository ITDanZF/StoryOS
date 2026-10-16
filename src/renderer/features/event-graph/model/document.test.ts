import { describe, expect, it } from "vitest";
import type { OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import { buildEventGraph } from "./buildEventGraph.ts";
import {
  applyNodeDocument,
  buildProseBrief,
  documentFromSnapshot,
  planNextNode,
  previewProposal,
  sampleDocument,
  toUpdateInput,
  type GraphDocument,
  type GraphNode,
} from "./document.ts";

function node(id: string, storyOrder: number, narrativeOrder = storyOrder, parentId: string | null = null): GraphNode {
  return {
    id,
    title: id,
    summary: "",
    kind: "event",
    parentId,
    document: "",
    changeBefore: "",
    changeAfter: "",
    structuralRole: "",
    narrativeFunction: "",
    storyOrder,
    narrativeOrder,
    status: "confirmed",
    participants: [],
    chapterId: "chapter-1",
    proposal: false,
  };
}

function document(nodes: readonly GraphNode[]): GraphDocument {
  return { source: "outline", outlineId: "outline-1", revision: 1, title: "总纲", nodes, relations: [] };
}

describe("event graph document", () => {
  it("keeps canonical outline fields separate when saving an edited document", () => {
    const snapshot = {
      outline: { id: "outline-1", revision: 4, title: "山中来信" },
      nodes: [{
        id: "leaf-1", parentId: null, kind: "event", title: "找到信", summary: "简短摘要",
        structuralRole: "turning_point", narrativeFunction: "mystery", goal: "找到信件",
        conflict: "看守阻拦", outcome: "带走信件", locationText: "旧塔", timeText: "黎明",
        storyOrder: 1, narrativeOrder: 1, status: "confirmed", notes: "保留备注",
      }],
      participants: [{ nodeId: "leaf-1", participantName: "阿澄", role: "focus", stateBefore: "未知", stateAfter: "知情" }],
      mappings: [], relations: [],
    } as unknown as OutlineSnapshot;
    const projected = documentFromSnapshot(snapshot);
    expect(projected.nodes[0]?.summary).toBe("简短摘要");
    expect(projected.nodes[0]?.document).not.toContain("看守阻拦");

    const edited = applyNodeDocument(projected, "leaf-1", "# 找到信\n\n新的摘要\n\n## 变化\n之后：带走信件\n\n## 参与\n- 阿澄｜focus｜人｜之前：未知｜之后：知情\n- 旧塔｜场所｜地点");
    expect(edited.issues).toEqual([]);
    const editedNode = edited.document.nodes[0];
    if (!editedNode) throw new Error("edited node missing");
    const changes = toUpdateInput(editedNode);
    expect(changes).toMatchObject({ title: "找到信", summary: "新的摘要", outcome: "带走信件", locationText: "旧塔" });
    expect(changes).not.toHaveProperty("goal");
    expect(changes).not.toHaveProperty("conflict");
    expect(changes).not.toHaveProperty("timeText");
    expect(changes).not.toHaveProperty("notes");
  });

  it("inserts the next sibling immediately after the current story beat", () => {
    const planned = planNextNode(document([node("a", 0), node("b", 1), node("c", 2)]), "a", {
      title: "新拍",
      summary: "",
      participants: [],
      link: "sibling",
      relation: { type: "causes", description: "导致下一拍", direction: "out" },
    }, "temp-1");
    expect([...planned.document.nodes].sort((left, right) => left.storyOrder - right.storyOrder).map((item) => item.id)).toEqual(["a", "temp-1", "b", "c"]);
    expect(planned.document.relations).toEqual([
      expect.objectContaining({ from: "a", to: "temp-1", type: "causes", description: "导致下一拍" }),
    ]);
    expect(planned.operations.map((operation) => operation.type)).toEqual(["update_node", "update_node", "create_node", "upsert_relation"]);
  });

  it("blocks prose until the selected leaves share one confirmed chapter", () => {
    const graph = document([
      node("a", 0, 1),
      { ...node("b", 1, 0), chapterId: "chapter-2", status: "draft" },
    ]);
    const blocked = buildProseBrief(graph, ["a", "b"], [
      { id: "chapter-1", label: "第一章" },
      { id: "chapter-2", label: "第二章" },
    ]);
    expect(blocked.blockers.join("")).toContain("已确认");
    expect(blocked.blockers.join("")).toContain("同一章");
    expect(blocked.chapterId).toBeNull();

    const ready = buildProseBrief(document([node("a", 2, 0), node("b", 0, 1)]), ["a", "b"], [{ id: "chapter-1", label: "第一章" }]);
    expect(ready.blockers).toEqual([]);
    expect(ready.nodes.map((item) => item.id)).toEqual(["a", "b"]);
    expect(ready.orderNote).toContain("故事发生顺序是：b，a");
  });

  it("lays the sample arcs out in story order", () => {
    const graph = buildEventGraph(sampleDocument(), "all", {}, new Map([["1", "第1章"], ["2", "第2章"], ["3", "第3章"]]));
    const arcEdges = graph.edges.filter((edge) => edge.type === "story" && edge.from.startsWith("E") && edge.to.startsWith("E"));
    expect(arcEdges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(["E5->E2", "E2->E1", "E1->E3", "E3->E4"]);
    expect(graph.vertices.find((vertex) => vertex.id === "1.1")?.chapter).toBe("第1章");
  });

  it("previews created nodes without treating them as saved", () => {
    const preview = previewProposal({
      status: "draft",
      summary: "补一层",
      patch: {
        outlineId: "outline-1",
        expectedRevision: 1,
        operations: [{
          type: "create_node",
          tempId: "temp-1",
          value: {
            parentId: null,
            kind: "event",
            title: "候选",
            summary: "短",
            structuralRole: "custom",
            narrativeFunction: "mixed",
            goal: "",
            conflict: "",
            outcome: "",
            locationText: "",
            timeText: "",
            storyOrder: 0,
            narrativeOrder: 0,
            status: "draft",
            notes: "",
            participants: [],
          },
        }],
      },
    });
    expect(preview.nodes[0]).toMatchObject({ id: "temp-1", proposal: true, title: "候选" });
    expect(preview.problems).toEqual([]);
  });

  it("reads a markdown document back into the change, participants, and edges", () => {
    const graph = document([
      node("landing", 0),
      { ...node("ridge", 1), title: "揭下西岭" },
    ]);
    const applied = applyNodeDocument(graph, "landing", `# 空降突落地

先记他落地。

## 变化
之前：盆地没有这个人。
之后：他已落地。

## 参与
- 先记空降头达｜经历者｜人｜之前：不在场｜之后：落地
- 雾谷盆地｜场所｜地点
这不是参与者

## 关系
- 因果 → [[揭下西岭]]：落地引起下一拍
- 师徒 → [[没有这个人]]
`);
    expect(applied.issues.map((issue) => issue.message)).toEqual([
      "参与者这一行无法读取：这不是参与者",
      "找不到「没有这个人」",
    ]);
    const landing = applied.document.nodes.find((item) => item.id === "landing");
    expect(landing).toMatchObject({
      title: "空降突落地",
      changeBefore: "盆地没有这个人。",
      changeAfter: "他已落地。",
    });
    expect(landing?.participants.map((person) => person.name)).toEqual(["先记空降头达", "雾谷盆地"]);
    expect(applied.document.relations).toEqual([
      expect.objectContaining({ from: "landing", to: "ridge", type: "causes", description: "落地引起下一拍" }),
    ]);

    const cleared = applyNodeDocument(applied.document, "landing", "# 空降突落地\n\n只留开头。");
    expect(cleared.issues).toEqual([]);
    expect(cleared.document.nodes.find((item) => item.id === "landing")).toMatchObject({
      changeBefore: "",
      changeAfter: "",
      participants: [],
    });
    expect(cleared.document.relations).toEqual([]);
  });
});
