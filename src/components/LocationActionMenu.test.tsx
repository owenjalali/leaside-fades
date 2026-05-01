import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import LocationActionMenu from "./LocationActionMenu";

describe("LocationActionMenu", () => {
    test("renders booking actions as a direct link to the public booking flow", () => {
        const html = renderToStaticMarkup(
            <LocationActionMenu action="book" label="Book Now" />,
        );

        expect(html).toContain('href="/book"');
        expect(html).toContain("Book Now");
        expect(html).not.toContain("aria-haspopup");
        expect(html).not.toContain('role="menu"');
        expect(html).not.toContain("Leaside Fades (Eglinton)");
        expect(html).not.toContain("Leaside Fades (Millwood)");
    });

    test("keeps call actions location-specific", () => {
        const html = renderToStaticMarkup(<LocationActionMenu action="call" label="Call" />);

        expect(html).toContain('aria-haspopup="menu"');
        expect(html).toContain("Call");
        expect(html).not.toContain('href="/book"');
    });
});
