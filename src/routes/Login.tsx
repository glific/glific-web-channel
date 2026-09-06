import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/branding/Logo';
import { getBranding } from '@/services/branding';
import { WEB_CHANNEL_OTP_RESEND_SECONDS } from '@/config';
import {
  requestOtp,
  verifyOtp,
  setWebChannelSession,
  webChannelErrorMessage,
  webChannelErrorStatus,
} from '@/services/webChannelAuth';

// Courtesy pre-check only — the server runs ExPhoneNumber and stays the authority, so a number
// that passes here can still come back 422.
const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, 'Please enter your phone number.')
    .transform((value) => value.replace(/[\s()-]/g, ''))
    .refine(
      (value) => /^\+?[1-9]\d{7,14}$/.test(value),
      'Enter your number with country code, for example 919820198765.'
    ),
});
const otpSchema = z.object({
  // PasswordlessAuth mints 6 digits, so a shorter entry can only ever come back 401.
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code we sent you.'),
});

type PhoneValues = z.infer<typeof phoneSchema>;
type OtpValues = z.infer<typeof otpSchema>;

export const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // seconds left before a resend is allowed; mirrors the server's per-IP window
  const [resendIn, setResendIn] = useState(0);

  const phoneForm = useForm<PhoneValues>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '' } });
  const otpForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  // one interval per countdown; it is cleared when the countdown ends or the form unmounts
  const counting = resendIn > 0;
  useEffect(() => {
    if (!counting) return undefined;
    const interval = setInterval(() => setResendIn((seconds) => (seconds <= 1 ? 0 : seconds - 1)), 1000);
    return () => clearInterval(interval);
  }, [counting]);

  const goToOtpStep = (phoneNumber: string) => {
    setPhone(phoneNumber);
    setResendIn(WEB_CHANNEL_OTP_RESEND_SECONDS);
    setStep('otp');
  };

  const onPhoneSubmit = (values: PhoneValues) => {
    setError('');
    setNotice('');
    setLoading(true);
    requestOtp(values.phone)
      .then(() => goToOtpStep(values.phone))
      .catch((requestError) => {
        // A 429 means a code was ALREADY sent, not that sending failed. Holding the user here
        // would leave a live code in their WhatsApp with nowhere to type it.
        if (webChannelErrorStatus(requestError) === 429) {
          goToOtpStep(values.phone);
          setNotice(webChannelErrorMessage(requestError));
          return;
        }

        setError(webChannelErrorMessage(requestError));
      })
      .finally(() => setLoading(false));
  };

  const onResend = () => {
    setError('');
    setNotice('');
    setResending(true);
    requestOtp(phone)
      .then(() => {
        setResendIn(WEB_CHANNEL_OTP_RESEND_SECONDS);
        setNotice('We have sent another code to your WhatsApp.');
      })
      .catch((requestError) => setError(webChannelErrorMessage(requestError)))
      .finally(() => setResending(false));
  };

  // Pre-fills the number so a mistyped digit is a correction rather than a retype. setResendIn(0)
  // only stops a timer that is no longer on screen; onPhoneSubmit sets the countdown the user
  // next sees.
  const onChangeNumber = () => {
    setError('');
    setNotice('');
    setResendIn(0);
    otpForm.reset({ otp: '' });
    phoneForm.reset({ phone });
    setStep('phone');
  };

  const onOtpSubmit = (values: OtpValues) => {
    setError('');
    setNotice('');
    setLoading(true);
    verifyOtp(phone, values.otp)
      .then(({ data }) => {
        const { token, contact_id: contactId, name } = data?.data ?? {};
        setWebChannelSession({ token, contactId, name });
        navigate('/chat');
      })
      .catch((verifyError) => setError(webChannelErrorMessage(verifyError)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-muted/30 p-4" data-testid="webChannelLogin">
      <Card className="w-full max-w-sm gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <Logo size={80} className="mb-2" />
          <div className="text-xl font-semibold">{getBranding().display_name}</div>
          <div className="text-xs text-muted-foreground">powered by Glific</div>
        </div>

        {step === 'phone' ? (
          <form className="flex flex-col gap-4" onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Enter your phone number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Your phone number"
                autoFocus
                {...phoneForm.register('phone')}
              />
              <p className="text-xs text-muted-foreground">
                We'll send a one-time code to this number on WhatsApp.
              </p>
              {phoneForm.formState.errors.phone && (
                <p className="text-xs text-destructive" data-testid="phoneError">
                  {phoneForm.formState.errors.phone.message}
                </p>
              )}
            </div>
            {/* Shown before the number can be submitted, not on the OTP step: signing in is what
                records consent for this channel, so the notice has to precede it. */}
            <p className="text-xs text-muted-foreground" data-testid="consentNotice">
              By continuing, you agree to receive messages from {orgName} on this chat.
            </p>
            <Button type="submit" data-testid="phoneSubmit" disabled={loading}>
              {loading ? 'Sending…' : 'Send OTP'}
            </Button>
            {error && (
              <p className="text-center text-xs text-destructive" data-testid="phoneRequestError">
                {error}
              </p>
            )}
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={otpForm.handleSubmit(onOtpSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp">Enter the OTP</Label>
              <Input id="otp" inputMode="numeric" placeholder="OTP" autoFocus {...otpForm.register('otp')} />
              <p className="text-xs text-muted-foreground">We sent a one-time code to {phone} on WhatsApp.</p>
              <button
                type="button"
                data-testid="otpBack"
                onClick={onChangeNumber}
                className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                <ArrowLeft className="size-3" aria-hidden="true" />
                Use a different number
              </button>
              {otpForm.formState.errors.otp && (
                <p className="text-xs text-destructive">{otpForm.formState.errors.otp.message}</p>
              )}
            </div>
            <Button type="submit" data-testid="otpSubmit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </Button>

            {/* request-otp answers identically for a number it has never seen, so nothing tells
                the user they mistyped. This block is their only recourse. */}
            <div className="flex flex-col items-center gap-1.5 text-center">
              <p className="text-xs text-muted-foreground">
                Didn't get a code? It arrives as a WhatsApp message and can take a moment. Check that you
                entered the number your WhatsApp account uses.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="otpResend"
                disabled={resending || resendIn > 0}
                onClick={onResend}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : resending ? 'Sending…' : 'Resend code'}
              </Button>
            </div>

            {notice && (
              <p className="text-center text-xs text-muted-foreground" data-testid="otpNotice">
                {notice}
              </p>
            )}
            {error && (
              <p className="text-center text-xs text-destructive" data-testid="otpError">
                {error}
              </p>
            )}
          </form>
        )}
      </Card>
    </div>
  );
};

export default Login;
