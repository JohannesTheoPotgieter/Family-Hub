# Dependency audit — 2026-03-23

## Executive summary

Family Hub currently has an unusually small direct dependency surface: only `react` and `react-dom` ship to production, while the rest of the JavaScript toolchain stays in `devDependencies`. That means there is **no serious dependency sprawl in the current runtime bundle**.

The main issues are around **tooling weight and repo hygiene**, not user-facing runtime weight:

1. `@vitejs/plugin-react` pulls in a large Babel toolchain for a project that does not appear to require custom Babel transforms.
2. `concurrently` is useful, but it is a convenience dependency that can often be replaced with a small local script if the team wants to trim install size.
3. `server/index.ts` references `express`, `cors`, and `node-ical`, but those packages are not declared in `package.json` and the active server entrypoint is `server/index.mjs`. This is a maintenance and security-review risk because it creates ambiguity about the real production server stack.
4. The repo is already doing the most important thing correctly: runtime packages are minimal and the Node standard library handles most server concerns.

## Keep / remove / review

### Keep

- `react`, `react-dom`
  - **Why:** They are the only true browser runtime dependencies and are actively used by the application entrypoint and UI tree.
  - **Impact:** No change recommended.
  - **Migration risk:** None.

- `typescript`
  - **Why:** Required by the build script (`tsc -b`) and by the mixed TS/TSX codebase.
  - **Impact:** No change recommended.
  - **Migration risk:** None.

- `vite`
  - **Why:** The frontend build and dev workflow depend on it directly.
  - **Impact:** No change recommended.
  - **Migration risk:** None.

### Remove

- `concurrently` *(conditional removal)*
  - **Why:** It is only used for the `dev:all` convenience script. A small Node launcher script could replace it.
  - **Impact:** Small install-size reduction, fewer transitive packages (`rxjs`, `yargs`, `chalk`, etc.), slightly smaller audit surface.
  - **Migration risk:** Low, provided the replacement preserves cross-platform process shutdown behavior.

### Review

- `@vitejs/plugin-react`
  - **Why:** It works, but it also introduces the heaviest part of the dependency graph through Babel-related transitive dependencies. If the app does not need Babel-only React transforms, the team should evaluate `@vitejs/plugin-react-swc` or future Vite-native React options.
  - **Impact:** Potentially meaningful install/build-weight reduction and fewer transitive dependencies.
  - **Migration risk:** Medium, because Fast Refresh behavior, JSX transform edge cases, and test/build parity must be re-verified.

- `server/index.ts`
  - **Why:** This file imports `express`, `cors`, and `node-ical`, but those libraries are not declared and the repo appears to use `server/index.mjs` instead. That makes the dependency story confusing and can trigger incorrect future installs or stale security remediation work.
  - **Impact:** Cleaning this up reduces ambiguity, avoids accidental reintroduction of a heavier server stack, and makes dependency audits more trustworthy.
  - **Migration risk:** Low if the file is deleted or clearly marked as obsolete after confirming it is unused.

## Duplicate or overlapping libraries

### Direct dependencies

There are **no duplicate direct libraries** in `package.json` today. The manifest is already lean.

### Functional overlap in the toolchain

- `vite` + `@vitejs/plugin-react`
  - This is a normal pairing, not an outright duplicate, but the React plugin currently brings in a large Babel stack.
  - Recommendation: **review**, not remove blindly.

- `concurrently`
  - Overlaps with what a small local Node script or shell wrapper can do for `dev:all`.
  - Recommendation: **remove if trimming install size matters**.

### Ambiguous server stack overlap

- `server/index.ts` uses an Express-style stack (`express`, `cors`, `node-ical`).
- `server/index.mjs` uses a standard-library HTTP server bootstrap.
- Only one server stack should remain visible as the canonical implementation.

Recommendation: **remove or archive the obsolete path** so the codebase reflects a single server architecture.

## Dependencies that should be devDependencies

No current `package.json` dependency obviously belongs in `devDependencies` instead. The only runtime dependencies are:

- `react`
- `react-dom`

Those are correctly classified because they are imported by the shipped client bundle.

## Abandoned or low-value libraries

### Low-value

- `concurrently`
  - Valuable for ergonomics, but low value relative to its transitive footprint in such a small repo.
  - Best candidate for removal if the goal is reducing sprawl.

### Possibly obsolete code path, not manifest dependency

- `express`, `cors`, `node-ical` in `server/index.ts`
  - These are not currently installed, but the file implies prior or alternate usage.
  - Even though they are not active manifest dependencies, they are low-value to keep in source if that entrypoint is no longer supported.

### Not enough evidence to call abandoned

- `react`, `vite`, `typescript`, `@vitejs/plugin-react`
  - No recommendation to classify these as abandoned based on the current repo state.

## One library that can replace several

### Best consolidation opportunity

- Replace `concurrently` with a small local `scripts/dev-all.mjs`
  - Can replace the external process runner dependency entirely.
  - Consolidates process management into first-party repo code.

### Broader toolchain consolidation opportunity

- Replace Babel-based `@vitejs/plugin-react` with a lighter React plugin option if compatibility checks pass.
  - This would not replace multiple *direct* dependencies, but it could collapse a large transitive tree.
  - This is the only recommendation with potentially noticeable install/build-weight payoff.

## High-risk dependencies affecting startup, build, or security

### 1. `@vitejs/plugin-react` — build/install weight risk

- **Risk type:** Build/install weight.
- **Why it matters:** It is the biggest direct source of transitive dependency expansion in the repo.
- **Effect on startup:** No meaningful runtime startup risk in production, but it increases install complexity and the surface area for build-time issues.
- **Recommendation:** Review alternatives before changing.

### 2. `concurrently` — low security value per package added

- **Risk type:** Audit surface / transitive package count.
- **Why it matters:** Adds many packages for a non-production convenience function.
- **Effect on startup:** None in production.
- **Recommendation:** Remove after adding a local replacement script if desired.

### 3. Obsolete `server/index.ts` dependency references — security-review risk

- **Risk type:** Process and maintenance risk.
- **Why it matters:** Security work becomes less reliable when the repository suggests multiple incompatible server stacks, especially when one path references undeclared packages.
- **Effect on startup:** Can mislead future maintainers about what actually ships and what needs patching.
- **Recommendation:** Remove or clearly deprecate the file.

## Recommended implementation order

1. **Clarify the canonical server stack first.**
   - Confirm `server/index.mjs` is the only supported backend entrypoint.
   - Delete or deprecate `server/index.ts` if unused.
   - **Why first:** It removes audit ambiguity before changing package choices.
   - **Risk:** Low.

2. **Decide whether `concurrently` is worth keeping.**
   - If not, replace `dev:all` with a local Node script and remove the dependency.
   - **Why second:** Low-risk, isolated, and easy to roll back.
   - **Risk:** Low.

3. **Evaluate `@vitejs/plugin-react` alternatives.**
   - Try a branch using a lighter plugin and compare dev server behavior, HMR, and production build output.
   - **Why third:** Best payoff, but also the highest migration risk in this repo.
   - **Risk:** Medium.

4. **Continue the current strategy of minimal runtime dependencies.**
   - Keep avoiding server/framework packages unless they deliver clear product value.
   - **Why fourth:** This is more of a governance rule than a migration.

## Migration risk summary

- **Low risk:**
  - Removing or deprecating obsolete `server/index.ts`
  - Replacing `concurrently` with a local script

- **Medium risk:**
  - Replacing `@vitejs/plugin-react` with a lighter alternative

- **No action / no risk:**
  - `react`, `react-dom`, `vite`, `typescript`

## Bottom line

Family Hub does **not** currently have a bloated production dependency set. The runtime is already lean. The most useful cleanup work is to:

1. remove ambiguous obsolete server code,
2. optionally drop `concurrently`, and
3. benchmark whether the Babel-based React plugin is worth its transitive weight.

That sequence will reduce dependency noise without destabilizing the product.
