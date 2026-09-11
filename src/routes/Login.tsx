import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OrgHero } from '@/components/branding/OrgHero';
import { OrgProfile } from '@/components/branding/OrgProfile';
import { OtpInput } from '@/components/auth/OtpInput';
import { getBranding, hasOrgProfile } from '@/services/branding';
import { WEB_CHANNEL_OTP_RESEND_SECONDS } from '@/config';
import { cn } from '@/lib/utils';
import {
  requestOtp,
  verifyOtp,
  setWebChannelSession,
  webChannelErrorMessage,
  webChannelErrorStatus,
} from '@/services/webChannelAuth';

const fullNumber = (countryCode: string, phone: string) => `${countryCode}${phone}`.replace(/[\s()-]/g, '');

// Courtesy pre-check only — the server runs ExPhoneNumber and stays the authority, so a number
// that passes here can still come back 422.
const phoneSchema = z
  .object({
    countryCode: z.string().trim().regex(/^\+?\d{1,4}$/, 'Enter a country code, for example +91.'),
    phone: z.string().trim().min(1, 'Please enter your phone number.'),
    // Signing in is what records consent for this channel, so it gates the request rather than
    // being collected after a code has already gone out.
    consent: z.literal(true),
  })
  .refine(({ countryCode, phone }) => /^\+?[1-9]\d{7,14}$/.test(fullNumber(countryCode, phone)), {
    path: ['phone'],
    message: 'Enter your number without the country code, for example 9820198765.',
  });

const otpSchema = z.object({
  // PasswordlessAuth mints 6 digits, so a shorter entry can only ever come back 401.
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code we sent you.'),
});

type PhoneValues = z.infer<typeof phoneSchema>;
type OtpValues = z.infer<typeof otpSchema>;

const TrustPill = () => (
  <div
    className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
    data-testid="trustPill"
  >
    <Lock className="size-3.5" aria-hidden="true" />
    Secure sign-in · verified organisation
  </div>
);

const Disclosure = ({ label, testId, children }: { label: string; testId: string; children: ReactNode }) => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        data-testid={testId}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
      >
        {label}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
};

// The organisation is the data controller and Glific does not know its retention policy, so this
// says what the channel itself does and points at the organisation rather than inventing terms on
// its behalf.
const DataUseNote = ({ orgName, email }: { orgName: string; email: string | null }) => (
  <div className="rounded-xl bg-muted px-3 py-3 text-xs leading-relaxed text-muted-foreground" data-testid="dataUseNote">
    <p>
      <strong className="text-foreground">What's collected.</strong> The messages and responses you send on this chat,
      and the phone number you sign in with.
    </p>
    <p className="mt-2">
      <strong className="text-foreground">Why.</strong> So {orgName} can run the programme with you and pick the
      conversation up where you left it.
    </p>
    <p className="mt-2">
      <strong className="text-foreground">How long.</strong> For as long as {orgName} runs the programme, under their
      own retention policy.
      {email && (
        <>
          {' '}
          Ask them at{' '}
          <a href={`mailto:${email}`} className="text-primary hover:underline">
            {email}
          </a>
          .
        </>
      )}
    </p>
  </div>
);

export const Login = () => {
  const navigate = useNavigate();
  const branding = getBranding();
  const orgName = branding.display_name;

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // seconds left before a resend is allowed; mirrors the server's per-IP window
  const [resendIn, setResendIn] = useState(0);

  const phoneForm = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { countryCode: '+91', phone: '', consent: false as true },
  });
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
    const number = fullNumber(values.countryCode, values.phone);
    setError('');
    setNotice('');
    setLoading(true);
    requestOtp(number)
      .then(() => goToOtpStep(number))
      .catch((requestError) => {
        // A 429 means a code was ALREADY sent, not that sending failed. Holding the user here
        // would leave a live code in their WhatsApp with nowhere to type it.
        if (webChannelErrorStatus(requestError) === 429) {
          goToOtpStep(number);
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

  // setResendIn(0) only stops a timer that is no longer on screen; onPhoneSubmit sets the
  // countdown the user next sees. The consent tick survives, because it was given for this
  // channel rather than for the number that was mistyped.
  const onChangeNumber = () => {
    setError('');
    setNotice('');
    setResendIn(0);
    otpForm.reset({ otp: '' });
    setStep('phone');
  };

  const onOtpSubmit = (values: OtpValues) => {
    setError('');
    setNotice('');
    setLoading(true);
    verifyOtp(phone, values.otp)
      .then(({ data }) => {
        const { token, contact_id: contactId, name } = data?.data ?? {};
        setWebChannelSession({ token, contactId, name, phone });
        navigate('/chat');
      })
      .catch((verifyError) => setError(webChannelErrorMessage(verifyError)))
      .finally(() => setLoading(false));
  };

  const phoneErrors = phoneForm.formState.errors;

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col bg-background" data-testid="webChannelLogin">
      <OrgHero />

      <main className="flex flex-1 flex-col gap-5 px-6 py-6">
        <TrustPill />

        {step === 'phone' ? (
          <form className="flex flex-col gap-5" onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} noValidate>
            <h2 className="text-lg font-bold">Enter your phone number to continue</h2>

            <div className="flex flex-col gap-1.5">
              <div
                className={cn(
                  'flex items-center rounded-2xl border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30',
                  phoneErrors.phone || phoneErrors.countryCode ? 'border-destructive' : 'border-border'
                )}
              >
                <input
                  aria-label="Country code"
                  data-testid="countryCode"
                  className="w-16 bg-transparent py-3.5 text-center font-bold outline-none"
                  {...phoneForm.register('countryCode')}
                />
                <span className="h-6 w-px bg-border" aria-hidden="true" />
                <input
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  placeholder="98765 43210"
                  aria-label="Phone number"
                  data-testid="phoneInput"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-lg outline-none placeholder:text-muted-foreground"
                  {...phoneForm.register('phone')}
                />
              </div>
              {(phoneErrors.phone || phoneErrors.countryCode) && (
                <p className="text-xs text-destructive" data-testid="phoneError">
                  {phoneErrors.phone?.message ?? phoneErrors.countryCode?.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-3 text-[0.95rem] leading-relaxed" data-testid="consentNotice">
                <input
                  type="checkbox"
                  data-testid="consentCheckbox"
                  className="mt-1 size-5 shrink-0 accent-primary"
                  {...phoneForm.register('consent')}
                />
                <span>
                  I agree to chat here and to <strong>{orgName}</strong> collecting my messages &amp; responses on this
                  channel to run the programme. <strong>Required</strong>
                </span>
              </label>
              {phoneErrors.consent && (
                <p className="text-xs text-destructive" data-testid="consentError">
                  Please agree before continuing.
                </p>
              )}
              <Disclosure label="What's collected, why & for how long" testId="dataUseToggle">
                <DataUseNote orgName={orgName} email={branding.about.email} />
              </Disclosure>
            </div>

            <Button
              type="submit"
              size="lg"
              className="h-13 rounded-2xl text-base font-bold"
              data-testid="phoneSubmit"
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send code'}
            </Button>

            {error && (
              <p className="text-center text-sm text-destructive" data-testid="phoneRequestError">
                {error}
              </p>
            )}
          </form>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={otpForm.handleSubmit(onOtpSubmit)} noValidate>
            <div>
              <h2 className="text-lg font-bold">Enter the 6-digit code</h2>
              {/* WhatsApp, not SMS: the backend sends the code as an HSM because SMS is not wired
                  up (#5659). Saying SMS would send people to the wrong app. */}
              <p className="mt-1 text-sm text-muted-foreground" data-testid="otpSentTo">
                Sent on WhatsApp to {phone}
              </p>
            </div>

            <Controller
              name="otp"
              control={otpForm.control}
              render={({ field }) => (
                <OtpInput
                  value={field.value}
                  onChange={field.onChange}
                  onComplete={() => !loading && otpForm.handleSubmit(onOtpSubmit)()}
                  disabled={loading}
                  invalid={!!otpForm.formState.errors.otp}
                />
              )}
            />

            {otpForm.formState.errors.otp && (
              <p className="text-xs text-destructive">{otpForm.formState.errors.otp.message}</p>
            )}

            {/* request-otp answers identically for a number it has never seen, so nothing tells
                the user they mistyped. These two are their only recourse. */}
            <p className="text-center text-sm text-muted-foreground">
              Didn't get it?{' '}
              <button
                type="button"
                data-testid="otpResend"
                disabled={resending || resendIn > 0}
                onClick={onResend}
                className="font-semibold text-primary disabled:text-muted-foreground"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : resending ? 'Sending…' : 'Resend code'}
              </button>
              {' · '}
              <button type="button" data-testid="otpBack" onClick={onChangeNumber} className="font-semibold text-primary">
                Use a different number
              </button>
            </p>

            <Button
              type="submit"
              size="lg"
              className="h-13 rounded-2xl text-base font-bold"
              data-testid="otpSubmit"
              disabled={loading}
            >
              {loading ? 'Verifying…' : 'Verify & continue'}
            </Button>

            {notice && (
              <p className="text-center text-sm text-muted-foreground" data-testid="otpNotice">
                {notice}
              </p>
            )}
            {error && (
              <p className="text-center text-sm text-destructive" data-testid="otpError">
                {error}
              </p>
            )}
          </form>
        )}

        {hasOrgProfile(branding.about) && (
          <Disclosure label={`About ${orgName}`} testId="aboutToggle">
            <OrgProfile />
          </Disclosure>
        )}

        <div className="flex-1" />

        <p className="text-center text-xs text-muted-foreground">Powered by Glific</p>
      </main>
    </div>
  );
};

export default Login;
