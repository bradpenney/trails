// Checks that the branding actually took effect: OUTCOMES in the patched build,
// not the patches' own log lines. This is the build gate (see the Dockerfile).
//
// Why it exists: every patch is a text substitution on someone else's minified
// bundle, and a substitution that matches nothing does not fail. Until 2026-11
// the build checked two strings (the title and the hero alt text). On the
// v0.21.2 bump, six other patches (theme toggle, four gallery thumbnails, an
// SSR mosaic) went quiet and CI was still green. Every intended effect is
// checked here, and all failures are listed in one run.
//
// Each check states the end state ("no toggle can switch to light"), so it keeps
// meaning the same thing however the patch that produces it changes.
//
// Usage: node verify-branding.js <build-dir> <branding-dir>   (exit 1 on any failure)
"use strict";
const fs = require("fs");
const path = require("path");
const { CLIENT_GALLERY, addThumbToGetFileURL } = require("./patch-gallery-thumbs.js");

function walk(dir) {
	const out = [];
	const visit = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) visit(full);
			else out.push(full);
		}
	};
	visit(dir);
	return out.sort();
}

const rel = (build, f) => path.relative(build, f);

/** Returns [{name, ok, detail}] for every check. */
function verify(build, branding) {
	const all = walk(build);
	const text = all.filter((f) => /\.(js|html|css|json|md)$/.test(f));
	const read = (f) => fs.readFileSync(f, "utf8");
	const filesWith = (needle, set = text) => set.filter((f) => read(f).includes(needle));
	const filesMatching = (re, set) => set.filter((f) => new RegExp(re.source, re.flags.replace("g", "")).test(read(f)));
	const client = text.filter((f) => f.startsWith(path.join(build, "client") + path.sep));
	const clientJs = client.filter((f) => f.endsWith(".js"));
	const results = [];
	const check = (name, fn) => {
		let detail;
		try {
			detail = fn();
		} catch (e) {
			detail = `error: ${e.message}`;
		}
		results.push({ name, ok: !detail, detail: detail || "" });
	};
	const none = (files, what) => (files.length ? `${what}: ${files.map((f) => rel(build, f)).join(", ")}` : "");
	const some = (files, what) => (files.length ? "" : `${what} not found anywhere`);

	// Title and hero.
	check("title: no stock 'wanderer' title left", () =>
		none([...filesWith(">wanderer</span>"), ...filesWith(">wanderer</h5>"), ...filesWith("| wanderer")], "stock title in"),
	);
	check("title: Brad's Trails present", () => some(filesWith("Brad's Trails"), "\"Brad's Trails\""));
	check("hero: subtitle replaced", () =>
		none(filesWith("Explore exciting trails, save your favorites"), "stock subtitle in") ||
			some(filesWith("Nova Scotia's South Shore"), "new subtitle"),
	);
	check("hero: alt text replaced", () =>
		none(filesWith('alt="wanderer Diorama"'), "stock alt text in") || some(filesWith("Rocky Lake"), "Rocky Lake alt text"),
	);
	check("hero: every diorama image replaced", () => {
		const problems = [];
		for (const ext of ["png", "webp", "avif"]) {
			const ours = fs.readFileSync(path.join(branding, `diorama.${ext}`));
			const targets = all.filter((f) => path.basename(f).startsWith("wanderer_diorama_") && f.endsWith(`.${ext}`));
			if (!targets.length) problems.push(`no wanderer_diorama_*.${ext}`);
			for (const t of targets) if (!fs.readFileSync(t).equals(ours)) problems.push(`stock image: ${rel(build, t)}`);
		}
		return problems.join("; ");
	});
	check("about: page replaced", () => {
		const ours = read(path.join(branding, "about.md"));
		const targets = all.filter((f) => f.endsWith(`${path.sep}md${path.sep}about.md`));
		if (!targets.length) return "no md/about.md in the build";
		return none(targets.filter((t) => read(t) !== ours), "stock about.md");
	});
	check("css: overrides in every client stylesheet", () => {
		const css = client.filter((f) => f.endsWith(".css"));
		if (!css.length) return "no client stylesheets";
		return none(css.filter((f) => !read(f).includes("/*brad-css*/")), "missing overrides");
	});

	// Dark mode: nothing may read the stored or system preference, or switch to light.
	check("dark-mode: SSR script forced dark", () =>
		none(filesWith("const storedTheme = localStorage.theme;"), "SSR reads stored theme in") ||
			some(filesWith("const storedTheme = 'dark';"), "forced SSR theme"),
	);
	check("dark-mode: client resolver forced dark", () =>
		none(filesMatching(/localStorage\.getItem\(`theme`\);return [^{}]*?prefers-color-scheme/, clientJs), "resolver still consults storage/system in"),
	);
	check("dark-mode: toggle cannot switch to light", () =>
		none(filesMatching(/===`light`\?`dark`:`light`;document\.documentElement\.classList\.remove\(/, clientJs), "flipping toggle in"),
	);

	// Thumbnails: no gallery may request an original.
	check("thumbs: client galleries all sized", () => none(filesMatching(CLIENT_GALLERY, clientJs), "gallery without thumb in"));
	check("thumbs: SSR galleries all sized", () => {
		const targets = text.filter((f) => /^(trail_info_panel|feed_card)\.js-/.test(path.basename(f)));
		if (targets.length < 2) return `expected trail_info_panel + feed_card server chunks, found ${targets.length}`;
		return none(targets.filter((f) => addThumbToGetFileURL(read(f)).patched > 0), "two-argument getFileURL in");
	});

	// Sort order: newest first.
	check("sort: /trails newest-first (SSR)", () => {
		const t = text.filter((f) => f.includes(`${path.sep}entries${path.sep}pages${path.sep}trails${path.sep}_page.ts.js-`));
		if (!t.length) return "no /trails page server chunk";
		return none(t.filter((f) => read(f).includes('sortOrder: "+"')), "ascending default in");
	});
	check("sort: /trails newest-first (client)", () =>
		none(filesWith(".max_elevation_loss,sort:`created`,sortOrder:`+`", clientJs), "ascending default in") ||
			some(filesWith(".max_elevation_loss,sort:`created`,sortOrder:`-`", clientJs), "newest-first client filter"),
	);
	check("sort: homepage recommendations newest-first", () => {
		const t = text.filter((f) => f.includes(`${path.sep}api${path.sep}v1${path.sep}trail${path.sep}recommend${path.sep}`) && f.endsWith(".js"));
		if (!t.length) return "no recommend endpoint chunk";
		return none(t.filter((f) => read(f).includes("randomOffset") || !read(f).includes('sort: ["created:desc"]')), "random sample still in");
	});

	// Serving.
	check("serving: no stale pre-compressed copies", () => none(all.filter((f) => /\.(br|gz)$/.test(f)), "pre-compressed (would bypass every patch)"));
	check("serving: every file readable by uid 65532", () =>
		none(all.filter((f) => !(fs.statSync(f).mode & 0o004)), "not world-readable"),
	);

	return results;
}

module.exports = { verify };

if (require.main === module) {
	const [build, branding] = process.argv.slice(2);
	if (!build || !branding) {
		console.error("usage: verify-branding.js <build-dir> <branding-dir>");
		process.exit(2);
	}
	const results = verify(build, branding);
	for (const r of results) console.log(`[verify] ${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : ` — ${r.detail}`}`);
	const failed = results.filter((r) => !r.ok).length;
	console.log(`[verify] ${results.length - failed} of ${results.length} branding outcomes hold`);
	if (failed) {
		console.error("[verify] FATAL: branding incomplete. Upstream markup probably changed; fix the patch, do not relax the check.");
		process.exit(1);
	}
}
