import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

const BASE_URL = "http://172.20.10.4:8080/RunFIT_";
const TOKEN_KEY = "runfit_token";

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
  bg: "#0b1020",
  card: "rgba(255,255,255,0.06)",
  cardSolid: "#0f1620",
  line: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.70)",
  green: "#6dff8b",
  green2: "#3be271",
  danger: "#ff5a5f",
  shadow: "rgba(0,0,0,0.55)",

  topBtnBg: "rgba(255,255,255,0.06)",
  itemBg: "rgba(0,0,0,0.18)",
  chipBorder: "rgba(255,255,255,0.14)",
  chipActiveBorder: "rgba(109,255,139,0.40)",
  chipActiveBg: "rgba(109,255,139,0.10)",
};

const LIGHT_UI = {
  mode: "light" as const,
  bg: "#f6f8fb",
  card: "rgba(255,255,255,0.92)",
  cardSolid: "#ffffff",
  line: "rgba(15,23,42,0.14)",
  text: "rgba(11,15,20,0.92)",
  muted: "rgba(11,15,20,0.60)",
  green: "#18a957",
  green2: "#0f8f4a",
  danger: "#ff5a5f",
  shadow: "rgba(0,0,0,0.12)",

  topBtnBg: "rgba(15,23,42,0.04)",
  itemBg: "rgba(15,23,42,0.04)",
  chipBorder: "rgba(15,23,42,0.12)",
  chipActiveBorder: "rgba(24,169,87,0.35)",
  chipActiveBg: "rgba(24,169,87,0.10)",
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



type Category = { id: number; name: string };

type Food = {
  id: number;
  name: string;
  brand?: string | null;
  price: number;
  servingGram: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unit?: "g" | "個";
};

type CategoriesResponse = { categories: Category[] };
type FoodsResponse = { total: number; foods: any[] };


function inferUnit(f: Food): "g" | "個" {
  if (f.unit === "g" || f.unit === "個") return f.unit;
  return f.servingGram === 100 ? "g" : "個";
}

function normalizeFood(x: any): Food {
  const id = Number(x?.id ?? x?.food_id ?? 0);
  return {
    ...x,
    id,
    name: String(x?.name ?? ""),
    brand: x?.brand ?? null,
    price: Number(x?.price ?? 0),
    servingGram: Number(x?.servingGram ?? x?.serving_gram ?? 100),
    calories: Number(x?.calories ?? 0),
    protein: Number(x?.protein ?? 0),
    carbs: Number(x?.carbs ?? 0),
    fat: Number(x?.fat ?? 0),
    unit: x?.unit,
  };
}


export default function FoodRecord() {

  const { mode, ui } = useRunFitTheme();

  const params = useLocalSearchParams<{ date?: string; ym?: string }>();
  const date = String(params?.date || "");
  const ym = String(params?.ym || "");

  const { width } = useWindowDimensions();
  const numCols = width >= 900 ? 3 : 2;

  const [cats, setCats] = useState<Category[]>([]);
  const [catId, setCatId] = useState<number>(0);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [foods, setFoods] = useState<Food[]>([]);
  const [total, setTotal] = useState(0);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);

  const [grams, setGrams] = useState<string>("100");
  const [count, setCount] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [mealType, setMealType] = useState<"朝" | "昼" | "夜" | "間食">("朝");
  const [adding, setAdding] = useState(false);

  const fallbackImg = `${BASE_URL}/images/no-image.png`;

  const placeholderColor = ui.mode === "dark" ? "rgba(255,255,255,0.45)" : "rgba(11,15,20,0.45)";

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const res = await apiGet<CategoriesResponse>("/api/food/categories");
        const list = res.categories || [];
        setCats(list);
        if (!catId && list.length) setCatId(list[0].id);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!catId) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<FoodsResponse>(`/api/food/foods?cat=${encodeURIComponent(String(catId))}&q=${encodeURIComponent(q)}`);
        const normalized = (res.foods || []).map(normalizeFood);
        setFoods(normalized);
        setTotal(Number(res.total || 0));
      } catch (e: any) {
        setErr(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [catId, q]);

  const openFood = (f: Food) => {
    const nf = normalizeFood(f);
    setSelected(nf);
    setMealType("朝");

    const unit = inferUnit(nf);
    const base = nf.servingGram > 0 ? nf.servingGram : 100;

    if (unit === "個") {
      setCount(1);
      setGrams(String(Math.max(1, Math.round(base * 1))));
    } else {
      setCount(1);
      setGrams(String(base));
    }

    setOpen(true);
  };

  const close = () => setOpen(false);

  const calc = () => {
    if (!selected) return { cal: 0, p: 0, c: 0, f: 0, base: 100, g: 100 };
    const base = selected.servingGram > 0 ? selected.servingGram : 100;
    const g = Math.max(1, Math.floor(Number(grams || 0) || 0));
    const ratio = g / base;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    return {
      base,
      g,
      cal: r1(selected.calories * ratio),
      p: r1(selected.protein * ratio),
      c: r1(selected.carbs * ratio),
      f: r1(selected.fat * ratio),
    };
  };

  const onAdd = async () => {
    if (!selected) return;

    const foodId = Number((selected as any).id ?? (selected as any).food_id ?? 0);
    if (!Number.isFinite(foodId) || foodId <= 0) {
      console.log("INVALID FOOD OBJECT:", selected);
      Alert.alert("エラー", `food_idが不正です: ${String(foodId)}`);
      return;
    }
    console.log("[ADD_DEBUG] foodId=", foodId, "selected=", selected);

    const g = Math.max(1, Math.floor(Number(grams || 0) || 0));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("日付エラー", "日付パラメータ(date)が不正です");
      return;
    }

    setAdding(true);
    try {
      await apiPostForm("/api/food/meal/add", {
        food_id: foodId,
        foodId: foodId,

        meal_date: date,
        mealDate: date,

        meal_type: mealType,
        mealType: mealType,

        serving_gram: g,
        servingGram: g,
      });

      router.replace({
        pathname: "/FoodDate",
        params: { ym, refresh: String(Date.now()), open: date },
      } as any);
    } catch (e: any) {
      Alert.alert("追加失敗", String(e?.message || e));
    } finally {
      setAdding(false);
    }
  };

  const imgUrlPng = (id: number) => `${BASE_URL}/images/foods/${id}.PNG`;
  const imgUrlJpg = (id: number) => `${BASE_URL}/images/foods/${id}.jpg`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg, paddingTop: Platform.OS === "android" ? 6 : 0 }}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <BgDecor mode={mode} ui={ui} />

      <TopBar ui={ui} title="栄養（食事追加）" subtitle={date || "YYYY-MM-DD"} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {/* 카테고리 */}
        <View style={[styles.panel, { borderColor: ui.line, backgroundColor: ui.card }]}>
          <Text style={{ color: ui.text, fontWeight: "900", marginBottom: 10 }}>カテゴリ</Text>

          <FlatList
            data={cats}
            keyExtractor={(x) => String(x.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const active = item.id === catId;
              return (
                <Pressable
                  onPress={() => setCatId(item.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: active ? ui.chipActiveBorder : ui.chipBorder,
                      backgroundColor: active ? ui.chipActiveBg : ui.itemBg,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: ui.text, fontWeight: "900" }}>{item.name}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        {/* 검색 */}
        <View style={[styles.panel, { borderColor: ui.line, backgroundColor: ui.card }]}>
          <Text style={{ color: ui.text, fontWeight: "900", marginBottom: 10 }}>検索</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={qInput}
              onChangeText={setQInput}
              placeholder="食品名 / ブランド"
              placeholderTextColor={placeholderColor}
              style={[
                styles.input,
                {
                  borderColor: ui.line,
                  backgroundColor: ui.topBtnBg,
                  color: ui.text,
                },
              ]}
            />
            <Pressable onPress={() => setQ(qInput.trim())} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }, styles.btnWrap]}>
              <LinearGradient colors={[ui.green, ui.green2]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.btn}>
                <Text style={{ color: "#05210f", fontWeight: "900" }}>検索</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 10, fontSize: 12 }}>
            結果: {total} 件（最大200）
          </Text>

          {err ? (
            <View style={[styles.err, { borderColor: "rgba(255,90,95,0.55)", backgroundColor: "rgba(255,90,95,0.10)" }]}>
              <Text style={{ color: ui.mode === "dark" ? "#ffd9da" : "rgba(255,90,95,0.95)", fontWeight: "900" }}>読み込み失敗</Text>

              <TextInput
                value={err}
                editable={false}
                multiline
                style={{
                  marginTop: 8,
                  color: ui.text,
                  fontWeight: "700",
                  fontSize: 12,
                  padding: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.line,
                  backgroundColor: ui.mode === "dark" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.75)",
                }}
              />

              <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11, marginTop: 8 }}>BASE_URL: {BASE_URL}</Text>
            </View>
          ) : null}
        </View>

        {/* 음식 그리드 */}
        <View style={[styles.panel, { borderColor: ui.line, backgroundColor: ui.card }]}>
          <Text style={{ color: ui.text, fontWeight: "900", marginBottom: 10 }}>食品一覧</Text>

          {loading ? (
            <View style={{ paddingVertical: 18 }}>
              <ActivityIndicator />
              <Text style={{ color: ui.muted, fontWeight: "800", textAlign: "center", marginTop: 10 }}>読み込み中...</Text>
            </View>
          ) : foods.length === 0 ? (
            <Text style={{ color: ui.muted, fontWeight: "800" }}>検索結果がありません</Text>
          ) : (
            <FlatList
              data={foods}
              key={String(numCols)}
              keyExtractor={(x) => String(x.id)}
              numColumns={numCols}
              scrollEnabled={false}
              columnWrapperStyle={{ gap: 10 }}
              contentContainerStyle={{ gap: 10 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openFood(item)}
                  style={({ pressed }) => [
                    styles.foodCard,
                    {
                      borderColor: ui.line,
                      backgroundColor: ui.itemBg,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <FoodThumb png={imgUrlPng(item.id)} jpg={imgUrlJpg(item.id)} fallback={fallbackImg} />
                  <View style={{ padding: 10, gap: 4 }}>
                    <Text style={{ color: ui.text, fontWeight: "900" }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                      {item.brand || "-"}
                    </Text>
                    <Text style={{ color: ui.text, fontWeight: "900", marginTop: 2 }}>¥ {item.price}</Text>
                    <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11 }}>タップで詳細</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Food Detail Modal */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable onPress={close} style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
          <Pressable onPress={() => {}} style={[styles.modal, { borderColor: ui.line, backgroundColor: ui.cardSolid }]}>
            <View style={{ padding: 16 }}>
              {!selected ? null : (
                <>
                  {(() => {
                    const unit = inferUnit(selected);
                    const base = selected.servingGram > 0 ? selected.servingGram : 100;
                    const computedG = Math.max(1, Math.round(base * count));

                    return (
                      <>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: ui.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
                              {selected.name}
                            </Text>
                            <Text style={{ color: ui.muted, fontWeight: "800", marginTop: 4 }} numberOfLines={1}>
                              ブランド: {selected.brand || "-"}
                            </Text>
                          </View>
                          <Pressable
                            onPress={close}
                            style={({ pressed }) => [
                              styles.closeBtn,
                              {
                                borderColor: ui.line,
                                backgroundColor: ui.topBtnBg,
                                opacity: pressed ? 0.8 : 1,
                              },
                            ]}
                          >
                            <Text style={{ color: ui.text, fontWeight: "900" }}>閉じる</Text>
                          </Pressable>
                        </View>

                        <View style={{ height: 12 }} />

                        <FoodBig
                          png={`${BASE_URL}/images/foods/${selected.id}.PNG`}
                          jpg={`${BASE_URL}/images/foods/${selected.id}.jpg`}
                          fallback={fallbackImg}
                        />

                        <View style={{ height: 12 }} />

                        <View style={[styles.box, { borderColor: ui.line, backgroundColor: ui.topBtnBg }]}>
                          <Text style={{ color: ui.text, fontWeight: "900" }}>価格: ¥ {selected.price}</Text>

                          <View style={{ height: 12 }} />

                          {unit === "個" ? (
                            <>
                              <Text style={{ color: ui.muted, fontWeight: "900" }}>個数（最大5）</Text>

                              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                                {([1, 2, 3, 4, 5] as const).map((n) => {
                                  const active = n === count;
                                  return (
                                    <Pressable
                                      key={n}
                                      onPress={() => {
                                        setCount(n);
                                        setGrams(String(Math.max(1, Math.round(base * n))));
                                      }}
                                      style={({ pressed }) => [
                                        styles.chip,
                                        {
                                          borderColor: active ? ui.chipActiveBorder : ui.chipBorder,
                                          backgroundColor: active ? ui.chipActiveBg : ui.itemBg,
                                          opacity: pressed ? 0.85 : 1,
                                        },
                                      ]}
                                    >
                                      <Text style={{ color: ui.text, fontWeight: "900" }}>{n}個</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11, marginTop: 8 }}>
                                {/* 1個 = {base}g（DB基準） → {count}個 = {computedG}g */}
                              </Text>

                              <View style={{ height: 10 }} />
                            </>
                          ) : null}

                          {(() => {
                            const r = calc();
                            return (
                              <>
                                <Text style={{ color: ui.muted, fontWeight: "900" }}>
                                  {/* 栄養（基準 {r.base}g） → 摂取量 {r.g}g に自動換算 */}
                                </Text>

                                <View style={{ height: 10 }} />
                                <Text style={{ color: ui.text, fontWeight: "900" }}>カロリー: {r.cal} kcal</Text>
                                <Text style={{ color: ui.text, fontWeight: "900" }}>炭水化物: {r.c} g</Text>
                                <Text style={{ color: ui.text, fontWeight: "900" }}>たんぱく質: {r.p} g</Text>
                                <Text style={{ color: ui.text, fontWeight: "900" }}>脂質: {r.f} g</Text>
                              </>
                            );
                          })()}

                          <View style={{ height: 14 }} />

                          {unit === "g" ? (
                            <>
                              <Text style={{ color: ui.muted, fontWeight: "900" }}>摂取量(g)</Text>
                              <TextInput
                                value={grams}
                                onChangeText={(t) => setGrams(t.replace(/[^\d]/g, ""))}
                                keyboardType="number-pad"
                                placeholderTextColor={placeholderColor}
                                style={[
                                  styles.input,
                                  {
                                    marginTop: 8,
                                    borderColor: ui.line,
                                    backgroundColor: ui.topBtnBg,
                                    color: ui.text,
                                  },
                                ]}
                              />
                              <View style={{ height: 12 }} />
                            </>
                          ) : null}

                          <Text style={{ color: ui.muted, fontWeight: "900" }}>区分</Text>
                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            {(["朝", "昼", "夜", "間食"] as const).map((t) => {
                              const active = mealType === t;
                              return (
                                <Pressable
                                  key={t}
                                  onPress={() => setMealType(t)}
                                  style={({ pressed }) => [
                                    styles.chip,
                                    {
                                      borderColor: active ? ui.chipActiveBorder : ui.chipBorder,
                                      backgroundColor: active ? ui.chipActiveBg : ui.itemBg,
                                      opacity: pressed ? 0.85 : 1,
                                    },
                                  ]}
                                >
                                  <Text style={{ color: ui.text, fontWeight: "900" }}>{t}</Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <View style={{ height: 14 }} />

                          <Pressable
                            onPress={onAdd}
                            disabled={adding}
                            style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }, { borderRadius: 12, overflow: "hidden" }]}
                          >
                            <LinearGradient colors={[ui.green, ui.green2]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.addBtn}>
                              {adding ? <ActivityIndicator /> : <Text style={{ color: "#05210f", fontWeight: "900" }}>追加（記録）</Text>}
                            </LinearGradient>
                          </Pressable>
                        </View>
                      </>
                    );
                  })()}
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
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
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["rgba(109,255,139,0.12)", "rgba(90,140,255,0.14)", "rgba(11,16,32,1)"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function TopBar({ ui, title, subtitle }: { ui: any; title: string; subtitle: string }) {
  return (
    <View style={[styles.topbar, { borderBottomColor: ui.line, backgroundColor: ui.topBtnBg }]}>
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.backBtn,
          { borderColor: ui.line, opacity: pressed ? 0.7 : 1, backgroundColor: ui.topBtnBg },
        ]}
      >
        <Text style={{ color: ui.text, fontWeight: "900" }}>‹</Text>
      </Pressable>

      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={{ color: ui.text, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: ui.muted, fontWeight: "800", fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
      </View>

      <View style={{ width: 36 }} />
    </View>
  );
}

function FoodThumb({ png, jpg, fallback }: { png: string; jpg: string; fallback: string }) {
  const [src, setSrc] = useState(png);
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    setSrc(png);
    setStage(0);
  }, [png]);

  return (
    <Image
      source={{ uri: src }}
      style={styles.thumb}
      onError={() => {
        if (stage === 0) {
          setStage(1);
          setSrc(jpg);
        } else if (stage === 1) {
          setStage(2);
          setSrc(fallback);
        } else {
          setSrc(fallback);
        }
      }}
    />
  );
}

function FoodBig({ png, jpg, fallback }: { png: string; jpg: string; fallback: string }) {
  const [src, setSrc] = useState(png);
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    setSrc(png);
    setStage(0);
  }, [png]);

  return (
    <Image
      source={{ uri: src }}
      style={styles.bigImg}
      onError={() => {
        if (stage === 0) {
          setStage(1);
          setSrc(jpg);
        } else if (stage === 1) {
          setStage(2);
          setSrc(fallback);
        } else {
          setSrc(fallback);
        }
      }}
    />
  );
}

async function apiGet<T>(path: string): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const txt = await safeText(res);
    console.log("API ERROR(GET)", res.status, url, txt);
    throw new Error(`HTTP ${res.status}\n${url}`);
  }

  return (await res.json()) as T;
}

async function apiPostForm(path: string, data: Record<string, any>): Promise<any> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const url = `${BASE_URL}${path}`;

  const form = Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  console.log("[POST_FORM]", url, form);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });

  if (!res.ok) {
    const txt = await safeText(res);
    console.log("API ERROR(POST FORM)", res.status, url, txt);
    throw new Error(`HTTP ${res.status}\n${url}\n${txt}`);
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

const styles = StyleSheet.create({
  topbar: {
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

  panel: { borderRadius: 16, borderWidth: 1, padding: 14, overflow: "hidden" },

  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999 },

  input: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },

  btnWrap: { borderRadius: 12, overflow: "hidden" },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  foodCard: { flex: 1, borderWidth: 1, borderRadius: 16, overflow: "hidden" },

  thumb: { width: "100%", height: 120, backgroundColor: "rgba(255,255,255,0.06)" },
  bigImg: { width: "100%", height: 240, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },

  backdrop: { flex: 1, padding: 18, alignItems: "center", justifyContent: "center" },
  modal: { width: "100%", maxWidth: 860, maxHeight: "92%", borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  closeBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },

  box: { borderWidth: 1, borderRadius: 14, padding: 12 },

  addBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  err: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
});
