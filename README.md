# trails

[![Build](https://github.com/bradpenney/trails/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/bradpenney/trails/actions/workflows/build.yaml)
[![Wanderer upstream](https://img.shields.io/docker/v/flomp/wanderer-web?sort=semver&label=wanderer%20upstream)](https://github.com/Flomp/wanderer/releases)
[![Signed with cosign](https://img.shields.io/badge/image-signed%20with%20cosign-2f6fbe?logo=sigstore&logoColor=white)](#verifying-the-image)
[![SLSA provenance + SBOM](https://img.shields.io/badge/provenance-SLSA%20%2B%20SBOM-2f6fbe)](https://github.com/bradpenney/trails/pkgs/container/trails)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025e8c?logo=dependabot)](.github/dependabot.yml)

The image behind [trails.bradpenney.io](https://trails.bradpenney.io) — upstream
[Wanderer](https://github.com/Flomp/wanderer) with "Brad's Trails" branding
applied **at build time**.

## Why this repo exists

Wanderer is excellent and this is not a fork. The changes are cosmetic and
behavioural tweaks — a title, a hero photo, dark-mode defaults, gallery
thumbnails, newest-first recommendations — applied by patching the built
JS/CSS.

Those patches used to run at **container start**, wired in through
docker-compose's `command:`. That worked, but it meant:

- `/app` had to be writable, so the container could not run with a read-only
  root filesystem
- the app's entrypoint was restated by hand and could silently go stale
- the patch re-ran on every restart
- and worst: a patch that matches nothing **fails quietly**. An upstream markup
  change would leave a healthy, running, unbranded site, with nothing to say so.

Building the image instead makes the artifact immutable, lets the deployment
keep `readOnlyRootFilesystem: true` with nothing to work around, and turns
"upstream changed their markup" into a failed build rather than a surprise.

## How it works

```
FROM flomp/wanderer-web:v0.21.2@sha256:849f...   # tag AND digest
COPY branding /wanderer-branding
RUN patch-branding.sh && verify-branding.js && rm -rf /wanderer-branding
USER 65532:65532
```

The tag is what a human reads and what Dependabot compares against. The digest
is what actually gets pulled, so the build is reproducible even if the tag moves.

Every patch is a text substitution on upstream's **built, minified** bundle, so
two rules hold throughout:

- targets are found by **content**, never by their content-hashed file names;
- minified code is matched on its **structure** (property names, string
  literals, call shape), never on minifier-chosen names like `W`, `b(Y)` or
  `xe`. Those change between releases: v0.21.2 renamed them and quietly undid
  six patches that had matched them literally.

## What is changed, and how it is checked

`verify-branding.js` runs inside the image build after the patches and checks
**outcomes** rather than the patches' own log lines. If any of these does not
hold, the build fails and lists every failure:

| Area | Outcome the build guarantees |
|---|---|
| Title | No stock "wanderer" title remains; "Brad's Trails" in the hero, nav bar and every `<title>` |
| Hero | South Shore subtitle; Rocky Lake photo in every format and theme variant; its alt text |
| About | The stock About page is replaced by `branding/about.md` |
| CSS | Every client stylesheet carries the overrides (diorama canvas, hero size, mosaic rows, hidden sections) |
| Dark mode | The SSR script, the client resolver and the toggle all land on dark; nothing can switch to light |
| Thumbnails | No trail, waypoint or summit-log gallery (client or server-rendered) requests an original; all ask for `600x0`, the one size PocketBase is configured to serve |
| Sort order | `/trails` (server and client) and the homepage recommendations are newest-first |
| Serving | No stale pre-compressed `.br`/`.gz` copies that would bypass the patches; every file readable by uid 65532 |

## Keeping up with upstream

`.github/dependabot.yml` watches the base image. When Wanderer ships a new
version Dependabot opens a PR bumping tag and digest, CI rebuilds, and the
verifier decides whether the branding still applies. **A patch that no longer
matches fails the build**, which is the entire reason the verifier is there.

When that happens: copy the new shape from the upstream bundle into
`test/fixture.js` as a new version, watch the tests fail, then fix the patch.
Do not relax the check.

This replaces what compose did, which was to track `:latest` — upgrading
silently, whenever a container happened to restart, with no PR and no record.

## Testing

```sh
npm test               # unit + end-to-end tests over fixture builds (no dependencies)
npm run test:coverage  # the same, gated: 95% lines, 85% branches, 100% functions
npm run test:smoke     # build the image and smoke-test it (needs Docker)
```

- **Unit tests** (`test/patches.test.js`) run every patch against minified
  snippets copied from each supported upstream version, and check that each
  patch is idempotent and leaves look-alike code alone.
- **End-to-end tests** (`test/build.test.js`) run the real `patch-branding.sh`
  and the real verifier over a fixture build tree. They also prove the verifier
  is a real gate: an unpatched build fails every check, and one patch going
  quiet fails exactly its own check.
- **Smoke test** (`test/smoke.sh`) runs the image as the cluster does
  (read-only root, uid 65532, no backend) and checks it serves the branded content.

CI runs shellcheck, hadolint and the tests on every PR, then builds the image
(the verifier runs inside the build), smoke-tests it, and on `main` pushes,
attests and signs it.

## Verifying the image

Images on `main` are signed keylessly with [cosign](https://github.com/sigstore/cosign),
bound to this repository's build workflow, and carry SLSA provenance and an SBOM:

```sh
cosign verify ghcr.io/bradpenney/trails@sha256:<digest> \
  --certificate-identity-regexp '^https://github.com/bradpenney/trails/.github/workflows/build.yaml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Deploying

This repo builds the image; it does not deploy it. The Kubernetes manifests
live in the private config repo, which pins this image by digest. CI prints the
digest to deploy, and the command to verify its signature, in its job summary.

## Layout

```
Dockerfile                         base image + patch + verify
branding/patch-branding.sh         the entry point; runs every patch
branding/patch-dark-mode.js        forced dark theme (3 code paths)
branding/patch-gallery-thumbs.js   600x0 thumbnails, client + server-rendered
branding/patch-recommend.js        newest-first homepage recommendations
branding/lib.js                    shared find/replace + reporting helpers
branding/verify-branding.js        the build gate: checks every outcome
branding/about.md                  replaces the stock About page
branding/diorama.{png,webp,avif}   hero photo — Rocky Lake, Lunenburg County
test/fixture.js                    a miniature upstream build, per version
test/*.test.js                     unit + end-to-end tests (node --test)
test/smoke.sh                      runs the built image and checks it serves
```

## Licence

This repository (the branding scripts, tests, CI and assets) is released under
the [MIT License](LICENSE). Wanderer itself is licensed by its authors
under the [AGPL-3.0](https://github.com/Flomp/wanderer/blob/main/LICENSE). The
built image is a modified Wanderer and is distributed under the AGPL-3.0. Its
complete corresponding source is the upstream release named in the
`Dockerfile`'s `FROM` line plus the modifications in this public repository.
