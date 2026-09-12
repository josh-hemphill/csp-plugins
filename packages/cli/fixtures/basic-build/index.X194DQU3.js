(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e){if(t.type!==`childList`)continue;for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`data:application/json;base64,ewoJIm1lc3NhZ2UiOiAiSGVsbG8gZnJvbSB0ZXN0IGRhdGEhIiwKCSJ2ZXJzaW9uIjogIjEuMC4wIiwKCSJmZWF0dXJlcyI6IFsKCQkiYXNzZXQgdHJhY2tpbmciLAoJCSJDU1AgZ2VuZXJhdGlvbiIsCgkJIm1hbmlmZXN0IGNyZWF0aW9uIiwKCQkiZGV2IHNlcnZlciBpbnRlZ3JhdGlvbiIKCV0sCgkibWV0YWRhdGEiOiB7CgkJImNyZWF0ZWQiOiAiMjAyNC0wMS0wMSIsCgkJImF1dGhvciI6ICJDU1AgUGx1Z2luIFRlc3QgU3VpdGUiCgl9Cn0K`;function t(){let t=document.getElementById(`app`),n=document.createElement(`style`);n.textContent=`
    .dynamic-style {
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
      padding: 20px;
      border-radius: 8px;
      color: white;
      text-align: center;
    }
  `,document.head.appendChild(n);let r=document.createElement(`script`);r.textContent=`
    console.log('Dynamic script loaded');
    window.dynamicScriptData = { timestamp: Date.now() };
  `,document.head.appendChild(r),t.innerHTML=`
    <div class="dynamic-style">
      <h1>CSP Plugin Test Playground</h1>
      <p>This page tests various asset types for CSP tracking</p>
      <p>Test data: ${e.message}</p>
      <button onclick="loadLazyModule().then(m => console.log('Lazy module:', m))">
        Load Lazy Module
      </button>
    </div>
  `}t(),`serviceWorker`in navigator&&navigator.serviceWorker.register(`/sw.js`).then(e=>console.log(`SW registered:`,e)).catch(e=>console.log(`SW registration failed:`,e));
//# sourceMappingURL=index.X194DQU3.js.map