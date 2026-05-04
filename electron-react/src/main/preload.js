const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  openFile: (options) => ipcRenderer.invoke('open-file', options),
  getDroppedFiles: (filePaths) => ipcRenderer.invoke('get-dropped-files', filePaths),

  // 本地存储（通过 IndexedDB，不需要 electron-store）
  // db 实例由渲染进程直接使用

  // IPC 事件
  onFileProcessed: (callback) => {
    ipcRenderer.on('file-processed', (event, data) => callback(data));
  },

  removeFileProcessedListener: () => {
    ipcRenderer.removeAllListeners('file-processed');
  },

  // 获取版本信息
  getVersion: () => ipcRenderer.invoke('get-version'),
});

// 平台信息
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
});