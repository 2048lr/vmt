'use strict';

const fs = require('fs');
const path = require('path');
const validator = require('./validator');

/**
 * 版本检查器模块
 * 负责从各类文件中提取版本号并进行一致性比对
 */

/**
 * 从单个文件中提取版本号
 * @param {string} filePath 文件绝对路径
 * @param {object} entry 配置条目（含 type/field/pattern）
 * @returns {{version:string|null, raw:string|null, error?:string}}
 */
function extractVersion(filePath, entry) {
  if (!fs.existsSync(filePath)) {
    return { version: null, raw: null, error: '文件不存在' };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { version: null, raw: null, error: `读取失败: ${err.message}` };
  }

  const type = entry.type || 'text';
  try {
    switch (type) {
      case 'json':
        return extractFromJson(content, entry.field || 'version');
      case 'json-root':
        return extractFromPackageLock(content, entry.field || 'version');
      case 'markdown':
        return extractFromMarkdown(content, entry.pattern);
      case 'text':
        return extractFromText(content, entry.pattern);
      default:
        return { version: null, raw: null, error: `未知文件类型: ${type}` };
    }
  } catch (err) {
    return { version: null, raw: null, error: err.message };
  }
}

/**
 * 从 JSON 文件中提取版本号
 */
function extractFromJson(content, field) {
  const data = JSON.parse(content);
  const version = data[field];
  return { version: version ? String(version) : null, raw: version || null };
}

/**
 * 从 package-lock.json 中提取版本号
 * package-lock.json 顶层有 version 字段，packages."" 中也有 version
 */
function extractFromPackageLock(content, field) {
  const data = JSON.parse(content);
  // 优先取顶层 version
  let version = data[field];
  if (!version && data.packages && data.packages['']) {
    version = data.packages[''][field];
  }
  return { version: version ? String(version) : null, raw: version || null };
}

/**
 * 从匹配结果中提取纯版本号（semver）
 * @param {string} text 包含版本号的文本
 * @returns {string|null}
 */
function extractSemverFromText(text) {
  if (!text) return null;
  const m = text.match(/(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?/);
  return m ? m[0] : null;
}

/**
 * 从 Markdown 文件中提取版本号
 * 支持常见写法：
 *   - version: 1.0.0
 *   - Version: `1.0.0`
 *   - [![Version](...)](...) 1.0.0
 *   - # Project v1.0.0
 */
function extractFromMarkdown(content, pattern) {
  const lines = content.split(/\r?\n/);
  // 优先使用用户自定义 pattern
  if (pattern instanceof RegExp) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        // 捕获组可能是完整版本号，也可能是 major/minor/patch 分组
        // 优先从捕获组提取，失败则从完整匹配中提取 semver
        const candidate = m[1] || m[0];
        let semver = extractSemverFromText(candidate);
        if (!semver) semver = extractSemverFromText(m[0]);
        if (semver && validator.isValid(semver)) {
          return { version: semver, raw: m[0] };
        }
      }
    }
    return { version: null, raw: null };
  }

  // 默认匹配策略：先定位含 version/v 关键字的行，再从中提取 semver
  const defaultPatterns = [
    /version[:\s=-]*[`"']?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`"']*[`"']?/i,
    /\bv(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s]*/i,
    /`(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`]*/i
  ];

  for (const line of lines) {
    for (const p of defaultPatterns) {
      const m = line.match(p);
      if (m) {
        const semver = extractSemverFromText(m[0]);
        if (semver && validator.isValid(semver)) {
          return { version: semver, raw: m[0] };
        }
      }
    }
  }
  return { version: null, raw: null };
}

/**
 * 从纯文本中提取版本号
 */
function extractFromText(content, pattern) {
  if (pattern instanceof RegExp) {
    const m = content.match(pattern);
    if (m) {
      const candidate = m[1] || m[0];
      const semver = extractSemverFromText(candidate);
      if (semver && validator.isValid(semver)) {
        return { version: semver, raw: candidate };
      }
    }
    return { version: null, raw: null };
  }
  // 默认匹配第一个 semver
  const semver = extractSemverFromText(content);
  if (semver && validator.isValid(semver)) {
    return { version: semver, raw: semver };
  }
  return { version: null, raw: null };
}

/**
 * 检查所有配置文件的版本一致性
 * @param {object} config 配置对象
 * @param {string} cwd 工作目录
 * @returns {object} 检查结果
 *   {
 *     consistent: boolean,
 *     sourceVersion: string|null,
 *     files: [{ path, exists, version, raw, valid, error, matched }],
 *     summary: string
 *   }
 */
function checkVersions(config, cwd = process.cwd()) {
  const results = config.files.map((entry) => {
    const absPath = path.resolve(cwd, entry.path);
    const extracted = extractVersion(absPath, entry);
    const valid = extracted.version ? validator.isValid(extracted.version) : false;
    return {
      path: entry.path,
      absPath,
      exists: fs.existsSync(absPath),
      version: extracted.version,
      raw: extracted.raw,
      valid,
      error: extracted.error || null
    };
  });

  // 确定基准版本（来自 source 文件）
  const sourceEntry = results.find((r) => r.path === config.source) || results[0];
  const sourceVersion = sourceEntry ? sourceEntry.version : null;

  // 标记每个文件是否与基准一致
  for (const r of results) {
    r.matched = sourceVersion !== null && r.version !== null && r.version === sourceVersion;
  }

  const versionsPresent = results.filter((r) => r.version !== null).map((r) => r.version);
  const uniqueVersions = [...new Set(versionsPresent)];
  const consistent = uniqueVersions.length <= 1 && versionsPresent.length === results.filter((r) => r.exists).length;

  let summary;
  if (consistent) {
    summary = `所有文件版本一致：${sourceVersion || '(未检测到)'}`;
  } else {
    summary = `检测到 ${uniqueVersions.length} 个不同版本：${uniqueVersions.join(', ')}`;
  }

  return {
    consistent,
    sourceVersion,
    sourceFile: config.source,
    files: results,
    uniqueVersions,
    summary,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  extractVersion,
  checkVersions
};
