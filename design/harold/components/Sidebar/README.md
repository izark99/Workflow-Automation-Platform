# Sidebar

The left navigation of every laptop webapp: 240px wide, a glass panel (`surface-200`), brand at the top, grouped NavItems, user at the bottom.

## Props

- `brand` (app name), `sections`: `{ title?, items: { value, label, icon, badge? }[] }[]`, `value`, `onChange(value)`, `footer`.

## Rules

- At most 8 top-level items; group the rest under uppercase `caption` section titles.
- The same Sidebar on every page and tab; never hide it on laptop widths.
