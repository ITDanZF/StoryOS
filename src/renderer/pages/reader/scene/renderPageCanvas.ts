/** Rasterize the controlled page with Chromium's own HTML layout, including CJK shaping.
 * No external resources or arbitrary imported HTML enter this tree (see readerPagination).
 */
export async function renderPageCanvas(element: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  const clone = element.cloneNode(true) as HTMLElement;
  const sourceNodes = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  sourceNodes.forEach((source, index) => {
    const style = getComputedStyle(source);
    for (const property of style) cloneNodes[index].style.setProperty(property, style.getPropertyValue(property));
    cloneNodes[index].removeAttribute("href");
  });
  clone.querySelector(".reader-semantic-text")?.remove();
  Object.assign(clone.style, { position: "relative", top: "0", left: "0", margin: "0", transform: "none", visibility: "visible" });
  const logicalWidth = element.offsetWidth, logicalHeight = element.offsetHeight;
  const width = Math.round(logicalWidth * scale); const height = Math.round(logicalHeight * scale);
  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${logicalWidth} ${logicalHeight}"><foreignObject width="${logicalWidth}" height="${logicalHeight}">${markup}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法建立书页画布。");
    context.drawImage(image, 0, 0);
    // An unsupported foreignObject must fall back, never produce an invisible/tainted page.
    if (context.getImageData(10, 10, 1, 1).data[3] < 250) throw new Error("当前图形环境无法绘制书页纹理。");
    return canvas;
  } finally { image.src = ""; }
}

