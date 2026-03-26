import React from 'react';
import { X } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  isLoading?: boolean;
}

const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'Confirm',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-shib-surface border border-shib-border rounded-xl w-full max-w-sm mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-shib-border">
          <h2 className="text-white font-semibold">{title}</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors active:scale-95 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">{children}</div>

        {/* Footer */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-shib-surface-alt border border-shib-border
                       text-white text-sm hover:bg-shib-border transition-colors active:scale-95
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-shib-orange text-white text-sm font-medium
                       hover:bg-shib-orange-hover transition-colors active:scale-95
                       disabled:opacity-70 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {isLoading && <LoadingSpinner size={16} />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
