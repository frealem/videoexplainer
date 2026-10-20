import React from 'react';
import Sidebar from './components/Sidebar';
import ClipList from './components/ClipList';
import ChatPanel from './components/ChatPanel';
import ThemeToggle from './components/ThemeToggle';
import { Container, Clip } from './types';
import { Video, Folder, FileText, Bot, Sparkles, Layers } from 'lucide-react';
import { fetchContainers, syncContainers, getDBStatus, DBStatus } from './services/dbService';

const PRIMARY_STORAGE_KEY = 'videoexplainer_data';
const LEGACY_STORAGE_KEY = 'clipbrain_data';

export default function App() {
  const [containers, setContainers] = React.useState<Container[]>([]);
  const [activeContainerId, setActiveContainerId] = React.useState<string | null>(null);
  const [dbStatus, setDbStatus] = React.useState<DBStatus>({ connected: false, hasUri: false, usingAtlas: false });
  const [isSyncing, setIsSyncing] = React.useState(false);
  
  const [activeView, setActiveView] = React.useState<'containers' | 'clips' | 'chat'>('containers');
  const [isMobileOrTablet, setIsMobileOrTablet] = React.useState(false);

  React.useEffect(() => {
    function handleResize() {
      setIsMobileOrTablet(window.innerWidth < 1024);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isLoadedRef = React.useRef(false);

  // Load initial dataset from localStorage first (for speed), then grab live cloud documents
  React.useEffect(() => {
    async function initData() {
      // 1. Quick local cache initialization (check new key, then legacy key)
      const saved = localStorage.getItem(PRIMARY_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setContainers(parsed);
          if (parsed.length > 0) {
            setActiveContainerId(parsed[0].id);
          }
        } catch (e) {
          console.error("Local storage decode exception:", e);
        }
      }

      // 2. Load live MongoDB entries and connection status
      try {
        const liveStatus = await getDBStatus();
        setDbStatus(liveStatus);

        const liveContainers = await fetchContainers();
        if (liveContainers && Array.isArray(liveContainers)) {
          setContainers(liveContainers);
          if (liveContainers.length > 0) {
            setActiveContainerId(prev => {
              const stillExists = liveContainers.some(c => c.id === prev);
              return stillExists ? prev : liveContainers[0].id;
            });
          }
        }
      } catch (err) {
        console.warn("Could not synchronize with database server on startup, using offline storage.");
      } finally {
        isLoadedRef.current = true;
      }
    }

    initData();
  }, []);

  // Sync to backend + local caches on changes
  React.useEffect(() => {
    if (!isLoadedRef.current) return;
    
    // Save to local storage under new key
    localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(containers));

    // Submit back-end synchronized collection update non-blocking
    async function performCloudSync() {
      setIsSyncing(true);
      try {
        await syncContainers(containers);
      } catch (err) {
        console.warn("Auto-sync background error:", err);
      } finally {
        setIsSyncing(false);
      }
    }

    performCloudSync();
  }, [containers]);

  const activeContainer = containers.find(c => c.id === activeContainerId);

  const handleAddContainer = (name: string, type: 'author' | 'topic') => {
    const newContainer: Container = {
      id: Date.now().toString(),
      name,
      type,
      clips: [],
      createdAt: Date.now(),
    };
    setContainers(prev => [...prev, newContainer]);
    setActiveContainerId(newContainer.id);
  };

  const handleSelectContainer = (id: string) => {
    setActiveContainerId(id);
    if (isMobileOrTablet) {
      setActiveView('clips');
    }
  };

  const handleDeleteContainer = (id: string) => {
    setContainers(prev => prev.filter(c => c.id !== id));
    if (activeContainerId === id) {
      setActiveContainerId(null);
      if (isMobileOrTablet) {
        setActiveView('containers');
      }
    }
  };

  const handleAddClip = (title: string, content: string, url?: string) => {
    if (!activeContainerId) return;
    
    const newClip: Clip = {
      id: Date.now().toString(),
      title,
      content,
      sourceUrl: url,
      createdAt: Date.now(),
    };

    setContainers(prev => prev.map(c => {
      if (c.id === activeContainerId) {
        return { ...c, clips: [newClip, ...c.clips] };
      }
      return c;
    }));
  };

  const handleDeleteClip = (clipId: string) => {
    if (!activeContainerId) return;

    setContainers(prev => prev.map(c => {
      if (c.id === activeContainerId) {
        return { ...c, clips: c.clips.filter(clip => clip.id !== clipId) };
      }
      return c;
    }));
  };

  const allClipsText = activeContainer?.clips.map(c => 
    `TITLE: ${c.title}\nCONTENT: ${c.content}\n---`
  ).join('\n') || "";

  return (
    <div className={`flex bg-slate-50 dark:bg-[#0a0a0a] text-slate-900 dark:text-gray-100 min-h-screen overflow-hidden transition-colors duration-200 ${isMobileOrTablet ? 'flex-col pb-16' : 'flex-row'}`}>
      {!isMobileOrTablet ? (
        <>
          <Sidebar
            containers={containers}
            activeContainerId={activeContainerId}
            onSelectContainer={handleSelectContainer}
            onAddContainer={handleAddContainer}
            onDeleteContainer={handleDeleteContainer}
          />

          <div className="flex-1 flex overflow-hidden">
            {activeContainer ? (
              <>
                <ClipList
                  clips={activeContainer.clips}
                  onAddClip={handleAddClip}
                  onDeleteClip={handleDeleteClip}
                />
                <ChatPanel
                  clipsContent={allClipsText}
                  activeContainerId={activeContainer.id}
                  activeContainerName={activeContainer.name}
                  activeContainerType={activeContainer.type}
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-[#0a0a0a] transition-colors duration-200">
                <div className="w-20 h-20 rounded-3xl bg-blue-100 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center mb-5 shadow-sm">
                  <Video size={40} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Welcome to <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">VideoExplainer</span>
                </h2>
                <p className="max-w-md text-sm text-slate-600 dark:text-gray-400 mt-2 px-4 leading-relaxed">
                  Select or create a knowledge base container on the left to extract, explain, and interact with video transcripts and recordings using Gemini AI.
                </p>

                <div className="mt-8 p-5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-gray-800 rounded-2xl max-w-sm text-center shadow-xs">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 dark:border-gray-800">
                    <span className="text-[10px] tracking-wider uppercase font-bold text-slate-500 dark:text-gray-400">Database Connection</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300">
                      <Sparkles size={10} className="text-blue-500" /> Auto-Sync
                    </span>
                  </div>
                  {dbStatus.usingAtlas ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      ● MongoDB Atlas Online (Synced & Persistent)
                    </p>
                  ) : dbStatus.hasUri && !dbStatus.connected ? (
                    <div className="space-y-1">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-mono font-semibold">
                        ▲ Local Storage Buffer Active
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400">
                        {dbStatus.error?.includes("ENOTFOUND")
                          ? "MongoDB cluster hostname not found or cluster paused. Data is safely persisted in local buffer."
                          : "Atlas cluster currently offline. Data is safely persisted in local buffer."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-700 dark:text-gray-300 font-mono font-semibold">
                        Local Storage Buffer Active
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-gray-500">
                        Provide <code className="text-slate-800 dark:text-gray-300 bg-slate-100 dark:bg-gray-950 px-1 py-0.5 rounded text-[10px]">MONGODB_URI</code> to auto-connect to Cloud MongoDB Atlas.
                      </p>
                    </div>
                  )}
                  {isSyncing && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2 italic font-sans animate-pulse">
                      Syncing edits with server...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {activeView === 'containers' && (
            <Sidebar
              containers={containers}
              activeContainerId={activeContainerId}
              onSelectContainer={handleSelectContainer}
              onAddContainer={handleAddContainer}
              onDeleteContainer={handleDeleteContainer}
            />
          )}

          {activeView === 'clips' && (
            activeContainer ? (
              <ClipList
                clips={activeContainer.clips}
                onAddClip={handleAddClip}
                onDeleteClip={handleDeleteClip}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-gray-500 py-20 px-6 text-center">
                <Layers size={52} className="mb-4 text-blue-500 animate-pulse" />
                <h2 className="text-xl font-bold text-slate-800 dark:text-gray-200">No active container</h2>
                <p className="max-w-md text-xs sm:text-sm text-slate-500 dark:text-gray-400 mt-2">
                  Head over to the <strong>Containers</strong> tab to create or select a knowledge base.
                </p>
              </div>
            )
          )}

          {activeView === 'chat' && (
            activeContainer ? (
              <ChatPanel
                clipsContent={allClipsText}
                activeContainerId={activeContainer.id}
                activeContainerName={activeContainer.name}
                activeContainerType={activeContainer.type}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-gray-500 py-20 px-6 text-center">
                <Bot size={52} className="mb-4 text-purple-500 animate-pulse" />
                <h2 className="text-xl font-bold text-slate-800 dark:text-gray-200">No active container</h2>
                <p className="max-w-md text-xs sm:text-sm text-slate-500 dark:text-gray-400 mt-2">
                  Head over to the <strong>Containers</strong> tab and choose a container to start chatting with VideoExplainer.
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* Mobile/Tablet touch-friendly navigation tab-bar */}
      {isMobileOrTablet && (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-[#0f0f0f]/95 backdrop-blur-md border-t border-slate-200 dark:border-gray-800 flex items-center justify-around px-4 z-50 transition-colors duration-200">
          <button
            onClick={() => setActiveView('containers')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              activeView === 'containers' ? 'text-blue-600 dark:text-blue-400 font-bold scale-105' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-gray-300'
            }`}
          >
            <Folder size={18} />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Containers</span>
          </button>
          
          <button
            onClick={() => {
              if (activeContainerId) {
                setActiveView('clips');
              }
            }}
            disabled={!activeContainerId}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              !activeContainerId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              activeView === 'clips' ? 'text-blue-600 dark:text-blue-400 font-bold scale-105' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-gray-300'
            }`}
          >
            <FileText size={18} />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Clips</span>
          </button>

          <button
            onClick={() => {
              if (activeContainerId) {
                setActiveView('chat');
              }
            }}
            disabled={!activeContainerId}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              !activeContainerId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              activeView === 'chat' ? 'text-purple-600 dark:text-purple-400 font-bold scale-105' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-gray-300'
            }`}
          >
            <Bot size={18} />
            <span className="text-[10px] uppercase tracking-wider font-semibold">Explainer</span>
          </button>

          <div className="flex flex-col items-center justify-center">
            <ThemeToggle size="sm" />
          </div>
        </div>
      )}
    </div>
  );
}
