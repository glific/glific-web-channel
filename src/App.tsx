import { Navigate, Route, Routes } from 'react-router';

import { getWebChannelToken } from '@/services/webChannelAuth';
import { Login } from '@/routes/Login';
import { Chat } from '@/routes/Chat';

// Public web-channel end-user app. The whole app IS the web channel (dedicated origin,
// e.g. web.<org>.glific.com), so routes live at the root — no "/web" prefix needed.
export const App = () => {
  const hasToken = !!getWebChannelToken();

  return (
    <Routes>
      <Route path="/login" element={hasToken ? <Navigate to="/chat" replace /> : <Login />} />
      <Route path="/chat" element={hasToken ? <Chat /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={hasToken ? '/chat' : '/login'} replace />} />
    </Routes>
  );
};

export default App;
