// Setup for Supabase Edge Functions with Express
// @ts-ignore
import app from '../../dist/index.js';
import serverless from "npm:serverless-http@3.2.0";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("Initializing Supabase Edge Function...");

// Create the handler using serverless-http which supports Web Standards (Request/Response)
const handler = serverless(app);

serve(async (req) => {
    // serverless-http handles the conversion from Web Request -> Node Request -> Express -> Node Response -> Web Response
    return await handler(req);
});
