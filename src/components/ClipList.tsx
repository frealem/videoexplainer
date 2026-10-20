import React from 'react';
import { Plus, Trash2, Link as LinkIcon, FileText, Loader2, Sparkles, Globe, Upload, FileVideo, Music } from 'lucide-react';
import { Clip } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { processSocialMediaLink, transcribeMediaFile } from '../services/geminiService';
import { extractAndCompressAudio } from '../lib/audioExtractor';
import ThemeToggle from './ThemeToggle';

interface ClipListProps {
  clips: Clip[];
  onAddClip: (title: string, content: string, url?: string) => void;
  onDeleteClip: (id: string) => void;
}

type AddMode = 'link' | 'upload' | 'manual';

export default function ClipList({ clips, onAddClip, onDeleteClip }: ClipListProps) {
  const [addMode, setAddMode] = React.useState<AddMode | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [processingStatus, setProcessingStatus] = React.useState('');
  
  // Form fields
  const [newTitle, setNewTitle] = React.useState('');
  const [newContent, setNewContent] = React.useState('');
  const [newUrl, setNewUrl] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadQuestion, setUploadQuestion] = React.useState('');
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addMode === 'manual') {
      if (newTitle.trim() && newContent.trim()) {
        onAddClip(newTitle.trim(), newContent.trim(), newUrl.trim() || undefined);
        resetForm();
      }
    } else if (addMode === 'link') {
      handleLinkImport();
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewContent('');
    setNewUrl('');
    setSelectedFile(null);
    setUploadQuestion('');
    setAddMode(null);
    setIsProcessing(false);
    setProcessingStatus('');
  };

  const handleLinkImport = async () => {
    if (!newUrl.trim()) return;
    setIsProcessing(true);
    setProcessingStatus('Searching web and analyzing video transcripts...');
    try {
      const result = await processSocialMediaLink(newUrl.trim());
      onAddClip(result.title, result.transcript, newUrl.trim());
      resetForm();
    } catch (error: any) {
      console.error("Link import failed", error);
      alert(error.message || "Failed to extract content from link. Please verify standard internet details.");
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleFileProcess = async (file: File) => {
    setIsProcessing(true);
    setProcessingStatus('Reading file securely...');
    try {
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json')) {
        setProcessingStatus('Extracting content from text file...');
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          let finalContent = content;
          if (uploadQuestion.trim()) {
            finalContent = `### ❓ Pre-Upload Q&A Request\n**Question:** ${uploadQuestion.trim()}\n\n---\n\n${content}`;
          }
          onAddClip(file.name, finalContent, `Uploaded File: ${file.name}`);
          resetForm();
        };
        reader.readAsText(file);
      } else if (
        file.type.startsWith('audio/') || 
        file.type.startsWith('video/') || 
        ['.mp3', '.wav', '.mp4', '.m4a', '.mov', '.webm', '.mkv'].some(ext => file.name.toLowerCase().endsWith(ext))
      ) {
        // Run browser-based extraction & compression
        const optimizationResult = await extractAndCompressAudio(file, (status) => {
          setProcessingStatus(status);
        });

        setProcessingStatus('Uploading optimized voice track to the cloud for transcription & comprehension...');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const base64 = (e.target?.result as string).split(',')[1];
            const q = uploadQuestion.trim() || undefined;
            const result = await transcribeMediaFile(
              file.name, 
              base64, 
              optimizationResult.mimeType, 
              q
            );
            
            onAddClip(result.title, result.transcript, `Uploaded Media File: ${file.name}`);
            
            // Dispatch both new and legacy events for instant Q&A
            const qaPayload = {
              detail: {
                question: q,
                answer: result.instantAnswer,
              },
            };
            window.dispatchEvent(new CustomEvent('videoexplainer-instant-qa', qaPayload));
            window.dispatchEvent(new CustomEvent('clipbrain-instant-qa', qaPayload));

            resetForm();
          } catch (err: any) {
            console.error(err);
            alert(err.message || 'Error processing media file.');
            setIsProcessing(false);
            setProcessingStatus('');
          }
        };
        reader.readAsDataURL(optimizationResult.data);
      } else {
        alert('Unsupported file type. Please upload standard audio/video (mp3, wav, mp4, mov) or text (txt, md) files.');
        setIsProcessing(false);
        setProcessingStatus('');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to read file.');
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#0a0a0a] transition-colors duration-200">
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="text-blue-600 dark:text-blue-500" size={22} />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Knowledge Base</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 mt-0.5">
              Explain, organize, and query authentic creator materials with AI.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-[#111111] border border-slate-200 dark:border-gray-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => {
                  resetForm();
                  setAddMode(addMode === 'link' ? null : 'link');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  addMode === 'link' 
                    ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-200/60 dark:hover:bg-gray-800/40'
                }`}
              >
                <Globe size={14} /> Link
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setAddMode(addMode === 'upload' ? null : 'upload');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  addMode === 'upload' 
                    ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-200/60 dark:hover:bg-gray-800/40'
                }`}
              >
                <Upload size={14} /> Upload
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setAddMode(addMode === 'manual' ? null : 'manual');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  addMode === 'manual' 
                    ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-sm' 
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-200/60 dark:hover:bg-gray-800/40'
                }`}
              >
                <Plus size={14} /> Text
              </button>
            </div>
            
            {/* Quick theme toggle in top action area */}
            <ThemeToggle size="sm" />
          </div>
        </div>

        <AnimatePresence>
          {addMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-purple-500/20 shadow-sm rounded-xl p-5 space-y-4 mb-2">
                
                {addMode === 'link' && (
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-slate-700 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Sparkles size={13} className="text-blue-600 dark:text-blue-400" />
                      Social Media Video Analyzer & Transcript Fetcher
                    </div>
                    <div className="relative">
                      <input
                        type="url"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="Paste YouTube, TikTok, or Instagram video URL..."
                        className="w-full bg-slate-50 dark:bg-[#111111] border border-slate-300 dark:border-gray-800 rounded-xl py-3 px-4 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-[#111111] transition-all font-mono"
                        required
                        disabled={isProcessing}
                        autoFocus
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-gray-500 max-w-xl">
                      Supports YouTube, TikTok, and Instagram. VideoExplainer will fetch audio, transcripts, comments, and chapter summaries.
                    </p>
                  </div>
                )}

                {addMode === 'upload' && (
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-slate-700 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Upload size={13} className="text-purple-600 dark:text-purple-400" />
                      Multi-Modal Video & Audio File Explainer
                    </div>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="audio/*,video/*,text/plain,text/markdown"
                      className="hidden"
                      disabled={isProcessing}
                    />

                    {selectedFile === null ? (
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => !isProcessing && fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${
                          dragActive 
                            ? 'border-blue-500 bg-blue-50 dark:border-purple-500 dark:bg-purple-500/5 text-blue-700 dark:text-purple-300' 
                            : 'border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-slate-50 dark:border-gray-800 dark:hover:border-purple-500/50 dark:bg-[#111111]/30 dark:hover:bg-[#111111]/60 text-slate-600 dark:text-gray-400'
                        }`}
                      >
                        <div className="flex gap-2">
                          <FileVideo size={24} className="text-indigo-500 dark:text-purple-400/80" />
                          <Music size={24} className="text-blue-500 dark:text-blue-400/80" />
                          <FileText size={24} className="text-emerald-500 dark:text-green-400/80" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-slate-800 dark:text-gray-300">Drag & Drop your Video or Audio here</p>
                          <p className="text-[10px] text-slate-500 dark:text-gray-500 mt-1">Accepts Video (mp4, mov, webm), Audio (mp3, wav, m4a), or Text (txt, md)</p>
                        </div>
                        <button
                          type="button"
                          className="bg-slate-200/70 hover:bg-slate-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 text-slate-800 dark:text-purple-300 border border-slate-300 dark:border-purple-800/50 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all"
                        >
                          Browse Local Files
                        </button>
                      </div>
                    ) : (
                      <div className="bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-purple-500/20 rounded-xl p-4 space-y-4">
                        <div className="flex items-center justify-between bg-white dark:bg-purple-500/5 border border-slate-200 dark:border-purple-500/10 p-3 rounded-lg">
                          <div className="flex items-center gap-3 min-w-0">
                            {selectedFile.type.startsWith('video/') ? (
                              <FileVideo size={20} className="text-indigo-600 dark:text-purple-400 shrink-0" />
                            ) : selectedFile.type.startsWith('audio/') ? (
                              <Music size={20} className="text-blue-600 dark:text-blue-400 shrink-0" />
                            ) : (
                              <FileText size={20} className="text-emerald-600 dark:text-green-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-gray-200 truncate">{selectedFile.name}</p>
                              <p className="text-[10px] text-slate-500 dark:text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'unknown type'}</p>
                            </div>
                          </div>
                          {!isProcessing && (
                            <button
                              type="button"
                              onClick={() => setSelectedFile(null)}
                              className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 text-xs font-bold transition-all cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {/* Optional Question Form Field */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-gray-400 flex items-center gap-1.5">
                            <Sparkles size={12} className="text-purple-600 dark:text-purple-400 animate-pulse" />
                            Ask an immediate question about this file (Optional)
                          </label>
                          <input
                            type="text"
                            value={uploadQuestion}
                            onChange={(e) => setUploadQuestion(e.target.value)}
                            placeholder="e.g. What are the key lessons discussed? What is the main thesis?"
                            className="w-full bg-white dark:bg-[#161616] border border-slate-300 dark:border-gray-800 focus:border-blue-500 dark:focus:border-purple-500/50 rounded-lg py-2 px-3 text-xs focus:outline-none placeholder-slate-400 dark:placeholder-gray-600 font-sans text-slate-900 dark:text-gray-200"
                            disabled={isProcessing}
                          />
                          <p className="text-[10px] text-slate-500 dark:text-gray-500">
                            VideoExplainer will transcribe the file and provide a structured explanation immediately.
                          </p>
                        </div>

                        {/* Processing loader */}
                        {isProcessing ? (
                          <div className="flex items-center justify-center gap-3 py-2 bg-blue-50 dark:bg-purple-500/5 border border-blue-200 dark:border-purple-500/15 rounded-lg text-xs text-blue-700 dark:text-purple-300 font-mono">
                            <Loader2 size={16} className="animate-spin text-blue-600 dark:text-purple-400" />
                            <span className="animate-pulse">{processingStatus}</span>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedFile(null)}
                              className="text-xs text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 cursor-pointer"
                            >
                              Change File
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFileProcess(selectedFile)}
                              className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-purple-600 dark:to-blue-600 hover:opacity-95 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <Sparkles size={12} />
                              {uploadQuestion.trim() ? "Transcribe & Explain" : "Transcribe & Index"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {addMode === 'manual' && (
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-slate-700 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText size={12} className="text-blue-600 dark:text-blue-400" />
                      Custom Manuscript / Script
                    </div>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Title (e.g. Gary Vee - Content Strategy Script)"
                      className="w-full bg-slate-50 dark:bg-[#111111] border border-slate-300 dark:border-gray-800 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#111111]"
                      required
                      disabled={isProcessing}
                    />
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="Paste transcript, speech notes, video breakdown, or outline here..."
                      rows={6}
                      className="w-full bg-slate-50 dark:bg-[#111111] border border-slate-300 dark:border-gray-800 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#111111] resize-none font-mono text-xs leading-relaxed"
                      required
                      disabled={isProcessing}
                    />
                  </div>
                )}

                {/* Status Bar */}
                {isProcessing && addMode !== 'upload' && (
                  <div className="flex items-center gap-2.5 bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400 font-mono">
                    <Loader2 size={16} className="animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="animate-pulse">{processingStatus}</span>
                  </div>
                )}

                {/* Form Controls */}
                {addMode !== 'upload' && (
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={isProcessing}
                      className="text-sm text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-600 dark:to-purple-600 hover:opacity-95 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                    >
                      {addMode === 'link' ? 'Analyze & Index' : 'Save Clip'}
                    </button>
                  </div>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {clips.length === 0 && !addMode && (
            <div className="text-center py-16 sm:py-20 border-2 border-dashed border-slate-300 dark:border-gray-800 bg-white dark:bg-transparent rounded-2xl p-6">
              <FileText className="mx-auto text-slate-300 dark:text-gray-700 mb-3" size={48} />
              <h3 className="text-base font-bold text-slate-700 dark:text-gray-300">This container is empty</h3>
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-1 max-w-sm mx-auto">
                Import a video link, upload a recording, or add manual text to train VideoExplainer.
              </p>
            </div>
          )}
          {clips.map((clip) => (
            <motion.div
              layout
              key={clip.id}
              className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-gray-800 hover:border-slate-300 dark:hover:border-gray-700 rounded-xl p-4 sm:p-5 transition-all shadow-xs group"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col gap-1 pr-4 min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-gray-200 truncate text-sm sm:text-base">
                    {clip.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"></div>
                      <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-gray-500 tracking-wider">
                        High Fidelity Extraction
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onDeleteClip(clip.id)}
                  className="text-slate-400 dark:text-gray-600 hover:text-red-600 dark:hover:text-red-400 p-1.5 opacity-80 sm:opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all shrink-0 cursor-pointer"
                  title="Delete Clip"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="relative mt-3">
                <p className="text-xs text-slate-600 dark:text-gray-400 font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {clip.content}
                </p>
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white dark:from-[#111111] to-transparent pointer-events-none"></div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-gray-600 uppercase font-bold tracking-widest mt-4 pt-3 border-t border-slate-100 dark:border-gray-800/50">
                <div className="flex items-center gap-4">
                  <span>{new Date(clip.createdAt).toLocaleDateString()}</span>
                  {clip.sourceUrl && (
                    <a
                      href={clip.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px]"
                    >
                      <LinkIcon size={11} />
                      {clip.sourceUrl.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
