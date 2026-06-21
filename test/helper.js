'use strict';

/**
 * 测试夹具辅助
 * 在临时目录中生成一个微型项目，供各测试用例使用
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 创建一个临时项目目录，包含 package.json / package-lock.json / README.md
 * @param {object} opts
 *   - version {string} 写入各文件的版本号（默认 1.0.0）
 *   - readmeVersion {string} README 中的版本（默认同 version，便于制造不一致）
 *   - lockVersion {string} package-lock 顶层 version（默认同 version）
 *   - withReadme {boolean} 是否生成 README（默认 true）
 *   - withLock {boolean} 是否生成 package-lock（默认 true）
 *   - files {array} 可选的自定义配置 files（覆盖默认）
 *   - source {string} 可选的自定义 source
 *   - subdir {string} 在 tmp 下再创建一层子目录，便于隔离历史文件
 * @returns {{ dir:string, paths:{pkg:string, lock:string, readme:string} }}
 */
function createFixture(opts = {}) {
  const version = opts.version || '1.0.0';
  const lockVersion = opts.lockVersion !== undefined ? opts.lockVersion : version;
  const readmeVersion = opts.readmeVersion !== undefined ? opts.readmeVersion : version;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-test-'));
  const dir = opts.subdir ? path.join(root, opts.subdir) : root;
  if (opts.subdir) fs.mkdirSync(dir, { recursive: true });

  // package.json
  const pkg = {
    name: 'fixture-project',
    version,
    description: '测试用临时项目',
    main: 'index.js'
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  // package-lock.json
  if (opts.withLock !== false) {
    const lock = {
      name: 'fixture-project',
      version: lockVersion,
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture-project', version: lockVersion }
      }
    };
    fs.writeFileSync(
      path.join(dir, 'package-lock.json'),
      JSON.stringify(lock, null, 2) + '\n'
    );
  }

  // README.md（格式与真实项目一致，使用 "Version: `x.y.z`"）
  if (opts.withReadme !== false) {
    const readme = `# fixture-project\n\n> Version: \`${readmeVersion}\`\n\n一些说明文档。\n`;
    fs.writeFileSync(path.join(dir, 'README.md'), readme, 'utf8');
  }

  return {
    dir,
    paths: {
      pkg: path.join(dir, 'package.json'),
      lock: path.join(dir, 'package-lock.json'),
      readme: path.join(dir, 'README.md')
    }
  };
}

/**
 * 读取一个 JSON 文件并解析
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 读取一个文本文件
 */
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * 构造一份与 DEFAULT_CONFIG 等价、但 path 为绝对路径的配置对象，
 * 便于直接喂给 checker / syncer 而不依赖 cwd。
 * @param {string} dir 项目目录
 */
function buildConfig(dir) {
  return {
    files: [
      { path: 'package.json', field: 'version', type: 'json' },
      {
        path: 'package-lock.json',
        field: 'version',
        type: 'json-root'
      },
      {
        path: 'README.md',
        pattern: /version[:\s-]*`?\[?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`()\]]*`?\]?/i,
        type: 'markdown'
      }
    ],
    source: 'package.json',
    historyFile: '.version-history.json',
    port: 3000,
    host: '127.0.0.1'
  };
}

/**
 * 递归删除目录（仅用于清理 tmp）
 */
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    /* 忽略 */
  }
}

module.exports = {
  createFixture,
  readJson,
  readText,
  buildConfig,
  removeDir
};
