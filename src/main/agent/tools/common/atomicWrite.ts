import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeWorkspaceWritePath } from "./path.ts";

export async function atomicWriteTextFile(
  absolutePath: string,
  content: string,
): Promise<void> {
  await assertSafeWorkspaceWritePath(absolutePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await assertSafeWorkspaceWritePath(absolutePath);
  const temporaryPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${crypto.randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch((): void => undefined);
  }
}
