---
name: github-version-checkpoint
description: Automatically preserve project progress in GitHub after Codex changes code. Use when the user asks to save a version, upload to GitHub, create a checkpoint, commit and push, make work easy to roll back, or when a project-level instruction says code changes should be verified, committed, and pushed unless the user opts out.
---

# GitHub Version Checkpoint

Use this workflow after making code changes when the user wants a recoverable GitHub version, or when the project asks for automatic version checkpoints.

## Default Behavior

After code changes are complete, do a checkpoint unless the user explicitly says not to commit, not to push, or only to inspect/propose changes.

Keep the checkpoint clean:

- Read `git status --short --branch` first.
- Preserve user changes. Do not revert unrelated work.
- Exclude obvious junk: logs, build output, empty accidental files, temporary scratch files, secrets, `.env`, dependency folders, and unrelated personal files.
- If an untracked file is ambiguous, leave it unstaged and mention it.
- Prefer committing only files relevant to the completed task.

## Verification

Before committing, run the most relevant verification for the repository:

- Prefer the repo's build/test scripts when available, such as `npm run build`, `npm test`, `pnpm test`, `pytest`, `cargo test`, or similar.
- If no reliable verification exists, run a lighter check and clearly say what was not verified.
- If verification fails, do not commit unless the user explicitly asks to save a failing work-in-progress. Report the failure and the likely next fix.

## Commit And Push

1. Show a concise summary of what will be committed.
2. Stage only the selected files.
3. Commit with a short, meaningful message in the user's language when obvious.
4. Push the current branch to `origin`.
5. Report the commit hash, branch, remote, and verification result.

Use a new branch for larger or risky tasks when the user asks, or when the current branch should be kept stable. Use `codex/` as the default branch prefix.

## Final Response

Include:

- Verification command and result.
- Commit hash and message.
- Push target.
- Any files intentionally left untracked.

If running inside the Codex desktop app, emit the relevant git directives only after the matching action succeeds.
