// Import CSS to test CSS dependency tracking
import './styles.css';

// Simple test app for E2E testing
console.log('CSP Test App Loaded');

// Add some dynamic content to test CSP processing
const app = document.getElementById('app');
if (app) {
	app.innerHTML = `
    <div class="fade-in">
      <h1>CSP Test App</h1>
      <p>This is a test application for CSP plugin E2E testing.</p>
      <div class="card">
        <p class="text-primary">Testing CSS imports and external resources.</p>
      </div>
      <button onclick="alert('Button clicked!')">Test Button</button>
    </div>
  `;

	// Add the fade-in class after a short delay to test CSS animations
	setTimeout(() => {
		const content = app.querySelector('.fade-in');
		if (content) {
			content.classList.add('fade-in');
		}
	}, 100);
}
