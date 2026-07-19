import { NextResponse } from "next/server";
import { syncMyBrain, type SyncTasteInput } from "@/lib/myBrainWrite";

// 設定画面(気になっていること・お気に入りの情報源)やウィッシュ追加など、
// ユーザーがtasteを能動的に編集した直後に呼ばれる。アプリ(Supabase)が
// 唯一の編集場所であることは変わらず、この呼び出しはmy-brainをその内容の
// 鏡として更新するだけ。my-brain未設定/書き込み権限なしでも失敗を無視して
// 良い(アプリ自体の保存はSupabase側で完結しているため)。

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  let body: SyncTasteInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  // 失敗(未設定・権限不足・ネットワーク等)もアプリ本体の保存とは無関係の
  // 補助同期なので、常に200で理由だけ返す(呼び出し側はベストエフォート扱い)。
  const result = await syncMyBrain(body);
  return NextResponse.json(result);
}
