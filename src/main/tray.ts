import { app, Menu, Tray, nativeImage, BrowserWindow } from "electron";
import "./electron-types";
import * as path from "path";

let tray: Tray | null = null;

export function setupTray(mainWindow: BrowserWindow): void {
  // Create tray icon (use a simple icon for now)
  const iconPath = path.join(__dirname, "../../resources/icon.png");

  // Fallback to empty icon if file doesn't exist
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Create a simple 16x16 colored icon as fallback
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Simple Local");

  const updateContextMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Window",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);

    tray?.setContextMenu(contextMenu);
  };

  updateContextMenu();

  // Click to show window
  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Handle window close - minimize to tray instead
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Call this before app.quit()
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
