import { Card } from '../components/ui/legacy-card';

/** Styled placeholder for modules that match Twincles' nav but aren't built yet. */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-baseline gap-2 text-sm text-gray-500">
        <span className="text-lg font-semibold text-gray-800">{title}</span>
        <span>›</span>
        <span>Coming soon</span>
      </div>
      <Card title={title}>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
            🚧
          </span>
          <p className="text-base font-medium text-gray-700">{title} is coming soon</p>
          <p className="max-w-md text-sm text-gray-500">{blurb}</p>
        </div>
      </Card>
    </div>
  );
}
