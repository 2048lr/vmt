'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 版本变更历史记录模块
 * 记录每次版本修改的时间、操作人和变更内容
 */

/**
 * 获取当前操作人
 * @returns {string}
 */
function getOperator() {
  return (
    process.env.VMT_OPERATOR ||
    process.env.USER ||
    process.env.USERNAME ||
    os.userInfo().username ||
    'unknown'
  );
}

/**
 * 读取历史记录
 * @param {string} historyFile 历史记录文件绝对路径
 * @returns {Array} 历史记录数组
 */
function readHistory(historyFile) {
  if (!fs.existsSync(historyFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/**
 * 写入历史记录
 * @param {string} historyFile 历史记录文件绝对路径
 * @param {Array} history 历史记录数组
 */
function writeHistory(historyFile, history) {
  const dir = path.dirname(historyFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n', 'utf8');
}

/**
 * 添加一条历史记录
 * @param {string} cwd 工作目录
 * @param {string} historyFile 历史记录文件相对路径
 * @param {object} entry 记录条目
 *   { action, before, after, operator, details, files }
 */
function addRecord(cwd, historyFile, entry) {
  const absPath = path.resolve(cwd, historyFile);
  const history = readHistory(absPath);

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    action: entry.action || 'unknown',
    before: entry.before || null,
    after: entry.after || null,
    operator: entry.operator || getOperator(),
    details: entry.details || '',
    files: entry.files || []
  };

  history.push(record);
  // 最多保留 500 条
  if (history.length > 500) history.splice(0, history.length - 500);
  writeHistory(absPath, history);
  return record;
}

/**
 * 获取历史记录列表
 * @param {string} cwd 工作目录
 * @param {string} historyFile 历史记录文件相对路径
 * @param {object} options { limit?: number }
 * @returns {Array}
 */
function getHistory(cwd, historyFile, options = {}) {
  const absPath = path.resolve(cwd, historyFile);
  let history = readHistory(absPath);
  // 倒序（最新在前）
  history = history.slice().reverse();
  if (options.limit && options.limit > 0) {
    history = history.slice(0, options.limit);
  }
  return history;
}

/**
 * 清空历史记录
 * @param {string} cwd 工作目录
 * @param {string} historyFile 历史记录文件相对路径
 */
function clearHistory(cwd, historyFile) {
  const absPath = path.resolve(cwd, historyFile);
  writeHistory(absPath, []);
}

module.exports = {
  getOperator,
  readHistory,
  writeHistory,
  addRecord,
  getHistory,
  clearHistory
};
