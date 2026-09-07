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
FROM flomp/wanderer-web:v0.20.0@sha256:d76177573caab135e8167179c9954168b5c582a48cbef0fcb7e1571af0c84d98

# The scripts expect this exact path — patch-branding.sh hardcodes
# /wanderer-branding for about.md, diorama.{png,webp,avif} and three .js
# helpers. Kept identical to the compose bind mount so the scripts need no edit.
COPY branding /wanderer-branding

# One layer: patch, verify, then remove the sources so the 4.3 MiB of build
# input does not ship in the runtime image.
#
# The VERIFY step is the point of moving this to build time. Every patch in the
# script is a best-effort text substitution that exits 0 when it matches
# nothing. Asserting the result here means an upstream change breaks the build
# instead of silently un-branding the site.
RUN set -eu; \
    /wanderer-branding/patch-branding.sh; \
    grep -rqF "Brad's Trails" /app/build \
      || { echo "FATAL: branding text not found after patch — upstream markup changed"; exit 1; }; \
    grep -rqF "Rocky Lake" /app/build \
      || { echo "FATAL: hero alt text not applied — upstream markup changed"; exit 1; }; \
    rm -rf /wanderer-branding; \
    # The deployment runs as uid 65532 (PSS restricted) while this build runs
    # as root, so every patched file must stay world-readable. VERIFY rather
    # than `chmod -R`: a recursive chmod touches every file in /app/build,
    # which copy-on-write duplicates the entire directory into this layer —
    # measured at +59 MiB for no change, since the tools used here (sed -i, cp)
    # already produce 0644. This check costs nothing and fails loudly if that
    # ever stops being true.
    ! find /app/build ! -perm -o=r -type f | grep -q . \
      || { echo "FATAL: patched files are not world-readable; uid 65532 could not serve them"; \
           find /app/build ! -perm -o=r -type f | head; exit 1; }

# Declared so the image is honest about how it is meant to run. The Kubernetes
# securityContext sets this too — belt and braces, and it makes `docker run` of
# this image behave the same way the cluster does.
USER 65532:65532
