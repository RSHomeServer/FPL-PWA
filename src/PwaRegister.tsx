import { PwaUpdateToast } from '@songara/pwa-base'

/** Registers SW update UX via pwa-base helpers (disabled under Vite HMR). */
export function PwaRegister() {
  return <PwaUpdateToast appLabel="FPL Decision Support" />
}
