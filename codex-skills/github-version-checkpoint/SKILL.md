---
name: github-version-checkpoint
description: Preserve Codex code changes as local Git checkpoints for VS Code review and rollback, then push a clean version to GitHub only when the user approves. Use when the user asks to save a version, keep rollback points, checkpoint work, review in VS Code, upload to GitHub, publish a good version, commit, push, or when project instructions ask for checkpointing.
---

# GitHub Version Checkpoint

Use this workflow after making code changes when the user wants frequent recoverable local versions for VS Code, plus deliberate GitHub releases when a version is good.

## Default Behavior

After code changes are complete, create a local Git checkpoint unless the user explicitly says not to commit, not to save a version, or only to inspect/propose changes.

Do not push to GitHub by default. Push only when the user says the version is good, asks to publish, upload, push, sync, release, or create a GitHub version.

Keep the checkpoint clean:

- Read `git status --short --branch` first.
- Preserve user changes. Do not revert unrelated work.
- Exclude obvious junk: logs, build output, empty accidental files, temporary scratch files, secrets, `.env`, dependency folders, and unrelated personal files.
- If an untracked file is ambiguous, leave it unstaged and mention it.
- Prefer committing only files relevant to the completed task.

## Verification

Before a local checkpoint, run the smallest relevant verification:

- Prefer the repo's build/test scripts when available, such as `npm run build`, `npm test`, `pnpm test`, `pytest`, `cargo test`, or similar.
- For tiny docs-only or config-only changes, a targeted file/status check can be enough.
- If no reliable verification exists, run a lighter check and clearly say what was not verified.
- If verification fails, do not commit unless the user explicitly asks to save a failing work-in-progress. Report the failure and the likely next fix.

Before a GitHub release checkpoint, run the full relevant verification. For the PP platform frontend, use `npm.cmd run build` in `pp-app`.

## Local Checkpoint

1. Show a concise summary of what will be committed.
2. Stage only the selected files.
3. Commit locally with a short, meaningful message in the user's language when obvious.
4. Prefer a checkpoint prefix for small saves, such as `本地检查点：完善订单筛选`.
5. Report the local commit hash, current branch, and verification result.

Use a new branch for larger or risky tasks when the user asks, or when the current branch should be kept stable. Use `codex/` as the default branch prefix.

## GitHub Release

When the user confirms the version is good or asks to upload to GitHub:

1. Inspect local commits and working tree state.
2. Run the full relevant verification.
3. If multiple local checkpoint commits exist, ask whether to push them as-is or squash into one clean release commit.
4. Push the chosen branch to `origin`.
5. Report the pushed commit hash and remote branch.

## Final Response

Include:

- Verification command and result.
- Local checkpoint commit hash and message, or GitHub release commit hash when pushed.
- Current branch.
- Push target only when a push happened.
- Any files intentionally left untracked.

If running inside the Codex desktop app, emit the relevant git directives only after the matching action succeeds.
