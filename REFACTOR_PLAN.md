# src/index.js 重構計劃

## 當前結構分析 (817 行)

### 1. 模組層級 (行 1-220)
- ✅ 導入模組 (行 1-5)
- ✅ LRU Cache 配置 (行 22-26)
- ✅ 效能統計 (行 34-76)
- ✅ hash 函數 (行 91-92)
- ✅ REGEX 定義 (行 101-147)
- ✅ parseAttributes (行 162-174)
- ✅ evaluateAttributeExpressions (行 195-220)

### 2. 主函數內部 (行 254-817)
- transformLogicTags (行 296-384) - 轉換 Blade 邏輯標籤
- parseSections (行 386-415) - 解析 section 區塊
- processExtends (行 418-540) - 處理佈局繼承
- resolveIncludes (行 544-683) - 處理 include 標籤
- 插件返回對象 (行 685-817)
  - name (行 686)
  - configResolved (行 687-701)
  - transformIndexHtml (行 712-783)
  - handleHotUpdate (行 795-815)

## 重構目標

### 階段 1: 改進 REGEX 區塊
- [ ] 重新組織 REGEX，加入分類註解
- [ ] 將複雜的 REGEX 拆分並加入說明
- [ ] 確保所有 REGEX 都有範例

### 階段 2: 優化輔助函數
- [ ] parseAttributes - 加入錯誤處理
- [ ] evaluateAttributeExpressions - 改進邊界情況處理
- [ ] hash - 考慮使用更快的 hash 算法

### 階段 3: 重構核心轉換邏輯
- [ ] transformLogicTags - 拆分成更小的函數
- [ ] parseSections - 加入更好的錯誤訊息
- [ ] processExtends - 改進循環引用檢測
- [ ] resolveIncludes - 優化遞迴邏輯

### 階段 4: 改進插件 Hooks
- [ ] configResolved - 加入驗證邏輯
- [ ] transformIndexHtml - 加入錯誤邊界
- [ ] handleHotUpdate - 優化快取清除策略

### 階段 5: 補充繁體中文註解
- [ ] 確保每個函數都有完整的 JSDoc
- [ ] 為複雜邏輯加入行內註解
- [ ] 加入使用範例

## 重構原則

1. **向後兼容**：不改變 API，確保現有測試通過
2. **逐步進行**：每次改動後立即測試
3. **保持效能**：不降低執行效率
4. **改進可讀性**：加入清晰的註解和命名
5. **錯誤處理**：加入更好的錯誤訊息

## 測試策略

每個階段完成後：
1. 運行完整測試套件
2. 手動測試 playground
3. 檢查 HMR 功能
4. 驗證錯誤處理

## 預期成果

- 更清晰的程式碼結構
- 完整的繁體中文註解
- 更好的錯誤處理
- 保持或改進效能
- 所有測試通過
