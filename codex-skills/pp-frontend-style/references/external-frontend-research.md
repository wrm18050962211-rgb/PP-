# External Frontend Research

Use this file when improving `pp-frontend-style` or comparing PP against mature frontend repositories. Do not load it for ordinary feature edits unless the user asks for external benchmarking.

## Research Scope

Reviewed 68 high-star frontend, React, design-system, component-library, mobile UI, and AI design-skill repositories through GitHub metadata, package scripts/dependencies, README/project pages, and representative component source where useful.

AI/design-skill references:

- `nextlevelbuilder/ui-ux-pro-max-skill`: useful for structuring design guidance into industry fit, style, colors, typography, effects, anti-patterns, and pre-delivery checks. Too broad for PP; borrow the structure, not the huge style catalogue.
- `Leonxlnx/taste-skill`: useful for redesign-audit workflow, density/motion/variance dials, and anti-generic checks. Too greenfield/marketing-oriented for PP; borrow the audit lens.
- `VoltAgent/awesome-design-md`: useful idea: keep a project-level design file that agents can follow. For PP, `pp-frontend-style` plus references plays that role.
- `thedaviddias/Front-End-Checklist`: useful for launch-quality categories: accessibility, performance, SEO, security, metadata, images, and browser checks. For PP app work, borrow accessibility/performance/image checks first.

High-star frontend/application projects sampled:

- `freeCodeCamp/freeCodeCamp`
- `react/react`
- `vuejs/vue`
- `langgenius/dify`
- `vercel/next.js`
- `react/react-native`
- `supabase/supabase`
- `ChatGPTNextWeb/NextChat`
- `vitejs/vite`
- `apache/superset`
- `facebook/docusaurus`
- `appwrite/appwrite`
- `gatsbyjs/gatsby`
- `FlowiseAI/Flowise`
- `makeplane/plane`
- `twentyhq/twenty`
- `expo/expo`
- `tldraw/tldraw`
- `calcom/cal.com`
- `payloadcms/payload`
- `appsmithorg/appsmith`
- `CorentinTh/it-tools`
- `outline/outline`
- `amruthpillai/reactive-resume`
- `novuhq/novu`
- `ant-design/ant-design-pro`
- `mattermost/mattermost`
- `drawdb-io/drawdb`
- `NervJS/taro`
- `desktop/desktop`
- `withastro/astro`
- `remix-run/remix`
- `angular/angular`
- `sveltejs/svelte`
- `nuxt/nuxt`

Libraries and state/tooling references sampled:

- `pmndrs/zustand`
- `TanStack/query`
- `typescript-cheatsheets/react`
- `styled-components/styled-components`
- `trpc/trpc`
- `preactjs/preact`
- `ueberdosis/tiptap`
- `xyflow/xyflow`

Design-system/component-library references sampled:

- `shadcn-ui/ui`
- `ant-design/ant-design`
- `mui/material-ui`
- `tailwindlabs/tailwindcss`
- `storybookjs/storybook`
- `ionic-team/ionic-framework`
- `DavidHDev/react-bits`
- `saadeghi/daisyui`
- `vuetifyjs/vuetify`
- `chakra-ui/chakra-ui`
- `Shopify/polaris`
- `carbon-design-system/carbon`
- `primer/react`
- `radix-ui/primitives`
- `mantinedev/mantine`
- `semi-design/semi-design`
- `arco-design/arco-design`
- `adobe/react-spectrum`
- `microsoft/fluentui`
- `element-plus/element-plus`
- `Tencent/tdesign`
- `youzan/vant`
- `unovue/reka-ui`
- `unovue/shadcn-vue`
- `heroui-inc/heroui`

## Common Engineering Patterns Worth Borrowing

1. Separate quality gates.
   Mature projects usually expose separate scripts or mental checkpoints for build, lint, typecheck, tests, formatting, docs/storybook, and browser/e2e validation. PP can keep the toolchain small, but the skill should always ask which gate proves the change.

2. Treat accessibility as a component API.
   Radix-style primitives model trigger/content/close, focus return, aria links, outside dismiss, scroll locking, and controlled/uncontrolled state. Carbon-style buttons require labels for icon-only buttons. PP should encode those expectations for sheets, dialogs, nav icons, filter drawers, and icon-only CTAs.

3. Make variants explicit.
   MUI, Carbon, Chakra, Ant, Fluent, and Primer all treat size, tone/kind, icon placement, full width, disabled, selected, loading, and danger states as first-class. PP should do this for reusable controls, but avoid building a full generic design system before reuse exists.

4. Keep design tokens practical.
   Design systems distinguish color roles, size scales, radius scales, spacing, typography, elevation, motion, and component state tokens. PP should maintain lightweight tokens/classes in CSS or local constants rather than importing a large token framework.

5. Prefer headless behavior plus custom visual language.
   Radix, React Spectrum, and shadcn show the value of accessible behavior primitives with project-specific styling. PP should preserve its own black/off-white mobile style, while copying robust behavior contracts.

6. Use composition for complex surfaces.
   Dialogs, drawers, menus, tables, rich editors, canvases, and booking flows should be composed from named subparts. Simple buttons/chips can use explicit variant props.

7. Keep app domain boundaries visible.
   Strong apps separate pages/features from services/types/data. PP already does this with `features`, `services`, `types`, and `data`; the skill should protect that boundary.

8. Validate real UI states.
   The best component libraries test or document default, hover, focus, active, disabled, loading, selected, danger, empty, overflow, and responsive states. PP should explicitly review these states when changing a reusable component or dense mobile screen.

9. Browser-level verification matters for layout.
   Storybook, Playwright, Cypress, visual snapshots, or browser previews appear repeatedly in mature UI repos. PP may not need all of them now, but fixed nav, sheets, image grids, and mobile overflow deserve browser/screenshot checks when changed.

10. Avoid generic AI aesthetics.
   AI design-skill repos often push style catalogues, motion, gradients, and landing-page polish. PP is an operational marketplace app; borrow their anti-pattern and preflight structures, but keep the UI restrained, mobile, dense, and product-first.

## PP-Specific Filtering

Adopt:

- Explicit state contracts for reusable components.
- A lightweight design-token vocabulary.
- Strong accessibility requirements for icon-only and overlay UI.
- Quality gates chosen by risk.
- Browser/screenshot checks for mobile layout and fixed chrome.
- External benchmarking only when it improves the PP product surface.

Reject:

- Huge generic style catalogues.
- One-off visual novelty.
- Decorative motion and gradient-heavy AI/SaaS tropes.
- Introducing a full component framework over the existing Tailwind/lucide stack.
- Abstracting every local component into shared UI before reuse exists.
- Desktop dashboard density rules on mobile-first consumer/companion flows unless the surface is admin/ops.
