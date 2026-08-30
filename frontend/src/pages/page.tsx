import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#EDECEC] text-slate-800 flex flex-col justify-between">
      {/* Navigation */}
      <header className="border-b border-[#CCCCCC] bg-[#FEFEFE]/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-[#B7C396] flex items-center justify-center font-bold text-slate-900 text-xl tracking-tighter shadow-sm">
              UL
            </div>
            <span className="font-extrabold text-2xl text-slate-900 tracking-tight">
              UrbanLoop
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#B7C396] text-slate-900 hover:bg-[#A6B483] active:scale-95 transition shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-16 flex-grow flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full border border-[#B7C396] bg-[#E0E7D7]/60 text-slate-800 text-xs font-semibold uppercase tracking-wider mb-6">
          <span className="h-2 w-2 rounded-full bg-[#B7C396] animate-pulse"></span>
          <span>Government & Citizen Co-Op Waste Grid</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-4xl leading-tight text-slate-900">
          Smart Municipal Waste{' '}
          <span className="text-[#BA9A91]">
            Tracking & Recycling
          </span>
        </h1>
        <p className="text-slate-600 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed font-medium">
          UrbanLoop connects citizens with municipal grids to facilitate property-specific waste profiling, smart bin allocations, and end-to-end chain of custody recycling analytics.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-20">
          <Link
            to="/register"
            className="px-8 py-4 rounded-xl font-bold bg-[#B7C396] text-slate-900 hover:bg-[#A6B483] shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            Register Your Property
          </Link>
          <Link
            to="/login"
            className="px-8 py-4 rounded-xl font-bold bg-[#FEFEFE] text-slate-800 border border-[#CCCCCC] hover:bg-[#E0E7D7] transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
          >
            Access Dashboard
          </Link>
        </div>

        {/* Live Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
          <div className="p-8 rounded-2xl border border-[#B7C396]/40 bg-[#FEFEFE] shadow-sm relative overflow-hidden group hover:border-[#B7C396] transition-all">
            <div className="text-4xl font-extrabold text-[#BA9A91] mb-2">
              4,300+
            </div>
            <div className="font-semibold text-slate-800 text-base mb-1">Properties Registered</div>
            <div className="text-slate-500 text-sm">Verified citizen properties mapped to collection grids</div>
          </div>
          <div className="p-8 rounded-2xl border border-[#B7C396]/40 bg-[#FEFEFE] shadow-sm relative overflow-hidden group hover:border-[#B7C396] transition-all">
            <div className="text-4xl font-extrabold text-[#B7C396] mb-2">
              10,800+
            </div>
            <div className="font-semibold text-slate-800 text-base mb-1">IoT Smart Bins Active</div>
            <div className="text-slate-500 text-sm">Dry, Wet, and E-Waste sensors transmitting capacity</div>
          </div>
          <div className="p-8 rounded-2xl border border-[#B7C396]/40 bg-[#FEFEFE] shadow-sm relative overflow-hidden group hover:border-[#B7C396] transition-all">
            <div className="text-4xl font-extrabold text-[#8A9B6E] mb-2">
              184.2 Tons
            </div>
            <div className="font-semibold text-slate-800 text-base mb-1">Recyclables Diverted</div>
            <div className="text-slate-500 text-sm">Municipal waste redirected from landfills this quarter</div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#CCCCCC] bg-[#FEFEFE] py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-slate-500 text-sm">
          © {new Date().getFullYear()} UrbanLoop Municipal Systems. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
