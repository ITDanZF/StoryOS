/** Preview is an explicit development capability; missing desktop APIs never simulate success. */
export async function initializeFrontend() {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(location.search).has("preview")
  ) {
    await import("../platform/preview/previewAgentApi.ts");
    await import("../platform/preview/previewInstanceApi.ts");
    await import("../platform/preview/previewWindowApi.ts");
  }
}
