import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function ThemeToggle({ showLabel = false, className = '', size = 'md' }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  const buttonSizeClasses = {
    sm: 'p-1.5 text-xs',
    md: 'p-2 text-sm',
    lg: 'px-3 py-2 text-sm',
  }[size];

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  }[size];

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to White Mode" : "Switch to Dark Mode"}
      title={isDark ? "Switch to White Mode (Default)" : "Switch to Dark Mode"}
      className={`inline-flex items-center gap-2 rounded-xl transition-all duration-200 cursor-pointer ${
        isDark
          ? 'bg-gray-800/80 hover:bg-gray-700/80 text-amber-300 border border-gray-700/80 hover:border-amber-400/40 shadow-sm'
          : 'bg-white hover:bg-slate-100 text-indigo-600 border border-slate-200 hover:border-indigo-300 shadow-sm'
      } ${buttonSizeClasses} ${className}`}
    >
      <div className="relative flex items-center justify-center">
        {isDark ? (
          <Sun size={iconSizes} className="transition-transform duration-300 rotate-0 hover:rotate-45" />
        ) : (
          <Moon size={iconSizes} className="transition-transform duration-300 -rotate-12 hover:rotate-0" />
        )}
      </div>
      {showLabel && (
        <span className="font-semibold text-xs tracking-tight">
          {isDark ? 'White Mode' : 'Dark Mode'}
        </span>
      )}
    </button>
  );
}
