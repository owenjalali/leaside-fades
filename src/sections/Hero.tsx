import AnimateOnScroll from "@/components/AnimateOnScroll";

export default function Hero() {
    return (
        <section
            id="hero"
            className="relative min-h-screen flex items-center justify-center overflow-hidden"
        >
            {/* Background Image */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/assets/hero-bg.jpg')" }}
            />
            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Content */}
            <div className="relative z-10 text-center px-4 max-w-4xl mx-auto pt-20">
                <AnimateOnScroll animation="fade-in" duration={1000}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8">
                        <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                        <span className="text-white/90 text-sm font-medium">
                            Walk-Ins Welcome — Open Today
                        </span>
                    </div>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={200}>
                    <h1 className="font-display text-6xl md:text-8xl lg:text-9xl text-white tracking-wider leading-[0.9] drop-shadow-2xl">
                        PRECISION CUTS.
                        <br />
                        <span className="text-green-light">LOCAL CRAFT.</span>
                    </h1>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={400}>
                    <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mt-6 leading-relaxed">
                        East York's neighbourhood barbershop on Bayview Ave. Classic
                        technique, modern style, and a fresh cut every time.
                    </p>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={600}>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                        <a
                            href="https://www.fresha.com/a/leaside-fades-east-york-1680-bayview-avenue-e5v8n6i4/booking"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative inline-flex items-center justify-center px-8 py-4 overflow-hidden font-bold text-white bg-green rounded-full group hover:bg-emerald transition-all duration-300 text-lg shadow-xl shadow-green/30"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            <span className="relative">Book Your Cut</span>
                        </a>
                        <a
                            href="tel:+16474715485"
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white font-medium hover:bg-white/20 transition-all duration-300"
                        >
                            📞 (647) 471-5485
                        </a>
                    </div>
                </AnimateOnScroll>

                {/* Trust chips */}
                <AnimateOnScroll animation="fade-in" delay={800}>
                    <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-white/60 text-sm">
                        <span className="flex items-center gap-1.5">
                            ⭐ <strong className="text-white">5.0</strong> on Google
                        </span>
                        <span className="w-px h-4 bg-white/20" />
                        <span>📍 1680 Bayview Ave</span>
                        <span className="w-px h-4 bg-white/20 hidden sm:block" />
                        <span className="hidden sm:inline">🕐 Mon–Sat: 9AM–7PM</span>
                    </div>
                </AnimateOnScroll>
            </div>

            {/* Bottom gradient fade to white */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/60 to-transparent" />
        </section>
    );
}
