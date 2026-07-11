import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
    Clock3,
    ImagePlus,
    MapPin,
    Plus,
    RefreshCw,
    Trash2,
    UploadCloud,
    UsersRound,
} from "lucide-react";

import {
    createAdminTeamBarber,
    deactivateAdminTeamBarber,
    fetchAdminCalendarOptions,
    fetchAdminTeamBarbers,
    uploadAdminBarberProfileImage,
} from "./api";
import { getAdminBarberPhotoUrl } from "./barber-photos";
import { useConfirm } from "../components/ui/ConfirmDialog.tsx";
import type {
    AdminCalendarOptions,
    AdminLocationOption,
    AdminTeamBarber,
    AdminTeamWeeklyShift,
    SafeAdminUser,
} from "./types";

type TeamNotice = { tone: "success" | "error"; message: string } | null;
type ShiftDraft = Omit<AdminTeamWeeklyShift, "effectiveFrom" | "effectiveTo"> & {
    effectiveFrom: string;
    effectiveTo: string;
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxProfileImageBytes = 4 * 1024 * 1024;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weeklyDisplayOrder = [1, 2, 3, 4, 5, 6, 0];

export default function TeamPage({
    user,
    onChanged,
}: {
    user: SafeAdminUser;
    onChanged?: () => Promise<void> | void;
}) {
    const [team, setTeam] = useState<AdminTeamBarber[]>([]);
    const [options, setOptions] = useState<AdminCalendarOptions | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deactivatingId, setDeactivatingId] = useState("");
    const [notice, setNotice] = useState<TeamNotice>(null);
    const confirm = useConfirm();
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [phoneE164, setPhoneE164] = useState("");
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState("");
    const [locationIds, setLocationIds] = useState<string[]>([]);
    const [weeklyShifts, setWeeklyShifts] = useState<ShiftDraft[]>([]);
    const canManageTeam = user.role === "owner" || user.role === "admin";

    const locations = useMemo(() => options?.locations ?? [], [options?.locations]);
    const locationsById = useMemo(
        () => new Map(locations.map((location) => [location.id, location])),
        [locations],
    );

    useEffect(() => {
        void refresh();
    }, []);

    useEffect(() => {
        if (!photoFile) {
            setPhotoPreview("");
            return;
        }

        const objectUrl = URL.createObjectURL(photoFile);
        setPhotoPreview(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [photoFile]);

    useEffect(() => {
        if (locations.length > 0 && locationIds.length === 0) {
            setLocationIds([locations[0].id]);
        }
    }, [locationIds.length, locations]);

    useEffect(() => {
        if (locationIds.length === 0) {
            setWeeklyShifts([]);
            return;
        }

        setWeeklyShifts((current) => {
            if (current.length === 0) {
                return [defaultShift(locationIds[0])];
            }

            return current.map((shift) => (
                locationIds.includes(shift.locationId)
                    ? shift
                    : { ...shift, locationId: locationIds[0] }
            ));
        });
    }, [locationIds]);

    async function refresh() {
        setLoading(true);
        setNotice(null);

        try {
            const [teamResponse, optionsResponse] = await Promise.all([
                fetchAdminTeamBarbers(),
                fetchAdminCalendarOptions(),
            ]);
            setTeam(teamResponse.barbers);
            setOptions(optionsResponse);
        } catch (error) {
            setNotice({ tone: "error", message: error instanceof Error ? error.message : "Team failed to load." });
        } finally {
            setLoading(false);
        }
    }

    function handlePhotoChange(file: File | null) {
        if (!file) {
            setPhotoFile(null);
            return;
        }

        if (!allowedImageTypes.has(file.type)) {
            setNotice({ tone: "error", message: "Profile images must be JPG, PNG, or WebP." });
            return;
        }

        if (file.size > maxProfileImageBytes) {
            setNotice({ tone: "error", message: "Profile image must be 4 MB or smaller." });
            return;
        }

        setNotice(null);
        setPhotoFile(file);
    }

    async function submit(event: FormEvent) {
        event.preventDefault();

        if (!canManageTeam) return;

        const validationMessage = validateForm();

        if (validationMessage) {
            setNotice({ tone: "error", message: validationMessage });
            return;
        }

        setSubmitting(true);
        setNotice(null);

        try {
            const upload = await uploadAdminBarberProfileImage(photoFile as File);
            await createAdminTeamBarber({
                displayName: displayName.trim(),
                email: email.trim(),
                phoneE164: phoneE164.trim(),
                profileImageUrl: upload.url,
                profileImagePathname: upload.pathname,
                locationIds,
                weeklyShifts: weeklyShifts.map((shift) => ({
                    locationId: shift.locationId,
                    dayOfWeek: shift.dayOfWeek,
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    effectiveFrom: shift.effectiveFrom || null,
                    effectiveTo: shift.effectiveTo || null,
                })),
            });
            resetForm();
            await refresh();
            await onChanged?.();
            setNotice({ tone: "success", message: "Barber created and added to booking." });
        } catch (error) {
            setNotice({ tone: "error", message: error instanceof Error ? error.message : "Barber could not be created." });
        } finally {
            setSubmitting(false);
        }
    }

    async function deactivate(barber: AdminTeamBarber) {
        if (barber.futureConfirmedBookingCount > 0) {
            setNotice({ tone: "error", message: "Cancel or reschedule future bookings before removing this barber." });
            return;
        }

        const confirmed = await confirm({
            title: `Remove ${barber.displayName} from booking?`,
            description: "They stop appearing for new customer bookings. Their past bookings and history stay intact.",
            confirmLabel: "Remove",
            tone: "danger",
        });
        if (!confirmed) {
            return;
        }

        setDeactivatingId(barber.id);
        setNotice(null);

        try {
            await deactivateAdminTeamBarber(barber.id);
            await refresh();
            await onChanged?.();
            setNotice({ tone: "success", message: "Barber removed from future booking." });
        } catch (error) {
            setNotice({ tone: "error", message: error instanceof Error ? error.message : "Barber could not be removed." });
        } finally {
            setDeactivatingId("");
        }
    }

    function validateForm() {
        if (!displayName.trim()) return "Display name is required.";
        if (!email.trim() || !email.includes("@")) return "Valid email is required.";
        if (!photoFile) return "Profile image upload is required.";
        if (locationIds.length === 0) return "At least one location is required.";
        if (weeklyShifts.length === 0) return "At least one weekly shift is required.";

        for (const shift of weeklyShifts) {
            if (!locationIds.includes(shift.locationId)) return "Weekly shifts must use selected locations.";
            if (!isQuarterHour(shift.startTime) || !isQuarterHour(shift.endTime)) return "Weekly shift times must use 15-minute increments.";
            if (shift.startTime >= shift.endTime) return "Weekly shift start time must be before end time.";
        }

        return "";
    }

    function resetForm() {
        setDisplayName("");
        setEmail("");
        setPhoneE164("");
        setPhotoFile(null);
        setLocationIds(locations[0] ? [locations[0].id] : []);
        setWeeklyShifts(locations[0] ? [defaultShift(locations[0].id)] : []);
    }

    if (!canManageTeam) {
        return (
            <TeamPanel>
                <div className="flex items-center gap-3 text-sm font-black text-red-700">
                    <UsersRound size={18} />
                    Owner or admin access is required.
                </div>
            </TeamPanel>
        );
    }

    return (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-forest/10 bg-white p-4">
                    <div>
                        <p className="text-sm font-black uppercase tracking-[0.14em] text-charcoal/70">Team</p>
                        <h2 className="text-2xl font-black text-forest">{team.length} active barber{team.length === 1 ? "" : "s"}</h2>
                    </div>
                    <button className="icon-button" type="button" onClick={refresh} title="Refresh team" aria-label="Refresh team">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
                {notice && <TeamNotice notice={notice} onClear={() => setNotice(null)} />}
                {loading ? (
                    <TeamPanel>
                        <InlineLoading label="Loading team" />
                    </TeamPanel>
                ) : team.length === 0 ? (
                    <TeamPanel>
                        <EmptyState label="No active barbers." />
                    </TeamPanel>
                ) : (
                    <div className="grid gap-3">
                        {team.map((barber) => (
                            <TeamBarberRow
                                key={barber.id}
                                barber={barber}
                                locationsById={locationsById}
                                onDeactivate={deactivate}
                                deactivating={deactivatingId === barber.id}
                            />
                        ))}
                    </div>
                )}
            </section>
            <TeamPanel>
                <form onSubmit={submit} className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Plus size={18} className="text-forest" />
                        <h2 className="text-xl font-black text-forest">Add barber</h2>
                    </div>
                    <PhotoPicker previewUrl={photoPreview} onChange={handlePhotoChange} />
                    <TeamField label="Display name">
                        <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
                    </TeamField>
                    <TeamField label="Email invite">
                        <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                    </TeamField>
                    <TeamField label="Phone (optional)">
                        <input className="input" value={phoneE164} onChange={(event) => setPhoneE164(event.target.value)} placeholder="+16475550123" />
                    </TeamField>
                    <LocationSelector locations={locations} value={locationIds} onChange={setLocationIds} />
                    <WeeklyShiftEditor
                        shifts={weeklyShifts}
                        selectedLocationIds={locationIds}
                        locationsById={locationsById}
                        onChange={setWeeklyShifts}
                    />
                    <button className="primary-button w-full" type="submit" disabled={submitting || loading}>
                        {submitting ? "Creating barber" : "Create barber"}
                    </button>
                </form>
            </TeamPanel>
        </section>
    );
}

function TeamBarberRow({
    barber,
    locationsById,
    onDeactivate,
    deactivating,
}: {
    barber: AdminTeamBarber;
    locationsById: Map<string, AdminLocationOption>;
    onDeactivate: (barber: AdminTeamBarber) => void;
    deactivating: boolean;
}) {
    const photoUrl = getAdminBarberPhotoUrl(barber);
    const accountLabel = !barber.user ? "No account" : barber.user.active ? "Login active" : "Invite pending";
    const removalBlocked = barber.futureConfirmedBookingCount > 0;

    return (
        <article className="grid gap-3 rounded-md border border-forest/10 bg-white p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            {photoUrl ? (
                <img src={photoUrl} alt={barber.displayName} className="size-16 rounded-md object-cover" />
            ) : (
                <span className="flex size-16 items-center justify-center rounded-md bg-[#d9efe1] text-lg font-black text-forest">
                    {initials(barber.displayName)}
                </span>
            )}
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-xl font-black text-forest">{barber.displayName}</h3>
                    <span className="rounded-full bg-[#eef5f1] px-2.5 py-1 text-xs font-black text-charcoal/65">{accountLabel}</span>
                </div>
                <p className="truncate text-sm font-semibold text-charcoal/60">{barber.email}</p>
                <div className="flex flex-wrap gap-1.5 text-xs font-bold text-charcoal/60">
                    {barber.locationIds.map((locationId) => (
                        <span key={locationId} className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-1">
                            <MapPin size={12} />
                            {locationsById.get(locationId)?.name ?? "Location"}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-1">
                        <Clock3 size={12} />
                        {formatWeeklyShiftSummary(barber.weeklyShifts)}
                    </span>
                </div>
                {removalBlocked && (
                    <p className="text-xs font-bold text-red-700">
                        {barber.futureConfirmedBookingCount} future booking{barber.futureConfirmedBookingCount === 1 ? "" : "s"} must be rescheduled or cancelled first.
                    </p>
                )}
            </div>
            <button
                className="danger-button min-w-32 justify-center"
                type="button"
                disabled={deactivating || removalBlocked}
                onClick={() => onDeactivate(barber)}
                title={removalBlocked ? "Future bookings block removal" : "Remove barber"}
            >
                <Trash2 size={16} />
                {deactivating ? "Removing" : "Remove"}
            </button>
        </article>
    );
}

function PhotoPicker({
    previewUrl,
    onChange,
}: {
    previewUrl: string;
    onChange: (file: File | null) => void;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
            <div className="flex size-24 items-center justify-center overflow-hidden rounded-md border border-forest/10 bg-cream">
                {previewUrl ? (
                    <img src={previewUrl} alt="Profile preview" className="h-full w-full object-cover" />
                ) : (
                    <ImagePlus size={28} className="text-forest" />
                )}
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-forest/10 bg-white px-4 py-3 text-sm font-black text-forest hover:border-green">
                <UploadCloud size={18} />
                Upload photo
                <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => onChange(event.target.files?.[0] ?? null)}
                />
            </label>
        </div>
    );
}

function LocationSelector({
    locations,
    value,
    onChange,
}: {
    locations: AdminLocationOption[];
    value: string[];
    onChange: (value: string[]) => void;
}) {
    return (
        <div>
            <p className="mb-2 text-sm font-bold text-charcoal/70">Locations</p>
            <div className="grid gap-2">
                {locations.map((location) => {
                    const selected = value.includes(location.id);
                    return (
                        <label key={location.id} className="flex items-center justify-between gap-3 rounded-md border border-forest/10 bg-cream px-3 py-2 text-sm font-bold text-charcoal/75">
                            <span>{location.name}</span>
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) => {
                                    onChange(
                                        event.target.checked
                                            ? [...value, location.id]
                                            : value.filter((locationId) => locationId !== location.id),
                                    );
                                }}
                            />
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

function WeeklyShiftEditor({
    shifts,
    selectedLocationIds,
    locationsById,
    onChange,
}: {
    shifts: ShiftDraft[];
    selectedLocationIds: string[];
    locationsById: Map<string, AdminLocationOption>;
    onChange: (value: ShiftDraft[]) => void;
}) {
    function updateShift(index: number, patch: Partial<ShiftDraft>) {
        onChange(shifts.map((shift, shiftIndex) => (shiftIndex === index ? { ...shift, ...patch } : shift)));
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-charcoal/70">Weekly hours</p>
                <button
                    className="icon-button !min-h-10 !w-10"
                    type="button"
                    title="Add weekly hours"
                    aria-label="Add weekly hours"
                    disabled={selectedLocationIds.length === 0}
                    onClick={() => onChange([...shifts, defaultShift(selectedLocationIds[0])])}
                >
                    <Plus size={16} />
                </button>
            </div>
            <div className="grid gap-2">
                {shifts.map((shift, index) => (
                    <div key={`${shift.dayOfWeek}-${index}`} className="grid gap-2 rounded-md border border-forest/10 bg-cream p-2 sm:grid-cols-[0.8fr_1fr_0.9fr_0.9fr_auto]">
                        <select className="input !min-h-11 !py-2 text-sm" value={shift.dayOfWeek} onChange={(event) => updateShift(index, { dayOfWeek: Number(event.target.value) })}>
                            {weeklyDisplayOrder.map((day) => <option key={day} value={day}>{weekdays[day]}</option>)}
                        </select>
                        <select className="input !min-h-11 !py-2 text-sm" value={shift.locationId} onChange={(event) => updateShift(index, { locationId: event.target.value })}>
                            {selectedLocationIds.map((locationId) => (
                                <option key={locationId} value={locationId}>{locationsById.get(locationId)?.name ?? "Location"}</option>
                            ))}
                        </select>
                        <input className="input !min-h-11 !py-2 text-sm" type="time" step="900" value={shift.startTime} onChange={(event) => updateShift(index, { startTime: event.target.value })} />
                        <input className="input !min-h-11 !py-2 text-sm" type="time" step="900" value={shift.endTime} onChange={(event) => updateShift(index, { endTime: event.target.value })} />
                        <button
                            className="icon-button !min-h-11 !w-11"
                            type="button"
                            title="Remove weekly hours"
                            aria-label="Remove weekly hours"
                            disabled={shifts.length === 1}
                            onClick={() => onChange(shifts.filter((_, shiftIndex) => shiftIndex !== index))}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TeamPanel({ children }: { children: ReactNode }) {
    return <section className="rounded-md border border-forest/10 bg-white p-4">{children}</section>;
}

function TeamField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block text-sm font-bold text-charcoal/70">
            <span className="mb-1 block">{label}</span>
            {children}
        </label>
    );
}

function TeamNotice({ notice, onClear }: { notice: NonNullable<TeamNotice>; onClear: () => void }) {
    return (
        <div className={`flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm font-bold ${notice.tone === "success" ? "bg-mint text-forest" : "bg-red-50 text-red-700"}`}>
            <span>{notice.message}</span>
            <button type="button" onClick={onClear} className="font-black">Dismiss</button>
        </div>
    );
}

function InlineLoading({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-black text-forest">
            <RefreshCw size={16} className="animate-spin" />
            {label}
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return <p className="text-sm font-bold text-charcoal/60">{label}</p>;
}

function defaultShift(locationId: string): ShiftDraft {
    return {
        locationId,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "18:00",
        effectiveFrom: "",
        effectiveTo: "",
    };
}

function isQuarterHour(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    return Number.isInteger(hours) && Number.isInteger(minutes) && minutes % 15 === 0;
}

function formatWeeklyShiftSummary(shifts: AdminTeamWeeklyShift[]) {
    if (shifts.length === 0) return "No hours";

    const activeShifts = shifts.filter((shift) => shift.active !== false);
    return `${activeShifts.length} weekly window${activeShifts.length === 1 ? "" : "s"}`;
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}
