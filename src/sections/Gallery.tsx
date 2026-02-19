import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";

const images = [
    { src: "/assets/gallery-4.webp", alt: "Styled cut" },
    { src: "/assets/gallery-5.webp", alt: "Beard trim" },
    { src: "/assets/gallery-6.webp", alt: "Fresh cut" },
    { src: "/assets/gallery-7.webp", alt: "Taper fade" },
    { src: "/assets/gallery-8.webp", alt: "Sharp lineup" },
    { src: "/assets/gallery-9.webp", alt: "Skin fade" },
    { src: "/assets/gallery-10.webp", alt: "Modern cut" },
    { src: "/assets/gallery-11.webp", alt: "Textured cut" },
    { src: "/assets/gallery-12.webp", alt: "Classic barber cut" },
    { src: "/assets/gallery-13.webp", alt: "Styled finish" },
    { src: "/assets/gallery-14.webp", alt: "Sharp edges" },
    { src: "/assets/gallery-15.webp", alt: "Clean taper" },
    { src: "/assets/gallery-16.webp", alt: "Sculpted cut" },
    { src: "/assets/gallery-17.webp", alt: "Line work" },
    { src: "/assets/gallery-18.webp", alt: "Fresh style" },
];

const gridSpans = [
    "col-span-1 row-span-2",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-2",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-2",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-1",
    "col-span-1 row-span-2",
    "col-span-1 row-span-1",
];

export default function Gallery() {
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

    const openLightbox = (i: number) => setLightboxIdx(i);
    const closeLightbox = () => setLightboxIdx(null);
    const prev = () =>
        setLightboxIdx((p) =>
            p !== null ? (p - 1 + images.length) % images.length : null
        );
    const next = () =>
        setLightboxIdx((p) => (p !== null ? (p + 1) % images.length : null));

    return (
        <section id="gallery" className="section-padding bg-white">
            <div className="max-w-7xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-12">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Our Work
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            THE GALLERY
                        </h2>
                        <p className="text-charcoal/50 mt-4 max-w-lg mx-auto">
                            Every cut tells a story. Here's some of our recent work.
                        </p>
                    </div>
                </AnimateOnScroll>

                {/* Grid */}
                <AnimateOnScroll animation="fade-in" delay={100}>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[200px] md:auto-rows-[240px] gap-3">
                        {images.map((img, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "relative rounded-xl overflow-hidden cursor-pointer group",
                                    gridSpans[i % gridSpans.length]
                                )}
                                onClick={() => openLightbox(i)}
                            >
                                <img
                                    src={img.src}
                                    alt={img.alt}
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="w-10 h-10 rounded-full bg-green/90 flex items-center justify-center">
                                        <svg
                                            className="w-5 h-5 text-white"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </AnimateOnScroll>
            </div>

            {/* Lightbox */}
            {lightboxIdx !== null && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
                    onClick={closeLightbox}
                >
                    <button
                        className="absolute top-6 right-6 text-white/70 hover:text-white z-10"
                        onClick={closeLightbox}
                    >
                        <X size={28} />
                    </button>
                    <button
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            prev();
                        }}
                    >
                        <ChevronLeft size={36} />
                    </button>
                    <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10 p-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            next();
                        }}
                    >
                        <ChevronRight size={36} />
                    </button>
                    <img
                        src={images[lightboxIdx].src}
                        alt={images[lightboxIdx].alt}
                        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <p className="absolute bottom-6 text-white/60 text-sm">
                        {lightboxIdx + 1} / {images.length}
                    </p>
                </div>
            )}
        </section>
    );
}
