import { useEffect, useMemo, useRef, useState } from "react";
import {
    Ban,
    CalendarDays,
    ChevronDown,
    Clock,
    Copy,
    Edit3,
    GripVertical,
    Plus,
    RefreshCw,
    Save,
    Search,
    Trash2,
    X,
} from "lucide-react";

import { Button } from "../components/ui/Button.tsx";
import { useConfirm } from "../components/ui/ConfirmDialog.tsx";
import { DateInput } from "../components/ui/DateInput.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/Dialog.tsx";
import { Select } from "../components/ui/Select.tsx";
import { TimeInput } from "../components/ui/TimeInput.tsx";
import { useToast } from "../components/ui/toast.tsx";
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
    buildDeleteSchedulePeriodPlan,
    buildTemporarySchedulePlan,
    buildWeeklyScheduleDraft,
    buildWeeklyScheduleSavePlan,
    buildBlockedTimePayload,
    calculateWeeklyScheduleHours,
    clearWeeklyScheduleDay,
    copyWeeklyScheduleDay,
    describeSchedulePeriod,
    duplicateWeeklyScheduleWindow,
    formatLocalDateLabel,
    formatLocalDateTime,
    formatScheduleWindow,
    getWeeklyCopyTargetDayOptions,
    listWeeklyShiftPatterns,
    moveWeeklyScheduleWindow,
    resizeWeeklyScheduleWindow,
    snapWeeklyScheduleClock,
    todayLocalDate,
    validateWeeklyScheduleDraft,
    weekdaysInLocalDateRange,
    weeklyShiftPatternKey,
    weeklyShiftPatternLabel,
} from "./admin-utils";
import type { DayScheduleDraft, ShiftWindowDraft, WeeklyScheduleDraft, WeeklyScheduleSaveOperation, WeeklyScheduleValidationIssue } from "./admin-utils";
import type {
    AdminBarberOption,
    AdminBlockedTime,
    AdminBlockedTimeScope,
    AdminSchedule,
    BlockedTimeFormInput,
    SafeAdminUser,
} from "./types";

type ScheduleMode = "shifts" | "blocked";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weeklyDisplayOrder = [1, 2, 3, 4, 5, 6, 0];

async function runScheduleOperations(operations: WeeklyScheduleSaveOperation[], shouldContinue?: () => boolean) {
    for (const [index, operation] of operations.entries()) {
        if (shouldContinue && !shouldContinue()) {
            return { completed: false, applied: index };
        }
        if (operation.type === "deactivate") {
            await deactivateAdminShift(operation.shiftId);
        } else if (operation.type === "update") {
            await updateAdminShift(operation.shiftId, operation.payload);
        } else {
            await createAdminShift(operation.payload);
        }
    }

    return { completed: true, applied: operations.length };
}

export default function SchedulePage({
    mode,
    user,
}: {
    mode: ScheduleMode;
    user: SafeAdminUser;
}) {
    const [schedule, setSchedule] = useState<AdminSchedule | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [filters, setFilters] = useState({
        from: todayLocalDate(),
        to: addDaysToLocalDate(todayLocalDate(), 30),
    });

    async function refresh() {
        setLoading(true);
        try {
            setSchedule(await fetchAdminSchedule(filters));
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : "Schedule failed to load." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.from, filters.to]);

    async function afterMutation(message: string) {
        toast({ tone: "success", message });
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
    const [selectedPatternKey, setSelectedPatternKey] = useState<string | null>(null);
    const [staffSearch, setStaffSearch] = useState("");
    const [activeTab, setActiveTab] = useState<ShiftWorkspaceTab>("weekly");
    const [weeklyDraft, setWeeklyDraft] = useState<WeeklyScheduleDraft>(() =>
        buildWeeklyScheduleDraft(schedule, initialBarberId),
    );
    const [expandedDay, setExpandedDay] = useState(1);
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);
    const [deletingPattern, setDeletingPattern] = useState(false);
    const [temporaryDialogOpen, setTemporaryDialogOpen] = useState(false);
    const confirm = useConfirm();
    const canManageShifts = user.role === "owner" || user.role === "admin";
    const selectedBarber = visibleBarbers.find((barber) => barber.id === selectedBarberId) ?? visibleBarbers[0];
    const patterns = useMemo(
        () => listWeeklyShiftPatterns(schedule, selectedBarberId),
        [schedule, selectedBarberId],
    );
    const savePlan = useMemo(
        () => buildWeeklyScheduleSavePlan(schedule, weeklyDraft),
        [schedule, weeklyDraft],
    );
    const validationIssues = useMemo(() => validateWeeklyScheduleDraft(weeklyDraft), [weeklyDraft]);
    const weeklyHours = calculateWeeklyScheduleHours(weeklyDraft);
    const filteredBarbers = visibleBarbers.filter((barber) =>
        barber.displayName.toLowerCase().includes(staffSearch.trim().toLowerCase()),
    );
    const effectiveDateIssues = validationIssues.filter((issue) => issue.field === "effectiveFrom" || issue.field === "effectiveTo");
    const activePatternKey = useMemo(() => {
        const sourceShiftId = weeklyDraft.sourceShiftIds[0];
        return sourceShiftId
            ? patterns.find((pattern) => pattern.shiftIds.includes(sourceShiftId))?.key ?? ""
            : "";
    }, [patterns, weeklyDraft.sourceShiftIds]);
    const activePattern = patterns.find((pattern) => pattern.key === activePatternKey);
    const showPatternChips = patterns.length > 1
        || (patterns.length === 1 && Boolean(patterns[0].effectiveFrom || patterns[0].effectiveTo));

    useEffect(() => {
        if (!selectedBarber || selectedBarber.id === selectedBarberId) {
            return;
        }
        setSelectedBarberId(selectedBarber.id);
    }, [selectedBarber, selectedBarberId]);

    useEffect(() => {
        setWeeklyDraft(buildWeeklyScheduleDraft(schedule, selectedBarberId, selectedPatternKey ?? undefined));
    }, [schedule, selectedBarberId, selectedPatternKey]);

    async function confirmDiscardDraft() {
        if (savePlan.length === 0) {
            return true;
        }
        return confirm({
            title: "Discard unsaved changes?",
            description: "Your weekly schedule edits haven't been saved yet.",
            confirmLabel: "Discard",
            tone: "danger",
        });
    }

    async function selectBarber(barberId: string) {
        if (barberId === selectedBarberId) {
            return;
        }
        if (!(await confirmDiscardDraft())) {
            return;
        }
        setSelectedBarberId(barberId);
        setSelectedPatternKey(null);
        setNotice("");
    }

    async function selectPattern(patternKey: string) {
        if (patternKey === activePatternKey) {
            return;
        }
        if (!(await confirmDiscardDraft())) {
            return;
        }
        setSelectedPatternKey(patternKey);
        setNotice("");
    }

    async function saveWeeklySchedule() {
        if (!weeklyDraft || savePlan.length === 0) {
            return;
        }
        if (validationIssues.length > 0) {
            setNotice("Fix highlighted weekly schedule items before saving.");
            return;
        }

        try {
            setSaving(true);
            setNotice("");
            await runScheduleOperations(savePlan);
            setSelectedPatternKey(weeklyShiftPatternKey(weeklyDraft.effectiveFrom, weeklyDraft.effectiveTo));
            await onChanged(savePlan.length === 1 ? "Weekly schedule saved." : `${savePlan.length} schedule changes saved.`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Weekly schedule could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteActivePattern() {
        if (!activePattern || !activePattern.effectiveFrom || !activePattern.effectiveTo) {
            return;
        }
        const plan = buildDeleteSchedulePeriodPlan(schedule, activePattern);
        const restoreSentence = plan.mergedShiftCount > 0
            ? ` ${plan.mergedShiftCount} paused regular shift${plan.mergedShiftCount === 1 ? " resumes its" : "s resume their"} original schedule.`
            : " Regular shifts paused for these dates are not restored automatically.";
        const confirmed = await confirm({
            title: "Delete this schedule period?",
            description: `Deletes the ${weeklyShiftPatternLabel(activePattern)} period and its ${plan.removedShiftCount} shift${plan.removedShiftCount === 1 ? "" : "s"}.${restoreSentence}`,
            confirmLabel: "Delete period",
            tone: "danger",
        });
        if (!confirmed) {
            return;
        }
        try {
            setDeletingPattern(true);
            setNotice("");
            await runScheduleOperations(plan.operations);
            setSelectedPatternKey(null);
            await onChanged("Schedule period deleted.");
        } catch (error) {
            await onRefresh();
            setNotice(error instanceof Error ? error.message : "Schedule period could not be deleted.");
        } finally {
            setDeletingPattern(false);
        }
    }

    async function completeTemporarySchedule(patternKey: string, message: string) {
        setSelectedPatternKey(patternKey);
        await onChanged(message);
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
                                    onClick={() => void selectBarber(barber.id)}
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
                                <Metric label="Weekly hours" value={formatWeeklyHours(weeklyHours)} className="self-start" />
                                <div className="rounded-md border border-forest/10 bg-white p-3">
                                    <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-charcoal/45">Schedule period</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="grid gap-1">
                                            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Starts</span>
                                            <DateInput
                                                value={weeklyDraft.effectiveFrom}
                                                onChange={(event) => setWeeklyDraft({ ...weeklyDraft, effectiveFrom: event.target.value, effectiveDatesTouched: true })}
                                                disabled={!canManageShifts}
                                            />
                                        </label>
                                        <div className="grid gap-1">
                                            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Ends</span>
                                            <Select
                                                aria-label="Schedule period end"
                                                value={weeklyDraft.effectiveTo ? "date" : "never"}
                                                onChange={(event) => setWeeklyDraft({
                                                    ...weeklyDraft,
                                                    effectiveTo: event.target.value === "never"
                                                        ? ""
                                                        : weeklyDraft.effectiveTo || weeklyDraft.effectiveFrom || todayLocalDate(),
                                                    effectiveDatesTouched: true,
                                                })}
                                                disabled={!canManageShifts}
                                            >
                                                <option value="never">Never</option>
                                                <option value="date">On date</option>
                                            </Select>
                                            {weeklyDraft.effectiveTo && (
                                                <DateInput
                                                    aria-label="Schedule period end date"
                                                    aria-invalid={effectiveDateIssues.length > 0 ? true : undefined}
                                                    value={weeklyDraft.effectiveTo}
                                                    onChange={(event) => setWeeklyDraft({ ...weeklyDraft, effectiveTo: event.target.value, effectiveDatesTouched: true })}
                                                    disabled={!canManageShifts}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    {effectiveDateIssues.length === 0 && (
                                        <p className="mt-2 text-xs text-ink-faint">
                                            {describeSchedulePeriod(weeklyDraft.effectiveFrom, weeklyDraft.effectiveTo)}
                                        </p>
                                    )}
                                    {effectiveDateIssues.map((issue) => (
                                        <p key={`${issue.field}-${issue.message}`} className="mt-2 text-xs font-medium text-danger" role="alert">{issue.message}</p>
                                    ))}
                                </div>
                                <button className="icon-button self-start" onClick={onRefresh} title="Refresh schedule">
                                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                                </button>
                            </div>
                        </div>

                        {(showPatternChips || canManageShifts) && (
                            <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Schedule periods">
                                {showPatternChips && (
                                    <>
                                        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Schedule periods</span>
                                        {patterns.map((pattern) => {
                                            const selected = pattern.key === activePatternKey;
                                            const temporary = Boolean(pattern.effectiveFrom && pattern.effectiveTo);
                                            const patternLocations = pattern.locationIds.map((id) => locationName(schedule, id)).join(", ");

                                            return (
                                                <button
                                                    key={pattern.key}
                                                    type="button"
                                                    aria-pressed={selected}
                                                    className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                                                        temporary ? "border-dashed" : ""
                                                    } ${
                                                        selected
                                                            ? "border-emerald bg-shift-fill text-forest"
                                                            : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink"
                                                    }`}
                                                    onClick={() => void selectPattern(pattern.key)}
                                                >
                                                    {temporary && <span className="font-normal text-ink-faint">Temp · </span>}
                                                    {weeklyShiftPatternLabel(pattern)}
                                                    {patternLocations && <span className="font-normal"> · {patternLocations}</span>}
                                                </button>
                                            );
                                        })}
                                    </>
                                )}
                                {canManageShifts && (
                                    <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
                                        {activePattern && activePattern.effectiveFrom && activePattern.effectiveTo && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                loading={deletingPattern}
                                                className="text-danger hover:bg-danger-soft hover:text-danger"
                                                onClick={() => void deleteActivePattern()}
                                            >
                                                <Trash2 size={15} aria-hidden="true" />
                                                Delete period
                                            </Button>
                                        )}
                                        <Button variant="secondary" size="sm" onClick={() => setTemporaryDialogOpen(true)}>
                                            <Plus size={15} aria-hidden="true" />
                                            Temporary schedule
                                        </Button>
                                    </span>
                                )}
                            </div>
                        )}

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
                            onDiscard={() => setWeeklyDraft(buildWeeklyScheduleDraft(schedule, selectedBarberId, selectedPatternKey ?? undefined))}
                            onSave={saveWeeklySchedule}
                            saving={saving}
                            pendingChanges={savePlan.length}
                            validationIssues={validationIssues}
                        />
                    )}

                    {activeTab === "overview" && (
                        <StaffScheduleOverview schedule={schedule} barbers={visibleBarbers} />
                    )}
                </section>
            </div>
            {canManageShifts && selectedBarber && (
                <TemporaryScheduleDialog
                    key={`${selectedBarber.id}:${temporaryDialogOpen}`}
                    open={temporaryDialogOpen}
                    onOpenChange={setTemporaryDialogOpen}
                    schedule={schedule}
                    barber={selectedBarber}
                    onCompleted={completeTemporarySchedule}
                    onRefresh={onRefresh}
                />
            )}
        </div>
    );
}

type ShiftWorkspaceTab = "weekly" | "overview";

function TemporaryScheduleDialog({
    open,
    onOpenChange,
    schedule,
    barber,
    onCompleted,
    onRefresh,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedule: AdminSchedule;
    barber: AdminBarberOption;
    onCompleted: (patternKey: string, message: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    const [effectiveFrom, setEffectiveFrom] = useState(() => todayLocalDate());
    const [effectiveTo, setEffectiveTo] = useState(() => addDaysToLocalDate(todayLocalDate(), 6));
    const [locationId, setLocationId] = useState(barber.locationIds[0] ?? "");
    const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>(() => {
        const workingWeekdays = new Set(
            schedule.shifts
                .filter((shift) => shift.active && shift.barberId === barber.id)
                .map((shift) => shift.dayOfWeek),
        );
        return workingWeekdays.size > 0
            ? [0, 1, 2, 3, 4, 5, 6].filter((dayOfWeek) => !workingWeekdays.has(dayOfWeek))
            : [];
    });
    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("19:00");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const cancelRequestedRef = useRef(false);

    const availableWeekdays = effectiveFrom && effectiveTo && effectiveFrom <= effectiveTo
        ? weekdaysInLocalDateRange(effectiveFrom, effectiveTo)
        : [];
    const selectedWeekdays = availableWeekdays.filter((dayOfWeek) => !excludedWeekdays.includes(dayOfWeek));
    const plan = buildTemporarySchedulePlan(schedule, {
        barberId: barber.id,
        locationId,
        effectiveFrom,
        effectiveTo,
        weekdays: selectedWeekdays,
        startTime,
        endTime,
    });
    const hasUnassignedLocations = schedule.locations.some((location) => !barber.locationIds.includes(location.id));

    function toggleWeekday(dayOfWeek: number) {
        setExcludedWeekdays((current) =>
            current.includes(dayOfWeek) ? current.filter((value) => value !== dayOfWeek) : [...current, dayOfWeek],
        );
    }

    async function submit() {
        if (plan.issues.length > 0 || saving) {
            return;
        }
        try {
            setSaving(true);
            setError("");
            cancelRequestedRef.current = false;
            const run = await runScheduleOperations(plan.operations, () => !cancelRequestedRef.current);
            if (!run.completed) {
                await onRefresh();
                setError(
                    run.applied > 0
                        ? "Stopped before finishing — some changes were already applied. Check the schedule period chips: if a regular shift was paused without a matching resumed period, select its chip and set Ends back to Never."
                        : "Stopped before any changes were made.",
                );
                return;
            }
            await onCompleted(weeklyShiftPatternKey(effectiveFrom, effectiveTo), "Temporary schedule created.");
            onOpenChange(false);
        } catch (submitError) {
            await onRefresh();
            setError(
                `${submitError instanceof Error ? submitError.message : "Temporary schedule could not be created."} Some changes may already be applied. Check the schedule period chips: if a regular shift was paused without a matching resumed period, select its chip and set Ends back to Never.`,
            );
        } finally {
            setSaving(false);
        }
    }

    function requestCancel() {
        if (saving) {
            cancelRequestedRef.current = true;
            return;
        }
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
            <DialogContent size="lg" closeDisabled={saving}>
                <DialogTitle>Temporary schedule for {barber.displayName}</DialogTitle>
                <DialogDescription>
                    Schedule a short stretch at one location. Regular shifts pause during this period and resume automatically after it ends.
                </DialogDescription>
                <div className="mt-4 grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-ink-muted">First day</span>
                            <DateInput
                                value={effectiveFrom}
                                onChange={(event) => setEffectiveFrom(event.target.value)}
                                disabled={saving}
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-ink-muted">Last day</span>
                            <DateInput
                                value={effectiveTo}
                                onChange={(event) => setEffectiveTo(event.target.value)}
                                disabled={saving}
                            />
                        </label>
                    </div>
                    <label className="grid gap-1">
                        <span className="text-xs font-medium text-ink-muted">Location</span>
                        <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={saving}>
                            {schedule.locations.map((location) => {
                                const assigned = barber.locationIds.includes(location.id);

                                return (
                                    <option key={location.id} value={location.id} disabled={!assigned}>
                                        {location.name}
                                        {assigned ? "" : " — not assigned"}
                                    </option>
                                );
                            })}
                        </Select>
                        {hasUnassignedLocations && (
                            <span className="text-xs text-ink-faint">
                                Locations marked "not assigned" need to be added to {barber.displayName} in Team first.
                            </span>
                        )}
                    </label>
                    <div className="grid gap-1">
                        <span className="text-xs font-medium text-ink-muted">Working days</span>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
                            {weeklyDisplayOrder.map((dayOfWeek) => {
                                const occurs = availableWeekdays.includes(dayOfWeek);
                                const selected = occurs && selectedWeekdays.includes(dayOfWeek);

                                return (
                                    <button
                                        key={dayOfWeek}
                                        type="button"
                                        aria-pressed={selected}
                                        disabled={!occurs || saving}
                                        title={occurs ? undefined : "This day doesn't occur between those dates."}
                                        className={`rounded-control border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-40 ${
                                            selected
                                                ? "border-emerald bg-shift-fill text-forest"
                                                : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink"
                                        }`}
                                        onClick={() => toggleWeekday(dayOfWeek)}
                                    >
                                        {weekdays[dayOfWeek]}
                                    </button>
                                );
                            })}
                        </div>
                        {availableWeekdays.length > 0 && availableWeekdays.length < 7 && (
                            <span className="text-xs text-ink-faint">Days outside the selected dates can't be picked.</span>
                        )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-ink-muted">Starts</span>
                            <TimeInput value={startTime} onChange={setStartTime} disabled={saving} />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-ink-muted">Ends</span>
                            <TimeInput value={endTime} onChange={setEndTime} disabled={saving} />
                        </label>
                    </div>
                    {plan.issues.length > 0 ? (
                        <ul className="grid gap-1 rounded-control border border-border bg-surface-muted p-3">
                            {plan.issues.map((issue) => (
                                <li key={issue} className="text-xs font-medium text-ink-muted">{issue}</li>
                            ))}
                        </ul>
                    ) : (
                        <div className="grid gap-1 rounded-control border border-border bg-surface-muted p-3">
                            <p className="text-xs font-medium text-ink">
                                {plan.temporaryShiftCount} temporary shift{plan.temporaryShiftCount === 1 ? "" : "s"} at{" "}
                                {locationName(schedule, locationId)} · {formatLocalDateLabel(effectiveFrom)} – {formatLocalDateLabel(effectiveTo)}
                            </p>
                            <p className="text-xs text-ink-muted">
                                {plan.pausedShiftCount > 0
                                    ? `Pauses ${plan.pausedShiftCount} regular shift${plan.pausedShiftCount === 1 ? "" : "s"}.${
                                        plan.resumedShiftCount > 0
                                            ? ` The regular schedule resumes ${formatLocalDateLabel(plan.resumeDate, { year: true })}.`
                                            : ""
                                    }`
                                    : "No regular shifts overlap this period."}
                            </p>
                        </div>
                    )}
                    {error && (
                        <p className="rounded-control bg-danger-soft px-3 py-2 text-xs font-medium text-danger" role="alert">{error}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={requestCancel}>
                            Cancel
                        </Button>
                        <Button loading={saving} disabled={plan.issues.length > 0} onClick={() => void submit()}>
                            Create temporary schedule
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function WeeklyScheduleBuilder({
    draft,
    schedule,
    canManage,
    expandedDay,
    saving,
    pendingChanges,
    validationIssues,
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
    validationIssues: WeeklyScheduleValidationIssue[];
    onExpandedDay: (dayOfWeek: number) => void;
    onDraftChange: (draft: WeeklyScheduleDraft) => void;
    onDiscard: () => void;
    onSave: () => Promise<void>;
}) {
    const orderedDays = weeklyDisplayOrder.flatMap((dayOfWeek) => {
        const day = draft.days.find((candidate) => candidate.dayOfWeek === dayOfWeek);
        return day ? [day] : [];
    });
    const allWindowIds = orderedDays.flatMap((day) => day.windows.map((window) => window.draftId));
    const timelineBounds = useMemo(() => weeklyTimelineBounds(orderedDays), [orderedDays]);
    const timelineHourMarks = useMemo(() => weeklyTimelineHourMarks(timelineBounds.startMinutes, timelineBounds.endMinutes), [timelineBounds]);
    const timelineSpanMinutes = timelineBounds.endMinutes - timelineBounds.startMinutes;
    const dragWindowIdRef = useRef<string | null>(null);
    const [selectedWindowId, setSelectedWindowId] = useState(allWindowIds[0] ?? "");
    const [inspectorCopyTarget, setInspectorCopyTarget] = useState("");
    const selectedContext = findWindowContext(orderedDays, selectedWindowId);
    const selectedIssues = selectedContext
        ? validationIssues.filter((issue) => issue.dayOfWeek === selectedContext.day.dayOfWeek && issue.windowDraftId === selectedContext.window.draftId)
        : [];
    const selectedCopyOptions = selectedContext ? getWeeklyCopyTargetDayOptions(selectedContext.day.dayOfWeek) : [];

    useEffect(() => {
        if (selectedWindowId && allWindowIds.includes(selectedWindowId)) {
            return;
        }

        setSelectedWindowId(allWindowIds[0] ?? "");
    }, [allWindowIds, selectedWindowId]);

    useEffect(() => {
        if (!selectedContext) {
            setInspectorCopyTarget("");
            return;
        }

        const firstOption = getWeeklyCopyTargetDayOptions(selectedContext.day.dayOfWeek)[0]?.dayOfWeek;
        setInspectorCopyTarget(firstOption === undefined ? "" : String(firstOption));
    }, [selectedContext?.day.dayOfWeek, selectedWindowId]);

    function changeDay(dayOfWeek: number, updater: (day: DayScheduleDraft) => DayScheduleDraft) {
        onDraftChange({
            ...draft,
            days: draft.days.map((day) => day.dayOfWeek === dayOfWeek ? updater(day) : day),
        });
    }

    function setDayActive(dayOfWeek: number, active: boolean) {
        const window = defaultWindow(schedule, draft.barberId, dayOfWeek);
        changeDay(dayOfWeek, (day) => ({
            ...day,
            active,
            windows: active
                ? day.windows.length > 0 ? day.windows : [window]
                : [],
        }));
        onExpandedDay(dayOfWeek);
        if (active && !selectedWindowId) {
            setSelectedWindowId(window.draftId);
        }
    }

    function updateWindow(dayOfWeek: number, index: number, patch: Partial<ShiftWindowDraft>) {
        changeDay(dayOfWeek, (day) => ({
            ...day,
            active: true,
            windows: day.windows.map((window, item) => item === index ? { ...window, ...patch } : window),
        }));
    }

    function addWindow(dayOfWeek: number, startTime = "15:00", endTime = "19:00") {
        const window = defaultWindow(schedule, draft.barberId, dayOfWeek, startTime, endTime);
        changeDay(dayOfWeek, (day) => ({
            ...day,
            active: true,
            windows: [...day.windows, window],
        }));
        onExpandedDay(dayOfWeek);
        setSelectedWindowId(window.draftId);
    }

    function removeWindow(dayOfWeek: number, index: number) {
        const removedId = draft.days.find((day) => day.dayOfWeek === dayOfWeek)?.windows[index]?.draftId;
        changeDay(dayOfWeek, (day) => {
            const windows = day.windows.filter((_, item) => item !== index);
            return { ...day, active: windows.length > 0, windows };
        });
        if (removedId === selectedWindowId) {
            setSelectedWindowId("");
        }
    }

    function clearDay(dayOfWeek: number) {
        onDraftChange(clearWeeklyScheduleDay(draft, dayOfWeek));
        onExpandedDay(dayOfWeek);
        const clearedWindowIds = draft.days.find((day) => day.dayOfWeek === dayOfWeek)?.windows.map((window) => window.draftId) ?? [];
        if (clearedWindowIds.includes(selectedWindowId)) {
            setSelectedWindowId("");
        }
    }

    function copyDay(fromDayOfWeek: number, toDayOfWeek: number) {
        const next = copyWeeklyScheduleDay(draft, { fromDayOfWeek, toDayOfWeek });
        onDraftChange(next);
        onExpandedDay(toDayOfWeek);
        setSelectedWindowId(next.days[toDayOfWeek]?.windows[0]?.draftId ?? "");
    }

    function duplicateWindow(windowDraftId: string, targetDayOfWeek?: number, targetStartTime?: string) {
        const next = duplicateWeeklyScheduleWindow(draft, { windowDraftId, targetDayOfWeek, targetStartTime });
        onDraftChange(next);
        const duplicatedWindow = findNewWindow(draft, next);
        if (duplicatedWindow) {
            setSelectedWindowId(duplicatedWindow.draftId);
        }
    }

    function startWindowDrag(event: React.DragEvent, windowDraftId: string) {
        dragWindowIdRef.current = windowDraftId;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", windowDraftId);
    }

    function dropWindowOnDay(event: React.DragEvent<HTMLDivElement>, dayOfWeek: number) {
        event.preventDefault();
        if (!canManage) {
            return;
        }

        const windowDraftId = dragWindowIdRef.current ?? event.dataTransfer.getData("text/plain");
        const targetStartTime = clockFromTimelinePointer(
            event.clientY,
            event.currentTarget.getBoundingClientRect(),
            timelineBounds.startMinutes,
            timelineBounds.endMinutes,
        );
        if (!windowDraftId || !targetStartTime) {
            return;
        }

        onDraftChange(moveWeeklyScheduleWindow(draft, { windowDraftId, targetDayOfWeek: dayOfWeek, targetStartTime }));
        setSelectedWindowId(windowDraftId);
        onExpandedDay(dayOfWeek);
        dragWindowIdRef.current = null;
    }

    function startWindowResize(event: React.PointerEvent<HTMLElement>, windowDraftId: string, edge: "start" | "end") {
        if (!canManage) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        const dayColumn = event.currentTarget.closest("[data-timeline-day]") as HTMLElement | null;
        if (!dayColumn) {
            return;
        }

        const rect = dayColumn.getBoundingClientRect();
        const handlePointerMove = (pointerEvent: PointerEvent) => {
            const targetTime = clockFromTimelinePointer(pointerEvent.clientY, rect, timelineBounds.startMinutes, timelineBounds.endMinutes);
            if (targetTime) {
                onDraftChange(resizeWeeklyScheduleWindow(draft, { windowDraftId, edge, targetTime }));
            }
        };
        const handlePointerUp = () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            document.body.style.userSelect = "";
        };

        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        handlePointerMove(event.nativeEvent);
    }

    return (
        <section className="flex flex-1 flex-col">
            <div className="hidden min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 xl:grid 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 overflow-hidden rounded-md border border-forest/10 bg-[#fbfcfa]" data-testid="weekly-shift-timeline">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/10 bg-white px-4 py-3">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-charcoal/45">Visual weekly schedule</p>
                            <h3 className="text-lg font-black text-forest">Drag shifts, resize handles, then save</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-black text-charcoal/55">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest/10 bg-white px-2 py-1"><GripVertical size={14} /> Move</span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest/10 bg-white px-2 py-1"><Clock size={14} /> Resize</span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest/10 bg-white px-2 py-1"><CalendarDays size={14} /> Repeats weekly</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <div className="min-w-[1080px]">
                            <div className="grid grid-cols-[56px_repeat(7,minmax(132px,1fr))] border-b border-forest/10 bg-white">
                                <div className="border-r border-forest/10 px-2 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/40">Time</div>
                                {orderedDays.map((day) => (
                                    <div key={`timeline-heading-${day.dayOfWeek}`} className="border-r border-forest/10 px-3 py-3 last:border-r-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-black text-forest">{weekdays[day.dayOfWeek]}</span>
                                            <button
                                                className={`rounded-full px-2 py-1 text-[11px] font-black ${day.active ? "bg-mint text-forest" : "bg-charcoal/10 text-charcoal/55"}`}
                                                type="button"
                                                onClick={() => setDayActive(day.dayOfWeek, !day.active)}
                                                disabled={!canManage}
                                            >
                                                {day.active ? `${day.windows.length} shift${day.windows.length === 1 ? "" : "s"}` : "Off"}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-[56px_repeat(7,minmax(132px,1fr))]">
                                <div className="relative min-h-[760px] border-r border-forest/10 bg-white">
                                    {timelineHourMarks.map((minutes) => (
                                        <div
                                            key={`time-${minutes}`}
                                            className="absolute right-2 -translate-y-1/2 text-[11px] font-black text-charcoal/40"
                                            style={{ top: `${((minutes - timelineBounds.startMinutes) / timelineSpanMinutes) * 100}%` }}
                                        >
                                            {formatClockLabel(minutesToLocalClock(minutes))}
                                        </div>
                                    ))}
                                </div>
                                {orderedDays.map((day) => {
                                    const dayIssues = validationIssues.filter((issue) => issue.dayOfWeek === day.dayOfWeek);

                                    return (
                                        <div
                                            key={`timeline-day-${day.dayOfWeek}`}
                                            data-timeline-day={day.dayOfWeek}
                                            className={`relative min-h-[760px] border-r border-forest/10 last:border-r-0 ${day.active ? "bg-white" : "bg-[#f6f8f3]"}`}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={(event) => dropWindowOnDay(event, day.dayOfWeek)}
                                        >
                                            {timelineHourMarks.map((minutes) => (
                                                <div
                                                    key={`line-${day.dayOfWeek}-${minutes}`}
                                                    className="absolute left-0 right-0 border-t border-forest/10"
                                                    style={{ top: `${((minutes - timelineBounds.startMinutes) / timelineSpanMinutes) * 100}%` }}
                                                />
                                            ))}
                                            {!day.active && (
                                                <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-md border border-dashed border-forest/20 bg-white/85 p-3 text-center">
                                                    <p className="text-sm font-black text-charcoal/45">Not working</p>
                                                    {canManage && (
                                                        <button className="mt-2 text-button inline-flex !min-h-8 items-center gap-1.5 !px-2 !py-1 text-sm" type="button" onClick={() => addWindow(day.dayOfWeek, "10:00", "19:00")}>
                                                            <Plus size={14} /> Add shift
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {day.windows.map((window, index) => {
                                                const style = shiftBlockStyle(window, timelineBounds.startMinutes, timelineSpanMinutes);
                                                const selected = window.draftId === selectedWindowId;
                                                const issueCount = dayIssues.filter((issue) => issue.windowDraftId === window.draftId).length;

                                                return (
                                                    <button
                                                        key={window.draftId}
                                                        type="button"
                                                        draggable={canManage}
                                                        className={`absolute left-2 right-2 z-10 overflow-hidden rounded-md border p-2 text-left shadow-sm transition hover:z-20 hover:shadow-md ${
                                                            selected ? "border-forest bg-mint text-forest ring-2 ring-forest/20" : issueCount > 0 ? "border-red-400 bg-red-50 text-red-800" : "border-forest/25 bg-[#d9f2df] text-forest"
                                                        }`}
                                                        style={style}
                                                        onClick={() => {
                                                            setSelectedWindowId(window.draftId);
                                                            onExpandedDay(day.dayOfWeek);
                                                        }}
                                                        onDragStart={(event) => startWindowDrag(event, window.draftId)}
                                                        onDragEnd={() => { dragWindowIdRef.current = null; }}
                                                    >
                                                        {canManage && (
                                                            <>
                                                                <span
                                                                    className="absolute inset-x-0 top-0 z-20 h-2 cursor-ns-resize rounded-t-md bg-forest/20"
                                                                    onPointerDown={(event) => startWindowResize(event, window.draftId, "start")}
                                                                />
                                                                <span
                                                                    className="absolute inset-x-0 bottom-0 z-20 h-2 cursor-ns-resize rounded-b-md bg-forest/20"
                                                                    onPointerDown={(event) => startWindowResize(event, window.draftId, "end")}
                                                                />
                                                            </>
                                                        )}
                                                        <span className="flex h-full min-h-12 flex-col justify-center gap-1">
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.08em] text-current/60"><GripVertical size={13} /> Shift {index + 1}</span>
                                                            <span className="text-sm font-black leading-tight">{safeScheduleWindowLabel(window.startTime, window.endTime)}</span>
                                                            <span className="truncate text-xs font-bold opacity-75">{locationName(schedule, window.locationId)}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                            {day.active && canManage && (
                                                <button
                                                    className="absolute bottom-3 left-3 right-3 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-forest/15 bg-white text-sm font-black text-forest shadow-sm hover:bg-mint/40"
                                                    type="button"
                                                    onClick={() => addWindow(day.dayOfWeek)}
                                                >
                                                    <Plus size={14} /> Add split
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="min-w-0 rounded-md border border-forest/10 bg-white p-4">
                    {selectedContext ? (
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-charcoal/45">Edit shift</p>
                                <h3 className="mt-1 text-xl font-black text-forest">{weekdays[selectedContext.day.dayOfWeek]} shift</h3>
                                <p className="mt-1 text-sm font-bold text-charcoal/55">{safeScheduleWindowLabel(selectedContext.window.startTime, selectedContext.window.endTime)}</p>
                            </div>
                            <div className="grid gap-3">
                                <label className="grid gap-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Starts</span>
                                    <input
                                        className={scheduleFieldClass(selectedIssues.some((issue) => issue.field === "startTime" || issue.field === "window"))}
                                        type="time"
                                        step="900"
                                        value={selectedContext.window.startTime}
                                        disabled={!canManage}
                                        onChange={(event) => updateWindow(selectedContext.day.dayOfWeek, selectedContext.index, { startTime: event.target.value })}
                                        onBlur={(event) => {
                                            const snapped = snapWeeklyScheduleClock(event.target.value);
                                            if (snapped) updateWindow(selectedContext.day.dayOfWeek, selectedContext.index, { startTime: snapped });
                                        }}
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Ends</span>
                                    <input
                                        className={scheduleFieldClass(selectedIssues.some((issue) => issue.field === "endTime" || issue.field === "window"))}
                                        type="time"
                                        step="900"
                                        value={selectedContext.window.endTime}
                                        disabled={!canManage}
                                        onChange={(event) => updateWindow(selectedContext.day.dayOfWeek, selectedContext.index, { endTime: event.target.value })}
                                        onBlur={(event) => {
                                            const snapped = snapWeeklyScheduleClock(event.target.value);
                                            if (snapped) updateWindow(selectedContext.day.dayOfWeek, selectedContext.index, { endTime: snapped });
                                        }}
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Location</span>
                                    <select
                                        className={scheduleFieldClass(selectedIssues.some((issue) => issue.field === "locationId"))}
                                        value={selectedContext.window.locationId}
                                        disabled={!canManage}
                                        onChange={(event) => updateWindow(selectedContext.day.dayOfWeek, selectedContext.index, { locationId: event.target.value })}
                                    >
                                        {schedule.locations.map((location) => (
                                            <option key={location.id} value={location.id}>{locationName(schedule, location.id)}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            {selectedIssues.map((issue) => (
                                <p key={`${issue.field}-${issue.message}`} className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{issue.message}</p>
                            ))}
                            {canManage && (
                                <div className="grid gap-2">
                                    <button className="icon-text-button justify-center !min-h-10" type="button" onClick={() => duplicateWindow(selectedContext.window.draftId, selectedContext.day.dayOfWeek)}>
                                        <Copy size={15} /> Duplicate
                                    </button>
                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                        <select className="input !min-h-10 !py-2 text-sm" value={inspectorCopyTarget} onChange={(event) => setInspectorCopyTarget(event.target.value)}>
                                            {selectedCopyOptions.map((option) => (
                                                <option key={option.dayOfWeek} value={option.dayOfWeek}>{option.label}</option>
                                            ))}
                                        </select>
                                        <button className="icon-text-button !min-h-10" type="button" onClick={() => inspectorCopyTarget && copyDay(selectedContext.day.dayOfWeek, Number(inspectorCopyTarget))}>
                                            <Copy size={15} /> Copy
                                        </button>
                                    </div>
                                    <button className="text-button inline-flex !min-h-10 items-center justify-center gap-1.5 text-red-700 hover:bg-red-50" type="button" onClick={() => removeWindow(selectedContext.day.dayOfWeek, selectedContext.index)}>
                                        <Trash2 size={15} /> Delete shift
                                    </button>
                                    <button className="text-button inline-flex !min-h-10 items-center justify-center gap-1.5 text-red-700 hover:bg-red-50" type="button" onClick={() => clearDay(selectedContext.day.dayOfWeek)}>
                                        <X size={15} /> Clear {weekdays[selectedContext.day.dayOfWeek]}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid h-full min-h-60 place-items-center rounded-md border border-dashed border-forest/15 bg-[#f8faf7] p-4 text-center">
                            <div>
                                <p className="text-sm font-black text-forest">Select a shift</p>
                                <p className="mt-1 text-sm font-bold text-charcoal/55">Click a block to edit exact time, location, copy, duplicate, or delete.</p>
                            </div>
                        </div>
                    )}
                </aside>
            </div>
            <div className="grid gap-3 p-4 xl:hidden">
                {orderedDays.map((day) => (
                    <MobileWeeklyDayCard
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
                        onDuplicateWindow={(windowDraftId) => duplicateWindow(windowDraftId, day.dayOfWeek)}
                        validationIssues={validationIssues.filter((issue) => issue.dayOfWeek === day.dayOfWeek)}
                    />
                ))}
            </div>
            <div className="mt-auto flex flex-col gap-3 border-t border-forest/10 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className={`text-xs font-bold ${validationIssues.length > 0 ? "text-red-700" : "text-charcoal/50"}`}>
                    {validationIssues.length > 0
                        ? `${validationIssues.length} schedule ${validationIssues.length === 1 ? "item needs" : "items need"} attention before saving.`
                        : `${pendingChanges} ${pendingChanges === 1 ? "change" : "changes"} pending. Weekly hours are calculated from this schedule and range.`}
                </p>
                {canManage && (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button className="text-button !min-h-11 !px-3 !py-2" type="button" onClick={onDiscard} disabled={pendingChanges === 0 || saving}>
                            Discard
                        </button>
                        <button className="primary-button inline-flex !min-h-11 items-center gap-2 !px-4 !py-2" type="button" onClick={onSave} disabled={pendingChanges === 0 || saving || validationIssues.length > 0}>
                            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            Save changes
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

function findWindowContext(days: DayScheduleDraft[], windowDraftId: string) {
    for (const day of days) {
        const index = day.windows.findIndex((window) => window.draftId === windowDraftId);
        if (index >= 0) {
            return {
                day,
                window: day.windows[index],
                index,
            };
        }
    }

    return null;
}

function findNewWindow(previous: WeeklyScheduleDraft, next: WeeklyScheduleDraft) {
    const previousIds = new Set(previous.days.flatMap((day) => day.windows.map((window) => window.draftId)));
    return next.days.flatMap((day) => day.windows).find((window) => !previousIds.has(window.draftId)) ?? null;
}

function weeklyTimelineBounds(days: DayScheduleDraft[]) {
    const windowMinutes = days
        .flatMap((day) => day.windows)
        .flatMap((window) => [clockInputToMinutes(window.startTime), clockInputToMinutes(window.endTime)])
        .filter((minutes): minutes is number => minutes !== null);
    const earliest = Math.min(8 * 60, ...windowMinutes);
    const latest = Math.max(21 * 60, ...windowMinutes);
    const startMinutes = Math.max(0, Math.floor(earliest / 60) * 60);
    const endMinutes = Math.min(23 * 60 + 45, Math.ceil(latest / 60) * 60);

    return {
        startMinutes,
        endMinutes: Math.max(startMinutes + 60, endMinutes),
    };
}

function weeklyTimelineHourMarks(startMinutes: number, endMinutes: number) {
    const first = Math.ceil(startMinutes / 60) * 60;
    const last = Math.floor(endMinutes / 60) * 60;
    const marks: number[] = [];
    for (let minutes = first; minutes <= last; minutes += 60) {
        marks.push(minutes);
    }
    return marks;
}

function shiftBlockStyle(window: ShiftWindowDraft, timelineStartMinutes: number, timelineSpanMinutes: number): React.CSSProperties {
    const startMinutes = clockInputToMinutes(window.startTime) ?? timelineStartMinutes;
    const endMinutes = clockInputToMinutes(window.endTime) ?? startMinutes + 60;
    const visibleStart = Math.max(timelineStartMinutes, startMinutes);
    const visibleEnd = Math.min(timelineStartMinutes + timelineSpanMinutes, Math.max(endMinutes, visibleStart + 15));
    const top = ((visibleStart - timelineStartMinutes) / timelineSpanMinutes) * 100;
    const height = ((visibleEnd - visibleStart) / timelineSpanMinutes) * 100;

    return {
        top: `calc(${top}% + 3px)`,
        height: `max(52px, calc(${height}% - 6px))`,
    };
}

function clockFromTimelinePointer(clientY: number, rect: DOMRect, startMinutes: number, endMinutes: number) {
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    const minutes = startMinutes + ratio * (endMinutes - startMinutes);
    return snapWeeklyScheduleClock(minutesToLocalClock(minutes));
}

function minutesToLocalClock(totalMinutes: number) {
    const clamped = Math.max(0, Math.min(23 * 60 + 45, Math.round(totalMinutes)));
    const hour = Math.floor(clamped / 60);
    const minute = clamped % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clockInputToMinutes(time: string) {
    if (!/^\d{2}:\d{2}$/.test(time)) {
        return null;
    }

    const [hour, minute] = time.split(":").map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return hour * 60 + minute;
}

function formatClockLabel(clock: string) {
    const minutes = clockInputToMinutes(clock) ?? 0;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${period}`;
}

function MobileWeeklyDayCard({
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
    onDuplicateWindow,
    validationIssues,
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
    onDuplicateWindow: (windowDraftId: string) => void;
    validationIssues: WeeklyScheduleValidationIssue[];
}) {
    const copyTargetOptions = useMemo(() => getWeeklyCopyTargetDayOptions(day.dayOfWeek), [day.dayOfWeek]);
    const [copyTarget, setCopyTarget] = useState(String(copyTargetOptions[0]?.dayOfWeek ?? ""));
    const dayLevelIssues = validationIssues.filter((issue) => !issue.windowDraftId);

    return (
        <section className={`rounded-md border p-3 shadow-sm ${expanded ? "border-forest/25 bg-mint/20" : "border-forest/10 bg-white"}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-md bg-forest text-sm font-black text-white">{weekdays[day.dayOfWeek]}</span>
                    <div className="min-w-0">
                        <p className="text-base font-black text-forest">{day.active ? `${day.windows.length} shift${day.windows.length === 1 ? "" : "s"}` : "Not working"}</p>
                        <p className="truncate text-sm font-bold text-charcoal/55">
                            {day.windows.length > 0
                                ? day.windows.map((window) => safeScheduleWindowLabel(window.startTime, window.endTime)).join(", ")
                                : "Tap add shift to start this day."}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ToggleSwitch checked={day.active} disabled={!canManage} onChange={onActiveChange} />
                    <IconMini title={expanded ? "Collapse options" : "Show options"} onClick={onExpand}>
                        <ChevronDown size={14} className={expanded ? "rotate-180 transition" : "transition"} />
                    </IconMini>
                </div>
            </div>
            {expanded && (
                <div className="mt-3 grid gap-3">
                    {dayLevelIssues.map((issue) => (
                        <p key={`${issue.field}-${issue.message}`} className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{issue.message}</p>
                    ))}
                    {day.active ? (
                        <>
                            {day.windows.map((window, index) => (
                                <div key={window.draftId} className="grid gap-2 rounded-md border border-forest/10 bg-white/90 p-2">
                                    <WeeklyWindowEditor
                                        index={index}
                                        window={window}
                                        schedule={schedule}
                                        canManage={canManage}
                                        issues={validationIssues.filter((issue) => issue.windowDraftId === window.draftId)}
                                        onWindowChange={onWindowChange}
                                        onRemoveWindow={onRemoveWindow}
                                    />
                                    {canManage && (
                                        <button className="icon-text-button justify-self-start !min-h-9 !px-2 !py-1 text-sm" type="button" onClick={() => onDuplicateWindow(window.draftId)}>
                                            <Copy size={14} /> Duplicate
                                        </button>
                                    )}
                                </div>
                            ))}
                            {canManage && (
                                <button className="text-button inline-flex !min-h-9 items-center gap-1.5 justify-self-start !px-2 !py-1 text-sm" type="button" onClick={onAddWindow}>
                                    <Plus size={14} /> Add split
                                </button>
                            )}
                        </>
                    ) : (
                        canManage && (
                            <button className="primary-button inline-flex !min-h-10 items-center gap-1.5 justify-self-start !px-3 !py-2 text-sm" type="button" onClick={onAddWindow}>
                                <Plus size={14} /> Add shift
                            </button>
                        )
                    )}
                    {canManage && (
                        <div className="flex flex-col gap-2 rounded-md border border-forest/10 bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-[0.12em] text-charcoal/45">Copy to</span>
                                <select className="input !min-h-9 !w-auto !py-1 text-sm" value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>
                                    {copyTargetOptions.map((option) => (
                                        <option key={option.dayOfWeek} value={option.dayOfWeek}>{option.label}</option>
                                    ))}
                                </select>
                                <button className="icon-text-button !min-h-9 !px-2 !py-1 text-sm" type="button" onClick={() => onCopyDay(Number(copyTarget))} disabled={!copyTarget}>
                                    <Copy size={14} /> Apply
                                </button>
                            </div>
                            <button className="text-button inline-flex !min-h-9 items-center justify-center gap-1.5 !px-2 !py-1 text-sm text-red-700 hover:bg-red-50" type="button" onClick={onClearDay}>
                                <X size={14} /> Clear {weekdays[day.dayOfWeek]}
                            </button>
                        </div>
                    )}
                </div>
            )}
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
    validationIssues,
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
    validationIssues: WeeklyScheduleValidationIssue[];
}) {
    const copyTargetOptions = useMemo(() => getWeeklyCopyTargetDayOptions(day.dayOfWeek), [day.dayOfWeek]);
    const [copyTarget, setCopyTarget] = useState(String(copyTargetOptions[0]?.dayOfWeek ?? ""));
    const dayLevelIssues = validationIssues.filter((issue) => !issue.windowDraftId);

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
                            {day.windows.length > 1 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {day.windows.map((window, index) => (
                                        <span key={`${window.draftId}-chip`} className="rounded-md bg-forest/5 px-2 py-1 text-xs font-black text-forest">
                                            Split {index + 1}: {safeScheduleWindowLabel(window.startTime, window.endTime)}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {dayLevelIssues.map((issue) => (
                                <p key={`${issue.field}-${issue.message}`} className="text-xs font-bold text-red-700">{issue.message}</p>
                            ))}
                            {day.windows.map((window, index) => (
                                <WeeklyWindowEditor
                                    key={window.draftId}
                                    index={index}
                                    window={window}
                                    schedule={schedule}
                                    canManage={canManage}
                                    issues={validationIssues.filter((issue) => issue.windowDraftId === window.draftId)}
                                    onWindowChange={onWindowChange}
                                    onRemoveWindow={onRemoveWindow}
                                />
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

function WeeklyWindowEditor({
    index,
    window,
    schedule,
    canManage,
    issues,
    onWindowChange,
    onRemoveWindow,
}: {
    index: number;
    window: ShiftWindowDraft;
    schedule: AdminSchedule;
    canManage: boolean;
    issues: WeeklyScheduleValidationIssue[];
    onWindowChange: (index: number, patch: Partial<ShiftWindowDraft>) => void;
    onRemoveWindow: (index: number) => void;
}) {
    const issueMessages = Array.from(new Set(issues.map((issue) => issue.message)));
    const hasStartIssue = issues.some((issue) => issue.field === "startTime" || issue.field === "window");
    const hasEndIssue = issues.some((issue) => issue.field === "endTime" || issue.field === "window");
    const hasLocationIssue = issues.some((issue) => issue.field === "locationId");

    return (
        <div className={`rounded-md border p-2 ${issues.length > 0 ? "border-red-300 bg-red-50/60" : "border-forest/10 bg-white/80"}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] items-end gap-2 md:grid-cols-[128px_128px_minmax(150px,1fr)_40px]">
                <label className="grid min-w-0 gap-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Starts</span>
                    <input
                        className={scheduleFieldClass(hasStartIssue)}
                        type="time"
                        step="900"
                        value={window.startTime}
                        onChange={(event) => onWindowChange(index, { startTime: event.target.value })}
                        disabled={!canManage}
                    />
                </label>
                <label className="grid min-w-0 gap-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Ends</span>
                    <input
                        className={scheduleFieldClass(hasEndIssue)}
                        type="time"
                        step="900"
                        value={window.endTime}
                        onChange={(event) => onWindowChange(index, { endTime: event.target.value })}
                        disabled={!canManage}
                    />
                </label>
                <label className="order-4 col-span-3 grid min-w-0 gap-1 md:order-none md:col-span-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-charcoal/45">Location</span>
                    <select
                        className={scheduleFieldClass(hasLocationIssue)}
                        value={window.locationId}
                        onChange={(event) => onWindowChange(index, { locationId: event.target.value })}
                        disabled={!canManage}
                    >
                        {schedule.locations.map((location) => (
                            <option key={location.id} value={location.id}>{locationName(schedule, location.id)}</option>
                        ))}
                    </select>
                </label>
                {canManage ? (
                    <IconMini className="order-3 md:order-none" title="Remove window" onClick={() => onRemoveWindow(index)}>
                        <Trash2 size={14} />
                    </IconMini>
                ) : (
                    <span className="order-3 md:order-none" />
                )}
            </div>
            {issueMessages.map((message) => (
                <p key={message} className="mt-2 text-xs font-bold text-red-700">{message}</p>
            ))}
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
    barber: Pick<AdminBarberOption, "displayName" | "slug" | "profileImageUrl">;
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

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
    return (
        <div className={`rounded-md border border-forest/10 bg-white p-3${className ? ` ${className}` : ""}`}>
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
    const confirm = useConfirm();

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
        const confirmed = await confirm({
            title: "Delete blocked time?",
            description: "This frees the time for online booking again.",
            confirmLabel: "Delete",
            tone: "danger",
        });
        if (!confirmed) return;
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

function scheduleFieldClass(hasIssue: boolean) {
    return `input min-w-0 !min-h-10 !py-2 text-sm ${hasIssue ? "!border-red-400 !bg-red-50" : ""}`;
}

function safeScheduleWindowLabel(startTime: string, endTime: string) {
    if (/^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime)) {
        return formatScheduleWindow(startTime, endTime);
    }

    return `${startTime || "Start"} - ${endTime || "End"}`;
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
