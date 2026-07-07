// content.js - v2.9.3
// (c) 2026 LanMay Studio · clang
// License: CC BY 4.0

(function() {
  'use strict';
  
  if (window.__DXM_CONTENT_LOADED__) {
    console.log('[Content] 已加载，跳过重复初始化');
    return;
  }
  window.__DXM_CONTENT_LOADED__ = true;

  let isPaused = false;
  let isStopped = false;
  let totalCount = 0;
  let THRESHOLD = 80;
  
  let currentRowIndex = 0;
  let startRow = 1;
  let rowsData = [];

  function contentLog(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${message}`;
    console.log('[Content]', entry);
    chrome.runtime.sendMessage({
      action: 'log',
      message: entry,
      type: type
    }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startFill') {
      isPaused = false;
      isStopped = false;
      THRESHOLD = message.data.threshold || 80;
      startRow = message.data.startRow || 1;
      rowsData = message.data.rows;
      currentRowIndex = startRow - 1;
      
      contentLog('收到指令: ' + rowsData.length + ' 行');
      contentLog('⚡ 动态阈值: ' + THRESHOLD);
      contentLog('📍 起始行: ' + startRow);
      
      (async () => {
        try {
          const result = await fillAllProducts(rowsData, message.data.rate, message.data.interval);
          sendResponse(result);
        } catch (err) {
          contentLog('异常: ' + err.message, 'error');
          sendResponse({ success: false, message: err.message });
        }
      })();
      return true;
    }
    
    if (message.action === 'pause') {
      isPaused = true;
      contentLog('⏸ 已暂停 [行' + (currentRowIndex + 1) + ']', 'warn');
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'resume') {
      isPaused = false;
      contentLog('▶ 已继续 [从行' + (currentRowIndex + 1) + ' 恢复]');
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'stop') {
      isStopped = true;
      isPaused = false;
      contentLog('⏹ 已停止 [行' + (currentRowIndex + 1) + ']', 'warn');
      sendResponse({ success: true });
      return true;
    }
    
    return true;
  });

  // ============================================================
  // 智能修正
  // ============================================================

  function fixPrice(price) {
    let result = parseFloat(price);
    if (result < 4) {
      contentLog('⚠️ 价格 ' + result.toFixed(2) + ' < 4，修正为 4');
      result = 4;
    }
    return result.toFixed(2);
  }

  function fixWeight(weight) {
    let result = parseFloat(weight);
    if (result > 150) {
      contentLog('⚠️ 重量 ' + result + 'g > 150，修正为 150g');
      result = 150;
    }
    if (result === 1) {
      contentLog('⚠️ 重量 1g，修正为 2g');
      result = 2;
    }
    return result;
  }

  // ============================================================
  // 动态倍率
  // ============================================================

  function calculateDynamicPrice(basePrice, rate) {
    let result = basePrice * rate;
    let multiplier = rate;
    
    if (result > THRESHOLD) {
      multiplier = rate * 0.8;
      result = basePrice * multiplier;
      contentLog('⚡ 价格 > ' + THRESHOLD + '，降为4倍 (倍率: ' + multiplier.toFixed(3) + ')');
    }
    
    if (result > THRESHOLD) {
      multiplier = rate * 0.6;
      result = basePrice * multiplier;
      contentLog('⚡ 4倍 > ' + THRESHOLD + '，降为3倍 (倍率: ' + multiplier.toFixed(3) + ')');
    }
    
    if (result < 4) result = 4;
    return result.toFixed(2);
  }

  // ============================================================
  // 数量提取：中文数字 + 英文数字 + 阿拉伯数字
  // ============================================================

  function extractQuantity(name) {
    // 1. 中文数字转阿拉伯数字
    const chineseMap = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };
    
    const cnMatch = name.match(/[一二三四五六七八九十百千]+/);
    if (cnMatch) {
      let num = 0;
      let temp = 0;
      for (const char of cnMatch[0]) {
        const val = chineseMap[char];
        if (val >= 10) {
          temp = temp === 0 ? val : temp * val;
        } else {
          if (temp === 0) {
            temp = val;
          } else if (temp >= 10) {
            num += temp * val;
            temp = 0;
          } else {
            temp = temp + val;
          }
        }
      }
      if (temp > 0) {
        num += temp;
      }
      if (num > 0 && num <= 200) {
        contentLog('  中文数字: ' + num);
        return num;
      }
    }
    
    // 2. 英文数字转阿拉伯数字
    const enMap = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
      'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20
    };
    
    const enMatch = name.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i);
    if (enMatch) {
      const num = enMap[enMatch[1].toLowerCase()];
      if (num > 0 && num <= 200) {
        contentLog('  英文数字: ' + num);
        return num;
      }
    }
    
    // 3. 阿拉伯数字（兜底）
    const numbers = name.match(/\d+/g);
    if (numbers) {
      const num = parseInt(numbers[numbers.length - 1], 10);
      if (num <= 200) {
        contentLog('  阿拉伯数字: ' + num);
        return num;
      }
    }
    
    return 1;
  }

  // ============================================================
  // 获取变种
  // ============================================================

  function getVariantsFromPage(row) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return [];
    
    const variantCell = cells[4];
    const variantItems = variantCell.querySelectorAll('.variation-item');
    
    const variants = [];
    variantItems.forEach((item) => {
      const nameSpan = item.querySelector('span');
      if (nameSpan) {
        const name = nameSpan.textContent.trim();
        if (name) {
          variants.push({
            name: name,
            element: item,
            quantity: extractQuantity(name)
          });
        }
      }
    });
    return variants;
  }

  // ============================================================
  // 单元格填写
  // ============================================================

  async function fillCell(cell, value) {
    if (isStopped) {
      throw new Error('已停止');
    }
    
    while (isPaused) {
      await sleep(200);
      if (isStopped) {
        throw new Error('已停止');
      }
    }
    
    try {
      cell.scrollIntoView({ block: 'center' });
      await sleep(150);
      cell.click();
      await sleep(100);
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      await sleep(250);
      
      let input = cell.querySelector('input, textarea');
      if (input) {
        input.focus();
        input.select();
        input.value = '';
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return;
      }
      
      const editable = cell.querySelector('[contenteditable="true"]');
      if (editable) {
        editable.textContent = value;
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      cell.textContent = value;
    } catch (err) {
      try { cell.textContent = value; } catch (e) {}
      throw err;
    }
  }

  // ============================================================
  // 核心填写函数
  // ============================================================

  async function fillAllProducts(rows, rate, interval) {
    try {
      contentLog('查找商品表格...');
      await sleep(500);
      
      const allRows = document.querySelectorAll('table tbody tr');
      contentLog('总行数: ' + allRows.length);
      
      let dataRows = [];
      for (const row of allRows) {
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent || '';
        
        if (rowText.includes('增值服务') || rowText.includes('产品信息')) continue;
        if (cells.length < 8) continue;
        dataRows.push(row);
      }
      
      contentLog('数据行数: ' + dataRows.length);
      if (dataRows.length === 0) {
        return { success: false, message: '未找到商品数据行' };
      }
      
      const startIdx = Math.max(0, Math.min(startRow - 1, rows.length - 1));
      currentRowIndex = startIdx;
      
      let successCount = 0;
      const totalProducts = rows.length;
      
      contentLog('📍 从第 ' + (currentRowIndex + 1) + ' 行开始填写');
      
      for (let i = currentRowIndex; i < totalProducts; i++) {
        if (isStopped) {
          contentLog('⏹ 检测到停止信号，中断执行', 'warn');
          return { success: false, message: '已停止，完成 ' + successCount + ' 个' };
        }
        
        while (isPaused) {
          await sleep(300);
          if (isStopped) {
            return { success: false, message: '已停止，完成 ' + successCount + ' 个' };
          }
        }
        
        if (i >= dataRows.length) {
          contentLog('⚠️ 页面行数不足，跳过第 ' + (i+1) + ' 行');
          continue;
        }
        
        const row = dataRows[i];
        const cells = row.querySelectorAll('td');
        const data = rows[i];
        
        const title = String(data[0] || '').trim();
        const size = String(data[2] || '').trim();
        const baseWeight = parseFloat(data[3]) || 0;
        const basePrice = parseFloat(data[4]) || 0;
        
        if (!title) {
          contentLog('⚠️ 第 ' + (i+1) + ' 行标题为空，跳过');
          continue;
        }
        if (!size || !size.includes('*')) {
          contentLog('⚠️ 第 ' + (i+1) + ' 行尺寸格式错误，跳过');
          continue;
        }
        
        const sizeParts = size.split('*').map(s => s.trim());
        const length = sizeParts[0] || '0';
        const width = sizeParts[1] || '0';
        const height = sizeParts[2] || '0';
        
        const variants = getVariantsFromPage(row);
        const variantCount = variants.length;
        
        contentLog('商品 ' + (i+1) + ': ' + title.substring(0, 20) + '... (' + variantCount + ' 个变种)');
        currentRowIndex = i;
        
        if (variantCount === 0) {
          if (isStopped) break;
          const finalWeight = fixWeight(baseWeight);
          const finalPrice = calculateDynamicPrice(basePrice, rate);
          if (cells[1]) await fillCell(cells[1], title);
          if (cells[6]) await fillCell(cells[6], finalPrice);
          if (cells[7]) await fillCell(cells[7], length);
          if (cells[8]) await fillCell(cells[8], width);
          if (cells[9]) await fillCell(cells[9], height);
          if (cells[10]) await fillCell(cells[10], String(finalWeight));
          successCount++;
          contentLog('✅ 商品 ' + (i+1) + ' 完成（无变种）');
          continue;
        }
        
        const nameItems = cells[4]?.querySelectorAll('.variation-item') || [];
        const priceItems = cells[6]?.querySelectorAll('.variation-item') || [];
        const lengthItems = cells[7]?.querySelectorAll('.variation-item') || [];
        const widthItems = cells[8]?.querySelectorAll('.variation-item') || [];
        const heightItems = cells[9]?.querySelectorAll('.variation-item') || [];
        const weightItems = cells[10]?.querySelectorAll('.variation-item') || [];
        
        const fixedBaseWeight = fixWeight(baseWeight);
        
        for (let v = 0; v < variants.length; v++) {
          if (isStopped) {
            contentLog('⏹ 检测到停止信号，中断执行', 'warn');
            return { success: false, message: '已停止，完成 ' + successCount + ' 个' };
          }
          
          while (isPaused) {
            await sleep(300);
            if (isStopped) {
              return { success: false, message: '已停止，完成 ' + successCount + ' 个' };
            }
          }
          
          const variant = variants[v];
          const quantity = variant.quantity;
          
          let variantPrice;
          
          if (quantity > 1) {
            let calculatedWithQty = basePrice * quantity * rate;
            if (calculatedWithQty > 501) {
              variantPrice = calculateDynamicPrice(basePrice, rate);
              contentLog('  变种 ' + (v+1) + ' "' + variant.name + '" 数量计算后 > 501，数量不参与计算 → 价格=' + variantPrice);
            } else {
              variantPrice = calculateDynamicPrice(basePrice * quantity, rate);
              contentLog('  变种 ' + (v+1) + ' "' + variant.name + '" 数量=' + quantity + ' → 价格=' + variantPrice);
            }
          } else {
            variantPrice = calculateDynamicPrice(basePrice, rate);
            contentLog('  变种 ' + (v+1) + ' "' + variant.name + '" 无数量 → 价格=' + variantPrice);
          }
          
          try {
            if (cells[1]) await fillCell(cells[1], title);
            if (cells[7] && lengthItems[v]) await fillCell(lengthItems[v], length);
            if (cells[8] && widthItems[v]) await fillCell(widthItems[v], width);
            if (cells[9] && heightItems[v]) await fillCell(heightItems[v], height);
            if (cells[6] && priceItems[v]) await fillCell(priceItems[v], variantPrice);
            if (cells[10] && weightItems[v]) await fillCell(weightItems[v], String(fixedBaseWeight));
            
            successCount++;
            contentLog('  ✅ 变种 ' + (v+1) + '/' + variants.length + ' 完成');
            
            chrome.runtime.sendMessage({
              action: 'progress',
              current: i + 1,
              total: totalProducts
            }).catch(() => {});
            
            await sleep(interval * 1000);
          } catch (err) {
            if (err.message === '已停止') {
              contentLog('⏹ 填写被停止', 'warn');
              return { success: false, message: '已停止，完成 ' + successCount + ' 个' };
            }
            contentLog('  ❌ 变种 ' + (v+1) + ' 失败: ' + err.message, 'error');
          }
        }
        contentLog('✅ 商品 ' + (i+1) + ' 完成 (' + variants.length + ' 个变种)');
      }
      
      contentLog('🎉 所有商品填写完成，请手动点击"保存"按钮确认', 'success');
      return { success: true, message: '完成 ' + successCount + ' 个商品，请手动保存' };
    } catch (err) {
      contentLog('❌ 异常: ' + err.message, 'error');
      return { success: false, message: err.message };
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  contentLog('✅ Content script 已加载 (v2.9.3)');
  contentLog('📍 中文/英文/阿拉伯数字识别 · 断点续填');
})();