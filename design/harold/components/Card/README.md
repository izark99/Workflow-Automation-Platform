# Card

The container for one unit of content on a dashboard or list: a title row with optional subtitle and actions, then a body.

## Props

- `title`, `subtitle` (unit and period), `actions` (a Menu or small Button), `flat` (no shadow), `inset` (no glass: a quiet tinted tile for use inside another card), `interactive` (whole card is a link: hover lift and focus ring), `bodyStyle`.

## Rules

- `radius-lg`, `space-5` padding on laptop, `space-4` on mobile, `shadow-sm` at rest.
- Do not nest cards. Do not add colored top or left stripes.
