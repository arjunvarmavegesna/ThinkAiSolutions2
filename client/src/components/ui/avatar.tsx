import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-emphasis',
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/**
 * Deterministic tinted-fallback avatar for a person (contact / conversation).
 * Same name → same colour, so a contact reads consistently across Inbox + Contacts.
 * Uses inline HSL so we don't depend on a fixed palette of Tailwind classes.
 */
const AVATAR_HUES = [210, 255, 24, 145, 340, 190, 280, 45] as const;

/** Two-letter initials from a name, else the first character of the phone. */
function initialsOf(name: string | null | undefined, fallback: string): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || source[0].toUpperCase();
  }
  return (fallback.replace(/^\+/, '')[0] ?? '?').toUpperCase();
}

function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function ContactAvatar({
  name,
  phone,
  className,
}: {
  name?: string | null;
  phone: string;
  className?: string;
}): JSX.Element {
  const hue = hueFor(name?.trim() || phone);
  return (
    <Avatar className={className}>
      <AvatarFallback
        className="font-semibold"
        style={{ backgroundColor: `hsl(${hue} 70% 94%)`, color: `hsl(${hue} 55% 34%)` }}
      >
        {initialsOf(name, phone)}
      </AvatarFallback>
    </Avatar>
  );
}
