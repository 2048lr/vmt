'use strict';

const { expect } = require('chai');
const validator = require('../src/validator');

describe('validator', () => {
  describe('isValid', () => {
    it('接受标准 MAJOR.MINOR.PATCH 版本号', () => {
      expect(validator.isValid('1.0.0')).to.be.true;
      expect(validator.isValid('0.0.0')).to.be.true;
      expect(validator.isValid('10.20.30')).to.be.true;
    });

    it('接受带预发布与构建元数据的版本号', () => {
      expect(validator.isValid('1.0.0-alpha')).to.be.true;
      expect(validator.isValid('1.0.0-alpha.1')).to.be.true;
      expect(validator.isValid('1.0.0-x.7.z.92')).to.be.true;
      expect(validator.isValid('1.0.0+build.123')).to.be.true;
      expect(validator.isValid('1.0.0-alpha+001')).to.be.true;
    });

    it('拒绝非法版本号', () => {
      expect(validator.isValid('1.0')).to.be.false;
      expect(validator.isValid('1.0.0.0')).to.be.false;
      expect(validator.isValid('v1.0.0')).to.be.false;
      expect(validator.isValid('1.0.0-')).to.be.false;
      expect(validator.isValid('01.0.0')).to.be.false; // 前导零
      expect(validator.isValid('a.b.c')).to.be.false;
      expect(validator.isValid('')).to.be.false;
    });

    it('拒绝非字符串输入', () => {
      expect(validator.isValid(null)).to.be.false;
      expect(validator.isValid(undefined)).to.be.false;
      expect(validator.isValid(123)).to.be.false;
      expect(validator.isValid({})).to.be.false;
    });

    it('容忍首尾空白', () => {
      expect(validator.isValid('  1.0.0  ')).to.be.true;
    });
  });

  describe('parse', () => {
    it('解析出 major/minor/patch', () => {
      const p = validator.parse('2.3.4');
      expect(p.major).to.equal(2);
      expect(p.minor).to.equal(3);
      expect(p.patch).to.equal(4);
      expect(p.prerelease).to.be.undefined;
      expect(p.build).to.be.undefined;
      expect(p.raw).to.equal('2.3.4');
    });

    it('解析预发布与构建元数据', () => {
      const p = validator.parse('1.2.3-beta.1+build.7');
      expect(p.prerelease).to.equal('beta.1');
      expect(p.build).to.equal('build.7');
    });

    it('对非法版本返回 null', () => {
      expect(validator.parse('not-a-version')).to.be.null;
      expect(validator.parse('1.0')).to.be.null;
    });
  });

  describe('normalize', () => {
    it('去除前导 v / V', () => {
      expect(validator.normalize('v1.0.0')).to.equal('1.0.0');
      expect(validator.normalize('V2.0.0')).to.equal('2.0.0');
    });

    it('去除空白', () => {
      expect(validator.normalize('  1.2.3  ')).to.equal('1.2.3');
    });

    it('对非法值返回 null', () => {
      expect(validator.normalize('vx.y.z')).to.be.null;
      expect(validator.normalize('1.0')).to.be.null;
      expect(validator.normalize(null)).to.be.null;
    });
  });

  describe('compare', () => {
    it('正确比较版本大小', () => {
      expect(validator.compare('1.0.0', '2.0.0')).to.equal(-1);
      expect(validator.compare('2.0.0', '1.0.0')).to.equal(1);
      expect(validator.compare('1.0.0', '1.0.0')).to.equal(0);
    });

    it('遵循预发布优先级低于正式版', () => {
      expect(validator.compare('1.0.0-alpha', '1.0.0')).to.equal(-1);
    });
  });

  describe('inc', () => {
    it('递增 patch', () => {
      expect(validator.inc('1.2.3', 'patch')).to.equal('1.2.4');
    });

    it('递增 minor 并清零 patch', () => {
      expect(validator.inc('1.2.3', 'minor')).to.equal('1.3.0');
    });

    it('递增 major 并清零 minor/patch', () => {
      expect(validator.inc('1.2.3', 'major')).to.equal('2.0.0');
    });
  });
});
