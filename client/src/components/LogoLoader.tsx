/**
 * Premium branded loader — an animated SVG interpretation of the hex-node mark that performs a
 * connection/intelligence sequence (no spinners):
 *   1. scales up from 60% + fades in
 *   2. the hexagon + internal network paths draw themselves
 *   3. the connection nodes illuminate one by one
 *   4. the mark settles at 100%
 *   5. a soft blue→violet glow blooms
 *   6. the glow eases into a gentle idle breathe
 *
 * Pure CSS animation (self-contained <style>), so it's light and dependency-free. Respects
 * reduced-motion. The static raster logo stays the brand mark elsewhere; this vector is only the
 * animated loader. Mirrored by the pre-React splash in index.html for instant first paint.
 */
import { cn } from '@/lib/utils';

const STYLE = `
.lm-stage{transform-origin:center;animation:lm-stage 1.4s cubic-bezier(.22,1,.36,1) both}
.lm-path{stroke-dasharray:1;stroke-dashoffset:1;animation:lm-draw .65s ease-out .12s forwards}
.lm-line{stroke-dasharray:1;stroke-dashoffset:1;animation:lm-draw .42s ease-out forwards}
.lm-line.l1{animation-delay:.55s}
.lm-line.l2{animation-delay:.72s}
.lm-line.l3{animation-delay:.84s}
.lm-node{opacity:0;transform:scale(.3);transform-box:fill-box;transform-origin:center;animation:lm-node .42s cubic-bezier(.22,1,.36,1) forwards}
.lm-node.n0{animation-delay:.85s}
.lm-node.n1{animation-delay:1s}
.lm-node.n2{animation-delay:1.12s}
.lm-node.n3{animation-delay:1.24s}
.lm-glow{position:absolute;inset:-14px;border-radius:9999px;opacity:0;
  background:radial-gradient(circle at center,rgba(90,96,242,.55),rgba(138,80,248,.28) 45%,transparent 70%);
  filter:blur(16px);
  animation:lm-glow-in .7s ease-out 1s both,lm-glow-idle 2.6s ease-in-out 1.75s infinite}
@keyframes lm-stage{from{opacity:.3;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes lm-draw{to{stroke-dashoffset:0}}
@keyframes lm-node{0%{opacity:0;transform:scale(.3)}60%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}
@keyframes lm-glow-in{from{opacity:0;transform:scale(.7)}to{opacity:.5;transform:scale(1)}}
@keyframes lm-glow-idle{0%,100%{opacity:.45;transform:scale(1)}50%{opacity:.24;transform:scale(.92)}}
@media (prefers-reduced-motion: reduce){
  .lm-stage,.lm-path,.lm-line,.lm-node,.lm-glow{animation:none!important}
  .lm-stage{opacity:1;transform:none}
  .lm-path,.lm-line{stroke-dashoffset:0}
  .lm-node{opacity:1;transform:none}
  .lm-glow{opacity:.35}
}`;

export function LogoLoader({
  label = 'Loading…',
  fullScreen = true,
  className,
}: {
  label?: string | null;
  fullScreen?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6',
        fullScreen ? 'min-h-screen bg-background' : 'py-16',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <style>{STYLE}</style>
      <div className="relative flex size-24 items-center justify-center">
        <span className="lm-glow" aria-hidden="true" />
        <svg className="lm-stage relative" width="88" height="88" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="lm-grad" x1="14" y1="100" x2="106" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1A74E8" />
              <stop offset="0.5" stopColor="#5A60F2" />
              <stop offset="1" stopColor="#8A50F8" />
            </linearGradient>
          </defs>
          {/* Hexagon shell */}
          <path
            className="lm-path"
            pathLength={1}
            d="M106 60 L83 99.8 L37 99.8 L14 60 L37 20.2 L83 20.2 Z"
            stroke="url(#lm-grad)"
            strokeWidth={7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Internal network paths (hub at 62,63) */}
          <path className="lm-line l1" pathLength={1} d="M45 47 L62 63" stroke="url(#lm-grad)" strokeWidth={4} strokeLinecap="round" />
          <path className="lm-line l2" pathLength={1} d="M62 63 L80 55" stroke="url(#lm-grad)" strokeWidth={4} strokeLinecap="round" />
          <path className="lm-line l3" pathLength={1} d="M62 63 L56 83" stroke="url(#lm-grad)" strokeWidth={4} strokeLinecap="round" />
          {/* Connection nodes — illuminate one by one */}
          <circle className="lm-node n0" cx="62" cy="63" r="6.5" fill="url(#lm-grad)" />
          <circle className="lm-node n1" cx="45" cy="47" r="5" fill="url(#lm-grad)" />
          <circle className="lm-node n2" cx="80" cy="55" r="5" fill="url(#lm-grad)" />
          <circle className="lm-node n3" cx="56" cy="83" r="5" fill="url(#lm-grad)" />
        </svg>
      </div>
      {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
      <span className="sr-only">Loading</span>
    </div>
  );
}
