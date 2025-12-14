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
      <div className="rounded-lg border border-slate-300 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Add photos</span>
            <span className="ml-2">(max {maxFiles}, {Math.round(maxFileSize / (1024 * 1024))}MB each)</span>
          </div>
          <label className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
            Choose files
            <input type="file" accept={accept} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {files.map((file) => (
              <div key={file.name} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-xs">
                <div className="truncate max-w-[60%]">
                  {file.name}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{Math.round(file.size / 1024)} KB</span>
                  <button type="button" className="text-rose-600 hover:underline" onClick={() => removeFile(file.name)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <span>Total size: {Math.round(totalSize / 1024)} KB</span>
          {onUpload && showUploadAction && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          )}
        </div>
      </div>

      {uploadedUrls.length > 0 && (
        <div className="text-xs text-slate-600">
          Uploaded:
          <ul className="list-disc ml-5 mt-1">
            {uploadedUrls.map((u) => (
              <li key={u}>
                <a href={u} className="text-emerald-700 hover:underline" target="_blank" rel="noreferrer">
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
