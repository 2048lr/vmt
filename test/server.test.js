'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createFixture, readJson } = require('./helper');

/**
 * server.startServer 会真实监听端口；这里通过 port=0 让系统分配空闲端口，
 * 并用 supertest 直接请求该 server 实例（supertest 支持传入 http.Server）。
 */
function buildServer(fx) {
  // 延迟 require，避免单次 require 在进程内缓存导致 cwd 混淆
  delete require.cache[require.resolve('../src/server')];
  const { startServer } = require('../src/server');
  const server = startServer({ cwd: fx.dir, port: 0, host: '127.0.0.1', silent: true });
  return server;
}

describe('server (Express API)', function () {
  // 涉及真实监听，给稍长时间
  this.timeout(8000);

  let fx;
  let server;

  beforeEach(() => {
    fx = createFixture({ version: '1.0.0', readmeVersion: '1.0.0', lockVersion: '1.0.0' });
    server = buildServer(fx);
  });

  afterEach((done) => {
    server.close(() => {
      fs.rmSync(fx.dir, { recursive: true, force: true });
      done();
    });
  });

  it('GET /api/config 返回配置', async () => {
    const res = await request(server).get('/api/config').expect(200);
    expect(res.body.success).to.be.true;
    expect(res.body.config.source).to.equal('package.json');
    expect(res.body.config.files).to.have.lengthOf(3);
    expect(res.body.cwd).to.equal(fx.dir);
  });

  it('GET /api/check 报告一致性', async () => {
    const res = await request(server).get('/api/check').expect(200);
    expect(res.body.success).to.be.true;
    expect(res.body.result.consistent).to.be.true;
    expect(res.body.result.sourceVersion).to.equal('1.0.0');
  });

  it('POST /api/sync 同步到基准版本', async () => {
    // 制造不一致：README 版本不同（格式需匹配默认 pattern）
    fs.writeFileSync(
      fx.paths.readme,
      '# fixture-project\n\n> Version: `9.9.9`\n\n一些说明文档。\n',
      'utf8'
    );
    const res = await request(server)
      .post('/api/sync')
      .send({})
      .expect(200);
    expect(res.body.success).to.be.true;
    expect(res.body.result.targetVersion).to.equal('1.0.0');
    expect(fs.readFileSync(fx.paths.readme, 'utf8')).to.include('1.0.0');
  });

  it('POST /api/sync 支持 dryRun', async () => {
    const res = await request(server)
      .post('/api/sync')
      .send({ dryRun: true })
      .expect(200);
    expect(res.body.success).to.be.true;
    expect(res.body.result.results.some((r) => r.dryRun)).to.be.true;
  });

  it('POST /api/update 设置新版本并同步', async () => {
    const res = await request(server)
      .post('/api/update')
      .send({ version: '2.0.0' })
      .expect(200);
    expect(res.body.success).to.be.true;
    expect(res.body.result.targetVersion).to.equal('2.0.0');
    expect(readJson(fx.paths.pkg).version).to.equal('2.0.0');
    expect(readJson(fx.paths.lock).version).to.equal('2.0.0');
  });

  it('POST /api/update 缺少 version 返回 400', async () => {
    const res = await request(server)
      .post('/api/update')
      .send({})
      .expect(400);
    expect(res.body.success).to.be.false;
    expect(res.body.error).to.match(/version/);
  });

  it('GET /api/history 返回历史数组', async () => {
    // 先触发一次 update 产生历史
    await request(server).post('/api/update').send({ version: '1.1.0' });
    const res = await request(server).get('/api/history').expect(200);
    expect(res.body.success).to.be.true;
    expect(res.body.records).to.be.an('array').with.lengthOf(1);
    expect(res.body.records[0].after).to.equal('1.1.0');
  });

  it('DELETE /api/history 清空历史', async () => {
    await request(server).post('/api/update').send({ version: '1.1.0' });
    await request(server).delete('/api/history').expect(200);
    const res = await request(server).get('/api/history').expect(200);
    expect(res.body.records).to.deep.equal([]);
  });

  it('GET /api/validate 校验版本号', async () => {
    const ok = await request(server)
      .get('/api/validate')
      .query({ version: '1.2.3' })
      .expect(200);
    expect(ok.body.valid).to.be.true;
    expect(ok.body.parsed.major).to.equal(1);

    const bad = await request(server)
      .get('/api/validate')
      .query({ version: 'not-valid' })
      .expect(200);
    expect(bad.body.valid).to.be.false;
    expect(bad.body.parsed).to.be.null;
  });

  it('GET / 返回 index.html', async () => {
    const res = await request(server).get('/').expect(200);
    expect(res.text).to.match(/<html/i);
  });

  it('GET /api/validate 缺少 version 返回 400', async () => {
    const res = await request(server).get('/api/validate').expect(400);
    expect(res.body.success).to.be.false;
  });
});
