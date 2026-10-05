/**
 * Validation rules, shared by React forms (via zodResolver) and by the
 * application services (which re-validate before every write).
 */
import { z } from 'zod';
import { validationError } from '../errors/AppError';
import { ROLES } from '../models/user';
import { PAPER_SIZES } from '../models/settings';

const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

const requiredText = (label: string, max = 120) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (label: string, max = 250) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .default('');

const requiredId = (label: string) => z.string({ required_error: `${label} is required` }).min(1, `${label} is required`);

const numberField = (label: string) =>
  z.preprocess(
    (value) => {
      const cleaned = emptyToUndefined(value);
      return typeof cleaned === 'string' ? Number(cleaned) : cleaned;
    },
    z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` }).finite(),
  );

const priorityField = numberField('Priority').pipe(
  z.number().int('Priority must be a whole number').min(1, 'Priority must be a positive number').max(9999),
);

const amountField = (label: string) =>
  numberField(label).pipe(z.number().min(0, `${label} cannot be negative`).max(10_000_000, `${label} is too large`));

export const vendorFormSchema = z.object({
  vendorName: requiredText('Vendor name', 100),
  priority: priorityField,
});

export const categoryFormSchema = z.object({
  vendorId: requiredId('Vendor'),
  categoryName: requiredText('Category name', 100),
  priority: priorityField,
});

export const productFormSchema = z
  .object({
    vendorId: requiredId('Vendor'),
    categoryId: requiredId('Category'),
    productName: requiredText('Product name', 120),
    unit: requiredText('Unit', 30),
    purchasePrice: amountField('Purchase price'),
    mrp: amountField('MRP'),
    sellingPrice: amountField('Selling price'),
    priority: priorityField,
  })
  .refine((value) => value.mrp === 0 || value.sellingPrice <= value.mrp, {
    path: ['sellingPrice'],
    message: 'Selling price cannot be more than MRP',
  });

export const routeFormSchema = z.object({
  routeName: requiredText('Route name', 100),
  routeCode: requiredText('Route code', 20)
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value), 'Use letters, numbers, "-" or "_" only'),
  priority: priorityField,
});

export const customerFormSchema = z.object({
  routeId: requiredId('Route'),
  storeName: requiredText('Store name', 120),
  contactPerson: optionalText('Contact person', 100),
  phone: optionalText('Phone', 30).refine(
    (value) => value === '' || /^\+?[\d\s()-]{6,20}$/.test(value),
    'Enter a valid phone number',
  ),
  address: optionalText('Address', 300),
  priority: priorityField,
  vendorIds: z.array(z.string()).default([]),
});

export const userFormSchema = z.object({
  email: z
    .string({ required_error: 'E-mail is required' })
    .trim()
    .toLowerCase()
    .email('Enter a valid Google account e-mail'),
  displayName: requiredText('Name', 100),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
});

export const appSettingsSchema = z.object({
  businessName: requiredText('Business name', 120),
  businessAddress: optionalText('Business address', 300),
  phone: optionalText('Phone', 40),
  taxId: optionalText('Tax ID', 40),
  invoiceFooter: optionalText('Invoice footer', 300),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code, e.g. INR'),
  paperSize: z.enum(PAPER_SIZES),
});

/** Accepts either a bare spreadsheet ID or a full Google Sheets URL. */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export const sheetConnectionSchema = z.object({
  spreadsheetId: z
    .string()
    .trim()
    .min(1, 'Spreadsheet ID is required')
    .transform(extractSpreadsheetId)
    .refine((value) => /^[a-zA-Z0-9-_]{20,}$/.test(value), 'This does not look like a Google Sheets ID or URL'),
  oauthClientId: z
    .string()
    .trim()
    .min(1, 'OAuth Client ID is required')
    .refine((value) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(value), 'Expected an ID ending in .apps.googleusercontent.com'),
  authMode: z.literal('google-identity-services').default('google-identity-services'),
});

export type VendorFormValues = z.output<typeof vendorFormSchema>;
export type CategoryFormValues = z.output<typeof categoryFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
export type RouteFormValues = z.output<typeof routeFormSchema>;
export type CustomerFormValues = z.output<typeof customerFormSchema>;
export type UserFormValues = z.output<typeof userFormSchema>;
export type AppSettingsFormValues = z.output<typeof appSettingsSchema>;
export type SheetConnectionFormValues = z.output<typeof sheetConnectionSchema>;

/** Parses input with a schema or throws an `AppError('VALIDATION')` with field messages. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    fieldErrors[key] ??= issue.message;
  }
  throw validationError(fieldErrors);
}
