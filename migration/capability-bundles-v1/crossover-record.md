# yeehaa.io Capability Crossover Record

> Prepared evidence only. This record does not authorize a merge, image publication, canary, or deployment.

## Reviewed configuration

- Legacy source and rollback revision: `795236e3f4ef98cdd57132f4dcbb60008ca3439b`.
- Runtime source baseline: `rizom-ai/brains@049497b4a00206fcc5bbdbf3c75c02ceadd4cf30`.
- Runtime package version commit / npm `gitHead`: `rizom-ai/brains@12f27219de4be4837b5a4d665a72b8d8e013196d`.
- Execution content commit: `51d120299f2ea61691dd5b53aeef36e79ec4361a`.
- Secret-free review diff SHA-256 (excluding this evidence record): `ec3697d61f707a13b994f4215c3ba242cbc8a367fd0f4291d24b2a5bcdea0e3a`.
- Reviewed migration target SHA-256: `ee9ad52cdc8eceff6e19aa754fca22c0ced93f687a8377e1271845cb4970e421`.
- The active branch config exactly matches `migration/capability-bundles-v1/brain.yaml` and alpha.341's canonical migration preview.
- Domain, profile kind, anchor, structural site and theme, permissions, additions, all 11 plugin configurations, and secret selectors are preserved; the legacy `cms` plugin ID is renamed to its canonical `studio` ID.
- The standalone deploy invokes alpha.343's published canonical predeploy backup command after SSH readiness and immediately before replacement.
- The confirmed post-reprovision SSH ED25519 fingerprint is pinned; a future host replacement fails closed until separately verified.
- No secret values were read, copied, or added.

## Forward pair

| Input            | Exact value           | Integrity or digest                                                                               |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| `@rizom/brain`   | `0.2.0-alpha.343`     | `sha512-rfkIpFR2y/Z4DQ8/fvetSNkpmRXbdCbbaeXPOSVt6T8AtfjhYNMT/e4UVtTnLMY4qRRH/pYNwYjNc+NYvmODeg==` |
| `@rizom/site`    | `0.2.0-alpha.235`     | `sha512-cPqNv/FtiJaevsMPccpY8G3dFkQwjsLaP2pWCk1u9sDELIT1PxUMr1xdr+9+L98FgKByz+xCbOqfbemcLXcsFg==` |
| React            | `19.2.8`              | `sha512-PWaYA1L/q9u2u7xYQi+Y3L3Yfnie7XyLeaJICV1MGD6LprsBxcAqGjYyr0eY3p+QdsA+x/Irkt4Qif8D63+Sbw==` |
| React DOM        | `19.2.8`              | `sha512-rVprimfGBG3DR+Tq0IQG2DT5PxKth1WIGDmj5yPmlzr4YBe7uyE+Du4oVqTDXZSHGGGXRtTJEGSSePyQCMBglQ==` |
| Bun runtime base | `oven/bun:1.4.0-slim` | `sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6`                         |
| Bun lockfile     | n/a                   | `sha256:71802aeb2e6f326f80de41d1b64b2476764aeae742aa77881bc2705757697d87`                         |

The standalone image copies `package.json` and `bun.lock` before installation and uses `bun install --production --frozen-lockfile --ignore-scripts`. The exact alpha.343 production graph was independently frozen-installed and imported. React and React DOM resolve to one matching version, and no Preact package remains in the installed graph.

The forward image reference will be `ghcr.io/rizom-ai/yeehaa-io:<approved-main-merge-sha>`. Its digest is intentionally pending because image publication requires separate approval.

## Rollback pair

| Input                       | Prior value                                                           | Integrity or digest                                                                               |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Config and package revision | `795236e3f4ef98cdd57132f4dcbb60008ca3439b`                            | immutable Git commit                                                                              |
| `@rizom/brain`              | `0.2.0-alpha.278`                                                     | `sha512-oVMZvJoHHvPfnWLeMSiKBI8ycKMWpYql9hd4XPBgAyppgKFRw606BcVPaPAsy5te071g+dLPCzoWtM7mtEAcBg==` |
| Bun lockfile                | n/a                                                                   | `sha256:da3765e97cd820dbb2857f5c988449132c8c6422a88a27b5b016a66a149fb491`                         |
| Runtime image               | `ghcr.io/rizom-ai/yeehaa-io:795236e3f4ef98cdd57132f4dcbb60008ca3439b` | `sha256:9e47a277c5e5d035ac6c153c095cff9c0d49ea64796e2e7b520e7dc1261039d6`                         |

Rollback must restore the prior config/package revision and deploy the prior image digest together. The mutable `latest` tag is not rollback evidence.

## Remaining approval-window work

1. Confirm the Publish Image and Deploy workflows are idle and verify the origin's changed SSH host identity out of band.
2. Do not merge until a verified predeploy backup can be finalized immediately before replacement.
3. Merge only after explicit deployment-window authorization, then record the resulting main merge SHA and published image digest.
4. Verify the image contains `@rizom/brain@0.2.0-alpha.343`, `@rizom/site@0.2.0-alpha.235`, one matching React/React DOM pair, and Bun `1.4.0`, and starts with the reviewed config.
5. Complete the authorized runtime, Git synchronization, Studio/passkey, integration, preview, production, and browser checks before treating the crossover as stable.
6. If any gate fails, restore the rollback pair above as one operation.
