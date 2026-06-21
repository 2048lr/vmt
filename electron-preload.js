'use strict';

/**
 * Electron 预加载脚本
 * 在沙箱环境下通过 contextBridge 暴露安全的 API 给渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 弹出原生文件夹选择对话框，返回选中目录的绝对路径或 null
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  // 弹出原生文件选择对话框，返回选中文件的绝对路径或 null
  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),
  // 判断是否处于 Electron 环境
  isElectron: true
});
