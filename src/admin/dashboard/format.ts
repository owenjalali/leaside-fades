export const TIME_ZONE = "America/Toronto";

export function parseLocalDate(date: string) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
}
