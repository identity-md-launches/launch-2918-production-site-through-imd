import { useEffect, useRef, useState } from 'react';
import { createPoller, initialFeed } from './rpc';

export function useFeed() {
  const [feed, setFeed] = useState(initialFeed);
  const poller = useRef<ReturnType<typeof createPoller> | null>(null);
  useEffect(() => {
    const instance = createPoller({ onChange: setFeed });
    poller.current = instance;
    const visibility = () => { if (document.hidden) instance.pause(); else instance.start(); };
    document.addEventListener('visibilitychange', visibility);
    instance.start();
    const clock = setInterval(() => instance.tick(), 1000);
    return () => { document.removeEventListener('visibilitychange', visibility); clearInterval(clock); instance.reset(); poller.current = null; };
  }, []);
  return { feed, retry: () => poller.current?.retry() };
}
