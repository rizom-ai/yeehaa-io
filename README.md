# yeehaa-io

A personal brain instance powered by [`@rizom/brain`](https://github.com/rizom-ai/brains).

## Quick start

```bash
bun install
bunx brain start
```

## Local secrets via Bitwarden

Default `start` is unchanged.

For local runs with secrets loaded from Bitwarden, put your Bitwarden
service token in `.env`:

```bash
# .env
BWS_ACCESS_TOKEN=...
```

Then run:

```bash
bun run start:local
```

This loads secrets from `.env.schema` via Varlock and disables
`DISCORD_BOT_TOKEN` locally so the bot does not run twice.

If you intentionally want the full environment, including Discord:

```bash
bun run start:bitwarden
```

## What's here

- `brain.yaml` — instance configuration (model, plugins, secrets, permissions)
- `package.json` — pins `@rizom/brain` and `preact` for module resolution
- `tsconfig.json` — JSX runtime hint (Preact)
- `.env` — optional local secrets override (gitignored, copy from `.env.example`)
- `.env.schema` — canonical secret schema, with Bitwarden-backed values via Varlock
- `brain-data/` — content (created on first sync, gitignored by default)

This brain runs the **rover** model. Edit `brain.yaml` to customize
plugins, change presets, or wire up integrations like Discord and MCP.
