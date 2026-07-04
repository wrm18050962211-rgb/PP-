# PP Frontend Patterns

## Product Feel

PP is a mobile-first service marketplace for photo/companion booking. The frontend should feel like a polished app, not a marketing site:

- Dense, direct, task-first screens.
- Photo-led discovery surfaces.
- Black/white contrast with warm off-white app backgrounds.
- Compact cards, compact labels, and high-confidence typography.
- Rounded pills for navigation, search, filters, and primary CTAs.
- Minimal decoration; content, photos, status, and actions carry the design.

## Visual Grammar

Use these recurring values and patterns:

- Page background: `#f7f7f5` for light app pages, `#050505` for immersive discovery/search pages.
- Primary text: near-black `#111111` / `zinc-950`; inverse text on black surfaces.
- Main container: `mx-auto min-h-dvh w-full max-w-md`.
- Bottom spacing: use `pb-24` when a bottom nav is present.
- Floating nav: black translucent pill, `border-white/10`, `backdrop-blur`, strong shadow, icon-only tabs.
- Cards: app cards are usually tight, with radius from `rounded-[2px]` to `rounded-[10px]`; use larger radii mainly for sheets or filter groups.
- Buttons: primary is black/white; secondary is `zinc-100` or white with subtle borders.
- Shadows: use sparingly to separate mobile surfaces, not to create decorative depth.
- Images: use real media through `LivePhotoMedia`; photo surfaces should drive discovery pages.

Existing global helpers in `src/styles/index.css`:

- `.pp-page`: warm light page background.
- `.pp-surface`: elevated white surface with border and shadow.
- `.pp-soft-surface`: simpler white surface.
- `.pp-pill` and `.pp-pill-active`: compact segmented/pill controls.
- `.pp-primary`: black primary CTA.
- `.scrollbar-none`: hidden scrollbar for mobile horizontal tracks.

## Design Tokens To Preserve

Treat PP styling as a small product design system, even before adding a formal token package:

- Color roles: page, surface, inverse surface, primary text, muted text, hairline border, primary action, danger/risk, safe/success.
- Radius scale: tiny media/card corners, medium list sections, full pill controls.
- Spacing scale: tight mobile gutters, compact row gaps, larger sheet padding only where interaction needs breathing room.
- Type scale: dense labels, strong card titles, clear section titles; avoid hero-scale typography inside app workflows.
- Elevation scale: flat list sections, subtle card borders, strong floating nav/sheet shadows.
- Motion scale: fast state transitions, compact chrome transitions, no decorative motion that slows task completion.

When adding a new repeated visual rule, prefer adding one named helper or local constant over scattering unrelated arbitrary values.

## Layout Patterns

### Role Shells

Consumer and companion shells both:

- Render a centered mobile frame.
- Show bottom navigation only on main tab pages.
- Compact the bottom/top chrome on scroll with `requestAnimationFrame`.
- Pass `homeChromeCompact` through outlet context so child pages can hide sticky headers.

When adding a primary tab, update the relevant shell and keep icon-only nav with `aria-label` and `title`.

### Discovery Pages

Discovery surfaces prefer:

- Dark immersive background.
- Fixed top search/filter chrome.
- Masonry or feed layouts with strong image hierarchy.
- Sticky or sheet-based filters instead of large permanent sidebars.
- Active filter badges/counts.
- Empty states that suggest relaxing constraints.

### Settings And Studio Pages

Profile, studio, package, booking, and settings pages prefer:

- Light warm background.
- A dark identity/status header when the page needs account context.
- White list sections with `divide-y`, compact row heights, lucide icons, and right chevrons.
- Clear operational labels: orders, consultations, income, packages, booking settings, service range.

### Sheets And Modals

Use fixed overlays constrained to `max-w-md`:

- Overlay: black translucent backdrop.
- Sheet: white or black surface, full height or bottom modal depending on workflow.
- Header: compact title plus circular close button.
- Footer: two-button grid for reset/confirm when filters or forms need commit.
- Stop propagation on sheet content.

For modal-like components, borrow the headless component mindset: model `open`, `onOpenChange`, trigger/content/close semantics, focus return, outside dismiss, and labelled title/description. Keep the PP visual shell custom, but do not skip the interaction contract.

## Interaction Patterns

- Use touch-first controls: `min-h-10`, `h-11`, `h-12`, or `h-14`.
- Prefer chips, segmented controls, drawers, and range inputs for filters.
- Use `useMemo` for derived lists, grouped results, ranking, and active counts.
- Use `useCallback` when handlers are passed into repeated cards or effects.
- Store local UI history/cache in `localStorage` behind try/catch so private browsing does not break flows.
- Handle browser APIs defensively: geolocation may be unsupported, denied, or fail.
- Preserve accessibility basics: `aria-label`, `aria-expanded`, labels for inputs, and button `type="button"` when inside forms or reusable controls.

## Component Contracts

Reusable components should declare the states a real product will need:

- Visual role: primary, secondary, subtle, danger, ghost, inverse, or media overlay.
- Size: compact, default, large, or full-width, with stable height.
- State: default, hover, active, selected, disabled, loading, empty, error, success.
- Icon placement: icon-only, leading icon, trailing icon; icon-only controls require an accessible label.
- Content constraints: truncation, line clamp, wrapping, min/max width, and image aspect ratio.
- Behavior: controlled vs uncontrolled state, close/dismiss behavior, keyboard/focus behavior, persistence if any.

Do not create a generic component unless at least two screens need it or one screen has a complex repeated pattern.

## Data And State Boundaries

Frontend pages are allowed to coordinate UI state, but durable business behavior should live in services:

- Fetch/list/update data through `src/services/*Service.ts`.
- Keep shared domain shapes in `src/types/api.ts` or `src/types/domain.ts`.
- Keep mock/demo data in `src/data`.
- Use helper functions near the feature when they are purely local ranking/filtering logic.
- Extract to services only when behavior is reused across pages or mirrors backend/API behavior.

For filter-heavy pages:

- Define filter types at the top of the file.
- Keep constants for option labels, sentinel values, and keyword maps.
- Derive `activeFilterCount`.
- Keep normalization and matching helpers pure and named.
- Keep matching/ranking deterministic. Use stable tie-breakers so lists do not jump unexpectedly.
- Put expensive derived lists behind `useMemo`, but do not memoize every small expression.

## Component Extraction

Extract a component when:

- It represents a repeated UI pattern across screens.
- It has its own local interaction state.
- It improves readability of a long page without hiding critical business logic.

Do not over-extract tiny one-off layout fragments if the page remains clearer inline.

Good local component examples:

- Filter drawer/group.
- Result card.
- Budget range row.
- Sheet header.
- Menu section.

Good shared component examples:

- `LivePhotoMedia` for image/video media display.
- Booking selectors and summaries under `src/components/booking`.
- Small chips or loading affordances used across multiple screens.

## Quality Gates From Mature Frontend Projects

Borrow these habits from high-star frontend repositories when the change is large enough:

- Separate checks: lint, typecheck, unit/component tests, build, and browser/e2e checks should be separate mental gates even if PP currently has only `npm.cmd run build`.
- Add component states before styling details are considered done: loading, empty, disabled, selected, overflow, and error.
- Prefer composition over prop explosion for complex surfaces, but use explicit variant props for small reusable controls.
- Use accessible primitives or copy their behavior for dialogs, popovers, dropdowns, tabs, tooltips, and icon-only actions.
- Keep product UI code close to the domain, but move reusable IO and durable business rules into services.
- Keep import/dependency choices boring. Do not add a new UI framework when PP's Tailwind/lucide/custom component stack is enough.
- Use screenshot or browser checks for layout changes that involve fixed headers, bottom nav, image grids, sheets, or mobile overflow.

## Copy And Terminology

Use product language consistently:

- Consumer side: discovery, photographer/companion search, checkout, orders, messages, mine, likes/favorites/following.
- Companion side: consultations, orders, income, profile, packages, booking settings, service range, publish, studio.
- Booking: deposit, final payment, add-ons, duration, slots, location, service area.
- Moderation/risk: safe, risk, status, audit language should stay precise and calm.

Keep copy short. App screens should not explain themselves like documentation.

## Validation Checklist

For every frontend change:

- Inspect nearby files for matching patterns.
- Check mobile width behavior mentally or with browser when layout changes.
- Confirm text truncates or wraps intentionally.
- Confirm bottom nav and fixed headers do not cover content.
- Confirm dark/light surfaces have enough contrast.
- Confirm route links use the correct role base path.
- Confirm service/data changes remain typed.
- Confirm icon-only controls have labels/tooltips.
- Confirm loading/empty/error states are not visually louder than the main workflow.

For non-trivial frontend changes, run:

```powershell
npm.cmd run build
```

from `pp-app`.
