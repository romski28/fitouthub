"use client";

import { useCallback, useMemo, useState } from "react";

export type FileUploaderProps = {
  maxFiles?: number;
  maxFileSize?: number; // bytes
  accept?: string;
  onFilesChange?: (files: File[]) => void;
  onUpload?: (files: File[]) => Promise<string[]>; // returns URLs
  defaultFiles?: File[];
  className?: string;
  showUploadAction?: boolean;
};

export default function FileUploader({
  maxFiles = 5,
  maxFileSize = 10 * 1024 * 1024,
  accept = "image/*",
  onFilesChange,
  onUpload,
  defaultFiles = [],
  className,
  showUploadAction = true,
}: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>(defaultFiles);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

  const totalSize = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  const validate = useCallback((incoming: File[]) => {
    if (files.length + incoming.length > maxFiles) {
      setError(`You can upload up to ${maxFiles} files.`);
      return false;
    }
    if (incoming.some((f) => f.size > maxFileSize)) {
      setError(`Each file must be ${Math.round(maxFileSize / (1024 * 1024))}MB or smaller.`);
      return false;
    }
    setError(null);
    return true;
  }, [files.length, maxFiles, maxFileSize]);

  const addFiles = (incomingList: FileList | null) => {
    if (!incomingList) return;
    const incoming = Array.from(incomingList);
    if (!validate(incoming)) return;
    const next = [...files, ...incoming];
    setFiles(next);
    onFilesChange?.(next);
  };

  const removeFile = (name: string) => {
    const next = files.filter((f) => f.name !== name);
    setFiles(next);
    onFilesChange?.(next);
  };

  const handleUpload = async () => {
    if (!onUpload) return;
    try {
      setUploading(true);
      const urls = await onUpload(files);
      setUploadedUrls(urls);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className ?? "grid gap-2"}>
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            <span className="font-semibold text-strong">Add photos</span>
            <span className="ml-2">(max {maxFiles}, {Math.round(maxFileSize / (1024 * 1024))}MB each)</span>
          </div>
          <label className="rounded-md bg-action px-3 py-1.5 text-xs font-semibold text-white hover:bg-action-hover cursor-pointer transition">
            Choose files
            <input type="file" accept={accept} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {files.map((file) => (
              <div key={file.name} className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-xs">
                <div className="truncate max-w-[60%] text-strong">
                  {file.name}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">{Math.round(file.size / 1024)} KB</span>
                  <button type="button" className="text-danger hover:underline" onClick={() => removeFile(file.name)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>Total size: {Math.round(totalSize / 1024)} KB</span>
          {onUpload && showUploadAction && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="rounded-md bg-primary px-3 py-1.5 font-semibold text-white hover:bg-primary-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          )}
        </div>
      </div>

      {uploadedUrls.length > 0 && (
        <div className="text-xs text-muted">
          Uploaded:
          <ul className="list-disc ml-5 mt-1">
            {uploadedUrls.map((u) => (
              <li key={u}>
                <a href={u} className="text-action hover:underline" target="_blank" rel="noreferrer">
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
