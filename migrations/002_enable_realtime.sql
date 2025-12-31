-- Enable Supabase Realtime for Doclayer tables
-- This allows real-time subscriptions to document status changes

-- ============================================================================
-- Enable Realtime Publications
-- ============================================================================

-- Enable realtime for doclayer_documents table
ALTER PUBLICATION supabase_realtime ADD TABLE doclayer_documents;

-- Enable realtime for doclayer_webhook_events table (for monitoring)
ALTER PUBLICATION supabase_realtime ADD TABLE doclayer_webhook_events;

-- ============================================================================
-- Replica Identity (required for UPDATE/DELETE events)
-- ============================================================================

-- Set replica identity to FULL for complete row data in realtime events
ALTER TABLE doclayer_documents REPLICA IDENTITY FULL;
ALTER TABLE doclayer_webhook_events REPLICA IDENTITY FULL;

-- ============================================================================
-- Row Level Security Policies for Realtime
-- ============================================================================

-- Enable RLS (required for realtime with authenticated users)
ALTER TABLE doclayer_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for webhooks)
CREATE POLICY "Service role has full access to documents"
    ON doclayer_documents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Authenticated users can view all documents (customize as needed)
-- For multi-tenant apps, add user_id column and filter by auth.uid()
CREATE POLICY "Authenticated users can view documents"
    ON doclayer_documents
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Authenticated users can insert documents (via upload function)
CREATE POLICY "Authenticated users can insert documents"
    ON doclayer_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ============================================================================
-- Webhook Events RLS (read-only for authenticated users)
-- ============================================================================

ALTER TABLE doclayer_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to webhook events"
    ON doclayer_webhook_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can view webhook events"
    ON doclayer_webhook_events
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON POLICY "Authenticated users can view documents" ON doclayer_documents IS
    'Allows authenticated users to view all documents. Customize this for multi-tenant setups.';
