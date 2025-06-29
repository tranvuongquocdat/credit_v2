import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json()          // { password? }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    params.id,
    body
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ ok: true })
}
