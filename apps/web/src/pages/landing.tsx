import { Card, buttonVariants } from '@snapshare/ui';
import { Camera, LockKeyhole, ScanFace } from 'lucide-react';
import { Link } from 'react-router';

const FEATURES = [
  {
    icon: <ScanFace aria-hidden="true" />,
    title: 'Guests find their own photos',
    body: 'One selfie, and every guest sees just the photos they appear in — only if they choose to.',
  },
  {
    icon: <Camera aria-hidden="true" />,
    title: 'Built for photographers',
    body: 'Fast bulk uploads, branded galleries, QR sharing and client proofing in one place.',
  },
  {
    icon: <LockKeyhole aria-hidden="true" />,
    title: 'Private by design',
    body: 'Face matching runs on our own servers, never a third party. Consent first, delete any time.',
  },
];

/** PUB-01. Marketing copy only — no claims about features that are not live yet. */
export function Landing() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 text-center sm:pt-24">
        <p className="text-sm font-medium text-primary">
          Coming soon · Private beta for photographers
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Every guest gets their photos. Privately. In minutes.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          SnapShare is the photo-sharing platform for weddings and events — with consent-first AI
          that helps people find themselves, and tools that help photographers deliver faster.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/signup" className={buttonVariants({ size: 'lg' })}>
            Join the beta
          </Link>
          <Link to="/pricing" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            See pricing
          </Link>
        </div>
      </section>
      <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 id="features" className="sr-only">
          Features
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Card className="h-full p-6">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-5">
                  {f.icon}
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
