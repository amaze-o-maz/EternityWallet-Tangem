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

const strengthColors: Record<Strength, string> = {
  weak: 'bg-red-500',
  medium: 'bg-yellow-500',
  strong: 'bg-green-500',
};

const strengthWidths: Record<Strength, string> = {
  weak: 'w-1/3',
  medium: 'w-2/3',
  strong: 'w-full',
};

const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = 'Enter password',
  showStrength = false,
}) => {
  const [visible, setVisible] = useState(false);

  const strength = useMemo(() => evaluateStrength(value), [value]);

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 pr-12 rounded-lg bg-shib-surface border border-shib-border
                     text-white placeholder-gray-500 focus:outline-none focus:border-shib-orange
                     transition-colors"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white
                     transition-colors active:scale-95"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="mt-2">
          <div className="h-1 w-full bg-shib-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${strengthColors[strength]} ${strengthWidths[strength]}`}
            />
          </div>
          <p className={`text-xs mt-1 capitalize ${
            strength === 'weak' ? 'text-red-400' :
            strength === 'medium' ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {strength}
          </p>
        </div>
      )}
    </div>
  );
};

export default PasswordInput;
