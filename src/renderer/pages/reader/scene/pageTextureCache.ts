import { CanvasTexture, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter } from "three";
import { renderPageCanvas } from "./renderPageCanvas.ts";

/** Page surfaces survive turns. Active sets are pinned; CPU canvases count as well as GPU mipmaps. */
export class PageTextureCache {
  private entries = new Map<string, { texture: CanvasTexture; bytes: number }>();
  private pending = new Map<string, Promise<CanvasTexture>>();
  private pins = new Set<string>();
  private disposed = false;
  constructor(private budget = 128 * 1024 * 1024) {}
  pin(keys: string[]) { this.pins = new Set(keys); this.trim(0); }
  get bytes() { return [...this.entries.values()].reduce((sum, item) => sum + item.bytes, 0); }
  async get(key: string, element: HTMLElement, scale: number): Promise<CanvasTexture> {
    const current = this.entries.get(key);
    if (current) { this.entries.delete(key); this.entries.set(key, current); return current.texture; }
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.disposed) throw new Error("书页缓存已关闭。");
    const request = this.create(key, element, scale); this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }
  private async create(key: string, element: HTMLElement, scale: number) {
    const canvas = await renderPageCanvas(element, scale);
    // CPU RGBA source + GPU RGBA with mip chain. Framebuffers/shadows are separate.
    const bytes = Math.ceil(canvas.width * canvas.height * 4 * (1 + 4 / 3));
    if (this.disposed) { canvas.width = canvas.height = 0; throw new Error("书页准备已取消。"); }
    this.trim(bytes);
    if (this.bytes + bytes > this.budget) { canvas.width = canvas.height = 0; throw new Error("当前画质超出书页缓存预算，请使用文本模式。"); }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace; texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
    this.entries.set(key, { texture, bytes });
    return texture;
  }
  private trim(incoming: number) {
    for (const key of this.entries.keys()) {
      if (this.bytes + incoming <= this.budget) break;
      if (!this.pins.has(key)) this.release(key);
    }
  }
  private release(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.texture.dispose(); entry.texture.image.width = entry.texture.image.height = 0;
    this.entries.delete(key);
  }
  dispose() { this.disposed = true; for (const key of this.entries.keys()) this.release(key); this.pins.clear(); }
}
