/**
 * Next.js App Router Example - Document Upload with Real-time Status
 *
 * This example demonstrates:
 * - File upload to Doclayer via Supabase Edge Function
 * - Real-time document status tracking with Supabase Realtime
 * - Progress indicators and status updates
 *
 * Required setup:
 * 1. Install dependencies: npm install @supabase/supabase-js
 * 2. Set up environment variables in .env.local:
 *    - NEXT_PUBLIC_SUPABASE_URL
 *    - NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 3. Deploy the Supabase Edge Functions
 * 4. Run migrations to create the tables
 */

'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useDocumentStatus, useDocumentList, type DoclayerDocument } from '../../lib/use-doclayer-realtime';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Status badge colors
const statusColors: Record<DoclayerDocument['status'], string> = {
  pending: 'bg-gray-100 text-gray-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-yellow-100 text-yellow-800',
};

export default function DoclayerUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Real-time document list
  const { documents, isLoading: isLoadingDocs } = useDocumentList({
    supabase,
    limit: 10,
    realtime: true,
  });

  // Track the currently uploading document
  const { document: currentDocument, status } = useDocumentStatus({
    supabase,
    jobId: currentJobId || '',
    onComplete: (doc) => {
      console.log('Processing complete!', doc);
    },
    onError: (doc) => {
      console.error('Processing failed:', doc.error_message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadError(null);
    }
  };

  const handleUpload = useCallback(async () => {
    if (!file || !projectId) {
      setUploadError('Please select a file and enter a project ID');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to upload documents');
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);

      // Upload via Edge Function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-document`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Upload failed');
      }

      // Start tracking the job
      setCurrentJobId(result.job_id);
      setFile(null);

      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [file, projectId]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Doclayer Document Upload
        </h1>

        {/* Upload Form */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Upload Document</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="project-id" className="block text-sm font-medium text-gray-700">
                Project ID
              </label>
              <input
                id="project-id"
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Enter your Doclayer project ID"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="file-input" className="block text-sm font-medium text-gray-700">
                Document
              </label>
              <input
                id="file-input"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {uploadError && (
              <div className="text-red-600 text-sm">{uploadError}</div>
            )}

            <button
              onClick={handleUpload}
              disabled={isUploading || !file || !projectId}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                'Upload Document'
              )}
            </button>
          </div>
        </div>

        {/* Current Upload Status */}
        {currentJobId && currentDocument && (
          <div className="bg-white shadow rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Current Upload</h2>
            <DocumentCard document={currentDocument} showDetails />
          </div>
        )}

        {/* Recent Documents */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Documents</h2>

          {isLoadingDocs ? (
            <div className="text-center py-8 text-gray-500">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No documents yet</div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <DocumentCard key={doc.id} document={doc} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Document Card Component
function DocumentCard({
  document,
  showDetails = false,
}: {
  document: DoclayerDocument;
  showDetails?: boolean;
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {document.filename || document.doclayer_job_id}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(document.created_at).toLocaleString()}
          </p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[document.status]}`}>
          {document.status}
        </span>
      </div>

      {showDetails && (
        <div className="mt-4 space-y-2">
          {document.status === 'processing' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full animate-pulse"
                style={{ width: '60%' }}
              />
            </div>
          )}

          {document.status === 'completed' && document.insights_count > 0 && (
            <p className="text-sm text-green-600">
              ✓ {document.insights_count} insights extracted
            </p>
          )}

          {document.status === 'failed' && document.error_message && (
            <p className="text-sm text-red-600">
              ✗ {document.error_message}
            </p>
          )}

          {document.confidence_metrics && (
            <div className="text-xs text-gray-500">
              <p>Confidence: {JSON.stringify(document.confidence_metrics)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
