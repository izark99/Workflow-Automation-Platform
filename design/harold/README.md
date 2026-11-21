One Spatial system for everything Harold builds: glass panels floating over a soft blue scene, in the style of visionOS. slide decks, documents and graphics, laptop webapps (HR-System, Data Flow, Budget planner) and mobile apps. It is built for HR and data work: dense tables and charts must stay calm and readable, and every surface must render Vietnamese diacritics correctly.

## Principles

- **Depth from glass, not decoration.** Content sits on translucent panels (`surface-200` with blur) over a dark blue scene. Depth comes from blur, a lit top edge and a soft shadow, never from extra colors or gradients on components.
- **One blue, one ember.** Spatial blue (`primary`) marks what to act on; Ember (`accent`, a warm coral) appears at most once per screen or slide, like the lamp glow in a room.
- **Data first.** Numbers, tables and charts are the content. Glass must never lower their contrast.
- **Soft geometry, plain type.** Large radii (up to 32px) and generous spacing; the type stays one clean sans family.
- **Same system, every surface.** A KPI tile on a slide and on a dashboard uses the same tokens and type styles.

## Content fundamentals

- Default UI language is the language of the audience: Vietnamese for DHG-internal decks and reports, English for app UI unless the product says otherwise. Do not mix languages inside one sentence of UI copy; HR/tech terms (OT, KPI, headcount) may stay in English.
- Sentence case everywhere: buttons, titles, menu items ("Tạo luồng mới", "Export report"). Only `caption` may be uppercase.
- Address the reader directly and plainly. Buttons are verbs: "Lưu", "Chạy flow", "Export". No exclamation marks in UI.
- Numbers: Vietnamese format in Vietnamese content (`3.024`, `12,5%`, `20/11/2026`); English format in English content. Always state the unit and period ("Chi phí lương, tỷ VNĐ, Q3/2026").
- No emoji in UI, slides or reports. No filler stats or invented numbers in examples; use real or clearly sample data.

## Color

- Scene: `scene-100` and `scene-200` plus the two glows (`scene-glow-blue`, `scene-glow-warm`) form the page background. It is the only gradient in the system; use the `hd-scene` class or `body`. Never put the gradient on a component, button or text.
- Glass: `surface-200` (panel) over the scene, `surface-300` (inset tint) inside a panel, `surface-overlay` (nearly opaque) for anything that floats: menus, selects, date pickers, dialogs, sheets, toasts and sticky table headers.
- Text: `ink` for primary text, `ink-muted` for secondary. Both pass 4.5:1 on the scene, on panels (over the lightest part of the scene) and on tints, in both themes. Never set body text in `primary-text` or `accent`; links and active states only.
- Blue has two tokens. `primary` is a fill (buttons, switch on, checked boxes, selected day) and carries `on-primary` text. `primary-text` is blue as text or line (links, active nav, selected tab, focus ring); it is lighter on dark and passes 4.5:1 where `primary` would not.
- Ember: `accent` for one callout per screen or slide, or the comparison series. Never use it to mean warning or error.
- Tints: `primary-soft` and `accent-soft` for selected rows, the active nav item and callouts, with `ink` or the matching text color.
- Status: `success`, `warning`, `danger`, `info` always come with a word or an icon. Success and danger must never be told apart by color alone. A danger fill uses `on-danger` text.
- Lines: `border` is a decorative hairline on glass edges; `border-strong` (55% white or ink) for anything a user must see to operate (input outlines, checkbox boxes).
- Buttons are solid shapes with no outline: `primary` fill, `neutral-fill` for secondary, transparent for ghost, so every variant reads the same size.
- Themes: dark is the default (Spatial dark). Light ("frosted light", white glass on a pale blue scene) is for slides, printed reports and daytime use. Both pass the same contrast targets.

## Glass rules

- Every glass panel is: translucent fill + `blur-md` (24px) + `saturate(1.5)` + 1px `border` + `shadow-sm` (includes the lit top edge). Dialogs and sheets use `surface-overlay`, `radius-xl` and `shadow-lg`.
- Glass always sits on the scene. Contrast is only guaranteed over the scene colors. If you put glass over a photo or video, add a `scrim` layer under the panel and re-check text contrast; do not rely on blur alone.
- At most two glass layers deep (page, panel, floating layer). A panel inside a panel uses the inset tint (`surface-300`, or `Card inset`), not a second blur.
- Dense data (tables, forms) may use `surface-overlay` instead of `surface-200` when the reader must work for long periods; glass is for orientation, not for reading 500 rows.
- Fallbacks are built in: without `backdrop-filter` support, and under `prefers-reduced-transparency`, panels switch to `surface-overlay` with no blur.
- Performance: blur is costly on weak phones. Limit to about 6 blurred surfaces per screen, never animate a blurred element's size, and keep large scrolling lists on `transparent` rows inside one panel.

## Charts

- Pick the chart by the question: trend → line, comparison → bar (horizontal when labels are long Vietnamese department names), part of whole with 5 or fewer parts → stacked bar or donut. No pie charts with more than 5 slices; no 3D.
- Series order: `chart-1` (blue, the story), `chart-2` (Ember, comparison or baseline), then `chart-3`, `chart-4`, `chart-5`. Use `chart-5` for "Other" and for bars you are not highlighting.
- Highlight pattern for slides: one bar or line in `chart-1`, everything else in `chart-5`.
- More than five series: group into "Other" or split into small multiples.
- Label values directly when there are few points; otherwise keep the legend next to the chart. State the time grain (day, week, month) on the axis.
- Axis labels and sources in `caption`, `ink-muted`. Gridlines in `border`, horizontal only. Chart containers are glass cards; bars and lines are solid colors, never glass.
- Every chart has a one-line takeaway title ("OT tháng 10 vượt hạn mức ở 3 phòng") and, in apps, a table view of the same data.
- Loading: a skeleton of the chart's shape, never an empty axis. Empty: a sentence saying why there is no data and what to do.

## Typography

- Two families, both with full Vietnamese support: `sans` (Be Vietnam Pro) for everything from slide titles to captions, `mono` (JetBrains Mono) for formulas, IDs and code.
- Load from Google Fonts: `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap`.
- Hierarchy comes from size and weight: 700 for `display-xl` and `display`, 600 for headings and `kpi`, 500 for `label` and `caption`, 400 for text. Do not use weights below 400.
- `display-xl` and `display` only on slides, hero areas and section title slides. App pages start at `h1`.
- Line heights are at least 1.2 for display and 1.5 for text, so stacked Vietnamese marks (Ể, Ỗ, ẫ) never clip or touch the line above. Do not tighten them.
- Default text is `body` (16px). `small` (14px) only for dense tables on laptop. Nothing smaller than `caption` (12px).
- Any number in a table, KPI tile or changing value uses tabular figures: `font-variant-numeric: tabular-nums`. Right-align numeric columns.
- Keep reading text to 60–75 characters per line on desktop.
- Slides (1920 × 1080 canvas): scale every style by 1.5 (`body-lg` becomes 27px, `display-xl` 84px). Keep line-height ratios.

## Spacing and layout

- 4px base. Use only `space-1` to `space-8`; no in-between values.
- Card padding `space-5` on desktop, `space-4` on mobile. Gap between cards `space-5`.
- Controls use fixed heights: `control-md` (40px) on laptop, `control-sm` (32px) only in dense toolbars and table rows, `control-lg` (48px) on mobile. Buttons, inputs and selects in one row share the same height.
- Webapp (laptop, 1280–1440px): 240px glass sidebar (`surface-200`), content max width 1200px, page margin `space-7`. The same page skeleton on every tab.
- Mobile app: `space-4` side margins, touch targets at least 44 × 44px with `space-2` between them, bottom navigation with 5 items at most.
- Slides: safe margin 72px at 1920 wide; one message per slide; the takeaway is the title.

## Shape, borders and elevation

- Corners: `radius-md` (14) for controls, `radius-lg` (22) for cards, `radius-xl` (32) for the outer window, dialogs, sheets and slide image frames, `radius-full` for pills and avatars.
- Elevation is three steps: `shadow-sm` for resting panels, `shadow-md` for menus and hovered cards, `shadow-lg` for dialogs, sheets and toasts. Each includes an inset 1px highlight on the top edge; do not add your own.
- Blur steps: `blur-sm` 12px (scrim), `blur-md` 24px (default), `blur-lg` 40px (hero panels).

## States and focus

- Hover: fills move to `primary-hover`; neutral rows and ghost buttons get `neutral-fill`. Every clickable element shows a pointer cursor.
- Focus: a 2px solid `primary-text` ring with a 2px gap in the scene color, on every interactive element. It holds 3:1 on all surfaces in both themes. Never remove it.
- Disabled: 40% opacity on the whole control, no color change, cursor not-allowed.
- Loading: skeleton blocks in `surface-300` with a soft shimmer that keep the final layout, `radius-sm` corners. Spinners only inside a button that is working.
- Errors: show the message under the field it belongs to, in `danger` with an icon, saying what to fix.
- All controls (dropdown, date picker, checkbox) are custom-built to these tokens; do not ship browser-native styling.

## Motion

- 120ms for hover, press and toggles; 200ms for menus and popovers; 260ms for dialogs and sheets. Closing runs at about two thirds of opening (popover 120ms, dialog 170ms). Ease-out on enter, ease-in on exit.
- Animate only opacity and transform, never width, height or layout.
- Respect `prefers-reduced-motion`: drop movement and keep short opacity fades only. Charts draw without entrance animation in that mode.
- No bouncing, no parallax, no motion on slides except a simple fade between builds.

## Avoid

These patterns make work look machine-made or dated. Do not use them unless a real brand source requires it:

- Any gradient except the scene; gradient text; glow around components; neumorphism.
- Glass on glass on glass: more than two blurred layers, or blurred panels over busy photos without a scrim.
- Tiny, faint labels (below 12px or under 4.5:1) for the sake of an airy look.
- Cards with a colored left-border stripe.
- Emoji as icons or bullets; icons in colored circles above every card title.
- Rows of three identical feature cards with an icon, a bold title and one line of text.
- Oversized hero numbers with no unit or period; vanity stats.
- Everything centered; every section the same height; every heading in Title Case.
- Words like "seamless", "unlock", "empower", "supercharge" in UI or slide copy.

## Iconography

- Icons are the 47 Lucide icons (v0.460.0) in the Icons asset group. In code use `Harold.Icon` (draws in `currentColor`); in slides and design tools use the SVG files and recolor the stroke.
- Stroke 1.75 at 20px and above, 2 at 16px. Sizes: 16px in dense UI, 20px default, 24px on mobile and slides.
- Icon-only buttons always carry an accessible label and a tooltip (IconButton does both).
- Need a new icon: take it from Lucide v0.460.0 so stroke and corners match.
- No custom logo exists yet: set the name "Harold" (or the app name) in `sans` at weight 700 as a wordmark next to a `radius-sm` blue square. Do not draw a logo mark.

## Components

- The components are React 18 function components in `components/bundle.js`, exposed as `window.Harold` (`Harold.Button`, `Harold.Table`...), styled by `components/bundle.css` on top of the tokens. Types and props are in `components/index.d.ts`; each component's guidelines are in `components/<Name>/README.md`.
- Every class is prefixed `hd-`. Never restyle a component with raw hex values; change tokens instead.
- Laptop webapps: Sidebar + TopBar + content, as in `DashboardPage`. Mobile apps: AppBar + content + BottomNav, Sheet instead of Dialog, ListItem instead of Table, as in `MobileScreen`.
- All controls are custom (Select, DatePicker, Checkbox, Switch), keyboard operable, with a visible focus ring.
- Loading: every async region renders Skeleton blocks in the final layout (Table `loading`, KpiTile `loading`), then fades content in with `hd-fade-in`. Spinners appear only inside a Button that is working.
- Motion classes and timings live in `bundle.css` (`--hd-fast` 120ms, `--hd-base` 200ms, `--hd-slow` 260ms, `--hd-exit` 170ms). Under `prefers-reduced-motion` movement is replaced by fades and shimmer stops.
