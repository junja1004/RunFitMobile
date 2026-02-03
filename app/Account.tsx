import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  TextInput,
  View,
} from "react-native";

const BASE_URL = "http://172.20.10.4:8080/RunFIT_";

const setAuthGlobal = (auth: any | null) => {
  (globalThis as any).__RUNFIT_AUTH__ = auth;
};
const getAuthGlobal = () => (globalThis as any).__RUNFIT_AUTH__ || null;

const notify = (title: string, msg: string) => {
  if (Platform.OS === "web") {
    // @ts-ignore
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
};

/* =========================
   ✅ Index.tsx와 동일한 전역 테마 저장소(버스)
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
  card: "#0f1620",
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  green: "#6dff8b",
  danger: "#ff5a5f",

  inputBg: "rgba(255,255,255,0.03)",
  placeholder: "rgba(255,255,255,0.35)",
  topBtnBg: "rgba(255,255,255,0.04)",

  chipIdleBg: "rgba(255,255,255,0.03)",
  chipActiveBg: "rgba(109,255,139,0.12)",
  chipActiveBorder: "rgba(109,255,139,0.45)",
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

  inputBg: "rgba(15,23,42,0.04)",
  placeholder: "rgba(11,15,20,0.35)",
  topBtnBg: "rgba(15,23,42,0.04)",

  chipIdleBg: "rgba(15,23,42,0.04)",
  chipActiveBg: "rgba(24,169,87,0.12)",
  chipActiveBorder: "rgba(24,169,87,0.35)",
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
/* ========================= */

type AccountMe = {
  id: number;
  username: string;
  nickname: string | null; // ✅ 추가
  email: string | null;
  phone: string | null;
  region: string | null;
  prefecture: string | null;
  created_at: string | null;
};

const REGION_LIST = ["北海道", "東北", "関東", "中部", "近畿（関西）", "中国", "四国", "九州", "沖縄"];

const PREF_MAP: Record<string, string[]> = {
  北海道: ["北海道"],
  東北: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
  関東: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
  中部: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
  近畿: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
  中国: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  四国: ["徳島県", "香川県", "愛媛県", "高知県"],
  九州: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "福岡県", "宮崎県", "鹿児島県"],
  沖縄: ["沖縄県"],
};

function normalizeRegionForMap(regionUi: string) {
  if (!regionUi) return "";
  if (regionUi.startsWith("近畿")) return "近畿";
  return regionUi;
}

function buildHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-Auth-Token": token,
  };
}

function Notice({ type, text, ui }: { type: "ok" | "bad"; text: string; ui: any }) {
  const okBorder = ui.mode === "dark" ? "rgba(109,255,139,.28)" : "rgba(24,169,87,.28)";
  const okBg = ui.mode === "dark" ? "rgba(109,255,139,.10)" : "rgba(24,169,87,.10)";
  const badBorder = "rgba(255,90,95,.35)";
  const badBg = "rgba(255,90,95,.12)";

  return (
    <View
      style={[
        styles.notice,
        {
          borderColor: type === "ok" ? okBorder : badBorder,
          backgroundColor: type === "ok" ? okBg : badBg,
        },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{text}</Text>
    </View>
  );
}

function SelectModal({
  visible,
  title,
  items,
  selected,
  onClose,
  onPick,
  ui,
}: {
  visible: boolean;
  title: string;
  items: string[];
  selected: string;
  onClose: () => void;
  onPick: (v: string) => void;
  ui: any;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={[styles.modalBackdrop, { backgroundColor: ui.modalBackdrop }]} onPress={onClose}>
        <Pressable style={[styles.modalCard, { borderColor: ui.line, backgroundColor: ui.card }]} onPress={() => {}}>
          <Text style={{ color: ui.text, fontWeight: "900", fontSize: 14, marginBottom: 10 }}>{title}</Text>

          <ScrollView style={{ maxHeight: 360 }}>
            {items.map((it) => {
              const active = it === selected;
              return (
                <Pressable
                  key={it}
                  style={[
                    styles.modalItem,
                    {
                      borderColor: active ? (ui.mode === "dark" ? "rgba(109,255,139,.25)" : "rgba(24,169,87,.28)") : ui.line,
                      backgroundColor: active ? (ui.mode === "dark" ? "rgba(109,255,139,.10)" : "rgba(24,169,87,.10)") : ui.inputBg,
                    },
                  ]}
                  onPress={() => onPick(it)}
                >
                  <Text style={{ color: ui.text, fontWeight: "900" }}>{it}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable style={[styles.modalClose, { borderColor: ui.line, backgroundColor: ui.topBtnBg }]} onPress={onClose}>
            <Text style={{ color: ui.text, fontWeight: "900" }}>閉じる</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function Account() {
  // ✅ 전역 테마 (Index.tsx 토글과 연동)
  const { mode, ui, toggle } = useRunFitTheme();

  const [tab, setTab] = useState<"account" | "delete">("account");

  const [loading, setLoading] = useState(true);
  const [okMsg, setOkMsg] = useState("");
  const [badMsg, setBadMsg] = useState("");

  const [me, setMe] = useState<AccountMe | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [regionUi, setRegionUi] = useState("");
  const [pref, setPref] = useState("");

  const [pw, setPw] = useState("");

  const [regionModal, setRegionModal] = useState(false);
  const [prefModal, setPrefModal] = useState(false);

  const prefList = useMemo(() => {
    const key = normalizeRegionForMap(regionUi);
    return PREF_MAP[key] || [];
  }, [regionUi]);

  const getTokenOrGoHome = useCallback(() => {
    const auth = getAuthGlobal();
    const token = auth?.token || "";
    if (!token) {
      setBadMsg("ログインが必要です。ホームでログインしてください。");
      router.replace("/" as any);
      return "";
    }
    return token;
  }, []);

  const loadMe = useCallback(async () => {
    setLoading(true);
    setOkMsg("");
    setBadMsg("");

    const token = getTokenOrGoHome();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/account/me`, {
        method: "GET",
        headers: buildHeaders(token),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setAuthGlobal(null);
          setBadMsg("セッションが切れました。ホームで再ログインしてください。");
          router.replace("/" as any);
          setLoading(false);
          return;
        }
        setBadMsg(data?.message || "取得に失敗しました。");
        setLoading(false);
        return;
      }

      setMe(data);
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
      setRegionUi(data.region ?? "");
      setPref(data.prefecture ?? "");
      setLoading(false);
    } catch {
      setBadMsg("ネットワークエラー");
      setLoading(false);
    }
  }, [getTokenOrGoHome]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const onSave = useCallback(async () => {
    setOkMsg("");
    setBadMsg("");

    const token = getTokenOrGoHome();
    if (!token) return;

    if (!regionUi) return setBadMsg("住所（地方エリア）を選択してください。");
    if (!pref) return setBadMsg("都道府県を選択してください。");

    try {
      const res = await fetch(`${BASE_URL}/api/account/update`, {
        method: "POST",
        headers: buildHeaders(token),
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim(),
          region: regionUi,
          prefecture: pref,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBadMsg(data?.message || "保存に失敗しました。");
        return;
      }

      setOkMsg("保存しました ✅");
      await loadMe();
    } catch {
      setBadMsg("ネットワークエラー");
    }
  }, [email, phone, pref, regionUi, getTokenOrGoHome, loadMe]);

  const onDelete = useCallback(async () => {
    setOkMsg("");
    setBadMsg("");

    const token = getTokenOrGoHome();
    if (!token) return;

    if (!pw.trim()) return setBadMsg("パスワードを入力してください。");

    const ok1 = await new Promise<boolean>((resolve) => {
      Alert.alert("確認", "本当に退会しますか？（元に戻せません）", [
        { text: "キャンセル", style: "cancel", onPress: () => resolve(false) },
        { text: "退会する", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
    if (!ok1) return;

    const ok2 = await new Promise<boolean>((resolve) => {
      Alert.alert("最終確認", "最終確認です。本当に退会を進めますか？", [
        { text: "キャンセル", style: "cancel", onPress: () => resolve(false) },
        { text: "進める", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
    if (!ok2) return;

    try {
      const res = await fetch(`${BASE_URL}/api/account/delete`, {
        method: "POST",
        headers: buildHeaders(token),
        body: JSON.stringify({ password: pw }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.message === "pw") setBadMsg("パスワードが違います ❌");
        else setBadMsg(data?.message || "退会に失敗しました。");
        return;
      }

      setAuthGlobal(null);
      notify("退会完了", "退会処理が完了しました ✅");
      router.replace("/" as any);
    } catch {
      setBadMsg("ネットワークエラー");
    }
  }, [pw, getTokenOrGoHome]);

  const pickRegion = useCallback((v: string) => {
    setRegionUi(v);
    setPref("");
    setRegionModal(false);
  }, []);

  const pickPref = useCallback((v: string) => {
    setPref(v);
    setPrefModal(false);
  }, []);

  const tabIdleBg = ui.topBtnBg;
  const tabActiveBg = ui.chipActiveBg;
  const tabActiveBorder = ui.chipActiveBorder;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, paddingTop: Platform.OS === "android" ? 6 : 0 }}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {/* top header + theme toggle */}
        <View style={[styles.header, { borderColor: ui.line, backgroundColor: tabIdleBg }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>RunFit</Text>
              <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12, marginTop: 4 }}>Account</Text>
            </View>

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
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            style={[
              styles.tabBtn,
              { borderColor: ui.line, backgroundColor: tabIdleBg },
              tab === "account" && { borderColor: tabActiveBorder, backgroundColor: tabActiveBg },
            ]}
            onPress={() => setTab("account")}
          >
            <Text style={{ color: ui.text, fontWeight: "900" }}>アカウント情報</Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabBtn,
              {
                borderColor: "rgba(255,90,95,0.35)",
                backgroundColor: tab === "delete" ? "rgba(255,90,95,0.14)" : "rgba(255,90,95,0.10)",
              },
            ]}
            onPress={() => setTab("delete")}
          >
            <Text style={{ color: ui.text, fontWeight: "900" }}>退会</Text>
          </Pressable>
        </View>

        {okMsg ? <Notice type="ok" text={okMsg} ui={ui} /> : null}
        {badMsg ? <Notice type="bad" text={badMsg} ui={ui} /> : null}

        {loading ? (
          <View style={{ padding: 20, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: ui.muted, fontWeight: "800" }}>読み込み中...</Text>
          </View>
        ) : tab === "account" ? (
          <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>
            <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>ログイン情報</Text>
            <Text style={{ color: ui.muted, marginTop: 6, fontWeight: "700", lineHeight: 18 }}>
              ログインIDはusername、表示名はnicknameです。
            </Text>

            <View style={{ height: 12 }} />

            {/* ✅ 닉네임 표시: nickname 우선 */}
            <Field label="ニックネーム(表示名)" ui={ui}>
              <TextInput
                style={[styles.input, { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg }]}
                value={me?.nickname ?? ""}
                editable={false}
                placeholder="nickname"
                placeholderTextColor={ui.placeholder}
              />
            </Field>

            <Field label="電話番号（変更可）" ui={ui}>
              <TextInput
                style={[styles.input, { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="任意 例: 090-xxxx-xxxx"
                placeholderTextColor={ui.placeholder}
              />
            </Field>

            <Field label="メール（変更可）" ui={ui}>
              <TextInput
                style={[styles.input, { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg }]}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                placeholder="example@mail.com"
                placeholderTextColor={ui.placeholder}
              />
            </Field>

            <Field label="住所（地方エリア）" ui={ui}>
              <Pressable
                style={[styles.select, { borderColor: ui.line, backgroundColor: ui.inputBg }]}
                onPress={() => setRegionModal(true)}
              >
                <Text style={{ color: ui.text, fontWeight: "900" }}>{regionUi ? regionUi : "選択してください"}</Text>
              </Pressable>
            </Field>

            <Field label="都道府県" ui={ui}>
              <Pressable
                style={[styles.select, { borderColor: ui.line, backgroundColor: ui.inputBg, opacity: regionUi ? 1 : 0.55 }]}
                onPress={() => {
                  if (!regionUi) return;
                  setPrefModal(true);
                }}
              >
                <Text style={{ color: ui.text, fontWeight: "900" }}>
                  {pref ? pref : regionUi ? "選択してください" : "まず地方を選択してください"}
                </Text>
              </Pressable>
            </Field>

            <View style={{ marginTop: 12 }}>
              <Pressable style={[styles.btn, { backgroundColor: ui.green }]} onPress={onSave}>
                <Text style={{ color: "#08110b", fontWeight: "900" }}>保存</Text>
              </Pressable>
            </View>

            <SelectModal
              visible={regionModal}
              title="住所（地方エリア）"
              items={REGION_LIST}
              selected={regionUi}
              onClose={() => setRegionModal(false)}
              onPick={pickRegion}
              ui={ui}
            />

            <SelectModal
              visible={prefModal}
              title="都道府県"
              items={prefList}
              selected={pref}
              onClose={() => setPrefModal(false)}
              onPick={pickPref}
              ui={ui}
            />
          </View>
        ) : (
          <View style={[styles.card, { borderColor: "rgba(255,90,95,0.35)", backgroundColor: ui.card }]}>
            <Text style={{ color: ui.mode === "dark" ? "#ffd0d2" : "rgba(255,90,95,0.95)", fontWeight: "900", fontSize: 16 }}>
              退会
            </Text>
            <Text style={{ color: ui.muted, marginTop: 6, fontWeight: "700", lineHeight: 18 }}>
              退会するとアカウントデータがDBから削除されます。元に戻せません。
            </Text>

            <View style={{ height: 12 }} />

            <Field label="パスワード確認" ui={ui}>
              <TextInput
                style={[styles.input, { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg }]}
                value={pw}
                onChangeText={setPw}
                secureTextEntry
                placeholder="現在のパスワードを入力"
                placeholderTextColor={ui.placeholder}
              />
            </Field>

            <View style={{ flexDirection: "row", gap: 13, marginTop: 12 }}>
              <Pressable style={[styles.btn, { backgroundColor: "rgba(255,90,95,0.95)" }]} onPress={onDelete}>
                <Text style={{ color: "#130607", fontWeight: "900" }}>退会</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.btn,
                  { borderColor: ui.line, backgroundColor: ui.topBtnBg, borderWidth: 1 },
                ]}
                onPress={() => setTab("account")}
              >
                <Text style={{ color: ui.text, fontWeight: "900" }}>キャンセル</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children, ui }: any) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 12, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  themeIconBtn: {
    width: 40,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  notice: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "800",
  },
  select: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  modalItem: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  modalClose: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
});
