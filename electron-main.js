'use strict';

/**
 * Electron 主进程
 * 启动内置 GUI 服务并在桌面窗口中展示
 */

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { startServer } = require('./src/server');

let mainWindow = null;
let serverInstance = null;
let serverPort = 0;

/**
 * 查找可用端口并启动 GUI 服务
 */
function startGuiServer() {
  return new Promise((resolve, reject) => {
    // port=0 让操作系统自动分配可用端口
    const server = startServer({
      cwd: app.isPackaged ? process.resourcesPath : process.cwd(),
      port: 0,
      host: '127.0.0.1',
      open: false,
      silent: true
    });

    server.on('listening', () => {
      const addr = server.address();
      serverPort = addr.port;
      resolve(serverPort);
    });

    server.on('error', (err) => {
      reject(err);
    });

    serverInstance = server;
  });
}

/**
 * 创建主窗口
 */
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '可视化版本管理工具',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  // 移除默认菜单（可选）
  Menu.setApplicationMenu(null);

  // 外部链接在系统浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const port = await startGuiServer();
      createWindow(port);
    } catch (err) {
      const { dialog } = require('electron');
      dialog.showErrorBox('启动失败', `GUI 服务启动失败: ${err.message}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (serverInstance) {
      serverInstance.close();
      serverInstance = null;
    }
    app.quit();
  });

  app.on('before-quit', () => {
    if (serverInstance) {
      serverInstance.close();
      serverInstance = null;
    }
  });
}
