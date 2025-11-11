import { useRouter } from 'next/router';

export default function Refund() {
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
        <h1 className="text-4xl font-bold text-white mb-8">Refund Policy</h1>

        <div className="space-y-8 text-gray-300">
          <section>
            <p className="text-sm text-gray-400 mb-6">Last Updated: January 11, 2025</p>
            <p className="mb-4">
              At AI Video Gen, we want you to be satisfied with your purchase. This Refund Policy outlines the circumstances under which refunds may be issued.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Credit Purchases</h2>
            <p className="mb-4">
              Credits purchased on AI Video Gen are generally non-refundable. However, we understand that exceptional circumstances may arise.
            </p>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Eligible for Refund</h3>
            <p className="mb-4">You may be eligible for a refund if:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You were charged incorrectly or multiple times for the same purchase</li>
              <li>You experienced a technical error that prevented you from receiving your credits</li>
              <li>The service was unavailable for an extended period after purchase</li>
              <li>You request a refund within 48 hours of purchase AND have not used any of the credits</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mb-3 mt-4">Not Eligible for Refund</h3>
            <p className="mb-4">Refunds will not be issued if:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You have already used any portion of the purchased credits</li>
              <li>More than 48 hours have passed since purchase</li>
              <li>You are dissatisfied with the quality of generated content (due to the subjective nature of AI-generated content)</li>
              <li>You changed your mind after using the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Service Issues</h2>
            <p className="mb-4">
              If you experience technical issues that prevent you from using purchased credits:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Contact our support team immediately at <span className="text-orange-400">support@aivideogen.cc</span></li>
              <li>Provide details about the issue (error messages, screenshots if available)</li>
              <li>We will work to resolve the issue or provide credit compensation</li>
              <li>In cases where the issue cannot be resolved, a refund may be issued</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. Refund Request Process</h2>
            <p className="mb-4">To request a refund:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>Email <span className="text-orange-400">support@aivideogen.cc</span> within 48 hours of purchase</li>
              <li>Include your account email, transaction ID, and reason for refund</li>
              <li>Our team will review your request within 3-5 business days</li>
              <li>If approved, refunds are processed through Paddle and typically appear within 5-10 business days</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Partial Refunds</h2>
            <p className="mb-4">
              In certain cases, we may offer partial refunds:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>If you used a small portion of credits before experiencing a service issue</li>
              <li>If there was a significant service disruption affecting your ability to use credits</li>
              <li>Partial refunds are calculated based on the percentage of unused credits</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Chargebacks</h2>
            <p className="mb-4">
              We encourage you to contact us before initiating a chargeback with your bank or credit card company. Chargebacks may result in:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Immediate suspension of your account</li>
              <li>Removal of all credits and content</li>
              <li>Permanent ban from the service</li>
            </ul>
            <p className="mt-4">
              We are committed to resolving billing disputes fairly and promptly through direct communication.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. Free Trial and Promotional Credits</h2>
            <p className="mb-4">
              Free credits provided through trials, promotions, or bonuses:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Are not eligible for cash refunds</li>
              <li>May expire after a certain period (if specified)</li>
              <li>Cannot be transferred or exchanged for cash value</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Account Termination</h2>
            <p className="mb-4">
              If your account is terminated for violating our Terms of Service:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>No refund will be issued for unused credits</li>
              <li>All content and data will be deleted</li>
              <li>You will not be able to create a new account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Refund Processing</h2>
            <p className="mb-4">
              Approved refunds are processed as follows:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Refunds are issued to the original payment method</li>
              <li>Processing time: 5-10 business days after approval</li>
              <li>You will receive email confirmation when the refund is processed</li>
              <li>Refunded credits will be removed from your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Exceptions and Special Cases</h2>
            <p className="mb-4">
              We reserve the right to make exceptions to this policy on a case-by-case basis at our sole discretion, particularly in cases of:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Extended service outages</li>
              <li>Major bugs affecting core functionality</li>
              <li>Billing errors on our part</li>
              <li>Other extraordinary circumstances</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Contact Us</h2>
            <p className="mb-4">
              For refund requests or questions about this policy, please contact:
            </p>
            <p className="text-orange-400 mb-2">Email: support@aivideogen.cc</p>
            <p className="text-gray-400">
              Please include "Refund Request" in the subject line for faster processing.
            </p>
          </section>

          <section className="bg-gray-900 border border-gray-800 rounded-lg p-6 mt-8">
            <h3 className="text-lg font-semibold text-white mb-2">Our Commitment</h3>
            <p className="text-gray-300">
              We strive to provide excellent service and fair treatment to all users. If you're experiencing issues with our service or have concerns about a purchase, please reach out to us. We're here to help and will work with you to find a reasonable solution.
            </p>
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
