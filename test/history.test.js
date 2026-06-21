'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const history = require('../src/history');
const { createFixture } = require('./helper');

describe('history', () => {
  describe('getOperator', () => {
    it('返回非空字符串', () => {
      const op = history.getOperator();
      expect(op).to.be.a('string');
      expect(op.length).to.be.greaterThan(0);
    });

    it('VMT_OPERATOR 环境变量优先', () => {
      const before = process.env.VMT_OPERATOR;
      process.env.VMT_OPERATOR = 'tester';
      try {
        expect(history.getOperator()).to.equal('tester');
      } finally {
        if (before === undefined) delete process.env.VMT_OPERATOR;
        else process.env.VMT_OPERATOR = before;
      }
    });
  });

  describe('readHistory / writeHistory', () => {
    it('文件不存在时返回空数组', () => {
      const file = path.join(os.tmpdir(), 'vmt-not-exist-' + Date.now() + '.json');
      expect(history.readHistory(file)).to.deep.equal([]);
    });

    it('写入后再读取可还原', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-hist-'));
      const file = path.join(dir, '.version-history.json');
      try {
        history.writeHistory(file, [{ action: 'update', after: '1.0.0' }]);
        const data = history.readHistory(file);
        expect(data).to.have.lengthOf(1);
        expect(data[0].action).to.equal('update');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('写入会自动创建父目录', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-hist-'));
      const file = path.join(dir, 'nested', 'deep', '.version-history.json');
      try {
        history.writeHistory(file, []);
        expect(fs.existsSync(file)).to.be.true;
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('损坏的 JSON 文件返回空数组', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmt-hist-'));
      const file = path.join(dir, '.version-history.json');
      try {
        fs.writeFileSync(file, '{ 损坏');
        expect(history.readHistory(file)).to.deep.equal([]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('addRecord / getHistory', () => {
    it('新增记录后可通过 getHistory 查询', () => {
      const fx = createFixture();
      try {
        const rec = history.addRecord(fx.dir, '.version-history.json', {
          action: 'update',
          before: '1.0.0',
          after: '1.1.0',
          details: '测试记录'
        });
        expect(rec.id).to.be.a('string');
        expect(rec.action).to.equal('update');
        expect(rec.before).to.equal('1.0.0');
        expect(rec.after).to.equal('1.1.0');
        expect(rec.operator).to.be.a('string');

        const list = history.getHistory(fx.dir, '.version-history.json');
        expect(list).to.have.lengthOf(1);
        expect(list[0].id).to.equal(rec.id);
      } finally {
        // removeDir
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });

    it('getHistory 倒序返回（最新在前）并支持 limit', () => {
      const fx = createFixture();
      try {
        for (let i = 0; i < 5; i++) {
          history.addRecord(fx.dir, '.version-history.json', {
            action: 'update',
            after: `1.0.${i}`
          });
        }
        const all = history.getHistory(fx.dir, '.version-history.json');
        expect(all).to.have.lengthOf(5);
        // 倒序
        expect(all[0].after).to.equal('1.0.4');
        expect(all[4].after).to.equal('1.0.0');

        const limited = history.getHistory(fx.dir, '.version-history.json', { limit: 2 });
        expect(limited).to.have.lengthOf(2);
        expect(limited[0].after).to.equal('1.0.4');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('clearHistory', () => {
    it('清空后历史记录为空', () => {
      const fx = createFixture();
      try {
        history.addRecord(fx.dir, '.version-history.json', { action: 'update', after: '1.0.0' });
        history.clearHistory(fx.dir, '.version-history.json');
        const list = history.getHistory(fx.dir, '.version-history.json');
        expect(list).to.deep.equal([]);
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });

  describe('记录上限', () => {
    it('超过 500 条时仅保留最近 500 条', () => {
      const fx = createFixture();
      try {
        for (let i = 0; i < 510; i++) {
          history.addRecord(fx.dir, '.version-history.json', {
            action: 'update',
            after: `1.0.${i}`
          });
        }
        const file = path.join(fx.dir, '.version-history.json');
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(raw).to.have.lengthOf(500);
        // 最后一条（数组末尾）应是最新写入
        expect(raw[raw.length - 1].after).to.equal('1.0.509');
      } finally {
        fs.rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  });
});
