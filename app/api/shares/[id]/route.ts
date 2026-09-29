import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
    const { data: deleted, error: deleteError } = await supabase
      .from("saju_shared_readings")
      .delete()
      .eq("id", id)
      .eq("user_id", data.user.id)
      .select("id")
      .maybeSingle();
    if (deleteError) return NextResponse.json({ error: "링크를 삭제하지 못했습니다." }, { status: 503 });
    if (!deleted) return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "링크를 삭제하지 못했습니다." }, { status: 503 });
  }
}
