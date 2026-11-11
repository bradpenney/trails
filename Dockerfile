# "Brad's Trails" — Wanderer with the branding baked in at BUILD time.
#
# WHY THIS REPO EXISTS. On docker-compose the branding was applied at every
# container START, by hijacking `command:` to run a patch script before the app.
# That worked, but it meant: a writable /app, the app's entrypoint restated by
# hand (and able to go stale silently), the patch re-run on every restart, and —
# worst — a patch that matches nothing after an upstream change fails QUIETLY,
# serving an unbranded site with a healthy pod.
#
# Doing it here instead makes the running artifact one immutable digest, lets
# the deployment keep readOnlyRootFilesystem with nothing to work around, and
# turns "upstream changed their markup" from a 3am surprise into a failed build.

# TAG *AND* DIGEST, and both halves earn their place.
#
# The tag is what a human reads and what Dependabot compares against; the digest
# is what actually gets pulled, so the build is reproducible even if the tag is
# moved. A bare digest would be immutable but unwatchable — Dependabot has no
# version to compare and would never tell you v0.21.0 exists.
#
# compose ran this image UNTAGGED, i.e. :latest, so the running version could
# change under you at any restart. It happened to be v0.20.0 since 2026-07-07.
# That is now stated rather than inherited.
FROM flomp/wanderer-web:v0.21.2@sha256:849f63732d3e751f077c1567bda77aebc68c8b5691271cb418e10efbcf2f364f

# The scripts expect this exact path — patch-branding.sh hardcodes
# /wanderer-branding for about.md, diorama.{png,webp,avif} and three .js
# helpers. Kept identical to the compose bind mount so the scripts need no edit.
COPY branding /wanderer-branding

# One layer: patch, verify, then remove the sources so the 4.3 MiB of build
# input does not ship in the runtime image.
#
# The VERIFY step is the point of building this image. Every patch is a text
# substitution on upstream's minified bundle that exits 0 when it matches
# nothing. verify-branding.js checks every intended OUTCOME (17 of them: titles,
# hero, about page, CSS, dark mode, thumbnails, sort order, serving) and fails
# the build if any one is missing, so an upstream change breaks a PR instead of
# silently un-branding the site. It also checks every file stays readable by
# uid 65532, which this root build must not break. (A `chmod -R` would have
# guaranteed that at the cost of +59 MiB of copy-on-write; sed -i and cp
# already produce 0644, and the check fails loudly if that ever changes.)
RUN set -eu; \
    /wanderer-branding/patch-branding.sh; \
    node /wanderer-branding/verify-branding.js /app/build /wanderer-branding; \
    rm -rf /wanderer-branding

# Declared so the image is honest about how it is meant to run. The Kubernetes
# securityContext sets this too — belt and braces, and it makes `docker run` of
# this image behave the same way the cluster does.
USER 65532:65532
