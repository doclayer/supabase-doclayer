// Upload Document to Doclayer via Supabase Edge Function
// Example of using the Doclayer client to upload documents

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DoclayerClient } from "../../lib/doclayer-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("project_id") as string;
    const agentId = formData.get("agent_id") as string | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Doclayer client
    const doclayerApiKey = Deno.env.get("DOCLAYER_API_KEY");
    if (!doclayerApiKey) {
      return new Response(
        JSON.stringify({ error: "Doclayer API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const doclayer = new DoclayerClient({
      apiKey: doclayerApiKey,
      baseUrl: Deno.env.get("DOCLAYER_API_URL") || "https://api.doclayer.ai",
    });

    // Upload to Doclayer
    const job = await doclayer.ingest.upload({
      file,
      projectId,
      agentId: agentId || undefined,
      filename: file.name,
    });

    // Optionally: Track in local database
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    await supabaseAdmin.from("doclayer_documents").insert({
      doclayer_job_id: job.job_id,
      filename: file.name,
      file_type: file.type,
      file_size_bytes: file.size,
      status: "processing",
      project_id: projectId,
      agent_template_id: agentId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.job_id,
        status: job.status,
        message: `Document "${file.name}" uploaded successfully`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Upload error:", error);

    return new Response(
      JSON.stringify({
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
