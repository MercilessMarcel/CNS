export type UserToastPayload = {
  message: string;
  variant: 'error' | 'info';
};

type Listener = (p: UserToastPayload) => void;

const listeners = new Set<Listener>();

export function subscribeUserToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function showUserToast(message: string, variant: UserToastPayload['variant'] = 'error') {
  const p: UserToastPayload = { message, variant };
  listeners.forEach((fn) => {
    try {
      fn(p);
    } catch {
    }
  });
}
