/**
 * @doclayer/supabase - Supabase integration for Doclayer
 *
 * This package provides:
 * - TypeScript client for the Doclayer API
 * - React hooks for real-time document status updates
 * - Supabase Edge Function handlers for webhooks
 * - Database migrations for syncing Doclayer data
 */

// Re-export everything from the client
export {
  DoclayerClient,
  DoclayerError,
  createDoclayerClient,
  type DoclayerConfig,
  type UploadOptions,
  type PresignOptions,
  type PresignResponse,
  type IngestionJob,
  type Document,
  type DocumentChunk,
  type Extraction,
  type SearchOptions,
  type SearchResult,
  type AgentTemplate,
  type Project,
  type WebhookCreate,
  type Webhook,
} from './doclayer-client';

// Re-export React hooks (conditionally available)
export {
  useDocumentStatus,
  useDocumentList,
  useWebhookEvents,
  type DoclayerDocument,
  type UseDocumentStatusOptions,
  type UseDocumentStatusResult,
  type UseDocumentListOptions,
  type UseDocumentListResult,
  type WebhookEvent,
  type UseWebhookEventsOptions,
  type UseWebhookEventsResult,
} from './use-doclayer-realtime';
