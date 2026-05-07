import lauraThumb from "../assets/barbers/booking-thumbnails/laura-thumb.jpg";
import samThumb from "../assets/barbers/booking-thumbnails/sam-thumb.jpg";
import shayonThumb from "../assets/barbers/booking-thumbnails/shayon-thumb.jpg";
import yogeshThumb from "../assets/barbers/booking-thumbnails/yogesh-thumb.jpg";
import fawadPhoto from "../assets/barbers/fawad.png";

type BarberPhotoInput = {
    displayName: string;
    slug?: string;
};

const barberPhotosBySlug: Record<string, string> = {
    "sam-to": samThumb,
    "laura-nguyen": lauraThumb,
    "yogesh-kumar": yogeshThumb,
    "shayan-hussain": shayonThumb,
    "shayon-hussain": shayonThumb,
    fawad: fawadPhoto,
};

export function getAdminBarberPhotoUrl(barber: BarberPhotoInput) {
    if (barber.slug && barberPhotosBySlug[barber.slug]) {
        return barberPhotosBySlug[barber.slug];
    }

    return barberPhotosBySlug[slugifyBarberPhotoKey(barber.displayName)];
}

function slugifyBarberPhotoKey(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
