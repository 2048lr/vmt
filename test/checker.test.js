'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const checker = require('../src/checker');
const { createFixture, buildConfig } = require('./helper');

describe('checker', () => {
  describe('extractVersion', () => {
    it('文件不存在时返回 error', () => {
      const res = checker.extractVersion(
        path.join(os.tmpdir(), 'no-such-' + Date.now()),
        { type: 'json', field: 'version' }
      );
      expect(res.version).to.be.null;
      expect(res.error).to.equal('文件不存在');
    });

    it('从 JSON 中提取 version 字段', () => {
      const fx = createFixture({ version: '3.2.1' });
      try {
        const res = checker.extractVersion(fx.paths.pkg, { type: 'json', field: 'version' });
        expect(res.version).to.equal('3.2.1');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('json-root 优先取顶层 version', () => {
      const fx = createFixture({ lockVersion: '4.5.6' });
      try {
        const res = checker.extractVersion(fx.paths.lock, { type: 'json-root', field: 'version' });
        expect(res.version).to.equal('4.5.6');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('json-root 顶层缺失时回退到 packages[""]', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-chk-'));
      try {
        const lockPath = path.join(dir, 'package-lock.json');
        fs.writeFileSync(
          lockPath,
          JSON.stringify({ lockfileVersion: 3, packages: { '': { version: '7.7.7' } } })
        );
        const res = checker.extractVersion(lockPath, { type: 'json-root', field: 'version' });
        expect(res.version).to.equal('7.7.7');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('默认从 markdown 中提取 version 关键字所在行的版本', () => {
      const fx = createFixture({ readmeVersion: '2.0.0' });
      try {
        const res = checker.extractVersion(fx.paths.readme, { type: 'markdown' });
        expect(res.version).to.equal('2.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('markdown 支持自定义 pattern（捕获组优先）', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-chk-'));
      try {
        const md = path.join(dir, 'README.md');
        fs.writeFileSync(md, '# Title\n\nRelease 9.9.9 is out\n');
        const res = checker.extractVersion(md, {
          type: 'markdown',
          pattern: /Release\s+([0-9]+\.[0-9]+\.[0-9]+)/i
        });
        expect(res.version).to.equal('9.9.9');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('markdown 未找到版本时返回 null', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-chk-'));
      try {
        const md = path.join(dir, 'README.md');
        fs.writeFileSync(md, '# Title\n\n没有任何版本号\n');
        const res = checker.extractVersion(md, { type: 'markdown' });
        expect(res.version).to.be.null;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('text 默认提取第一个 semver', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-chk-'));
      try {
        const txt = path.join(dir, 'VERSION.txt');
        fs.writeFileSync(txt, 'project version 5.5.5 build\n');
        const res = checker.extractVersion(txt, { type: 'text' });
        expect(res.version).to.equal('5.5.5');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('未知类型返回 error', () => {
      const fx = createFixture();
      try {
        const res = checker.extractVersion(fx.paths.pkg, { type: 'unknown-type' });
        expect(res.error).to.match(/未知文件类型/);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('checkVersions', () => {
    it('所有文件版本一致时 consistent=true', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = checker.checkVersions(cfg, fx.dir);
        expect(result.consistent).to.be.true;
        expect(result.sourceVersion).to.equal('1.0.0');
        expect(result.uniqueVersions).to.deep.equal(['1.0.0']);
        expect(result.files).to.have.lengthOf(3);
        for (const f of result.files) {
          expect(f.matched, `${f.path} 应匹配`).to.be.true;
        }
        expect(result.timestamp).to.be.a('string');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('版本不一致时 consistent=false 且列出不同版本', () => {
      const fx = createFixture({ version: '1.0.0', readmeVersion: '2.0.0', lockVersion: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = checker.checkVersions(cfg, fx.dir);
        expect(result.consistent).to.be.false;
        expect(result.uniqueVersions).to.include('1.0.0');
        expect(result.uniqueVersions).to.include('2.0.0');
        const readme = result.files.find((f) => f.path === 'README.md');
        expect(readme.version).to.equal('2.0.0');
        expect(readme.matched).to.be.false;
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('文件缺失时不报错，exists 标记为 false', () => {
      const fx = createFixture({ withReadme: false });
      try {
        const cfg = buildConfig(fx.dir);
        const result = checker.checkVersions(cfg, fx.dir);
        const readme = result.files.find((f) => f.path === 'README.md');
        expect(readme.exists).to.be.false;
        expect(readme.version).to.be.null;
        // 缺少 README，仅剩 package.json 与 package-lock.json 一致
        expect(result.consistent).to.be.true;
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('summary 文本内容正确（一致场景）', () => {
      const fx = createFixture({ version: '1.2.3' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = checker.checkVersions(cfg, fx.dir);
        expect(result.summary).to.include('1.2.3');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('以 source 文件的版本作为基准', () => {
      const fx = createFixture({ version: '1.0.0', readmeVersion: '1.0.0', lockVersion: '1.0.0' });
      try {
        const cfg = buildConfig(fx.dir);
        const result = checker.checkVersions(cfg, fx.dir);
        expect(result.sourceFile).to.equal('package.json');
        expect(result.sourceVersion).to.equal('1.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });
});
