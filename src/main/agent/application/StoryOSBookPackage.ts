import { createHash } from "node:crypto";
import {
  MAX_STORYOS_BOOK_PACKAGE_BYTES,
  STORYOS_BOOK_FORMAT_VERSION,
  type StoryOSBookChecksums,
  type StoryOSBookManifest,
} from "./bookTransferContracts.ts";

type PackageEnvelope = {
  readonly container: "storyos-book-package";
  readonly containerVersion: 1;
  readonly files: Readonly<Record<string, string>>;
};

const PACKAGE_FILES = Object.freeze([
  "manifest.json",
  "book.sqlite",
  "checksums.json",
]);

export function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createStoryOSBookPackage(
  manifest: StoryOSBookManifest,
  database: Buffer,
): Buffer {
  const manifestContent = Buffer.from(JSON.stringify(manifest), "utf8");
  const checksums: StoryOSBookChecksums = Object.freeze({
    algorithm: "sha256",
    files: Object.freeze({
      "manifest.json": sha256(manifestContent),
      "book.sqlite": sha256(database),
    }),
  });
  const envelope: PackageEnvelope = Object.freeze({
    container: "storyos-book-package",
    containerVersion: 1,
    files: Object.freeze({
      "manifest.json": manifestContent.toString("base64"),
      "book.sqlite": database.toString("base64"),
      "checksums.json": Buffer.from(JSON.stringify(checksums), "utf8").toString("base64"),
    }),
  });
  const result = Buffer.from(JSON.stringify(envelope), "utf8");
  if (result.byteLength > MAX_STORYOS_BOOK_PACKAGE_BYTES) {
    throw new Error("StoryOS book package exceeds the maximum size.");
  }
  return result;
}

export function readStoryOSBookPackage(content: Buffer): {
  readonly manifest: StoryOSBookManifest;
  readonly database: Buffer;
} {
  if (content.byteLength > MAX_STORYOS_BOOK_PACKAGE_BYTES) {
    throw new Error("StoryOS book package exceeds the maximum size.");
  }
  const envelope = JSON.parse(content.toString("utf8")) as PackageEnvelope;
  if (
    envelope?.container !== "storyos-book-package" ||
    envelope.containerVersion !== 1 ||
    !envelope.files || typeof envelope.files !== "object"
  ) {
    throw new Error("Invalid StoryOS book package container.");
  }
  const fileNames = Object.keys(envelope.files).sort();
  if (fileNames.length !== PACKAGE_FILES.length ||
      fileNames.some((name, index) => name !== [...PACKAGE_FILES].sort()[index])) {
    throw new Error("StoryOS book package contains an invalid file list.");
  }
  for (const name of fileNames) {
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
      throw new Error(`Unsafe StoryOS book package path: ${name}`);
    }
    if (typeof envelope.files[name] !== "string") {
      throw new Error(`Invalid StoryOS book package entry: ${name}`);
    }
  }
  const manifestContent = Buffer.from(envelope.files["manifest.json"], "base64");
  const manifest = JSON.parse(manifestContent.toString("utf8")) as StoryOSBookManifest;
  if (
    manifest?.format !== "storyos-book" ||
    manifest.formatVersion !== STORYOS_BOOK_FORMAT_VERSION ||
    typeof manifest.sourceBookId !== "string" ||
    typeof manifest.title !== "string" || !manifest.title.trim() ||
    typeof manifest.exportedAt !== "string" ||
    typeof manifest.applicationVersion !== "string" ||
    !Number.isInteger(manifest.databaseApplicationId) ||
    !Number.isInteger(manifest.databaseUserVersion)
  ) {
    throw new Error("Invalid StoryOS book manifest.");
  }
  const checksums = JSON.parse(
    Buffer.from(envelope.files["checksums.json"], "base64").toString("utf8"),
  ) as StoryOSBookChecksums;
  const database = Buffer.from(envelope.files["book.sqlite"], "base64");
  if (
    checksums?.algorithm !== "sha256" ||
    typeof checksums.files?.["manifest.json"] !== "string" ||
    typeof checksums.files?.["book.sqlite"] !== "string" ||
    checksums.files["manifest.json"] !== sha256(manifestContent) ||
    checksums.files["book.sqlite"] !== sha256(database)
  ) {
    throw new Error("StoryOS book package checksum mismatch.");
  }
  return Object.freeze({ manifest: Object.freeze(manifest), database });
}
