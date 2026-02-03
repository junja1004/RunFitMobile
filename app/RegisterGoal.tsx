import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

/** ✅ 서버 주소(너 환경에 맞게) */
const BASE_URL = "http://192.168.3.16:8080/RunFit";

/** (있으면) JSON API로 goal 저장하는 엔드포인트 — 없으면 404 떠도 OK → 서블릿로 fallback */
const GOAL_API = `${BASE_URL}/api/auth/register/goal`;

/** ✅ 네가 준 웹 서블릿 (세션 기반) */
const GOAL_SERVLET = `${BASE_URL}/RegisterGoalServlet`;

/** 전역 로그인정보(있으면) */
const getAuthGlobal = () => (globalThis as any).__RUNFIT_AUTH__ || null;

const notify = (title: string, msg: string) => Alert.alert(title, msg);

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/* =========================
   ✅ 전역 테마 저장소 (index.tsx와 키 동일)
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

// ✅ 이 화면용 컬러셋
const DARK_UI = {
  mode: "dark" as const,
  bg: "#0b0f14",
  card: "rgba(255,255,255,0.04)",
  card2: "rgba(0,0,0,0.18)",
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  green: "#6dff8b",
  danger: "#ff5a5f",
  pillActiveBg: "rgba(109,255,139,0.10)",
  pillActiveBorder: "rgba(109,255,139,0.45)",
  pillIdleBg: "rgba(0,0,0,0.18)",
  onGreenText: "#06210f",
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
  pillActiveBorder: "rgba(24,169,87,0.28)",
  pillIdleBg: "rgba(15,23,42,0.04)",
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

type Ui = ReturnType<typeof useRunFitTheme>["ui"];
/* ========================= */

const encodeMulti = (obj: Record<string, string | string[]>) => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      v.forEach((vv) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(vv ?? "")}`));
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`);
    }
  }
  return parts.join("&");
};

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const GOALS = [
  { value: "健康管理", title: "健康管理", sub: "体調・生活習慣の改善" },
  { value: "ダイエット", title: "ダイエット", sub: "減量・体脂肪コントロール" },
  { value: "筋力アップ", title: "筋力アップ", sub: "筋肉量・パフォーマンス向上" },
  { value: "ランニング記録向上", title: "ランニング記録向上", sub: "タイムや距離を伸ばす" },
  { value: "体力向上", title: "体力向上", sub: "持久力・基礎体力アップ" },
];

const WALK_MINS = ["0", "30", "60", "90", "120", "150", "180", "210", "240", "300", "360"];

const LEVELS = [
  "運動なし",
  "軽い運動（30分程度）",
  "普通の運動（1時間程度）",
  "激しい運動（1時間以上）",
  "高強度運動（2時間以上）",
];

export default function RegisterGoal() {
  const { ui } = useRunFitTheme();

  const params = useLocalSearchParams();
  const auth = getAuthGlobal();

  const userIdStr = one(params.userId as any) ?? auth?.userId?.toString() ?? "";
  const token = one(params.token as any) ?? auth?.token ?? "";

  const userId = Number(userIdStr || 0) || 0;

  const [selected, setSelected] = useState<string[]>([]);
  const [dailyWalkMin, setDailyWalkMin] = useState<string>("0");
  const [level, setLevel] = useState<string>(LEVELS[0]);

  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => !loading, [loading]);

  const toggleGoal = (v: string) => {
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const submit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const payload = {
        userId,
        goals: selected,
        daily_walk_min: dailyWalkMin,
        daily_activity_level: level,
      };

      let ok = false;
      let lastErr: any = null;

      /** 1) ✅ API 먼저 시도 */
      if (token || userId) {
        try {
          const r = await fetch(GOAL_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
          });

          if (r.ok) {
            const j = await safeJson(r);
            if (j?.ok === false) throw new Error(j?.message || "goal api failed");
            ok = true;
          } else if (r.status === 404 || r.status === 405) {
            // API 없음 → fallback
          } else {
            const t = await r.text();
            throw new Error(`GOAL_API HTTP ${r.status}: ${t.slice(0, 160)}`);
          }
        } catch (e) {
          lastErr = e;
        }
      }

      /** 2) ✅ 세션 서블릿 fallback */
      if (!ok) {
        const body = encodeMulti({
          goals: selected.length ? selected : [""],
          daily_walk_min: dailyWalkMin,
          daily_activity_level: level,
        });

        const r2 = await fetch(GOAL_SERVLET, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        const text = await r2.text().catch(() => "");

        if (!r2.ok) throw new Error(`RegisterGoalServlet HTTP ${r2.status}`);
        if (text.includes("세션 오류") || text.includes("목표 저장 실패") || text.includes("에러 발생")) {
          throw new Error(text.slice(0, 180));
        }

        ok = true;
      }

      if (!ok) throw lastErr || new Error("unknown error");

      router.replace("/");
    } catch (e: any) {
      notify("登録失敗", String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.title, { color: ui.text }]}>会員登録（ステップ3：目標設定）</Text>
            <Text style={[styles.subtitle, { color: ui.muted }]}>
              目標と活動量を選択して、登録を完了します。
            </Text>
          </View>

          <View style={[styles.badge, { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }]}>
            <Text style={[styles.badgeText, { color: ui.text }]}>Step 3 / 3</Text>
          </View>
        </View>

        <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>ダイエット・健康目標（複数選択可）</Text>
          <Text style={[styles.hint, { color: ui.muted }]}>該当するものを選んでください（複数OK）。</Text>

          <View style={styles.grid}>
            {GOALS.map((g) => {
              const on = selected.includes(g.value);

              const itemStyle = on
                ? { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }
                : { borderColor: ui.line, backgroundColor: ui.card2 };

              const checkStyle = on
                ? { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }
                : { borderColor: ui.line, backgroundColor: "transparent" };

              return (
                <Pressable
                  key={g.value}
                  onPress={() => toggleGoal(g.value)}
                  style={({ pressed }) => [
                    styles.goalItem,
                    itemStyle,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <View style={[styles.check, checkStyle]}>
                    {on ? <View style={[styles.checkDot, { backgroundColor: ui.green }]} /> : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalTitle, { color: ui.text }]}>{g.title}</Text>
                    <Text style={[styles.goalSub, { color: ui.muted }]}>{g.sub}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: ui.line }]} />

          <Text style={[styles.sectionTitle, { color: ui.text }]}>1日の歩行時間</Text>
          <Text style={[styles.hint, { color: ui.muted }]}>普段の歩行（通学/通勤など含む）</Text>

          <View style={styles.pillsRow}>
            {WALK_MINS.map((m) => {
              const on = dailyWalkMin === m;

              const pillStyle = on
                ? { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }
                : { borderColor: ui.line, backgroundColor: ui.pillIdleBg };

              const pillTextStyle = on ? { color: ui.text } : { color: ui.muted };

              return (
                <Pressable
                  key={m}
                  onPress={() => setDailyWalkMin(m)}
                  style={({ pressed }) => [
                    styles.pill,
                    pillStyle,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.pillText, pillTextStyle]}>{m}分</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: ui.line }]} />

          <Text style={[styles.sectionTitle, { color: ui.text }]}>1日の運動量</Text>
          <Text style={[styles.hint, { color: ui.muted }]}>目安としての活動レベルを選択</Text>

          <View style={{ marginTop: 6 }}>
            {LEVELS.map((lv) => {
              const on = level === lv;

              const rowStyle = on
                ? { borderColor: ui.pillActiveBorder, backgroundColor: ui.pillActiveBg }
                : { borderColor: ui.line, backgroundColor: ui.pillIdleBg };

              return (
                <Pressable
                  key={lv}
                  onPress={() => setLevel(lv)}
                  style={({ pressed }) => [
                    styles.levelRow,
                    rowStyle,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Ionicons
                    name={on ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={on ? ui.green : ui.muted}
                  />
                  <Text style={[styles.levelText, { color: ui.text }]}>{lv}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={submit}
            disabled={loading}
            style={[
              styles.submit,
              { backgroundColor: ui.green },
              loading && { opacity: 0.55 },
            ]}
          >
            {loading ? (
              <ActivityIndicator />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={ui.onGreenText} />
                <Text style={[styles.submitText, { color: ui.onGreenText }]}>登録を完了する</Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.note, { color: ui.muted }]}>
            ※ 後からマイページで変更できるようにするなら、ここは初期設定として保存する感じでOK。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 18, paddingBottom: 28 },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { marginTop: 6, fontSize: 12, lineHeight: 18, fontWeight: "700" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontWeight: "900" },

  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },

  sectionTitle: { fontSize: 13, fontWeight: "900" },
  hint: { marginTop: 6, marginBottom: 10, fontSize: 11, lineHeight: 16, fontWeight: "700" },

  grid: { marginTop: 4 },
  goalItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },

  check: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 4,
  },
  goalTitle: { fontSize: 13, fontWeight: "900" },
  goalSub: { marginTop: 2, fontSize: 11, fontWeight: "700" },

  divider: {
    height: 1,
    marginVertical: 12,
  },

  pillsRow: { flexDirection: "row", flexWrap: "wrap" },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  pillText: { fontWeight: "900", fontSize: 11 },

  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  levelText: { marginLeft: 8, fontSize: 12, fontWeight: "800" },

  submit: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { marginLeft: 8, fontWeight: "900", fontSize: 13 },

  note: { marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: "700" },
});
