import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import HowItWorksSection from '@/components/marketing/HowItWorksSection'
import { FAQSection } from '@/components/marketing/StorySections'
import CTASection from '@/components/marketing/CTASection'
import { WORKFLOW } from '@/lib/workflow'

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-brand-bg">
      <Navbar />
      <main>
        <section className="noise section-padding relative overflow-hidden pb-10 pt-36 sm:pt-44">
          <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden />
          <div className="ambient-orb left-1/2 top-0 h-[420px] w-[min(800px,120vw)] -translate-x-1/2 opacity-60" aria-hidden />
          <div className="relative">
            <SectionHeading eyebrow="How it works" title={<>From upload to export, <span className="serif-accent text-brand-highlight">in one flow.</span></>} body="Ten connected steps share a single project. Jump between them at any time. Your work saves to your account as you go." />
          </div>

          {/* Pipeline map */}
          <motion.ol initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }} className="relative mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-5">
            {WORKFLOW.map((s, i) => (
              <li key={s.id} className="glass-panel flex items-center gap-3 !rounded-2xl p-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] text-text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="block truncate text-sm font-medium text-text-primary">{s.short}</span>
                </span>
              </li>
            ))}
          </motion.ol>
          <div className="mt-8 flex justify-center">
            <Link to="/studio/upload" className="btn-primary">
              Start the workflow <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
        <HowItWorksSection hideLink />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
