import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

const BASE_URL = "http://172.20.10.4:8080/RunFIT_";

const TOKEN_KEY = "runfit_token";
const TAB_H = 96;

const getAuthGlobal = () => (globalThis as any).__RUNFIT_AUTH__ || null;

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
  card: "rgba(255,255,255,0.045)",
  cardSolid: "#0f1620",
  line: "rgba(255,255,255,0.11)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  green: "#6dff8b",
  green2: "#3be271",
  danger: "#ff5a5f",
  shadow: "rgba(0,0,0,0.55)",

  topBtnBg: "rgba(255,255,255,0.06)",
  cellBg: "rgba(0,0,0,0.18)",
  cellBorder: "rgba(255,255,255,0.10)",
  itemBg: "rgba(0,0,0,0.18)",
  hintBg: "rgba(255,255,255,0.05)",

  pillActiveBg: "rgba(109,255,139,0.14)",
  pillActiveBorder: "rgba(109,255,139,0.35)",
  pillIdleBg: "rgba(255,255,255,0.03)",
};

const LIGHT_UI = {
  mode: "light" as const,
  bg: "#f6f8fb",
  card: "rgba(255,255,255,0.85)",
  cardSolid: "#ffffff",
  line: "rgba(15,23,42,0.14)",
  text: "rgba(11,15,20,0.92)",
  muted: "rgba(11,15,20,0.60)",
  green: "#18a957",
  green2: "#0f8f4a",
  danger: "#ff5a5f",
  shadow: "rgba(0,0,0,0.10)",

  topBtnBg: "rgba(15,23,42,0.04)",
  cellBg: "rgba(15,23,42,0.04)",
  cellBorder: "rgba(15,23,42,0.10)",
  itemBg: "rgba(15,23,42,0.03)",
  hintBg: "rgba(15,23,42,0.03)",

  pillActiveBg: "rgba(24,169,87,0.12)",
  pillActiveBorder: "rgba(24,169,87,0.30)",
  pillIdleBg: "rgba(15,23,42,0.04)",
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

type CalendarSummary = {
  intakeKcal: number;
  burnKcal: number;
  runKm: number;
  preview: string[];
};

type CalendarResponse = {
  ym: string;
  byDate: Record<string, CalendarSummary>;
};

type DayMealItem = {
  id: number;
  foodName: string;
  servingGram: number;
  cal: number;
  p: number;
  c: number;
  f: number;
};

type DayRunItem = {
  id: number;
  distanceKm: number;
  burnKcal: number;
  memo?: string | null;
};

type DayDetailResponse = {
  date: string;
  summary: {
    intakeKcal: number;
    p: number;
    c: number;
    f: number;
    runKm: number;
    burnKcal: number;
  };
  runs: DayRunItem[];
  meals: Record<string, DayMealItem[]>;
};

/* =========================
   간이 추천섭취량(성별만)
   - 30대 평균 가정 시발 오류 존나떠서 걍 더미데이터 넣자 
   - 권장 kcal + PFC g 표시
========================= */
function RecommendIntakeBox({
  ui,
  gender,
  dayBurnKcal,
}: {
  ui: any;
  gender: "M" | "F";
  dayBurnKcal: number;
}) {
  //  성별만으로 대충 고정 권장 칼로리
  const baseKcal = gender === "M" ? 2400 : 1900;

  //  탄/단/지 비율 (50/25/25) 더미데이타 
  const carbRatio = 0.5;
  const proteinRatio = 0.25;
  const fatRatio = 0.25;

  const carbG = Math.round((baseKcal * carbRatio) / 4);
  const proteinG = Math.round((baseKcal * proteinRatio) / 4);
  const fatG = Math.round((baseKcal * fatRatio) / 9);

  const extra = Math.max(0, Math.round(dayBurnKcal || 0));
  const todayMax = baseKcal + extra;

  return (
    <Box ui={ui} title="おすすめ摂取量">
  
      <View style={{ marginTop: 12 }}>
        <Text style={{ color: ui.text, fontWeight: "900", marginBottom: 8 }}>目安のPFC（g/日）</Text>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Pill ui={ui} label="炭水化物" value={`${carbG} g`} />
          <Pill ui={ui} label="たんぱく質" value={`${proteinG} g`} />
          <Pill ui={ui} label="脂質" value={`${fatG} g`} />
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: ui.muted, fontWeight: "800" }}>
          今日の運動（消費 {extra} kcal）: 目安上限 {todayMax} kcal
        </Text>
      </View>

      
    </Box>
  );
}

/* =========================
    스크린
========================= */
export default function FoodDate() {
  const { mode, ui } = useRunFitTheme();

  const pathname = usePathname();
  const { width, height } = useWindowDimensions();

// 식사 리스트 영역만 스크롤될 높이 ( 숫자만 간단하게 조잘가능 ㅇ222)
const mealsMaxH = Math.min(420, Math.max(180, Math.floor(height * 0.38)));

  const params = useLocalSearchParams<{ ym?: string }>();
  const today = getToday();

  const auth = getAuthGlobal();
  const userId: number | null = auth?.userId ?? null;

  // 성별만 사용 오류 더미데이터 222
  const rawGender = (auth as any)?.gender;
  const gender: "M" | "F" = rawGender === "F" || rawGender === "female" ? "F" : "M";

  const [ym, setYm] = useState<string>(() => {
    const p = params?.ym;
    return p && /^\d{4}-\d{2}$/.test(p) ? p : today.slice(0, 7);
  });

  const [loadingMonth, setLoadingMonth] = useState(false);
  const [monthData, setMonthData] = useState<Record<string, CalendarSummary>>({});

  const [monthError, setMonthError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(false);

  const [open, setOpen] = useState(false);
  const [openDate, setOpenDate] = useState<string>(today);
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetailResponse | null>(null);

  const cells = buildMonthCells(ym);
  const mealOrder = ["朝", "昼", "夜", "間食"];

  const CAL_GAP = 6;
  const OUTER_PAD = 16;
  const CARD_PAD = 16;
  const gridW = Math.max(280, width - OUTER_PAD * 2 - CARD_PAD * 2);
  const cellSize = Math.floor((gridW - CAL_GAP * 6) / 7);
  const cellH = Math.max(44, Math.min(cellSize, 56));

  const activeKey = (() => {
    if (pathname === "/") return "ホーム";
    if (pathname?.toLowerCase().includes("record")) return "記録";
    if (pathname?.toLowerCase().includes("fooddate")) return "栄養";
    if (pathname?.toLowerCase().includes("ranking")) return "ランキング";
    if (pathname?.toLowerCase().includes("account")) return "アカウント";
    return "ホーム";
  })();

  const onTap = (label: string) => {
    if (label === "ホーム") router.push("/");
    else if (label === "記録") router.push("/Record");
    else if (label === "栄養") router.push("/FoodDate");
    else if (label === "ランキング") router.push("/Ranking");
    else if (label === "アカウント") router.push("/Account");
  };

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);

      if (!token && !userId) {
        Alert.alert("ログインが必要", "栄養はログイン後に利用できます。", [
          { text: "OK", onPress: () => router.replace("/") },
        ]);
        return;
      }
      setAuthReady(true);
    })();
  }, [userId]);

  //  월 달력
  useEffect(() => {
    if (!authReady) return;

    (async () => {
      setLoadingMonth(true);
      setMonthError(null);
      try {
        const res = await apiGet<CalendarResponse>(`/api/food/calendar?ym=${encodeURIComponent(ym)}`, userId);
        setMonthData(res.byDate || {});
      } catch (e: any) {
        setMonthError(String(e?.message || e));
      } finally {
        setLoadingMonth(false);
      }
    })();
  }, [ym, authReady, userId]);

  const onPrevMonth = () => setYm(addMonths(ym, -1));
  const onNextMonth = () => setYm(addMonths(ym, +1));
  const onThisMonth = () => setYm(today.slice(0, 7));

  const openModal = async (date: string) => {
    if (!authReady) return;

    setOpenDate(date);
    setOpen(true);
    setDayDetail(null);

    setLoadingDay(true);
    setDayError(null);
    try {
      const res = await apiGet<DayDetailResponse>(`/api/food/day?date=${encodeURIComponent(date)}`, userId);
      setDayDetail(res);
    } catch (e: any) {
      setDayError(String(e?.message || e));
    } finally {
      setLoadingDay(false);
    }
  };

  const closeModal = () => setOpen(false);

  const onDeleteMeal = async (mealId: number) => {
    Alert.alert("削除", "この項目を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await apiPost(`/api/food/meal/delete`, { id: mealId }, userId);
            await openModal(openDate);
            const cal = await apiGet<CalendarResponse>(`/api/food/calendar?ym=${encodeURIComponent(ym)}`, userId);
            setMonthData(cal.byDate || {});
          } catch (e: any) {
            Alert.alert("削除失敗", String(e?.message || e));
          }
        },
      },
    ]);
  };

  if (!authReady) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 12 }}>確認中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, paddingTop: Platform.OS === "android" ? 6 : 0 }}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />

      <BgDecor mode={mode} ui={ui} />

      <Header title="食事カレンダー" ui={ui} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: TAB_H + 18 }}>
        {monthError ? (
          <ErrorBanner ui={ui} title="月データ取得失敗" message={monthError} onClose={() => setMonthError(null)} />
        ) : null}

        <View style={styles.breadcrumbRow}>
          <Pressable onPress={() => router.push("/")} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ color: ui.green, fontWeight: "900" }}>ホーム</Text>
          </Pressable>
          <Text style={{ color: ui.muted, fontWeight: "800" }}> / </Text>
          <Text style={{ color: ui.text, fontWeight: "900" }}>栄養</Text>
        </View>

        <Card ui={ui}>
          <View style={styles.monthBar}>
            <View>
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16, letterSpacing: -0.2 }}>{ym}</Text>
              <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>
                ※ 日付を押すと詳細が表示されます
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <GhostBtn label="← 前の月" onPress={onPrevMonth} ui={ui} />
              <GhostBtn label="今月" onPress={onThisMonth} ui={ui} />
              <GhostBtn label="次の月 →" onPress={onNextMonth} ui={ui} />
            </View>
          </View>

          <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 8 }}>
            {["日", "月", "火", "水", "木", "金", "土"].map((d, idx) => (
              <View key={d} style={{ width: cellSize, marginRight: idx === 6 ? 0 : CAL_GAP }}>
                <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "900", textAlign: "center" }}>{d}</Text>
              </View>
            ))}
          </View>

          <CalendarGrid
            ym={ym}
            today={today}
            cells={cells}
            ui={ui}
            monthData={monthData}
            loading={loadingMonth}
            onPressDate={(date) => openModal(date)}
            cellSize={cellSize}
            cellH={cellH}
            gap={CAL_GAP}
          />
        </Card>

        <View style={{ height: 10 }} />
      </ScrollView>

      <View style={[styles.bottomTabs, { borderTopColor: ui.line, backgroundColor: ui.bg }]}>
        <TabBtn label="ホーム" icon="home-outline" active={activeKey === "ホーム"} onPress={() => onTap("ホーム")} ui={ui} />
        <TabBtn label="記録" icon="walk-outline" active={activeKey === "記録"} onPress={() => onTap("記録")} ui={ui} />
        <TabBtn label="栄養" icon="nutrition-outline" active={activeKey === "栄養"} onPress={() => onTap("栄養")} ui={ui} />
        <TabBtn
          label="ランキング"
          icon="podium-outline"
          active={activeKey === "ランキング"}
          onPress={() => onTap("ランキング")}
          ui={ui}
        />
        <TabBtn
          label="アカウント"
          icon="person-circle-outline"
          active={activeKey === "アカウント"}
          onPress={() => onTap("アカウント")}
          ui={ui}
        />
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
  <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <View style={[styles.modal, { borderColor: ui.line, backgroundColor: ui.cardSolid }]}>
            <View style={{ padding: 16 }}>
              <View style={styles.modalTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: ui.text, fontWeight: "900", fontSize: 16, marginTop: 4 }}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {openDate}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <PrimaryBtn
                    label="食事を追加"
                    ui={ui}
                    onPress={() => {
                      router.push({ pathname: "/FoodRecord", params: { date: openDate, ym } } as any);
                      closeModal();
                    }}
                  />
                  <OutlineBtn
                    label="ランニング記録"
                    ui={ui}
                    onPress={() => {
                      router.push("/Record");
                      closeModal();
                    }}
                  />
                  <GhostBtn label="閉じる" ui={ui} onPress={closeModal} />
                </View>
              </View>

              {dayError ? (
                <View style={{ marginTop: 12 }}>
                  <ErrorBanner ui={ui} title="日別データ取得失敗" message={dayError} onClose={() => setDayError(null)} />
                </View>
              ) : null}

              <View style={{ height: 12 }} />

              {loadingDay ? (
                <View style={{ paddingVertical: 30 }}>
                  <ActivityIndicator />
                  <Text style={{ color: ui.muted, fontWeight: "800", textAlign: "center", marginTop: 10 }}>
                    読み込み中...
                  </Text>
                </View>
              ) : !dayDetail ? (
                <Box ui={ui} title="記録なし">
                  <Text style={{ color: ui.muted, fontWeight: "800" }}>Food / Record から追加してみて</Text>
                </Box>
              ) : (
                <View style={{ gap: 12 }}>
                  <Box ui={ui} title="1日のサマリー">
                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                      <Pill ui={ui} label="摂取" value={`${Math.round(dayDetail.summary.intakeKcal)} kcal`} />
                      <Pill ui={ui} label="ラン" value={`${fmt1(dayDetail.summary.runKm)} km`} />
                      <Pill ui={ui} label="消費" value={`${Math.round(dayDetail.summary.burnKcal)} kcal`} />
                    </View>
                  </Box>

                  {dayDetail.runs?.length > 0 && (
                    <Box ui={ui} title="ランニング記録">
                      {dayDetail.runs.map((r) => (
                        <ItemRow
                          key={r.id}
                          ui={ui}
                          title={`ランニング ${fmt1(r.distanceKm)} km`}
                          meta={[`消費 ${Math.round(r.burnKcal)} kcal`, r.memo ? `メモ: ${r.memo}` : ""].filter(Boolean)}
                        />
                      ))}
                    </Box>
                  )}

                  {/*  간이 추천 섭취량 + PFC (성별만) */}
                  <RecommendIntakeBox ui={ui} gender={gender} dayBurnKcal={dayDetail.summary.burnKcal} />

                  <Box ui={ui} title="食事合計">
                    <Text style={{ color: ui.muted, fontWeight: "900" }}>
                      <Text style={{ color: ui.text, fontWeight: "900" }}>{Math.round(dayDetail.summary.intakeKcal)}</Text>{" "}
                      kcal · 炭{" "}
                      <Text style={{ color: ui.text, fontWeight: "900" }}>{Math.round(dayDetail.summary.c * 10) / 10}</Text>
                      g · たん{" "}
                      <Text style={{ color: ui.text, fontWeight: "900" }}>{Math.round(dayDetail.summary.p * 10) / 10}</Text>
                      g · 脂{" "}
                      <Text style={{ color: ui.text, fontWeight: "900" }}>{Math.round(dayDetail.summary.f * 10) / 10}</Text>g
                    </Text>
                  </Box>

                  {/*  식사합계 아래(朝/昼/夜/間食) 영역만 스크롤 */}
  <ScrollView
  style={{ maxHeight: mealsMaxH }}
  contentContainerStyle={{ paddingBottom: 6 }}
  showsVerticalScrollIndicator={false}
  nestedScrollEnabled
>
  {mealOrder.map((t) => {
    const list = dayDetail.meals?.[t] || [];
    if (!list.length) return null;

    return (
      <Box key={t} ui={ui} title={t}>
        {list.map((m) => (
          <ItemRow
            key={m.id}
            ui={ui}
            title={m.foodName}
            meta={[
              `${m.servingGram}g`,
              `${Math.round(m.cal)} kcal`,
              `炭 ${Math.round(m.c * 10) / 10}g`,
              `たん ${Math.round(m.p * 10) / 10}g`,
              `脂 ${Math.round(m.f * 10) / 10}g`,
            ]}
            right={
              <Pressable
                onPress={() => onDeleteMeal(m.id)}
                style={({ pressed }) => [
                  styles.delBtn,
                  {
                    borderColor: ui.line,
                    backgroundColor: "rgba(255,90,95,0.12)",
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: ui.mode === "dark" ? "#ffd9da" : "rgba(255,90,95,0.95)",
                    fontWeight: "900",
                  }}
                >
                  削除
                </Text>
              </Pressable>
            }
          />
        ))}
      </Box>
    );
  })}
</ScrollView>

                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function BgDecor({ mode, ui }: { mode: "dark" | "light"; ui: any }) {
  if (mode === "light") {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={["rgba(246,248,251,1)", "rgba(246,248,251,1)", "rgba(246,248,251,1)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(24,169,87,0.10)", "rgba(90,140,255,0.10)", "rgba(246,248,251,0)"]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.glow, { top: -160, left: -150, backgroundColor: "rgba(24,169,87,0.10)" }]} />
        <View style={[styles.glow, { top: -180, right: -160, backgroundColor: "rgba(90,140,255,0.10)" }]} />
        <LinearGradient
          colors={["rgba(246,248,251,0)", "rgba(246,248,251,0.35)", "rgba(246,248,251,0.65)"]}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["rgba(11,15,20,1)", "rgba(11,15,20,1)", "rgba(11,15,20,1)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(109,255,139,0.16)", "rgba(90,140,255,0.14)", "rgba(11,15,20,0)"]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, { top: -150, left: -140, backgroundColor: "rgba(109,255,139,0.16)" }]} />
      <View style={[styles.glow, { top: -170, right: -150, backgroundColor: "rgba(90,140,255,0.16)" }]} />
      <LinearGradient
        colors={["rgba(11,15,20,0)", "rgba(11,15,20,0.35)", "rgba(11,15,20,0.72)"]}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function Header({ title, ui }: { title: string; ui: any }) {
  return (
    <View style={[styles.header, { borderBottomColor: ui.line, backgroundColor: ui.topBtnBg }]}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.backBtn,
          { borderColor: ui.line, opacity: pressed ? 0.7 : 1, backgroundColor: ui.topBtnBg },
        ]}
      >
        <Text style={{ color: ui.text, fontWeight: "900" }}>‹</Text>
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[styles.logoDot, { shadowColor: ui.green, backgroundColor: ui.green }]} />
        <View>
          <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>{title}</Text>
          <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11, marginTop: 2 }}>Meal Calendar</Text>
        </View>
      </View>

      <View style={{ width: 36 }} />
    </View>
  );
}

function Card({ children, ui }: any) {
  return <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>{children}</View>;
}

function GhostBtn({ label, onPress, ui }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnGhost,
        {
          borderColor: ui.line,
          backgroundColor: ui.topBtnBg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function PrimaryBtn({ label, onPress, ui }: any) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btnPrimary, { opacity: pressed ? 0.9 : 1 }]}>
      <LinearGradient colors={[ui.green, ui.green2]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.btnPrimaryInner}>
        <Text style={{ color: "#05210f", fontWeight: "900" }}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function OutlineBtn({ label, onPress, ui }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnGhost,
        {
          borderColor: ui.line,
          backgroundColor: ui.topBtnBg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Box({ ui, title, children }: any) {
  return (
    <View style={[styles.box, { borderColor: ui.line, backgroundColor: ui.hintBg }]}>
      <Text style={{ color: ui.text, fontWeight: "900", fontSize: 14, marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function Pill({ ui, label, value }: any) {
  return (
    <View style={[styles.pill, { borderColor: ui.line, backgroundColor: ui.topBtnBg }]}>
      <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 11 }}>{label}</Text>
      <Text style={{ color: ui.text, fontWeight: "900", fontSize: 11 }}>{value}</Text>
    </View>
  );
}

function ItemRow({
  ui,
  title,
  meta,
  right,
}: {
  ui: any;
  title: string;
  meta: string[];
  right?: React.ReactNode;
}) {
  return (
    <View style={[styles.itemRow, { borderColor: ui.line, backgroundColor: ui.itemBg }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: ui.text, fontWeight: "900" }} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          {meta.map((m, idx) => (
            <Text key={idx} style={{ color: ui.muted, fontWeight: "800", fontSize: 11 }}>
              {m}
            </Text>
          ))}
        </View>
      </View>
      {right ? <View style={{ marginLeft: 10 }}>{right}</View> : null}
    </View>
  );
}

function CalendarGrid({
  ym,
  today,
  cells,
  ui,
  monthData,
  loading,
  onPressDate,
  cellSize,
  cellH,
  gap,
}: {
  ym: string;
  today: string;
  cells: { date: string; out: boolean }[];
  ui: any;
  monthData: Record<string, CalendarSummary>;
  loading: boolean;
  onPressDate: (date: string) => void;
  cellSize: number;
  cellH: number;
  gap: number;
}) {
  return (
    <View style={{ marginTop: 6 }}>
      {loading ? (
        <View style={{ paddingVertical: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: ui.muted, fontWeight: "800", textAlign: "center", marginTop: 10 }}>
            月データ読み込み中...
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((c, idx) => {
          const isOut = c.out;
          const isToday = c.date === today;

          const sum = monthData[c.date];
          const runKm = sum?.runKm ?? 0;
          const burn = sum?.burnKcal ?? 0;
          const hasRun = runKm > 0.0001 || burn > 0.1;

          const isLastCol = idx % 7 === 6;

          return (
            <Pressable
              key={c.date}
              onPress={() => onPressDate(c.date)}
              style={({ pressed }) => [
                styles.cellMini,
                {
                  width: cellSize,
                  height: cellH,
                  marginRight: isLastCol ? 0 : gap,
                  marginBottom: gap,
                  borderColor:
                    isToday
                      ? ui.mode === "dark"
                        ? "rgba(109,255,139,0.55)"
                        : "rgba(24,169,87,0.40)"
                      : ui.cellBorder,
                  backgroundColor: ui.cellBg,
                  opacity: isOut ? 0.35 : pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text style={[styles.dayNum, { color: ui.text }]}>{Number(c.date.slice(-2))}</Text>
              {hasRun ? <View style={[styles.runDot, { backgroundColor: ui.green }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ErrorBanner({ ui, title, message, onClose }: { ui: any; title: string; message: string; onClose: () => void }) {
  return (
    <View
      style={[
        styles.errBox,
        {
          borderColor: "rgba(255,90,95,0.55)",
          backgroundColor: "rgba(255,90,95,0.10)",
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: ui.mode === "dark" ? "#ffd9da" : "rgba(255,90,95,0.95)", fontWeight: "900", fontSize: 13 }}>
          {title}
        </Text>

        <Text style={{ color: ui.text, fontWeight: "800", fontSize: 12, marginTop: 6 }} numberOfLines={6}>
          {message}
        </Text>

        <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11, marginTop: 8 }}>BASE_URL: {BASE_URL}</Text>
      </View>

      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.errClose,
          {
            opacity: pressed ? 0.7 : 1,
            borderColor: ui.line,
            backgroundColor: ui.topBtnBg,
          },
        ]}
      >
        <Text style={{ color: ui.text, fontWeight: "900" }}>×</Text>
      </Pressable>
    </View>
  );
}

function TabBtn({ label, icon, onPress, active, ui }: any) {
  const color = active ? ui.green : ui.text;
  const pillStyle = active
    ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
    : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tabPress, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.tabPill, pillStyle]}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={{ color, fontWeight: "900", fontSize: 13 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

async function apiGet<T>(path: string, userId?: number | null): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);

  const headers: any = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (userId) headers["X-USER-ID"] = String(userId);

  const res = await fetch(`${BASE_URL}${path}`, { method: "GET", headers });

  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

async function apiPost(path: string, body: any, userId?: number | null): Promise<any> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);

  const headers: any = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (userId) headers["X-USER-ID"] = String(userId);

  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "(no body)";
  }
}

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt1(v: number) {
  return (Math.round(v * 10) / 10).toFixed(1);
}

function addMonths(ym: string, delta: number) {
  const [yStr, mStr] = ym.split("-");
  let y = Number(yStr);
  let m = Number(mStr);
  m += delta;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  while (m >= 13) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function buildMonthCells(ym: string) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);

  const first = new Date(y, m - 1, 1);
  const dow = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - dow);

  const cells: { date: string; out: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const iso = `${yy}-${mm}-${dd}`;

    const out = d.getMonth() + 1 !== m;
    cells.push({ date: iso, out });
  }
  return cells;
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: 999,
    opacity: 1,
  },

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
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  breadcrumbRow: { flexDirection: "row", alignItems: "center" },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    overflow: "hidden",
  },

  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },

  btnGhost: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },

  btnPrimary: { borderRadius: 12, overflow: "hidden" },
  btnPrimaryInner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  cellMini: {
    borderWidth: 1,
    borderRadius: 16,
    paddingTop: 8,
    paddingLeft: 10,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    position: "relative",
  },
  dayNum: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  runDot: {
    position: "absolute",
    left: 10,
    bottom: 8,
    width: 18,
    height: 6,
    borderRadius: 999,
    opacity: 0.95,
  },

  backdrop: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    width: "100%",
    maxWidth: 860,
    maxHeight: "92%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  box: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },

  delBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },

  errBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  errClose: {
    borderWidth: 1,
    width: 36,
    height: 36,
    borderRadius: 12,
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