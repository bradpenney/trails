// End-to-end: run the real patch-branding.sh over a fixture build, then the
// real verifier, the same two steps the Dockerfile runs.
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { verify } = require("../branding/verify-branding.js");
const { BRANDING, CLIENT, makeBuild, cleanup } = require("./fixture.js");

const SCRIPT = path.join(BRANDING, "patch-branding.sh");

function runPatch(root) {
	return execFileSync("sh", [SCRIPT], { env: { ...process.env, BUILD: root, BRANDING }, encoding: "utf8" });
}
const failures = (root) => verify(root, BRANDING).filter((r) => !r.ok);

for (const version of Object.keys(CLIENT)) {
	describe(`full build on ${version} shapes`, () => {
		test("every patch applies and every outcome holds", () => {
			const root = makeBuild(version);
			try {
				const log = runPatch(root);
				assert.doesNotMatch(log, /MISSED/, log);
				assert.deepEqual(failures(root), []);
			} finally {
				cleanup(root);
			}
		});
	});
}

describe("the verifier is a real gate", () => {
	test("an unpatched build fails every check that describes a patch", () => {
		const root = makeBuild();
		try {
			const failed = failures(root).map((r) => r.name);
			const all = verify(root, BRANDING).map((r) => r.name);
			// Only the "readable by uid 65532" check can hold before patching.
			assert.deepEqual(
				all.filter((n) => !failed.includes(n)),
				["serving: every file readable by uid 65532"],
			);
		} finally {
			cleanup(root);
		}
	});

	test("a single patch going quiet fails exactly its own check", () => {
		const root = makeBuild();
		try {
			runPatch(root);
			// Simulate upstream reintroducing a flipping toggle after the patch.
			const f = path.join(root, "client/_app/immutable/chunks/theme.js");
			fs.appendFileSync(f, ";r=t===`light`?`dark`:`light`;document.documentElement.classList.remove(t)");
			assert.deepEqual(
				failures(root).map((r) => r.name),
				["dark-mode: toggle cannot switch to light"],
			);
		} finally {
			cleanup(root);
		}
	});

	test("an unreadable file fails the serving check", () => {
		const root = makeBuild();
		try {
			runPatch(root);
			fs.chmodSync(path.join(root, "client/md/about.md"), 0o600);
			assert.deepEqual(
				failures(root).map((r) => r.name),
				["serving: every file readable by uid 65532"],
			);
		} finally {
			cleanup(root);
		}
	});

	test("the CLI exits 1 and names the failure", () => {
		const root = makeBuild();
		try {
			const res = (() => {
				try {
					execFileSync("node", [path.join(BRANDING, "verify-branding.js"), root, BRANDING], { encoding: "utf8", stdio: "pipe" });
					return { code: 0 };
				} catch (e) {
					return { code: e.status, out: e.stdout };
				}
			})();
			assert.equal(res.code, 1);
			assert.match(res.out, /FAIL dark-mode: toggle cannot switch to light/);
		} finally {
			cleanup(root);
		}
	});
});

describe("re-running", () => {
	test("a second run changes nothing and the CSS is not appended twice", () => {
		const root = makeBuild();
		try {
			runPatch(root);
			const css = path.join(root, "client/_app/immutable/assets/0.css");
			const once = fs.readFileSync(css, "utf8");
			runPatch(root);
			assert.equal(fs.readFileSync(css, "utf8"), once);
			assert.equal(once.split("/*brad-css*/").length, 2);
			assert.deepEqual(failures(root), []);
		} finally {
			cleanup(root);
		}
	});
});
