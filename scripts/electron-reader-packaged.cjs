const { app, BrowserWindow } = require("electron");
// Keep the isolated verification application hidden. Product code remains unchanged.
BrowserWindow.prototype.show = function () {};
app.getAppPath = () => process.env.STORYOS_READER_ASAR;
app.setPath("userData", require("node:path").join(process.env.MINI_AGENT_HOME, "electron-profile"));
app.on("web-contents-created", (_, contents) => {
  contents.openDevTools = function () {};
  contents.setBackgroundThrottling(false);
  contents.on("preload-error", (_, preloadPath, error) => console.error("Reader test preload error:", preloadPath, error));
});
require(process.env.STORYOS_READER_ASAR);
