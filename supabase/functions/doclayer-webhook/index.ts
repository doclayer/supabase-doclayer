// Doclayer Webhook Handler for Supabase Edge Functions
// Receives webhook events from Doclayer and syncs to Supabase database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Types
interface WebhookPayload {
  event_type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface DocumentProcessingStarted {
  job_id: string;
  checksum: string;
  timestamp: string;
}

interface DocumentProcessingCompleted {
  job_id: string;
  document_id: string;
  insights_count: number;
  confidence_metrics: Record<string, number>;
  agent_analysis_enabled?: boolean;
  timestamp: string;
}

interface DocumentProcessingFailed {
  job_id: string;
  document_id: string;
  error: string;
  error_type: string;
  timestamp: string;
}

// Batch event types
interface BatchStarted {
  batch_id: string;
  total_documents: number;
  project_id?: string;
  timestamp: string;
}

interface BatchProgress {
  batch_id: string;
  completed: number;
  total: number;
  failed: number;
  timestamp: string;
}

interface BatchCompleted {
  batch_id: string;
  total_documents: number;
  successful: number;
  failed: number;
  duration_seconds: number;
  timestamp: string;
}

interface BatchFailed {
  batch_id: string;
  error: string;
  error_type: string;
  completed: number;
  total: number;
  timestamp: string;
}

// Billing event types
interface BillingCreditsLow {
  current_balance: number;
  threshold: number;
  currency: string;
  timestamp: string;
}

interface BillingCreditsExhausted {
  current_balance: number;
  currency: string;
  timestamp: string;
}

interface BillingUsageReport {
  period_start: string;
  period_end: string;
  total_documents: number;
  total_pages: number;
  total_cost: number;
  currency: string;
  timestamp: string;
}

// Workflow event types
interface WorkflowStarted {
  workflow_id: string;
  workflow_type: string;
  document_id?: string;
  timestamp: string;
}

interface WorkflowCompleted {
  workflow_id: string;
  workflow_type: string;
  document_id?: string;
  result?: Record<string, unknown>;
  duration_seconds: number;
  timestamp: string;
}

interface WorkflowFailed {
  workflow_id: string;
  workflow_type: string;
  document_id?: string;
  error: string;
  error_type: string;
  timestamp: string;
}

// HMAC signature verification
async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = signature.replace("sha256=", "");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const computedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSignature === expectedSignature;
}

// Main handler
serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Get environment variables
    const webhookSecret = Deno.env.get("DOCLAYER_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Read raw body for signature verification
    const rawBody = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get("x-webhook-signature") || "";
      const isValid = await verifySignature(rawBody, signature, webhookSecret);

      if (!isValid) {
        console.error("Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Parse payload
    const payload: WebhookPayload = JSON.parse(rawBody);
    const eventType = req.headers.get("x-webhook-event") || payload.event_type;
    const deliveryId = req.headers.get("x-webhook-delivery") || "unknown";

    console.log(`Processing webhook: ${eventType} (delivery: ${deliveryId})`);

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log the webhook event
    await supabase.from("doclayer_webhook_events").insert({
      event_type: eventType,
      event_id: deliveryId,
      payload: payload,
      signature_valid: true,
    });

    // Route to appropriate handler
    switch (eventType) {
      case "document.processing.started": {
        const data = payload.data as unknown as DocumentProcessingStarted;
        await handleProcessingStarted(supabase, data, payload);
        break;
      }

      case "document.processing.completed": {
        const data = payload.data as unknown as DocumentProcessingCompleted;
        await handleProcessingCompleted(supabase, data, payload);
        break;
      }

      case "document.processing.failed": {
        const data = payload.data as unknown as DocumentProcessingFailed;
        await handleProcessingFailed(supabase, data, payload);
        break;
      }

      case "batch.started": {
        const data = payload.data as unknown as BatchStarted;
        await handleBatchStarted(supabase, data, payload);
        break;
      }

      case "batch.progress": {
        const data = payload.data as unknown as BatchProgress;
        await handleBatchProgress(supabase, data, payload);
        break;
      }

      case "batch.completed": {
        const data = payload.data as unknown as BatchCompleted;
        await handleBatchCompleted(supabase, data, payload);
        break;
      }

      case "batch.failed": {
        const data = payload.data as unknown as BatchFailed;
        await handleBatchFailed(supabase, data, payload);
        break;
      }

      case "billing.credits.low": {
        const data = payload.data as unknown as BillingCreditsLow;
        await handleBillingCreditsLow(supabase, data, payload);
        break;
      }

      case "billing.credits.exhausted": {
        const data = payload.data as unknown as BillingCreditsExhausted;
        await handleBillingCreditsExhausted(supabase, data, payload);
        break;
      }

      case "billing.usage.report": {
        const data = payload.data as unknown as BillingUsageReport;
        await handleBillingUsageReport(supabase, data, payload);
        break;
      }

      case "workflow.started": {
        const data = payload.data as unknown as WorkflowStarted;
        await handleWorkflowStarted(supabase, data, payload);
        break;
      }

      case "workflow.completed": {
        const data = payload.data as unknown as WorkflowCompleted;
        await handleWorkflowCompleted(supabase, data, payload);
        break;
      }

      case "workflow.failed": {
        const data = payload.data as unknown as WorkflowFailed;
        await handleWorkflowFailed(supabase, data, payload);
        break;
      }

      case "test.ping": {
        // Test event - just acknowledge
        console.log("Received test ping from Doclayer");
        break;
      }

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Mark webhook as processed
    await supabase
      .from("doclayer_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", deliveryId);

    return new Response(
      JSON.stringify({
        success: true,
        event_type: eventType,
        delivery_id: deliveryId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// Handler: Document Processing Started
async function handleProcessingStarted(
  supabase: ReturnType<typeof createClient>,
  data: DocumentProcessingStarted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_documents").upsert(
    {
      doclayer_job_id: data.job_id,
      checksum: data.checksum,
      status: "processing",
      doclayer_created_at: data.timestamp,
      raw_payload: rawPayload,
    },
    {
      onConflict: "doclayer_job_id",
    }
  );

  if (error) {
    console.error("Failed to insert document:", error);
    throw error;
  }

  console.log(`Document processing started: ${data.job_id}`);
}

// Handler: Document Processing Completed
async function handleProcessingCompleted(
  supabase: ReturnType<typeof createClient>,
  data: DocumentProcessingCompleted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_documents").upsert(
    {
      doclayer_job_id: data.job_id,
      doclayer_document_id: data.document_id,
      status: "completed",
      insights_count: data.insights_count,
      confidence_metrics: data.confidence_metrics,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "doclayer_job_id",
    }
  );

  if (error) {
    console.error("Failed to update document:", error);
    throw error;
  }

  console.log(
    `Document processing completed: ${data.job_id} (${data.insights_count} insights)`
  );

  // Optionally: Fetch and store extractions from Doclayer API
  // This requires DOCLAYER_API_KEY to be set
  const apiKey = Deno.env.get("DOCLAYER_API_KEY");
  if (apiKey && data.document_id) {
    await fetchAndStoreExtractions(supabase, data.job_id, data.document_id, apiKey);
  }
}

// Handler: Document Processing Failed
async function handleProcessingFailed(
  supabase: ReturnType<typeof createClient>,
  data: DocumentProcessingFailed,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_documents").upsert(
    {
      doclayer_job_id: data.job_id,
      doclayer_document_id: data.document_id,
      status: "failed",
      error_message: data.error,
      error_type: data.error_type,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "doclayer_job_id",
    }
  );

  if (error) {
    console.error("Failed to update document:", error);
    throw error;
  }

  console.log(`Document processing failed: ${data.job_id} - ${data.error}`);
}

// Fetch extractions from Doclayer API and store in Supabase
async function fetchAndStoreExtractions(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  documentId: string,
  apiKey: string
): Promise<void> {
  try {
    const baseUrl = Deno.env.get("DOCLAYER_API_URL") || "https://api.doclayer.ai";
    
    // Fetch extractions from Doclayer
    const response = await fetch(
      `${baseUrl}/api/v4/documents/${documentId}/extractions`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch extractions: ${response.status}`);
      return;
    }

    const extractionsData = await response.json();
    
    // Get the document record to link extractions
    const { data: docRecord } = await supabase
      .from("doclayer_documents")
      .select("id")
      .eq("doclayer_job_id", jobId)
      .single();

    if (!docRecord) {
      console.error("Document record not found for extractions");
      return;
    }

    // Transform and insert extractions
    const extractions = (extractionsData.extractions || []).map(
      (ext: Record<string, unknown>) => ({
        document_id: docRecord.id,
        extraction_type: ext.type || "unknown",
        extraction_key: ext.key,
        content: ext.value || ext.content || ext,
        confidence: ext.confidence,
        page_number: ext.page,
        source_text: ext.source_text,
      })
    );

    if (extractions.length > 0) {
      const { error } = await supabase
        .from("doclayer_extractions")
        .insert(extractions);

      if (error) {
        console.error("Failed to insert extractions:", error);
      } else {
        console.log(`Stored ${extractions.length} extractions for ${jobId}`);
      }
    }
  } catch (error) {
    console.error("Error fetching extractions:", error);
  }
}

// ============================================================================
// Batch Event Handlers
// ============================================================================

async function handleBatchStarted(
  supabase: ReturnType<typeof createClient>,
  data: BatchStarted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_batches").upsert(
    {
      batch_id: data.batch_id,
      total_documents: data.total_documents,
      project_id: data.project_id,
      status: "processing",
      started_at: data.timestamp,
      raw_payload: rawPayload,
    },
    { onConflict: "batch_id" }
  );

  if (error) {
    console.error("Failed to insert batch:", error);
    // Don't throw - table may not exist
  }
  console.log(`Batch started: ${data.batch_id} (${data.total_documents} documents)`);
}

async function handleBatchProgress(
  supabase: ReturnType<typeof createClient>,
  data: BatchProgress,
  _rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase
    .from("doclayer_batches")
    .update({
      completed_count: data.completed,
      failed_count: data.failed,
      updated_at: new Date().toISOString(),
    })
    .eq("batch_id", data.batch_id);

  if (error) {
    console.error("Failed to update batch progress:", error);
  }
  console.log(`Batch progress: ${data.batch_id} - ${data.completed}/${data.total} (${data.failed} failed)`);
}

async function handleBatchCompleted(
  supabase: ReturnType<typeof createClient>,
  data: BatchCompleted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase
    .from("doclayer_batches")
    .update({
      status: "completed",
      completed_count: data.successful,
      failed_count: data.failed,
      duration_seconds: data.duration_seconds,
      completed_at: data.timestamp,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("batch_id", data.batch_id);

  if (error) {
    console.error("Failed to update batch:", error);
  }
  console.log(`Batch completed: ${data.batch_id} - ${data.successful}/${data.total_documents} successful`);
}

async function handleBatchFailed(
  supabase: ReturnType<typeof createClient>,
  data: BatchFailed,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase
    .from("doclayer_batches")
    .update({
      status: "failed",
      error_message: data.error,
      error_type: data.error_type,
      completed_count: data.completed,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("batch_id", data.batch_id);

  if (error) {
    console.error("Failed to update batch:", error);
  }
  console.log(`Batch failed: ${data.batch_id} - ${data.error}`);
}

// ============================================================================
// Billing Event Handlers
// ============================================================================

async function handleBillingCreditsLow(
  supabase: ReturnType<typeof createClient>,
  data: BillingCreditsLow,
  rawPayload: WebhookPayload
): Promise<void> {
  // Store billing alert
  const { error } = await supabase.from("doclayer_billing_alerts").insert({
    alert_type: "credits_low",
    current_balance: data.current_balance,
    threshold: data.threshold,
    currency: data.currency,
    raw_payload: rawPayload,
  });

  if (error) {
    console.error("Failed to insert billing alert:", error);
  }
  console.log(`BILLING ALERT: Credits low - ${data.current_balance} ${data.currency} (threshold: ${data.threshold})`);
}

async function handleBillingCreditsExhausted(
  supabase: ReturnType<typeof createClient>,
  data: BillingCreditsExhausted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_billing_alerts").insert({
    alert_type: "credits_exhausted",
    current_balance: data.current_balance,
    currency: data.currency,
    raw_payload: rawPayload,
  });

  if (error) {
    console.error("Failed to insert billing alert:", error);
  }
  console.log(`BILLING ALERT: Credits exhausted - ${data.current_balance} ${data.currency}`);
}

async function handleBillingUsageReport(
  supabase: ReturnType<typeof createClient>,
  data: BillingUsageReport,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_usage_reports").insert({
    period_start: data.period_start,
    period_end: data.period_end,
    total_documents: data.total_documents,
    total_pages: data.total_pages,
    total_cost: data.total_cost,
    currency: data.currency,
    raw_payload: rawPayload,
  });

  if (error) {
    console.error("Failed to insert usage report:", error);
  }
  console.log(`Usage report: ${data.period_start} to ${data.period_end} - ${data.total_documents} docs, ${data.total_cost} ${data.currency}`);
}

// ============================================================================
// Workflow Event Handlers
// ============================================================================

async function handleWorkflowStarted(
  supabase: ReturnType<typeof createClient>,
  data: WorkflowStarted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase.from("doclayer_workflows").upsert(
    {
      workflow_id: data.workflow_id,
      workflow_type: data.workflow_type,
      document_id: data.document_id,
      status: "running",
      started_at: data.timestamp,
      raw_payload: rawPayload,
    },
    { onConflict: "workflow_id" }
  );

  if (error) {
    console.error("Failed to insert workflow:", error);
  }
  console.log(`Workflow started: ${data.workflow_id} (${data.workflow_type})`);
}

async function handleWorkflowCompleted(
  supabase: ReturnType<typeof createClient>,
  data: WorkflowCompleted,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase
    .from("doclayer_workflows")
    .update({
      status: "completed",
      result: data.result,
      duration_seconds: data.duration_seconds,
      completed_at: data.timestamp,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("workflow_id", data.workflow_id);

  if (error) {
    console.error("Failed to update workflow:", error);
  }
  console.log(`Workflow completed: ${data.workflow_id} in ${data.duration_seconds}s`);
}

async function handleWorkflowFailed(
  supabase: ReturnType<typeof createClient>,
  data: WorkflowFailed,
  rawPayload: WebhookPayload
): Promise<void> {
  const { error } = await supabase
    .from("doclayer_workflows")
    .update({
      status: "failed",
      error_message: data.error,
      error_type: data.error_type,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("workflow_id", data.workflow_id);

  if (error) {
    console.error("Failed to update workflow:", error);
  }
  console.log(`Workflow failed: ${data.workflow_id} - ${data.error}`);
}
