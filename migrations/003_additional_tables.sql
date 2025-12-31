-- Additional tables for batch processing, billing alerts, usage reports, and workflows
-- These tables support the expanded webhook event handlers

-- ============================================================================
-- Batches Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT UNIQUE NOT NULL,
    project_id TEXT,
    total_documents INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    error_message TEXT,
    error_type TEXT,
    duration_seconds NUMERIC,
    raw_payload JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doclayer_batches_status ON doclayer_batches(status);
CREATE INDEX IF NOT EXISTS idx_doclayer_batches_project ON doclayer_batches(project_id);
CREATE INDEX IF NOT EXISTS idx_doclayer_batches_created ON doclayer_batches(created_at DESC);

-- ============================================================================
-- Billing Alerts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_billing_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'credits_low', 'credits_exhausted', 'payment_failed', 'subscription_expired'
    )),
    current_balance NUMERIC,
    threshold NUMERIC,
    currency TEXT DEFAULT 'USD',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doclayer_billing_alerts_type ON doclayer_billing_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_doclayer_billing_alerts_created ON doclayer_billing_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doclayer_billing_alerts_unack ON doclayer_billing_alerts(acknowledged) WHERE NOT acknowledged;

-- ============================================================================
-- Usage Reports Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_usage_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_documents INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    total_cost NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    breakdown JSONB,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doclayer_usage_reports_period ON doclayer_usage_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_doclayer_usage_reports_created ON doclayer_usage_reports(created_at DESC);

-- ============================================================================
-- Workflows Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id TEXT UNIQUE NOT NULL,
    workflow_type TEXT NOT NULL,
    document_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    )),
    result JSONB,
    error_message TEXT,
    error_type TEXT,
    duration_seconds NUMERIC,
    raw_payload JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doclayer_workflows_status ON doclayer_workflows(status);
CREATE INDEX IF NOT EXISTS idx_doclayer_workflows_type ON doclayer_workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_doclayer_workflows_document ON doclayer_workflows(document_id);
CREATE INDEX IF NOT EXISTS idx_doclayer_workflows_created ON doclayer_workflows(created_at DESC);

-- ============================================================================
-- Enable Realtime for new tables
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE doclayer_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE doclayer_billing_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE doclayer_workflows;

ALTER TABLE doclayer_batches REPLICA IDENTITY FULL;
ALTER TABLE doclayer_billing_alerts REPLICA IDENTITY FULL;
ALTER TABLE doclayer_workflows REPLICA IDENTITY FULL;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE doclayer_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE doclayer_billing_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE doclayer_usage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE doclayer_workflows ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role has full access to batches"
    ON doclayer_batches FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to billing_alerts"
    ON doclayer_billing_alerts FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to usage_reports"
    ON doclayer_usage_reports FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to workflows"
    ON doclayer_workflows FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Authenticated users read access
CREATE POLICY "Authenticated users can view batches"
    ON doclayer_batches FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view billing_alerts"
    ON doclayer_billing_alerts FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view usage_reports"
    ON doclayer_usage_reports FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view workflows"
    ON doclayer_workflows FOR SELECT TO authenticated
    USING (true);

-- ============================================================================
-- Updated Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_doclayer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_doclayer_batches_updated_at
    BEFORE UPDATE ON doclayer_batches
    FOR EACH ROW EXECUTE FUNCTION update_doclayer_updated_at();

CREATE TRIGGER trigger_doclayer_workflows_updated_at
    BEFORE UPDATE ON doclayer_workflows
    FOR EACH ROW EXECUTE FUNCTION update_doclayer_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE doclayer_batches IS 'Tracks batch document processing jobs from Doclayer';
COMMENT ON TABLE doclayer_billing_alerts IS 'Stores billing alerts (low credits, exhausted, etc.)';
COMMENT ON TABLE doclayer_usage_reports IS 'Periodic usage reports from Doclayer billing';
COMMENT ON TABLE doclayer_workflows IS 'Tracks individual workflow executions (extraction, classification, etc.)';
