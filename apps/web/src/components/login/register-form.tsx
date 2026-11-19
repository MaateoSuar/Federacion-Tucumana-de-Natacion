'use client';

import { useRef, useState, type FormEvent } from 'react';
import { formatClaimCode, isValidClaimCode } from './claim-code';
import { Field } from './field';
import { FormMessage, type FormError } from './form-message';
import { CheckIcon, InfoIcon, LockIcon, MailIcon, TicketIcon, UserIcon } from './login-icons';
import { PasswordToggle } from './password-toggle';
import { Reveal, type RevealVariant } from './reveal';
import { WaveButton } from './wave-button';

export const MIN_PASSWORD_LENGTH = 8;

export interface RegisterValues {
  firstName: string;
  lastName: string;
  claimCode: string;
}

interface RegisterFormProps {
  values: RegisterValues;
  onValuesChange: (values: RegisterValues) => void;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  /** Se llama solo si el formulario pasó la validación del lado del cliente. */
  onSubmit: () => void;
  submitting: boolean;
  error: FormError | null;
  variant: RevealVariant;
  /** El código vino precargado desde el enlace (?codigo=...). */
  codeFromLink: boolean;
  onSwitchToLogin: () => void;
}

type FieldName = 'firstName' | 'lastName' | 'email' | 'password' | 'claimCode';
type FieldErrors = Partial<Record<FieldName, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 0–4 según largo, mayúsculas+minúsculas, número y símbolo. Solo orientativo. */
function passwordStrength(password: string): number {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 14) score += 1;
  return score;
}

const STRENGTH_LABELS = ['', 'Floja', 'Aceptable', 'Buena', 'Excelente'] as const;

export function RegisterForm({
  values,
  onValuesChange,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  submitting,
  error,
  variant,
  codeFromLink,
  onSwitchToLogin,
}: RegisterFormProps) {
  const [showPass, setShowPass] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  const clearFieldError = (name: FieldName) => {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (values.firstName.trim().length === 0) errors.firstName = 'Contanos tu nombre.';
    if (values.lastName.trim().length === 0) errors.lastName = 'Falta tu apellido.';
    if (!EMAIL_REGEX.test(email.trim())) errors.email = 'Revisá el email: parece incompleto.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (values.claimCode.length === 0) {
      errors.claimCode = 'Necesitás el código de perfil que te dio tu club o la federación para crear la cuenta.';
    } else if (!isValidClaimCode(values.claimCode)) {
      errors.claimCode = 'El código tiene el formato FTN-XXXX-XXXX. Revisalo con quien te lo dio.';
    }
    setFieldErrors(errors);

    const order: FieldName[] = ['firstName', 'lastName', 'email', 'password', 'claimCode'];
    const firstInvalid = order.find((name) => errors[name]);
    if (firstInvalid) {
      const selector = firstInvalid === 'claimCode' ? 'claimCode' : firstInvalid;
      formRef.current?.querySelector<HTMLInputElement>(`[name="${selector}"]`)?.focus();
      return;
    }
    onSubmit();
  };

  const strength = passwordStrength(password);
  const meetsMin = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      <Reveal index={0} variant={variant} className="grid grid-cols-2 gap-3">
        <Field
          label="Nombre"
          name="firstName"
          autoComplete="given-name"
          placeholder="Lucía"
          value={values.firstName}
          onChange={(v) => {
            onValuesChange({ ...values, firstName: v });
            clearFieldError('firstName');
          }}
          error={fieldErrors.firstName}
          icon={<UserIcon className="h-4 w-4" />}
        />
        <Field
          label="Apellido"
          name="lastName"
          autoComplete="family-name"
          placeholder="Gómez"
          value={values.lastName}
          onChange={(v) => {
            onValuesChange({ ...values, lastName: v });
            clearFieldError('lastName');
          }}
          error={fieldErrors.lastName}
          icon={<UserIcon className="h-4 w-4" />}
        />
      </Reveal>

      <Reveal index={1} variant={variant}>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(v) => {
            onEmailChange(v);
            clearFieldError('email');
          }}
          error={fieldErrors.email}
          icon={<MailIcon className="h-4 w-4" />}
        />
      </Reveal>

      <Reveal index={2} variant={variant}>
        <Field
          label="Contraseña"
          type={showPass ? 'text' : 'password'}
          name="password"
          autoComplete="new-password"
          placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
          value={password}
          onChange={(v) => {
            onPasswordChange(v);
            clearFieldError('password');
          }}
          error={fieldErrors.password}
          icon={<LockIcon className="h-4 w-4" />}
          trailing={<PasswordToggle visible={showPass} onToggle={() => setShowPass((v) => !v)} />}
        />
        <div className="mt-2 flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  step <= strength ? 'bg-gradient-to-r from-pool-300 to-aqua-300' : 'bg-pool-600/50'
                }`}
              />
            ))}
          </div>
          <span
            className={`flex shrink-0 items-center gap-1 text-xs font-medium ${meetsMin ? 'text-aqua-200' : 'text-pool-200'}`}
          >
            {meetsMin && <CheckIcon className="h-3.5 w-3.5" />}
            {password.length === 0 ? `Mínimo ${MIN_PASSWORD_LENGTH}` : meetsMin ? STRENGTH_LABELS[strength] : 'Muy corta'}
          </span>
        </div>
      </Reveal>

      <Reveal index={3} variant={variant}>
        <div className="rounded-2xl border border-dashed border-aqua-300/30 bg-pool-950/40 p-3.5">
          <Field
            label="Código de perfil"
            tag="Obligatorio"
            name="claimCode"
            required
            aria-required="true"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="FTN-XXXX-XXXX"
            value={values.claimCode}
            onChange={(v) => {
              onValuesChange({ ...values, claimCode: formatClaimCode(v) });
              clearFieldError('claimCode');
            }}
            error={fieldErrors.claimCode}
            icon={<TicketIcon className="h-4 w-4" />}
            hint={
              <span className="flex items-start gap-1.5">
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-aqua-300" />
                <span>
                  Sin código no se puede crear la cuenta. Es personal y de un solo uso: te lo da tu club o la federación
                  y asocia tu cuenta a tu perfil de nadador (marcas, récords e historial). No lo compartas.
                </span>
              </span>
            }
          />
          {codeFromLink && values.claimCode.length > 0 && !fieldErrors.claimCode && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-aqua-200">
              <CheckIcon className="h-3.5 w-3.5" />
              Cargamos el código desde tu enlace.
            </p>
          )}
        </div>
      </Reveal>

      <FormMessage error={error} />

      <Reveal index={4} variant={variant}>
        <WaveButton loading={submitting} loadingLabel="Creando tu cuenta…">
          Crear cuenta
        </WaveButton>
      </Reveal>

      <Reveal index={5} variant={variant}>
        <p className="text-center text-sm text-pool-100">
          ¿Ya tenés cuenta?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="rounded font-semibold text-aqua-200 underline decoration-aqua-300/50 underline-offset-4 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300"
          >
            Ingresá
          </button>
        </p>
      </Reveal>
    </form>
  );
}
