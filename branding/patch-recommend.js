// Homepage "recommended trails": newest first instead of a random sample.
//
// Upstream picks a random offset, which always lands on 0 while the trail count
// is at most the requested size, so it only LOOKS like oldest-first by
// coincidence. This makes it deterministic and newest-first.
//
// The target is the server bundle (not minified), so a literal match is stable.
// It is found by content, never by its content-hashed file name.
//
// Usage: node patch-recommend.js <build-dir>
"use strict";
const { walkJs, applyLiteral, report } = require("./lib.js");

const FIND = [
	"\tconst maxOffset = Math.max(0, numberOfTrails - size);",
	"\tconst randomOffset = Math.floor(Math.random() * (maxOffset + 1));",
	'\treturn event.locals.ms.index("trails").search("", {',
	"\t\tlimit: size,",
	"\t\toffset: randomOffset,",
	"\t\tfilter",
	"\t});",
].join("\n");

const REPLACE = [
	'\treturn event.locals.ms.index("trails").search("", {',
	"\t\tlimit: size,",
	"\t\toffset: 0,",
	"\t\tfilter,",
	'\t\tsort: ["created:desc"]',
	"\t});",
].join("\n");

function patchRecommend(build) {
	const files = walkJs(build).filter((f) => f.includes("/endpoints/api/v1/trail/recommend/"));
	const label = "sort: homepage recommendations newest-first";
	return [{ label, count: report(label, applyLiteral(files, FIND, REPLACE)) }];
}

module.exports = { patchRecommend, FIND, REPLACE };

if (require.main === module) {
	const build = process.argv[2];
	if (!build) {
		console.error("usage: patch-recommend.js <build-dir>");
		process.exit(2);
	}
	patchRecommend(build);
}
