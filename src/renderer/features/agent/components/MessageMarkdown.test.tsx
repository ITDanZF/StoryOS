import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MessageMarkdown from "./MessageMarkdown.tsx";

describe("MessageMarkdown", () => {
  it("renders GFM tables and task lists", () => {
    const html = renderToStaticMarkup(
      <MessageMarkdown content={"| 项目 | 状态 |\n| --- | --- |\n| 第四章 | 完成 |\n\n- [x] 已保存"} />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toContain("第四章");
  });

  it("sanitizes raw html instead of mounting it", () => {
    const html = renderToStaticMarkup(
      <MessageMarkdown content={'<script>alert("x")</script>\n\n安全内容'} />,
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("安全内容");
  });
});
