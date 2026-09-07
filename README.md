# trails

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
FROM flomp/wanderer-web:v0.20.0@sha256:d761...   # tag AND digest
COPY branding /wanderer-branding
RUN patch-branding.sh && assert-branding-applied && rm -rf /wanderer-branding
USER 65532:65532
```

The tag is what a human reads and what Dependabot compares against. The digest
is what actually gets pulled, so the build is reproducible even if the tag moves.

`patch-branding.sh` is unmodified from the version that ran on compose — it
expects its assets at `/wanderer-branding`, which is why they are copied there.

## Keeping up with upstream

`.github/dependabot.yml` watches the base image. When Wanderer ships a new
version Dependabot opens a PR bumping tag and digest, CI rebuilds, and the
Dockerfile's assertions decide whether the branding still applies. **A patch
that no longer matches fails the build**, which is the entire reason the
assertions are there.

This replaces what compose did, which was to track `:latest` — upgrading
silently, whenever a container happened to restart, with no PR and no record.

## Deploying

This repo builds the image; it does not deploy it. The Kubernetes manifests
live in the private config repo, which pins this image by digest. CI prints the
digest to deploy in its job summary.

## Layout

```
Dockerfile                     base image + branding + assertions
branding/patch-branding.sh     the entry point; the others are helpers it calls
branding/patch-dark-mode.js
branding/patch-gallery-thumbs.js
branding/patch-recommend.js
branding/about.md              replaces the stock About page
branding/diorama.{png,webp,avif}   hero photo — Rocky Lake, Lunenburg County
```

## Licence

The branding scripts and assets here are mine. Wanderer itself is licensed by
its authors — see [Flomp/wanderer](https://github.com/Flomp/wanderer).
