import { useRouter } from 'next/router';

export default function Terms() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-gray-300">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/')}
            className="text-orange-400 hover:text-orange-300 transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>

        <div className="space-y-8 text-gray-300">
          <section>
            <p className="text-sm text-gray-400 mb-6">Last Updated: January 11, 2025</p>
            <p className="mb-4">
              Welcome to AI Video Gen. By accessing or using our service, you agree to be bound by these Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Service Description</h2>
            <p className="mb-4">
              AI Video Gen is an AI-powered platform that generates video content from text prompts. Our service includes:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Story scene generation from text prompts</li>
              <li>AI-generated images for each scene</li>
              <li>AI-generated audio narration</li>
              <li>Video compilation and rendering</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Credits System</h2>
            <p className="mb-4">
              Our service operates on a credit-based system:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Credits are purchased in packages (250, 1000, or 3000 credits)</li>
              <li>Credits are consumed when generating images, audio, and videos</li>
              <li>Credits do not expire and remain in your account until used</li>
              <li>Credits are non-transferable and non-refundable except as stated in our Refund Policy</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. User Accounts</h2>
            <p className="mb-4">
              To use AI Video Gen, you must:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Create an account with accurate information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Be at least 13 years of age or have parental consent</li>
              <li>Not share your account with others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Acceptable Use</h2>
            <p className="mb-4">
              You agree not to use AI Video Gen to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Generate content that is illegal, harmful, or violates others' rights</li>
              <li>Create content containing violence, hate speech, or adult content</li>
              <li>Impersonate others or misrepresent your identity</li>
              <li>Attempt to reverse engineer or exploit our service</li>
              <li>Violate any applicable laws or regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Content Ownership</h2>
            <p className="mb-4">
              Content you create using AI Video Gen:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You retain ownership of your input prompts and final videos</li>
              <li>You are responsible for ensuring your content complies with applicable laws</li>
              <li>AI Video Gen retains the right to use anonymized data to improve our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Payments and Billing</h2>
            <p className="mb-4">
              All payments are processed securely through Paddle (our Merchant of Record). By purchasing credits:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You authorize us to charge the payment method you provide</li>
              <li>All prices are in USD unless otherwise stated</li>
              <li>You are responsible for any taxes or fees</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Service Availability</h2>
            <p className="mb-4">
              We strive to provide reliable service, but:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>We do not guarantee 100% uptime</li>
              <li>We may perform maintenance that temporarily affects availability</li>
              <li>We reserve the right to modify or discontinue features with notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Limitation of Liability</h2>
            <p className="mb-4">
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>AI Video Gen is provided "as is" without warranties</li>
              <li>We are not liable for indirect, incidental, or consequential damages</li>
              <li>Our total liability is limited to the amount you paid in the last 12 months</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Termination</h2>
            <p className="mb-4">
              We reserve the right to suspend or terminate your account if you violate these terms.
              You may cancel your account at any time, but unused credits are non-refundable except as stated in our Refund Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Changes to Terms</h2>
            <p className="mb-4">
              We may update these Terms of Service from time to time. We will notify users of material changes via email or through our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. Contact</h2>
            <p className="mb-4">
              For questions about these Terms of Service, please contact us at:
            </p>
            <p className="text-orange-400">support@aivideogen.cc</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <button
            onClick={() => router.push('/')}
            className="text-orange-400 hover:text-orange-300 transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}
