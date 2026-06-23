import EventSource, { EventSourceListener } from 'react-native-sse';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';

export interface SSEConnection {
  close: () => void;
}

export function connectToSSE(
  path: string,
  onMessage: (data: any) => void,
  onError?: (error: any) => void
): SSEConnection {
  const url = `${BASE_URL}${path}`;
  console.log(`[SSE] Connecting to: ${url}`);
  
  // Custom headers to prevent ngrok warning page if using ngrok
  const es = new EventSource(url, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  });

  const listener: EventSourceListener = (event) => {
    if (event.type === 'message' && event.data) {
      try {
        const parsedData = JSON.parse(event.data);
        onMessage(parsedData);
      } catch (err) {
        console.error('[SSE] Failed to parse message data:', err);
      }
    } else if (event.type === 'error') {
      console.warn('[SSE] EventSource encountered an error:', event);
      if (onError) onError(event);
    }
  };

  es.addEventListener('open', listener);
  es.addEventListener('message', listener);
  es.addEventListener('error', listener);

  return {
    close: () => {
      console.log(`[SSE] Closing connection to: ${url}`);
      es.close();
    },
  };
}
