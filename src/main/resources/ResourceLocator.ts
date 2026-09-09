import path from "node:path";

/** Installed resources are located from the application root, never the process cwd. */
export default class ResourceLocator {
  private readonly resourceRoot: string;
  constructor(appRoot: string) {
    this.resourceRoot =
      path.extname(appRoot).toLowerCase() === ".asar" ? `${appRoot}.unpacked` : appRoot;
  }
  get bundledSkillRoot(): string {
    return path.join(this.resourceRoot, "skills");
  }
  get windowIcon(): string {
    return path.join(this.resourceRoot, "assets", "icons", "storyos.png");
  }
}
