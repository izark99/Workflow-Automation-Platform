// The default texts (SPEC 11.3). Keys are flat and dotted; the first segment is the screen (see KEY_PREFIXES in catalog.ts).
// A text never holds a function: dynamic values are `{name}` placeholders, formatted by the caller and passed in.
export const en = {
  'app.brand': 'Data Flow',
  'common.infoTip.about': 'About {label}',
} as const;

export type MessageKey = keyof typeof en;
