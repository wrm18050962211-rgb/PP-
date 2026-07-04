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

## Interaction Patterns

- Use touch-first controls: `min-h-10`, `h-11`, `h-12`, or `h-14`.
- Prefer chips, segmented controls, drawers, and range inputs for filters.
- Use `useMemo` for derived lists, grouped results, ranking, and active counts.
- Use `useCallback` when handlers are passed into repeated cards or effects.
- Store local UI history/cache in `localStorage` behind try/catch so private browsing does not break flows.
- Handle browser APIs defensively: geolocation may be unsupported, denied, or fail.
- Preserve accessibility basics: `aria-label`, `aria-expanded`, labels for inputs, and button `type="button"` when inside forms or reusable controls.

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

For non-trivial frontend changes, run:

```powershell
npm.cmd run build
```

from `pp-app`.
