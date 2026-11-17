// Every route that the UI rules run on. A route added to the app is added here in the same task, so it is checked at once.
export interface RuleRoute {
  path: string;
  /** Screens with the page header share the title y and the first block y. */
  sidebar: boolean;
  /** The route is expected to show table rows. */
  table?: boolean;
}

export const ROUTES: RuleRoute[] = [
  { path: '/flows', sidebar: true },
  { path: '/reference-tables', sidebar: true },
  { path: '/admin', sidebar: true },
  { path: '/flows/flow-timesheet/run', sidebar: true },
  { path: '/flows/flow-timesheet/versions', sidebar: true },
  { path: '/dev/components', sidebar: true },
];
