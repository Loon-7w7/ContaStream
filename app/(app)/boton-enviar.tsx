"use client";

import { useFormStatus } from "react-dom";

/** Botón de formulario que se bloquea mientras la acción corre y puede pedir confirmación. */
export function BotonEnviar({
  confirmar,
  children,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { confirmar?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
        else onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
