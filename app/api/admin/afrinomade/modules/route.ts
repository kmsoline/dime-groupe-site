import { NextRequest, NextResponse } from 'next/server';
import { checkAdminRole } from '@/lib/api-auth';
import { getContentSetting, setContentSetting } from '@/lib/db';

export interface AfriModules {
  residences: boolean;
  excursions: boolean;
  transport: boolean;
  bons_plans: boolean;
}

const DEFAULT: AfriModules = {
  residences: true,
  excursions: true,
  transport: true,
  bons_plans: true,
};

export async function GET() {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const data = await getContentSetting<AfriModules>('afrinomade_modules');
  return NextResponse.json(data ?? DEFAULT);
}

export async function PUT(req: NextRequest) {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const body = await req.json() as Partial<AfriModules>;
  const current = (await getContentSetting<AfriModules>('afrinomade_modules')) ?? DEFAULT;
  const updated: AfriModules = { ...current, ...body };
  await setContentSetting('afrinomade_modules', updated);
  return NextResponse.json(updated);
}
