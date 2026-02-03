import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ImageBackground,
  ImageSourcePropType,
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

// ✅ 전역 로그인정보(간단 유지)
function setAuthGlobal(auth: any | null) {
  (globalThis as any).__RUNFIT_AUTH__ = auth;
}
function getAuthGlobal() {
  return (globalThis as any).__RUNFIT_AUTH__ || null;
}

// ✅ 앱 전용 알림
function notify(title: string, msg: string) {
  Alert.alert(title, msg);
}

// ✅ 하단 탭 크게
const TAB_H = 96;

/* =========================
   ✅ 전역 테마 저장소(안전판)
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
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.94)",
  muted: "rgba(255,255,255,0.70)",
  green: "#6dff8b",
  glass2: "rgba(10,14,18,0.22)",
  pillActiveBg: "rgba(109,255,139,0.14)",
  pillActiveBorder: "rgba(109,255,139,0.35)",
  pillIdleBg: "rgba(255,255,255,0.03)",
  inputBg: "rgba(255,255,255,0.03)",
  placeholder: "rgba(255,255,255,0.35)",
  topBtnBg: "rgba(255,255,255,0.04)",
};

const LIGHT_UI = {
  mode: "light" as const,
  bg: "#f6f8fb",
  line: "rgba(15,23,42,0.14)",
  text: "rgba(11,15,20,0.92)",
  muted: "rgba(11,15,20,0.60)",
  green: "#18a957",
  glass2: "rgba(255,255,255,0.40)",
  pillActiveBg: "rgba(24,169,87,0.14)",
  pillActiveBorder: "rgba(24,169,87,0.28)",
  pillIdleBg: "rgba(15,23,42,0.04)",
  inputBg: "rgba(15,23,42,0.04)",
  placeholder: "rgba(11,15,20,0.35)",
  topBtnBg: "rgba(15,23,42,0.04)",
};

// ✅ 홈 사진 섹션은 테마 영향 X (항상 동일하게 유지)
const PHOTO_UI = DARK_UI;

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
/* ========================= */

type Btn = { label: string; action: () => void };
type Section = {
  image: ImageSourcePropType;
  headline: string;
  subline: string;
  primary: Btn;
  secondary: Btn;
  height: number;
};

export default function Index() {
  const BASE_URL = "http://172.20.10.4:8080/RunFIT_";
  const pathname = usePathname();
  const { height: winH } = useWindowDimensions();

  // ✅ 전역 테마
  const { mode, ui, toggle } = useRunFitTheme();

  // ✅ auth state
  const initAuth = getAuthGlobal();
  const [token, setToken] = useState(initAuth?.token || "");
  const [nickname, setNickname] = useState(initAuth?.nickname || "");
  const isLoggedIn = !!token;

  // ✅ login inputs
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ✅ 로그인 모달
  const [loginOpen, setLoginOpen] = useState(false);

  // ✅ 게스트 모드
  const APP_GUEST_MODE = true;

  function onTap(label: string) {
    if (label === "ホーム") router.push("/");
    else if (label === "記録") router.push("/Record");
    else if (label === "栄養") router.push("/FoodDate");
    else if (label === "ランキング") router.push("/Ranking");
    else if (label === "アカウント") router.push("/Account");
    else if (label === "ランニング記録" || label === "ラン追加") router.push("/Record");
    else if (label === "食事記録" || label === "食事追加") router.push("/FoodDate");
  }

  function goRegister() {
    setLoginOpen(false);
    router.push("/Register");
  }

  async function doLogin() {
    if (!username.trim() || !password.trim()) {
      notify("入力エラー", "username / password 를 입력해");
      return;
    }

    const url = `${BASE_URL}/api/auth/login`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const text = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!res.ok || !data?.ok) {
        notify("ログイン失敗", data?.message || text || `HTTP ${res.status}`);
        return;
      }

      const tk = data.token;
      const nick = data.nickname || username.trim();

      setToken(tk);
      setNickname(nick);
      setAuthGlobal({ token: tk, userId: data.userId, nickname: nick });

      setPassword("");
      setLoginOpen(false);
      notify("ログイン成功", `ようこそ ${nick}`);
    } catch (e: any) {
      notify("通信エラー", String(e?.message || e));
    }
  }

  function doLogout() {
    setToken("");
    setNickname("");
    setAuthGlobal(null);
    notify("ログアウト", "ログアウトしました");
  }

  const SECTIONS: Section[] = [
    {
      image: require("../assets/images/home1.jpg"),
      headline: "今日も一歩ずつ、強くなる。",
      subline: "ランニング記録・食事管理・ランキングまで、全部まとめて RunFit。",
      primary: { label: "ランニング記録", action: () => onTap("ランニング記録") },
      secondary: { label: "食事記録", action: () => onTap("食事記録") },
      height: Math.max(560, Math.round(winH * 0.8)),
    },
    {
      image: require("../assets/images/home2.jpg"),
      headline: "食事の記録",
      subline: "小さく整える。大きく伸びる。",
      primary: { label: "食事追加", action: () => onTap("食事追加") },
      secondary: { label: "栄養を見る", action: () => onTap("栄養") },
      height: Math.max(560, Math.round(winH * 0.76)),
    },
    {
      image: require("../assets/images/home3.jpg"),
      headline: "ランキング",
      subline: "3K / 5K / 10K / HALF — 走った証を残す。",
      primary: { label: "ランキング", action: () => onTap("ランキング") },
      secondary: { label: "記録を見る", action: () => onTap("記録") },
      height: Math.max(560, Math.round(winH * 0.76)),
    },
  ];

  const activeKey = (() => {
    if (pathname === "/") return "ホーム";
    if (pathname?.toLowerCase().includes("record")) return "記録";
    if (pathname?.toLowerCase().includes("fooddate")) return "栄養";
    if (pathname?.toLowerCase().includes("ranking")) return "ランキング";
    if (pathname?.toLowerCase().includes("account")) return "アカウント";
    return "ホーム";
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />

      {/* TOP BAR */}
      <View style={[styles.topbar, { borderBottomColor: ui.line }]}>
        {/* LEFT: 프로필 + 토글 */}
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { borderColor: ui.line, backgroundColor: ui.topBtnBg }]}>
            <View style={[styles.avatarDot, { backgroundColor: ui.green }]} />
          </View>

          {/* ✅ THEME TOGGLE (프로필 옆) */}
          <Pressable
            onPress={toggle}
            hitSlop={10}
            style={({ pressed }) => [
              styles.themeIconBtn,
              { borderColor: ui.line, backgroundColor: ui.topBtnBg, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name={mode === "dark" ? "sunny-outline" : "moon-outline"} size={18} color={ui.text} />
          </Pressable>

          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "900" }}>
              {isLoggedIn ? "ログイン中" : "GUEST"}
            </Text>

            {isLoggedIn ? (
              <Text numberOfLines={1} style={{ color: ui.text, fontSize: 14, fontWeight: "900" }}>
                {nickname}
              </Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => setLoginOpen(true)}
                  style={({ pressed }) => [
                    styles.loginStartBtn,
                    { borderColor: ui.line, backgroundColor: ui.topBtnBg, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={{ color: ui.text, fontWeight: "900", fontSize: 12 }}>ログイン</Text>
                </Pressable>

                <Pressable
                  onPress={goRegister}
                  style={({ pressed }) => [
                    styles.loginStartBtn,
                    {
                      borderColor: ui.mode === "dark" ? "rgba(109,255,139,0.35)" : "rgba(24,169,87,0.35)",
                      backgroundColor: ui.mode === "dark" ? "rgba(109,255,139,0.10)" : "rgba(24,169,87,0.10)",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: ui.green, fontWeight: "900", fontSize: 12 }}>会員登録</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* RIGHT: 브랜드 + 로그아웃 */}
        <View style={styles.topRight}>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.brand, { color: ui.text }]}>RunFit</Text>
            <Text style={[styles.brandSub, { color: ui.muted }]}>MOBILE</Text>
          </View>

          {isLoggedIn && (
            <Pressable
              onPress={doLogout}
              style={({ pressed }) => [
                styles.logoutBtn,
                { borderColor: ui.line, backgroundColor: ui.topBtnBg, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 11 }}>ログアウト</Text>
            </Pressable>
          )}
        </View>
      </View>

      {APP_GUEST_MODE && !isLoggedIn && (
        <View style={[styles.guestBanner, { borderBottomColor: ui.line }]}>
          <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 11 }}>
            ゲストモード：保存なしで利用できます（記録は端末内のみ）
          </Text>
        </View>
      )}

      {/* ✅ CONTENT: 사진 섹션은 PHOTO_UI로 고정(테마 영향 X) */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: TAB_H + 18 }]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((s, idx) => (
          <PhotoSection
            key={`${s.headline}-${idx}`}
            image={s.image}
            height={s.height}
            headline={s.headline}
            subline={s.subline}
            primary={s.primary}
            secondary={s.secondary}
            ui={PHOTO_UI}
          />
        ))}

        {/* 아래 여백/푸터는 테마 영향 OK */}
        <View style={[styles.endBlock, { backgroundColor: ui.bg }]}>
          <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11, textAlign: "center" }}>
            RunFit Mobile Demo · Expo Go
          </Text>
        </View>
      </ScrollView>

      {/* ✅ BOTTOM TABS */}
      <View style={[styles.bottomTabs, { borderTopColor: ui.line, backgroundColor: ui.bg }]}>
        <TabBtn label="ホーム" icon="home-outline" active={activeKey === "ホーム"} onPress={() => onTap("ホーム")} ui={ui} />
        <TabBtn label="記録" icon="walk-outline" active={activeKey === "記録"} onPress={() => onTap("記録")} ui={ui} />
        <TabBtn label="栄養" icon="nutrition-outline" active={activeKey === "栄養"} onPress={() => onTap("栄養")} ui={ui} />
        <TabBtn label="ランキング" icon="podium-outline" active={activeKey === "ランキング"} onPress={() => onTap("ランキング")} ui={ui} />
        <TabBtn label="アカウント" icon="person-circle-outline" active={activeKey === "アカウント"} onPress={() => onTap("アカウント")} ui={ui} />
      </View>

      {/* LOGIN MODAL */}
      <Modal visible={loginOpen} transparent animationType="fade" onRequestClose={() => setLoginOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLoginOpen(false)}>
          <Pressable onPress={() => {}} style={[styles.modalCard, { borderColor: ui.line, backgroundColor: ui.bg }]}>
            <Text style={{ color: ui.text, fontWeight: "900", fontSize: 15 }}>ログイン</Text>

            <View style={{ height: 14 }} />

            <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "900", marginBottom: 6 }}>アカウンタ</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="username"
              placeholderTextColor={ui.placeholder}
              style={[styles.input, { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg }]}
            />

            <View style={{ height: 10 }} />

            <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "900", marginBottom: 6 }}>パスワード</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="password"
              placeholderTextColor={ui.placeholder}
              style={[styles.input, { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg }]}
            />

            <View style={{ height: 14 }} />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PhotoPrimaryBtn label="ログイン" onPress={doLogin} ui={ui} />
              <PhotoGhostBtn label="会員登録" onPress={goRegister} ui={ui} />
            </View>

            <View style={{ height: 10 }} />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PhotoGhostBtn label="閉じる" onPress={() => setLoginOpen(false)} ui={ui} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ===== section ===== */

function PhotoSection(props: {
  image: ImageSourcePropType;
  height: number;
  headline: string;
  subline: string;
  primary: Btn;
  secondary: Btn;
  ui: any; // ✅ PHOTO_UI가 들어옴(항상 동일)
}) {
  const { image, height, headline, subline, primary, secondary, ui } = props;

  return (
    <ImageBackground source={image} style={[styles.photo, { height }]} resizeMode="cover">
      {/* ✅ 오버레이도 PHOTO_UI(=고정) */}
      <View style={[styles.photoOverlay, { backgroundColor: ui.glass2 }]} />
      <View style={styles.photoBottomShade} />

      <View style={styles.photoContent}>
        <Text style={[styles.photoHeadline, { color: ui.text }]}>{headline}</Text>
        <Text style={[styles.photoSubline, { color: ui.muted }]}>{subline}</Text>

        <View style={styles.photoBtnRow}>
          <PhotoPrimaryBtn label={primary.label} onPress={primary.action} ui={ui} />
          <PhotoGhostBtn label={secondary.label} onPress={secondary.action} ui={ui} />
        </View>
      </View>
    </ImageBackground>
  );
}

/* ===== components ===== */

function PhotoPrimaryBtn({ label, onPress, ui }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.photoPrimaryBtn, { backgroundColor: ui.green, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={{ color: "#08110b", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function PhotoGhostBtn({ label, onPress, ui }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.photoGhostBtn,
        {
          borderColor: ui.line,
          backgroundColor: "rgba(10,14,18,0.35)", // ✅ 사진 버튼 느낌도 고정
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
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

/* ===== styles ===== */

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === "android" ? 6 : 0 },

  topbar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  profileRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarDot: { width: 10, height: 10, borderRadius: 999 },

  themeIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loginStartBtn: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },

  topRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  brandSub: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },

  logoutBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },

  guestBanner: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },

  scroll: { padding: 0 },

  photo: { width: "100%", justifyContent: "flex-end" },
  photoOverlay: { ...StyleSheet.absoluteFillObject },

  photoBottomShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
    backgroundColor: "rgba(0,0,0,0.30)",
  },

  photoContent: { paddingHorizontal: 16, paddingBottom: 22, gap: 10 },
  photoHeadline: { fontSize: 24, fontWeight: "900", letterSpacing: 0.2 },
  photoSubline: { fontSize: 12, fontWeight: "800", lineHeight: 18 },
  photoBtnRow: { flexDirection: "row", gap: 10, marginTop: 6 },

  photoPrimaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  photoGhostBtn: { flex: 1, paddingVertical: 13, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  endBlock: { paddingVertical: 18 },

  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, fontWeight: "800" },

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
  tabPill: { width: "92%", borderRadius: 18, borderWidth: 1, paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 6 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 520, borderRadius: 18, borderWidth: 1, padding: 16 },
});
