import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { App } from './App';
import { getWebChannelSession, setWebChannelSession } from '@/services/webChannelAuth';
import { tokenExpiringIn } from '@/test/token';

// The guards read the token's expiry, not just its presence, so every fixture here is a real
// (unsigned) JWT with an exp we control.

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
          localStorage.setItem(
            'web_channel_session',
            JSON.stringify({ token: tokenExpiringIn(3600), contactId: 1 })
          );
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
    setWebChannelSession({ token: tokenExpiringIn(3600), contactId: 1 });
    renderAt('/chat');
    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();
  });

  it('redirects an authenticated visitor away from /login to /chat', () => {
    setWebChannelSession({ token: tokenExpiringIn(3600), contactId: 1 });
    renderAt('/login');
    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();
  });

  // An expired token is worse than no token: it gets the user onto /chat, where the socket join
  // then fails with nothing on screen to explain it. Both guards treat it as signed out.
  it('treats an expired token as signed out and clears it', () => {
    setWebChannelSession({ token: tokenExpiringIn(-60), contactId: 1 });

    renderAt('/chat');

    expect(screen.getByText('do-login')).toBeInTheDocument();
    expect(screen.queryByText('CHAT SCREEN')).not.toBeInTheDocument();
    // the dead session is dropped on the way past, so nothing downstream has to re-judge it
    expect(getWebChannelSession()).toBeNull();
  });

  it('keeps an expired visitor on /login instead of bouncing them to a chat that cannot connect', () => {
    setWebChannelSession({ token: tokenExpiringIn(-1), contactId: 1 });

    renderAt('/login');

    expect(screen.getByText('do-login')).toBeInTheDocument();
    expect(getWebChannelSession()).toBeNull();
  });

  it('treats a token with no readable expiry as signed out', () => {
    setWebChannelSession({ token: 'not-a-jwt', contactId: 1 });

    renderAt('/chat');

    expect(screen.getByText('do-login')).toBeInTheDocument();
    expect(getWebChannelSession()).toBeNull();
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
