import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
} from "react-native";

const setAuthGlobal = (auth: any | null) => {
  (globalThis as any).__RUNFIT_AUTH__ = auth;
};

const notify = (title: string, msg: string) => Alert.alert(title, msg);

const BASE_URL = "http://172.20.10.4:8080/RunFIT_";

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

//  Register 화면용 컬러셋
const DARK_UI = {
  mode: "dark" as const,
  bg: "#0b0f14",
  card: "rgba(255,255,255,0.03)",
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.94)",
  muted: "rgba(255,255,255,0.70)",
  green: "#6dff8b",
  danger: "#ff5a5f",
  inputBg: "rgba(255,255,255,0.03)",
  placeholder: "rgba(255,255,255,0.35)",
  pillActiveBg: "rgba(109,255,139,0.14)",
  pillActiveBorder: "rgba(109,255,139,0.35)",
  pillIdleBg: "rgba(255,255,255,0.03)",
};

const LIGHT_UI = {
  mode: "light" as const,
  bg: "#f6f8fb",
  card: "rgba(15,23,42,0.04)",
  line: "rgba(15,23,42,0.14)",
  text: "rgba(11,15,20,0.92)",
  muted: "rgba(11,15,20,0.60)",
  green: "#18a957",
  danger: "#ef4444",
  inputBg: "rgba(15,23,42,0.04)",
  placeholder: "rgba(11,15,20,0.35)",
  pillActiveBg: "rgba(24,169,87,0.14)",
  pillActiveBorder: "rgba(24,169,87,0.28)",
  pillIdleBg: "rgba(15,23,42,0.04)",
};

function useRunFitTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeModeGlobal());

  useEffect(() => {
    const unsub = subscribeThemeMode((m) => setMode(m));
    return unsub;
  }, []);

  const ui = useMemo(() => (mode === "dark" ? DARK_UI : LIGHT_UI), [mode]);

  const toggle = () => {
    const cur = getThemeModeGlobal();
    setThemeModeGlobal(cur === "dark" ? "light" : "dark");
  };

  return { mode, ui, toggle };
}

type Ui = ReturnType<typeof useRunFitTheme>["ui"];

const PREF_MAP: Record<string, string[]> = {
  北海道: ["北海道"],
  東北: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
  関東: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
  中部: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
  近畿: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
  中国: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  四国: ["徳島県", "香川県", "愛媛県", "高知県"],
  九州: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"],
  沖縄: ["沖縄県"],
};


function isYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function encodeForm(data: Record<string, any>) {
  const parts: string[] = [];
  Object.keys(data).forEach((k) => {
    const v = data[k];
    if (v === undefined || v === null) return;

    if (Array.isArray(v)) {
      v.forEach((item) => {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
      });
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  });
  return parts.join("&");
}

async function postForm(url: string, data: Record<string, any>) {
  const body = encodeForm(data);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body,
  });
  const text = await res.text();
  return { res, text };
}

function looksLikeSessionError(text: string) {
  return (
    text.includes("세션 오류") ||
    text.includes("セッション") ||
    text.includes("user_idがありません") ||
    text.includes("user_id 없음")
  );
}

function looksLikeServerError(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("error") ||
    t.includes("エラー") ||
    t.includes("失敗") ||
    t.includes("exception") ||
    t.includes("duplicate") ||
    t.includes("sql") ||
    text.includes("비밀번호") ||
    text.includes("지역/도도부현")
  );
}

//  생년월일 Picker 옵션
const NOW_Y = new Date().getFullYear();
const YEARS = Array.from({ length: NOW_Y - 1950 + 1 }, (_, i) => String(NOW_Y - i)); // 1950~현재
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

export default function Register() {
  const { ui } = useRunFitTheme();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // ===== Step1
  const [username, setUsername] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [region, setRegion] = useState("");
  const [prefecture, setPrefecture] = useState("");

  // ===== Step2
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"" | "M" | "F">("");

  //  생년월일: 화면은 셀렉트박스(숫자 크게), 선택은 모달 Picker
  const [birthY, setBirthY] = useState("1999");
  const [birthM, setBirthM] = useState("8");
  const [birthD, setBirthD] = useState("21");

  type BirthFocus = "Y" | "M" | "D";
  const [birthModalOpen, setBirthModalOpen] = useState(false);
  const [birthFocus, setBirthFocus] = useState<BirthFocus>("Y"); // (확장용)

  const [tmpBirthY, setTmpBirthY] = useState(birthY);
  const [tmpBirthM, setTmpBirthM] = useState(birthM);
  const [tmpBirthD, setTmpBirthD] = useState(birthD);

  const openBirthModal = (focus: BirthFocus) => {
    setBirthFocus(focus);
    setTmpBirthY(birthY);
    setTmpBirthM(birthM);
    setTmpBirthD(birthD);
    setBirthModalOpen(true);
  };

  const closeBirthModal = () => setBirthModalOpen(false);

  const applyBirthModal = () => {
    const y = Number(tmpBirthY || 2000);
    const m = Number(tmpBirthM || 1);
    const maxD = daysInMonth(y, m);
    const d = Math.min(Number(tmpBirthD || 1), maxD);

    setBirthY(String(tmpBirthY));
    setBirthM(String(tmpBirthM));
    setBirthD(String(d));
    setBirthModalOpen(false);
  };

  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [height, setHeight] = useState("");

  // ===== Step3
  const GOAL_OPTIONS = [
    { v: "健康管理", label: "健康管理" },
    { v: "ダイエット", label: "ダイエット" },
    { v: "筋力アップ", label: "筋力アップ" },
    { v: "ランニング記録向上", label: "ランニング記録向上" },
    { v: "体力向上", label: "体力向上" },
  ];
  const [goals, setGoals] = useState<string[]>([]);
  const [dailyWalkMin, setDailyWalkMin] = useState("60");
  const ACT_LEVELS = [
    "運動なし",
    "軽い運動（30分程度）",
    "普通の運動（1時間程度）",
    "激しい運動（1時間以上）",
    "高強度運動（2時間以上）",
  ];
  const [activityLevel, setActivityLevel] = useState(ACT_LEVELS[1]);

  const [submitting, setSubmitting] = useState(false);

  // ===== 
  const timerRef = useRef<any>(null);
  const lastCheckedRef = useRef<string>("");

  useEffect(() => {
    setPrefecture("");
  }, [region]);

  //  기본 birthY/M 바뀌면 day 자동 보정
  useEffect(() => {
    const y = Number(birthY || 2000);
    const m = Number(birthM || 1);
    const maxD = daysInMonth(y, m);
    if (Number(birthD) > maxD) setBirthD(String(maxD));
  }, [birthY, birthM]); // eslint-disable-line react-hooks/exhaustive-deps

  //  모달 열려있는 동안 tmp값도 day 자동 보정(선택값이 리스트에 없어서 비는 현상 방지)
  useEffect(() => {
    if (!birthModalOpen) return;
    const y = Number(tmpBirthY || 2000);
    const m = Number(tmpBirthM || 1);
    const maxD = daysInMonth(y, m);
    if (Number(tmpBirthD) > maxD) setTmpBirthD(String(maxD));
  }, [birthModalOpen, tmpBirthY, tmpBirthM]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = username.trim();
    setAvailable(null);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v) return;
    if (v.length < 3) return;

    timerRef.current = setTimeout(() => {
      checkUsername(v);
    }, 280);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [username]);

  const checkUsername = async (v: string) => {
    setChecking(true);
    try {
      const url = `${BASE_URL}/UsernameCheckServlet?username=${encodeURIComponent(v)}`;
      const res = await fetch(url);
      const text = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      const ok = !!data?.available;
      setAvailable(ok);
      lastCheckedRef.current = v;
    } catch {
      setAvailable(false);
      lastCheckedRef.current = v;
    } finally {
      setChecking(false);
    }
  };

  // ===== validators
  const pwOk = pw.length >= 4 && pw === pw2;
  const idOk =
    username.trim().length >= 3 &&
    available === true &&
    lastCheckedRef.current === username.trim();
  const addrOk = !!region && !!prefecture;

  const step1Ok = pwOk && idOk && addrOk;

  const birthDate = `${birthY.padStart(4, "0")}-${birthM.padStart(2, "0")}-${birthD.padStart(
    2,
    "0"
  )}`;

  const step2Ok =
    nickname.trim().length > 0 &&
    (gender === "M" || gender === "F") &&
    isYYYYMMDD(birthDate) &&
    !!currentWeight &&
    !!targetWeight &&
    !!height;

  const step3Ok = goals.length > 0 && !!dailyWalkMin && !!activityLevel;

  
  const submitStep1 = async () => {
    const u = username.trim();
    if (!u || u.length < 3) return notify("入力エラー", "ユーザーIDは3文字以上にして");
    if (!pwOk) return notify("入力エラー", "パスワードは4文字以上 + 確認一致");
    if (!addrOk) return notify("入力エラー", "住所（地方/都道府県）を選択して");
    if (!idOk) return notify("入力エラー", "ID重複チェックが必要");

    setSubmitting(true);
    try {
      const url = `${BASE_URL}/RegisterServlet`;
      const { text } = await postForm(url, {
        username: u,
        password: pw,
        password_confirm: pw2,
        email: email.trim(),
        phone: phone.trim(),
        region,
        prefecture,
      });

      if (looksLikeServerError(text) && !text.includes("register_step2")) {
        notify("登録失敗", text.slice(0, 180));
        return;
      }

      setStep(2);
    } catch (e: any) {
      notify("通信エラー", String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitStep2 = async () => {
    if (!step2Ok) {
      notify("入力エラー", "必須項目を全部入力して");
      return;
    }

    setSubmitting(true);
    try {
      const url = `${BASE_URL}/RegisterStep2Servlet`;
      const { text } = await postForm(url, {
        nickname: nickname.trim(),
        gender,
        birth_date: birthDate,
        current_weight: currentWeight.trim(),
        target_weight: targetWeight.trim(),
        height: height.trim(),
      });

      if (looksLikeSessionError(text)) {
        notify(
          "セッションエラー",
          "Step1で作ったセッション(user_id)がモバイルで保持されてない可能性。\n\n해결: 쿠키/세션 유지 설정 or 서버를 JSON API로 바꾸는게 안전함."
        );
        return;
      }

      if (looksLikeServerError(text) && !text.includes("goal.jsp")) {
        notify("登録失敗", text.slice(0, 180));
        return;
      }

      setStep(3);
    } catch (e: any) {
      notify("通信エラー", String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGoal = (v: string) => {
    setGoals((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const submitStep3 = async () => {
    if (!step3Ok) {
      notify("入力エラー", "目標を1つ以上選んで、歩行時間/活動レベルも選択して");
      return;
    }

    setSubmitting(true);
    try {
      const url = `${BASE_URL}/RegisterGoalServlet`;
      const { text } = await postForm(url, {
        goals,
        daily_walk_min: dailyWalkMin,
        daily_activity_level: activityLevel,
      });

      if (looksLikeSessionError(text)) {
        notify(
          "セッションエラー",
          "Step2と同じ。セッション(user_id)が保持されてない可能性。\n\n해결: 쿠키 유지 or 서버 수정(세션 대신 userId 전달/JSON API)."
        );
        return;
      }

      if (looksLikeServerError(text) && !text.includes("display_user_info")) {
        notify("保存失敗", text.slice(0, 180));
        return;
      }

      await autoLoginAfterRegister();
      setStep(4);
    } catch (e: any) {
      notify("通信エラー", String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const autoLoginAfterRegister = async () => {
    const u = username.trim();
    if (!u || !pw) return;

    const url = `${BASE_URL}/api/auth/login`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: pw }),
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!res.ok || !data?.ok) return;

      setAuthGlobal({ token: data.token, userId: data.userId, nickname: data.nickname || u });
    } catch {
      // ignore
    }
  };

  const prefList = region ? PREF_MAP[region] || [] : [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
      <View style={[styles.top, { borderBottomColor: ui.line }]}>
        <Text style={{ color: ui.text, fontWeight: "900", fontSize: 16 }}>会員登録</Text>
        <Text style={{ color: ui.muted, fontWeight: "900", fontSize: 12 }}>
          Step {step === 4 ? 3 : step} / 3
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>
            <Text style={[styles.h2, { color: ui.text }]}>ステップ1：基本情報</Text>
            <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "800", marginBottom: 12 }}>
              ID重複チェック + PW一致 + 住所選択がOKなら次へ
            </Text>

            <Label ui={ui} text="ユーザーID" />
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="例：runfit123"
              placeholderTextColor={ui.placeholder}
              style={[
                styles.input,
                { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
              ]}
            />

            <View style={{ height: 8 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {checking && <ActivityIndicator />}
              {username.trim().length >= 3 && available === true && (
                <Text style={{ color: ui.green, fontWeight: "900", fontSize: 12 }}>使用可能 👍</Text>
              )}
              {username.trim().length >= 3 && available === false && (
                <Text style={{ color: ui.danger, fontWeight: "900", fontSize: 12 }}>
                  すでに使用中 ❌
                </Text>
              )}
              {username.trim().length > 0 && username.trim().length < 3 && (
                <Text style={{ color: ui.danger, fontWeight: "900", fontSize: 12 }}>
                  3文字以上入力して
                </Text>
              )}
            </View>

            <View style={{ height: 14 }} />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Label ui={ui} text="パスワード" />
                <TextInput
                  value={pw}
                  onChangeText={setPw}
                  secureTextEntry
                  placeholder="4文字以上"
                  placeholderTextColor={ui.placeholder}
                  style={[
                    styles.input,
                    { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
                  ]}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Label ui={ui} text="パスワード（確認）" />
                <TextInput
                  value={pw2}
                  onChangeText={setPw2}
                  secureTextEntry
                  placeholder="もう一度"
                  placeholderTextColor={ui.placeholder}
                  style={[
                    styles.input,
                    { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
                  ]}
                />
              </View>
            </View>

            <View style={{ height: 8 }} />
            {pw.length > 0 && (
              <Text style={{ color: pwOk ? ui.green : ui.danger, fontWeight: "900", fontSize: 12 }}>
                {pwOk ? "OK" : "パスワードが短い/一致しない"}
              </Text>
            )}

            <View style={{ height: 14 }} />

            <Label ui={ui} text="メール（任意）" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              placeholder="example@mail.com"
              placeholderTextColor={ui.placeholder}
              style={[
                styles.input,
                { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
              ]}
            />

            <View style={{ height: 10 }} />

            <Label ui={ui} text="電話（任意）" />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="任意"
              placeholderTextColor={ui.placeholder}
              style={[
                styles.input,
                { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
              ]}
            />

            <View style={{ height: 14 }} />

            <Label ui={ui} text="住所（地方）" />
            <Chips
              ui={ui}
              value={region}
              options={Object.keys(PREF_MAP)}
              onPick={(v) => setRegion(v)}
            />
            <View style={{ height: 10 }} />

            <Label ui={ui} text="都道府県" />
            {region ? (
              <Chips
                ui={ui}
                value={prefecture}
                options={prefList}
                onPick={(v) => setPrefecture(v)}
              />
            ) : (
              <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12 }}>
                まず地方を選択してください
              </Text>
            )}

            <View style={{ height: 18 }} />

            <Row>
              <GhostBtn ui={ui} label="戻る" onPress={() => router.back()} />
              <PrimaryBtn
                ui={ui}
                label={submitting ? "送信中…" : "次へ"}
                disabled={!step1Ok || submitting}
                onPress={submitStep1}
              />
            </Row>

            <View style={{ height: 8 }} />
            <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "800", lineHeight: 16 }}>
              ※ Step2で「セッションエラー」が出たら、モバイルでクッキーが保持されてない可能性が高い。
            </Text>
          </View>
        )}

        {step === 2 && (
          <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>
            <Text style={[styles.h2, { color: ui.text }]}>ステップ2：追加情報</Text>
            <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "800", marginBottom: 12 }}>
              生年月日はセレクトで選択
            </Text>

            <Label ui={ui} text="ニックネーム" />
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="例：ジュン"
              placeholderTextColor={ui.placeholder}
              style={[
                styles.input,
                { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
              ]}
            />

            <View style={{ height: 12 }} />

            <Label ui={ui} text="性別" />
            <Chips
              ui={ui}
              value={gender}
              options={[
                { key: "M", label: "男性 (M)" },
                { key: "F", label: "女性 (F)" },
              ]}
              onPick={(v) => setGender(v as any)}
            />

            <View style={{ height: 12 }} />

            {/*  생년월일 작은 셀렉트박스(숫자 크게) */}
            <Label ui={ui} text="生年月日" />
            <View style={{ flexDirection: "row", gap: 10 }}>
  <SelectBox ui={ui} label="年" value={birthY} flex={1.1} onPress={() => openBirthModal("Y")} />
  <SelectBox ui={ui} label="月" value={birthM.padStart(2, "0")} flex={1} onPress={() => openBirthModal("M")} />
  <SelectBox ui={ui} label="日" value={birthD.padStart(2, "0")} flex={1} onPress={() => openBirthModal("D")} />
</View>

            <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
              選択結果：{birthDate}
            </Text>

            {/* 모달 Picker */}
            <Modal
              visible={birthModalOpen}
              transparent
              animationType="fade"
              onRequestClose={closeBirthModal}
            >
              <Pressable style={styles.modalBackdrop} onPress={closeBirthModal} />
              <View style={[styles.modalCard, { backgroundColor: ui.bg, borderColor: ui.line }]}>
                <Text style={{ color: ui.text, fontWeight: "900", fontSize: 14, marginBottom: 10 }}>
                  生年月日を選択
                </Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: ui.muted, fontSize: 11, fontWeight: "900", marginBottom: 6 }}
                    >
                      年
                    </Text>
                    <View
                      style={[styles.pickerBox, { borderColor: ui.line, backgroundColor: ui.inputBg }]}
                    >
                      <Picker
                        selectedValue={tmpBirthY}
                        onValueChange={(v) => setTmpBirthY(String(v))}
                        dropdownIconColor={ui.text}
                        style={{ color: ui.text }}
                        itemStyle={{ color: ui.text, fontSize: 14 }}
                      >
                        {YEARS.map((y) => (
                          <Picker.Item key={y} label={y} value={y} />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: ui.muted, fontSize: 11, fontWeight: "900", marginBottom: 6 }}
                    >
                      月
                    </Text>
                    <View
                      style={[styles.pickerBox, { borderColor: ui.line, backgroundColor: ui.inputBg }]}
                    >
                      <Picker
                        selectedValue={tmpBirthM}
                        onValueChange={(v) => setTmpBirthM(String(v))}
                        dropdownIconColor={ui.text}
                        style={{ color: ui.text }}
                        itemStyle={{ color: ui.text }}
                      >
                        {MONTHS.map((m) => (
                          <Picker.Item key={m} label={String(m).padStart(2, "0")} value={m} />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: ui.muted, fontSize: 11, fontWeight: "900", marginBottom: 6 }}
                    >
                      日
                    </Text>
                    <View
                      style={[styles.pickerBox, { borderColor: ui.line, backgroundColor: ui.inputBg }]}
                    >
                      <Picker
                        selectedValue={tmpBirthD}
                        onValueChange={(v) => setTmpBirthD(String(v))}
                        dropdownIconColor={ui.text}
                        style={{ color: ui.text }}
                        itemStyle={{ color: ui.text }}
                      >
                        {Array.from(
                          { length: daysInMonth(Number(tmpBirthY || 2000), Number(tmpBirthM || 1)) },
                          (_, i) => String(i + 1)
                        ).map((d) => (
                          <Picker.Item key={d} label={String(d).padStart(2, "0")} value={d} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </View>

                <View style={{ height: 14 }} />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <GhostBtn ui={ui} label="キャンセル" onPress={closeBirthModal} />
                  <PrimaryBtn ui={ui} label="決定" onPress={applyBirthModal} />
                </View>

                {/* (확장용) */}
                {birthFocus ? <View /> : null}
              </View>
            </Modal>

            <View style={{ height: 12 }} />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Label ui={ui} text="現在体重 (kg)" />
                <TextInput
                  value={currentWeight}
                  onChangeText={setCurrentWeight}
                  keyboardType="numeric"
                  placeholder="例：68.5"
                  placeholderTextColor={ui.placeholder}
                  style={[
                    styles.input,
                    { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Label ui={ui} text="目標体重 (kg)" />
                <TextInput
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  keyboardType="numeric"
                  placeholder="例：62.0"
                  placeholderTextColor={ui.placeholder}
                  style={[
                    styles.input,
                    { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
                  ]}
                />
              </View>
            </View>

            <View style={{ height: 12 }} />

            <Label ui={ui} text="身長 (cm)" />
            <TextInput
              value={height}
              onChangeText={setHeight}
              keyboardType="numeric"
              placeholder="例：175"
              placeholderTextColor={ui.placeholder}
              style={[
                styles.input,
                { borderColor: ui.line, color: ui.text, backgroundColor: ui.inputBg },
              ]}
            />

            <View style={{ height: 18 }} />

            <Row>
              <GhostBtn ui={ui} label="戻る" onPress={() => setStep(1)} />
              <PrimaryBtn
                ui={ui}
                label={submitting ? "送信中…" : "次へ"}
                disabled={!step2Ok || submitting}
                onPress={submitStep2}
              />
            </Row>
          </View>
        )}

        {step === 3 && (
          <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>
            <Text style={[styles.h2, { color: ui.text }]}>ステップ3：目標設定</Text>

            <Label ui={ui} text="目標（複数OK）" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {GOAL_OPTIONS.map((g) => {
                const on = goals.includes(g.v);
                const pill = on
                  ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
                  : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };

                return (
                  <Pressable
                    key={g.v}
                    onPress={() => toggleGoal(g.v)}
                    style={({ pressed }) => [styles.pill, pill, { opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={{ color: on ? ui.green : ui.text, fontWeight: "900", fontSize: 12 }}>
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 14 }} />

            <Label ui={ui} text="1日の歩行時間（分）" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["0", "30", "60", "90", "120", "180", "240", "300"].map((m) => {
                const on = dailyWalkMin === m;
                const pill = on
                  ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
                  : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };
                return (
                  <Pressable
                    key={m}
                    onPress={() => setDailyWalkMin(m)}
                    style={({ pressed }) => [styles.pill, pill, { opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={{ color: on ? ui.green : ui.text, fontWeight: "900", fontSize: 12 }}>
                      {m}分
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 14 }} />

            <Label ui={ui} text="1日の運動量（活動レベル）" />
            <View style={{ gap: 8 }}>
              {ACT_LEVELS.map((lv) => {
                const on = activityLevel === lv;
                const pill = on
                  ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
                  : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };

                return (
                  <Pressable
                    key={lv}
                    onPress={() => setActivityLevel(lv)}
                    style={({ pressed }) => [styles.rowPill, pill, { opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={{ color: on ? ui.green : ui.text, fontWeight: "900", fontSize: 12 }}>
                      {lv}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 18 }} />

            <Row>
              <GhostBtn ui={ui} label="戻る" onPress={() => setStep(2)} />
              <PrimaryBtn
                ui={ui}
                label={submitting ? "保存中…" : "登録完了"}
                disabled={!step3Ok || submitting}
                onPress={submitStep3}
              />
            </Row>

            <View style={{ height: 8 }} />
            <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "800", lineHeight: 16 }}>
              ※ 完了後は自動ログインを試みます。
            </Text>
          </View>
        )}

        {step === 4 && (
          <View style={[styles.card, { borderColor: ui.line, backgroundColor: ui.card }]}>
            <Text style={[styles.h2, { color: ui.text }]}>🎉 登録完了</Text>
            <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "800", marginBottom: 14 }}>
              自動ログインが成功していれば、そのまま使えます。
            </Text>

            <PrimaryBtn
              ui={ui}
              label="ホームへ"
              onPress={() => {
                router.replace("/");
              }}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ===== UI components
function Label({ ui, text }: { ui: Ui; text: string }) {
  return (
    <Text style={{ color: ui.muted, fontSize: 12, fontWeight: "900", marginBottom: 6 }}>
      {text}
    </Text>
  );
}

function Row({ children }: any) {
  return <View style={{ flexDirection: "row", gap: 10 }}>{children}</View>;
}

function PrimaryBtn({
  ui,
  label,
  onPress,
  disabled,
}: {
  ui: Ui;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: ui.green,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: "#08110b", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function GhostBtn({ ui, label, onPress }: { ui: Ui; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          borderWidth: 1,
          borderColor: ui.line,
          backgroundColor: ui.pillIdleBg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: ui.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function SelectBox({
  ui,
  label,
  value,
  onPress,
  flex = 1,
}: {
  ui: Ui;
  label: string;
  value: string;
  onPress: () => void;
  flex?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectBox,
        { flex, borderColor: ui.line, backgroundColor: ui.inputBg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "900" }}>{label}</Text>

      <Text
  numberOfLines={1}
  ellipsizeMode="clip"
  adjustsFontSizeToFit
  minimumFontScale={0.3}          //  0.7 -> 0.6 정도로 더 여유
  allowFontScaling={false}         //  추가
  maxFontSizeMultiplier={1}        //  추가
  style={{
    color: ui.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
    includeFontPadding: false,
  }}
>
  {value}
</Text>
    </Pressable>
  );
}

function Chips({
  ui,
  value,
  options,
  onPick,
}: {
  ui: Ui;
  value: string;
  options: any[];
  onPick: (v: string) => void;
}) {
  const list = options.map((o) => (typeof o === "string" ? { key: o, label: o } : o));

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {list.map((o: any) => {
        const on = value === o.key;
        const pill = on
          ? { backgroundColor: ui.pillActiveBg, borderColor: ui.pillActiveBorder }
          : { backgroundColor: ui.pillIdleBg, borderColor: "transparent" };

        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            style={({ pressed }) => [styles.pill, pill, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={{ color: on ? ui.green : ui.text, fontWeight: "900", fontSize: 12 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === "android" ? 6 : 0 },
  top: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  h2: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "800",
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  rowPill: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },

  //  생년월일 셀렉트박스 스타일 (숫자 크게 보이게)
  selectBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // 모달
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },

  //  Picker를 박스 느낌으로 높이 고정
  pickerBox: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    height: 48,
    justifyContent: "center",
  },
});