---
name: release
description: Release a new version of scriptron. Picks the next semver version, writes a short changelog from the changes since the previous release tag, bumps package.json, commits, tags and pushes, which starts the GitHub Actions build of the installers.
argument-hint: '[major | minor | patch | X.Y.Z]'
disable-model-invocation: true
---

# Release a new version

Requested bump or version: `$ARGUMENTS` (empty means: choose one from the changes).

Pushing a `v*` tag runs `.github/workflows/build.yml`, which builds the macOS and Windows
installers and attaches them to a **draft** GitHub Release whose notes are this version's
CHANGELOG.md section. Publishing that draft is left to the user.

## 1. Check the repository is ready

Stop and report, without changing anything, if any of these fail:

- The current branch is `main` and the working tree is clean (`git status --porcelain` is empty).
- `git fetch origin --tags` and then `main` matches `origin/main` (pull first if only behind).
- `.github/workflows/build.yml` exists on `origin/main`; without it the tag builds nothing.
- `yarn typecheck`, `yarn lint` and `yarn test` pass.

## 2. Find the previous release

```bash
git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null
```

- **A tag exists:** the changes are `<tag>..HEAD`. If there are none, stop: there is nothing to release.
- **No tag yet:** this is the first release. Its version is the one in package.json as it is,
  and the changes are the whole history.

## 3. Read what changed

```bash
git log <prev>..HEAD --reverse --format='%h %s%n%n%b'
git diff --stat <prev>..HEAD
```

Read the commit bodies, not just the subjects; open the diff of a commit when its message
doesn't make the effect on users clear.

## 4. Choose the version

Semver, from package.json's current version, which equals the previous tag:

- **major**: something users relied on stops working or works differently: a file format,
  a removed feature, a changed shortcut, settings that don't carry over.
- **minor**: anything new that users can see or do.
- **patch**: only fixes and internal changes.

While the version is below 1.0.0, breaking changes bump the minor version instead.
An explicit `X.Y.Z` in the arguments is used as given, but it must be greater than the previous
version. A `major`, `minor` or `patch` argument overrides the choice above.

## 5. Write the changelog

Add a section at the top of CHANGELOG.md, below its title (create the file with the header
below if it doesn't exist):

```markdown
# Changelog

All notable changes to scriptron are listed here. Versions follow [semver](https://semver.org).

## [1.1.0] - 2026-10-11

### Added

- Pinch the trackpad to zoom the screenplay smoothly.

### Changed

- ...

### Fixed

- ...
```

- Use today's date, and leave out empty groups.
- Write for people who use the app, not for its developers: what they can now do, or what
  works better, in a short line each. Most releases need only a handful of lines.
- Merge commits that make up one change into one line. Leave out refactors, tests, tooling and
  CI changes unless users notice them (e.g. faster typing in long screenplays).
- For the first release, summarize the main features of the app instead of listing every commit.

Don't ask for confirmation: running /release is the go-ahead, so go straight on to releasing.

## 6. Bump, commit, tag and push

```bash
npm version <X.Y.Z> --no-git-tag-version   # only rewrites package.json; skip if unchanged
git add package.json CHANGELOG.md
git commit -m "Release v<X.Y.Z>" -m "<the changelog section, without its heading>"
git tag -a v<X.Y.Z> -m "scriptron <X.Y.Z>"
git push --atomic origin main v<X.Y.Z>
```

End the commit message with the co-author line from the conversation's attribution
instructions, if there is one. `--atomic` makes sure the tag is never pushed without its commit.

## 7. Report

- Show the version (with why it's that bump) and the changelog section.
- Find the build started by the tag: `gh run list --workflow build.yml --limit 1`, and give the
  user its URL. It takes several minutes; don't wait for it unless asked.
- Tell the user the release will appear as a draft at
  `https://github.com/kistasi/scriptron/releases` once the build finishes, to check and publish.
- If a step fails after the commit but before the push, say exactly what was done locally
  (commit, tag) so it can be undone with `git tag -d` and `git reset --hard HEAD~1`; never
  delete or move a tag that has already been pushed.
