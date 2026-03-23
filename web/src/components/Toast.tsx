import { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; message: string; type: ToastType; }
interface ToastContextType { toast: (message: string, type?: ToastType) => void; }

const ToastContext = createContext<ToastContextType>({ toast: () => {} });
export function useToast() { return useContext(ToastContext); }

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const styles: Record<ToastType, { bg: string; color: string; dot: string }> = {
    success: { bg: 'var(--success-muted)', color: 'var(--success)', dot: 'var(--success)' },
    error:   { bg: 'var(--error-muted)', color: 'var(--error)', dot: 'var(--error)' },
    warning: { bg: 'var(--warning-muted)', color: 'var(--warning)', dot: 'var(--warning)' },
    info:    { bg: 'var(--info-muted)', color: 'var(--info)', dot: 'var(--info)' },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role="alert" className="toast-enter flex items-center gap-2 px-3 py-2.5 rounded-[8px] min-w-[260px] max-w-[360px] text-[13px] font-medium shadow-lg"
            style={{ background: styles[t.type].bg, color: styles[t.type].color, border: `1px solid ${styles[t.type].color}20` }}>
            <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: styles[t.type].dot }} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
