/**
 * Milkly AI's own Google Sheets connection, built into the app so nobody has to
 * enter it. Both values are public identifiers, not secrets: the Client ID
 * appears in every Google sign-in URL, and the spreadsheet can only be opened
 * by the Google accounts it is shared with.
 *
 * A deployment can still override them (`app-config.json` or `VITE_GOOGLE_*`),
 * and a Tech Admin can point one browser at another sheet in
 * Settings → Google Sheets Configuration.
 */
export const BUILT_IN_GOOGLE_CONNECTION = {
  oauthClientId: '1066729956043-86ac3qhf1c32r4qak2q3b6ca7bpt9snl.apps.googleusercontent.com',
  spreadsheetId: '17nmeq3w-9SJFDrwguQ_oikZd1tsfInjr8UQdYOU5u1k',
} as const;
