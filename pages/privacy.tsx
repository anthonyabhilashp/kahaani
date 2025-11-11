import { useRouter } from 'next/router';

export default function Privacy() {
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
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>

        <div className="space-y-8 text-gray-300">
          <section>
            <p className="text-sm text-gray-400 mb-6">Last Updated: January 11, 2025</p>
            <p className="mb-4">
              AI Video Gen ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Information We Collect</h2>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Account Information</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Email address</li>
              <li>Account credentials</li>
              <li>Profile information (if provided)</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Content Data</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Text prompts you submit</li>
              <li>Generated stories, images, and videos</li>
              <li>Project metadata and settings</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Usage Information</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Service usage patterns</li>
              <li>Feature interactions</li>
              <li>Credit usage and purchase history</li>
              <li>Technical data (IP address, browser type, device information)</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Payment Information</h3>
            <p className="mb-4">
              Payment processing is handled by Paddle, our Merchant of Record. We do not store your credit card information. Please refer to <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300">Paddle's Privacy Policy</a> for details on how they handle your payment data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">We use your information to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide and maintain our service</li>
              <li>Process your requests and generate content</li>
              <li>Manage your account and credits</li>
              <li>Send service updates and important notifications</li>
              <li>Improve our AI models and service quality</li>
              <li>Prevent fraud and ensure security</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. Data Storage and Security</h2>
            <p className="mb-4">
              We use industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Data is stored securely using Supabase (encrypted at rest and in transit)</li>
              <li>Access controls and authentication protect your account</li>
              <li>Regular security audits and updates</li>
              <li>Media files are stored in secure cloud storage with access controls</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Data Sharing and Third Parties</h2>
            <p className="mb-4">We share your data only in the following circumstances:</p>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Service Providers</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Paddle - Payment processing</li>
              <li>Supabase - Database and authentication</li>
              <li>OpenAI, ElevenLabs, OpenRouter - AI processing</li>
              <li>Cloud storage providers - Media file storage</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Legal Requirements</h3>
            <p className="mb-4">
              We may disclose your information if required by law, court order, or government request.
            </p>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">We Do Not Sell Your Data</h3>
            <p className="mb-4">
              We do not sell, rent, or trade your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Your Content and Privacy</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Your stories and generated content are private by default</li>
              <li>We may use anonymized, aggregated data to improve our AI models</li>
              <li>You can delete your content at any time</li>
              <li>Deleted content is removed from our active systems within 30 days</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Cookies and Tracking</h2>
            <p className="mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Keep you logged in</li>
              <li>Remember your preferences</li>
              <li>Analyze service usage</li>
              <li>Prevent fraud and abuse</li>
            </ul>
            <p className="mt-4">
              You can control cookies through your browser settings, but some features may not work properly if cookies are disabled.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Your Rights</h2>
            <p className="mb-4">Depending on your location, you may have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data</li>
              <li>Opt out of marketing communications</li>
              <li>Object to certain data processing</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, contact us at <span className="text-orange-400">support@aivideogen.cc</span>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Data Retention</h2>
            <p className="mb-4">
              We retain your data for as long as your account is active or as needed to provide services. When you delete your account:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Personal data is deleted within 30 days</li>
              <li>Some data may be retained for legal or security purposes</li>
              <li>Anonymized usage data may be retained for analytics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Children's Privacy</h2>
            <p className="mb-4">
              Our service is not intended for children under 13. We do not knowingly collect data from children under 13. If you believe we have collected data from a child under 13, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. International Data Transfers</h2>
            <p className="mb-4">
              Your data may be processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. Changes to This Policy</h2>
            <p className="mb-4">
              We may update this Privacy Policy from time to time. We will notify you of material changes via email or through our service. Continued use of the service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">12. Contact Us</h2>
            <p className="mb-4">
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <p className="text-orange-400 mb-2">Email: support@aivideogen.cc</p>
            <p className="text-gray-400">Website: https://aivideogen.cc</p>
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
