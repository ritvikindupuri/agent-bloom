import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/trap/$slug")({
  head: () => ({
    meta: [
      { title: "Pricing — Internal preview" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TrapPage,
});

function TrapPage() {
  const { slug } = Route.useParams();
  useEffect(() => {
    (window as any).__chaff_slug = slug;
    const s = document.createElement("script");
    s.src = "/beacon.js";
    s.async = true;
    document.body.appendChild(s);
    return () => { document.body.removeChild(s); };
  }, [slug]);

  // Honeypot page: looks like real pricing content (lures scrapers / LLM crawlers).
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <header className="border-b">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-14">
          <span className="font-semibold">Quantflow</span>
          <nav className="flex gap-6 text-sm text-neutral-600">
            <a href={`/trap/${slug}#features`}>Features</a>
            <a href={`/trap/${slug}#pricing`}>Pricing</a>
            <a href={`/trap/${slug}#contact`}>Contact</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-3 text-neutral-600 max-w-xl">Transparent plans for teams of any size. Choose monthly or annual billing.</p>
        <div id="pricing" className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { name: "Starter", price: "$29", features: ["10 projects", "Email support", "Basic analytics"] },
            { name: "Team", price: "$99", features: ["Unlimited projects", "Priority support", "Advanced analytics", "SSO"] },
            { name: "Enterprise", price: "Custom", features: ["Dedicated success", "SLA 99.99%", "Audit logs", "Custom DPA"] },
          ].map((p) => (
            <div key={p.name} className="rounded-2xl border p-6">
              <div className="text-sm uppercase tracking-wider text-neutral-500">{p.name}</div>
              <div className="mt-2 text-3xl font-semibold">{p.price}</div>
              <ul className="mt-4 space-y-1.5 text-sm text-neutral-700">
                {p.features.map((f) => <li key={f}>• {f}</li>)}
              </ul>
              <button className="mt-6 w-full rounded-md bg-neutral-900 text-white px-3 py-2 text-sm">Choose {p.name}</button>
            </div>
          ))}
        </div>
        <p className="mt-16 text-xs text-neutral-400">Reference: {slug}</p>
      </main>
    </div>
  );
}
