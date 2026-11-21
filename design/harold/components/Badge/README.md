# Badge

A short status or count label. Status tones (`success`, `warning`, `danger`, `info`) carry an icon automatically so meaning never relies on color.

## Props

- `tone`: `neutral` (default), `primary`, `accent`, `success`, `warning`, `danger`, `info`.
- `dot`: a small dot instead of the icon (for `primary` "active" states). `icon`: override, or `false` to hide.

## Rules

- One to three words, sentence case. Not clickable: for filters use Chip.
- `accent` (Ember) only for "new" or a single highlight per view.
