-- Doclayer Documents Integration Schema
-- This migration creates tables for syncing Doclayer document processing results

-- ============================================================================
-- Main Documents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Doclayer identifiers
    doclayer_job_id TEXT UNIQUE NOT NULL,
    doclayer_document_id TEXT,
    
    -- Document metadata
    filename TEXT,
    file_type TEXT,
    file_size_bytes BIGINT,
    checksum TEXT,
    
    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    
    -- Processing results
    insights_count INTEGER DEFAULT 0,
    confidence_metrics JSONB,
    processing_metrics JSONB,
    processing_time_seconds NUMERIC,
    
    -- Error handling
    error_message TEXT,
    error_type TEXT,
    
    -- Agent/template info
    agent_template_id TEXT,
    project_id TEXT,
    
    -- Full webhook payload for reference
    raw_payload JSONB,
    
    -- Timestamps
    doclayer_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_doclayer_documents_status ON doclayer_documents(status);
CREATE INDEX IF NOT EXISTS idx_doclayer_documents_project ON doclayer_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_doclayer_documents_agent ON doclayer_documents(agent_template_id);
CREATE INDEX IF NOT EXISTS idx_doclayer_documents_created ON doclayer_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doclayer_documents_job_id ON doclayer_documents(doclayer_job_id);
CREATE INDEX IF NOT EXISTS idx_doclayer_documents_doc_id ON doclayer_documents(doclayer_document_id);

-- ============================================================================
-- Extractions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parent document reference
    document_id UUID NOT NULL REFERENCES doclayer_documents(id) ON DELETE CASCADE,
    
    -- Extraction details
    extraction_type TEXT NOT NULL,
    extraction_key TEXT,
    content JSONB NOT NULL,
    
    -- Quality metrics
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    
    -- Source location
    page_number INTEGER,
    bounding_box JSONB,
    source_text TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for extractions
CREATE INDEX IF NOT EXISTS idx_doclayer_extractions_document ON doclayer_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_doclayer_extractions_type ON doclayer_extractions(extraction_type);
CREATE INDEX IF NOT EXISTS idx_doclayer_extractions_key ON doclayer_extractions(extraction_key);

-- ============================================================================
-- Webhook Events Log (for debugging and replay)
-- ============================================================================

CREATE TABLE IF NOT EXISTS doclayer_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event details
    event_type TEXT NOT NULL,
    event_id TEXT,
    
    -- Payload
    payload JSONB NOT NULL,
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Metadata
    received_at TIMESTAMPTZ DEFAULT NOW(),
    signature_valid BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_doclayer_webhook_events_type ON doclayer_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_doclayer_webhook_events_processed ON doclayer_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_doclayer_webhook_events_received ON doclayer_webhook_events(received_at DESC);

-- ============================================================================
-- Updated Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_doclayer_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_doclayer_documents_updated_at ON doclayer_documents;
CREATE TRIGGER trigger_doclayer_documents_updated_at
    BEFORE UPDATE ON doclayer_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_doclayer_documents_updated_at();

-- ============================================================================
-- Row Level Security (optional - enable for multi-tenant)
-- ============================================================================

-- Uncomment to enable RLS:
-- ALTER TABLE doclayer_documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE doclayer_extractions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE doclayer_webhook_events ENABLE ROW LEVEL SECURITY;

-- Example policy for user-based access:
-- CREATE POLICY "Users can view their own documents" ON doclayer_documents
--     FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE doclayer_documents IS 'Stores Doclayer document processing results synced via webhooks';
COMMENT ON TABLE doclayer_extractions IS 'Stores individual extraction results from Doclayer document processing';
COMMENT ON TABLE doclayer_webhook_events IS 'Log of all webhook events received from Doclayer for debugging and replay';

COMMENT ON COLUMN doclayer_documents.doclayer_job_id IS 'Unique job ID from Doclayer ingestion';
COMMENT ON COLUMN doclayer_documents.doclayer_document_id IS 'Document ID assigned by Doclayer after processing';
COMMENT ON COLUMN doclayer_documents.confidence_metrics IS 'JSON object with extraction confidence scores';
COMMENT ON COLUMN doclayer_documents.raw_payload IS 'Complete webhook payload for reference';
