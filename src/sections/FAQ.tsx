import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";

interface FAQItem {
    question: string;
    answer: string;
}

const faqs: FAQItem[] = [
    {
        question: "Do I need an appointment?",
        answer:
            "Walk-ins are always welcome! However, we recommend booking online through Fresha to guarantee your preferred time slot, especially on weekends.",
    },
    {
        question: "What payment methods do you accept?",
        answer:
            "We accept cash, debit, Visa, Mastercard, and Apple Pay / Google Pay.",
    },
    {
        question: "Is there parking nearby?",
        answer:
            "Yes! There's free street parking on Bayview Ave and side streets. We're also easily accessible by TTC bus routes along Bayview.",
    },
    {
        question: "Do you cut kids' hair?",
        answer:
            "Absolutely! We offer boys' haircuts for ages 9 and under. Our barbers are patient and great with kids.",
    },
    {
        question: "How long does a typical haircut take?",
        answer:
            "A standard men's haircut takes about 30 minutes. Haircut + beard combos run about 45 minutes. We never rush — quality comes first.",
    },
    {
        question: "Do you offer any hair products?",
        answer:
            "Yes, we carry a selection of premium styling products including pomades, clays, and beard oils. Ask your barber for a recommendation!",
    },
];

function FAQAccordionItem({ item }: { item: FAQItem }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-gray-100 last:border-b-0">
            <button
                className="w-full flex items-center justify-between py-5 px-1 text-left group"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="text-charcoal font-medium text-base md:text-lg pr-4 group-hover:text-green transition-colors">
                    {item.question}
                </span>
                <ChevronDown
                    size={20}
                    className={cn(
                        "text-charcoal/30 shrink-0 transition-transform duration-300",
                        isOpen && "rotate-180 text-green"
                    )}
                />
            </button>
            <div
                className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isOpen ? "max-h-48 pb-5" : "max-h-0"
                )}
            >
                <p className="text-charcoal/60 text-sm leading-relaxed px-1">
                    {item.answer}
                </p>
            </div>
        </div>
    );
}

export default function FAQ() {
    return (
        <section id="faq" className="section-padding bg-gray-50">
            <div className="max-w-3xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-12">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Questions?
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            FREQUENTLY ASKED
                        </h2>
                        <p className="text-charcoal/50 mt-4 max-w-lg mx-auto">
                            Everything you need to know before your visit.
                        </p>
                    </div>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={100}>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 md:px-8">
                        {faqs.map((faq) => (
                            <FAQAccordionItem key={faq.question} item={faq} />
                        ))}
                    </div>
                </AnimateOnScroll>
            </div>
        </section>
    );
}
