# yeehaa.io Capability Crossover Record

> Prepared evidence only. This record does not authorize a merge, image publication, canary, or deployment.

## Reviewed configuration

- Legacy source and rollback revision: `795236e3f4ef98cdd57132f4dcbb60008ca3439b`.
- Unified package source merge: `rizom-ai/brains@6f83679fe358ff169e1ce5f25ead6b9e9388523f`.
- Unified package version commit / npm `gitHead`: `rizom-ai/brains@b022fa168b328de678e2856f85b008065044d48b`.
- Execution content commit: `6778f4546921cc27a364a1e8de7e8089bd53e550`.
- Secret-free review diff SHA-256 (excluding this evidence record): `cfba4eaa14343c64f8c453a5270e92757679dda2d80bc6f1a4a8f26b96828539`.
- Reviewed migration target SHA-256: `0c25df387764a8a1fd0ed376d05224afd179bbd7ae4bc9d79dd57f1caac3cf76`.
- The active branch config exactly matches `migration/capability-bundles-v1/brain.yaml`.
- Domain, profile kind, anchor, structural site and theme, permissions, additions, all 11 plugin blocks, and secret selectors are unchanged.
- No secret values were read, copied, or added.

## Forward pair

| Input | Exact value | Integrity or digest |
| ----- | ----------- | ------------------- |
| `@rizom/brain` | `0.2.0-alpha.319` | `sha512-LYWMyruEvypJgNtkwr3xML/mygiKMXQUzk9PcFQF5uQA/WTltm3MOVKd79i1WlGofLLpcvuepRXazIODdbU5Vw==` |
| `@rizom/site` | `0.2.0-alpha.233` | `sha512-K0xLSwrExEB/gvX10eSjvh9Ao4BFKu9wlCOZx33KSU3PTZPllJSA/CAVX9sl90YD9KDZ2jBd62+WvheD+vVlfw==` |
| Bun runtime base | `oven/bun:1.4.0-slim` | `sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6` |
| Bun lockfile | n/a | `sha256:0cad982c74af86ce71eb34276236a8f2193efc908d46ea917fc3bd48c8538c03` |

The standalone image copies `package.json` and `bun.lock` before installation and uses `bun install --production --frozen-lockfile --ignore-scripts`. The exact `alpha.319` packages were independently installed, frozen-reinstalled, imported, and exercised through both CLI version commands.

The forward image reference will be `ghcr.io/rizom-ai/yeehaa-io:<approved-main-merge-sha>`. Its digest is intentionally pending because image publication requires separate approval.

## Rollback pair

| Input | Prior value | Integrity or digest |
| ----- | ----------- | ------------------- |
| Config and package revision | `795236e3f4ef98cdd57132f4dcbb60008ca3439b` | immutable Git commit |
| `@rizom/brain` | `0.2.0-alpha.278` | `sha512-oVMZvJoHHvPfnWLeMSiKBI8ycKMWpYql9hd4XPBgAyppgKFRw606BcVPaPAsy5te071g+dLPCzoWtM7mtEAcBg==` |
| Bun lockfile | n/a | `sha256:da3765e97cd820dbb2857f5c988449132c8c6422a88a27b5b016a66a149fb491` |
| Runtime image | `ghcr.io/rizom-ai/yeehaa-io:795236e3f4ef98cdd57132f4dcbb60008ca3439b` | `sha256:9e47a277c5e5d035ac6c153c095cff9c0d49ea64796e2e7b520e7dc1261039d6` |

Rollback must restore the prior config/package revision and deploy the prior image digest together. The mutable `latest` tag is not rollback evidence.

## Remaining approval-window work

1. Confirm the Publish Image and Deploy workflows are idle.
2. Merge only after explicit deployment-window authorization.
3. Record the resulting main merge SHA and published image digest.
4. Verify the image contains `@rizom/brain@0.2.0-alpha.319`, reports Bun `1.4.0`, and starts with the reviewed config.
5. Complete the authorized canary checks before treating the crossover as stable.
6. If any gate fails, restore the rollback pair above as one operation.
