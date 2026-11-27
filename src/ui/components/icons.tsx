import { createElement } from 'react';
import type { ReactElement } from 'react';

// The icons of the Harold design system (design/harold/assets/Icons, v0.460.0 of Lucide, ISC license), drawn in `currentColor`.
// The path data is copied from design/harold/components/bundle.js. `link` and `shield` are not in the Harold set; they are taken
// from Lucide v0.460.0 (same stroke and corners), see docs/DECISIONS.md (D97).
type Node = readonly [
  tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon',
  attributes: Record<string, string>,
];

const NODES = {
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  x: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  'chevron-up': [['path', { d: 'm18 15-6-6-6 6' }]],
  'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
  'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
  'chevrons-up-down': [
    ['path', { d: 'm7 15 5 5 5-5' }],
    ['path', { d: 'm7 9 5-5 5 5' }],
  ],
  calendar: [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
    ['path', { d: 'M3 10h18' }],
  ],
  search: [
    ['circle', { cx: '11', cy: '11', r: '8' }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],
  plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  minus: [['path', { d: 'M5 12h14' }]],
  'trash-2': [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
    ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }],
  ],
  pencil: [
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      },
    ],
    ['path', { d: 'm15 5 4 4' }],
  ],
  download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: '12', x2: '12', y1: '15', y2: '3' }],
  ],
  upload: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '17 8 12 3 7 8' }],
    ['line', { x1: '12', x2: '12', y1: '3', y2: '15' }],
  ],
  filter: [
    ['polygon', { points: '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' }],
  ],
  ellipsis: [
    ['circle', { cx: '12', cy: '12', r: '1' }],
    ['circle', { cx: '19', cy: '12', r: '1' }],
    ['circle', { cx: '5', cy: '12', r: '1' }],
  ],
  info: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 16v-4' }],
    ['path', { d: 'M12 8h.01' }],
  ],
  'triangle-alert': [
    [
      'path',
      {
        d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
      },
    ],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  'circle-alert': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }],
    ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }],
  ],
  'circle-check': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  'circle-x': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm15 9-6 6' }],
    ['path', { d: 'm9 9 6 6' }],
  ],
  'loader-circle': [['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }]],
  house: [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    [
      'path',
      {
        d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      },
    ],
  ],
  users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ],
  user: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '12', cy: '7', r: '4' }],
  ],
  settings: [
    [
      'path',
      {
        d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  bell: [
    ['path', { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }],
    ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }],
  ],
  'file-spreadsheet': [
    [
      'path',
      { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    ],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M8 13h2' }],
    ['path', { d: 'M14 13h2' }],
    ['path', { d: 'M8 17h2' }],
    ['path', { d: 'M14 17h2' }],
  ],
  workflow: [
    ['rect', { width: '8', height: '8', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M7 11v4a2 2 0 0 0 2 2h4' }],
    ['rect', { width: '8', height: '8', x: '13', y: '13', rx: '2' }],
  ],
  play: [['polygon', { points: '6 3 20 12 6 21 6 3' }]],
  'chart-column': [
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'M18 17V9' }],
    ['path', { d: 'M13 17V5' }],
    ['path', { d: 'M8 17v-3' }],
  ],
  'trending-up': [
    ['polyline', { points: '22 7 13.5 15.5 8.5 10.5 2 17' }],
    ['polyline', { points: '16 7 22 7 22 13' }],
  ],
  'trending-down': [
    ['polyline', { points: '22 17 13.5 8.5 8.5 13.5 2 7' }],
    ['polyline', { points: '16 17 22 17 22 11' }],
  ],
  'arrow-up': [
    ['path', { d: 'm5 12 7-7 7 7' }],
    ['path', { d: 'M12 19V5' }],
  ],
  'arrow-down': [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'm19 12-7 7-7-7' }],
  ],
  'log-out': [
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
    ['polyline', { points: '16 17 21 12 16 7' }],
    ['line', { x1: '21', x2: '9', y1: '12', y2: '12' }],
  ],
  menu: [
    ['line', { x1: '4', x2: '20', y1: '12', y2: '12' }],
    ['line', { x1: '4', x2: '20', y1: '6', y2: '6' }],
    ['line', { x1: '4', x2: '20', y1: '18', y2: '18' }],
  ],
  eye: [
    [
      'path',
      {
        d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  copy: [
    ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  'refresh-cw': [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  inbox: [
    ['polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }],
    [
      'path',
      {
        d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      },
    ],
  ],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['polyline', { points: '12 6 12 12 16 14' }],
  ],
  wallet: [
    [
      'path',
      {
        d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
      },
    ],
    ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }],
  ],
  briefcase: [
    ['path', { d: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }],
    ['rect', { width: '20', height: '14', x: '2', y: '6', rx: '2' }],
  ],
  'calendar-days': [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
    ['path', { d: 'M3 10h18' }],
    ['path', { d: 'M8 14h.01' }],
    ['path', { d: 'M12 14h.01' }],
    ['path', { d: 'M16 14h.01' }],
    ['path', { d: 'M8 18h.01' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M16 18h.01' }],
  ],
  'list-filter': [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M7 12h10' }],
    ['path', { d: 'M10 18h4' }],
  ],
  link: [
    [
      'path',
      { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    ],
    [
      'path',
      { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
    ],
  ],
  shield: [
    [
      'path',
      {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    ],
  ],
  'align-left': [
    ['line', { x1: '4', y1: '3', x2: '4', y2: '21' }],
    ['rect', { x: '7', y: '6', width: '13', height: '4', rx: '1' }],
    ['rect', { x: '7', y: '14', width: '8', height: '4', rx: '1' }],
  ],
  'align-center-h': [
    ['line', { x1: '12', y1: '3', x2: '12', y2: '21' }],
    ['rect', { x: '4', y: '6', width: '16', height: '4', rx: '1' }],
    ['rect', { x: '7', y: '14', width: '10', height: '4', rx: '1' }],
  ],
  'align-right': [
    ['line', { x1: '20', y1: '3', x2: '20', y2: '21' }],
    ['rect', { x: '4', y: '6', width: '13', height: '4', rx: '1' }],
    ['rect', { x: '9', y: '14', width: '8', height: '4', rx: '1' }],
  ],
  'align-top': [
    ['line', { x1: '3', y1: '4', x2: '21', y2: '4' }],
    ['rect', { x: '6', y: '7', width: '4', height: '13', rx: '1' }],
    ['rect', { x: '14', y: '7', width: '4', height: '8', rx: '1' }],
  ],
  'align-middle': [
    ['line', { x1: '3', y1: '12', x2: '21', y2: '12' }],
    ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
    ['rect', { x: '14', y: '7', width: '4', height: '10', rx: '1' }],
  ],
  'align-bottom': [
    ['line', { x1: '3', y1: '20', x2: '21', y2: '20' }],
    ['rect', { x: '6', y: '4', width: '4', height: '13', rx: '1' }],
    ['rect', { x: '14', y: '9', width: '4', height: '8', rx: '1' }],
  ],
  'distribute-h': [
    ['line', { x1: '3', y1: '3', x2: '3', y2: '21' }],
    ['line', { x1: '21', y1: '3', x2: '21', y2: '21' }],
    ['rect', { x: '9', y: '7', width: '6', height: '10', rx: '1' }],
  ],
  'distribute-v': [
    ['line', { x1: '3', y1: '3', x2: '21', y2: '3' }],
    ['line', { x1: '3', y1: '21', x2: '21', y2: '21' }],
    ['rect', { x: '7', y: '9', width: '10', height: '6', rx: '1' }],
  ],
  'grid': [
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '1' }],
    ['line', { x1: '9', y1: '3', x2: '9', y2: '21' }],
    ['line', { x1: '15', y1: '3', x2: '15', y2: '21' }],
    ['line', { x1: '3', y1: '9', x2: '21', y2: '9' }],
    ['line', { x1: '3', y1: '15', x2: '21', y2: '15' }],
  ],
} as const satisfies Record<string, readonly Node[]>;

export type IconName = keyof typeof NODES;
/** Sizes of the Harold set: 16 (dense), 20 (default), 24. Nothing is smaller than 16. */
export type IconSize = 16 | 20 | 24;

/** The 47 icons of the Harold set, then the two taken from Lucide. */
export const ICON_NAMES = Object.keys(NODES) as IconName[];
export const LUCIDE_EXTRAS: readonly IconName[] = ['link', 'shield'];
/** Drawn for Phase 8 in the same style (D128): the align and distribute actions and the snap switch. */
export const DRAWN_EXTRAS: readonly IconName[] = ['align-left', 'align-center-h', 'align-right', 'align-top', 'align-middle', 'align-bottom', 'distribute-h', 'distribute-v', 'grid'];

/** Stroke 2 at 16 px and below, 1.75 above. */
export const strokeFor = (size: number): number => (size <= 16 ? 2 : 1.75);

export function Icon({ name, size = 16 }: { name: IconName; size?: IconSize }) {
  const nodes = NODES[name] as readonly Node[];
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={strokeFor(size)}
      strokeLinecap='round'
      strokeLinejoin='round'
      style={{ flex: 'none' }}
    >
      {nodes.map(
        ([tag, attributes], i): ReactElement =>
          createElement(tag, { key: i, ...attributes }),
      )}
    </svg>
  );
}
