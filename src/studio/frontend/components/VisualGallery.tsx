import React, { useState } from "react";
import {
  type Visual,
  getVisualImageUrl,
  updateVisual,
  deleteVisual as apiDeleteVisual,
} from "../api";

interface VisualGalleryProps {
  visuals: Visual[];
  onDelete: (id: string) => void;
}

export default function VisualGallery({ visuals, onDelete }: VisualGalleryProps) {
  const [selectedVisual, setSelectedVisual] = useState<Visual | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionValue, setCaptionValue] = useState("");

  const handleOpenModal = (visual: Visual) => {
    setSelectedVisual(visual);
    setCaptionValue(visual.caption || "");
    setEditingCaption(false);
  };

  const handleSaveCaption = async () => {
    if (!selectedVisual) return;
    try {
      await updateVisual(selectedVisual.id, { caption: captionValue });
      selectedVisual.caption = captionValue;
      setEditingCaption(false);
    } catch (err) {
      console.error("Failed to update caption:", err);
    }
  };

  const handleDelete = async () => {
    if (!selectedVisual) return;
    try {
      await apiDeleteVisual(selectedVisual.id, true);
      onDelete(selectedVisual.id);
      setSelectedVisual(null);
    } catch (err) {
      console.error("Failed to delete visual:", err);
    }
  };

  return (
    <>
      {/* Thumbnail grid */}
      <div className="grid grid-cols-3 gap-4">
        {visuals.map((visual) => (
          <div
            key={visual.id}
            onClick={() => handleOpenModal(visual)}
            className="relative group rounded-lg overflow-hidden bg-zinc-900 cursor-pointer aspect-video"
          >
            <img
              src={getVisualImageUrl(visual.id)}
              alt={visual.caption || "Screenshot"}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
            {visual.caption && (
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-sm text-white truncate">{visual.caption}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal for expanded view */}
      {selectedVisual && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setSelectedVisual(null)}
        >
          <div
            className="bg-panel rounded-lg max-w-4xl max-h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="relative">
              <img
                src={getVisualImageUrl(selectedVisual.id)}
                alt={selectedVisual.caption || "Screenshot"}
                className="max-w-full max-h-[60vh] object-contain"
              />
              <button
                onClick={() => setSelectedVisual(null)}
                className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full text-white hover:bg-black/70 flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {/* Caption and actions */}
            <div className="p-4 border-t border-zinc-800">
              {editingCaption ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={captionValue}
                    onChange={(e) => setCaptionValue(e.target.value)}
                    placeholder="Add a caption..."
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:border-chronicle-blue focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveCaption();
                      if (e.key === "Escape") setEditingCaption(false);
                    }}
                  />
                  <button
                    onClick={handleSaveCaption}
                    className="px-3 py-2 bg-chronicle-blue text-black rounded font-medium text-sm hover:bg-chronicle-blue/90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingCaption(false)}
                    className="px-3 py-2 bg-zinc-700 text-white rounded font-medium text-sm hover:bg-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p
                    onClick={() => setEditingCaption(true)}
                    className="text-zinc-300 cursor-pointer hover:text-white transition-colors"
                  >
                    {selectedVisual.caption || (
                      <span className="text-zinc-500 italic">Click to add caption...</span>
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingCaption(true)}
                      className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-2 text-xs text-zinc-500">
                Captured: {new Date(selectedVisual.capturedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
