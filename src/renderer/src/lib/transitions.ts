import { TransitionType } from '../../../shared/types'

const CONCRETE: Exclude<TransitionType, 'random'>[] = [
  'fade',
  'dissolve',
  'swipe-left',
  'swipe-right',
  'swipe-up',
  'swipe-down',
  'zoom',
  'flip'
]

/** Resolve 'random' to a concrete transition; pass others through. */
export function resolveTransition(t: TransitionType): Exclude<TransitionType, 'random'> {
  if (t === 'random') {
    return CONCRETE[Math.floor(Math.random() * CONCRETE.length)]
  }
  return t
}

export function enterClass(t: Exclude<TransitionType, 'random'>): string {
  return `enter-${t}`
}

export function leaveClass(t: Exclude<TransitionType, 'random'>): string {
  return `leave-${t}`
}

export const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'swipe-left', label: 'Swipe Left' },
  { value: 'swipe-right', label: 'Swipe Right' },
  { value: 'swipe-up', label: 'Swipe Up' },
  { value: 'swipe-down', label: 'Swipe Down' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: 'Flip' },
  { value: 'random', label: 'Random' },
  { value: 'none', label: 'None' }
]
