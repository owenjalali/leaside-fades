import { useEffect, useMemo, useState } from "react";
import {
    Ban,
    CalendarDays,
    Clock,
    Copy,
    Edit3,
    Plus,
    RefreshCw,
    Trash2,
    X,
} from "lucide-react";

import {
    createAdminBlockedTime,
    createAdminShift,
    createAdminShiftOverride,
    deactivateAdminShift,
    deleteAdminBlockedTime,
    deleteAdminShiftOverride,
    fetchAdminSchedule,
    updateAdminBlockedTime,
    updateAdminShift,
    updateAdminShiftOverride,
} from "./api";
import {
    addDaysToLocalDate,
    buildBlockedTimePayload,
    formatLocalDateTime,
    formatScheduleWindow,
    groupShiftsByBarberAndWeekday,
    todayLocalDate,
} from "./admin-utils";
import type {
    AdminBarberOption,
    AdminBlockedTime,
    AdminBlockedTimeScope,
    AdminLocationOption,
    AdminSchedule,
    AdminShift,
    AdminShiftOverride,
    AdminShiftOverrideType,
    BlockedTimeFormInput,
    SafeAdminUser,
} from "./types";

type ScheduleMode = "shifts" | "blocked";
type ScheduleNotice = { tone: "success" | "error"; message: string } | null;

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulePage({
    mode,
    user,
}: {
    mode: ScheduleMode;
    user: SafeAdminUser;
}) {
    const [schedule, setSchedule] = useState<AdminSchedule | null>(null);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<ScheduleNotice>(null);
    const [filters, setFilters] = useState({
        from: todayLocalDate(),
        to: addDaysToLocalDate(todayLocalDate(), 30),
    });

    async function refresh() {
        setLoading(true);
        try {
            setSchedule(await fetchAdminSchedule(filters));
        } catch (error) {
            setNotice({ tone: "error", message: error instanceof Error ? error.message : "Schedule failed to load." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.from, filters.to]);

    async function afterMutation(message: string) {
        setNotice({ tone: "success", message });
        await refresh();
    }

    if (!schedule && loading) {
        return <Panel><InlineLoading label="Loading schedule" /></Panel>;
    }

    if (!schedule) {
        return <Panel><EmptyState label="Schedule is unavailable." /></Panel>;
    }

    return (
        <section className="space-y-4">
            <section className="flex flex-col gap-3 rounded-md border border-forest/10 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <DateField label="From" value={filters.from} onChange={(from) => setFilters((value) => ({ ...value, from }))} />
                    <DateField label="To" value={filters.to} onChange={(to) => setFilters((value) => ({ ...value, to }))} />
                </div>
                <button className="icon-button" onClick={refresh} title="Refresh schedule">
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
            </section>
            {notice && <Notice notice={notice} onClear={() => setNotice(null)} />}
            {mode === "shifts" ? (
                <ShiftWorkspace schedule={schedule} user={user} onChanged={afterMutation} />
            ) : (
                <BlockedTimeWorkspace schedule={schedule} user={user} onChanged={afterMutation} />
            )}
        </section>
    );
}

function ShiftWorkspace({
    schedule,
    user,
    onChanged,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    onChanged: (message: string) => Promise<void>;
}) {
    const [barberFilter, setBarberFilter] = useState(user.role === "barber" ? user.barberId ?? "" : "");
    const [locationFilter, setLocationFilter] = useState("");
    const [shiftDraft, setShiftDraft] = useState<AdminShift | null>(null);
    const [overrideDraft, setOverrideDraft] = useState<AdminShiftOverride | null>(null);
    const [notice, setNotice] = useState("");
    const canManageShifts = user.role === "owner" || user.role === "admin";

    const shifts = schedule.shifts.filter((shift) =>
        (!barberFilter || shift.barberId === barberFilter) &&
        (!locationFilter || shift.locationId === locationFilter),
    );
    const overrides = schedule.shiftOverrides.filter((override) =>
        (!barberFilter || override.barberId === barberFilter) &&
        (!locationFilter || override.locationId === locationFilter),
    );

    async function submitShift(input: ShiftFormResult) {
        try {
            if (input.editingShiftId) {
                await updateAdminShift(input.editingShiftId, input.shifts[0]);
                await onChanged("Shift updated.");
            } else {
                for (const shift of input.shifts) {
                    await createAdminShift(shift);
                }
                await onChanged(input.shifts.length > 1 ? "Split shifts created." : "Shift created.");
            }
            setShiftDraft(null);
            setNotice("");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Shift could not be saved.");
        }
    }

    async function deactivate(shift: AdminShift) {
        if (!window.confirm("Deactivate this shift?")) return;
        try {
            await deactivateAdminShift(shift.id);
            await onChanged("Shift deactivated.");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Shift could not be deactivated.");
        }
    }

    async function submitOverride(input: Record<string, unknown>, editingId?: string) {
        try {
            if (editingId) {
                await updateAdminShiftOverride(editingId, input);
                await onChanged("Override updated.");
            } else {
                await createAdminShiftOverride(input);
                await onChanged("Override created.");
            }
            setOverrideDraft(null);
            setNotice("");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Override could not be saved.");
        }
    }

    async function removeOverride(override: AdminShiftOverride) {
        if (!window.confirm("Delete this override?")) return;
        try {
            await deleteAdminShiftOverride(override.id);
            await onChanged("Override deleted.");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Override could not be deleted.");
        }
    }

    return (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <section className="space-y-4">
                <Panel>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <SelectMini value={barberFilter} onChange={setBarberFilter} label="Barber">
                                <option value="">All barbers</option>
                                {schedule.barbers.map((barber) => (
                                    <option key={barber.id} value={barber.id}>{barber.displayName}</option>
                                ))}
                            </SelectMini>
                            <SelectMini value={locationFilter} onChange={setLocationFilter} label="Location">
                                <option value="">All locations</option>
                                {schedule.locations.map((location) => (
                                    <option key={location.id} value={location.id}>{location.name}</option>
                                ))}
                            </SelectMini>
                        </div>
                        {canManageShifts && (
                            <button className="icon-text-button" onClick={() => setShiftDraft(emptyShift(schedule, user))}>
                                <Plus size={16} />
                                New shift
                            </button>
                        )}
                    </div>
                </Panel>
                {notice && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{notice}</p>}
                <RecurringShiftGrid
                    shifts={shifts}
                    schedule={schedule}
                    canManage={canManageShifts}
                    onEdit={setShiftDraft}
                    onDuplicate={(shift) => setShiftDraft({ ...shift, id: "" })}
                    onDeactivate={deactivate}
                />
                <OverrideList
                    overrides={overrides}
                    schedule={schedule}
                    canManage={canManageShifts}
                    onEdit={setOverrideDraft}
                    onDelete={removeOverride}
                />
            </section>
            {canManageShifts && (
                <aside className="space-y-4">
                    <Panel>
                        <ShiftForm
                            key={shiftDraft?.id ?? "create-shift"}
                            schedule={schedule}
                            user={user}
                            draft={shiftDraft}
                            onSubmit={submitShift}
                            onClear={() => setShiftDraft(null)}
                        />
                    </Panel>
                    <Panel>
                        <ShiftOverrideForm
                            key={overrideDraft?.id ?? "create-override"}
                            schedule={schedule}
                            draft={overrideDraft}
                            onSubmit={submitOverride}
                            onClear={() => setOverrideDraft(null)}
                        />
                    </Panel>
                </aside>
            )}
        </div>
    );
}

function RecurringShiftGrid({
    shifts,
    schedule,
    canManage,
    onEdit,
    onDuplicate,
    onDeactivate,
}: {
    shifts: AdminShift[];
    schedule: AdminSchedule;
    canManage: boolean;
    onEdit: (shift: AdminShift) => void;
    onDuplicate: (shift: AdminShift) => void;
    onDeactivate: (shift: AdminShift) => void;
}) {
    const grouped = useMemo(() => groupShiftsByBarberAndWeekday(shifts), [shifts]);

    if (shifts.length === 0) {
        return <Panel><EmptyState label="No recurring shifts match these filters." /></Panel>;
    }

    return (
        <section className="space-y-3">
            {schedule.barbers
                .filter((barber) => grouped[barber.id])
                .map((barber) => (
                    <Panel key={barber.id}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-black text-forest">{barber.displayName}</h2>
                        </div>
                        <div className="grid gap-px overflow-hidden rounded-md border border-forest/10 bg-forest/10 md:grid-cols-7">
                            {weekdays.map((day, dayOfWeek) => (
                                <div key={`${barber.id}-${day}`} className="min-h-32 bg-white p-3">
                                    <p className="mb-2 text-sm font-black text-forest">{day}</p>
                                    <div className="space-y-2">
                                        {(grouped[barber.id][dayOfWeek] ?? []).map((shift) => (
                                            <ShiftChip
                                                key={shift.id}
                                                shift={shift}
                                                schedule={schedule}
                                                canManage={canManage}
                                                onEdit={() => onEdit(shift)}
                                                onDuplicate={() => onDuplicate(shift)}
                                                onDeactivate={() => onDeactivate(shift)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                ))}
        </section>
    );
}

function ShiftChip({
    shift,
    schedule,
    canManage,
    onEdit,
    onDuplicate,
    onDeactivate,
}: {
    shift: AdminShift;
    schedule: AdminSchedule;
    canManage: boolean;
    onEdit: () => void;
    onDuplicate: () => void;
    onDeactivate: () => void;
}) {
    const location = schedule.locations.find((candidate) => candidate.id === shift.locationId);

    return (
        <div className="rounded-md border border-forest/10 bg-cream p-2 text-sm">
            <p className="font-black text-forest">{formatScheduleWindow(shift.startTime, shift.endTime)}</p>
            <p className="truncate text-xs text-charcoal/60">{location?.name ?? "Location"}</p>
            {(shift.effectiveFrom || shift.effectiveTo) && (
                <p className="mt-1 text-xs text-charcoal/60">{shift.effectiveFrom ?? "Any"} to {shift.effectiveTo ?? "Any"}</p>
            )}
            {canManage && (
                <div className="mt-2 flex gap-1">
                    <IconMini title="Edit shift" onClick={onEdit}><Edit3 size={14} /></IconMini>
                    <IconMini title="Duplicate shift" onClick={onDuplicate}><Copy size={14} /></IconMini>
                    <IconMini title="Deactivate shift" onClick={onDeactivate}><Trash2 size={14} /></IconMini>
                </div>
            )}
        </div>
    );
}

type ShiftFormResult = { editingShiftId?: string; shifts: Array<Record<string, unknown>> };

function ShiftForm({
    schedule,
    user,
    draft,
    onSubmit,
    onClear,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    draft: AdminShift | null;
    onSubmit: (input: ShiftFormResult) => Promise<void>;
    onClear: () => void;
}) {
    const initial = draft ?? emptyShift(schedule, user);
    const [barberId, setBarberId] = useState(initial.barberId);
    const [locationId, setLocationId] = useState(initial.locationId);
    const [dayOfWeek, setDayOfWeek] = useState(String(initial.dayOfWeek));
    const [effectiveFrom, setEffectiveFrom] = useState(initial.effectiveFrom ?? "");
    const [effectiveTo, setEffectiveTo] = useState(initial.effectiveTo ?? "");
    const [windows, setWindows] = useState([{ startTime: initial.startTime, endTime: initial.endTime }]);
    const editingShiftId = draft?.id || undefined;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        await onSubmit({
            editingShiftId,
            shifts: windows.map((window) => ({
                barberId,
                locationId,
                dayOfWeek: Number(dayOfWeek),
                startTime: window.startTime,
                endTime: window.endTime,
                effectiveFrom,
                effectiveTo,
            })),
        });
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <FormHeading icon={<Clock size={18} />} title={editingShiftId ? "Edit shift" : "Recurring shift"} />
            <Field label="Barber">
                <select className="input" value={barberId} onChange={(event) => setBarberId(event.target.value)} disabled={user.role === "barber"}>
                    {schedule.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.displayName}</option>)}
                </select>
            </Field>
            <Field label="Location">
                <select className="input" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                    {schedule.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
            </Field>
            <Field label="Weekday">
                <select className="input" value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)}>
                    {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
            </Field>
            <div className="grid gap-2">
                {windows.map((window, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input className="input" type="time" step="900" value={window.startTime} onChange={(event) => setWindows(updateWindow(windows, index, "startTime", event.target.value))} required />
                        <input className="input" type="time" step="900" value={window.endTime} onChange={(event) => setWindows(updateWindow(windows, index, "endTime", event.target.value))} required />
                        <button className="icon-button" type="button" onClick={() => setWindows(windows.filter((_, item) => item !== index))} disabled={windows.length === 1} title="Remove window">
                            <X size={16} />
                        </button>
                    </div>
                ))}
                {!editingShiftId && (
                    <button className="text-button justify-self-start" type="button" onClick={() => setWindows([...windows, { startTime: "14:00", endTime: "19:00" }])}>
                        Add split window
                    </button>
                )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Effective from">
                    <input className="input" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
                </Field>
                <Field label="Effective to">
                    <input className="input" type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
                </Field>
            </div>
            <div className="flex flex-wrap gap-2">
                <button className="primary-button" type="submit">{editingShiftId ? "Save shift" : "Create shift"}</button>
                {draft && <button className="text-button" type="button" onClick={onClear}>Clear</button>}
            </div>
        </form>
    );
}

function OverrideList({
    overrides,
    schedule,
    canManage,
    onEdit,
    onDelete,
}: {
    overrides: AdminShiftOverride[];
    schedule: AdminSchedule;
    canManage: boolean;
    onEdit: (override: AdminShiftOverride) => void;
    onDelete: (override: AdminShiftOverride) => void;
}) {
    return (
        <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-forest">One-off overrides</h2>
            </div>
            {overrides.length === 0 ? (
                <EmptyState label="No one-off overrides match these filters." />
            ) : (
                <div className="grid gap-2">
                    {overrides.map((override) => (
                        <div key={override.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-forest/10 bg-cream p-3 text-sm">
                            <div>
                                <p className="font-black text-forest">{override.overrideDate} - {formatOverrideType(override.overrideType)}</p>
                                <p className="text-charcoal/60">
                                    {barberName(schedule, override.barberId)}
                                    {override.locationId ? ` at ${locationName(schedule, override.locationId)}` : ""}
                                    {override.startTime && override.endTime ? ` - ${formatScheduleWindow(override.startTime, override.endTime)}` : ""}
                                </p>
                            </div>
                            {canManage && (
                                <div className="flex gap-1">
                                    <IconMini title="Edit override" onClick={() => onEdit(override)}><Edit3 size={14} /></IconMini>
                                    <IconMini title="Delete override" onClick={() => onDelete(override)}><Trash2 size={14} /></IconMini>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Panel>
    );
}

function ShiftOverrideForm({
    schedule,
    draft,
    onSubmit,
    onClear,
}: {
    schedule: AdminSchedule;
    draft: AdminShiftOverride | null;
    onSubmit: (input: Record<string, unknown>, editingId?: string) => Promise<void>;
    onClear: () => void;
}) {
    const [barberId, setBarberId] = useState(draft?.barberId ?? schedule.barbers[0]?.id ?? "");
    const [locationId, setLocationId] = useState(draft?.locationId ?? schedule.locations[0]?.id ?? "");
    const [overrideDate, setOverrideDate] = useState(draft?.overrideDate ?? todayLocalDate());
    const [overrideType, setOverrideType] = useState<AdminShiftOverrideType>(draft?.overrideType ?? "add");
    const [startTime, setStartTime] = useState(draft?.startTime ?? "10:00");
    const [endTime, setEndTime] = useState(draft?.endTime ?? "12:00");
    const [reason, setReason] = useState(draft?.reason ?? "");

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        await onSubmit({
            barberId,
            locationId: overrideType === "not_working" ? locationId || undefined : locationId,
            overrideDate,
            overrideType,
            startTime: overrideType === "not_working" ? undefined : startTime,
            endTime: overrideType === "not_working" ? undefined : endTime,
            reason,
        }, draft?.id || undefined);
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <FormHeading icon={<CalendarDays size={18} />} title={draft ? "Edit override" : "One-off override"} />
            <Field label="Barber">
                <select className="input" value={barberId} onChange={(event) => setBarberId(event.target.value)}>
                    {schedule.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.displayName}</option>)}
                </select>
            </Field>
            <Field label="Date">
                <input className="input" type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} />
            </Field>
            <Segmented value={overrideType} values={["add", "remove", "not_working"]} onChange={(value) => setOverrideType(value as AdminShiftOverrideType)} />
            {overrideType !== "not_working" && (
                <>
                    <Field label="Location">
                        <select className="input" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                            {schedule.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                    </Field>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Start"><input className="input" type="time" step="900" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
                        <Field label="End"><input className="input" type="time" step="900" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field>
                    </div>
                </>
            )}
            <Field label="Reason">
                <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
                <button className="primary-button" type="submit">{draft ? "Save override" : "Create override"}</button>
                {draft && <button className="text-button" type="button" onClick={onClear}>Clear</button>}
            </div>
        </form>
    );
}

function BlockedTimeWorkspace({
    schedule,
    user,
    onChanged,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    onChanged: (message: string) => Promise<void>;
}) {
    const [draft, setDraft] = useState<AdminBlockedTime | null>(null);
    const [notice, setNotice] = useState("");

    async function submit(input: BlockedTimeFormInput, editingId?: string) {
        try {
            const payload = buildBlockedTimePayload(input);
            if (editingId) {
                await updateAdminBlockedTime(editingId, payload);
                await onChanged("Blocked time updated.");
            } else {
                await createAdminBlockedTime(payload);
                await onChanged("Blocked time created.");
            }
            setDraft(null);
            setNotice("");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Blocked time could not be saved.");
        }
    }

    async function remove(blockedTime: AdminBlockedTime) {
        if (!window.confirm("Delete this blocked time?")) return;
        try {
            await deleteAdminBlockedTime(blockedTime.id);
            await onChanged("Blocked time deleted.");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Blocked time could not be deleted.");
        }
    }

    return (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <section className="space-y-4">
                {notice && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{notice}</p>}
                <BlockedTimeList schedule={schedule} user={user} onEdit={setDraft} onDelete={remove} />
            </section>
            <aside>
                <Panel>
                    <BlockedTimeForm
                        key={draft?.id ?? "create-blocked-time"}
                        schedule={schedule}
                        user={user}
                        draft={draft}
                        onSubmit={submit}
                        onClear={() => setDraft(null)}
                    />
                </Panel>
            </aside>
        </div>
    );
}

function BlockedTimeList({
    schedule,
    user,
    onEdit,
    onDelete,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    onEdit: (blockedTime: AdminBlockedTime) => void;
    onDelete: (blockedTime: AdminBlockedTime) => void;
}) {
    if (schedule.blockedTimes.length === 0) {
        return <Panel><EmptyState label="No blocked time is scheduled in this range." /></Panel>;
    }

    return (
        <Panel>
            <div className="grid gap-2">
                {schedule.blockedTimes.map((blockedTime) => {
                    const canMutate = user.role === "owner" || user.role === "admin" ||
                        (blockedTime.scope === "barber" && blockedTime.barberId === user.barberId);

                    return (
                        <div key={blockedTime.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-forest/10 bg-cream p-3 text-sm">
                            <div>
                                <p className="font-black text-forest">{formatBlockedScope(blockedTime.scope)}</p>
                                <p className="text-charcoal/70">{formatLocalDateTime(blockedTime.startTime)} to {formatLocalDateTime(blockedTime.endTime)}</p>
                                <p className="text-charcoal/60">
                                    {blockedTime.scope === "barber" ? barberName(schedule, blockedTime.barberId ?? "") : ""}
                                    {blockedTime.scope === "location" ? locationName(schedule, blockedTime.locationId ?? "") : ""}
                                    {blockedTime.reason ? ` - ${blockedTime.reason}` : ""}
                                </p>
                            </div>
                            {canMutate && (
                                <div className="flex gap-1">
                                    <IconMini title="Edit blocked time" onClick={() => onEdit(blockedTime)}><Edit3 size={14} /></IconMini>
                                    <IconMini title="Delete blocked time" onClick={() => onDelete(blockedTime)}><Trash2 size={14} /></IconMini>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}

function BlockedTimeForm({
    schedule,
    user,
    draft,
    onSubmit,
    onClear,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    draft: AdminBlockedTime | null;
    onSubmit: (input: BlockedTimeFormInput, editingId?: string) => Promise<void>;
    onClear: () => void;
}) {
    const owner = user.role === "owner" || user.role === "admin";
    const [scope, setScope] = useState<AdminBlockedTimeScope>(draft?.scope ?? "barber");
    const [barberId, setBarberId] = useState(draft?.barberId ?? user.barberId ?? schedule.barbers[0]?.id ?? "");
    const [locationId, setLocationId] = useState(draft?.locationId ?? schedule.locations[0]?.id ?? "");
    const [startDate, setStartDate] = useState(draft ? localDateFromIso(draft.startTime) : todayLocalDate());
    const [startTime, setStartTime] = useState(draft ? localTimeFromIso(draft.startTime) : "12:00");
    const [endDate, setEndDate] = useState(draft ? localDateFromIso(draft.endTime) : todayLocalDate());
    const [endTime, setEndTime] = useState(draft ? localTimeFromIso(draft.endTime) : "13:00");
    const [allDay, setAllDay] = useState(false);
    const [reason, setReason] = useState(draft?.reason ?? "");

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        await onSubmit({
            scope,
            barberId: scope === "barber" ? barberId : undefined,
            locationId: scope === "location" || (scope === "barber" && locationId) ? locationId : undefined,
            startDate,
            startTime,
            endDate,
            endTime,
            allDay,
            reason,
        }, draft?.id || undefined);
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <FormHeading icon={<Ban size={18} />} title={draft ? "Edit blocked time" : "Blocked time"} />
            {owner ? (
                <Segmented value={scope} values={["barber", "location", "business"]} onChange={(value) => setScope(value as AdminBlockedTimeScope)} />
            ) : (
                <input type="hidden" value="barber" />
            )}
            {scope === "barber" && (
                <Field label="Barber">
                    <select className="input" value={barberId} onChange={(event) => setBarberId(event.target.value)} disabled={!owner}>
                        {schedule.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.displayName}</option>)}
                    </select>
                </Field>
            )}
            {(scope === "location" || scope === "barber") && (
                <Field label={scope === "barber" ? "Location optional" : "Location"}>
                    <select className="input" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                        {scope === "barber" && <option value="">All assigned locations</option>}
                        {schedule.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                </Field>
            )}
            <label className="flex items-center gap-2 text-sm font-bold text-charcoal/70">
                <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
                All day
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Start date"><input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
                {!allDay && <Field label="Start time"><input className="input" type="time" step="900" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>}
                {!allDay && <Field label="End date"><input className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>}
                {!allDay && <Field label="End time"><input className="input" type="time" step="900" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field>}
            </div>
            <Field label="Reason">
                <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
                <button className="primary-button" type="submit">{draft ? "Save blocked time" : "Create blocked time"}</button>
                {draft && <button className="text-button" type="button" onClick={onClear}>Clear</button>}
            </div>
        </form>
    );
}

function Panel({ children }: { children: React.ReactNode }) {
    return <section className="rounded-md border border-forest/10 bg-white p-4">{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block text-sm font-bold text-charcoal/70">
            <span className="mb-1 block">{label}</span>
            {children}
        </label>
    );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="flex items-center gap-2 text-sm font-bold text-charcoal/70">
            {label}
            <input className="input h-10 w-auto min-w-36" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}

function SelectMini({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
    return (
        <label className="flex items-center gap-2 text-sm font-bold text-charcoal/70">
            {label}
            <select className="input h-10 w-auto min-w-44" value={value} onChange={(event) => onChange(event.target.value)}>
                {children}
            </select>
        </label>
    );
}

function Segmented({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {values.map((item) => (
                <button
                    key={item}
                    type="button"
                    className={value === item ? "segmented-active" : "segmented"}
                    onClick={() => onChange(item)}
                >
                    {item.replace("_", " ")}
                </button>
            ))}
        </div>
    );
}

function IconMini({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" className="icon-button !h-8 !min-h-8 !w-8" title={title} onClick={onClick}>
            {children}
        </button>
    );
}

function FormHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
    return <h2 className="flex items-center gap-2 text-lg font-black text-forest">{icon}{title}</h2>;
}

function Notice({ notice, onClear }: { notice: NonNullable<ScheduleNotice>; onClear: () => void }) {
    return (
        <div className={`flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm font-bold ${notice.tone === "success" ? "bg-mint text-forest" : "bg-red-50 text-red-700"}`}>
            <span>{notice.message}</span>
            <button onClick={onClear} title="Dismiss"><X size={16} /></button>
        </div>
    );
}

function InlineLoading({ label }: { label: string }) {
    return <div className="flex items-center gap-2 text-sm font-bold text-charcoal/60"><RefreshCw size={16} className="animate-spin" />{label}</div>;
}

function EmptyState({ label }: { label: string }) {
    return <p className="text-sm text-charcoal/60">{label}</p>;
}

function emptyShift(schedule: AdminSchedule, user: SafeAdminUser): AdminShift {
    const barberId = user.role === "barber" && user.barberId ? user.barberId : schedule.barbers[0]?.id ?? "";
    const locationId = schedule.barbers.find((barber) => barber.id === barberId)?.locationIds[0] ?? schedule.locations[0]?.id ?? "";

    return {
        id: "",
        barberId,
        locationId,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "19:00",
        effectiveFrom: "",
        effectiveTo: "",
        active: true,
    };
}

function updateWindow<T extends { startTime: string; endTime: string }>(
    windows: T[],
    index: number,
    key: keyof T,
    value: string,
) {
    return windows.map((window, item) => item === index ? { ...window, [key]: value } : window);
}

function barberName(schedule: AdminSchedule, barberId: string) {
    return schedule.barbers.find((barber) => barber.id === barberId)?.displayName ?? "Barber";
}

function locationName(schedule: AdminSchedule, locationId: string) {
    return schedule.locations.find((location) => location.id === locationId)?.name ?? "Location";
}

function formatOverrideType(type: AdminShiftOverrideType) {
    return type === "not_working" ? "Not working" : type === "add" ? "Added shift" : "Removed time";
}

function formatBlockedScope(scope: AdminBlockedTimeScope) {
    return scope === "business" ? "Business closure" : scope === "location" ? "Location closure" : "Barber blocked time";
}

function localDateFromIso(value: string) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(value));
}

function localTimeFromIso(value: string) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(value));
}
