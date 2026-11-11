// Photo galleries: request a sized thumbnail, not the original.
//
// The trail, waypoint and summit-log galleries (and the PhotoSwipe lightbox
// they feed) get bare filenames from PocketBase and build view URLs with a
// getFileUrl-style helper that takes an optional third `thumb` argument. Where
// upstream leaves it out, a trail with two dozen phone photos pulls every
// original at full resolution (multi-MB each).
//
// 600x0 is the ONLY size whitelisted in the PocketBase collection's `thumbs`
// list for this field. Any other size silently serves the full original, since
// PocketBase does not resize on demand outside that list. 600x0 turns a ~9 MB
// original into ~200 KB.
//
// Two separate copies of the same components need it:
//
//  CLIENT (/client, minified): what runs after hydration. Matched on call
//  STRUCTURE, `<x>.photos[.slice(0,3)].map(e=>F(<receiver>,e))`, with any
//  identifier allowed. The receiver is the trail store (`b(Y)`, `O(Y)`), a
//  waypoint or a summit log. v0.21.2 renamed every helper (`xe`->`Se`,
//  `D`->`A`, `b`->`O`); the old literal matches all went quiet.
//  Calls upstream already gives a third argument are left alone (0.21 added
//  600x0 to the trail mosaic itself).
//
//  SERVER (/server, NOT minified): the first paint, i.e. what a slow
//  connection sees before JS takes over. A balanced-paren scan finds two-argument
//  `getFileURL(` calls in the trail info panel and the feed card and adds the
//  size.
//
// Usage: node patch-gallery-thumbs.js <build-dir>
"use strict";
const fs = require("fs");
const path = require("path");
const { walkJs, applyRegex, report } = require("./lib.js");

const THUMB = "600x0";
const ID = "[\\w$]+";
// `b(Y)` / `O(n)` (the trail store), `r.waypoint`, `c.log`.
const RECEIVER = `(?:${ID}\\(${ID}\\)|${ID}\\.(?:waypoint|log))`;
// Groups: 1 = everything up to the receiver, 2 = receiver, 3 = the arrow param.
const CLIENT_GALLERY = new RegExp(`(\\.photos(?:\\.slice\\(0,3\\))?\\.map\\((${ID})=>${ID}\\()(${RECEIVER}),\\2\\)\\)`, "g");

function patchClient(files) {
	return applyRegex(files, CLIENT_GALLERY, (_m, head, param, recv) => `${head}${recv},${param},\`${THUMB}\`))`);
}

function findMatchingParen(src, openIdx) {
	let depth = 1;
	for (let i = openIdx + 1; i < src.length; i++) {
		if (src[i] === "(") depth++;
		else if (src[i] === ")") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function topLevelArgCount(argsStr) {
	let depth = 0;
	let count = argsStr.trim() ? 1 : 0;
	for (const ch of argsStr) {
		if ("([{".includes(ch)) depth++;
		else if (")]}".includes(ch)) depth--;
		else if (ch === "," && depth === 0) count++;
	}
	return count;
}

/** Add the thumb size to every two-argument `getFileURL(` call in `src`. */
function addThumbToGetFileURL(src) {
	const needle = "getFileURL(";
	let out = "";
	let cursor = 0;
	let patched = 0;
	for (;;) {
		const i = src.indexOf(needle, cursor);
		if (i === -1) break;
		const openIdx = i + needle.length - 1;
		const closeIdx = findMatchingParen(src, openIdx);
		if (closeIdx === -1) break;
		out += src.slice(cursor, closeIdx);
		if (topLevelArgCount(src.slice(openIdx + 1, closeIdx)) === 2) {
			out += `, "${THUMB}"`;
			patched++;
		}
		out += ")";
		cursor = closeIdx + 1;
	}
	return { out: out + src.slice(cursor), patched };
}

const SSR_TARGETS = ["trail_info_panel.js-", "feed_card.js-"];

function patchServer(files) {
	let total = 0;
	for (const f of files) {
		if (!SSR_TARGETS.some((p) => path.basename(f).startsWith(p))) continue;
		const { out, patched } = addThumbToGetFileURL(fs.readFileSync(f, "utf8"));
		if (patched > 0) {
			fs.writeFileSync(f, out);
			total += patched;
		}
	}
	return total;
}

function patchGalleryThumbs(build) {
	const files = walkJs(build);
	return [
		{ label: "thumbs: client galleries", count: report("thumbs: client galleries", patchClient(files)) },
		{ label: "thumbs: SSR galleries", count: report("thumbs: SSR galleries", patchServer(files)) },
	];
}

module.exports = { THUMB, CLIENT_GALLERY, patchGalleryThumbs, addThumbToGetFileURL, topLevelArgCount, findMatchingParen };

if (require.main === module) {
	const build = process.argv[2];
	if (!build) {
		console.error("usage: patch-gallery-thumbs.js <build-dir>");
		process.exit(2);
	}
	patchGalleryThumbs(build);
}
