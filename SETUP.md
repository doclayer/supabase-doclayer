# Supabase Doclayer Integration - Setup Guide

This guide walks you through setting up the Doclayer integration with your Supabase project.

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- A Doclayer account with API key ([doclayer.ai](https://doclayer.ai))
- Supabase CLI installed (`npm install -g supabase`)

## Step 1: Clone the Integration

```bash
# Copy the integration files to your project
cp -r integrations/supabase-doclayer/supabase/* ./supabase/
cp -r integrations/supabase-doclayer/lib ./supabase/functions/
cp integrations/supabase-doclayer/migrations/*.sql ./supabase/migrations/
```

## Step 2: Apply Database Migration

```bash
# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Apply the migration
supabase db push
```

Or apply manually in the Supabase SQL Editor:

1. Go to your project dashboard
2. Navigate to SQL Editor
3. Paste the contents of `migrations/001_doclayer_documents.sql`
4. Click "Run"

## Step 3: Configure Environment Variables

Set the required secrets for your Edge Functions:

```bash
# Your Doclayer API key
supabase secrets set DOCLAYER_API_KEY=your-api-key-here

# Webhook secret for signature verification (generate a secure random string)
supabase secrets set DOCLAYER_WEBHOOK_SECRET=$(openssl rand -hex 32)

# Optional: Custom Doclayer API URL (defaults to https://api.doclayer.ai)
supabase secrets set DOCLAYER_API_URL=https://api.doclayer.ai
```

To view your current secrets:

```bash
supabase secrets list
```

## Step 4: Deploy Edge Functions

```bash
# Deploy the webhook receiver
supabase functions deploy doclayer-webhook

# Deploy the upload helper (optional)
supabase functions deploy upload-document
```

## Step 5: Register Webhook in Doclayer

Get your Edge Function URL and register it in Doclayer:

```bash
# Your webhook URL will be:
# https://YOUR_PROJECT_REF.supabase.co/functions/v1/doclayer-webhook

# Register via API
curl -X POST https://api.doclayer.ai/api/v4/webhooks \
  -H "Authorization: Bearer YOUR_DOCLAYER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Supabase Sync",
    "url": "https://YOUR_PROJECT_REF.supabase.co/functions/v1/doclayer-webhook",
    "events": [
      "document.processing.started",
      "document.processing.completed",
      "document.processing.failed"
    ]
  }'
```

Save the returned webhook `id` and `secret` for reference.

## Step 6: Test the Integration

### Test the Webhook

```bash
# Get your webhook ID from the previous step
curl -X POST https://api.doclayer.ai/api/v4/webhooks/WEBHOOK_ID/test \
  -H "Authorization: Bearer YOUR_DOCLAYER_API_KEY"
```

Check the Supabase Edge Function logs:

```bash
supabase functions logs doclayer-webhook
```

### Test Document Upload

Upload a document through Doclayer:

```bash
curl -X POST https://api.doclayer.ai/api/v4/ingest \
  -H "Authorization: Bearer YOUR_DOCLAYER_API_KEY" \
  -F "file=@document.pdf" \
  -F "project_id=your-project-id"
```

Then check your Supabase database:

```sql
SELECT * FROM doclayer_documents ORDER BY created_at DESC LIMIT 5;
```

## Step 7: Enable Real-time (Optional)

To receive real-time updates in your frontend:

1. Go to your Supabase dashboard
2. Navigate to Database → Replication
3. Add `doclayer_documents` and `doclayer_extractions` tables

Then in your frontend:

```typescript
const channel = supabase
  .channel('doclayer-updates')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'doclayer_documents' },
    (payload) => {
      console.log('Document updated:', payload);
    }
  )
  .subscribe();
```

## Troubleshooting

### Webhook Not Receiving Events

1. Check the Edge Function logs: `supabase functions logs doclayer-webhook`
2. Verify the webhook URL is correct in Doclayer
3. Ensure the webhook is active: `GET /api/v4/webhooks/{id}`
4. Check webhook deliveries: `GET /api/v4/webhooks/{id}/deliveries`

### Signature Verification Failing

1. Ensure `DOCLAYER_WEBHOOK_SECRET` matches the webhook secret in Doclayer
2. Check that the secret was set correctly: `supabase secrets list`

### Documents Not Appearing in Database

1. Check the `doclayer_webhook_events` table for logged events
2. Look for errors in `error_message` column
3. Verify the migration was applied correctly

### Edge Function Errors

```bash
# View detailed logs
supabase functions logs doclayer-webhook --scroll

# Test locally
supabase functions serve doclayer-webhook
```

## Security Best Practices

1. **Rotate Secrets Regularly**: Update `DOCLAYER_WEBHOOK_SECRET` periodically
2. **Enable RLS**: Uncomment the RLS policies in the migration for multi-tenant setups
3. **Limit Function Access**: Use Supabase's function-level authentication if needed
4. **Monitor Usage**: Set up alerts for unusual webhook activity

## Next Steps

- [View the React components example](./examples/react-upload.tsx)
- [Customize the webhook handler](./supabase/functions/doclayer-webhook/index.ts)
- [Use the TypeScript client](./lib/doclayer-client.ts)
