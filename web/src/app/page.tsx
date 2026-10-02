import { FAQSection } from '@/components/landing/faq-section';
import { HeroSection } from '@/components/landing/hero-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { HowItWorks, StyleShowcase, UseCases, VirtualTryOnFeature } from '@/components/landing/story-sections';
import { ToolkitSection } from '@/components/landing/toolkit-section';

export default function HomePage() {
  return (
    <main className="overflow-hidden">
      <HeroSection />
      <ToolkitSection />
      <HowItWorks />
      <VirtualTryOnFeature />
      <UseCases />
      <StyleShowcase />
      <FAQSection />
      <LandingFooter />
    </main>
  );
}
