import { describe, expect, it } from "vitest";
import { parseStoryDocument, renderStoryDocument, replaceRelationSection } from "./storyDocument.ts";

const landing = `# 空降突落地

先记空降头达出现。这一格只写他落地。

## 变化
之前：雾谷盆地没有这个人。
之后：他已落在盆地北缘，身份未明。
价值：安稳 → 暴露

## 参与
- 先记空降头达｜经历者｜人｜之前：不在场｜之后：落地，来历未写
- 雾谷盆地｜场所｜地点

## 关系
- 因果 → [[揭下西岭]]：落地使他能够揭开西岭

## 叙述
读者此时只看见落地。正文里的 [[另一处]] 不是边。

## 线索
来历留到后文。`;

describe("story document", () => {
  it("reads a change, open participants, and only the relation section", () => {
    const parsed = parseStoryDocument(landing);
    expect(parsed.issues).toEqual([]);
    expect(parsed.title).toBe("空降突落地");
    expect(parsed.lead).toBe("先记空降头达出现。这一格只写他落地。");
    expect(parsed.changeBefore).toBe("雾谷盆地没有这个人。");
    expect(parsed.changeAfter).toBe("他已落在盆地北缘，身份未明。");
    expect(parsed.participants).toEqual([
      { name: "先记空降头达", role: "经历者", kind: "人", stateBefore: "不在场", stateAfter: "落地，来历未写" },
      { name: "雾谷盆地", role: "场所", kind: "地点", stateBefore: "", stateAfter: "" },
    ]);
    expect(parsed.relations).toEqual([
      { type: "causes", direction: "out", otherTitle: "揭下西岭", description: "落地使他能够揭开西岭" },
    ]);
  });

  it("clears a section when its heading is removed and keeps an unknown relation word", () => {
    const parsed = parseStoryDocument("# 只剩变化\n\n## 变化\n之后：门开了\n\n## 关系\n- 师徒 → [[下山]]");
    expect(parsed.changeBefore).toBe("");
    expect(parsed.changeAfter).toBe("门开了");
    expect(parsed.participants).toEqual([]);
    expect(parsed.relations).toEqual([{ type: "师徒", direction: "out", otherTitle: "下山", description: "" }]);
  });

  it("reports a repeated change and an unreadable participant without inventing a row", () => {
    const parsed = parseStoryDocument("# 坏文档\n\n## 变化\n之前：甲\n之前：乙\n\n## 参与\n- ｜经历者\n这不是列表");
    expect(parsed.issues).toEqual([
      { message: "「之前」写了两次", blocking: true },
      { message: "参与者缺少名字", blocking: false },
      { message: "参与者这一行无法读取：这不是列表", blocking: false },
    ]);
    expect(parsed.participants).toEqual([]);
  });

  it("round-trips the reserved sections and can replace only the relations", () => {
    const rendered = renderStoryDocument({
      title: "空降突落地",
      lead: "先记他落地。",
      changeBefore: "盆地没有这个人。",
      changeAfter: "他已落地。",
      participants: [{ name: "雾谷盆地", role: "场所", kind: "地点", stateBefore: "", stateAfter: "" }],
      relations: [{ type: "causes", direction: "out", otherTitle: "揭下西岭", description: "落地引起下一拍" }],
      telling: "读者只看见落地。",
    });
    const parsed = parseStoryDocument(rendered);
    expect(parsed.issues).toEqual([]);
    expect(parsed.changeAfter).toBe("他已落地。");
    expect(parsed.relations[0]).toMatchObject({ type: "causes", otherTitle: "揭下西岭" });
    const replaced = replaceRelationSection(rendered, [
      { type: "accompanies", direction: "in", otherTitle: "西侧枪声", description: "" },
    ]);
    expect(parseStoryDocument(replaced).relations).toEqual([
      { type: "accompanies", direction: "in", otherTitle: "西侧枪声", description: "" },
    ]);
    expect(replaced).toContain("## 叙述");
    expect(replaced).not.toContain("揭下西岭");
  });
});
