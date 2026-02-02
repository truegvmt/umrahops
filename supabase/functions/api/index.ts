// UmrahOps Supabase Edge Function - Main API Handler
// Lean, native Deno implementation - NO Node.js/Express

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;

        // Initialize Supabase client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        );

        // === ROUTING ===

        // Health check
        if (path === '/api/health') {
            return jsonResponse({ status: 'ok', mode: 'supabase-edge' });
        }

        // Stats endpoint
        if (path === '/api/stats' && method === 'GET') {
            const { data: groups } = await supabaseClient.from('groups').select('*');
            const { data: travelers } = await supabaseClient.from('travelers').select('*');
            const { data: jobs } = await supabaseClient.from('jobs').select('*');

            const stats = {
                totalGroups: groups?.length || 0,
                activeTravelers: travelers?.length || 0,
                pendingJobs: jobs?.filter((j: any) => j.status === 'pending').length || 0,
                successRate: jobs?.length
                    ? ((jobs.filter((j: any) => j.status === 'completed').length / jobs.length) * 100).toFixed(1)
                    : '0.0',
            };

            return jsonResponse(stats);
        }

        // Groups - List
        if (path === '/api/groups' && method === 'GET') {
            const { data, error } = await supabaseClient
                .from('groups')
                .select('*')
                .order('createdAt', { ascending: false });

            if (error) throw error;
            return jsonResponse(data || []);
        }

        // Groups - Create
        if (path === '/api/groups' && method === 'POST') {
            const body = await req.json();
            const { data, error } = await supabaseClient
                .from('groups')
                .insert([{
                    name: body.name,
                    status: body.status || 'draft',
                    travelersCount: 0,
                    createdAt: new Date().toISOString(),
                }])
                .select()
                .single();

            if (error) throw error;

            // Audit log
            await supabaseClient.from('audit_logs').insert([{
                entityType: 'group',
                entityId: data.id,
                action: 'create',
                payload: { name: data.name },
                createdAt: new Date().toISOString(),
            }]);

            return jsonResponse(data, 201);
        }

        // Groups - Get by ID
        const groupMatch = path.match(/^\/api\/groups\/([^\/]+)$/);
        if (groupMatch && method === 'GET') {
            const groupId = groupMatch[1];
            const { data, error } = await supabaseClient
                .from('groups')
                .select('*')
                .eq('id', groupId)
                .single();

            if (error || !data) {
                return jsonResponse({ message: 'Group not found' }, 404);
            }
            return jsonResponse(data);
        }

        // Travelers - List
        const travelersMatch = path.match(/^\/api\/groups\/([^\/]+)\/travelers$/);
        if (travelersMatch && method === 'GET') {
            const groupId = travelersMatch[1];
            const { data, error } = await supabaseClient
                .from('travelers')
                .select('*')
                .eq('groupId', groupId)
                .order('createdAt', { ascending: false });

            if (error) throw error;
            return jsonResponse(data || []);
        }

        // Travelers - Create
        if (travelersMatch && method === 'POST') {
            const groupId = travelersMatch[1];
            const body = await req.json();
            const { data, error } = await supabaseClient
                .from('travelers')
                .insert([{
                    groupId,
                    ...body,
                    createdAt: new Date().toISOString(),
                }])
                .select()
                .single();

            if (error) throw error;
            return jsonResponse(data, 201);
        }

        // Travelers - Bulk Create
        const bulkMatch = path.match(/^\/api\/groups\/([^\/]+)\/travelers\/bulk$/);
        if (bulkMatch && method === 'POST') {
            const groupId = bulkMatch[1];
            const body = await req.json();

            const travelersToInsert = body.travelers.map((t: any) => ({
                ...t,
                groupId,
                createdAt: new Date().toISOString(),
            }));

            const { data, error } = await supabaseClient
                .from('travelers')
                .insert(travelersToInsert)
                .select();

            if (error) throw error;

            // Audit log
            if (data && data.length > 0) {
                await supabaseClient.from('audit_logs').insert([{
                    entityType: 'group',
                    entityId: groupId,
                    action: 'bulk_create_travelers',
                    payload: { count: data.length },
                    createdAt: new Date().toISOString(),
                }]);
            }

            return jsonResponse(data, 201);
        }

        // Jobs - List
        if (path === '/api/jobs' && method === 'GET') {
            const { data, error } = await supabaseClient
                .from('jobs')
                .select('*')
                .order('createdAt', { ascending: false })
                .limit(20);

            if (error) throw error;
            return jsonResponse(data || []);
        }

        // Jobs - Create
        if (path === '/api/jobs' && method === 'POST') {
            const body = await req.json();
            const { data, error } = await supabaseClient
                .from('jobs')
                .insert([{
                    type: body.type,
                    payload: body.payload || {},
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                }])
                .select()
                .single();

            if (error) throw error;
            return jsonResponse(data, 201);
        }

        // Audit Logs - List
        if (path === '/api/audit' && method === 'GET') {
            const { data, error } = await supabaseClient
                .from('audit_logs')
                .select('*')
                .order('createdAt', { ascending: false })
                .limit(50);

            if (error) throw error;
            return jsonResponse(data || []);
        }

        // Objectives - List
        if (path === '/api/objectives' && method === 'GET') {
            const { data, error } = await supabaseClient
                .from('objectives')
                .select('*')
                .order('createdAt', { ascending: false })
                .limit(10);

            if (error) throw error;
            return jsonResponse(data || []);
        }

        // Hotels - List
        if (path === '/api/hotels' && method === 'GET') {
            // Mock hotel data or fetch from hotels table
            const hotels = [
                { id: 1, name: 'Pullman Zamzam Makkah', city: 'Makkah', stars: 5 },
                { id: 2, name: 'Dar Al Eiman Royal', city: 'Makkah', stars: 5 },
                { id: 3, name: 'Swissotel Al Maqam', city: 'Makkah', stars: 5 },
            ];
            return jsonResponse(hotels);
        }

        // Default 404
        return jsonResponse({ message: 'Endpoint not found' }, 404);

    } catch (error) {
        console.error('Edge Function Error:', error);
        return jsonResponse(
            {
                message: error.message || 'Internal Server Error',
                error: error.toString()
            },
            500
        );
    }
});

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
