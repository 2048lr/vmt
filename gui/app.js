'use strict';

/* ===== 可视化版本管理工具 - 前端逻辑 ===== */

(function () {
  // ===== 状态 =====
  const state = {
    config: null,
    checkResult: null,
    pendingAction: null // 待确认的操作
  };

  // ===== DOM 引用 =====
  const $ = (id) => document.getElementById(id);
  const dom = {
    cwdDisplay: $('cwdDisplay'),
    refreshBtn: $('refreshBtn'),
    statusCard: $('statusCard'),
    statusIcon: $('statusIcon'),
    statusValue: $('statusValue'),
    sourceVersion: $('sourceVersion'),
    fileCount: $('fileCount'),
    mismatchCount: $('mismatchCount'),
    fileList: $('fileList'),
    syncBtn: $('syncBtn'),
    newVersionInput: $('newVersionInput'),
    updateBtn: $('updateBtn'),
    syncTargetInput: $('syncTargetInput'),
    dryRunCheckbox: $('dryRunCheckbox'),
    previewSyncBtn: $('previewSyncBtn'),
    historyList: $('historyList'),
    refreshHistoryBtn: $('refreshHistoryBtn'),
    clearHistoryBtn: $('clearHistoryBtn'),
    toast: $('toast'),
    modal: $('modal'),
    modalTitle: $('modalTitle'),
    modalBody: $('modalBody'),
    modalCancel: $('modalCancel'),
    modalConfirm: $('modalConfirm')
  };

  // ===== API 调用 =====
  async function apiCall(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '请求失败');
      }
      return data;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  // ===== Toast 提示 =====
  let toastTimer = null;
  function showToast(message, type = 'info', duration = 3000) {
    dom.toast.textContent = message;
    dom.toast.className = `toast ${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, duration);
  }

  // ===== Modal 对话框 =====
  function showModal(title, body, onConfirm, confirmText = '确认') {
    dom.modalTitle.textContent = title;
    dom.modalBody.innerHTML = body;
    dom.modalConfirm.textContent = confirmText;
    dom.modal.classList.remove('hidden');
    state.pendingAction = onConfirm;
  }

  function hideModal() {
    dom.modal.classList.add('hidden');
    state.pendingAction = null;
  }

  // ===== 加载配置 =====
  async function loadConfig() {
    const data = await apiCall('/api/config');
    state.config = data.config;
    dom.cwdDisplay.textContent = '📁 ' + data.cwd;
    dom.cwdDisplay.title = data.cwd;
  }

  // ===== 检查版本 =====
  async function checkVersions() {
    dom.fileList.innerHTML = '<div class="loading">检查中...</div>';
    const data = await apiCall('/api/check');
    state.checkResult = data.result;
    renderOverview(data.result);
    renderFileList(data.result);
    updateButtons(data.result);
  }

  // ===== 渲染总览 =====
  function renderOverview(result) {
    if (result.consistent) {
      dom.statusCard.className = 'overview-card consistent';
      dom.statusIcon.textContent = '✓';
      dom.statusValue.textContent = '版本一致';
    } else {
      dom.statusCard.className = 'overview-card inconsistent';
      dom.statusIcon.textContent = '✗';
      dom.statusValue.textContent = '版本不一致';
    }

    dom.sourceVersion.textContent = result.sourceVersion || '(未检测到)';
    dom.fileCount.textContent = result.files.length;

    const mismatched = result.files.filter(
      (f) => f.exists && f.version && !f.matched
    ).length;
    const missing = result.files.filter((f) => !f.exists || !f.version).length;
    dom.mismatchCount.textContent = mismatched + (missing > 0 ? ` (${missing} 缺失)` : '');
  }

  // ===== 渲染文件列表 =====
  function renderFileList(result) {
    if (!result.files || result.files.length === 0) {
      dom.fileList.innerHTML = '<div class="empty">未配置任何检查文件</div>';
      return;
    }

    const html = result.files.map((file) => {
      const isSource = file.path === result.sourceFile;
      let statusClass = '';
      let icon = '';
      let versionClass = '';

      if (file.error) {
        statusClass = 'missing';
        icon = '!';
        versionClass = 'missing';
      } else if (!file.exists || !file.version) {
        statusClass = 'missing';
        icon = '?';
        versionClass = 'missing';
      } else if (file.matched) {
        statusClass = 'matched';
        icon = '✓';
        versionClass = 'matched';
      } else {
        statusClass = 'mismatched';
        icon = '✗';
        versionClass = 'mismatched';
      }

      if (isSource) statusClass = 'source';

      const versionDisplay = file.error
        ? `<div class="version-value missing">${escapeHtml(file.error)}</div>`
        : file.version
          ? `<div class="version-value ${versionClass}">${escapeHtml(file.version)}</div>`
          : '<div class="version-value missing">未检测到</div>';

      const warn = !file.valid && file.version
        ? '<div class="file-warn">⚠ 版本号格式不符合语义化规范</div>'
        : '';

      const sourceTag = isSource
        ? '<span class="file-source-tag">基准源</span>'
        : '';

      return `
        <div class="file-item ${statusClass}">
          <div class="file-status-icon">${icon}</div>
          <div class="file-info">
            <div class="file-name">${escapeHtml(file.path)} ${sourceTag}</div>
            <div class="file-path">${escapeHtml(file.absPath || '')}</div>
            ${warn}
          </div>
          <div class="file-version">
            <div class="version-label">版本</div>
            ${versionDisplay}
          </div>
        </div>
      `;
    }).join('');

    dom.fileList.innerHTML = html;
  }

  // ===== 更新按钮状态 =====
  function updateButtons(result) {
    const hasMismatch = !result.consistent;
    dom.syncBtn.disabled = false;
    dom.updateBtn.disabled = false;
    if (hasMismatch) {
      dom.syncBtn.classList.add('btn-primary');
    }
  }

  // ===== 同步版本 =====
  async function syncVersions(target, dryRun) {
    const body = { dryRun: !!dryRun };
    if (target) body.target = target;

    const data = await apiCall('/api/sync', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const result = data.result;
    const changed = result.results.filter((r) => r.changed).length;

    if (dryRun) {
      showToast(`预览完成：${changed} 个文件将被同步到 ${result.targetVersion}`, 'info');
    } else {
      if (changed > 0) {
        showToast(`成功同步 ${changed} 个文件到版本 ${result.targetVersion}`, 'success');
      } else {
        showToast('所有文件版本已一致，无需同步', 'info');
      }
      await checkVersions();
      await loadHistory();
    }
    return result;
  }

  // ===== 更新版本 =====
  async function updateVersion(version) {
    const data = await apiCall('/api/update', {
      method: 'POST',
      body: JSON.stringify({ version })
    });

    const result = data.result;
    if (result.success) {
      showToast(`版本已更新至 ${result.targetVersion}`, 'success');
      dom.newVersionInput.value = '';
      await checkVersions();
      await loadHistory();
    } else {
      showToast(result.error || '更新失败', 'error');
    }
    return result;
  }

  // ===== 加载历史记录 =====
  async function loadHistory() {
    try {
      const data = await apiCall('/api/history?limit=50');
      renderHistory(data.records);
    } catch (err) {
      dom.historyList.innerHTML = '<div class="empty">加载历史记录失败</div>';
    }
  }

  // ===== 渲染历史记录 =====
  function renderHistory(records) {
    if (!records || records.length === 0) {
      dom.historyList.innerHTML = '<div class="empty">暂无历史记录</div>';
      return;
    }

    const html = records.map((r) => {
      const time = formatTime(r.timestamp);
      const actionLabel = r.action === 'update' ? '更新' : (r.action === 'sync' ? '同步' : r.action);
      const actionClass = r.action;

      const versionLine = (r.before && r.after)
        ? `<div class="history-version"><span class="from">${escapeHtml(r.before)}</span> → <span class="to">${escapeHtml(r.after)}</span></div>`
        : '';

      const filesLine = (r.files && r.files.length > 0)
        ? `<div class="history-files">影响: ${r.files.map((f) => escapeHtml(f.path)).join(', ')}</div>`
        : '';

      return `
        <div class="history-item action-${actionClass}">
          <div class="history-header">
            <span class="history-action ${actionClass}">${actionLabel}</span>
            <span class="history-time">${time}</span>
          </div>
          <div class="history-details">${escapeHtml(r.details || '')}</div>
          ${versionLine}
          <div class="history-operator">操作人: ${escapeHtml(r.operator)}</div>
          ${filesLine}
        </div>
      `;
    }).join('');

    dom.historyList.innerHTML = html;
  }

  // ===== 工具函数 =====
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) {
      return iso;
    }
  }

  function isValidSemver(version) {
    return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[^\s]+)?(?:\+[^\s]+)?$/.test(version);
  }

  function incVersion(version, release) {
    const m = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/);
    if (!m) return null;
    let major = parseInt(m[1], 10);
    let minor = parseInt(m[2], 10);
    let patch = parseInt(m[3], 10);
    if (release === 'major') { major++; minor = 0; patch = 0; }
    else if (release === 'minor') { minor++; patch = 0; }
    else if (release === 'patch') { patch++; }
    return `${major}.${minor}.${patch}`;
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 刷新
    dom.refreshBtn.addEventListener('click', async () => {
      await checkVersions();
      await loadHistory();
      showToast('已刷新', 'info', 1500);
    });

    // 同步版本
    dom.syncBtn.addEventListener('click', async () => {
      if (!state.checkResult) return;
      const target = dom.syncTargetInput.value.trim() || null;
      const dryRun = dom.dryRunCheckbox.checked;

      if (target && !isValidSemver(target)) {
        showToast('目标版本号格式不正确', 'error');
        return;
      }

      if (dryRun) {
        await syncVersions(target, true);
        return;
      }

      // 实际写入需要确认
      const targetLabel = target || state.checkResult.sourceVersion;
      const mismatched = state.checkResult.files.filter(
        (f) => f.exists && f.version && !f.matched
      );
      const fileList = mismatched.map((f) => `<div>• ${escapeHtml(f.path)}: <code>${escapeHtml(f.version)}</code> → <code>${escapeHtml(targetLabel)}</code></div>`).join('');

      showModal(
        '确认同步版本',
        `<p>将以 <strong>${escapeHtml(targetLabel)}</strong> 为目标版本，更新以下 ${mismatched.length} 个文件：</p>${fileList}<p style="margin-top:12px;color:#909399;">此操作将实际修改文件内容，请确认。</p>`,
        async () => {
          hideModal();
          await syncVersions(target, false);
        },
        '确认同步'
      );
    });

    // 预览同步
    dom.previewSyncBtn.addEventListener('click', async () => {
      const target = dom.syncTargetInput.value.trim() || null;
      if (target && !isValidSemver(target)) {
        showToast('目标版本号格式不正确', 'error');
        return;
      }
      await syncVersions(target, true);
    });

    // 版本号输入校验
    dom.newVersionInput.addEventListener('input', () => {
      const v = dom.newVersionInput.value.trim();
      if (v && !isValidSemver(v)) {
        dom.newVersionInput.classList.add('invalid');
      } else {
        dom.newVersionInput.classList.remove('invalid');
      }
    });

    // 快捷递增按钮
    document.querySelectorAll('[data-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const release = btn.dataset.inc;
        const current = state.checkResult?.sourceVersion;
        if (!current) {
          showToast('未检测到当前版本号', 'error');
          return;
        }
        const next = incVersion(current, release);
        if (next) {
          dom.newVersionInput.value = next;
          dom.newVersionInput.classList.remove('invalid');
        }
      });
    });

    // 更新版本
    dom.updateBtn.addEventListener('click', async () => {
      const version = dom.newVersionInput.value.trim();
      if (!version) {
        showToast('请输入新版本号', 'error');
        return;
      }
      if (!isValidSemver(version)) {
        showToast('版本号不符合语义化规范 (MAJOR.MINOR.PATCH)', 'error');
        return;
      }

      const current = state.checkResult?.sourceVersion;
      showModal(
        '确认更新版本',
        `<p>将版本号从 <code>${escapeHtml(current || '(空)')}</code> 更新为 <code>${escapeHtml(version)}</code>，并同步到所有文件。</p><p style="margin-top:12px;color:#909399;">此操作将实际修改文件内容，请确认。</p>`,
        async () => {
          hideModal();
          await updateVersion(version);
        },
        '确认更新'
      );
    });

    // 刷新历史
    dom.refreshHistoryBtn.addEventListener('click', loadHistory);

    // 清空历史
    dom.clearHistoryBtn.addEventListener('click', () => {
      showModal(
        '确认清空历史',
        '<p>确定要清空所有版本变更历史记录吗？此操作不可恢复。</p>',
        async () => {
          hideModal();
          try {
            await apiCall('/api/history', { method: 'DELETE' });
            showToast('历史记录已清空', 'success');
            await loadHistory();
          } catch (e) {
            // 错误已由 apiCall 处理
          }
        },
        '确认清空'
      );
    });

    // Modal 按钮
    dom.modalCancel.addEventListener('click', hideModal);
    dom.modalConfirm.addEventListener('click', () => {
      if (typeof state.pendingAction === 'function') {
        state.pendingAction();
      } else {
        hideModal();
      }
    });
    dom.modal.querySelector('.modal-mask').addEventListener('click', hideModal);

    // ESC 关闭 modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.modal.classList.contains('hidden')) {
        hideModal();
      }
    });
  }

  // ===== 初始化 =====
  async function init() {
    bindEvents();
    try {
      await loadConfig();
      await checkVersions();
      await loadHistory();
    } catch (e) {
      dom.fileList.innerHTML = '<div class="empty">初始化失败，请检查服务是否正常运行</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
