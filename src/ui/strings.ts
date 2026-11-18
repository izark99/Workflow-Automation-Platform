// The UI texts live in the message catalog (src/ui/i18n). What is left here is an English text that the engine and the
// benchmark page still import; task T4.7d turns engine errors into codes and removes this file.

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

export const strings = {
  xlsxTooLarge: (fileName: string, sizeBytes: number, limitBytes: number): string =>
    `${fileName} is ${mb(sizeBytes)}, which is above the ${mb(limitBytes)} this app can read safely from an .xlsx file. ` +
    'Open the file in Excel, save the sheet as .csv, and load the .csv file instead.',
};
