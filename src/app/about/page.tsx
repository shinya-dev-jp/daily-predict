import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Shinya Dev Apps",
  description: "Apps by Shinya Dev for World App. Verified humans only. Built on World ID.",
};

interface AppCardProps {
  name: string;
  category: string;
  tagline: string;
  description: string;
  worldAppUrl: string;
  webUrl: string;
}

function AppCard({ name, category, tagline, description, worldAppUrl, webUrl }: AppCardProps) {
  return (
    <article className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-5">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-xl font-bold text-white">{name}</h2>
        <span className="text-[10px] uppercase tracking-wider text-emerald-300/70 bg-emerald-300/10 px-2 py-0.5 rounded-full">
          {category}
        </span>
      </div>
      <p className="text-sm text-emerald-200/90 italic mb-3">{tagline}</p>
      <p className="text-sm text-white/70 leading-relaxed mb-5">{description}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        <a
          href={worldAppUrl}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-emerald-500 text-white font-semibold hover:bg-emerald-400 transition-colors"
        >
          Open in World App →
        </a>
        <a
          href={webUrl}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full border border-white/20 text-white/80 hover:bg-white/5 transition-colors"
        >
          Visit web preview →
        </a>
      </div>
    </article>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-white/80 text-sm leading-relaxed bg-[#1E1B4B] min-h-dvh">
      {/* Header */}
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/60 mb-2">
          Shinya Dev
        </p>
        <h1 className="text-3xl font-bold text-white mb-3">
          Mini Apps for World App
        </h1>
        <p className="text-white/60">
          A small studio building lightweight, single-purpose Mini Apps for the World App
          ecosystem. All apps are designed for verified humans, run inside World App via
          MiniKit, and integrate with World ID for sybil resistance.
        </p>
      </header>

      {/* About the publisher */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">About</h2>
        <p className="mb-3">
          Shinya Dev is the indie developer studio of Shinya, based in Nagoya, Japan.
          Each Mini App is built end-to-end by a single developer with a focus on shipping
          fast, useful tools that respect user privacy.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-white/70">
          <li>
            <strong className="text-white/90">Stack:</strong> Next.js (App Router) ·
            React 19 · TypeScript · Tailwind · Supabase
          </li>
          <li>
            <strong className="text-white/90">Identity:</strong> World ID via MiniKit SDK
          </li>
          <li>
            <strong className="text-white/90">Hosting:</strong> Vercel
          </li>
          <li>
            <strong className="text-white/90">Design principle:</strong> One job per app,
            done well.
          </li>
        </ul>
      </section>

      {/* Apps */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">Apps</h2>

        <AppCard
          name="Daily Predict"
          category="Social"
          tagline="Predict today. Compete globally."
          description="Daily Predict delivers one question every day — crypto, sports, weather, and world events. Vote Yes or No, see how your prediction stacks up against users worldwide, and climb the leaderboard. Build prediction streaks, earn points, and unlock badges. Verified humans only — every prediction counts."
          worldAppUrl="https://worldcoin.org/mini-app?app_id=app_9ea9956fcd3bcb53a6accf1e93383e22"
          webUrl="https://daily-predict-two.vercel.app"
        />

        <AppCard
          name="MealPact"
          category="Productivity"
          tagline="AI calorie tracker with WLD commitment."
          description="MealPact combines AI-powered food analysis with a commitment challenge. Snap a photo of your meal, let AI instantly calculate calories and nutrients, and join weekly challenges where you deposit 0.1 WLD. Log meals for 5+ days and earn your deposit back plus bonus from dropouts. Build healthy habits with real stakes and real rewards."
          worldAppUrl="https://worldcoin.org/mini-app?app_id=app_a9be675be0fb8e8f06da1a0f6a5194d1"
          webUrl="https://mealpact.vercel.app"
        />
      </section>

      {/* Contact / Support */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Support &amp; contact</h2>
        <p className="mb-2">
          Issue reports, feature requests, business inquiries — anything is welcome.
        </p>
        <p>
          <a
            href="mailto:shinya.yuda.b@gmail.com"
            className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
          >
            shinya.yuda.b@gmail.com
          </a>
        </p>
      </section>

      {/* Legal */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Legal</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link
              href="/privacy"
              className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
            >
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link
              href="/terms"
              className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
            >
              Terms of Service
            </Link>
          </li>
        </ul>
      </section>

      {/* Footer */}
      <footer className="pt-6 border-t border-white/10 text-xs text-white/40">
        <p>© 2026 Shinya Dev. Built for the World App ecosystem.</p>
        <p className="mt-1">
          Verified humans only. No personal data collected beyond World ID nullifier hash.
        </p>
      </footer>
    </main>
  );
}
