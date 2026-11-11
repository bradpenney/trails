// A miniature Wanderer build tree for the tests.
//
// Every snippet below was copied from a real upstream bundle (flomp/wanderer-web
// v0.20.0 and v0.21.2) and only trimmed, so the patches are tested against the
// shapes they actually meet. When an upstream bump breaks a patch, add the new
// shape here as a third variant before fixing the patch.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const BRANDING = path.join(__dirname, "..", "branding");

/** Minified client shapes, per upstream version. */
const CLIENT = {
	"v0.20.0": {
		resolver:
			"function r(){let e=localStorage.getItem(`theme`);return e===`dark`||e===`light`?e:document.documentElement.classList.contains(`dark`)?`dark`:document.documentElement.classList.contains(`light`)?`light`:window.matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`}",
		toggle:
			"function i(){let e=t(n),r=e===`light`?`dark`:`light`;document.documentElement.classList.remove(e),document.documentElement.classList.add(r),document.querySelector(`meta[name='color-scheme']`)?.setAttribute(`content`,r),n.set(r),localStorage.setItem(`theme`,r)}",
		galleries: [
			"t.photos.map(e=>W(b(Y),e)))",
			"t.photos.map(e=>W(b(i),e)))",
			"t.photos.map(e=>D(c.log,e)))",
			"t.photos.map(e=>xe(r.waypoint,e)))",
			"t.photos.slice(0,3).map(e=>W(b(Y),e)):M()===`light`?[Te]:[we]}",
		],
	},
	"v0.21.2": {
		resolver:
			"function r(){let e=localStorage.getItem(`theme`);return e===`dark`||e===`light`?e:document.documentElement.classList.contains(`dark`)?`dark`:document.documentElement.classList.contains(`light`)?`light`:window.matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`}",
		toggle:
			"function i(){let t=e(n),r=t===`light`?`dark`:`light`;document.documentElement.classList.remove(t),document.documentElement.classList.add(r),document.querySelector(`meta[name='color-scheme']`)?.setAttribute(`content`,r),n.set(r),localStorage.setItem(`theme`,r)}",
		galleries: [
			"t.photos.map(e=>W(O(Y),e)))",
			"t.photos.map(e=>W(O(n),e)))",
			"t.photos.map(e=>A(g.log,e)))",
			"t.photos.map(e=>Se(n.waypoint,e)))",
			// Upstream already sizes this one in 0.21; it must be left alone.
			"t.photos.slice(0,3).map(e=>W(O(Y),e,`600x0`)):te()===`light`?[ke]:[Oe]}",
		],
	},
};

/** Not galleries: these must never be touched by the thumbnail patch. */
const NOT_GALLERIES = ["t.photos.map(e=>({url:b.url.origin+x(s.data.trail,e)}))}))", "t.photos.map(e=>r.get(e)).filter(e=>e!=null)"];

const SSR_SCRIPT = `<script>
		const storedTheme = localStorage.theme;
		const theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : 'light';
	</script>`;

const RECOMMEND = [
	"async function GET(event) {",
	"\tconst numberOfTrails = 10;",
	"\tconst size = 4;",
	"\tconst filter = \"public = true\";",
	"\tconst maxOffset = Math.max(0, numberOfTrails - size);",
	"\tconst randomOffset = Math.floor(Math.random() * (maxOffset + 1));",
	'\treturn event.locals.ms.index("trails").search("", {',
	"\t\tlimit: size,",
	"\t\toffset: randomOffset,",
	"\t\tfilter",
	"\t});",
	"}",
].join("\n");

const TRAIL_INFO_PANEL = [
	"const a = getFileURL(trail, p);",
	"const b = getFileURL(trail, photo, \"600x0\");",
	"const c = getFileURL(wp, someFn(photo, [1, 2]));",
	"const d = getFileURL(trail);",
].join("\n");

function write(root, rel, content) {
	const f = path.join(root, rel);
	fs.mkdirSync(path.dirname(f), { recursive: true });
	fs.writeFileSync(f, content);
	return f;
}

/** Build a fresh fixture tree shaped like `version` and return its root. */
function makeBuild(version = "v0.21.2") {
	const shapes = CLIENT[version];
	if (!shapes) throw new Error(`no fixture shapes for ${version}`);
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-fixture-"));

	write(root, "client/_app/immutable/chunks/theme.js", `${shapes.resolver};${shapes.toggle};export{i as n};`);
	write(root, "client/_app/immutable/chunks/gallery.js", [...shapes.galleries, ...NOT_GALLERIES].join(";\n"));
	write(
		root,
		"client/_app/immutable/nodes/32.js",
		"let f={category:a.category,max_elevation_loss:o.max_elevation_loss,sort:`created`,sortOrder:`+`};",
	);
	write(root, "client/_app/immutable/assets/0.css", "body{margin:0}");
	write(root, "client/_app/immutable/assets/1.css", ".x{color:red}");
	write(root, "client/md/about.md", "# About wanderer\n\nStock copy.\n");
	for (const ext of ["png", "webp", "avif"]) {
		write(root, `client/_app/immutable/assets/wanderer_diorama_dark.abc123.${ext}`, `stock ${ext}`);
		write(root, `client/_app/immutable/assets/wanderer_diorama_light.def456.${ext}`, `stock ${ext}`);
	}

	write(
		root,
		"server/index.js",
		[
			"const shell = `<title>Trails | wanderer</title>",
			`${SSR_SCRIPT}`,
			"<h5>wanderer</h5><span>wanderer</span>",
			'<p>Explore exciting trails, save your favorites, and experience the beauty of nature. Find your next adventure!</p>',
			'<img alt="wanderer Diorama">`;',
		].join("\n"),
	);
	write(root, "server/chunks/chunks/trail_info_panel.js-ClNPdv_6.js", TRAIL_INFO_PANEL);
	write(root, "server/chunks/chunks/feed_card.js-BgqIN1ua.js", "const img = getFileURL(trail, trail.photos[0]);");
	write(root, "server/entries/pages/trails/_page.ts.js-Ab12.js", 'const filter = { sort: "created", sortOrder: "+" };');
	write(root, "server/entries/endpoints/api/v1/trail/recommend/_server.ts.js-Cd34.js", RECOMMEND);
	// Upstream's pre-compressed copies, which would bypass every patch.
	write(root, "client/_app/immutable/chunks/theme.js.br", "stale");
	write(root, "client/_app/immutable/chunks/theme.js.gz", "stale");
	return root;
}

function cleanup(root) {
	fs.rmSync(root, { recursive: true, force: true });
}

module.exports = { BRANDING, CLIENT, NOT_GALLERIES, makeBuild, cleanup, write };
