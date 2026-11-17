// All user-visible text lives here.

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

export const strings = {
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
