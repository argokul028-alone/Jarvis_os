import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutGoogle,
} from '../firebase';
import {
  type BrowserBookmark,
  type BrowserExtensionId,
  type BrowserHistoryEntry,
  type BrowserSettingsState,
  type BrowserTheme,
  DEFAULT_BOOKMARKS,
  DEFAULT_BROWSER_SETTINGS,
  loadLocalBookmarks,
  loadLocalBrowserSettings,
  loadLocalHistory,
  sanitizeEnabledExtensions,
  saveLocalBookmarks,
  saveLocalBrowserSettings,
  saveLocalHistory,
  toSafeFirestoreId,
} from '../utils/browser-engine';

function timestampToMs(ts: unknown): number {
  if (ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  if (typeof ts === 'number') return ts;
  return Date.now();
}

export interface BrowserCloudSyncApi {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  syncStatus: 'local' | 'syncing' | 'synced' | 'private';
  bookmarks: BrowserBookmark[];
  history: BrowserHistoryEntry[];
  settings: BrowserSettingsState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  addBookmark: (title: string, url: string, folder?: string) => Promise<void>;
  removeBookmark: (bookmarkId: string) => Promise<void>;
  recordHistoryVisit: (title: string, url: string) => Promise<void>;
  removeHistoryEntry: (entryId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  setTheme: (theme: BrowserTheme) => Promise<void>;
  setShowBookmarksBar: (show: boolean) => Promise<void>;
  toggleExtension: (extId: BrowserExtensionId) => Promise<void>;
}

export function useBrowserCloudSync(isPrivate: boolean): BrowserCloudSyncApi {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'private'>(
    isPrivate ? 'private' : 'local'
  );

  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(() => loadLocalBookmarks());
  const [history, setHistory] = useState<BrowserHistoryEntry[]>(() =>
    isPrivate ? [] : loadLocalHistory()
  );
  const [settings, setSettings] = useState<BrowserSettingsState>(() =>
    isPrivate
      ? { ...DEFAULT_BROWSER_SETTINGS, theme: 'dark' }
      : loadLocalBrowserSettings()
  );

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const seededUidRef = useRef<string | null>(null);
  const hadSignedInUserRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (isPrivate) {
        setSyncStatus('private');
      } else {
        setSyncStatus(firebaseUser ? 'syncing' : 'local');
      }
    });
    return () => unsub();
  }, [isPrivate]);

  // Firestore real-time sync for signed-in users (standard browser windows)
  useEffect(() => {
    if (isPrivate || !user) {
      if (!isPrivate && hadSignedInUserRef.current) {
        hadSignedInUserRef.current = false;
        setBookmarks(loadLocalBookmarks());
        setHistory(loadLocalHistory());
        setSettings(loadLocalBrowserSettings());
        setSyncStatus('local');
      }
      return;
    }
    hadSignedInUserRef.current = true;

    const uid = user.uid;
    setSyncStatus('syncing');

    const bookmarksPath = `users/${uid}/bookmarks`;
    const historyPath = `users/${uid}/history`;
    const settingsPath = `users/${uid}/settings/browser`;

    const bookmarksQuery = query(
      collection(db, 'users', uid, 'bookmarks'),
      where('uid', '==', uid),
      limit(200)
    );

    const unsubBookmarks = onSnapshot(
      bookmarksQuery,
      snapshot => {
        const items: BrowserBookmark[] = snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'Bookmark'),
            url: String(data.url || ''),
            folder: String(data.folder || 'Bookmarks Bar'),
            createdAtMs: timestampToMs(data.createdAt),
          };
        });
        items.sort((a, b) => a.createdAtMs - b.createdAtMs);

        // Seed starter bookmarks once on first sign-in if cloud account has none yet
        if (items.length === 0 && seededUidRef.current !== uid) {
          seededUidRef.current = uid;
          const seedList = loadLocalBookmarks().length > 0 ? loadLocalBookmarks() : DEFAULT_BOOKMARKS;
          const batch = writeBatch(db);
          for (const item of seedList.slice(0, 12)) {
            const safeId = toSafeFirestoreId(item.id);
            batch.set(doc(db, 'users', uid, 'bookmarks', safeId), {
              uid,
              title: item.title.slice(0, 200),
              url: item.url.slice(0, 2048),
              folder: (item.folder || 'Bookmarks Bar').slice(0, 64),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          batch.commit().catch(err => {
            console.warn('Initial bookmark seed skipped:', err);
          });
          setBookmarks(seedList);
        } else {
          setBookmarks(items);
          saveLocalBookmarks(items);
        }
        setSyncStatus('synced');
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, bookmarksPath);
      }
    );

    const historyQuery = query(
      collection(db, 'users', uid, 'history'),
      where('uid', '==', uid),
      limit(150)
    );

    const unsubHistory = onSnapshot(
      historyQuery,
      snapshot => {
        const items: BrowserHistoryEntry[] = snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'Untitled'),
            url: String(data.url || ''),
            visitedAtMs: timestampToMs(data.visitedAt),
          };
        });
        items.sort((a, b) => b.visitedAtMs - a.visitedAtMs);
        setHistory(items);
        saveLocalHistory(items);
        setSyncStatus('synced');
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, historyPath);
      }
    );

    const settingsDocRef = doc(db, 'users', uid, 'settings', 'browser');
    const unsubSettings = onSnapshot(
      settingsDocRef,
      snap => {
        if (snap.exists()) {
          const data = snap.data();
          const next: BrowserSettingsState = {
            theme: data.theme === 'light' ? 'light' : 'dark',
            showBookmarksBar: typeof data.showBookmarksBar === 'boolean' ? data.showBookmarksBar : true,
            enabledExtensions: sanitizeEnabledExtensions(data.enabledExtensions),
          };
          setSettings(next);
          saveLocalBrowserSettings(next);
        }
        setSyncStatus('synced');
      },
      error => {
        handleFirestoreError(error, OperationType.GET, settingsPath);
      }
    );

    return () => {
      unsubBookmarks();
      unsubHistory();
      unsubSettings();
    };
  }, [isPrivate, user]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup was closed before completing.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Browser blocked the Google Sign-In popup. Please allow popups and retry.');
      } else {
        setAuthError(err?.message || 'Google Sign-In failed.');
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOutGoogle();
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-out failed.');
    }
  }, []);

  const addBookmark = useCallback(
    async (rawTitle: string, rawUrl: string, folder: string = 'Bookmarks Bar') => {
      const title = rawTitle.trim().slice(0, 200) || rawUrl.slice(0, 80);
      const url = rawUrl.trim().slice(0, 2048);
      if (!url || !/^(https?:\/\/|jarvis:\/\/)/i.test(url)) return;

      const id = toSafeFirestoreId(`bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      const newEntry: BrowserBookmark = {
        id,
        title,
        url,
        folder: folder.trim().slice(0, 64) || 'Bookmarks Bar',
        createdAtMs: Date.now(),
      };

      if (!isPrivate && user) {
        const path = `users/${user.uid}/bookmarks/${id}`;
        try {
          await setDoc(doc(db, 'users', user.uid, 'bookmarks', id), {
            uid: user.uid,
            title: newEntry.title,
            url: newEntry.url,
            folder: newEntry.folder,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
        return;
      }

      setBookmarks(prev => {
        const next = [...prev.filter(b => b.url !== url), newEntry];
        if (!isPrivate) saveLocalBookmarks(next);
        return next;
      });
    },
    [isPrivate, user]
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!isPrivate && user) {
        const path = `users/${user.uid}/bookmarks/${bookmarkId}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'bookmarks', bookmarkId));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
        return;
      }

      setBookmarks(prev => {
        const next = prev.filter(b => b.id !== bookmarkId);
        if (!isPrivate) saveLocalBookmarks(next);
        return next;
      });
    },
    [isPrivate, user]
  );

  const recordHistoryVisit = useCallback(
    async (rawTitle: string, rawUrl: string) => {
      // Strictly never record browsing history in Private (Incognito) windows
      if (isPrivate) return;
      const url = rawUrl.trim().slice(0, 2048);
      if (!url || url === 'jarvis://newtab' || !/^(https?:\/\/|jarvis:\/\/)/i.test(url)) return;
      const title = rawTitle.trim().slice(0, 240) || url.slice(0, 100);
      const id = toSafeFirestoreId(`hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

      if (user) {
        const path = `users/${user.uid}/history/${id}`;
        try {
          await setDoc(doc(db, 'users', user.uid, 'history', id), {
            uid: user.uid,
            title,
            url,
            visitedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
        return;
      }

      setHistory(prev => {
        const next: BrowserHistoryEntry[] = [
          { id, title, url, visitedAtMs: Date.now() },
          ...prev.filter(h => !(h.url === url && Date.now() - h.visitedAtMs < 15000)),
        ].slice(0, 150);
        saveLocalHistory(next);
        return next;
      });
    },
    [isPrivate, user]
  );

  const removeHistoryEntry = useCallback(
    async (entryId: string) => {
      if (isPrivate) return;
      if (user) {
        const path = `users/${user.uid}/history/${entryId}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'history', entryId));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
        return;
      }

      setHistory(prev => {
        const next = prev.filter(h => h.id !== entryId);
        saveLocalHistory(next);
        return next;
      });
    },
    [isPrivate, user]
  );

  const clearHistory = useCallback(async () => {
    if (isPrivate) return;
    if (user) {
      const path = `users/${user.uid}/history`;
      try {
        const batch = writeBatch(db);
        for (const item of history) {
          batch.delete(doc(db, 'users', user.uid, 'history', item.id));
        }
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
      return;
    }

    setHistory([]);
    saveLocalHistory([]);
  }, [history, isPrivate, user]);

  const persistSettings = useCallback(
    async (next: BrowserSettingsState) => {
      setSettings(next);
      if (isPrivate) return;
      saveLocalBrowserSettings(next);

      if (user) {
        const path = `users/${user.uid}/settings/browser`;
        try {
          await setDoc(doc(db, 'users', user.uid, 'settings', 'browser'), {
            uid: user.uid,
            theme: next.theme,
            showBookmarksBar: next.showBookmarksBar,
            enabledExtensions: sanitizeEnabledExtensions(next.enabledExtensions),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }
    },
    [isPrivate, user]
  );

  const setTheme = useCallback(
    async (theme: BrowserTheme) => {
      await persistSettings({ ...settingsRef.current, theme });
    },
    [persistSettings]
  );

  const setShowBookmarksBar = useCallback(
    async (showBookmarksBar: boolean) => {
      await persistSettings({ ...settingsRef.current, showBookmarksBar });
    },
    [persistSettings]
  );

  const toggleExtension = useCallback(
    async (extId: BrowserExtensionId) => {
      const current = settingsRef.current.enabledExtensions;
      const exists = current.includes(extId);
      const nextList = exists ? current.filter(id => id !== extId) : [...current, extId];
      await persistSettings({
        ...settingsRef.current,
        enabledExtensions: sanitizeEnabledExtensions(nextList),
      });
    },
    [persistSettings]
  );

  return {
    user,
    authLoading,
    authError,
    syncStatus,
    bookmarks,
    history,
    settings,
    signIn,
    signOut,
    addBookmark,
    removeBookmark,
    recordHistoryVisit,
    removeHistoryEntry,
    clearHistory,
    setTheme,
    setShowBookmarksBar,
    toggleExtension,
  };
}
