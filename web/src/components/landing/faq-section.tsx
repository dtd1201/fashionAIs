const questions = [
  ['What is FashionAIs?', 'FashionAIs is a private creative workspace for organizing source images and running fashion-focused AI generation workflows.'],
  ['What can I create?', 'Virtual Try-On is currently available. Model generation, photoshoots, campaign imagery, and video are presented as upcoming tools.'],
  ['How does Virtual Try-On work?', 'Upload one person image and one garment image, then submit a try-on generation. Processing happens in the background while the studio tracks its status.'],
  ['Are uploaded images private?', 'Assets belong to your organization and use private object storage. Access is controlled by backend authentication and organization membership.'],
  ['Where are my generated assets stored?', 'Completed outputs are downloaded into your organization-owned storage and represented as ready assets in your workspace.'],
  ['Do I need design experience?', 'No. The workflow is designed to be direct, while still giving creative teams room to develop their own visual direction.'],
];

export function FAQSection() {
  return <section id="faq" className="landing-shell py-28"><div className="grid gap-16 lg:grid-cols-[.7fr_1.3fr]"><div><p className="eyebrow">Questions, answered</p><h2 className="section-title mt-5">Before you enter the studio</h2></div><div className="border-t border-stone-300">{questions.map(([question, answer]) => <details key={question} className="group border-b border-stone-300 py-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-serif text-2xl"><span>{question}</span><span className="text-3xl font-light transition group-open:rotate-45">+</span></summary><p className="max-w-2xl pb-2 pt-5 text-sm leading-7 text-stone-600">{answer}</p></details>)}</div></div></section>;
}
