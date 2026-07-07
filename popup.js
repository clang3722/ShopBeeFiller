// popup.js - v2.8.3
let isRunning = false;
let isPaused = false;
let currentTabId = null;

const fileInput = document.getElementById('fileInput');
const rateInput = document.getElementById('rateInput');
const intervalInput = document.getElementById('intervalInput');
const thresholdInput = document.getElementById('thresholdInput');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
const progressText = document.getElementById('progressText');
const logArea = document.getElementById('logArea');

// ============================================================
// 保存和加载设置
// ============================================================

function saveSettings() {
  const settings = {
    rate: rateInput.value || '0.62',
    interval: intervalInput.value || '0.4',
    threshold: thresholdInput.value || '80'
  };
  chrome.storage.local.set({ shopeeSettings: settings });
}

function loadSettings() {
  chrome.storage.local.get(['shopeeSettings'], (result) => {
    if (result.shopeeSettings) {
      const settings = result.shopeeSettings;
      if (settings.rate) rateInput.value = settings.rate;
      if (settings.interval) intervalInput.value = settings.interval;
      if (settings.threshold) thresholdInput.value = settings.threshold;
    }
  });
}

rateInput.addEventListener('change', saveSettings);
intervalInput.addEventListener('change', saveSettings);
thresholdInput.addEventListener('change', saveSettings);

// ============================================================
// 日志函数
// ============================================================

function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${message}`;
  const div = document.createElement('div');
  div.textContent = entry;
  div.className = type;
  logArea.appendChild(div);
  logArea.scrollTop = logArea.scrollHeight;
  
  chrome.storage.local.get(['logs'], (result) => {
    const logs = result.logs || [];
    logs.push({ message: entry, type: type, time: time });
    if (logs.length > 200) logs.shift();
    chrome.storage.local.set({ logs: logs });
  });
}

function loadLogs() {
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
// 读取 Excel
// ============================================================

function readExcelFile(file) {
  return new Promise((resolve, reject) => {
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
// 注入脚本
// ============================================================

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    return true;
  } catch (e) {
    return true;
  }
}

async function injectFillScript(rows, rate, interval, threshold) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  
  if (!tab.url || !tab.url.includes('dianxiaomi.com')) {
    return { success: false, message: '请在店小蜜页面使用' };
  }
  
  await ensureContentScript(tab.id);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return new Promise((resolve) => {
    let isResolved = false;
    
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve({ success: false, message: '操作超时（120秒），请检查页面是否正常' });
      }
    }, 120000);
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'startFill',
      data: { rows, rate, interval, threshold }
    }, (response) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          resolve({ success: false, message: '通信错误: ' + chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, message: '无响应' });
        }
      }
    });
  });
}

// ============================================================
// 消息监听
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'log') {
    const type = message.type === 'error' ? 'error' : 
                 message.type === 'success' ? 'success' : 
                 message.type === 'warn' ? 'warn' : 'info';
    log(message.message, type);
    return false;
  }
  
  if (message.action === 'progress') {
    progressText.textContent = `第 ${message.current} / ${message.total} 件`;
    return false;
  }
  
  return false;
});

// ============================================================
// 按钮事件
// ============================================================

startBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url || !tab.url.includes('dianxiaomi.com')) {
    log('❌ 请在店小蜜页面使用此工具', 'error');
    return;
  }
  
  if (!fileInput.files || !fileInput.files[0]) {
    log('❌ 请先选择 Excel 文件', 'error');
    return;
  }
  
  const rate = parseFloat(rateInput.value) || 0.62;
  const interval = parseFloat(intervalInput.value) || 0.4;
  const threshold = parseFloat(thresholdInput.value) || 80;
  
  try {
    log('📖 正在读取 Excel...');
    const rows = await readExcelFile(fileInput.files[0]);
    
    if (rows.length === 0) {
      log('❌ Excel 中没有数据', 'error');
      return;
    }
    
    log('✅ 读取到 ' + rows.length + ' 行数据', 'success');
    log('⚡ 动态阈值: ' + threshold);
    
    isRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    statusText.textContent = '🔄 运行中...';
    statusText.className = 'status running';
    progressText.textContent = '处理中...';
    
    const result = await injectFillScript(rows, rate, interval, threshold);
    
    if (result && result.success) {
      log('✅ ' + result.message, 'success');
      statusText.textContent = '✅ 完成';
      statusText.className = 'status';
    } else {
      log('❌ ' + (result?.message || '未知错误'), 'error');
      statusText.textContent = '❌ 出错';
      statusText.className = 'status';
    }
    
  } catch (err) {
    log('❌ 错误：' + err.message, 'error');
    statusText.textContent = '❌ 出错';
    statusText.className = 'status';
  } finally {
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    pauseBtn.textContent = '⏸ 暂停';
  }
});

pauseBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? '▶ 继续' : '⏸ 暂停';
  statusText.textContent = isPaused ? '⏸ 已暂停' : '🔄 运行中...';
  statusText.className = isPaused ? 'status paused' : 'status running';
  
  chrome.tabs.sendMessage(currentTabId, {
    action: isPaused ? 'pause' : 'resume'
  }).catch(() => {});
});

stopBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  
  isRunning = false;
  isPaused = false;
  statusText.textContent = '⏹ 已停止';
  statusText.className = 'status stopped';
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
  pauseBtn.textContent = '⏸ 暂停';
  
  chrome.tabs.sendMessage(currentTabId, {
    action: 'stop'
  }).catch(() => {});
  
  log('⏹ 已停止', 'warn');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'F8') {
    e.preventDefault();
    if (!pauseBtn.disabled) pauseBtn.click();
  }
  if (e.key === 'Escape') {
    if (!stopBtn.disabled) stopBtn.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    log('📂 已选择：' + fileInput.files[0].name, 'info');
  }
});

// ============================================================
// 初始化
// ============================================================

loadSettings();
loadLogs();
log('✅ 准备就绪，请选择 Excel 文件', 'success');
log('💡 所有设置自动保存', 'info');