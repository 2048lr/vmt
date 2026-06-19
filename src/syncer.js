'use strict';

const fs = require('fs');
const path = require('path');
const validator = require('./validator');

/**
 * 版本同步器模块
 * 负责将基准版本号写入到所有目标文件中
 */

/**
 * 将版本号写入单个文件
 * @param {string} absPath 文件绝对路径
 * @param {object} entry 配置条目
 * @param {string} version 目标版本号
 * @returns {{success:boolean, error?:string, before?:string, after?:string}}
 */
function writeVersion(absPath, entry, version) {
  if (!fs.existsSync(absPath)) {
    return { success: false, error: '文件不存在' };
  }

  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return { success: false, error: `读取失败: ${err.message}` };
  }

  const type = entry.type || 'text';
  let before = null;
  let newContent = content;

  try {
    switch (type) {
      case 'json': {
        const data = JSON.parse(content);
        const field = entry.field || 'version';
        before = data[field] ? String(data[field]) : null;
        data[field] = version;
        newContent = JSON.stringify(data, null, 2) + '\n';
        break;
      }
      case 'json-root': {
        const data = JSON.parse(content);
        const field = entry.field || 'version';
        before = data[field] ? String(data[field]) : null;
        if (before) data[field] = version;
        // 同步 packages[""].version
        if (data.packages && data.packages[''] && data.packages[''][field]) {
          if (!before) before = String(data.packages[''][field]);
          data.packages[''][field] = version;
        }
        newContent = JSON.stringify(data, null, 2) + '\n';
        break;
      }
      case 'markdown': {
        const result = replaceMarkdownVersion(content, version, entry.pattern);
        if (result.replaced) {
          before = result.before;
          newContent = result.content;
        } else {
          return { success: false, error: '未在 Markdown 中找到版本号' };
        }
        break;
      }
      case 'text': {
        const result = replaceTextVersion(content, version, entry.pattern);
        if (result.replaced) {
          before = result.before;
          newContent = result.content;
        } else {
          return { success: false, error: '未在文本中找到版本号' };
        }
        break;
      }
      default:
        return { success: false, error: `未知文件类型: ${type}` };
    }

    fs.writeFileSync(absPath, newContent, 'utf8');
    return { success: true, before, after: version };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 替换 Markdown 中的版本号
 */
function replaceMarkdownVersion(content, version, pattern) {
  const lines = content.split(/\r?\n/);
  let replaced = false;
  let before = null;

  // 用于提取/替换 semver 的正则
  const semverRegex = /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?/;

  const patterns = pattern instanceof RegExp
    ? [pattern]
    : [
        /version[:\s=-]*[`"']?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`"']*[`"']?/i,
        /\bv(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s]*/i,
        /`(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`]*/i
      ];

  for (let i = 0; i < lines.length && !replaced; i++) {
    for (const p of patterns) {
      const m = lines[i].match(p);
      if (m) {
        // 提取旧版本号
        const oldMatch = m[0].match(semverRegex);
        if (oldMatch) {
          before = oldMatch[0];
          // 仅替换该行中第一个 semver
          lines[i] = lines[i].replace(semverRegex, version);
          replaced = true;
          break;
        }
      }
    }
  }

  return { replaced, before, content: lines.join('\n') };
}

/**
 * 替换纯文本中的版本号
 */
function replaceTextVersion(content, version, pattern) {
  const semverRegex = /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?/;

  if (pattern instanceof RegExp) {
    const m = content.match(pattern);
    if (m) {
      const candidate = m[1] || m[0];
      const oldMatch = candidate.match(semverRegex);
      const before = oldMatch ? oldMatch[0] : candidate;
      const newContent = content.replace(pattern, (match) => {
        return match.replace(semverRegex, version);
      });
      return { replaced: true, before, content: newContent };
    }
    return { replaced: false, content };
  }

  // 默认替换第一个 semver
  const m = content.match(semverRegex);
  if (m) {
    const before = m[0];
    const newContent = content.replace(semverRegex, version);
    return { replaced: true, before, content: newContent };
  }
  return { replaced: false, content };
}

/**
 * 同步所有文件的版本号到基准版本
 * @param {object} config 配置对象
 * @param {string} cwd 工作目录
 * @param {object} options 选项 { target?: string, dryRun?: boolean }
 * @returns {object} 同步结果
 */
function syncVersions(config, cwd = process.cwd(), options = {}) {
  const { target, dryRun = false } = options;

  // 确定目标版本
  let targetVersion = target;
  if (!targetVersion) {
    // 从 source 文件读取
    const sourceEntry = config.files.find((f) => f.path === config.source) || config.files[0];
    const sourcePath = path.resolve(cwd, sourceEntry.path);
    const checker = require('./checker');
    const extracted = checker.extractVersion(sourcePath, sourceEntry);
    targetVersion = extracted.version;
  }

  if (!targetVersion) {
    return {
      success: false,
      error: '无法确定目标版本号',
      targetVersion: null,
      results: []
    };
  }

  if (!validator.isValid(targetVersion)) {
    return {
      success: false,
      error: `目标版本号不符合语义化规范: ${targetVersion}`,
      targetVersion,
      results: []
    };
  }

  const results = config.files.map((entry) => {
    const absPath = path.resolve(cwd, entry.path);

    if (dryRun) {
      const checker = require('./checker');
      const extracted = checker.extractVersion(absPath, entry);
      return {
        path: entry.path,
        absPath,
        success: true,
        before: extracted.version,
        after: targetVersion,
        changed: extracted.version !== targetVersion,
        dryRun: true
      };
    }

    // source 文件本身不需要更新
    if (entry.path === config.source && !target) {
      return {
        path: entry.path,
        absPath,
        success: true,
        before: targetVersion,
        after: targetVersion,
        changed: false,
        skipped: '基准源文件'
      };
    }

    const result = writeVersion(absPath, entry, targetVersion);
    return {
      path: entry.path,
      absPath,
      success: result.success,
      before: result.before,
      after: result.success ? targetVersion : null,
      changed: result.success && result.before !== targetVersion,
      error: result.error || null
    };
  });

  const failedCount = results.filter((r) => !r.success).length;
  return {
    success: failedCount === 0,
    targetVersion,
    results,
    timestamp: new Date().toISOString()
  };
}

/**
 * 更新基准版本号并同步到所有文件
 * @param {object} config 配置对象
 * @param {string} cwd 工作目录
 * @param {string} newVersion 新版本号
 * @returns {object} 更新结果
 */
function updateVersion(config, cwd = process.cwd(), newVersion) {
  const normalized = validator.normalize(newVersion);
  if (!normalized) {
    return {
      success: false,
      error: `版本号不符合语义化规范: ${newVersion}`,
      results: []
    };
  }

  // 先更新基准源文件，再同步到其他文件
  const sourceEntry = config.files.find((f) => f.path === config.source) || config.files[0];
  const sourcePath = path.resolve(cwd, sourceEntry.path);

  const sourceResult = writeVersion(sourcePath, sourceEntry, normalized);
  if (!sourceResult.success) {
    return {
      success: false,
      error: `更新基准文件失败: ${sourceResult.error}`,
      results: []
    };
  }

  // 同步到其他文件
  const syncResult = syncVersions(config, cwd, { target: normalized });
  return {
    success: syncResult.success,
    targetVersion: normalized,
    sourceBefore: sourceResult.before,
    results: syncResult.results,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  writeVersion,
  syncVersions,
  updateVersion
};
