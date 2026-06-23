import { create } from 'zustand';

export type TabType = 'MAP' | 'FEED' | 'PIZZA' | 'CHAT';

interface UIState {
  activeTab: TabType;
  selectedIncidentId: string | null;
  channelFilter: string;
  theme: 'dark' | 'light';
  
  setActiveTab: (tab: TabType) => void;
  setSelectedIncidentId: (id: string | null) => void;
  setChannelFilter: (channel: string) => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'MAP',
  selectedIncidentId: null,
  channelFilter: 'GEOPOLITICS',
  theme: 'dark',
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedIncidentId: (id) => set({ selectedIncidentId: id }),
  setChannelFilter: (channel) => set({ channelFilter: channel }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
}));
