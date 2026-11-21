# Menu

A dropdown list of actions behind a trigger, usually the "more" IconButton at the end of a table row or card header.

## Props

- `items`: array of `{ label, icon?, shortcut?, danger?, disabled?, onSelect? }` or the string `"separator"`.
- `trigger`: optional element (a Button) to open the menu; defaults to an `ellipsis` IconButton labelled by `label`.
- `align`: `"end"` (default, opens leftward from the trigger) or `"start"`.
- `defaultOpen`: for demos.

## Behaviour

- Arrow keys move, Enter or Space runs, Escape and Tab close and return focus to the trigger. Click outside closes.
- Opens in 200ms (fade + 4px drop + 0.98 scale), closes in 120ms.
- Put destructive items last, after a separator, with `danger`.
