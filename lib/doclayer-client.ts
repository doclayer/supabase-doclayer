/**
 * Doclayer TypeScript Client for Supabase Edge Functions
 * 
 * A lightweight, fully-typed client for interacting with the Doclayer API
 * from Supabase Edge Functions or any Deno/Node.js environment.
 */

// ============================================================================
// Types
// ============================================================================

export interface DoclayerConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface UploadOptions {
  file: Blob | File;
  projectId: string;
  agentId?: string;
  filename?: string;
}

export interface PresignOptions {
  filename: string;
  contentType: string;
  projectId: string;
}

export interface PresignResponse {
  upload_url: string;
  job_id: string;
  expires_in: number;
}

export interface IngestionJob {
  job_id: string;
  document_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  filename?: string;
  file_type?: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
}

export interface Document {
  id: string;
  job_id: string;
  filename: string;
  file_type: string;
  status: string;
  page_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  content: string;
  page_number?: number;
  chunk_index: number;
  metadata?: Record<string, unknown>;
}

export interface Extraction {
  id: string;
  type: string;
  key?: string;
  value: unknown;
  confidence?: number;
  page?: number;
  source_text?: string;
}

export interface SearchOptions {
  query: string;
  projectId?: string;
  limit?: number;
  threshold?: number;
}

export interface SearchResult {
  document_id: string;
  chunk_id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  extraction_schema?: Record<string, unknown>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface WebhookCreate {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  secret?: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  secret?: string; // Only returned on creation
}

// ============================================================================
// Client Implementation
// ============================================================================

export class DoclayerClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: DoclayerConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.doclayer.ai').replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      formData?: FormData;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options?.headers,
    };

    if (options?.body && !options?.formData) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options?.formData || (options?.body ? JSON.stringify(options.body) : undefined),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new DoclayerError(
        error.message || error.error?.message || 'Request failed',
        response.status,
        error
      );
    }

    return response.json();
  }

  // ============================================================================
  // Ingestion API
  // ============================================================================

  ingest = {
    /**
     * Get a presigned URL for direct file upload
     */
    presign: async (options: PresignOptions): Promise<PresignResponse> => {
      return this.request<PresignResponse>('POST', '/api/v4/ingest/presign', {
        body: {
          filename: options.filename,
          content_type: options.contentType,
          project_id: options.projectId,
        },
      });
    },

    /**
     * Upload a document for processing
     */
    upload: async (options: UploadOptions): Promise<IngestionJob> => {
      const formData = new FormData();
      formData.append('file', options.file, options.filename);
      formData.append('project_id', options.projectId);
      
      if (options.agentId) {
        formData.append('agent_id', options.agentId);
      }

      return this.request<IngestionJob>('POST', '/api/v4/ingest', {
        formData,
      });
    },

    /**
     * Get ingestion job status
     */
    getJob: async (jobId: string): Promise<IngestionJob> => {
      return this.request<IngestionJob>('GET', `/api/v4/ingestions/${jobId}`);
    },

    /**
     * List ingestion jobs
     */
    listJobs: async (options?: { status?: string; limit?: number }): Promise<IngestionJob[]> => {
      const params = new URLSearchParams();
      if (options?.status) params.append('status', options.status);
      if (options?.limit) params.append('limit', options.limit.toString());
      
      const query = params.toString() ? `?${params}` : '';
      return this.request<IngestionJob[]>('GET', `/api/v4/ingestions${query}`);
    },

    /**
     * Cancel an ingestion job
     */
    cancel: async (jobId: string): Promise<void> => {
      await this.request<void>('POST', `/api/v4/ingestions/${jobId}/cancel`);
    },

    /**
     * Retry a failed ingestion job
     */
    retry: async (jobId: string): Promise<IngestionJob> => {
      return this.request<IngestionJob>('POST', `/api/v4/ingestions/${jobId}/retry`);
    },
  };

  // ============================================================================
  // Documents API
  // ============================================================================

  documents = {
    /**
     * List documents
     */
    list: async (options?: { projectId?: string; status?: string; limit?: number }): Promise<Document[]> => {
      const params = new URLSearchParams();
      if (options?.projectId) params.append('project_id', options.projectId);
      if (options?.status) params.append('status', options.status);
      if (options?.limit) params.append('limit', options.limit.toString());
      
      const query = params.toString() ? `?${params}` : '';
      return this.request<Document[]>('GET', `/api/v4/documents${query}`);
    },

    /**
     * Get document metadata
     */
    get: async (documentId: string): Promise<Document> => {
      return this.request<Document>('GET', `/api/v4/documents/${documentId}`);
    },

    /**
     * Get document chunks
     */
    getChunks: async (documentId: string): Promise<DocumentChunk[]> => {
      return this.request<DocumentChunk[]>('GET', `/api/v4/documents/${documentId}/chunks`);
    },

    /**
     * Get document extractions
     */
    getExtractions: async (documentId: string): Promise<{ extractions: Extraction[] }> => {
      return this.request<{ extractions: Extraction[] }>('GET', `/api/v4/documents/${documentId}/extractions`);
    },

    /**
     * Delete a document
     */
    delete: async (documentId: string): Promise<void> => {
      await this.request<void>('DELETE', `/api/v4/documents/${documentId}`);
    },
  };

  // ============================================================================
  // Search API
  // ============================================================================

  search = {
    /**
     * Vector search across documents
     */
    vector: async (options: SearchOptions): Promise<SearchResult[]> => {
      return this.request<SearchResult[]>('POST', '/api/v4/search/vector', {
        body: {
          query: options.query,
          project_id: options.projectId,
          limit: options.limit || 10,
          threshold: options.threshold,
        },
      });
    },

    /**
     * Graph-based search
     */
    graph: async (options: SearchOptions): Promise<SearchResult[]> => {
      return this.request<SearchResult[]>('POST', '/api/v4/search/graph', {
        body: {
          query: options.query,
          project_id: options.projectId,
          limit: options.limit || 10,
        },
      });
    },
  };

  // ============================================================================
  // Projects API
  // ============================================================================

  projects = {
    /**
     * List projects
     */
    list: async (): Promise<Project[]> => {
      return this.request<Project[]>('GET', '/api/v4/projects');
    },

    /**
     * Get project details
     */
    get: async (projectId: string): Promise<Project> => {
      return this.request<Project>('GET', `/api/v4/projects/${projectId}`);
    },

    /**
     * Create a new project
     */
    create: async (name: string, description?: string): Promise<Project> => {
      return this.request<Project>('POST', '/api/v4/projects', {
        body: { name, description },
      });
    },

    /**
     * Delete a project
     */
    delete: async (projectId: string): Promise<void> => {
      await this.request<void>('DELETE', `/api/v4/projects/${projectId}`);
    },
  };

  // ============================================================================
  // Agent Templates API
  // ============================================================================

  agents = {
    /**
     * List available agent templates
     */
    list: async (category?: string): Promise<AgentTemplate[]> => {
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      return this.request<AgentTemplate[]>('GET', `/api/v4/agents/templates${query}`);
    },

    /**
     * Get agent template details
     */
    get: async (templateId: string): Promise<AgentTemplate> => {
      return this.request<AgentTemplate>('GET', `/api/v4/agents/templates/${templateId}`);
    },
  };

  // ============================================================================
  // Webhooks API
  // ============================================================================

  webhooks = {
    /**
     * List webhooks
     */
    list: async (): Promise<Webhook[]> => {
      return this.request<Webhook[]>('GET', '/api/v4/webhooks');
    },

    /**
     * Create a webhook
     */
    create: async (webhook: WebhookCreate): Promise<Webhook> => {
      return this.request<Webhook>('POST', '/api/v4/webhooks', {
        body: webhook,
      });
    },

    /**
     * Get webhook details
     */
    get: async (webhookId: string): Promise<Webhook> => {
      return this.request<Webhook>('GET', `/api/v4/webhooks/${webhookId}`);
    },

    /**
     * Delete a webhook
     */
    delete: async (webhookId: string): Promise<void> => {
      await this.request<void>('DELETE', `/api/v4/webhooks/${webhookId}`);
    },

    /**
     * Test a webhook
     */
    test: async (webhookId: string): Promise<{ success: boolean; status_code?: number; message: string }> => {
      return this.request<{ success: boolean; status_code?: number; message: string }>(
        'POST',
        `/api/v4/webhooks/${webhookId}/test`
      );
    },
  };

  // ============================================================================
  // Billing API
  // ============================================================================

  billing = {
    /**
     * Get credits balance
     */
    getCredits: async (): Promise<{ balance: number; currency: string }> => {
      return this.request<{ balance: number; currency: string }>('GET', '/api/v4/billing/credits');
    },

    /**
     * Get usage summary
     */
    getUsage: async (period?: string): Promise<Record<string, unknown>> => {
      const query = period ? `?period=${period}` : '';
      return this.request<Record<string, unknown>>('GET', `/api/v4/billing/usage${query}`);
    },
  };
}

// ============================================================================
// Error Class
// ============================================================================

export class DoclayerError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'DoclayerError';
    this.status = status;
    this.details = details;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Doclayer client from environment variables
 */
export function createDoclayerClient(): DoclayerClient {
  const apiKey = Deno.env.get('DOCLAYER_API_KEY');
  if (!apiKey) {
    throw new Error('DOCLAYER_API_KEY environment variable is required');
  }

  return new DoclayerClient({
    apiKey,
    baseUrl: Deno.env.get('DOCLAYER_API_URL') || 'https://api.doclayer.ai',
  });
}
