import { useGoogleReviews } from "@/lib/googleReviews";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Hero from "@/sections/Hero";
import TrustStrip from "@/sections/TrustStrip";
import Services from "@/sections/Services";
import Features from "@/sections/Features";
import OurShop from "@/sections/OurShop";
import Gallery from "@/sections/Gallery";
import Testimonials from "@/sections/Testimonials";
import Team from "@/sections/Team";
import FAQ from "@/sections/FAQ";
import Contact from "@/sections/Contact";
import FinalCTA from "@/sections/FinalCTA";

export default function App() {
    const reviewsState = useGoogleReviews();

    return (
        <div className="min-h-screen bg-white">
            <Navbar />
            <main>
                <Hero />
                <TrustStrip
                    overallRating={reviewsState.overallRating}
                    totalReviews={reviewsState.totalReviews}
                />
                <Services />
                <Features />
                <OurShop />
                <Gallery />
                <Testimonials reviews={reviewsState.reviews} />
                <Team />
                <FAQ />
                <Contact />
                <FinalCTA />
            </main>
            <Footer />
        </div>
    );
}
