import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { App } from './App';
import { setWebChannelSession } from '@/services/webChannelAuth';

// Stub the two screens so this suite tests ONLY App's routing/guards (no phoenix socket).
vi.mock('@/routes/Chat', () => ({ Chat: () => <div>CHAT SCREEN</div> }));
vi.mock('@/routes/Login', () => ({
  // A login screen that, on click, stores a session and navigates to /chat — mirroring the
  // real OTP-verify success path. This is the exact flow that used to get trapped on /login.
  Login: () => {
    const navigate = useNavigate();
    return (
      <button
        onClick={() => {
          localStorage.setItem('web_channel_session', JSON.stringify({ token: 't', contactId: 1 }));
          navigate('/chat');
        }}
      >
        do-login
      </button>
    );
  },
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

describe('<App /> routing guards', () => {
  beforeEach(() => localStorage.clear());

  it('redirects an unauthenticated visitor from /chat to the login screen', () => {
    renderAt('/chat');
    expect(screen.getByText('do-login')).toBeInTheDocument();
    expect(screen.queryByText('CHAT SCREEN')).not.toBeInTheDocument();
  });

  it('lets an authenticated visitor reach /chat', () => {
    setWebChannelSession({ token: 't', contactId: 1 });
    renderAt('/chat');
    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();
  });

  it('redirects an authenticated visitor away from /login to /chat', () => {
    setWebChannelSession({ token: 't', contactId: 1 });
    renderAt('/login');
    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();
  });

  // Regression: after login sets the session and navigates, the /chat guard must read the
  // FRESH token — not a value captured once in App's body — or the user is bounced back.
  it('navigates to /chat after a successful login (no stale guard)', async () => {
    renderAt('/login');
    expect(screen.getByText('do-login')).toBeInTheDocument();

    fireEvent.click(screen.getByText('do-login'));

    expect(await screen.findByText('CHAT SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('do-login')).not.toBeInTheDocument();
  });
});
