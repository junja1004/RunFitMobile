import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BASE_URL = "http://172.20.10.4:8080/RunFIT_";
const TAB_H = 96;

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

function setThemeModeGlobal(mode: ThemeMode) {
  const g = globalThis as any;
  g[THEME_MODE_KEY] = mode;

  const bus = getThemeBus();
  bus.subs.forEach((fn) => {
    try {
      fn(mode);
    } catch {}
  });
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
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.94)",
  muted: "rgba(255,255,255,0.70)",
  green: "#6dff8b",
  danger: "#ff5a5f",
  pillActiveBg: "rgba(109,255,139,0.14)",
  pillActiveBorder: "rgba(109,255,139,0.35)",
  pillIdleBg: "rgba(255,255,255,0.03)",
  topBtnBg: "rgba(255,255,255,0.04)",
  modalBackdrop: "rgba(0,0,0,0.55)",
};

const LIGHT_UI = {
  mode: "light" as const,
  bg: "#f6f8fb",
  card: "#ffffff",
  line: "rgba(15,23,42,0.14)",
  text: "rgba(11,15,20,0.92)",
  muted: "rgba(11,15,20,0.60)",
  green: "#18a957",
  danger: "#ff5a5f",
  pillActiveBg: "rgba(24,169,87,0.14)",
  pillActiveBorder: "rgba(24,169,87,0.28)",
  pillIdleBg: "rgba(15,23,42,0.04)",
  topBtnBg: "rgba(15,23,42,0.04)",
  modalBackdrop: "rgba(0,0,0,0.55)",
};

function useRunFitTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeModeGlobal());

  useEffect(() => {
    const unsub = subscribeThemeMode((m) => setMode(m));
    return unsub;
  }, []);

  const ui = useMemo(() => (mode === "dark" ? DARK_UI : LIGHT_UI), [mode]);

  function toggle() {
    const cur = getThemeModeGlobal();
    setThemeModeGlobal(cur === "dark" ? "light" : "dark");
  }

  return { mode, ui, toggle };
}

type Cate = "3K" | "5K" | "10K" | "HALF";
const CATES: Cate[] = ["3K", "5K", "10K", "HALF"];

type RankItem = {
  rank: number;
  runId: number;
  userId: number;
  nickname: string;
  region: string;
  distance: string;
  timeSeconds: number;
};

type DetailResp = {
  ok: boolean;
  runId: number;
  userId: number;
  nickname: string;
  region: string;
  recordDate: string;
  distanceKm: number;
  raceType: string | null;
  distanceType: string;
  timeSeconds: number;
  splits: { km: number; m: number; sec: number }[];
  message?: string;
};

export default function Ranking() {
  const pathname = usePathname();

  const { mode, ui, toggle } = useRunFitTheme();

  const [cate, setCate] = useState<Cate>("10K");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [list, setList] = useState<RankItem[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResp | null>(null);

  const activeKey = useMemo(() => {
    const p = (pathname || "").toLowerCase();
    if (p === "/") return "ホーム";
    if (p.includes("record")) return "記録";
    if (p.includes("fooddate")) return "栄養";
    if (p.includes("ranking")) return "ランキング";
    if (p.includes("account")) return "アカウント";
    return "ホーム";
  }, [pathname]);

  const goTab = useCallback((key: string) => {
    switch (key) {
      case "ホーム":
        router.push("/");
        break;
      case "記録":
        router.push("/Record");
        break;
      case "栄養":
        router.push("/FoodDate");
        break;
      case "ランキング":
        router.push("/Ranking");
        break;
      case "アカウント":
        router.push("/Account");
        break;
      default:
        router.push("/");
    }
  }, []);

  const loadRanking = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);

    try {
      const url = `${BASE_URL}/api/ranking?distance=${encodeURIComponent(cate)}`;
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json().catch(() => null);

      // 서버가 [{error:true, message:"..."}] 형태로 줄 때 방어
      if (Array.isArray(data) && data.length > 0 && data[0]?.error) {
        throw new Error(data[0]?.message || "Server error");
      }

      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
      setErrMsg("読み込みに失敗しました。ネットワーク/サーバーを確認してください。");
    } finally {
      setLoading(false);
    }
  }, [cate]);

  const openDetail = useCallback(async (item: RankItem) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailErr(null);

    if (!item?.runId) {
      setDetailLoading(false);
      setDetailErr("詳細データがありません。");
      return;
    }

    setDetailLoading(true);

    try {
      const url = `${BASE_URL}/api/ranking/detail?runId=${item.runId}`;
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: DetailResp = await res.json();
      if (!data?.ok) throw new Error(data?.message || "detail error");

      setDetail(data);
    } catch {
      setDetailErr("詳細の読み込みに失敗しました。");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, paddingTop: Platform.OS === "android" ? 6 : 0 }}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />

      <Header title="ランキング" ui={ui} mode={mode} onToggle={toggle} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: TAB_H + 18 }}>
        <View style={styles.breadcrumbRow}>
          <Pressable onPress={() => router.push("/")} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ color: ui.green, fontWeight: "900" }}>ホーム</Text>
          </Pressable>
          <Text style={{ color: ui.muted, fontWeight: "800" }}> / </Text>
          <Text style={{ color: ui.text, fontWeight: "900" }}>ランキング</Text>
        </View>

        <Card title="種目選択" ui={ui}>
          <View style={styles.chipsRow}>
            {CATES.map((x) => (
              <Chip key={x} label={x} active={cate === x} onPress={() => setCate(x)} ui={ui} />
            ))}
          </View>
        </Card>

        {errMsg && (
          <Card title="エラー" ui={ui}>
            <Text style={{ color: ui.danger, fontWeight: "800" }}>{errMsg}</Text>
          </Card>
        )}

        {loading && (
          <View style={{ paddingVertical: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: ui.muted, textAlign: "center", marginTop: 8, fontWeight: "700" }}>
              読み込み中...
            </Text>
          </View>
        )}

        <Card title={`${cate} TOP 100`} ui={ui}>
          {list.length === 0 && !loading ? (
            <Text style={{ color: ui.muted, fontWeight: "700" }}>データがありません。</Text>
          ) : (
            list.map((r) => (
              <Pressable
                key={`${r.rank}-${r.runId || r.nickname}`}
                onPress={() => openDetail(r)}
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
              >
                <RankRow
                  rank={r.rank}
                  name={r.nickname}
                  region={r.region || "-"}
                  time={formatTime(r.timeSeconds)}
                  ui={ui}
                />
              </Pressable>
            ))
          )}

          <View style={{ height: 12 }} />
          <Hint text="※ユーザーをタップすると、1kmごとのスプリットが表示されます。" ui={ui} />
        </Card>

        <View style={{ height: 10 }} />
      </ScrollView>

      {/* bottom tabs */}
      <View style={[styles.bottomTabs, { borderTopColor: ui.line, backgroundColor: ui.bg }]}>
        <TabBtn label="ホーム" icon="home-outline" active={activeKey === "ホーム"} onPress={() => goTab("ホーム")} ui={ui} />
        <TabBtn label="記録" icon="walk-outline" active={activeKey === "記録"} onPress={() => goTab("記録")} ui={ui} />
        <TabBtn label="栄養" icon="nutrition-outline" active={activeKey === "栄養"} onPress={() => goTab("栄養")} ui={ui} />
        <TabBtn
          label="ランキング"
          icon="podium-outline"
          active={activeKey === "ランキング"}
          onPress={() => goTab("ランキング")}
          ui={ui}
        />
        <TabBtn
          label="アカウント"
          icon="person-circle-outline"
          active={activeKey === "アカウント"}
          onPress={() => goTab("アカウント")}
          ui={ui}
        />
      </View>

      {/* detail modal */}
      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}>
        <Pressable
          onPress={() => setDetailOpen(false)}
          style={{ flex: 1, backgroundColor: ui.modalBackdrop, justifyContent: "center", padding: 16 }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: ui.card,
              borderColor: ui.line,
              borderWidth: 1,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>1km スプリット</Text>
            <View style={{ height: 8 }} />

            {detailLoading ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator />
                <Text style={{ color: ui.muted, textAlign: "center", marginTop: 8, fontWeight: "700" }}>
                  読み込み中...
                </Text>
              </View>
            ) : detailErr ? (
              <Text style={{ color: ui.danger, fontWeight: "800" }}>{detailErr}</Text>
            ) : detail ? (
              <>
                <Text style={{ color: ui.muted, fontWeight: "700", fontSize: 12 }}>
                  {detail.nickname} ・ {detail.distanceType} ・ {formatTime(detail.timeSeconds)}
                </Text>

                <View style={{ height: 12 }} />

                {detail.splits?.length ? (
                  detail.splits.map((s) => (
                    <View
                      key={s.km}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: ui.line,
                      }}
                    >
                      <Text style={{ color: ui.text, fontWeight: "800" }}>
                        {s.km}km{s.m !== 1000 ? ` (${s.m}m)` : ""}
                      </Text>
                      <Text style={{ color: ui.green, fontWeight: "900" }}>{formatMMSS(s.sec)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: ui.muted, fontWeight: "700" }}>スプリットデータがありません</Text>
                )}
              </>
            ) : (
              <Text style={{ color: ui.muted, fontWeight: "700" }}>データなし</Text>
            )}

            <View style={{ height: 12 }} />
            <GhostBtn label="閉じる" onPress={() => setDetailOpen(false)} ui={ui} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ===== UI Components ===== */

function Header({
  title,
  ui,
  mode,
  onToggle,
}: {
  title: string;
  ui: any;
  mode: "dark" | "light";
  onToggle: () => void;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: ui.line }]}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.backBtn,
          { borderColor: ui.line, backgroundColor: ui.topBtnBg, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={{ color: ui.text, fontWeight: "900" }}>‹</Text>
      </Pressable>

      <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>{title}</Text>

      {/* ✅ Index.tsx랑 동일한 테마 토글 버튼 */}
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        style={({ pressed }) => [
          styles.themeIconBtn,
          { borderColor: ui.line, backgroundColor: ui.topBtnBg, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name={mode === "dark" ? "sunny-outline" : "moon-outline"} size={18} color={ui.text} />
      </Pressable>
    </View>
  );
}

function Card({ title, children, ui }: { title: string; children: React.ReactNode; ui: any }) {
  return (
    <View style={[styles.card, { backgroundColor: ui.card, borderColor: ui.line }]}>
      <Text style={{ color: ui.text, fontWeight: "900", fontSize: 14 }}>{title}</Text>
      <View style={{ height: 10 }} />
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, ui }: { label: string; active: boolean; onPress: () => void; ui: any }) {
  const activeBorder = ui.mode === "dark" ? "rgba(109,255,139,0.45)" : "rgba(24,169,87,0.35)";
  const activeBg = ui.mode === "dark" ? "rgba(109,255,139,0.12)" : "rgba(24,169,87,0.12)";
  const idleBg = ui.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? activeBorder : ui.line,
          backgroundColor: active ? activeBg : idleBg,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={{ color: active ? ui.green : ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function RankRow({
  rank,
  name,
  region,
  time,
  ui,
}: {
  rank: number;
  name: string;
  region: string;
  time: string;
  ui: any;
}) {
  const badgeBg = ui.mode === "dark" ? "rgba(109,255,139,0.08)" : "rgba(24,169,87,0.10)";
  const badgeBorder = ui.mode === "dark" ? "rgba(109,255,139,0.35)" : "rgba(24,169,87,0.28)";

  return (
    <View style={[styles.rankRow, { borderBottomColor: ui.line }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[styles.rankBadge, { borderColor: badgeBorder, backgroundColor: badgeBg }]}>
          <Text style={{ color: ui.green, fontWeight: "900" }}>{rank}</Text>
        </View>

        <View>
          <Text style={{ color: ui.text, fontWeight: "900" }}>{name}</Text>
          <Text style={{ color: ui.muted, fontWeight: "700", fontSize: 12, marginTop: 2 }}>{region}</Text>
        </View>
      </View>

      <Text style={{ color: ui.green, fontWeight: "900" }}>{time}</Text>
    </View>
  );
}

function GhostBtn({ label, onPress, ui }: { label: string; onPress: () => void; ui: any }) {
  const bg = ui.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.ghostBtn,
        { borderColor: ui.line, backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Hint({ text, ui }: { text: string; ui: any }) {
  const border = ui.mode === "dark" ? "rgba(109,255,139,0.28)" : "rgba(24,169,87,0.24)";
  const bg = ui.mode === "dark" ? "rgba(109,255,139,0.07)" : "rgba(24,169,87,0.07)";

  return (
    <View style={[styles.hint, { borderColor: border, backgroundColor: bg }]}>
      <Text style={{ color: ui.muted, fontWeight: "700", fontSize: 12, lineHeight: 16 }}>{text}</Text>
    </View>
  );
}

function TabBtn({
  label,
  icon,
  onPress,
  active,
  ui,
}: {
  label: string;
  icon: any;
  onPress: () => void;
  active: boolean;
  ui: any;
}) {
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

/* ===== helpers ===== */

function formatTime(sec: number) {
  if (typeof sec !== "number" || Number.isNaN(sec)) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMMSS(sec: number) {
  if (typeof sec !== "number" || Number.isNaN(sec)) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

  themeIconBtn: {
    width: 36,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  breadcrumbRow: { flexDirection: "row", alignItems: "center" },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },

  chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 70,
    alignItems: "center",
  },

  rankRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  ghostBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  hint: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
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
