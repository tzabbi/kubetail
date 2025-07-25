// Copyright 2024-2025 Andres Morey
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import appConfig from '@/app-config';
import { getBasename, joinPaths } from '@/lib/util';

const bcName = 'auth/session';
const bcIn = new BroadcastChannel(bcName);
const bcOut = new BroadcastChannel(bcName);

export type Session = {
  auth_mode: string;
  user: string | null;
  message: string | null;
  timestamp: Date;
};

type ContextType = {
  session: Session | undefined;
};

const Context = createContext({} as ContextType);

/**
 * Get session
 */

export async function getSession(): Promise<Session> {
  const url = new URL(joinPaths(getBasename(), '/api/auth/session'), window.location.origin);
  const resp = await fetch(url, { cache: 'no-store' });
  const sess = await resp.json();

  // convert timestamp
  sess.timestamp = new Date(sess.timestamp);

  // publish
  bcOut.postMessage(sess);

  return sess;
}

/**
 * Session hook
 */

export function useSession() {
  const { session } = useContext(Context);

  return {
    loading: session === undefined,
    session,
  };
}

/**
 * Session provider (Desktop)
 */

export const SessionProviderDesktop = ({ children }: React.PropsWithChildren) => {
  const context = useMemo(
    () => ({
      session: {
        auth_mode: 'auto',
        user: 'auto',
        message: null,
        timestamp: new Date(),
      },
    }),
    [],
  );

  return <Context.Provider value={context}>{children}</Context.Provider>;
};

/**
 * Session provider (Cluster)
 */

export const SessionProviderCluster = ({ children }: React.PropsWithChildren) => {
  const [session, setSession] = useState<Session | undefined>(undefined);

  // subscribe to broadcast messages
  useEffect(() => {
    let lastTS = 0;
    const fn = (ev: any) => {
      const newSession = ev.data;
      if (newSession.timestamp > lastTS) {
        lastTS = newSession.timestamp;
        setSession(newSession);
      }
    };
    bcIn.addEventListener('message', fn);

    // fetch on first mount
    (async () => {
      await getSession();
    })();

    return () => bcIn.removeEventListener('message', fn);
  }, []);

  // fetch on visibility change
  useEffect(() => {
    const fn = async () => {
      await getSession();
    };
    document.addEventListener('visibilitychange', getSession);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);

  const context = useMemo(() => ({ session }), [session]);

  return <Context.Provider value={context}>{children}</Context.Provider>;
};

/**
 * Session provider
 */

export const SessionProvider = ({ children }: React.PropsWithChildren) => {
  if (appConfig.environment === 'desktop') {
    return <SessionProviderDesktop>{children}</SessionProviderDesktop>;
  }
  return <SessionProviderCluster>{children}</SessionProviderCluster>;
};
