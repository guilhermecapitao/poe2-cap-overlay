import { app, BrowserWindow, ipcMain, globalShortcut, screen, IpcMainInvokeEvent } from 'electron';

import * as path from 'path';
import * as fs from 'fs';
import type { Run, Settings, StoreData, QuestData, QuestProgressPayload, SkipQuestPayload } from './src/types';

// Simple JSON-based storage
class SimpleStore {
  private dataPath: string = '';
  private data: Partial<StoreData> = {};
  private initialized: boolean = false;

  init(): void {
    if (this.initialized) return;
    this.dataPath = path.join(app.getPath('userData'), 'store.json');
    this.data = this.load();
    this.initialized = true;
  }

  private load(): Partial<StoreData> {
    try {
      if (fs.existsSync(this.dataPath)) {
        return JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading store:', error);
    }
    return {};
  }

  private save(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving store:', error);
    }
  }

  get<K extends keyof StoreData>(key: K, defaultValue: StoreData[K]): StoreData[K] {
    return (this.data[key] as StoreData[K]) ?? defaultValue;
  }

  set<K extends keyof StoreData>(key: K, value: StoreData[K]): void {
    this.data[key] = value;
    this.save();
  }
}

const store = new SimpleStore();

let mainWindow: Electron.BrowserWindow | null = null;
let overlayWindow: Electron.BrowserWindow | null = null;

// Default settings
const defaultSettings: Settings = {
  language: 'pt',
  overlayHotkey: 'Alt+F',
  overlayOpacity: 0.9,
  overlayWidth: 400,
  overlayHeight: 600,
  overlayPosition: { x: 0, y: 0 },
  skippedQuests: {}
};

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  mainWindow.loadFile('src/main/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Dev tools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

function createOverlayWindow(): void {
  const settings: Settings = { ...defaultSettings, ...store.get('settings', defaultSettings) };
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: settings.overlayWidth,
    height: settings.overlayHeight,
    x: settings.overlayPosition.x || Math.floor(width - settings.overlayWidth - 20),
    y: settings.overlayPosition.y || 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  overlayWindow.loadFile('src/overlay/index.html');

  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.setOpacity(settings.overlayOpacity);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Save position on move
  overlayWindow.on('move', () => {
    if (overlayWindow) {
      const position = overlayWindow.getPosition();
      const currentSettings = store.get('settings', defaultSettings);
      store.set('settings', {
        ...currentSettings,
        overlayPosition: { x: position[0], y: position[1] }
      });
    }
  });

  // Save size on resize
  overlayWindow.on('resize', () => {
    if (overlayWindow) {
      const size = overlayWindow.getSize();
      const currentSettings = store.get('settings', defaultSettings);
      store.set('settings', {
        ...currentSettings,
        overlayWidth: size[0],
        overlayHeight: size[1]
      });
    }
  });
}

function toggleOverlay(): void {
  if (!overlayWindow) {
    createOverlayWindow();
  }

  if (overlayWindow?.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow?.show();
  }
}

function registerShortcuts(): void {
  const settings: Settings = { ...defaultSettings, ...store.get('settings', defaultSettings) };

  try {
    globalShortcut.unregisterAll();
    globalShortcut.register(settings.overlayHotkey, () => {
      toggleOverlay();
    });
  } catch (error) {
    console.error('Error registering shortcut:', error);
  }
}

// IPC Handlers
ipcMain.handle('get-runs', (): Run[] => {
  return store.get('runs', []);
});

ipcMain.handle('save-run', (_event: IpcMainInvokeEvent, run: Run): Run[] => {
  const runs = store.get('runs', []);
  const index = runs.findIndex(r => r.id === run.id);

  if (index >= 0) {
    runs[index] = run;
  } else {
    runs.push(run);
  }

  store.set('runs', runs);
  return runs;
});

ipcMain.handle('delete-run', (_event: IpcMainInvokeEvent, runId: string): Run[] => {
  const runs = store.get('runs', []);
  const filtered = runs.filter(r => r.id !== runId);
  store.set('runs', filtered);
  return filtered;
});

ipcMain.handle('get-active-run', (): string | null => {
  return store.get('activeRun', null);
});

ipcMain.handle('set-active-run', (_event: IpcMainInvokeEvent, runId: string | null): string | null => {
  store.set('activeRun', runId);

  // Notify overlay about change
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('active-run-changed', runId);
  }

  return runId;
});

ipcMain.handle('get-settings', (): Settings => {
  return { ...defaultSettings, ...store.get('settings', defaultSettings) };
});

ipcMain.handle('save-settings', (_event: IpcMainInvokeEvent, settings: Settings): Settings => {
  store.set('settings', settings);

  // Re-register shortcuts if changed
  if (settings.overlayHotkey) {
    registerShortcuts();
  }

  // Update overlay opacity
  if (overlayWindow && !overlayWindow.isDestroyed() && settings.overlayOpacity) {
    overlayWindow.setOpacity(settings.overlayOpacity);
  }

  return settings;
});

ipcMain.handle('toggle-overlay', (): void => {
  toggleOverlay();
});

ipcMain.handle('get-quest-data', (): QuestData => {
  // In production (packaged), data is in resources/data/
  // In development, data is at ../data/ relative to dist/
  const isProd = app.isPackaged;
  const questDataPath = isProd
    ? path.join(process.resourcesPath, 'data/quests.json')
    : path.join(__dirname, '../data/quests.json');

  try {
    const data = fs.readFileSync(questDataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading quest data:', error);
    return { acts: [] };
  }
});

ipcMain.handle('update-quest-progress', (_event: IpcMainInvokeEvent, payload: QuestProgressPayload): Run | undefined => {
  const { runId, questId, completed } = payload;
  const runs = store.get('runs', []);
  const run = runs.find(r => r.id === runId);

  if (run) {
    if (!run.completedQuests) {
      run.completedQuests = {};
    }
    run.completedQuests[questId] = completed;
    store.set('runs', runs);

    // Notify both windows about quest progress
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('quest-progress-updated', { questId, completed });
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('quest-progress-updated', { questId, completed });
    }
  }

  return run;
});

ipcMain.handle('skip-quest', (_event: IpcMainInvokeEvent, payload: SkipQuestPayload): string[] => {
  const { runId, questId } = payload;
  const settings = store.get('settings', defaultSettings);
  const skippedQuests = settings.skippedQuests || {};

  if (!skippedQuests[runId]) {
    skippedQuests[runId] = [];
  }

  if (!skippedQuests[runId].includes(questId)) {
    skippedQuests[runId].push(questId);
  }

  settings.skippedQuests = skippedQuests;
  store.set('settings', settings);

  return skippedQuests[runId];
});

ipcMain.handle('unskip-quest', (_event: IpcMainInvokeEvent, payload: SkipQuestPayload): string[] => {
  const { runId, questId } = payload;
  const settings = store.get('settings', defaultSettings);
  const skippedQuests = settings.skippedQuests || {};

  if (skippedQuests[runId]) {
    skippedQuests[runId] = skippedQuests[runId].filter(id => id !== questId);
  }

  settings.skippedQuests = skippedQuests;
  store.set('settings', settings);

  return skippedQuests[runId] || [];
});

ipcMain.handle('get-skipped-quests', (_event: IpcMainInvokeEvent, runId: string): string[] => {
  const settings = store.get('settings', defaultSettings);
  const skippedQuests = settings.skippedQuests || {};
  return skippedQuests[runId] || [];
});

ipcMain.handle('reset-run-progress', (_event: IpcMainInvokeEvent, runId: string): Run | undefined => {
  const runs = store.get('runs', []);
  const run = runs.find(r => r.id === runId);

  if (run) {
    run.completedQuests = {};
    run.timerElapsed = 0;
    store.set('runs', runs);

    // Clear skipped quests for this run
    const settings = store.get('settings', defaultSettings);
    const skippedQuests = settings.skippedQuests || {};
    delete skippedQuests[runId];
    settings.skippedQuests = skippedQuests;
    store.set('settings', settings);

    // Notify overlay
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('run-reset', runId);
    }
  }

  return run;
});

ipcMain.handle('update-opacity-realtime', (_event: IpcMainInvokeEvent, opacity: number): void => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setOpacity(opacity);
  }
});

ipcMain.handle('reload-windows', (): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.reload();
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.reload();
  }
});

// App lifecycle
app.whenReady().then(() => {
  store.init();
  createMainWindow();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
