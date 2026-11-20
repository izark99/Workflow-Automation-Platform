// Engine errors as codes (SPEC 11.3). The engine imports nothing from the UI. An error that has a `messageId` carries
// the parameters of its text; the UI turns the id into the catalog text of its language (`errorText` in src/ui/i18n).
// The English template below is the fallback and the text of `message`. A test keeps it equal to the `en` catalog.
// Errors without an id (most of the "invalid settings" rules of the step modules) show their English message.

export type MessageParams = Record<string, string | number>;

export const ENGINE_MESSAGES = {
  'engine.cancelled': 'The run was cancelled. Start it again when you are ready.',
  'engine.noResult': 'Step "{step}" has no result to show. Run the flow first.',
  'engine.stepFailed': 'Step "{step}" failed: {reason} Open the step, check its settings and run again.',
  'engine.unsupportedStep': 'Step "{step}" is a {type} step, which this version of the app cannot run yet. Remove it or update the app.',
  'engine.invalidFlow': 'The flow cannot run. {problems}',
  'engine.noOutputStep': 'The flow has no Output step, so there is no file to write. Add an Output step after the step whose result you want.',
  'engine.missingRefTable': 'The flow reads the reference table "{name}", which does not exist. Check the table name in the step settings, or create the table.',
  'engine.duplicateKey': 'Two input steps use the key "{key}". Give each input step its own key, because each key gets one file.',
  'engine.fileTooLarge': '{fileName} is {size}, which is above the {limit} this app can read safely from an .xlsx file. Open the file in Excel, save the sheet as .csv, and load the .csv file instead.',
  'engine.versionDateInvalid': 'Version {n} of {what} has a date that is not a real date such as 2026-09-30. Correct the dates of that version.',
  'engine.versionEndsBeforeStart': 'Version {n} of {what} ends before it starts ({end} is before {start}). Correct the dates of that version.',
  'engine.effectiveDateInvalid': 'The effective date "{date}" is not a real date such as 2026-09-30. Pick the date again.',
  'engine.versionsOverlap': 'Versions {numbers} of {what} both cover {date}. Change their dates so that versions do not overlap.',
  'engine.noPublishedVersion': 'There is no published version of {what}. Publish a version that covers {date}.',
  'engine.onlyDraftCovers': 'Only a draft version ({n}) of {what} covers {date}, and a draft does not take effect. Publish it, or pick another effective date.',
  'engine.noVersionValid': 'No version of {what} is valid on {date}. Its published versions cover: {periods}. Pick an effective date inside one of these periods, or add a version that covers it.',
  'engine.paramNotList': 'The "parameters" of the flow must be a list. Use an array, which may be empty.',
  'engine.paramNeedsV2': 'The flow has "parameters" but schemaVersion {version}. Set schemaVersion to 2 to use parameters.',
  'engine.bindNeedsV3': 'Step "{step}" uses a parameter in "{setting}", which needs schemaVersion 3. Set schemaVersion to 3, or give the setting a fixed value.',
  'engine.bindShape': 'The setting "{setting}" of step "{step}" has a "$param" that is not an object with one text key. Write it as $param with the key of a parameter, or give the setting a fixed value.',
  'engine.bindUnknown': 'The setting "{setting}" of step "{step}" uses the parameter "{key}", which the flow does not define. Add that parameter, or choose another one.',
  'engine.bindNotHere': 'The setting "{setting}" of step "{step}" cannot take a parameter. Use a fixed value there; formulas and SQL read parameters with PARAM("key").',
  'engine.paramShape': 'Parameter {n} is not an object with a key, a label and a type. Write each parameter as an object.',
  'engine.paramKey': 'Parameter {n} has the key "{key}". A key has letters, digits and underscores, does not start with a digit, and has at most {max} characters.',
  'engine.paramDuplicateKey': 'Two parameters use the key "{key}" (keys are compared without regard to case). Give each parameter its own key.',
  'engine.paramLabel': 'Parameter "{key}" has no label. Add a label that the Run screen shows.',
  'engine.paramType': 'Parameter "{key}" has the unknown type "{type}". Use one of: {types}.',
  'engine.paramRequired': 'Parameter "{key}": "required" must be true or false.',
  'engine.paramHelp': 'The help of parameter "{key}" must be text.',
  'engine.paramDefaultDate': 'The default of parameter "{key}" is not a real date. Write it like 2026-09-30, or remove the default.',
  'engine.paramDefaultNumber': 'The default of parameter "{key}" is not a number. Write a number, or remove the default.',
  'engine.paramDefaultBoolean': 'The default of parameter "{key}" is not true or false. Write true or false, or remove the default.',
  'engine.paramDefaultText': 'The default of parameter "{key}" is not text. Write text, or remove the default.',
  'engine.paramDefaultList': 'The default of parameter "{key}" is not one of its options. Choose one of the options, or remove the default.',
  'engine.paramOptions': 'Parameter "{key}" is a list and needs at least one option. Add "options" with one or more texts.',
  'engine.paramOptionBad': 'Parameter "{key}" has an empty or repeated option. Every option must be a different text that is not empty.',
  'engine.paramMissing': '"{label}" needs a value. Enter a value for it.',
  'engine.paramWrongType': 'The value of "{label}" is not a valid {type}. Enter a value of that type.',
  'engine.paramNotOption': 'The value of "{label}" is not one of its options ({options}). Choose one of the options.',
  'refimport.notTableFile': 'The file {name} is not an .xlsx or .csv file. Choose a file of one of these types.',
  'refimport.noHeader': 'The header row {row} is empty or past the end of the sheet. Type the number of the row that holds the column names.',
  'refimport.noColumns': 'The header row {row} has no column names. Type the number of the row that holds the column names.',
  'refimport.tooManyRows': 'The file has {n} rows of data, and a table holds at most {max}. Split the file into smaller files, or remove the rows that are not needed.',
  'refimport.tooManyColumns': 'The file has {n} columns, and a table holds at most {max}. Remove the columns that are not needed, then import again.',
  'refimport.nameEmpty': 'Column {n} has no name in the header row. Type a name in that cell, or remove the column.',
  'refimport.nameRepeated': 'The name "{name}" is used by columns {first} and {second} (names are compared without regard to case). Give each column its own name.',
  'refimport.notNumber': 'Row {row}, column {column}: "{value}" is not a number. Fix the cell, or set the type of the column to text.',
  'refimport.notBoolean': 'Row {row}, column {column}: "{value}" is not true or false. Fix the cell, or set the type of the column to text.',
  'refimport.notDate': 'Row {row}, column {column}: "{value}" is not a date such as 2026-09-30. Fix the file, or choose the type text for the column.',
} as const;

export type EngineMessageId = keyof typeof ENGINE_MESSAGES;

/** Fills `{name}` placeholders. Engine templates use no plural forms. */
export function fillTemplate(template: string, params: MessageParams | undefined): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (params && name in params ? String(params[name]) : whole));
}

export const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

/** The English text of a message id with its parameters. */
export const engineText = (id: EngineMessageId, params?: MessageParams): string => fillTemplate(ENGINE_MESSAGES[id], params);
