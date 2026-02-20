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
                        href="https://www.fresha.com/a/leasidefades-toronto-866-eglinton-avenue-east-oyz3pt1m?preview=35767ad4-91b3-4aea-a890-bf79b66c2a81&pId=2797003&_gl=1*1essaaw*_gcl_aw*R0NMLjE3NzE1MjY0ODIuQ2owS0NRaUFodHZNQmhEQkFSSXNBTDI2cGpId29mSEkxZl9WYWtabkdWOU5DbHJrLVF2SEwxc2pjWnctZ0Z5MU0xeEIzbFhpZ1hNUlk4WWFBaDhsRUFMd193Y0I.*_gcl_au*MTQzOTg5MjA1MS4xNzY5NDU5MjI4LjEwNDY3OTA5OTAuMTc3MTUyNjUyMi4xNzcxNTI2NTIy*_ga*MTI1OTQ0MDQxNC4xNzY5NDU5MjI4*_ga_SMQNG7NE8C*czE3NzE1MzYxNjckbzEyJGcxJHQxNzcxNTQ1MjQ3JGozMiRsMCRoMA.."
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
