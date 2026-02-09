#!/usr/bin/env node
/**
 * Post-install script to patch tr46@0.0.3 and whatwg-url@5.0.0 to use userland punycode
 *
 * FIX-PUNYCODE-001: Resolves DEP0040 deprecation warning
 *
 * Grammy → node-fetch@2.7.0 → whatwg-url@5.0.0 → tr46@0.0.3
 * Both tr46 and whatwg-url use `require('punycode')` (Node.js built-in, deprecated in Node 22)
 * This script patches them to use `require('../punycode')` (userland package from npm)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const patches = [
	{
		name: 'tr46@0.0.3',
		path: 'node_modules/.pnpm/tr46@0.0.3/node_modules/tr46/index.js',
		replacement: 'require("../punycode")',
	},
	{
		name: 'whatwg-url@5.0.0',
		path: 'node_modules/.pnpm/whatwg-url@5.0.0/node_modules/whatwg-url/lib/url-state-machine.js',
		replacement: 'require("../../punycode")', // lib/url-state-machine.js → ../../punycode
	},
];

for (const { name, path, replacement } of patches) {
	const filePath = resolve(rootDir, path);

	try {
		let content = readFileSync(filePath, 'utf8');

		// Check if already patched
		if (content.includes(replacement)) {
			console.log(`✓ ${name} already patched (using userland punycode)`);
			continue;
		}

		// Patch: replace require("punycode") with relative path
		const patched = content.replace('require("punycode")', replacement);

		if (patched === content) {
			console.warn(
				`⚠ Warning: ${name} source does not contain expected require("punycode") - patch may be outdated`,
			);
			continue;
		}

		writeFileSync(filePath, patched, 'utf8');
		console.log(`✓ Patched ${name} to use userland punycode`);
	} catch (err) {
		if (err.code === 'ENOENT') {
			console.log(`ℹ ${name} not found - skipping (dependency may have been upgraded)`);
			continue;
		}
		throw err;
	}
}

console.log('✓ All patches applied successfully (DEP0040 resolved)');
