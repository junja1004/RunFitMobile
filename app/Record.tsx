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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

// ✅ Map (Expo: react-native-maps)
import MapView, { Marker, Polyline } from "react-native-maps";

/** 전역 로그인정보 */
const getAuthGlobal = () => (globalThis as any).__RUNFIT_AUTH__ || null;

/* =========================
   ✅ 전역 테마 저장소(Index.tsx와 동일 키 사용)
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

function useRunFitThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeModeGlobal());

  useEffect(() => {
    const unsub = subscribeThemeMode((m) => setMode(m));
    return unsub;
  }, []);

  return { mode };
}
/* ========================= */

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

// ✅✅✅ MAP/ROUTE용 타입
type RoutePoint = { latitude: number; longitude: number; t: number }; // t=러닝 경과초(일시정지 제외)
type FinishSplit = { km: number; sec: number; m: number };

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

/** ✅✅✅ 1km 스플릿 계산(경계 통과 시 보간) */
function computeKmSplits(points: RoutePoint[]): FinishSplit[] {
  if (!points || points.length < 2) return [];
  const out: FinishSplit[] = [];

  let cumDist = 0; // 누적거리(m)
  let lastBoundaryTime = points[0].t; // 마지막 km 경계 시간
  let nextKmBoundary = 1000; // 다음 km 경계(m)

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];

    const segDist = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
    const segTime = b.t - a.t;
    if (!(segDist > 0) || !(segTime >= 0)) continue;

    const prevCum = cumDist;
    const newCum = cumDist + segDist;

    while (nextKmBoundary <= newCum + 1e-6) {
      const need = nextKmBoundary - prevCum;
      const f = clamp(need / segDist, 0, 1);
      const boundaryTime = a.t + f * segTime;

      const splitSec = Math.max(1, Math.round(boundaryTime - lastBoundaryTime));
      const kmIndex = out.length + 1;
      out.push({ km: kmIndex, sec: splitSec, m: 1000 });

      lastBoundaryTime = boundaryTime;
      nextKmBoundary += 1000;
    }

    cumDist = newCum;
  }

  return out;
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

/* =========================
   ✅ Drill(웹쪽 플랜) 데이터
========================= */
type PlanKey = "5K" | "10K" | "HALF";
const PLAN_KEYS: PlanKey[] = ["5K", "10K", "HALF"];
const DOW_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

type PlanRow = { day: typeof DOW_LABELS[number]; text: string };
type PlanDef = { title: string; desc: string; rows: PlanRow[] };

const PLAN_DATA: Record<PlanKey, PlanDef> = {
  "5K": {
    title: "5Kプラン",
    desc: "スピード＆記録短縮向け",
    rows: [
      { day: "月", text: "Easy 30〜45分 + コア/下半身（軽め）10〜15分" },
      { day: "火", text: "400m × 10〜12（RPE 8〜9）/ 200m ジョグ回復  または  1km × 4〜6（RPE 8）/ 2〜3分回復" },
      { day: "水", text: "Easy 35〜50分 + ストライド（RPE 7〜8）20秒 × 6（各 60〜90秒回復）" },
      { day: "木", text: "テンポ 20〜25分（RPE 6〜7） または  10分テンポ × 2（間 3分Easy）" },
      { day: "金", text: "休息  または  Easy 20〜30分（RPE 2）" },
      { day: "土", text: "ロングラン：8〜14km Easy（RPE 3）+ オプション：最後の10分 Steady（RPE 4〜5）" },
      { day: "日", text: "Easy 30〜45分（RPE 2〜3）/ 疲労が強ければランウォークに変更" },
    ],
  },
  "10K": {
    title: "10Kプラン",
    desc: "テンポ＋持久力バランス",
    rows: [
      { day: "月", text: "Easy 35〜50分 + コア 10〜15分" },
      { day: "火", text: "1km × 6（RPE 7〜8）/ 90秒〜2分回復  または  2km × 3〜4（RPE 7）/ 2〜3分回復" },
      { day: "水", text: "Easy 40〜60分 + ストライド（RPE 7〜8）20秒 × 6" },
      { day: "木", text: "テンポ 30〜40分（RPE 6〜7） または  2km × 4（RPE 6〜7）/ 1分ジョグ回復（クルーズ）" },
      { day: "金", text: "休息  または  クロストレーニング 30〜45分（軽め）" },
      { day: "土", text: "ロングラン：12〜18km Easy（RPE 3）+ オプション：後半15分 Steady（RPE 4〜5）" },
      { day: "日", text: "Easy 30〜50分（RPE 2〜3）/ 疲労が強ければ休息" },
    ],
  },
  "HALF": {
    title: "ハーフ（21.1K）プラン",
    desc: "ロングラン＋持続走に慣れる",
    rows: [
      { day: "月", text: "Easy 40〜55分 + 下半身筋トレ（軽め）10〜15分" },
      { day: "火", text: "2km × 4〜6（RPE 6〜7）/ 1分回復  または  3km × 3〜4（RPE 6〜7）/ 2分回復" },
      { day: "水", text: "Easy 45〜65分（RPE 2〜3）" },
      { day: "木", text: "中強度：Steady 30〜45分（RPE 4〜5）+ ストライド（RPE 7〜8）20秒 × 6" },
      { day: "金", text: "休息  または  Easy 20〜30分（RPE 2）" },
      { day: "土", text: "ロングラン：16〜24km Easy（RPE 3）+（2〜3週に1回）途中 6〜10km Steady（RPE 5）または 最後の20分 Steady" },
      { day: "日", text: "Easy 30〜45分（RPE 2〜3）/ 疲労が強ければ休息" },
    ],
  },
};

// ✅ 앱 내부 저장(서버 API 없을 때도 표시되게)
const PLAN_GLOBAL_KEY = "__RUNFIT_SELECTED_PLAN__";
function isPlanKey(v: any): v is PlanKey {
  return v === "5K" || v === "10K" || v === "HALF";
}
function getPlanGlobal(): PlanKey | null {
  const g = globalThis as any;
  const v = g[PLAN_GLOBAL_KEY];
  return isPlanKey(v) ? v : null;
}
function setPlanGlobal(k: PlanKey | null) {
  const g = globalThis as any;
  g[PLAN_GLOBAL_KEY] = k;
}

// ✅ 오늘 요일 index (월=0..일=6)
function getTodayDowIndexMon(): number {
  const d = new Date();
  return (d.getDay() + 6) % 7;
}

/* ========================= */

type PlanModalStep = "MODE" | "DISTANCE" | "TIME" | "PLAN" | "PICK_H" | "PICK_M" | "PICK_S";

export default function Record() {
  const pathname = usePathname();

  // ✅ Index 토글과 동일한 전역 테마 사용
  const { mode } = useRunFitThemeMode();
  const isLight = mode === "light";

  const ui = useMemo(() => {
    if (isLight) {
      return {
        // ✅ LIGHT
        bg: "#f6f8fb",
        card: "#ffffff",
        headerBg: "rgba(255,255,255,0.88)",
        line: "rgba(0,0,0,0.10)",
        text: "rgba(11,16,32,0.92)",
        muted: "rgba(11,16,32,0.58)",

        green: "#16a34a",
        danger: "#ff5a5f",

        pillActiveBg: "rgba(22,163,74,0.12)",
        pillActiveBorder: "rgba(22,163,74,0.35)",
        pillIdleBg: "rgba(0,0,0,0.03)",

        overlay: "rgba(0,0,0,0.35)",
        backBtnBg: "rgba(0,0,0,0.04)",
        ghostBg: "rgba(0,0,0,0.04)",
        dangerBg: "rgba(255,90,95,0.08)",

        cellBg: "rgba(0,0,0,0.03)",
        cellBgActive: "rgba(22,163,74,0.10)",
        dotBorder: "rgba(255,255,255,0.85)",
        inputBg: "rgba(0,0,0,0.02)",
        inputBgActive: "rgba(0,0,0,0.03)",
        placeholder: "rgba(11,16,32,0.35)",
      };
    }

    return {
      // ✅ DARK (기존 느낌 유지)
      bg: "#0b0f14",
      card: "#0f1620",
      headerBg: "rgba(255,255,255,0.02)",
      line: "rgba(255,255,255,0.12)",
      text: "rgba(255,255,255,0.92)",
      muted: "rgba(255,255,255,0.62)",

      green: "#6dff8b",
      danger: "#ff5a5f",

      pillActiveBg: "rgba(109,255,139,0.14)",
      pillActiveBorder: "rgba(109,255,139,0.35)",
      pillIdleBg: "rgba(255,255,255,0.03)",

      overlay: "rgba(0,0,0,0.55)",
      backBtnBg: "rgba(255,255,255,0.03)",
      ghostBg: "rgba(255,255,255,0.04)",
      dangerBg: "rgba(255,90,95,0.06)",

      cellBg: "rgba(255,255,255,0.03)",
      cellBgActive: "rgba(109,255,139,0.12)",
      dotBorder: "rgba(0,0,0,0.25)",
      inputBg: "rgba(255,255,255,0.02)",
      inputBgActive: "rgba(255,255,255,0.03)",
      placeholder: "rgba(255,255,255,0.35)",
    };
  }, [isLight]);

  const BASE_URL = "http://172.20.10.4:8080/RunFIT_";

  const auth = getAuthGlobal();
  const userId: number | null = auth?.userId ?? null;
  const isGuest = !userId;

  // ✅ 오늘(세션 기준): 측정/저장은 무조건 이 날짜로만
  const todayISO = useMemo(() => getToday(), []);

  // ✅ 오늘 요일/드릴
  const todayDowIdx = useMemo(() => getTodayDowIndexMon(), []);
  const todayDowLabel = DOW_LABELS[todayDowIdx];

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

  // ===== ✅ 플랜 설정 모달(단일 Modal로 통합) =====
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planStep, setPlanStep] = useState<PlanModalStep>("MODE");

  // ===== 플랜 선택(거리/시간/자유) =====
  const [goalMode, setGoalMode] = useState<GoalMode>("DISTANCE");

  const [planDistanceType, setPlanDistanceType] = useState<DistanceType>("5K");
  const [targetKmText, setTargetKmText] = useState<string>("5.00");

  // 시간 목표(셀렉트)
  const [pickH, setPickH] = useState(0);
  const [pickM, setPickM] = useState(30);
  const [pickS, setPickS] = useState(0);
  const [targetTimeText, setTargetTimeText] = useState<string>("00:30:00");

  // ===== ✅ Drill Plan (웹쪽) 선택/표시 =====
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(() => getPlanGlobal());
  const [planDraftKey, setPlanDraftKey] = useState<PlanKey>(() => getPlanGlobal() ?? "5K");
  const [rpeOpen, setRpeOpen] = useState(false);

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

  // ===== ✅✅✅ Map 결과(종료 후 표시) =====
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const routeRef = useRef<RoutePoint[]>([]);
  const [routeLine, setRouteLine] = useState<{ latitude: number; longitude: number }[]>([]);
  const [finishSplits, setFinishSplits] = useState<FinishSplit[]>([]);

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

  /** ✅ 서버에서 selected_plan 읽기 (있으면) */
  const loadSelectedPlanFromServer = async () => {
    if (!userId) return;
    try {
      const url = `${BASE_URL}/api/plan`;
      const res = await fetch(url, { method: "GET", headers: { "X-USER-ID": String(userId) } });
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      const k = data?.selectedPlan ?? data?.planKey ?? data?.selected_plan ?? null;
      const kk = typeof k === "string" ? k.trim().toUpperCase() : "";
      if (isPlanKey(kk)) {
        setSelectedPlanKey(kk);
        setPlanDraftKey(kk);
        setPlanGlobal(kk);
      }
    } catch {
      // ✅ API 없거나 실패하면 그냥 로컬 표시만
    }
  };

  /** ✅ 서버에 selected_plan 저장 (있으면) */
  const applyPlanToServer = async (k: PlanKey) => {
    if (!userId) return;
    try {
      const url = `${BASE_URL}/api/plan`;
      const form = new URLSearchParams();
      form.append("planKey", k);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-USER-ID": String(userId) },
        body: form.toString(),
      });

      // 실패해도 앱은 계속 동작하게
      if (!res.ok) {
        const t = await res.text();
        notify("保存注意", `サーバ保存に失敗（表示は変更済み）\n${t}`);
      }
    } catch {
      // API 없으면 무시
    }
  };

  useEffect(() => {
    if (!userId) return;
    loadSelectedPlanFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

    // ✅ (옵션) 서버가 지원하면 여기서 route/splits도 같이 보내면 됨 (현재는 서버 스펙 미확정이라 미전송)

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

  // ✅✅✅ 기록 삭제 (RecordServlet X → RecordApiServlet로)
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

  // ✅ 자동 종료 + 자동 저장 (시간 0 스테일 문제 해결)
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

    // ✅✅✅ 종료 결과: 지도 라인 + 스플릿 계산
    const pts = routeRef.current;
    const line = pts.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    setRouteLine(line);
    setFinishSplits(computeKmSplits(pts));
    setMapReady(false); // 레이아웃 다시 타고 fit하도록

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

      // ✅✅✅ 새 러닝: route/splits 초기화
      routeRef.current = [];
      setRouteLine([]);
      setFinishSplits([]);
      setMapReady(false);

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

              // ✅✅✅ 첫 포인트도 route에 넣어두기(러닝시간 t 포함)
              const t =
                (accMsRef.current + Math.max(0, Date.now() - startMsRef.current)) / 1000;
              routeRef.current.push({ latitude, longitude, t });
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

        // ✅✅✅ route 포인트 누적(스무딩 좌표 + 러닝경과시간 t)
        const t =
          (accMsRef.current + Math.max(0, Date.now() - startMsRef.current)) / 1000;

        const last = routeRef.current[routeRef.current.length - 1];
        if (!last) {
          routeRef.current.push({ latitude: sLat, longitude: sLon, t });
        } else {
          // 너무 촘촘하면 무거워지니까 2m 이상 이동했을 때만 추가
          const dd = haversineMeters(last.latitude, last.longitude, sLat, sLon);
          if (dd >= 2) routeRef.current.push({ latitude: sLat, longitude: sLon, t });
        }

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

    // ✅✅✅ route/splits도 리셋
    routeRef.current = [];
    setRouteLine([]);
    setFinishSplits([]);
    setMapReady(false);
  };

  useEffect(() => {
    return () => {
      stopAllTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅✅✅ FINISHED 시: 지도 라인이 보이게 fit
  useEffect(() => {
    if (runState !== "FINISHED") return;
    if (Platform.OS === "web") return;
    if (!mapReady) return;
    if (!mapRef.current) return;
    if (!routeLine || routeLine.length < 2) return;

    try {
      mapRef.current.fitToCoordinates(routeLine, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    } catch {}
  }, [runState, mapReady, routeLine]);

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

  const drillTitle = selectedPlanKey ? PLAN_DATA[selectedPlanKey].title : "未選択";
  const drillTodayText = selectedPlanKey ? PLAN_DATA[selectedPlanKey].rows[todayDowIdx]?.text : "プラン未選択（Drillで選択）";

  const planSummary = (() => {
    const base =
      goalMode === "DISTANCE"
        ? `距離: ${targetKmText} km (${planDistanceType === "CUSTOM" ? "自由" : planDistanceType})`
        : goalMode === "TIME"
        ? `時間: ${targetTimeText}`
        : `自由`;
    return `${base} / Drill: ${drillTitle}`;
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

  // ✅✅✅ 오늘 측정 시작: 버튼 누르면 모달이 무조건 먼저 뜸 (단일 모달)
  const openStartFlow = async () => {
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

    // ✅ 모달 오픈
    setPlanStep("MODE");
    setPlanModalOpen(true);
    setRpeOpen(false);
    setPlanDraftKey(selectedPlanKey ?? getPlanGlobal() ?? "5K");
  };

  const closePlanModal = () => {
    setPlanModalOpen(false);
    setPlanStep("MODE");
    setRpeOpen(false);
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
    closePlanModal();
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
    closePlanModal();
    setGpsHint("");
  };

  const applyDrillPlan = async () => {
    const k = planDraftKey;
    setSelectedPlanKey(k);
    setPlanGlobal(k);
    // 서버 있으면 저장 시도
    await applyPlanToServer(k);
    notify("Drill", `プランを適用しました: ${PLAN_DATA[k].title}`);
    closePlanModal();
  };

  const pickerValues = (stepKey: PlanModalStep) => {
    if (stepKey === "PICK_H") return Array.from({ length: 24 }, (_, i) => i);
    if (stepKey === "PICK_M") return Array.from({ length: 60 }, (_, i) => i);
    if (stepKey === "PICK_S") return Array.from({ length: 60 }, (_, i) => i);
    return [];
  };
  const pickerSelected = (stepKey: PlanModalStep) => {
    if (stepKey === "PICK_H") return pickH;
    if (stepKey === "PICK_M") return pickM;
    if (stepKey === "PICK_S") return pickS;
    return 0;
  };
  const pickerTitle = (stepKey: PlanModalStep) => {
    if (stepKey === "PICK_H") return "時";
    if (stepKey === "PICK_M") return "分";
    if (stepKey === "PICK_S") return "秒";
    return "";
  };
  const onPickNumber = (stepKey: PlanModalStep, v: number) => {
    if (stepKey === "PICK_H") setPickH(v);
    if (stepKey === "PICK_M") setPickM(v);
    if (stepKey === "PICK_S") setPickS(v);
    setPlanStep("TIME");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, paddingTop: Platform.OS === "android" ? 6 : 0 }}>
      {/* ✅ 전역 테마에 맞춰 StatusBar도 동기화 */}
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />

      <View style={[styles.header, { borderBottomColor: ui.line, backgroundColor: ui.headerBg }]}>
        <Pressable
          onPress={() => {
            if (step === "RUN") setStep("CALENDAR");
            else router.back();
          }}
          style={({ pressed }) => [
            styles.backBtn,
            { borderColor: ui.line, backgroundColor: ui.backBtnBg, opacity: pressed ? 0.7 : 1 },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: ui.text, fontWeight: "900" }}>‹</Text>
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>{step === "CALENDAR" ? "カレンダー" : "測定"}</Text>
          {isGuest ? <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 11, marginTop: 2 }}>GUEST（保存不可）</Text> : null}
        </View>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: TAB_H + 22 }}>
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
          <View style={[styles.runWrap, { backgroundColor: ui.card, borderColor: ui.line }]}>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>{todayISO}</Text>
              <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 4 }}>{planSummary}</Text>
            </View>

            {/* ✅ 버튼 영역 (간결) */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
              {runState === "IDLE" ? (
                <PrimaryBtn label="START" onPress={startOrResumeTracking} ui={ui} />
              ) : runState === "RUNNING" ? (
                <View style={{ flexDirection: "row" }}>
                  <GhostBtn label="一時停止" onPress={pauseTracking} ui={ui} grow />
                  <View style={{ width: 10 }} />
                  <DangerBtn label="終了" onPress={() => finishRunAndAutoSave("手動終了")} ui={ui} grow />
                </View>
              ) : runState === "PAUSED" ? (
                <View style={{ flexDirection: "row" }}>
                  <PrimaryBtn label="再開" onPress={startOrResumeTracking} ui={ui} grow />
                  <View style={{ width: 10 }} />
                  <DangerBtn label="終了して保存" onPress={() => finishRunAndAutoSave("一時停止から終了")} ui={ui} grow />
                </View>
              ) : (
                <View style={{ flexDirection: "row" }}>
                  <PrimaryBtn label="もう一度" onPress={cancelAndReset} ui={ui} grow />
                  <View style={{ width: 10 }} />
                  <GhostBtn label="カレンダー" onPress={() => setStep("CALENDAR")} ui={ui} grow />
                </View>
              )}
            </View>

            {/* ✅ 거리/시간: 한 줄로 꽉 */}
            <View style={[styles.statsStrip, { borderTopColor: ui.line }]}>
              <View style={[styles.statsCell, { borderRightWidth: 1, borderRightColor: ui.line }]}>
                <Text style={[styles.statsLabel, { color: ui.muted }]}>距離</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <Text style={[styles.statsBig, { color: ui.text }]}>{distanceKm}</Text>
                  <Text style={[styles.statsUnit, { color: ui.muted }]}>km</Text>
                </View>
                <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>{metersText}</Text>
              </View>

              <View style={styles.statsCell}>
                <Text style={[styles.statsLabel, { color: ui.muted }]}>時間</Text>
                <Text style={[styles.statsTime, { color: ui.text }]}>{timeHms}</Text>
              </View>
            </View>

            {/* 목표 박스 */}
            <View style={{ padding: 16 }}>
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

              {/* ✅ 오늘의 드릴(달리는 중에도 계속 보이게) */}
              <View style={{ height: 12 }} />
              <View style={[styles.drillCard, { borderColor: ui.line, backgroundColor: ui.cellBg }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ui.muted, fontWeight: "900" }}>今日のドリル（{todayDowLabel}）</Text>
                    <Text style={{ color: ui.text, fontWeight: "900", marginTop: 6 }}>{drillTitle}</Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      setPlanDraftKey(selectedPlanKey ?? getPlanGlobal() ?? "5K");
                      setPlanStep("PLAN");
                      setPlanModalOpen(true);
                      setRpeOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.drillEditBtn,
                      { borderColor: ui.line, backgroundColor: ui.ghostBg, opacity: pressed ? 0.75 : 1 },
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="settings-outline" size={16} color={ui.muted} />
                    <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 12 }}>変更</Text>
                  </Pressable>
                </View>

                <View style={{ height: 10 }} />
                <Text style={{ color: ui.text, fontWeight: "800", lineHeight: 18 }}>{drillTodayText}</Text>
              </View>

              {/* ✅✅✅ 종료 후: 지도 + 스플릿 표시 */}
              {runState === "FINISHED" ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: ui.muted, fontWeight: "900" }}>ルート & Splits</Text>
                  <View style={{ height: 10 }} />

                  {Platform.OS === "web" ? (
                    <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: ui.line, backgroundColor: ui.cellBg }}>
                      <Text style={{ color: ui.muted, fontWeight: "800" }}>
                        Webでは地図表示が不安定です。スマホ実機で確認してください。
                      </Text>
                    </View>
                  ) : routeLine.length < 2 ? (
                    <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: ui.line, backgroundColor: ui.cellBg }}>
                      <Text style={{ color: ui.muted, fontWeight: "800" }}>ルートが短すぎて地図に表示できません。</Text>
                    </View>
                  ) : (
                    <>
                      <View style={{ height: 220, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: ui.line }}>
                        <MapView
                          ref={(r) => {
                         mapRef.current = r;
                          }}

                          style={{ flex: 1 }}
                          onLayout={() => setMapReady(true)}
                          initialRegion={{
                            latitude: routeLine[0].latitude,
                            longitude: routeLine[0].longitude,
                            latitudeDelta: 0.01,
                            longitudeDelta: 0.01,
                          }}
                        >
                          <Polyline coordinates={routeLine} strokeWidth={4} strokeColor={ui.green} />
                          <Marker coordinate={routeLine[0]} title="START" />
                          <Marker coordinate={routeLine[routeLine.length - 1]} title="FINISH" />
                        </MapView>
                      </View>

                      <View style={{ height: 14 }} />
                      <Text style={{ color: ui.muted, fontWeight: "900" }}>Splits (1km)</Text>

                      {finishSplits.length === 0 ? (
                        <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 8 }}>スプリットなし（1km未満 or データ不足）</Text>
                      ) : (
                        <View style={{ marginTop: 10, gap: 6 }}>
                          {finishSplits.map((sp) => (
                            <View key={sp.km} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={{ color: ui.text, fontWeight: "900" }}>{sp.km}km</Text>
                              <Text style={{ color: ui.text, fontWeight: "900" }}>
                                {secToMmss(sp.sec)} <Text style={{ color: ui.muted, fontWeight: "800" }}>(/km)</Text>
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ===================== ✅ 단일 플랜 모달 (바깥 스크롤 제거 / 내부만 스크롤) ===================== */}
      <Modal visible={planModalOpen} transparent animationType="fade" onRequestClose={closePlanModal}>
        <View style={[styles.modalOverlay, { backgroundColor: ui.overlay }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closePlanModal} />
          <View style={styles.modalCenter} pointerEvents="box-none">
            <View
              style={[
                styles.modalCard,
                styles.modalCardElevated,
                { backgroundColor: ui.card, borderColor: ui.line, maxHeight: "82%" as any },
              ]}
              pointerEvents="auto"
            >
              {/* ===== MODE ===== */}
              {planStep === "MODE" ? (
                <>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>今日の測定：設定</Text>
                  <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>
                    距離 / 時間 / プラン（Drill）を選択してください
                  </Text>

                  <View style={{ height: 14 }} />
                  <PrimaryBtn
                    label="距離"
                    onPress={() => {
                      setGoalMode("DISTANCE");
                      goalModeRef.current = "DISTANCE";
                      setPlanStep("DISTANCE");
                    }}
                    ui={ui}
                  />
                  <View style={{ height: 10 }} />
                  <PrimaryBtn
                    label="時間"
                    onPress={() => {
                      setGoalMode("TIME");
                      goalModeRef.current = "TIME";
                      setPlanStep("TIME");
                    }}
                    ui={ui}
                  />
                  <View style={{ height: 10 }} />
                  <GhostBtn
                    label="プラン選択（Drill）"
                    onPress={() => {
                      setPlanDraftKey(selectedPlanKey ?? getPlanGlobal() ?? "5K");
                      setPlanStep("PLAN");
                      setRpeOpen(false);
                    }}
                    ui={ui}
                  />

                  <View style={{ height: 12 }} />
                  <View style={[styles.drillMini, { borderColor: ui.line, backgroundColor: ui.cellBg }]}>
                    <Text style={{ color: ui.muted, fontWeight: "900" }}>今日のドリル（{todayDowLabel}）</Text>
                    <Text style={{ color: ui.text, fontWeight: "900", marginTop: 6 }}>{drillTitle}</Text>
                    <Text style={{ color: ui.text, fontWeight: "800", marginTop: 8, lineHeight: 18 }}>{drillTodayText}</Text>
                  </View>

                  <View style={{ height: 12 }} />
                  <GhostBtn label="閉じる" onPress={closePlanModal} ui={ui} />
                </>
              ) : null}

              {/* ===== DISTANCE ===== */}
              {planStep === "DISTANCE" ? (
                <>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>距離目標</Text>

                  <View style={{ height: 12 }} />
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
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
                    placeholderTextColor={ui.placeholder}
                    style={[
                      styles.input,
                      {
                        borderColor: ui.line,
                        color: ui.text,
                        backgroundColor: planDistanceType === "CUSTOM" ? ui.inputBgActive : ui.inputBg,
                        opacity: planDistanceType === "CUSTOM" ? 1 : 0.9,
                      },
                    ]}
                  />

                  <View style={{ height: 14 }} />
                  <View style={{ flexDirection: "row" }}>
                    <GhostBtn label="戻る" onPress={() => setPlanStep("MODE")} ui={ui} grow />
                    <View style={{ width: 10 }} />
                    <PrimaryBtn label="確定" onPress={confirmDistancePlan} ui={ui} grow />
                  </View>
                </>
              ) : null}

              {/* ===== TIME ===== */}
              {planStep === "TIME" ? (
                <>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>時間目標</Text>

                  <View style={{ height: 14 }} />
                  <View style={{ flexDirection: "row" }}>
                    <SelectBox label="時" value={pad2(pickH)} ui={ui} onPress={() => setPlanStep("PICK_H")} />
                    <View style={{ width: 10 }} />
                    <SelectBox label="分" value={pad2(pickM)} ui={ui} onPress={() => setPlanStep("PICK_M")} />
                    <View style={{ width: 10 }} />
                    <SelectBox label="秒" value={pad2(pickS)} ui={ui} onPress={() => setPlanStep("PICK_S")} />
                  </View>

                  <Text style={{ color: ui.muted, fontWeight: "900", marginTop: 12 }}>
                    選択: <Text style={{ color: ui.green }}>{pad2(pickH)}:{pad2(pickM)}:{pad2(pickS)}</Text>
                  </Text>

                  <View style={{ height: 14 }} />
                  <View style={{ flexDirection: "row" }}>
                    <GhostBtn label="戻る" onPress={() => setPlanStep("MODE")} ui={ui} grow />
                    <View style={{ width: 10 }} />
                    <PrimaryBtn label="確定" onPress={confirmTimePlan} ui={ui} grow />
                  </View>
                </>
              ) : null}

              {/* ===== PLAN (Drill) ===== */}
              {planStep === "PLAN" ? (
                <>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>Drill（トレーニングプラン）</Text>
                  <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>
                    5K / 10K / HALF を選んで、今日の内容を確認できます
                  </Text>

                  <View style={{ height: 12 }} />
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {PLAN_KEYS.map((k) => (
                      <Chip key={k} label={k} active={planDraftKey === k} onPress={() => setPlanDraftKey(k)} ui={ui} />
                    ))}
                  </View>

                  <View style={{ height: 10 }} />
                  <View style={[styles.drillInfoBox, { borderColor: ui.line, backgroundColor: ui.cellBg }]}>
                    <Text style={{ color: ui.text, fontWeight: "900" }}>{PLAN_DATA[planDraftKey].title}</Text>
                    <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 6 }}>{PLAN_DATA[planDraftKey].desc}</Text>

                    <View style={{ height: 10 }} />
                    <Pressable
                      onPress={() => setRpeOpen((p) => !p)}
                      style={({ pressed }) => [
                        styles.rpeBtn,
                        { borderColor: ui.line, backgroundColor: ui.ghostBg, opacity: pressed ? 0.78 : 1 },
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: ui.text, fontWeight: "900" }}>{rpeOpen ? "RPEを閉じる" : "RPEとは？"}</Text>
                      <Ionicons name={rpeOpen ? "chevron-up" : "chevron-down"} size={18} color={ui.muted} />
                    </Pressable>

                    {rpeOpen ? (
                      <View style={[styles.rpePanel, { borderColor: ui.line, backgroundColor: ui.inputBg }]}>
                        <Text style={{ color: ui.text, fontWeight: "900" }}>RPE = 体感の強度（1〜10）</Text>
                        <View style={{ height: 8 }} />
                        <Text style={{ color: ui.text, fontWeight: "800", lineHeight: 18 }}>
                          2〜3: Easy（会話できる）{"\n"}
                          4〜5: Steady（短い文ならOK）{"\n"}
                          6〜7: Tempo（ほぼ話せない）{"\n"}
                          8〜9: Interval（かなりキツい）{"\n"}
                          10: 全力疾走
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ height: 12 }} />
                  <View style={{ flexDirection: "row" }}>
                    <GhostBtn label="戻る" onPress={() => setPlanStep("MODE")} ui={ui} grow />
                    <View style={{ width: 10 }} />
                    <PrimaryBtn label="このプランを適用" onPress={applyDrillPlan} ui={ui} grow />
                  </View>

                  <View style={{ height: 12 }} />
                  <Text style={{ color: ui.muted, fontWeight: "900", marginBottom: 8 }}>
                    週プラン（今日：{todayDowLabel} を強調）
                  </Text>

                  {/* ✅ 표는 내부만 스크롤 */}
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: ui.line, overflow: "hidden" }}>
                    <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                      {PLAN_DATA[planDraftKey].rows.map((r, idx) => {
                        const isToday = idx === todayDowIdx;
                        return (
                          <View
                            key={`${r.day}-${idx}`}
                            style={[
                              styles.planRow,
                              {
                                borderBottomColor: ui.line,
                                backgroundColor: isToday ? ui.cellBgActive : "transparent",
                              },
                            ]}
                          >
                            <View style={{ width: 40, alignItems: "center" }}>
                              <Text style={{ color: isToday ? ui.green : ui.muted, fontWeight: "900" }}>{r.day}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: ui.text, fontWeight: isToday ? "900" : "800", lineHeight: 18 }}>
                                {r.text}
                              </Text>
                            </View>
                            {isToday ? <Ionicons name="star" size={16} color={ui.green} /> : <View style={{ width: 16 }} />}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </>
              ) : null}

              {/* ===== 숫자 리스트만 스크롤 ===== */}
              {planStep === "PICK_H" || planStep === "PICK_M" || planStep === "PICK_S" ? (
                <>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>{pickerTitle(planStep)} を選択</Text>
                  <View style={{ height: 12 }} />

                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: ui.line, overflow: "hidden" }}>
                    <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                      {pickerValues(planStep).map((v) => {
                        const active = v === pickerSelected(planStep);
                        return (
                          <Pressable
                            key={String(v)}
                            onPress={() => onPickNumber(planStep, v)}
                            style={({ pressed }) => [
                              styles.pickerRow,
                              {
                                backgroundColor: active ? ui.cellBgActive : "transparent",
                                opacity: pressed ? 0.7 : 1,
                                borderBottomColor: ui.line,
                              },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={{ color: active ? ui.green : ui.text, fontWeight: "900", fontSize: 16 }}>{pad2(v)}</Text>
                            {active ? <Ionicons name="checkmark" size={18} color={ui.green} /> : <View style={{ width: 18 }} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={{ height: 12 }} />
                  <GhostBtn label="戻る" onPress={() => setPlanStep("TIME")} ui={ui} />
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ 날짜 상세 모달 (기존 유지) */}
      <Modal
        visible={dayModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDayModalOpen(false);
          setDayDetail(null);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: ui.overlay }]}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              setDayModalOpen(false);
              setDayDetail(null);
            }}
          />

          <View style={styles.modalCenter} pointerEvents="box-none">
            <View style={[styles.modalCard, styles.modalCardElevated, { backgroundColor: ui.card, borderColor: ui.line }]} pointerEvents="auto">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>{selectedDate}</Text>
                  <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                    {isTodayPicked ? "今日（測定/保存OK）" : "閲覧のみ（測定/保存は今日のみ）"}
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    setDayModalOpen(false);
                    setDayDetail(null);
                  }}
                  style={({ pressed }) => [
                    styles.modalCloseBtn,
                    { borderColor: ui.line, backgroundColor: ui.backBtnBg, opacity: pressed ? 0.75 : 1 },
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                              onPress={() => confirmDelete(runId)}
                              style={({ pressed }) => [
                                styles.deletePill,
                                { borderColor: ui.danger, opacity: pressed ? 0.7 : 1, backgroundColor: ui.dangerBg },
                              ]}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

              <View style={{ flexDirection: "row" }}>
                <GhostBtn
                  label="閉じる"
                  onPress={() => {
                    setDayModalOpen(false);
                    setDayDetail(null);
                  }}
                  ui={ui}
                  grow
                />
                <View style={{ width: 10 }} />
                <PrimaryBtn label="今日の測定へ" onPress={openStartFlow} ui={ui} grow />
              </View>

              <View style={{ height: 10 }} />

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

          return (
            <Pressable
              key={c.iso}
              onPress={() => onPressDate(c.iso)}
              style={({ pressed }) => [
                styles.cellMini,
                {
                  width: cellSize,
                  height: h,
                  borderColor: isSelected ? ui.pillActiveBorder : isToday ? ui.pillActiveBorder : ui.line,
                  backgroundColor: isSelected ? ui.cellBgActive : ui.cellBg,
                  opacity: pressed ? 0.78 : c.inMonth ? 1 : 0.35,
                },
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[styles.dayNum, { color: isSelected ? ui.green : ui.text }]}>{dd}</Text>
              {hasRun ? (
                <View style={[styles.runDot, { backgroundColor: ui.green, borderColor: ui.dotBorder }]} />
              ) : (
                <View style={{ height: 9, marginTop: 8 }} />
              )}
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

function PrimaryBtn({ label, onPress, ui, grow }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        !grow ? { alignSelf: "stretch" } : { flex: 1 },
        { backgroundColor: ui.green, opacity: pressed ? 0.85 : 1 },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ color: "#08110b", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function DangerBtn({ label, onPress, ui, grow }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dangerBtn,
        !grow ? { alignSelf: "stretch" } : { flex: 1 },
        { borderColor: ui.danger, backgroundColor: ui.dangerBg, opacity: pressed ? 0.85 : 1 },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ color: ui.danger, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function GhostBtn({ label, onPress, ui, small, grow }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        small ? styles.ghostBtnSmall : styles.ghostBtn,
        !small ? (!grow ? { alignSelf: "stretch" } : { flex: 1 }) : null,
        { borderColor: ui.line, backgroundColor: ui.ghostBg, opacity: pressed ? 0.85 : 1 },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress, ui }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? ui.pillActiveBorder : ui.line,
          backgroundColor: active ? ui.pillActiveBg : ui.cellBg,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectBox,
        { borderColor: ui.line, backgroundColor: ui.cellBg, opacity: pressed ? 0.8 : 1 },
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

/* ===== Bottom Tab Button (index.tsx와 동일) ===== */

function TabBtn({ label, icon, onPress, active, ui }: any) {
  const color = active ? ui.green : ui.text;
  const pillStyle = active
    ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
    : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tabPress, { opacity: pressed ? 0.7 : 1 }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
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

  runWrap: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },

  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, fontWeight: "800" },

  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1, marginRight: 8, marginBottom: 8 },

  primaryBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtn: {
    minHeight: 50,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtn: {
    minHeight: 50,
    paddingVertical: 12,
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
  },

  deletePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },

  statsStrip: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  statsCell: {
    flex: 1,
    padding: 16,
  },
  statsLabel: { fontWeight: "900", fontSize: 12 },
  statsBig: { fontWeight: "900", fontSize: 34, marginTop: 6 },
  statsUnit: { fontWeight: "900", fontSize: 14, paddingBottom: 4 },
  statsTime: { fontWeight: "900", fontSize: 26, marginTop: 10 },

  targetBoxBig: { borderWidth: 1, borderRadius: 16, padding: 14 },

  drillCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  drillEditBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
  drillMini: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  drillInfoBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },

  rpeBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rpePanel: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },

  planRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },

  modalOverlay: {
    flex: 1,
  },
  modalCenter: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  modalCardElevated: {
    elevation: 10,
    zIndex: 10,
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
