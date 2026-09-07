import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_CHANNEL_REQUEST_OTP, WEB_CHANNEL_VERIFY_OTP } from '@/config';
import { Login } from './Login';

vi.mock('axios');
const mockedAxios = axios as any;

// The theme is resolved in main.tsx before the first render, so components read it
// synchronously. Stub the store rather than the fetch.
vi.mock('@/services/branding', () => ({
  getBranding: () => ({
    theme: 'violet',
    logo_url: 'https://cdn.example.org/logo.svg',
    display_name: 'Test NGO',
  }),
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<div>Chat Window</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('<Login />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === WEB_CHANNEL_REQUEST_OTP) {
        return Promise.resolve({
          data: { data: { phone: '919999999999', message: 'sent' } },
        });
      }
      if (url === WEB_CHANNEL_VERIFY_OTP) {
        return Promise.resolve({
          data: { data: { token: 'jwt-token', contact_id: 77, name: 'Alice' } },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders the phone step with the NGO logo, name and "powered by Glific" branding', async () => {
    const { container } = renderLogin();

    // branding
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());
    expect(screen.getByTestId('orgLogo')).toHaveAttribute('src', 'https://cdn.example.org/logo.svg');
    expect(screen.getByText('powered by Glific')).toBeInTheDocument();

    // phone step is shown
    expect(screen.getByText('Enter your phone number')).toBeInTheDocument();
    expect(container.querySelector('input[type="tel"]')).toBeInTheDocument();
  });

  it('verifies the OTP and stores the web-channel session', async () => {
    const { container } = renderLogin();

    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    // Step 1: fill phone and submit
    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    // request-otp was called
    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, {
        phone: '919999999999',
      }),
    );

    // Step 2: OTP field appears
    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());
    const otp = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(otp, { target: { value: '9999' } });
    fireEvent.click(screen.getByTestId('otpSubmit'));

    // verify-otp called and navigation to chat happened
    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, {
        phone: '919999999999',
        otp: '9999',
      }),
    );
    await waitFor(() => expect(screen.getByText('Chat Window')).toBeInTheDocument());

    // session stored under the dedicated key
    const stored = JSON.parse(localStorage.getItem('web_channel_session') as string);
    expect(stored).toEqual({
      token: 'jwt-token',
      contactId: 77,
      name: 'Alice',
    });
  });

  it('shows an inline "Invalid OTP" error on a 401', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());

    // make verify fail
    mockedAxios.post.mockImplementationOnce(() => Promise.reject({ response: { status: 401 } }));

    const otp = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(otp, { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('otpSubmit'));

    await waitFor(() => expect(screen.getByTestId('otpError')).toHaveTextContent('Invalid OTP'));
  });
});
