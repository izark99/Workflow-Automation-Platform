// All user-visible text lives here.

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

export const strings = {
  brand: 'Data Flow',
  nav: { label: 'Main', flows: 'Flows', refTables: 'Reference tables', admin: 'Admin', createFlow: 'Create flow' },
  roles: { admin: 'Admin', user: 'User' },
  screens: {
    flows: { crumb: 'Workspace', title: 'Flows', subtitle: 'Build a flow once, then run it for any effective date.' },
    refTables: { crumb: 'Workspace', title: 'Reference tables', subtitle: 'Shared rules that flows look up. Each table keeps versions with an effective date range.' },
    admin: { crumb: 'Workspace', title: 'Admin', subtitle: 'Users, groups, access to shared flows, and deleted flows.' },
    run: { crumb: 'Flows', title: 'Run a flow', subtitle: 'Pick the effective date and the files, then run the flow in this browser.' },
    versions: { crumb: 'Flows', title: 'Flow versions', subtitle: 'Each version is valid for a date range. A run uses the version valid on its effective date.' },
    builder: { title: 'Flow builder' },
    notBuilt: 'This screen is not built yet.',
  },
  createFlowDialog: {
    title: 'Create flow',
    name: 'Flow name',
    namePlaceholder: 'Monthly timesheet summary',
    scope: 'Scope',
    personal: 'Personal',
    shared: 'Shared',
    cancel: 'Cancel',
    create: 'Create flow',
    emptyName: 'The flow has no name.',
    emptyNameNext: 'Type a name and create the flow again.',
    failed: 'The flow could not be created.',
  },
  loadFailed: 'The data could not be loaded.',
  loadFailedNext: 'Reload the page. If it happens again, allow site data for this page in the browser settings.',
  xlsxTooLarge: (fileName: string, sizeBytes: number, limitBytes: number): string =>
    `${fileName} is ${mb(sizeBytes)}, which is above the ${mb(limitBytes)} this app can read safely from an .xlsx file. ` +
    'Open the file in Excel, save the sheet as .csv, and load the .csv file instead.',
};

// Components and states page (development only).
export const devStrings = {
  crumb: 'Design reference',
  title: 'Components and states',
  subtitle: 'Every control is built for this app. No browser-default dropdown, date picker, or checkbox is used.',
  buttons: 'Buttons: two sizes, one radius',
  buttonsNote: 'Orange is used once per screen, for the main action. Compact buttons are used inside tables and toolbars.',
  fields: 'Text fields and checkboxes',
  dropdown: 'Dropdown, closed and open',
  datePicker: 'Date picker, closed and open',
  loading: 'Loading: the skeleton keeps the layout of the table',
  loadingNote: 'Shown only when loading takes longer than about 0.3 seconds, so fast screens do not flash.',
  empty: 'Empty state',
  progress: 'Run in progress',
  error: 'Error state',
  confirm: 'Confirm before delete',
};
