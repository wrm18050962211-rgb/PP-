# PP Platform Codex Instructions

Use the `github-version-checkpoint` workflow for this repository.

## Current Single-Line Development Mode

- Canonical development branch: `codex/store-lite-main`.
- Canonical project task: `Still Store Lite 主线开发与 Mac 接力`.
- Work in the saved project folder and continue the same Codex task. Do not create another branch, worktree, or implementation task unless the user explicitly re-enables parallel development.
- Treat other `codex/*` branches and existing worktrees as historical checkpoints. Do not merge them into the canonical branch without reviewing the exact commits and Roadmap impact.
- Treat `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md` as the only node-status source and `docs/APP_STORE_LAUNCH.md` as the Store Lite release-scope source.
- Keep passwords, tokens, certificates, provisioning profiles, `.env` files, private endpoints, private account identifiers, and production data outside Git and outside Codex messages.

After Codex changes project code, documentation, configuration, or bundled data, default to creating a local VS Code/Git checkpoint before finishing:

- Inspect `git status --short --branch`.
- Exclude unrelated junk, empty accidental files, logs, build output, secrets, `.env` files, and dependency folders.
- Run the smallest relevant verification for the change. Use `npm.cmd run build` in `pp-app` for frontend changes that are more than trivial.
- Stage only relevant files.
- Commit locally with a clear Chinese message using a checkpoint prefix, such as `本地检查点：完善订单筛选`.
- Do not push automatically after every small change.
- Report the verification result, local commit hash, current branch, and any intentionally untracked files.

Push to GitHub only when the user explicitly says this version is good, asks to publish, upload, push, sync, or create a GitHub version. For that GitHub release checkpoint:

- Run `npm.cmd run build` in `pp-app` when the app may be affected.
- If several local checkpoint commits exist, ask whether to push them as-is or squash them into one clean release commit.
- Push the current branch to `origin`.
- Report the pushed commit hash and remote branch.

Skip all checkpointing only when the user explicitly says not to commit, not to save a version, or only to inspect/propose changes.
