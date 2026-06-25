# PP Platform Codex Instructions

Use the `github-version-checkpoint` workflow for this repository.

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
