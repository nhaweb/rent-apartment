import { isInputError, type ActionError } from 'astro:actions';

export interface FormErrors {
  /** First message per field (zod input errors). */
  fields: Record<string, string | undefined>;
  /** Message for the whole form (failed auth call, rate limit...). */
  form?: string;
}

/** Splits an action error into per-field messages and one form message. */
export function formErrors(error: ActionError | undefined): FormErrors {
  if (!error) return { fields: {} };
  if (isInputError(error)) {
    const fields: FormErrors['fields'] = {};
    for (const [name, messages] of Object.entries(error.fields)) fields[name] = (messages as string[] | undefined)?.[0];
    return { fields };
  }
  return { fields: {}, form: error.message };
}
