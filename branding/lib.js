// Shared helpers for the branding patches.
//
// Every patch here edits someone else's BUILT bundle: content-hashed file
// names, minified identifiers that change between releases. Two rules follow:
//
//  1. Find targets by CONTENT, never by file name.
//  2. Match on the stable STRUCTURE of the code (property names, string
//     literals, call shape), never on minifier-chosen names like `W`, `b(Y)` or
//     `xe`. v0.21.2 renamed exactly those and silently un-did six patches that
//     matched them literally.
//
// A patch that matches nothing is not an error at this level. It is reported as
// MISSED, and verify-branding.js, which checks OUTCOMES, decides whether the
// build fails. That way one run lists every problem, not just the first.
"use strict";
const fs = require("fs");
const path = require("path");

/** Every `.js` file under `dir`, recursively. Source maps are skipped. */
function walkJs(dir) {
	const out = [];
	const visit = (d) => {
		for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
			const full = path.join(d, entry.name);
			if (entry.isDirectory()) visit(full);
			else if (entry.name.endsWith(".js")) out.push(full);
		}
	};
	visit(dir);
	return out.sort();
}

/**
 * Apply `re` (must be /g) with `replacement` to every file in `files`.
 * Returns the number of replacements made across all files.
 */
function applyRegex(files, re, replacement) {
	if (!re.global) throw new Error(`applyRegex needs a /g regex: ${re}`);
	let total = 0;
	for (const f of files) {
		const src = fs.readFileSync(f, "utf8");
		const n = (src.match(re) || []).length;
		if (n > 0) {
			fs.writeFileSync(f, src.replace(re, replacement));
			total += n;
		}
	}
	return total;
}

/** Replace every occurrence of the literal `find`. Returns the number replaced. */
function applyLiteral(files, find, replace) {
	let total = 0;
	for (const f of files) {
		const src = fs.readFileSync(f, "utf8");
		const parts = src.split(find);
		if (parts.length > 1) {
			fs.writeFileSync(f, parts.join(replace));
			total += parts.length - 1;
		}
	}
	return total;
}

/** One log line per patch, so a build log reads as a checklist. */
function report(label, count) {
	if (count > 0) console.log(`[branding] applied: ${label} (${count})`);
	else console.log(`[branding] MISSED:  ${label} (matched nothing; verify-branding decides)`);
	return count;
}

module.exports = { walkJs, applyRegex, applyLiteral, report };
