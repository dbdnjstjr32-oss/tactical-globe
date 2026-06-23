import { useQuery } from '@tanstack/react-query';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';

export interface PizzaData {
  doughconLevel: number | null;
  doughconDesc: string;
  alertText: string | null;
  locationsMonitored: number;
  reportsCount: number | null;
  alertsCount: number | null;
  accountsMonitored: number | null;
  status: string;
  color: string;
  lastUpdated: string;
  cached?: boolean;
}

async function fetchPizzaData(): Promise<PizzaData> {
  const url = `${BASE_URL}/api/pizza`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch pizza data');
  }
  return response.json();
}

export function usePizza() {
  return useQuery<PizzaData>({
    queryKey: ['pizzaIndex'],
    queryFn: fetchPizzaData,
    refetchInterval: 5000, // 폴링 주기 5초
    refetchIntervalInBackground: true,
  });
}
