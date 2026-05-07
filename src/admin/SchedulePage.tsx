import { useEffect, useMemo, useState } from "react";
import {
    Ban,
    ChevronDown,
    Copy,
    Edit3,
    Plus,
    RefreshCw,
    Save,
    Search,
    Trash2,
    X,
} from "lucide-react";

import {
    createAdminBlockedTime,
    createAdminShift,
    deactivateAdminShift,
    deleteAdminBlockedTime,
    fetchAdminSchedule,
    updateAdminBlockedTime,
    updateAdminShift,
} from "./api";
import { getAdminBarberPhotoUrl } from "./barber-photos";
import {
    addDaysToLocalDate,
    buildWeeklyScheduleDraft,
    buildWeeklyScheduleSavePlan,
    buildBlockedTimePayload,
    calculateWeeklyScheduleHours,
    formatLocalDateTime,
    formatScheduleWindow,
    getWeeklyCopyTargetDayOptions,
    todayLocalDate,
} from "./admin-utils";
import type { DayScheduleDraft, ShiftWindowDraft, WeeklyScheduleDraft } from "./admin-utils";
import type {
    AdminBarberOption,
    AdminBlockedTime,
    AdminBlockedTimeScope,
    AdminSchedule,
    BlockedTimeFormInput,
    SafeAdminUser,
} from "./types";

type ScheduleMode = "shifts" | "blocked";
type ScheduleNotice = { tone: "success" | "error"; message: string } | null;

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weeklyDisplayOrder = [1, 2, 3, 4, 5, 6, 0];

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
            {mode === "blocked" && (
                <section className="flex flex-col gap-3 rounded-md border border-forest/10 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <DateField label="From" value={filters.from} onChange={(from) => setFilters((value) => ({ ...value, from }))} />
                        <DateField label="To" value={filters.to} onChange={(to) => setFilters((value) => ({ ...value, to }))} />
                    </div>
                    <button className="icon-button" onClick={refresh} title="Refresh schedule">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                </section>
            )}
            {notice && <Notice notice={notice} onClear={() => setNotice(null)} />}
            {mode === "shifts" ? (
                <ShiftWorkspace
                    schedule={schedule}
                    user={user}
                    loading={loading}
                    onRefresh={refresh}
                    onChanged={afterMutation}
                />
            ) : (
                <BlockedTimeWorkspace schedule={schedule} user={user} onChanged={afterMutation} />
            )}
        </section>
    );
}

function ShiftWorkspace({
    schedule,
    user,
    loading,
    onRefresh,
    onChanged,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    loading: boolean;
    onRefresh: () => Promise<void>;
    onChanged: (message: string) => Promise<void>;
}) {
    const visibleBarbers = useMemo(
        () => [...(user.role === "barber" ? schedule.barbers.filter((barber) => barber.id === user.barberId) : schedule.barbers)]
            .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        [schedule.barbers, user.barberId, user.role],
    );
    const initialBarberId = user.role === "barber" && user.barberId ? user.barberId : visibleBarbers[0]?.id ?? "";
    const [selectedBarberId, setSelectedBarberId] = useState(initialBarberId);
    const [staffSearch, setStaffSearch] = useState("");
    const [activeTab, setActiveTab] = useState<ShiftWorkspaceTab>("weekly");
    const [weeklyDraft, setWeeklyDraft] = useState<WeeklyScheduleDraft>(() =>
        buildWeeklyScheduleDraft(schedule, initialBarberId),
    );
    const [expandedDay, setExpandedDay] = useState(1);
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);
    const canManageShifts = user.role === "owner" || user.role === "admin";
    const selectedBarber = visibleBarbers.find((barber) => barber.id === selectedBarberId) ?? visibleBarbers[0];
    const savePlan = useMemo(
        () => buildWeeklyScheduleSavePlan(schedule, weeklyDraft),
        [schedule, weeklyDraft],
    );
    const weeklyHours = calculateWeeklyScheduleHours(weeklyDraft);
    const filteredBarbers = visibleBarbers.filter((barber) =>
        barber.displayName.toLowerCase().includes(staffSearch.trim().toLowerCase()),
    );

    useEffect(() => {
        if (!selectedBarber || selectedBarber.id === selectedBarberId) {
            return;
        }
        setSelectedBarberId(selectedBarber.id);
    }, [selectedBarber, selectedBarberId]);

    useEffect(() => {
        setWeeklyDraft(buildWeeklyScheduleDraft(schedule, selectedBarberId));
    }, [schedule, selectedBarberId]);

    function selectBarber(barberId: string) {
        if (barberId === selectedBarberId) {
            return;
        }
        if (savePlan.length > 0 && !window.confirm("Discard unsaved weekly schedule changes?")) {
            return;
        }
        setSelectedBarberId(barberId);
        setNotice("");
    }

    async function saveWeeklySchedule() {
        if (!weeklyDraft || savePlan.length === 0) {
            return;
        }

        try {
            setSaving(true);
            setNotice("");
            for (const operation of savePlan) {
                if (operation.type === "deactivate") {
                    await deactivateAdminShift(operation.shiftId);
                } else if (operation.type === "update") {
                    await updateAdminShift(operation.shiftId, operation.payload);
                } else {
                    await createAdminShift(operation.payload);
                }
            }
            await onChanged(savePlan.length === 1 ? "Weekly schedule saved." : `${savePlan.length} schedule changes saved.`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Weekly schedule could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="overflow-hidden rounded-md border border-forest/10 bg-white shadow-[0_18px_45px_rgba(7,17,14,0.06)]">
            <div className="grid min-h-[680px] lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="border-b border-forest/10 bg-[#f8faf7] p-4 lg:border-b-0 lg:border-r">
                    <div className="mb-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-charcoal/45">Select staff</p>
                        <label className="mt-3 flex h-11 items-center gap-2 rounded-md border border-forest/10 bg-white px-3 text-sm text-charcoal/55">
                            <Search size={16} />
                            <input
                                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-charcoal outline-none placeholder:text-charcoal/35"
                                value={staffSearch}
                                onChange={(event) => setStaffSearch(event.target.value)}
                                placeholder="Search staff..."
                            />
                        </label>
                    </div>
                    <div className="grid gap-2">
                        {filteredBarbers.map((barber) => {
                            const selected = barber.id === selectedBarberId;

                            return (
                                <button
                                    key={barber.id}
                                    className={`flex items-center gap-3 rounded-md p-3 text-left transition ${
                                        selected ? "bg-mint text-forest shadow-sm" : "text-charcoal hover:bg-white"
                                    }`}
                                    onClick={() => selectBarber(barber.id)}
                                >
                                    <StaffAvatar barber={barber} active={selected} />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-black">{barber.displayName}</span>
                                        <span className="block truncate text-xs font-bold text-charcoal/50">
                                            {barber.locationIds.map((id) => locationName(schedule, id)).join(", ") || "No location"}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                        {filteredBarbers.length === 0 && <EmptyState label="No staff match that search." />}
                    </div>
                </aside>

                <section className="flex min-w-0 flex-col">
                    <div className="border-b border-forest/10 px-4 py-4 sm:px-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <StaffAvatar barber={selectedBarber ?? { displayName: "Staff" }} active size="lg" />
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="truncate text-2xl font-black text-forest">{selectedBarber?.displayName ?? "Staff"}</h2>
                                        <span className="rounded-md bg-mint px-2 py-1 text-xs font-black text-forest">Active</span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {(selectedBarber?.locationIds ?? []).map((locationId) => (
                                            <LocationPill key={locationId} schedule={schedule} locationId={locationId} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] xl:min-w-[560px]">
                                <Metric label="Weekly hours" value={formatWeeklyHours(weeklyHours)} />
                                <div className="rounded-md border border-forest/10 bg-white p-3">
                                    <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-charcoal/45">Effective dates</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <input
                                            className="input !min-h-11 !py-2 text-sm"
                                            type="date"
                                            value={weeklyDraft.effectiveFrom}
                                            onChange={(event) => setWeeklyDraft({ ...weeklyDraft, effectiveFrom: event.target.value, effectiveDatesTouched: true })}
                                            disabled={!canManageShifts}
                                        />
                                        <input
                                            className="input !min-h-11 !py-2 text-sm"
                                            type="date"
                                            value={weeklyDraft.effectiveTo}
                                            onChange={(event) => setWeeklyDraft({ ...weeklyDraft, effectiveTo: event.target.value, effectiveDatesTouched: true })}
                                            disabled={!canManageShifts}
                                        />
                                    </div>
                                </div>
                                <button className="icon-button self-start" onClick={onRefresh} title="Refresh schedule">
                                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap gap-2">
                                <ShiftTabButton active={activeTab === "weekly"} onClick={() => setActiveTab("weekly")}>Weekly schedule</ShiftTabButton>
                                <ShiftTabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</ShiftTabButton>
                            </div>
                        </div>
                    </div>

                    {notice && <p className="mx-4 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700 sm:mx-5">{notice}</p>}

                    {activeTab === "weekly" && (
                        <WeeklyScheduleBuilder
                            draft={weeklyDraft}
                            schedule={schedule}
                            canManage={canManageShifts}
                            expandedDay={expandedDay}
                            onExpandedDay={setExpandedDay}
                            onDraftChange={setWeeklyDraft}
                            onDiscard={() => setWeeklyDraft(buildWeeklyScheduleDraft(schedule, selectedBarberId))}
                            onSave={saveWeeklySchedule}
                            saving={saving}
                            pendingChanges={savePlan.length}
                        />
                    )}

                    {activeTab === "overview" && (
                        <StaffScheduleOverview schedule={schedule} barbers={visibleBarbers} />
                    )}
                </section>
            </div>
        </div>
    );
}

type ShiftWorkspaceTab = "weekly" | "overview";

function WeeklyScheduleBuilder({
    draft,
    schedule,
    canManage,
    expandedDay,
    saving,
    pendingChanges,
    onExpandedDay,
    onDraftChange,
    onDiscard,
    onSave,
}: {
    draft: WeeklyScheduleDraft;
    schedule: AdminSchedule;
    canManage: boolean;
    expandedDay: number;
    saving: boolean;
    pendingChanges: number;
    onExpandedDay: (dayOfWeek: number) => void;
    onDraftChange: (draft: WeeklyScheduleDraft) => void;
    onDiscard: () => void;
    onSave: () => Promise<void>;
}) {
    const orderedDays = weeklyDisplayOrder.flatMap((dayOfWeek) => {
        const day = draft.days.find((candidate) => candidate.dayOfWeek === dayOfWeek);
        return day ? [day] : [];
    });

    function changeDay(dayOfWeek: number, updater: (day: DayScheduleDraft) => DayScheduleDraft) {
        onDraftChange({
            ...draft,
            days: draft.days.map((day) => day.dayOfWeek === dayOfWeek ? updater(day) : day),
        });
    }

    function setDayActive(dayOfWeek: number, active: boolean) {
        changeDay(dayOfWeek, (day) => ({
            ...day,
            active,
            windows: active
                ? day.windows.length > 0 ? day.windows : [defaultWindow(schedule, draft.barberId, dayOfWeek)]
                : [],
        }));
        onExpandedDay(dayOfWeek);
    }

    function updateWindow(dayOfWeek: number, index: number, patch: Partial<ShiftWindowDraft>) {
        changeDay(dayOfWeek, (day) => ({
            ...day,
            active: true,
            windows: day.windows.map((window, item) => item === index ? { ...window, ...patch } : window),
        }));
    }

    function addWindow(dayOfWeek: number) {
        changeDay(dayOfWeek, (day) => ({
            ...day,
            active: true,
            windows: [...day.windows, defaultWindow(schedule, draft.barberId, dayOfWeek, "15:00", "19:00")],
        }));
        onExpandedDay(dayOfWeek);
    }

    function removeWindow(dayOfWeek: number, index: number) {
        changeDay(dayOfWeek, (day) => {
            const windows = day.windows.filter((_, item) => item !== index);
            return { ...day, active: windows.length > 0, windows };
        });
    }

    function clearDay(dayOfWeek: number) {
        changeDay(dayOfWeek, (day) => ({ ...day, active: false, windows: [] }));
        onExpandedDay(dayOfWeek);
    }

    function copyDay(fromDayOfWeek: number, toDayOfWeek: number) {
        const source = draft.days.find((day) => day.dayOfWeek === fromDayOfWeek);
        if (!source) {
            return;
        }
        changeDay(toDayOfWeek, (day) => ({
            ...day,
            active: source.active,
            windows: source.active
                ? source.windows.map((window) => ({
                    ...window,
                    draftId: createDraftWindowId(toDayOfWeek),
                    shiftId: undefined,
                }))
                : [],
        }));
        onExpandedDay(toDayOfWeek);
    }

    return (
        <section className="flex flex-1 flex-col">
            <div className="overflow-x-auto px-4 py-4 sm:px-5">
                <div className="overflow-hidden rounded-md border border-forest/10">
                    <div className="grid grid-cols-[72px_minmax(0,1fr)_40px] border-b border-forest/10 bg-[#f8faf7] px-3 py-3 text-xs font-black uppercase tracking-[0.14em] text-charcoal/45 sm:px-4 md:grid-cols-[86px_minmax(0,1fr)_90px] xl:grid-cols-[86px_minmax(0,1fr)_150px]">
                        <span>Day</span>
                        <span>Working hours & location</span>
                        <span className="hidden text-right md:block">Actions</span>
                    </div>
                    {orderedDays.map((day) => (
                        <WeeklyDayRow
                            key={day.dayOfWeek}
                            day={day}
                            schedule={schedule}
                            canManage={canManage}
                            expanded={expandedDay === day.dayOfWeek}
                            onExpand={() => onExpandedDay(day.dayOfWeek)}
                            onActiveChange={(active) => setDayActive(day.dayOfWeek, active)}
                            onWindowChange={(index, patch) => updateWindow(day.dayOfWeek, index, patch)}
                            onAddWindow={() => addWindow(day.dayOfWeek)}
                            onRemoveWindow={(index) => removeWindow(day.dayOfWeek, index)}
                            onClearDay={() => clearDay(day.dayOfWeek)}
                            onCopyDay={(targetDay) => copyDay(day.dayOfWeek, targetDay)}
                        />
                    ))}
                </div>
            </div>
            <div className="mt-auto flex flex-col gap-3 border-t border-forest/10 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs font-bold text-charcoal/50">Weekly hours are calculated from this schedule and effective date range.</p>
                {canManage && (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button className="text-button !min-h-11 !px-3 !py-2" type="button" onClick={onDiscard} disabled={pendingChanges === 0 || saving}>
                            Discard
                        </button>
                        <button className="primary-button inline-flex !min-h-11 items-center gap-2 !px-4 !py-2" type="button" onClick={onSave} disabled={pendingChanges === 0 || saving}>
                            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            Save changes
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

function WeeklyDayRow({
    day,
    schedule,
    canManage,
    expanded,
    onExpand,
    onActiveChange,
    onWindowChange,
    onAddWindow,
    onRemoveWindow,
    onClearDay,
    onCopyDay,
}: {
    day: DayScheduleDraft;
    schedule: AdminSchedule;
    canManage: boolean;
    expanded: boolean;
    onExpand: () => void;
    onActiveChange: (active: boolean) => void;
    onWindowChange: (index: number, patch: Partial<ShiftWindowDraft>) => void;
    onAddWindow: () => void;
    onRemoveWindow: (index: number) => void;
    onClearDay: () => void;
    onCopyDay: (targetDay: number) => void;
}) {
    const copyTargetOptions = useMemo(() => getWeeklyCopyTargetDayOptions(day.dayOfWeek), [day.dayOfWeek]);
    const [copyTarget, setCopyTarget] = useState(String(copyTargetOptions[0]?.dayOfWeek ?? ""));

    return (
        <div className={`border-b border-forest/10 last:border-b-0 ${expanded ? "bg-mint/25" : "bg-white"}`}>
            <div className="grid grid-cols-[72px_minmax(0,1fr)_40px] gap-2 px-3 py-3 sm:gap-3 sm:px-4 md:grid-cols-[86px_minmax(0,1fr)_90px] xl:grid-cols-[86px_minmax(0,1fr)_150px]">
                <div className="flex items-start gap-2 pt-2">
                    <span className="w-9 text-sm font-black text-forest">{weekdays[day.dayOfWeek]}</span>
                    <ToggleSwitch checked={day.active} disabled={!canManage} onChange={onActiveChange} />
                </div>
                <div className="min-w-0">
                    {day.active ? (
                        <div className="grid gap-2">
                            {day.windows.map((window, index) => (
                                <div key={window.draftId} className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_36px] items-center gap-2 md:grid-cols-[130px_18px_130px_minmax(150px,1fr)_40px]">
                                    <input
                                        className="input min-w-0 !min-h-10 !py-2 text-sm"
                                        type="time"
                                        step="900"
                                        value={window.startTime}
                                        onChange={(event) => onWindowChange(index, { startTime: event.target.value })}
                                        disabled={!canManage}
                                    />
                                    <span className="text-center text-charcoal/35">-</span>
                                    <input
                                        className="input min-w-0 !min-h-10 !py-2 text-sm"
                                        type="time"
                                        step="900"
                                        value={window.endTime}
                                        onChange={(event) => onWindowChange(index, { endTime: event.target.value })}
                                        disabled={!canManage}
                                    />
                                    <select
                                        className="input order-5 col-span-4 min-w-0 !min-h-10 !py-2 text-sm md:order-none md:col-span-1"
                                        value={window.locationId}
                                        onChange={(event) => onWindowChange(index, { locationId: event.target.value })}
                                        disabled={!canManage}
                                    >
                                        {schedule.locations.map((location) => (
                                            <option key={location.id} value={location.id}>{locationName(schedule, location.id)}</option>
                                        ))}
                                    </select>
                                    {canManage ? (
                                        <IconMini className="order-4 md:order-none" title="Remove window" onClick={() => onRemoveWindow(index)}>
                                            <Trash2 size={14} />
                                        </IconMini>
                                    ) : (
                                        <span className="order-4 md:order-none" />
                                    )}
                                </div>
                            ))}
                            {canManage && (
                                <button className="text-button inline-flex !min-h-8 items-center gap-1.5 justify-self-start !px-2 !py-1 text-sm" type="button" onClick={onAddWindow}>
                                    <Plus size={14} />
                                    Add split
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-10 items-center text-sm font-bold text-charcoal/45">Not working</div>
                    )}
                    {expanded && canManage && (
                        <div className="mt-3 flex flex-col gap-2 rounded-md border border-forest/10 bg-white/90 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-[0.12em] text-charcoal/45">Copy hours to</span>
                                <select className="input !min-h-9 !w-auto !py-1 text-sm" value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>
                                    {copyTargetOptions.map((option) => (
                                        <option key={option.dayOfWeek} value={option.dayOfWeek}>{option.label}</option>
                                    ))}
                                </select>
                                <button
                                    className="icon-text-button !min-h-9 !px-2 !py-1 text-sm"
                                    type="button"
                                    onClick={() => onCopyDay(Number(copyTarget))}
                                    disabled={!copyTarget}
                                >
                                    <Copy size={14} />
                                    Apply
                                </button>
                            </div>
                            <button className="text-button inline-flex !min-h-9 items-center justify-center gap-1.5 !px-2 !py-1 text-sm text-red-700 hover:bg-red-50" type="button" onClick={onClearDay}>
                                <X size={14} />
                                Clear {weekdays[day.dayOfWeek]}
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex items-start justify-end gap-1 pt-1">
                    <IconMini title={expanded ? "Collapse options" : "Show options"} onClick={onExpand}>
                        <ChevronDown size={14} className={expanded ? "rotate-180 transition" : "transition"} />
                    </IconMini>
                </div>
            </div>
        </div>
    );
}

function StaffScheduleOverview({ schedule, barbers }: { schedule: AdminSchedule; barbers: AdminBarberOption[] }) {
    return (
        <section className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 2xl:grid-cols-3">
            {barbers.map((barber) => {
                const draft = buildWeeklyScheduleDraft(schedule, barber.id);
                const hours = calculateWeeklyScheduleHours(draft);
                const activeDays = draft.days.filter((day) => day.active);

                return (
                    <Panel key={barber.id}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <StaffAvatar barber={barber} active />
                                <div className="min-w-0">
                                    <h3 className="truncate text-base font-black text-forest">{barber.displayName}</h3>
                                    <p className="text-sm font-bold text-charcoal/55">{formatWeeklyHours(hours)} weekly</p>
                                </div>
                            </div>
                            <span className="rounded-md bg-mint px-2 py-1 text-xs font-black text-forest">{activeDays.length} days</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {barber.locationIds.map((locationId) => <LocationPill key={locationId} schedule={schedule} locationId={locationId} />)}
                        </div>
                        <div className="mt-4 grid gap-2 text-sm">
                            {weeklyDisplayOrder.map((dayOfWeek) => {
                                const day = weekdays[dayOfWeek];
                                const windows = draft.days.find((draftDay) => draftDay.dayOfWeek === dayOfWeek)?.windows ?? [];
                                return (
                                    <div key={`${barber.id}-${day}`} className="flex items-start justify-between gap-3 border-t border-forest/10 pt-2">
                                        <span className="font-black text-forest">{day}</span>
                                        <span className="text-right font-bold text-charcoal/60">
                                            {windows.length > 0
                                                ? windows.map((window) => formatScheduleWindow(window.startTime, window.endTime)).join(", ")
                                                : "Not working"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </Panel>
                );
            })}
        </section>
    );
}

function StaffAvatar({
    barber,
    active,
    size = "md",
}: {
    barber: Pick<AdminBarberOption, "displayName" | "slug">;
    active?: boolean;
    size?: "md" | "lg";
}) {
    const source = getAdminBarberPhotoUrl(barber);
    const [imageFailed, setImageFailed] = useState(false);
    const photo = imageFailed ? undefined : source;
    const initials = barber.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    const sizeClass = size === "lg" ? "size-14 text-lg" : "size-11 text-sm";

    useEffect(() => {
        setImageFailed(false);
    }, [source]);

    if (photo) {
        return (
            <img
                src={photo}
                alt={barber.displayName}
                className={`${sizeClass} shrink-0 rounded-full border border-white object-cover shadow-sm ${active ? "ring-2 ring-forest/20" : "ring-1 ring-forest/10"}`}
                decoding="async"
                loading="lazy"
                onError={() => setImageFailed(true)}
            />
        );
    }

    return (
        <span className={`grid shrink-0 place-items-center rounded-full ${sizeClass} ${active ? "bg-forest text-white" : "bg-white text-forest"} font-black shadow-sm`}>
            {initials || "LF"}
        </span>
    );
}

function LocationPill({ schedule, locationId }: { schedule: AdminSchedule; locationId: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-forest/10 bg-white px-2 py-1 text-xs font-black text-charcoal/65">
            <span className={`size-2 rounded-full ${locationColorClass(locationId)}`} />
            {locationName(schedule, locationId)}
        </span>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-forest/10 bg-white p-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-charcoal/45">{label}</p>
            <p className="mt-1 text-xl font-black text-forest">{value}</p>
        </div>
    );
}

function ShiftTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            className={`min-h-10 rounded-md px-3 text-sm font-black transition ${
                active ? "bg-mint text-forest" : "text-charcoal/60 hover:bg-forest/5 hover:text-forest"
            }`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            className={`mt-0.5 flex h-6 w-11 items-center rounded-full p-1 transition ${
                checked ? "bg-forest" : "bg-charcoal/25"
            } ${disabled ? "opacity-55" : ""}`}
            onClick={() => onChange(!checked)}
        >
            <span className={`size-4 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
        </button>
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
                        {schedule.locations.map((location) => <option key={location.id} value={location.id}>{locationName(schedule, location.id)}</option>)}
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

function IconMini({
    title,
    onClick,
    children,
    className = "",
}: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <button type="button" className={`icon-button !h-8 !min-h-8 !w-8 ${className}`} title={title} onClick={onClick}>
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

function defaultWindow(
    schedule: AdminSchedule,
    barberId: string,
    dayOfWeek: number,
    startTime = "10:00",
    endTime = "19:00",
): ShiftWindowDraft {
    return {
        draftId: createDraftWindowId(dayOfWeek),
        locationId: defaultLocationIdForBarber(schedule, barberId),
        startTime,
        endTime,
    };
}

function defaultLocationIdForBarber(schedule: AdminSchedule, barberId?: string) {
    const barberLocationId = schedule.barbers.find((barber) => barber.id === barberId)?.locationIds[0];
    return barberLocationId ?? schedule.locations[0]?.id ?? "";
}

function createDraftWindowId(dayOfWeek: number) {
    return `day-${dayOfWeek}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatWeeklyHours(hours: number) {
    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
}

function locationColorClass(locationId: string) {
    return /mill/i.test(locationId) ? "bg-[#b99356]" : "bg-forest";
}

function barberName(schedule: AdminSchedule, barberId: string) {
    return schedule.barbers.find((barber) => barber.id === barberId)?.displayName ?? "Barber";
}

function locationName(schedule: AdminSchedule, locationId: string) {
    const name = schedule.locations.find((location) => location.id === locationId)?.name ?? "Location";
    return name.replace(/^Leaside Fades\s+/i, "");
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
