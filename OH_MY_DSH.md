# oh-my-dsh

English | [日本語](OH_MY_DSH.ja.md)

`oh-my-dsh` is the terminal-first opinionated layer for this fork. It keeps upstream `dsh` as the only application launcher, then adds a small TUI, a custom Web preset, role-based continuable subagents, and environment-driven model routing.

## Quick start

```sh
pnpm install

# terminal UI (default)
pnpm oh-my-dsh

# Web UI with the oh-my-dsh preset
pnpm oh-my-dsh web --no-open

# one-shot headless task
pnpm oh-my-dsh ask "fix the failing tests"

# persist a specialist model route
pnpm oh-my-dsh route worker openrouter/anthropic/claude-sonnet-4 high
pnpm oh-my-dsh routes

# environment checks
pnpm oh-my-dsh doctor
```

## Terminal UI

The default command starts a lightweight interactive terminal surface on top of the shipped headless JSON protocol. Each turn starts a bounded headless process while reusing the same persisted DSH session id, so conversation history remains durable without maintaining a second Agent runtime.

Built-in commands:

```text
/help
/new
/session
/resume <session-id>
/routes
/scout <task>
/worker <task>
/review <task>
/architect <task>
/route <role> <provider>/<model> [effort]
/route <role> inherit
/clear
/exit
```

Tool calls and results are shown inline, reasoning is compacted for display, step/token usage is shown when the provider reports it, and the final assistant answer is printed normally. `/scout`, `/worker`, `/review`, and `/architect` are foreground specialist shortcuts: they delegate to the named role and wait for its result before the turn completes.

## oh-my-dsh preset

Web defaults to the custom `oh-my-dsh` preset. It keeps the PTC presentation model and the normal coding surface while enabling workflow, Ralph, Cordis inspection, plugin management, and role-based delegation.

The role tools are:

- `scout` — fast read-only exploration and evidence gathering.
- `worker` — scoped implementation plus verification.
- `reviewer` — adversarial correctness, security, regression, and test review.
- `architect` — design, boundaries, failure modes, performance, and migration cost.
- `subagent` — general fresh continuable child.
- `subagent_fork` — continuable child seeded with completed parent turns.

Role children default to the parent model. They can be routed independently through environment variables.

## Model routing

The TUI can change routes for subsequent child processes:

```text
/route worker openrouter/anthropic/claude-sonnet-4 high
/route reviewer openrouter/openai/gpt-5 high
/route scout inherit
```

The same routing can be configured before Web or headless startup:

```sh
export OMDSH_SCOUT_PROVIDER=openrouter
export OMDSH_SCOUT_MODEL=google/gemini-2.5-flash

export OMDSH_WORKER_PROVIDER=openrouter
export OMDSH_WORKER_MODEL=anthropic/claude-sonnet-4
export OMDSH_WORKER_EFFORT=high

export OMDSH_REVIEWER_PROVIDER=openrouter
export OMDSH_REVIEWER_MODEL=openai/gpt-5
export OMDSH_REVIEWER_EFFORT=high
```

Supported role prefixes are `SCOUT`, `WORKER`, `REVIEWER`, and `ARCHITECT`, each with `_PROVIDER`, `_MODEL`, and optional `_EFFORT`. The main Agent keeps DSH's normal model selection and Web `/model` behavior.

The provider route must already exist in DSH. Third-party routes can be configured through the existing Models / `llm-pi-ai` surface. An unset specialist route inherits the parent Agent's provider and model. TUI `/route` changes, or `pnpm oh-my-dsh route <role> <provider>/<model> [effort]`, are persisted to `$DSH_HOME/oh-my-dsh/routes.json` and reused by later TUI, Web, and headless launches. Use `pnpm oh-my-dsh route <role> inherit` to clear one persisted route. Explicit `OMDSH_*` environment variables take precedence over persisted values.

## Web additions

The Web overlay also enables scheduling and durable full-text session search. The SQLite search index is opened on first search at `$DSH_HOME/session-search.sqlite`. A user-saved preset selection still overrides the deployment default.

## Architecture

```text
oh-my-dsh TUI
  └─ dsh --profile headless --json
      └─ persisted session id

oh-my-dsh Web
  └─ dsh --profile web
      └─ oh-my-dsh preset
          ├─ scout
          ├─ worker
          ├─ reviewer
          └─ architect
```

No second Agent loop or alternate DSH runtime is introduced. The fork-specific behavior stays in `scripts/oh-my-dsh/` overlays and launcher code so upstream merges keep a small conflict surface.

## Node.js

The fork follows the repository engine requirement:

```text
^22.19.0 or >=24.0.0
```
