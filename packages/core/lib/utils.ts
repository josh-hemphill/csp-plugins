function isObject(item: unknown): item is Record<string, unknown> {
	return item !== null && typeof item === 'object' && !Array.isArray(item);
}

export function deepMerge(target: Record<string, unknown>, ...sources: Record<string, unknown>[]): Record<string, unknown> {
	if (!sources.length)
		return target;
	const source = sources.shift();

	if (isObject(target) && isObject(source)) {
		for (const key in source) {
			if (isObject(source[key])) {
				if (target[key] === undefined || !isObject(target[key]))
					Object.assign(target, { [key]: {} });
				deepMerge(target[key] as Record<string, unknown>, source[key]);
			}
			else if (Array.isArray(source[key])) {
				if (target[key] === undefined || !Array.isArray(target[key]))
					Object.assign(target, { [key]: [] });
				target[key] = [...(target[key] as unknown[]), ...(source[key] as unknown[])];
			}
			else {
				Object.assign(target, { [key]: source[key] });
			}
		}
	}

	return deepMerge(target, ...sources);
}
