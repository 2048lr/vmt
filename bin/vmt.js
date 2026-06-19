#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const path = require('path');
const pkg = require('../package.json');
const api = require('../src');
const { startServer } = require('../src/server');

// 颜色辅助函数（兼容 Windows）
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

// 检测是否支持颜色输出
function supportsColor() {
  return process.stdout.isTTY || process.env.FORCE_COLOR;
}

function paint(text, color) {
  return supportsColor() ? colorize(text, color) : text;
}

program
  .name('vmt')
  .description('可视化版本管理工具 - 检测并同步 package.json / package-lock.json / README.md 中的版本号')
  .version(pkg.version);

/**
 * check 命令：检查版本一致性
 */
program
  .command('check')
  .description('检查所有文件中的版本号一致性')
  .option('-d, --dir <path>', '指定项目目录', process.cwd())
  .option('--json', '以 JSON 格式输出结果')
  .action((options) => {
    try {
      const result = api.check(options.dir);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printCheckResult(result);
      process.exitCode = result.consistent ? 0 : 1;
    } catch (err) {
      console.error(paint(`错误: ${err.message}`, 'red'));
      process.exitCode = 2;
    }
  });

/**
 * sync 命令：同步版本号
 */
program
  .command('sync')
  .description('以基准源文件版本号为准，同步到所有文件')
  .option('-d, --dir <path>', '指定项目目录', process.cwd())
  .option('-t, --target <version>', '指定目标版本号（默认使用基准源版本）')
  .option('--dry-run', '仅预览变更，不实际写入')
  .option('--json', '以 JSON 格式输出结果')
  .action((options) => {
    try {
      const result = api.sync(options.dir, {
        target: options.target,
        dryRun: options.dryRun
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printSyncResult(result, options.dryRun);
      process.exitCode = result.success ? 0 : 1;
    } catch (err) {
      console.error(paint(`错误: ${err.message}`, 'red'));
      process.exitCode = 2;
    }
  });

/**
 * update 命令：更新版本号
 */
program
  .command('update <version>')
  .description('更新版本号到指定值并同步到所有文件（如 1.2.0 或 patch/minor/major）')
  .option('-d, --dir <path>', '指定项目目录', process.cwd())
  .option('--json', '以 JSON 格式输出结果')
  .action((version, options) => {
    try {
      let targetVersion = version;
      // 支持 patch/minor/major 关键字
      if (['patch', 'minor', 'major'].includes(version)) {
        const current = api.check(options.dir).sourceVersion;
        if (!current) {
          console.error(paint('错误: 无法确定当前版本号，请显式指定版本', 'red'));
          process.exitCode = 2;
          return;
        }
        targetVersion = api.validator.inc(current, version);
      }

      const result = api.update(targetVersion, options.dir);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printUpdateResult(result);
      process.exitCode = result.success ? 0 : 1;
    } catch (err) {
      console.error(paint(`错误: ${err.message}`, 'red'));
      process.exitCode = 2;
    }
  });

/**
 * history 命令：查看历史记录
 */
program
  .command('history')
  .description('查看版本变更历史记录')
  .option('-d, --dir <path>', '指定项目目录', process.cwd())
  .option('-n, --limit <number>', '显示条数', '20')
  .option('--clear', '清空历史记录')
  .option('--json', '以 JSON 格式输出结果')
  .action((options) => {
    try {
      if (options.clear) {
        api.clearHistory(options.dir);
        console.log(paint('已清空历史记录', 'green'));
        return;
      }
      const records = api.getHistory(options.dir, { limit: parseInt(options.limit, 10) });
      if (options.json) {
        console.log(JSON.stringify(records, null, 2));
        return;
      }
      printHistory(records);
    } catch (err) {
      console.error(paint(`错误: ${err.message}`, 'red'));
      process.exitCode = 2;
    }
  });

/**
 * serve 命令：启动 GUI Web 服务
 */
program
  .command('serve')
  .description('启动 GUI Web 服务')
  .option('-d, --dir <path>', '指定项目目录', process.cwd())
  .option('-p, --port <number>', '指定端口')
  .option('-h, --host <host>', '指定主机')
  .option('--open', '自动打开浏览器')
  .action((options) => {
    startServer({
      cwd: options.dir,
      port: options.port ? parseInt(options.port, 10) : undefined,
      host: options.host,
      open: options.open
    });
  });

/**
 * validate 命令：校验版本号格式
 */
program
  .command('validate <version>')
  .description('校验版本号是否符合语义化规范')
  .action((version) => {
    const valid = api.validator.isValid(version);
    if (valid) {
      console.log(paint(`✓ ${version} 是有效的语义化版本号`, 'green'));
      const parsed = api.validator.parse(version);
      console.log(`  major: ${parsed.major}`);
      console.log(`  minor: ${parsed.minor}`);
      console.log(`  patch: ${parsed.patch}`);
      if (parsed.prerelease) console.log(`  prerelease: ${parsed.prerelease}`);
      if (parsed.build) console.log(`  build: ${parsed.build}`);
    } else {
      console.error(paint(`✗ ${version} 不是有效的语义化版本号`, 'red'));
      console.error('  规范格式: MAJOR.MINOR.PATCH (例如 1.0.0)');
      process.exitCode = 1;
    }
  });

// 打印检查结果
function printCheckResult(result) {
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log(paint('       版本一致性检查报告', 'bold'));
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log();

  console.log(`基准源文件: ${paint(result.sourceFile, 'bold')}`);
  console.log(`基准版本号: ${result.sourceVersion ? paint(result.sourceVersion, 'blue') : paint('(未检测到)', 'gray')}`);
  console.log();

  console.log(paint('文件版本状态:', 'bold'));
  for (const file of result.files) {
    const status = fileStatusIcon(file, result.sourceVersion);
    const versionStr = file.error
      ? paint(file.error, 'red')
      : file.version
        ? (file.matched ? paint(file.version, 'green') : paint(file.version, 'red'))
        : paint('(未检测到)', 'gray');
    console.log(`  ${status} ${file.path}`);
    console.log(`      版本: ${versionStr}`);
    if (!file.valid && file.version) {
      console.log(`      ${paint('⚠ 版本号格式不符合语义化规范', 'yellow')}`);
    }
  }

  console.log();
  if (result.consistent) {
    console.log(paint('✓ 所有文件版本一致', 'green'));
  } else {
    console.log(paint('✗ 版本不一致', 'red'));
    console.log(paint(`  ${result.summary}`, 'yellow'));
    console.log();
    console.log(paint('提示: 运行 `vmt sync` 以基准版本号同步所有文件', 'gray'));
  }
}

function fileStatusIcon(file, sourceVersion) {
  if (file.error) return paint('✗', 'red');
  if (!file.version) return paint('?', 'gray');
  if (file.matched) return paint('✓', 'green');
  return paint('✗', 'red');
}

// 打印同步结果
function printSyncResult(result, dryRun) {
  const tag = dryRun ? paint('[预览] ', 'yellow') : '';
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log(paint(`       ${tag}版本同步结果`, 'bold'));
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log();
  console.log(`目标版本: ${paint(result.targetVersion, 'blue')}`);
  console.log();

  for (const r of result.results) {
    const icon = r.success ? (r.changed ? paint('→', 'yellow') : paint('=', 'gray')) : paint('✗', 'red');
    const beforeStr = r.before ? paint(r.before, 'gray') : paint('(空)', 'gray');
    const afterStr = r.success ? paint(r.after, 'green') : paint(r.error, 'red');
    const note = r.skipped ? paint(` [跳过: ${r.skipped}]`, 'gray') : (r.dryRun ? paint(' [预览]', 'yellow') : '');
    console.log(`  ${icon} ${r.path}${note}`);
    console.log(`      ${beforeStr} → ${afterStr}`);
  }

  console.log();
  if (result.success) {
    const changed = result.results.filter((r) => r.changed).length;
    if (changed > 0) {
      console.log(paint(`✓ 成功${dryRun ? '预览' : ''}同步 ${changed} 个文件`, 'green'));
    } else {
      console.log(paint('✓ 所有文件版本已一致，无需同步', 'green'));
    }
  } else {
    const failed = result.results.filter((r) => !r.success).length;
    console.log(paint(`✗ ${failed} 个文件同步失败`, 'red'));
  }
}

// 打印更新结果
function printUpdateResult(result) {
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log(paint('       版本更新结果', 'bold'));
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log();
  console.log(`${paint(result.sourceBefore || '(空)', 'gray')} → ${paint(result.targetVersion, 'green')}`);
  console.log();

  for (const r of result.results) {
    const icon = r.success ? (r.changed ? paint('→', 'yellow') : paint('=', 'gray')) : paint('✗', 'red');
    const beforeStr = r.before ? paint(r.before, 'gray') : paint('(空)', 'gray');
    const afterStr = r.success ? paint(r.after, 'green') : paint(r.error, 'red');
    console.log(`  ${icon} ${r.path}`);
    console.log(`      ${beforeStr} → ${afterStr}`);
  }

  console.log();
  if (result.success) {
    console.log(paint(`✓ 版本已更新至 ${result.targetVersion}`, 'green'));
  } else {
    console.log(paint('✗ 更新失败', 'red'));
  }
}

// 打印历史记录
function printHistory(records) {
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log(paint('       版本变更历史记录', 'bold'));
  console.log(paint('════════════════════════════════════════', 'cyan'));
  console.log();

  if (records.length === 0) {
    console.log(paint('暂无历史记录', 'gray'));
    return;
  }

  for (const r of records) {
    const time = new Date(r.timestamp).toLocaleString();
    const actionLabel = {
      sync: paint('[同步]', 'blue'),
      update: paint('[更新]', 'yellow')
    }[r.action] || paint(`[${r.action}]`, 'gray');

    console.log(`${actionLabel} ${time}  ${paint('@' + r.operator, 'gray')}`);
    console.log(`  ${r.details}`);
    if (r.before && r.after) {
      console.log(`  ${paint(r.before, 'gray')} → ${paint(r.after, 'green')}`);
    }
    if (r.files && r.files.length > 0) {
      console.log(`  影响文件: ${r.files.map((f) => f.path).join(', ')}`);
    }
    console.log();
  }
}

program.parse(process.argv);

// 无参数时显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
