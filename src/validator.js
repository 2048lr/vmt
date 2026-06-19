'use strict';

const semver = require('semver');

/**
 * 版本号校验模块
 * 负责语义化版本规范的校验与解析
 */

// 严格匹配 MAJOR.MINOR.PATCH 格式（可选预发布与构建元数据）
const STRICT_SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * 校验版本号是否符合语义化版本规范
 * @param {string} version 待校验的版本号
 * @returns {boolean}
 */
function isValid(version) {
  if (typeof version !== 'string') return false;
  return STRICT_SEMVER_REGEX.test(version.trim());
}

/**
 * 解析版本号为各组成部分
 * @param {string} version
 * @returns {{major:number, minor:number, patch:number, prerelease?:string, build?:string}|null}
 */
function parse(version) {
  if (!isValid(version)) return null;
  const cleaned = version.trim();
  const match = cleaned.match(STRICT_SEMVER_REGEX);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || undefined,
    build: match[5] || undefined,
    raw: cleaned
  };
}

/**
 * 规范化版本号（去除前导 v 与空白）
 * @param {string} version
 * @returns {string|null}
 */
function normalize(version) {
  if (typeof version !== 'string') return null;
  let v = version.trim();
  if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);
  return isValid(v) ? v : null;
}

/**
 * 比较两个版本号
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 / 0 / 1
 */
function compare(a, b) {
  return semver.compare(a, b);
}

/**
 * 递增版本号
 * @param {string} version 当前版本
 * @param {'major'|'minor'|'patch'} release 递增类型
 * @returns {string}
 */
function inc(version, release) {
  return semver.inc(version, release);
}

module.exports = {
  isValid,
  parse,
  normalize,
  compare,
  inc
};
