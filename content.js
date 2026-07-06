// content.js - v2.8.1
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
      contentLog('收到指令: ' + message.data.rows.length + ' 行');
      contentLog('⚡ 动态阈值: ' + THRESHOLD);
      
      (async () => {
        try {
          const result = await fillAllProducts(message.data.rows, message.data.rate, message.data.interval);
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
      contentLog('已暂停', 'warn');
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'resume') {
      isPaused = false;
      contentLog('已继续');
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'stop') {
      isStopped = true;
      contentLog('已停止', 'warn');
      sendResponse({ success: true });
      return true;
    }
    
    return true;
  });

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
  // 提取数量：超过501视为型号/货号，不计算
  // ============================================================
  
  function extractQuantity(name) {
    const numbers = name.match(/\d+/g);
    if (!numbers) return 1;
    
    const num = parseInt(numbers[0], 10);
    
    // 超过501视为型号/货号，不计算数量
    if (num > 501) {
      return 1;
    }
    
    return num;
  }

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
      
      let successCount = 0;
      const totalProducts = Math.min(rows.length, dataRows.length);
      
      for (let i = 0; i < totalProducts; i++) {
        if (isStopped) return { success: false, message: '已停止' };
        while (isPaused) { await sleep(300); if (isStopped) return { success: false, message: '已停止' }; }
        
        const row = dataRows[i];
        const cells = row.querySelectorAll('td');
        const data = rows[i];
        
        const title = String(data[0] || '').trim();
        const size = String(data[2] || '').trim();
        const baseWeight = parseFloat(data[3]) || 0;
        const basePrice = parseFloat(data[4]) || 0;
        
        if (!title) return { success: false, message: '第' + (i+1) + '行：标题为空' };
        if (!size || !size.includes('*')) return { success: false, message: '第' + (i+1) + '行：尺寸格式错误' };
        
        const sizeParts = size.split('*').map(s => s.trim());
        const length = sizeParts[0] || '0';
        const width = sizeParts[1] || '0';
        const height = sizeParts[2] || '0';
        
        const variants = getVariantsFromPage(row);
        const variantCount = variants.length;
        
        contentLog('商品 ' + (i+1) + ': ' + title.substring(0, 20) + '... (' + variantCount + ' 个变种)');
        
        if (variantCount === 0) {
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
          const variant = variants[v];
          const quantity = variant.quantity;
          
          // ============================================================
          // 价格计算逻辑
          // 规则1：如果基础价格 > 200，数量不参与计算
          // 规则2：如果数量 > 501，视为型号/货号，不参与计算
          // ============================================================
          
          let variantPrice;
          let baseCalculated = basePrice * rate;
          
          // 规则1：基础价格 > 200，数量不参与计算
          if (baseCalculated > 200) {
            variantPrice = calculateDynamicPrice(basePrice, rate);
            contentLog('  变种 ' + (v+1) + ' "' + variant.name + '" 基础价格 > 200，数量 ' + quantity + ' 不参与计算 → 价格=' + variantPrice);
          } 
          // 规则2：数量 > 501，视为型号/货号
          else if (quantity > 501) {
            variantPrice = calculateDynamicPrice(basePrice, rate);
            contentLog('  变种 ' + (v+1) + ' "' + variant.name + '" 数量 ' + quantity + ' > 501，视为型号/货号 → 价格=' + variantPrice);
          } 
          // 正常情况：价格 × 数量
          else if (quantity > 1) {
            let calculatedBase = basePrice * quantity;
            variantPrice = calculateDynamicPrice(calculatedBase, rate);
            contentLog('  变种 ' + (v+1) + ' "' + variant.name + '" 数量=' + quantity + ' → 价格=' + variantPrice);
          } 
          // 无数量（quantity === 1）
          else {
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
              current: successCount,
              total: totalProducts * 2
            }).catch(() => {});
            
            await sleep(interval * 1000);
          } catch (err) {
            contentLog('  ❌ 变种 ' + (v+1) + ' 失败: ' + err.message, 'error');
          }
        }
        contentLog('✅ 商品 ' + (i+1) + ' 完成 (' + variants.length + ' 个变种)');
      }
      
      contentLog('🎉 所有商品填写完成，请手动点击"保存"按钮确认', 'success');
      return { success: true, message: '完成 ' + successCount + ' 个变种，请手动保存' };
    } catch (err) {
      contentLog('❌ 异常: ' + err.message, 'error');
      return { success: false, message: err.message };
    }
  }

  async function fillCell(cell, value) {
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

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  contentLog('✅ Content script 已加载 (v2.8.1)');
})();