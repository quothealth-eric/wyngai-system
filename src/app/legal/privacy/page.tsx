import Link from "next/link"
// Fallback button component
const Button = ({ children, className, ...props }: any) =>
  <button className={`px-4 py-2 rounded bg-blue-600 text-white ${className}`} {...props}>{children}</button>
import { Shield, ArrowLeft } from "lucide-react"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-primary">Wyng Lite</span>
          </Link>
          <Link href="/">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-sm border p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

          <div className="prose prose-lg max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Information You Provide</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
                <li>Email address and name (when joining our mailing list)</li>
                <li>Phone number (optional, for lead capture)</li>
                <li>Text messages and questions you submit</li>
                <li>Files you upload (medical bills, EOBs, insurance documents)</li>
                <li>Insurance benefit information you provide</li>
                <li>Investor interest flag (if selected)</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Automatically Collected Information</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>IP address and general location information</li>
                <li>Browser type and version</li>
                <li>Device information</li>
                <li>Usage patterns and timestamps</li>
                <li>Session information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Primary Uses</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
                <li>Provide healthcare billing guidance and analysis</li>
                <li>Process uploaded documents with OCR technology</li>
                <li>Generate personalized responses using AI</li>
                <li>Improve our service and develop new features</li>
                <li>Send updates and educational content (if subscribed)</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Research and Development</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use de-identified case data to improve our AI models and healthcare guidance.
                Personal identifiers are removed or redacted before analysis.
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <p className="text-blue-800">
                  <strong>Privacy Protection:</strong> We automatically redact email addresses, phone numbers,
                  and Social Security numbers from uploaded documents and user messages.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Information Sharing</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">We DO NOT sell your personal information.</h3>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Limited Sharing</h3>
              <p className="text-gray-700 leading-relaxed mb-4">We may share information in these situations:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>With service providers (hosting, email, analytics) under strict privacy agreements</li>
                <li>When required by law or legal process</li>
                <li>To protect our rights, property, or safety</li>
                <li>In connection with a business transfer or merger (with user notification)</li>
                <li>With your explicit consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Third-Party Services</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Services We Use</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li><strong>Supabase:</strong> Database and file storage (encrypted)</li>
                <li><strong>Anthropic Claude:</strong> AI analysis (no data retention by Anthropic)</li>
                <li><strong>Stripe:</strong> Payment processing for donations</li>
                <li><strong>Resend:</strong> Email delivery for updates</li>
                <li><strong>Vercel:</strong> Website hosting and performance</li>
              </ul>

              <p className="text-gray-700 leading-relaxed mt-4">
                Each service has its own privacy policy and security measures. We choose providers
                with strong privacy and security commitments.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Data Security</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">Security Measures</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Encryption in transit (HTTPS) and at rest</li>
                <li>Secure cloud infrastructure with access controls</li>
                <li>Regular security updates and monitoring</li>
                <li>Automatic redaction of sensitive information</li>
                <li>Limited access to personal data</li>
              </ul>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-4">
                <p className="text-yellow-800">
                  <strong>Important:</strong> No security system is 100% secure. While we implement
                  industry-standard protections, you use our service at your own risk regarding data security.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li><strong>Chat sessions:</strong> Stored for service improvement, indefinitely (de-identified)</li>
                <li><strong>Uploaded files:</strong> Stored for 30 days, then automatically deleted</li>
                <li><strong>Email addresses:</strong> Until you unsubscribe</li>
                <li><strong>Usage logs:</strong> 12 months for security and analytics</li>
                <li><strong>Donation records:</strong> 7 years for tax and legal compliance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Your Rights and Choices</h2>

              <h3 className="text-lg font-medium text-gray-800 mb-3">You have the right to:</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Access your personal information</li>
                <li>Correct inaccurate information</li>
                <li>Request deletion of your information</li>
                <li>Unsubscribe from emails at any time</li>
                <li>Object to certain processing activities</li>
                <li>Request data portability</li>
              </ul>

              <p className="text-gray-700 leading-relaxed mt-4">
                To exercise these rights, contact us at privacy@quothealth.com.
                We'll respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Cookies and Tracking</h2>
              <p className="text-gray-700 leading-relaxed">
                We use minimal cookies for:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 mt-2">
                <li>Session management</li>
                <li>Security features</li>
                <li>Basic analytics (anonymized)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                We do not use advertising cookies or track you across websites.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Wyng Lite is not intended for children under 18. We do not knowingly collect
                personal information from children. If we learn we have collected such information,
                we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. International Users</h2>
              <p className="text-gray-700 leading-relaxed">
                Our service is hosted in the United States. If you use our service from outside the US,
                your information may be transferred to and stored in the US, which may have different
                privacy laws than your country.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Changes to Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy periodically. We'll notify you of material changes
                by email (if subscribed) or by posting a notice on our website. Continued use after
                changes means you accept the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                Questions about this Privacy Policy? Contact us at:
              </p>
              <div className="mt-4 bg-gray-50 p-4 rounded">
                <p className="text-gray-700">
                  <strong>Email:</strong> privacy@quothealth.com<br/>
                  <strong>Subject:</strong> Wyng Lite Privacy Question
                </p>
              </div>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>

          <div className="mt-8 flex space-x-4">
            <Link href="/chat">
              <Button>Get Help Now</Button>
            </Link>
            <Link href="/legal/terms">
              <Button variant="outline">Terms of Service</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}