'use strict';

/**
 * 版本管理工具 - 主 API 模块
 * 整合各子模块，对外提供统一接口
 */

const config = require('./config');
const checker = require('./checker');
const syncer = require('./syncer');
const history = require('./history');
const validator = require('./validator');

/**
 * 检查版本一致性
 * @param {string} cwd 工作目录
 * @returns {object} 检查结果
 */
function check(cwd = process.cwd()) {
  const cfg = config.loadConfig(cwd);
  return checker.checkVersions(cfg, cwd);
}

/**
 * 同步版本号（以 source 为基准）
 * @param {string} cwd 工作目录
 * @param {object} options { target?, dryRun? }
 * @returns {object} 同步结果
 */
function sync(cwd = process.cwd(), options = {}) {
  const cfg = config.loadConfig(cwd);
  const result = syncer.syncVersions(cfg, cwd, options);

  // 记录历史
  if (result.success && !options.dryRun) {
    const changedFiles = result.results
      .filter((r) => r.changed)
      .map((r) => ({ path: r.path, before: r.before, after: r.after }));
    if (changedFiles.length > 0) {
      history.addRecord(cwd, cfg.historyFile, {
        action: 'sync',
        before: changedFiles[0]?.before || null,
        after: result.targetVersion,
        details: `同步 ${changedFiles.length} 个文件到版本 ${result.targetVersion}`,
        files: changedFiles
      });
    }
  }
  return result;
}

/**
 * 更新版本号（设置新版本并同步）
 * @param {string} newVersion 新版本号
 * @param {string} cwd 工作目录
 * @returns {object} 更新结果
 */
function update(newVersion, cwd = process.cwd()) {
  const cfg = config.loadConfig(cwd);
  const result = syncer.updateVersion(cfg, cwd, newVersion);

  if (result.success) {
    const changedFiles = result.results
      .filter((r) => r.changed)
      .map((r) => ({ path: r.path, before: r.before, after: r.after }));
    history.addRecord(cwd, cfg.historyFile, {
      action: 'update',
      before: result.sourceBefore,
      after: result.targetVersion,
      details: `版本号从 ${result.sourceBefore || '(空)'} 更新为 ${result.targetVersion}`,
      files: changedFiles
    });
  }
  return result;
}

/**
 * 获取历史记录
 * @param {string} cwd 工作目录
 * @param {object} options { limit? }
 * @returns {Array}
 */
function getHistory(cwd = process.cwd(), options = {}) {
  const cfg = config.loadConfig(cwd);
  return history.getHistory(cwd, cfg.historyFile, options);
}

/**
 * 清空历史记录
 * @param {string} cwd 工作目录
 */
function clearHistory(cwd = process.cwd()) {
  const cfg = config.loadConfig(cwd);
  history.clearHistory(cwd, cfg.historyFile);
}

/**
 * 加载配置
 * @param {string} cwd
 * @returns {object}
 */
function getConfig(cwd = process.cwd()) {
  return config.loadConfig(cwd);
}

module.exports = {
  check,
  sync,
  update,
  getHistory,
  clearHistory,
  getConfig,
  validator,
  checker,
  syncer,
  history,
  config
};
