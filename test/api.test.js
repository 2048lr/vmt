'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const api = require('../src');
const { createFixture, readJson, readText } = require('./helper');

describe('api (src/index)', () => {
  describe('getConfig', () => {
    it('返回包含默认 files / source 的配置', () => {
      const fx = createFixture();
      try {
        const cfg = api.getConfig(fx.dir);
        expect(cfg.source).to.equal('package.json');
        expect(cfg.files).to.be.an('array').with.lengthOf(3);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('check', () => {
    it('一致时返回 consistent=true', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const result = api.check(fx.dir);
        expect(result.consistent).to.be.true;
        expect(result.sourceVersion).to.equal('1.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('不一致时返回 consistent=false', () => {
      const fx = createFixture({ version: '1.0.0', readmeVersion: '2.0.0' });
      try {
        const result = api.check(fx.dir);
        expect(result.consistent).to.be.false;
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('sync', () => {
    it('以基准源同步并写入历史记录', () => {
      const fx = createFixture({ version: '2.0.0', readmeVersion: '1.0.0', lockVersion: '1.0.0' });
      try {
        const result = api.sync(fx.dir);
        expect(result.success).to.be.true;
        expect(result.targetVersion).to.equal('2.0.0');
        expect(readJson(fx.paths.lock).version).to.equal('2.0.0');
        expect(readText(fx.paths.readme)).to.include('2.0.0');
        // 历史文件被写入
        const histFile = path.join(fx.dir, '.version-history.json');
        expect(fs.existsSync(histFile)).to.be.true;
        const hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
        expect(hist).to.have.lengthOf(1);
        expect(hist[0].action).to.equal('sync');
        expect(hist[0].after).to.equal('2.0.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('dryRun 模式不写历史记录', () => {
      const fx = createFixture({ version: '2.0.0', readmeVersion: '1.0.0' });
      try {
        api.sync(fx.dir, { dryRun: true });
        const histFile = path.join(fx.dir, '.version-history.json');
        expect(fs.existsSync(histFile)).to.be.false;
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('update', () => {
    it('更新基准源并同步，同时写历史', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        const result = api.update('2.5.0', fx.dir);
        expect(result.success).to.be.true;
        expect(result.targetVersion).to.equal('2.5.0');
        expect(readJson(fx.paths.pkg).version).to.equal('2.5.0');
        const histFile = path.join(fx.dir, '.version-history.json');
        const hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
        expect(hist[0].action).to.equal('update');
        expect(hist[0].before).to.equal('1.0.0');
        expect(hist[0].after).to.equal('2.5.0');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('getHistory / clearHistory', () => {
    it('可读取与清空历史', () => {
      const fx = createFixture({ version: '1.0.0' });
      try {
        api.update('1.1.0', fx.dir);
        api.update('1.2.0', fx.dir);
        const list = api.getHistory(fx.dir);
        expect(list).to.have.lengthOf(2);
        expect(list[0].after).to.equal('1.2.0'); // 倒序
        api.clearHistory(fx.dir);
        expect(api.getHistory(fx.dir)).to.deep.equal([]);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('exports', () => {
    it('导出所有子模块及核心函数', () => {
      expect(api.check).to.be.a('function');
      expect(api.sync).to.be.a('function');
      expect(api.update).to.be.a('function');
      expect(api.getHistory).to.be.a('function');
      expect(api.clearHistory).to.be.a('function');
      expect(api.getConfig).to.be.a('function');
      expect(api.validator).to.be.an('object');
      expect(api.checker).to.be.an('object');
      expect(api.syncer).to.be.an('object');
      expect(api.history).to.be.an('object');
      expect(api.config).to.be.an('object');
    });
  });
});
