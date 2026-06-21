'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../src/config');

describe('config', () => {
  describe('DEFAULT_CONFIG', () => {
    it('包含 package.json / package-lock.json / README.md 三个默认文件', () => {
      const paths = config.DEFAULT_CONFIG.files.map((f) => f.path);
      expect(paths).to.include('package.json');
      expect(paths).to.include('package-lock.json');
      expect(paths).to.include('README.md');
    });

    it('默认 source 为 package.json', () => {
      expect(config.DEFAULT_CONFIG.source).to.equal('package.json');
    });
  });

  describe('findConfigFile', () => {
    it('无配置文件时返回 null', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        expect(config.findConfigFile(dir)).to.be.null;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('存在 .versionrc.json 时返回其路径', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        const cfgPath = path.join(dir, '.versionrc.json');
        fs.writeFileSync(cfgPath, JSON.stringify({ source: 'README.md' }));
        expect(config.findConfigFile(dir)).to.equal(cfgPath);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('loadConfig', () => {
    it('无配置文件时返回默认配置', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        const cfg = config.loadConfig(dir);
        expect(cfg.source).to.equal('package.json');
        expect(cfg.files).to.have.lengthOf(3);
        expect(cfg.historyFile).to.equal('.version-history.json');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('用户配置覆盖 source / port / host / historyFile', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        fs.writeFileSync(
          path.join(dir, '.versionrc.json'),
          JSON.stringify({
            source: 'package.json',
            port: 8080,
            host: '0.0.0.0',
            historyFile: '.my-history.json'
          })
        );
        const cfg = config.loadConfig(dir);
        expect(cfg.port).to.equal(8080);
        expect(cfg.host).to.equal('0.0.0.0');
        expect(cfg.historyFile).to.equal('.my-history.json');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('用户配置自定义 files 数组时整体替换', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        fs.writeFileSync(
          path.join(dir, '.versionrc.json'),
          JSON.stringify({
            files: [{ path: 'package.json', type: 'json', field: 'version' }]
          })
        );
        const cfg = config.loadConfig(dir);
        expect(cfg.files).to.have.lengthOf(1);
        expect(cfg.files[0].path).to.equal('package.json');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('files 中以字符串形式给出会自动推断类型', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        fs.writeFileSync(
          path.join(dir, '.versionrc.json'),
          JSON.stringify({
            files: ['VERSION.txt', 'package-lock.json']
          })
        );
        const cfg = config.loadConfig(dir);
        const txt = cfg.files.find((f) => f.path === 'VERSION.txt');
        const lock = cfg.files.find((f) => f.path === 'package-lock.json');
        expect(txt.type).to.equal('text');
        expect(lock.type).to.equal('json-root');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('配置文件解析失败时抛出错误', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        fs.writeFileSync(path.join(dir, '.versionrc.json'), '{ 不合法的 json');
        expect(() => config.loadConfig(dir)).to.throw(/读取配置文件失败/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('guessType', () => {
    // 通过 normalizeFileEntry 间接验证 guessType
    it('package-lock.json 推断为 json-root', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        fs.writeFileSync(
          path.join(dir, '.versionrc.json'),
          JSON.stringify({ files: ['package-lock.json'] })
        );
        const cfg = config.loadConfig(dir);
        expect(cfg.files[0].type).to.equal('json-root');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('.json 推断为 json，.md 推断为 markdown', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-cfg-'));
      try {
        fs.writeFileSync(
          path.join(dir, '.versionrc.json'),
          JSON.stringify({ files: ['a.json', 'b.md', 'c.txt'] })
        );
        const cfg = config.loadConfig(dir);
        const map = Object.fromEntries(cfg.files.map((f) => [f.path, f.type]));
        expect(map['a.json']).to.equal('json');
        expect(map['b.md']).to.equal('markdown');
        expect(map['c.txt']).to.equal('text');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
