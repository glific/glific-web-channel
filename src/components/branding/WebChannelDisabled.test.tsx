import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';

import { App } from '@/App';
import { WebChannelDisabled } from './WebChannelDisabled';
import { setWebChannelSession } from '@/services/webChannelAuth';
import { tokenExpiringIn } from '@/test/token';

// Mocked rather than driven through markWebChannelDisabled, which is one-way module state: a
// test that flipped it would decide the outcome of every test after it in the file.
vi.mock('@/services/branding', () => ({
  isWebChannelEnabled: () => false,
  getBranding: () => ({
    enabled: false,
    display_name: 'Yein Udaan',
    whatsapp_number: '919876543210',
    logo_url: null,
    primary_color: '#119656',
    primary_foreground: '#fafafa',
    secondary_color: '#eab308',
    about: { description: null, address: null, website: null, email: null, hours: null },
  }),
}));

vi.mock('@/routes/Chat', () => ({ Chat: () => <div>CHAT SCREEN</div> }));
vi.mock('@/routes/Login', () => ({ Login: () => <div>LOGIN SCREEN</div> }));

describe('<WebChannelDisabled />', () => {
  it('names the organisation and points the contact at WhatsApp instead', () => {
    render(<WebChannelDisabled />);

    expect(screen.getByTestId('disabledOrgName')).toHaveTextContent('Yein Udaan');
    expect(screen.getByTestId('webChannelDisabled')).toHaveTextContent(
      'Yein Udaan has not enabled messaging through browser.'
    );
    expect(screen.getByTestId('whatsappLink')).toHaveAttribute('href', 'https://wa.me/919876543210');
  });

  // The name identifies the org here; an org that never configured the channel never uploaded a
  // logo, so there is nothing to show.
  it('shows no logo', () => {
    render(<WebChannelDisabled />);

    expect(screen.queryByTestId('orgLogo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('orgInitials')).not.toBeInTheDocument();
  });
});

describe('an organisation with the web channel switched off', () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    );

  // A sign-in form would take a phone number, send nothing, and leave the visitor waiting for a
  // code that is never coming — so there is no form, on any route.
  it('replaces the whole app, for a visitor who has never signed in', () => {
    renderAt('/login');

    expect(screen.getByTestId('webChannelDisabled')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN SCREEN')).not.toBeInTheDocument();
  });

  it('replaces the whole app, for a contact who still holds a live token', () => {
    setWebChannelSession({ token: tokenExpiringIn(3600), contactId: 1 });

    renderAt('/chat');

    expect(screen.getByTestId('webChannelDisabled')).toBeInTheDocument();
    expect(screen.queryByText('CHAT SCREEN')).not.toBeInTheDocument();
  });
});
