import { create } from 'zustand';
import { connectToSSE, SSEConnection } from '../api/sseClient';

export interface Incident {
  id: string;
  country: string;
  region: string;
  title: string;
  summary: string;
  category: string;
  severity: number;
  level: 'CRITICAL' | 'ELEVATED' | 'NOMINAL';
  lat: number;
  lng: number;
  source: string;
  created_at: string;
  pinned: number;
  watchcon_trigger: boolean;
  media_url?: string | null;
  media_type?: string | null;
  sns_source?: string | null;
}

interface IncidentState {
  incidents: Record<string, Incident[]>; // channel -> incident list
  activeConnection: SSEConnection | null;
  activeChannel: string | null;
  
  connectChannel: (channel: string) => void;
  disconnectChannel: () => void;
}

export const useIncidentStore = create<IncidentState>((set, get) => ({
  incidents: {},
  activeConnection: null,
  activeChannel: null,

  connectChannel: (channel) => {
    const { activeConnection, activeChannel } = get();
    
    // 이미 해당 채널에 연결된 경우 유지
    if (activeConnection && activeChannel === channel) {
      return;
    }

    // 기존 연결 종료
    if (activeConnection) {
      activeConnection.close();
    }

    const conn = connectToSSE(
      `/api/news/stream?channel=${channel}&_ngrok_skip=1`,
      (data) => {
        // 인시던트 데이터 갱신
        if (Array.isArray(data)) {
          set((state) => ({
            incidents: {
              ...state.incidents,
              [channel]: data,
            },
          }));
        }
      },
      (err) => {
        console.warn(`[IncidentStore] SSE connection error for channel ${channel}:`, err);
      }
    );

    set({
      activeConnection: conn,
      activeChannel: channel,
    });
  },

  disconnectChannel: () => {
    const { activeConnection } = get();
    if (activeConnection) {
      activeConnection.close();
      set({ activeConnection: null, activeChannel: null });
    }
  },
}));
