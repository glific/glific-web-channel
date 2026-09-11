import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { WEB_CHANNEL_OTP_RESEND_SECONDS, WEB_CHANNEL_REQUEST_OTP, WEB_CHANNEL_VERIFY_OTP } from '@/config';
import { Login } from './Login';

vi.mock('axios');
const mockedAxios = axios as any;

const BRANDING = {
  display_name: 'Test NGO',
  logo_url: 'https://cdn.example.org/logo.svg',
  primary_color: '#119656',
  primary_foreground: '#fafafa',
  secondary_color: '#eab308',
  about: {
    description: 'Test NGO runs after-school programmes.',
    address: 'Mumbai, Maharashtra',
    website: 'https://test.example.org',
    email: 'hello@test.example.org',
    hours: 'Mon-Fri, 10am-6pm IST',
  },
};

// Branding is resolved in main.tsx before the first render, so components read it
// synchronously. Stub the store rather than the fetch.
vi.mock('@/services/branding', () => ({
  getBranding: () => BRANDING,
  hasOrgProfile: (about: Record<string, unknown>) => Object.values(about).some(Boolean),
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<div>Chat Window</div>} />
      </Routes>
    </MemoryRouter>
  );

const submitPhone = (national = '9999999999', { consent = true } = {}) => {
  if (consent) fireEvent.click(screen.getByTestId('consentCheckbox'));
  fireEvent.change(screen.getByTestId('phoneInput'), { target: { value: national } });
  fireEvent.click(screen.getByTestId('phoneSubmit'));
};

// A keyboard that autofills the whole code types it into the focused box, which is the same path
// a paste takes — and the only way to fill six boxes in one event.
const enterCode = (code: string) => fireEvent.change(screen.getByTestId('otpDigit-0'), { target: { value: code } });

// walk the phone step so the assertions below start on the OTP step
const goToOtpStep = async (national = '9999999999') => {
  await waitFor(() => expect(screen.getByTestId('orgName')).toHaveTextContent('Test NGO'));
  submitPhone(national);
  await waitFor(() => expect(screen.getByText('Enter the 6-digit code')).toBeInTheDocument());
};

describe('<Login />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedAxios.post.mockImplementation((url: string) => {
      if (url === WEB_CHANNEL_REQUEST_OTP) {
        return Promise.resolve({ data: { data: { phone: '+919999999999', message: 'sent' } } });
      }
      if (url === WEB_CHANNEL_VERIFY_OTP) {
        return Promise.resolve({ data: { data: { token: 'jwt-token', contact_id: 77, name: 'Alice' } } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the org hero, the trust pill and the phone step', async () => {
    renderLogin();

    await waitFor(() => expect(screen.getByTestId('orgName')).toHaveTextContent('Test NGO'));
    expect(screen.getByTestId('orgLogo')).toHaveAttribute('src', BRANDING.logo_url);
    expect(screen.getByTestId('orgCaption')).toHaveTextContent(BRANDING.about.description);
    expect(screen.getByTestId('trustPill')).toBeInTheDocument();
    expect(screen.getByText('Enter your phone number to continue')).toBeInTheDocument();
    expect(screen.getByText('Powered by Glific')).toBeInTheDocument();
  });

  // Signing in is what records consent for this channel, so it has to be given before the number
  // leaves the browser rather than after a code has already gone out.
  it('names the organisation in the consent the contact has to give', async () => {
    renderLogin();

    await waitFor(() => expect(screen.getByTestId('consentNotice')).toBeInTheDocument());
    expect(screen.getByTestId('consentNotice')).toHaveTextContent(
      'I agree to chat here and to Test NGO collecting my messages & responses on this channel to run the programme.'
    );
  });

  it('refuses to request a code until consent is given', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    submitPhone('9999999999', { consent: false });

    await waitFor(() => expect(screen.getByTestId('consentError')).toBeInTheDocument());
    expect(mockedAxios.post).not.toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, expect.anything());
  });

  it('spells out what is collected, why and for how long, without leaving the form', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('dataUseToggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('dataUseToggle'));

    expect(screen.getByTestId('dataUseNote')).toHaveTextContent("What's collected");
    expect(screen.getByTestId('dataUseNote')).toHaveTextContent(BRANDING.about.email);
  });

  it('does not repeat the consent on the OTP step', async () => {
    renderLogin();
    await goToOtpStep();

    expect(screen.queryByTestId('consentNotice')).not.toBeInTheDocument();
  });

  it('sends the country code and the number as one value', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    submitPhone('9820198765');

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '+919820198765' })
    );
  });

  it('strips spaces and brackets before sending the phone to the server', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    submitPhone('98201-98765');

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '+919820198765' })
    );
  });

  it('lets a contact outside India change the country code', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('countryCode')).toHaveValue('+91'));

    fireEvent.change(screen.getByTestId('countryCode'), { target: { value: '+254' } });
    submitPhone('712345678');

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '+254712345678' })
    );
  });

  it('blocks the request-otp call entirely when the phone fails the format check', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    submitPhone('12345');

    await waitFor(() => expect(screen.getByTestId('phoneError')).toBeInTheDocument());
    expect(mockedAxios.post).not.toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, expect.anything());
    expect(screen.queryByText('Enter the 6-digit code')).not.toBeInTheDocument();
  });

  it('verifies the OTP and stores the web-channel session', async () => {
    renderLogin();
    await goToOtpStep();

    enterCode('123456');

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, {
        phone: '+919999999999',
        otp: '123456',
      })
    );
    await waitFor(() => expect(screen.getByText('Chat Window')).toBeInTheDocument());

    expect(JSON.parse(localStorage.getItem('web_channel_session') as string)).toEqual({
      token: 'jwt-token',
      contactId: 77,
      name: 'Alice',
      phone: '+919999999999',
    });
  });

  it('submits as soon as the last digit lands, without reaching for the button', async () => {
    renderLogin();
    await goToOtpStep();

    // Five digits is not a code; nothing should be sent yet.
    enterCode('12345');
    expect(mockedAxios.post).not.toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, expect.anything());

    enterCode('123456');
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, expect.anything()));
  });

  it('spreads a pasted code across the boxes', async () => {
    renderLogin();
    await goToOtpStep();

    enterCode('482913');

    expect(screen.getByTestId('otpDigit-0')).toHaveValue('4');
    expect(screen.getByTestId('otpDigit-5')).toHaveValue('3');
  });

  it('says the code comes over WhatsApp, and to which number', async () => {
    renderLogin();
    await goToOtpStep('9820198765');

    expect(screen.getByTestId('otpSentTo')).toHaveTextContent('Sent on WhatsApp to +919820198765');
  });

  it('shows the wrong-code copy on a 401 from verify-otp', async () => {
    renderLogin();
    await goToOtpStep();

    mockedAxios.post.mockImplementationOnce(() => Promise.reject({ response: { status: 401 } }));
    enterCode('000000');

    await waitFor(() =>
      expect(screen.getByTestId('otpError')).toHaveTextContent('That code is not right. Check it and try again.')
    );
  });

  it('falls back to generic copy when verify-otp fails with no response (network error)', async () => {
    renderLogin();
    await goToOtpStep();

    mockedAxios.post.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
    enterCode('123456');

    await waitFor(() =>
      expect(screen.getByTestId('otpError')).toHaveTextContent('Something went wrong. Please try again.')
    );
  });

  it('blocks the verify-otp call when the code is not 6 digits', async () => {
    renderLogin();
    await goToOtpStep();

    enterCode('123');
    fireEvent.click(screen.getByTestId('otpSubmit'));

    await waitFor(() => expect(screen.getByText('Enter the 6-digit code we sent you.')).toBeInTheDocument());
    expect(mockedAxios.post).not.toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, expect.anything());
  });

  // A 429 on request-otp means a code IS already in the user's WhatsApp. Leaving them on the
  // phone step would hand them a live code with nowhere to type it.
  it('advances to the OTP step when request-otp is throttled with a 429', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 429,
          data: { error: { status: 429, message: 'An OTP was just sent. Please try again in 30 seconds.' } },
        },
      })
    );
    submitPhone();

    await waitFor(() => expect(screen.getByText('Enter the 6-digit code')).toBeInTheDocument());
    // the server's wait, verbatim — but as information about a code they have, not a failure
    expect(screen.getByTestId('otpNotice')).toHaveTextContent('An OTP was just sent. Please try again in 30 seconds.');
    expect(screen.queryByTestId('otpError')).not.toBeInTheDocument();
    expect(screen.getByTestId('otpResend')).toBeDisabled();
  });

  it('still keeps the user on the phone step for every other request-otp failure', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() => Promise.reject({ response: { status: 500 } }));
    submitPhone();

    await waitFor(() =>
      expect(screen.getByTestId('phoneRequestError')).toHaveTextContent('Something went wrong. Please try again.')
    );
    expect(screen.queryByText('Enter the 6-digit code')).not.toBeInTheDocument();
  });

  it('renders the not-enabled copy when the org has the web channel turned off (404)', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() => Promise.reject({ response: { status: 404 } }));
    submitPhone();

    await waitFor(() =>
      expect(screen.getByTestId('phoneRequestError')).toHaveTextContent(
        'Messaging is not available for this organisation yet.'
      )
    );
  });

  it('renders the server phone-format message on a 422 from request-otp', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('phoneInput')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 422,
          data: {
            error: { status: 422, message: 'Please enter the phone number with country code, without the + symbol.' },
          },
        },
      })
    );
    // passes the client pre-check, rejected by ExPhoneNumber on the server
    submitPhone('1111111111');

    await waitFor(() =>
      expect(screen.getByTestId('phoneRequestError')).toHaveTextContent(
        'Please enter the phone number with country code, without the + symbol.'
      )
    );
  });

  it('disables the resend button while the countdown runs and re-enables it after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLogin();
    await goToOtpStep();

    expect(screen.getByTestId('otpResend')).toBeDisabled();
    expect(screen.getByTestId('otpResend')).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS}s`);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('otpResend')).toBeDisabled();
    expect(screen.getByTestId('otpResend')).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS - 1}s`);

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_OTP_RESEND_SECONDS * 1000);
    });
    await waitFor(() => expect(screen.getByTestId('otpResend')).toBeEnabled());
    expect(screen.getByTestId('otpResend')).toHaveTextContent('Resend code');
  });

  it('re-requests the code and restarts the countdown when resend is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLogin();
    await goToOtpStep();

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_OTP_RESEND_SECONDS * 1000);
    });
    await waitFor(() => expect(screen.getByTestId('otpResend')).toBeEnabled());

    mockedAxios.post.mockClear();
    fireEvent.click(screen.getByTestId('otpResend'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '+919999999999' })
    );
    await waitFor(() => expect(screen.getByTestId('otpNotice')).toBeInTheDocument());
    expect(screen.getByTestId('otpResend')).toBeDisabled();
  });

  it('surfaces the throttle message when a resend is rejected with a 429', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLogin();
    await goToOtpStep();

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_OTP_RESEND_SECONDS * 1000);
    });
    await waitFor(() => expect(screen.getByTestId('otpResend')).toBeEnabled());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 429,
          data: { error: { status: 429, message: 'An OTP was just sent. Please try again in 30 seconds.' } },
        },
      })
    );
    fireEvent.click(screen.getByTestId('otpResend'));

    await waitFor(() =>
      expect(screen.getByTestId('otpError')).toHaveTextContent('An OTP was just sent. Please try again in 30 seconds.')
    );
  });

  it('returns to the phone step with the number still there, so a typo is a correction', async () => {
    renderLogin();
    await goToOtpStep('9820198765');

    fireEvent.click(screen.getByTestId('otpBack'));

    await waitFor(() => expect(screen.getByText('Enter your phone number to continue')).toBeInTheDocument());
    // Still filled rather than blank: the user is correcting a digit, not starting over. Consent
    // stays given too — it was given for this channel, not for the number they mistyped.
    expect(screen.getByTestId('phoneInput')).toHaveValue('9820198765');
    expect(screen.getByTestId('consentCheckbox')).toBeChecked();
  });

  it('sends the code to the corrected number after going back', async () => {
    renderLogin();
    await goToOtpStep('9820198765');

    fireEvent.click(screen.getByTestId('otpBack'));
    await waitFor(() => expect(screen.getByText('Enter your phone number to continue')).toBeInTheDocument());

    mockedAxios.post.mockClear();
    fireEvent.change(screen.getByTestId('phoneInput'), { target: { value: '9820100000' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '+919820100000' })
    );
    await waitFor(() => expect(screen.getByTestId('otpSentTo')).toHaveTextContent('+919820100000'));
  });

  it('clears the code entered for the previous number', async () => {
    renderLogin();
    await goToOtpStep();

    enterCode('12345');

    fireEvent.click(screen.getByTestId('otpBack'));
    await waitFor(() => expect(screen.getByText('Enter your phone number to continue')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('phoneSubmit'));
    await waitFor(() => expect(screen.getByText('Enter the 6-digit code')).toBeInTheDocument());

    // A code minted for the previous number must not be sitting in the boxes ready to submit.
    expect(screen.getByTestId('otpDigit-0')).toHaveValue('');
  });

  // Note this passes because requesting a code for the corrected number sets a fresh countdown,
  // not because of any reset in the back handler — the behaviour is what matters, but do not read
  // this as covering onChangeNumber's setResendIn(0), which is not observable from the DOM.
  it('shows a full countdown for the corrected number, not the remainder of the old one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderLogin();
    await goToOtpStep();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('otpResend')).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS - 10}s`);

    fireEvent.click(screen.getByTestId('otpBack'));
    await waitFor(() => expect(screen.getByText('Enter your phone number to continue')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('phoneSubmit'));
    await waitFor(() => expect(screen.getByText('Enter the 6-digit code')).toBeInTheDocument());

    expect(screen.getByTestId('otpResend')).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS}s`);
  });

  it('offers the business profile before sign-in, where there is no chat to leave', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByTestId('aboutToggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('aboutToggle'));

    expect(screen.getByTestId('orgProfile')).toBeInTheDocument();
    expect(screen.getByTestId('about-address')).toHaveTextContent('Mumbai, Maharashtra');
  });
});
