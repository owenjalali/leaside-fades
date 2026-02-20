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
        bookingUrl:
            "https://www.fresha.com/a/leasidefades-toronto-866-eglinton-avenue-east-oyz3pt1m?preview=35767ad4-91b3-4aea-a890-bf79b66c2a81&pId=2797003&_gl=1*1essaaw*_gcl_aw*R0NMLjE3NzE1MjY0ODIuQ2owS0NRaUFodHZNQmhEQkFSSXNBTDI2cGpId29mSEkxZl9WYWtabkdWOU5DbHJrLVF2SEwxc2pjWnctZ0Z5MU0xeEIzbFhpZ1hNUlk4WWFBaDhsRUFMd193Y0I.*_gcl_au*MTQzOTg5MjA1MS4xNzY5NDU5MjI4LjEwNDY3OTA5OTAuMTc3MTUyNjUyMi4xNzcxNTI2NTIy*_ga*MTI1OTQ0MDQxNC4xNzY5NDU5MjI4*_ga_SMQNG7NE8C*czE3NzE1MzYxNjckbzEyJGcxJHQxNzcxNTQ1MjQ3JGozMiRsMCRoMA..",
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
        bookingUrl:
            "https://www.fresha.com/a/leaside-fades-millwood-toronto-909-millwood-road-jhixipcv?preview=c0695fcb-61e0-41c6-8403-db3ce3c3a978&pId=2797003&_gl=1*1q70sqo*_gcl_aw*R0NMLjE3NzE1NTYyNTMuQ2owS0NRaUFodHZNQmhEQkFSSXNBTDI2cGpFSG1ESGYwazYzR0ZPY0xhUmVnUXFhWUR6NjhqcjlWR3B5N21OU1RvaWVPbWt2bXFIUEVCRWFBaG9zRUFMd193Y0I.*_gcl_au*MTQzOTg5MjA1MS4xNzY5NDU5MjI4LjEwNDY3OTA5OTAuMTc3MTUyNjUyMi4xNzcxNTI2NTIy*_ga*MTI1OTQ0MDQxNC4xNzY5NDU5MjI4*_ga_SMQNG7NE8C*czE3NzE1NTQxMTkkbzEzJGcxJHQxNzcxNTU3MjY4JGo5JGwwJGgw",
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
