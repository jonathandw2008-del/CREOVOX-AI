import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import HeroSection from '@/components/marketing/HeroSection'
import FeaturesSection from '@/components/marketing/FeaturesSection'
import HowItWorksSection from '@/components/marketing/HowItWorksSection'
import CreatorsSection from '@/components/marketing/CreatorsSection'
import CTASection from '@/components/marketing/CTASection'
import { PlatformMarquee, StatementSection, StatsSection, FAQSection } from '@/components/marketing/StorySections'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-brand-bg">
      <Navbar />
      <main>
        <HeroSection />
        <PlatformMarquee />
        <StatementSection />
        <FeaturesSection />
        <HowItWorksSection />
        <StatsSection />
        <CreatorsSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
