import React from 'react';
import { Plus, Trash2, UserCircle, Hash } from 'lucide-react';
import { Container } from '../types';
import ThemeToggle from './ThemeToggle';

interface SidebarProps {
  containers: Container[];
  activeContainerId: string | null;
  onSelectContainer: (id: string) => void;
  onAddContainer: (name: string, type: 'author' | 'topic') => void;
  onDeleteContainer: (id: string) => void;
}

export default function Sidebar({
  containers,
  activeContainerId,
  onSelectContainer,
  onAddContainer,
  onDeleteContainer
}: SidebarProps) {
  const [newContainerName, setNewContainerName] = React.useState('');
  const [type, setType] = React.useState<'author' | 'topic'>('author');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newContainerName.trim()) {
      onAddContainer(newContainerName.trim(), type);
      setNewContainerName('');
    }
  };

  return (
    <div className="w-full md:w-72 shrink-0 bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-gray-800 flex flex-col h-full transition-colors duration-200">
      <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent italic tracking-tighter">
            VideoExplainer
          </h1>
          <p className="text-[10px] text-slate-500 dark:text-gray-500 font-bold uppercase tracking-widest mt-0.5">
            AI Video Knowledge & Mentor
          </p>
        </div>
        <ThemeToggle size="sm" />
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="mb-6 space-y-3">
          <div className="flex bg-slate-100 dark:bg-gray-900 p-1 rounded-xl border border-slate-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setType('author')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                type === 'author'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200'
              }`}
            >
              <UserCircle size={14} /> MENTOR
            </button>
            <button
              type="button"
              onClick={() => setType('topic')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                type === 'topic'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200'
              }`}
            >
              <Hash size={14} /> TOPIC
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={newContainerName}
              onChange={(e) => setNewContainerName(e.target.value)}
              placeholder={type === 'author' ? "Author name (e.g. Alex Hormozi)..." : "Topic name (e.g. Sales Funnels)..."}
              className="w-full bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-xl py-2 pl-3 pr-10 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-900 transition-colors"
            />
            <button
              type="submit"
              className="absolute right-2 top-2 p-1 text-slate-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              title="Add Knowledge Base"
            >
              <Plus size={18} />
            </button>
          </div>
        </form>

        <div className="space-y-1">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-[10px] font-black text-slate-500 dark:text-gray-500 uppercase tracking-[0.2em]">
              My Knowledge Bases
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
              {containers.length}
            </span>
          </div>
          {containers.length === 0 && (
            <div className="text-center py-10 px-4 border border-dashed border-slate-300 dark:border-gray-800 rounded-xl bg-slate-50/50 dark:bg-transparent">
              <p className="text-[11px] text-slate-500 dark:text-gray-500 uppercase font-bold">No containers found</p>
              <p className="text-[10px] text-slate-400 dark:text-gray-600 mt-1">Create one above to get started</p>
            </div>
          )}
          {containers.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                activeContainerId === c.id
                  ? 'bg-blue-50 dark:bg-blue-600/10 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-gray-800/50 text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:border-slate-200 dark:hover:border-gray-800'
              }`}
              onClick={() => onSelectContainer(c.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  activeContainerId === c.id 
                    ? 'bg-blue-600 text-white dark:bg-blue-600/30 dark:text-blue-400' 
                    : 'bg-slate-100 dark:bg-gray-900 text-slate-500 dark:text-gray-400'
                }`}>
                  {c.type === 'author' ? <UserCircle size={16} /> : <Hash size={16} />}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate text-sm font-bold leading-tight">{c.name}</span>
                  <span className="text-[9px] uppercase tracking-widest opacity-60 font-bold">
                    {c.type} mode • {c.clips?.length || 0} clips
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteContainer(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-500/10 text-slate-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-all cursor-pointer"
                title="Delete Container"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-gray-800 bg-slate-50/80 dark:bg-[#0d0d0d] flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-gray-500 font-bold uppercase tracking-wider">
           <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
           Status: Ready
        </div>
        <ThemeToggle showLabel size="sm" />
      </div>
    </div>
  );
}
