/**
 * Placeholder slot for the floating MicButton (owned by the voice agent in
 * components/voice). The lead mounts it here once it exists:
 *
 *   import { MicButton } from '@/components/voice'
 *   return <div className={...}><MicButton /></div>
 *
 * `raised` lifts it above the bottom nav on the five main tabs.
 */
export function MicSlot({ raised }: { raised: boolean }) {
  return <div data-slot="mic" data-raised={raised} className="hidden" />
}
