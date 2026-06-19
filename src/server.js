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
  const cwd = options.cwd || process.cwd();
  const cfg = api.getConfig(cwd);
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
      const c = api.getConfig(cwd);
      res.json({
        success: true,
        config: {
          files: c.files,
          source: c.source,
          historyFile: c.historyFile,
          port: c.port,
          host: c.host
        },
        cwd
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 检查版本一致性
  app.get('/api/check', (req, res) => {
    try {
      const result = api.check(cwd);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 同步版本（POST）
  app.post('/api/sync', (req, res) => {
    try {
      const { target, dryRun } = req.body || {};
      const result = api.sync(cwd, { target, dryRun });
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
      const result = api.update(version, cwd);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 获取历史记录
  app.get('/api/history', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const records = api.getHistory(cwd, { limit });
      res.json({ success: true, records });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 清空历史记录
  app.delete('/api/history', (req, res) => {
    try {
      api.clearHistory(cwd);
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

  // 默认返回 index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(guiDir, 'index.html'));
  });

  const server = app.listen(port, host, () => {
    const actualPort = server.address().port;
    const url = `http://${host}:${actualPort}`;
    if (!silent) {
      console.log('');
      console.log('══════════════════════════════════════════');
      console.log('  可视化版本管理工具 GUI 已启动');
      console.log('══════════════════════════════════════════');
      console.log(`  监控目录: ${cwd}`);
      console.log(`  访问地址: ${url}`);
      console.log(`  按 Ctrl+C 停止服务`);
      console.log('══════════════════════════════════════════');
      console.log('');
    }

    if (options.open) {
      openBrowser(url);
    }
  });

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
