import AnimateOnScroll from "@/components/AnimateOnScroll";
import millwoodExterior from "@/assets/barbers/millwood-storefront.png";
import millwoodInteriorA from "@/assets/barbers/millwood-interior-1.png";
import millwoodInteriorB from "@/assets/barbers/millwood-interior-2.png";

interface ShopImage {
    src: string;
    alt: string;
}

const eglintonImages: ShopImage[] = [
    { src: "/assets/gallery-1.jpeg", alt: "Eglinton location interior" },
    { src: "/assets/gallery-2.jpeg", alt: "Eglinton barber stations" },
    { src: "/assets/gallery-3.jpeg", alt: "Eglinton storefront" },
];

const millwoodImages: ShopImage[] = [
    { src: millwoodExterior, alt: "Millwood storefront" },
    { src: millwoodInteriorA, alt: "Millwood reception and interior" },
    { src: millwoodInteriorB, alt: "Millwood barber stations" },
];

function ShopImageGrid({ title, images }: { title: string; images: ShopImage[] }) {
    return (
        <div>
            <h3 className="font-display text-2xl text-charcoal tracking-wide mb-4 text-center md:text-left">
                {title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {images.map((img, i) => (
                    <AnimateOnScroll key={`${title}-${img.alt}`} animation="scale-up" delay={i * 120}>
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
    );
}

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
                            THE SHOPS
                        </h2>
                        <p className="text-charcoal/50 mt-4 max-w-lg mx-auto">
                            Two welcoming spaces where great conversations meet great cuts.
                        </p>
                    </div>
                </AnimateOnScroll>

                <div className="space-y-10">
                    <ShopImageGrid title="Eglinton" images={eglintonImages} />
                    <ShopImageGrid title="Millwood" images={millwoodImages} />
                </div>
            </div>
        </section>
    );
}
