// The default texts (SPEC 11.3). Keys are flat and dotted; the first segment is the screen (see KEY_PREFIXES in catalog.ts).
// A text never holds a function: dynamic values are `{name}` placeholders, formatted by the caller and passed in.
export const en = {
  'app.brand': 'Data Flow',

  'common.infoTip.about': 'About {label}',
  'common.toast.dismiss': 'Dismiss message',

  'nav.label': 'Main',
  'nav.flows': 'Flows',
  'nav.refTables': 'Reference tables',
  'nav.admin': 'Admin',
  'nav.createFlow': 'Create flow',
  'nav.role.admin': 'Admin',
  'nav.role.user': 'User',
  'nav.signOut': 'Sign out',
  'nav.signOutFailed': 'Could not sign out. Close this tab, or try again.',

  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  'signIn.title': 'Sign in',
  'signIn.subtitle': 'Use the email address and password your admin set up for you.',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.failed': 'You could not be signed in.',
  'signIn.failedGeneric': 'Sign-in failed. Try again, or ask the admin if it keeps failing.',
  'signIn.ended': 'Your session ended.',
  'signIn.endedNext': 'Sign in again to continue.',
  'signIn.checking': 'Checking your session',
  'signIn.problem.emailMissing': 'Enter your email address, then sign in.',
  'signIn.problem.emailInvalid': '"{email}" is not an email address. Type it like name@company.com.',
  'signIn.problem.passwordMissing': 'Enter your password, then sign in.',

  'flows.createDialog.title': 'Create flow',
  'flows.createDialog.name': 'Flow name',
  'flows.createDialog.namePlaceholder': 'Monthly timesheet summary',
  'flows.createDialog.scope': 'Scope',
  'flows.createDialog.personal': 'Personal',
  'flows.createDialog.shared': 'Shared',
  'flows.createDialog.cancel': 'Cancel',
  'flows.createDialog.create': 'Create flow',
  'flows.createDialog.emptyName': 'The flow has no name.',
  'flows.createDialog.emptyNameNext': 'Type a name and create the flow again.',
  'flows.createDialog.failed': 'The flow could not be created.',
} as const;

export type MessageKey = keyof typeof en;
