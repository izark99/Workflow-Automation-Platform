# ProgressBar

Progress toward a limit or a task. Without `value` it is indeterminate (a sliding bar).

## Props

- `value`, `max` (default 100), `label`, `valueLabel` (formatted text on the right, e.g. "31 / 40 giờ").

## Rules

- Over the max, the bar turns `danger` and stays full; say so in `valueLabel` as well.
- Width changes animate over 260ms. The indeterminate slide stops under reduced motion.
