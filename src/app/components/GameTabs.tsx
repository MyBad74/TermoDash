import { motion } from 'motion/react';

interface GameTabsProps {
  activeTab: 'dash' | 'coop';
  onTabChange: (tab: 'dash' | 'coop') => void;
}

export function GameTabs({ activeTab, onTabChange }: GameTabsProps) {
  return (
    <div className="bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200 inline-flex">
      <button
        onClick={() => onTabChange('dash')}
        className="relative px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors"
      >
        {activeTab === 'dash' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}
        <span className={`relative z-10 ${activeTab === 'dash' ? 'text-white' : 'text-slate-600'}`}>
          Dash
        </span>
      </button>
      <button
        onClick={() => onTabChange('coop')}
        className="relative px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors"
      >
        {activeTab === 'coop' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}
        <span className={`relative z-10 ${activeTab === 'coop' ? 'text-white' : 'text-slate-600'}`}>
          Co-op
        </span>
      </button>
    </div>
  );
}
