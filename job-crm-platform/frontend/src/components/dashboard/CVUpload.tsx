"use client";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, FileText } from "lucide-react";
import api from "@/lib/api";

export function CVUpload() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("cv", file);
      return api.post("/api/upload/cv", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => { toast.success("CV uploaded!"); qc.invalidateQueries({ queryKey: ["cv"] }); },
    onError: () => toast.error("Upload failed"),
  });

  const onDrop = useCallback(
    (files: File[]) => { if (files[0]) mutation.mutate(files[0]); },
    [mutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
  });

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={18} className="text-blue-600" />
        <h3 className="font-semibold text-sm">CV / Resume</h3>
      </div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <input {...getInputProps()} />
        <Upload size={24} className="mx-auto mb-2 text-gray-400" />
        <p className="text-xs text-gray-500">
          {isDragActive ? "Drop it here" : "Drag & drop PDF or DOCX, or click"}
        </p>
      </div>
      {mutation.isPending && (
        <p className="text-xs text-blue-600 mt-2 animate-pulse">Uploading…</p>
      )}
    </div>
  );
}
