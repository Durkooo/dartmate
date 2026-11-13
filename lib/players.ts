import { create } from 'zustand';
import type { Session, Tables } from '@biltme/backend';
import { useEffect } from 'react';
import { bilt } from '@/lib/bilt';
import { loadFriendAvatars, signAvatarUrls } from '@/lib/avatars';
import { feedback, type Friend } from '@/lib/darts';

type Profile = Tables<'player_profiles'>;
type PlayersState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  friends: Friend[];
  /** Moja profilová fotka (podpísaný odkaz). */
  myAvatarUrl?: string;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

export function playerError(error: { message: string; code?: string }): string {
  if (error.code === '23505') return 'Tento nick už používa iný hráč. Vyber si iný.';
  if (/expired|invalid.*otp|token.*invalid/i.test(error.message))
    return 'Kód nie je platný alebo už vypršal. Vyžiadaj si nový.';
  if (/rate|too many|seconds/i.test(error.message))
    return 'Príliš veľa pokusov. Po chvíli to skús znova.';
  if (/network|fetch|connection/i.test(error.message))
    return 'Pripojenie zlyhalo. Skontroluj internet a skús znova.';
  return `Operácia sa nepodarila: ${error.message}`;
}

export const usePlayers = create<PlayersState>((set, get) => ({
  ready: false,
  session: null,
  profile: null,
  friends: [],
  loading: false,
  error: '',
  refresh: async () => {
    let userId = get().session?.user.id;
    if (!userId) {
      set({ loading: true, error: '' });
      try {
        const { data, error } = await bilt.auth.getSession();
        if (error) {
          set({ loading: false, ready: true, error: playerError(error) });
          feedback.error();
          return;
        }
        set({ session: data.session, ready: true, loading: false });
        userId = data.session?.user.id;
        if (!userId) return;
      } catch (error) {
        set({
          loading: false,
          ready: true,
          error: playerError({
            message: error instanceof Error ? error.message : 'Pripojenie zlyhalo.',
          }),
        });
        feedback.error();
        return;
      }
    }
    set({ loading: true, error: '' });
    try {
      const [profileResult, friendsResult, avatars] = await Promise.all([
        bilt.from('player_profiles').select('*').eq('user_id', userId).maybeSingle(),
        bilt.rpc('list_player_friends'),
        loadFriendAvatars(),
      ]);
      if (get().session?.user.id !== userId) return;
      const error = profileResult.error ?? friendsResult.error;
      if (error) {
        set({ error: playerError(error), loading: false });
        feedback.error();
        return;
      }
      const myPath: string | null | undefined = profileResult.data?.avatar_path;
      const myAvatarUrl = myPath ? (await signAvatarUrls([myPath])).get(myPath) : undefined;
      if (get().session?.user.id !== userId) return;
      set({
        profile: profileResult.data,
        myAvatarUrl,
        friends: (friendsResult.data ?? []).map((p: any): Friend => {
          if (!p.user_id || !p.nickname) throw new Error('Zoznam priateľov sa nepodarilo načítať.');
          return {
            id: p.user_id,
            name: p.nickname,
            handle: p.nickname,
            color: 'blue',
            demo: false,
            avatarUrl: avatars.get(p.user_id),
          };
        }),
        loading: false,
      });
    } catch (error) {
      if (get().session?.user.id !== userId) return;
      set({
        loading: false,
        error: playerError({
          message: error instanceof Error ? error.message : 'Pripojenie zlyhalo.',
        }),
      });
      feedback.error();
    }
  },
}));

export function usePlayerSession() {
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const apply = (session: Session | null) => {
      if (!active) return;
      const changed = session?.user.id !== usePlayers.getState().session?.user.id;
      usePlayers.setState({
        session,
        ready: true,
        ...(changed
          ? { profile: null, friends: [], myAvatarUrl: undefined, error: '', loading: !!session }
          : {}),
      });
      if (session) void usePlayers.getState().refresh();
    };
    const {
      data: { subscription },
    } = bilt.auth.onAuthStateChange((_event: any, session: any) => {
      receivedEvent = true;
      // Run queries outside the authentication callback lock.
      setTimeout(() => apply(session), 0);
    });
    void bilt.auth
      .getSession()
      .then(({ data, error }: any) => {
        if (!active) return;
        // onAuthStateChange vie doraziť skôr s prázdnou session (INITIAL_SESSION)
        // a platný výsledok getSession by sa potom zahodil — čerstvý tab by ostal
        // navždy odhlásený. Preskočíme len zhodnú session, ktorú už máme.
        if (receivedEvent && usePlayers.getState().session?.user.id === data.session?.user.id)
          return;
        if (error) {
          usePlayers.setState({ ready: true, error: playerError(error) });
          feedback.error();
        } else apply(data.session);
      })
      .catch((error: unknown) => {
        if (!active) return;
        usePlayers.setState({
          ready: true,
          error: playerError({
            message: error instanceof Error ? error.message : 'Pripojenie zlyhalo.',
          }),
        });
        feedback.error();
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
}
