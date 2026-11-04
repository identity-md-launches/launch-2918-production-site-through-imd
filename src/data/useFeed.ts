import { useEffect, useRef, useState } from 'react';
import { createPoller, initialFeed } from './rpc';
export function useFeed() {
  const [feed, setFeed] = useState(initialFeed);
  const poller = useRef<ReturnType<typeof createPoller> | null>(null);
  useEffect(() => {
    const instance = createPoller({ onChange: setFeed }); poller.current = instance;
    const visibility = () => { if (document.hidden) instance.pause(); else { instance.start(); instance.tick(); } };
    document.addEventListener('visibilitychange', visibility);
    if (!document.hidden) instance.start();
    const clock = setInterval(() => instance.tick(), 1000);
    return () => { document.removeEventListener('visibilitychange', visibility); clearInterval(clock); instance.pause(); poller.current = null; };
  }, []);
  return { feed, retry: () => poller.current?.retry() };
}
