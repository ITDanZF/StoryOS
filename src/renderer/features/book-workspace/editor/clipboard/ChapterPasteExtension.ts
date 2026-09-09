import { Extension } from "@tiptap/core";

const ALLOWED_STYLE_PROPERTIES = new Set([
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-align",
  "text-decoration",
]);

function isSafeHref(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("#") ||
    normalized.startsWith("/");
}

function sanitizeStyle(element: HTMLElement): void {
  const declarations: string[] = [];
  for (const property of ALLOWED_STYLE_PROPERTIES) {
    const value = element.style.getPropertyValue(property).trim();
    if (!value || /expression|url\s*\(/i.test(value)) continue;
    declarations.push(`${property}: ${value}`);
  }
  if (declarations.length > 0) {
    element.setAttribute("style", declarations.join("; "));
  } else {
    element.removeAttribute("style");
  }
}

export function sanitizeChapterPastedHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style, link, meta, iframe, object, embed")
    .forEach((element) => element.remove());
  const comments = document.createNodeIterator(
    document.body,
    NodeFilter.SHOW_COMMENT,
  );
  const commentNodes: Comment[] = [];
  let comment: Node | null;
  while ((comment = comments.nextNode())) commentNodes.push(comment as Comment);
  commentNodes.forEach((node) => node.remove());

  document.body.querySelectorAll<HTMLElement>("*").forEach((element) => {
    sanitizeStyle(element);
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLocaleLowerCase("en-US");
      if (name === "style") continue;
      if (element.tagName === "A" && name === "href") {
        if (!isSafeHref(attribute.value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (element.tagName === "A" && name === "target") continue;
      element.removeAttribute(attribute.name);
    }
  });
  document.querySelectorAll("o\\:p").forEach((element) => element.remove());
  return document.body.innerHTML;
}

const ChapterPasteExtension = Extension.create({
  name: "chapterPaste",
  priority: 900,

  transformPastedHTML(html) {
    return sanitizeChapterPastedHtml(html);
  },
});

export default ChapterPasteExtension;
