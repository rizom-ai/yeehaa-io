# Capability-bundle crossover target

`brain.yaml` is the deterministic `professional` migration preview for the active
configuration at `origin/main` commit `795236e`. It is a review artifact, not an active
runtime configuration, and does not authorize deployment.

Regenerate it with the unified CLI:

```sh
brain config migrate --recipe professional
```

The preview preserves the domain, profile kind, site/theme, `obsidian-vault` addition,
permissions, all plugin configuration, and secret selectors. It changes only the explicit
bundle selection, adds the required `bundleContract`, and supplies the recipe's canonical
anchor.

Apply this file to the repository root only in the same commit that pins `@rizom/brain`
and `bun.lock` to the exact published unified runtime. Keep the prior config commit and
image digest as one rollback pair. A config using `capability-bundles-v1` must never run
against the current legacy runtime pin.
