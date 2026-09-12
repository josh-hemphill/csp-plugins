// Test various import types and dynamic content
import './styles.css';
import testData from './test-data.json';

// Dynamic import for code splitting
const loadLazyModule = async () => {
	const module = await import('./lazy-module.ts');
	return module.default;
};

// Create dynamic content
function createDynamicContent() {
	const app = document.getElementById('app')!;

	// Test inline styles
	const styleElement = document.createElement('style');
	styleElement.textContent = `
    .dynamic-style {
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
      padding: 20px;
      border-radius: 8px;
      color: white;
      text-align: center;
    }
  `;
	document.head.appendChild(styleElement);

	// Test dynamic script
	const scriptElement = document.createElement('script');
	scriptElement.textContent = `
    console.log('Dynamic script loaded');
    window.dynamicScriptData = { timestamp: Date.now() };
  `;
	document.head.appendChild(scriptElement);

	// Create content
	app.innerHTML = `
    <div class="dynamic-style">
      <h1>CSP Plugin Test Playground</h1>
      <p>This page tests various asset types for CSP tracking</p>
      <p>Test data: ${testData.message}</p>
      <button onclick="loadLazyModule().then(m => console.log('Lazy module:', m))">
        Load Lazy Module
      </button>
    </div>
  `;
}

// Initialize
createDynamicContent();

// Test service worker registration
if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('/sw.js')
		.then((registration) => console.log('SW registered:', registration))
		.catch((error) => console.log('SW registration failed:', error));
}

// Export for testing
export { createDynamicContent, loadLazyModule };
