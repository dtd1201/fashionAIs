import Link from 'next/link';
import { ArrowUpRight, Camera, Clapperboard, ScanFace, Shirt, Sparkles, WandSparkles } from 'lucide-react';

const tools = [
  { title: 'Virtual Try-On', description: 'Put a garment on a person or model and create a workspace-ready output.', icon: Shirt, live: true },
  { title: 'AI Model Generator', description: 'Develop model directions for future campaign concepts.', icon: ScanFace },
  { title: 'AI Photoshoot', description: 'Turn product imagery into styled campaign compositions.', icon: Camera },
  { title: 'Fashion Design', description: 'Explore new silhouettes from text and visual references.', icon: WandSparkles },
  { title: 'Campaign Imagery', description: 'Build editorial and ecommerce visual systems.', icon: Sparkles },
  { title: 'Fashion Video', description: 'Transform still fashion imagery into motion.', icon: Clapperboard },
];

export function ToolkitSection() {
  return (
    <section id="tools" className="bg-[#171815] py-28 text-[#f4efe5]">
      <div className="landing-shell">
        <div className="flex flex-col justify-between gap-6 border-b border-white/20 pb-10 md:flex-row md:items-end">
          <div><p className="eyebrow text-[#d88967]">The toolkit</p><h2 className="section-title mt-5 max-w-3xl">AI tools for the entire fashion workflow</h2></div>
          <p className="max-w-sm text-sm leading-6 text-stone-400">Start with production-ready virtual try-on. The wider creative toolkit is presented as a roadmap, not as live functionality.</p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden border border-white/15 bg-white/15 md:grid-cols-2 lg:grid-cols-3">
          {tools.map(({ title, description, icon: Icon, live }, index) => (
            <article key={title} className="group min-h-72 bg-[#171815] p-7 transition hover:bg-[#20211d]">
              <div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20"><Icon size={20} /></span><span className="font-mono text-xs text-stone-600">0{index + 1}</span></div>
              <h3 className="mt-16 font-serif text-3xl">{title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-stone-400">{description}</p>
              <div className="mt-6 flex items-center justify-between text-xs font-bold uppercase tracking-[.16em]">{live ? <Link href="/studio" className="text-[#e29a78]">Open tool</Link> : <span className="text-stone-600">Coming soon</span>}<ArrowUpRight size={16} className="transition group-hover:-translate-y-1 group-hover:translate-x-1" /></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
