export const INSTANCE_IPC_CHANNELS = Object.freeze({
  snapshot: "instance:snapshot",
  create: "instance:create",
  configuration: "instance:configuration",
  updateConfiguration: "instance:configuration-update",
  open: "instance:open",
  rename: "instance:rename",
  relocate: "instance:relocate",
  remove: "instance:remove",
  reveal: "instance:reveal",
  returnToPanel: "instance:return-to-panel",
} as const);
