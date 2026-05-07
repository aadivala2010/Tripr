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
      setErrorMessage("Departure must be after arrival.");
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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-28 pt-4 sm:px-5 lg:px-8">
      <div className="soft-card mb-3 flex items-center justify-between rounded-[1.3rem] px-4 py-3 backdrop-blur-xl transition-all duration-300">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tripr App</p>
          <p className="mt-1 text-sm text-foreground">Plan and chat through your itinerary.</p>
        </div>
        {showPlanner ? (
          <button
            type="button"
            onClick={() => setShowPlanner(false)}
            className="rounded-full border border-line bg-white/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white"
          >
            Hide planner
          </button>
        ) : (
          <button
            type="button"
            onClick={openPlanner}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/70 text-xl leading-none text-foreground transition hover:bg-white"
            aria-label="Show planner"
          >
            +
          </button>
        )}
      </div>

      <section className="soft-card mb-3 rounded-[1.3rem] px-4 py-3 backdrop-blur-xl transition-all duration-300">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Saved Trips</p>
        {savedTrips.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {savedTrips.map((trip) => (
              <div
                key={`saved-${trip.id}`}
                className={`inline-flex items-center gap-0 rounded-full border px-0 py-0 text-xs transition ${
                  currentTrip?.id === trip.id
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-white/55 text-foreground hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => loadTrip(trip)}
                  className="px-2.5 py-1"
                >
                  {trip.location}
                </button>
                <button
                  type="button"
                  onClick={() => setTripPendingDelete(trip)}
                  className={`-ml-1 flex h-5 w-5 items-center justify-center rounded-full ${
                    currentTrip?.id === trip.id
                      ? "text-white/90 hover:bg-white/10"
                      : "text-muted hover:bg-white"
                  }`}
                  aria-label={`Delete saved trip ${trip.location}`}
                >
                  {"\u00d7"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Saved trips will appear here.</p>
        )}
      </section>

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

          <div className="mt-4 rounded-[1.35rem] bg-white/42 p-3 sm:p-4">
            <form className="space-y-4" onSubmit={handleGenerateTrip}>
              <InputField
                label="Destination"
                placeholder="Enter travel destination here"
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

              <div className="grid grid-cols-2 gap-3 rounded-[1.15rem] border border-line bg-white/60 px-3.5 py-3 text-sm">
                <TripLengthItem label="Days" value={stayLength ? String(stayLength.days) : "-"} />
                <TripLengthItem
                  label="Nights"
                  value={stayLength ? String(stayLength.nights) : "-"}
                />
              </div>

              <InputField
                label="Budget"
                placeholder="Enter total trip budget here"
                value={form.budget}
                onChange={(value) => setForm((current) => ({ ...current, budget: value }))}
              />
              <InputField
                label="Interests"
                placeholder="Enter travel interests here"
                value={form.interests}
                onChange={(value) => setForm((current) => ({ ...current, interests: value }))}
              />

              <button
                type="submit"
                disabled={isGenerating || !stayLength}
                className="w-full rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isGenerating ? "Generating itinerary..." : "Generate Itinerary"}
              </button>
            </form>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </section>

        <section className="order-2 space-y-3 transition-all duration-300">
          {showPlanner ? null : currentTrip ? (
            <>
              <div className="soft-card animate-rise-in rounded-[1.8rem] p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-foreground sm:text-4xl">
                      {currentTrip.location}
                    </h2>
                    <p className="mt-2 text-sm text-muted">{formatTripDates(currentTrip)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-[11rem]">
                    <MiniMetric label="Days" value={String(currentTrip.days.length)} />
                    <MiniMetric label="Done" value={String(visitedCount)} />
                  </div>
                </div>
              </div>

              {currentTrip.hotelRecommendations?.length ? (
                <section className="soft-card animate-rise-in rounded-[1.8rem] p-4 sm:p-5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-muted">Stay</p>
                      <h3 className="mt-2 text-xl font-semibold text-foreground">
                        Hotel Suggestions
                      </h3>
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      Budget-aware
                    </p>
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
                      className="soft-card animate-rise-in overflow-hidden rounded-[1.6rem]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDay(day.day)}
                        className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-white/18 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted">
                            Day {day.day}
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-foreground sm:text-xl">
                            {day.theme}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted">{day.summary}</p>
                        </div>
                        <div className="w-fit rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong">
                          {isOpen ? "Hide" : "View"}
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-line px-4 py-4 sm:px-5 sm:py-4">
                          <div className="space-y-2.5">
                            {day.activities.map((activity, activityIndex) => {
                              const activityKey = `${currentTrip.id}-${day.day}-${activityIndex}`;
                              const isActivityOpen = expandedActivities.includes(activityKey);

                              return (
                                <article
                                  key={`${day.day}-${activity.title}-${activityIndex}`}
                                  className={`rounded-[1.25rem] border px-4 py-3.5 transition ${
                                    activity.visited
                                      ? "border-accent/20 bg-accent-soft/60"
                                      : "border-line bg-white/60 hover:bg-white"
                                  }`}
                                >
                                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs uppercase tracking-[0.18em] text-muted">
                                        {activity.time}
                                      </p>
                                      <div className="mt-1.5 flex items-start justify-between gap-3">
                                        <h4
                                          className={`text-base font-semibold ${
                                            activity.visited ? "line-through opacity-75" : ""
                                          }`}
                                        >
                                          {activity.title}
                                        </h4>
                                        <button
                                          type="button"
                                          onClick={() => toggleActivity(activityKey)}
                                          className="flex h-6 w-6 items-center justify-center text-muted transition hover:text-foreground"
                                          aria-label={
                                            isActivityOpen
                                              ? `Hide description for ${activity.title}`
                                              : `Show description for ${activity.title}`
                                          }
                                        >
                                          <span className="text-sm leading-none">
                                            {isActivityOpen ? "\u2191" : "\u2193"}
                                          </span>
                                        </button>
                                      </div>
                                      {isActivityOpen ? (
                                        <p
                                          className={`mt-2 text-sm leading-6 text-muted ${
                                            activity.visited ? "line-through opacity-75" : ""
                                          }`}
                                        >
                                          {activity.description}
                                        </p>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleVisited(dayIndex, activityIndex)}
                                      className="inline-flex w-full items-center justify-between gap-3 rounded-full bg-white/70 px-3 py-2 sm:w-auto sm:flex-col sm:items-end sm:bg-transparent sm:px-0 sm:py-0"
                                      aria-pressed={activity.visited}
                                      aria-label={`Mark ${activity.title} as ${activity.visited ? "not visited" : "visited"}`}
                                    >
                                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                        {activity.visited ? "Visited" : "Not visited"}
                                      </span>
                                      <span
                                        className={`relative h-7 w-12 rounded-full transition duration-200 ${
                                          activity.visited ? "bg-accent/80" : "bg-foreground/12"
                                        }`}
                                      >
                                        <span
                                          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                                            activity.visited ? "left-[1.45rem]" : "left-1"
                                          }`}
                                        />
                                      </span>
                                    </button>
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
            <div className="soft-card animate-rise-in flex min-h-[300px] flex-col justify-end rounded-[1.8rem] p-5 sm:p-7">
              <div className="max-w-lg">
                <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
                  Your itinerary will appear here.
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted">
                  Open the planner with the + button to generate a trip.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {currentTrip && !chatOpen ? (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-4 right-4 z-30 rounded-full bg-foreground px-4 py-3.5 text-sm font-semibold text-white shadow-2xl transition hover:translate-y-[-2px] sm:bottom-6 sm:right-8"
        >
          Open assistant
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
    <section className="animate-rise-in glass relative overflow-hidden rounded-[2.5rem] px-5 pb-10 pt-6 sm:px-8 sm:pb-12 sm:pt-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.82),transparent_18%),radial-gradient(circle_at_82%_18%,rgba(188,91,56,0.22),transparent_18%),linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.08)_100%)]" />
      <div className="relative flex flex-col gap-10">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-muted">Tripr</p>
            <h1 className="mt-5 font-display text-5xl leading-[0.92] text-foreground sm:text-6xl lg:text-8xl">
              Plan the trip.
              <br />
              Talk to the trip.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-muted">
              Tripr creates a complete itinerary in seconds, then stays with you as a travel
              assistant that can explain, simplify, swap, and refine every day.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onGetStarted}
                className="rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
              >
                Get started
              </button>
              {hasSavedTrips ? (
                <button
                  type="button"
                  onClick={onResumeTrip}
                  className="rounded-full border border-line bg-white/55 px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-white"
                >
                  Resume trip
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3">
            <HeroCard
              eyebrow="Instant structure"
              title="Morning to evening, day by day."
              body="Tripr returns a complete itinerary instead of scattered suggestions."
            />
            <HeroCard
              eyebrow="Conversational control"
              title="Ask questions or make edits naturally."
              body="Use chat for both planning advice and full itinerary updates."
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

  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime()) || difference <= 0) {
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
    <div className="rounded-[1.75rem] border border-white/55 bg-white/58 p-5 shadow-[0_12px_36px_rgba(70,44,21,0.08)]">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-line bg-white/55 px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
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
