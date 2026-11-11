// Unit tests for the individual patches, against the real minified shapes of
// each supported upstream version (see fixture.js).
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { applyRegex, applyLiteral, walkJs } = require("../branding/lib.js");
const { patchDarkMode } = require("../branding/patch-dark-mode.js");
const gallery = require("../branding/patch-gallery-thumbs.js");
const { patchRecommend } = require("../branding/patch-recommend.js");
const { CLIENT, NOT_GALLERIES, makeBuild, cleanup } = require("./fixture.js");

const quiet = (fn) => {
	const log = console.log;
	console.log = () => {};
	try {
		return fn();
	} finally {
		console.log = log;
	}
};
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const counts = (results) => Object.fromEntries(results.map((r) => [r.label, r.count]));

describe("lib", () => {
	test("applyRegex refuses a non-global regex", () => {
		assert.throws(() => applyRegex([], /x/, "y"), /needs a \/g regex/);
	});

	test("applyRegex and applyLiteral count every replacement across files", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-lib-"));
		try {
			fs.writeFileSync(path.join(dir, "a.js"), "aa b a");
			fs.writeFileSync(path.join(dir, "b.js"), "a");
			fs.writeFileSync(path.join(dir, "c.js.map"), "a");
			const files = walkJs(dir);
			assert.deepEqual(files.map((f) => path.basename(f)), ["a.js", "b.js"]);
			assert.equal(applyLiteral(files, "a", "x"), 4);
			assert.equal(applyRegex(files, /x/g, "y"), 4);
			assert.equal(fs.readFileSync(path.join(dir, "a.js"), "utf8"), "yy b y");
			assert.equal(applyLiteral(files, "nope", "z"), 0);
		} finally {
			fs.rmSync(dir, { recursive: true });
		}
	});
});

for (const version of Object.keys(CLIENT)) {
	describe(`dark mode on ${version} shapes`, () => {
		test("forces all three code paths to dark, and is idempotent", () => {
			const root = makeBuild(version);
			try {
				const first = counts(quiet(() => patchDarkMode(root)));
				assert.deepEqual(first, {
					"dark-mode: SSR pre-hydration script": 1,
					"dark-mode: client theme resolver": 1,
					"dark-mode: theme toggle": 1,
				});
				const theme = read(root, "client/_app/immutable/chunks/theme.js");
				assert.match(theme, /function r\(\)\{return`dark`\}/);
				assert.match(theme, /r=`dark`;document\.documentElement\.classList\.remove/);
				assert.doesNotMatch(theme, /===`light`\?`dark`:`light`/);
				assert.match(read(root, "server/index.js"), /const storedTheme = 'dark';/);

				const second = counts(quiet(() => patchDarkMode(root)));
				assert.ok(Object.values(second).every((n) => n === 0), "a second run must change nothing");
			} finally {
				cleanup(root);
			}
		});
	});

	describe(`gallery thumbnails on ${version} shapes`, () => {
		test("every gallery call gets the thumb size; nothing else changes", () => {
			const root = makeBuild(version);
			try {
				quiet(() => gallery.patchGalleryThumbs(root));
				const out = read(root, "client/_app/immutable/chunks/gallery.js");
				const lines = out.split(";\n");
				const galleries = lines.slice(0, CLIENT[version].galleries.length);
				for (const g of galleries) assert.match(g, /,e,`600x0`\)\)/, `not sized: ${g}`);
				for (const ng of NOT_GALLERIES) assert.ok(out.includes(ng), `must be untouched: ${ng}`);
				assert.doesNotMatch(out, /`600x0`,`600x0`/, "an already-sized call was sized twice");
			} finally {
				cleanup(root);
			}
		});
	});
}

describe("SSR getFileURL", () => {
	test("adds the size only to two-argument calls, with nested parens and brackets", () => {
		const src = [
			"getFileURL(trail, p)",
			'getFileURL(trail, photo, "600x0")',
			"getFileURL(wp, someFn(photo, [1, 2]))",
			"getFileURL(trail)",
		].join("\n");
		const { out, patched } = gallery.addThumbToGetFileURL(src);
		assert.equal(patched, 2);
		assert.equal(
			out,
			['getFileURL(trail, p, "600x0")', 'getFileURL(trail, photo, "600x0")', 'getFileURL(wp, someFn(photo, [1, 2]), "600x0")', "getFileURL(trail)"].join("\n"),
		);
		assert.equal(gallery.addThumbToGetFileURL(out).patched, 0, "idempotent");
	});

	test("an unbalanced call is left alone rather than corrupted", () => {
		const { out, patched } = gallery.addThumbToGetFileURL("x = getFileURL(a, b");
		assert.equal(patched, 0);
		assert.equal(out, "x = getFileURL(a, b");
	});

	test("topLevelArgCount ignores commas inside nested structures", () => {
		assert.equal(gallery.topLevelArgCount(""), 0);
		assert.equal(gallery.topLevelArgCount("a"), 1);
		assert.equal(gallery.topLevelArgCount("a, f(b, c), [d, e], {g: 1, h: 2}"), 4);
	});
});

describe("recommendations", () => {
	test("replaces the random sample with newest-first, once", () => {
		const root = makeBuild();
		try {
			assert.equal(counts(quiet(() => patchRecommend(root)))["sort: homepage recommendations newest-first"], 1);
			const out = read(root, "server/entries/endpoints/api/v1/trail/recommend/_server.ts.js-Cd34.js");
			assert.match(out, /sort: \["created:desc"\]/);
			assert.doesNotMatch(out, /randomOffset/);
			assert.equal(counts(quiet(() => patchRecommend(root)))["sort: homepage recommendations newest-first"], 0);
		} finally {
			cleanup(root);
		}
	});
});
