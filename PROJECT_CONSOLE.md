# Still Project Console

Updated: 2026-08-26

## Active Route

- Mode: simple, single line of development
- Canonical Codex task: `Still Store Lite 主线开发与 Mac 接力`
- Canonical repository folder on Windows: the repository root containing this file
- Canonical branch: `codex/store-lite-main`
- Canonical Roadmap: `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md`
- Current release target: no-payment `Store Lite 1.0`, followed by TestFlight and App Store review
- Visual baseline: `docs/MAIN_APP_UI_BASELINE.md`; keep the black discovery feed, immersive work detail, light account page, and floating bottom navigation from the established main App.

## Routing Rules

1. Continue this one project task for planning, implementation, verification, Roadmap updates, and release decisions.
2. Pull and push only `codex/store-lite-main` for normal development.
3. Complete one eligible Roadmap node at a time. Record its commit and verification before selecting the next node.
4. Do not create a new worktree or feature branch unless the user explicitly restores parallel development.
5. Existing branches and worktrees are historical checkpoints. They are not current instructions and must not be merged wholesale.
6. Keep `server/data/store.json`, old bundles, render output, deliverables, temporary files, deployment ZIP files, and all secret material out of release commits.
7. Treat Store Lite as a compile-time release capability profile on the established main-App visual language, not as permission to replace the product with a separate visual shell.

## Source Decisions

- The latest code and Store Lite implementation baseline came from `origin/codex/vertical-db-api`.
- The 2026-08-25 demand-card and personal/store makeup-supply product decisions were carried forward from the latest local Roadmap snapshot.
- Verified external progress from the older Roadmap workstream is summarized in the canonical Roadmap only where it remains valid under the newer acceptance criteria.
- `codex/release-roadmap`, `codex/mac-ios`, dated Windows branches, and dated Mac transfer branches remain readable history only.

## Mac Entry

Read `docs/MACBOOK_PROJECT_TRANSFER.md` and `docs/MAIN_APP_UI_BASELINE.md`, then continue the earliest eligible P0 Store Lite node. The first Mac pass should verify the restored main-App visual baseline in browser/iOS Debug, then verify the explicit Store Lite build, Capacitor sync, native release guards, Xcode Team/signing, a real device, and TestFlight readiness.
