import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ORGANIZATION_NAME } from '@/config';
import { requestOtp, verifyOtp, setWebChannelSession } from '@/services/webChannelAuth';

const phoneSchema = z.object({
  phone: z.string().trim().min(1, 'Please enter your phone number.'),
});
const otpSchema = z.object({
  otp: z.string().trim().min(1, 'Please enter the OTP.'),
});

type PhoneValues = z.infer<typeof phoneSchema>;
type OtpValues = z.infer<typeof otpSchema>;

export const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [orgName, setOrgName] = useState('Glific');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const phoneForm = useForm<PhoneValues>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '' } });
  const otpForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  // fetch the NGO name for branding; keep the default "Glific" on failure
  useEffect(() => {
    axios
      .post(ORGANIZATION_NAME)
      .then(({ data }) => {
        if (data?.data?.name) setOrgName(data.data.name);
      })
      .catch(() => {});
  }, []);

  const onPhoneSubmit = (values: PhoneValues) => {
    setError('');
    setLoading(true);
    requestOtp(values.phone)
      .then(() => {
        setPhone(values.phone);
        setStep('otp');
      })
      .catch(() => setError('Unable to send OTP. Please try again.'))
      .finally(() => setLoading(false));
  };

  const onOtpSubmit = (values: OtpValues) => {
    setError('');
    setLoading(true);
    verifyOtp(phone, values.otp)
      .then(({ data }) => {
        const { token, contact_id: contactId, name } = data?.data ?? {};
        setWebChannelSession({ token, contactId, name });
        navigate('/chat');
      })
      .catch(() => setError('Invalid OTP'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-muted/30 p-4" data-testid="webChannelLogin">
      <Card className="w-full max-w-sm gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-semibold">{orgName}</div>
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
              <p className="text-xs text-muted-foreground">We'll send you a one-time code.</p>
              {phoneForm.formState.errors.phone && (
                <p className="text-xs text-destructive">{phoneForm.formState.errors.phone.message}</p>
              )}
            </div>
            <Button type="submit" data-testid="phoneSubmit" disabled={loading}>
              {loading ? 'Sending…' : 'Send OTP'}
            </Button>
            {error && <p className="text-center text-xs text-destructive">{error}</p>}
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={otpForm.handleSubmit(onOtpSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp">Enter the OTP</Label>
              <Input
                id="otp"
                inputMode="numeric"
                placeholder="OTP"
                autoFocus
                {...otpForm.register('otp')}
              />
              <p className="text-xs text-muted-foreground">Prototype: use 9999</p>
              {otpForm.formState.errors.otp && (
                <p className="text-xs text-destructive">{otpForm.formState.errors.otp.message}</p>
              )}
            </div>
            <Button type="submit" data-testid="otpSubmit" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </Button>
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
