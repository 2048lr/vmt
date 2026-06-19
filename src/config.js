'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 配置加载模块
 * 支持自定义需要检查版本号的文件路径
 */

const DEFAULT_CONFIG_FILES = ['.versionrc', '.versionrc.json', '.versionrc.js'];

const DEFAULT_CONFIG = {
  // 默认检查的目标文件列表
  files: [
    { path: 'package.json', field: 'version', type: 'json' },
    { path: 'package-lock.json', field: 'version', type: 'json-root' },
    { path: 'README.md', pattern: /version[:\s-]*`?\[?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`()\]]*`?\]?/i, type: 'markdown' }
  ],
  // 以哪个文件作为版本同步的基准源
  source: 'package.json',
  // 历史记录文件路径
  historyFile: '.version-history.json',
  // GUI 服务端口
  port: 3000,
  // GUI 服务主机
  host: '127.0.0.1'
};

/**
 * 在指定目录中查找配置文件
 * @param {string} cwd 工作目录
 * @returns {string|null}
 */
function findConfigFile(cwd) {
  for (const name of DEFAULT_CONFIG_FILES) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * 加载配置文件并与默认配置合并
 * @param {string} cwd 工作目录，默认当前目录
 * @returns {object} 合并后的配置
 */
function loadConfig(cwd = process.cwd()) {
  const cfgPath = findConfigFile(cwd);
  let userConfig = {};
  if (cfgPath) {
    try {
      if (cfgPath.endsWith('.js')) {
        userConfig = require(cfgPath);
      } else {
        userConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      }
    } catch (err) {
      throw new Error(`读取配置文件失败: ${cfgPath} - ${err.message}`);
    }
  }

  return mergeConfig(DEFAULT_CONFIG, userConfig);
}

/**
 * 合并配置（浅合并，files 数组以用户配置为准）
 * @param {object} base
 * @param {object} override
 * @returns {object}
 */
function mergeConfig(base, override) {
  const result = Object.assign({}, base);
  if (override.files && Array.isArray(override.files)) {
    result.files = override.files.map((f) => normalizeFileEntry(f));
  }
  if (override.source) result.source = override.source;
  if (override.historyFile) result.historyFile = override.historyFile;
  if (typeof override.port === 'number') result.port = override.port;
  if (typeof override.host === 'string') result.host = override.host;
  return result;
}

/**
 * 规范化单个文件条目配置
 * @param {object|string} entry
 * @returns {object}
 */
function normalizeFileEntry(entry) {
  if (typeof entry === 'string') {
    return { path: entry, type: guessType(entry) };
  }
  return Object.assign({ type: guessType(entry.path) }, entry);
}

/**
 * 根据文件名推断类型
 * @param {string} filePath
 * @returns {string}
 */
function guessType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return filePath.endsWith('package-lock.json') ? 'json-root' : 'json';
  }
  if (ext === '.md') return 'markdown';
  return 'text';
}

module.exports = {
  loadConfig,
  findConfigFile,
  DEFAULT_CONFIG
};
