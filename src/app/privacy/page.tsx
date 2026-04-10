export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-white/80 text-sm leading-relaxed bg-[#1E1B4B] min-h-dvh">
      <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>
      <p className="text-white/40 mb-8">Last updated: April 4, 2026</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">1. Overview</h2>
        <p>
          Daily Predict (&quot;the App&quot;) is a prediction game operated as a Mini App within
          World App. This Privacy Policy explains how we collect, use, and protect your information.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">2. Information We Collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>World ID Nullifier Hash:</strong> A unique, anonymous identifier derived from your World ID verification. We do not collect your name, email, phone number, or biometric data.</li>
          <li><strong>Prediction Data:</strong> Your daily prediction choices (Yes/No) and their outcomes.</li>
          <li><strong>Usage Data:</strong> Streak counts, accuracy statistics, and points for leaderboard purposes.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To operate the prediction game and track your results</li>
          <li>To display leaderboards and achievement badges</li>
          <li>To prevent duplicate voting (one prediction per person per day)</li>
          <li>To improve the App experience</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">4. Data Storage</h2>
        <p>
          Your data is stored on Supabase servers located in the Asia-Pacific region (Tokyo, Japan).
          We use Row Level Security (RLS) to protect your data at the database level.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">5. Data Sharing</h2>
        <p>
          We do not sell, trade, or share your personal data with third parties.
          Aggregate, anonymized prediction statistics may be displayed publicly
          (e.g., &quot;62% predicted Yes&quot;).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">6. Your Rights</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access:</strong> You can view your prediction history and statistics within the App.</li>
          <li><strong>Deletion:</strong> You may request deletion of your account and associated data by contacting us.</li>
          <li><strong>Portability:</strong> You may request an export of your prediction data.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">7. Children&apos;s Privacy</h2>
        <p>
          The App requires World ID verification, which is restricted to users who have
          completed identity verification. We do not knowingly collect data from children
          under 18.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be reflected
          by updating the &quot;Last updated&quot; date above.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
        <p>
          For questions about this Privacy Policy, please contact us through the World App
          Mini App support channel.
        </p>
      </section>
    </main>
  );
}
