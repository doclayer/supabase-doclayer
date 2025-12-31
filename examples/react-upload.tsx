/**
 * Example: React component for uploading documents to Doclayer via Supabase
 * 
 * This component uses Supabase Auth for authentication and the
 * upload-document Edge Function to send files to Doclayer.
 */

import { useState, useCallback } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

interface UploadResult {
  success: boolean;
  job_id?: string;
  status?: string;
  message?: string;
  error?: string;
}

interface DocumentUploadProps {
  projectId: string;
  agentId?: string;
  onUploadComplete?: (result: UploadResult) => void;
}

export function DocumentUpload({ projectId, agentId, onUploadComplete }: DocumentUploadProps) {
  const supabase = useSupabaseClient();
  const user = useUser();
  
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress('Uploading...');

    try {
      // Get the current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);
      if (agentId) {
        formData.append('agent_id', agentId);
      }

      // Call the Edge Function
      const { data, error: fnError } = await supabase.functions.invoke<UploadResult>(
        'upload-document',
        {
          body: formData,
        }
      );

      if (fnError) {
        throw fnError;
      }

      if (data?.success) {
        setProgress(`Uploaded! Job ID: ${data.job_id}`);
        onUploadComplete?.(data);
      } else {
        throw new Error(data?.error || 'Upload failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setProgress('');
    } finally {
      setUploading(false);
    }
  }, [supabase, projectId, agentId, onUploadComplete]);

  if (!user) {
    return (
      <div className="p-4 border rounded-lg bg-yellow-50 text-yellow-800">
        Please sign in to upload documents.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
        <input
          type="file"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
          id="file-upload"
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
        />
        <label
          htmlFor="file-upload"
          className={`cursor-pointer ${uploading ? 'opacity-50' : ''}`}
        >
          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-sm text-gray-600">
              {uploading ? (
                <span>Uploading...</span>
              ) : (
                <>
                  <span className="text-blue-600 font-medium">Click to upload</span>
                  {' or drag and drop'}
                </>
              )}
            </div>
            <p className="text-xs text-gray-500">
              PDF, DOC, DOCX, TXT, PNG, JPG up to 50MB
            </p>
          </div>
        </label>
      </div>

      {progress && (
        <div className="p-3 bg-green-50 text-green-800 rounded-lg text-sm">
          {progress}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm">
          Error: {error}
        </div>
      )}
    </div>
  );
}

/**
 * Example: Document list component with real-time updates
 */

interface DoclayerDocument {
  id: string;
  doclayer_job_id: string;
  filename: string;
  status: string;
  insights_count: number | null;
  created_at: string;
}

export function DocumentList({ projectId }: { projectId: string }) {
  const supabase = useSupabaseClient();
  const [documents, setDocuments] = useState<DoclayerDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    async function fetchDocuments() {
      const { data, error } = await supabase
        .from('doclayer_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setDocuments(data);
      }
      setLoading(false);
    }

    fetchDocuments();
  }, [supabase, projectId]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('doclayer-docs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doclayer_documents',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDocuments((prev) => [payload.new as DoclayerDocument, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === (payload.new as DoclayerDocument).id
                  ? (payload.new as DoclayerDocument)
                  : doc
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setDocuments((prev) =>
              prev.filter((doc) => doc.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, projectId]);

  if (loading) {
    return <div className="animate-pulse">Loading documents...</div>;
  }

  if (documents.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No documents yet. Upload one to get started!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="p-4 border rounded-lg flex items-center justify-between"
        >
          <div>
            <div className="font-medium">{doc.filename}</div>
            <div className="text-sm text-gray-500">
              {new Date(doc.created_at).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {doc.insights_count !== null && (
              <span className="text-sm text-gray-600">
                {doc.insights_count} insights
              </span>
            )}
            <StatusBadge status={doc.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

// Missing import for useEffect
import { useEffect } from 'react';
