// All user-visible text lives here.

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

export const strings = {
  xlsxTooLarge: (fileName: string, sizeBytes: number, limitBytes: number): string =>
    `${fileName} is ${mb(sizeBytes)}, which is above the ${mb(limitBytes)} this app can read safely from an .xlsx file. ` +
    'Open the file in Excel, save the sheet as .csv, and load the .csv file instead.',
};
