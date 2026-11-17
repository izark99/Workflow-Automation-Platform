/** Error with a message that says what failed and what the user can do next. */
export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxReadError';
  }
}

export const SAVE_AS_HINT = 'Open the file in Excel, save it as .xlsx or .csv, and try again.';
