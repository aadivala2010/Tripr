"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { ChatResponse, HotelRecommendation, Trip } from "@/lib/types";

type FormState = {
  location: string;
  arrivalDate: string;
  departureDate: string;
  budget: string;
  interests: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const STORAGE_KEY = "tripr.saved.trips";
const ACTIVE_TRIP_KEY = "tripr.active.trip";
const CHAT_STORAGE_KEY = "tripr.chat.histories";
const LANDING_SEEN_KEY = "tripr.landing.seen";

const defaultForm: FormState = {
  location: "",
  arrivalDate: "",
  departureDate: "",
  budget: "",
  interests: "",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function TriprApp() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [savedTrips, setSavedTrips] = useState<Trip[]>([]);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [expandedDays, setExpandedDays] = useState<number[]>([]);
  const [expandedActivities, setExpandedActivities] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [tripPendingDelete, setTripPendingDelete] = useState<Trip | null>(null);
  const [chatSheetOffset, setChatSheetOffset] = useState(0);
  const [isGenerating, startGenerating] = useTransition();
  const [isChatting, startChatting] = useTransition();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const adminShortcutArmedRef = useRef(false);
  const adminShortcutTimerRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const stayLength = useMemo(
    () => getStayLength(form.arrivalDate, form.departureDate),
    [form.arrivalDate, form.departureDate],
  );

  const currentMessages = currentTrip ? chatHistories[currentTrip.id] ?? [] : [];
  const visitedCount = useMemo(() => {
    if (!currentTrip) return 0;

    return currentTrip.days.flatMap((day) => day.activities).filter((item) => item.visited)
      .length;
  }, [currentTrip]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextCurrentTrip = readJson<Trip | null>(ACTIVE_TRIP_KEY, null);
      const nextSavedTrips = readJson<Trip[]>(STORAGE_KEY, []);
      const nextChatHistories = readJson<Record<string, ChatMessage[]>>(CHAT_STORAGE_KEY, {});
      const hasSeenLanding = readJson<boolean>(LANDING_SEEN_KEY, false);

      setCurrentTrip(nextCurrentTrip);
      setSavedTrips(nextSavedTrips);
      setChatHistories(nextChatHistories);
      setExpandedDays(nextCurrentTrip ? nextCurrentTrip.days.map((day) => day.day) : []);
      setHasEnteredApp(hasSeenLanding || Boolean(nextCurrentTrip || nextSavedTrips.length));
      setShowPlanner(false);
      setIsHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTrips));
  }, [isHydrated, savedTrips]);

  useEffect(() => {
    if (!isHydrated) return;

    if (currentTrip) {
      window.localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(currentTrip));
      return;
    }

    window.localStorage.removeItem(ACTIVE_TRIP_KEY);
  }, [currentTrip, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistories));
  }, [chatHistories, isHydrated]);

  useEffect(() => {
    if (!chatOpen) return;

    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatOpen, chatHistories]);

  useEffect(() => {
    if (!chatInputRef.current) return;

    chatInputRef.current.style.height = "0px";
    chatInputRef.current.style.height = `${Math.min(chatInputRef.current.scrollHeight, 132)}px`;
  }, [chatInput]);

  useEffect(() => {
    if (!isHydrated) return;

    function handleAdminShortcut(event: KeyboardEvent) {
      if (event.shiftKey && event.key === "Enter") {
        adminShortcutArmedRef.current = true;

        if (adminShortcutTimerRef.current) {
          window.clearTimeout(adminShortcutTimerRef.current);
        }

        adminShortcutTimerRef.current = window.setTimeout(() => {
          adminShortcutArmedRef.current = false;
          adminShortcutTimerRef.current = null;
        }, 1500);
        return;
      }

      if (
        adminShortcutArmedRef.current &&
        event.shiftKey &&
        event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        adminShortcutArmedRef.current = false;

        if (adminShortcutTimerRef.current) {
          window.clearTimeout(adminShortcutTimerRef.current);
          adminShortcutTimerRef.current = null;
        }

        setHasEnteredApp(false);
        setChatOpen(false);
      }
    }

    window.addEventListener("keydown", handleAdminShortcut);
    return () => {
      window.removeEventListener("keydown", handleAdminShortcut);
      if (adminShortcutTimerRef.current) {
        window.clearTimeout(adminShortcutTimerRef.current);
      }
    };
  }, [isHydrated]);

  function enterApp() {
    window.localStorage.setItem(LANDING_SEEN_KEY, JSON.stringify(true));
    setHasEnteredApp(true);
    setShowPlanner(false);
  }

  function persistTrip(trip: Trip) {
    setCurrentTrip(trip);
    setSavedTrips((previous) => {
      const withoutCurrent = previous.filter((item) => item.id !== trip.id);
      return [trip, ...withoutCurrent].slice(0, 12);
    });
  }

  function ensureChatForTrip(trip: Trip) {
    setChatHistories((previous) => {
      if (previous[trip.id]?.length) return previous;

      return {
        ...previous,
        [trip.id]: [
          {
            id: `${trip.id}-welcome`,
            role: "assistant",
            text: `Your ${trip.location} itinerary is ready. Ask me to explain or change anything.`,
          },
        ],
      };
    });
  }

  function appendMessages(tripId: string, messages: ChatMessage[]) {
    setChatHistories((previous) => ({
      ...previous,
      [tripId]: [...(previous[tripId] ?? []), ...messages],
    }));
  }

  function toggleVisited(dayIndex: number, activityIndex: number) {
    if (!currentTrip) return;

    const nextTrip: Trip = {
      ...currentTrip,
      days: currentTrip.days.map((day, currentDayIndex) =>
        currentDayIndex !== dayIndex
          ? day
          : {
              ...day,
              activities: day.activities.map((activity, currentActivityIndex) =>
                currentActivityIndex !== activityIndex
                  ? activity
                  : { ...activity, visited: !activity.visited },
              ),
            },
      ),
    };

    persistTrip(nextTrip);
  }

  function openPlanner() {
    setForm(defaultForm);
    setErrorMessage("");
    setShowPlanner(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeChat() {
    setChatOpen(false);
    setChatSheetOffset(0);
    dragStartYRef.current = null;
  }

  function handleGenerateTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setHasEnteredApp(true);

    if (!stayLength) {
      setErrorMessage("Departure must be on or after arrival.");
      return;
    }

    startGenerating(async () => {
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: form.location,
            arrivalDate: form.arrivalDate,
            departureDate: form.departureDate,
            days: stayLength.days,
            nights: stayLength.nights,
            budget: form.budget,
            interests: form.interests,
          }),
        });

        const payload = (await response.json()) as { trip?: Trip; error?: string };

        if (!response.ok || !payload.trip) {
          throw new Error(payload.error ?? "Unable to create itinerary.");
        }

        persistTrip(payload.trip);
        ensureChatForTrip(payload.trip);
        setExpandedDays(payload.trip.days.map((day) => day.day));
        setExpandedActivities([]);
        setShowPlanner(false);
        setChatOpen(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create itinerary.";
        setErrorMessage(message);
      }
    });
  }

  function handleChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentTrip || !chatInput.trim()) return;

    const outgoingText = chatInput.trim();
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: outgoingText,
    };

    setErrorMessage("");
    setChatInput("");
    appendMessages(currentTrip.id, [userMessage]);

    startChatting(async () => {
      try {
        const response = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: outgoingText,
            trip: currentTrip,
            history: [...currentMessages, userMessage].map((message) => ({
              role: message.role,
              text: message.text,
            })),
          }),
        });

        const payload = (await response.json()) as ChatResponse & { error?: string };

        if (!response.ok || !payload.message || !payload.trip) {
          throw new Error(payload.error ?? "Unable to update itinerary.");
        }

        appendMessages(currentTrip.id, [
          {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            text: payload.message,
          },
        ]);

        if (payload.tripUpdated) {
          persistTrip(payload.trip);
          setExpandedDays(payload.trip.days.map((day) => day.day));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update itinerary.";
        setErrorMessage(message);
        appendMessages(currentTrip.id, [
          {
            id: `${Date.now()}-error`,
            role: "assistant",
            text: "I hit a snag while replying. Try asking again in a slightly different way.",
          },
        ]);
      }
    });
  }

  function toggleDay(dayNumber: number) {
    setExpandedDays((previous) =>
      previous.includes(dayNumber)
        ? previous.filter((item) => item !== dayNumber)
        : [...previous, dayNumber],
    );
  }

  function toggleActivity(activityKey: string) {
    setExpandedActivities((previous) =>
      previous.includes(activityKey)
        ? previous.filter((item) => item !== activityKey)
        : [...previous, activityKey],
    );
  }

  function loadTrip(trip: Trip) {
    setHasEnteredApp(true);
    setCurrentTrip(trip);
    ensureChatForTrip(trip);
    setExpandedDays(trip.days.map((day) => day.day));
    setExpandedActivities([]);
    setShowPlanner(false);
    setChatOpen(false);
    setErrorMessage("");
  }

  function deleteTrip(tripId: string) {
    setSavedTrips((previous) => previous.filter((trip) => trip.id !== tripId));
    setChatHistories((previous) => {
      const next = { ...previous };
      delete next[tripId];
      return next;
    });

    if (currentTrip?.id === tripId) {
      setCurrentTrip(null);
      setExpandedDays([]);
      setExpandedActivities([]);
      setChatOpen(false);
    }
  }

  function confirmDeleteTrip() {
    if (!tripPendingDelete) return;

    deleteTrip(tripPendingDelete.id);
    setTripPendingDelete(null);
  }

  function handleSheetTouchStart(event: React.TouchEvent<HTMLElement>) {
    dragStartYRef.current = event.touches[0]?.clientY ?? null;
  }

  function handleSheetTouchMove(event: React.TouchEvent<HTMLElement>) {
    if (dragStartYRef.current === null) return;

    event.preventDefault();
    const delta = event.touches[0].clientY - dragStartYRef.current;
    setChatSheetOffset(Math.max(0, delta));
  }

  function handleSheetTouchEnd() {
    if (chatSheetOffset > 90) {
      closeChat();
      return;
    }

    setChatSheetOffset(0);
    dragStartYRef.current = null;
  }

  if (!isHydrated) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <section className="glass animate-rise-in rounded-[2.5rem] px-5 py-10 sm:px-8 sm:py-12">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Tripr</p>
            <div className="mt-4 h-14 w-4/5 rounded-[1.5rem] bg-white/45" />
            <div className="mt-4 h-5 w-full rounded-full bg-white/35" />
            <div className="mt-2 h-5 w-3/4 rounded-full bg-white/35" />
            <div className="mt-8 flex gap-3">
              <div className="h-12 w-36 rounded-full bg-white/45" />
              <div className="h-12 w-36 rounded-full bg-white/30" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!hasEnteredApp) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <LandingPage
          hasSavedTrips={savedTrips.length > 0}
          onGetStarted={enterApp}
          onResumeTrip={() => {
            enterApp();
            if (savedTrips[0]) loadTrip(savedTrips[0]);
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-28 pt-6 sm:px-6 lg:px-10">
      {/* ── Top nav ── */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-semibold text-foreground tracking-tight">Tripr</span>
          {savedTrips.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2">
              {savedTrips.map((trip) => (
                <div
                  key={`saved-${trip.id}`}
                  className={`group inline-flex items-center rounded-full border text-[11px] font-medium transition ${
                    currentTrip?.id === trip.id
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-white/60 text-foreground hover:bg-white"
                  }`}
                >
                  <button type="button" onClick={() => loadTrip(trip)} className="px-3 py-1.5">
                    {trip.location}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTripPendingDelete(trip)}
                    className={`-ml-1 mr-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition ${
                      currentTrip?.id === trip.id ? "text-white/80" : "text-muted"
                    }`}
                    aria-label={`Delete saved trip ${trip.location}`}
                  >
                    {"\u00d7"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showPlanner ? (
            <button
              type="button"
              onClick={() => setShowPlanner(false)}
              className="rounded-full border border-line bg-white/70 px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-white"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={openPlanner}
              className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-white transition hover:opacity-85"
              aria-label="Plan new trip"
            >
              <span className="text-base leading-none">+</span>
              New trip
            </button>
          )}
        </div>
      </header>

      {/* ── Mobile saved trips ── */}
      {savedTrips.length > 0 && (
        <div className="mb-5 flex sm:hidden flex-wrap gap-1.5">
          {savedTrips.map((trip) => (
            <div
              key={`saved-mobile-${trip.id}`}
              className={`inline-flex items-center rounded-full border text-[11px] font-medium transition ${
                currentTrip?.id === trip.id
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-white/60 text-foreground"
              }`}
            >
              <button type="button" onClick={() => loadTrip(trip)} className="px-3 py-1.5">
                {trip.location}
              </button>
              <button
                type="button"
                onClick={() => setTripPendingDelete(trip)}
                className={`-ml-1 mr-2 text-[10px] ${currentTrip?.id === trip.id ? "text-white/80" : "text-muted"}`}
                aria-label={`Delete ${trip.location}`}
              >
                {"\u00d7"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`mt-4 grid gap-4 transition-all duration-300 ${
          showPlanner
            ? "lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] lg:items-start"
            : "grid-cols-1"
        }`}
      >
        <section
          className={`soft-card order-1 overflow-hidden rounded-[1.9rem] transition-all duration-300 ease-out ${
            showPlanner
              ? "pointer-events-auto max-h-[1200px] translate-y-0 p-4 opacity-100 sm:p-5 lg:sticky lg:top-5"
              : "pointer-events-none max-h-0 -translate-y-2 p-0 opacity-0"
          }`}
        >
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Create Trip</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground sm:text-2xl">
              Build a detailed itinerary
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleGenerateTrip}>
              <InputField
                label="Destination"
                placeholder="City, country, or region"
                value={form.location}
                onChange={(value) => setForm((current) => ({ ...current, location: value }))}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label="Arrival"
                  value={form.arrivalDate}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      arrivalDate: value,
                    }))
                  }
                />
                <DateField
                  label="Departure"
                  value={form.departureDate}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      departureDate: value,
                    }))
                  }
                />
              </div>

              {stayLength && (
                <div className="flex gap-4 rounded-[1rem] border border-line bg-white/50 px-4 py-3 text-sm">
                  <TripLengthItem label="Days" value={String(stayLength.days)} />
                  <div className="w-px bg-line" />
                  <TripLengthItem label="Nights" value={String(stayLength.nights)} />
                </div>
              )}

              <InputField
                label="Budget"
                placeholder="e.g. $2,000 total"
                value={form.budget}
                onChange={(value) => setForm((current) => ({ ...current, budget: value }))}
              />
              <InputField
                label="Interests"
                placeholder="e.g. food, art, hiking"
                value={form.interests}
                onChange={(value) => setForm((current) => ({ ...current, interests: value }))}
              />

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isGenerating || !stayLength}
                className="w-full rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "Building your itinerary…" : "Generate Itinerary"}
              </button>
            </form>
        </section>

        <section className="order-2 space-y-4 transition-all duration-300">
          {showPlanner ? null : currentTrip ? (
            <>
              <div className="soft-card animate-rise-in rounded-[2rem] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
                      {currentTrip.location}
                    </h2>
                    <p className="mt-1.5 text-sm text-muted">{formatTripDates(currentTrip)}</p>
                  </div>
                  <div className="flex gap-3 sm:flex-shrink-0">
                    <MiniMetric label="Days" value={String(currentTrip.days.length)} />
                    <MiniMetric label="Visited" value={String(visitedCount)} />
                  </div>
                </div>
              </div>

              {currentTrip.hotelRecommendations?.length ? (
                <section className="soft-card animate-rise-in rounded-[2rem] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">Where to Stay</h3>
                    <span className="text-xs font-medium text-muted">Budget-aware</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {currentTrip.hotelRecommendations.map((hotel) => (
                      <HotelCard
                        key={`${currentTrip.id}-${hotel.name}`}
                        hotel={hotel}
                        fallbackArea={currentTrip.location}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="space-y-3">
                {currentTrip.days.map((day, dayIndex) => {
                  const isOpen = expandedDays.includes(day.day);

                  return (
                    <article
                      key={`${currentTrip.id}-${day.day}`}
                      className="soft-card animate-rise-in overflow-hidden rounded-[2rem]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDay(day.day)}
                        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-white/20"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                            Day {day.day}
                          </p>
                          <h3 className="mt-1.5 text-lg font-semibold text-foreground">
                            {day.theme}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-muted">{day.summary}</p>
                        </div>
                        <span className={`mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${isOpen ? "bg-foreground text-white" : "bg-white/70 text-foreground border border-line"}`}>
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-line px-5 py-4">
                          <div className="space-y-2">
                            {day.activities.map((activity, activityIndex) => {
                              const activityKey = `${currentTrip.id}-${day.day}-${activityIndex}`;
                              const isActivityOpen = expandedActivities.includes(activityKey);

                              return (
                                <article
                                  key={`${day.day}-${activity.title}-${activityIndex}`}
                                  className={`rounded-[1.5rem] border px-4 py-3.5 transition ${
                                    activity.visited
                                      ? "border-accent/20 bg-accent-soft/50"
                                      : "border-line bg-white/60 hover:bg-white/90"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                                        {activity.time}
                                      </p>
                                      <div className="mt-1">
                                        <h4
                                          className={`text-sm font-semibold leading-snug ${
                                            activity.visited ? "line-through opacity-60" : ""
                                          }`}
                                        >
                                          {activity.title}
                                        </h4>
                                      </div>
                                      {isActivityOpen ? (
                                        <p className={`mt-1.5 text-sm leading-6 text-muted ${activity.visited ? "line-through opacity-60" : ""}`}>
                                          {activity.description}
                                        </p>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-shrink-0 flex-col items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleVisited(dayIndex, activityIndex)}
                                        className="flex-shrink-0"
                                        aria-pressed={activity.visited}
                                        aria-label={`Mark ${activity.title} as ${activity.visited ? "not visited" : "visited"}`}
                                      >
                                        <span
                                          className={`relative block h-6 w-10 rounded-full transition duration-200 ${
                                            activity.visited ? "bg-accent" : "bg-foreground/15"
                                          }`}
                                        >
                                          <span
                                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                                              activity.visited ? "left-[1.2rem]" : "left-0.5"
                                            }`}
                                          />
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => toggleActivity(activityKey)}
                                        className="flex h-6 w-6 items-center justify-center text-sm text-muted transition hover:text-foreground"
                                        aria-label={isActivityOpen ? `Hide description for ${activity.title}` : `Show description for ${activity.title}`}
                                      >
                                        {isActivityOpen ? "\u2191" : "\u2193"}
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="soft-card animate-rise-in flex min-h-[360px] flex-col justify-center rounded-[2rem] p-8 text-center sm:p-10">
              <p className="font-display text-4xl text-foreground/10 sm:text-5xl">✈</p>
              <h2 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
                Where to next?
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                Hit <strong className="text-foreground font-semibold">+ New trip</strong> above to generate a complete day-by-day itinerary in seconds.
              </p>
            </div>
          )}
        </section>
      </div>

      {currentTrip && !chatOpen ? (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm font-semibold text-white shadow-2xl transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(30,26,23,0.35)] sm:bottom-7 sm:right-8"
        >
          <span className="text-base">💬</span>
          Ask assistant
        </button>
      ) : null}

      {currentTrip ? (
        <>
          <div
            className={`fixed inset-0 z-20 bg-black/24 backdrop-blur-md transition ${
              chatOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={closeChat}
          />

          <section
            className={`glass fixed inset-x-0 bottom-0 z-30 flex h-[76dvh] flex-col rounded-t-[2rem] border-white/45 bg-[rgba(255,248,241,0.86)] px-4 pb-4 pt-4 backdrop-blur-[40px] transition duration-300 sm:bottom-6 sm:left-auto sm:right-8 sm:h-[39rem] sm:w-[24rem] sm:rounded-[2rem] sm:px-5 ${
              chatOpen
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none translate-y-full opacity-0 sm:translate-y-6"
            }`}
            style={{
              transform:
                chatOpen && chatSheetOffset > 0
                  ? `translateY(${chatSheetOffset}px)`
                  : undefined,
              overscrollBehavior: "contain",
            }}
          >
            <button
              type="button"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-foreground/12 sm:cursor-grab"
              aria-label="Drag to close assistant"
              style={{ touchAction: "none" }}
            />

            <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted">Tripr Assistant</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  Ask questions or change the plan
                </h3>
              </div>
              <button
                type="button"
                onClick={closeChat}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/65 text-lg leading-none text-foreground transition hover:bg-white"
                aria-label="Close assistant"
              >
                {"\u00d7"}
              </button>
            </div>

            <div ref={chatScrollRef} className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
              {currentMessages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {isChatting ? <TypingBubble /> : null}
            </div>

            <form
              className="mt-3 flex flex-col gap-3 border-t border-line pt-3"
              onSubmit={handleChatSubmit}
            >
              <div className="rounded-[1.35rem] border border-line bg-white/78 p-2 transition-colors duration-200 focus-within:border-accent">
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  rows={1}
                  placeholder="Ask about this trip or request a change"
                  className="max-h-[132px] min-h-[24px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isChatting || !chatInput.trim()}
                className="w-full rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isChatting ? "Thinking..." : "Send"}
              </button>
            </form>
          </section>
        </>
      ) : null}

      {tripPendingDelete ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/22 backdrop-blur-sm"
            onClick={() => setTripPendingDelete(null)}
          />
          <section className="soft-card fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[1.6rem] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Delete Trip</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">
              Remove {tripPendingDelete.location}?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This saved trip will be removed from this device.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setTripPendingDelete(null)}
                className="flex-1 rounded-full border border-line bg-white/70 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTrip}
                className="flex-1 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function LandingPage({
  hasSavedTrips,
  onGetStarted,
  onResumeTrip,
}: {
  hasSavedTrips: boolean;
  onGetStarted: () => void;
  onResumeTrip: () => void;
}) {
  return (
    <section className="animate-rise-in glass relative overflow-hidden rounded-[2.5rem] px-6 pb-12 pt-8 sm:px-10 sm:pb-16 sm:pt-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.82),transparent_18%),radial-gradient(circle_at_82%_18%,rgba(188,91,56,0.22),transparent_18%),linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.08)_100%)]" />
      <div className="relative flex flex-col gap-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent">Tripr</p>
            <h1 className="mt-6 font-display text-5xl leading-[1] text-foreground sm:text-6xl lg:text-[5.5rem]">
              Plan the trip.
              <br />
              <em className="not-italic text-accent">Talk</em> to the trip.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-muted">
              A complete day-by-day itinerary in seconds — then a travel assistant that explains, adjusts, and refines every detail with you.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onGetStarted}
                className="rounded-full bg-foreground px-7 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_12px_32px_rgba(30,26,23,0.28)]"
              >
                Start planning
              </button>
              {hasSavedTrips ? (
                <button
                  type="button"
                  onClick={onResumeTrip}
                  className="rounded-full border border-line bg-white/55 px-7 py-3.5 text-sm font-semibold text-foreground transition hover:bg-white"
                >
                  Resume last trip
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:w-64">
            <HeroCard
              eyebrow="Structured"
              title="Morning to evening, day by day."
              body="Full itineraries, not scattered suggestions."
            />
            <HeroCard
              eyebrow="Conversational"
              title="Edit anything with a message."
              body="Ask questions or request changes in plain language."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) return fallback;

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function getStayLength(arrivalDate: string, departureDate: string) {
  if (!arrivalDate || !departureDate) return null;

  const arrival = new Date(`${arrivalDate}T00:00:00`);
  const departure = new Date(`${departureDate}T00:00:00`);
  const difference = departure.getTime() - arrival.getTime();

  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime()) || difference < 0) {
    return null;
  }

  const nights = Math.round(difference / 86400000);
  return {
    nights,
    days: nights + 1,
  };
}

function formatDateLabel(value?: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-");
  const monthIndex = Number(month) - 1;

  if (!year || Number.isNaN(monthIndex) || !day || !MONTHS[monthIndex]) {
    return value;
  }

  return `${MONTHS[monthIndex]} ${Number(day)}, ${year}`;
}

function formatTripDates(trip: Trip) {
  if (trip.arrivalDate && trip.departureDate) {
    return `${formatDateLabel(trip.arrivalDate)} to ${formatDateLabel(trip.departureDate)}`;
  }

  return trip.duration;
}

function HotelCard({
  hotel,
  fallbackArea,
}: {
  hotel: HotelRecommendation;
  fallbackArea: string;
}) {
  const sourceLabel = hotel.source === "live" ? "Live market rate" : "Estimated fit";

  return (
    <article className="rounded-[1.3rem] border border-line bg-white/68 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-semibold text-foreground">{hotel.name}</h4>
        {hotel.priceLevel ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
            {hotel.priceLevel}
          </span>
        ) : null}
        <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {sourceLabel}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-muted">{hotel.area || fallbackArea}</p>
      {hotel.price ? <p className="mt-2 text-sm font-semibold text-foreground">{hotel.price}</p> : null}
      {hotel.vendor ? <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{hotel.vendor}</p> : null}
      <p className="mt-2 text-sm leading-6 text-muted">{hotel.description}</p>
    </article>
  );
}

function HeroCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/60 bg-white/52 p-5 shadow-[0_8px_28px_rgba(70,44,21,0.07)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-base font-semibold leading-snug text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-line bg-white/60 px-4 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function TripLengthItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      <input
        required
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.15rem] border border-line bg-white/88 px-4 py-3 outline-none transition focus:border-accent"
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      <input
        required
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.15rem] border border-line bg-white/88 px-4 py-3 outline-none transition focus:border-accent"
      />
    </label>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] rounded-[1.3rem] px-4 py-3 text-sm leading-6 shadow-[0_8px_22px_rgba(70,44,21,0.08)] ${
          isAssistant ? "bg-white/72 text-foreground" : "bg-foreground text-white"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-[1.3rem] bg-white/72 px-4 py-3 shadow-[0_8px_22px_rgba(70,44,21,0.08)]">
        <span className="typing-dot h-2 w-2 rounded-full bg-foreground/55" />
        <span
          className="typing-dot h-2 w-2 rounded-full bg-foreground/55"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="typing-dot h-2 w-2 rounded-full bg-foreground/55"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}
