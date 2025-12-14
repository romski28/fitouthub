"use client";

import { useState, useRef, useEffect } from "react";

interface TagInputProps {
  label: string;
  placeholder?: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestions: string[];
  multiple?: boolean; // If false, only one tag allowed (converted to pill)
  disabled?: boolean;
}

export function TagInput({
  label,
  placeholder = "Type to search...",
  tags,
  onTagsChange,
  suggestions,
  multiple = true,
  disabled = false,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [filtered, setFiltered] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.trim()) {
      const lower = value.toLowerCase();
      setFiltered(
        suggestions.filter(
          (s) => s.toLowerCase().includes(lower) && !tags.includes(s)
        )
      );
      setShowSuggestions(true);
    } else {
      setFiltered([]);
      setShowSuggestions(false);
    }
  };

  const handleAddTag = (tag: string) => {
    if (!tag.trim()) return;

    if (multiple) {
      if (!tags.includes(tag)) {
        onTagsChange([...tags, tag]);
      }
    } else {
      onTagsChange([tag]);
    }

    setInput("");
    setFiltered([]);
    setShowSuggestions(false);
  };

  const handleRemoveTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      handleAddTag(input.trim());
    }
  };

  // If single tag mode and a tag exists, show pill instead of input
  if (!multiple && tags.length > 0) {
    return (
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-800">{label}</label>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-700">
            {tags[0]}
            <button
              onClick={() => handleRemoveTag(tags[0])}
              className="ml-1 hover:text-indigo-900"
            >
              ✕
            </button>
          </span>
          <button
            onClick={() => {
              handleRemoveTag(tags[0]);
              inputRef.current?.focus();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="grid gap-2">
      <label className="text-sm font-medium text-slate-800">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => input && setShowSuggestions(true)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
        />

        {showSuggestions && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {filtered.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleAddTag(suggestion)}
                type="button"
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-700"
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="ml-1 hover:text-indigo-900"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
