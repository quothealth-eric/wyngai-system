import Link from "next/link"
// Fallback button component
const Button = ({ children, className, ...props }: any) =>
  <button className={`px-4 py-2 rounded bg-blue-600 text-white ${className}`} {...props}>{children}</button>
import { Shield, ArrowLeft } from "lucide-react"

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>

          <div className="prose prose-lg max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing and using Wyng Lite ("Service"), you agree to be bound by these Terms of Service ("Terms").
                If you disagree with any part of these terms, then you may not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Wyng Lite is a free tool that provides general information and guidance about medical bills and health
                insurance claims. Our service includes:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Analysis of uploaded medical bills and EOBs</li>
                <li>General guidance based on healthcare laws and policies</li>
                <li>Educational content about healthcare billing</li>
                <li>Optional lead capture for updates and notifications</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Important Disclaimers</h2>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <p className="text-yellow-800 font-medium">
                  WYNG LITE PROVIDES GENERAL INFORMATION ONLY. IT IS NOT:
                </p>
                <ul className="list-disc list-inside text-yellow-800 mt-2 space-y-1">
                  <li>Legal advice or legal services</li>
                  <li>Medical advice or medical services</li>
                  <li>Insurance coverage or claims adjudication</li>
                  <li>A guarantee of any payment outcomes</li>
                  <li>A substitute for professional advice</li>
                </ul>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Always consult with qualified professionals and verify information with your insurance company
                and healthcare providers before taking action.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. User Responsibilities</h2>
              <p className="text-gray-700 leading-relaxed mb-4">You agree to:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Use the Service only for lawful purposes</li>
                <li>Provide accurate information when using the Service</li>
                <li>Not upload files containing malicious software or inappropriate content</li>
                <li>Respect file size and type limitations</li>
                <li>Not attempt to reverse engineer or exploit the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Privacy and Data</h2>
              <p className="text-gray-700 leading-relaxed">
                Our collection and use of your information is governed by our Privacy Policy.
                By using the Service, you consent to the collection and use of information as described in the Privacy Policy.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                We implement security measures to protect your data, but no system is 100% secure.
                Use the Service at your own risk regarding data security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Intellectual Property</h2>
              <p className="text-gray-700 leading-relaxed">
                The Service and its original content, features, and functionality are and will remain the exclusive
                property of Quot Health and its licensors. The Service is protected by copyright, trademark, and other laws.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Limitation of Liability</h2>
              <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                <p className="text-red-800 font-medium">
                  IN NO EVENT SHALL QUOT HEALTH BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                  OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, OR OTHER
                  INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE.
                </p>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Our total liability to you for any cause whatsoever shall not exceed $100.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Donations</h2>
              <p className="text-gray-700 leading-relaxed">
                Donations to support Wyng Lite development are voluntary and non-refundable.
                Donations do not create any obligation on our part to provide additional services
                or guarantee specific outcomes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Termination</h2>
              <p className="text-gray-700 leading-relaxed">
                We may terminate or suspend your access to the Service immediately, without prior notice,
                for any reason, including breach of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of any material
                changes by updating the "last updated" date. Continued use of the Service after changes
                constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Governing Law</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be interpreted and governed by the laws of the State of [Your State],
                without regard to conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about these Terms, please contact us at legal@quothealth.com.
              </p>
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
            <Link href="/legal/privacy">
              <Button variant="outline">Privacy Policy</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}