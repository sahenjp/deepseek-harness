# oh-my-dsh

`oh-my-dsh` is an opinionated launcher layer for this fork. It keeps `dsh` as the only application launcher and applies small profile overlays instead of maintaining a second Harness runtime.

## Usage

```sh
pnpm install
pnpm oh-my-dsh
pnpm oh-my-dsh -- --no-open
pnpm oh-my-dsh ask "fix the failing tests"
pnpm oh-my-dsh doctor
```

Web sessions default to the built-in `ptc` preset, scheduling is enabled, and session full-text search opens a durable SQLite index on first search. A saved preset selection still wins over the deployment default.

`ask` runs the shipped headless profile with PTC presentation. Its overlay also enables the built-in Ralph and profile plugin-management tools.

The overlays live in `scripts/oh-my-dsh/`. They only replace configuration owned by existing DSH rows, so upstream runtime code remains unchanged and the fork can continue to merge upstream changes with a small conflict surface.
