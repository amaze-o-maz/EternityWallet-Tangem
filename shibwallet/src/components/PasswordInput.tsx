import React, { useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showStrength?: boolean;
}

type Strength = 'weak' | 'medium' | 'strong';

function evaluateStrength(password: string): Strength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

  if (score <= 1) return 'weak';
  if (score <= 2) return 'medium';
  return 'strong';
}

const strengthConfig: Record<Strength, { width: string; gradient: string; label: string; textColor: string }> = {
  weak: {
    width: 'w-1/3',
    gradient: 'bg-gradient-to-r from-red-600 to-red-400',
    label: 'Weak',
    textColor: 'text-red-400',
  },
  medium: {
    width: 'w-2/3',
    gradient: 'bg-gradient-to-r from-red-500 via-yellow-500 to-yellow-400',
    label: 'Medium',
    textColor: 'text-yellow-400',
  },
  strong: {
    width: 'w-full',
    gradient: 'bg-gradient-to-r from-red-500 via-yellow-400 to-green-500',
    label: 'Strong',
    textColor: 'text-green-400',
  },
};

const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = 'Enter password',
  showStrength = false,
}) => {
  const [visible, setVisible] = useState(false);

  const strength = useMemo(() => evaluateStrength(value), [value]);
  const config = strengthConfig[strength];

  return (
    <div className="w-full">
      <div className="relative group">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3.5 pr-12 rounded-xl bg-white/[0.03] border border-white/[0.06]
                     text-white placeholder-gray-500 focus:outline-none
                     focus:border-[#FF6900]/50 focus:shadow-[0_0_20px_rgba(255,105,0,0.12)]
                     transition-all duration-300 backdrop-blur-sm"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white
                     transition-colors active:scale-95 p-0.5"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${config.gradient} ${config.width}`}
              style={{ boxShadow: strength === 'strong' ? '0 0 8px rgba(34, 197, 94, 0.3)' : undefined }}
            />
          </div>
          <p className={`text-xs mt-1.5 font-medium ${config.textColor}`}>
            {config.label}
          </p>
        </div>
      )}
    </div>
  );
};

export default PasswordInput;
