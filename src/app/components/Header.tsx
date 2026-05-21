import { HelpCircle, Settings, BarChart3 } from 'lucide-react';

interface HeaderProps {
  onHelp: () => void;
  onSettings: () => void;
  onStats: () => void;
}

export function Header({ onHelp, onSettings, onStats }: HeaderProps) {
  return (
    <header className="w-full border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
        <button
          onClick={onHelp}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Ajuda"
        >
          <HelpCircle className="w-6 h-6 text-slate-600" />
        </button>

        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
          LEXIS
        </h1>

        <div className="flex items-center gap-1">
          <button
            onClick={onStats}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Estatísticas"
          >
            <BarChart3 className="w-6 h-6 text-slate-600" />
          </button>
          <button
            onClick={onSettings}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Definições"
          >
            <Settings className="w-6 h-6 text-slate-600" />
          </button>
        </div>
      </div>
    </header>
  );
}
