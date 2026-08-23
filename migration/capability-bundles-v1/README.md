# Capability-bundle crossover execution candidate

`brain.yaml` is the deterministic `professional` migration target for the configuration at
`origin/main` commit `795236e`. The repository-root `brain.yaml` now matches this reviewed
target exactly in the execution branch.

The target preserves the domain, profile kind, site/theme, `obsidian-vault` addition,
permissions, all 11 plugin blocks, and secret selectors. It changes only the explicit
bundle selection, adds `bundleContract: capability-bundles-v1`, and retains the recipe's
canonical anchor.

The paired runtime inputs are exact:

- `@rizom/brain@0.2.0-alpha.319`;
- Bun `1.4.0-slim` at
  `sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6`;
- the committed Bun lockfile, installed in the image with `--frozen-lockfile`.

`crossover-record.md` records registry integrity, prior image digest, and the coherent
rollback revision. This branch is prepared for review only. It does not authorize a merge,
image publication, canary, or deployment. Every merge to `main` publishes an image and
chains into deployment, so merge only inside a separately approved window.
