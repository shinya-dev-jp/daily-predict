// Static server component. Intentionally plain prose. No gamification
// vocabulary (no points, streaks, leaderboards, rewards) because TuringVote
// is a 2-choice poll app with no such systems — asserting otherwise would
// contradict the DB schema and fail Worldcoin review.
export default function TermsOfService() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-white/80 text-sm leading-relaxed bg-[#0A0A0A] min-h-dvh">
      <h1 className="text-2xl font-bold text-white mb-6">Terms of Service</h1>
      <p className="text-white/40 mb-8">Last updated: April 19, 2026</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
        <p>
          By using TuringVote (&quot;the App&quot;), you agree to these Terms. If you do
          not agree, do not use the App.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
        <p>
          TuringVote is a 2-choice opinion poll for World ID–verified humans.
          Each session presents five neutral A-or-B questions and shows you the
          aggregate breakdown of how other verified humans answered. There are
          no scores, no rankings, no rewards, and no monetary value attached to
          participation.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">3. Eligibility</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>You must complete World ID verification or sign in with your
              World wallet to vote.</li>
          <li>One verified human may cast only one vote per question.</li>
          <li>You must be at least 18 years old, per World App policy.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">4. User Conduct</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Votes are final and cannot be edited or withdrawn after
              submission.</li>
          <li>Attempts to cast more than one vote per question (e.g. by using
              multiple wallets, bypassing verification, or abusing APIs) will
              result in the associated vote identity being blocked.</li>
          <li>Automated or programmatic access to vote endpoints is prohibited.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">5. No Rewards, No Gambling</h2>
        <p>
          TuringVote does not distribute tokens, currency, points, badges, or
          prizes for participation. Nothing in the App constitutes gambling,
          investment advice, financial instrument, or anything of monetary
          value. Participation is purely for curiosity and self-reflection.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">6. Question Content</h2>
        <p>
          Questions are curated by the developer to be neutral and non-political
          wherever possible. They are not factual claims and have no &quot;right&quot;
          answer — only an aggregate of how verified humans happened to answer.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">7. Disclaimer</h2>
        <p>
          The App is provided &quot;as is&quot; without warranty of any kind. We do not
          guarantee uptime, vote tally correctness, or fitness for any purpose.
          To the extent permitted by law, we disclaim liability for any
          indirect, incidental, or consequential damages arising from use of
          the App.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">8. Modifications</h2>
        <p>
          We may update these Terms at any time. Material changes will be
          surfaced in-app before they take effect. Continued use of the App
          after an update constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">9. Governing Law</h2>
        <p>
          These Terms are governed by the laws of Japan. Any dispute arising
          from the App will be resolved in the courts of Nagoya, Japan.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">10. Contact</h2>
        <p>
          For questions about these Terms, contact the developer through the
          World App Mini App support channel.
        </p>
      </section>
    </main>
  );
}
