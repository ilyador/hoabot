import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType>({ confirm: () => Promise.resolve(false) });

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ options, resolve });
    });
  }, []);

  function handleClose(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  // Focus the confirm button when dialog opens
  useEffect(() => {
    if (state) confirmRef.current?.focus();
  }, [state]);

  // Escape key
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state]);

  const variant = state?.options.variant || 'danger';
  const confirmBtnStyle = variant === 'danger'
    ? { background: 'var(--error)', color: '#fff' }
    : variant === 'warning'
    ? { background: 'var(--warning)', color: '#fff' }
    : { background: 'var(--accent)', color: '#fff' };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => handleClose(false)}>
          <div
            className="card p-5 w-full max-w-[400px] mx-4"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={state.options.message ? 'confirm-message' : undefined}
          >
            <h3 id="confirm-title" style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', marginBottom: '8px' }}>
              {state.options.title}
            </h3>
            {state.options.message && (
              <p id="confirm-message" className="text-[13px] mb-5" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                {state.options.message}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => handleClose(false)}>
                {state.options.cancelText || 'Cancel'}
              </button>
              <button
                ref={confirmRef}
                className="btn"
                style={confirmBtnStyle}
                onClick={() => handleClose(true)}
              >
                {state.options.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
