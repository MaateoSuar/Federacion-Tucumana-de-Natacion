import { EyeIcon, EyeOffIcon } from './login-icons';

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

/** Botón mostrar/ocultar contraseña con área táctil de 40 px. */
export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={visible}
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-pool-200 transition-colors hover:bg-pool-700/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300"
    >
      {visible ? <EyeOffIcon className="h-[18px] w-[18px]" /> : <EyeIcon className="h-[18px] w-[18px]" />}
    </button>
  );
}
