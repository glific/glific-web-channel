import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { WEB_CHANNEL_OTP_RESEND_SECONDS, WEB_CHANNEL_REQUEST_OTP, WEB_CHANNEL_VERIFY_OTP } from '@/config';
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

// walk the phone step so the assertions below start on the OTP step
const goToOtpStep = async (container: HTMLElement, phoneNumber = '919999999999') => {
  await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());
  const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
  fireEvent.change(phone, { target: { value: phoneNumber } });
  fireEvent.click(screen.getByTestId('phoneSubmit'));
  await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());
};

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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the organisation in a consent notice before the number can be submitted', async () => {
    renderLogin();

    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    // On the phone step, so consent is given before the number leaves the browser — not on the
    // OTP step, by which point the number has already been submitted.
    expect(screen.getByTestId('consentNotice')).toHaveTextContent(
      'By continuing, you agree to receive messages from Test NGO on this chat.'
    );
  });

  it('does not repeat the consent notice on the OTP step', async () => {
    const { container } = renderLogin();

    await goToOtpStep(container);

    expect(screen.queryByTestId('consentNotice')).not.toBeInTheDocument();
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
    fireEvent.change(otp, { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('otpSubmit'));

    // verify-otp called and navigation to chat happened
    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, { phone: '919999999999', otp: '123456' })
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

  it('shows the wrong-code copy on a 401 from verify-otp', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());

    // make verify fail
    mockedAxios.post.mockImplementationOnce(() => Promise.reject({ response: { status: 401 } }));

    const otp = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(otp, { target: { value: '000000' } });
    fireEvent.click(screen.getByTestId('otpSubmit'));

    await waitFor(() =>
      expect(screen.getByTestId('otpError')).toHaveTextContent('That code is not right. Check it and try again.')
    );
  });

  it('blocks the request-otp call entirely when the phone fails the format check', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '12345' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(screen.getByTestId('phoneError')).toHaveTextContent(
        'Enter your number with country code, for example 919820198765.'
      )
    );
    // only the branding call went out; request-otp was never attempted
    expect(mockedAxios.post).not.toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, expect.anything());
    expect(screen.queryByText('Enter the OTP')).not.toBeInTheDocument();
  });

  it('strips spaces and brackets before sending the phone to the server', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '91 98201-98765' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '919820198765' })
    );
  });

  // A 429 on request-otp means a code IS already in the user's WhatsApp. Leaving them on the
  // phone step would hand them a live code with nowhere to type it.
  it('advances to the OTP step when request-otp is throttled with a 429', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 429,
          data: { error: { status: 429, message: 'An OTP was just sent. Please try again in 30 seconds.' } },
        },
      })
    );

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());
    expect(screen.getByText('We sent a one-time code to 919999999999 on WhatsApp.')).toBeInTheDocument();
  });

  it('shows the throttle wait as a notice, not an error, on the OTP step', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 429,
          data: { error: { status: 429, message: 'An OTP was just sent. Please try again in 30 seconds.' } },
        },
      })
    );

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    // the server's wait, verbatim — but as information about a code they have, not a failure
    await waitFor(() =>
      expect(screen.getByTestId('otpNotice')).toHaveTextContent(
        'An OTP was just sent. Please try again in 30 seconds.'
      )
    );
    expect(screen.queryByTestId('otpError')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phoneRequestError')).not.toBeInTheDocument();
  });

  it('starts the resend countdown after a 429, so the user cannot immediately re-throttle', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 429,
          data: { error: { status: 429, message: 'An OTP was just sent. Please try again in 30 seconds.' } },
        },
      })
    );

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());
    expect(screen.getByTestId('otpResend')).toBeDisabled();
    expect(screen.getByTestId('otpResend')).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS}s`);
  });

  it('still keeps the user on the phone step for every other request-otp failure', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() => Promise.reject({ response: { status: 500 } }));

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(screen.getByTestId('phoneRequestError')).toHaveTextContent('Something went wrong. Please try again.')
    );
    expect(screen.queryByText('Enter the OTP')).not.toBeInTheDocument();
  });

  it('renders the not-enabled copy when the org has the web channel turned off (404)', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 404,
          data: { error: { status: 404, message: 'Web channel is not enabled for this organization' } },
        },
      })
    );

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919999999999' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(screen.getByTestId('phoneRequestError')).toHaveTextContent(
        'Messaging is not available for this organisation yet.'
      )
    );
  });

  it('renders the server phone-format message on a 422 from request-otp', async () => {
    const { container } = renderLogin();
    await waitFor(() => expect(screen.getByText('Test NGO')).toBeInTheDocument());

    mockedAxios.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 422,
          data: {
            error: {
              status: 422,
              message: 'Please enter the phone number with country code, without the + symbol.',
            },
          },
        },
      })
    );

    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    // passes the client pre-check, rejected by ExPhoneNumber on the server
    fireEvent.change(phone, { target: { value: '911111111111' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(screen.getByTestId('phoneRequestError')).toHaveTextContent(
        'Please enter the phone number with country code, without the + symbol.'
      )
    );
  });

  it('blocks the verify-otp call when the code is not 4-6 digits', async () => {
    const { container } = renderLogin();
    await goToOtpStep(container);

    const otp = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(otp, { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('otpSubmit'));

    await waitFor(() => expect(screen.getByText('Enter the 6-digit code we sent you.')).toBeInTheDocument());
    expect(mockedAxios.post).not.toHaveBeenCalledWith(WEB_CHANNEL_VERIFY_OTP, expect.anything());
  });

  it('explains that the code arrives on WhatsApp instead of the prototype hint', async () => {
    const { container } = renderLogin();
    // a number with no 9999 in it, so the echoed phone cannot mask the assertion below
    await goToOtpStep(container, '919820198765');

    expect(screen.getByText(/Didn't get a code\?/)).toBeInTheDocument();
    expect(screen.getByText(/arrives as a WhatsApp message/)).toBeInTheDocument();
    // the "9999" prototype bypass and its visible hint are both gone
    expect(container.textContent).not.toContain('9999');
    expect(container.textContent).not.toContain('Prototype');
  });

  it('disables the resend button while the countdown runs and re-enables it after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderLogin();
    await goToOtpStep(container);

    const resend = screen.getByTestId('otpResend');
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS}s`);

    // part way through: still counting
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('otpResend')).toBeDisabled();
    expect(screen.getByTestId('otpResend')).toHaveTextContent(
      `Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS - 1}s`
    );

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_OTP_RESEND_SECONDS * 1000);
    });
    await waitFor(() => expect(screen.getByTestId('otpResend')).toBeEnabled());
    expect(screen.getByTestId('otpResend')).toHaveTextContent('Resend code');
  });

  it('re-requests the code and restarts the countdown when resend is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderLogin();
    await goToOtpStep(container);

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_OTP_RESEND_SECONDS * 1000);
    });
    await waitFor(() => expect(screen.getByTestId('otpResend')).toBeEnabled());

    mockedAxios.post.mockClear();
    fireEvent.click(screen.getByTestId('otpResend'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '919999999999' })
    );
    await waitFor(() => expect(screen.getByTestId('otpNotice')).toBeInTheDocument());
    expect(screen.getByTestId('otpResend')).toBeDisabled();
    expect(screen.getByTestId('otpResend')).toHaveTextContent(`Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS}s`);
  });

  it('surfaces the throttle message when a resend is rejected with a 429', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderLogin();
    await goToOtpStep(container);

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
      expect(screen.getByTestId('otpError')).toHaveTextContent(
        'An OTP was just sent. Please try again in 30 seconds.'
      )
    );
  });

  it('returns to the phone step and pre-fills the number, so a typo is a correction', async () => {
    const { container } = renderLogin();
    await goToOtpStep(container, '919820198765');

    fireEvent.click(screen.getByTestId('otpBack'));

    await waitFor(() => expect(screen.getByText('Enter your phone number')).toBeInTheDocument());
    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    // Pre-filled rather than blank: the user is correcting a digit, not starting over.
    expect(phone.value).toBe('919820198765');
  });

  it('sends the code to the corrected number after going back', async () => {
    const { container } = renderLogin();
    await goToOtpStep(container, '919820198765');

    fireEvent.click(screen.getByTestId('otpBack'));
    await waitFor(() => expect(screen.getByText('Enter your phone number')).toBeInTheDocument());

    mockedAxios.post.mockClear();
    const phone = container.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '919820100000' } });
    fireEvent.click(screen.getByTestId('phoneSubmit'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_REQUEST_OTP, { phone: '919820100000' })
    );
    await waitFor(() =>
      expect(screen.getByText('We sent a one-time code to 919820100000 on WhatsApp.')).toBeInTheDocument()
    );
  });

  it('clears the code entered for the previous number', async () => {
    const { container } = renderLogin();
    await goToOtpStep(container);

    const otp = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(otp, { target: { value: '123456' } });

    fireEvent.click(screen.getByTestId('otpBack'));
    await waitFor(() => expect(screen.getByText('Enter your phone number')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('phoneSubmit'));
    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());

    // A code minted for the previous number must not be sitting in the field ready to submit.
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  // Note this passes because requesting a code for the corrected number sets a fresh countdown,
  // not because of any reset in the back handler — the behaviour is what matters, but do not read
  // this as covering onChangeNumber's setResendIn(0), which is not observable from the DOM.
  it('shows a full countdown for the corrected number, not the remainder of the old one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderLogin();
    await goToOtpStep(container);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('otpResend')).toHaveTextContent(
      `Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS - 10}s`
    );

    fireEvent.click(screen.getByTestId('otpBack'));
    await waitFor(() => expect(screen.getByText('Enter your phone number')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('phoneSubmit'));
    await waitFor(() => expect(screen.getByText('Enter the OTP')).toBeInTheDocument());

    expect(screen.getByTestId('otpResend')).toHaveTextContent(
      `Resend in ${WEB_CHANNEL_OTP_RESEND_SECONDS}s`
    );
  });

  it('falls back to generic copy when verify-otp fails with no response (network error)', async () => {
    const { container } = renderLogin();
    await goToOtpStep(container);

    mockedAxios.post.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));

    const otp = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(otp, { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('otpSubmit'));

    await waitFor(() =>
      expect(screen.getByTestId('otpError')).toHaveTextContent('Something went wrong. Please try again.')
    );
  });
});
