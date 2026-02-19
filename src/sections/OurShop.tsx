import AnimateOnScroll from "@/components/AnimateOnScroll";

const shopImages = [
    { src: "/assets/gallery-1.jpeg", alt: "Leaside Fades shop interior" },
    { src: "/assets/gallery-2.jpeg", alt: "Leaside Fades barber chair" },
    { src: "/assets/gallery-3.jpeg", alt: "Leaside Fades storefront" },
];

export default function OurShop() {
    return (
        <section className="section-padding bg-gray-50">
            <div className="max-w-7xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-12">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Our Space
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            THE SHOP
                        </h2>
                        <p className="text-charcoal/50 mt-4 max-w-lg mx-auto">
                            A welcoming space where great conversations meet great cuts.
                        </p>
                    </div>
                </AnimateOnScroll>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {shopImages.map((img, i) => (
                        <AnimateOnScroll key={i} animation="scale-up" delay={i * 150}>
                            <div className="relative rounded-2xl overflow-hidden group aspect-[4/3]">
                                <img
                                    src={img.src}
                                    alt={img.alt}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>
                        </AnimateOnScroll>
                    ))}
                </div>
            </div>
        </section>
    );
}
