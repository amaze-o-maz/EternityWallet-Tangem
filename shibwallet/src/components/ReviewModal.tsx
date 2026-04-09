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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl w-full max-w-sm mx-4 animate-slide-up-fade shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors active:scale-95 disabled:opacity-40
                       p-1 rounded-lg hover:bg-white/[0.06]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">{children}</div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]
                       text-white text-sm font-medium hover:bg-white/[0.06] transition-all duration-200
                       active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                       text-white text-sm font-semibold transition-all duration-200
                       hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] active:scale-[0.97]
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
