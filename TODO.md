- 還有一些 blade 上的功能未完全實現，但都是很小的功能
- README.md、docs 及 playground 中資訊太混雜，要整理並統一

- 在巢狀引用 (@include 內再呼叫 @extends) 的處理上存在限制，看有沒有辦法克服
- vite-plugin-html-kit 的處理順序是先對 partial 檔案內容執行 @slot() 替換（step 3.5），再遞迴解析巢狀 <include>（step 3.9）。當 layout-base.html 用
  @include('modals/feedback-modal.html') 載入檔案時，plugin 會先把檔案內容裡所有 @slot('title') 和 @slot('content') 當成「佔位符」替換成空字串，導致內層 <include
  src="components/modal.html"> 收到的 slot 內容已被清空
- Root cause confirmed. The SLOT regex 無法正確解析空字串預設值 @slot('title', '')：
