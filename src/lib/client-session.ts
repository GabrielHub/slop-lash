/**
 * Shared localStorage getters for use with useSyncExternalStore in shell components.
 * SSR-safe: returns null during server rendering.
 */

export const PLAYER_TOKEN_KEY = "rejoinToken";
const PLAYER_ID_KEY = "playerId";
const PLAYER_NAME_KEY = "playerName";
const PLAYER_TYPE_KEY = "playerType";
const HOST_CONTROL_TOKEN_KEY = "hostControlToken";
const SESSION_CHANGE_EVENT = "sloplash:session-change";

type SessionListener = () => void;

function notifySessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

function mutateSession(mutator: () => void) {
  if (typeof window === "undefined") return;
  mutator();
  notifySessionChanged();
}

export function subscribeSession(listener: SessionListener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => listener();
  window.addEventListener("storage", handleChange);
  window.addEventListener(SESSION_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(SESSION_CHANGE_EVENT, handleChange);
  };
}

export function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_ID_KEY);
}

export function getPlayerToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}

export function getHostControlToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HOST_CONTROL_TOKEN_KEY);
}

export function setHostControlToken(token: string | null) {
  mutateSession(() => {
    if (token) {
      localStorage.setItem(HOST_CONTROL_TOKEN_KEY, token);
      return;
    }

    localStorage.removeItem(HOST_CONTROL_TOKEN_KEY);
  });
}

export function setPlayerSession(session: {
  playerId: string;
  playerName: string;
  rejoinToken?: string | null;
  playerType?: string | null;
}) {
  mutateSession(() => {
    localStorage.setItem(PLAYER_ID_KEY, session.playerId);
    localStorage.setItem(PLAYER_NAME_KEY, session.playerName);

    if (session.rejoinToken) {
      localStorage.setItem(PLAYER_TOKEN_KEY, session.rejoinToken);
    } else {
      localStorage.removeItem(PLAYER_TOKEN_KEY);
    }

    if (session.playerType) {
      localStorage.setItem(PLAYER_TYPE_KEY, session.playerType);
    } else {
      localStorage.removeItem(PLAYER_TYPE_KEY);
    }
  });
}

export function clearPlayerSession() {
  mutateSession(() => {
    localStorage.removeItem(PLAYER_ID_KEY);
    localStorage.removeItem(PLAYER_NAME_KEY);
    localStorage.removeItem(PLAYER_TYPE_KEY);
    localStorage.removeItem(PLAYER_TOKEN_KEY);
  });
}
