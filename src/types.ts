export interface Clip {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
  createdAt: number;
}

export interface Container {
  id: string;
  name: string;
  type: 'author' | 'topic';
  clips: Clip[];
  createdAt: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
