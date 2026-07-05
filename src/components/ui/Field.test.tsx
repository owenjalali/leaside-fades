import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Field } from "./Field.tsx";
import { Input } from "./Input.tsx";

describe("Field", () => {
    test("wires the label htmlFor to the id passed to the children render function", () => {
        const html = renderToStaticMarkup(
            <Field label="Email">{(id) => <Input id={id} />}</Field>,
        );

        const forMatch = html.match(/for="([^"]+)"/);
        const idMatch = html.match(/\bid="([^"]+)"/);
        expect(forMatch).not.toBeNull();
        expect(idMatch).not.toBeNull();
        expect(forMatch?.[1]).toBe(idMatch?.[1]);
        expect(html).toContain("Email");
        expect(html).toContain("text-ink-muted");
    });

    test("uses an explicit id when provided", () => {
        const html = renderToStaticMarkup(
            <Field label="Name" id="customer-name">{(id) => <Input id={id} />}</Field>,
        );

        expect(html).toContain('for="customer-name"');
        expect(html).toContain('id="customer-name"');
    });

    test("renders the hint when there is no error", () => {
        const html = renderToStaticMarkup(
            <Field label="Phone" hint="Include area code">{(id) => <Input id={id} />}</Field>,
        );

        expect(html).toContain("Include area code");
        expect(html).toContain("text-ink-faint");
        expect(html).not.toContain('role="alert"');
    });

    test("error renders with role=alert and takes precedence over the hint", () => {
        const html = renderToStaticMarkup(
            <Field label="Phone" hint="Include area code" error="Phone is required">
                {(id) => <Input id={id} />}
            </Field>,
        );

        expect(html).toContain('role="alert"');
        expect(html).toContain("Phone is required");
        expect(html).toContain("text-danger");
        expect(html).not.toContain("Include area code");
    });
});
