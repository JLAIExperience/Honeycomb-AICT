# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with **James Test App**.

Use `AGENTS.md` as the canonical project and ServiceNow AIUX guidance. It contains the cross-agent rules, recommended skills, project conventions, and common commands for this application.

The ServiceNow agent packs are declared in `package.json` dev dependencies. A `postinstall` script copies the installed `aiux` and `horizon-design-knowledge` skills into `.claude/skills`, then symlinks `.claude/skills` into `.agents/skills` so any agent can read them, automatically on `pnpm install`. Run `pnpm agent:skills` to force a re-copy.

## Commands

```bash
pnpm dev                  # Start dev server
pnpm build                # Build AIUX frontend and metadata
pnpm serve                # Dev server using instance metadata
pnpm lint                 # Lint
pnpm deploy               # Install to ServiceNow instance
pnpm deploy:reinstall     # Reinstall (overwrites existing app)
```

> `pnpm build` (`now-sdk build`) compiles AIUX browser bundles and packages widget records
> into `dist-metadata/app/`.

## Project Structure

```
pages/              # File-based routing — each directory is a URL route
  home/
    components/       # Page-scoped components
    page.js         # Page component (extends AIUXElement) with static async loader(ctx)
widgets/            # Widget code (custom elements with server scripts)
aiux.json           # AIUX app manifest (name, basename, landing page)
now.config.json     # ServiceNow scope manifest (scope, scopeId)
```

## Key Conventions

- Components extend `AIUXElement` from `@servicenow/aiux/aiux-components-core`, never `LitElement`
- Guard `window`/`document`/`localStorage` with `isServer` from `lit` in `constructor()`, `render()`, and `connectedCallback()`
- Use Tailwind + DaisyUI for styling; no `--now-*` CSS tokens
- Prefer ServiceNow AIUX data components over custom markup:
  - Lists should use `ListDataManager` and `<aiux-list-connected>` from `@servicenow/aiux/aiux-components-list`
  - Record forms should use `RecordDataManager`, `<aiux-record-provider>`, and `<aiux-record-form>` from `@servicenow/aiux/aiux-components-record`
  - Do not hand-roll tables, list rows, or record forms unless the user explicitly asks for custom markup
- PR titles: `STRY########:`, `DEF#######:`, `MAINT:`, or `chore:`
