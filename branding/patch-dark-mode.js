// Forces the theme to 'dark' everywhere ("looks way better" — Brad).
// Three independent code paths decide the theme, so all three are patched:
//  1. The SSR shell's inline pre-hydration <script> (avoids a flash of the
//     wrong theme before JS loads). It lives in the server bundle, which is
//     NOT minified, so a literal match is stable.
//  2. The client store's initial resolver, run again on hydration.
//  3. The theme-toggle button's click handler. It is made to always land on
//     'dark' instead of flipping the current value, so clicking it does nothing.
//
// 2 and 3 are minified. They are matched on their STRUCTURE (the `theme`
// storage key, the class-list calls, the `light`/`dark` literals) with any
// identifier allowed, because v0.21.2 renamed the toggle's locals (`e`<->`t`)
// and the old literal match silently stopped applying. See lib.js.
//
// Usage: node patch-dark-mode.js <build-dir>
"use strict";
const { walkJs, applyLiteral, applyRegex, report } = require("./lib.js");

const ID = "[\\w$]+";

const PATCHES = [
	{
		label: "dark-mode: SSR pre-hydration script",
		apply: (files) => applyLiteral(files, "const storedTheme = localStorage.theme;", "const storedTheme = 'dark';"),
	},
	{
		// function r(){let e=localStorage.getItem(`theme`);return e===`dark`||...?`dark`:`light`}
		label: "dark-mode: client theme resolver",
		apply: (files) =>
			applyRegex(
				files,
				new RegExp(`function (${ID})\\(\\)\\{let ${ID}=localStorage\\.getItem\\(\`theme\`\\);return [^{}]*?\\(prefers-color-scheme: dark\\)\`\\)\\.matches\\?\`dark\`:\`light\`\\}`, "g"),
				"function $1(){return`dark`}",
			),
	},
	{
		// r=t===`light`?`dark`:`light`;document.documentElement.classList.remove(t)
		label: "dark-mode: theme toggle",
		apply: (files) =>
			applyRegex(files, new RegExp(`${ID}===\`light\`\\?\`dark\`:\`light\`(?=;document\\.documentElement\\.classList\\.remove\\()`, "g"), "`dark`"),
	},
];

function patchDarkMode(build) {
	const files = walkJs(build);
	return PATCHES.map((p) => ({ label: p.label, count: report(p.label, p.apply(files)) }));
}

module.exports = { patchDarkMode };

if (require.main === module) {
	const build = process.argv[2];
	if (!build) {
		console.error("usage: patch-dark-mode.js <build-dir>");
		process.exit(2);
	}
	patchDarkMode(build);
}
