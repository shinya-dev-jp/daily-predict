export default function TermsOfService() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-white/80 text-sm leading-relaxed bg-[#1E1B4B] min-h-dvh">
      <h1 className="text-2xl font-bold text-white mb-6">Terms of Service</h1>
      <p className="text-white/40 mb-8">Last updated: April 4, 2026</p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
        <p>
          By using DailyPredict (&quot;the App&quot;), you agree to these Terms of Service.
          If you do not agree, please do not use the App.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
        <p>
          DailyPredict is a prediction game where World ID-verified users make daily
          predictions about real-world events. Users earn points and compete on
          leaderboards based on prediction accuracy.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">3. Eligibility</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>You must have a verified World ID to use the App.</li>
          <li>Each verified human may only create one account.</li>
          <li>You must be at least 18 years old.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">4. User Conduct</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>You may make one prediction per question per day.</li>
          <li>Predictions are final and cannot be changed after submission.</li>
          <li>Any attempt to manipulate results, create multiple accounts, or exploit
              the system will result in account suspension.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">5. Points and Rewards</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Points are earned for correct predictions and maintained streaks.</li>
          <li>Points have no monetary value and cannot be exchanged for cash.</li>
          <li>Reward distributions (if any) are subject to the World App Developer
              Rewards program terms and may change without notice.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">6. Result Determination</h2>
        <p>
          Prediction results are determined using publicly available data sources
          (e.g., cryptocurrency prices from CoinGecko, weather data). While we strive
          for accuracy, we do not guarantee the correctness of result determinations.
          In cases where automated verification is not possible, results may be
          determined manually or by community consensus.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">7. Disclaimer</h2>
        <p>
          The App is provided &quot;as is&quot; without warranties of any kind. We are not
          responsible for any losses or damages arising from your use of the App.
          DailyPredict is a game for entertainment purposes and does not constitute
          financial advice or gambling.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">8. Rewards & Tax Responsibility</h2>
        <p>
          DailyPredict may, at its sole discretion, distribute WLD or other tokens to
          users as participation rewards (e.g. login streak bonuses). Such rewards are
          gratuitous, may change or be discontinued at any time, and are not guaranteed.
          Reward amounts and eligibility are determined by automated, publicly documented
          rules — there is no manual claim or dispute process.
        </p>
        <p className="mt-2">
          <strong>Tax responsibility:</strong> You are solely responsible for any taxes,
          reporting obligations, or legal compliance arising from rewards you receive.
          DailyPredict does not provide tax advice and does not issue tax documents.
          On-chain transaction records are publicly verifiable on the Worldchain explorer.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">9. Modifications</h2>
        <p>
          We reserve the right to modify these Terms at any time. Continued use of
          the App after changes constitutes acceptance of the modified Terms.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">10. Governing Law</h2>
        <p>
          These Terms are governed by the laws of Japan. Any disputes shall be
          resolved in the courts of Nagoya, Japan.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">11. Contact</h2>
        <p>
          For questions about these Terms, please contact us through the World App
          Mini App support channel.
        </p>
      </section>
    </main>
  );
}
