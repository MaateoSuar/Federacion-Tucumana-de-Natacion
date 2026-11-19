'use client';

import { useState, type FormEvent } from 'react';
import { Field } from './field';
import { FormMessage, type FormError } from './form-message';
import { LockIcon, MailIcon } from './login-icons';
import { PasswordToggle } from './password-toggle';
import { Reveal, type RevealVariant } from './reveal';
import { WaveButton } from './wave-button';

interface LoginFormProps {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: FormError | null;
  variant: RevealVariant;
  onSwitchToRegister: () => void;
}

export function LoginForm({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  submitting,
  error,
  variant,
  onSwitchToRegister,
}: LoginFormProps) {
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Reveal index={0} variant={variant}>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="tu@email.com"
          value={email}
          onChange={onEmailChange}
          icon={<MailIcon className="h-4 w-4" />}
        />
      </Reveal>

      <Reveal index={1} variant={variant}>
        <Field
          label="Contraseña"
          type={showPass ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          required
          placeholder="Tu contraseña"
          value={password}
          onChange={onPasswordChange}
          icon={<LockIcon className="h-4 w-4" />}
          trailing={<PasswordToggle visible={showPass} onToggle={() => setShowPass((v) => !v)} />}
        />
      </Reveal>

      <FormMessage error={error} />

      <Reveal index={2} variant={variant}>
        <WaveButton loading={submitting} loadingLabel="Ingresando…">
          Iniciar sesión
        </WaveButton>
      </Reveal>

      <Reveal index={3} variant={variant}>
        <p className="text-center text-sm text-pool-100">
          ¿Primera vez en la pileta?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="rounded font-semibold text-aqua-200 underline decoration-aqua-300/50 underline-offset-4 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300"
          >
            Creá tu cuenta
          </button>
        </p>
      </Reveal>
    </form>
  );
}
