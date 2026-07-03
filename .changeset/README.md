# Changesets

Each pull request that changes the published package should include a changeset:

```bash
npm run changeset
```

Choose `patch`, `minor`, or `major`, then describe the user-visible change. The
release workflow collects pending changesets into a version pull request. Merging
that pull request publishes the new version to npm through trusted publishing.

Documentation-only and internal maintenance changes may use an empty changeset:

```bash
npm run changeset -- --empty
```
