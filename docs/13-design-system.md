# 13 — Design System

## 1. Design Principles

* **Functional Clarity & Information Density:** Designed for complex operational workflows (multi-criteria rubric scoring, statistical Z-score matrices, team rosters, and immutable audit logs) with high readability.
* **Developer-Centric & Modern Aesthetics:** Clean, utility-focused interface reflecting Hackathon Raptors' low-dependency, high-craft engineering philosophy.
* **Operational Transparency:** Unambiguous status indicators for platform lifecycle states (`Draft` vs. `Submitted`, UTC Hard Deadline Lock, 5-Level RBAC Role Badges, and Z-Score Normalization status).
* **100% Local & Air-Gapped Compliance:** All UI assets, icons, and typography must be bundled locally with zero reliance on remote CDNs, web fonts, or external SaaS UI libraries.

---

## 2. Color System

> No official color values found in the available sources.

---

## 3. Typography

* **Font Family:**
  * **Interface Font:** System sans-serif font stack (e.g., `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) for general UI, navigation, and dashboard forms.
  * **Monospace Font:** System monospace font stack (e.g., `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) for repository links, commit IDs, UTC timestamps, `.dogfood.toml` files, database queries, and score normalization mathematical formulas.
* **Heading Styles:** Hierarchical heading structure (H1 through H4) used to organize competition tracks, project galleries, rubric criteria, and administrative panels.
* **Body Styles:** Readable body text styles for project descriptions, rubric guidelines, and audit log entries.
* **Font Sizes, Weights, Line Heights, Letter Spacing:** Not specified in available sources.

---

## 4. Spacing & Layout

* **Spacing Scale:** Not specified in available sources.
* **Container Widths:** Responsive full-width and container-constrained layouts optimized for data-dense tables (score matrices, audit trails, CSV exports).
* **Grid / Layout Rules:** Multi-column responsive grid for public project galleries; structured multi-section form layouts for rubric evaluation sheets.
* **Padding, Margins, Border Radius, Responsive Breakpoints:** Not specified in available sources.

---

## 5. Components

* **Role Badge Component:**
  * *Purpose:* Visually identifies the active user's role across the 5 RBAC tiers (`Visitor`, `Participant`, `Judge`, `Organizer`, `Admin`).
  * *States:* Default, Active role indicator.
* **UTC Hard Deadline Banner / Real-Time Clock:**
  * *Purpose:* Displays real-time countdown to server UTC submission deadline.
  * *States:* Active (countdown active), Warning (closing soon), Locked (red post-deadline locked banner rejecting updates).
* **Team Invite & Roster Card:**
  * *Purpose:* Displays team membership (enforcing 1 to 4 members) and join link share controls.
  * *States:* Empty (single member), Active roster, Full (4/4 members), Closed.
* **Project Gallery Card / Tile:**
  * *Purpose:* Displays project title, track badge, team name, GitHub repository link, demo media, and status badge (`Draft` or `Submitted`).
  * *Variants:* Public view, Participant draft edit view.
* **Multi-Criteria Rubric Scoring Sheet:**
  * *Purpose:* Form component allowing judges to score assigned entries across weighted criteria.
  * *Elements:* Criteria criteria titles, weight percentages, numerical score inputs/sliders, and text feedback fields.
* **Z-Score Normalization Status Table:**
  * *Purpose:* Tabular view for organizers displaying raw judge scores alongside Z-score normalized results and Min-Max fallback indicators for $N_j < 5$.
* **Anti-Sybil Voting Card:**
  * *Purpose:* Community choice voting interface with rate-limiting feedback and hidden real-time tallies during active voting windows.
* **Acceptance Test Suite Log Console:**
  * *Purpose:* Monospace log viewer rendering `acceptance-report.txt` output and `.dogfood.toml` tier validation status.

---

## 6. Interaction States

* **Default:** Standard interactive visual state for buttons, inputs, and tiles.
* **Hover:** Visual elevation or background color shift indicating clickability.
* **Focus:** High-contrast outline for keyboard focus accessibility.
* **Active:** Pressed state for buttons, tab switches, and form actions.
* **Disabled:** Faded opacity and non-interactive cursor for locked controls (e.g., project submission form after server UTC deadline lock).
* **Loading:** Activity spinner or skeleton pulse during database queries, auto-seeding routines, or CSV exports.
* **Error:** Distinct error styling (red border and message) on submission failure, post-deadline lock rejection, or 401/403 authorization blocks.
* **Success:** Green confirmation toast/badge on successful draft save, team join, or score ballot lock.

---

## 7. Icons & Visual Assets

* **Icon Style:** Clean, functional line/outline icons for navigation, links, role tags, and search.
* **Icon Library:** Not specified in available sources (must be locally hosted/bundled).
* **Illustration Style:** Minimalist, utility-driven UI assets without heavy graphics to guarantee air-gapped performance.
* **Image Requirements:** Responsive image container for project screenshots and architecture diagrams.
* **Logo Guidelines:** Hackathon Raptors and Dogfood 2026 header branding assets.
* **Asset Guidelines:** 100% locally bundled assets; zero remote CDN dependencies.

---

## 8. Responsive Design

* **Supported Platforms:** Desktop, Tablet, and Mobile web browsers.
* **Breakpoints:** Not specified in available sources.
* **Mobile Behavior:** Single-column stacked layouts for public project gallery, team invite cards, and rubric scoring forms; collapsible top navigation menu.
* **Desktop Behavior:** Multi-column dashboard grids, side-by-side pairwise comparison panels (Bradley-Terry mode), and full data tables for normalization matrices and audit logs.
* **Component Adaptation:** Data tables collapse into key-value stacked cards on narrow viewports.

---

## 9. Accessibility

* **Color Contrast:** Not specified in available sources (recommended high contrast for text readability).
* **Focus States:** Explicit visible focus indicators required for all interactive form inputs and buttons.
* **Keyboard Navigation:** Full keyboard tab-stop navigation across registration forms, rubric sliders, team invites, and gallery search filters.
* **Text Readability:** Readable typography with distinct monospace formatting for technical code links and timestamps.
* **Accessible Controls:** Semantic HTML form controls (`<input>`, `<select>`, `<button>`) for screen reader compatibility.

---

## 10. Design Tokens

```text
colors.* = Not specified in available sources
typography.family.sans = system-ui, -apple-system, sans-serif
typography.family.mono = ui-monospace, SFMono-Regular, monospace
spacing.* = Not specified in available sources
radius.* = Not specified in available sources
shadows.* = Not specified in available sources
breakpoints.* = Not specified in available sources
```

---

## 11. Agent Design Rules

* **Reuse Existing Components:** Standardize UI implementation around shared Role Badges, UTC Deadline Clocks, Rubric Cards, and Data Tables.
* **100% Local Asset Bundling:** Never introduce external CDN links, remote fonts, or web-hosted icon packs (violates air-gapped offline constraints).
* **Unambiguous State Feedback:** Display clear visual feedback for server UTC deadline locks, RBAC authorization blocks, and post-deadline form locks.
* **Monospace Formatting for Technical Metadata:** Consistently use monospace typography for repository URLs, commit hashes, `.dogfood.toml` keys, UTC timestamps, and Z-score math parameters.
* **Clean & Semantic HTML:** Prefer semantic HTML elements (`<main>`, `<nav>`, `<section>`, `<article>`, `<form>`) over custom nested div structures.

---

## 12. Design System Checklist

### MUST
* [ ] Bundle 100% of UI assets and fonts locally (zero remote CDNs)
* [ ] Follow established component patterns (Role Badges, Rubric Sheets, Deadline Clocks)
* [ ] Maintain visual role consistency across all 5 RBAC tiers
* [ ] Provide clear visual feedback for UTC hard deadline locks and error states
* [ ] Support full keyboard navigation and semantic form controls

### SHOULD
* [ ] Reuse UI components across participant dashboards, judge sheets, and public gallery
* [ ] Maintain responsive grid layouts across mobile, tablet, and desktop viewports

### UNKNOWN
* [ ] Official hex color values
* [ ] Exact pixel spacing scale and container width numbers
* [ ] Official icon library family

---

## 13. Implemented Design System (resolved values)

The UNKNOWNs above are now decided and implemented in `src/web/src/styles/` and `src/web/src/ui/`.

| Token family | Implementation |
| :--- | :--- |
| **Colour** | Generated by `scripts/generate-theme.mjs` with `@material/material-color-utilities` (2025 spec, `SchemeVibrant`, seed **#6750FF**). Light primary `#543DE0`, secondary `#6747B0`, tertiary `#99366C`; dark primary `#ACA3FF`, secondary `#B190FE`, tertiary `#FF9ECB`. Custom *success* (`#1E8E3E`) and *warning* (`#E8A317`) roles are harmonized to the seed. All roles are CSS variables (`--md-*`), switched by `prefers-color-scheme` or the user's `data-theme` choice. |
| **Type** | Google Sans Flex (variable weight + `ROND` roundness axis, self-hosted via fontsource, ~70 KB Latin) and JetBrains Mono. Full M3 scale as utilities (`type-display-lg` … `type-label-sm`); `type-emphasized` raises weight to 720 and roundness to 100 for Expressive headings. |
| **Shape** | Corner scale `xs 4 · sm 8 · md 12 · lg 16 · lg+ 20 · xl 28 · xl+ 32 · 2xl 48 · full`. Buttons morph their corner radius on press. The M3 Expressive shape library (cookie, clover, burst, soft-burst, flower, gem, pentagon, sunny, pill, arch …) is generated procedurally as SVG paths (`ui/Shape.tsx`) for avatars, medals, hero art and empty states. |
| **Motion** | Emphasized / decelerate / accelerate cubic-béziers plus spring curves as CSS `linear()` easings (`--ease-spring-fast`, `--ease-spring-default`); everything respects `prefers-reduced-motion`. |
| **Elevation & states** | Tonal surfaces (`surface-container-lowest` … `highest`), 5 shadow levels, state layers (hover 8 %, focus/press 10–12 %) and a 3 px focus ring on every interactive element. |
| **Layout** | Window-size classes as Tailwind breakpoints: compact < 600 px, `medium` ≥ 840 px (navigation rail replaces the bottom bar), `expanded` ≥ 1200 px (two-pane layouts), `large` ≥ 1600 px. Every responsive grid has a `minmax(0, 1fr)` base track so content can never widen the page. |
| **Icons** | Material Symbols Rounded (weight 400), outlined + filled variants, compiled into an SVG subset of only the ~140 icons used (`scripts/generate-icons.mjs`). |
| **Data viz** | Dependency-free SVG charts (`components/charts`) drawn at true pixel size (1 unit = 1 px), thin marks with 4 px rounded data ends, hairline grids, text in text tokens, keyboard-focusable marks with tooltips, diverging cool/warm pair for judge bias. |

### Component inventory (`src/web/src/ui`)
Buttons (filled, tonal, outlined, text, elevated; sizes xs–lg; icon buttons; FAB; connected button groups as radio groups), chips (filter/assist/input), pills, text fields and text areas with counters and field errors, selects, switches, checkboxes, rubric sliders with live value, tabs (roving tabindex), dialogs (native `<dialog>`), menus, toasts, linear/wavy progress, progress ring, the M3 Expressive loading indicator, skeletons, cards (filled/elevated/outlined/primary), banners, empty and error states, stat tiles, avatars and role badges, generated cover art.
