const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// 保持窗口引用，防止被垃圾回收
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      // 启用 Node.js 和上下文隔离
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // macOS 原生窗口样式
    frame: true,
    titleBarStyle: 'default',
    // 应用图标（可选）
    icon: path.join(__dirname, '../assets/icon.png')
  });

  // 开发模式加载本地 React 开发服务器
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // 开发模式打开 DevTools
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载构建后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron 初始化
app.whenReady().then(() => {
  createWindow();

  // macOS 点击 dock 图标时重建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理程序

// 打开文件选择对话框
ipcMain.handle('open-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md', 'pptx'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

// 获取版本信息
ipcMain.handle('get-version', () => {
  return app.getVersion();
});