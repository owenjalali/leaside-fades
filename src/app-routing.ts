export type AppSurface = "customer-booking" | "booking" | "admin" | "marketing";

export function getAppSurface(pathname: string): AppSurface {
    if (pathname.startsWith("/booking")) {
        return "customer-booking";
    }

    if (pathname.startsWith("/book")) {
        return "booking";
    }

    if (pathname.startsWith("/admin")) {
        return "admin";
    }

    return "marketing";
}
