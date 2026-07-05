import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { snapTimeInputValue, TimeInput } from "./TimeInput.tsx";

describe("TimeInput", () => {
    test("renders type=time with a 15-minute step and the control recipe", () => {
        const html = renderToStaticMarkup(<TimeInput value="10:00" onChange={() => {}} />);

        expect(html).toContain('type="time"');
        expect(html).toContain('step="900"');
        expect(html).toContain('value="10:00"');
        expect(html).toContain("rounded-control");
        expect(html).toContain("focus:border-emerald");
    });
});

describe("snapTimeInputValue", () => {
    test("snaps down to the nearest quarter hour", () => {
        expect(snapTimeInputValue("10:07")).toBe("10:00");
    });

    test("snaps up to the nearest quarter hour", () => {
        expect(snapTimeInputValue("10:08")).toBe("10:15");
    });

    test("clamps the end of day to 23:45", () => {
        expect(snapTimeInputValue("23:59")).toBe("23:45");
    });

    test("leaves values that do not parse as typed", () => {
        expect(snapTimeInputValue("junk")).toBe("junk");
        expect(snapTimeInputValue("")).toBe("");
        expect(snapTimeInputValue("9:30")).toBe("9:30");
    });

    test("keeps already-snapped values unchanged", () => {
        expect(snapTimeInputValue("14:45")).toBe("14:45");
    });
});
