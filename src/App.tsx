import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { getWebChannelToken } from '@/services/webChannelAuth';
import { WebChannelDisabledBanner } from '@/components/branding/WebChannelDisabledBanner';
import { Login } from '@/routes/Login';
import { Chat } from '@/routes/Chat';

// Route guards are COMPONENTS (not a value computed in App's body) so the token is read
// at the moment <Routes> renders them for the current location. If we instead computed
// `hasToken` once in App, App would not re-render on navigation (it doesn't consume the
// location context), and the guard would use a stale value — trapping the user on /login
// right after a successful OTP verify.
const RequireAuth = ({ children }: { children: ReactElement }) =>
  getWebChannelToken() ? children : <Navigate to="/login" replace />;

const RedirectIfAuthed = ({ children }: { children: ReactElement }) =>
  getWebChannelToken() ? <Navigate to="/chat" replace /> : children;

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
