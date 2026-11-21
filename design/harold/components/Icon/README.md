# Icon

The icon set: 47 Lucide icons (v0.460.0, ISC license) chosen for HR and data apps. `Harold.Icon.names` lists them; the same icons are in the Icons asset group as SVG files for slides and design tools.

## Props

- `name`, `size` (16 dense, 20 default, 24 mobile and slides), `strokeWidth` (default 2 at 16px and below, 1.75 above), `label` (only for icons that carry meaning without text), `spin`.

## Rules

- Icons draw in `currentColor`; color them by setting text color on the parent.
- Decorative icons are hidden from screen readers automatically. Icon-only buttons use IconButton with a `label`.
- Need an icon that is not here: take it from Lucide v0.460.0 so stroke and corners match, and add it to the set.
