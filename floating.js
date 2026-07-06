// floating.js - v2.8.1 (修复 XLSX 加载)
(function() {
  'use strict';
  
  if (window.__DXM_FLOATING_LOADED__) {
    console.log('[Floating] 已加载，跳过');
    return;
  }
  window.__DXM_FLOATING_LOADED__ = true;
  
  console.log('[Floating] 加载悬浮窗...');
  
  let isPanelOpen = false;
  
  // ============================================================
  // 动态加载 XLSX 库
  // ============================================================
  
  function loadXLSX() {
    return new Promise((resolve, reject) => {
      if (typeof XLSX !== 'undefined') {
        console.log('[Floating] XLSX 已存在');
        resolve();
        return;
      }
      
      console.log('[Floating] 开始加载 XLSX 库...');
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('xlsx.full.min.js');
      script.onload = () => {
        console.log('[Floating] XLSX 库加载完成');
        resolve();
      };
      script.onerror = (err) => {
        console.error('[Floating] XLSX 加载失败:', err);
        reject(new Error('XLSX 库加载失败，请刷新页面重试'));
      };
      document.head.appendChild(script);
    });
  }
  
  // ============================================================
  // 加载设置
  // ============================================================
  
  let settings = {
    rate: 0.62,
    interval: 0.4,
    threshold: 80
  };
  
  let floatPos = { x: 20, y: 145 };
  
  function loadSettings() {
    chrome.storage.local.get(['shopeeSettings', 'floatPosition'], (result) => {
      if (result.shopeeSettings) {
        settings = {
          rate: parseFloat(result.shopeeSettings.rate) || 0.62,
          interval: parseFloat(result.shopeeSettings.interval) || 0.4,
          threshold: parseFloat(result.shopeeSettings.threshold) || 80
        };
        updateUI();
      }
      if (result.floatPosition) {
        floatPos = result.floatPosition;
        applyFloatPosition();
      }
    });
  }
  
  function saveFloatPosition() {
    chrome.storage.local.set({ floatPosition: floatPos });
  }
  
  function applyFloatPosition() {
    const panel = document.getElementById('dxmFloatPanel');
    const btn = document.getElementById('dxmFloatBtn');
    if (panel) {
      panel.style.top = floatPos.y + 'px';
      panel.style.right = floatPos.x + 'px';
    }
    if (btn) {
      btn.style.top = (floatPos.y - 65) + 'px';
      btn.style.right = floatPos.x + 'px';
    }
  }
  
  // ============================================================
  // 日志
  // ============================================================
  
  function log(message, type = 'info') {
    if (!isPanelOpen) return;
    
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${message}`;
    const logArea = document.getElementById('dxmLogArea');
    if (!logArea) return;
    
    const div = document.createElement('div');
    div.textContent = entry;
    div.className = type;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
    
    chrome.storage.local.get(['logs'], (result) => {
      const logs = result.logs || [];
      logs.push({ message: entry, type: type, time: time });
      if (logs.length > 100) logs.shift();
      chrome.storage.local.set({ logs: logs });
    });
  }
  
  function loadLogs() {
    const logArea = document.getElementById('dxmLogArea');
    if (!logArea) return;
    
    chrome.storage.local.get(['logs'], (result) => {
      const logs = result.logs || [];
      logArea.innerHTML = '';
      logs.forEach(entry => {
        const div = document.createElement('div');
        div.textContent = entry.message;
        div.className = entry.type || 'info';
        logArea.appendChild(div);
      });
      logArea.scrollTop = logArea.scrollHeight;
    });
  }
  
  // ============================================================
  // 创建浮窗
  // ============================================================
  
  function createFloatUI() {
    // 检查是否已存在
    if (document.getElementById('dxmFloatBtn')) {
      console.log('[Floating] 浮窗已存在');
      return;
    }
    
    console.log('[Floating] 创建浮窗...');
    
    const btn = document.createElement('button');
    btn.className = 'dxm-float-btn';
    btn.id = 'dxmFloatBtn';
    btn.innerHTML = '📦<span class="badge-dot" id="dxmBadge">●</span>';
    btn.title = '店小蜜批量填写助手';
    document.body.appendChild(btn);
    
    const panel = document.createElement('div');
    panel.className = 'dxm-float-panel';
    panel.id = 'dxmFloatPanel';
    panel.innerHTML = `
      <div class="panel-header" id="dxmDragHandle">
        <span class="title">📦 店小蜜助手 <span class="badge">v2.8</span></span>
        <button class="close-btn" id="dxmClosePanel">✕</button>
      </div>
      <div class="panel-body">
        <div class="form-group">
          <label>📂 Excel 文件</label>
          <input type="file" id="dxmFileInput" accept=".xlsx,.xls">
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>💰 倍率</label>
            <input type="number" id="dxmRateInput" step="0.01" value="0.62">
          </div>
          <div class="form-group">
            <label>⏱ 间隔(秒)</label>
            <input type="number" id="dxmIntervalInput" step="0.1" value="0.4">
          </div>
        </div>
        
        <div class="form-group">
          <label>⚡ 动态阈值</label>
          <input type="number" id="dxmThresholdInput" step="5" min="10" value="80">
        </div>
        
        <div class="btn-row">
          <button class="btn btn-start" id="dxmStartBtn">▶ 开始</button>
          <button class="btn btn-pause" id="dxmPauseBtn" disabled>⏸ 暂停</button>
          <button class="btn btn-stop" id="dxmStopBtn" disabled>⏹ 停止</button>
        </div>
        
        <div class="status-bar">
          <span class="status" id="dxmStatusText">✅ 等待开始</span>
          <span id="dxmProgressText"></span>
        </div>
        
        <div id="dxmLogArea">📋 日志将显示在这里...</div>
        
        <div class="footer">
          © 2026 <strong>LanMay Studio</strong> · clang · CC BY 4.0
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    
    bindEvents();
    enableDrag();
    loadSettings();
    loadLogs();
    applyFloatPosition();
    
    console.log('[Floating] 浮窗创建完成');
  }
  
  // ============================================================
  // 拖拽
  // ============================================================
  
  function enableDrag() {
    const panel = document.getElementById('dxmFloatPanel');
    const handle = document.getElementById('dxmDragHandle');
    const btn = document.getElementById('dxmFloatBtn');
    
    if (!panel || !handle) return;
    
    let isDragging = false;
    let startX, startY, startRight, startTop;
    
    handle.style.cursor = 'grab';
    handle.style.userSelect = 'none';
    
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.close-btn')) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = panel.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startTop = rect.top;
      
      handle.style.cursor = 'grabbing';
      panel.style.transition = 'none';
      btn.style.transition = 'none';
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = startX - e.clientX;
      const deltaY = e.clientY - startY;
      
      let newRight = Math.max(10, Math.min(window.innerWidth - 340, startRight + deltaX));
      let newTop = Math.max(10, Math.min(window.innerHeight - 100, startTop + deltaY));
      
      floatPos.x = newRight;
      floatPos.y = newTop;
      
      panel.style.right = newRight + 'px';
      panel.style.top = newTop + 'px';
      btn.style.right = newRight + 'px';
      btn.style.top = (newTop - 65) + 'px';
      
      e.preventDefault();
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.style.cursor = 'grab';
        panel.style.transition = '';
        btn.style.transition = '';
        saveFloatPosition();
      }
    });
    
    window.addEventListener('resize', () => {
      const rect = panel.getBoundingClientRect();
      const maxRight = window.innerWidth - 340;
      const maxTop = window.innerHeight - 100;
      
      if (floatPos.x > maxRight) floatPos.x = Math.max(10, maxRight);
      if (floatPos.y > maxTop) floatPos.y = Math.max(10, maxTop);
      
      applyFloatPosition();
      saveFloatPosition();
    });
  }
  
  // ============================================================
  // 绑定事件
  // ============================================================
  
  function bindEvents() {
    const btn = document.getElementById('dxmFloatBtn');
    const panel = document.getElementById('dxmFloatPanel');
    const closeBtn = document.getElementById('dxmClosePanel');
    
    btn.addEventListener('click', () => {
      const isOpening = !panel.classList.contains('open');
      panel.classList.toggle('open');
      
      if (isOpening) {
        isPanelOpen = true;
        loadLogs();
        loadSettings();
      } else {
        isPanelOpen = false;
      }
    });
    
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      isPanelOpen = false;
    });
    
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('open')) {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.classList.remove('open');
          isPanelOpen = false;
        }
      }
    });
    
    const fileInput = document.getElementById('dxmFileInput');
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        log('📂 已选择：' + fileInput.files[0].name);
      }
    });
    
    const rateInput = document.getElementById('dxmRateInput');
    const intervalInput = document.getElementById('dxmIntervalInput');
    const thresholdInput = document.getElementById('dxmThresholdInput');
    
    [rateInput, intervalInput, thresholdInput].forEach(input => {
      input.addEventListener('change', () => {
        const settings = {
          rate: document.getElementById('dxmRateInput').value || '0.62',
          interval: document.getElementById('dxmIntervalInput').value || '0.4',
          threshold: document.getElementById('dxmThresholdInput').value || '80'
        };
        chrome.storage.local.set({ shopeeSettings: settings });
      });
    });
    
    document.getElementById('dxmStartBtn').addEventListener('click', startFill);
    document.getElementById('dxmPauseBtn').addEventListener('click', togglePause);
    document.getElementById('dxmStopBtn').addEventListener('click', stopFill);
  }
  
  function updateUI() {
    const rateInput = document.getElementById('dxmRateInput');
    const intervalInput = document.getElementById('dxmIntervalInput');
    const thresholdInput = document.getElementById('dxmThresholdInput');
    
    if (rateInput) rateInput.value = settings.rate;
    if (intervalInput) intervalInput.value = settings.interval;
    if (thresholdInput) thresholdInput.value = settings.threshold;
  }
  
  // ============================================================
  // 读取Excel
  // ============================================================
  
  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') {
        reject(new Error('XLSX 库未加载，请刷新页面重试'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const rows = json.slice(1).filter(row => row.length > 0 && row[0]);
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  // ============================================================
  // 核心功能
  // ============================================================
  
  async function startFill() {
    const fileInput = document.getElementById('dxmFileInput');
    const rateInput = document.getElementById('dxmRateInput');
    const intervalInput = document.getElementById('dxmIntervalInput');
    const thresholdInput = document.getElementById('dxmThresholdInput');
    
    if (!fileInput.files || !fileInput.files[0]) {
      log('❌ 请先选择 Excel 文件', 'error');
      return;
    }
    
    const rate = parseFloat(rateInput.value) || 0.62;
    const interval = parseFloat(intervalInput.value) || 0.4;
    const threshold = parseFloat(thresholdInput.value) || 80;
    
    try {
      log('📖 正在读取 Excel...');
      const data = await readExcelFile(fileInput.files[0]);
      
      if (data.length === 0) {
        log('❌ Excel 中没有数据', 'error');
        return;
      }
      
      log('✅ 读取到 ' + data.length + ' 行数据', 'success');
      log('⚡ 动态阈值: ' + threshold);
      
      document.getElementById('dxmStartBtn').disabled = true;
      document.getElementById('dxmPauseBtn').disabled = false;
      document.getElementById('dxmStopBtn').disabled = false;
      document.getElementById('dxmStatusText').textContent = '🔄 运行中...';
      document.getElementById('dxmStatusText').className = 'status running';
      
      chrome.runtime.sendMessage({
        action: 'startFill',
        data: { rows: data, rate: rate, interval: interval, threshold: threshold }
      }, (response) => {
        if (response && response.success) {
          log('✅ ' + response.message, 'success');
          document.getElementById('dxmStatusText').textContent = '✅ 完成';
          document.getElementById('dxmStatusText').className = 'status';
        } else {
          log('❌ ' + (response?.message || '未知错误'), 'error');
          document.getElementById('dxmStatusText').textContent = '❌ 出错';
          document.getElementById('dxmStatusText').className = 'status';
        }
        document.getElementById('dxmStartBtn').disabled = false;
        document.getElementById('dxmPauseBtn').disabled = true;
        document.getElementById('dxmStopBtn').disabled = true;
      });
      
    } catch (err) {
      log('❌ 错误：' + err.message, 'error');
      document.getElementById('dxmStartBtn').disabled = false;
      document.getElementById('dxmPauseBtn').disabled = true;
      document.getElementById('dxmStopBtn').disabled = true;
    }
  }
  
  function togglePause() {
    const btn = document.getElementById('dxmPauseBtn');
    const status = document.getElementById('dxmStatusText');
    
    if (btn.textContent === '⏸ 暂停') {
      btn.textContent = '▶ 继续';
      status.textContent = '⏸ 已暂停';
      status.className = 'status paused';
      chrome.runtime.sendMessage({ action: 'pause' });
    } else {
      btn.textContent = '⏸ 暂停';
      status.textContent = '🔄 运行中...';
      status.className = 'status running';
      chrome.runtime.sendMessage({ action: 'resume' });
    }
  }
  
  function stopFill() {
    chrome.runtime.sendMessage({ action: 'stop' });
    document.getElementById('dxmStartBtn').disabled = false;
    document.getElementById('dxmPauseBtn').disabled = true;
    document.getElementById('dxmStopBtn').disabled = true;
    document.getElementById('dxmPauseBtn').textContent = '⏸ 暂停';
    document.getElementById('dxmStatusText').textContent = '⏹ 已停止';
    document.getElementById('dxmStatusText').className = 'status stopped';
    log('⏹ 已停止', 'warn');
  }
  
  // ============================================================
  // 监听消息
  // ============================================================
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'log') {
      log(message.message, message.type || 'info');
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'progress') {
      const progress = document.getElementById('dxmProgressText');
      if (progress) {
        progress.textContent = '第 ' + message.current + ' / ' + message.total + ' 件';
      }
      sendResponse({ success: true });
      return true;
    }
  });
  
  // ============================================================
  // 初始化
  // ============================================================
  
  function init() {
    // 先加载 XLSX，再创建 UI
    loadXLSX()
      .then(() => {
        console.log('[Floating] XLSX 就绪');
        if (!document.getElementById('dxmFloatBtn')) {
          createFloatUI();
        }
      })
      .catch((err) => {
        console.error('[Floating] XLSX 加载失败:', err);
        // 即使失败也创建UI，但会提示错误
        if (!document.getElementById('dxmFloatBtn')) {
          createFloatUI();
          // 显示错误提示
          setTimeout(() => {
            const logArea = document.getElementById('dxmLogArea');
            if (logArea) {
              const div = document.createElement('div');
              div.textContent = '[⚠️] XLSX 库加载失败，请刷新页面重试';
              div.className = 'error';
              logArea.appendChild(div);
            }
          }, 500);
        }
      });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 800);
    });
  } else {
    setTimeout(init, 800);
  }
  
  console.log('[Floating] 悬浮窗脚本已加载');
})();