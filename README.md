# yeehaa-io

A personal brain instance powered by [`@rizom/brain`](https://github.com/rizom-ai/brains).

## Quick start

```bash
bun install
bunx brain start
```

## What's here

- `brain.yaml` — instance configuration (model, plugins, secrets, permissions)
- `package.json` — pins `@rizom/brain` and `preact` for module resolution
- `tsconfig.json` — JSX runtime hint (Preact)
- `.env` — secrets (gitignored, copy from `.env.example`)
- `brain-data/` — content (created on first sync, gitignored by default)

This brain runs the **rover** model. Edit `brain.yaml` to customize
plugins, change presets, or wire up integrations like Discord and MCP.
