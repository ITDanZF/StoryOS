const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await window.loadURL(process.env.STORYOS_TEST_URL);
});

app.on("window-all-closed", () => app.quit());
