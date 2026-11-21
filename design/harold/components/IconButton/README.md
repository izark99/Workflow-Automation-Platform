# IconButton

A square button with one icon. Always pass `label`: it becomes the accessible name and the tooltip shown after 400ms hover or on keyboard focus.

## Props

- `icon` (required), `label` (required).
- `variant`: `ghost` (default), `secondary`, `primary`, `danger`.
- `size`: `sm` 32px, `md` 40px, `lg` 48px (use `lg` on mobile for the 44px touch target).
- `tooltip={false}` turns the tooltip off (when the label is visible next to it).

## Rules

- All variants share one box: 32, 40 or 48px square, and none has an outline: primary is Spatial blue, secondary is `neutral-fill`, ghost is transparent until hover. A border would make one variant read larger than the others.
- Do not mix variants inside one group: a ghost button has no visible edge and reads smaller next to an outlined or filled one. Toolbars and table rows use ghost only; standalone actions next to text Buttons use secondary.

- Only for actions whose icon is unambiguous (edit, delete, close, more). Anything else gets a text Button.
- Group related icon buttons with `space-1` gaps in table rows and toolbars.
