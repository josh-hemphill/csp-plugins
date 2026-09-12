// Advanced script for testing complex scenarios
class AdvancedTest {
	constructor() {
		this.data = new Map();
	}

	addItem (key, value) {
		this.data.set(key, value);
	}

	getItem (key) {
		return this.data.get(key);
	}
}

export const advancedTest = new AdvancedTest();
export default AdvancedTest;
