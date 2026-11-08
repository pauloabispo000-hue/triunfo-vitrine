import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createReceiptHandler } from './core.mjs';
// Supabase-provided secrets stay inside the Edge Function. Never copy into Pages.
const client = createClient(
 Deno.env.get('SUPABASE_URL')!,
 Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 {auth:{persistSession:false,autoRefreshToken:false}}
);
Deno.serve(createReceiptHandler({
 client,origin:'https://pauloabispo000-hue.github.io'
}));
