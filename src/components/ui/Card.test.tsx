import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Card, CardBody, CardFooter, CardHeader, CardTitle, Metric } from "./Card.tsx";

describe("Card", () => {
    test("renders the resting card recipe", () => {
        const html = renderToStaticMarkup(<Card className="mt-4">Body</Card>);

        expect(html).toContain("bg-surface");
        expect(html).toContain("border-border");
        expect(html).toContain("rounded-card");
        expect(html).toContain("shadow-card");
        expect(html).toContain("mt-4");
    });

    test("renders header, title, body and footer sections", () => {
        const html = renderToStaticMarkup(
            <Card>
                <CardHeader>
                    <CardTitle>Today</CardTitle>
                </CardHeader>
                <CardBody>Content</CardBody>
                <CardFooter>Footer</CardFooter>
            </Card>,
        );

        expect(html).toContain("px-5 pt-5");
        expect(html).toContain("items-start justify-between");
        expect(html).toContain("text-xl font-semibold text-ink");
        expect(html).toContain("px-5 py-4");
        expect(html).toContain("px-5 pb-5");
        expect(html).toContain("Today");
        expect(html).toContain("Content");
        expect(html).toContain("Footer");
    });
});

describe("Metric", () => {
    test("renders label, value and hint recipes", () => {
        const html = renderToStaticMarkup(<Metric label="Revenue" value="$1,240" hint="This week" />);

        expect(html).toContain("text-xs font-medium text-ink-muted");
        expect(html).toContain("text-2xl font-semibold");
        expect(html).toContain("tabular-nums");
        expect(html).toContain("text-xs text-ink-faint");
        expect(html).toContain("Revenue");
        expect(html).toContain("$1,240");
        expect(html).toContain("This week");
    });

    test("omits the hint element when not provided", () => {
        const html = renderToStaticMarkup(<Metric label="Bookings" value={12} />);

        expect(html).not.toContain("text-ink-faint");
        expect(html).toContain("Bookings");
    });
});
