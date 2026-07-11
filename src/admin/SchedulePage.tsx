import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    Ban,
    CalendarDays,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    Edit3,
    GripVertical,
    MapPin,
    Plane,
    Plus,
    RefreshCw,
    Repeat,
    RotateCcw,
    Save,
    Search,
    Store,
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
    createAdminShiftOverride,
    deactivateAdminShift,
    deleteAdminBlockedTime,
    deleteAdminShiftOverride,
    fetchAdminBookings,
    fetchAdminSchedule,
    replaceAdminDayShift,
    updateAdminBlockedTime,
    updateAdminShift,
} from "./api";
import { getAdminBarberPhotoUrl } from "./barber-photos";
import {
    addDaysToLocalDate,
    buildBlockedTimeGroups,
    buildComingUp,
    buildCoverPlan,
    buildTimeOffWritePlan,
    buildWeeklyScheduleDraft,
    buildWeeklyScheduleSavePlan,
    buildBlockedTimePayload,
    busyChipLabel,
    calculateWeeklyScheduleHours,
    clearWeeklyScheduleDay,
    copyWeeklyScheduleDay,
    describeBlockedTimeDraft,
    describeCoverResult,
    describeDayEditResult,
    describeTimeOffResult,
    describeWeeklyScheduleDraft,
    duplicateWeeklyScheduleWindow,
    formatClockRange12,
    formatDayNameDate,
    formatScheduleWindow,
    formatWeekHoursLabel,
    formatWeekRangeLabel,
    getWeeklyCopyTargetDayOptions,
    moveWeeklyScheduleWindow,
    resizeWeeklyScheduleWindow,
    resolveBarberDay,
    resolveBarberWeekMinutes,
    snapWeeklyScheduleClock,
    startOfWeekLocalDate,
    todayLocalDate,
    validateBlockedTimeDraft,
    validateWeeklyScheduleDraft,
    weekDatesFromLocalDate,
} from "./admin-utils";
import type {
    BlockedTimeRowView,
    ComingUpGroup,
    CoverPlan,
    DayScheduleDraft,
    ResolvedBarberDay,
    ShiftWindowDraft,
    WeeklyScheduleDraft,
    WeeklyScheduleSaveOperation,
    WeeklyScheduleValidationIssue,
} from "./admin-utils";
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

async function runScheduleOperations(operations: WeeklyScheduleSaveOperation[]) {
    for (const operation of operations) {
        if (operation.type === "deactivate") {
            await deactivateAdminShift(operation.shiftId);
        } else if (operation.type === "update") {
            await updateAdminShift(operation.shiftId, operation.payload);
        } else {
            await createAdminShift(operation.payload);
        }
    }
}

const accentButtonClass = "!bg-[#6950f3] !text-white hover:!bg-[#5840d8]";
const locationDotPalette = ["#1f7a4d", "#b99356", "#6950f3", "#b45309", "#2b5f8a", "#0f766e"];

type ActiveDialog =
    | { kind: "edit"; barberId: string; date: string; lockBarber: boolean }
    | { kind: "timeoff"; barberId: string; date: string; lockBarber: boolean }
    | { kind: "cover"; barberId: string; date: string; lockBarber: boolean }
    | { kind: "block"; barberId: string; date: string; lockBarber: boolean }
    | { kind: "weekly"; barberId: string }
    | null;

export default function SchedulePage({
    mode,
    user,
}: {
    mode: ScheduleMode;
    user: SafeAdminUser;
}) {
    const [schedule, setSchedule] = useState<AdminSchedule | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchedRange, setFetchedRange] = useState<{ from: string; to: string } | null>(null);
    const { toast } = useToast();
    const [weekStart, setWeekStart] = useState(() => startOfWeekLocalDate(todayLocalDate()));
    const [blockedFilters, setBlockedFilters] = useState({
        from: todayLocalDate(),
        to: addDaysToLocalDate(todayLocalDate(), 30),
    });

    const fetchFrom = mode === "shifts" ? addDaysToLocalDate(weekStart, -7) : blockedFilters.from;
    const fetchTo = mode === "shifts" ? addDaysToLocalDate(weekStart, 27) : blockedFilters.to;

    async function refresh() {
        setLoading(true);
        try {
            setSchedule(await fetchAdminSchedule({ from: fetchFrom, to: fetchTo }));
            setFetchedRange({ from: fetchFrom, to: fetchTo });
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : "Schedule failed to load." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchFrom, fetchTo]);

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

    if (mode === "shifts") {
        return (
            <TeamWeek
                schedule={schedule}
                user={user}
                loading={loading}
                weekStart={weekStart}
                fetchedRange={fetchedRange}
                onWeekStart={setWeekStart}
                onRefresh={refresh}
                onChanged={afterMutation}
            />
        );
    }

    return (
        <BlockedTimeScreen
            schedule={schedule}
            user={user}
            loading={loading}
            filters={blockedFilters}
            onFilters={setBlockedFilters}
            onRefresh={refresh}
            onChanged={afterMutation}
        />
    );
}

function locationDotColor(schedule: Pick<AdminSchedule, "locations">, locationId: string) {
    const index = schedule.locations.findIndex((location) => location.id === locationId);
    return locationDotPalette[(index >= 0 ? index : 0) % locationDotPalette.length];
}

function assignableLocations(schedule: AdminSchedule, barber: Pick<AdminBarberOption, "locationIds"> | undefined) {
    return schedule.locations.filter((location) => barber?.locationIds.includes(location.id));
}

function weekdayShortLabel(date: string) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${date}T00:00:00Z`));
}

function dayOfMonthLabel(date: string) {
    return Number(date.slice(8, 10));
}

interface TeamWeekRow {
    barber: AdminBarberOption;
    days: ResolvedBarberDay[];
    minutes: number;
}

function TeamWeek({
    schedule,
    user,
    loading,
    weekStart,
    fetchedRange,
    onWeekStart,
    onRefresh,
    onChanged,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    loading: boolean;
    weekStart: string;
    fetchedRange: { from: string; to: string } | null;
    onWeekStart: (date: string) => void;
    onRefresh: () => Promise<void>;
    onChanged: (message: string) => Promise<void>;
}) {
    const confirm = useConfirm();
    const { toast } = useToast();
    const canManage = user.role === "owner" || user.role === "admin";
    const today = todayLocalDate();
    const weekDates = useMemo(() => weekDatesFromLocalDate(weekStart), [weekStart]);
    // After a far week jump the effect refetch hasn't landed yet; the schedule
    // in hand still describes the previous window. Show a loader rather than
    // flash baseline-only cells for a week we haven't fetched.
    const weekReady =
        fetchedRange !== null &&
        weekDates[0] >= fetchedRange.from &&
        weekDates[weekDates.length - 1] <= fetchedRange.to;
    const [locationFilter, setLocationFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [menu, setMenu] = useState<{ barberId: string; date: string; x: number; y: number } | null>(null);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [dialog, setDialog] = useState<ActiveDialog>(null);

    const orderedBarbers = useMemo(
        () => [...(user.role === "barber" ? schedule.barbers.filter((barber) => barber.id === user.barberId) : schedule.barbers)]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName)),
        [schedule.barbers, user.barberId, user.role],
    );

    const rows = useMemo<TeamWeekRow[]>(
        () =>
            orderedBarbers
                .map((barber) => ({
                    barber,
                    days: weekDates.map((date) => resolveBarberDay(schedule, barber.id, date)),
                    minutes: resolveBarberWeekMinutes(schedule, barber.id, weekDates),
                }))
                .filter((row) => {
                    if (search.trim() && !row.barber.displayName.toLowerCase().includes(search.trim().toLowerCase())) {
                        return false;
                    }
                    if (locationFilter === "all") {
                        return true;
                    }
                    if (row.barber.locationIds.includes(locationFilter)) {
                        return true;
                    }
                    return row.days.some((day) => day.windows.some((window) => window.locationId === locationFilter));
                }),
        [orderedBarbers, weekDates, schedule, search, locationFilter],
    );

    const comingUp = useMemo(
        () => buildComingUp(schedule, orderedBarbers, today, addDaysToLocalDate(weekStart, 27)),
        [schedule, orderedBarbers, today, weekStart],
    );

    useEffect(() => {
        if (!menu && !addMenuOpen) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenu(null);
                setAddMenuOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [menu, addMenuOpen]);

    function openCell(event: React.MouseEvent<HTMLButtonElement>, barberId: string, date: string) {
        const rect = event.currentTarget.getBoundingClientRect();
        setAddMenuOpen(false);
        setMenu({
            barberId,
            date,
            x: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
            // Flip above the cell when a below-placed menu would leave the viewport.
            // Estimate matches the menu's CSS max-height (340px) so a 6-item menu
            // never clips; the menu also scrolls internally if it still overflows.
            y: rect.bottom + 4 + 340 > window.innerHeight
                ? Math.max(8, rect.top - 344)
                : rect.bottom + 4,
        });
    }

    function openFromCell(kind: "edit" | "timeoff" | "cover" | "block") {
        if (!menu) {
            return;
        }
        const target = { barberId: menu.barberId, date: menu.date };
        setMenu(null);
        setDialog({ kind, barberId: target.barberId, date: target.date, lockBarber: true });
    }

    function openWeeklyFromCell() {
        if (!menu) {
            return;
        }
        const barberId = menu.barberId;
        setMenu(null);
        setDialog({ kind: "weekly", barberId });
    }

    function openFromAdd(kind: "edit" | "timeoff" | "cover") {
        setAddMenuOpen(false);
        setDialog({ kind, barberId: orderedBarbers[0]?.id ?? "", date: today, lockBarber: false });
    }

    async function putBackToNormal(barberId: string, date: string) {
        const overrides = schedule.shiftOverrides.filter(
            (override) => override.barberId === barberId && override.overrideDate === date,
        );
        if (overrides.length === 0) {
            return;
        }
        const barber = schedule.barbers.find((candidate) => candidate.id === barberId);
        const confirmed = await confirm({
            title: "Put this day back to normal?",
            description: `${barber?.displayName ?? "This barber"} returns to their usual schedule on ${formatDayNameDate(date)}. If this day was part of a longer cover, the whole day goes back to normal.`,
            confirmLabel: "Put back to normal",
            tone: "danger",
        });
        if (!confirmed) {
            return;
        }
        try {
            for (const override of overrides) {
                await deleteAdminShiftOverride(override.id);
            }
            await onChanged(`${barber?.displayName ?? "Barber"} is back to normal on ${formatDayNameDate(date)}.`);
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : "That day could not be put back to normal." });
            await onRefresh();
        }
    }

    async function deleteDayShift(barberId: string, date: string) {
        const barber = schedule.barbers.find((candidate) => candidate.id === barberId);
        const day = resolveBarberDay(schedule, barberId, date);
        const locationIds = Array.from(new Set(day.windows.map((window) => window.locationId)));
        if (locationIds.length === 0) {
            return;
        }
        const confirmed = await confirm({
            title: `Delete ${barber?.displayName ?? "this barber"}'s shift on ${formatDayNameDate(date)}?`,
            description: "Customers won't be able to book them that day.",
            confirmLabel: "Delete shift",
            tone: "danger",
        });
        if (!confirmed) {
            return;
        }
        try {
            for (const locationId of locationIds) {
                await replaceAdminDayShift({ barberId, locationId, date, windows: [] });
            }
            await onChanged(`${barber?.displayName ?? "Barber"}'s shift on ${formatDayNameDate(date)} was deleted.`);
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : "That shift could not be deleted." });
            await onRefresh();
        }
    }

    async function removeComingUp(group: ComingUpGroup) {
        const confirmed = await confirm({
            title: "Remove this change?",
            description: `${group.sentence} — this puts those days back to ${group.barberName}'s usual schedule.`,
            confirmLabel: "Remove",
            tone: "danger",
        });
        if (!confirmed) {
            return;
        }
        try {
            for (const overrideId of group.overrideIds) {
                await deleteAdminShiftOverride(overrideId);
            }
            await onChanged(`${group.barberName}'s change was removed.`);
        } catch (error) {
            toast({ tone: "error", message: error instanceof Error ? error.message : "The change could not be removed." });
            await onRefresh();
        }
    }

    const dialogBarbers = dialog && "lockBarber" in dialog && dialog.lockBarber
        ? orderedBarbers.filter((barber) => barber.id === dialog.barberId)
        : orderedBarbers;
    const menuBarber = menu ? schedule.barbers.find((barber) => barber.id === menu.barberId) : undefined;
    const menuDay = menu ? resolveBarberDay(schedule, menu.barberId, menu.date) : null;
    const menuHasOverrides = menu
        ? schedule.shiftOverrides.some((override) => override.barberId === menu.barberId && override.overrideDate === menu.date)
        : false;
    const canDeleteDay = Boolean(menuDay?.working && menuDay.windows.length > 0);

    return (
        <div className="shifts-saas">
            <div className="saas-screenhead">
                <h2 className="saas-screentitle">Scheduled shifts</h2>
                <div className="saas-legend">
                    {schedule.locations.map((location) => (
                        <span key={location.id} className="saas-legend-item">
                            <span className="saas-dot" style={{ backgroundColor: locationDotColor(schedule, location.id) }} />
                            {locationName(schedule, location.id)}
                        </span>
                    ))}
                </div>
            </div>
            <div className="saas-toolbar">
                <div className="saas-weeknav">
                    <button className="saas-navbtn" onClick={() => onWeekStart(addDaysToLocalDate(weekStart, -7))} aria-label="Previous week">
                        <ChevronLeft size={17} />
                    </button>
                    <button className="saas-today" onClick={() => onWeekStart(startOfWeekLocalDate(today))}>Today</button>
                    <button className="saas-navbtn" onClick={() => onWeekStart(addDaysToLocalDate(weekStart, 7))} aria-label="Next week">
                        <ChevronRight size={17} />
                    </button>
                </div>
                <div className="saas-range">{formatWeekRangeLabel(weekDates)}</div>
                <div className="saas-loc-seg" role="group" aria-label="Filter by location">
                    <button className={locationFilter === "all" ? "on" : ""} onClick={() => setLocationFilter("all")}>All</button>
                    {schedule.locations.map((location) => (
                        <button key={location.id} className={locationFilter === location.id ? "on" : ""} onClick={() => setLocationFilter(location.id)}>
                            <span className="saas-dot" style={{ backgroundColor: locationDotColor(schedule, location.id) }} />
                            {locationName(schedule, location.id)}
                        </button>
                    ))}
                </div>
                <label className="saas-search">
                    <Search size={15} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team" aria-label="Search team" />
                </label>
                <span className="saas-grow" />
                {loading && <RefreshCw size={16} className="animate-spin text-[var(--saas-ink-3)]" aria-hidden="true" />}
                {canManage && (
                    <div className="saas-add">
                        <button className="saas-add-btn" onClick={() => { setMenu(null); setAddMenuOpen((value) => !value); }} aria-haspopup="menu" aria-expanded={addMenuOpen}>
                            <Plus size={16} /> Add
                        </button>
                        {addMenuOpen && (
                            <>
                                <button className="saas-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setAddMenuOpen(false)} />
                                <div className="saas-menu saas-menu-add" role="menu">
                                    <button className="saas-menu-item" onClick={() => openFromAdd("timeoff")}><Plane size={16} /> Time off</button>
                                    <button className="saas-menu-item" onClick={() => openFromAdd("cover")}><MapPin size={16} /> Cover a location</button>
                                    <button className="saas-menu-item" onClick={() => openFromAdd("edit")}><Edit3 size={16} /> Edit a day</button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="saas-gridwrap">
                {!weekReady ? (
                    <div className="saas-grid-loading"><InlineLoading label="Loading week" className="!text-[var(--saas-ink-2)]" /></div>
                ) : (
                <table className="saas-grid">
                    <thead>
                        <tr>
                            <th className="saas-corner">Team member</th>
                            {weekDates.map((date) => (
                                <th key={date} className={`saas-colday${date === today ? " saas-th-today" : ""}`}>
                                    <div className="saas-dow">{weekdayShortLabel(date)}</div>
                                    <div className="saas-dnum">{dayOfMonthLabel(date)}{date === today ? " · Today" : ""}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td className="saas-barber-cell saas-barber-cell--static" />
                                <td colSpan={7} className="saas-empty">No team members match this view.</td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.barber.id}>
                                    <td className="saas-barber-cell">
                                        <div className="saas-barber-row">
                                            <StaffAvatar barber={row.barber} neutral size="sm" />
                                            <div className="saas-barber-meta">
                                                <div className="saas-barber-name">{row.barber.displayName}</div>
                                                <div className="saas-barber-sub">
                                                    <span className="saas-hours">{formatWeekHoursLabel(row.minutes)} / wk</span>
                                                    <span className="saas-locdots">
                                                        {row.barber.locationIds.map((id) => (
                                                            <span key={id} className="saas-dot" style={{ backgroundColor: locationDotColor(schedule, id) }} title={locationName(schedule, id)} />
                                                        ))}
                                                    </span>
                                                </div>
                                            </div>
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    className="saas-barber-editbtn"
                                                    aria-label={`Set weekly schedule for ${row.barber.displayName}`}
                                                    onClick={() => { setMenu(null); setDialog({ kind: "weekly", barberId: row.barber.id }); }}
                                                >
                                                    <Edit3 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    {row.days.map((day, index) => (
                                        <TeamCell
                                            key={weekDates[index]}
                                            schedule={schedule}
                                            day={day}
                                            isToday={weekDates[index] === today}
                                            canManage={canManage}
                                            onOpen={(event) => openCell(event, row.barber.id, weekDates[index])}
                                        />
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                )}
            </div>

            <ComingUpStrip groups={comingUp} schedule={schedule} canManage={canManage} onRemove={removeComingUp} />

            {menu && menuBarber && menuDay && (
                <>
                    <button className="saas-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setMenu(null)} />
                    <div className="saas-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
                        <div className="saas-menu-head">
                            <div className="saas-menu-title">{menuBarber.displayName} · {formatDayNameDate(menu.date)}</div>
                            <div className="saas-menu-sub">
                                {menuDay.working
                                    ? menuDay.windows.map((window) => formatClockRange12(window.startTime, window.endTime)).join(" · ")
                                    : "Off"}
                                {menuDay.hasPartialBlock && menuDay.partialBlockLabel
                                    ? ` · ${menuDay.partialBlockLabel}`
                                    : ""}
                            </div>
                        </div>
                        <button className="saas-menu-item" onClick={() => openFromCell("edit")}>
                            {menuDay.working ? <Edit3 size={16} /> : <Plus size={16} />} {menuDay.working ? "Edit this day" : "Add a shift"}
                        </button>
                        <button className="saas-menu-item" onClick={() => openFromCell("timeoff")}><Plane size={16} /> Add time off</button>
                        <button className="saas-menu-item" onClick={() => openFromCell("block")}><Ban size={16} /> Block part of this day…</button>
                        <button className="saas-menu-item" onClick={() => openFromCell("cover")}><MapPin size={16} /> Cover a location…</button>
                        <button className="saas-menu-item" onClick={openWeeklyFromCell}><Repeat size={16} /> Set weekly schedule…</button>
                        {(canDeleteDay || menuHasOverrides) && <div className="saas-menu-sep" />}
                        {canDeleteDay && (
                            <button
                                className="saas-menu-item saas-menu-item--danger"
                                onClick={() => { const target = menu; setMenu(null); void deleteDayShift(target.barberId, target.date); }}
                            >
                                <Trash2 size={16} /> Delete this shift
                            </button>
                        )}
                        {menuHasOverrides && (
                            <button
                                className="saas-menu-item"
                                onClick={() => { const target = menu; setMenu(null); void putBackToNormal(target.barberId, target.date); }}
                            >
                                <RotateCcw size={16} /> Put this day back to normal
                            </button>
                        )}
                    </div>
                </>
            )}

            {dialog?.kind === "edit" && (
                <EditDayDialog
                    schedule={schedule}
                    barbers={dialogBarbers}
                    initialBarberId={dialog.barberId}
                    date={dialog.date}
                    onClose={() => setDialog(null)}
                    onChanged={onChanged}
                />
            )}
            {dialog?.kind === "timeoff" && (
                <TimeOffDialog
                    schedule={schedule}
                    barbers={dialogBarbers}
                    initialBarberId={dialog.barberId}
                    initialDate={dialog.date}
                    onClose={() => setDialog(null)}
                    onChanged={onChanged}
                    onRefresh={onRefresh}
                />
            )}
            {dialog?.kind === "cover" && (
                <CoverDialog
                    schedule={schedule}
                    barbers={dialogBarbers}
                    initialBarberId={dialog.barberId}
                    initialDate={dialog.date}
                    onClose={() => setDialog(null)}
                    onChanged={onChanged}
                    onRefresh={onRefresh}
                />
            )}
            {dialog?.kind === "block" && (
                <BlockedTimeDialog
                    schedule={schedule}
                    user={user}
                    draft={null}
                    initialBarberId={dialog.barberId}
                    initialDate={dialog.date}
                    lockToBarberScope
                    onClose={() => setDialog(null)}
                    onChanged={onChanged}
                    onUseTimeOff={() => {
                        const target = dialog;
                        setDialog({ kind: "timeoff", barberId: target.barberId, date: target.date, lockBarber: target.lockBarber });
                    }}
                />
            )}
            {dialog?.kind === "weekly" && (
                <WeeklyScheduleDialog
                    schedule={schedule}
                    barber={schedule.barbers.find((barber) => barber.id === dialog.barberId)}
                    canManage={canManage}
                    onClose={() => setDialog(null)}
                    onChanged={onChanged}
                />
            )}
        </div>
    );
}

function TeamCell({
    schedule,
    day,
    isToday,
    canManage,
    onOpen,
}: {
    schedule: AdminSchedule;
    day: ResolvedBarberDay;
    isToday: boolean;
    canManage: boolean;
    onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
    const classes = ["saas-cell"];
    if (!day.working) classes.push("saas-cell--off");
    if (day.changed) classes.push("saas-cell--changed");
    if (isToday) classes.push("saas-cell--today");

    const content = (
        <>
            {day.working ? (
                <>
                    {day.windows.map((window, index) => (
                        <div key={index} className="saas-shiftline">
                            <span className="saas-dot" style={{ backgroundColor: locationDotColor(schedule, window.locationId) }} />
                            <span className="saas-time">{formatClockRange12(window.startTime, window.endTime)}</span>
                        </div>
                    ))}
                    {day.badge && <span className={`saas-badge saas-badge--${day.badge.tone}`}>{day.badge.text}</span>}
                    {day.hasPartialBlock && (
                        <span className="saas-busychip" title={day.tooltip}>{busyChipLabel(day)}</span>
                    )}
                </>
            ) : (
                <>
                    <span className="saas-off">Off</span>
                    {day.badge && <span className={`saas-badge saas-badge--${day.badge.tone}`}>{day.badge.text}</span>}
                    {!day.badge && canManage && <span className="saas-plus"><Plus size={14} /></span>}
                </>
            )}
        </>
    );

    return (
        <td className={classes.join(" ")}>
            {canManage ? (
                <button type="button" className="saas-cell-btn" onClick={onOpen} title={day.tooltip ?? (day.working ? undefined : "Not working this day")}>
                    {content}
                </button>
            ) : (
                <div className="saas-cell-btn saas-cell-btn--static" title={day.tooltip}>{content}</div>
            )}
        </td>
    );
}

function ComingUpStrip({
    groups,
    schedule,
    canManage,
    onRemove,
}: {
    groups: ComingUpGroup[];
    schedule: AdminSchedule;
    canManage: boolean;
    onRemove: (group: ComingUpGroup) => void;
}) {
    return (
        <section className="saas-coming">
            <h3>Coming up</h3>
            {groups.length === 0 ? (
                <p className="saas-coming-empty">Nothing scheduled beyond the standard week.</p>
            ) : (
                <div className="saas-coming-list">
                    {groups.map((group) => (
                        <div key={`${group.barberId}-${group.startDate}-${group.kind}`} className="saas-coming-item">
                            <span
                                className="saas-dot"
                                style={{ backgroundColor: group.locationId ? locationDotColor(schedule, group.locationId) : "#c9ccd4" }}
                            />
                            <p className="saas-coming-text">{group.sentence}</p>
                            {canManage && (
                                <button className="saas-coming-remove" onClick={() => onRemove(group)} aria-label="Remove this change" title="Remove this change">
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function BarberSelectField({
    barbers,
    value,
    onChange,
    disabled,
}: {
    barbers: AdminBarberOption[];
    value: string;
    onChange: (barberId: string) => void;
    disabled?: boolean;
}) {
    if (barbers.length <= 1) {
        return null;
    }
    return (
        <label className="saas-field">
            <span className="saas-field-label">Team member</span>
            <Select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
                {barbers.map((barber) => (
                    <option key={barber.id} value={barber.id}>{barber.displayName}</option>
                ))}
            </Select>
        </label>
    );
}

function WindowsEditor({
    windows,
    disabled,
    onChange,
}: {
    windows: Array<{ startTime: string; endTime: string }>;
    disabled?: boolean;
    onChange: (windows: Array<{ startTime: string; endTime: string }>) => void;
}) {
    return (
        <div className="grid gap-2">
            {windows.map((window, index) => (
                <div key={index} className="flex items-center gap-2">
                    <TimeInput
                        value={window.startTime}
                        onChange={(next) => onChange(windows.map((item, i) => (i === index ? { ...item, startTime: next } : item)))}
                        disabled={disabled}
                        className="flex-1"
                    />
                    <span className="text-[var(--saas-ink-3)]">–</span>
                    <TimeInput
                        value={window.endTime}
                        onChange={(next) => onChange(windows.map((item, i) => (i === index ? { ...item, endTime: next } : item)))}
                        disabled={disabled}
                        className="flex-1"
                    />
                    <button
                        type="button"
                        className="saas-iconbtn"
                        onClick={() => onChange(windows.filter((_, i) => i !== index))}
                        disabled={disabled}
                        aria-label="Remove hours"
                    >
                        <X size={15} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="saas-addsplit"
                onClick={() => onChange([...windows, { startTime: "15:00", endTime: "19:00" }])}
                disabled={disabled}
            >
                <Plus size={14} /> Add split
            </button>
        </div>
    );
}

function EditDayDialog({
    schedule,
    barbers,
    initialBarberId,
    date,
    onClose,
    onChanged,
}: {
    schedule: AdminSchedule;
    barbers: AdminBarberOption[];
    initialBarberId: string;
    date: string;
    onClose: () => void;
    onChanged: (message: string) => Promise<void>;
}) {
    const initial = useMemo(() => resolveBarberDay(schedule, initialBarberId, date), [schedule, initialBarberId, date]);
    const initialLocations = assignableLocations(schedule, schedule.barbers.find((barber) => barber.id === initialBarberId));
    // Opening an off day means "add a shift": start on Working with the
    // baseline hours prefilled (or a sensible default when there is none).
    const initialWindows = (initial.working ? initial.windows : initial.baselineWindows)
        .map((window) => ({ startTime: window.startTime, endTime: window.endTime }));
    const [barberId, setBarberId] = useState(initialBarberId);
    const [working, setWorking] = useState(true);
    const [windows, setWindows] = useState(initialWindows.length > 0 ? initialWindows : [{ startTime: "10:00", endTime: "19:00" }]);
    const [locationId, setLocationId] = useState(
        initial.windows[0]?.locationId ?? initial.baselineWindows[0]?.locationId ?? initialLocations[0]?.id ?? "",
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const barber = schedule.barbers.find((candidate) => candidate.id === barberId);
    const locations = assignableLocations(schedule, barber);
    const resolved = resolveBarberDay(schedule, barberId, date);

    function selectBarber(nextBarberId: string) {
        const nextResolved = resolveBarberDay(schedule, nextBarberId, date);
        const nextLocations = assignableLocations(schedule, schedule.barbers.find((candidate) => candidate.id === nextBarberId));
        const nextWindows = (nextResolved.working ? nextResolved.windows : nextResolved.baselineWindows)
            .map((window) => ({ startTime: window.startTime, endTime: window.endTime }));
        setBarberId(nextBarberId);
        setWorking(true);
        setWindows(nextWindows.length > 0 ? nextWindows : [{ startTime: "10:00", endTime: "19:00" }]);
        setLocationId(
            nextResolved.windows[0]?.locationId ?? nextResolved.baselineWindows[0]?.locationId ?? nextLocations[0]?.id ?? "",
        );
        setError("");
    }

    const effectiveWindows = working ? windows : [];
    const sentence = describeDayEditResult({
        barberName: barber?.displayName ?? "This barber",
        date,
        locationName: locationName(schedule, locationId),
        windows: effectiveWindows,
        baselineWindows: resolved.baselineWindows,
    });
    // Every location the barber currently has hours (or a baseline) at on this
    // date — the day is edited as a whole, so other locations get cleared.
    const affectedLocationIds = Array.from(
        new Set([...resolved.windows, ...resolved.baselineWindows].map((window) => window.locationId)),
    );
    const canSave = working
        ? Boolean(locationId) && windows.length > 0 && windows.every((window) => window.startTime < window.endTime)
        : affectedLocationIds.length > 0;

    async function save() {
        if (!canSave || saving) {
            return;
        }
        try {
            setSaving(true);
            setError("");
            if (working) {
                await replaceAdminDayShift({ barberId, locationId, date, windows: effectiveWindows });
            }
            for (const otherLocationId of affectedLocationIds) {
                if (!working || otherLocationId !== locationId) {
                    await replaceAdminDayShift({ barberId, locationId: otherLocationId, date, windows: [] });
                }
            }
            await onChanged(`${barber?.displayName ?? "Barber"} updated for ${formatDayNameDate(date)}.`);
            onClose();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "That day's shift could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent size="md" className="shifts-saas" closeDisabled={saving}>
                <DialogTitle>Edit {formatDayNameDate(date)}</DialogTitle>
                <DialogDescription>Change just this day — the repeating weekly schedule stays the same.</DialogDescription>
                <div className="mt-4 grid gap-4">
                    <BarberSelectField barbers={barbers} value={barberId} onChange={selectBarber} disabled={saving} />
                    <label className="saas-field">
                        <span className="saas-field-label">This day</span>
                        <div className="saas-seg-inline" role="group">
                            <button type="button" className={working ? "on" : ""} onClick={() => setWorking(true)} disabled={saving}>Working</button>
                            <button type="button" className={!working ? "on" : ""} onClick={() => setWorking(false)} disabled={saving}>Off</button>
                        </div>
                    </label>
                    {working && (
                        <>
                            <label className="saas-field">
                                <span className="saas-field-label">Location</span>
                                <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={saving || locations.length === 0}>
                                    {locations.length === 0 && <option value="">No assigned location</option>}
                                    {locations.map((location) => (
                                        <option key={location.id} value={location.id}>{locationName(schedule, location.id)}</option>
                                    ))}
                                </Select>
                            </label>
                            <label className="saas-field">
                                <span className="saas-field-label">Hours</span>
                                <WindowsEditor windows={windows} disabled={saving} onChange={setWindows} />
                            </label>
                        </>
                    )}
                    <p className="saas-sentence">{sentence}</p>
                    {error && <p className="saas-error" role="alert">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button className={accentButtonClass} loading={saving} disabled={!canSave} onClick={() => void save()}>Save this day</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function TimeOffDialog({
    schedule,
    barbers,
    initialBarberId,
    initialDate,
    onClose,
    onChanged,
    onRefresh,
}: {
    schedule: AdminSchedule;
    barbers: AdminBarberOption[];
    initialBarberId: string;
    initialDate: string;
    onClose: () => void;
    onChanged: (message: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    const [barberId, setBarberId] = useState(initialBarberId);
    const [fromDate, setFromDate] = useState(initialDate);
    const [toDate, setToDate] = useState(initialDate);
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [bookingCheck, setBookingCheck] = useState<{ key: string; message: string } | null>(null);

    const barber = schedule.barbers.find((candidate) => candidate.id === barberId);
    const validRange = Boolean(fromDate) && Boolean(toDate) && fromDate <= toDate;
    const rangeDays = validRange ? Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) + 1 : 0;
    const rangeTooLong = rangeDays > 62;
    const rangeKey = `${barberId}|${fromDate}|${toDate}`;

    useEffect(() => {
        if (!validRange || !barberId) {
            return;
        }
        let cancelled = false;
        fetchAdminBookings({ from: fromDate, to: toDate, barberId, status: "confirmed" })
            .then((response) => {
                if (cancelled) {
                    return;
                }
                const count = response.bookings.length;
                setBookingCheck({
                    key: rangeKey,
                    message: count > 0
                        ? `${count} appointment${count === 1 ? " is" : "s are"} already booked in this period — they won't be cancelled automatically.`
                        : "",
                });
            })
            .catch(() => {
                if (!cancelled) {
                    setBookingCheck({ key: rangeKey, message: "Check the calendar for existing appointments in this period." });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [barberId, fromDate, toDate, validRange, rangeKey]);

    const bookingWarning = bookingCheck && bookingCheck.key === rangeKey ? bookingCheck.message : "";
    const sentence = describeTimeOffResult({ barberName: barber?.displayName ?? "This barber", fromDate, toDate, reason });

    async function save() {
        if (!validRange || rangeTooLong || saving) {
            return;
        }
        setSaving(true);
        setError("");
        const savedDates: string[] = [];
        try {
            const dates: string[] = [];
            for (let date = fromDate; date <= toDate; date = addDaysToLocalDate(date, 1)) {
                dates.push(date);
            }
            // Delete every existing override on the date before writing not_working,
            // so a leftover add/remove can't re-open booking on a day marked off.
            for (const day of buildTimeOffWritePlan(schedule, barberId, dates)) {
                for (const overrideId of day.deleteOverrideIds) {
                    await deleteAdminShiftOverride(overrideId);
                }
                if (!day.createNotWorking) {
                    continue;
                }
                await createAdminShiftOverride({
                    barberId,
                    locationId: null,
                    overrideDate: day.date,
                    overrideType: "not_working",
                    reason: reason.trim() || undefined,
                });
                savedDates.push(day.date);
            }
            await onChanged(`Time off saved for ${barber?.displayName ?? "barber"}.`);
            onClose();
        } catch (saveError) {
            await onRefresh();
            const savedNote = savedDates.length > 0
                ? ` ${savedDates.length} day${savedDates.length === 1 ? " was" : "s were"} already saved before it stopped.`
                : "";
            setError(`${saveError instanceof Error ? saveError.message : "Time off could not be saved."}${savedNote}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent size="md" className="shifts-saas" closeDisabled={saving}>
                <DialogTitle>Add time off</DialogTitle>
                <DialogDescription>Mark whole days off. Customers can't book these days.</DialogDescription>
                <div className="mt-4 grid gap-4">
                    <BarberSelectField barbers={barbers} value={barberId} onChange={setBarberId} disabled={saving} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="saas-field">
                            <span className="saas-field-label">First day</span>
                            <DateInput value={fromDate} onChange={(event) => setFromDate(event.target.value)} disabled={saving} />
                        </label>
                        <label className="saas-field">
                            <span className="saas-field-label">Last day</span>
                            <DateInput value={toDate} onChange={(event) => setToDate(event.target.value)} disabled={saving} />
                        </label>
                    </div>
                    <label className="saas-field">
                        <span className="saas-field-label">Reason (optional)</span>
                        <input
                            className="saas-input"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Vacation, sick, personal…"
                            list="saas-timeoff-reasons"
                            disabled={saving}
                        />
                        <datalist id="saas-timeoff-reasons">
                            <option value="Vacation" />
                            <option value="Sick" />
                            <option value="Personal" />
                            <option value="Training" />
                        </datalist>
                    </label>
                    {bookingWarning && (
                        <p className="saas-warn"><AlertTriangle size={15} /> {bookingWarning}</p>
                    )}
                    <p className="saas-sentence">{sentence}</p>
                    {!validRange && <p className="saas-error" role="alert">The last day must be on or after the first day.</p>}
                    {rangeTooLong && <p className="saas-error" role="alert">Keep time off to 62 days or less — add another stretch for longer breaks.</p>}
                    {error && <p className="saas-error" role="alert">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button className={accentButtonClass} loading={saving} disabled={!validRange || rangeTooLong} onClick={() => void save()}>Save time off</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CoverDialog({
    schedule,
    barbers,
    initialBarberId,
    initialDate,
    onClose,
    onChanged,
    onRefresh,
}: {
    schedule: AdminSchedule;
    barbers: AdminBarberOption[];
    initialBarberId: string;
    initialDate: string;
    onClose: () => void;
    onChanged: (message: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    const initialBarber = schedule.barbers.find((barber) => barber.id === initialBarberId);
    const [barberId, setBarberId] = useState(initialBarberId);
    const [coverLocationId, setCoverLocationId] = useState(
        schedule.locations.find((location) => initialBarber?.locationIds.includes(location.id))?.id ?? schedule.locations[0]?.id ?? "",
    );
    const [fromDate, setFromDate] = useState(initialDate);
    const [toDate, setToDate] = useState(initialDate);
    const [customHours, setCustomHours] = useState(false);
    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("19:00");
    const [saving, setSaving] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState("");

    const barber = schedule.barbers.find((candidate) => candidate.id === barberId);
    const validRange = Boolean(fromDate) && Boolean(toDate) && fromDate <= toDate;
    const rangeDays = validRange ? Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) + 1 : 0;
    const rangeTooLong = rangeDays > 62;
    const assigned = Boolean(barber?.locationIds.includes(coverLocationId));
    const hasUnassignedLocations = schedule.locations.some((location) => !barber?.locationIds.includes(location.id));

    const plan: CoverPlan = useMemo(
        () => buildCoverPlan(schedule, {
            barberId,
            coverLocationId,
            fromDate,
            toDate,
            startTime: customHours ? startTime : undefined,
            endTime: customHours ? endTime : undefined,
        }),
        [schedule, barberId, coverLocationId, fromDate, toDate, customHours, startTime, endTime],
    );
    const homePayload = plan.payloads.find((payload) => payload.windows.length === 0);
    const sentence = describeCoverResult({
        barberName: barber?.displayName ?? "This barber",
        coverLocationName: locationName(schedule, coverLocationId),
        fromDate,
        toDate,
        homeLocationName: homePayload ? locationName(schedule, homePayload.locationId) : undefined,
        hoursLabel: customHours ? formatClockRange12(startTime, endTime) : undefined,
        coveredCount: plan.coveredDates.length,
    });
    const canSave = validRange && !rangeTooLong && assigned && plan.coveredDates.length > 0 && (!customHours || startTime < endTime);

    async function save() {
        if (!canSave || saving) {
            return;
        }
        setSaving(true);
        setError("");
        const saved: string[] = [];
        try {
            for (const date of plan.coveredDates) {
                for (const payload of plan.payloads.filter((item) => item.date === date)) {
                    await replaceAdminDayShift(payload);
                }
                saved.push(date);
                setProgress({ done: saved.length, total: plan.coveredDates.length });
            }
            await onChanged(`${barber?.displayName ?? "Barber"} now covering ${locationName(schedule, coverLocationId)} for ${plan.coveredDates.length} day${plan.coveredDates.length === 1 ? "" : "s"}.`);
            onClose();
        } catch (saveError) {
            await onRefresh();
            const savedLabel = saved.length > 0 ? saved.map((date) => formatDayNameDate(date)).join(", ") : "no days";
            setError(`Saved ${savedLabel} before the save stopped${saveError instanceof Error ? `: ${saveError.message}` : "."}. Re-open cover to finish the remaining days.`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent size="md" className="shifts-saas" closeDisabled={saving}>
                <DialogTitle>Cover a location</DialogTitle>
                <DialogDescription>Move someone to another location for a stretch of days.</DialogDescription>
                <div className="mt-4 grid gap-4">
                    <BarberSelectField barbers={barbers} value={barberId} onChange={setBarberId} disabled={saving} />
                    <label className="saas-field">
                        <span className="saas-field-label">Cover at</span>
                        <Select value={coverLocationId} onChange={(event) => setCoverLocationId(event.target.value)} disabled={saving}>
                            {schedule.locations.map((location) => {
                                const locationAssigned = Boolean(barber?.locationIds.includes(location.id));
                                return (
                                    <option key={location.id} value={location.id} disabled={!locationAssigned}>
                                        {locationName(schedule, location.id)}{locationAssigned ? "" : " — not assigned"}
                                    </option>
                                );
                            })}
                        </Select>
                        {hasUnassignedLocations && (
                            <span className="saas-hint">Locations marked "not assigned" need to be added to {barber?.displayName ?? "them"} in Team first.</span>
                        )}
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="saas-field">
                            <span className="saas-field-label">First day</span>
                            <DateInput value={fromDate} onChange={(event) => setFromDate(event.target.value)} disabled={saving} />
                        </label>
                        <label className="saas-field">
                            <span className="saas-field-label">Last day</span>
                            <DateInput value={toDate} onChange={(event) => setToDate(event.target.value)} disabled={saving} />
                        </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--saas-ink-2)]">
                        <input type="checkbox" className="saas-checkbox" checked={customHours} onChange={(event) => setCustomHours(event.target.checked)} disabled={saving} />
                        Set specific hours (otherwise keeps their usual hours)
                    </label>
                    {customHours && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="saas-field">
                                <span className="saas-field-label">Starts</span>
                                <TimeInput value={startTime} onChange={setStartTime} disabled={saving} />
                            </label>
                            <label className="saas-field">
                                <span className="saas-field-label">Ends</span>
                                <TimeInput value={endTime} onChange={setEndTime} disabled={saving} />
                            </label>
                        </div>
                    )}
                    <p className="saas-sentence">{sentence}</p>
                    {plan.skippedDates.length > 0 && (
                        <p className="saas-hint">Skips {plan.skippedDates.length} day{plan.skippedDates.length === 1 ? "" : "s"} they don't normally work{customHours ? "" : " (turn on specific hours to cover those too)"}.</p>
                    )}
                    {saving && progress && <p className="saas-hint">Saving day {progress.done} of {progress.total}…</p>}
                    {rangeTooLong && <p className="saas-error" role="alert">Keep covers to 62 days or less — set a weekly schedule for longer moves.</p>}
                    {error && <p className="saas-error" role="alert">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button className={accentButtonClass} loading={saving} disabled={!canSave} onClick={() => void save()}>Save cover</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function WeeklyScheduleDialog({
    schedule,
    barber,
    canManage,
    onClose,
    onChanged,
}: {
    schedule: AdminSchedule;
    barber: AdminBarberOption | undefined;
    canManage: boolean;
    onClose: () => void;
    onChanged: (message: string) => Promise<void>;
}) {
    const barberId = barber?.id ?? "";
    const [draft, setDraft] = useState<WeeklyScheduleDraft>(() => buildWeeklyScheduleDraft(schedule, barberId));
    const [expandedDay, setExpandedDay] = useState(1);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState("");
    const savePlan = useMemo(() => buildWeeklyScheduleSavePlan(schedule, draft), [schedule, draft]);
    const validationIssues = useMemo(() => validateWeeklyScheduleDraft(draft), [draft]);
    const weeklyHours = calculateWeeklyScheduleHours(draft);
    const summary = barber ? describeWeeklyScheduleDraft(draft, schedule, barber.displayName) : "";

    async function save() {
        if (savePlan.length === 0) {
            return;
        }
        if (validationIssues.length > 0) {
            setNotice("Fix the highlighted items before saving.");
            return;
        }
        try {
            setSaving(true);
            setNotice("");
            await runScheduleOperations(savePlan);
            await onChanged(savePlan.length === 1 ? "Weekly schedule saved." : `${savePlan.length} schedule changes saved.`);
            onClose();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "Weekly schedule could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent size="lg" className="!max-w-[min(1440px,96vw)] !p-0" closeDisabled={saving}>
                <div className="border-b border-forest/10 p-5">
                    <DialogTitle>{barber?.displayName ?? "Weekly schedule"}</DialogTitle>
                    <DialogDescription>Weekly hours: {formatWeeklyHours(weeklyHours)}</DialogDescription>
                    <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] font-medium text-amber-900">
                        <Repeat size={15} className="mt-px shrink-0" /> This changes {barber?.displayName ?? "this barber"}'s schedule every week from now on — not just this week.
                    </p>
                </div>
                {notice && <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700" role="alert">{notice}</p>}
                {barber ? (
                    <WeeklyScheduleBuilder
                        draft={draft}
                        schedule={schedule}
                        canManage={canManage}
                        summary={summary}
                        expandedDay={expandedDay}
                        onExpandedDay={setExpandedDay}
                        onDraftChange={setDraft}
                        onDiscard={() => setDraft(buildWeeklyScheduleDraft(schedule, barberId))}
                        onSave={save}
                        saving={saving}
                        pendingChanges={savePlan.length}
                        validationIssues={validationIssues}
                    />
                ) : (
                    <p className="p-5 text-sm text-charcoal/60">Select a team member to edit their weekly schedule.</p>
                )}
            </DialogContent>
        </Dialog>
    );
}

function WeeklyScheduleBuilder({
    draft,
    schedule,
    canManage,
    summary,
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
    summary: string;
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
                <div className="flex min-w-0 flex-col gap-0.5">
                    {summary && <p className="text-[13px] font-semibold text-charcoal/80">{summary}</p>}
                    <p className={`text-xs font-bold ${validationIssues.length > 0 ? "text-red-700" : "text-charcoal/50"}`}>
                        {validationIssues.length > 0
                            ? `${validationIssues.length} schedule ${validationIssues.length === 1 ? "item needs" : "items need"} attention before saving.`
                            : `${pendingChanges} ${pendingChanges === 1 ? "change" : "changes"} pending. Weekly hours are calculated from this schedule and range.`}
                    </p>
                </div>
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

function StaffAvatar({
    barber,
    active,
    neutral,
    size = "md",
}: {
    barber: Pick<AdminBarberOption, "displayName" | "slug" | "profileImageUrl">;
    active?: boolean;
    neutral?: boolean;
    size?: "sm" | "md" | "lg";
}) {
    const source = getAdminBarberPhotoUrl(barber);
    const [imageFailed, setImageFailed] = useState(false);
    const photo = imageFailed ? undefined : source;
    const initials = barber.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    const sizeClass = size === "lg" ? "size-14 text-lg" : size === "sm" ? "size-9 text-xs" : "size-11 text-sm";

    useEffect(() => {
        setImageFailed(false);
    }, [source]);

    const ringClass = neutral ? "ring-2 ring-[#e5e7eb]" : active ? "ring-2 ring-forest/20" : "ring-1 ring-forest/10";
    const fallbackClass = neutral ? "bg-[#e9ebf0] text-[#4a5160]" : active ? "bg-forest text-white" : "bg-white text-forest";

    if (photo) {
        return (
            <img
                src={photo}
                alt={barber.displayName}
                className={`${sizeClass} shrink-0 rounded-full border border-white object-cover shadow-sm ${ringClass}`}
                decoding="async"
                loading="lazy"
                onError={() => setImageFailed(true)}
            />
        );
    }

    return (
        <span className={`grid shrink-0 place-items-center rounded-full ${sizeClass} ${fallbackClass} font-black shadow-sm`}>
            {initials || "LF"}
        </span>
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
function BlockedTimeScreen({
    schedule,
    user,
    loading,
    filters,
    onFilters,
    onRefresh,
    onChanged,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    loading: boolean;
    filters: { from: string; to: string };
    onFilters: (value: { from: string; to: string }) => void;
    onRefresh: () => Promise<void>;
    onChanged: (message: string) => Promise<void>;
}) {
    const [scopeFilter, setScopeFilter] = useState<"all" | AdminBlockedTimeScope>("all");
    const [search, setSearch] = useState("");
    const [dialog, setDialog] = useState<{ draft: AdminBlockedTime | null } | null>(null);
    const confirm = useConfirm();
    const { toast } = useToast();

    const today = todayLocalDate();
    const groups = useMemo(
        () => buildBlockedTimeGroups(schedule, user, today),
        [schedule, user, today],
    );
    const query = search.trim().toLowerCase();
    const visibleGroups = groups.map((group) => ({
        ...group,
        rows: group.rows.filter((row) => {
            if (scopeFilter !== "all" && row.scope !== scopeFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            return `${row.title} ${row.detail} ${row.locationLabel}`.toLowerCase().includes(query);
        }),
    }));
    const totalRows = groups.reduce((count, group) => count + group.rows.length, 0);
    const visibleRows = visibleGroups.reduce((count, group) => count + group.rows.length, 0);

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
            toast({ tone: "error", message: error instanceof Error ? error.message : "Blocked time could not be deleted." });
            await onRefresh();
        }
    }

    const filterActive = scopeFilter !== "all" || query.length > 0;
    const emptyCopy: Record<string, string> = filterActive
        ? {
              today: "No matches today.",
              week: "No matches this week.",
              upcoming: "No matches further out.",
          }
        : {
              today: "Nothing blocked today.",
              week: "Nothing blocked later this week.",
              upcoming: "Nothing blocked further out.",
          };

    return (
        <div className="shifts-saas">
            <div className="saas-screenhead">
                <div>
                    <h2 className="saas-screentitle">Blocked time</h2>
                    <p className="saas-screensub">
                        Short stretches customers can't book while the person is still at work. Away all day?{" "}
                        <a className="saas-link" href="/admin/shifts">Use Time off in Scheduled shifts.</a>
                    </p>
                </div>
                <Button className={accentButtonClass} onClick={() => setDialog({ draft: null })}>
                    <Plus size={16} /> Block time
                </Button>
            </div>

            <div className="saas-toolbar">
                <div className="saas-loc-seg" role="group" aria-label="Filter by type">
                    {([
                        ["all", "All"],
                        ["barber", "Barbers"],
                        ["location", "Locations"],
                        ["business", "Whole business"],
                    ] as Array<["all" | AdminBlockedTimeScope, string]>).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={scopeFilter === value}
                            className={scopeFilter === value ? "on" : ""}
                            onClick={() => setScopeFilter(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label className="saas-search">
                    <Search size={15} />
                    <input
                        placeholder="Search blocked time"
                        aria-label="Search blocked time"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </label>
                <div className="saas-blocked-range">
                    <label className="saas-blocked-rangefield">
                        <span>From</span>
                        <DateInput value={filters.from} onChange={(event) => onFilters({ ...filters, from: event.target.value })} />
                    </label>
                    <label className="saas-blocked-rangefield">
                        <span>To</span>
                        <DateInput value={filters.to} onChange={(event) => onFilters({ ...filters, to: event.target.value })} />
                    </label>
                </div>
                {loading && <RefreshCw size={16} role="status" className="animate-spin text-ink-faint" aria-label="Loading" />}
            </div>

            {totalRows === 0 ? (
                <div className="saas-blocked-allempty">
                    <Ban size={22} />
                    <p className="saas-blocked-allempty-title">No blocked time in this range.</p>
                    <p className="saas-blocked-allempty-sub">
                        Blocked time is for short stretches customers can't book while the person is still at work —
                        lunches, meetings, deep cleans. Whole days away belong in Time off.
                    </p>
                </div>
            ) : visibleRows === 0 ? (
                <div className="saas-blocked-allempty">
                    <Search size={22} />
                    <p className="saas-blocked-allempty-title">Nothing matches this view.</p>
                    <p className="saas-blocked-allempty-sub">Try a different type filter or search.</p>
                </div>
            ) : (
                visibleGroups.map((group) =>
                    group.key === "past" && group.rows.length === 0 ? null : (
                        <section key={group.key} className="saas-blocked-group">
                            <h3 className="saas-blocked-heading">{group.heading}</h3>
                            {group.rows.length === 0 ? (
                                <p className="saas-blocked-empty">{emptyCopy[group.key] ?? "Nothing here."}</p>
                            ) : (
                                <div className="saas-blocked-rows">
                                    {group.rows.map((row) => (
                                        <BlockedTimeRow
                                            key={row.blockedTime.id}
                                            row={row}
                                            schedule={schedule}
                                            onEdit={() => setDialog({ draft: row.blockedTime })}
                                            onDelete={() => void remove(row.blockedTime)}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    ),
                )
            )}

            {dialog && (
                <BlockedTimeDialog
                    schedule={schedule}
                    user={user}
                    draft={dialog.draft}
                    onClose={() => setDialog(null)}
                    onChanged={onChanged}
                />
            )}
        </div>
    );
}

function BlockedTimeRow({
    row,
    schedule,
    onEdit,
    onDelete,
}: {
    row: BlockedTimeRowView;
    schedule: AdminSchedule;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="saas-blocked-row" data-scope={row.scope}>
            <span className="saas-blocked-bar" aria-hidden="true" />
            {row.barber ? (
                <StaffAvatar barber={row.barber} size="md" />
            ) : (
                <span className="saas-blocked-scopeic" aria-hidden="true">
                    {row.scope === "business" ? <Store size={17} /> : <MapPin size={17} />}
                </span>
            )}
            <div className="saas-blocked-main">
                <p className="saas-blocked-title">{row.title}</p>
                <p className="saas-blocked-detail">{row.detail}</p>
            </div>
            <span className="saas-blocked-loc">
                {row.locationId && (
                    <span className="saas-dot" style={{ backgroundColor: locationDotColor(schedule, row.locationId) }} />
                )}
                {row.locationLabel}
            </span>
            {row.canMutate && (
                <div className="saas-blocked-actions">
                    <button type="button" className="saas-iconbtn" aria-label="Edit blocked time" title="Edit blocked time" onClick={onEdit}>
                        <Edit3 size={15} />
                    </button>
                    <button type="button" className="saas-iconbtn" aria-label="Delete blocked time" title="Delete blocked time" onClick={onDelete}>
                        <Trash2 size={15} />
                    </button>
                </div>
            )}
        </div>
    );
}

const blockedReasonPresets = ["Lunch", "Break", "Meeting", "Training"];

function BlockedTimeDialog({
    schedule,
    user,
    draft,
    initialBarberId,
    initialDate,
    lockToBarberScope,
    onClose,
    onChanged,
    onUseTimeOff,
}: {
    schedule: AdminSchedule;
    user: SafeAdminUser;
    draft: AdminBlockedTime | null;
    initialBarberId?: string;
    initialDate?: string;
    lockToBarberScope?: boolean;
    onClose: () => void;
    onChanged: (message: string) => Promise<void>;
    onUseTimeOff?: () => void;
}) {
    const owner = user.role === "owner" || user.role === "admin";
    const scopeLocked = Boolean(lockToBarberScope) || !owner;
    const draftStartDate = draft ? localDateFromIso(draft.startTime) : null;
    const draftEndDate = draft ? localDateFromIso(draft.endTime) : null;
    const draftStartTime = draft ? localTimeFromIso(draft.startTime) : null;
    const draftEndTime = draft ? localTimeFromIso(draft.endTime) : null;
    const draftIsAllDay = Boolean(
        draft &&
            draftStartTime === "00:00" &&
            draftEndTime === "00:00" &&
            draftStartDate &&
            draftEndDate === addDaysToLocalDate(draftStartDate, 1),
    );
    const draftIsMultiDay = Boolean(
        draft && !draftIsAllDay && draftStartDate && draftEndDate && draftEndDate > draftStartDate,
    );

    const [scope, setScope] = useState<AdminBlockedTimeScope>(draft?.scope ?? "barber");
    const [barberId, setBarberId] = useState(
        draft?.barberId ?? initialBarberId ?? user.barberId ?? schedule.barbers[0]?.id ?? "",
    );
    const [locationId, setLocationId] = useState(draft?.locationId ?? "");
    const [startDate, setStartDate] = useState(draftStartDate ?? initialDate ?? todayLocalDate());
    const [endDate, setEndDate] = useState(draftIsMultiDay && draftEndDate ? draftEndDate : "");
    const [multiDay, setMultiDay] = useState(draftIsMultiDay);
    const [allDay, setAllDay] = useState(draftIsAllDay);
    const [startTime, setStartTime] = useState(draftIsAllDay ? "12:00" : (draftStartTime ?? "12:00"));
    const [endTime, setEndTime] = useState(draftIsAllDay ? "13:00" : (draftEndTime ?? "13:00"));
    const [reason, setReason] = useState(draft?.reason ?? "");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    function switchScope(next: AdminBlockedTimeScope) {
        setScope(next);
        if (next === "location" && !locationId) {
            setLocationId(schedule.locations[0]?.id ?? "");
        }
        if (next === "business") {
            setLocationId("");
        }
    }

    const effectiveEndDate = allDay ? startDate : multiDay && endDate ? endDate : startDate;
    const barberName = schedule.barbers.find((barber) => barber.id === barberId)?.displayName;
    const sentence = describeBlockedTimeDraft({
        scope,
        barberName,
        locationName: locationId ? locationName(schedule, locationId) : undefined,
        startDate,
        endDate: effectiveEndDate,
        startTime,
        endTime,
        allDay,
        reason,
    });
    const validation = validateBlockedTimeDraft({
        startDate,
        endDate: effectiveEndDate,
        startTime,
        endTime,
        allDay,
    });

    async function save() {
        setSaving(true);
        setError("");
        try {
            const payload = buildBlockedTimePayload({
                scope,
                barberId: scope === "barber" ? barberId : undefined,
                locationId: scope === "location" || (scope === "barber" && locationId) ? locationId : undefined,
                startDate,
                startTime,
                endDate: effectiveEndDate,
                endTime,
                allDay,
                reason,
            } satisfies BlockedTimeFormInput);
            if (draft) {
                await updateAdminBlockedTime(draft.id, payload);
                await onChanged("Blocked time updated.");
            } else {
                await createAdminBlockedTime(payload);
                await onChanged("Blocked time created.");
            }
            onClose();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Blocked time could not be saved.");
            setSaving(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent size="md" className="shifts-saas">
                <DialogTitle>{draft ? "Edit blocked time" : "Block time"}</DialogTitle>
                <DialogDescription>
                    Customers can't book this stretch{scope === "barber" ? " — the barber stays at work" : ""}.
                </DialogDescription>
                <div className="mt-4 grid gap-4">
                    {!scopeLocked && (
                        <label className="saas-field">
                            <span className="saas-field-label">Who is this for?</span>
                            <div className="saas-seg-inline" role="group" aria-label="Who is this for?">
                                <button type="button" aria-pressed={scope === "barber"} className={scope === "barber" ? "on" : ""} onClick={() => switchScope("barber")} disabled={saving}>One barber</button>
                                <button type="button" aria-pressed={scope === "location"} className={scope === "location" ? "on" : ""} onClick={() => switchScope("location")} disabled={saving}>A whole location</button>
                                <button type="button" aria-pressed={scope === "business"} className={scope === "business" ? "on" : ""} onClick={() => switchScope("business")} disabled={saving}>The whole business</button>
                            </div>
                        </label>
                    )}
                    {scope === "barber" && (
                        <label className="saas-field">
                            <span className="saas-field-label">Team member</span>
                            <Select value={barberId} onChange={(event) => setBarberId(event.target.value)} disabled={saving || scopeLocked}>
                                {schedule.barbers.map((barber) => (
                                    <option key={barber.id} value={barber.id}>{barber.displayName}</option>
                                ))}
                            </Select>
                        </label>
                    )}
                    {scope !== "business" && (
                        <label className="saas-field">
                            <span className="saas-field-label">{scope === "barber" ? "Location" : "Which location?"}</span>
                            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={saving}>
                                {scope === "barber" && <option value="">All assigned locations</option>}
                                {schedule.locations.map((location) => (
                                    <option key={location.id} value={location.id}>{locationName(schedule, location.id)}</option>
                                ))}
                            </Select>
                        </label>
                    )}
                    <div className="saas-blocked-dialog-times">
                        <label className="saas-field">
                            <span className="saas-field-label">{multiDay && !allDay ? "First day" : "Day"}</span>
                            <DateInput value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={saving} />
                        </label>
                        {!allDay && multiDay && (
                            <label className="saas-field">
                                <span className="saas-field-label">Last day</span>
                                <DateInput value={endDate || startDate} onChange={(event) => setEndDate(event.target.value)} disabled={saving} />
                            </label>
                        )}
                        {!allDay && (
                            <>
                                <label className="saas-field">
                                    <span className="saas-field-label">From</span>
                                    <TimeInput value={startTime} onChange={setStartTime} disabled={saving} />
                                </label>
                                <label className="saas-field">
                                    <span className="saas-field-label">To</span>
                                    <TimeInput value={endTime} onChange={setEndTime} disabled={saving} />
                                </label>
                            </>
                        )}
                    </div>
                    <div className="saas-blocked-dialog-toggles">
                        <label className="saas-checkline">
                            <input
                                type="checkbox"
                                className="saas-checkbox"
                                checked={allDay}
                                disabled={saving}
                                onChange={(event) => {
                                    setAllDay(event.target.checked);
                                    if (event.target.checked) {
                                        setMultiDay(false);
                                    }
                                }}
                            />
                            All day
                        </label>
                        {!allDay && (
                            <label className="saas-checkline">
                                <input
                                    type="checkbox"
                                    className="saas-checkbox"
                                    checked={multiDay}
                                    disabled={saving}
                                    onChange={(event) => {
                                        setMultiDay(event.target.checked);
                                        if (event.target.checked && !endDate) {
                                            setEndDate(startDate);
                                        }
                                    }}
                                />
                                Spans more than one day
                            </label>
                        )}
                    </div>
                    <label className="saas-field">
                        <span className="saas-field-label">Why (optional)</span>
                        <div className="saas-blocked-presets" role="group" aria-label="Common reasons">
                            {blockedReasonPresets.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    aria-pressed={reason === preset}
                                    className={reason === preset ? "on" : ""}
                                    disabled={saving}
                                    onClick={() => setReason(reason === preset ? "" : preset)}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <input
                            className="saas-input"
                            value={reason}
                            placeholder="Lunch, meeting, deep clean…"
                            onChange={(event) => setReason(event.target.value)}
                            disabled={saving}
                        />
                    </label>
                    <p className="saas-sentence">{sentence}</p>
                    {validation && <p className="saas-error" role="alert">{validation}</p>}
                    {error && <p className="saas-error" role="alert">{error}</p>}
                    <p className="saas-hint">
                        {scope === "barber" && allDay
                            ? "A whole day off for one barber is usually Time off — that shows as a day off, not busy. "
                            : "Away the whole day? "}
                        {onUseTimeOff ? (
                            <button type="button" className="saas-link" onClick={onUseTimeOff} disabled={saving}>
                                Use Time off instead.
                            </button>
                        ) : (
                            <a className="saas-link" href="/admin/shifts">Use Time off in Scheduled shifts.</a>
                        )}
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button
                            className={accentButtonClass}
                            loading={saving}
                            disabled={Boolean(validation)}
                            onClick={() => void save()}
                        >
                            {draft ? "Save changes" : "Block this time"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Panel({ children }: { children: React.ReactNode }) {
    return <section className="rounded-md border border-forest/10 bg-white p-4">{children}</section>;
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

function InlineLoading({ label, className }: { label: string; className?: string }) {
    return <div className={`flex items-center gap-2 text-sm font-bold text-charcoal/60 ${className ?? ""}`}><RefreshCw size={16} className="animate-spin" />{label}</div>;
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

function locationName(schedule: AdminSchedule, locationId: string) {
    const name = schedule.locations.find((location) => location.id === locationId)?.name ?? "Location";
    return name.replace(/^Leaside Fades\s+/i, "");
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
