export type InstanceErrorCode =
  | "INSTANCE_NOT_FOUND"
  | "INSTANCE_PATH_MISSING"
  | "INSTANCE_PATH_CONFLICT"
  | "INSTANCE_METADATA_INVALID"
  | "INSTANCE_BUSY"
  | "INSTANCE_SWITCH_IN_PROGRESS"
  | "INSTANCE_NOT_OPEN"
  | "INSTANCE_OPEN_FAILED"
  | "INSTANCE_RECOVERY_FAILED";

export class InstanceError extends Error {
  constructor(
    readonly code: InstanceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "InstanceError";
  }
}
