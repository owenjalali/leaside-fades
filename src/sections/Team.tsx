import AnimateOnScroll from "@/components/AnimateOnScroll";

interface TeamMember {
    name: string;
    role: string;
    image: string;
    specialty: string;
}

const team: TeamMember[] = [
    {
        name: "Sam",
        role: "Owner / Head Barber",
        image: "https://placehold.co/600x800/1a3a2a/52b788?text=Sam",
        specialty: "Fades & Beard Sculpting",
    },
    {
        name: "Barber #2",
        role: "Senior Barber",
        image: "https://placehold.co/600x800/1a3a2a/52b788?text=Barber+2",
        specialty: "Precision Cuts & Styling",
    },
    {
        name: "Barber #3",
        role: "Barber",
        image: "https://placehold.co/600x800/1a3a2a/52b788?text=Barber+3",
        specialty: "Fades & Line Work",
    },
];

export default function Team() {
    return (
        <section id="team" className="section-padding bg-white">
            <div className="max-w-7xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-12">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Meet The Team
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            YOUR BARBERS
                        </h2>
                        <p className="text-charcoal/50 mt-4 max-w-lg mx-auto">
                            Skilled hands, sharp eyes, and a passion for the craft.
                        </p>
                    </div>
                </AnimateOnScroll>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {team.map((member, i) => (
                        <AnimateOnScroll key={member.name} animation="fade-up" delay={i * 150}>
                            <div className="group relative rounded-2xl overflow-hidden bg-forest border border-gray-100 hover:shadow-xl hover:shadow-green/10 transition-all duration-500">
                                <div className="aspect-[3/4] overflow-hidden">
                                    <img
                                        src={member.image}
                                        alt={member.name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/30 to-transparent" />
                                <div className="absolute bottom-0 left-0 right-0 p-6">
                                    <h3 className="font-display text-2xl text-white tracking-wider">
                                        {member.name.toUpperCase()}
                                    </h3>
                                    <p className="text-green text-sm font-medium mt-1">
                                        {member.role}
                                    </p>
                                    <p className="text-white/60 text-sm mt-1">
                                        {member.specialty}
                                    </p>
                                </div>
                            </div>
                        </AnimateOnScroll>
                    ))}
                </div>
            </div>
        </section>
    );
}
