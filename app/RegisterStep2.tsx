import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";

/** 전역 로그인정보 */
const getAuthGlobal = () => (globalThis as any).__RUNFIT_AUTH__ || null;

type DistanceType = "3K" | "5K" | "10K" | "HALF" | "CUSTOM";
type GoalMode = "DISTANCE" | "TIME" | "FREE";
type UiStep = "CALENDAR" | "RUN";
type RunState = "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";

type Profile = {
  ok: boolean;
  gender: string | null;
  birth: string | null;
  weightKg: number | null;
  heightCm: number | null;
};

/** ✅ 캘린더 초록불용 월 요약 타입 */
type MonthRunItem = {
  runKm?: number;
  distanceKm?: number;
  burnKcal?: number;
  calories?: number;

  durationSeconds?: number;
  durationSec?: number;
  durationMin?: number;
};
type MonthRunResponse = {
  ok?: boolean;
  ym?: string;
  byDate?: Record<string, MonthRunItem>;
  dates?: string[];
};

// ✅ day 상세 + splits 연동용 타입
type SplitItem = { km: number; m: number; sec: number };

type DayRunItem = {
  runId?: number; // ✅ run_record.id
  runNo?: string;
  distanceType?: string;
  distanceKm: number;
  calories: number;
  durationSeconds: number;
  memo: string | null;
};

type DayDetailResponse = {
  ok: boolean;
  date: string;
  totalKm: number;
  totalKcal: number;
  totalSeconds: number;
  items: DayRunItem[];
};

const notify = (title: string, msg: string) => {
  if (Platform.OS === "web") (globalThis as any).alert?.(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getToday() {
  return toISODate(new Date());
}
function ymOf(y: number, m0: number) {
  return `${y}-${String(m0 + 1).padStart(2, "0")}`;
}

function presetToKm(type: DistanceType): number | null {
  if (type === "3K") return 3.0;
  if (type === "5K") return 5.0;
  if (type === "10K") return 10.0;
  if (type === "HALF") return 21.0975;
  return null;
}

function hmsToSeconds(hms: string): number | null {
  const s = String(hms || "").trim();
  const m = s.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ss = parseInt(m[3], 10);
  if ([hh, mm, ss].some((v) => Number.isNaN(v))) return null;
  return hh * 3600 + mm * 60 + ss;
}
function secToHms(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function secToMmss(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** 하버사인 */
function toRad(v: number) {
  return (v * Math.PI) / 180;
}
function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/** 월 캘린더 (월요일 시작) */
function buildMonthGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const firstDow = first.getDay(); // 0=Sun
  const monStart = (firstDow + 6) % 7;

  const start = new Date(year, month0, 1);
  start.setDate(start.getDate() - monStart);

  const cells: { date: Date; iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: d, iso: toISODate(d), inMonth: d.getMonth() === month0 });
  }
  return cells;
}

// ✅ 하단 탭 크게 (index.tsx와 동일)
const TAB_H = 96;

// ✅ 터치 영역 확대(공통)
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

/* =========================
   ✅ 전역 테마 저장소 (RegisterGoal.tsx와 동일 키)
========================= */
type ThemeMode = "dark" | "light";
type ThemeBus = { subs: Set<(m: ThemeMode) => void> };

const THEME_MODE_KEY = "__RUNFIT_THEME_MODE__";
const THEME_BUS_KEY = "__RUNFIT_THEME_BUS__";

function getThemeBus(): ThemeBus {
  const g = globalThis as any;
  if (!g[THEME_BUS_KEY]) g[THEME_BUS_KEY] = { subs: new Set() };
  return g[THEME_BUS_KEY] as ThemeBus;
}

function getThemeModeGlobal(): ThemeMode {
  const g = globalThis as any;
  const v = g[THEME_MODE_KEY] as ThemeMode | undefined;
  return v === "light" || v === "dark" ? v : "dark";
}

function subscribeThemeMode(listener: (m: ThemeMode) => void): () => void {
  const bus = getThemeBus();
  bus.subs.add(listener);
  return () => bus.subs.delete(listener);
}

const DARK_UI = {
  mode: "dark" as const,
  bg: "#0b0f14",
  card: "#0f1620",
  card2: "rgba(255,255,255,0.03)",
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  green: "#6dff8b",
  danger: "#ff5a5f",
  pillActiveBg: "rgba(109,255,139,0.14)",
  pillActiveBgStrong: "rgba(109,255,139,0.18)",
  pillActiveBorder: "rgba(109,255,139,0.35)",
  pillActiveBorderStrong: "rgba(109,255,139,0.55)",
  pillIdleBg: "rgba(255,255,255,0.03)",
  warnBg: "rgba(255,90,95,0.10)",
  warnBorder: "rgba(255,90,95,0.35)",
  onGreenText: "#08110b",
};

const LIGHT_UI = {
  mode: "light" as const,
  bg: "#f6f8fb",
  card: "rgba(15,23,42,0.04)",
  card2: "rgba(15,23,42,0.03)",
  line: "rgba(15,23,42,0.14)",
  text: "rgba(11,15,20,0.92)",
  muted: "rgba(11,15,20,0.60)",
  green: "#18a957",
  danger: "#ef4444",
  pillActiveBg: "rgba(24,169,87,0.14)",
  pillActiveBgStrong: "rgba(24,169,87,0.18)",
  pillActiveBorder: "rgba(24,169,87,0.28)",
  pillActiveBorderStrong: "rgba(24,169,87,0.45)",
  pillIdleBg: "rgba(15,23,42,0.04)",
  warnBg: "rgba(239,68,68,0.10)",
  warnBorder: "rgba(239,68,68,0.30)",
  onGreenText: "#ffffff",
};

function useRunFitTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeModeGlobal());

  useEffect(() => {
    const unsub = subscribeThemeMode((m) => setMode(m));
    return unsub;
  }, []);

  const ui = useMemo(() => (mode === "dark" ? DARK_UI : LIGHT_UI), [mode]);
  return { mode, ui };
}
/* ========================= */

export default function Record() {
  const pathname = usePathname();
  const { ui } = useRunFitTheme();

  // ✅ 서버 주소(너 환경에 맞게 1곳만!)
  // NOTE: 너 프로젝트 컨텍스트가 RunFit 인지 RunFIT_ 인지 맞춰서 여기만 바꿔.
  const BASE_URL = "http://172.20.10.4:8080/RunFIT_";

  const auth = getAuthGlobal();
  const userId: number | null = auth?.userId ?? null;
  const isGuest = !userId;

  // ✅ 오늘(세션 기준): 측정/저장은 무조건 이 날짜로만
  const todayISO = useMemo(() => getToday(), []);

  // ===== UI Step =====
  const [step, setStep] = useState<UiStep>("CALENDAR");

  // ===== 날짜 선택(보기용) =====
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const init = new Date();
  const [viewY, setViewY] = useState(init.getFullYear());
  const [viewM, setViewM] = useState(init.getMonth());

  // ✅ 월 캘린더 초록불 데이터
  const [monthRuns, setMonthRuns] = useState<Record<string, MonthRunItem>>({});
  const [loadingMonthRuns, setLoadingMonthRuns] = useState(false);

  // ✅ 날짜 터치 -> day 상세 모달 (열람)
  const [dayModalOpen, setDayModalOpen] = useState(false);

  // ✅ day 상세 + splits 캐시
  const [dayDetail, setDayDetail] = useState<DayDetailResponse | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  const [splitMap, setSplitMap] = useState<Record<number, SplitItem[]>>({});
  const splitMapRef = useRef<Record<number, SplitItem[]>>({});

  // ===== “오늘 시작” 플로우 모달 =====
  const [startModeModalOpen, setStartModeModalOpen] = useState(false);
  const [distanceModalOpen, setDistanceModalOpen] = useState(false);
  const [timeModalOpen, setTimeModalOpen] = useState(false);

  // ✅✅✅ 숫자 셀렉트(드롭다운 느낌) 모달
  const [numPickerOpen, setNumPickerOpen] = useState(false);
  const [numPickerTitle, setNumPickerTitle] = useState("");
  const [numPickerValues, setNumPickerValues] = useState<number[]>([]);
  const [numPickerSelected, setNumPickerSelected] = useState<number>(0);
  const numPickerOnPickRef = useRef<(v: number) => void>(() => {});

  const openNumberPicker = (title: string, values: number[], selected: number, onPick: (v: number) => void) => {
    numPickerOnPickRef.current = onPick;
    setNumPickerTitle(title);
    setNumPickerValues(values);
    setNumPickerSelected(selected);
    setNumPickerOpen(true);
  };

  // ===== 플랜 선택(거리/시간/자유) =====
  const [goalMode, setGoalMode] = useState<GoalMode>("DISTANCE");

  const [planDistanceType, setPlanDistanceType] = useState<DistanceType>("5K");
  const [targetKmText, setTargetKmText] = useState<string>("5.00");

  // 시간 목표(셀렉트)
  const [pickH, setPickH] = useState(0);
  const [pickM, setPickM] = useState(30);
  const [pickS, setPickS] = useState(0);
  const [targetTimeText, setTargetTimeText] = useState<string>("00:30:00");

  // ===== 기록 입력(메모) =====
  const [memo, setMemo] = useState<string>("");

  // ===== 저장용 타입/결과 =====
  const [distanceType, setDistanceType] = useState<DistanceType>("CUSTOM"); // 저장용 타입
  const [distanceKm, setDistanceKm] = useState<string>("0.00"); // 실제 측정 누적
  const [timeHms, setTimeHms] = useState<string>("00:00:00");

  // 프로필/칼로리
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileHint, setProfileHint] = useState<string>(isGuest ? "ゲストモード：保存不可" : "プロフィール読み込み中...");
  const [calories, setCalories] = useState<number | null>(null);

  // ✅ 로그창 제거 요청 → UI 표시 안 함 (디버그 값은 남겨둠)
  const [resultText, setResultText] = useState<string>("");

  // ===== GPS 측정 =====
  const [runState, setRunState] = useState<RunState>("IDLE");
  const [gpsHint, setGpsHint] = useState<string>(""); // ✅ UI에서는 안 보여줌(요구사항)

  const gpsSubRef = useRef<Location.LocationSubscription | null>(null);
  const startMsRef = useRef<number>(0); // 세그먼트 시작 시각
  const accMsRef = useRef<number>(0); // 누적(일시정지 포함)
  const elapsedSecRef = useRef<number>(0);

  const metersRef = useRef<number>(0);
  const timerRef = useRef<any>(null);

  const runningRef = useRef<boolean>(false);
  const finishOnceRef = useRef<boolean>(false);

  const lastGoodRef = useRef<{ lat: number; lon: number; ts: number; acc: number | null } | null>(null);
  const lastSmoothRef = useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const lastSpeedRef = useRef<number | null>(null);
  const lockCountRef = useRef<number>(0);

  // ✅ “목표 자동 종료” 최신값 ref
  const goalModeRef = useRef<GoalMode>("DISTANCE");
  const targetKmRef = useRef<number | null>(5.0);
  const targetSecRef = useRef<number | null>(1800);

  useEffect(() => {
    goalModeRef.current = goalMode;
  }, [goalMode]);

  useEffect(() => {
    const km = Number(targetKmText);
    targetKmRef.current = Number.isFinite(km) && km > 0 ? km : null;
  }, [targetKmText]);

  useEffect(() => {
    const sec = hmsToSeconds(targetTimeText);
    targetSecRef.current = sec != null && sec > 0 ? sec : null;
  }, [targetTimeText]);

  /** ✅ 월별 런닝 기록 날짜 가져오기 (캘린더 초록불) */
  const loadMonthRuns = async (ym: string) => {
    if (!userId) {
      setMonthRuns({});
      return;
    }
    setLoadingMonthRuns(true);
    try {
      const url = `${BASE_URL}/api/record/add?mode=calendar&ym=${encodeURIComponent(ym)}`;
      const res = await fetch(url, { method: "GET", headers: { "X-USER-ID": String(userId) } });

      const text = await res.text();
      let data: MonthRunResponse | any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok) {
        setMonthRuns({});
        return;
      }

      if (data?.byDate && typeof data.byDate === "object") {
        setMonthRuns(data.byDate);
        return;
      }

      if (Array.isArray(data?.dates)) {
        const m: Record<string, MonthRunItem> = {};
        data.dates.forEach((d: string) => (m[d] = { runKm: 1 }));
        setMonthRuns(m);
        return;
      }

      if (Array.isArray(data)) {
        const m: Record<string, MonthRunItem> = {};
        data.forEach((d: string) => (m[d] = { runKm: 1 }));
        setMonthRuns(m);
        return;
      }

      setMonthRuns({});
    } catch {
      setMonthRuns({});
    } finally {
      setLoadingMonthRuns(false);
    }
  };

  // ✅ runId로 splits 가져오기
  const loadSplitsByRunId = async (runId: number) => {
    if (!userId) return;
    if (splitMapRef.current[runId]) return; // ✅ 캐시 있으면 끝

    try {
      const url = `${BASE_URL}/api/record/add?mode=splits&runId=${encodeURIComponent(String(runId))}`;

      const res = await fetch(url, { method: "GET", headers: { "X-USER-ID": String(userId) } });
      const text = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      const splits: SplitItem[] = res.ok && data?.ok && Array.isArray(data?.splits) ? data.splits : [];

      splitMapRef.current = { ...splitMapRef.current, [runId]: splits };
      setSplitMap((prev) => ({ ...prev, [runId]: splits }));
    } catch {
      splitMapRef.current = { ...splitMapRef.current, [runId]: [] };
      setSplitMap((prev) => ({ ...prev, [runId]: [] }));
    }
  };

  // ✅ day 상세 로드: /api/record/add?mode=day
  const loadDayDetail = async (dateISO: string) => {
    if (!userId) {
      setDayDetail(null);
      return;
    }
    setLoadingDay(true);
    try {
      const url = `${BASE_URL}/api/record/add?mode=day&date=${encodeURIComponent(dateISO)}`;
      const res = await fetch(url, { method: "GET", headers: { "X-USER-ID": String(userId) } });
      const text = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!res.ok || !data?.ok) {
        setDayDetail(null);
        return;
      }

      setDayDetail(data as DayDetailResponse);

      // ✅ runId 있으면 splits 미리 로드
      const items: DayRunItem[] = Array.isArray(data.items) ? data.items : [];
      items.forEach((it) => {
        if (it.runId) loadSplitsByRunId(it.runId);
      });
    } catch {
      setDayDetail(null);
    } finally {
      setLoadingDay(false);
    }
  };

  useEffect(() => {
    if (!userId) {
      setMonthRuns({});
      return;
    }
    loadMonthRuns(ymOf(viewY, viewM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewY, viewM, userId]);

  /** 프로필 로드 (로그인일 때만) */
  const loadProfile = async () => {
    if (!userId) return;

    const url = `${BASE_URL}/api/record/add?mode=profile`;
    try {
      const res = await fetch(url, { method: "GET", headers: { "X-USER-ID": String(userId) } });
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!res.ok || !data?.ok) {
        setProfile(null);
        setProfileHint("プロフィール情報がありません（身長/体重/生年月日）→ カロリーは未計算/不正確");
        return;
      }

      const p: Profile = {
        ok: true,
        gender: data.gender ?? null,
        birth: data.birth ?? null,
        weightKg: typeof data.weightKg === "number" ? data.weightKg : data.weightKg ? Number(data.weightKg) : null,
        heightCm: typeof data.heightCm === "number" ? data.heightCm : data.heightCm ? Number(data.heightCm) : null,
      };
      setProfile(p);

      if (!p.weightKg || !p.birth) setProfileHint("体重/生年月日の一部が未入力 → カロリー精度が低下");
      else setProfileHint(`プロフィールOK（体重 ${p.weightKg}kg / 生年月日 ${p.birth}）`);
    } catch (e: any) {
      setProfile(null);
      setProfileHint(`プロフィール読込失敗: ${String(e?.message || e)}`);
    }
  };

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileHint("ゲストモード：測定は可能ですが保存はできません");
      return;
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // calories 계산(필요하면 나중에)
  useEffect(() => {
    const km = Number(distanceKm);
    const sec = hmsToSeconds(timeHms);
    if (!km || km <= 0 || sec == null || sec <= 0) {
      setCalories(null);
      return;
    }
    setCalories(null);
  }, [distanceKm, timeHms, profile]);

  // ✅ RUN 들어가면 날짜는 무조건 오늘로 고정
  useEffect(() => {
    if (step === "RUN" && selectedDate !== todayISO) setSelectedDate(todayISO);
  }, [step, selectedDate, todayISO]);

  // ===== 선택일(모달/요약) 계산 =====
  const picked = monthRuns[selectedDate];

  const pickedKm = Number(picked?.distanceKm ?? picked?.runKm ?? 0);
  const pickedKcal = Number(picked?.burnKcal ?? picked?.calories ?? 0);

  const pickedSecRaw =
    Number(picked?.durationSeconds ?? picked?.durationSec ?? 0) ||
    (picked?.durationMin != null ? Number(picked.durationMin) * 60 : 0);

  const pickedSec = Number.isFinite(pickedSecRaw) ? Math.max(0, Math.floor(pickedSecRaw)) : 0;
  const pickedTime = pickedSec > 0 ? secToHms(pickedSec) : "-";

  const pickedHas = pickedKm > 0.0001 || pickedKcal > 0.1 || pickedSec > 0;
  const isTodayPicked = selectedDate === todayISO;

  const metersText = `${Math.round(Number(distanceKm || 0) * 1000)} m`;

  // ===== “오늘 저장 슬롯” 계산 (최대 2개) =====
  const getNextRunNo = async (): Promise<"1" | "2" | null> => {
    if (!userId) return null;
    try {
      const url = `${BASE_URL}/api/record/add?mode=day&date=${encodeURIComponent(todayISO)}`;
      const res = await fetch(url, { method: "GET", headers: { "X-USER-ID": String(userId) } });
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      const used = new Set<string>();
      items.forEach((it) => {
        if (it?.runNo != null) used.add(String(it.runNo));
      });

      if (!used.has("1")) return "1";
      if (!used.has("2")) return "2";
      return null;
    } catch {
      return "1";
    }
  };

  // ===== GPS 내부 유틸 =====
  const clearGpsSub = () => {
    if (gpsSubRef.current) {
      gpsSubRef.current.remove();
      gpsSubRef.current = null;
    }
  };
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const resetLockState = () => {
    lastGoodRef.current = null;
    lastSmoothRef.current = null;
    lastSpeedRef.current = null;
    lockCountRef.current = 0;
  };

  const stopAllTracking = () => {
    clearGpsSub();
    clearTimer();
    runningRef.current = false; // ✅ 스테일 방지
  };

  const ensureLocationReady = async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      notify("未対応", "WebではGPS測定が不安定です。スマホ実機で使ってください。");
      return false;
    }

    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      notify("位置情報", "位置情報サービス(GPS)がOFFです。ONにしてください。");
      return false;
    }

    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      notify("位置情報", "位置情報の権限を許可してください。");
      return false;
    }
    return true;
  };

  // ===== 자동 저장 (RUN 종료 시 호출) =====
  const saveToServer = async (finalKm: number, finalSec: number, saveType: DistanceType) => {
    if (isGuest) {
      notify("ゲストモード", "ゲストは保存できません。ログインすると保存できます。");
      return;
    }
    if (!userId) return;

    if (finalKm <= 0) return notify("保存不可", "距離が 0 です。走ってから保存してください。");
    if (finalSec <= 0) return notify("保存不可", "時間が 0 です。");

    const nextNo = await getNextRunNo();
    if (!nextNo) {
      notify("保存不可", "本日の記録は最大 2件までです（RUN1/RUN2）。");
      return;
    }

    const durationMinCompat = Math.round(finalSec / 60);

    const url = `${BASE_URL}/RecordServlet?mode=add`;

    const form = new URLSearchParams();
    form.append("date", todayISO); // ✅ 무조건 오늘로 저장
    form.append("runNo", String(nextNo));
    form.append("distanceType", saveType);
    form.append("distanceKm", String(finalKm));
    form.append("durationSeconds", String(finalSec));
    form.append("durationMin", String(durationMinCompat));
    form.append("calories", String(calories ?? 0));
    form.append("memo", memo ?? "");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-USER-ID": String(userId),
        },
        body: form.toString(),
      });

      const text = await res.text();
      setResultText(`SAVE DONE\nHTTP: ${res.status} (${res.ok ? "OK" : "NG"})\nRUN_NO=${nextNo}\n\n${text}\n`);

      if (!res.ok) notify("保存失敗", text);
      else {
        notify("保存完了", `記録を保存しました。（RUN ${nextNo}）`);
        loadMonthRuns(ymOf(viewY, viewM));
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      setResultText(`SAVE ERROR\n${msg}\n`);
      notify("通信エラー", msg);
    }
  };

  // ✅✅✅ 기록 삭제 (RecordApiServlet로)
  const deleteRunOnServer = async (runId: number) => {
    if (isGuest || !userId) {
      notify("削除不可", "ゲストは削除できません。ログインしてください。");
      return;
    }

    try {
      const url = `${BASE_URL}/api/record/add?mode=delete`;

      const form = new URLSearchParams();
      form.append("runId", String(runId));

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-USER-ID": String(userId),
        },
        body: form.toString(),
      });

      const text = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!res.ok || !data?.ok) {
        notify("削除失敗", data?.message || text || `HTTP ${res.status}`);
        return;
      }

      // 캐시 삭제
      const copyRef = { ...splitMapRef.current };
      delete copyRef[runId];
      splitMapRef.current = copyRef;
      setSplitMap((prev) => {
        const p = { ...prev };
        delete p[runId];
        return p;
      });

      notify("削除完了", "記録を削除しました。");

      // 화면 갱신
      await loadDayDetail(selectedDate);
      await loadMonthRuns(ymOf(viewY, viewM));
    } catch (e: any) {
      notify("通信エラー", String(e?.message || e));
    }
  };

  const confirmDelete = (runId: number) => {
    Alert.alert("削除", "この記録を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => deleteRunOnServer(runId),
      },
    ]);
  };

  // ✅ 자동 종료 + 자동 저장
  const finishRunAndAutoSave = async (reason?: string) => {
    if (finishOnceRef.current) return;
    finishOnceRef.current = true;

    if (runningRef.current) {
      accMsRef.current += Math.max(0, Date.now() - startMsRef.current);
    }

    stopAllTracking();
    setRunState("FINISHED");
    setGpsHint("");

    const finalSec = Math.max(1, Math.round(accMsRef.current / 1000));
    elapsedSecRef.current = finalSec;
    setTimeHms(secToHms(finalSec));

    const finalKm = metersRef.current / 1000;
    setDistanceKm(finalKm.toFixed(2));

    if (!isGuest && userId) {
      await saveToServer(finalKm, finalSec, distanceType);
    } else if (reason) {
      notify("終了", `${reason}\n距離: ${finalKm.toFixed(2)} km\n時間: ${secToHms(finalSec)}`);
    }
  };

  // ===== GPS 측정 시작/재개 =====
  const startOrResumeTracking = async () => {
    if (selectedDate !== todayISO) {
      notify("測定不可", `測定は今日（${todayISO}）のみ可能です。`);
      return;
    }

    if (goalModeRef.current === "DISTANCE") {
      const km = targetKmRef.current;
      if (km == null) return notify("入力エラー", "目標距離(km)を正しく設定してください。");
    }
    if (goalModeRef.current === "TIME") {
      const sec = targetSecRef.current;
      if (sec == null) return notify("入力エラー", "目標時間(時/分/秒)を正しく設定してください。");
    }

    const ok = await ensureLocationReady();
    if (!ok) return;

    if (runState === "IDLE" || runState === "FINISHED") {
      finishOnceRef.current = false;
      metersRef.current = 0;
      accMsRef.current = 0;
      elapsedSecRef.current = 0;
      setDistanceKm("0.00");
      setTimeHms("00:00:00");
      resetLockState();
      setMemo("");

      if (goalModeRef.current === "DISTANCE") {
        setDistanceType(planDistanceType === "CUSTOM" ? "CUSTOM" : planDistanceType);
      } else {
        setDistanceType("CUSTOM");
      }
    }

    startMsRef.current = Date.now();
    runningRef.current = true;
    setRunState("RUNNING");
    setGpsHint("");
    resetLockState();

    clearTimer();
    timerRef.current = setInterval(() => {
      const elapsedMs = accMsRef.current + (Date.now() - startMsRef.current);
      const elapsedSec = elapsedMs / 1000;
      elapsedSecRef.current = elapsedSec;
      setTimeHms(secToHms(elapsedSec));

      if (goalModeRef.current === "TIME") {
        const target = targetSecRef.current;
        if (target != null && elapsedSec >= target) {
          finishRunAndAutoSave(`目標時間 ${targetTimeText} に到達！`);
        }
      }
    }, 250);

    clearGpsSub();
    gpsSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (loc) => {
        if (!runningRef.current) return;

        const { latitude, longitude, accuracy } = loc.coords;
        const ts = typeof loc.timestamp === "number" ? loc.timestamp : Date.now();
        const acc = typeof accuracy === "number" ? accuracy : null;

        const ACC_RUN_MAX = 50;
        const SPEED_CAP = 7.5; // m/s
        const MIN_MOVE = 0.8;
        const TAU = 3.0;

        const totalElapsedMs = accMsRef.current + Math.max(0, Date.now() - startMsRef.current);
        const lockAccMax = totalElapsedMs < 15000 ? 25 : 40;

        if (!lastGoodRef.current) {
          if (acc != null && acc <= lockAccMax) {
            lockCountRef.current += 1;
            if (lockCountRef.current >= 2) {
              lastGoodRef.current = { lat: latitude, lon: longitude, ts, acc };
              lastSmoothRef.current = { lat: latitude, lon: longitude, ts };
            }
          } else {
            lockCountRef.current = 0;
          }
          return;
        }

        if (acc != null && acc > ACC_RUN_MAX) return;

        const prev = lastGoodRef.current;
        const dt = Math.max(0.5, (ts - prev.ts) / 1000);

        const dRaw = haversineMeters(prev.lat, prev.lon, latitude, longitude);
        const vRaw = dRaw / dt;

        const maxDist = SPEED_CAP * dt + 5;

        if (dRaw < MIN_MOVE) {
          const ps0 = lastSmoothRef.current ?? { lat: prev.lat, lon: prev.lon, ts: prev.ts };
          const accFactor0 = acc == null ? 1.0 : clamp(20 / acc, 0.25, 1.0);
          const alphaBase0 = dt / (TAU + dt);
          const alpha0 = clamp(alphaBase0 * accFactor0, 0.05, 0.55);

          const sLat0 = ps0.lat + alpha0 * (latitude - ps0.lat);
          const sLon0 = ps0.lon + alpha0 * (longitude - ps0.lon);

          lastSmoothRef.current = { lat: sLat0, lon: sLon0, ts };
          lastGoodRef.current = { lat: latitude, lon: longitude, ts, acc };
          return;
        }

        if (vRaw > SPEED_CAP || dRaw > maxDist) return;

        const ps = lastSmoothRef.current ?? { lat: prev.lat, lon: prev.lon, ts: prev.ts };
        const accFactor = acc == null ? 1.0 : clamp(20 / acc, 0.25, 1.0);
        const alphaBase = dt / (TAU + dt);
        const alpha = clamp(alphaBase * accFactor, 0.05, 0.55);

        const sLat = ps.lat + alpha * (latitude - ps.lat);
        const sLon = ps.lon + alpha * (longitude - ps.lon);

        const dSmooth = haversineMeters(ps.lat, ps.lon, sLat, sLon);
        const vSmooth = dSmooth / dt;

        if (lastSpeedRef.current != null) {
          const accel = (vSmooth - lastSpeedRef.current) / dt;
          if (Math.abs(accel) > 6) return;
        }

        metersRef.current += dSmooth;
        lastSmoothRef.current = { lat: sLat, lon: sLon, ts };
        lastGoodRef.current = { lat: latitude, lon: longitude, ts, acc };
        lastSpeedRef.current = vSmooth;

        const kmNow = metersRef.current / 1000;
        setDistanceKm(kmNow.toFixed(2));

        if (goalModeRef.current === "DISTANCE") {
          const targetKm = targetKmRef.current;
          if (targetKm != null && kmNow >= targetKm) {
            finishRunAndAutoSave(`目標距離 ${targetKm.toFixed(2)}km に到達！`);
          }
        }
      }
    );
  };

  const pauseTracking = () => {
    if (runState !== "RUNNING") return;

    if (runningRef.current) {
      accMsRef.current += Math.max(0, Date.now() - startMsRef.current);
    }

    stopAllTracking();
    setRunState("PAUSED");

    const sec = Math.max(1, Math.round(accMsRef.current / 1000));
    elapsedSecRef.current = sec;
    setTimeHms(secToHms(sec));

    setGpsHint("");
    resetLockState();
  };

  const cancelAndReset = () => {
    stopAllTracking();
    setRunState("IDLE");
    setGpsHint("");
    finishOnceRef.current = false;
    resetLockState();

    metersRef.current = 0;
    accMsRef.current = 0;
    elapsedSecRef.current = 0;
    setDistanceKm("0.00");
    setTimeHms("00:00:00");
  };

  useEffect(() => {
    return () => {
      stopAllTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 캘린더 =====
  const cells = buildMonthGrid(viewY, viewM);
  const monthTitle = `${viewY}-${String(viewM + 1).padStart(2, "0")}`;

  const gotoPrevMonth = () => {
    const d = new Date(viewY, viewM, 1);
    d.setMonth(d.getMonth() - 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };
  const gotoNextMonth = () => {
    const d = new Date(viewY, viewM, 1);
    d.setMonth(d.getMonth() + 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  const planSummary = (() => {
    if (goalMode === "DISTANCE") return `距離: ${targetKmText} km (${planDistanceType === "CUSTOM" ? "自由" : planDistanceType})`;
    if (goalMode === "TIME") return `時間: ${targetTimeText}`;
    return `自由`;
  })();

  const activeKey = (() => {
    if (pathname === "/") return "ホーム";
    if (pathname?.toLowerCase().includes("record")) return "記録";
    if (pathname?.toLowerCase().includes("fooddate")) return "栄養";
    if (pathname?.toLowerCase().includes("ranking")) return "ランキング";
    if (pathname?.toLowerCase().includes("account")) return "アカウント";
    return "記録";
  })();

  const onTap = (label: string) => {
    if (label === "ホーム") router.push("/");
    else if (label === "記録") router.push("/Record");
    else if (label === "栄養") router.push("/FoodDate");
    else if (label === "ランキング") router.push("/Ranking");
    else if (label === "アカウント") router.push("/Account");
  };

  // ✅✅✅ 오늘 측정 시작: 버튼 누르면 "거리/시간 선택 모달"이 무조건 먼저 뜸
  const openStartFlow = async () => {
    // ✅ 날짜 상세 모달에서 눌렀을 때 "안 뜨는" 느낌 = 기존 모달이 위에 남아있던 문제
    setDayModalOpen(false);
    setDayDetail(null);

    setSelectedDate(todayISO);

    // 로그인일 때 RUN 슬롯 체크
    if (!isGuest && userId) {
      const next = await getNextRunNo();
      if (!next) {
        notify("本日上限", "本日の記録は最大 2件までです（RUN1/RUN2）。");
        return;
      }
    }

    // RUN 화면으로 이동 + 초기화
    setStep("RUN");
    cancelAndReset();

    // ✅ 바로 모달 오픈
    setStartModeModalOpen(true);
    setDistanceModalOpen(false);
    setTimeModalOpen(false);
  };

  // ===== 모달 선택 핸들러 (거리/시간만) =====
  const pickMode = (m: GoalMode) => {
    setGoalMode(m);
    goalModeRef.current = m;

    setStartModeModalOpen(false);

    if (m === "DISTANCE") {
      setDistanceModalOpen(true);
    } else if (m === "TIME") {
      setTimeModalOpen(true);
    }
  };

  const onPickDistanceType = (t: DistanceType) => {
    setPlanDistanceType(t);
    const km = presetToKm(t);
    if (t !== "CUSTOM" && km != null) setTargetKmText(km.toFixed(2));
  };

  const confirmDistancePlan = () => {
    if (planDistanceType === "CUSTOM") {
      const km = Number(targetKmText);
      if (!Number.isFinite(km) || km <= 0) return notify("入力エラー", "目標距離(km)を正しく入力してください。");
    }
    setGoalMode("DISTANCE");
    goalModeRef.current = "DISTANCE";
    setDistanceType(planDistanceType === "CUSTOM" ? "CUSTOM" : planDistanceType);
    setDistanceModalOpen(false);
    setGpsHint("");
  };

  const confirmTimePlan = () => {
    const hms = `${pad2(pickH)}:${pad2(pickM)}:${pad2(pickS)}`;
    const sec = hmsToSeconds(hms);
    if (sec == null || sec <= 0) return notify("入力エラー", "時間を正しく選択してください。");
    setTargetTimeText(hms);
    setGoalMode("TIME");
    goalModeRef.current = "TIME";
    setDistanceType("CUSTOM");
    setTimeModalOpen(false);
    setGpsHint("");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, paddingTop: Platform.OS === "android" ? 6 : 0 }}>
      <View style={[styles.header, { borderBottomColor: ui.line }]}>
        <Pressable
          hitSlop={HIT_SLOP}
          onPress={() => {
            if (step === "RUN") setStep("CALENDAR");
            else router.back();
          }}
          style={({ pressed }) => [styles.backBtn, { borderColor: ui.line, opacity: pressed ? 0.7 : 1, backgroundColor: ui.card2 }]}
        >
          <Text style={{ color: ui.text, fontWeight: "900" }}>‹</Text>
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>{step === "CALENDAR" ? "カレンダー" : "測定"}</Text>
          {isGuest ? <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 11, marginTop: 2 }}>GUEST（保存不可）</Text> : null}
        </View>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: TAB_H + 22 }}>
        {/* ===================== CALENDAR ===================== */}
        {step === "CALENDAR" ? (
          <Card title="カレンダー" ui={ui}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <GhostBtn label="‹" onPress={gotoPrevMonth} ui={ui} small />
              <Text style={{ color: ui.text, fontWeight: "900" }}>{monthTitle}</Text>
              <GhostBtn label="›" onPress={gotoNextMonth} ui={ui} small />
            </View>

            <RunCalendarGrid
              ui={ui}
              cells={cells}
              selectedDate={selectedDate}
              today={todayISO}
              monthRuns={monthRuns}
              loading={!isGuest && loadingMonthRuns}
              onPressDate={(iso) => {
                setSelectedDate(iso);
                setDayModalOpen(true);
                setDayDetail(null);
                loadDayDetail(iso);
              }}
            />

            <View style={{ height: 12 }} />
            <PrimaryBtn label="今日の測定へ" onPress={openStartFlow} ui={ui} />
          </Card>
        ) : null}

        {/* ===================== RUN ===================== */}
        {step === "RUN" ? (
          <Card title="" ui={ui}>
            <View style={{ marginBottom: 10 }}>
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>{todayISO}</Text>
              <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 4 }}>{planSummary}</Text>
            </View>

            {runState === "IDLE" ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <PrimaryBtn label="START" onPress={startOrResumeTracking} ui={ui} />
                <GhostBtn label="距離/時間" onPress={() => setStartModeModalOpen(true)} ui={ui} />
              </View>
            ) : runState === "RUNNING" ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <GhostBtn label="一時停止" onPress={pauseTracking} ui={ui} />
                <DangerBtn label="終了" onPress={() => finishRunAndAutoSave("手動終了")} ui={ui} />
              </View>
            ) : runState === "PAUSED" ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <PrimaryBtn label="再開" onPress={startOrResumeTracking} ui={ui} />
                <DangerBtn label="終了して保存" onPress={() => finishRunAndAutoSave("一時停止から終了")} ui={ui} />
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <PrimaryBtn label="もう一度" onPress={cancelAndReset} ui={ui} />
                <GhostBtn label="カレンダー" onPress={() => setStep("CALENDAR")} ui={ui} />
              </View>
            )}

            <View style={{ height: 14 }} />

            <View style={[styles.statsBar, { borderColor: ui.line, backgroundColor: ui.card2 }]}>
              <View style={styles.statsCell}>
                <Text style={[styles.statsLabel, { color: ui.muted }]}>距離</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Text style={[styles.statsMain, { color: ui.text }]}>{distanceKm}</Text>
                  <Text style={[styles.statsUnit, { color: ui.muted }]}>km</Text>
                </View>
                <Text style={{ color: ui.muted, fontWeight: "900", marginTop: 6 }}>{metersText}</Text>
              </View>

              <View style={[styles.statsDivider, { backgroundColor: ui.line }]} />

              <View style={styles.statsCell}>
                <Text style={[styles.statsLabel, { color: ui.muted }]}>時間</Text>
                <Text style={[styles.statsTime, { color: ui.text }]}>{timeHms}</Text>
                <Text style={{ color: "transparent", fontWeight: "900", marginTop: 6 }}>.</Text>
              </View>
            </View>

            <View style={{ height: 12 }} />

            {goalMode === "DISTANCE" ? (
              <View style={[styles.targetBoxBig, { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }]}>
                <Text style={{ color: ui.muted, fontWeight: "900" }}>目標距離</Text>
                <Text style={{ color: ui.green, fontWeight: "900", fontSize: 26, marginTop: 6 }}>{targetKmText} km</Text>
              </View>
            ) : (
              <View style={[styles.targetBoxBig, { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }]}>
                <Text style={{ color: ui.muted, fontWeight: "900" }}>目標時間</Text>
                <Text style={{ color: ui.green, fontWeight: "900", fontSize: 26, marginTop: 6 }}>{targetTimeText}</Text>
              </View>
            )}
          </Card>
        ) : null}
      </ScrollView>

      {/* ===================== ✅ “거리/시간” 모달 ===================== */}
      <Modal visible={startModeModalOpen} transparent animationType="fade" onRequestClose={() => setStartModeModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setStartModeModalOpen(false)} />
          <View style={styles.modalCenter} pointerEvents="box-none">
            <View style={[styles.modalCard, { backgroundColor: ui.card, borderColor: ui.line }]} pointerEvents="auto">
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>距離 / 時間</Text>
              <View style={{ height: 14 }} />
              <View style={{ gap: 10 }}>
                <PrimaryBtn label="距離" onPress={() => pickMode("DISTANCE")} ui={ui} />
                <PrimaryBtn label="時間" onPress={() => pickMode("TIME")} ui={ui} />
              </View>
              <View style={{ height: 12 }} />
              <GhostBtn label="閉じる" onPress={() => setStartModeModalOpen(false)} ui={ui} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================== ✅ 거리 선택 모달 ===================== */}
      <Modal visible={distanceModalOpen} transparent animationType="fade" onRequestClose={() => setDistanceModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDistanceModalOpen(false)} />
          <View style={styles.modalCenter} pointerEvents="box-none">
            <View style={[styles.modalCard, { backgroundColor: ui.card, borderColor: ui.line }]} pointerEvents="auto">
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>距離目標</Text>

              <View style={{ height: 12 }} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="3K" active={planDistanceType === "3K"} onPress={() => onPickDistanceType("3K")} ui={ui} />
                <Chip label="5K" active={planDistanceType === "5K"} onPress={() => onPickDistanceType("5K")} ui={ui} />
                <Chip label="10K" active={planDistanceType === "10K"} onPress={() => onPickDistanceType("10K")} ui={ui} />
                <Chip label="HALF" active={planDistanceType === "HALF"} onPress={() => onPickDistanceType("HALF")} ui={ui} />
                <Chip label="自由" active={planDistanceType === "CUSTOM"} onPress={() => onPickDistanceType("CUSTOM")} ui={ui} />
              </View>

              <View style={{ height: 12 }} />
              <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "900" }}>目標距離(km)</Text>
              <TextInput
                value={targetKmText}
                onChangeText={setTargetKmText}
                editable={planDistanceType === "CUSTOM"}
                keyboardType="decimal-pad"
                placeholder="例: 7.50"
                placeholderTextColor={ui.muted}
                style={[
                  styles.input,
                  {
                    borderColor: ui.line,
                    color: ui.text,
                    backgroundColor: planDistanceType === "CUSTOM" ? ui.card2 : ui.card2,
                    opacity: planDistanceType === "CUSTOM" ? 1 : 0.9,
                  },
                ]}
              />

              <View style={{ height: 14 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <GhostBtn
                  label="戻る"
                  onPress={() => {
                    setDistanceModalOpen(false);
                    setStartModeModalOpen(true);
                  }}
                  ui={ui}
                />
                <PrimaryBtn label="確定" onPress={confirmDistancePlan} ui={ui} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================== ✅ 시간 선택 모달 ===================== */}
      <Modal visible={timeModalOpen} transparent animationType="fade" onRequestClose={() => setTimeModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setTimeModalOpen(false)} />
          <View style={styles.modalCenter} pointerEvents="box-none">
            <View style={[styles.modalCard, { backgroundColor: ui.card, borderColor: ui.line }]} pointerEvents="auto">
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>時間目標</Text>

              <View style={{ height: 14 }} />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <SelectBox
                  label="時"
                  value={pad2(pickH)}
                  ui={ui}
                  onPress={() => openNumberPicker("時", Array.from({ length: 24 }, (_, i) => i), pickH, (v) => setPickH(v))}
                />
                <SelectBox
                  label="分"
                  value={pad2(pickM)}
                  ui={ui}
                  onPress={() => openNumberPicker("分", Array.from({ length: 60 }, (_, i) => i), pickM, (v) => setPickM(v))}
                />
                <SelectBox
                  label="秒"
                  value={pad2(pickS)}
                  ui={ui}
                  onPress={() => openNumberPicker("秒", Array.from({ length: 60 }, (_, i) => i), pickS, (v) => setPickS(v))}
                />
              </View>

              <Text style={{ color: ui.muted, fontWeight: "900", marginTop: 12 }}>
                選択: <Text style={{ color: ui.green }}>{pad2(pickH)}:{pad2(pickM)}:{pad2(pickS)}</Text>
              </Text>

              <View style={{ height: 14 }} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <GhostBtn
                  label="戻る"
                  onPress={() => {
                    setTimeModalOpen(false);
                    setStartModeModalOpen(true);
                  }}
                  ui={ui}
                />
                <PrimaryBtn label="確定" onPress={confirmTimePlan} ui={ui} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================== ✅ 숫자 셀렉트 모달 ===================== */}
      <NumberPickerModal
        open={numPickerOpen}
        title={numPickerTitle}
        values={numPickerValues}
        selected={numPickerSelected}
        ui={ui}
        onClose={() => setNumPickerOpen(false)}
        onPick={(v: number) => {
          setNumPickerSelected(v);
          numPickerOnPickRef.current(v);
          setNumPickerOpen(false);
        }}
      />

      {/* ✅ 날짜 상세 모달 */}
      <Modal
        visible={dayModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDayModalOpen(false);
          setDayDetail(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setDayModalOpen(false);
              setDayDetail(null);
            }}
          />

          <View style={styles.modalCenter} pointerEvents="box-none">
            <View style={[styles.modalCard, { backgroundColor: ui.card, borderColor: ui.line }]} pointerEvents="auto">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>{selectedDate}</Text>
                  <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                    {isTodayPicked ? "今日（測定/保存OK）" : "閲覧のみ（測定/保存は今日のみ）"}
                  </Text>
                </View>

                <Pressable
                  hitSlop={HIT_SLOP}
                  onPress={() => {
                    setDayModalOpen(false);
                    setDayDetail(null);
                  }}
                  style={({ pressed }) => [styles.modalCloseBtn, { borderColor: ui.line, opacity: pressed ? 0.75 : 1, backgroundColor: ui.card2 }]}
                >
                  <Text style={{ color: ui.text, fontWeight: "900" }}>×</Text>
                </Pressable>
              </View>

              <View style={{ height: 12 }} />

              {isGuest ? (
                pickedHas ? (
                  <View style={{ gap: 8 }}>
                    <InfoRow label="距離" value={pickedKm ? `${pickedKm.toFixed(2)} km` : "-"} ui={ui} />
                    <InfoRow label="時間" value={pickedTime} ui={ui} />
                    <InfoRow label="消費カロリー" value={pickedKcal ? `${Math.round(pickedKcal)} kcal` : "-"} ui={ui} />
                    <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 8 }}>※ ゲストは詳細取得/削除はできません</Text>
                  </View>
                ) : (
                  <Text style={{ color: ui.muted, fontWeight: "800" }}>記録なし</Text>
                )
              ) : loadingDay ? (
                <Text style={{ color: ui.muted, fontWeight: "800" }}>読み込み中...</Text>
              ) : dayDetail?.ok && Array.isArray(dayDetail.items) && dayDetail.items.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {dayDetail.items.map((it, idx) => {
                    const runId = it.runId;
                    const splits = runId ? (splitMap[runId] ?? null) : null;

                    return (
                      <View key={String(runId ?? idx)} style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: ui.line }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <Text style={{ color: ui.text, fontWeight: "900", flex: 1 }}>
                            {it.runNo ? `RUN ${it.runNo}` : `RUN ${idx + 1}`} {it.distanceType ? `(${it.distanceType})` : ""}
                            {runId ? `  #${runId}` : ""}
                          </Text>

                          {runId ? (
                            <Pressable
                              hitSlop={HIT_SLOP}
                              onPress={() => confirmDelete(runId)}
                              style={({ pressed }) => [
                                styles.deletePill,
                                { borderColor: ui.danger, opacity: pressed ? 0.7 : 1 },
                              ]}
                            >
                              <Text style={{ color: ui.danger, fontWeight: "900" }}>削除</Text>
                            </Pressable>
                          ) : null}
                        </View>

                        <View style={{ height: 8 }} />
                        <InfoRow label="距離" value={`${Number(it.distanceKm || 0).toFixed(2)} km`} ui={ui} />
                        <InfoRow label="時間" value={secToHms(Number(it.durationSeconds || 0))} ui={ui} />
                        <InfoRow label="カロリー" value={`${Math.round(Number(it.calories || 0))} kcal`} ui={ui} />

                        <View style={{ height: 10 }} />
                        <Text style={{ color: ui.muted, fontWeight: "900" }}>Splits (1km)</Text>

                        {!runId ? (
                          <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>runId が無いので splits を取得できません</Text>
                        ) : splits === null ? (
                          <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>splits 読み込み中...</Text>
                        ) : splits.length === 0 ? (
                          <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>スプリットデータ 없음</Text>
                        ) : (
                          <View style={{ marginTop: 8, gap: 6 }}>
                            {splits.map((sp, sidx) => {
                              const segKm = Math.max(0.001, Number(sp.m || 0) / 1000);
                              const paceSec = Math.round(Number(sp.sec || 0) / segKm);
                              return (
                                <View key={sidx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ color: ui.text, fontWeight: "800" }}>
                                    {sp.km}km <Text style={{ color: ui.muted, fontWeight: "800" }}>({Math.round(sp.m)}m)</Text>
                                  </Text>
                                  <Text style={{ color: ui.text, fontWeight: "900" }}>
                                    {secToMmss(Number(sp.sec || 0))}{" "}
                                    <Text style={{ color: ui.muted, fontWeight: "800" }}>({secToMmss(paceSec)}/km)</Text>
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {it.memo ? (
                          <>
                            <View style={{ height: 10 }} />
                            <Text style={{ color: ui.muted, fontWeight: "900" }}>メモ</Text>
                            <Text style={{ color: ui.text, fontWeight: "800", marginTop: 4 }}>{it.memo}</Text>
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : pickedHas ? (
                <View style={{ gap: 8 }}>
                  <InfoRow label="距離" value={pickedKm ? `${pickedKm.toFixed(2)} km` : "-"} ui={ui} />
                  <InfoRow label="時間" value={pickedTime} ui={ui} />
                  <InfoRow label="消費カロリー" value={pickedKcal ? `${Math.round(pickedKcal)} kcal` : "-"} ui={ui} />
                </View>
              ) : (
                <Text style={{ color: ui.muted, fontWeight: "800" }}>記録なし</Text>
              )}

              <View style={{ height: 14 }} />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <GhostBtn
                  label="閉じる"
                  onPress={() => {
                    setDayModalOpen(false);
                    setDayDetail(null);
                  }}
                  ui={ui}
                />
                <PrimaryBtn label="今日の測定へ" onPress={openStartFlow} ui={ui} />
              </View>

              <View style={{ height: 10 }} />
              <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "800" }}>
                ※ 削除は /api/record/add?mode=delete (runId) が必要です。
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ index.tsx 최종본이랑 똑같은 하단 탭 */}
      <View style={[styles.bottomTabs, { borderTopColor: ui.line, backgroundColor: ui.bg }]}>
        <TabBtn label="ホーム" icon="home-outline" active={activeKey === "ホーム"} onPress={() => onTap("ホーム")} ui={ui} />
        <TabBtn label="記録" icon="walk-outline" active={activeKey === "記録"} onPress={() => onTap("記録")} ui={ui} />
        <TabBtn label="栄養" icon="nutrition-outline" active={activeKey === "栄養"} onPress={() => onTap("栄養")} ui={ui} />
        <TabBtn label="ランキング" icon="podium-outline" active={activeKey === "ランキング"} onPress={() => onTap("ランキング")} ui={ui} />
        <TabBtn label="アカウント" icon="person-circle-outline" active={activeKey === "アカウント"} onPress={() => onTap("アカウント")} ui={ui} />
      </View>
    </SafeAreaView>
  );
}

/* ===================== ✅ 캘린더 ===================== */

function RunCalendarGrid({
  ui,
  cells,
  selectedDate,
  today,
  monthRuns,
  loading,
  onPressDate,
}: {
  ui: any;
  cells: { date: Date; iso: string; inMonth: boolean }[];
  selectedDate: string;
  today: string;
  monthRuns: Record<string, MonthRunItem>;
  loading: boolean;
  onPressDate: (iso: string) => void;
}) {
  const { width } = useWindowDimensions();

  const OUTER_PAD = 16;
  const CARD_PAD = 16;

  const gap = 6;
  const avail = Math.max(280, width - OUTER_PAD * 2 - CARD_PAD * 2);
  const cellSize = Math.floor((avail - gap * 6) / 7);
  const h = Math.max(44, Math.min(cellSize, 56));

  return (
    <View style={{ marginTop: 12 }}>
      {loading ? (
        <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12, marginBottom: 10 }}>月の記録を読み込み中...</Text>
      ) : null}

      <View style={styles.dowRow}>
        {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
          <Text key={d} style={{ width: cellSize, textAlign: "center", color: ui.muted, fontWeight: "900", fontSize: 11 }}>
            {d}
          </Text>
        ))}
      </View>

      <View style={{ height: 8 }} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {cells.map((c) => {
          const isSelected = c.iso === selectedDate;
          const isToday = c.iso === today;

          const dd = Number(c.iso.slice(-2));

          const sum = monthRuns[c.iso];
          const runKm = Number(sum?.runKm ?? sum?.distanceKm ?? 0);
          const burnKcal = Number(sum?.burnKcal ?? sum?.calories ?? 0);
          const hasRun = runKm > 0.0001 || burnKcal > 0.1;

          const borderColor = isSelected
            ? ui.pillActiveBorderStrong
            : isToday
            ? ui.pillActiveBorder
            : ui.line;

          const bgColor = isSelected ? ui.pillActiveBgStrong : ui.pillIdleBg;

          return (
            <Pressable
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              key={c.iso}
              onPress={() => onPressDate(c.iso)}
              style={({ pressed }) => [
                styles.cellMini,
                {
                  width: cellSize,
                  height: h,
                  borderColor,
                  backgroundColor: bgColor,
                  opacity: pressed ? 0.78 : c.inMonth ? 1 : 0.35,
                },
              ]}
            >
              <Text style={[styles.dayNum, { color: isSelected ? ui.green : ui.text }]}>{dd}</Text>
              {hasRun ? <View style={[styles.runDot, { backgroundColor: ui.green }]} /> : <View style={{ height: 9, marginTop: 8 }} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ===== small UI ===== */

function Card({ title, children, ui }: any) {
  return (
    <View style={[styles.card, { backgroundColor: ui.card, borderColor: ui.line }]}>
      {title ? <Text style={{ color: ui.text, fontWeight: "900", fontSize: 14 }}>{title}</Text> : null}
      {title ? <View style={{ height: 10 }} /> : null}
      {children}
    </View>
  );
}

function PrimaryBtn({ label, onPress, ui }: any) {
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: ui.green, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={{ color: ui.onGreenText, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function DangerBtn({ label, onPress, ui }: any) {
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.dangerBtn, { borderColor: ui.danger, opacity: pressed ? 0.85 : 1, backgroundColor: ui.warnBg }]}
    >
      <Text style={{ color: ui.danger, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function GhostBtn({ label, onPress, ui, small }: any) {
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        small ? styles.ghostBtnSmall : styles.ghostBtn,
        { borderColor: ui.line, opacity: pressed ? 0.85 : 1, backgroundColor: ui.card2 },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress, ui }: any) {
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? ui.pillActiveBorder : ui.line,
          backgroundColor: active ? ui.pillActiveBg : ui.card2,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ color: active ? ui.green : ui.text, fontSize: 12, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ label, value, ui }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
      <Text style={{ color: ui.muted, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color: ui.text, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

/** ✅ 셀렉트 박스(드롭다운 느낌) */
function SelectBox({ label, value, onPress, ui }: any) {
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectBox,
        {
          borderColor: ui.line,
          backgroundColor: ui.card2,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 12 }}>{label}</Text>
      <View style={{ height: 6 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: ui.text, fontWeight: "900", fontSize: 20 }}>{value}</Text>
        <Ionicons name="chevron-down" size={18} color={ui.muted} />
      </View>
    </Pressable>
  );
}

/** ✅ 숫자 선택 모달 */
function NumberPickerModal({ open, title, values, selected, onClose, onPick, ui }: any) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <View style={styles.modalCenter} pointerEvents="box-none">
          <View style={[styles.modalCard, { backgroundColor: ui.card, borderColor: ui.line, maxHeight: "70%" }]} pointerEvents="auto">
            <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>{title} を選択</Text>
            <View style={{ height: 12 }} />

            <ScrollView style={{ borderRadius: 14, borderWidth: 1, borderColor: ui.line }}>
              {values.map((v: number) => {
                const active = v === selected;
                return (
                  <Pressable
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    key={String(v)}
                    onPress={() => onPick(v)}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      {
                        backgroundColor: active ? ui.pillActiveBg : "transparent",
                        opacity: pressed ? 0.7 : 1,
                        borderBottomColor: ui.line,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? ui.green : ui.text, fontWeight: "900", fontSize: 16 }}>{pad2(v)}</Text>
                    {active ? <Ionicons name="checkmark" size={18} color={ui.green} /> : <View style={{ width: 18 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ height: 12 }} />
            <GhostBtn label="閉じる" onPress={onClose} ui={ui} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ===== Bottom Tab Button ===== */

function TabBtn({ label, icon, onPress, active, ui }: any) {
  const color = active ? ui.green : ui.text;
  const pillStyle = active
    ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
    : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };

  return (
    <Pressable hitSlop={HIT_SLOP} onPress={onPress} style={({ pressed }) => [styles.tabPress, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.tabPill, pillStyle]}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={{ color, fontWeight: "900", fontSize: 13 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/* ===== styles ===== */

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  card: { borderRadius: 18, borderWidth: 1, padding: 16 },

  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, fontWeight: "800" },

  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },

  primaryBtn: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtn: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtn: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnSmall: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  selectBox: {
    flex: 1,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  pickerRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dowRow: { flexDirection: "row", justifyContent: "space-between" },
  cellMini: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  dayNum: { fontSize: 14, fontWeight: "900" },
  runDot: {
    marginTop: 8,
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.25)",
  },

  deletePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,90,95,0.07)",
  },

  statsBar: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
  },
  statsCell: {
    flex: 1,
    padding: 14,
  },
  statsDivider: {
    width: 1,
  },
  statsLabel: {
    fontWeight: "900",
    fontSize: 12,
  },
  statsMain: {
    fontWeight: "900",
    fontSize: 34,
    marginTop: 6,
  },
  statsUnit: {
    fontWeight: "900",
    fontSize: 14,
  },
  statsTime: {
    fontWeight: "900",
    fontSize: 26,
    marginTop: 12,
  },

  targetBoxBig: { borderWidth: 1, borderRadius: 16, padding: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    position: "relative",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  modalCenter: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    zIndex: 2,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    zIndex: 3,
    elevation: 10,
  },
  modalCloseBtn: {
    width: 36,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  bottomTabs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_H,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 26 : 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tabPress: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabPill: {
    width: "92%",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
