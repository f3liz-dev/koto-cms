export type ToastType = '' | 'success' | 'error';

export interface ToastState {
  msg: string;
  type: ToastType;
  visible: boolean;
}

export interface ToastApi {
  readonly toast: ToastState;
  showToast: (msg: string, type?: ToastType) => void;
}

export function useToast(): ToastApi {
  let toast = $state<ToastState>({ msg: '', type: '', visible: false });

  function showToast(msg: string, type: ToastType = '') {
    toast = { msg, type, visible: true };
    setTimeout(() => {
      toast = { ...toast, visible: false };
    }, 3000);
  }

  return {
    get toast() {
      return toast;
    },
    showToast,
  };
}
