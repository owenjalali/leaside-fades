// Single source of truth for status + booking-tone class recipes.
// Calendar cards and the calendar legend must both read from this module.

export type StatusTone = "success" | "danger" | "warning" | "info";

export interface StatusToneClasses {
    text: string;
    softBg: string;
    solidBg: string;
    solidText: string;
}

export const statusTone: Record<StatusTone, StatusToneClasses> = {
    success: { text: "text-success", softBg: "bg-success-soft", solidBg: "bg-success", solidText: "text-white" },
    danger: { text: "text-danger", softBg: "bg-danger-soft", solidBg: "bg-danger", solidText: "text-white" },
    warning: { text: "text-warning", softBg: "bg-warning-soft", solidBg: "bg-warning", solidText: "text-white" },
    info: { text: "text-info", softBg: "bg-info-soft", solidBg: "bg-info", solidText: "text-white" },
};

export type BookingTone = "men" | "women" | "boys" | "mixed" | "noshow" | "completed" | "cancelled";

export interface BookingToneClasses {
    text: string;
    softBg: string;
    border: string;
}

export const bookingTone: Record<BookingTone, BookingToneClasses> = {
    men: { text: "text-tone-men", softBg: "bg-tone-men-soft", border: "border-tone-men" },
    women: { text: "text-tone-women", softBg: "bg-tone-women-soft", border: "border-tone-women" },
    boys: { text: "text-tone-boys", softBg: "bg-tone-boys-soft", border: "border-tone-boys" },
    mixed: { text: "text-tone-mixed", softBg: "bg-tone-mixed-soft", border: "border-tone-mixed" },
    noshow: { text: "text-tone-noshow", softBg: "bg-tone-noshow-soft", border: "border-tone-noshow" },
    completed: { text: "text-tone-completed", softBg: "bg-tone-completed-soft", border: "border-tone-completed" },
    cancelled: { text: "text-tone-cancelled", softBg: "bg-tone-cancelled-soft", border: "border-tone-cancelled" },
};
