'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const api = require('./index');

/**
 * 启动 GUI Web 服务
 * @param {object} options { cwd, port, host, open, silent }
 */
function startServer(options = {}) {
  let currentCwd = options.cwd || process.cwd();
  // README 单独路径配置：null 表示从 currentCwd 自动检测
  let readmePath = null;
  const cfg = api.getConfig(currentCwd);
  const port = options.port || cfg.port || 3000;
  const host = options.host || cfg.host || '127.0.0.1';
  const silent = options.silent || false;

  const app = express();
  app.use(express.json());

  // 静态资源
  const guiDir = path.join(__dirname, '..', 'gui');
  app.use(express.static(guiDir));

  // ============ API 路由 ============

  // 获取配置信息
  app.get('/api/config', (req, res) => {
    try {
      const c = api.getConfig(currentCwd);
      res.json({
        success: true,
        config: {
          files: c.files,
          source: c.source,
          historyFile: c.historyFile,
          port: c.port,
          host: c.host
        },
        cwd: currentCwd
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 切换项目目录
  app.post('/api/cwd', (req, res) => {
    try {
      const { cwd: newCwd } = req.body || {};
      if (!newCwd || typeof newCwd !== 'string') {
        return res.status(400).json({ success: false, error: '缺少 cwd 参数' });
      }
      const resolved = path.resolve(newCwd);
      if (!fs.existsSync(resolved)) {
        return res.status(400).json({ success: false, error: `目录不存在: ${resolved}` });
      }
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return res.status(400).json({ success: false, error: `路径不是目录: ${resolved}` });
      }
      currentCwd = resolved;
      res.json({ success: true, cwd: currentCwd });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 检查版本一致性
  app.get('/api/check', (req, res) => {
    try {
      const result = api.check(currentCwd, { readmePath });
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 同步版本（POST）
  app.post('/api/sync', (req, res) => {
    try {
      const { target, dryRun } = req.body || {};
      const result = api.sync(currentCwd, { target, dryRun, readmePath });
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 更新版本号（POST）
  app.post('/api/update', (req, res) => {
    try {
      const { version } = req.body || {};
      if (!version) {
        return res.status(400).json({ success: false, error: '缺少 version 参数' });
      }
      const result = api.update(version, currentCwd, { readmePath });
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 获取历史记录
  app.get('/api/history', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const records = api.getHistory(currentCwd, { limit });
      res.json({ success: true, records });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 清空历史记录
  app.delete('/api/history', (req, res) => {
    try {
      api.clearHistory(currentCwd);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 校验版本号
  app.get('/api/validate', (req, res) => {
    try {
      const version = req.query.version;
      if (!version) {
        return res.status(400).json({ success: false, error: '缺少 version 参数' });
      }
      const valid = api.validator.isValid(version);
      const parsed = valid ? api.validator.parse(version) : null;
      res.json({ success: true, valid, parsed });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 获取 README 路径配置
  app.get('/api/readme/path', (req, res) => {
    res.json({
      success: true,
      readmePath,
      cwd: currentCwd,
      auto: readmePath === null
    });
  });

  // 设置 README 路径配置
  // 传入 { path: '' } 或 { path: null } 清除自定义路径，恢复自动检测
  app.post('/api/readme/path', (req, res) => {
    try {
      const { path: requestedPath } = req.body || {};
      // 清除自定义路径
      if (requestedPath === null || requestedPath === '' || requestedPath === undefined) {
        readmePath = null;
        return res.json({ success: true, readmePath: null, auto: true });
      }
      if (typeof requestedPath !== 'string') {
        return res.status(400).json({ success: false, error: 'path 参数必须为字符串' });
      }
      const resolved = path.resolve(requestedPath);
      if (!fs.existsSync(resolved)) {
        return res.status(400).json({ success: false, error: `文件不存在: ${resolved}` });
      }
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        return res.status(400).json({ success: false, error: `路径不是文件: ${resolved}` });
      }
      readmePath = resolved;
      res.json({ success: true, readmePath, auto: false });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 获取 README.md 内容
  // 优先使用自定义路径，否则在项目根目录大小写不敏感查找
  app.get('/api/readme', (req, res) => {
    try {
      let targetPath = null;
      let source = 'auto'; // 标识来源：custom / auto

      // 1. 优先使用自定义路径
      if (readmePath) {
        if (fs.existsSync(readmePath)) {
          const stat = fs.statSync(readmePath);
          if (stat.isFile()) {
            targetPath = readmePath;
            source = 'custom';
          }
        }
      }

      // 2. 自动检测：在项目根目录大小写不敏感查找
      if (!targetPath) {
        const candidates = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'Readme.MD'];
        for (const name of candidates) {
          const p = path.join(currentCwd, name);
          if (fs.existsSync(p)) {
            const stat = fs.statSync(p);
            if (stat.isFile()) {
              targetPath = p;
              source = 'auto';
              break;
            }
          }
        }
      }

      if (!targetPath) {
        const hint = readmePath
          ? `自定义 README 路径无效（${readmePath}），且项目根目录下也未找到 README.md。请确认文件是否存在。`
          : `未在项目根目录找到 README.md 文件。请确认 README.md 是否存在，并位于项目根目录：${currentCwd}`;
        return res.status(404).json({
          success: false,
          error: hint,
          cwd: currentCwd,
          readmePath
        });
      }

      const content = fs.readFileSync(targetPath, 'utf8');
      res.json({
        success: true,
        path: targetPath,
        source,
        cwd: currentCwd,
        content
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: `读取 README.md 失败: ${err.message}`,
        cwd: currentCwd
      });
    }
  });

  // 默认返回 index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(guiDir, 'index.html'));
  });

  const server = app.listen(port, host, () => {
    // 绑定失败时 address() 返回 null（错误已由 'error' 事件处理）
    const addr = server.address();
    if (!addr) {
      return;
    }
    const actualPort = addr.port;
    const url = `http://${host}:${actualPort}`;
    if (!silent) {
      console.log('');
      console.log('══════════════════════════════════════════');
      console.log('  可视化版本管理工具 GUI 已启动');
      console.log('══════════════════════════════════════════');
      console.log(`  监控目录: ${currentCwd}`);
      console.log(`  访问地址: ${url}`);
      console.log(`  按 Ctrl+C 停止服务`);
      console.log('══════════════════════════════════════════');
      console.log('');
    }

    if (options.open) {
      openBrowser(url);
    }
  });

  // 错误监听需在 listen 之前注册，避免绑定失败时漏接 error 事件
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用，请使用 --port 指定其他端口`);
    } else {
      console.error(`服务启动失败: ${err.message}`);
    }
    if (!silent) {
      process.exit(1);
    }
  });

  return server;
}

/**
 * 跨平台打开浏览器
 */
function openBrowser(url) {
  const { exec } = require('child_process');
  let cmd;
  switch (process.platform) {
    case 'darwin':
      cmd = `open "${url}"`;
      break;
    case 'win32':
      cmd = `start "" "${url}"`;
      break;
    default:
      cmd = `xdg-open "${url}"`;
  }
  exec(cmd, () => {});
}

module.exports = { startServer };
