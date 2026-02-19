import AnimateOnScroll from "@/components/AnimateOnScroll";

export default function FinalCTA() {
    return (
        <section className="relative py-24 overflow-hidden bg-gradient-to-br from-forest via-emerald to-forest">
            {/* Decorative */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-green rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-light rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 max-w-3xl mx-auto text-center px-4">
                <AnimateOnScroll animation="scale-up">
                    <h2 className="font-display text-5xl md:text-7xl text-white tracking-wider mb-6">
                        READY FOR
                        <br />
                        A FRESH CUT?
                    </h2>
                    <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
                        Walk in or book online. Either way, you're leaving looking sharp.
                    </p>
                    <a
                        href="https://www.fresha.com/a/leaside-fades-east-york-1680-bayview-avenue-e5v8n6i4/booking"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative inline-flex items-center justify-center px-10 py-4 overflow-hidden font-bold text-forest bg-white rounded-full group hover:bg-cream transition-all duration-300 text-lg shadow-xl"
                    >
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-green/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                        <span className="relative">Book Now</span>
                    </a>
                </AnimateOnScroll>
            </div>
        </section>
    );
}
