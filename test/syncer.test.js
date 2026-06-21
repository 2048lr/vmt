'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const syncer = require('../src/syncer');
const { createFixture, buildConfig, readJson, readText } = require('./helper');

describe('syncer', () => {
  describe('writeVersion', () => {
    it('写入 json 类型并返回 before', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const res = syncer.writeVersion(fx.paths.pkg, { type: 'json', field: 'version' }, '2.0.0');
        expect(res.success).to.be.true;
        expect(res.before).to.equal('1.0.0');
        expect(res.after).to.equal('2.0.0');
        expect(readJson(fx.paths.pkg).version).to.equal('2.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('json-root 同时更新顶层与 packages[""]', () => {
      const fx = createFixture({ lockVersion: '1.0.0' });
      try {
        const res = syncer.writeVersion(
          fx.paths.lock,
          { type: 'json-root', field: 'version' },
          '3.0.0'
        );
        expect(res.success).to.be.true;
        const lock = readJson(fx.paths.lock);
        expect(lock.version).to.equal('3.0.0');
        expect(lock.packages[''].version).to.equal('3.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('写入 markdown 类型', () => {
      const fx = createFixture({ readmeVersion: '1.0.0' });
      try {
        const res = syncer.writeVersion(
          fx.paths.readme,
          {
            type: 'markdown',
            pattern: /version[:\s-]*`?\[?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)[^\s`()\]]*`?\]?/i
          },
          '4.0.0'
        );
        expect(res.success).to.be.true;
        expect(res.before).to.equal('1.0.0');
        expect(readText(fx.paths.readme)).to.include('4.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('markdown 中找不到版本时失败', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-sync-'));
      try {
        const md = path.join(dir, 'README.md');
        fs.writeFileSync(md, '# 无版本\n');
        const res = syncer.writeVersion(md, { type: 'markdown' }, '1.0.0');
        expect(res.success).to.be.false;
        expect(res.error).to.match(/未在 Markdown 中找到版本号/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('写入 text 类型（默认替换第一个 semver）', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-sync-'));
      try {
        const txt = path.join(dir, 'VERSION.txt');
        fs.writeFileSync(txt, '当前版本 5.5.5\n');
        const res = syncer.writeVersion(txt, { type: 'text' }, '6.6.6');
        expect(res.success).to.be.true;
        expect(res.before).to.equal('5.5.5');
        expect(readText(txt)).to.include('6.6.6');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('文件不存在时失败', () => {
      const res = syncer.writeVersion(
        path.join(os.tmpdir(), 'no-' + Date.now()),
        { type: 'json', field: 'version' },
        '1.0.0'
      );
      expect(res.success).to.be.false;
      expect(res.error).to.equal('文件不存在');
    });

    it('未知类型返回 error', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const res = syncer.writeVersion(fx.paths.pkg, { type: 'weird' }, '1.0.0');
        expect(res.success).to.be.false;
        expect(res.error).to.match(/未知文件类型/);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('syncVersions', () => {
    it('以 source 版本为目标同步所有文件', () => {
      const fx = createFixture({ version: '2.0.0', readmeVersion: '1.0.0', lockVersion: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.syncVersions(cfg, fx.dir);
        expect(result.success).to.be.true;
        expect(result.targetVersion).to.equal('2.0.0');
        const changed = result.results.filter((r) => r.changed);
        expect(changed.map((r) => r.path).sort()).to.deep.equal(
          ['README.md', 'package-lock.json'].sort()
        );
        // 验证文件实际写入
        expect(readJson(fx.paths.lock).version).to.equal('2.0.0');
        expect(readText(fx.paths.readme)).to.include('2.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('source 文件本身不被改动（无 target 时）', () => {
      const fx = createFixture({ version: '2.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.syncVersions(cfg, fx.dir);
        const pkg = result.results.find((r) => r.path === 'package.json');
        expect(pkg.skipped).to.equal('基准源文件');
        expect(pkg.changed).to.be.false;
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('dryRun 模式只预览不写入', () => {
      const fx = createFixture({ version: '2.0.0', readmeVersion: '1.0.0', lockVersion: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.syncVersions(cfg, fx.dir, { dryRun: true });
        expect(result.success).to.be.true;
        const readme = result.results.find((r) => r.path === 'README.md');
        expect(readme.dryRun).to.be.true;
        expect(readme.changed).to.be.true;
        // 文件未被修改
        expect(readText(fx.paths.readme)).to.include('1.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('显式指定 target 时会同步 source 文件', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.syncVersions(cfg, fx.dir, { target: '1.5.0' });
        expect(result.targetVersion).to.equal('1.5.0');
        const pkg = result.results.find((r) => r.path === 'package.json');
        // source 不再被跳过（因为显式 target）
        expect(pkg.skipped).to.be.undefined;
        expect(readJson(fx.paths.pkg).version).to.equal('1.5.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('无法确定目标版本时返回失败', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        // 删除 source 文件使其无法读取
        fs.rmSync(fx.paths.pkg);
        const cfg = buildConfig(fx.dir);
        const result = syncer.syncVersions(cfg, fx.dir);
        expect(result.success).to.be.false;
        expect(result.error).to.match(/无法确定目标版本号/);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('target 版本非法时返回失败', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.syncVersions(cfg, fx.dir, { target: 'not-valid' });
        expect(result.success).to.be.false;
        expect(result.error).to.match(/不符合语义化规范/);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('updateVersion', () => {
    it('先更新基准源再同步所有文件', () => {
      const fx = createFixture({ version: '1.0.0', readmeVersion: '1.0.0', lockVersion: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.updateVersion(cfg, fx.dir, '2.0.0');
        expect(result.success).to.be.true;
        expect(result.targetVersion).to.equal('2.0.0');
        expect(result.sourceBefore).to.equal('1.0.0');
        expect(readJson(fx.paths.pkg).version).to.equal('2.0.0');
        expect(readJson(fx.paths.lock).version).to.equal('2.0.0');
        expect(readText(fx.paths.readme)).to.include('2.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('支持 v 前缀规范化', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.updateVersion(cfg, fx.dir, 'v3.0.0');
        expect(result.success).to.be.true;
        expect(result.targetVersion).to.equal('3.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('非法版本号返回失败', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = syncer.updateVersion(cfg, fx.dir, 'abc');
        expect(result.success).to.be.false;
        expect(result.error).to.match(/不符合语义化规范/);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });
});
