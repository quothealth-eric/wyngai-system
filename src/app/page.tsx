'use client'

import Link from "next/link"
// Fallback components for build compatibility
const Button = ({ children, onClick, disabled, className, variant, ...props }: any) =>
  <button onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded ${variant === 'outline' ? 'border border-gray-300' : 'bg-blue-600 text-white'} ${className}`} {...props}>{children}</button>
const Card = ({ children, className, ...props }: any) =>
  <div className={`border rounded-lg ${className}`} {...props}>{children}</div>
const CardContent = ({ children, className, ...props }: any) =>
  <div className={`p-4 ${className}`} {...props}>{children}</div>
const Accordion = ({ children, className, ...props }: any) =>
  <div className={className} {...props}>{children}</div>
const AccordionItem = ({ children, className, ...props }: any) =>
  <div className={`border-b ${className}`} {...props}>{children}</div>
const AccordionTrigger = ({ children, className, ...props }: any) =>
  <button className={`w-full text-left p-4 hover:bg-gray-50 ${className}`} {...props}>{children}</button>
const AccordionContent = ({ children, className, ...props }: any) =>
  <div className={`p-4 pt-0 ${className}`} {...props}>{children}</div>
const Logo = ({ className, ...props }: any) => <div className={`font-bold text-xl ${className}`} {...props}>Wyng</div>
import { FileText, MessageCircle, Shield, Heart, Upload, DollarSign } from "lucide-react"
import { trackEvent } from "@/lib/analytics"

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Logo size="md" />
            <span className="text-2xl font-bold text-primary">Wyng</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/chat" className="text-gray-600 hover:text-primary" onClick={trackEvent.headerGetHelpClick}>Get Help</Link>
            <Link href="/legal/terms" className="text-gray-600 hover:text-primary" onClick={trackEvent.headerTermsClick}>Terms</Link>
            <Link href="/legal/privacy" className="text-gray-600 hover:text-primary" onClick={trackEvent.headerPrivacyClick}>Privacy</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-wyng-light-gradient py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center mb-6">
            <Heart className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Your Healthcare Guardian Angel
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Confused by medical bills and insurance? Get clear, plain-English guidance
            rooted in healthcare laws and best practices. Choose how you'd like to get help:
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
            {/* Bill Analyzer Option */}
            <div className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:border-blue-300 transition-colors">
              <div className="text-center mb-4">
                <FileText className="mx-auto h-12 w-12 text-blue-600 mb-3" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Analyze Your Bills</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Upload your medical bills or EOBs to detect errors, billing violations,
                  and get phone scripts plus appeal letters for any issues found.
                </p>
              </div>
              <Link href="/analyzer" className="block">
                <Button size="lg" className="w-full text-lg py-3 btn-wyng-gradient hover:opacity-90 transition-opacity" onClick={trackEvent.heroGetHelpClick}>
                  Analyze My Bill
                </Button>
              </Link>
            </div>

            {/* Chat Option */}
            <div className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:border-green-300 transition-colors">
              <div className="text-center mb-4">
                <MessageCircle className="mx-auto h-12 w-12 text-green-600 mb-3" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Ask Questions</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Chat with our AI assistant about general insurance questions,
                  healthcare coverage, or get guidance on navigating your benefits.
                </p>
              </div>
              <Link href="/chat" className="block">
                <Button size="lg" className="w-full text-lg py-3 bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={trackEvent.heroGetHelpClick}>
                  Start Chatting
                </Button>
              </Link>
            </div>
          </div>

          <div className="text-center mb-8">
            <p className="text-sm text-gray-500 mb-2">
              ✨ This is <strong>Wyng Lite</strong> - a free preview of our comprehensive platform
            </p>
            <p className="text-sm text-gray-500">
              Want the full experience?
              <a href="https://www.mywyng.co" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 font-medium ml-1">
                Visit Wyng →
              </a>
            </p>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Privacy Protected</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Law-Based Guidance</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span>100% Free</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            How Wyng Lite Works
          </h2>
          <p className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Get personalized guidance on your medical bills in three simple steps
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center border-none shadow-lg">
              <CardContent className="pt-8">
                <div className="flex justify-center mb-4">
                  <Upload className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">1. Upload & Ask</h3>
                <p className="text-gray-600">
                  Upload your medical bills or EOBs (JPEG, PNG, PDF), or simply describe your situation.
                  Optionally add your insurance benefits for better estimates.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-none shadow-lg">
              <CardContent className="pt-8">
                <div className="flex justify-center mb-4">
                  <MessageCircle className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">2. Get Analysis</h3>
                <p className="text-gray-600">
                  Our AI analyzes your situation using healthcare laws and insurance policies,
                  identifying errors and explaining what you should actually owe.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-none shadow-lg">
              <CardContent className="pt-8">
                <div className="flex justify-center mb-4">
                  <FileText className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">3. Take Action</h3>
                <p className="text-gray-600">
                  Get step-by-step instructions, phone scripts, and appeal letters.
                  Know exactly what to do next and what to say.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Get answers to common questions about medical bills and insurance
          </p>

          <div className="max-w-4xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="eob-vs-bill">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('What\'s the difference between an EOB and a medical bill?')}>What's the difference between an EOB and a medical bill?</AccordionTrigger>
                <AccordionContent>
                  An EOB (Explanation of Benefits) is a document from your insurance company showing how they processed a claim.
                  It's not a bill - it explains what the provider charged, what insurance paid, and what you might owe.
                  A medical bill comes from your healthcare provider and is an actual request for payment.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="read-bill">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('How do I read my medical bill?')}>How do I read my medical bill?</AccordionTrigger>
                <AccordionContent>
                  Look for: (1) Service dates and descriptions, (2) Provider charges, (3) Insurance payments,
                  (4) Your patient responsibility, and (5) Payment due date. Compare this with your EOB to ensure accuracy.
                  If numbers don't match, there may be an error.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="common-errors">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('What are common billing errors to watch for?')}>What are common billing errors to watch for?</AccordionTrigger>
                <AccordionContent>
                  Common errors include: duplicate charges, charges for services not received, wrong insurance information,
                  incorrect dates, balance billing violations, charges for preventive care that should be free,
                  and incorrect deductible calculations. Always compare your bill with your EOB.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="deductible-coinsurance-copay">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('What\'s the difference between deductible, coinsurance, and copay?')}>What's the difference between deductible, coinsurance, and copay?</AccordionTrigger>
                <AccordionContent>
                  A deductible is the amount you pay before insurance kicks in. Coinsurance is your percentage of costs
                  after the deductible is met (like 20%). A copay is a flat fee for specific services (like $30 for office visits).
                  Some plans use copays, others use deductible + coinsurance.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="balance-billing">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('Is balance billing legal?')}>Is balance billing legal?</AccordionTrigger>
                <AccordionContent>
                  It depends. The No Surprises Act protects you from most surprise bills for emergency care and certain
                  out-of-network situations at in-network facilities. However, balance billing may be allowed in some situations.
                  Each case is different, so it's important to understand your specific situation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="appeals">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('How do I appeal a denied insurance claim?')}>How do I appeal a denied insurance claim?</AccordionTrigger>
                <AccordionContent>
                  Most insurance plans have a two-level appeal process. File your first appeal within 180 days of the denial,
                  including medical records and a letter explaining why you believe the service should be covered.
                  If denied again, you can file a second-level appeal and potentially an external review.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="afford-bills">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('What if I can\'t afford my medical bills?')}>What if I can't afford my medical bills?</AccordionTrigger>
                <AccordionContent>
                  Options include: (1) Requesting itemized bills to check for errors, (2) Asking about payment plans,
                  (3) Applying for financial assistance or charity care, (4) Negotiating a lower amount,
                  and (5) Seeking help from a patient advocate or nonprofit credit counseling service.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="credit-impact">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('Will unpaid medical bills hurt my credit?')}>Will unpaid medical bills hurt my credit?</AccordionTrigger>
                <AccordionContent>
                  Medical debt under $500 no longer appears on credit reports. For larger amounts, there's typically a
                  365-day waiting period before medical debt can be reported. However, if bills go to collections,
                  they can still impact your credit score, so it's best to address them promptly.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="itemized-bill">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('Should I request an itemized bill?')}>Should I request an itemized bill?</AccordionTrigger>
                <AccordionContent>
                  Yes, especially if your bill seems high or unclear. An itemized bill shows exactly what services were
                  provided, when, and at what cost. This makes it easier to spot errors, compare with your EOB,
                  and understand what you're paying for.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="multiple-bills">
                <AccordionTrigger onClick={() => trackEvent.faqAccordionOpened('Why am I getting multiple bills for one visit?')}>Why am I getting multiple bills for one visit?</AccordionTrigger>
                <AccordionContent>
                  Hospital visits often generate separate bills from different providers: the hospital (facility fee),
                  doctors (professional fees), anesthesiologists, radiologists, pathologists, etc. Each may bill separately.
                  This is normal, but you should still verify each bill is accurate.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-wyng-gradient text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Help?</h2>
          <p className="text-xl mb-8 opacity-90">
            Stop struggling with confusing medical bills. Get clear guidance now.
          </p>
          <Link href="/chat">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-4" onClick={trackEvent.ctaGetHelpClick}>
              Start Getting Help - Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Shield className="h-6 w-6" />
                <span className="text-xl font-bold">Wyng Lite</span>
              </div>
              <p className="text-gray-400 mb-4">
                Your healthcare guardian angel. Get clear guidance on medical bills and insurance claims.
              </p>
              <p className="text-sm text-gray-500">
                © 2024 Quot Health. All rights reserved.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <div className="space-y-2">
                <Link href="/legal/terms" className="block text-gray-400 hover:text-white" onClick={trackEvent.footerTermsClick}>Terms of Service</Link>
                <Link href="/legal/privacy" className="block text-gray-400 hover:text-white" onClick={trackEvent.footerPrivacyClick}>Privacy Policy</Link>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Get the Full Experience</h4>
              <div className="space-y-2">
                <a href="https://www.mywyng.co" target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:text-blue-300 font-medium">
                  Visit Wyng →
                </a>
                <Link href="/analyzer" className="block text-gray-400 hover:text-white">Bill Analyzer</Link>
                <Link href="/chat" className="block text-gray-400 hover:text-white" onClick={trackEvent.footerGetHelpClick}>AI Assistant</Link>
                <p className="text-sm text-gray-500 mt-4">
                  This is a free preview. Want unlimited access and premium features?
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center space-y-2">
            <p className="text-sm text-gray-500">
              Wyng Lite provides general information, not legal or medical advice.
              Always verify information with your insurance company and healthcare providers.
            </p>
            <p className="text-xs text-gray-600">
              ✨ This is a free preview of Wyng's capabilities.
              <a href="https://www.mywyng.co" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 ml-1">
                Get unlimited access at mywyng.co
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}