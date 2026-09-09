export type ResourceDisposer = () => void | Promise<void>;

/** An owning scope. Borrowed resources must only register their lease disposer. */
export default class ResourceScope {
  private readonly entries: { name: string; dispose: ResourceDisposer }[] = [];
  private closing: Promise<void> | null = null;
  add(name: string, dispose: ResourceDisposer): void {
    if (this.closing) throw new Error(`Resource scope is closing: ${name}`);
    this.entries.push({ name, dispose });
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = Promise.resolve().then(async () => {
      const errors: Error[] = [];
      for (const entry of this.entries.splice(0).reverse()) {
        try {
          await entry.dispose();
        } catch (cause) {
          errors.push(new Error(`Unable to close ${entry.name}`, { cause }));
        }
      }
      if (errors.length) throw new AggregateError(errors, "Resource cleanup failed");
    });
    return this.closing;
  }
}
