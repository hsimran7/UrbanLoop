import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20 text-slate-100 flex flex-col justify-between">
      {/* Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-xl tracking-tighter shadow-lg shadow-emerald-500/20">
              UL
            </div>
            <span className="font-extrabold text-2xl bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              UrbanLoop
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold hover:text-emerald-400 transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:brightness-110 active:scale-95 transition shadow-lg shadow-emerald-500/10"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-16 flex-grow flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-950/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-6">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Government & Citizen Co-Op Waste Grid</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-4xl leading-tight">
          Smart Municipal Waste{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Tracking & Recycling
          </span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          UrbanLoop connects citizens with municipal grids to facilitate property-specific waste profiling, smart bin allocations, and end-to-end chain of custody recycling analytics.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-20">
          <Link
            href="/register"
            className="px-8 py-4 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:brightness-110 shadow-xl shadow-emerald-500/15 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            Register Your Property
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 rounded-xl font-bold bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            Access Dashboard
          </Link>
        </div>

        {/* Live Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
          <div className="p-8 rounded-2xl border border-slate-800/80 bg-slate-950/40 backdrop-blur relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
            <div className="text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent mb-2">
              4,300+
            </div>
            <div className="font-semibold text-slate-300 text-base mb-1">Properties Registered</div>
            <div className="text-slate-500 text-sm">Verified citizen properties mapped to collection grids</div>
          </div>
          <div className="p-8 rounded-2xl border border-slate-800/80 bg-slate-950/40 backdrop-blur relative overflow-hidden group hover:border-teal-500/30 transition-all">
            <div className="absolute top-0 right-0 h-24 w-24 bg-teal-500/5 blur-2xl group-hover:bg-teal-500/10 transition-all"></div>
            <div className="text-4xl font-extrabold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent mb-2">
              10,800+
            </div>
            <div className="font-semibold text-slate-300 text-base mb-1">IoT Smart Bins Active</div>
            <div className="text-slate-500 text-sm">Dry, Wet, and E-Waste sensors transmitting capacity</div>
          </div>
          <div className="p-8 rounded-2xl border border-slate-800/80 bg-slate-950/40 backdrop-blur relative overflow-hidden group hover:border-cyan-500/30 transition-all">
            <div className="absolute top-0 right-0 h-24 w-24 bg-cyan-500/5 blur-2xl group-hover:bg-cyan-500/10 transition-all"></div>
            <div className="text-4xl font-extrabold bg-gradient-to-r from-cyan-400 to-emerald-300 bg-clip-text text-transparent mb-2">
              184.2 Tons
            </div>
            <div className="font-semibold text-slate-300 text-base mb-1">Recyclables Diverted</div>
            <div className="text-slate-500 text-sm">Municipal waste redirected from landfills this quarter</div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-slate-500 text-sm">
          © {new Date().getFullYear()} UrbanLoop Municipal Systems. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
