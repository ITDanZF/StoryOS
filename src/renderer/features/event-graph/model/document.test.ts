import { describe, expect, it } from "vitest";
import { buildEventGraph } from "./buildEventGraph.ts";
import {
  buildProseBrief,
  planNextNode,
  previewProposal,
  sampleDocument,
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
    structuralRole: "custom",
    narrativeFunction: "mixed",
    goal: `${id}目标`,
    conflict: `${id}冲突`,
    outcome: "",
    locationText: "",
    timeText: "",
    storyOrder,
    narrativeOrder,
    status: "confirmed",
    notes: "",
    participants: [],
    chapterId: "chapter-1",
    proposal: false,
  };
}

function document(nodes: readonly GraphNode[]): GraphDocument {
  return { source: "outline", outlineId: "outline-1", revision: 1, title: "总纲", nodes, relations: [] };
}

describe("event graph document", () => {
  it("inserts the next sibling immediately after the current story beat", () => {
    const planned = planNextNode(document([node("a", 0), node("b", 1), node("c", 2)]), "a", {
      title: "新拍",
      summary: "",
      goal: "接上",
      conflict: "来不及",
      outcome: "",
      timeText: "",
      locationText: "",
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
            goal: "目标",
            conflict: "冲突",
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
});
