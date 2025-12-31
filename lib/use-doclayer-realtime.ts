/**
 * Supabase Realtime hooks for Doclayer document status updates
 *
 * These hooks enable real-time tracking of document processing status
 * by subscribing to Postgres changes via Supabase Realtime.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface DoclayerDocument {
  id: string;
  doclayer_job_id: string;
  doclayer_document_id: string | null;
  filename: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  insights_count: number;
  confidence_metrics: Record<string, number> | null;
  error_message: string | null;
  error_type: string | null;
  project_id: string | null;
  agent_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseDocumentStatusOptions {
  /** Supabase client instance */
  supabase: SupabaseClient;
  /** The job ID to track */
  jobId: string;
  /** Callback when status changes */
  onStatusChange?: (doc: DoclayerDocument) => void;
  /** Callback when processing completes */
  onComplete?: (doc: DoclayerDocument) => void;
  /** Callback when processing fails */
  onError?: (doc: DoclayerDocument) => void;
}

export interface UseDocumentStatusResult {
  document: DoclayerDocument | null;
  status: DoclayerDocument['status'] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseDocumentListOptions {
  /** Supabase client instance */
  supabase: SupabaseClient;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by status */
  status?: DoclayerDocument['status'];
  /** Maximum number of documents to return */
  limit?: number;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface UseDocumentListResult {
  documents: DoclayerDocument[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for tracking a single document's processing status in real-time
 *
 * @example
 * ```tsx
 * const { document, status, isLoading } = useDocumentStatus({
 *   supabase,
 *   jobId: 'job_abc123',
 *   onComplete: (doc) => console.log('Processing complete!', doc),
 *   onError: (doc) => console.error('Processing failed:', doc.error_message),
 * });
 * ```
 */
export function useDocumentStatus(options: UseDocumentStatusOptions): UseDocumentStatusResult {
  const { supabase, jobId, onStatusChange, onComplete, onError } = options;

  const [document, setDocument] = useState<DoclayerDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const previousStatusRef = useRef<string | null>(null);

  const fetchDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('doclayer_documents')
        .select('*')
        .eq('doclayer_job_id', jobId)
        .single();

      if (fetchError) throw fetchError;

      setDocument(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch document'));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, jobId]);

  useEffect(() => {
    // Initial fetch
    fetchDocument();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`doclayer_document_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doclayer_documents',
          filter: `doclayer_job_id=eq.${jobId}`,
        },
        (payload) => {
          const newDoc = payload.new as DoclayerDocument;
          setDocument(newDoc);

          // Fire callbacks based on status changes
          if (previousStatusRef.current !== newDoc.status) {
            onStatusChange?.(newDoc);

            if (newDoc.status === 'completed') {
              onComplete?.(newDoc);
            } else if (newDoc.status === 'failed') {
              onError?.(newDoc);
            }

            previousStatusRef.current = newDoc.status;
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [supabase, jobId, fetchDocument, onStatusChange, onComplete, onError]);

  return {
    document,
    status: document?.status ?? null,
    isLoading,
    error,
    refetch: fetchDocument,
  };
}

/**
 * Hook for tracking multiple documents with optional real-time updates
 *
 * @example
 * ```tsx
 * const { documents, isLoading } = useDocumentList({
 *   supabase,
 *   projectId: 'proj_123',
 *   status: 'processing',
 *   realtime: true,
 * });
 * ```
 */
export function useDocumentList(options: UseDocumentListOptions): UseDocumentListResult {
  const { supabase, projectId, status, limit = 50, realtime = true } = options;

  const [documents, setDocuments] = useState<DoclayerDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from('doclayer_documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setDocuments(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch documents'));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, projectId, status, limit]);

  useEffect(() => {
    // Initial fetch
    fetchDocuments();

    if (!realtime) return;

    // Build filter for realtime subscription
    let filter: string | undefined;
    if (projectId && status) {
      filter = `project_id=eq.${projectId},status=eq.${status}`;
    } else if (projectId) {
      filter = `project_id=eq.${projectId}`;
    } else if (status) {
      filter = `status=eq.${status}`;
    }

    // Subscribe to realtime updates
    const channel = supabase
      .channel('doclayer_documents_list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doclayer_documents',
          filter,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newDoc = payload.new as DoclayerDocument;
            setDocuments((prev) => [newDoc, ...prev].slice(0, limit));
          } else if (payload.eventType === 'UPDATE') {
            const updatedDoc = payload.new as DoclayerDocument;
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === updatedDoc.id ? updatedDoc : doc
              )
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setDocuments((prev) => prev.filter((doc) => doc.id !== deletedId));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [supabase, projectId, status, limit, realtime, fetchDocuments]);

  return {
    documents,
    isLoading,
    error,
    refetch: fetchDocuments,
  };
}

/**
 * Hook for subscribing to all webhook events (for debugging/monitoring)
 *
 * @example
 * ```tsx
 * const { events, clearEvents } = useWebhookEvents({
 *   supabase,
 *   onEvent: (event) => console.log('Webhook received:', event),
 * });
 * ```
 */
export interface WebhookEvent {
  id: string;
  event_type: string;
  event_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  received_at: string;
}

export interface UseWebhookEventsOptions {
  supabase: SupabaseClient;
  limit?: number;
  onEvent?: (event: WebhookEvent) => void;
}

export interface UseWebhookEventsResult {
  events: WebhookEvent[];
  isLoading: boolean;
  error: Error | null;
  clearEvents: () => void;
}

export function useWebhookEvents(options: UseWebhookEventsOptions): UseWebhookEventsResult {
  const { supabase, limit = 100, onEvent } = options;

  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Initial fetch
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('doclayer_webhook_events')
          .select('*')
          .order('received_at', { ascending: false })
          .limit(limit);

        if (fetchError) throw fetchError;
        setEvents(data || []);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch events'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();

    // Subscribe to new events
    const channel = supabase
      .channel('doclayer_webhook_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'doclayer_webhook_events',
        },
        (payload) => {
          const newEvent = payload.new as WebhookEvent;
          setEvents((prev) => [newEvent, ...prev].slice(0, limit));
          onEvent?.(newEvent);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [supabase, limit, onEvent]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    isLoading,
    error,
    clearEvents,
  };
}
