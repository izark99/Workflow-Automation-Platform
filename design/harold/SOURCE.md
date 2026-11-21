# Harold design system: snapshot

Reference only, like `design/screens/`. Nothing under `src/` imports these files and the build never edits them.

- Source: the design system "Harold" (Spatial), a private claude.ai design-system artifact owned by Harold, version `1795182645-befe`, last changed 2026-11-20 (`lastChange` note: "Restyled the whole system to Spatial").
- Copied on 2026-11-21: `README.md` (the brand book), `tokens.json`, `components/<Name>/README.md`, `components/bundle.css`, `components/bundle.js`, `components/index.d.ts`, `assets/Icons/README.md`.
- Not copied: the 47 Lucide icon files (their path data is inside `components/bundle.js`), the live previews, the generated files of the design-system type.
- The components are React 18 and use the `hd-` class prefix. The app is React 19 with CSS modules, so the app rebuilds the look from `tokens.json` and the rules in `README.md` and reads `bundle.css` and `bundle.js` for exact values (sizes, states, motion, markup). It does not import the bundle.
- If Harold changes the design system, a new snapshot replaces these files in one commit and the change is logged in `docs/DECISIONS.md`.
