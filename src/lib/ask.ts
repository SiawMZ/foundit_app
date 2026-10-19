import { FunctionsHttpError } from '@supabase/supabase-js';

import type { AskTerms } from './filter';
import { isNetworkError } from './offline';
import { supabase } from './supabase';

/** AI search: the `ask` function turns the question into search terms. Throws a readable message. */
export async function askSearch(question: string): Promise<AskTerms> {
  const { data, error } = await supabase.functions.invoke('ask', { body: { question } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      throw new Error(typeof body?.error === 'string' ? body.error : 'AI search failed. Try again.');
    }
    throw new Error(isNetworkError(error) ? 'No connection. Try again when you are online.' : 'AI search failed. Try again.');
  }
  return data as AskTerms;
}
