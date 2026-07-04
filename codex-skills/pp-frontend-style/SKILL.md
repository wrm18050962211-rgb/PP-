---
name: pp-frontend-style
description: Apply the PP platform frontend style, React architecture, mobile-first UX patterns, Tailwind conventions, and validation habits. Use when Codex designs, edits, reviews, or refactors pp-app frontend screens, components, routing, role-specific user flows, filters, booking UI, profile pages, order/message pages, admin pages, or frontend documentation for this repository.
---

# PP Frontend Style

Use this skill to keep PP platform frontend work consistent with the existing product instead of redesigning from scratch.

## Core Workflow

1. Read the touched feature files before editing. Prefer nearby page/component patterns over generic UI instincts.
2. Identify the active surface: consumer, companion, admin, auth, booking, profile, messages, orders, or shared component.
3. Preserve the mobile app frame: `max-w-md`, `min-h-dvh`, bottom safe-area behavior, compact chrome on scroll when used by the shell.
4. Reuse existing service/data/type boundaries. Pages should compose domain services and typed data, not invent unrelated state models.
5. Match the visual grammar: black/white contrast, warm off-white pages, compact typography, pill controls, dense mobile cards, photo-led content, restrained shadows, and lucide icons.
6. Run the smallest relevant verification. For non-trivial frontend edits, run `npm.cmd run build` in `pp-app`.

## Style Reference

Read `references/frontend-patterns.md` when implementing or reviewing frontend UI, especially when adding a new screen, modal, filter surface, navigation entry, or reusable component.

## Implementation Rules

- Use React function components with TypeScript types close to the component that owns them.
- Use Tailwind utility classes and existing global helpers from `src/styles/index.css`.
- Use `lucide-react` icons for actions and navigation.
- Keep touch targets stable, usually 36-56px high depending on density.
- Prefer semantic product states: empty, loading, denied/failed, active filter counts, selected chips, confirmed order states.
- Keep Chinese product copy concise and action-oriented. Preserve existing terminology for roles, orders, booking, consultation, collections, and profile setup.
- Do not introduce a landing-page feel into app screens. Build the working product surface directly.

## Product Architecture

- App routes live in `src/app/App.tsx`.
- Role shells live in `src/layouts/ConsumerShell.tsx` and `src/layouts/RoleShell.tsx`.
- Consumer screens live under `src/features/user`.
- Companion/provider screens live under `src/features/companion`.
- Shared components live under `src/components`.
- Business IO and local persistence live under `src/services`.
- Domain types live under `src/types`.

When a change crosses these boundaries, keep the UI thin and move reusable business behavior into services or typed helpers.
