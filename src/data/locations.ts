export type ShopLocationId = "eglinton" | "millwood";

export interface ShopLocation {
    id: ShopLocationId;
    shortName: string;
    fullName: string;
    addressLine: string;
    cityLine: string;
    phoneE164: string;
    phoneDisplay: string;
    bookingUrl: string;
    mapsUrl: string;
    mapEmbedUrl: string;
    hoursLabel: string;
}

export const SHOP_LOCATIONS: readonly ShopLocation[] = [
    {
        id: "eglinton",
        shortName: "Eglinton",
        fullName: "Leaside Fades (Eglinton)",
        addressLine: "866 Eglinton Ave E",
        cityLine: "East York, ON M4G 2L1",
        phoneE164: "+16473482200",
        phoneDisplay: "(647) 348-2200",
        bookingUrl: "https://leasidefades.com/book",
        mapsUrl: "https://maps.app.goo.gl/UbEJ2VDyDjNXhRsQA",
        mapEmbedUrl:
            "https://maps.google.com/maps?q=866+Eglinton+Ave+E+East+York+ON+M4G+2L1&t=&z=15&ie=UTF8&iwloc=&output=embed",
        hoursLabel: "Mon-Sat: 10AM - 7PM | Sun: 10AM - 5PM",
    },
    {
        id: "millwood",
        shortName: "Millwood",
        fullName: "Leaside Fades (Millwood)",
        addressLine: "909 Millwood Rd",
        cityLine: "East York, ON M4G 1X2",
        phoneE164: "+14374237898",
        phoneDisplay: "(437) 423-7898",
        bookingUrl: "https://leasidefades.com/book",
        mapsUrl:
            "https://www.google.com/maps/place/LeasideFades+909+Millwood+rd/@43.7030125,-79.3664074,17z/data=!3m1!4b1!4m6!3m5!1s0x89d4cd60d5c317af:0x48cb37e575056454!8m2!3d43.7030125!4d-79.3638325!16s%2Fg%2F11y_yc9jkl?entry=ttu&g_ep=EgoyMDI2MDIxOC4wIKXMDSoASAFQAw%3D%3D",
        mapEmbedUrl:
            "https://maps.google.com/maps?q=909+Millwood+Rd+East+York+ON+M4G+1X2&t=&z=15&ie=UTF8&iwloc=&output=embed",
        hoursLabel: "Mon-Sat: 10AM - 7PM | Sun: 10AM - 5PM",
    },
] as const;

export const DEFAULT_LOCATION_ID: ShopLocationId = "eglinton";

export function getLocationById(id: ShopLocationId): ShopLocation {
    return SHOP_LOCATIONS.find((location) => location.id === id) ?? SHOP_LOCATIONS[0];
}
