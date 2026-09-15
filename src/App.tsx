import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { clearWebChannelSession, getWebChannelToken, isSessionValid } from '@/services/webChannelAuth';
import { isWebChannelEnabled } from '@/services/branding';
import { WebChannelDisabled } from '@/components/branding/WebChannelDisabled';
import { useSessionRefresh } from '@/hooks/useSessionRefresh';
import { Login } from '@/routes/Login';
import { Chat } from '@/routes/Chat';
import { About } from '@/routes/About';

// The guards are COMPONENTS so the token is read when <Routes> renders them. Computing it once in
// App's body would leave it stale on navigation, trapping the user on /login after a successful
// verify.
//
// They ask whether the session is LIVE, not whether a token exists: an expired one would send the
// user to /chat, where the socket join fails and they watch a chat that never connects.
const hasLiveSession = (): boolean => {
  if (isSessionValid()) return true;
  if (getWebChannelToken()) clearWebChannelSession();
  return false;
};

const RequireAuth = ({ children }: { children: ReactElement }) => {
  // Here rather than in App: there is nothing to renew on the login screen.
  useSessionRefresh();

  return hasLiveSession() ? children : <Navigate to="/login" replace />;
};

const RedirectIfAuthed = ({ children }: { children: ReactElement }) =>
  hasLiveSession() ? <Navigate to="/chat" replace /> : children;

// The whole app IS the web channel (dedicated origin, e.g. web.<org>.glific.com), so routes live
// at the root.
export const App = () => {
  // Subscribes this component to navigation, so switching the channel off mid-session swaps the
  // whole app for the disabled page on the next navigation rather than on the next reload.
  useLocation();

  if (!isWebChannelEnabled()) return <WebChannelDisabled />;

  return (
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
      <Route
        path="/about"
        element={
          <RequireAuth>
            <About />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
};

export default App;
