# PP Platform Codex Instructions

Use the `github-version-checkpoint` workflow for this repository.

After Codex changes project code, documentation, configuration, or bundled data, default to creating a GitHub checkpoint before finishing:

- Inspect `git status --short --branch`.
- Exclude unrelated junk, empty accidental files, logs, build output, secrets, `.env` files, and dependency folders.
- Run `npm.cmd run build` in `pp-app` when frontend code changes.
- Stage only relevant files.
- Commit with a clear Chinese message.
- Push the current branch to `origin`.
- Report the verification result, commit hash, push target, and any intentionally untracked files.

Skip the checkpoint only when the user explicitly says not to commit, not to push, or only to inspect/propose changes.
