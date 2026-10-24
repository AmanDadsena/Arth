import { MicButton } from '@/components/voice'

/**
 * The floating mic, on every screen inside the app shell. `raised` lifts it
 * above the bottom nav on the five main tabs. MicButton renders nothing in
 * browsers that can't record.
 */
export function MicSlot({ raised }: { raised: boolean }) {
  return <MicButton className={`absolute right-4 z-30 ${raised ? 'bottom-[100px]' : 'bottom-6'}`} />
}
