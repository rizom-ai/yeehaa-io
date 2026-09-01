# yeehaa.io Capability Crossover Record

> Prepared evidence only. This record does not authorize a merge, image publication, canary, or deployment.

## Reviewed configuration

- Legacy source and rollback revision: `795236e3f4ef98cdd57132f4dcbb60008ca3439b`.
- Runtime source baseline: `rizom-ai/brains@5c4528ea0f682883d3b2608bf1692715fa6b8094`.
- Runtime package version commit / npm `gitHead`: `rizom-ai/brains@f2c14309ab1900c18cbd44dc73389fc5fa85a680`.
- Execution content commit: `e86710ce7855c6c6b89924dd7d9b5fa59d6c8f29`.
- Secret-free review diff SHA-256 (excluding this evidence record): `fe3c64bcbfc4b411d02e6358fffe0b1b0d9c9c5432f1967b39a2f2246f2355e4`.
- Reviewed migration target SHA-256: `ee9ad52cdc8eceff6e19aa754fca22c0ced93f687a8377e1271845cb4970e421`.
- The active branch config exactly matches `migration/capability-bundles-v1/brain.yaml` and alpha.341's canonical migration preview.
- Domain, profile kind, anchor, structural site and theme, permissions, additions, all 11 plugin configurations, and secret selectors are preserved; the legacy `cms` plugin ID is renamed to its canonical `studio` ID.
- No secret values were read, copied, or added.

## Forward pair

| Input | Exact value | Integrity or digest |
| ----- | ----------- | ------------------- |
| `@rizom/brain` | `0.2.0-alpha.341` | `sha512-eZH13vnLVwbnNrnYdchLy6031WMFobHCQ+PfK8QchMu38FesILk9uFU0cddOCFVB5M9Y3pIMcePuRwZBAyNrcA==` |
| `@rizom/site` | `0.2.0-alpha.235` | `sha512-cPqNv/FtiJaevsMPccpY8G3dFkQwjsLaP2pWCk1u9sDELIT1PxUMr1xdr+9+L98FgKByz+xCbOqfbemcLXcsFg==` |
| React | `19.2.8` | `sha512-PWaYA1L/q9u2u7xYQi+Y3L3Yfnie7XyLeaJICV1MGD6LprsBxcAqGjYyr0eY3p+QdsA+x/Irkt4Qif8D63+Sbw==` |
| React DOM | `19.2.8` | `sha512-rVprimfGBG3DR+Tq0IQG2DT5PxKth1WIGDmj5yPmlzr4YBe7uyE+Du4oVqTDXZSHGGGXRtTJEGSSePyQCMBglQ==` |
| Bun runtime base | `oven/bun:1.4.0-slim` | `sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6` |
| Bun lockfile | n/a | `sha256:f71fe32bd69d503ec0f5fad4ef129b3c10c4b4261d81d3add18b5d147f3ea5e6` |

The standalone image copies `package.json` and `bun.lock` before installation and uses `bun install --production --frozen-lockfile --ignore-scripts`. The exact alpha.341 production graph was independently frozen-installed and imported. React and React DOM resolve to one matching version, and no Preact package remains in the installed graph.

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

1. Confirm the Publish Image and Deploy workflows are idle and verify the origin's changed SSH host identity out of band.
2. Do not merge until a verified predeploy backup can be finalized immediately before replacement.
3. Merge only after explicit deployment-window authorization, then record the resulting main merge SHA and published image digest.
4. Verify the image contains `@rizom/brain@0.2.0-alpha.341`, `@rizom/site@0.2.0-alpha.235`, one matching React/React DOM pair, and Bun `1.4.0`, and starts with the reviewed config.
5. Complete the authorized runtime, Git synchronization, Studio/passkey, integration, preview, production, and browser checks before treating the crossover as stable.
6. If any gate fails, restore the rollback pair above as one operation.
