import { useGoogleReviews } from "@/lib/googleReviews";
import AdminApp from "@/admin/AdminApp";
import BookingPage from "@/booking/BookingPage";
import CustomerBookingPage from "@/booking/CustomerBookingPage";
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
import { getAppSurface } from "./app-routing";

export default function App() {
    const reviewsState = useGoogleReviews();
    const appSurface = getAppSurface(window.location.pathname);

    if (appSurface === "customer-booking") {
        return <CustomerBookingPage />;
    }

    if (appSurface === "booking") {
        return <BookingPage />;
    }

    if (appSurface === "admin") {
        return <AdminApp />;
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar />
            <main>
                <Hero
                    overallRating={reviewsState.overallRating}
                    totalReviews={reviewsState.totalReviews}
                />
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
