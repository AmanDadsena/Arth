import { MicButton } from '@/components/voice'

/**
 * The voice button, on every screen inside the app shell. On the five main
 * tabs it is `docked` beside the bottom nav as its own circle; elsewhere it
 * floats in the bottom-right corner.
 * It stays mounted at the same place in the tree either way, so a voice answer
 * that opens another page is not cut off. MicButton renders nothing in
 * browsers that can't record.
 */
export function MicSlot({ docked }: { docked: boolean }) {
  return <MicButton className={`absolute z-30 ${docked ? 'arth-nav-mic' : 'arth-float-mic'}`} />
}
