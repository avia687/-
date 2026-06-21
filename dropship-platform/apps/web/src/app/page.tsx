import Link from 'next/link';

const features = [
  { title: 'Supplier integrations', body: 'AliExpress, CJ, Zendrop and more behind one adapter interface.' },
  { title: 'Multi-channel selling', body: 'List to Shopify, Amazon, eBay, TikTok Shop and others.' },
  { title: 'AI agent', body: 'Claude-powered product research, copywriting, SEO and pricing.' },
  { title: 'Multi-tenant', body: 'Run many sellers and stores from one platform with full isolation.' },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="text-xl font-bold text-brand">Dropship Platform</span>
        <Link href="/dashboard" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
          Open dashboard
        </Link>
      </header>

      <section className="mt-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Build a dropshipping business, <span className="text-brand">end to end</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Import products, sync inventory and prices, sell across marketplaces, and let an AI agent
          do the research and copywriting — all from one multi-tenant platform.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/dashboard" className="rounded-md bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark">
            Get started
          </Link>
          <a
            href="http://localhost:4000/docs"
            className="rounded-md border border-slate-300 px-6 py-3 font-medium hover:bg-white"
          >
            API docs
          </a>
        </div>
      </section>

      <section className="mt-24 grid gap-6 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
