import AnimateOnScroll from "@/components/AnimateOnScroll";
import LocationActionMenu from "@/components/LocationActionMenu";

export default function FinalCTA() {
    return (
        <section className="relative z-20 py-24 overflow-x-hidden overflow-y-visible bg-gradient-to-br from-forest via-emerald to-forest">
            {/* Decorative */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-green rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-light rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 max-w-3xl mx-auto text-center px-4">
                <AnimateOnScroll animation="scale-up" className="relative z-40">
                    <h2 className="font-display text-5xl md:text-7xl text-white tracking-wider mb-6">
                        READY FOR
                        <br />
                        A FRESH CUT?
                    </h2>
                    <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
                        Walk in or book online. Either way, you're leaving looking sharp.
                    </p>
                    <LocationActionMenu
                        action="book"
                        label="Book Now"
                        side="top"
                        buttonClassName="relative inline-flex items-center justify-center px-10 py-4 overflow-hidden font-bold text-forest bg-white rounded-full hover:bg-cream transition-all duration-300 text-lg shadow-xl"
                        menuClassName="left-1/2 -translate-x-1/2"
                    />
                </AnimateOnScroll>
            </div>
        </section>
    );
}
