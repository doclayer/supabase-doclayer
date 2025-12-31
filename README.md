# Supabase Doclayer Integration

Sync your Doclayer document processing results directly to Supabase with real-time updates.

## Features

- **Webhook Receiver**: Edge Function that receives Doclayer webhook events
- **Document Sync**: Automatically store processed documents and extractions in Supabase tables
- **Real-time Updates**: React hooks for live document status tracking via Supabase Realtime
- **TypeScript Client**: Fully typed Doclayer API client for use in Edge Functions
- **NPM Package**: Install via `npm install @doclayer/supabase`

## Installation

### NPM Package (Recommended)

```bash
npm install @doclayer/supabase
```

### Manual Installation

Copy the `lib/`, `supabase/`, and `migrations/` folders to your project.

## Quick Start

### 1. Apply the Database Migrations

Run the migrations to create the necessary tables:

```bash
supabase db push
```

Or apply manually in Supabase SQL Editor:

```sql
-- See migrations/001_doclayer_documents.sql
-- See migrations/002_enable_realtime.sql
-- See migrations/003_additional_tables.sql
```

### 2. Deploy the Edge Functions

```bash
supabase functions deploy doclayer-webhook
supabase functions deploy upload-document
```

### 3. Configure Doclayer Webhook

Register the webhook in Doclayer:

```bash
curl -X POST https://api.doclayer.ai/api/v4/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Supabase Sync",
    "url": "https://YOUR_PROJECT.supabase.co/functions/v1/doclayer-webhook",
    "events": [
      "document.processing.started",
      "document.processing.completed",
      "document.processing.failed",
      "batch.started",
      "batch.completed",
      "billing.credits.low"
    ]
  }'
```

### 4. Set Environment Variables

In your Supabase project:

```bash
supabase secrets set DOCLAYER_WEBHOOK_SECRET=your-secret-here
supabase secrets set DOCLAYER_API_KEY=your-api-key-here
```

## Real-time Document Tracking

### React Hooks

Track document processing status in real-time with React hooks:

```tsx
import { createClient } from '@supabase/supabase-js';
import { useDocumentStatus, useDocumentList } from '@doclayer/supabase/react';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function DocumentTracker({ jobId }) {
  const { document, status, isLoading } = useDocumentStatus({
    supabase,
    jobId,
    onComplete: (doc) => console.log('Processing complete!', doc),
    onError: (doc) => console.error('Failed:', doc.error_message),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <p>Status: {status}</p>
      {document?.insights_count && (
        <p>Extracted {document.insights_count} insights</p>
      )}
    </div>
  );
}

function DocumentList() {
  const { documents, isLoading } = useDocumentList({
    supabase,
    projectId: 'my-project',
    realtime: true, // Enable live updates
    limit: 20,
  });

  return (
    <ul>
      {documents.map(doc => (
        <li key={doc.id}>
          {doc.filename} - {doc.status}
        </li>
      ))}
    </ul>
  );
}
```

### Available Hooks

| Hook | Description |
|------|-------------|
| `useDocumentStatus` | Track a single document's processing status |
| `useDocumentList` | List documents with optional real-time updates |
| `useWebhookEvents` | Monitor incoming webhook events (for debugging) |

## TypeScript Client

Use the Doclayer client in your Edge Functions or Node.js backend:

```typescript
import { DoclayerClient } from '@doclayer/supabase/client';

const doclayer = new DoclayerClient({
  apiKey: process.env.DOCLAYER_API_KEY!,
  baseUrl: 'https://api.doclayer.ai',
});

// Upload a document
const job = await doclayer.ingest.upload({
  file: fileBlob,
  projectId: 'my-project',
  agentId: 'legal.contract-analyzer',
});

// Check status
const status = await doclayer.ingest.getJob(job.job_id);

// Get extractions
const { extractions } = await doclayer.documents.getExtractions(job.document_id);

// Create a webhook
const webhook = await doclayer.webhooks.create({
  name: 'My Webhook',
  url: 'https://example.com/webhook',
  events: ['document.processing.completed'],
});
```

## Database Schema

### `doclayer_documents`

Stores document metadata and processing status:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `doclayer_job_id` | text | Doclayer ingestion job ID |
| `doclayer_document_id` | text | Doclayer document ID |
| `filename` | text | Original filename |
| `status` | text | Processing status |
| `insights_count` | integer | Number of extracted insights |
| `confidence_metrics` | jsonb | Extraction confidence scores |
| `error_message` | text | Error details if failed |
| `raw_payload` | jsonb | Full webhook payload |
| `created_at` | timestamptz | Record creation time |
| `updated_at` | timestamptz | Last update time |

### `doclayer_extractions`

Stores individual extraction results:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `document_id` | uuid | Reference to doclayer_documents |
| `extraction_type` | text | Type of extraction |
| `content` | jsonb | Extracted data |
| `confidence` | numeric | Confidence score (0-1) |
| `page_number` | integer | Source page |

### Additional Tables

- `doclayer_batches` - Batch processing tracking
- `doclayer_billing_alerts` - Credit/billing alerts
- `doclayer_usage_reports` - Periodic usage reports
- `doclayer_workflows` - Workflow execution tracking
- `doclayer_webhook_events` - Webhook event log

## Webhook Events Reference

### Document Events

| Event | Description |
|-------|-------------|
| `document.processing.started` | Processing began |
| `document.processing.completed` | Processing succeeded |
| `document.processing.failed` | Processing failed |

### Batch Events

| Event | Description |
|-------|-------------|
| `batch.started` | Batch processing began |
| `batch.progress` | Batch progress update |
| `batch.completed` | Batch finished successfully |
| `batch.failed` | Batch failed |

### Billing Events

| Event | Description |
|-------|-------------|
| `billing.credits.low` | Credits below threshold |
| `billing.credits.exhausted` | Credits exhausted |
| `billing.usage.report` | Periodic usage report |

### Workflow Events

| Event | Description |
|-------|-------------|
| `workflow.started` | Workflow execution started |
| `workflow.completed` | Workflow completed |
| `workflow.failed` | Workflow failed |

## Examples

See the `examples/` folder for complete examples:

- `react-upload.tsx` - Basic React upload component
- `nextjs-app-router/` - Next.js App Router with real-time tracking

## Security

- **Webhook Signature**: All webhooks are signed with HMAC-SHA256
- **Row Level Security**: RLS enabled on all tables
- **Service Role**: Webhook handler uses service role for writes
- **API Key Rotation**: Rotate secrets using `supabase secrets set`

## Support

- [Doclayer Documentation](https://docs.doclayer.ai)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [GitHub Issues](https://github.com/doclayer/doclayer/issues)

## License

MIT - See [LICENSE](./LICENSE) for terms.
