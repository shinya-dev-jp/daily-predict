// Static server component — no client interactivity required. Intentionally
// lean: no gamification copy (no streaks, no points, no leaderboards, no
// rewards), because TuringVote stores none of that. The Worldcoin review
// team will compare this page to the actual DB schema and runtime surface;
// every sentence below has to match what the code does.
export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-white/80 text-sm leading-relaxed bg-[#0A0A0A] min-h-dvh">
      <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>
      <p className="text-white/40 mb-8">Last updated: April 19, 2026</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">1. Overview</h2>
        <p>
          TuringVote (&quot;the App&quot;) is a 2-choice opinion poll for World ID–verified
          humans, delivered as a Mini App inside World App. This Privacy Policy
          describes what we collect, why, and how long we keep it. It has no
          scoring, no leaderboards, no rewards, and no tracking beyond what is
          listed here.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Vote identity:</strong> either a World ID nullifier hash
            (Orb verification path) or a server-side HMAC of your World wallet
            address (wallet sign-in path). Both are action-scoped: they uniquely
            identify you <em>only within TuringVote</em> and cannot be linked to
            your identity in other apps.
          </li>
          <li>
            <strong>Your votes:</strong> for each of the two-option questions you
            answer, we store {"{"} question_id, A-or-B, verification tier, timestamp {"}"}.
            Nothing else.
          </li>
          <li>
            <strong>Wallet address (sign-in only):</strong> your lowercase 0x
            wallet address is upserted into a minimal user row with a short
            display handle such as <code>#a1b2c3</code>. We do not store your
            wallet private key, balance, or transaction history.
          </li>
        </ul>
        <p className="mt-2">
          We do <strong>not</strong> collect: name, email, phone number, IP
          address beyond rate-limit bucketing, device fingerprint, contacts,
          biometric data, or any prediction / streak / points history.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To enforce &quot;one verified human, one vote per question&quot; via a
              UNIQUE(nullifier, question_id) constraint.</li>
          <li>To show aggregate, non-identifying tallies (e.g. &quot;58% chose A&quot;)
              in the reveal screen after you vote.</li>
          <li>To maintain a rolling per-IP rate limit on API calls as abuse
              prevention.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">4. Data Storage</h2>
        <p>
          Data is stored on Supabase Postgres (Asia-Pacific / Tokyo region) with
          Row Level Security enabled. Writes go through a server-side service
          role; the public key used by the browser has no direct write access to
          tc_votes. HTTPS is enforced end-to-end by Vercel.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">5. Data Sharing</h2>
        <p>
          We do not sell, trade, license, or share your data with third parties.
          Aggregate counts (total_votes, votes_a, votes_b per question) are
          publicly readable — but these are non-identifying integers, not
          per-user rows.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">6. Your Rights</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access:</strong> Contact us to receive your stored
              vote records for review.</li>
          <li><strong>Deletion:</strong> Contact us to have all rows keyed to
              your vote identity permanently removed from the production
              database. Because votes are pseudonymous, you may need to sign a
              message from the wallet used to verify your identity.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">7. Children&apos;s Privacy</h2>
        <p>
          TuringVote requires a verified World ID or World wallet and is
          intended for users 18+ in compliance with World App&apos;s age policy.
          We do not knowingly collect data from minors.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">8. Changes to This Policy</h2>
        <p>
          Material changes will be announced in-app before they take effect and
          reflected in the &quot;Last updated&quot; line above.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
        <p>
          For questions or deletion requests, contact the developer through the
          World App Mini App support channel.
        </p>
      </section>
    </main>
  );
}
