import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { clearWebChannelSession, getWebChannelToken, isSessionValid } from '@/services/webChannelAuth';
import { WebChannelDisabledBanner } from '@/components/branding/WebChannelDisabledBanner';
import { useSessionRefresh } from '@/hooks/useSessionRefresh';
import { Login } from '@/routes/Login';
import { Chat } from '@/routes/Chat';

// Route guards are COMPONENTS (not a value computed in App's body) so the token is read
// at the moment <Routes> renders them for the current location. If we instead computed
// `hasToken` once in App, App would not re-render on navigation (it doesn't consume the
// location context), and the guard would use a stale value — trapping the user on /login
// right after a successful OTP verify.
//
// "Is there a token?" is the wrong question — an expired one would send the user to /chat, where
// the socket join then fails and they are left staring at a chat that never connects. Both guards
// ask whether the session is still LIVE, and drop a dead one on the way past so the next reader
// (this guard on the next render, Chat, the refresh hook) sees a plainly signed-out app rather
// than a token that every one of them has to re-evaluate.
const hasLiveSession = (): boolean => {
  if (isSessionValid()) return true;
  if (getWebChannelToken()) clearWebChannelSession();
  return false;
};

const RequireAuth = ({ children }: { children: ReactElement }) => {
  // Mounted here rather than in App so the refresh loop runs only for the authenticated part of
  // the app — there is nothing to renew on the login screen.
  useSessionRefresh();

  return hasLiveSession() ? children : <Navigate to="/login" replace />;
};

const RedirectIfAuthed = ({ children }: { children: ReactElement }) =>
  hasLiveSession() ? <Navigate to="/chat" replace /> : children;

// Public web-channel end-user app. The whole app IS the web channel (dedicated origin,
// e.g. web.<org>.glific.com), so routes live at the root — no "/web" prefix needed.
export const App = () => (
  <>
    <WebChannelDisabledBanner />
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/chat"
        element={
          <RequireAuth>
            <Chat />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  </>
);

export default App;
